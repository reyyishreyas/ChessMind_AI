import { NextResponse } from "next/server"
import { getGameHistory, getPlayerMoveHistory, getProfile } from "@/lib/db/db"
import {
  describeCrossGameFacts,
  profilesFromSavedGames,
  summarizePatterns,
} from "@/lib/pattern-profile"

export const dynamic = "force-dynamic"

// GET - Cross-game pattern summary + recent game history + live skill scores.
// Everything comes from the local SQLite db: nothing is guessed, so the panel
// shows the same grounded facts the coach prompt receives.
export async function GET() {
  const profile = getProfile()
  const summary = summarizePatterns(profilesFromSavedGames(getPlayerMoveHistory()))
  return NextResponse.json({
    summary,
    headline: describeCrossGameFacts(summary),
    games: getGameHistory(20),
    skills: {
      tactics: profile.tactics_score,
      position: profile.position_score,
      endgame: profile.endgame_score,
      rating: profile.skill_rating,
    },
  })
}