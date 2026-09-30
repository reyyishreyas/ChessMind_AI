import { type GameState } from "@/lib/chess-engine"
import { generateJSON, getProvider, resolveCoachModel } from "@/lib/llm"
import {
  buildCandidates,
  buildSuggesterPrompt,
  validateSuggestion,
  type SuggesterRaw,
} from "@/lib/coach-suggest"
import { getCoachContext, setCoachSuggestion } from "@/lib/db/db"
import { withOllamaLane } from "@/lib/llm/ollama-lane"

export const maxDuration = 30

/**
 * Suggester half of the two-model coach. Picks one move from the engine-ranked
 * candidates (the same evaluator that grades the player) and explains it, then
 * writes the result to the shared coach_context so the feedback model can see
 * and stay consistent with it.
 */
export async function POST(req: Request) {
  const {
    state,
    playerStats,
  }: { state: GameState; playerStats: { skillRating: number; averageAccuracy: number } | null } =
    await req.json()

  const candidates = buildCandidates(state, 5)
  if (candidates.length === 0) {
    return Response.json({ suggestion: null, candidates: [] })
  }

  const provider = getProvider()
  const model = resolveCoachModel(provider, "suggester")
  const priorFeedback = getCoachContext().feedback

  let raw: SuggesterRaw = {}
  try {
    const generate = (signal: AbortSignal) =>
      generateJSON<SuggesterRaw>({
        prompt: buildSuggesterPrompt({
          state,
          candidates,
          skillRating: playerStats?.skillRating ?? null,
          playerColor: state.turn,
          priorFeedback,
        }),
        model,
        promptVersion: "coach-suggest-v1",
        temperature: 0.3,
        maxTokens: 160,
        attempts: 1,
        signal,
      })
    // Low lane: background work waits for (and yields to) the player-facing
    // review — Ollama itself has no notion of priority.
    const { data } = provider.name === "ollama" ? await withOllamaLane("low", generate) : await generate(new AbortController().signal)
    raw = data
  } catch {
    // Offline, cancelled by the review lane, or unparseable: fall back to the
    // engine-best candidate below.
  }

  const suggestion = validateSuggestion(state, candidates, raw, model)
  setCoachSuggestion(suggestion)

  return Response.json({ suggestion, candidates })
}
