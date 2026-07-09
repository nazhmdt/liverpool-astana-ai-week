"""Real-data fibrosis/cirrhosis-stage classifier trained on the Mayo Clinic
PBC cohort (see app/data/real_data_loader.py for dataset notes).

Kept separate from risk_engine.py (the synthetic-cohort FIB-4/APRI + XGBoost
engine) so the two data sources and their model artifacts never mix.
"""
import json
import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_predict
from sklearn.metrics import accuracy_score, f1_score, classification_report

from app.data.real_data_loader import load_real_cohort, to_model_matrix, FEATURES

MODEL_PATH = "app/models/real_risk_xgb.json"
METRICS_PATH = "app/models/real_risk_metrics.json"

STAGE_LABELS_RU = {0: "Стадия 1", 1: "Стадия 2", 2: "Стадия 3", 3: "Стадия 4 (цирроз)"}

MODEL_PARAMS = dict(n_estimators=200, max_depth=3, learning_rate=0.05,
                     eval_metric="mlogloss", reg_lambda=1.0)


def train():
    df = load_real_cohort()
    X, y = to_model_matrix(df)

    # n=412 makes a single 80/20 split noisy -- 5-fold stratified CV gives a
    # much more honest accuracy estimate (mean +/- std across folds) than one
    # lucky/unlucky split would.
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    fold_acc, fold_f1 = [], []
    for train_idx, test_idx in cv.split(X, y):
        m = xgb.XGBClassifier(**MODEL_PARAMS)
        m.fit(X.iloc[train_idx], y.iloc[train_idx])
        preds = m.predict(X.iloc[test_idx])
        fold_acc.append(accuracy_score(y.iloc[test_idx], preds))
        fold_f1.append(f1_score(y.iloc[test_idx], preds, average="macro"))
    cv_preds = cross_val_predict(xgb.XGBClassifier(**MODEL_PARAMS), X, y, cv=cv)

    # Final model for serving predictions: trained on a held-out-verified
    # 80/20 split so classification_report reflects a genuine unseen test set.
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    model = xgb.XGBClassifier(**MODEL_PARAMS)
    model.fit(X_train, y_train)
    preds = model.predict(X_test)

    importances = sorted(
        zip(FEATURES, model.feature_importances_.round(4).tolist()),
        key=lambda kv: kv[1], reverse=True,
    )

    metrics = {
        "cv_accuracy_mean": round(float(np.mean(fold_acc)), 4),
        "cv_accuracy_std": round(float(np.std(fold_acc)), 4),
        "cv_f1_macro_mean": round(float(np.mean(fold_f1)), 4),
        "cv_f1_macro_std": round(float(np.std(fold_f1)), 4),
        "cv_folds": 5,
        "accuracy": round(accuracy_score(y_test, preds), 4),
        "f1_macro": round(f1_score(y_test, preds, average="macro"), 4),
        "classification_report": classification_report(
            y_test, preds, target_names=[STAGE_LABELS_RU[i] for i in sorted(set(y))], output_dict=True
        ),
        "feature_importance": [{"feature": f, "importance": v} for f, v in importances],
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "n_total": int(len(df)),
        "features": FEATURES,
        "source": "Mayo Clinic PBC trial (public/UCI), Stage 1-4, n=418",
        "caveat": "Первичный билиарный цирроз (ПБЦ), не вирусный гепатит/MASLD. "
                  "Нет АЛТ и вирусных маркеров -- FIB-4 и HBsAg/anti-HCV скрининг "
                  "на этих данных не проверяются, только APRI и стадирование по биопсии.",
    }
    model.save_model(MODEL_PATH)
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)
    print(json.dumps({k: v for k, v in metrics.items() if k not in ("classification_report",)}, indent=2, ensure_ascii=False))
    return model, metrics


class RealRiskEngine:
    def __init__(self):
        self.model = xgb.XGBClassifier()
        self.model.load_model(MODEL_PATH)
        with open(METRICS_PATH) as f:
            self.metrics = json.load(f)

    def score_row(self, row: dict) -> dict:
        x = np.array([[row.get(f, np.nan) for f in FEATURES]], dtype=float)
        probs = self.model.predict_proba(x)[0]
        pred = int(np.argmax(probs))
        return {
            "stage_pred": STAGE_LABELS_RU[pred],
            "stage_probabilities": {STAGE_LABELS_RU[i]: round(float(p) * 100, 1) for i, p in enumerate(probs)},
        }


if __name__ == "__main__":
    train()
