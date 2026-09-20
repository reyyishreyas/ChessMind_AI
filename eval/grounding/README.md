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
   - capture claims (`captured the knight on e6`) by square.
2. **Validator** (`validate.py`) — `python-chess` legality checks:
   - is a claimed move in `board.legal_moves`?
   - is a capture onto the claimed square a legal capture?
   - *position-reference* disambiguation: `Ng5 is a strong move` names a piece
     already standing on that square -> verified by presence, not a proposal;
     a preceding hint word (`should`, `play`, `better`, `instead`, ...) marks
     it a proposal even from an occupied square.
   - *subject-aware* bare squares: `the queen goes to h4` checks that a queen
     can legally move to h4 (a bare `h4` alone would be a legal pawn move).
3. **Fixtures** (`fixtures/`) — 7 hand-labeled good + deliberately
   hallucinated explanations (each also asserts extractor coverage).
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
- `gemma2:2b` with the grounded `analyze-move-v2` prompt now names the played
  move in most analyses (10 verifiable claims across 13 scored calls) and is
  currently **100% grounded / 0% rejected** on those. The known residual: it
  can still mislabel a motif's **target** (`Bg5 creates a pin on the bishop`
  — it pinned the knight); grounding only sees squares, so motif \*claims\*
  stay engine-verified while the LLM's motif **gloss** is not yet checked.
- Boxing-in the difference is the metric to chase when tuning the coach prompt
  (Step 5).