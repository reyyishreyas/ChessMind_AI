import assert from "node:assert/strict"
import { test } from "node:test"

import { type GameState, type Piece } from "../../lib/chess-engine.ts"
import { detectMotifs } from "../../lib/tactics.ts"

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

function assertBoardEqual(moveSeq: string[], beforeFen: string, afterFen: string, expected: string[]): void {
  const moveSquares = moveSeq.map((m) => m.split("-") as [string, string])
  const before = fenToState(beforeFen)
  const after = fenToState(afterFen)
  const [from, to] = moveSquares[moveSquares.length - 1]
  const got = detectMotifs(before, after, from, to).sort()
  assert.deepEqual(got, [...expected].sort(), `motifs for ${moveSeq.join(" ")}`)
}

test("quiet developing move: no tactics", () => {
  assertBoardEqual(
    ["g1-f3"],
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
    [],
  )
})

test("Ruy Lopez concept pin (after ...d6 clears the diagonal)", () => {
  assertBoardEqual(
    ["f1-b5"],
    "r1bqkbnr/ppp2ppp/2np4/4p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 3",
    "r1bqkbnr/ppp2ppp/2np4/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
    ["pin"],
  )
})

test("skewer: rook slips onto the rank through king to queen", () => {
  assertBoardEqual(
    ["a2-a1"],
    "8/8/8/8/8/8/1R6/4kq2K w - - 0 1",
    "8/8/8/8/8/8/8/R3kq2K w - - 0 1",
    ["check", "skewer"],
  )
})

test("knight fork on king and rook", () => {
  assertBoardEqual(
    ["e2-e4"],
    "8/8/8/6k1/8/8/4Nr2/4K3 w - - 0 1",
    "8/8/8/6k1/4N3/8/5r2/4K3 w - - 0 1",
    ["check", "fork"],
  )
})

test("discovered attack: knight leaves the rook's file, revealing the queen", () => {
  assertBoardEqual(
    ["d2-e4"],
    "3q4/8/8/8/8/8/3N4/3RK3 w - - 0 1",
    "3q4/8/8/8/4N3/8/8/3RK3 w - - 0 1",
    ["discovered"],
  )
})

test("capture", () => {
  assertBoardEqual(
    ["e4-d5"],
    "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    "rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2",
    ["capture"],
  )
})

test("queen takes f7: capture + check + queen fork", () => {
  assertBoardEqual(
    ["h5-f7"],
    "rnbqkbnr/pppppppp/8/7Q/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "rnbqkbnr/pppppQpp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
    ["capture", "check", "fork"],
  )
})

test("board converts from FEN with black pieces", () => {
  const state = fenToState("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 3")
  assert.equal(state.board[0][0]!.type, "r")
  assert.equal(state.board[0][0]!.color, "b")
  assert.equal(state.board[2][2]!.type, "n")
  assert.equal(state.board[2][2]!.color, "b")
})