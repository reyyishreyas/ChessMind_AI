"""Run round-robin headless matches between anchored bot levels.

Usage:
    python3 -m eval.bot_calibration.run_calibration --quick
"""

import argparse
import csv
import itertools
import pathlib

from eval.bot_calibration.bot import StockfishBot
from eval.bot_calibration.headless_game import play_game

RESULTS_DIR = pathlib.Path(__file__).resolve().parent.parent / "results"
DEFAULT_ANCHORS = [1350, 1600, 1800]


def run(anchors: list[int], games_per_pair: int, depth: int) -> pathlib.Path:
    pairs = list(itertools.combinations(anchors, 2))

    bots = {elo: StockfishBot(elo, depth=depth) for elo in anchors}

    rows = []
    for a, b in pairs:
        for i in range(games_per_pair):
            white, black = (bots[a], bots[b]) if i % 2 == 0 else (bots[b], bots[a])
            game = play_game(white, black)
            # normalize score to (bot_a, bot_b) perspective
            if white.name == f"sf-{a}":
                score_a, score_b = game["score"], 1.0 - game["score"]
            else:
                score_b, score_a = game["score"], 1.0 - game["score"]
            rows.append({"white": white.name, "black": black.name, "moves": game["moves"], "score_white": game["score"], "score_a": score_a, "score_b": score_b})
            print(f"  {a} vs {b} (game {i+1}): score_a={score_a} moves={game['moves']}")

    for bot in bots.values():
        bot.close()

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out = RESULTS_DIR / "bot_calibration_results.csv"
    with out.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["white", "black", "moves", "score_white", "score_a", "score_b"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nWrote {len(rows)} games to {out}")
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--anchors", type=int, nargs="+", default=DEFAULT_ANCHORS)
    parser.add_argument("--games-per-pair", type=int, default=4)
    parser.add_argument("--depth", type=int, default=10)
    parser.add_argument("--quick", action="store_true", help="tiny smoke run: 2 games per pair, depth 6")
    args = parser.parse_args()

    run(
        anchors=args.anchors,
        games_per_pair=args.games_per_pair if not args.quick else 1,
        depth=args.depth if not args.quick else 6,
    )