import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET - Load active session
export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ session: null })
  }

  const { data: session } = await supabase
    .from("game_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single()

  const { data: profile } = await supabase.from("player_profiles").select("*").eq("id", user.id).single()

  return NextResponse.json({ session, profile })
}

// POST - Save session
export async function POST(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

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
  } = body

  try {
    // Upsert session
    const { data: existing } = await supabase
      .from("game_sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single()

    if (existing) {
      await supabase
        .from("game_sessions")
        .update({
          game_state: gameState,
          game_history: gameHistory,
          move_notations: moveNotations,
          game_evaluations: gameEvaluations,
          player_color: playerColor,
          current_difficulty: currentDifficulty,
          history_index: historyIndex,
          move_times: moveTimes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
    } else {
      await supabase.from("game_sessions").insert({
        user_id: user.id,
        game_state: gameState,
        game_history: gameHistory,
        move_notations: moveNotations,
        game_evaluations: gameEvaluations,
        player_color: playerColor,
        current_difficulty: currentDifficulty,
        history_index: historyIndex,
        move_times: moveTimes,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Save session error:", error)
    return NextResponse.json({ error: "Failed to save session" }, { status: 500 })
  }
}

// DELETE - Clear session
export async function DELETE() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await supabase.from("game_sessions").update({ is_active: false }).eq("user_id", user.id).eq("is_active", true)

  return NextResponse.json({ success: true })
}
