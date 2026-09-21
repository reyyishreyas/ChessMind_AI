import {
  type GameState,
  type Move,
  type PieceColor,
  type PieceType,
  type Square,
  coordsToSquare,
  getAllLegalMoves,
  getPieceAt,
  isKingInCheck,
  makeMove,
  moveToAlgebraic,
} from "./chess-engine.ts"
import { attackedEnemies } from "./tactics.ts"

/**
 * Pure, deterministic chess explanations used by both the board hints and the
 * grounded coach prompt. Nothing here talks to an engine or a model, so it can
 * be imported on the server (prompt facts) and the client (visual hints)
 * without dragging in the Stockfish worker.
 */

export const PIECE_VALUES: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
}

export const PIECE_LABELS: Record<PieceType, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
}

export function oppositeColor(color: PieceColor): PieceColor {
  return color === "w" ? "b" : "w"
}

/** Is `square` attacked by any piece of `byColor`? (pseudo-legal, cheap) */
export function isSquareAttackedBy(state: GameState, square: Square, byColor: PieceColor): boolean {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row][col]
      if (!piece || piece.color !== byColor) continue
      if (attackedEnemies(state, coordsToSquare(row, col)).includes(square)) return true
    }
  }
  return false
}

export type Threat = {
  attacker: Square
  attackerType: PieceType
  attacked: Square
  attackedType: PieceType
  defended: boolean
  netValue: number
  explanation: string
}

/**
 * Every enemy capture that is legal against the player right now (it is the
 * player's turn). King targets are excluded — being in check is shown by the
 * board, not treated as a "you may lose this piece" hint.
 */
export function findThreats(state: GameState, targetColor: PieceColor): Threat[] {
  if (state.turn !== targetColor) return []

  const enemyColor = oppositeColor(targetColor)
  const flippedSafeState: GameState = { ...state, turn: enemyColor, enPassant: null }
  const enemyMoves = getAllLegalMoves(flippedSafeState)
  const seen = new Set<string>()
  const threats: Threat[] = []

  for (const m of enemyMoves) {
    const target = getPieceAt(state, m.to)
    if (!target || target.color !== targetColor || target.type === "k") continue
    const attacker = getPieceAt(state, m.from)
    if (!attacker || attacker.type === "k") continue
    const key = `${m.from}>${m.to}`
    if (seen.has(key)) continue
    seen.add(key)

    const defended = isSquareAttackedBy(state, m.to, targetColor)
    const netValue = defended ? 0 : PIECE_VALUES[target.type]
    threats.push({
      attacker: m.from,
      attackerType: attacker.type,
      attacked: m.to,
      attackedType: target.type,
      defended,
      netValue,
      explanation: describeThreat(attacker.type, m.from, target.type, m.to, defended),
    })
  }
  return threats
}

function describeThreat(
  attackerType: PieceType,
  attacker: Square,
  attackedType: PieceType,
  attacked: Square,
  defended: boolean,
): string {
  const head =
    `Their ${PIECE_LABELS[attackerType]} on ${attacker} is attacking your ` +
    `${PIECE_LABELS[attackedType]} on ${attacked}.`
  if (attackedType === "k") return head
  const consequence = defended
    ? `It is defended, so a trade is possible — but if you leave it there ` +
      `your ${PIECE_LABELS[attackedType]} can be taken and you must be ready to recapture.`
    : `Your ${PIECE_LABELS[attackedType]} is not defended, so they can win ` +
      `${Math.round(PIECE_VALUES[attackedType] / 100)} points of material for free. ` +
      `Move it, defend it, or trade it off.`
  return `${head} ${consequence}`
}

export function pickTopThreat(threats: Threat[]): Threat | null {
  if (threats.length === 0) return null
  return threats.reduce((a, b) =>
    PIECE_VALUES[a.attackedType] >= PIECE_VALUES[b.attackedType] ? a : b,
  )
}

/** One-line threat summary for the LLM prompt (or "" when there is none). */
export function describeThreatsForPrompt(state: GameState, playerColor: PieceColor): string {
  const top = pickTopThreat(findThreats(state, playerColor))
  if (!top) return "none — the opponent has no immediate capture available"
  const captured = top.defended ? "but the piece is defended" : "and it is undefended"
  return (
    `their ${PIECE_LABELS[top.attackerType]} on ${top.attacker} can capture your ` +
    `${PIECE_LABELS[top.attackedType]} on ${top.attacked} (${captured})`
  )
}

const CENTER_SQUARES = new Set(["d4", "e4", "d5", "e5"])

/**
 * Plain-language reasons a specific move is good, derived from the position
 * itself. Used to explain the engine's suggested reply without a model.
 */
export function explainMove(state: GameState, from: Square, to: Square): string[] {
  const piece = getPieceAt(state, from)
  if (!piece) return []
  const color = piece.color
  const enemy = oppositeColor(color)
  const reasons: string[] = []

  const captured = getPieceAt(state, to)
  if (captured) reasons.push(`wins your opponent's ${PIECE_LABELS[captured.type]}`)

  if (isSquareAttackedBy(state, from, enemy) && !captured) {
    reasons.push(`moves the ${PIECE_LABELS[piece.type]} out of an attack`)
  }

  const after = makeMove(state, from, to)
  if (after) {
    if (isKingInCheck(after, enemy)) reasons.push("gives check")
    const movedPiece = getPieceAt(after, to)
    if (movedPiece) {
      const hit = attackedEnemies(after, to).length
      if (hit > 0) {
        reasons.push(`attacks ${hit === 1 ? "a piece" : `${hit} pieces`}`)
      }
    }
  }

  if (piece.type === "k") {
    const colDelta = to.charCodeAt(0) - from.charCodeAt(0)
    if (Math.abs(colDelta) === 2) reasons.push("castles your king to safety")
  } else {
    const backRank = color === "w" ? 7 : 0
    const fromRow = 8 - Number.parseInt(from[1])
    if (fromRow === backRank) {
      reasons.push(`develops your ${PIECE_LABELS[piece.type]} toward the center`)
    } else if (CENTER_SQUARES.has(to)) {
      reasons.push("takes central space")
    }
  }

  return reasons
}

export function buildMoveExplanation(state: GameState, from: Square, to: Square): string {
  const piece = getPieceAt(state, from)
  if (!piece) return ""
  const san = sanForMove(state, from, to)
  const reasons = explainMove(state, from, to)
  if (reasons.length === 0) return `Play ${san}. It keeps your position solid and active.`
  return `Play ${san}: it ${joinReasons(reasons)}.`
}

function joinReasons(reasons: string[]): string {
  if (reasons.length === 1) return reasons[0]
  if (reasons.length === 2) return `${reasons[0]} and ${reasons[1]}`
  return `${reasons.slice(0, -1).join(", ")}, and ${reasons[reasons.length - 1]}`
}

export function sanForMove(state: GameState, from: Square, to: Square): string {
  const piece = getPieceAt(state, from)
  if (!piece) return `${from}-${to}`
  let castle: Move["castle"]
  if (piece.type === "k") {
    const colDelta = to.charCodeAt(0) - from.charCodeAt(0)
    if (colDelta === 2) castle = "k"
    else if (colDelta === -2) castle = "q"
  }
  const move: Move = {
    from,
    to,
    piece: piece.type,
    captured: getPieceAt(state, to)?.type,
    castle,
  }
  return moveToAlgebraic(state, move)
}