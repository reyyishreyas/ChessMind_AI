"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Crown, Play } from "lucide-react"
import { cn } from "@/lib/utils"

type GameSetupModalProps = {
  open: boolean
  onStartGame: (color: "w" | "b", initialElo: number) => void
  onClose?: () => void // Added close handler
  isFirstGame: boolean
  currentElo: number
}

const ELO_PRESETS = [
  { value: 400, label: "Complete Beginner", description: "Just learning the rules" },
  { value: 800, label: "Casual Player", description: "Know basics, play occasionally" },
  { value: 1000, label: "Club Player", description: "Regular player, understand tactics" },
  { value: 1200, label: "Intermediate", description: "Solid fundamentals" },
  { value: 1500, label: "Advanced", description: "Strong tactical and positional play" },
  { value: 1800, label: "Expert", description: "Tournament level player" },
  { value: 2000, label: "Master", description: "Highly skilled player" },
]

export function GameSetupModal({ open, onStartGame, onClose, isFirstGame, currentElo }: GameSetupModalProps) {
  const [selectedColor, setSelectedColor] = useState<"w" | "b">("w")
  const [eloInput, setEloInput] = useState<string>(isFirstGame ? "1000" : currentElo.toString())
  const [selectedPreset, setSelectedPreset] = useState<number | null>(isFirstGame ? 1000 : null)

  const handlePresetClick = (value: number) => {
    setSelectedPreset(value)
    setEloInput(value.toString())
  }

  const handleStart = () => {
    const elo = Math.max(100, Math.min(3000, Number.parseInt(eloInput) || 1000))
    onStartGame(selectedColor, elo)
  }

  const handleClose = () => {
    if (!isFirstGame && onClose) {
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-lg bg-card border-border" showCloseButton={!isFirstGame}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Crown className="w-5 h-5 text-primary" />
            {isFirstGame ? "Welcome to ChessMind AI!" : "New Game Setup"}
          </DialogTitle>
          <DialogDescription>
            {isFirstGame
              ? "Set up your profile to get started with adaptive AI training."
              : "Configure your next game against the adaptive AI."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Color Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Choose Your Color</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedColor("w")}
                className={cn(
                  "p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2",
                  selectedColor === "w"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50 bg-secondary/30",
                )}
              >
                <div className="w-12 h-12 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center text-3xl shadow-md">
                  ♔
                </div>
                <span className="font-medium text-foreground">Play as White</span>
                <span className="text-xs text-muted-foreground">Move first</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedColor("b")}
                className={cn(
                  "p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2",
                  selectedColor === "b"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50 bg-secondary/30",
                )}
              >
                <div className="w-12 h-12 rounded-full bg-gray-900 border-2 border-gray-700 flex items-center justify-center text-3xl shadow-md">
                  <span className="text-white">♚</span>
                </div>
                <span className="font-medium text-foreground">Play as Black</span>
                <span className="text-xs text-muted-foreground">Respond to White</span>
              </button>
            </div>
          </div>

          {/* ELO Selection - Only for first game */}
          {isFirstGame && (
            <div className="space-y-3">
              <Label className="text-base font-semibold">What's Your Skill Level?</Label>
              <p className="text-sm text-muted-foreground">
                Select your approximate ELO rating. The AI will adapt to your skill level.
              </p>

              <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-1">
                {ELO_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => handlePresetClick(preset.value)}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-all",
                      selectedPreset === preset.value
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50 bg-secondary/30",
                    )}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm text-foreground">{preset.label}</span>
                      <span className="text-xs font-mono text-primary">{preset.value}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{preset.description}</p>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Label htmlFor="custom-elo" className="text-sm whitespace-nowrap">
                  Or enter custom ELO:
                </Label>
                <Input
                  id="custom-elo"
                  type="number"
                  min={100}
                  max={3000}
                  value={eloInput}
                  onChange={(e) => {
                    setEloInput(e.target.value)
                    setSelectedPreset(null)
                  }}
                  className="w-24 font-mono"
                />
              </div>
            </div>
          )}

          {/* Current ELO display for returning players */}
          {!isFirstGame && (
            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Your Current ELO</span>
                <span className="text-2xl font-bold font-mono text-primary">{currentElo}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                The AI will match your skill level and adapt as you play.
              </p>
            </div>
          )}

          <Button onClick={handleStart} className="w-full" size="lg">
            <Play className="w-4 h-4 mr-2" />
            Start Game
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
