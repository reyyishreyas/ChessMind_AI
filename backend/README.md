# Chess ELO Prediction Backend

FastAPI backend for dynamic ELO prediction using the trained ensemble model.

## Setup

1. Install dependencies:
```bash
cd backend
pip install -r requirements.txt
```

2. Make sure the trained model exists:
- The model should be at `../model/ensemble_model.pkl`
- If not, train the model first using `../model/train.py`

3. Set environment variables (optional):
```bash
export FASTAPI_URL=http://localhost:8000  # For frontend
```

## Running the Backend

```bash
cd backend
python main.py
```

Or using uvicorn directly:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

## API Endpoints

### GET `/`
Health check endpoint

### POST `/predict-elo`
Predict new ELO based on move features

**Request Body:**
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

### GET `/health`
Check if the model is loaded and API is healthy

## Integration with Frontend

The frontend calls this API through the Next.js API route at `/api/predict-elo`, which proxies requests to this FastAPI backend.

Make sure to set `FASTAPI_URL` environment variable in your Next.js app to point to this backend.

