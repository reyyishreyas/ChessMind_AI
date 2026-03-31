import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

df = pd.read_csv("data.csv")  

groups = df["game_id"]
X = df.drop(columns=["game_id", "new_elo"])  
y = df["new_elo"]  

X = pd.get_dummies(X, columns=["phase"])  

gss = GroupShuffleSplit(test_size=0.2, n_splits=1, random_state=42)
train_idx, test_idx = next(gss.split(X, y, groups=groups))

X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]

X_train.to_csv("X_train.csv", index=False)
X_test.to_csv("X_test.csv", index=False)
y_train.to_csv("y_train.csv", index=False)
y_test.to_csv("y_test.csv", index=False)

print("Data successfully split and saved")
print("X_train:", X_train.shape)
print("X_test:", X_test.shape)
print("y_train:", y_train.shape)
print("y_test:", y_test.shape)
