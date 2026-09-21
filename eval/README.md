# ChessMind AI — Evaluation Harness

Reproducible experiments proving the system actually does what it claims.

```
eval/
  bot_calibration/   bot-vs-bot matches at anchored levels → fitted Elo vs target
  elo_model/         trained Elo estimator vs baselines (player-level MAE)
  grounding/         LLM claim validator, hallucination rates
  tactics/           deterministic motif engine tests
  coach_prompt/      grounded coach-prompt contract tests
  pattern_profile/   player pattern profiler tests (findings + board replay)
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
- **tactics** (`node --test eval/tactics/tactics.test.ts`): `lib/tactics.ts`
  motif engine — captures, checks, forks, pins, skewers, discovered attacks,
  with victim binding.
- **coach_prompt** (`node --test eval/coach_prompt/coach_prompt.test.ts`):
  `lib/coach-prompt.ts` builds the grounded prompt the route sends; the suite
  asserts every VERIFIED FACTS bullet (player move, grade, FENs, better move,
  victim-bound motifs, pattern snapshot, cross-game pattern history) appears
  exactly, and the payload schema forbids fabricated fields.
- **pattern_profile** (`node --test eval/pattern_profile/pattern_profile.test.ts`):
  the `lib/pattern-profile.ts` profiler — phase/piece/time findings, the
  skill scores, the `replayPatternEvents` board replay, and the
  `summarizePatterns` cross-game reducer — must produce exact, deterministic
  facts (silence when support is tiny; single-game quirks never recur). Also
  covers `profilesFromSavedGames` (rebuilding per-game profiles from the
  persisted `game_moves` rows) and `describeCrossGameFacts` (the DB-backed
  pattern-history bullet the analyze-move route feeds the coach).