"use client"

import type { GameState } from "@/lib/chess-engine"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { History, Crown, Swords, HandshakeIcon } from "lucide-react"

type GameSidebarProps = {
  moveNotations: string[]
  gameState: GameState
  isThinking: boolean
}

export function GameSidebar({ moveNotations, gameState, isThinking }: GameSidebarProps) {
  const pairs: string[][] = []
  for (let i = 0; i < moveNotations.length; i += 2) {
    pairs.push([moveNotations[i], moveNotations[i + 1]])
  }

  const getGameStatus = () => {
    if (gameState.isCheckmate) {
      const winner = gameState.turn === "w" ? "Black" : "White"
      return { text: `Checkmate! ${winner} wins!`, icon: Crown, color: "text-yellow-500" }
    }
    if (gameState.isStalemate) {
      return { text: "Stalemate - Draw!", icon: HandshakeIcon, color: "text-muted-foreground" }
    }
    if (gameState.isDraw) {
      return { text: "Draw by 50-move rule", icon: HandshakeIcon, color: "text-muted-foreground" }
    }
    if (gameState.isCheck) {
      return { text: "Check!", icon: Swords, color: "text-red-500" }
    }
    return null
  }

  const status = getGameStatus()

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            Move History
          </CardTitle>
          <Badge variant="outline" className="font-mono text-xs">
            {gameState.turn === "w" ? "White" : "Black"} to move
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {status && (
          <div className={`flex items-center gap-2 mb-3 p-2 bg-secondary/50 rounded-lg ${status.color}`}>
            <status.icon className="w-4 h-4" />
            <span className="text-sm font-medium">{status.text}</span>
          </div>
        )}

        <ScrollArea className="h-[200px]">
          {pairs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No moves yet. Start playing!</p>
          ) : (
            <div className="space-y-1">
              {pairs.map((pair, index) => (
                <div key={index} className="flex items-center text-sm font-mono">
                  <span className="w-8 text-muted-foreground">{index + 1}.</span>
                  <span className="w-16 text-foreground">{pair[0]}</span>
                  <span className="w-16 text-foreground">{pair[1] || ""}</span>
                </div>
              ))}
              {isThinking && moveNotations.length % 2 === 0 && (
                <div className="flex items-center text-sm font-mono">
                  <span className="w-8 text-muted-foreground">{pairs.length + 1}.</span>
                  <span className="w-16 text-muted-foreground animate-pulse">...</span>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
