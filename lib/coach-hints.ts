import {
  type GameState,
  type PieceColor,
  type PieceType,
  type Square,
  coordsToSquare,
  gameStateToFEN,
  getPieceAt,
  getValidMoves,
} from "./chess-engine.ts"
import { attackedEnemies } from "./tactics.ts"
import { getStockfish } from "./stockfish-worker.ts"
import { detectOpening } from "./opening.ts"
import {
  PIECE_LABELS,
  PIECE_VALUES,
  buildMoveExplanation,
  findThreats,
  isSquareAttackedBy,
  oppositeColor,
  pickTopThreat,
  sanForMove,
  type Threat,
} from "./coach-explain.ts"

export type ForkHint = {
  from: Square
  to: Square
  san: string
  pieceType: PieceType
  targets: Square[]
  targetTypes: PieceType[]
  gain: number
  explanation: string
}

export type CoachHintSuggestion = {
  from: Square
  to: Square
  san: string
  explanation: string
}

export type CoachHintsPayload = {
  opening: string | null
  tip: string | null
  threat: Threat | null
  fork: ForkHint | null
  suggestion: CoachHintSuggestion | null
}

export function buildSuggestion(state: GameState, from: Square, to: Square): CoachHintSuggestion {
  return {
    from,
    to,
    san: sanForMove(state, from, to),
    explanation: buildMoveExplanation(state, from, to),
  }
}

/**
 * Find a move that creates a fork: after playing `from -> to`, the moved piece
 * attacks two or more valuable enemy targets. Returns the best (highest total
 * value) fork for the player, with the destination square so the board can
 * highlight the actual move instead of "look at that square".
 */
export function pickForkMove(state: GameState, playerColor: PieceColor): ForkHint | null {
  if (state.turn !== playerColor) return null
  let best: ForkHint | null = null
  let bestGain = 0

  for (const move of getAllPlayerMoves(state, playerColor)) {
    const piece = getPieceAt(state, move.from)
    if (!piece || piece.type === "k" || piece.type === "p") continue
    const after = { ...state } as GameState
    const preview = applyForForkPreview(after, move.from, move.to)
    if (!preview) continue

    const targets = attackedEnemies(preview, move.to)
    if (targets.length < 2) continue

    const targetTypes = targets.map((t) => getPieceAt(preview, t)?.type ?? "p")
    const gain = targets.reduce(
      (sum, t, i) => sum + (targetTypes[i] === "k" ? 0 : PIECE_VALUES[targetTypes[i]]),
      0,
    )
    if (gain < 500) continue
    if (gain <= bestGain) continue

    const contested = isSquareAttackedBy(preview, move.to, oppositeColor(playerColor))
    if (contested && gain < PIECE_VALUES[piece.type] + 100) continue

    const names = targets.map((t) => PIECE_LABELS[getPieceAt(preview, t)?.type ?? "p"])
    bestGain = gain
    best = {
      from: move.from,
      to: move.to,
      san: sanForMove(state, move.from, move.to),
      pieceType: piece.type,
      targets,
      targetTypes,
      gain,
      explanation:
        `Play ${sanForMove(state, move.from, move.to)} — your ${PIECE_LABELS[piece.type]} lands on ` +
        `${move.to} and forks both ${names.join(" and ")}. Your opponent can only save one, ` +
        `so you win the other on your next move.`,
    }
  }
  return best
}

function getAllPlayerMoves(state: GameState, color: PieceColor): { from: Square; to: Square }[] {
  const moves: { from: Square; to: Square }[] = []
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row][col]
      if (!piece || piece.color !== color) continue
      const square = coordsToSquare(row, col)
      for (const to of getValidMoves(state, square)) moves.push({ from: square, to })
    }
  }
  return moves
}

/**
 * Lightweight board update for fork detection: move the piece and clear the
 * origin, without replaying full move legality (the move already came from
 * getValidMoves, so it is legal).
 */
function applyForForkPreview(state: GameState, from: Square, to: Square): GameState | null {
  const piece = getPieceAt(state, from)
  if (!piece) return null
  const board = state.board.map((rank) => rank.slice())
  const fromRow = 8 - Number.parseInt(from[1])
  const fromCol = from.charCodeAt(0) - 97
  const toRow = 8 - Number.parseInt(to[1])
  const toCol = to.charCodeAt(0) - 97
  board[toRow][toCol] = piece
  board[fromRow][fromCol] = null
  return { ...state, board }
}

export async function suggestStrongMove(state: GameState, playerColor: PieceColor): Promise<CoachHintSuggestion | null> {
  if (state.turn !== playerColor) return null
  try {
    const engine = getStockfish()
    await engine.init()
    const msg = await engine.getBestMove(gameStateToFEN(state), 2, 0)
    if (msg.type !== "bestmove" || !msg.bestMove || msg.bestMove === "(none)") return null
    return buildSuggestion(state, msg.bestMove.slice(0, 2) as Square, msg.bestMove.slice(2, 4) as Square)
  } catch {
    return null
  }
}

export type HintGateInput = {
  skillRating: number
  gameStartElo: number | null
  slowTurn: boolean
  moveCount: number
}

export const SLOW_TURN_MS = 8000
export const EARLY_PHASE_MOVES = 12

export function shouldShowHints(gate: HintGateInput): boolean {
  const lowElo = gate.skillRating <= 1150
  const declining = gate.gameStartElo != null && gate.skillRating < gate.gameStartElo
  const slow = gate.slowTurn
  const early = gate.moveCount <= EARLY_PHASE_MOVES
  return (lowElo && (slow || early)) || declining
}

export function buildCoachHints(
  state: GameState,
  playerColor: PieceColor,
  moves: string[],
): Pick<CoachHintsPayload, "opening" | "tip" | "threat" | "fork"> {
  const opening = moves.length <= EARLY_PHASE_MOVES ? detectOpening(moves) : null
  return {
    opening: opening?.name ?? null,
    tip: opening?.tip ?? null,
    threat: pickTopThreat(findThreats(state, playerColor)),
    fork: pickForkMove(state, playerColor),
  }
}
