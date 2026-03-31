"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useState } from "react"

type GameControlsProps = {
  onUndo: () => void
  onRedo: () => void
  onCopyPGN: () => void
  onNewGame: () => void
  canUndo: boolean
  canRedo: boolean
  gameStarted: boolean
}

export function GameControls({
  onUndo,
  onRedo,
  onCopyPGN,
  onNewGame,
  canUndo,
  canRedo,
  gameStarted,
}: GameControlsProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    onCopyPGN()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-1.5">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onUndo}
            disabled={!canUndo}
            className="h-7 px-2 text-[11px] flex-1"
          >
            Undo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRedo}
            disabled={!canRedo}
            className="h-7 px-2 text-[11px] flex-1"
          >
            Redo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            disabled={!gameStarted}
            className="h-7 px-2 text-[11px] flex-1"
          >
            {copied ? "Copied!" : "PGN"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onNewGame}
            className="h-7 px-2 text-[11px] flex-1 bg-transparent"
          >
            New
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
