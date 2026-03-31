import pandas as pd
from train import UltraChessELOPredictor

def main():
    MODEL_PATH = 'ensemble_model.pkl'
    X_TEST_PATH = 'X_test.csv'
    Y_TEST_PATH = 'y_test.csv'

    print("Loading saved model")
    predictor = UltraChessELOPredictor.load_model(MODEL_PATH)

    print(f"Loading test data from '{X_TEST_PATH}' and '{Y_TEST_PATH}'")
    X_test = pd.read_csv(X_TEST_PATH)
    y_test = pd.read_csv(Y_TEST_PATH).values.ravel()

    print("Aligning test features with training features")
    training_features = predictor.numeric_features + predictor.categorical_features

    X_test = X_test.loc[:, X_test.columns.intersection(training_features)]

    for col in training_features:
        if col not in X_test.columns:
            if col in predictor.numeric_features:
                X_test[col] = 0
            else:
                X_test[col] = 'missing'

    X_test = X_test[training_features]

    print("Evaluating model on test data")
    metrics = predictor.evaluate(X_test, y_test)

    print("\nEvaluation complete!")
    print(f"R² Score: {metrics['r2']:.6f}")
    print(f"MAE: {metrics['mae']:.2f}, RMSE: {metrics['rmse']:.2f}")

if __name__ == "__main__":
    main()
