"""Bot configuration: point an engine binary (or the JS Maia bot) at a target strength."""

import json
import pathlib
import shutil
import subprocess

import chess
import chess.engine

HERE = pathlib.Path(__file__).resolve().parent


def find_stockfish() -> str:
    path = shutil.which("stockfish")
    if not path:
        raise RuntimeError("stockfish binary not found on PATH (try: brew install stockfish)")
    return path


class StockfishBot:
    """A UCI engine configured to play at (roughly) a target rating.

    UCI_LimitStrength + UCI_Elo caps Stockfish's playing strength lower-bound
    (CCRL scale). Interpolating between anchored levels is exactly what the
    calibration suite exists to verify.
    """

    def __init__(self, target_elo: int, engine_path: str | None = None, depth: int = 10):
        self.name = f"sf-{target_elo}"
        self.target_elo = target_elo
        self.engine = chess.engine.SimpleEngine.popen_uci(engine_path or find_stockfish())
        self.engine.configure({"UCI_LimitStrength": True, "UCI_Elo": target_elo})
        self.depth = depth

    def play(self, board: chess.Board) -> chess.Move | None:
        limit = chess.engine.Limit(depth=self.depth)
        try:
            result = self.engine.play(board, limit, info=chess.engine.INFO_NONE)
            return result.move
        except chess.engine.EngineError:
            return None

    def close(self) -> None:
        self.engine.quit()


class MaiaJSBot:
    """The production Maia3 (5m) bot from lib/bot, run headlessly via node.

    Speaks line-delimited JSON over stdio (see node_maia.mjs). History is
    passed as UCI moves so the model conditions on prior positions the same
    way the in-browser integration does.
    """

    def __init__(self, target_elo: int, depth: int = 10):
        self.name = f"maia-{target_elo}"
        self.target_elo = target_elo
        self.depth = depth
        self.proc = subprocess.Popen(
            ["node", str(HERE / "node_maia.mjs"), str(target_elo)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )
        ready = self.proc.stdout.readline()
        if not ready.strip().startswith("READY"):
            raise RuntimeError(f"node bot failed to start (got: {ready!r})")

    def play(self, board: chess.Board) -> chess.Move | None:
        request = {
            "fen": board.fen(),
            "moves": [m.uci() for m in board.move_stack],
            "selfElo": self.target_elo,
            "oppoElo": self.target_elo,
        }
        self.proc.stdin.write(json.dumps(request) + "\n")
        self.proc.stdin.flush()

        line = self.proc.stdout.readline()
        if not line:
            return None
        try:
            response = json.loads(line)
        except json.JSONDecodeError:
            return None

        uci = response.get("move")
        if not uci:
            return None
        try:
            return chess.Move.from_uci(uci)
        except ValueError:
            return None

    def close(self) -> None:
        self.proc.terminate()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()