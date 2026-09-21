import { type GameState, type PieceColor, type PieceType, type Square, getPieceAt, isKingInCheck } from "./chess-engine.ts"
import type { MoveEvaluation } from "./adaptive-ai"

/**
 * Pattern profiling for the coach (Step 5).
 *
 * Reduces a player's moves this session into *derive-able* facts — phase
 * accuracy, piece-level blunder concentration, time-pressure tilt, capture
 * sharpness, and consistency. Everything here is a pure function of the move
 * events; nothing is guessed, so the facts it emits are always true (the
 * grounding philosophy: the model must only state facts it was given).
 *
 * Honesty guard: findings only fire with enough support (n >= 3 for the
 * relevant slice). A 2-move session produces no findings — silence beats
 * fabrication.
 */

export type MoveGrade = "brilliant" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder"

export type PhaseId = "opening" | "middlegame" | "endgame"

export type PatternMoveEvent = {
  moveNo: number
  squareFrom: Square
  squareTo: Square
  piece: PieceType | null
  grade: MoveGrade
  centipawnLoss: number
  timeMs: number | null
  isCapture: boolean
  isCheck: boolean
}

export type PhaseStat = {
  phase: PhaseId
  n: number
  avgAccuracy: number | null
  avgCpl: number | null
  blunderRate: number | null
}

export type PieceStat = {
  piece: PieceType
  n: number
  blunders: number
  blunderRate: number | null
}

export type PatternProfile = {
  nMoves: number
  medianTimeMs: number | null
  avgAccuracy: number
  avgCpl: number
  consistencyCpl: number | null
  captureMoves: number
  captureBlunderRate: number | null
  phases: PhaseStat[]
  pieces: PieceStat[]
  fastBlunderRate: number | null
  slowBlunderRate: number | null
}

export type PatternFinding = {
  id: string
  text: string
  support: number
}

const GRADE_ACCURACY: Record<MoveGrade, number> = {
  brilliant: 100,
  excellent: 95,
  good: 85,
  inaccuracy: 65,
  mistake: 40,
  blunder: 15,
}

const PIECE_NAMES: Record<PieceType, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
}

function phaseOf(moveNo: number): PhaseId {
  if (moveNo <= 12) return "opening"
  if (moveNo <= 35) return "middlegame"
  return "endgame"
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function stdDev(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / n
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n
  return Math.sqrt(variance)
}

function blunderRate(events: PatternMoveEvent[]): number | null {
  if (events.length === 0) return null
  return events.filter((e) => e.grade === "blunder").length / events.length
}

export function buildPatternProfile(events: PatternMoveEvent[]): PatternProfile {
  const nMoves = events.length
  const cpls = events.map((e) => e.centipawnLoss)
  const accuracies = events.map((e) => GRADE_ACCURACY[e.grade])
  const times = events.filter((e) => e.timeMs !== null).map((e) => e.timeMs as number)

  const byPhase = new Map<PhaseId, PatternMoveEvent[]>()
  for (const e of events) {
    const phase = phaseOf(e.moveNo)
    byPhase.set(phase, [...(byPhase.get(phase) ?? []), e])
  }
  const phases: PhaseStat[] = (["opening", "middlegame", "endgame"] as const).map((phase) => {
    const group = byPhase.get(phase) ?? []
    const groupCpls = group.map((e) => e.centipawnLoss)
    return {
      phase,
      n: group.length,
      avgAccuracy:
        group.length > 0 ? group.reduce((a, e) => a + GRADE_ACCURACY[e.grade], 0) / group.length : null,
      avgCpl: group.length > 0 ? groupCpls.reduce((a, b) => a + b, 0) / group.length : null,
      blunderRate: blunderRate(group),
    }
  })

  const byPiece = new Map<PieceType, PatternMoveEvent[]>()
  for (const e of events) {
    if (!e.piece) continue
    byPiece.set(e.piece, [...(byPiece.get(e.piece) ?? []), e])
  }
  const pieces: PieceStat[] = [...byPiece.entries()]
    .map(([piece, group]) => ({
      piece,
      n: group.length,
      blunders: group.filter((e) => e.grade === "blunder").length,
      blunderRate: blunderRate(group),
    }))
    .sort((a, b) => (b.blunderRate ?? 0) - (a.blunderRate ?? 0) || b.n - a.n)

  const captureMoves = events.filter((e) => e.isCapture).length
  const captureBlunderRate =
    captureMoves > 0 ? events.filter((e) => e.isCapture && e.grade === "blunder").length / captureMoves : null

  let fastBlunderRate: number | null = null
  let slowBlunderRate: number | null = null
  if (times.length >= 4) {
    const med = median(times)
    const fast = events.filter((e) => e.timeMs !== null && e.timeMs <= med)
    const slow = events.filter((e) => e.timeMs !== null && e.timeMs > med)
    fastBlunderRate = blunderRate(fast)
    slowBlunderRate = blunderRate(slow)
  }

  return {
    nMoves,
    medianTimeMs: times.length > 0 ? median(times) : null,
    avgAccuracy: accuracies.length > 0 ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length : 100,
    avgCpl: cpls.length > 0 ? cpls.reduce((a, b) => a + b, 0) / cpls.length : 0,
    consistencyCpl: nMoves >= 2 ? stdDev(cpls) : null,
    captureMoves,
    captureBlunderRate,
    phases,
    pieces,
    fastBlunderRate,
    slowBlunderRate,
  }
}

export function patternFindings(profile: PatternProfile): PatternFinding[] {
  const findings: PatternFinding[] = []
  if (profile.nMoves < 4) return findings

  const sessionBlunderRate = profile.nMoves > 0
    ? profile.pieces.reduce((a, s) => a + s.blunders, 0) / profile.nMoves
    : 0

  // Phase accuracy dip (at least 10 points below the session line).
  for (const phase of profile.phases) {
    if (phase.n < 3 || phase.avgAccuracy === null) continue
    if (profile.avgAccuracy - phase.avgAccuracy >= 10) {
      findings.push({
        id: `phase-dip-${phase.phase}`,
        support: phase.n,
        text: `Accuracy drops to ${Math.round(phase.avgAccuracy)} in the ${phase.phase} (${Math.round(profile.avgAccuracy)} overall).`,
      })
    }
  }

  // Piece-level blunder concentration: >=3 moves of that piece, >= 1/3 blunders,
  // and at least 1.5x the session rate.
  for (const piece of profile.pieces) {
    if (piece.n < 3 || piece.blunderRate === null) continue
    if (piece.blunderRate >= 0.33 && piece.blunderRate >= 1.5 * sessionBlunderRate) {
      findings.push({
        id: `piece-blunder-${piece.piece}`,
        support: piece.n,
        text: `You've blundered mostly with the ${PIECE_NAMES[piece.piece]} (${piece.blunders} of ${piece.n} ${PIECE_NAMES[piece.piece]} moves).`,
      })
    }
  }

  // Time pressure: quicker moves substantially worse.
  if (profile.fastBlunderRate !== null && profile.slowBlunderRate !== null) {
    const fastN = profile.nMoves
    if (
      (profile.fastBlunderRate >= 0.25 || fastN >= 6) &&
      profile.fastBlunderRate >= 1.5 * Math.max(profile.slowBlunderRate, 0.001)
    ) {
      findings.push({
        id: "time-pressure",
        support: fastN,
        text: `You blunder more on quicker moves (${Math.round(profile.fastBlunderRate * 100)}% vs ${Math.round(profile.slowBlunderRate * 100)}% on slower ones).`,
      })
    }
  }

  if (profile.consistencyCpl !== null) {
    if (profile.consistencyCpl >= 60) {
      findings.push({
        id: "inconsistent",
        support: profile.nMoves,
        text: "Your play is uneven — big evaluation swings between moves.",
      })
    } else if (profile.consistencyCpl <= 30) {
      findings.push({
        id: "steady",
        support: profile.nMoves,
        text: "You're playing a steady, level game.",
      })
    }
  }

  // Capture sharpness: several captures, few blunders in them.
  if (profile.captureMoves >= 3 && profile.captureBlunderRate !== null && profile.captureBlunderRate <= 0.1) {
    const captureBlunders = profile.captureBlunderRate * profile.captureMoves
    findings.push({
      id: "capture-sharp",
      support: profile.captureMoves,
      text: `You're handling captures well (${Math.round(captureBlunders)} blunder${captureBlunders === 1 ? "" : "s"} in ${profile.captureMoves} capture moves).`,
    })
  }

  return findings.slice(0, 3)
}

export function describePattern(profile: PatternProfile): string {
  const findings = patternFindings(profile)
  if (findings.length === 0) return ""
  return findings.map((f) => f.text).join(" ")
}

export type SkillScores = {
  tactics: number | null
  position: number | null
  endgame: number | null
}

/**
 * Derive the three player-skill scores (tactics / position / endgame) from the
 * measured moves. Like everything else here they are pure functions of the
 * events, and are null until enough evidence exists (>= 2 moves of that kind).
 * Definitions (all from grade accuracy of the relevant slice of moves):
 *  - tactics: capture and check moves (real tactical events we can observe)
 *  - position: quiet, non-tactical moves
 *  - endgame: moves after move 35
 */
export function scoresFromEvents(events: PatternMoveEvent[]): SkillScores {
  const tactical = events.filter((e) => e.isCapture || e.isCheck)
  const quiet = events.filter((e) => !e.isCapture && !e.isCheck)
  const endgame = events.filter((e) => phaseOf(e.moveNo) === "endgame")
  return {
    tactics: sliceScore(tactical),
    position: sliceScore(quiet),
    endgame: sliceScore(endgame),
  }
}

function sliceScore(events: PatternMoveEvent[]): number | null {
  if (events.length < 2) return null
  return Math.round(events.reduce((a, e) => a + GRADE_ACCURACY[e.grade], 0) / events.length)
}

type PlayerMove = {
  from: Square
  to: Square
  piece: PieceType
  isCapture: boolean
  isCheck: boolean
}

function diffPlayerMove(prev: GameState, next: GameState, color: PieceColor): PlayerMove | null {
  const movedFrom = findMovedFrom(prev, next, color)
  if (!movedFrom) return null
  const from = movedFrom
  const to = findDestination(prev, next, color) ?? from
  const piece = getPieceAt(next, to)?.type ?? getPieceAt(prev, from)?.type
  if (!piece) return null
  const captured = getPieceAt(prev, to)
  const isCapture = Boolean(captured) || (piece === "p" && prev.enPassant === to)
  const isCheck = isKingInCheck(next, color === "w" ? "b" : "w")
  return { from, to, piece, isCapture, isCheck }
}

function findMovedFrom(prev: GameState, next: GameState, color: PieceColor): Square | null {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = squareAt(row, col)
      const before = prev.board[row]?.[col]
      const after = next.board[row]?.[col]
      if (before && before.color === color && (!after || after.type !== before.type || after.color !== before.color)) {
        return square
      }
    }
  }
  return null
}

function findDestination(prev: GameState, next: GameState, color: PieceColor): Square | null {
  const destinations: Square[] = []
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = squareAt(row, col)
      const before = prev.board[row]?.[col]
      const after = next.board[row]?.[col]
      if (after && after.color === color && (!before || before.type !== after.type || before.color !== after.color)) {
        destinations.push(square)
      }
    }
  }
  return destinations[destinations.length - 1] ?? null
}

function squareAt(row: number, col: number): Square {
  return `${String.fromCharCode(97 + col)}${8 - row}` as Square
}

/**
 * Replay a game's full move history (interleaved player + bot) and extract the
 * player's moves as PatternMoveEvents, zipped against the per-player even
 * evaluations. `moveTimes` align to `evaluations` (each player move yields one).
 */
export function replayPatternEvents(
  history: GameState[],
  evaluations: MoveEvaluation[],
  moveTimes: number[],
  playerColor: PieceColor,
): PatternMoveEvent[] {
  if (history.length < 2) return []
  const events: PatternMoveEvent[] = []
  let evalIndex = 0
  for (let k = 1; k < history.length; k++) {
    const prev = history[k - 1]
    const next = history[k]
    if (prev.turn !== playerColor) continue
    const moved = diffPlayerMove(prev, next, playerColor)
    const evaluation = evaluations[evalIndex]
    evalIndex += 1
    if (!moved || !evaluation) continue
    events.push({
      moveNo: evalIndex,
      squareFrom: moved.from,
      squareTo: moved.to,
      piece: moved.piece,
      grade: evaluation.type,
      centipawnLoss: evaluation.centipawnLoss,
      timeMs: moveTimes[evalIndex - 1] !== undefined ? Math.round(moveTimes[evalIndex - 1] * 1000) : null,
      isCapture: moved.isCapture,
      isCheck: moved.isCheck,
    })
  }
  return events
}