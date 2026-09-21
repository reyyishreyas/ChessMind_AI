export function fenToState(fen) {
  const [placement, turn, castling, enPassant, halfMoves, fullMoves] = fen.split(" ")
  const board = []
  for (const rank of placement.split("/")) {
    const row = []
    for (const ch of rank) {
      if (ch >= "1" && ch <= "8") {
        for (let i = 0; i < Number.parseInt(ch); i++) row.push(null)
      } else {
        row.push({ type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? "w" : "b" })
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

export function diffMove(fenBefore, fenAfter) {
  const pre = fenToState(fenBefore)
  const post = fenToState(fenAfter)
  const mover = pre.turn
  const squares = {}
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = "abcdefgh"[c] + (8 - r)
      squares[sq] = { pre: pre.board[r][c], post: post.board[r][c] }
    }
  }
  const kingMove = Object.entries(squares).find(
    ([sq, s]) => s.pre?.type === "k" && s.pre?.color === mover && s.post?.color !== mover,
  )
  let from = null
  let to = null
  if (kingMove) {
    from = kingMove[0]
    to = Object.entries(squares)
      .find(([sq, s]) => s.post?.type === "k" && s.post?.color === mover && s.pre?.color !== mover)?.[0]
  } else {
    for (const [sq, s] of Object.entries(squares)) {
      if (s.pre && s.pre.color === mover && !s.post) from = from || sq
      if (!s.pre && s.post && s.post.color === mover) to = to || sq
    }
  }
  if (!from || !to) return null
  return { from, to }
}