# Elo estimator suite

Goal: prove that a trained Elo regression beats simple baselines on real games,
so the app's in-game Elo estimator can claim "not a paraphrase of ACPL".

## Pipeline

1. **Loader** — `loader.py` streams `eval/data/lichess_2013-01.pgn.zst`
   (a rated Lichess monthly database, fetched from `https://database.lichess.org/`)
   and keeps games that are `Termination: Normal`, have both Elos, are blitz/rapid
   (`180 <= base seconds <= 1500`), and last >= 16 plies.
2. **Features** — `features.py` builds per-player-per-game aggregates from the
   same signals the app measures (per-move Stockfish evals, and the same
   move-quality thresholds as `STOCKFISH_THRESHOLDS`): ACPL, Lichess accuracy
   (`103.1668 * exp(-0.04354 * acpl)`), move-quality fractions (inaccuracy 50,
   mistake 150, blunder 300 cp), capture/check rates, and phase breakdown
   (opening <= 12, middlegame <= 35 plies). Losses are capped at 20 pawns so
   depth-8 mate-saturation artifacts cannot dominate ACPL, and the final
   (terminal) ply is dropped from the ACPL signal.
   Note: this validates that the app's *measured signals* predict rating. The
   app's live estimator treats the same signals per-move via the optional
   FastAPI backend (`app/api/predict-elo`), so this suite is a proxy proof —
   the live per-move pipeline is not re-trained here.
3. **Split** — by **player, never by game** (leakage control), 70/15/15.
4. **Baselines** (model must beat both): predict the mean rating; ACPL-only
   ridge regression. A full-feature ridge is also reported.
5. **Model** — `HistGradientBoostingRegressor`; **MAE overall + per rating
   band** (<1000, 1000-1400, 1400-1800, 1800-2200, >=2200).
6. **Gate** — PASS iff model MAE < every baseline MAE and < 200 Elo.
7. **Output** — `eval/results/elo_model_mae.csv` + `elo_model_summary.json`.

## Files
- `loader.py` — Lichess PGN sample loader (also feeds Step 6 — Lichess import)
- `features.py` — per-player-game feature extraction (Stockfish evals)
- `run.py` — caching extractor + split + baselines + model + MAE report

## Running
```
python3 -m eval.elo_model.run --games 400        # extract (cached) + fit
python3 -m eval.elo_model.run --no-eval          # refit from cached features
python3 -m eval.elo_model.run --quick            # 150-game smoke
```
`eval/data/` (large download) is gitignored; the features cache lives there too.