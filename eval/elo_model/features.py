"""Per-player-game feature extraction from PGN games.

Mirrors the app's `MoveFeatures` (lib/elo-prediction.ts): per-move Stockfish
evaluations feed aggregates — ACPL, move-quality fractions (same thresholds as
STOCKFISH_THRESHOLDS), accuracy (Lichess formula), capture/check rates, phase
breakdown. One Stockfish evaluation per position suffices: both colors' move
deltas derive from consecutive evals.
"""

from __future__ import annotations

import math
import os
import shutil
import subprocess

import chess
import chess.pgn
import numpy as np

BRILLIANT, EXCELLENT, GOOD, INACCURACY, MISTAKE, BLUNDER = (-200, -50, 0, 50, 150, 300)

DEPTH = int(os.environ.get("ELO_EVAL_DEPTH", "8"))


class _StockfishPopen:
    def __init__(self, path: str | None = None):
        self._path = path or shutil.which("stockfish")
        if not self._path:
            raise RuntimeError("stockfish binary not found on PATH")
        self._proc = subprocess.Popen(
            [self._path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self._proc.stdin.write("uci\n")
        self._proc.stdin.write(f"setoption name Threads value 1\n")
        self._proc.stdin.write(f"setoption name Skill Level value 20\n")
        self._proc.stdin.flush()

    def eval_fen(self, fen: str) -> float:
        """White-perspective evaluation in centipawns (mates -> +/-100000)."""
        self._proc.stdin.write(f"position fen {fen}\ngo depth {DEPTH}\n")
        self._proc.stdin.flush()
        score = 0.0
        while True:
            line = self._proc.stdout.readline().strip()
            if line == f"bestmove":
                break
            if line == "bestmove (none)":
                break
            if line.startswith("bestmove "):
                break
            if line.startswith("info") and " score " in line:
                parts = line.split()
                if "mate" in parts:
                    idx = parts.index("mate")
                    mate_plies = int(parts[idx + 1])
                    score = 100000.0 * (1 if mate_plies > 0 else -1)
                elif "cp" in parts:
                    idx = parts.index("cp")
                    score = float(parts[idx + 1])
        return score

    def close(self):
        try:
            self._proc.stdin.write("quit\n")
            self._proc.stdin.flush()
            self._proc.wait(timeout=3)
        except Exception:
            self._proc.kill()


MAX_LOSS_CP = 2000.0  # 20-pawn cap: only depth-8 mate-saturation artifacts exceed this


def _white_persp_to_mover(white_cp: float, mover_is_white: bool) -> float:
    return white_cp if mover_is_white else -white_cp


def _lichess_accuracy(acpl: float) -> float:
    return max(0.0, min(100.0, 103.1668 * math.exp(-0.04354 * acpl)))


def game_features(game, engine: _StockfishPopen) -> list[dict]:
    """Feature rows, one per player, for a single game."""
    headers = game.headers
    white_elo = int(headers["WhiteElo"])
    black_elo = int(headers["BlackElo"])

    board = game.board()
    fens = []
    for move in game.mainline_moves():
        fens.append(board.fen())
        board.push(move)
    fens.append(board.fen())

    evals = [engine.eval_fen(fen) for fen in fens]
    terminal = board.is_game_over()
    # A terminal (mated/stalemated) eval saturates; a "loss" derived from it
    # is noise, not a planning miss. Drop the final ply when the game ended.
    last_loss_ply = len(fens) - 2 if terminal else len(fens) - 1
    avg_abs_eval = float(np.abs(np.asarray(evals[:-1] if terminal else evals)).mean())

    rows = []
    for mover in ("w", "b"):
        plies = []
        mover_white = mover == "w"
        for i in range(1, last_loss_ply + 1):
            ply_color = "w" if (i % 2 == 1) else "b"
            if ply_color != mover:
                continue
            before = _white_persp_to_mover(evals[i - 1], mover_white)
            after = _white_persp_to_mover(evals[i], mover_white)
            loss = min(MAX_LOSS_CP, max(0.0, before - after))
            plies.append(loss)
        if not plies:
            continue

        plies_np = np.asarray(plies, dtype=float)
        n = len(plies_np)
        acpl = float(plies_np.mean())
        mv = game.mainline()
        capture_flags = []
        check_flags = []
        played = list(game.mainline_moves())

        walk = game.board()
        for i, move in enumerate(played):
            ply_color = "w" if (i % 2 == 0) else "b"
            if ply_color == mover:
                capture_flags.append(1 if walk.is_capture(move) else 0)
                check_flags.append(1 if walk.is_check() else 0)
            walk.push(move)

        phase_counts = {"opening": 0, "middlegame": 0, "endgame": 0}
        for i in range(len(played)):
            if i % 2 == (0 if mover_white else 1):
                move_no = i // 2 + 1
                phase_counts[_phase(move_no)] += 1

        loss_buckets = {}
        loss_buckets["blunder"] = int((plies_np > BLUNDER).sum()) / n
        loss_buckets["mistake"] = int(((plies_np > MISTAKE) & (plies_np <= BLUNDER)).sum()) / n
        loss_buckets["inaccuracy"] = int(((plies_np > INACCURACY) & (plies_np <= MISTAKE)).sum()) / n

        rows.append(
            {
                "player_id": headers.get("White" if mover_white else "Black", "?"),
                "player_elo": white_elo if mover_white else black_elo,
                "is_white": int(mover_white),
                "n_moves": n,
                "acpl": round(acpl, 2),
                "accuracy": round(_lichess_accuracy(acpl), 2),
                "blunder_rate": round(loss_buckets["blunder"], 4),
                "mistake_rate": round(loss_buckets["mistake"], 4),
                "inaccuracy_rate": round(loss_buckets["inaccuracy"], 4),
                "capture_rate": round(np.mean(capture_flags), 4) if capture_flags else 0.0,
                "check_rate": round(np.mean(check_flags), 4) if check_flags else 0.0,
                "phase_opening": round(phase_counts["opening"] / max(1, n), 4),
                "phase_middlegame": round(phase_counts["middlegame"] / max(1, n), 4),
                "phase_endgame": round(phase_counts["endgame"] / max(1, n), 4),
                "avg_abs_eval": round(avg_abs_eval, 2),
            }
        )
    return rows


def _phase(move_no: int) -> str:
    if move_no <= 12:
        return "opening"
    if move_no <= 35:
        return "middlegame"
    return "endgame"