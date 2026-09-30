import assert from "node:assert/strict"
import { test } from "node:test"

import { type GameState, type Piece, type Square } from "../../lib/chess-engine.ts"
import { buildCandidates, buildSuggesterPrompt, validateSuggestion } from "../../lib/coach-suggest.ts"
import { evaluatePlayerMove } from "../../lib/adaptive-ai.ts"
import { canonicalCoachMove } from "../../lib/coach-hints.ts"

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

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
const ITALIAN = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3"

test("candidates are only tied-for-best moves (0 cp, grade good)", () => {
  for (const fen of [START, ITALIAN]) {
    const candidates = buildCandidates(fenToState(fen), 5)
    assert.ok(candidates.length >= 1, "expected at least one tied-best candidate")
    for (const c of candidates) {
      assert.equal(c.cpLoss, 0)
      assert.equal(c.grade, "good")
    }
  }
})

test("playing any suggested candidate is graded good by the player's grader", () => {
  // The user-facing contract: following a coach suggestion must never come
  // back as inaccuracy/mistake/blunder in the move verdict.
  const state = fenToState(ITALIAN)
  for (const c of buildCandidates(state, 5)) {
    const verdict = evaluatePlayerMove(state, c.from as Square, c.to as Square)
    assert.equal(verdict.type, "good")
    assert.equal(verdict.centipawnLoss, 0)
  }
})

test("the suggester prompt never offers a candidate with nonzero cp loss", () => {
  const state = fenToState(ITALIAN)
  const candidates = buildCandidates(state, 5)
  const prompt = buildSuggesterPrompt({
    state,
    candidates,
    skillRating: 1000,
    playerColor: "b",
    priorFeedback: null,
  })
  assert.match(prompt, /tied for the best move/)
  const candidateLines = prompt.split("\n").filter((l) => /^\d+\. \S+ \(from /.test(l))
  assert.ok(candidateLines.length >= 1)
  for (const line of candidateLines) {
    assert.match(line, /— 0 cp/)
  }
})

test("a model move outside the candidates falls back to the engine-best candidate", () => {
  const state = fenToState(START)
  const candidates = buildCandidates(state, 5)
  const chosen = validateSuggestion(state, candidates, { from: "z9", to: "z9", reason: "because" }, "test-model")
  assert.equal(chosen.from, candidates[0].from)
  assert.equal(chosen.to, candidates[0].to)
  assert.equal(chosen.cpLoss, 0)
  assert.equal(chosen.grade, "good")
})

test("a model move that is not the first candidate is not kept (one move everywhere)", () => {
  // The move is bound to candidate 1 (the canonical move) so the hint chip,
  // board arrow, fork chip and feedback facts can never show different moves.
  const state = fenToState(START)
  const candidates = buildCandidates(state, 5)
  const target = candidates[candidates.length - 1]
  const chosen = validateSuggestion(
    state,
    candidates,
    { from: target.from, to: target.to, reason: "Control the center with a developed pawn." },
    "test-model",
  )
  assert.equal(chosen.from, candidates[0].from)
  assert.equal(chosen.to, candidates[0].to)
})

test("the model's reason is kept when it echoes the first candidate", () => {
  const state = fenToState(START)
  const candidates = buildCandidates(state, 5)
  const chosen = validateSuggestion(
    state,
    candidates,
    { from: candidates[0].from, to: candidates[0].to, reason: "It grabs the center with tempo." },
    "test-model",
  )
  assert.equal(chosen.explanation, "It grabs the center with tempo.")
})

test("the first candidate is the coach's canonical move (tactic first)", () => {
  // Position where Nf3 is a sound queen+rook fork: the tactic must be the
  // recommended move, not a quiet move ranked above it.
  const state = fenToState("7k/8/8/4q3/3r4/8/8/K5N1 w - - 0 1")
  const candidates = buildCandidates(state, 5)
  const canonical = canonicalCoachMove(state)
  assert.ok(canonical)
  assert.equal(candidates[0].from, canonical!.from)
  assert.equal(candidates[0].to, canonical!.to)
  assert.equal(candidates[0].san, "Nf3")
})
