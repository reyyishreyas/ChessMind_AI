"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Trophy, XCircle, Minus, Lightbulb, RotateCcw } from "lucide-react"

type GameResultModalProps = {
  open: boolean
  result: "win" | "loss" | "draw"
  tip: string
  playerElo: number
  onNewGame: () => void
  onClose: () => void
}

const RESULT_CONFIG = {
  win: {
    icon: Trophy,
    title: "Victory!",
    description: "Congratulations, you won the game!",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
  },
  loss: {
    icon: XCircle,
    title: "Defeat",
    description: "You lost this game. Keep practicing!",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
  },
  draw: {
    icon: Minus,
    title: "Draw",
    description: "The game ended in a draw.",
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
  },
}

export function GameResultModal({ open, result, tip, playerElo, onNewGame, onClose }: GameResultModalProps) {
  const config = RESULT_CONFIG[result]
  const Icon = config.icon

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border" showCloseButton={false}>
        <DialogHeader className="text-center items-center">
          <div
            className={`w-16 h-16 rounded-full ${config.bgColor} ${config.borderColor} border-2 flex items-center justify-center mb-2`}
          >
            <Icon className={`w-8 h-8 ${config.color}`} />
          </div>
          <DialogTitle className={`text-2xl ${config.color}`}>{config.title}</DialogTitle>
          <DialogDescription className="text-muted-foreground">{config.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* ELO Display */}
          <div className="text-center p-3 rounded-lg bg-secondary/50 border border-border">
            <span className="text-sm text-muted-foreground">Your Rating: </span>
            <span className="font-mono font-bold text-primary text-lg">{playerElo}</span>
          </div>

          {/* Tip Section */}
          {tip && (
            <div className={`p-4 rounded-lg ${config.bgColor} ${config.borderColor} border`}>
              <div className="flex items-start gap-3">
                <Lightbulb className={`w-5 h-5 ${config.color} flex-shrink-0 mt-0.5`} />
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Tip</p>
                  <p className="text-sm text-muted-foreground">{tip}</p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button onClick={onNewGame} className="flex-1" size="lg">
              <RotateCcw className="w-4 h-4 mr-2" />
              New Game
            </Button>
            <Button onClick={onClose} variant="outline" className="flex-1 bg-transparent" size="lg">
              Review Board
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
