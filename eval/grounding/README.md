# Grounding suite

Goal: measure how often the LLM coach says things that aren't true on the
board (claims about pieces, squares, moves that don't match the actual
position). This is how we show the model is *explaining Stockfish's facts*,
not hallucinating its own.

## What it does

1. **Claim extractor** (`extract.py`) — regex-based, LLM-free, reproducible:
   - *proposed* moves (`you should play e4`, `Nxe5`, `O-O`, UCI) validated in
     the current position;
   - *past* moves (`you played e4`) validated in the position **before** that
     move (`fen_before`);
   - capture claims (`captured the knight on e6`) by square;
   - **motif claims** — `Bg5 pins the knight`, `a pin on the bishop`,
     `Ng5 forks two pawns`, `discovered attack on your queen`. Subject bindings
     (the piece named as the victim) are attached when present.
2. **Validator** (`validate.py`) — `python-chess` legality checks:
   - is a claimed move in `board.legal_moves`?
   - is a capture onto the claimed square a legal capture?
   - *position-reference* disambiguation: `Ng5 is a strong move` names a piece
     already standing on that square -> verified by presence, not a proposal;
     a preceding hint word (`should`, `play`, `better`, `instead`, ...) marks
     it a proposal even from an occupied square.
   - *subject-aware* bare squares: `the queen goes to h4` checks that a queen
     can legally move to h4 (a bare `h4` alone would be a legal pawn move).
   - **motif verdicts** — the claimed motif must appear in the deterministic
     oracle for that move, and a claimed subject must be the real victim.
     The oracle is `lib/tactics.ts` (the same engine the app runs), invoked
     through `eval/grounding/motifs.mjs`; victims are independently recomputed
     in python-chess — a verifier never trusts the engine it audits.
3. **Fixtures** (`fixtures/`) — 13 hand-labeled good + deliberately
   hallucinated explanations (each also asserts extractor coverage). Includes
   the pin-gloss trap: `it's the bishop that gets pinned` when Bg5 actually
   pinned the knight = 0.0.
4. **Metrics** — groundedness = passed/total verifiable claims, per fixture
   and **per provider/model** over logged `analyze-move` calls.

## Run

```bash
python3 -m eval.grounding.run
```

`run.py` scores fixtures AND replays `.llm-calls.ndjson` (meta `fen`/`fenBefore`
recorded by the analyze-move route since v2 logging). Writes
`eval/results/grounding_results.json`.

Live calls can be (re)seeded against the running app with:

```bash
node eval/grounding/seed_calls.mjs
```

(five legal positions with known motifs — fork, pin, capture, quiet — posted to
`/api/analyze-move` so the coach prompt is exercised end-to-end).

## Honest interpretation

- A terse, exhortative coach ("good move!") scores a **high groundedness** but
  a **low claim count** — it risks little. Watch both columns.
- Fixtures: all 8 "good" explanations score **1.0**; the hallucination traps
  (illegal moves, false captures, wrong/absent motifs) score **0.0–0.5**. The
  motif-subject gate is what catches the exact coach gloss bug: `Bg5 ...
  creates a pin on the bishop` fails because the pinned piece is the knight —
  previously that claim sailed through as engine-verified because grounding
  only looked at squares.
- Live replay of `gemma2:2b` calls is **90.9% grounded / 9.1% rejected** (11
  claims, 13 scored) — the one failure being that bishop/knight pin gloss,
  now provably caught. The `analyze-move-v2` prompt now ships the verified
  motif **facts with their victims** (`pin (knight on f6)`), so the model has
  the subject to state instead of guessing one.
- Re-seed live calls (`node eval/grounding/seed_calls.mjs`) after the fix to
  pull fresh logged calls through the new gate.