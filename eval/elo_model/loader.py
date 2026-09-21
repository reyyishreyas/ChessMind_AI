"""Lichess PGN loader — shared with the Step 6 Lichess import.

Streams the compressed monthly database (zstd) and yields only games worth
scoring: rated, both players rated, blitz/rapid time control, normally
finished, and long enough to produce stable features.
"""

from __future__ import annotations

import io
import pathlib
import re

import chess.pgn
import zstandard as zstd

DATA_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"
DEFAULT_PGN = DATA_DIR / "lichess_2013-01.pgn.zst"

TIME_CONTROL_RE = re.compile(r"^(\d+)\+(\d+)$")


def _acceptable_time_control(tc: str) -> bool:
    match = TIME_CONTROL_RE.match(tc or "")
    if not match:
        return False
    seconds = int(match.group(1))
    # Lichess stores base time in seconds: bullet <180, blitz 180-480,
    # rapid 480-1500, else classical. Keep blitz/rapid.
    return 180 <= seconds <= 1500


def iter_games(pgn_path: pathlib.Path = DEFAULT_PGN):
    """Yield parsed `chess.pgn.Game` objects from the (zstd) PGN database."""
    dctx = zstd.ZstdDecompressor()
    with open(pgn_path, "rb") as fh:
        with dctx.stream_reader(fh) as reader:
            text = io.TextIOWrapper(reader, encoding="utf-8")
            while True:
                game = chess.pgn.read_game(text)
                if game is None:
                    break
                yield game


def taxable(game) -> bool:
    """A game we're willing to score (rated, blitz/rapid, normal termination)."""
    headers = game.headers
    if headers.get("Termination", "") != "Normal":
        return False
    if not headers.get("WhiteElo") or not headers.get("BlackElo"):
        return False
    if not _acceptable_time_control(headers.get("TimeControl", "")):
        return False
    moves = list(game.mainline_moves())
    if len(moves) < 16:
        return False
    try:
        int(headers["WhiteElo"])
        int(headers["BlackElo"])
    except (KeyError, ValueError):
        return False
    return True


def load_games(limit: int | None = None, pgn_path: pathlib.Path = DEFAULT_PGN, quiet: bool = False):
    """Yield taxable games up to `limit`."""
    seen = 0
    for game in iter_games(pgn_path):
        if taxable(game):
            yield game
            seen += 1
            if limit is not None and seen >= limit:
                break
        elif game.headers.get("Termination", "MISSING") == "MISSING":
            pass