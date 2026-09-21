import assert from "node:assert/strict"
import { test } from "node:test"

import { createInitialState, makeMove, type GameState, type Piece } from "../../lib/chess-engine.ts"
import { buildCoachPrompt, describeMotifs, sanFor } from "../../lib/coach-prompt.ts"
import { detectMotifDetails } from "../../lib/tactics.ts"
import type { MoveEvaluation } from "../../lib/adaptive-ai.ts"

function fenToState(fen: string): GameState {
  const [placement, turn, castling, enPassant, halfMoves, fullMoves] = fen.split(" ")
  const board: Piece[][] = []
  for (const rank of placement.split("/")) {
    const row: Piece[] = []
    for (const ch of rank) {
      if (ch >= "1" && ch <= "8") {
        for (let i = 0; i < Number.parseInt(ch); i++) row.push(null)
      } else {
        const color = ch === ch.toUpperCase() ? "w" : "b"
        const type = ch.toLowerCase() as "p" | "n" | "b" | "r" | "q" | "k"
        row.push({ type, color })
      }
    }
    board.push(row)
  }
  return {
    board,
    turn: turn === "w" ? "w" : "b",
    castling: {
      w: { k: castling.includes("K"), q: castling.includes("Q") },
      b: { k: castling.includes("k"), q: castling.includes("q") },
    },
    enPassant: enPassant === "-" ? null : enPassant,
    halfMoves: Number.parseInt(halfMoves),
    fullMoves: Number.parseInt(fullMoves),
    history: [],
    isCheck: false,
    isCheckmate: false,
    isStalemate: false,
    isDraw: false,
  }
}

function stateAfter(moves: [string, string][]): GameState {
  let s = createInitialState()
  for (const [from, to] of moves) {
    const next = makeMove(s, from, to)
    assert.ok(next, `illegal move ${from}-${to}`)
    s = next
  }
  return s
}
const start = createInitialState()

const evalOf: MoveEvaluation = {
  from: "e2",
  to: "e4",
  bestMove: undefined,
  type: "good",
  centipawnLoss: 21,
  score: 10,
}

function buildInput(overrides: Partial<Parameters<typeof buildCoachPrompt>[0]> = {}) {
  return {
    stateBefore: start,
    stateAfter: stateAfter([["e2", "e4"], ["e7", "e5"]]),
    evaluation: evalOf,
    moveHistory: [],
    skillRating: 1200,
    patternFacts: "",
    motifDetails: [] as ReturnType<typeof detectMotifDetails>,
    playerSan: "e4",
    bestSan: "N/A",
    ...overrides,
  }
}

test("prompt always carries every verified-fact bullet", () => {
  const prompt = buildCoachPrompt(buildInput())
  assert.match(prompt, /VERIFIED FACTS \(all correct; never contradict or go beyond them\):/)
  assert.match(prompt, /- Player played: e4 \(from e2 to e4\)/)
  assert.match(prompt, /- Move grade: good; centipawn loss: 21 cp/)
  assert.match(prompt, /- Position before player move \(FEN\): rnbqkbnr/)
  assert.match(prompt, /- Position after player move \(FEN\):/)
  assert.match(prompt, /- Better move was: N\/A/)
  assert.match(prompt, /- Verified tactical motifs in this move: none/)
  assert.match(prompt, /- Player ELO rating: ~1200/)
  assert.match(prompt, /- Pattern snapshot this session: too few moves yet to judge patterns/)
})

test("motif facts quote victim subjects verbatim", () => {
  // Bg5 pins the knight on f6 (real position): the prompt must quote the
  // victim-bound motif exactly as describeMotifs emitted it.
  const stateBefore = fenToState("rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4")
  const stateAfter_ = fenToState("rnbqkb1r/ppp2ppp/4pn2/3p2B1/2PP4/2N5/PP2PPPP/R2QKBNR b KQkq - 3 4")
  const details = detectMotifDetails(stateBefore, stateAfter_, "c1", "g5")
  const facts = describeMotifs(details)
  assert.ok(facts.includes("pin"), `expected a pin, got '${facts}'`)
  const prompt = buildCoachPrompt(
    buildInput({ motifDetails: details, stateBefore, stateAfter: stateAfter_ })
  )
  assert.ok(prompt.includes(facts), `prompt must quote '${facts}'`)
  assert.match(prompt, /- Verified tactical motifs in this move: pin \(knight on f6\)/)
})

test("pattern facts are quoted only when provided", () => {
  const withFacts = buildCoachPrompt(buildInput({ patternFacts: "You've blundered mostly with the bishop (3 of 4 bishop moves)." }))
  assert.match(withFacts, /- Pattern snapshot this session \(ground truth from measured moves\): You've blundered mostly with the bishop \(3 of 4 bishop moves\)\./)
  assert.ok(!withFacts.includes("too few moves yet"))

  const silent = buildCoachPrompt(buildInput({ patternFacts: "" }))
  assert.match(silent, /too few moves yet to judge patterns/)
})

test("final response payload schema blocks fabricated fields", () => {
  // The prompt's return schema mentions exactly the four allowed fields.
  const prompt = buildCoachPrompt(buildInput())
  assert.match(prompt, /"analysis":/)
  assert.match(prompt, /"move_quality":/)
  assert.match(prompt, /"accuracy_score":/)
  assert.match(prompt, /"blunder_risk":/)
  const schemaLines = prompt.split("WRITING RULES:")[1] ?? prompt
  assert.ok(schemaLines.includes('"analysis"'))
})

test("sanFor renders algebraic notation consistent with the player move", () => {
  const before = stateAfter([])
  const after = makeMove(before, "e2", "e4")!
  const san = sanFor(before, after, "e2", "e4")
  assert.equal(san, "e4")
})