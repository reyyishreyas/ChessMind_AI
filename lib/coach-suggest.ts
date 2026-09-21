import { type GameState, type PieceColor, gameStateToFEN } from "./chess-engine.ts"
import { buildMoveExplanation, sanForMove } from "./coach-explain.ts"
import { getMoveGrade } from "./stockfish-eval.ts"
import { rankMoves } from "./adaptive-ai.ts"
import type { CoachSuggestion } from "./db/db.ts"

/**
 * Suggestion half of the two-model coach. Candidates come from `rankMoves`,
 * which is the exact evaluator that grades the player's moves — so any move the
 * suggester picks is, by construction, one the reviewer will also grade well.
 * The suggester model only chooses among them and writes the explanation.
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
  return rankMoves(state, limit).map((m) => ({
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
        `${i + 1}. ${c.san} (from ${c.from} to ${c.to}) — costs ${c.cpLoss} cp vs best — grade ${c.grade} — why: ${c.explanation}`
    )
    .join("\n")

  return `You are the move-suggestion half of a chess coach for a beginner playing ${playerColor === "w" ? "White" : "Black"}. Choose exactly ONE move from the verified candidates and explain it in plain language.

VERIFIED FACTS:
- Position (FEN): ${gameStateToFEN(state)}
- Side to move: ${playerColor === "w" ? "White" : "Black"} (the player)
- Player ELO rating: ~${skillRating ?? 1000}
- Last feedback the reviewer coach gave: ${priorFeedback ? `"${priorFeedback}"` : "none yet"}

VERIFIED CANDIDATES (ranked best-first by the same engine that grades the player; 0 cp is perfect):
${lines}

RULES:
1. Choose only from the candidates above, matching their exact "from" and "to" squares.
2. Prefer the earliest (lowest cp loss) candidate unless a later one better answers the reviewer's last feedback.
3. Write the reason in 1-2 sentences using only the candidate's "why" note and the facts. Never invent tactics, pieces, or squares.
4. Never contradict the reviewer. If the reviewer flagged a threat, pick a move that deals with it when a candidate does.

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
 * Turn the model's raw JSON into a validated suggestion. Anything that is not
 * one of the engine candidates is rejected and the top candidate is used, so a
 * weak model can never introduce an inaccurate move.
 */
export function validateSuggestion(
  state: GameState,
  candidates: CoachCandidate[],
  raw: SuggesterRaw,
  model: string,
): CoachSuggestion {
  const fallback = candidates[0]
  const candidateMap = new Map<string, CoachCandidate>()
  for (const c of candidates) {
    candidateMap.set(`${c.from}-${c.to}`, c)
  }
  const match = candidateMap.get(`${raw.from}-${raw.to}`) ?? null
  const chosen = match ?? fallback
  const reason = sanitizeReason(raw.reason, chosen)
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
