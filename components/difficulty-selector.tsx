"use client"

import type { DifficultyLevel } from "@/lib/adaptive-ai"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Target } from "lucide-react"

type DifficultySelectorProps = {
  difficulty: DifficultyLevel
  onDifficultyChange: (level: DifficultyLevel) => void
  disabled?: boolean
}

const DIFFICULTY_LABELS: Record<DifficultyLevel, { name: string; description: string }> = {
  1: { name: "Beginner", description: "Learning the basics" },
  2: { name: "Novice", description: "Starting your journey" },
  3: { name: "Amateur", description: "Getting comfortable" },
  4: { name: "Intermediate", description: "Building skills" },
  5: { name: "Club Player", description: "Solid fundamentals" },
  6: { name: "Advanced", description: "Strong tactical play" },
  7: { name: "Expert", description: "Deep strategic understanding" },
  8: { name: "Master", description: "Highly skilled opponent" },
  9: { name: "Grandmaster", description: "Elite level play" },
  10: { name: "Legendary", description: "The ultimate challenge" },
}

export function DifficultySelector({ difficulty, onDifficultyChange, disabled }: DifficultySelectorProps) {
  const label = DIFFICULTY_LABELS[difficulty]

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            AI Difficulty
          </CardTitle>
          <Badge variant="secondary" className="font-mono">
            Level {difficulty}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Slider
          value={[difficulty]}
          onValueChange={([value]) => onDifficultyChange(value as DifficultyLevel)}
          min={1}
          max={10}
          step={1}
          disabled={disabled}
          className="py-2"
        />
        <div className="text-center">
          <p className="font-semibold text-foreground">{label.name}</p>
          <p className="text-sm text-muted-foreground">{label.description}</p>
        </div>
        {disabled && <p className="text-xs text-muted-foreground text-center">Reset game to change difficulty</p>}
        <p className="text-xs text-muted-foreground text-center">Difficulty adapts based on your performance!</p>
      </CardContent>
    </Card>
  )
}
