import type { MoveEvaluation } from "./adaptive-ai"

/**
 * Deterministic grade for a move, derived only from verified Stockfish facts.
 * The grounded prompt already instructs the LLM to report exactly these values
 * (and nothing else), so computing them directly is not a quality reduction —
 * it removes the model's chance to mis-echo ground truth, and lets the rest of
 * the pipeline (Elo features, persistence) run without waiting on the sentence.
 */

export type CoachVerdictData = {
  move_quality: string
  accuracy_score: number
  blunder_risk: string
  flag3: number
}

export function normalizeMoveQuality(quality: string): string {
  const normalized = quality.toLowerCase()
  if (normalized.includes("brilliant")) return "Brilliant"
  if (normalized.includes("perfect") || normalized.includes("excellent")) return "Perfect"
  if (normalized.includes("good")) return "Good"
  if (normalized.includes("inaccuracy")) return "Inaccuracy"
  if (normalized.includes("mistake")) return "Mistake"
  if (normalized.includes("blunder")) return "Blunder"
  return "Good"
}

// Single-move accuracy from centipawn loss (Lichess formula), clamped to 0..100.
// Mirrors eval/elo_model/features.py exactly so live features match the
// training distribution (the trainer never used the -3.1669 offset).
export function lichessAccuracy(cpLoss: number): number {
  if (!Number.isFinite(cpLoss)) return 50
  const acc = 103.1668 * Math.exp(-0.04354 * cpLoss)
  return Math.max(0, Math.min(100, Math.round(acc)))
}

export function blunderRiskFromCpLoss(cpLoss: number): "low" | "medium" | "high" {
  if (cpLoss > 200) return "high"
  if (cpLoss > 70) return "medium"
  return "low"
}

export function buildDeterministicVerdict(evaluation: MoveEvaluation, flag3: number): CoachVerdictData {
  const cpLoss = Number(evaluation.centipawnLoss) || 0
  return {
    move_quality: normalizeMoveQuality(evaluation.type),
    accuracy_score: lichessAccuracy(cpLoss),
    blunder_risk: blunderRiskFromCpLoss(cpLoss),
    flag3,
  }
}

/** Strip JSON wrappers, quotes, fences and collapse whitespace. */
export function cleanAnalysis(text: string): string {
  let t = String(text ?? "").trim()
  t = t.replace(/^```[\s\S]*?\n/, "").replace(/\n```$/, "")
  const wrapped = t.match(/\{\s*"analysis"\s*:\s*"([\s\S]*?)"\s*}/)
  if (wrapped) t = wrapped[1].replace(/\\n/g, " ").replace(/\s+/g, " ").trim()
  // Strip an in-progress JSON opening so progressive streaming stays clean.
  t = t.replace(/^\{\s*"analysis"\s*:\s*"/, "")
  t = t.replace(/^["'“”]+|["'“”]+$/g, "").replace(/[}\]]+\s*$/, "").trim()
  return t.replace(/\s+/g, " ").trim()
}

/**
 * Reduce model output to ONE full, readable sentence. Skips short greetings
 * ("Good move!", "Nice!") so the shown sentence is the coaching content that
 * names the move — never a partial fragment or a rambling paragraph.
 */
export function firstSentence(text: string): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim()
  if (!t) return ""
  const sentences = t.split(/(?<=[.!?])\s+/)
  const meaningful = sentences.find((s) => s.split(" ").length >= 4)
  return (meaningful ?? sentences[0] ?? "").trim()
}

/**
 * Keep a short, readable coaching paragraph (up to `maxSentences`), dropping
 * greeting fragments and de-duplicating sentences. Used for the in-depth
 * explanation shown under the board.
 */
export function cleanCoachParagraph(text: string, maxSentences = 3): string {
  const t = cleanAnalysis(text)
  if (!t) return ""
  const sentences = t
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(" ").length >= 4)
  const seen = new Set<string>()
  const kept: string[] = []
  for (const s of sentences) {
    const key = s.toLowerCase().replace(/[^a-z0-9 ]/g, "")
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(s)
    if (kept.length >= maxSentences) break
  }
  if (kept.length > 0) return kept.join(" ")
  const fallback = firstSentence(t)
  return fallback
}

/** Final normalized coaching text for display: an in-depth short paragraph. */
export function cleanCoachAnalysis(text: string): string {
  return cleanCoachParagraph(text)
}