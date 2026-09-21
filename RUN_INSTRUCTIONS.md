# How to Run ChessMind_AI

## Prerequisites
- Node.js 18+
- npm
- A chat model on a local Ollama server (default LLM backend) — or Gemini/Groq API keys
- Optional: Python 3.8+ and a trained `model/ensemble_model.pkl` for the ML Elo backend

## Step-by-Step

### Step 1: Install dependencies
```bash
npm install
```

### Step 2: Stockfish engine files
```bash
mkdir -p public/stockfish
curl -L https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js -o public/stockfish/stockfish-17.js
curl -L https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.wasm -o public/stockfish/stockfish.wasm
```

### Step 3: LLM backend (default: Ollama)
Ensure Ollama is running with a model (test with `curl http://localhost:11434/api/tags`):
```bash
ollama pull gemma2:2b
```

To use Gemini or Groq instead, create `.env.local` in the project root:
```env
LLM_PROVIDER=gemini     # or groq
GEMINI_API_KEY=your_gemini_api_key_here
```
To get a Gemini key: https://makersuite.google.com/app/apikey

### Step 4: (Optional) ML Elo-prediction backend
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
cd model && python3 train.py     # produces ensemble_model.pkl
cd ../backend && python3 main.py # runs :8000
```
The app runs fine without this — it keeps the bot's ELO when the backend is down.

### Step 5: Start the app
```bash
npm run dev
```
Open http://localhost:3000. No login — one local persona writes to `data/local.db`.

## Quick Test
1. Open http://localhost:3000
2. Start a new game
3. Make a move — the header shows your ELO, bot ELO (updates dynamically), and difficulty
4. Open **Coach** to see saved-game pattern analysis

## Troubleshooting

| Problem | Fix |
| --- | --- |
| No coach analysis | Check `LLM_PROVIDER` and that Ollama/API is reachable |
| Stockfish worker errors | Verify `public/stockfish/stockfish-17.js` + `stockfish.wasm` exist |
| Model / backend not found | Optional features — safe to ignore unless you want ML Elo prediction |
| Port 3000 busy | `PORT=3001 npm run dev` |
| Want a fresh start | Coach → Reset all progress, or delete `data/local.db` |

## Production Build
```bash
npm run build
npm start
```