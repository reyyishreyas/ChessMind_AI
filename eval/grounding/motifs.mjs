import { detectMotifs } from "../../lib/tactics.ts"
import { diffMove, fenToState } from "./fen.mjs"

if (process.argv.includes("--help")) {
  console.log("motifs.mjs — motif oracle for the grounding suite.")
  console.log("Reads JSONL lines {fenBefore, fenAfter} on stdin, writes")
  console.log("JSONL {move:{from,to}, motifs:[...]} per line. Uses the SAME")
  console.log("lib/tactics.ts the app runs, so eval and production agree.")
  process.exit(0)
}

import fs from "node:fs"
const read = fs.readFileSync(0, "utf8")
for (const line of read.split("\n")) {
  if (!line.trim()) continue
  const { fenBefore, fenAfter } = JSON.parse(line)
  const move = diffMove(fenBefore, fenAfter)
  if (!move) {
    process.stdout.write(JSON.stringify({ move: null, motifs: [] }) + "\n")
    continue
  }
  const before = fenToState(fenBefore)
  const after = fenToState(fenAfter)
  const motifs = detectMotifs(before, after, move.from, move.to)
  process.stdout.write(JSON.stringify({ move, motifs }) + "\n")
}