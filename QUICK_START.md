# Quick Start Guide

## Prerequisites
- Python 3.8+ (backend)
- Node.js 18+ (frontend)
- Trained model at `model/ensemble_model.pkl` (or run training)

## Install Basics

### macOS
- Install Homebrew:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
- Install Node.js and Python:
```bash
brew install node python@3.11
```

### Ubuntu/Debian
```bash
sudo apt update
sudo apt install -y curl build-essential python3 python3-venv python3-pip
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
nvm install 18
```

### Windows (PowerShell)
```powershell
winget install OpenJS.NodeJS.LTS
winget install Python.Python.3.11
```

## Project Setup

### Frontend deps
```bash
npm install
# or
pnpm install
```

### Backend deps (with venv)
#### macOS/Linux
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```
#### Windows (PowerShell)
```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

## Environment Variables
Create `.env.local` in project root.
#### macOS/Linux
```bash
cat > .env.local << 'EOF'
GEMINI_API_KEY=your_gemini_api_key_here
FASTAPI_URL=http://localhost:8000
EOF
```
#### Windows (PowerShell)
```powershell
New-Item -Force -ItemType File -Path .env.local
Add-Content .env.local 'GEMINI_API_KEY=your_gemini_api_key_here'
Add-Content .env.local 'FASTAPI_URL=http://localhost:8000'
```

## Stockfish Engine Setup
- The app loads the worker from `public/stockfish/stockfish-17.js` (see `lib/stockfish-worker.ts:24`).
- Download engine files to `public/stockfish/`.
#### macOS/Linux
```bash
mkdir -p public/stockfish
curl -L https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js -o public/stockfish/stockfish-17.js
curl -L https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.wasm -o public/stockfish/stockfish.wasm
```
#### Windows (PowerShell)
```powershell
New-Item -ItemType Directory -Force -Path public\stockfish
Invoke-WebRequest https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js -OutFile public\stockfish\stockfish-17.js
Invoke-WebRequest https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.wasm -OutFile public\stockfish\stockfish.wasm
```

## Start Services
Open two terminals.
#### Backend
```bash
cd backend
python3 main.py
# Windows: py -3 main.py
```
Backend runs at `http://localhost:8000`.

#### Frontend
```bash
npm run dev
```
Frontend runs at `http://localhost:3000`.

## Train Model (if missing)
```bash
cd model
python3 train.py
```
Ensure `model/ensemble_model.pkl` exists.

## Quick Test
- Open `http://localhost:3000`
- Start a game and make a move
- Bot ELO updates after each move
- Try undo after a blunder; ELO reverts

## Troubleshooting
- Model not found: `cd model && python3 train.py`
- Backend connection: confirm port 8000 and `FASTAPI_URL`
- Gemini API: check `GEMINI_API_KEY` and quota
- Stockfish worker errors: verify `public/stockfish/stockfish-17.js` and `stockfish.wasm` exist

## Notes
- Worker path is defined in `lib/stockfish-worker.ts:24`.
- Frontend scripts live in `package.json:5` (`dev`, `build`, `start`).
