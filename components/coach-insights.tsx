"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { TrendingUp, Bot, Trophy, XCircle, Minus, Inbox } from "lucide-react"
import { recurringFindingText, type CrossGameSummary } from "@/lib/pattern-profile"
import type { GameHistoryRow } from "@/lib/db/db"

type PatternsPayload = {
  summary: CrossGameSummary
  headline: string
  games: GameHistoryRow[]
  skills: {
    tactics: number
    position: number
    endgame: number
    rating: number
  }
}

type CoachInsightsProps = {
  open: boolean
  onClose: () => void
}

const SKILL_LABELS: { key: keyof PatternsPayload["skills"]; label: string; detail: string }[] = [
  { key: "tactics", label: "Tactics", detail: "captures & checks" },
  { key: "position", label: "Position", detail: "quiet moves" },
  { key: "endgame", label: "Endgame", detail: "moves after 35" },
]

function ResultBadge({ result }: { result: number }) {
  const config =
    result === 1
      ? { icon: Trophy, label: "W", className: "text-green-500 border-green-500/40" }
      : result === 0
        ? { icon: XCircle, label: "L", className: "text-red-500 border-red-500/40" }
        : { icon: Minus, label: "D", className: "text-yellow-500 border-yellow-500/40" }
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-bold ${config.className}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso.replace(" ", "T"))
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function CoachInsights({ open, onClose }: CoachInsightsProps) {
  const [data, setData] = useState<PatternsPayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setData(null)
    fetch("/api/patterns")
      .then((res) => res.json())
      .then((payload: PatternsPayload) => {
        if (!cancelled) setData(payload)
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const skillBars = data ? SKILL_LABELS.map(({ key, label, detail }) => ({
    label,
    detail,
    value: data.skills[key],
  })) : []
  const recurring = data
    ? data.summary.recurringFindings.map((f) => ({ ...f, text: recurringFindingText(f.id) })).filter((f) => f.text)
    : []

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg bg-card border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Coach Insights
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            What the coach knows about your play, straight from your saved games.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : !data || (data.summary.games === 0 && data.games.length === 0) ? (
          <div className="py-10 flex flex-col items-center gap-3 text-center">
            <Inbox className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">
              No finished games yet. Play a game and the coach will start spotting patterns here.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {data.headline && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50 border border-border">
                <Bot className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">{data.headline}</p>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Skill scores</p>
              {skillBars.map(({ label, detail, value }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-muted-foreground">{label}</span>
                  <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
                  </div>
                  <span className="w-8 text-right font-mono text-xs">{value}</span>
                  <span className="hidden sm:block w-28 text-right text-[11px] text-muted-foreground/60">{detail}</span>
                </div>
              ))}
            </div>

            {recurring.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Recurring patterns (across games)
                </p>
                <ul className="space-y-1.5">
                  {recurring.map((f) => (
                    <li key={f.id} className="flex items-start justify-between gap-2 text-sm">
                      <span className="text-foreground">{f.text}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{f.games} games</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.games.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent games</p>
                <ul className="divide-y divide-border border border-border rounded-lg">
                  {data.games.slice(0, 10).map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div className="flex items-center gap-3">
                        <ResultBadge result={g.result} />
                        <span className="font-mono text-xs text-foreground">
                          {formatDate(g.createdAt)} · {g.totalMoves} moves
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">
                          vs ~{g.aiElo} Elo → <span className="font-mono text-primary">{g.playerEloAfter}</span>
                        </span>
                        <span className={g.blunders > 0 ? "text-red-500" : "text-green-500"}>
                          {g.blunders} blunder{g.blunders === 1 ? "" : "s"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}