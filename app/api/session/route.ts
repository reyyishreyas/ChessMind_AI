import { NextResponse } from "next/server"
import {
  getProfile,
  getActiveSession,
  upsertSession,
  deactivateSession,
  type SessionRow,
} from "@/lib/db/db"

export const dynamic = "force-dynamic"

// GET - Load active session + local profile
export async function GET() {
  const profile = getProfile()
  const session = getActiveSession()
  return NextResponse.json({ session: session ? parseSession(session) : null, profile })
}

// POST - Save session (debounced autosave)
export async function POST(req: Request) {
  const body = await req.json()
  const {
    gameState,
    gameHistory,
    moveNotations,
    gameEvaluations,
    playerColor,
    currentDifficulty,
    historyIndex,
    moveTimes,
    botElo,
    botEloHistory,
  } = body

  try {
    upsertSession({
      game_state: gameState,
      game_history: gameHistory,
      move_notations: moveNotations,
      game_evaluations: gameEvaluations,
      player_color: playerColor,
      current_difficulty: currentDifficulty,
      history_index: historyIndex,
      move_times: moveTimes,
      bot_elo: botElo,
      bot_elo_history: botEloHistory,
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Save session error:", error)
    return NextResponse.json({ error: "Failed to save session" }, { status: 500 })
  }
}

// DELETE - Retire the active session
export async function DELETE() {
  try {
    deactivateSession()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete session error:", error)
    return NextResponse.json({ error: "Failed to clear session" }, { status: 500 })
  }
}

// JSON columns are stored as text in SQLite; hand the client real values.
function parseSession(row: SessionRow) {
  return {
    ...row,
    game_state: safeParse(row.game_state, null),
    game_history: safeParse(row.game_history, []),
    move_notations: safeParse(row.move_notations, []),
    game_evaluations: safeParse(row.game_evaluations, []),
    move_times: safeParse(row.move_times, []),
    bot_elo_history: safeParse(row.bot_elo_history, []),
  }
}

function safeParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}