import { Maia3 } from "maia3-js/web"
import { gameStateToFEN, createInitialState, makeMove, type GameState, type Square } from "@/lib/chess-engine"
import type { BotContext, BotMove, BotProvider } from "./types"

const MAIA_MODEL_URL = "/maia3/maia3_5m.onnx"
const ORT_WASM_PATHS = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/"
const MAIA_MIN_ELO = 1100
const MAIA_MAX_ELO = 2000
const MAIA_HISTORY_LEN = 7

let maiaInstance: Maia3 | null = null
let loadPromise: Promise<Maia3> | null = null

async function getMaia(): Promise<Maia3 | null> {
  if (typeof window === "undefined") return null
  if (maiaInstance && maiaInstance.isLoaded()) return maiaInstance
  if (!loadPromise) {
    loadPromise = (async () => {
      const maia = new Maia3({ variant: "5m", url: MAIA_MODEL_URL, wasmPaths: ORT_WASM_PATHS })
      await maia.load()
      maiaInstance = maia
      return maia
    })()
    loadPromise.catch(() => {
      loadPromise = null
    })
  }
  return loadPromise
}

function clampElo(elo: number): number {
  return Math.max(MAIA_MIN_ELO, Math.min(MAIA_MAX_ELO, Math.round(elo)))
}

function uciToMove(uci: string): { from: Square; to: Square } {
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square }
}

function priorFens(state: GameState): string[] {
  const moves = state.history
  if (!moves || moves.length === 0) return []

  const fens: string[] = []
  let position = createInitialState()
  for (const move of moves.slice(-(MAIA_HISTORY_LEN + 1), -1)) {
    const next = makeMove(position, move.from, move.to)
    if (!next) break
    position = next
    fens.push(gameStateToFEN(position))
  }
  return fens
}

export function createMaiaProvider(): BotProvider {
  return {
    id: "maia",
    async isReady(): Promise<boolean> {
      const maia = await getMaia()
      return maia !== null && maia.isLoaded()
    },
    async getMove(ctx: BotContext): Promise<BotMove> {
      const maia = await getMaia()
      if (!maia) return null

      const selfElo = clampElo(ctx.targetElo)
      const result = await maia.predict({
        fen: gameStateToFEN(ctx.gameState),
        priorFens: priorFens(ctx.gameState),
        selfElo,
        oppoElo: ctx.opponentStats?.skillRating ? clampElo(ctx.opponentStats.skillRating) : selfElo,
      })

      if (!result.bestMove || result.bestMove === "(none)") return null
      return uciToMove(result.bestMove)
    },
  }
}