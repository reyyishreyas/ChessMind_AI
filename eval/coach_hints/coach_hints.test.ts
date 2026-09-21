import assert from "node:assert/strict"
import { test } from "node:test"

import { type GameState, type Piece } from "../../lib/chess-engine.ts"
import {
  buildCoachHints,
  buildSuggestion,
  pickForkMove,
  shouldShowHints,
} from "../../lib/coach-hints.ts"
import { findThreats, pickTopThreat, describeThreatsAfterMove } from "../../lib/coach-explain.ts"
import { detectOpening } from "../../lib/opening.ts"

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

test("threat: enemy bishop attacks the player's queen", () => {
  const state = fenToState("6b1/4k3/4b3/8/8/1Q6/8/4K3 w - - 0 1")
  const top = pickTopThreat(findThreats(state, "w"))
  assert.ok(top, "expected a threat")
  assert.equal(top!.attackedType, "q")
  assert.equal(top!.attacked, "b3")
  assert.equal(top!.attackerType, "b")
  assert.equal(top!.defended, false)
  assert.match(top!.explanation, /attacking your queen on b3/)
  assert.match(top!.explanation, /not defended/)
})

test("no threat when the only capturer is pinned", () => {
  const state = fenToState("k7/8/8/8/1b6/8/8/1R3RKQ w - - 0 1")
  assert.equal(pickTopThreat(findThreats(state, "w")), null)
})

test("no threat hints when it is the opponent's turn", () => {
  const state = fenToState("6b1/4k3/4b3/8/8/1Q6/8/4K3 b - - 0 1")
  assert.deepEqual(findThreats(state, "w"), [])
})

test("king captures are never reported as threats", () => {
  const state = fenToState("4r3/8/8/8/8/8/8/4K3 w - - 0 1")
  assert.deepEqual(findThreats(state, "w"), [])
})

test("after-move threats use the opponent's turn (recapture is reported)", () => {
  const state = fenToState("rnbqkbnr/ppp2ppp/3p4/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 3")
  const fact = describeThreatsAfterMove(state, "w")
  assert.match(fact, /pawn on d6 can capture your knight on e5/)
  assert.match(fact, /undefended/)
})

test("after-move threats read 'none' when the opponent cannot capture", () => {
  const state = fenToState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1")
  assert.match(describeThreatsAfterMove(state, "b"), /^none/)
})

test("fork: a knight move that forks queen and rook is detected", () => {
  const state = fenToState("7k/8/8/4q3/3r4/8/8/K5N1 w - - 0 1")
  const fork = pickForkMove(state, "w")
  assert.ok(fork, "expected a fork hint")
  assert.equal(fork!.pieceType, "n")
  assert.equal(fork!.from, "g1")
  assert.equal(fork!.to, "f3")
  assert.equal(fork!.san, "Nf3")
  assert.ok(fork!.targets.length >= 2)
  assert.ok(fork!.gain >= 500)
  assert.match(fork!.explanation, /forks/)
  assert.match(fork!.explanation, /queen and rook/)
})

test("no fork when captures are not legal", () => {
  const state = fenToState("4r1k1/8/8/4N3/8/8/8/7K w - - 0 1")
  assert.equal(pickForkMove(state, "w"), null)
})

test("opening detection picks the longest matching line", () => {
  assert.deepEqual(detectOpening(["e4", "e5", "Nf3", "Nc6", "Bc4"]), {
    name: "Italian Game",
    tip: "Develop your knight and bishop toward the center, then castle early.",
  })
  assert.equal(detectOpening(["e4", "c5"])?.name, "Sicilian Defense")
  assert.equal(detectOpening([]), null)
})

test("gate: low elo helps when slow or early; declining always helps", () => {
  assert.equal(shouldShowHints({ skillRating: 900, gameStartElo: 900, slowTurn: false, moveCount: 3 }), true)
  assert.equal(shouldShowHints({ skillRating: 900, gameStartElo: 900, slowTurn: true, moveCount: 30 }), true)
  assert.equal(shouldShowHints({ skillRating: 1500, gameStartElo: 1500, slowTurn: true, moveCount: 20 }), false)
  assert.equal(shouldShowHints({ skillRating: 1300, gameStartElo: 1600, slowTurn: false, moveCount: 20 }), true)
})

test("buildCoachHints composes opening, threat and fork", () => {
  const state = fenToState("7k/8/8/4q3/3r4/8/8/K5N1 w - - 0 1")
  const hints = buildCoachHints(state, "w", ["e4", "e5", "Nf3", "Nc6"])
  assert.equal(hints.fork?.pieceType, "n")
  assert.equal(hints.threat, null)
})

test("opening hint is dropped once the game leaves the opening phase", () => {
  const state = fenToState("r3r1k1/2N5/8/8/8/8/8/7K w - - 0 1")
  const long = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "d3", "d6", "c3", "Nf6", "O-O", "O-O", "Re1", "a6"]
  assert.equal(buildCoachHints(state, "w", long).opening, null)
  assert.equal(buildCoachHints(state, "w", ["e4", "e5"]).opening, "Open Game")
})

test("suggestion SAN is generated from the best move", () => {
  const state = fenToState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
  assert.equal(buildSuggestion(state, "g1", "f3").san, "Nf3")
  assert.equal(buildSuggestion(state, "e2", "e4").san, "e4")
})