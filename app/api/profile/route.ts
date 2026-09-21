import { NextResponse } from "next/server"
import { getProfile, resetLocalData, updateProfile, type ProfileRow } from "@/lib/db/db"

export const dynamic = "force-dynamic"

// GET - Load the local profile
export async function GET() {
  const profile = getProfile()
  return NextResponse.json({ profile })
}

// DELETE - wipe all local progress (finished games, sessions, profile, logs).
// The offline single-persona app has no account system, so this is how a
// player starts fresh.
export async function DELETE() {
  try {
    resetLocalData()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Reset local data error:", error)
    return NextResponse.json({ error: "Failed to reset local data" }, { status: 500 })
  }
}

// PATCH - Persist profile setup (first-game start: initial ELO + preferred color)
export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const patch: Partial<Omit<ProfileRow, "id" | "created_at" | "updated_at">> = {}
    if (typeof body.preferred_color === "string") patch.preferred_color = body.preferred_color
    if (typeof body.initial_elo_set === "boolean") patch.initial_elo_set = body.initial_elo_set ? 1 : 0
    if (typeof body.skill_rating === "number") patch.skill_rating = Math.round(body.skill_rating)
    if (typeof body.current_bot_elo === "number") patch.current_bot_elo = Math.round(body.current_bot_elo)
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 })
    }
    const profile = updateProfile(patch)
    return NextResponse.json({ profile })
  } catch (error) {
    console.error("Update profile error:", error)
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 })
  }
}