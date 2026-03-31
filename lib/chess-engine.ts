// Chess piece types and board representation
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k"
export type PieceColor = "w" | "b"
export type Piece = { type: PieceType; color: PieceColor } | null
export type Square = string // e.g., 'e4', 'a1'
export type Move = {
  from: Square
  to: Square
  piece: PieceType
  captured?: PieceType
  promotion?: PieceType
  castle?: "k" | "q"
  enPassant?: boolean
  check?: boolean
  checkmate?: boolean
}

export type GameState = {
  board: Piece[][]
  turn: PieceColor
  castling: { w: { k: boolean; q: boolean }; b: { k: boolean; q: boolean } }
  enPassant: Square | null
  halfMoves: number
  fullMoves: number
  history: Move[]
  isCheck: boolean
  isCheckmate: boolean
  isStalemate: boolean
  isDraw: boolean
}

const INITIAL_BOARD: Piece[][] = [
  [
    { type: "r", color: "b" },
    { type: "n", color: "b" },
    { type: "b", color: "b" },
    { type: "q", color: "b" },
    { type: "k", color: "b" },
    { type: "b", color: "b" },
    { type: "n", color: "b" },
    { type: "r", color: "b" },
  ],
  [
    { type: "p", color: "b" },
    { type: "p", color: "b" },
    { type: "p", color: "b" },
    { type: "p", color: "b" },
    { type: "p", color: "b" },
    { type: "p", color: "b" },
    { type: "p", color: "b" },
    { type: "p", color: "b" },
  ],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [
    { type: "p", color: "w" },
    { type: "p", color: "w" },
    { type: "p", color: "w" },
    { type: "p", color: "w" },
    { type: "p", color: "w" },
    { type: "p", color: "w" },
    { type: "p", color: "w" },
    { type: "p", color: "w" },
  ],
  [
    { type: "r", color: "w" },
    { type: "n", color: "w" },
    { type: "b", color: "w" },
    { type: "q", color: "w" },
    { type: "k", color: "w" },
    { type: "b", color: "w" },
    { type: "n", color: "w" },
    { type: "r", color: "w" },
  ],
]

export function createInitialState(): GameState {
  return {
    board: INITIAL_BOARD.map((row) => row.map((piece) => (piece ? { ...piece } : null))),
    turn: "w",
    castling: { w: { k: true, q: true }, b: { k: true, q: true } },
    enPassant: null,
    halfMoves: 0,
    fullMoves: 1,
    history: [],
    isCheck: false,
    isCheckmate: false,
    isStalemate: false,
    isDraw: false,
  }
}

export function squareToCoords(square: Square): [number, number] {
  const col = square.charCodeAt(0) - 97
  const row = 8 - Number.parseInt(square[1])
  return [row, col]
}

export function coordsToSquare(row: number, col: number): Square {
  return String.fromCharCode(97 + col) + (8 - row)
}

export function getPieceAt(state: GameState, square: Square): Piece {
  const [row, col] = squareToCoords(square)
  return state.board[row]?.[col] ?? null
}

function setPieceAt(board: Piece[][], square: Square, piece: Piece): void {
  const [row, col] = squareToCoords(square)
  board[row][col] = piece
}

function cloneBoard(board: Piece[][]): Piece[][] {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)))
}

function cloneState(state: GameState): GameState {
  return {
    board: cloneBoard(state.board),
    turn: state.turn,
    castling: {
      w: { ...state.castling.w },
      b: { ...state.castling.b },
    },
    enPassant: state.enPassant,
    halfMoves: state.halfMoves,
    fullMoves: state.fullMoves,
    history: [...state.history],
    isCheck: state.isCheck,
    isCheckmate: state.isCheckmate,
    isStalemate: state.isStalemate,
    isDraw: state.isDraw,
  }
}

// Get pseudo-legal moves (doesn't check for leaving king in check)
function getPseudoLegalMoves(state: GameState, square: Square): Square[] {
  const piece = getPieceAt(state, square)
  if (!piece) return []

  const [row, col] = squareToCoords(square)
  const moves: Square[] = []

  switch (piece.type) {
    case "p":
      moves.push(...getPawnMoves(state, row, col, piece.color))
      break
    case "n":
      moves.push(...getKnightMoves(state, row, col, piece.color))
      break
    case "b":
      moves.push(...getBishopMoves(state, row, col, piece.color))
      break
    case "r":
      moves.push(...getRookMoves(state, row, col, piece.color))
      break
    case "q":
      moves.push(...getQueenMoves(state, row, col, piece.color))
      break
    case "k":
      moves.push(...getKingMoves(state, row, col, piece.color))
      break
  }

  return moves
}

// Get all valid moves for a piece at a given square
export function getValidMoves(state: GameState, square: Square): Square[] {
  const piece = getPieceAt(state, square)
  if (!piece || piece.color !== state.turn) return []

  const moves = getPseudoLegalMoves(state, square)

  // Filter out moves that would leave king in check
  return moves.filter((to) => {
    const testState = makeQuickMove(state, square, to)
    return !isKingInCheck(testState, piece.color)
  })
}

function getPawnMoves(state: GameState, row: number, col: number, color: PieceColor): Square[] {
  const moves: Square[] = []
  const direction = color === "w" ? -1 : 1
  const startRow = color === "w" ? 6 : 1

  // Forward move
  const newRow = row + direction
  if (newRow >= 0 && newRow < 8 && !state.board[newRow][col]) {
    moves.push(coordsToSquare(newRow, col))

    // Double move from start
    if (row === startRow && !state.board[row + 2 * direction][col]) {
      moves.push(coordsToSquare(row + 2 * direction, col))
    }
  }

  // Captures
  for (const dc of [-1, 1]) {
    const newCol = col + dc
    if (newCol >= 0 && newCol < 8 && newRow >= 0 && newRow < 8) {
      const target = state.board[newRow]?.[newCol]
      if (target && target.color !== color) {
        moves.push(coordsToSquare(newRow, newCol))
      }

      // En passant
      if (state.enPassant === coordsToSquare(newRow, newCol)) {
        moves.push(coordsToSquare(newRow, newCol))
      }
    }
  }

  return moves
}

function getKnightMoves(state: GameState, row: number, col: number, color: PieceColor): Square[] {
  const moves: Square[] = []
  const offsets = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ]

  for (const [dr, dc] of offsets) {
    const newRow = row + dr
    const newCol = col + dc
    if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
      const target = state.board[newRow][newCol]
      if (!target || target.color !== color) {
        moves.push(coordsToSquare(newRow, newCol))
      }
    }
  }

  return moves
}

function getSlidingMoves(
  state: GameState,
  row: number,
  col: number,
  color: PieceColor,
  directions: number[][],
): Square[] {
  const moves: Square[] = []

  for (const [dr, dc] of directions) {
    let newRow = row + dr
    let newCol = col + dc

    while (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
      const target = state.board[newRow][newCol]
      if (!target) {
        moves.push(coordsToSquare(newRow, newCol))
      } else {
        if (target.color !== color) {
          moves.push(coordsToSquare(newRow, newCol))
        }
        break
      }
      newRow += dr
      newCol += dc
    }
  }

  return moves
}

function getBishopMoves(state: GameState, row: number, col: number, color: PieceColor): Square[] {
  return getSlidingMoves(state, row, col, color, [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ])
}

function getRookMoves(state: GameState, row: number, col: number, color: PieceColor): Square[] {
  return getSlidingMoves(state, row, col, color, [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ])
}

function getQueenMoves(state: GameState, row: number, col: number, color: PieceColor): Square[] {
  return [...getBishopMoves(state, row, col, color), ...getRookMoves(state, row, col, color)]
}

function getKingMoves(state: GameState, row: number, col: number, color: PieceColor): Square[] {
  const moves: Square[] = []
  const offsets = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ]

  for (const [dr, dc] of offsets) {
    const newRow = row + dr
    const newCol = col + dc
    if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
      const target = state.board[newRow][newCol]
      if (!target || target.color !== color) {
        moves.push(coordsToSquare(newRow, newCol))
      }
    }
  }

  // Castling
  const castleRow = color === "w" ? 7 : 0
  if (row === castleRow && col === 4 && !isKingInCheck(state, color)) {
    // Kingside
    if (
      state.castling[color].k &&
      !state.board[castleRow][5] &&
      !state.board[castleRow][6] &&
      state.board[castleRow][7]?.type === "r"
    ) {
      const test1 = makeQuickMove(state, coordsToSquare(row, col), coordsToSquare(row, 5))
      const test2 = makeQuickMove(state, coordsToSquare(row, col), coordsToSquare(row, 6))
      if (!isKingInCheck(test1, color) && !isKingInCheck(test2, color)) {
        moves.push(coordsToSquare(castleRow, 6))
      }
    }
    // Queenside
    if (
      state.castling[color].q &&
      !state.board[castleRow][3] &&
      !state.board[castleRow][2] &&
      !state.board[castleRow][1] &&
      state.board[castleRow][0]?.type === "r"
    ) {
      const test1 = makeQuickMove(state, coordsToSquare(row, col), coordsToSquare(row, 3))
      const test2 = makeQuickMove(state, coordsToSquare(row, col), coordsToSquare(row, 2))
      if (!isKingInCheck(test1, color) && !isKingInCheck(test2, color)) {
        moves.push(coordsToSquare(castleRow, 2))
      }
    }
  }

  return moves
}

function findKing(state: GameState, color: PieceColor): Square | null {
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

export function isKingInCheck(state: GameState, color: PieceColor): boolean {
  const kingSquare = findKing(state, color)
  if (!kingSquare) return false

  const [kingRow, kingCol] = squareToCoords(kingSquare)
  const enemyColor = color === "w" ? "b" : "w"

  // Check for attacks from each piece type
  // Knights
  const knightOffsets = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ]
  for (const [dr, dc] of knightOffsets) {
    const r = kingRow + dr
    const c = kingCol + dc
    if (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const piece = state.board[r][c]
      if (piece?.type === "n" && piece.color === enemyColor) return true
    }
  }

  // Pawns
  const pawnDir = color === "w" ? -1 : 1
  for (const dc of [-1, 1]) {
    const r = kingRow + pawnDir
    const c = kingCol + dc
    if (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const piece = state.board[r][c]
      if (piece?.type === "p" && piece.color === enemyColor) return true
    }
  }

  // King (for proximity checks)
  const kingOffsets = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ]
  for (const [dr, dc] of kingOffsets) {
    const r = kingRow + dr
    const c = kingCol + dc
    if (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const piece = state.board[r][c]
      if (piece?.type === "k" && piece.color === enemyColor) return true
    }
  }

  // Sliding pieces (bishop, rook, queen)
  const diagonals = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]
  const straights = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]

  for (const [dr, dc] of diagonals) {
    let r = kingRow + dr
    let c = kingCol + dc
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const piece = state.board[r][c]
      if (piece) {
        if (piece.color === enemyColor && (piece.type === "b" || piece.type === "q")) {
          return true
        }
        break
      }
      r += dr
      c += dc
    }
  }

  for (const [dr, dc] of straights) {
    let r = kingRow + dr
    let c = kingCol + dc
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const piece = state.board[r][c]
      if (piece) {
        if (piece.color === enemyColor && (piece.type === "r" || piece.type === "q")) {
          return true
        }
        break
      }
      r += dr
      c += dc
    }
  }

  return false
}

function makeQuickMove(state: GameState, from: Square, to: Square): GameState {
  const newBoard = cloneBoard(state.board)
  const [fromRow, fromCol] = squareToCoords(from)
  const [toRow, toCol] = squareToCoords(to)

  const piece = state.board[fromRow][fromCol]
  if (!piece) return state

  newBoard[toRow][toCol] = { ...piece }
  newBoard[fromRow][fromCol] = null

  // Handle en passant capture
  if (piece.type === "p" && to === state.enPassant) {
    const captureRow = piece.color === "w" ? toRow + 1 : toRow - 1
    newBoard[captureRow][toCol] = null
  }

  // Handle castling rook movement
  if (piece.type === "k" && Math.abs(toCol - fromCol) === 2) {
    if (toCol === 6) {
      newBoard[fromRow][5] = newBoard[fromRow][7]
      newBoard[fromRow][7] = null
    } else if (toCol === 2) {
      newBoard[fromRow][3] = newBoard[fromRow][0]
      newBoard[fromRow][0] = null
    }
  }

  return {
    ...state,
    board: newBoard,
    turn: state.turn === "w" ? "b" : "w",
  }
}

export function makeMove(state: GameState, from: Square, to: Square, promotion?: PieceType): GameState | null {
  const validMoves = getValidMoves(state, from)
  if (!validMoves.includes(to)) return null

  const newState = cloneState(state)
  const [fromRow, fromCol] = squareToCoords(from)
  const piece = newState.board[fromRow][fromCol]
  if (!piece) return null

  const [toRow, toCol] = squareToCoords(to)
  const captured = newState.board[toRow][toCol]

  // Create move record
  const move: Move = {
    from,
    to,
    piece: piece.type,
    captured: captured?.type,
  }

  // Handle special moves
  // En passant capture
  if (piece.type === "p" && to === state.enPassant) {
    const captureRow = piece.color === "w" ? toRow + 1 : toRow - 1
    newState.board[captureRow][toCol] = null
    move.enPassant = true
    move.captured = "p"
  }

  // Castling
  if (piece.type === "k" && Math.abs(toCol - fromCol) === 2) {
    if (toCol === 6) {
      // Kingside
      newState.board[fromRow][5] = newState.board[fromRow][7]
      newState.board[fromRow][7] = null
      move.castle = "k"
    } else if (toCol === 2) {
      // Queenside
      newState.board[fromRow][3] = newState.board[fromRow][0]
      newState.board[fromRow][0] = null
      move.castle = "q"
    }
  }

  // Pawn promotion
  if (piece.type === "p" && (toRow === 0 || toRow === 7)) {
    piece.type = promotion || "q"
    move.promotion = piece.type
  }

  // Move the piece
  newState.board[toRow][toCol] = piece
  newState.board[fromRow][fromCol] = null

  // Update castling rights
  if (piece.type === "k") {
    newState.castling[piece.color].k = false
    newState.castling[piece.color].q = false
  }
  if (piece.type === "r") {
    if (fromCol === 0) newState.castling[piece.color].q = false
    if (fromCol === 7) newState.castling[piece.color].k = false
  }

  // Set en passant square
  if (piece.type === "p" && Math.abs(toRow - fromRow) === 2) {
    newState.enPassant = coordsToSquare((fromRow + toRow) / 2, fromCol)
  } else {
    newState.enPassant = null
  }

  // Update move counters
  if (piece.type === "p" || captured) {
    newState.halfMoves = 0
  } else {
    newState.halfMoves++
  }
  if (piece.color === "b") {
    newState.fullMoves++
  }

  // Switch turn
  newState.turn = piece.color === "w" ? "b" : "w"

  // Check for check/checkmate/stalemate
  newState.isCheck = isKingInCheck(newState, newState.turn)
  move.check = newState.isCheck

  const hasLegalMoves = hasAnyLegalMove(newState)
  if (!hasLegalMoves) {
    if (newState.isCheck) {
      newState.isCheckmate = true
      move.checkmate = true
    } else {
      newState.isStalemate = true
    }
  }

  // Check for draw by 50-move rule
  if (newState.halfMoves >= 100) {
    newState.isDraw = true
  }

  newState.history = [...state.history, move]

  return newState
}

function hasAnyLegalMove(state: GameState): boolean {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row][col]
      if (piece && piece.color === state.turn) {
        const square = coordsToSquare(row, col)
        const moves = getPseudoLegalMoves(state, square)
        for (const to of moves) {
          const testState = makeQuickMove(state, square, to)
          if (!isKingInCheck(testState, piece.color)) {
            return true // Found at least one legal move
          }
        }
      }
    }
  }
  return false
}

export function getAllLegalMoves(state: GameState): { from: Square; to: Square }[] {
  const moves: { from: Square; to: Square }[] = []

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row][col]
      if (piece && piece.color === state.turn) {
        const square = coordsToSquare(row, col)
        const validMoves = getValidMoves(state, square)
        for (const to of validMoves) {
          moves.push({ from: square, to })
        }
      }
    }
  }

  return moves
}

export function moveToAlgebraic(state: GameState, move: Move): string {
  const pieceSymbols: Record<PieceType, string> = {
    p: "",
    n: "N",
    b: "B",
    r: "R",
    q: "Q",
    k: "K",
  }

  if (move.castle === "k") return "O-O"
  if (move.castle === "q") return "O-O-O"

  let notation = pieceSymbols[move.piece]

  if (move.captured) {
    if (move.piece === "p") {
      notation += move.from[0]
    }
    notation += "x"
  }

  notation += move.to

  if (move.promotion) {
    notation += "=" + pieceSymbols[move.promotion]
  }

  if (move.checkmate) {
    notation += "#"
  } else if (move.check) {
    notation += "+"
  }

  return notation
}

// Convert game state to FEN for AI analysis
export function gameStateToFEN(state: GameState): string {
  const pieceToFEN: Record<string, string> = {
    wp: "P",
    wn: "N",
    wb: "B",
    wr: "R",
    wq: "Q",
    wk: "K",
    bp: "p",
    bn: "n",
    bb: "b",
    br: "r",
    bq: "q",
    bk: "k",
  }

  let fen = ""

  // Board position
  for (let row = 0; row < 8; row++) {
    let empty = 0
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row][col]
      if (piece) {
        if (empty > 0) {
          fen += empty
          empty = 0
        }
        fen += pieceToFEN[piece.color + piece.type]
      } else {
        empty++
      }
    }
    if (empty > 0) fen += empty
    if (row < 7) fen += "/"
  }

  fen += " " + state.turn

  let castling = ""
  if (state.castling.w.k) castling += "K"
  if (state.castling.w.q) castling += "Q"
  if (state.castling.b.k) castling += "k"
  if (state.castling.b.q) castling += "q"
  fen += " " + (castling || "-")

  fen += " " + (state.enPassant || "-")
  fen += " " + state.halfMoves
  fen += " " + state.fullMoves

  return fen
}
