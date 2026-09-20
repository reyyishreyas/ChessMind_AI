# Grounding suite (PENDING)

Goal: measure how often the LLM coach says false things (claims about pieces,
squares, moves that don't match the actual position). This is how we show the
model is *explaining Stockfish's facts*, not hallucinating its own.

## Machinery (implements with Step 5 — grounded coach)

1. **Claim extractor** — parse squares, piece names, and SAN moves out of an
   explanation (regex over `[a-h][1-8]`, `N/B/R/Q/K`, chess.SAN patterns).
2. **Validator** — given the position (FEN) + the extracted claims:
   - is the square/variable legal in the position?
   - does a claimed "captured X on e6" match an actual piece/eval swing?
   - does a suggested move exist in `board.legal_moves`?
3. **Fixtures** — hand-labeled good/bad explanations (checked into `fixtures/`).
4. **Metrics** — groundedness rate + validator rejection rate, **per model**:
   `gemma2:2b` is expected to fail often now; a big hosted model should fail
   less. That comparison is a honest, hireable result.

## Files
- `extract.py`     — claim extractor
- `validate.py`    — validator (uses python-chess for legality)
- `fixtures/`      — labeled explanation samples
- `run.py`         — metric run over fixtures / logged `llm_calls`