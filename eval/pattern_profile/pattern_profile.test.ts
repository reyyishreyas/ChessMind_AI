import assert from "node:assert/strict"
import { test } from "node:test"

import { createInitialState, makeMove, type GameState, type Square } from "../../lib/chess-engine.ts"
import {
  buildPatternProfile,
  describePattern,
  patternFindings,
  replayPatternEvents,
  type MoveGrade,
  type PatternMoveEvent,
} from "../../lib/pattern-profile.ts"
import type { MoveEvaluation } from "../../lib/adaptive-ai.ts"

function evalOf(grade: MoveGrade, centipawnLoss = 0): MoveEvaluation {
  return {
    from: "a1" as Square,
    to: "a2" as Square,
    type: grade,
    centipawnLoss,
    score: 0,
  }
}

function evt(
  moveNo: number,
  grade: MoveGrade,
  timeMs: number,
  squareFrom: string,
  squareTo: string,
  piece: PatternMoveEvent["piece"],
  centipawnLoss = 0,
  isCapture = false,
): PatternMoveEvent {
  return {
    moveNo,
    squareFrom: squareFrom as PatternMoveEvent["squareFrom"],
    squareTo: squareTo as PatternMoveEvent["squareTo"],
    piece,
    grade,
    centipawnLoss,
    timeMs,
    isCapture,
    isCheck: false,
  }
}

const GOOD = (moveNo: number, timeMs: number, piece: PatternMoveEvent["piece"] = "p") =>
  evt(moveNo, "good", timeMs, "e2", "e4", piece, 20)
const BLUNDER = (moveNo: number, timeMs: number, piece: PatternMoveEvent["piece"] = "p") =>
  evt(moveNo, "blunder", timeMs, "e5", "e4", piece, 400)

test("profile reports phase-wise stats", () => {
  const events = [
    evt(2, "good", 1000, "e2", "e4", "p", 20),
    evt(4, "brilliant", 800, "g1", "f3", "n", -60),
    evt(6, "good", 1200, "c2", "c3", "p", 25),
    evt(8, "good", 900, "f1", "b5", "b", 15),
    evt(10, "good", 1100, "b1", "c3", "n", 30),
  ]
  const p = buildPatternProfile(events)
  assert.equal(p.nMoves, 5)
  const opening = p.phases.find((ph) => ph.phase === "opening")
  assert.equal(opening?.n, 5)
  assert.ok(opening?.avgAccuracy && opening.avgAccuracy > 85)
  assert.equal(p.avgCpl, (20 - 60 + 25 + 15 + 30) / 5)
  assert.equal(p.medianTimeMs, 1000)
})

test("piece-blunder concentration is detected", () => {
  const events = [
    ...Array.from({ length: 4 }, (_, i) => GOOD(2 + i * 2, 1000, "p")),
    BLUNDER(10, 900, "b"),
    BLUNDER(12, 1100, "b"),
    BLUNDER(14, 850, "b"),
    GOOD(16, 950, "b"),
  ]
  const p = buildPatternProfile(events)
  const findings = patternFindings(p)
  const pieceFinding = findings.find((f) => f.id === "piece-blunder-b")
  assert.ok(pieceFinding, `expected piece-blunder-b, got ${findings.map((f) => f.id)}`)
  assert.equal(pieceFinding.text, "You've blundered mostly with the bishop (3 of 4 bishop moves).")
  const bishop = p.pieces.find((s) => s.piece === "b")
  assert.equal(bishop?.blunders, 3)
  assert.ok(bishop?.blunderRate === 0.75)
})

test("phase dip in the endgame is detected", () => {
  const events: PatternMoveEvent[] = []
  for (let i = 0; i < 10; i++) events.push(GOOD(2 + i * 2, 1000, "p"))
  for (let i = 0; i < 4; i++) events.push(BLUNDER(40 + i * 2, 1000, "p"))
  const p = buildPatternProfile(events)
  const finding = patternFindings(p).find((f) => f.id === "phase-dip-endgame")
  assert.ok(finding)
  assert.equal(finding.text, "Accuracy drops to 15 in the endgame (65 overall).")
})

test("time-pressure tilt is detected from move times", () => {
  const events = [
    BLUNDER(2, 1000, "p"),
    BLUNDER(4, 1100, "p"),
    BLUNDER(6, 900, "p"),
    GOOD(8, 1200, "p"),
    GOOD(10, 32000, "n"),
    GOOD(12, 40000, "b"),
    GOOD(14, 45000, "r"),
    GOOD(16, 38000, "q"),
  ]
  const p = buildPatternProfile(events)
  assert.equal(p.medianTimeMs, 16600)
  assert.ok(p.fastBlunderRate === 0.75)
  assert.ok(p.slowBlunderRate === 0)
  const finding = patternFindings(p).find((f) => f.id === "time-pressure")
  assert.ok(finding)
  assert.equal(finding.text, "You blunder more on quicker moves (75% vs 0% on slower ones).")
})

test("steady play and inconsistent play are recognized", () => {
  const steady = Array.from({ length: 6 }, (_, i) => GOOD(2 + i * 2, 1000, (["p", "n", "b", "r", "q", "p"] as const)[i]))
  const steadyProfile = buildPatternProfile(steady)
  assert.ok(patternFindings(steadyProfile).some((f) => f.id === "steady"))
  assert.ok(!patternFindings(steadyProfile).some((f) => f.id === "inconsistent"))

  const swingy = steady.map((e, i) =>
    i % 2 === 0 ? evt(e.moveNo, "good", 1000, "e2", "e4", e.piece, 0) : evt(e.moveNo, "blunder", 1000, "e2", "e4", e.piece, 400)
  )
  const swingyProfile = buildPatternProfile(swingy)
  assert.ok(patternFindings(swingyProfile).some((f) => f.id === "inconsistent"))
  assert.ok(!patternFindings(swingyProfile).some((f) => f.id === "steady"))
})

test("capture sharpness is reported", () => {
  const events = [
    evt(2, "good", 1000, "e4", "d5", "p", 10, true),
    evt(4, "good", 1000, "f3", "e5", "n", 15, true),
    evt(6, "good", 1000, "b5", "a6", "b", 12, true),
    GOOD(8, 1000, "p"),
  ]
  const p = buildPatternProfile(events)
  assert.equal(p.captureMoves, 3)
  assert.equal(p.captureBlunderRate, 0)
  assert.ok(patternFindings(p).some((f) => f.id === "capture-sharp"))
})

test("honest silence on tiny sessions", () => {
  const fresh = [GOOD(2, 1000, "p"), GOOD(4, 1000, "n"), GOOD(6, 1000, "b")]
  const p = buildPatternProfile(fresh)
  assert.equal(patternFindings(p).length, 0)
  assert.equal(describePattern(p), "")
})

function playHistory(moves: [string, string][]): GameState[] {
  const history: GameState[] = [createInitialState()]
  let state = history[0]
  for (const [from, to] of moves) {
    const next = makeMove(state, from, to)
    assert.ok(next, `illegal move ${from}-${to}`)
    state = next
    history.push(state)
  }
  return history
}

test("replay extracts player moves with piece and capture flags", () => {
  // 1. e4 d5 2. exd5 — white captures the d5 pawn
  const history = playHistory([
    ["e2", "e4"],
    ["d7", "d5"],
    ["e4", "d5"],
  ])
  const events = replayPatternEvents(history, [evalOf("good", 20), evalOf("excellent", 5)], [3.1, 2.2], "w")
  assert.equal(events.length, 2)
  assert.deepEqual(events[0].squareFrom, "e2")
  assert.deepEqual(events[0].squareTo, "e4")
  assert.equal(events[0].piece, "p")
  assert.equal(events[0].isCapture, false)
  assert.equal(events[0].isCheck, false)
  assert.equal(events[1].piece, "p")
  assert.equal(events[1].isCapture, true)
  assert.equal(events[1].isCheck, false)
  assert.equal(events[1].timeMs, 2200)
  assert.equal(events[1].moveNo, 2)
  assert.equal(events[0].grade, "good")
})

test("replay marks a deliverable check on a capture", () => {
  // 1. e4 e5 2. Qh5 Nc6 3. Qxe5+ — check on the king
  const history = playHistory([
    ["e2", "e4"],
    ["e7", "e5"],
    ["d1", "h5"],
    ["b8", "c6"],
    ["h5", "e5"],
  ])
  const events = replayPatternEvents(history, [evalOf("good"), evalOf("good"), evalOf("brilliant", -40)], [2, 2, 3], "w")
  assert.equal(events.length, 3)
  assert.equal(events[2].piece, "q")
  assert.equal(events[2].isCapture, true)
  assert.equal(events[2].isCheck, true)
})

test("replay ignores bot moves and aligns to player evaluations", () => {
  // 1. e4 c5 2. Nf3 d6 — white plays twice, black in between
  const history = playHistory([
    ["e2", "e4"],
    ["c7", "c5"],
    ["g1", "f3"],
    ["d7", "d6"],
  ])
  const events = replayPatternEvents(history, [evalOf("good"), evalOf("inaccuracy", 90)], [5, 4], "w")
  assert.equal(events.length, 2)
  assert.equal(events[0].piece, "p")
  assert.equal(events[0].squareTo, "e4")
  assert.equal(events[1].piece, "n")
  assert.equal(events[1].squareFrom, "g1")
  assert.equal(events[1].isCapture, false)
})