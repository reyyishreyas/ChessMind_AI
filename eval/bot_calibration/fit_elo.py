"""Fit player ratings to game results using iterative Elo (Bradley-Terry style).

Standard expectation update over every game:
    E_w = 1 / (1 + 10 ^ ((R_b - R_w) / 400))
    R_w += K * (S_w - E_w),  R_b += K * (S_b - E_b)

Averaged over games gives a maximum-likelihood-ish estimate; K just sets
convergence speed, not the final ratings (game count is tiny for now).
"""

import csv
import json
import math
import pathlib

RESULTS_DIR = pathlib.Path(__file__).resolve().parent.parent / "results"
K = 32


def fit(results_csv: pathlib.Path) -> dict:
    games = list(csv.DictReader(results_csv.open()))

    ratings: dict[str, float] = {g["white"]: 1500.0 for g in games}
    ratings.update({g["black"]: 1500.0 for g in games})

    for _ in range(20):  # iterate until stable
        for g in games:
            rw, rb = ratings[g["white"]], ratings[g["black"]]
            expected_w = 1 / (1 + 10 ** ((rb - rw) / 400))
            score_w = float(g["score_white"])
            ratings[g["white"]] += K * (score_w - expected_w)
            ratings[g["black"]] += K * ((1 - score_w) - (1 - expected_w))

    fitted = {name: round(r, 1) for name, r in ratings.items()}
    return fitted


def report(fitted: dict, prefix: str = "bot_calibration") -> pathlib.Path:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out = RESULTS_DIR / f"{prefix}_fitted_elo.csv"
    with out.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["bot", "fitted_elo"])
        for name, elo in sorted(fitted.items(), key=lambda kv: kv[1], reverse=True):
            writer.writerow([name, elo])

    with RESULTS_DIR.joinpath(f"{prefix}_fitted_elo.json").open("w") as f:
        json.dump(fitted, f, indent=2)

    return out


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=pathlib.Path, default=RESULTS_DIR / "bot_calibration_results.csv")
    parser.add_argument("--prefix", type=str, default="bot_calibration")
    args = parser.parse_args()

    fitted = fit(args.csv)
    out = report(fitted, args.prefix)
    print(f"\nFitted Elo written to {out}")
    for name, elo in sorted(fitted.items(), key=lambda kv: kv[1], reverse=True):
        print(f"  {name}: fitted {elo}")