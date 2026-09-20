import { getAllLegalMoves, type GameState, type Square } from "@/lib/chess-engine"
import type { PlayerStats } from "@/lib/adaptive-ai"
import type { BotContext, BotMove, BotProvider, BotProviderId } from "./types"
import { createMaiaProvider } from "./maia"
import { createStockfishProvider } from "./stockfish"
import { createMinimaxProvider } from "./minimax"

export const MAIA_BAND_MIN = 1100
export const MAIA_BAND_MAX = 2000

export type BotBand = { min: number; max: number; providers: BotProviderId[] }

export const BOT_BANDS: BotBand[] = [
  { min: Number.NEGATIVE_INFINITY, max: MAIA_BAND_MIN, providers: ["stockfish", "minimax"] },
  { min: MAIA_BAND_MIN, max: MAIA_BAND_MAX, providers: ["maia", "stockfish", "minimax"] },
  { min: MAIA_BAND_MAX, max: Number.POSITIVE_INFINITY, providers: ["stockfish", "minimax"] },
]

const providers: Record<BotProviderId, BotProvider> = {
  maia: createMaiaProvider(),
  stockfish: createStockfishProvider(),
  minimax: createMinimaxProvider(),
}

export function bandForElo(elo: number): BotBand {
  return BOT_BANDS.find((band) => elo >= band.min && elo < band.max) ?? BOT_BANDS[1]
}

function isLegalMove(state: GameState, move: { from: Square; to: Square }): boolean {
  return getAllLegalMoves(state).some((m) => m.from === move.from && m.to === move.to)
}

export async function chooseBotMove(
  state: GameState,
  targetElo: number,
  opponentStats?: PlayerStats,
): Promise<BotMove> {
  const band = bandForElo(targetElo)
  const context: BotContext = { gameState: state, targetElo, opponentStats }

  for (const id of band.providers) {
    const provider = providers[id]
    try {
      if (!(await provider.isReady())) continue
      const move = await provider.getMove(context)
      if (move && isLegalMove(state, move)) return move
    } catch (error) {
      console.warn(`[bot] provider "${id}" failed for targetElo ${targetElo}:`, error)
    }
  }

  return null
}