"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Undo2, ArrowRight } from "lucide-react"
import type { MoveEvaluation } from "@/lib/adaptive-ai"

type BlunderAlertProps = {
  open: boolean
  evaluation: MoveEvaluation | null
  onUndo: () => void
  onDismiss: () => void
}

export function BlunderAlert({ open, evaluation, onUndo, onDismiss }: BlunderAlertProps) {
  if (!evaluation) return null

  const isBlunder = evaluation.type === "blunder"
  const isMistake = evaluation.type === "mistake"

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onDismiss()}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <AlertTriangle className={isBlunder ? "text-red-500" : "text-orange-500"} />
            {isBlunder ? "Blunder Detected!" : "Mistake Detected!"}
          </DialogTitle>
          <DialogDescription>
            {isBlunder
              ? "You made a significant error. Let's learn from it!"
              : "That wasn't the best move. Here's what you could do better."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-4 rounded-lg bg-secondary/50 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-muted-foreground">Your move:</span>
              <span className="font-mono font-bold">
                {evaluation.from} → {evaluation.to}
              </span>
            </div>
            <div className="text-sm text-red-400">Centipawn loss: {evaluation.centipawnLoss}cp</div>
          </div>

          {evaluation.bestMove && (
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
              <div className="flex items-center gap-2 mb-2">
                <ArrowRight className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-green-400">Best move was:</span>
              </div>
              <span className="font-mono font-bold text-green-400 text-lg">
                {evaluation.bestMove.from} → {evaluation.bestMove.to}
              </span>
              <p className="text-xs text-muted-foreground mt-2">
                Try this move to practice finding the best continuation.
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={onUndo} className="flex-1" variant="default">
              <Undo2 className="w-4 h-4 mr-2" />
              Undo & Try Again
            </Button>
            <Button onClick={onDismiss} variant="outline" className="flex-1 bg-transparent">
              Continue Anyway
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
