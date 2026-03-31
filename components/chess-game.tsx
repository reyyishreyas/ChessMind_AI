"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { ChessBoard } from "./chess-board"
import { MoveHistoryPanel } from "./move-history-panel"
import { AIFeedback } from "./ai-feedback"
import { GameSetupModal } from "./game-setup-modal"
import { GameControls } from "./game-controls"
import { GameResultModal } from "./game-result-modal"
import { CapturedPieces } from "./captured-pieces"
import {
  type GameState,
  createInitialState,
  makeMove,
  getValidMoves,
  moveToAlgebraic,
  type Square,
} from "@/lib/chess-engine"
import {
  type DifficultyLevel,
  type PlayerStats,
  createDefaultStats,
  getAIMoveAsync,
  evaluatePlayerMove,
  updateStatsAfterMove,
  updateStatsAfterGame,
  type MoveEvaluation,
} from "@/lib/adaptive-ai"
import { eloToDifficulty, getAdaptiveDifficulty, STOCKFISH_LEVELS } from "@/lib/stockfish-eval"
import {
  collectMoveFeatures,
  predictElo,
  calculateEloAfterGame,
  type MoveFeatures,
} from "@/lib/elo-prediction"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

export function ChessGame() {
  const [gameState, setGameState] = useState<GameState>(createInitialState())
  const [gameHistory, setGameHistory] = useState<GameState[]>([createInitialState()])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [validMoves, setValidMoves] = useState<Square[]>([])
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null)
  const [aiLastMove, setAiLastMove] = useState<{ from: Square; to: Square } | null>(null)
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null)
  const [isThinking, setIsThinking] = useState(false)
  const [moveNotations, setMoveNotations] = useState<string[]>([])
  const [currentEvaluation, setCurrentEvaluation] = useState<MoveEvaluation | null>(null)
  const [gameEvaluations, setGameEvaluations] = useState<MoveEvaluation[]>([])
  const [aiAnalysis, setAIAnalysis] = useState<string>("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [gameStarted, setGameStarted] = useState(false)
  const [playerColor, setPlayerColor] = useState<"w" | "b">("w")
  const [showSetupModal, setShowSetupModal] = useState(false)
  const [currentDifficulty, setCurrentDifficulty] = useState<DifficultyLevel>(5)
  const [moveTimes, setMoveTimes] = useState<number[]>([])
  const [moveStartTime, setMoveStartTime] = useState<number>(Date.now())
  const [user, setUser] = useState<User | null>(null)
  const [initialEloSet, setInitialEloSet] = useState(false)
  const [isLoadingSession, setIsLoadingSession] = useState(true)
  const [showGameResult, setShowGameResult] = useState(false)
  const [gameResult, setGameResult] = useState<{ result: "win" | "loss" | "draw"; tip: string } | null>(null)
  const [botElo, setBotElo] = useState<number>(STOCKFISH_LEVELS[5]?.elo || 1200)
  const [botEloHistory, setBotEloHistory] = useState<number[]>([]) // Track ELO history for undo

  // Indicates whether botElo has been initialized at game start
  const botEloInitialized = useRef<boolean>(false)

  const aiMoveInProgress = useRef(false)
  const sessionSaveTimeout = useRef<NodeJS.Timeout | null>(null)
  const gameEndProcessed = useRef(false)

  useEffect(() => {
    const supabase = createClient()

    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        try {
          const res = await fetch("/api/session")
          const { session, profile } = await res.json()

          if (profile) {
            setPlayerStats({
              gamesPlayed: profile.games_played,
              wins: profile.wins,
              losses: profile.losses,
              draws: profile.draws,
              blunders: profile.total_blunders,
              mistakes: profile.total_mistakes,
              inaccuracies: profile.total_inaccuracies,
              goodMoves: profile.total_good_moves,
              excellentMoves: profile.total_excellent_moves,
              brilliantMoves: profile.total_brilliant_moves,
              averageAccuracy: profile.average_accuracy,
              currentStreak: profile.current_streak,
              skillRating: profile.skill_rating,
              tacticsScore: 50,
              positionScore: 50,
              endgameScore: 50,
              totalCentipawnLoss: 0,
              totalMovesAnalyzed: 0,
            })
            setInitialEloSet(profile.initial_elo_set)
          }

          if (session) {
            setGameState(session.game_state)
            setGameHistory(session.game_history)
            setMoveNotations(session.move_notations || [])
            setGameEvaluations(session.game_evaluations || [])
            setPlayerColor(session.player_color)
            setCurrentDifficulty(session.current_difficulty)
            setHistoryIndex(session.history_index)
            setMoveTimes(session.move_times || [])
            setGameStarted(true)
          } else if (!profile?.initial_elo_set) {
            setShowSetupModal(true)
          }
        } catch (e) {
          console.error("Failed to load session:", e)
        }
      } else {
        const saved = localStorage.getItem("chessAI_playerStats")
        if (saved) {
          try {
            const parsed = JSON.parse(saved)
            setPlayerStats(parsed)
            setInitialEloSet(parsed.gamesPlayed > 0)
          } catch {
            setPlayerStats(null)
          }
        }

        const savedSession = localStorage.getItem("chessAI_session")
        if (savedSession) {
          try {
            const session = JSON.parse(savedSession)
            setGameState(session.gameState)
            setGameHistory(session.gameHistory)
            setMoveNotations(session.moveNotations || [])
            setGameEvaluations(session.gameEvaluations || [])
            setPlayerColor(session.playerColor)
            setCurrentDifficulty(session.currentDifficulty)
            setHistoryIndex(session.historyIndex)
            setMoveTimes(session.moveTimes || [])
            if (Array.isArray(session.botEloHistory)) {
              setBotEloHistory(session.botEloHistory)
            }
            setGameStarted(true)
          } catch {
            // Ignore
          }
        }
      }

      setIsLoadingSession(false)
    }

    checkAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (playerStats && !user) {
      localStorage.setItem("chessAI_playerStats", JSON.stringify(playerStats))
    }
  }, [playerStats, user])

  useEffect(() => {
    if (!gameStarted || isLoadingSession) return

    if (sessionSaveTimeout.current) {
      clearTimeout(sessionSaveTimeout.current)
    }

    sessionSaveTimeout.current = setTimeout(() => {
      const sessionData = {
        gameState,
        gameHistory,
        moveNotations,
        gameEvaluations,
        playerColor,
        currentDifficulty,
        historyIndex,
        moveTimes,
        botElo,
        botEloHistory,
      }

      if (user) {
        fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sessionData),
        }).catch(console.error)
      } else {
        localStorage.setItem("chessAI_session", JSON.stringify(sessionData))
      }
    }, 2000)

    return () => {
      if (sessionSaveTimeout.current) {
        clearTimeout(sessionSaveTimeout.current)
      }
    }
  }, [
    gameState,
    gameHistory,
    moveNotations,
    gameEvaluations,
    playerColor,
    currentDifficulty,
    historyIndex,
    moveTimes,
    gameStarted,
    user,
    isLoadingSession,
  ])

  useEffect(() => {
    if (!playerStats) return
    if (gameEndProcessed.current) return

    const isGameOver = gameState.isCheckmate || gameState.isStalemate || gameState.isDraw
    if (!isGameOver) return

    // Mark as processed to prevent re-running
    gameEndProcessed.current = true

    let result: "win" | "loss" | "draw"
    let resultNum: number
    let tip: string

    if (gameState.isCheckmate) {
      result = gameState.turn === playerColor ? "loss" : "win"
      resultNum = result === "win" ? 1 : 0
      tip =
        result === "win"
          ? "Great job! Keep practicing tactics to improve your checkmate patterns."
          : "Analyze the game to see where you could have defended better."
    } else {
      result = "draw"
      resultNum = 0.5
      tip = gameState.isStalemate
        ? "Stalemate! Be careful not to trap the opponent's king without giving check."
        : "A draw can be a good result against a stronger opponent!"
    }

    // Show result modal
    setGameResult({ result, tip })
    setShowGameResult(true)

    const prevElo = playerStats.skillRating
    // Calculate ELO using standard formula
    const newElo = calculateEloAfterGame(prevElo, botElo, result)
    // Round to integer for database storage
    const newEloRounded = Math.round(newElo)
    const newStats = { ...playerStats, skillRating: newEloRounded }
    newStats.gamesPlayed++
    if (result === "win") {
      newStats.wins++
      newStats.currentStreak = Math.max(0, newStats.currentStreak) + 1
    } else if (result === "loss") {
      newStats.losses++
      newStats.currentStreak = Math.min(0, newStats.currentStreak) - 1
    } else {
      newStats.draws++
      newStats.currentStreak = 0
    }
    setPlayerStats(newStats)

    if (user) {
      const scores: number[] = gameEvaluations.map((e) => {
        switch (e.type) {
          case "brilliant":
          case "excellent":
            return 1.0
          case "good":
            return 0.9
          case "inaccuracy":
            return 0.5
          case "mistake":
            return 0.25
          case "blunder":
            return 0.0
          default:
            return 0.75
        }
      })
      const ams = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.75 as number
      const variance = scores.length > 1 ? scores.reduce((sum, s) => sum + Math.pow(s - ams, 2), 0) / scores.length : 0
      const stdDev = Math.sqrt(variance)
      const avgTime = moveTimes.length > 0 ? moveTimes.reduce((a, b) => a + b, 0) / moveTimes.length : 0

      fetch("/api/save-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          result: resultNum,
          playerColor,
          aiElo: Math.round(botElo), // Round to integer for database
          totalMoves: gameEvaluations.length,
          excellentMoves: gameEvaluations.filter((e) => e.type === "excellent" || e.type === "brilliant").length,
          goodMoves: gameEvaluations.filter((e) => e.type === "good").length,
          inaccurateMoves: gameEvaluations.filter((e) => e.type === "inaccuracy").length,
          mistakes: gameEvaluations.filter((e) => e.type === "mistake").length,
          blunders: gameEvaluations.filter((e) => e.type === "blunder").length,
          ams,
          stdDeviation: stdDev,
          avgTimePerMove: avgTime,
          playerEloBefore: Math.round(prevElo),
          playerEloAfter: newStats.skillRating, // Already rounded above
          currentBotElo: Math.round(botElo),
        }),
      }).catch(console.error)

      fetch("/api/session", { method: "DELETE" }).catch(console.error)
    } else {
      localStorage.removeItem("chessAI_session")
    }
  }, [gameState.isCheckmate, gameState.isStalemate, gameState.isDraw])

  // AI move effect
  useEffect(() => {
    if (!gameStarted || !playerStats) return
    if (gameState.turn === playerColor) return
    if (gameState.isCheckmate || gameState.isStalemate || gameState.isDraw) return
    if (aiMoveInProgress.current) return

    const makeAIMove = async () => {
      aiMoveInProgress.current = true
      setIsThinking(true)

      await new Promise((resolve) => setTimeout(resolve, 300))

      try {
        const aiMove = await getAIMoveAsync(gameState, currentDifficulty, playerStats)

        if (aiMove) {
          const newState = makeMove(gameState, aiMove.from, aiMove.to)
          if (newState) {
            setGameState(newState)
            setGameHistory((prev) => [...prev.slice(0, historyIndex + 1), newState])
            setHistoryIndex((prev) => prev + 1)
            setAiLastMove(aiMove)
            setLastMove(null)
            const notation = moveToAlgebraic(gameState, newState.history[newState.history.length - 1])
            setMoveNotations((prev) => [...prev, notation])
            setMoveStartTime(Date.now())
          }
        }
      } catch (error) {
        console.error("AI move error:", error)
      } finally {
        setIsThinking(false)
        aiMoveInProgress.current = false
      }
    }

    makeAIMove()
  }, [gameState, gameStarted, playerColor, currentDifficulty, playerStats, historyIndex])

  const requestAIAnalysis = async (
    stateBefore: GameState,
    stateAfter: GameState,
    evaluation: MoveEvaluation,
    from: Square,
    to: Square,
    moveNumber: number,
    timePerMove: number,
    botMove?: { from: Square; to: Square }
  ) => {
    setIsAnalyzing(true)
    try {
      // Get Gemini analysis with features - ALWAYS request for ALL moves
      const response = await fetch("/api/analyze-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameState: stateAfter,
          stateBefore,
          evaluation,
          moveHistory: moveNotations,
          playerStats: playerStats
            ? { skillRating: playerStats.skillRating, averageAccuracy: playerStats.averageAccuracy }
            : null,
          allEvaluations: gameEvaluations,
          moveTimes,
          botMove,
        }),
      })
      if (!response.ok) {
        throw new Error("Gemini analysis failed")
      }
      let geminiData = await response.json()
      const hasGemini = !!(geminiData && geminiData.move_quality && typeof geminiData.accuracy_score === "number" && geminiData.blunder_risk !== undefined)
      if (!hasGemini) {
        try {
          const retry = await fetch("/api/analyze-move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              gameState: stateAfter,
              stateBefore,
              evaluation,
              moveHistory: moveNotations,
              playerStats: playerStats ? { skillRating: playerStats.skillRating, averageAccuracy: playerStats.averageAccuracy } : null,
              allEvaluations: gameEvaluations,
              moveTimes,
              botMove,
            }),
          })
          geminiData = await retry.json()
        } catch {}
      }
      if (geminiData.analysis) {
        setAIAnalysis(geminiData.analysis)
      }

      // Collect features and predict ELO (only if we have valid data)
      // Model is trained on: move_number,start_eval,end_eval,delta_eval,move_quality,
      // time_per_move,accuracy_score,blunder_risk,flag1,flag2,flag3,last_elo,
      // phase_Endgame,phase_Middlegame,phase_Opening
      console.log("📋 ELO Prediction Check:", {
        hasPlayerStats: !!playerStats,
        hasGeminiData: !!geminiData,
        hasMoveQuality: !!geminiData?.move_quality,
        moveQuality: geminiData?.move_quality,
        botElo,
        condition: !!(playerStats && botElo),
      })

      const readyForModel = !!(playerStats && botElo && geminiData?.move_quality && typeof geminiData?.accuracy_score === "number" && geminiData?.blunder_risk !== undefined)
      if (readyForModel) {
        try {
          console.log("✨ Starting ELO prediction process...")
          const features = await collectMoveFeatures(
            stateBefore,
            stateAfter,
            from,
            to,
            moveNumber,
            timePerMove,
            botElo, // last_elo = bot's current ELO (model predicts new bot ELO)
            evaluation,
            {
              move_quality: geminiData.move_quality,
              accuracy_score: geminiData.accuracy_score,
              blunder_risk: geminiData.blunder_risk,
              flag3: geminiData.flag3 ?? 0,
            },
            playerColor
          )

          // Only predict if features are valid
          if (features && typeof features.last_elo === "number" && features.last_elo > 0) {
            console.log("🔮 Predicting bot ELO with features:", features)

            // Call backend model to get new bot ELO
            const prediction = await predictElo(features)
            console.log("📊 Backend prediction response:", prediction)

            if (prediction.success) {
              const maxStep = 25
              const stepBounded = Math.max(botElo - maxStep, Math.min(botElo + maxStep, prediction.predicted_elo))
              const newBotElo = Math.max(400, Math.min(2200, stepBounded))

              console.log("✅ Bot ELO updated from model:", {
                old: botElo,
                new: newBotElo,
                change: (newBotElo - botElo).toFixed(1),
              })

              setBotEloHistory((prev) => [...prev, botElo])
              setBotElo(Math.round(newBotElo))

              const newDifficulty = eloToDifficulty(newBotElo) as DifficultyLevel
              console.log("🎮 Difficulty updated to:", newDifficulty)
              setCurrentDifficulty(newDifficulty)
            } else {
              console.warn("⚠️ ELO prediction returned success=false, keeping current bot ELO")
            }
          } else {
            console.warn("⚠️ Invalid features for ELO prediction:", features)
          }
        } catch (error) {
          // Log errors for debugging but do NOT adjust bot ELO heuristically
          console.error("❌ Error in ELO prediction (model call):", error)
        }
      } else {
        console.warn("Gemini data missing; skipping ELO prediction for this move")
      }
    } catch (error) {
      console.error("Failed to get AI analysis:", error)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const getDefaultAnalysis = (evaluation: MoveEvaluation, from: Square, to: Square): string => {
    const move = `${from}-${to}`
    switch (evaluation.type) {
      case "brilliant":
        return `Brilliant move! You played ${move}. This exceptional move significantly improves your position.`
      case "excellent":
        return `Excellent move! You played ${move}. This is nearly perfect play.`
      case "good":
        return `Good move! You played ${move}. Solid continuation.`
      case "inaccuracy":
        return `This move ${move} is slightly inaccurate. ${evaluation.bestMove ? `A better option would have been ${evaluation.bestMove.from}-${evaluation.bestMove.to}.` : "Look for more active moves."}`
      case "mistake":
        return `This move ${move} was a mistake. ${evaluation.bestMove ? `You missed ${evaluation.bestMove.from}-${evaluation.bestMove.to} which would have been stronger.` : ""} Think about piece activity and king safety!`
      case "blunder":
        return `This move ${move} was a blunder! ${evaluation.bestMove ? `You should have played ${evaluation.bestMove.from}-${evaluation.bestMove.to} instead.` : ""} Take your time and check for tactics before moving.`
      default:
        return `You played ${move}. Let's see how the game develops.`
    }
  }

  const handleSquareClick = useCallback(
    (square: Square) => {
      if (!gameStarted || !playerStats) return
      if (gameState.turn !== playerColor) return
      if (isThinking) return
      if (gameState.isCheckmate || gameState.isStalemate || gameState.isDraw) return

      const [row, col] = [8 - Number.parseInt(square[1]), square.charCodeAt(0) - 97]
      const clickedPiece = gameState.board[row]?.[col]

      if (selectedSquare) {
        if (clickedPiece && clickedPiece.color === playerColor) {
          setSelectedSquare(square)
          setValidMoves(getValidMoves(gameState, square))
          return
        }

        if (validMoves.includes(square)) {
          const stateBefore = gameState
          const newState = makeMove(gameState, selectedSquare, square)

          if (newState) {
            const moveTime = (Date.now() - moveStartTime) / 1000
            setMoveTimes((prev) => [...prev, moveTime])

            const evaluation = evaluatePlayerMove(stateBefore, selectedSquare, square)
            const moveNumber = Math.floor(moveNotations.length / 2) + 1

            // Set evaluation immediately so user sees feedback
            setCurrentEvaluation(evaluation)
            setGameEvaluations((prev) => [...prev, evaluation])
            setPlayerStats((prev) => (prev ? updateStatsAfterMove(prev, evaluation) : prev))

            setGameState(newState)
            setGameHistory((prev) => [...prev.slice(0, historyIndex + 1), newState])
            setHistoryIndex((prev) => prev + 1)
            setLastMove({ from: selectedSquare, to: square })
            setAiLastMove(null)
            const notation = moveToAlgebraic(stateBefore, newState.history[newState.history.length - 1])
            setMoveNotations((prev) => [...prev, notation])

            // Request analysis asynchronously (don't block UI)
            const lastAiMove = aiLastMove || null
            requestAIAnalysis(
              stateBefore,
              newState,
              evaluation,
              selectedSquare,
              square,
              moveNumber,
              moveTime,
              lastAiMove || undefined
            )
          }
        }

        setSelectedSquare(null)
        setValidMoves([])
      } else {
        if (clickedPiece && clickedPiece.color === playerColor) {
          setSelectedSquare(square)
          setValidMoves(getValidMoves(gameState, square))
        }
      }
    },
    [
      gameState,
      selectedSquare,
      validMoves,
      gameStarted,
      playerColor,
      isThinking,
      playerStats,
      gameEvaluations,
      historyIndex,
      moveStartTime,
    ],
  )

  const handleStartGame = (color: "w" | "b", initialElo: number) => {
    // Ensure player stats are initialized
    const stats = playerStats || createDefaultStats(initialElo)
    if (!playerStats) {
      stats.skillRating = initialElo
    }
    setPlayerStats(stats)
    setPlayerColor(color)

    // At the START of every game, bot ELO = player ELO
    const startElo = Math.round(stats.skillRating || initialElo || 1000)
    setBotElo(startElo)
    botEloInitialized.current = true

    // Difficulty is derived from this common ELO
    const nextDifficulty = eloToDifficulty(startElo) as DifficultyLevel
    setCurrentDifficulty(nextDifficulty)
    setBotEloHistory([])

    const initialState = createInitialState()
    setGameState(initialState)
    setGameHistory([initialState])
    setHistoryIndex(0)
    setSelectedSquare(null)
    setValidMoves([])
    setLastMove(null)
    setAiLastMove(null)
    setMoveNotations([])
    setCurrentEvaluation(null)
    setGameEvaluations([])
    setAIAnalysis("")
    setMoveTimes([])
    setMoveStartTime(Date.now())
    setShowSetupModal(false)
    setInitialEloSet(true)
    gameEndProcessed.current = false
    setShowGameResult(false)
    setGameResult(null)
    aiMoveInProgress.current = false
    setGameStarted(true)

    if (user) {
      const supabase = createClient()
      supabase
        .from("player_profiles")
        .update({
          initial_elo_set: true,
          preferred_color: color,
          skill_rating: initialElo,
          current_bot_elo: Math.round(startElo),
        })
        .eq("id", user.id)
        .then(() => {})
    }
  }

  const handleUndo = () => {
    if (historyIndex > 0 && gameHistory.length > 1) {
      // Undo both player's move and AI's move (go back 2 moves)
      const newIndex = Math.max(0, historyIndex - 2)
      const previousState = gameHistory[newIndex]
      
      setHistoryIndex(newIndex)
      setGameState(previousState)
      setMoveNotations((prev) => prev.slice(0, newIndex))
      setGameEvaluations((prev) => prev.slice(0, Math.floor(newIndex / 2)))
      setMoveTimes((prev) => prev.slice(0, Math.floor(newIndex / 2)))
      setSelectedSquare(null)
      setValidMoves([])
      setLastMove(null)
      setAiLastMove(null)
      setCurrentEvaluation(null)
      setAIAnalysis("")
      
      // Revert bot ELO to previous value
      if (botEloHistory.length > 0) {
        const previousElo = botEloHistory[botEloHistory.length - 1]
        setBotElo(previousElo)
        setBotEloHistory((prev) => prev.slice(0, -1))
        
        // Update difficulty based on reverted ELO
        const newDifficulty = eloToDifficulty(previousElo) as DifficultyLevel
        setCurrentDifficulty(newDifficulty)
      }
    }
  }

  const handleRedo = () => {
    if (historyIndex < gameHistory.length - 1) {
      const newIndex = Math.min(gameHistory.length - 1, historyIndex + 2)
      setHistoryIndex(newIndex)
      setGameState(gameHistory[newIndex])
    }
  }

  const handleCopyPGN = () => {
    const pairs: string[] = []
    for (let i = 0; i < moveNotations.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1
      const white = moveNotations[i]
      const black = moveNotations[i + 1] || ""
      pairs.push(`${moveNum}. ${white} ${black}`)
    }
    const pgnText = pairs.join(" ")
    
    // Try modern clipboard API first, fallback to older method
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pgnText).catch((err) => {
        console.error("Failed to copy to clipboard:", err)
        // Fallback to textarea method
        fallbackCopyTextToClipboard(pgnText)
      })
    } else {
      // Fallback for browsers without clipboard API
      fallbackCopyTextToClipboard(pgnText)
    }
  }

  const fallbackCopyTextToClipboard = (text: string) => {
    const textArea = document.createElement("textarea")
    textArea.value = text
    textArea.style.position = "fixed"
    textArea.style.left = "-999999px"
    textArea.style.top = "-999999px"
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    try {
      document.execCommand("copy")
    } catch (err) {
      console.error("Fallback copy failed:", err)
    }
    document.body.removeChild(textArea)
  }

  const handleNewGame = () => {
    setShowGameResult(false)
    setGameResult(null)
    gameEndProcessed.current = false
    setShowSetupModal(true)
  }

  const handleCloseModal = () => {
    if (gameStarted) {
      setShowSetupModal(false)
    }
  }

  useEffect(() => {
    if (!isLoadingSession && !gameStarted && !initialEloSet) {
      setShowSetupModal(true)
    }
  }, [isLoadingSession, gameStarted, initialEloSet])

  const isFirstGame = !initialEloSet

  if (isLoadingSession) {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-background overflow-hidden flex flex-col">
      <GameSetupModal
        open={showSetupModal}
        onStartGame={handleStartGame}
        onClose={handleCloseModal}
        isFirstGame={isFirstGame}
        currentElo={playerStats?.skillRating || 1000}
      />

      <GameResultModal
        open={showGameResult}
        result={gameResult?.result || "draw"}
        tip={gameResult?.tip || ""}
        playerElo={playerStats?.skillRating || 1000}
        onNewGame={handleNewGame}
        onClose={() => setShowGameResult(false)}
      />

      {/* Compact Header */}
      <header className="flex-shrink-0 h-12 px-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
            C
          </div>
          <span className="font-bold text-foreground">ChessMind AI</span>
        </div>

        <div className="flex items-center gap-3">
          {gameStarted && playerStats ? (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground">
                ELO: <span className="font-mono font-bold text-primary">{playerStats.skillRating}</span>
              </span>
              <span className="text-muted-foreground">
                vs AI: <span className="font-mono">~{Math.round(botElo)}</span>
              </span>
              <span className="text-muted-foreground">
                Lv: <span className="font-bold">{currentDifficulty}</span>
              </span>
            </div>
          ) : (
            <Button size="sm" onClick={() => setShowSetupModal(true)} className="h-7 px-3 text-xs">
              Start Game
            </Button>
          )}

          {user ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={async () => {
                const supabase = createClient()
                await supabase.auth.signOut()
                window.location.reload()
              }}
            >
              Logout
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => (window.location.href = "/auth/login")}
            >
              Login
            </Button>
          )}
        </div>
      </header>

      {/* Main Content - fills remaining height */}
      <main className="flex-1 min-h-0 flex">
        {/* Center: Chess Board with captured pieces */}
        <div className="flex-shrink-0 p-2 flex flex-col items-center justify-center">
          <div className="w-full max-w-[600px] mb-1 flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">
              {playerColor === "w" ? "Black" : "White"} (AI)
            </span>
            <CapturedPieces gameState={gameState} color={playerColor === "w" ? "b" : "w"} isTop={true} />
          </div>

          <ChessBoard
            gameState={gameState}
            selectedSquare={selectedSquare}
            validMoves={validMoves}
            lastMove={lastMove}
            aiLastMove={aiLastMove}
            onSquareClick={handleSquareClick}
            flipped={playerColor === "b"}
            isThinking={isThinking}
            playerColor={playerColor}
          />

          <div className="w-full max-w-[600px] mt-1 flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">
              {playerColor === "w" ? "White" : "Black"} (You)
            </span>
            <CapturedPieces gameState={gameState} color={playerColor} isTop={false} />
          </div>
        </div>

        {/* Right: Sidebar - fills remaining width */}
        <div className="flex-1 min-w-0 flex flex-col p-2 pl-0 gap-2">
          {/* AI Feedback */}
          <div className="flex-shrink-0">
            <AIFeedback
              evaluation={currentEvaluation}
              analysis={aiAnalysis}
              isAnalyzing={isAnalyzing}
              isThinking={isThinking}
              playerStats={playerStats}
              aiElo={Math.round(botElo)}
              difficulty={currentDifficulty}
              onUndo={handleUndo}
            />
          </div>

          {/* Move History - fills remaining space */}
          <div className="flex-1 min-h-0">
            <MoveHistoryPanel moveNotations={moveNotations} gameState={gameState} isThinking={isThinking} />
          </div>

          {/* Game Controls */}
          <div className="flex-shrink-0">
            <GameControls
              onUndo={handleUndo}
              onRedo={handleRedo}
              onCopyPGN={handleCopyPGN}
              onNewGame={handleNewGame}
              canUndo={historyIndex > 0 && gameStarted}
              canRedo={historyIndex < gameHistory.length - 1}
              gameStarted={gameStarted}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
