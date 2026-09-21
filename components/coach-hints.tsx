"use client"

import { BookOpen, Lightbulb, ShieldAlert, Swords } from "lucide-react"
import type { CoachHintsPayload } from "@/lib/coach-hints"

type CoachHintsProps = {
  hints: CoachHintsPayload | null
}

export function CoachHints({ hints }: CoachHintsProps) {
  if (!hints) return null
  const hasAny = hints.opening || hints.threat || hints.fork || hints.suggestion
  if (!hasAny) return null

  return (
    <div className="flex-shrink-0 space-y-2 p-2 rounded-lg bg-secondary/40 border border-border/60">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Coach hints</p>

      {hints.threat && (
        <div className="flex items-start gap-2 p-1.5 rounded bg-red-500/10 border border-red-500/30">
          <ShieldAlert className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-red-400">
              Danger: {hints.threat.attackedType} on {hints.threat.attacked}
            </p>
            <p className="text-[11px] text-foreground/90 leading-snug">{hints.threat.explanation}</p>
          </div>
        </div>
      )}

      {hints.fork && (
        <div className="flex items-start gap-2 p-1.5 rounded bg-orange-500/10 border border-orange-500/30">
          <Swords className="w-3.5 h-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-orange-400">Tactic available: {hints.fork.san}</p>
            <p className="text-[11px] text-foreground/90 leading-snug">{hints.fork.explanation}</p>
          </div>
        </div>
      )}

      {hints.suggestion && (
        <div className="flex items-start gap-2 p-1.5 rounded bg-emerald-500/10 border border-emerald-500/30">
          <Lightbulb className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-emerald-400">Try {hints.suggestion.san}</p>
            <p className="text-[11px] text-foreground/90 leading-snug">{hints.suggestion.explanation}</p>
          </div>
        </div>
      )}

      {hints.opening && (
        <div className="flex items-start gap-2">
          <BookOpen className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-foreground leading-snug">
            <span className="font-semibold">{hints.opening}.</span>{" "}
            <span className="text-muted-foreground">{hints.tip}</span>
          </p>
        </div>
      )}
    </div>
  )
}