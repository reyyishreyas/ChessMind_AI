# ChessMind AI — Evaluation Harness

Reproducible experiments proving the system actually does what it claims.

```
eval/
  bot_calibration/   bot-vs-bot matches at anchored levels → fitted Elo vs target
  elo_model/         trained Elo estimator vs baselines (PENDING)
  grounding/         LLM claim validator, hallucination rates (PENDING)
  results/           committed CSV/JSON outputs
  run_all.py         runs every suite, writes results/
```

## Run

```bash
# quick smoke test
python3 eval/run_all.py --quick

# full bot calibration (slower)
python3 -m eval.bot_calibration.run_calibration
python3 -m eval.bot_calibration.fit_elo
```

## What each answers
- **bot_calibration**: does "target 1600" actually play ~1600? (claimed vs fitted)
- **elo_model**: does our Elo regression beat "predict the mean" and ACPL-only?
- **grounding**: how often does the coach say things that aren't true on the board?