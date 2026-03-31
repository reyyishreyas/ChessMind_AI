# Dynamic ELO System Implementation Summary

## Overview
This implementation adds a dynamic ELO prediction system that adapts the bot's ELO in real-time based on player performance during the game.

## Key Features Implemented

### 1. FastAPI Backend (`backend/main.py`)
- Loads the trained ensemble model from `model/ensemble_model.pkl`
- Provides `/predict-elo` endpoint for ELO prediction
- Handles feature preprocessing and normalization
- Returns predicted ELO and ELO change

### 2. Enhanced Gemini API (`app/api/analyze-move/route.ts`)
- Updated to return structured features:
  - `move_quality`: Brilliant/Good/Mistake/Blunder/Perfect/Inaccuracy
  - `accuracy_score`: 0-100
  - `blunder_risk`: low/medium/high
  - `flag3`: Tactical motif indicator (0 or 1)
- Analyzes both player's move and bot's previous move

### 3. ELO Prediction Utility (`lib/elo-prediction.ts`)
- `collectMoveFeatures()`: Collects all required features from:
  - Move number and game phase (Opening/Middlegame/Endgame)
  - Stockfish evaluations (start_eval, end_eval, delta_eval)
  - Gemini analysis (move_quality, accuracy_score, blunder_risk, flag3)
  - Backend flags (flag1: capture, flag2: check)
  - Time per move from frontend
  - Last ELO from database/state
- `predictElo()`: Calls FastAPI backend to predict new ELO
- `calculateEloAfterGame()`: Calculates final ELO using standard Elo formula

### 4. Frontend Integration (`components/chess-game.tsx`)
- Tracks bot ELO dynamically (`botElo` state)
- Calls ELO prediction after each player move
- Updates bot difficulty based on predicted ELO
- Handles undo to revert bot ELO changes
- Updates player ELO after game using Elo formula

### 5. Fixed Undo Functionality
- Properly restores game state, move history, evaluations, and times
- Reverts bot ELO to previous value when undo is used
- Updates difficulty based on reverted ELO

## Feature Collection

All features are collected as specified:

| Feature | Source | Description |
|---------|--------|-------------|
| move_number | Backend | Move index (1, 2, 3...) |
| start_eval | Stockfish | Evaluation before move (pawns) |
| end_eval | Stockfish | Evaluation after move (pawns) |
| delta_eval | Backend | end_eval - start_eval |
| move_quality | Gemini | Brilliant/Good/Mistake/Blunder/Perfect/Inaccuracy |
| time_per_move | Frontend → Backend | Time taken by player (seconds) |
| accuracy_score | Gemini | 0-100 subjective accuracy |
| blunder_risk | Gemini | low/medium/high |
| flag1 | Backend | Capture (1 or 0) |
| flag2 | Backend | Check (1 or 0) |
| flag3 | Gemini | Tactical motif (1 or 0) |
| last_elo | Backend/Database | Player's last ELO |
| phase_Endgame | Backend | Endgame indicator (moves > 35) |
| phase_Middlegame | Backend | Middlegame indicator (moves 13-35) |
| phase_Opening | Backend | Opening indicator (moves 1-12) |

## Game Phases
- **Opening**: Moves 1-12
- **Middlegame**: Moves 13-35
- **Endgame**: Moves 36+

## ELO Calculation

### During Game (Bot ELO)
- Predicted dynamically after each move using the trained model
- Features collected and sent to FastAPI backend
- Bot difficulty adjusted based on predicted ELO

### After Game (Player ELO)
Uses standard Elo formula:
```
E = 1 / (1 + 10^((R_opponent - R_player) / 400))
R_new = R_old + K * (S - E)
```
Where:
- `E` = Expected score
- `S` = Actual score (1 for win, 0.5 for draw, 0 for loss)
- `K` = Development factor (default 32)
- `R_opponent` = Bot's ELO at game end
- `R_player` = Player's ELO before game

## Setup Instructions

### 1. Install Backend Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 2. Start FastAPI Backend
```bash
cd backend
python main.py
# Or: uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Configure Environment Variables
Create `.env.local` in project root:
```
GEMINI_API_KEY=your_gemini_api_key
FASTAPI_URL=http://localhost:8000
```

### 4. Start Next.js Frontend
```bash
npm run dev
```

## API Endpoints

### POST `/api/predict-elo`
Proxies to FastAPI backend for ELO prediction.

**Request:**
```json
{
  "features": {
    "move_number": 10,
    "start_eval": 0.56,
    "end_eval": 0.58,
    "delta_eval": 0.02,
    "move_quality": "Perfect",
    "time_per_move": 1.76,
    "accuracy_score": 6.0,
    "blunder_risk": "low",
    "flag1": 0,
    "flag2": 0,
    "flag3": 0,
    "last_elo": 447.99,
    "phase_Endgame": false,
    "phase_Middlegame": false,
    "phase_Opening": true
  }
}
```

**Response:**
```json
{
  "predicted_elo": 450.6,
  "elo_change": 2.61,
  "success": true
}
```

## Undo Functionality
- When player clicks undo after a blunder:
  - Game state is restored to before the move
  - Bot ELO is reverted to previous value
  - Difficulty is adjusted based on reverted ELO
  - All move history, evaluations, and times are properly restored

## Notes
- The model expects features in the exact format specified
- Bot ELO changes dynamically during the game
- Player ELO is updated only after game completion
- Undo properly reverts all changes including bot ELO

