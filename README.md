# ChessMind_AI

An adaptive AI-powered chess trainer that adjusts its playing strength in real time based on how you're performing, and coaches you through every move. Combines Stockfish analysis, a local LLM, machine learning, and a deterministic player-pattern profiler — all fully offline after setup.

---

## Overview

Most chess engines play at a fixed strength. That usually leads to a poor experience — either the engine is too strong and punishing, or too weak and unchallenging.

In this project, the idea is to keep the game competitive at all times. The system evaluates each move, measures your play against a deterministic pattern profiler, and updates the bot's ELO so the difficulty stays aligned with your level while a grounded coach explains what happened and why.

- If you're performing well, the bot gradually becomes stronger
- If you're struggling, the bot eases difficulty within limits
- ELO is updated based on actual performance (and your patterns, not just ACPL)
- Every move is analyzed with Stockfish evaluations and LLM feedback
- **Two coordinated coach models** share one memory: a suggester picks from verified candidates, a feedback model reads that suggestion and coaches without contradicting it
- Every move you make is persisted locally, so the coach learns your recurring patterns across games
- **Fully offline**: progress, games, and coaching context live in a local SQLite database — no accounts, no auth server, no Supabase, no Postgres

The goal is a realistic, intelligent, self-contained training environment.

---

## Key Features

### Dynamic ELO System

* Predicts player strength after every move
* Updates bot ELO incrementally within thresholds
* Avoids sudden jumps in difficulty
* Updates player ELO after the game ends using the standard Elo formula

### Grounded Real-Time Coaching

* Stockfish gives objective engine evaluations
* A local LLM (Ollama by default, Gemini/Groq optional) produces qualitative move coaching
* The coach prompt carries a **VERIFIED FACTS** contract: the move, its grade, FENs, the better move, real tactical motifs (with victim-bound subjects), and a player-pattern snapshot — the model is instructed never to go beyond them
* The cross-game pattern history (from your saved `game_moves`) is folded into the prompts, so the coach teaches against what you actually do repeatedly

### Two-Model Shared-Memory Coaching

The coach runs as two coordinated LLM roles that share one state (`coach_context`, persisted in SQLite):

* **Suggester** — after each bot move, it picks ONE move from the engine's top-5 verified candidates (ranked by the same `rankMoves` evaluator that grades the player) and explains it. The pick is written to shared memory and rendered as the on-board hint.
* **Feedback** — on the player's next move, it reads the suggester's stored suggestion from shared memory and must never contradict it: if the player followed the hint, it confirms; if not, it compares against it.
* Both prompts carry the VERIFIED FACTS contract — neither model may introduce positional claims of its own, and the suggester sees the feedback coach's prior message (closing the loop across turns).
* The two roles can use different models via `resolveCoachModel(provider, "suggester")`.

### Deterministic Player Pattern Profiling

* Every player move is graded and persisted (`grade`, centipawn loss, capture/check flags, time) in `game_moves`
* Per-game profiles: phase accuracy, piece-level blunder concentration, time-pressure tilt, capture sharpness, consistency
* Skill scores (tactics / position / endgame) derived from your measured moves
* Cross-game summary only reports patterns that recur across ≥ 2 games — single-game quirks are never claimed

### Coach Insights Panel

* "Coach" button in the header surfaces your saved-game patterns, skill scores, and recent game history from the local DB
* Reset-progress action wipes all local data for a fresh start

### REST API + Message Logging

* Every LLM call (prompt, response, latency, parse count) is logged to the local `llm_calls` table for replay and validation
* Optional FastAPI backend serves ML Elo-prediction inference; the app falls back cleanly when it isn't running

---

## Architecture

```
After each bot move:
Engine ranks top-5 candidates (same evaluator that grades the player)
      │
      ▼
Suggester LLM ── picks one move + explains ──► shared coach_context (SQLite)
      (also shown as the on-board hint)               │
                                                      │
On the player's next move:                            │
Player Move → Stockfish Evaluation                    │
      │                                               │
      ▼                                               ▼
Grounded Feedback Prompt  ← board facts, motifs, pattern snapshot,
      │                      pattern history, prior suggestion ◄─┘
      ▼
Feedback LLM (reads suggestion; never contradicts it)
      │
      ▼
Structured Coach Response
      │
      ▼
Feature Engineering → ML Elo prediction (optional FastAPI)
      │
      ▼
Adaptive Bot Difficulty (Maia3 / Stockfish / minimax providers)
```

Player moves, games, profiles, and LLM calls persist to `data/local.db` (SQLite, gitignored) — the same shapes the app previously stored in Supabase.

---

## Quick Start

### 1. Install frontend dependencies

```bash
npm install
```

### 2. Stockfish engine files

The client-side engine loads from `public/stockfish/`:

```bash
mkdir -p public/stockfish
curl -L https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js -o public/stockfish/stockfish-17.js
curl -L https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.wasm -o public/stockfish/stockfish.wasm
```

### 3. Environment (`.env.local`)

No environment variables are strictly required — the app defaults to a local Ollama LLM and creates `data/local.db` on first use.

```env
# Which LLM backend to use: ollama | gemini | groq (default: ollama)
LLM_PROVIDER=ollama
# Local Ollama server (no API key needed)
OLLAMA_URL=http://localhost:11434

# Only if using Gemini/Groq:
# GEMINI_API_KEY=your_gemini_api_key
# GROQ_API_KEY=your_groq_api_key

# Only if running the optional ML Elo-prediction backend:
# FASTAPI_URL=http://localhost:8000
```

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000. No login — every player is a fixed local persona whose data lives in `data/local.db`.

---

## Optional ML Elo Backend

The in-game Elo estimator that drives adaptive difficulty can call a FastAPI backend (ensemble model for player ELO prediction). It isn't required to run the app — when the backend is down the app keeps the bot at its current ELO. If you want it:

```bash
cd backend
pip install -r requirements.txt
python main.py          # runs on :8000, loads model/ensemble_model.pkl
```

---

## Evaluation Harness

`eval/` contains reproducible experiments proving the system does what it claims:

- **bot_calibration** — bots at anchored ELOs: claimed vs fitted strength (incl. the Maia3 provider used in the app)
- **elo_model** — the Elo regression vs baselines (mean / ACPL-only), player-level MAE
- **grounding** — hallucination rate of coach explanations on fixtures + replayed live calls
- **tactics** — the deterministic motif engine (forks, pins, skewers, discovered attacks, victim binding)
- **coach_prompt** — the prompt's VERIFIED FACTS contract (every bullet must appear; schema blocks fabricated fields)
- **pattern_profile** — the profiler: findings, skill scores, board replay, and the cross-game reducer

```bash
python3 eval/run_all.py --quick
```

See `eval/README.md` for details.

---

## Project Structure

```text
ChessMind_AI/
├── app/                     # Next.js app router + API routes
├── components/              # UI (board, panels, modals, Coach Insights)
├── lib/                     # chess engine, tactics, pattern profiler, bot providers,
│   │                        # LLM abstraction, coach prompt, ELO prediction
│   └── db/                  # local SQLite layer (data/local.db, gitignored)
├── eval/                    # evaluation harness + committed results
├── backend/                 # optional FastAPI Elo-prediction service
├── model/                   # ML model + training scripts
├── public/stockfish/        # engine files
└── data/local.db            # created at runtime (per-machine personal data)
```

---

## Troubleshooting

### No coach analysis appears
Verify the LLM is reachable:
* **Ollama**: `curl http://localhost:11434/api/tags` and make sure `LLM_PROVIDER=ollama`
* **Gemini/Groq**: set the matching `*_API_KEY` and `LLM_PROVIDER`

### Stockfish
Ensure `public/stockfish/stockfish-17.js` and `stockfish.wasm` exist (see Quick Start).

### Reset all progress
Open **Coach → Reset all progress** from the header, or delete `data/local.db` and restart.

### Backend / model
"The Elo backend is optional; the app degrades gracefully when it can't connect."

---

## Future Improvements

* End-of-game full move review
* RAG / deeper personalized game analysis from the local move database
* Reinforcement learning for improved adaptive difficulty
* More LLM provider options

---

## Author

**Shreyas**

## Notes

If you found this project useful, consider starring the repository.
