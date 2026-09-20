import type { GameState, Square } from "@/lib/chess-engine"
import type { PlayerStats } from "@/lib/adaptive-ai"

export type BotMove = { from: Square; to: Square } | null

export type BotContext = {
  gameState: GameState
  /** Effective rating the bot should play at (adaptive target, e.g. botElo). */
  targetElo: number
  /** Optional opponent stats for human-like modeling. */
  opponentStats?: PlayerStats
}

export type BotProviderId = "maia" | "stockfish" | "minimax"

export interface BotProvider {
  readonly id: BotProviderId
  isReady(): boolean | Promise<boolean>
  getMove(ctx: BotContext): Promise<BotMove>
}