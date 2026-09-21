import { generateJSON } from "@/lib/llm"
import {
  type GameState,
  type Move,
  getPieceAt,
  isKingInCheck,
  moveToAlgebraic,
  gameStateToFEN,
} from "@/lib/chess-engine"
import { type MotifDetail, type MotifId, detectMotifDetails, detectMotifs } from "@/lib/tactics"
import type { MoveEvaluation } from "@/lib/adaptive-ai"

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
  }: {
    gameState: GameState
    evaluation: MoveEvaluation
    moveHistory: string[]
    playerStats: { skillRating: number; averageAccuracy: number } | null
    stateBefore?: GameState
    botMove?: { from: string; to: string }
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

  const prompt = `You are a chess coach analyzing a player's move. Ground every claim in the verified facts below.

VERIFIED FACTS (all correct; never contradict or go beyond them):
- Player played: ${playerSan} (from ${evaluation.from} to ${evaluation.to})
- Move grade: ${evaluation.type}; centipawn loss: ${evaluation.centipawnLoss || 0} cp
- Position before player move (FEN): ${fenBefore}
- Position after player move (FEN): ${fen}
- Better move was: ${bestSan}
- Verified tactical motifs in this move: ${motifFacts || "none"}
- Recent moves: ${moveHistory.slice(-10).join(", ") || "Game just started"}
- Player ELO rating: ~${playerStats?.skillRating || 1000}

WRITING RULES:
1. When you name the player's move, use exactly "${playerSan}".
2. Never claim a tactic (fork, pin, skewer, discovered attack, etc.) unless it is in the verified list above.
3. Alternatives must reference the provided better move "${bestSan}".
4. Only mention squares and pieces that exist in the position.
5. Do not fabricate move counts, game phases, or openings.

Return ONLY valid JSON:
{
  "analysis": "Conversational, encouraging, educational 2-3 sentence message. Name the player's move and explain only using the verified facts.",
  "move_quality": "Brilliant" | "Good" | "Mistake" | "Blunder" | "Perfect" | "Inaccuracy",
  "accuracy_score": <number between 0 and 100>,
  "blunder_risk": "low" | "medium" | "high"
}
Return only the JSON object, no other text.`

  try {
    const { data } = await generateJSON<CoachVerdict>({
      prompt,
      promptVersion: "analyze-move-v2",
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
    })
  } catch (error) {
    return Response.json({ error: "Model request failed", success: false }, { status: 502 })
  }
}

function describeMotifs(details: MotifDetail[]): string {
  return details
    .map((d) => {
      if (d.subjects && d.subjects.length) {
        const names = d.subjects.map((s) => `${PIECE_NAMES[s.type]} on ${s.square}`).join(" and ")
        return `${d.id} (${names})`
      }
      if (d.subject) {
        return `${d.id} (${PIECE_NAMES[d.subject.type]} on ${d.subject.square})`
      }
      return d.id
    })
    .join(", ")
}

const PIECE_NAMES: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
}

function sanFor(stateBefore: GameState, stateAfter: GameState, from: string, to: string): string {
  const piece = getPieceAt(stateBefore, from)
  if (!piece) return `${from}-${to}`
  const move: Move = {
    from,
    to,
    piece: piece.type,
    captured: getPieceAt(stateBefore, to)?.type,
    check: isKingInCheck(stateAfter, piece.color === "w" ? "b" : "w"),
    checkmate: stateAfter.isCheckmate,
  }
  return moveToAlgebraic(stateBefore, move)
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