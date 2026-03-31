// Stockfish 17 WASM Worker Interface
export type StockfishMessage = {
  type: "bestmove" | "info" | "ready" | "error"
  data: string
  depth?: number
  score?: number
  pv?: string[]
  bestMove?: string
  ponder?: string
}

export class StockfishEngine {
  private worker: Worker | null = null
  private isReady = false
  private messageQueue: ((msg: StockfishMessage) => void)[] = []
  private currentResolve: ((msg: StockfishMessage) => void) | null = null

  async init(): Promise<void> {
    if (this.worker) return

    return new Promise((resolve, reject) => {
      try {
        // Use Stockfish 17 WASM from CDN
        this.worker = new Worker("/stockfish/stockfish-17.js")

        this.worker.onmessage = (e: MessageEvent) => {
          const line = e.data as string
          this.handleMessage(line)
        }

        this.worker.onerror = (e) => {
          console.warn("Stockfish worker error:", e)
          reject(e)
        }

        // Initialize UCI
        this.worker.postMessage("uci")

        const checkReady = (msg: StockfishMessage) => {
          if (msg.type === "ready") {
            this.isReady = true
            resolve()
          }
        }
        this.messageQueue.push(checkReady)

        // Set timeout for initialization
        setTimeout(() => {
          if (!this.isReady) {
            // Fallback if stockfish doesn't respond
            this.isReady = true
            resolve()
          }
        }, 3000)
      } catch (e) {
        reject(e)
      }
    })
  }

  private handleMessage(line: string) {
    const msg = this.parseLine(line)

    if (this.currentResolve && (msg.type === "bestmove" || msg.type === "error")) {
      this.currentResolve(msg)
      this.currentResolve = null
    }

    for (const callback of this.messageQueue) {
      callback(msg)
    }
  }

  private parseLine(line: string): StockfishMessage {
    if (line.startsWith("bestmove")) {
      const parts = line.split(" ")
      return {
        type: "bestmove",
        data: line,
        bestMove: parts[1],
        ponder: parts[3],
      }
    }

    if (line.startsWith("info")) {
      const depthMatch = line.match(/depth (\d+)/)
      const scoreMatch = line.match(/score cp (-?\d+)/)
      const mateMatch = line.match(/score mate (-?\d+)/)
      const pvMatch = line.match(/pv (.+)/)

      return {
        type: "info",
        data: line,
        depth: depthMatch ? Number.parseInt(depthMatch[1]) : undefined,
        score: scoreMatch
          ? Number.parseInt(scoreMatch[1])
          : mateMatch
            ? Number.parseInt(mateMatch[1]) > 0
              ? 10000
              : -10000
            : undefined,
        pv: pvMatch ? pvMatch[1].split(" ") : undefined,
      }
    }

    if (line === "uciok" || line === "readyok") {
      return { type: "ready", data: line }
    }

    return { type: "info", data: line }
  }

  async setPosition(fen: string): Promise<void> {
    if (!this.worker) await this.init()
    this.worker?.postMessage(`position fen ${fen}`)
  }

  async getBestMove(fen: string, depth = 15, skillLevel = 20): Promise<StockfishMessage> {
    if (!this.worker) await this.init()

    return new Promise((resolve) => {
      // Set skill level (0-20 for Stockfish 17)
      this.worker?.postMessage(`setoption name Skill Level value ${skillLevel}`)
      this.worker?.postMessage(`position fen ${fen}`)
      this.worker?.postMessage(`go depth ${depth}`)

      this.currentResolve = resolve

      // Timeout fallback
      setTimeout(() => {
        if (this.currentResolve === resolve) {
          resolve({ type: "error", data: "timeout" })
          this.currentResolve = null
        }
      }, 10000)
    })
  }

  async evaluatePosition(fen: string, depth = 12): Promise<number> {
    if (!this.worker) await this.init()

    return new Promise((resolve) => {
      let lastScore = 0

      const handler = (msg: StockfishMessage) => {
        if (msg.type === "info" && msg.score !== undefined) {
          lastScore = msg.score
        }
        if (msg.type === "bestmove") {
          const idx = this.messageQueue.indexOf(handler)
          if (idx > -1) this.messageQueue.splice(idx, 1)
          resolve(lastScore)
        }
      }

      this.messageQueue.push(handler)
      this.worker?.postMessage(`position fen ${fen}`)
      this.worker?.postMessage(`go depth ${depth}`)

      setTimeout(() => {
        const idx = this.messageQueue.indexOf(handler)
        if (idx > -1) {
          this.messageQueue.splice(idx, 1)
          resolve(lastScore)
        }
      }, 5000)
    })
  }

  terminate() {
    this.worker?.terminate()
    this.worker = null
    this.isReady = false
  }
}

// Singleton instance
let stockfishInstance: StockfishEngine | null = null

export function getStockfish(): StockfishEngine {
  if (!stockfishInstance) {
    stockfishInstance = new StockfishEngine()
  }
  return stockfishInstance
}
