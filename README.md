# ChessMind_AI

An adaptive chess engine that adjusts its strength in real time based on how the user is playing.

---

## Overview

Most chess engines play at a fixed strength. That usually leads to a poor experience — either the engine is too strong and punishing, or too weak and unchallenging.

In this project, the idea is to keep the game competitive at all times. The system evaluates each move and updates the bot’s ELO dynamically so that the difficulty stays aligned with the player’s level.

* If the player is performing well, the bot gradually becomes stronger
* If the player is struggling, the bot eases difficulty within limits
* Player ELO is updated based on actual performance
* Each move is analyzed using a combination of engine evaluation and AI-based feedback

The goal is to create a more realistic and useful training environment.

---

## Demo

Video walkthrough:
[(https://drive.google.com/file/d/1xFnCvqkNif8Q96LK8WOTo7sPBoKdd6bx/view?usp=sharing)]


---

## Key Features

### Dynamic ELO System

* Predicts player strength after every move
* Updates bot ELO incrementally within thresholds
* Avoids sudden jumps in difficulty
* Updates player ELO after the game ends

### Real-Time Move Analysis

* Uses Stockfish for objective evaluation
* Uses AI (Gemini) for qualitative analysis
* Provides feedback such as:

  * Move quality (Brilliant, Good, Mistake, Blunder, etc.)
  * Accuracy score (0–100)
  * Blunder risk

### Machine Learning Integration

* Uses a trained ensemble model
* Predicts ELO based on gameplay features
* Drives the real-time adaptation loop

### Undo System

* Restores:

  * Board state
  * Evaluations
  * Move history
  * Bot ELO
* Keeps frontend and backend state consistent

### Feature Engineering

The model uses multiple signals from gameplay:

* Engine evaluation before and after the move
* Time taken per move
* Tactical indicators (check, capture, motifs)
* Game phase (opening, middlegame, endgame)
* Move classification and risk level

---

## Tech Stack

### Frontend

* Next.js
* React
* TypeScript

### Backend

* FastAPI (Python)

### AI / ML

* Ensemble ML model
* Stockfish engine (WASM)
* Gemini API for move analysis

---

## Project Structure

```
chessmind_ai/
│
├── app/                     # Next.js app router
├── components/              # UI components
├── lib/                     # ELO logic, stockfish worker, utilities
├── backend/                 # FastAPI backend
├── model/                   # ML model and training scripts
├── public/stockfish/        # Engine files
└── .env.local               # Environment variables
```

---

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/ChessMind_AI.git
cd ChessMind_AI
```

---

### 2. Install Frontend Dependencies

```bash
npm install
# or
pnpm install
```

---

### 3. Setup Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
```

---

### 4. Environment Variables

Create `.env.local` in the root:

```env
GEMINI_API_KEY=your_api_key_here
FASTAPI_URL=http://localhost:8000
```

---

### 5. Download ML Model

The trained model is not included in the repository due to size constraints.

Download it here:
[https://drive.google.com/file/d/1AxnfG1vqhdNMgmeJetjM069smXFMX--y/view?usp=sharing]

Place it inside:

```
model/ensemble_model.pkl
```

---

### 6. Setup Stockfish

```bash
mkdir -p public/stockfish
curl -L https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js -o public/stockfish/stockfish-17.js
curl -L https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.wasm -o public/stockfish/stockfish.wasm
```

---

### 7. Run the Application

Backend:

```bash
cd backend
python main.py
```

Frontend:

```bash
npm run dev
```

---

## Access

Open in browser:

```
http://localhost:3000
```

---

## ELO System

### During Game

* ELO is predicted after each move
* Bot difficulty is adjusted incrementally

### After Game

ELO is updated using:

```
E = 1 / (1 + 10^((R_opponent - R_player) / 400))
R_new = R_old + K * (S - E)
```

---

## API Endpoint

### POST `/api/predict-elo`

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
    "accuracy_score": 96,
    "blunder_risk": "low",
    "flag1": 0,
    "flag2": 0,
    "flag3": 0,
    "last_elo": 450
  }
}
```

---

## Testing

* Make moves and observe bot ELO changes
* Play weak moves and see difficulty decrease
* Play strong moves and see difficulty increase
* Undo a move and verify that ELO reverts correctly

---

## Troubleshooting

### Model Not Found

```bash
cd model
python train.py
```

### Backend Not Connecting

* Ensure FastAPI is running on port 8000
* Verify FASTAPI_URL in `.env.local`

### Stockfish Issues

* Check that files exist in `public/stockfish/`

---

## Future Improvements

* Multiplayer mode
* User accounts and rating history
* Game analytics dashboard
* Improved training using reinforcement learning

---

## Contributing

Pull requests are welcome.

---

## Author

Shreyas

---

## Notes

If you found this project useful, consider starring the repository.
