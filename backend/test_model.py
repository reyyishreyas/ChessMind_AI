
import sys
from pathlib import Path

model_dir = Path(__file__).parent.parent / "model"
sys.path.insert(0, str(model_dir))

from train import UltraChessELOPredictor
import pandas as pd

model_path = model_dir / "ensemble_model.pkl"
print(f"Loading model from: {model_path}")

predictor = UltraChessELOPredictor.load_model(str(model_path))
print("Model loaded")

if hasattr(predictor, 'selected_features'):
    print(f"\nSelected features ({len(predictor.selected_features)}):")
    for i, feat in enumerate(predictor.selected_features[:20]):  
        print(f"  {i+1}. {feat}")
    if len(predictor.selected_features) > 20:
        print(f"  ... and {len(predictor.selected_features) - 20} more")

test_data = pd.DataFrame({
    'move_number': [1],
    'start_eval': [0.56],
    'end_eval': [0.58],
    'delta_eval': [0.02],
    'move_quality': ['Perfect'],
    'time_per_move': [1.76],
    'accuracy_score': [6.0],
    'blunder_risk': [0.07],
    'flag1': [0],
    'flag2': [0],
    'flag3': [0],
    'last_elo': [447.99],
    'phase_Endgame': [0],
    'phase_Middlegame': [0],
    'phase_Opening': [1]
})

print("\nTesting prediction...")
try:
    result = predictor.predict(test_data)
    print(f"Prediction successful: {result[0]:.2f}")
except Exception as e:
    print(f"Prediction failed: {e}")
    import traceback
    traceback.print_exc()

