
import pandas as pd
from train import UltraChessELOPredictor

predictor = UltraChessELOPredictor.load_model('ensemble_model.pkl')

example_data = pd.DataFrame({
    'move_number': [10],
    'start_eval': [1.5],
    'end_eval': [1.8],
    'delta_eval': [0.3],
    'move_quality': ['Perfect'],
    'time_per_move': [2.5],
    'accuracy_score': [5.8],
    'blunder_risk': [0.2],
    'flag1': [0],
    'flag2': [0],
    'flag3': [0],
    'last_elo': [1500.0],  
    'phase_Endgame': [False],
    'phase_Middlegame': [True],
    'phase_Opening': [False]
})

predicted_elo = predictor.predict(example_data)
print(f"\nExample Prediction:")
print(f"   Input last_elo: {example_data['last_elo'].values[0]:.2f}")
print(f"   Predicted new_elo: {predicted_elo[0]:.2f}")
print(f"   ELO change: {predicted_elo[0] - example_data['last_elo'].values[0]:.2f}")

batch_data = pd.DataFrame({
    'move_number': [1, 2, 3],
    'start_eval': [0.2, 1.5, 1.8],
    'end_eval': [1.5, 1.8, 2.0],
    'delta_eval': [1.3, 0.3, 0.2],
    'move_quality': ['Blunder', 'Perfect', 'Good'],
    'time_per_move': [3.0, 2.5, 1.8],
    'accuracy_score': [3.0, 5.8, 5.2],
    'blunder_risk': [1.5, 0.2, 0.4],
    'flag1': [0, 0, 1],
    'flag2': [0, 1, 0],
    'flag3': [0, 0, 0],
    'last_elo': [1500.0, 1495.0, 1500.0],  
    'phase_Endgame': [False, False, False],
    'phase_Middlegame': [False, True, True],
    'phase_Opening': [True, False, False]
})

predicted_elos = predictor.predict(batch_data)
print(f"\nBatch Predictions:")
for i, (last_elo, new_elo) in enumerate(zip(batch_data['last_elo'], predicted_elos)):
    print(f"   Move {i+1}: {last_elo:.2f} → {new_elo:.2f} (change: {new_elo - last_elo:+.2f})")
