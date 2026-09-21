"""Elo estimator suite: prove a features->Elo model beats both baselines.

Mirror-suite of `lib/elo-prediction.ts`. Loads Lichess games, extracts
per-player per-game features with Stockfish evals, fits a gradient-boosted
regressor, and compares MAE against the mean predictor and a linear baseline.
Split is BY PLAYER (no leakage). PASS requires beating both baselines with an
overall MAE under 200 Elo.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge

from eval.elo_model import features as feat
from eval.elo_model.loader import DEFAULT_PGN, load_games

RESULTS_DIR = pathlib.Path(__file__).resolve().parent.parent / "results"
DATA_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"

FEATURE_COLS = [
    "is_white",
    "n_moves",
    "acpl",
    "accuracy",
    "blunder_rate",
    "mistake_rate",
    "inaccuracy_rate",
    "capture_rate",
    "check_rate",
    "phase_opening",
    "phase_middlegame",
    "phase_endgame",
    "avg_abs_eval",
]

BANDS = [(0, 1000), (1000, 1400), (1400, 1800), (1800, 2200), (2200, 4000)]


def extract_rows(games, cache: pathlib.Path | None) -> pd.DataFrame:
    if cache and cache.exists():
        return pd.read_csv(cache)

    engine = feat._StockfishPopen()
    rows = []
    for game in games:
        try:
            rows.extend(feat.game_features(game, engine))
        except ValueError:
            continue
    engine.close()

    df = pd.DataFrame(rows)
    if cache:
        DATA_DIR.mkdir(exist_ok=True)
        df.to_csv(cache, index=False)
    return df


def player_split(df: pd.DataFrame, val: float = 0.15, test: float = 0.15):
    players = np.array(sorted(df["player_id"].unique()))
    rng = np.random.RandomState(42)
    rng.shuffle(players)
    n = len(players)
    n_test = int(n * test)
    n_val = int(n * val)
    test_players = set(players[:n_test])
    val_players = set(players[n_test : n_test + n_val])
    train_players = set(players[n_test + n_val :])
    parts = {}
    for split_name, split_players in (("train", train_players), ("val", val_players), ("test", test_players)):
        parts[split_name] = df[df["player_id"].isin(split_players)]
    return parts


def mae(y_true, y_pred) -> float:
    return float(np.mean(np.abs(np.asarray(y_true) - np.asarray(y_pred))))


def pooled_mae(df_part: pd.DataFrame, y_pred: np.ndarray) -> float:
    """MAE at player level: mean prediction per player vs that player's Elo.

    Matches the app's goal (estimate a *player's* skill after a session),
    while staying leakage-safe: pooling happens only within the player's own
    held-out games.
    """
    df_part = df_part.assign(_pred=pd.Series(y_pred, index=df_part.index))
    agg = df_part.groupby("player_id")[["player_elo", "_pred"]].mean()
    return mae(agg["player_elo"], agg["_pred"])


def band_report(y_true, y_pred, name) -> list[dict]:
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    rows = []
    for lo, hi in BANDS:
        mask = (y_true >= lo) & (y_true < hi)
        if mask.sum() == 0:
            continue
        rows.append(
            {
                "band": f"{lo}-{hi}",
                "n": int(mask.sum()),
                f"{name}_mae": round(mae(y_true[mask], y_pred[mask]), 1),
            }
        )
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--games", type=int, default=1600)
    parser.add_argument("--quick", action="store_true")
    parser.add_argument("--no-eval", action="store_true", help="reuse cached features if present")
    args = parser.parse_args()

    sample = 150 if args.quick else args.games
    cache = DATA_DIR / f"elo_features_{sample}.csv"
    if args.no_eval:
        if cache.exists():
            print(f"  reusing cached features ({cache.name})")
        else:
            print("  no cache; extracting fresh (this populates the cache)")

    print(f"  loading up to {sample} blitz/rapid games from {DEFAULT_PGN.name}")
    games = list(load_games(limit=sample))
    if not games:
        print("  FAIL: no taxable games loaded — is the database downloaded? (eval/data/lichess_2013-01.pgn.zst)")
        return 1
    print(f"  loaded {len(games)} games")

    df = extract_rows(games, cache)
    print(f"  extracted {len(df)} player-games")

    parts = player_split(df)
    print(
        f"  split by player → train={len(parts['train'])} val={len(parts['val'])} test={len(parts['test'])}"
    )

    y_train = parts["train"]["player_elo"].to_numpy()
    X_train = parts["train"][FEATURE_COLS].to_numpy()
    y_test = parts["test"]["player_elo"].to_numpy()
    X_test = parts["test"][FEATURE_COLS].to_numpy()

    mean_pred = np.full_like(y_test, y_train.mean(), dtype=float)
    mean_mae = pooled_mae(parts["test"], mean_pred)

    ridge_acpl = Ridge().fit(parts["train"][["acpl"]].to_numpy(), y_train)
    ridge_acpl_mae = pooled_mae(parts["test"], ridge_acpl.predict(parts["test"][["acpl"]].to_numpy()))

    ridge_full = Ridge().fit(X_train, y_train)
    ridge_full_mae = pooled_mae(parts["test"], ridge_full.predict(X_test))

    model = HistGradientBoostingRegressor(
        max_iter=300,
        learning_rate=0.08,
        max_leaf_nodes=31,
        random_state=42,
    ).fit(X_train, y_train)
    model_pred = model.predict(X_test)
    model_mae = pooled_mae(parts["test"], model_pred)

    print(f"\n  player-level MAE (Elo):")
    print(f"    mean predictor   : {mean_mae:.1f}")
    print(f"    ridge (acpl only): {ridge_acpl_mae:.1f}")
    print(f"    ridge (all feats): {ridge_full_mae:.1f}")
    print(f"    boosting model   : {model_mae:.1f}")

    bands = band_report(y_test, model_pred, "model")
    passes = model_mae < min(mean_mae, ridge_acpl_mae, ridge_full_mae) and model_mae < 200
    print(f"  {'PASS' if passes else 'FAIL'} — model beats both baselines and MAE < 200 ({model_mae:.1f})")

    RESULTS_DIR.mkdir(exist_ok=True)
    summary = {
        "n_games": len(games),
        "n_player_games": int(len(df)),
        "n_test_player_games": int(len(parts["test"])),
        "mean_baseline_mae": round(mean_mae, 1),
        "ridge_acpl_mae": round(ridge_acpl_mae, 1),
        "ridge_full_mae": round(ridge_full_mae, 1),
        "model_mae": round(model_mae, 1),
        "pass": passes,
        "bands": bands,
    }
    with RESULTS_DIR.joinpath("elo_model_summary.json").open("w") as f:
        json.dump(summary, f, indent=2)
    pd.DataFrame(bands).to_csv(RESULTS_DIR / "elo_model_mae.csv", index=False)
    print(f"  wrote eval/results/elo_model_summary.json + elo_model_mae.csv")

    return 0 if passes else 1


if __name__ == "__main__":
    sys.exit(main())