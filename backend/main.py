from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Literal
import pandas as pd
import sys
import os
from pathlib import Path

model_dir = Path(__file__).parent.parent / "model"
sys.path.insert(0, str(model_dir))

from train import UltraChessELOPredictor

app = FastAPI(title="Chess ELO Prediction API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],    
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

predictor = None


def predict_with_model(df: pd.DataFrame) -> float:
    if predictor is None:
        raise ValueError("Model not loaded")

    X = df.copy()
    return float(predictor.predict(X)[0])

@app.on_event("startup")
async def load_model():
    global predictor
    model_path = model_dir / "ensemble_model.pkl"
    if model_path.exists():
        try:
            predictor = UltraChessELOPredictor.load_model(str(model_path))
            print(f" Model loaded from {model_path}")
        except Exception as e:
            print(f" Error loading model: {e}")
            predictor = None
    else:
        print(f"Error: Model not found at {model_path}")
        print(f"   Expected path: {model_path.absolute()}")
        print(f"   Please train the model first using ../model/train.py")

class MoveFeatures(BaseModel):
    move_number: int
    start_eval: float
    end_eval: float
    delta_eval: float
    move_quality: Literal["Brilliant", "Good", "Mistake", "Blunder", "Perfect", "Inaccuracy"]
    time_per_move: float
    accuracy_score: float  
    blunder_risk: Literal["low", "medium", "high"]  
    flag1: int  
    flag2: int  
    flag3: int  
    last_elo: float
    phase_Endgame: bool
    phase_Middlegame: bool
    phase_Opening: bool

class ELOPredictionRequest(BaseModel):
    features: MoveFeatures

class ELOPredictionResponse(BaseModel):
    predicted_elo: float
    elo_change: float
    success: bool

@app.get("/")
async def root():
    return {"message": "Chess ELO Prediction API", "model_loaded": predictor is not None}

@app.post("/predict-elo", response_model=ELOPredictionResponse)
async def predict_elo(request: ELOPredictionRequest):
    """
    Predict new ELO based on move features
    """
    global predictor
    if predictor is None:
        try:
            model_path = model_dir / "ensemble_model.pkl"
            if not model_path.exists():
                raise HTTPException(status_code=500, detail="Model file missing")
            predictor = UltraChessELOPredictor.load_model(str(model_path))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Model load failed: {str(e)}")
    
    try:
        features = request.features
        
        blunder_risk_map = {"low": 0.07, "medium": 0.5, "high": 1.04}
        blunder_risk_numeric = blunder_risk_map.get(features.blunder_risk, 0.5)

        accuracy_adj = float(features.accuracy_score)
        if accuracy_adj > 10:
            accuracy_adj = max(0.0, min(6.0, accuracy_adj * 0.06))
        
        quality_map = {
            "Brilliant": "Perfect",
            "Perfect": "Perfect",
            "Good": "Good",
            "Inaccuracy": "Inaccuracy",
            "Mistake": "Blunder",  
            "Blunder": "Blunder"
        }
        move_quality_normalized = quality_map.get(features.move_quality, "Good")
        
        phase_count = sum([features.phase_Opening, features.phase_Middlegame, features.phase_Endgame])
        if phase_count != 1:
            if features.move_number <= 12:
                features.phase_Opening = True
                features.phase_Middlegame = False
                features.phase_Endgame = False
            elif features.move_number <= 35:
                features.phase_Opening = False
                features.phase_Middlegame = True
                features.phase_Endgame = False
            else:
                features.phase_Opening = False
                features.phase_Middlegame = False
                features.phase_Endgame = True
        
        data = pd.DataFrame({
            'move_number': [int(features.move_number)],
            'start_eval': [float(features.start_eval)],
            'end_eval': [float(features.end_eval)],
            'delta_eval': [float(features.delta_eval)],
            'move_quality': [str(move_quality_normalized)],
            'time_per_move': [float(features.time_per_move)],
            'accuracy_score': [accuracy_adj],
            'blunder_risk': [float(blunder_risk_numeric)],
            'flag1': [int(features.flag1)],
            'flag2': [int(features.flag2)],
            'flag3': [int(features.flag3)],
            'last_elo': [float(features.last_elo)],
            'phase_Endgame': [int(features.phase_Endgame)],  
            'phase_Middlegame': [int(features.phase_Middlegame)],  
            'phase_Opening': [int(features.phase_Opening)]  
        })
        
        try:
            predicted_elo = predict_with_model(data)
        except Exception as pred_error:
            error_msg = str(pred_error)
            print(f"Prediction error: {error_msg}")
            print(f"DataFrame columns: {list(data.columns)}")
            print(f"DataFrame dtypes:\n{data.dtypes}")
            print(f"DataFrame values:\n{data.iloc[0].to_dict()}")
            raise HTTPException(status_code=500, detail=f"Prediction failed: {error_msg}")
        elo_int = int(round(predicted_elo))
        change_int = int(round(elo_int - features.last_elo))
        
        return ELOPredictionResponse(
            predicted_elo=float(elo_int),
            elo_change=float(change_int),
            success=True
        )
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Prediction error: {e}")
        print(f"Full traceback:\n{error_trace}")
        print(f"Features received: {request.features}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

@app.get("/health")
async def health():
    return {"status": "healthy", "model_loaded": predictor is not None}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
