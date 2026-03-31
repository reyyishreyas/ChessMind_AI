"use client"

import type { PlayerStats } from "@/lib/adaptive-ai"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Trophy, TrendingUp, Target, Zap, Award, Star } from "lucide-react"

type PlayerStatsPanelProps = {
  stats: PlayerStats
}

export function PlayerStatsPanel({ stats }: PlayerStatsPanelProps) {
  const getEloTier = (elo: number): string => {
    if (elo < 600) return "Beginner"
    if (elo < 800) return "Novice"
    if (elo < 1000) return "Amateur"
    if (elo < 1200) return "Club Player"
    if (elo < 1400) return "Intermediate"
    if (elo < 1600) return "Advanced"
    if (elo < 1800) return "Expert"
    if (elo < 2000) return "Candidate Master"
    if (elo < 2200) return "Master"
    return "Grandmaster"
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          Your Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <Award className="w-3 h-3" />
              ELO Rating
            </span>
            <div className="text-right">
              <span className="font-bold text-foreground text-lg">{stats.skillRating}</span>
              <span className="text-xs text-muted-foreground ml-2">({getEloTier(stats.skillRating)})</span>
            </div>
          </div>
          <Progress value={Math.min(100, (stats.skillRating - 100) / 25)} className="h-2" />
        </div>

        {/* Accuracy */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <Target className="w-3 h-3" />
              Accuracy
            </span>
            <span className="font-bold text-foreground">{stats.averageAccuracy}%</span>
          </div>
          <Progress value={stats.averageAccuracy} className="h-2" />
        </div>

        {/* Game Stats */}
        <div className="grid grid-cols-3 gap-2 pt-2">
          <div className="text-center p-2 bg-secondary/50 rounded-lg">
            <p className="text-lg font-bold text-green-500">{stats.wins}</p>
            <p className="text-xs text-muted-foreground">Wins</p>
          </div>
          <div className="text-center p-2 bg-secondary/50 rounded-lg">
            <p className="text-lg font-bold text-red-500">{stats.losses}</p>
            <p className="text-xs text-muted-foreground">Losses</p>
          </div>
          <div className="text-center p-2 bg-secondary/50 rounded-lg">
            <p className="text-lg font-bold text-muted-foreground">{stats.draws}</p>
            <p className="text-xs text-muted-foreground">Draws</p>
          </div>
        </div>

        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">Move Quality Distribution</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center justify-between p-1.5 bg-cyan-500/10 rounded">
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3 text-cyan-500" />
                Brilliant
              </span>
              <span className="text-cyan-500 font-bold">{stats.brilliantMoves}</span>
            </div>
            <div className="flex items-center justify-between p-1.5 bg-green-500/10 rounded">
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3 text-green-500" />
                Excellent
              </span>
              <span className="text-green-500 font-bold">{stats.excellentMoves || 0}</span>
            </div>
            <div className="flex items-center justify-between p-1.5 bg-emerald-500/10 rounded">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-500" />
                Good
              </span>
              <span className="text-emerald-500 font-bold">{stats.goodMoves}</span>
            </div>
            <div className="flex items-center justify-between p-1.5 bg-yellow-500/10 rounded">
              <span>Inaccuracies</span>
              <span className="text-yellow-500 font-bold">{stats.inaccuracies || 0}</span>
            </div>
            <div className="flex items-center justify-between p-1.5 bg-orange-500/10 rounded">
              <span>Mistakes</span>
              <span className="text-orange-500 font-bold">{stats.mistakes}</span>
            </div>
            <div className="flex items-center justify-between p-1.5 bg-red-500/10 rounded">
              <span>Blunders</span>
              <span className="text-red-500 font-bold">{stats.blunders}</span>
            </div>
          </div>
        </div>

        {stats.totalMovesAnalyzed > 0 && (
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Avg. Centipawn Loss</span>
              <span className="font-mono text-foreground">
                {Math.round(stats.totalCentipawnLoss / stats.totalMovesAnalyzed)} cp
              </span>
            </div>
          </div>
        )}

        {/* Streak */}
        {stats.currentStreak !== 0 && (
          <div className="pt-2 border-t border-border text-center">
            <span className={`text-sm font-medium ${stats.currentStreak > 0 ? "text-green-500" : "text-red-500"}`}>
              {stats.currentStreak > 0
                ? `${stats.currentStreak} Win Streak!`
                : `${Math.abs(stats.currentStreak)} Game Losing Streak`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
