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

export type CrossGameSummary = {
  games: number
  totalMoves: number
  avgAccuracy: number
  avgCpl: number
  topBlunderPiece: { piece: PieceType; blunders: number; rate: number } | null
  worstPhase: { phase: PhaseId; accuracy: number } | null
  recurringFindings: { id: string; games: number }[]
}

/**
 * Reduce several per-game profiles into cross-game pattern facts. A finding is
 * only "recurring" if it fired in at least two games — single-game quirks are
 * not reported. Everything stays a pure function of measured profiles.
 */
export function summarizePatterns(profiles: PatternProfile[]): CrossGameSummary {
  const useful = profiles.filter((p) => p.nMoves >= 4)
  const totalMoves = profiles.reduce((a, p) => a + p.nMoves, 0)
  const allCpls: number[] = []
  const phaseAcc = new Map<PhaseId, { n: number; acc: number }>()
  const pieceBlunders = new Map<PieceType, { n: number; b: number }>()

  for (const p of profiles) {
    for (const phase of p.phases) {
      if (phase.avgAccuracy === null) continue
      const cur = phaseAcc.get(phase.phase) ?? { n: 0, acc: 0 }
      cur.n += phase.n
      cur.acc += phase.avgAccuracy * phase.n
      phaseAcc.set(phase.phase, cur)
    }
    for (const piece of p.pieces) {
      const cur = pieceBlunders.get(piece.piece) ?? { n: 0, b: 0 }
      cur.n += piece.n
      cur.b += piece.blunders
      pieceBlunders.set(piece.piece, cur)
    }
    // Reconstruct cpl pool per game only in aggregate form (avg cpl weighted by moves).
    allCpls.push(p.avgCpl * p.nMoves)
  }

  const recurring = new Map<string, number>()
  for (const p of useful) {
    const seen = new Set<string>()
    for (const f of patternFindings(p)) {
      if (seen.has(f.id)) continue
      seen.add(f.id)
      recurring.set(f.id, (recurring.get(f.id) ?? 0) + 1)
    }
  }
  const accWeighted = profiles.reduce((a, p) => a + p.avgAccuracy * p.nMoves, 0)

  let worstPhase: CrossGameSummary["worstPhase"] = null
  for (const [phase, { n, acc }] of phaseAcc) {
    if (n < 4) continue
    const avg = acc / n
    if (!worstPhase || avg < worstPhase.accuracy) worstPhase = { phase, accuracy: Math.round(avg) }
  }

  let topBlunderPiece: CrossGameSummary["topBlunderPiece"] = null
  for (const [piece, { n, b }] of pieceBlunders) {
    if (n < 6) continue
    const rate = b / n
    if (!topBlunderPiece || rate > topBlunderPiece.rate) {
      topBlunderPiece = { piece, blunders: b, rate }
    }
  }

  return {
    games: profiles.length,
    totalMoves,
    avgAccuracy: totalMoves > 0 ? Math.round(accWeighted / totalMoves) : 0,
    avgCpl: totalMoves > 0 ? Math.round(allCpls.reduce((a, b) => a + b, 0) / totalMoves) : 0,
    topBlunderPiece,
    worstPhase,
    recurringFindings: [...recurring.entries()]
      .filter(([, games]) => games >= 2)
      .map(([id, games]) => ({ id, games }))
      .sort((a, b) => b.games - a.games),
  }
}

/**
 * Structural shape of one persisted `game_moves` row (as returned by
 * lib/db getPlayerMoveHistory). Kept local so this module stays a pure
 * function of the data with no database import.
 */
export type SavedPatternRow = {
  gameId: string
  moveNo: number
  squareFrom: string
  squareTo: string
  piece: string | null
  grade: string
  centipawnLoss: number
  isCapture: number | boolean
  isCheck: number | boolean
  timeMs: number | null
}

/** Rebuild per-game profiles from the saved (player-only) move rows. */
export function profilesFromSavedGames(rows: SavedPatternRow[]): PatternProfile[] {
  const byGame = new Map<string, PatternMoveEvent[]>()
  for (const r of rows) {
    const events = byGame.get(r.gameId) ?? []
    events.push({
      moveNo: r.moveNo,
      squareFrom: r.squareFrom as Square,
      squareTo: r.squareTo as Square,
      piece: r.piece as PieceType | null,
      grade: r.grade as MoveGrade,
      centipawnLoss: Number(r.centipawnLoss) || 0,
      isCapture: Boolean(r.isCapture),
      isCheck: Boolean(r.isCheck),
      timeMs: r.timeMs,
    })
    byGame.set(r.gameId, events)
  }
  return [...byGame.values()].map((events) => buildPatternProfile(events))
}

const RECURRING_LABELS: Array<(id: string) => string | null> = [
  (id) => {
    if (id.startsWith("phase-dip-")) {
      const phase = id.slice("phase-dip-".length)
      return `accuracy dips in the ${phase}`
    }
    if (id.startsWith("piece-blunder-")) {
      const piece = id.slice("piece-blunder-".length) as PieceType
      return `blunders come most with the ${PIECE_NAMES[piece] ?? "piece"}`
    }
    return null
  },
  (id) => (id === "time-pressure" ? "blunders under time pressure" : null),
  (id) => (id === "inconsistent" ? "uneven, swingy play" : null),
  (id) => (id === "steady" ? "steady, consistent play" : null),
  (id) => (id === "capture-sharp" ? "solid capture handling" : null),
]

function recurringText(id: string): string | null {
  for (const label of RECURRING_LABELS) {
    const text = label(id)
    if (text) return text
  }
  return null
}

/**
 * Deterministic, grounded facts line for the coach from a cross-game summary.
 * Empty until there are enough saved moves to warrant coaching input; the
 * "recurring" findings are reported only when they fired in >= 2 games (the
 * reducer already guarantees this).
 */
export function describeCrossGameFacts(summary: CrossGameSummary): string {
  if (summary.games === 0 || summary.totalMoves < 4) return ""
  const parts = [
    `${summary.totalMoves} of your moves across ${summary.games} finished game${summary.games === 1 ? "" : "s"}, avg accuracy ~${summary.avgAccuracy}%`,
  ]
  if (summary.topBlunderPiece) {
    const name = PIECE_NAMES[summary.topBlunderPiece.piece]
    const n = Math.round(summary.topBlunderPiece.blunders / (summary.topBlunderPiece.rate || 1))
    parts.push(`${summary.topBlunderPiece.blunders} of your ${n} ${name} moves were blunders`)
  }
  if (summary.worstPhase) {
    parts.push(`weakest phase is ${summary.worstPhase.phase} (~${summary.worstPhase.accuracy}% accuracy)`)
  }
  for (const f of summary.recurringFindings.slice(0, 2)) {
    const text = recurringText(f.id)
    if (text) parts.push(`${text} (${f.games} games)`)
  }
  return parts.join("; ")
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
  const piece = getPieceAt(prev, from)?.type ?? getPieceAt(next, to)?.type
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