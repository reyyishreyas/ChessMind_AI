import os
import time
import warnings
import pickle
import json
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from sklearn.preprocessing import StandardScaler, RobustScaler, LabelEncoder
from sklearn.impute import SimpleImputer
from sklearn.feature_selection import SelectFromModel
from sklearn.model_selection import cross_val_score
from sklearn.linear_model import Ridge, ElasticNet
from sklearn.ensemble import RandomForestRegressor, ExtraTreesRegressor, StackingRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error

import lightgbm as lgb
import xgboost as xgb
from catboost import CatBoostRegressor

warnings.filterwarnings('ignore')

RANDOM_SEED = 42
np.random.seed(RANDOM_SEED)


class UltraChessELOPredictor:
    def __init__(self, fast_mode=False):
        self.fast_mode = fast_mode
        self.numeric_features = []
        self.categorical_features = []
        self.selected_features = []

        self.numeric_imputer = SimpleImputer(strategy='median')
        self.categorical_imputer = SimpleImputer(strategy='most_frequent')
        self.scaler = RobustScaler()
        self.label_encoders = {}
        self.feature_selector = None

        self.base_models = {}
        self.stacked_model = None

        self.feature_importance = {}

        self.training_time = 0
        self.cv_scores = {}

    def detect_feature_types(self, X):
        for col in X.columns:
            if X[col].dtype in ['object', 'category']:
                self.categorical_features.append(col)
            elif X[col].dtype in ['int64', 'float64']:
                if X[col].nunique() < 15 and X[col].dtype == 'int64':
                    self.categorical_features.append(col)
                else:
                    self.numeric_features.append(col)
            else:
                self.numeric_features.append(col)

    def create_advanced_features(self, X):
        X_new = X.copy()
        feature_patterns = {
            'eval': ['accuracy', 'blunder_risk', 'time'],
            'accuracy': ['blunder_risk', 'phase', 'time'],
            'time': ['phase', 'move_number']
        }
        for base_feat, interact_feats in feature_patterns.items():
            base_cols = [c for c in X.columns if base_feat in c.lower()]
            for base_col in base_cols:
                for interact_feat in interact_feats:
                    interact_cols = [c for c in X.columns if interact_feat in c.lower()]
                    for interact_col in interact_cols:
                        if base_col != interact_col:
                            new_col = f'{base_col}_x_{interact_col}'
                            X_new[new_col] = X[base_col] * X[interact_col]
                            ratio_col = f'{base_col}_ratio_{interact_col}'
                            with warnings.catch_warnings():
                                warnings.simplefilter("ignore")
                                X_new[ratio_col] = X[base_col] / (X[interact_col] + 1e-6)
                            if new_col not in self.numeric_features:
                                self.numeric_features.append(new_col)
                            if ratio_col not in self.numeric_features:
                                self.numeric_features.append(ratio_col)
        return X_new

    def preprocess_features(self, X, is_training=True):
        X_proc = X.copy()
        if self.numeric_features:
            if is_training:
                X_proc[self.numeric_features] = self.numeric_imputer.fit_transform(X_proc[self.numeric_features].to_numpy())
            else:
                X_proc[self.numeric_features] = self.numeric_imputer.transform(X_proc[self.numeric_features].to_numpy())
        if self.categorical_features:
            if is_training:
                X_proc[self.categorical_features] = self.categorical_imputer.fit_transform(X_proc[self.categorical_features].to_numpy())
            else:
                X_proc[self.categorical_features] = self.categorical_imputer.transform(X_proc[self.categorical_features].to_numpy())
        for col in self.categorical_features:
            if is_training:
                le = LabelEncoder()
                X_proc[col] = le.fit_transform(X_proc[col].astype(str))
                self.label_encoders[col] = le
            else:
                le = self.label_encoders[col]
                X_proc[col] = X_proc[col].astype(str).map(lambda x: le.transform([x])[0] if x in le.classes_ else -1)
        if self.numeric_features:
            if is_training:
                X_proc[self.numeric_features] = self.scaler.fit_transform(X_proc[self.numeric_features].to_numpy())
            else:
                X_proc[self.numeric_features] = self.scaler.transform(X_proc[self.numeric_features].to_numpy())
        return X_proc

    def select_features(self, X, y=None, is_training=True):
        if is_training:
            selector_model = lgb.LGBMRegressor(n_estimators=50, max_depth=5, random_state=RANDOM_SEED, n_jobs=-1)
            self.feature_selector = SelectFromModel(selector_model, threshold='0.5*median', prefit=False)
            X_sel = self.feature_selector.fit_transform(X, y)
            self.selected_features = X.columns[self.feature_selector.get_support()].tolist()
        else:
            X_sel = self.feature_selector.transform(X.to_numpy())
        return pd.DataFrame(X_sel, columns=self.selected_features, index=X.index)

    def build_optimized_models(self):
        if self.fast_mode:
            lgb_params = {'n_estimators': 200, 'max_depth': 7, 'learning_rate': 0.05}
            xgb_params = {'n_estimators': 200, 'max_depth': 6, 'learning_rate': 0.05}
            cat_params = {'iterations': 200, 'depth': 6, 'learning_rate': 0.05}
            rf_params = {'n_estimators': 150, 'max_depth': 20}
            et_params = {'n_estimators': 150, 'max_depth': 20}
        else:
            lgb_params = {'n_estimators': 500, 'max_depth': 10, 'learning_rate': 0.03, 'num_leaves': 80,
                          'subsample': 0.9, 'colsample_bytree': 0.9, 'min_child_samples': 20,
                          'reg_alpha': 0.1, 'reg_lambda': 0.1}
            xgb_params = {'n_estimators': 500, 'max_depth': 8, 'learning_rate': 0.03, 'subsample': 0.9,
                          'colsample_bytree': 0.9, 'min_child_weight': 3, 'gamma': 0.1,
                          'reg_alpha': 0.1, 'reg_lambda': 1.0}
            cat_params = {'iterations': 500, 'depth': 8, 'learning_rate': 0.03, 'l2_leaf_reg': 3,
                          'bagging_temperature': 0.2, 'random_strength': 0.2}
            rf_params = {'n_estimators': 300, 'max_depth': 30, 'min_samples_split': 5,
                         'min_samples_leaf': 2, 'max_features': 'sqrt'}
            et_params = {'n_estimators': 300, 'max_depth': 30, 'min_samples_split': 5,
                         'min_samples_leaf': 2, 'max_features': 'sqrt'}

        self.base_models['lgb'] = lgb.LGBMRegressor(**lgb_params, random_state=RANDOM_SEED, n_jobs=-1, force_col_wise=True)
        self.base_models['xgb'] = xgb.XGBRegressor(**xgb_params, random_state=RANDOM_SEED, n_jobs=-1, tree_method='hist')
        self.base_models['cat'] = CatBoostRegressor(**cat_params, random_state=RANDOM_SEED, verbose=0, thread_count=-1)
        self.base_models['rf'] = RandomForestRegressor(**rf_params, random_state=RANDOM_SEED, n_jobs=-1)
        self.base_models['et'] = ExtraTreesRegressor(**et_params, random_state=RANDOM_SEED, n_jobs=-1)
        self.base_models['ridge'] = Ridge(alpha=10.0, random_state=RANDOM_SEED)
        self.base_models['elastic'] = ElasticNet(alpha=1.0, l1_ratio=0.5, random_state=RANDOM_SEED, max_iter=2000)
        self.base_models['mlp'] = MLPRegressor(
            hidden_layer_sizes=(256, 128, 64) if not self.fast_mode else (128, 64),
            activation='relu',
            solver='adam',
            alpha=0.001,
            batch_size=256,
            learning_rate='adaptive',
            learning_rate_init=0.001,
            max_iter=500 if not self.fast_mode else 200,
            random_state=RANDOM_SEED,
            early_stopping=True,
            validation_fraction=0.1,
            n_iter_no_change=20
        )

    def train(self, X_train, y_train):
        start_time = time.time()
        print("🔹 Detecting feature types...")
        self.detect_feature_types(X_train)

        print("🔹 Creating advanced features...")
        X_train = self.create_advanced_features(X_train)

        print("🔹 Preprocessing features...")
        X_train_proc = self.preprocess_features(X_train, is_training=True)

        print("🔹 Selecting features...")
        X_train_sel = self.select_features(X_train_proc, y_train, is_training=True)

        print("🔹 Building base models...")
        self.build_optimized_models()

        print("\n🔹 Training 8 base models...")
        for i, (name, model) in enumerate(self.base_models.items(), 1):
            print(f"[{i}/8] Training {name.upper()}...", end=" ", flush=True)
            model.fit(X_train_sel, y_train)
            cv = cross_val_score(model, X_train_sel, y_train, cv=3, scoring='r2', n_jobs=-1)
            self.cv_scores[name] = cv.mean()
            print(f"✓ CV R² = {cv.mean():.6f}")

        print("\n🔹 Building stacked ensemble...")
        estimators = [(name, model) for name, model in self.base_models.items()]
        meta_model = Ridge(alpha=5.0, random_state=RANDOM_SEED)
        self.stacked_model = StackingRegressor(estimators=estimators, final_estimator=meta_model, cv=5, n_jobs=-1)
        self.stacked_model.fit(X_train_sel, y_train)

        self.training_time = time.time() - start_time
        print(f"\n✅ Training completed in {self.training_time/60:.2f} minutes")

    def predict(self, X_test):
        X_test = self.create_advanced_features(X_test)
        X_test_proc = self.preprocess_features(X_test, is_training=False)
        X_test_sel = self.select_features(X_test_proc, None, is_training=False)
        return self.stacked_model.predict(X_test_sel)

    def evaluate(self, X_test, y_test, thresholds=[10, 25, 50, 100]):
        y_pred = self.predict(X_test)
        abs_errors = np.abs(y_test - y_pred)
        r2 = r2_score(y_test, y_pred)
        mae = mean_absolute_error(y_test, y_pred)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))

        print(f"R² Score: {r2:.6f}")
        print(f"MAE: {mae:.2f}, RMSE: {rmse:.2f}, Median Error: {np.median(abs_errors):.2f}")
        for t in thresholds:
            acc = np.mean(abs_errors <= t) * 100
            print(f"Within ±{t} ELO: {acc:.4f}%")
        return {
            'r2': float(r2),
            'mae': float(mae),
            'rmse': float(rmse),
            'median_abs_error': float(np.median(abs_errors)),
            'threshold_accuracies': {
                str(t): float(np.mean(abs_errors <= t) * 100) for t in thresholds
            }
        }

    def save_report(self, metrics, X_train_shape=None, X_test_shape=None,
                    y_train_shape=None, y_test_shape=None,
                    save_path='model_report.json'):
        report = {
            'fast_mode': self.fast_mode,
            'training_time_seconds': float(self.training_time),
            'training_time_minutes': float(self.training_time / 60) if self.training_time else None,
            'cv_scores': self.cv_scores,
            'numeric_features_count': len(self.numeric_features),
            'categorical_features_count': len(self.categorical_features),
            'selected_features_count': len(self.selected_features),
            'selected_features': self.selected_features,
            'base_models': list(self.base_models.keys()),
            'metrics': metrics,
            'data_shapes': {
                'X_train': X_train_shape,
                'X_test': X_test_shape,
                'y_train': y_train_shape,
                'y_test': y_test_shape,
            }
        }
        with open(save_path, 'w') as f:
            json.dump(report, f, indent=4)
        print(f"Model report saved as {save_path}")

    def plot_feature_importance(self, top_n=25, save_path='feature_importance.png'):
        importance_dict = {}
        for m in ['lgb', 'xgb', 'cat', 'rf', 'et']:
            model = self.base_models.get(m)
            if hasattr(model, 'feature_importances_'):
                importance_dict[m] = dict(zip(self.selected_features, model.feature_importances_))
        self.feature_importance = {f: np.mean([importance_dict[m][f] for m in importance_dict if f in importance_dict[m]])
                                   for f in self.selected_features}
        top_feats = dict(list(sorted(self.feature_importance.items(), key=lambda x: x[1], reverse=True))[:top_n])
        plt.figure(figsize=(12, 8))
        plt.barh(list(top_feats.keys()), list(top_feats.values()))
        plt.gca().invert_yaxis()
        plt.xlabel('Feature Importance')
        plt.title(f'Top {top_n} Features')
        plt.tight_layout()
        plt.savefig(save_path)
        plt.close()
        print(f"Feature importance saved as {save_path}")

    def save_model(self, filepath='ensemble_model.pkl'):
        model_data = self.__dict__
        with open(filepath, 'wb') as f:
            pickle.dump(model_data, f)
        print(f"Model saved: {filepath} ({os.path.getsize(filepath)/1024/1024:.2f} MB)")

    @staticmethod
    def load_model(filepath='ensemble_model.pkl'):
        with open(filepath, 'rb') as f:
            data = pickle.load(f)
        predictor = UltraChessELOPredictor()
        predictor.__dict__.update(data)
        print(f"Model loaded: {filepath}")
        return predictor


if __name__ == "__main__":
    X_train = pd.read_csv('X_train.csv')
    X_test = pd.read_csv('X_test.csv')
    y_train = pd.read_csv('y_train.csv').values.ravel()
    y_test = pd.read_csv('y_test.csv').values.ravel()

    predictor = UltraChessELOPredictor(fast_mode=False)

    predictor.train(X_train, y_train)

    metrics = predictor.evaluate(X_test, y_test)

    predictor.save_report(
        metrics=metrics,
        X_train_shape=X_train.shape,
        X_test_shape=X_test.shape,
        y_train_shape=y_train.shape,
        y_test_shape=y_test.shape,
        save_path='model_report.json'
    )

    predictor.plot_feature_importance(top_n=25)

    predictor.save_model('ensemble_model.pkl')
