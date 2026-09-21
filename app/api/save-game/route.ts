import { NextResponse } from "next/server"
import { saveGame } from "@/lib/db/db"
import type { PatternMoveEvent } from "@/lib/pattern-profile"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const body = await req.json()
  const {
    result, // 1, 0.5, or 0
    playerColor,
    aiElo,
    totalMoves,
    excellentMoves,
    goodMoves,
    inaccurateMoves,
    mistakes,
    blunders,
    ams,
    stdDeviation,
    avgTimePerMove,
    playerEloBefore,
    playerEloAfter,
    currentBotElo,
    tacticsScore,
    positionScore,
    endgameScore,
    patternMoves,
  } = body

  try {
    saveGame({
      result: Number(result),
      player_color: playerColor,
      ai_elo: Math.round(Number(aiElo) || 0),
      total_moves: totalMoves,
      excellent_moves: excellentMoves,
      good_moves: goodMoves,
      inaccurate_moves: inaccurateMoves,
      mistakes,
      blunders,
      ams,
      std_deviation: stdDeviation,
      avg_time_per_move: avgTimePerMove,
      player_elo_before: Math.round(Number(playerEloBefore) || 0),
      player_elo_after: Math.round(Number(playerEloAfter) || 0),
      current_bot_elo: Math.round(Number(currentBotElo) || Math.round(Number(aiElo) || 0)),
      tactics_score: tacticsScore,
      position_score: positionScore,
      endgame_score: endgameScore,
      pattern_moves: (patternMoves as PatternMoveEvent[]) ?? [],
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Save game error:", error)
    return NextResponse.json({ error: "Failed to save game" }, { status: 500 })
  }
}