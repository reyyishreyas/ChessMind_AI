import { gameStateToFEN, type Square } from "@/lib/chess-engine"
import { getStockfish } from "@/lib/stockfish-worker"
import { eloToDifficulty, STOCKFISH_LEVELS } from "@/lib/stockfish-eval"
import type { BotContext, BotMove, BotProvider } from "./types"

export function stockfishParamsForElo(targetElo: number): { depth: number; skillLevel: number } {
  const level = STOCKFISH_LEVELS[eloToDifficulty(targetElo)] ?? STOCKFISH_LEVELS[5]
  return { depth: level?.depth ?? 5, skillLevel: level?.skillLevel ?? 8 }
}

export function createStockfishProvider(): BotProvider {
  return {
    id: "stockfish",
    async isReady(): Promise<boolean> {
      try {
        const engine = getStockfish()
        await engine.init()
        return true
      } catch {
        return false
      }
    },
    async getMove(ctx: BotContext): Promise<BotMove> {
      const engine = getStockfish()
      await engine.init()

      const { depth, skillLevel } = stockfishParamsForElo(ctx.targetElo)
      const msg = await engine.getBestMove(gameStateToFEN(ctx.gameState), depth, skillLevel)

      if (msg.type !== "bestmove" || !msg.bestMove || msg.bestMove === "(none)") return null
      return { from: msg.bestMove.slice(0, 2) as Square, to: msg.bestMove.slice(2, 4) as Square }
    },
  }
}