"use client"

import type { MoveEvaluation } from "@/lib/adaptive-ai"
import type { PlayerStats } from "@/lib/adaptive-ai"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Undo2 } from "lucide-react"

type AIFeedbackProps = {
  evaluation: MoveEvaluation | null
  analysis: string
  isAnalyzing: boolean
  isThinking: boolean
  playerStats: PlayerStats | null
  aiElo: number
  difficulty: number
  eloHistory?: number[]
  onUndo?: () => void
}

const EVALUATION_CONFIG = {
  brilliant: { label: "Brilliant!", color: "bg-cyan-500 text-white" },
  excellent: { label: "Excellent", color: "bg-green-500 text-white" },
  good: { label: "Good", color: "bg-emerald-600 text-white" },
  inaccuracy: { label: "Inaccuracy", color: "bg-yellow-500 text-black" },
  mistake: { label: "Mistake", color: "bg-orange-500 text-white" },
  blunder: { label: "Blunder", color: "bg-red-500 text-white" },
}

/**
 * Tiny sparkline of the bot Elo trajectory this game, with the net change.
 * Values are [history..., current] so a single point renders no line.
 */
function EloSparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const width = 44
  const height = 14
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (width - 2) + 1
      const y = height - 2 - ((v - min) / range) * (height - 4)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  const delta = values[values.length - 1] - values[0]
  return (
    <span
      className="flex items-center gap-1"
      title={`Bot Elo this game: ${values[0]} → ${values[values.length - 1]}`}
    >
      <svg width={width} height={height} aria-hidden="true">
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-primary" />
      </svg>
      <span
        className={`font-mono text-[10px] ${
          delta > 0 ? "text-green-500" : delta < 0 ? "text-red-500" : "text-muted-foreground"
        }`}
      >
        {delta > 0 ? `+${delta}` : delta}
      </span>
    </span>
  )
}

export function AIFeedback({
  evaluation,
  analysis,
  isAnalyzing,
  isThinking,
  playerStats,
  aiElo,
  difficulty,
  eloHistory,
  onUndo,
}: AIFeedbackProps) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-2 space-y-2">
        {playerStats && (
          <div className="flex items-center justify-between text-[11px] border-b border-border pb-1.5">
            <span className="text-muted-foreground">
              You: <span className="font-mono font-bold text-primary">{playerStats.skillRating}</span>
            </span>
            <span className="text-muted-foreground flex items-center gap-1.5">
              AI: <span className="font-mono">~{aiElo}</span>
              <EloSparkline values={eloHistory ?? [aiElo]} />
            </span>
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
              Lv.{difficulty}
            </Badge>
          </div>
        )}

        {!evaluation ? (
          <p className="text-xs text-muted-foreground py-1">Make a move for feedback</p>
        ) : (
          <>
            {isThinking && (
              <div className="flex items-center gap-2 py-1">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                <span className="text-xs text-muted-foreground">AI considering move...</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Badge className={EVALUATION_CONFIG[evaluation.type].color + " text-[10px] px-1.5 h-5"}>
                  {EVALUATION_CONFIG[evaluation.type].label}
                </Badge>
                {evaluation.centipawnLoss > 0 && (
                  <span className="text-[10px] text-muted-foreground font-mono">-{evaluation.centipawnLoss}cp</span>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground font-mono">
                {evaluation.from}-{evaluation.to}
              </span>
            </div>

            {evaluation.bestMove && (
              <p className="text-[11px] text-muted-foreground">
                Better: {" "}
                <span className="font-mono text-foreground">
                  {evaluation.bestMove.from}-{evaluation.bestMove.to}
                </span>
              </p>
            )}

            {isAnalyzing ? (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-spin" />
                <span>Analyzing...</span>
              </div>
            ) : analysis ? (
              <div className="p-1.5 bg-secondary/50 rounded text-[11px] text-foreground leading-relaxed max-h-20 overflow-y-auto">
                {analysis}
              </div>
            ) : null}

            {evaluation.type === "blunder" && onUndo && (
              <div className="flex justify-center pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onUndo}
                  className="gap-2 px-6 border-foreground/50 hover:bg-foreground/10 bg-transparent"
                >
                  <Undo2 className="w-4 h-4" />
                  undo
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
