import { generateJSON } from "@/lib/llm"
import { gameStateToFEN, type GameState } from "@/lib/chess-engine"
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

  const prompt = `You are a chess coach analyzing a player's move. Provide helpful, encouraging feedback.

BOT'S MOVE (previous move):
Position before bot move (FEN): ${fenBefore}
Bot moved: ${botMove ? `${botMove.from} to ${botMove.to}` : "N/A"}

PLAYER'S MOVE (current move):
Position before player move (FEN): ${fenBefore}
Position after player move (FEN): ${fen}
Player moved: ${evaluation.from} to ${evaluation.to}
Move evaluation: ${evaluation.type}
Centipawn loss: ${evaluation.centipawnLoss || 0} cp
${evaluation.bestMove ? `Better move was: ${evaluation.bestMove.from} to ${evaluation.bestMove.to}` : ""}
Recent moves: ${moveHistory.slice(-10).join(", ") || "Game just started"}
Player ELO rating: ~${playerStats?.skillRating || 1000}

You MUST respond with a JSON object containing these exact fields:
{
  "analysis": "A friendly, helpful message about this move. Examples:
    - If GOOD/EXCELLENT/BRILLIANT: 'Great move! You played [move]. This [explains why it's good].'
    - If INACCURACY: 'This move [move] is slightly inaccurate. A better option would have been [better move] because [reason].'
    - If MISTAKE: 'This move [move] was a mistake. You missed [better move] which would have [explanation]. Consider [advice].'
    - If BLUNDER: 'This move [move] was a blunder! You should have played [better move] instead. [Explain why it's bad and what you missed].'
  Keep it conversational, encouraging, and educational (2-3 sentences).",
  "move_quality": "Brilliant" | "Good" | "Mistake" | "Blunder" | "Perfect" | "Inaccuracy",
  "accuracy_score": <number between 0 and 100>,
  "blunder_risk": "low" | "medium" | "high",
  "flag3": 1 if there's a tactical motif (fork, pin, skewer, discovered attack, etc.), else 0
}

Tactical motifs include: fork, pin, skewer, discovered attack, double attack, deflection, decoy, interference, overloading, removing the defender, zwischenzug, zugzwang.

IMPORTANT: Always mention the move the player made in your analysis message. Be specific and helpful.

Return ONLY valid JSON, no other text.`

  try {
    const { data } = await generateJSON<CoachVerdict>({ prompt, promptVersion: "analyze-move-v1" })

    const hasAll =
      !!data.analysis &&
      !!data.move_quality &&
      typeof data.accuracy_score === "number" &&
      data.blunder_risk !== undefined &&
      data.flag3 !== undefined

    if (!hasAll) {
      return Response.json({ error: "Model returned incomplete data", success: false }, { status: 502 })
    }

    return Response.json({
      analysis: String(data.analysis),
      move_quality: normalizeMoveQuality(String(data.move_quality)),
      accuracy_score: Math.max(0, Math.min(100, Number(data.accuracy_score))),
      blunder_risk: String(data.blunder_risk),
      flag3: data.flag3 ? 1 : 0,
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