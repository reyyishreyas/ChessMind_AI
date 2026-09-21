import { generateJSON, getProvider, resolveModel } from "@/lib/llm"
import type { ProviderName } from "@/lib/llm/types"
import { buildDeterministicVerdict } from "@/lib/coach-verdict"
import { buildCoachPrompt, buildCoachSentencePrompt, sanFor, type CoachPromptInput } from "@/lib/coach-prompt"
import { type GameState, gameStateToFEN } from "@/lib/chess-engine"
import { detectMotifDetails, detectMotifs, type MotifDetail, type MotifId } from "@/lib/tactics"
import type { MoveEvaluation } from "@/lib/adaptive-ai"
import {
  buildPatternProfile,
  describeCrossGameFacts,
  describePattern,
  profilesFromSavedGames,
  summarizePatterns,
  type PatternMoveEvent,
} from "@/lib/pattern-profile"
import { getPlayerMoveHistory } from "@/lib/db/db"
import { getWriter } from "@/lib/llm/logger"

export const maxDuration = 60

type CoachVerdict = {
  analysis?: string
  move_quality?: string
  accuracy_score?: number
  blunder_risk?: string
  flag3?: number
}

export async function POST(req: Request) {
  const {
    gameState,
    evaluation,
    moveHistory,
    playerStats,
    stateBefore,
    botMove,
    patternMoves,
  }: {
    gameState: GameState
    evaluation: MoveEvaluation
    moveHistory: string[]
    playerStats: { skillRating: number; averageAccuracy: number } | null
    stateBefore?: GameState
    botMove?: { from: string; to: string }
    patternMoves?: PatternMoveEvent[]
  } = await req.json()

  const fen = gameStateToFEN(gameState)
  const fenBefore = stateBefore ? gameStateToFEN(stateBefore) : fen

  const playerSan = sanFor(stateBefore ?? gameState, gameState, evaluation.from, evaluation.to)
  const bestSan =
    evaluation.bestMove && stateBefore
      ? sanFor(stateBefore, gameState, evaluation.bestMove.from, evaluation.bestMove.to)
      : evaluation.bestMove
        ? `${evaluation.bestMove.from} to ${evaluation.bestMove.to}`
        : "N/A"

  const motifs: MotifId[] =
    stateBefore && stateBefore !== gameState
      ? detectMotifs(stateBefore, gameState, evaluation.from, evaluation.to)
      : []

  const motifDetails: MotifDetail[] =
    stateBefore && stateBefore !== gameState
      ? detectMotifDetails(stateBefore, gameState, evaluation.from, evaluation.to)
      : []

  const patternProfile = buildPatternProfile(patternMoves ?? [])
  const patternFacts = patternProfile.nMoves >= 4 ? describePattern(patternProfile) : ""

  const verdict = buildDeterministicVerdict(evaluation, motifs.length ? 1 : 0)

  const preview = {
    ...verdict,
    motifs,
    motifDetails,
    patternProfile: patternProfile.nMoves > 0 ? patternProfile : undefined,
    patternFacts: patternFacts || undefined,
  }

  const makePromptInput = (crossGameFacts: string): CoachPromptInput => {
    return {
      stateBefore: stateBefore ?? gameState,
      stateAfter: gameState,
      evaluation,
      moveHistory,
      skillRating: playerStats?.skillRating ?? null,
      patternFacts: trimFacts(patternFacts, 400),
      crossGameFacts: trimFacts(crossGameFacts, 500),
      motifDetails,
      playerSan,
      bestSan,
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const emit = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      // Deterministic verdict first — nothing above depends on the DB or the
      // model, so the whole feedback pipeline can move before the LLM starts.
      emit("preview", preview)

      let analysis = ""
      let providerName: ProviderName = "ollama"
      let model = resolveModel(getProvider())

      try {
        // Heavier grounded facts (saved-game history) compute after preview.
        const crossGameFacts = describeCrossGameFacts(summarizePatterns(profilesFromSavedGames(getPlayerMoveHistory())))
        const promptInput = makePromptInput(crossGameFacts)

        const provider = getProvider()
        providerName = provider.name
        model = resolveModel(provider)

        if (provider.name !== "ollama") {
          // Online providers keep the gold-standard JSON path (logs itself).
          const { data } = await generateJSON<CoachVerdict>({
            prompt: buildCoachPrompt(promptInput),
            promptVersion: "analyze-move-v3",
            meta: { fen, fenBefore },
            temperature: 0.1,
            maxTokens: 120,
            attempts: 1,
          })
          analysis = cleanSentence(String(data.analysis ?? ""))
          emit("token", analysis)
          emit("done", { analysis, success: true, verdict })
          controller.close()
          return
        }

        const abort = new AbortController()
        const timeout = setTimeout(() => abort.abort(), 45_000)
        const startedAt = Date.now()
        const baseUrl = process.env.OLLAMA_URL ?? "http://localhost:11434"

        const res = await fetch(`${baseUrl}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abort.signal,
          body: JSON.stringify({
            model,
            prompt: buildCoachSentencePrompt(promptInput),
            stream: true,
            options: { temperature: 0.1, num_predict: 120 },
          }),
        })

        if (!res.ok || !res.body) {
          throw new Error(`Ollama stream failed (${res.status})`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          let newline: number
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim()
            buffer = buffer.slice(newline + 1)
            if (!line) continue

            let chunk: { response?: string; done?: boolean }
            try {
              chunk = JSON.parse(line)
            } catch {
              continue
            }

            if (chunk.response) {
              analysis += chunk.response
              emit("token", chunk.response)
            }
            if (chunk.done) {
              // Ollama closes the NDJSON after the done chunk; stop parsing.
              buffer = ""
              break
            }
          }
        }

        clearTimeout(timeout)
        analysis = cleanSentence(analysis)

        await getWriter().write({
          ts: new Date().toISOString(),
          provider: "ollama",
          model,
          latencyMs: Date.now() - startedAt,
          promptVersion: "analyze-move-stream-v1",
          status: "ok",
          prompt: buildCoachSentencePrompt(promptInput),
          data: { analysis },
          meta: { fen, fenBefore },
        })

        emit("done", { analysis, success: true, verdict })
        controller.close()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        try {
          await getWriter().write({
            ts: new Date().toISOString(),
            provider: (providerName ?? "ollama") as ProviderName,
            model: model ?? resolveModel(getProvider()),
            latencyMs: 0,
            promptVersion: "analyze-move-stream-v1",
            status: "api_error",
            error: message,
            prompt: buildCoachSentencePrompt(makePromptInput("")),
          })
        } catch {}

        emit("done", { analysis: cleanSentence(analysis), success: false, error: message, verdict })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}

function cleanSentence(text: string): string {
  let t = text.trim()
  t = t.replace(/^```[\s\S]*?\n/, "").replace(/\n```$/, "")
  const wrapped = t.match(/\{\s*"analysis"\s*:\s*"([\s\S]*?)"\s*}/)
  if (wrapped) t = wrapped[1].replace(/\\n/g, " ").replace(/\s+/g, " ").trim()
  t = t.replace(/^["'“”]+|["'“”]+$/g, "").replace(/\s+/g, " ").trim()
  return t
}

// Cap the length of pattern facts so the prompt stays small (faster prefill).
function trimFacts(facts: string, maxChars: number): string {
  return facts.length > maxChars ? facts.slice(0, maxChars).trimEnd() + "…" : facts
}