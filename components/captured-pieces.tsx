"use client"

import { cn } from "@/lib/utils"
import type { GameState } from "@/lib/chess-engine"

type CapturedPiecesProps = {
  gameState: GameState
  color: "w" | "b"
  isTop?: boolean
}

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
}

const PIECE_SYMBOLS: Record<string, string> = {
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
}

const INITIAL_PIECES: Record<string, number> = {
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
}

export function CapturedPieces({ gameState, color, isTop = false }: CapturedPiecesProps) {
  // Count current pieces on board for each side
  const pieceCounts: Record<string, Record<string, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0 },
  }

  for (const row of gameState.board) {
    for (const piece of row) {
      if (piece && piece.type !== "k") {
        pieceCounts[piece.color][piece.type]++
      }
    }
  }

  // Calculate captured pieces (what the opponent lost, which we display as captured by this side)
  const opponentColor = color === "w" ? "b" : "w"
  const capturedPieces: string[] = []

  for (const pieceType of ["q", "r", "b", "n", "p"]) {
    const captured = INITIAL_PIECES[pieceType] - pieceCounts[opponentColor][pieceType]
    for (let i = 0; i < captured; i++) {
      capturedPieces.push(pieceType)
    }
  }

  // Calculate material advantage
  let myMaterial = 0
  let oppMaterial = 0

  for (const pieceType of Object.keys(PIECE_VALUES)) {
    myMaterial += pieceCounts[color][pieceType] * PIECE_VALUES[pieceType]
    oppMaterial += pieceCounts[opponentColor][pieceType] * PIECE_VALUES[pieceType]
  }

  const advantage = myMaterial - oppMaterial

  if (capturedPieces.length === 0) {
    return <div className="h-6" /> // Reserve space for layout consistency
  }

  return (
    <div className={cn("flex items-center gap-0.5 h-6 px-1", isTop ? "justify-start" : "justify-start")}>
      <div className="flex items-center -space-x-1">
        {capturedPieces.map((piece, idx) => (
          <span
            key={idx}
            className={cn(
              "text-base select-none",
              color === "w"
                ? "text-gray-900 drop-shadow-[0_1px_1px_rgba(255,255,255,0.3)]"
                : "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]",
            )}
          >
            {PIECE_SYMBOLS[piece]}
          </span>
        ))}
      </div>
      {advantage > 0 && <span className="text-xs text-muted-foreground ml-1">+{advantage}</span>}
    </div>
  )
}
