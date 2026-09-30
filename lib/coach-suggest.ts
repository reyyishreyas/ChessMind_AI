import { type GameState, type PieceColor, gameStateToFEN } from "./chess-engine.ts"
import { buildMoveExplanation, sanForMove } from "./coach-explain.ts"
import { getMoveGrade } from "./stockfish-eval.ts"
import { rankMoves } from "./adaptive-ai.ts"
import { canonicalCoachMove } from "./coach-hints.ts"
import type { CoachSuggestion } from "./db/db.ts"

/**
 * Suggestion half of the two-model coach. Candidates come from `rankMoves`,
 * which is the exact evaluator that grades the player's moves, filtered to the
 * moves tied for best (0 cp loss). The grader labels any positive cp loss as
 * inaccuracy or worse, so offering only tied-best moves guarantees a player
 * who follows a suggestion is never graded below "good". The canonical coach
 * move (a sound fork when one exists) is ordered first and is the only move
 * the suggester model may recommend — it writes the explanation.
 */

export type CoachCandidate = {
  from: string
  to: string
  san: string
  cpLoss: number
  grade: string
  explanation: string
}

export function buildCandidates(state: GameState, limit = 5): CoachCandidate[] {
  const ties = rankMoves(state, Math.max(limit, 20)).filter((m) => m.centipawnLoss === 0)
  const canonical = canonicalCoachMove(state)
  const ordered = canonical
    ? [
        ...ties.filter((m) => m.from === canonical.from && m.to === canonical.to),
        ...ties.filter((m) => !(m.from === canonical.from && m.to === canonical.to)),
      ]
    : ties
  return ordered.slice(0, limit).map((m) => ({
    from: m.from,
    to: m.to,
    san: sanForMove(state, m.from, m.to),
    cpLoss: m.centipawnLoss,
    grade: getMoveGrade(m.centipawnLoss),
    explanation: buildMoveExplanation(state, m.from, m.to),
  }))
}

export type SuggesterPromptInput = {
  state: GameState
  candidates: CoachCandidate[]
  skillRating: number | null
  playerColor: PieceColor
  priorFeedback: string | null
}

export function buildSuggesterPrompt(input: SuggesterPromptInput): string {
  const { state, candidates, skillRating, playerColor, priorFeedback } = input
  const lines = candidates
    .map(
      (c, i) =>
        `${i + 1}. ${c.san} (from ${c.from} to ${c.to}) — ${c.cpLoss} cp (tied for the best move) — grade ${c.grade} — why: ${c.explanation}`
    )
    .join("\n")

  return `You are the move-suggestion half of a chess coach for a beginner playing ${playerColor === "w" ? "White" : "Black"}. The coach's move for this position is candidate 1 below — explain it in plain language.

VERIFIED FACTS:
- Position (FEN): ${gameStateToFEN(state)}
- Side to move: ${playerColor === "w" ? "White" : "Black"} (the player)
- Player ELO rating: ~${skillRating ?? 1000}
- Last feedback the reviewer coach gave: ${priorFeedback ? `"${priorFeedback}"` : "none yet"}

VERIFIED CANDIDATES (all computed by the same engine that grades the player; every candidate is tied for the best move, so playing any of them grades as "good"):
${lines}

RULES:
1. Recommend candidate 1 — use its exact "from" and "to" squares. Candidates 2+ are equally strong backups; never recommend them instead, so every coach surface shows the same move.
2. Write the reason in 1-2 sentences using candidate 1's "why" note and the facts. Never invent tactics, pieces, or squares.
3. Never contradict the reviewer. If the reviewer flagged a threat, say how candidate 1 deals with it when it does.

Return ONLY valid JSON:
{
  "from": "<square>",
  "to": "<square>",
  "reason": "1-2 coaching sentences"
}
Return only the JSON object, no other text.`
}

export type SuggesterRaw = { from?: string; to?: string; reason?: string }

/**
 * Turn the model's raw JSON into a validated suggestion. The move is bound to
 * the first (canonical) candidate so the hint chip, board arrow and feedback
 * facts all show the same move; the model only contributes the explanation,
 * and a mismatched move or a too-short reason falls back to the candidate's
 * own explanation, so a weak model can never introduce an inaccurate move.
 */
export function validateSuggestion(
  state: GameState,
  candidates: CoachCandidate[],
  raw: SuggesterRaw,
  model: string,
): CoachSuggestion {
  const chosen = candidates[0]
  const matches = `${raw.from}-${raw.to}` === `${chosen.from}-${chosen.to}`
  const reason = matches ? sanitizeReason(raw.reason, chosen) : chosen.explanation
  return {
    from: chosen.from,
    to: chosen.to,
    san: chosen.san,
    explanation: reason,
    grade: chosen.grade,
    cpLoss: chosen.cpLoss,
    model,
    fen: gameStateToFEN(state),
  }
}

/** A one-line fact the feedback model can quote about the suggester's move. */
export function formatPriorSuggestion(suggestion: CoachSuggestion | null): string {
  if (!suggestion) return ""
  const explanation = String(suggestion.explanation ?? "").trim()
  if (!explanation) return `Play ${suggestion.san}.`
  return /^play\b/i.test(explanation) ? explanation : `Play ${suggestion.san}: ${explanation}`
}

function sanitizeReason(reason: string | undefined, chosen: CoachCandidate): string {
  const text = String(reason ?? "")
    .replace(/\s+/g, " ")
    .trim()
  if (text.split(" ").length < 4) return chosen.explanation
  return text
}
