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

# calibration of the Maia3 (5m) bot used in the app's mid-Eloband
#   (node_maia.mjs runs the SAME model the browser loads; requires the
#    npm devDependency onnxruntime-node)
python3 -m eval.bot_calibration.run_calibration --bot maia
python3 -m eval.bot_calibration.fit_elo
```

## What each answers
- **bot_calibration**: does "target 1600" actually play ~1600? (claimed vs fitted)
- **maia calibration** (via `--bot maia`): same question for `lib/bot`'s Maia3
  provider. Anchors default to `[1200, 1500, 1800]` (inside Maia's 1100–2000
  band); each anchor spawns `node eval/bot_calibration/node_maia.mjs <elo>`
  which predicts argmax moves from the bundled 5m ONNX via `onnxruntime-node`.
- **elo_model**: does our Elo regression beat "predict the mean" and ACPL-only?
- **grounding**: how often does the coach say things that aren't true on the board?