import {
  type GameState,
  type Move,
  getPieceAt,
  isKingInCheck,
  moveToAlgebraic,
  gameStateToFEN,
} from "./chess-engine.ts"
import { type MotifDetail } from "./tactics.ts"
import type { MoveEvaluation } from "./adaptive-ai.ts"

/**
 * The grounded coach prompt (analyze-move). Kept as a pure function so the
 * eval suite can assert the VERIFIED FACTS contract: anything the model is
 * told must appear in the prompt exactly, and nothing beyond the provided
 * facts is inventable by construction. The route only wires values in.
 */

export type CoachPromptInput = {
  stateBefore: GameState
  stateAfter: GameState
  evaluation: MoveEvaluation
  moveHistory: string[]
  skillRating: number | null
  patternFacts: string
  motifDetails: MotifDetail[]
  playerSan: string
  bestSan: string
}

export function buildCoachPrompt(input: CoachPromptInput): string {
  const {
    stateBefore,
    stateAfter,
    evaluation,
    moveHistory,
    skillRating,
    patternFacts,
    motifDetails,
    playerSan,
    bestSan,
  } = input

  const fenBefore = gameStateToFEN(stateBefore)
  const fen = gameStateToFEN(stateAfter)
  const motifFacts = describeMotifs(motifDetails)
  const patternLine =
    patternFacts !== ""
      ? `- Pattern snapshot this session (ground truth from measured moves): ${patternFacts}`
      : "- Pattern snapshot this session: too few moves yet to judge patterns"

  return `You are a chess coach analyzing a player's move. Ground every claim in the verified facts below.

VERIFIED FACTS (all correct; never contradict or go beyond them):
- Player played: ${playerSan} (from ${evaluation.from} to ${evaluation.to})
- Move grade: ${evaluation.type}; centipawn loss: ${evaluation.centipawnLoss || 0} cp
- Position before player move (FEN): ${fenBefore}
- Position after player move (FEN): ${fen}
- Better move was: ${bestSan}
- Verified tactical motifs in this move: ${motifFacts || "none"}
- Recent moves: ${moveHistory.slice(-10).join(", ") || "Game just started"}
- Player ELO rating: ~${skillRating ?? 1000}
${patternLine}

WRITING RULES:
1. When you name the player's move, use exactly "${playerSan}".
2. Never claim a tactic (fork, pin, skewer, discovered attack, etc.) unless it is in the verified list above.
3. Alternatives must reference the provided better move "${bestSan}".
4. Only mention squares and pieces that exist in the position.
5. Do not fabricate move counts, game phases, or openings.
6. The pattern snapshot line is verified; you may teach against it, but never add pattern claims beyond it.

Return ONLY valid JSON:
{
  "analysis": "Conversational, encouraging, educational 2-3 sentence message. Name the player's move and explain only using the verified facts.",
  "move_quality": "Brilliant" | "Good" | "Mistake" | "Blunder" | "Perfect" | "Inaccuracy",
  "accuracy_score": <number between 0 and 100>,
  "blunder_risk": "low" | "medium" | "high"
}
Return only the JSON object, no other text.`
}

const PIECE_NAMES: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
}

export function describeMotifs(details: MotifDetail[]): string {
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

export function sanFor(stateBefore: GameState, stateAfter: GameState, from: string, to: string): string {
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