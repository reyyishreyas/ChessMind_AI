import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

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
  } = body

  try {
    // Round all ELO values to integers (database expects integers)
    const aiEloInt = Math.round(Number(aiElo) || 0)
    const playerEloBeforeInt = Math.round(Number(playerEloBefore) || 0)
    const playerEloAfterInt = Math.round(Number(playerEloAfter) || 0)
    const currentBotEloInt = Math.round(Number(currentBotElo) || aiEloInt)

    // Save game stats
    const { error: gameError } = await supabase.from("game_stats").insert({
      user_id: user.id,
      result,
      player_color: playerColor,
      ai_elo: aiEloInt,
      total_moves: totalMoves,
      excellent_moves: excellentMoves,
      good_moves: goodMoves,
      inaccurate_moves: inaccurateMoves,
      mistakes,
      blunders,
      ams,
      std_deviation: stdDeviation,
      avg_time_per_move: avgTimePerMove,
      player_elo_before: playerEloBeforeInt,
      player_elo_after: playerEloAfterInt,
    })

    if (gameError) throw gameError

    // Update player profile
    const { data: profile } = await supabase.from("player_profiles").select("*").eq("id", user.id).single()

    if (profile) {
      const { error: profileError } = await supabase
        .from("player_profiles")
        .update({
          skill_rating: playerEloAfterInt, // Use rounded integer
          current_bot_elo: currentBotEloInt,
          games_played: profile.games_played + 1,
          wins: profile.wins + (result === 1 ? 1 : 0),
          losses: profile.losses + (result === 0 ? 1 : 0),
          draws: profile.draws + (result === 0.5 ? 1 : 0),
          total_blunders: profile.total_blunders + blunders,
          total_mistakes: profile.total_mistakes + mistakes,
          total_inaccuracies: profile.total_inaccuracies + inaccurateMoves,
          total_excellent_moves: profile.total_excellent_moves + excellentMoves,
          current_streak:
            result === 1
              ? Math.max(0, profile.current_streak) + 1
              : result === 0
                ? Math.min(0, profile.current_streak) - 1
                : 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)

      if (profileError) throw profileError
    }

    // Deactivate current session
    await supabase.from("game_sessions").update({ is_active: false }).eq("user_id", user.id).eq("is_active", true)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Save game error:", error)
    return NextResponse.json({ error: "Failed to save game" }, { status: 500 })
  }
}
