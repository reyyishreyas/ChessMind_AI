"use client"

import { cn } from "@/lib/utils"
import { getEvaluationBarValue } from "@/lib/stockfish-eval"

type EvaluationBarProps = {
  evaluation: number
  playerColor: "w" | "b"
}

export function EvaluationBar({ evaluation, playerColor }: EvaluationBarProps) {
  const barValue = getEvaluationBarValue(evaluation)
  const percentage = ((barValue + 1) / 2) * 100
  const displayPercentage = playerColor === "b" ? 100 - percentage : percentage

  const displayEval = Math.abs(evaluation / 100).toFixed(1)
  const isWhiteAdvantage = evaluation > 0

  return (
    <div className="flex flex-col items-center gap-1 h-full w-full">
      <div
        className={cn(
          "text-[10px] font-mono font-bold px-1 py-0.5 rounded",
          isWhiteAdvantage ? "bg-eval-white text-background" : "bg-eval-black text-foreground",
        )}
      >
        {isWhiteAdvantage ? "+" : "-"}
        {displayEval}
      </div>

      <div className="relative w-full flex-1 bg-eval-black rounded overflow-hidden border border-board-border">
        <div
          className="absolute inset-x-0 bottom-0 bg-eval-white transition-all duration-300 ease-out"
          style={{ height: `${displayPercentage}%` }}
        />
        <div className="absolute inset-x-0 top-1/2 h-px bg-primary/60 -translate-y-1/2" />
      </div>
    </div>
  )
}
