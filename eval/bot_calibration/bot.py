"""Bot configuration: point an engine binary at a target strength."""

import shutil

import chess.engine


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