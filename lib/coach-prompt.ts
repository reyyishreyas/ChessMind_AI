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
  crossGameFacts: string
  motifDetails: MotifDetail[]
  playerSan: string
  bestSan: string
  bestMoveReason: string
  threatFact: string
}

export function buildCoachPrompt(input: CoachPromptInput): string {
  const {
    stateBefore,
    stateAfter,
    evaluation,
    moveHistory,
    skillRating,
    patternFacts,
    crossGameFacts,
    motifDetails,
    playerSan,
    bestSan,
    bestMoveReason,
    threatFact,
  } = input

  const fenBefore = gameStateToFEN(stateBefore)
  const fen = gameStateToFEN(stateAfter)
  const motifFacts = describeMotifs(motifDetails)
  const patternLine =
    patternFacts !== ""
      ? `- Pattern snapshot this session (ground truth from measured moves): ${patternFacts}`
      : "- Pattern snapshot this session: too few moves yet to judge patterns"
  const historyLine =
    crossGameFacts !== ""
      ? `- Pattern history across finished games (ground truth from saved move data): ${crossGameFacts}`
      : "- Pattern history across finished games: no finished games recorded yet"

  return `You are a chess coach analyzing a player's move. Ground every claim in the verified facts below.

VERIFIED FACTS (all correct; never contradict or go beyond them):
- Player played: ${playerSan} (from ${evaluation.from} to ${evaluation.to})
- Move grade: ${evaluation.type}; centipawn loss: ${evaluation.centipawnLoss || 0} cp
- Position before player move (FEN): ${fenBefore}
- Position after player move (FEN): ${fen}
- Better move was: ${bestSan}
- Why the better move is better: ${bestMoveReason || "not available"}
- Immediate threat after your move: ${threatFact || "none"}
- Verified tactical motifs in this move: ${motifFacts || "none"}
- Recent moves: ${moveHistory.slice(-10).join(", ") || "Game just started"}
- Player ELO rating: ~${skillRating ?? 1000}
${patternLine}
${historyLine}

WARNING RULES:
1. When you name the player's move, use exactly "${playerSan}".
2. Never claim a tactic (fork, pin, skewer, discovered attack, etc.) unless it is in the verified list above.
3. Alternatives must reference the provided better move "${bestSan}".
4. Only mention squares and pieces that exist in the position.
5. Do not fabricate move counts, game phases, or openings.
6. The pattern snapshot and pattern-history lines are verified; you may teach against them, but never add pattern claims beyond them.
7. Only mention a threat that is in the "Immediate threat" line above.
8. Do not invent your own positional judgments (space, structure, development, sacrifices). Describe the played move using only: the grade, the centipawn loss, the better-move reason, and the threat.

VARIETY RULES:
1. Do not reuse a fixed template. Every move must get a fresh explanation.
2. Never open two replies the same way (avoid always starting with "Good move" or the piece name).
3. Cite the concrete number (centipawn loss) and the concrete squares/pieces from the facts.

Return ONLY valid JSON:
{
  "analysis": "2 to 3 specific sentences (at most 60 words) that explain what the played move did or missed, whether the alternatives line suggests a better idea, and any immediate threat. Use only the facts above — no positional claims of your own. Concrete, coaching tone, no filler.",
  "move_quality": "Brilliant" | "Good" | "Mistake" | "Blunder" | "Perfect" | "Inaccuracy",
  "accuracy_score": <number between 0 and 100>,
  "blunder_risk": "low" | "medium" | "high"
}
Return only the JSON object, no other text.`
}

/**
 * Streaming variant used by the instant-feedback path. The VERIFIED FACTS
 * header and warning rules are byte-identical to buildCoachPrompt (same
 * grounded facts, same quality); only the requested output differs — a single
 * plain sentence instead of a JSON object, so it can be streamed token by
 * token and shown as soon as the model starts talking.
 */
export function buildCoachSentencePrompt(input: CoachPromptInput): string {
  const jsonPrompt = buildCoachPrompt(input)
  const tailStart = jsonPrompt.indexOf("\n\nReturn ONLY valid JSON:")
  const groundedHeader = tailStart >= 0 ? jsonPrompt.slice(0, tailStart) : jsonPrompt

  return `${groundedHeader}

Return ONLY the coaching explanation: 2 to 3 specific sentences (at most 60 words) that explain what the played move did or missed, why the better move is better when one is given, and any immediate threat. Follow the VARIETY RULES. Plain text only — no JSON, no quotes, no labels, no "Analysis:" prefix.`
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