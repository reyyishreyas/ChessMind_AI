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