/**
 * Utility functions for ELO prediction and feature collection
 */

import type { GameState, Square } from "./chess-engine"
import type { MoveEvaluation } from "./adaptive-ai"
import { evaluatePosition } from "./adaptive-ai"
import { getStockfish } from "./stockfish-worker"
import { gameStateToFEN } from "./chess-engine"

export interface MoveFeatures {
  move_number: number
  start_eval: number
  end_eval: number
  delta_eval: number
  move_quality: "Brilliant" | "Good" | "Mistake" | "Blunder" | "Perfect" | "Inaccuracy"
  time_per_move: number
  accuracy_score: number
  blunder_risk: "low" | "medium" | "high"
  flag1: number // Capture (0 or 1)
  flag2: number // Check (0 or 1)
  flag3: number // Tactical motif (0 or 1)
  last_elo: number
  phase_Endgame: boolean
  phase_Middlegame: boolean
  phase_Opening: boolean
}

/**
 * Determine game phase based on move number
 */
export function getGamePhase(moveNumber: number): {
  phase_Opening: boolean
  phase_Middlegame: boolean
  phase_Endgame: boolean
} {
  if (moveNumber <= 12) {
    return { phase_Opening: true, phase_Middlegame: false, phase_Endgame: false }
  } else if (moveNumber <= 35) {
    return { phase_Opening: false, phase_Middlegame: true, phase_Endgame: false }
  } else {
    return { phase_Opening: false, phase_Middlegame: false, phase_Endgame: true }
  }
}

/**
 * Check if a move is a capture
 */
export function isCapture(stateBefore: GameState, from: Square, to: Square): number {
  const [toRow, toCol] = [
    8 - Number.parseInt(to[1]),
    to.charCodeAt(0) - 97,
  ]
  const capturedPiece = stateBefore.board[toRow]?.[toCol]
  return capturedPiece !== null && capturedPiece !== undefined ? 1 : 0
}

/**
 * Check if a move gives check
 */
export function isCheck(stateAfter: GameState, playerColor: "w" | "b"): number {
  // The opponent's king should be in check after the move
  const opponentColor = playerColor === "w" ? "b" : "w"
  // Check if opponent is in check (turn switches after move, so check if current turn's king is in check)
  // Actually, after player's move, turn switches to opponent, so isCheck indicates if opponent is in check
  return stateAfter.isCheck ? 1 : 0
}

/**
 * Convert centipawns to evaluation (pawns)
 */
export function centipawnsToPawns(centipawns: number): number {
  return centipawns / 100
}

/**
 * Collect all features for a move
 */
export async function collectMoveFeatures(
  stateBefore: GameState,
  stateAfter: GameState,
  from: Square,
  to: Square,
  moveNumber: number,
  timePerMove: number,
  lastElo: number,
  evaluation: MoveEvaluation,
  geminiData: {
    move_quality: string
    accuracy_score: number
    blunder_risk: "low" | "medium" | "high"
    flag3: number
  },
  playerColor: "w" | "b"
): Promise<MoveFeatures> {
  // Get evaluations (centipawns) from Stockfish if available, fallback to heuristic
  let startCp: number
  let endCp: number
  try {
    const fenBefore = gameStateToFEN(stateBefore)
    const fenAfter = gameStateToFEN(stateAfter)
    const engine = getStockfish()
    startCp = await engine.evaluatePosition(fenBefore, 12)
    endCp = await engine.evaluatePosition(fenAfter, 12)
  } catch {
    startCp = evaluatePosition(stateBefore)
    endCp = startCp - (evaluation.centipawnLoss || 0)
  }
  const startEval = centipawnsToPawns(startCp)
  const endEval = centipawnsToPawns(endCp)
  const deltaEval = endEval - startEval

  // Keep Stockfish white-perspective values to match training data
  const normalizedStartEval = startEval
  const normalizedEndEval = endEval
  const normalizedDeltaEval = normalizedEndEval - normalizedStartEval

  // Get flags
  const flag1 = isCapture(stateBefore, from, to)
  const flag2 = isCheck(stateAfter, playerColor)

  // Get phase
  const phase = getGamePhase(moveNumber)

  // Normalize move quality
  const moveQualityMap: Record<string, MoveFeatures["move_quality"]> = {
    Brilliant: "Brilliant",
    Perfect: "Perfect",
    Good: "Good",
    Inaccuracy: "Inaccuracy",
    Mistake: "Mistake",
    Blunder: "Blunder",
  }
  const moveQuality = moveQualityMap[geminiData.move_quality] || "Good"

  return {
    move_number: moveNumber,
    start_eval: normalizedStartEval,
    end_eval: normalizedEndEval,
    delta_eval: normalizedDeltaEval,
    move_quality: moveQuality,
    time_per_move: timePerMove,
    accuracy_score: geminiData.accuracy_score,
    blunder_risk: geminiData.blunder_risk,
    flag1,
    flag2,
    flag3: geminiData.flag3,
    last_elo: lastElo,
    phase_Endgame: phase.phase_Endgame,
    phase_Middlegame: phase.phase_Middlegame,
    phase_Opening: phase.phase_Opening,
  }
}

/**
 * Predict ELO using the FastAPI backend
 */
export async function predictElo(features: MoveFeatures): Promise<{
  predicted_elo: number
  elo_change: number
  success: boolean
}> {
  // Validate features before sending
  if (!features || typeof features.last_elo !== "number") {
    console.warn("Invalid features for ELO prediction:", features)
    return {
      predicted_elo: features?.last_elo || 1200,
      elo_change: 0,
      success: false,
    }
  }

  try {
    const response = await fetch("/api/predict-elo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        features,
      }),
    })

    if (!response.ok) {
      let errorMessage = response.statusText
      try {
        const errorData = await response.json()
        errorMessage = errorData.details || errorData.error || errorMessage
      } catch {
        // If JSON parsing fails, use status text
      }
      // Don't log errors if backend is not available (expected behavior)
      if (!errorMessage.includes("fetch failed")) {
        console.warn("ELO prediction failed:", errorMessage)
      }
      // Fallback: return last_elo if prediction fails
      return {
        predicted_elo: features.last_elo,
        elo_change: 0,
        success: false,
      }
    }

    const data = await response.json()
    console.log("📊 ELO prediction response:", data)
    // Ensure success field is always present
    return {
      predicted_elo: data.predicted_elo || features.last_elo,
      elo_change: data.elo_change || 0,
      success: data.success !== false,
    }
  } catch (error) {
    // Log connection errors for debugging
    if (error instanceof TypeError && error.message.includes("fetch")) {
      console.warn("⚠️ Backend not available for ELO prediction")
      return {
        predicted_elo: features.last_elo,
        elo_change: 0,
        success: false,
      }
    }
    console.error("❌ ELO prediction error:", error)
    // Fallback: return last_elo if prediction fails
    return {
      predicted_elo: features.last_elo,
      elo_change: 0,
      success: false,
    }
  }
}

/**
 * Calculate ELO change after game using standard Elo formula
 * Formula: E = 1 / (1 + 10^((R_opponent - R_player) / 400))
 *          R_new = R_old + K * (S - E)
 * 
 * Where:
 * - E = Expected score
 * - S = Actual score (1 for win, 0.5 for draw, 0 for loss)
 * - K = Development factor (default 32)
 * - R_opponent = Bot's ELO
 * - R_player = Player's ELO
 */
export function calculateEloAfterGame(
  playerElo: number,
  botElo: number,
  result: "win" | "loss" | "draw",
  K: number = 32
): number {
  // Expected score: E = 1 / (1 + 10^((R_opponent - R_player) / 400))
  const expectedScore = 1 / (1 + Math.pow(10, (botElo - playerElo) / 400))

  // Actual score: S = 1 (win), 0.5 (draw), 0 (loss)
  const actualScore = result === "win" ? 1 : result === "draw" ? 0.5 : 0

  // ELO change: R_new = R_old + K * (S - E)
  const eloChange = K * (actualScore - expectedScore)

  // Update rating (ensure minimum of 100, round to integer)
  const newElo = playerElo + eloChange
  return Math.max(100, Math.round(newElo))
}
