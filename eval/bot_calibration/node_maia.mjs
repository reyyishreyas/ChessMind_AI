// Headless Maia3 bot used by the python calibration harness.
// Speaks line-delimited JSON over stdio:
//   -> {"fen": "...", "moves": ["e2e4", ...], "selfElo": 1500, "oppoElo": 1500}
//   <- {"move": "e7e5"}
// Prints "READY" once the model is loaded.
import { Maia3 } from "maia3-js"

const readline = await import("node:readline")
const selfEloArg = Number(process.argv[2])
const selfElo = Number.isFinite(selfEloArg) ? Math.round(selfEloArg) : 1500

const maia = new Maia3({ variant: "5m", temperature: 0 })

async function main() {
  await maia.load()
  console.log("READY")
  console.error(`[node_maia] loaded 5m @ selfElo=${selfElo}`)

  const rl = readline.createInterface({ input: process.stdin })
  for await (const line of rl) {
    if (!line.trim()) continue
    let req
    try {
      req = JSON.parse(line)
    } catch {
      console.error(`[node_maia] bad line: ${line}`)
      continue
    }

    try {
      const result = await maia.predict({
        fen: req.fen,
        priorMoves: req.moves ?? [],
        selfElo: req.selfElo ?? selfElo,
        oppoElo: req.oppoElo ?? req.selfElo ?? selfElo,
      })
      console.log(JSON.stringify({ move: result.bestMove && result.bestMove !== "(none)" ? result.bestMove : null }))
    } catch (err) {
      console.error(`[node_maia] predict error: ${err.message}`)
      console.log(JSON.stringify({ move: null }))
    }
  }
}

main().catch((err) => {
  console.error(`[node_maia] fatal: ${err.stack ?? err}`)
  process.exit(1)
})