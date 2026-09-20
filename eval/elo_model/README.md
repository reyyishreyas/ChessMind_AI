# Elo estimator suite (PENDING)

Goal: prove that the trained Elo regression beats simple baselines on real games.

## Pipeline (implements later; shares loader with Step 6 — Lichess import)

1. **Loader** — pull a sample of rated Lichess PGNs (`https://database.lichess.org/`).
   Split **by player, never by game** (leakage!). Control for time control
   (only `blitz`/`rapid` — not `ultrabullet`).
2. **Features** — per game: average centipawn loss (ACPL) of each player,
   move-quality distribution, accuracy, blunder rate, phase breakdown.
   (We already extract most of these in `lib/elo-prediction.ts` — port them.)
3. **Baselines** (must beat both):
   - predict the mean rating
   - ACPL-only linear regression
4. **Model** — gradient-boosted or the existing sklearn ensemble; report
   **MAE overall and per rating band** (e.g. <1000, 1000-1400, ...).
5. **Output** — `eval/results/elo_model_mae.csv` + one summary JSON.

## Files
- `loader.py`      — Lichess PGN sample loader (also used by Step 6)
- `train.py`       — baselines + model + MAE report