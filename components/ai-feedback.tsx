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

export function AIFeedback({
  evaluation,
  analysis,
  isAnalyzing,
  isThinking,
  playerStats,
  aiElo,
  difficulty,
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
            <span className="text-muted-foreground">
              AI: <span className="font-mono">~{aiElo}</span>
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
