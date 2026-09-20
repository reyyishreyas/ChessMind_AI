import { getAIMove, type DifficultyLevel } from "@/lib/adaptive-ai"
import { eloToDifficulty } from "@/lib/stockfish-eval"
import type { BotContext, BotMove, BotProvider } from "./types"

export function createMinimaxProvider(): BotProvider {
  return {
    id: "minimax",
    isReady(): boolean {
      return true
    },
    async getMove(ctx: BotContext): Promise<BotMove> {
      const difficulty = eloToDifficulty(ctx.targetElo) as DifficultyLevel
      return getAIMove(ctx.gameState, difficulty, ctx.opponentStats ?? getDefaultStats())
    },
  }
}

function getDefaultStats(): Parameters<typeof getAIMove>[2] {
  return {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    blunders: 0,
    mistakes: 0,
    inaccuracies: 0,
    goodMoves: 0,
    excellentMoves: 0,
    brilliantMoves: 0,
    averageAccuracy: 0,
    currentStreak: 0,
    skillRating: 1200,
    tacticsScore: 0,
    positionScore: 0,
    endgameScore: 0,
    totalCentipawnLoss: 0,
    totalMovesAnalyzed: 0,
  }
}