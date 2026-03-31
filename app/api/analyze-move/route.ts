import { GoogleGenAI } from "@google/genai";
import { gameStateToFEN, type GameState } from "@/lib/chess-engine"
import type { MoveEvaluation } from "@/lib/adaptive-ai"

export const maxDuration = 30

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

  // Enhanced prompt to get structured features AND user-friendly feedback
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

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      })

      const responseText = result.text || ""
      let jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        jsonMatch = [responseText]
      }

      let geminiData: {
        analysis?: string
        move_quality?: string
        accuracy_score?: number
        blunder_risk?: string
        flag3?: number
      } = {}

      try {
        geminiData = JSON.parse(jsonMatch[0])
      } catch {
        geminiData = {}
      }

      const hasAll = !!(geminiData.analysis && geminiData.move_quality && typeof geminiData.accuracy_score === "number" && geminiData.blunder_risk !== undefined && geminiData.flag3 !== undefined)
      if (hasAll) {
        const moveQuality = normalizeMoveQuality(String(geminiData.move_quality))
        const accuracyScore = Math.max(0, Math.min(100, Number(geminiData.accuracy_score)))
        const blunderRisk = String(geminiData.blunder_risk)
        const flag3 = geminiData.flag3 ? 1 : 0
        return Response.json({
          analysis: String(geminiData.analysis),
          move_quality: moveQuality,
          accuracy_score: accuracyScore,
          blunder_risk: blunderRisk,
          flag3,
        })
      }
    }
    return Response.json({ error: "Gemini data unavailable", success: false }, { status: 502 })
  } catch (error) {
    return Response.json({ error: "Gemini request failed", success: false }, { status: 502 })
  }
}

function mapMoveQuality(type: MoveEvaluation["type"]): string {
  const map: Record<MoveEvaluation["type"], string> = {
    brilliant: "Brilliant",
    excellent: "Perfect",
    good: "Good",
    inaccuracy: "Inaccuracy",
    mistake: "Mistake",
    blunder: "Blunder",
  }
  return map[type] || "Good"
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

function calculateAccuracyScore(evaluation: MoveEvaluation): number {
  // Map move types to accuracy scores (0-100)
  const scoreMap: Record<MoveEvaluation["type"], number> = {
    brilliant: 100,
    excellent: 95,
    good: 85,
    inaccuracy: 65,
    mistake: 40,
    blunder: 15,
  }
  const baseScore = scoreMap[evaluation.type] || 75
  
  // Adjust based on centipawn loss
  const cpLoss = evaluation.centipawnLoss || 0
  if (cpLoss > 300) return Math.max(0, baseScore - 20)
  if (cpLoss > 150) return Math.max(0, baseScore - 10)
  return baseScore
}

function calculateBlunderRisk(evaluation: MoveEvaluation): "low" | "medium" | "high" {
  const cpLoss = evaluation.centipawnLoss || 0
  if (cpLoss > 300 || evaluation.type === "blunder") return "high"
  if (cpLoss > 150 || evaluation.type === "mistake") return "medium"
  return "low"
}

function getFallbackAnalysis(evaluation: MoveEvaluation): string {
  const cpLoss = evaluation.centipawnLoss || 0

  switch (evaluation.type) {
    case "brilliant":
      return "Brilliant! You found an exceptional move that significantly improves your position."
    case "excellent":
      return "Excellent move! You're playing with great precision and understanding."
    case "good":
      return "Solid move. Keep up the good play!"
    case "inaccuracy":
      return `Small inaccuracy (${cpLoss}cp loss). ${evaluation.bestMove ? `${evaluation.bestMove.from}-${evaluation.bestMove.to} would give you a slightly better position.` : "Look for more active moves."}`
    case "mistake":
      return `That's a mistake (${cpLoss}cp loss). ${evaluation.bestMove ? `${evaluation.bestMove.from}-${evaluation.bestMove.to} was stronger.` : ""} Think about piece activity and king safety!`
    case "blunder":
      return `Significant error (${cpLoss}cp loss)! ${evaluation.bestMove ? `${evaluation.bestMove.from}-${evaluation.bestMove.to} was much better.` : ""} Take your time and check for tactics before moving.`
    default:
      return "Interesting move. Let's see how the game develops."
  }
}
