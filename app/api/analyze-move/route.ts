import { generateJSON, getProvider, resolveCoachModel } from "@/lib/llm"
import { cleanCoachAnalysis, normalizeMoveQuality } from "@/lib/coach-verdict"
import { type GameState, gameStateToFEN } from "@/lib/chess-engine"
import { type MotifDetail, type MotifId, detectMotifDetails, detectMotifs } from "@/lib/tactics"
import type { MoveEvaluation } from "@/lib/adaptive-ai"
import {
  buildPatternProfile,
  describeCrossGameFacts,
  describePattern,
  profilesFromSavedGames,
  summarizePatterns,
  type PatternMoveEvent,
} from "@/lib/pattern-profile"
import { buildCoachPrompt, describeMotifs, sanFor } from "@/lib/coach-prompt"
import { buildMoveExplanation, describeThreatsAfterMove, oppositeColor } from "@/lib/coach-explain"
import { formatPriorSuggestion } from "@/lib/coach-suggest"
import { getPlayerMoveHistory, getSuggestionForFen, setCoachFeedback } from "@/lib/db/db"

export const maxDuration = 30

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

  const motifFacts = describeMotifs(motifDetails)

  const patternProfile = buildPatternProfile(patternMoves ?? [])
  const patternFacts = patternProfile.nMoves >= 4 ? describePattern(patternProfile) : ""

  const crossGameFacts = describeCrossGameFacts(summarizePatterns(profilesFromSavedGames(getPlayerMoveHistory())))

  const playerColor = stateBefore?.turn ?? oppositeColor(gameState.turn)
  const threatFact = describeThreatsAfterMove(gameState, playerColor)
  const priorSuggestion = formatPriorSuggestion(getSuggestionForFen(fenBefore))
  const bestMoveReason =
    evaluation.bestMove && stateBefore
      ? buildMoveExplanation(stateBefore, evaluation.bestMove.from, evaluation.bestMove.to)
      : ""

  const prompt = buildCoachPrompt({
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
    bestMoveReason,
    threatFact,
    priorSuggestion,
  })

  const model = resolveCoachModel(getProvider(), "feedback")

  try {
    const { data } = await generateJSON<CoachVerdict>({
      prompt,
      model,
      promptVersion: "analyze-move-v3",
      meta: { fen, fenBefore },
      temperature: 0.4,
      maxTokens: 260,
      attempts: 1,
    })

    const hasAll =
      !!data.analysis &&
      !!data.move_quality &&
      typeof data.accuracy_score === "number" &&
      data.blunder_risk !== undefined

    if (!hasAll) {
      return Response.json({ error: "Model returned incomplete data", success: false }, { status: 502 })
    }

    const analysis = cleanCoachAnalysis(String(data.analysis))
    setCoachFeedback(fenBefore, analysis, model)

    return Response.json({
      analysis,
      move_quality: normalizeMoveQuality(String(data.move_quality)),
      accuracy_score: Math.max(0, Math.min(100, Number(data.accuracy_score))),
      blunder_risk: String(data.blunder_risk),
      flag3: motifs.length ? 1 : 0,
      motifs,
      motifDetails,
      patternProfile: patternProfile.nMoves > 0 ? patternProfile : undefined,
      patternFacts: patternFacts || undefined,
    })
  } catch (error) {
    return Response.json({ error: "Model request failed", success: false }, { status: 502 })
  }
}

// Cap the length of pattern facts so the prompt stays small (faster prefill).
function trimFacts(facts: string, maxChars: number): string {
  return facts.length > maxChars ? facts.slice(0, maxChars).trimEnd() + "…" : facts
}