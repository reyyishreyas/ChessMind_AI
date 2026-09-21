# Quick Start Guide

## Prerequisites
- Node.js 18+ (Next.js)
- A local Ollama server with a chat model (e.g. `gemma2:2b`) — or a Gemini/Groq API key
- Optional: Python 3.8+ for the ML Elo-prediction backend
- Optional: a `stockfish` binary on PATH for the `eval/` harness

## Project Setup

### Install
```bash
npm install
```

### Stockfish engine files
The client-side engine loads from `public/stockfish/`:
```bash
mkdir -p public/stockfish
curl -L https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js -o public/stockfish/stockfish-17.js
curl -L https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.wasm -o public/stockfish/stockfish.wasm
```

### Environment (`.env.local`)
No variables are required. The app defaults to Ollama and creates `data/local.db` on first use:
```bash
# Optional, defaults noted:
LLM_PROVIDER=ollama            # ollama | gemini | groq
OLLAMA_URL=http://localhost:11434
# GEMINI_API_KEY=...            # only if LLM_PROVIDER=gemini
# GROQ_API_KEY=...              # only if LLM_PROVIDER=groq
# FASTAPI_URL=http://localhost:8000   # only if running the ML backend
```

## Start

Everything runs as one Next.js dev server (no auth, no Supabase, no Postgres):
```bash
npm run dev
```
Open `http://localhost:3000`. Your identity is a fixed local persona; progress lives in `data/local.db`.

## Qualified by accuracy, not ACPL
This app estimates strength with a trained ensemble model, so in-game ELO reflects actual play (see `eval/elo_model/`). Run the harness to see the evidence:
```bash
python3 eval/run_all.py --quick
```

## Tips
- Bot ELO updates after each move; undo after a blunder reverts ELO.
- **Coach** (header button) shows your saved-game patterns and skill scores.
- **Coach → Reset all progress** wipes the local database for a fresh start.

## Troubleshooting
- No coach analysis: confirm Ollama is running (`curl http://localhost:11434/api/tags`) and `LLM_PROVIDER` matches.
- Stockfish worker errors: `public/stockfish/stockfish-17.js` and `stockfish.wasm` must exist (`lib/stockfish-worker.ts`).
- Backend/model warnings: the ML backend is optional; the app degrades cleanly when it's down.