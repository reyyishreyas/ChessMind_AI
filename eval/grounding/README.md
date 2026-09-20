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

## Honest interpretation

- A terse, exhortative coach ("good move!") scores a **high groundedness** but
  a **low claim count** — it risks little. Watch both columns.
- `gemma2:2b` currently makes ~1 verifiable claim per analysis; a strong hosted
  model should produce more, verified claims. That comparison is the metric to
  chase when tuning the coach prompt (Step 5).