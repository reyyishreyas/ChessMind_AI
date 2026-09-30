import { gameMovesVersion, getPlayerMoveHistory } from "@/lib/db/db"
import {
  describeCrossGameFacts,
  profilesFromSavedGames,
  summarizePatterns,
} from "@/lib/pattern-profile"

type CrossGameSummary = ReturnType<typeof summarizePatterns>

type CachedCrossGame = { key: string; summary: CrossGameSummary; facts: string }

// Memoized cross-game pattern summary. Rebuilding it reads EVERY saved move
// and re-derives all per-game profiles — O(all history) on every call. The
// version key is a cheap count+max(rowid) of game_moves, so the expensive
// rebuild runs only when saved moves actually change (a new save lands),
// not once per coach move.
let cached: CachedCrossGame | null = null

/** Grounded cross-game summary plus its coach-ready facts string, cached. */
export function getCachedCrossGame(): { summary: CrossGameSummary; facts: string } {
  const key = gameMovesVersion()
  if (cached && cached.key === key) return cached
  const summary = summarizePatterns(profilesFromSavedGames(getPlayerMoveHistory()))
  const facts = describeCrossGameFacts(summary)
  cached = { key, summary, facts }
  return cached
}

/** Coach-ready cross-game facts string, cached. */
export function getCachedCrossGameFacts(): string {
  return getCachedCrossGame().facts
}
