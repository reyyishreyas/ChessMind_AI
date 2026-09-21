import {
  type GameState,
  type PieceColor,
  type PieceType,
  type Square,
  coordsToSquare,
  getPieceAt,
  isKingInCheck,
  squareToCoords,
} from "./chess-engine.ts"

export type MotifId = "capture" | "check" | "fork" | "discovered" | "pin" | "skewer"

export type MotifSubject = { type: PieceType; square: Square }

export type MotifDetail = {
  id: MotifId
  subject?: MotifSubject
  subjects?: MotifSubject[]
}

const DIRS: {
  diag: readonly (readonly [number, number])[]
  ortho: readonly (readonly [number, number])[]
  knight: readonly (readonly [number, number])[]
} = {
  diag: [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ],
  ortho: [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ],
  knight: [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ],
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8
}

const LINE_DIRS: readonly (readonly [number, number])[] = [...DIRS.diag, ...DIRS.ortho]

export function findKing(state: GameState, color: PieceColor): Square | null {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row][col]
      if (piece?.type === "k" && piece.color === color) {
        return coordsToSquare(row, col)
      }
    }
  }
  return null
}

export function attackedEnemies(state: GameState, square: Square): Square[] {
  const piece = getPieceAt(state, square)
  if (!piece) return []
  const targets: Square[] = []
  const [r, c] = squareToCoords(square)

  const addEnemy = (sr: number, sc: number): void => {
    if (!inBounds(sr, sc)) return
    const target = state.board[sr][sc]
    if (target && target.color !== piece.color) {
      targets.push(coordsToSquare(sr, sc))
    }
  }

  if (piece.type === "p") {
    const dr = piece.color === "w" ? -1 : 1
    for (const dc of [-1, 1]) addEnemy(r + dr, c + dc)
  } else if (piece.type === "n") {
    for (const [dr, dc] of DIRS.knight) addEnemy(r + dr, c + dc)
  } else if (piece.type === "k") {
    for (const [dr, dc] of LINE_DIRS) addEnemy(r + dr, c + dc)
  } else {
    const dirs = piece.type === "b" ? DIRS.diag : piece.type === "r" ? DIRS.ortho : LINE_DIRS
    for (const [dr, dc] of dirs) {
      let sr = r + dr
      let sc = c + dc
      while (inBounds(sr, sc)) {
        const target = state.board[sr][sc]
        if (target) {
          if (target.color !== piece.color) {
            targets.push(coordsToSquare(sr, sc))
          }
          break
        }
        sr += dr
        sc += dc
      }
    }
  }
  return targets
}

function scanRay(
  state: GameState,
  start: Square,
  delta: readonly [number, number],
): { first: Square | null; second: Square | null } {
  const [r, c] = squareToCoords(start)
  const first = { square: null as Square | null, r: -1, c: -1 }
  const dr = delta[0]
  const dc = delta[1]
  let sr = r + dr
  let sc = c + dc
  let found = 0
  let second: Square | null = null
  while (inBounds(sr, sc)) {
    if (state.board[sr][sc]) {
      found++
      if (found === 1) {
        first.square = coordsToSquare(sr, sc)
        first.r = sr
        first.c = sc
      } else {
        second = coordsToSquare(sr, sc)
        break
      }
    }
    sr += dr
    sc += dc
  }
  return { first: first.square, second }
}

export function detectMotifs(stateBefore: GameState, stateAfter: GameState, from: Square, to: Square): MotifId[] {
  return detectMotifDetails(stateBefore, stateAfter, from, to).map((d) => d.id)
}

export function detectMotifDetails(stateBefore: GameState, stateAfter: GameState, from: Square, to: Square): MotifDetail[] {
  const details: MotifDetail[] = []
  const movedPiece = getPieceAt(stateAfter, to)
  if (!movedPiece) return []

  if (getPieceAt(stateBefore, to) || (stateBefore.enPassant === to && movedPiece.type === "p")) {
    const captured = movedPiece.type === "p" && stateBefore.enPassant === to
      ? "p"
      : getPieceAt(stateBefore, to)?.type
    if (captured) {
      details.push({ id: "capture", subject: { type: captured, square: to } })
    } else {
      details.push({ id: "capture" })
    }
  }

  const enemyColor: PieceColor = movedPiece.color === "w" ? "b" : "w"
  if (isKingInCheck(stateAfter, enemyColor)) {
    details.push({ id: "check" })
  }

  const forkTargets: MotifSubject[] =
    movedPiece.type !== "k" && movedPiece.type !== "p"
      ? attackedEnemies(stateAfter, to).map((sq) => ({
          type: getPieceAt(stateAfter, sq)!.type,
          square: sq,
        }))
      : []
  if (forkTargets.length >= 2) {
    details.push({ id: "fork", subjects: forkTargets })
  }

  let discovered = false
  for (let row = 0; row < 8 && !discovered; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = stateAfter.board[row][col]
      if (!piece || piece.color !== movedPiece.color) continue
      const square = coordsToSquare(row, col)
      if (square === to) continue
      const beforeSquare = coordsToSquare(row, col)
      if (attackedEnemies(stateAfter, square).length > attackedEnemies(stateBefore, beforeSquare).length) {
        discovered = true
        break
      }
    }
  }
  if (discovered) details.push({ id: "discovered" })

  const enemyKing = findKing(stateAfter, enemyColor)
  if (enemyKing) {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = stateAfter.board[row][col]
        if (!piece || piece.color !== movedPiece.color) continue
        if (piece.type !== "b" && piece.type !== "r" && piece.type !== "q") continue
        const square = coordsToSquare(row, col)
        for (const delta of LINE_DIRS) {
          const { first, second } = scanRay(stateAfter, square, delta)
          if (!first || !second) continue
          const firstPiece = getPieceAt(stateAfter, first)
          if (!firstPiece || firstPiece.color !== enemyColor) continue
          if (first === enemyKing) {
            const secondPiece = getPieceAt(stateAfter, second)
            if (secondPiece && secondPiece.color === enemyColor) {
              details.push({
                id: "skewer",
                subject: { type: secondPiece.type, square: second },
              })
            }
          } else {
            const secondPiece = getPieceAt(stateAfter, second)
            const pinnedAgainst = second === enemyKing || secondPiece?.type === "q"
            if (pinnedAgainst) {
              details.push({
                id: "pin",
                subject: { type: firstPiece.type, square: first },
              })
            }
          }
        }
      }
    }
  }

  const seen = new Set<string>()
  return details.filter((d) => {
    const key = d.id + (d.subject ? ":" + d.subject.square : "") + (d.subjects ? ":" + d.subjects.length : "")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}