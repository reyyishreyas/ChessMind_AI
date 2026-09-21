import { generateJSON } from "@/lib/llm"
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
import { getPlayerMoveHistory } from "@/lib/db/db"

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

  const prompt = buildCoachPrompt({
    stateBefore: stateBefore ?? gameState,
    stateAfter: gameState,
    evaluation,
    moveHistory,
    skillRating: playerStats?.skillRating ?? null,
    patternFacts,
    crossGameFacts,
    motifDetails,
    playerSan,
    bestSan,
  })

  try {
    const { data } = await generateJSON<CoachVerdict>({
      prompt,
      promptVersion: "analyze-move-v3",
      meta: { fen, fenBefore },
    })

    const hasAll =
      !!data.analysis &&
      !!data.move_quality &&
      typeof data.accuracy_score === "number" &&
      data.blunder_risk !== undefined

    if (!hasAll) {
      return Response.json({ error: "Model returned incomplete data", success: false }, { status: 502 })
    }

    return Response.json({
      analysis: String(data.analysis),
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

function normalizeMoveQuality(quality: string): string {
  const normalized = quality.toLowerCase()
  if (normalized.includes("brilliant")) return "Brilliant"
  if (normalized.includes("perfect") || normalized.includes("excellent")) return "Perfect"
  if (normalized.includes("good")) return "Good"
  if (normalized.includes("inaccuracy")) return "Inaccuracy"
  if (normalized.includes("mistake")) return "Mistake"
  if (normalized.includes("blunder")) return "Blunder"
  return "Good"
}