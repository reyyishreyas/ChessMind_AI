const BASE = process.env.ANALYZE_MOVE_URL || "http://localhost:3000/api/analyze-move"

const pos = [
  {
    name: "italian-nf3-good",
    fenBefore: "rnbqkbnr/pppp1ppp/8/4p3/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 2",
    fenAfter: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 0 2",
    from: "e2",
    to: "e4",
  },
  {
    name: "italian-bc4-quiet",
    fenBefore: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    fenAfter: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
    from: "f1",
    to: "c4",
  },
  {
    name: "knight-fork-nf3",
    fenBefore: "rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3",
    fenAfter: "rnbqkbnr/ppp2ppp/3p4/4p1N1/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 1 3",
    from: "f3",
    to: "g5",
  },
  {
    name: "pin-bg5",
    fenBefore: "rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4",
    fenAfter: "rnbqkb1r/ppp2ppp/4pn2/3p2B1/2PP4/2N5/PP2PPPP/R2QKBNR b KQkq - 3 4",
    from: "c1",
    to: "g5",
  },
  {
    name: "quiet-queen-knight",
    fenBefore: "r1bqkbnr/pppp1ppp/2n5/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4",
    fenAfter: "r1bqkbnr/pppp1ppp/2n5/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq - 0 4",
    from: "f3",
    to: "d4",
  },
]

function fenToState(fen) {
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

const sanHistory = {
  "italian-nf3-good": ["e5", "Nf3", "e4"],
  "italian-bc4-quiet": ["e4", "e5", "Nf3", "Nc6", "Bc4"],
  "knight-fork-nf3": ["e4", "e5", "Nf3", "d6", "Ng5"],
  "pin-bg5": ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5"],
  "quiet-queen-knight": ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Nxd4"],
}

for (const s of pos) {
  const stateBefore = fenToState(s.fenBefore)
  const gameState = fenToState(s.fenAfter)
  fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gameState,
      evaluation: {
        from: s.from,
        to: s.to,
        score: 0,
        type: "good",
        bestMove: { from: s.from, to: s.to, score: 0 },
        centipawnLoss: 20,
      },
      moveHistory: sanHistory[s.name],
      playerStats: { skillRating: 1200, averageAccuracy: 70 },
      stateBefore,
      botMove: null,
    }),
  })
    .then((r) => r.json())
    .then((r) => {
      console.log(`${s.name}: flag3=${r.flag3} motifs=${Array.isArray(r.motifs) ? r.motifs.join(",") : "?"} q=${r.move_quality}`)
    })
    .catch((e) => console.error(`${s.name}: FAILED ${e.message}`))
}