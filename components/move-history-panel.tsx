"use client"

import { useMemo } from "react"
import type { GameState } from "@/lib/chess-engine"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type MoveHistoryPanelProps = {
  moveNotations: string[]
  gameState: GameState
  isThinking: boolean
}

export function MoveHistoryPanel({ moveNotations, gameState, isThinking }: MoveHistoryPanelProps) {
  const pairs = useMemo(() => {
    const result: string[][] = []
    for (let i = 0; i < moveNotations.length; i += 2) {
      result.push([moveNotations[i], moveNotations[i + 1]])
    }
    return result
  }, [moveNotations])

  const status = useMemo(() => {
    if (gameState.isCheckmate) {
      const winner = gameState.turn === "w" ? "Black" : "White"
      return { text: `Checkmate! ${winner} wins`, color: "text-yellow-500" }
    }
    if (gameState.isStalemate) return { text: "Stalemate", color: "text-muted-foreground" }
    if (gameState.isDraw) return { text: "Draw", color: "text-muted-foreground" }
    if (gameState.isCheck) return { text: "Check!", color: "text-red-500" }
    return null
  }, [gameState.isCheckmate, gameState.isStalemate, gameState.isDraw, gameState.isCheck, gameState.turn])

  return (
    <Card className="bg-card border-border h-full flex flex-col">
      <CardHeader className="py-1.5 px-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium">Move History</CardTitle>
          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono">
            {gameState.turn === "w" ? "White" : "Black"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-2 flex-1 min-h-0 overflow-hidden">
        {status && (
          <div className={`flex items-center gap-1 mb-1.5 p-1 bg-secondary/50 rounded text-[11px] ${status.color}`}>
            <span className="font-medium">{status.text}</span>
          </div>
        )}

        <div className="h-full overflow-y-auto">
          {pairs.length === 0 ? (
            <p className="text-[11px] text-muted-foreground text-center py-3">No moves yet</p>
          ) : (
            <div className="space-y-px">
              {pairs.map((pair, index) => (
                <div
                  key={index}
                  className="flex items-center text-[11px] font-mono py-0.5 hover:bg-secondary/30 rounded px-1"
                >
                  <span className="w-5 text-muted-foreground">{index + 1}.</span>
                  <span className="w-12 text-foreground">{pair[0]}</span>
                  <span className="w-12 text-foreground">{pair[1] || ""}</span>
                </div>
              ))}
              {isThinking && moveNotations.length % 2 === 0 && (
                <div className="flex items-center text-[11px] font-mono py-0.5 px-1">
                  <span className="w-5 text-muted-foreground">{pairs.length + 1}.</span>
                  <span className="w-12 text-muted-foreground animate-pulse">...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
