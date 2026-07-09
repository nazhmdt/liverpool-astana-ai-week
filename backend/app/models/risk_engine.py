"""
HepatoGuard AI — Risk Engine.

Three layers, deliberately kept separable:
  1. Deterministic clinical scores (FIB-4, APRI) — pure functions, no ML,
     the thing a critic can hand-verify with a calculator.
  2. Longitudinal trend detection — slope of platelets/AST over the 5-year
     synthetic history, the thing a single snapshot would miss.
  3. ML risk stratification (XGBoost) trained on the synthetic cohort,
     with SHAP explainability for every prediction.
"""
import json
import numpy as np
import pandas as pd
import xgboost as xgb
import shap
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, f1_score, roc_auc_score, confusion_matrix, classification_report
)
from sklearn.preprocessing import LabelEncoder
import joblib

RISK_CATEGORIES = ["Low", "Intermediate", "High", "Critical"]

DIAGNOSIS_TO_RISK = {
    "healthy": "Low",
    "MASLD": "Intermediate",
    "chronic_HBV": "High",
    "chronic_HCV": "High",
    "fibrosis_F1": "Intermediate",
    "fibrosis_F2": "High",
    "fibrosis_F3": "Critical",
    "cirrhosis": "Critical",
    "HCC": "Critical",
}

FEATURE_COLS = [
    "age", "bmi", "ast", "alt", "ggt", "platelets",
    "fib4", "apri", "ast_trend_slope", "platelet_trend_slope",
    "sex_M", "HBsAg", "anti_HCV", "anti_HDV",
    "alcohol_use", "diabetes", "obesity", "injection_drug_use", "transfusion_history",
]

FEATURE_LABELS = {
    "age": "Возраст",
    "bmi": "ИМТ",
    "ast": "АСТ (последний)",
    "alt": "АЛТ (последний)",
    "ggt": "ГГТ (последний)",
    "platelets": "Тромбоциты (последний)",
    "fib4": "Индекс FIB-4",
    "apri": "Индекс APRI",
    "ast_trend_slope": "Тренд АСТ (в год)",
    "platelet_trend_slope": "Тренд тромбоцитов (в год)",
    "sex_M": "Пол = мужской",
    "HBsAg": "HBsAg (гепатит B)",
    "anti_HCV": "Антитела к гепатиту C",
    "anti_HDV": "Антитела к гепатиту D",
    "alcohol_use": "Употребление алкоголя",
    "diabetes": "Диабет",
    "obesity": "Ожирение",
    "injection_drug_use": "Инъекционное употребление наркотиков в анамнезе",
    "transfusion_history": "Переливание крови в анамнезе",
}

MODEL_PATH = "app/models/xgb_risk_model.json"
ENCODER_PATH = "app/models/label_encoder.pkl"
METRICS_PATH = "app/models/metrics.json"


# ---------- Layer 1: deterministic clinical scores ----------

def fib4(age: float, ast: float, alt: float, platelets: float) -> float:
    """FIB-4 index. Standard thresholds: <1.30 low, 1.30-2.67 grey zone, >2.67 high."""
    if alt <= 0 or platelets <= 0:
        return 0.0
    return round((age * ast) / (platelets * np.sqrt(alt)), 2)


def apri(ast: float, platelets: float, ast_uln: float = 40.0) -> float:
    """AST-to-Platelet Ratio Index. >1.0 suggests significant fibrosis, >2.0 suggests cirrhosis."""
    if platelets <= 0:
        return 0.0
    return round(((ast / ast_uln) / platelets) * 100, 2)


def fib4_band(score: float) -> str:
    if score < 1.30:
        return "low"
    if score <= 2.67:
        return "grey_zone"
    return "high"


# ---------- Layer 2: longitudinal trend ----------

def trend_slope(series: list) -> float:
    """Linear slope per year over quarterly series (units/year). Negative = declining."""
    series = np.asarray(series, dtype=float)
    n = len(series)
    if n < 2:
        return 0.0
    x_years = np.arange(n) / 4.0
    slope, _ = np.polyfit(x_years, series, 1)
    return round(float(slope), 3)


# ---------- Feature engineering shared by training + inference ----------

def build_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["fib4"] = out.apply(lambda r: fib4(r["age"], r["ast"], r["alt"], r["platelets"]), axis=1)
    out["apri"] = out.apply(lambda r: apri(r["ast"], r["platelets"]), axis=1)
    out["ast_trend_slope"] = out["ast_series"].apply(trend_slope)
    out["platelet_trend_slope"] = out["platelets_series"].apply(trend_slope)
    out["sex_M"] = (out["sex"] == "M").astype(int)
    for c in ["HBsAg", "anti_HCV", "anti_HDV", "alcohol_use", "diabetes", "obesity",
              "injection_drug_use", "transfusion_history"]:
        out[c] = out[c].astype(int)
    return out


# ---------- Layer 3: ML training ----------

def train(df: pd.DataFrame):
    feat_df = build_features(df)
    X = feat_df[FEATURE_COLS]
    y_raw = feat_df["diagnosis"].map(DIAGNOSIS_TO_RISK)

    le = LabelEncoder()
    le.fit(RISK_CATEGORIES)
    y = le.transform(y_raw)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = xgb.XGBClassifier(
        n_estimators=250, max_depth=5, learning_rate=0.08,
        subsample=0.85, colsample_bytree=0.85,
        objective="multi:softprob", num_class=len(RISK_CATEGORIES),
        eval_metric="mlogloss", random_state=42,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)

    metrics = {
        "accuracy": round(accuracy_score(y_test, y_pred), 4),
        "f1_macro": round(f1_score(y_test, y_pred, average="macro"), 4),
        "auc_roc_ovr_macro": round(roc_auc_score(y_test, y_proba, multi_class="ovr", average="macro"), 4),
        "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
        "classes": list(le.classes_),
        "classification_report": classification_report(y_test, y_pred, target_names=le.classes_, output_dict=True),
        "n_train": len(X_train),
        "n_test": len(X_test),
    }

    model.save_model(MODEL_PATH)
    joblib.dump(le, ENCODER_PATH)
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)

    return model, le, metrics


class RiskEngine:
    def __init__(self):
        self.model = xgb.XGBClassifier()
        self.model.load_model(MODEL_PATH)
        self.le = joblib.load(ENCODER_PATH)
        self.explainer = shap.TreeExplainer(self.model)
        with open(METRICS_PATH) as f:
            self.metrics = json.load(f)

    def score_patient(self, patient_row: dict) -> dict:
        """patient_row must contain raw fields (age, ast, alt, ggt, platelets, ast_series,
        platelets_series, sex, HBsAg, anti_HCV, anti_HDV, alcohol_use, diabetes, obesity,
        injection_drug_use, transfusion_history, bmi)."""
        df = pd.DataFrame([patient_row])
        feat_df = build_features(df)
        X = feat_df[FEATURE_COLS]

        proba = self.model.predict_proba(X)[0]
        pred_idx = int(np.argmax(proba))
        category = self.le.classes_[pred_idx]
        risk_score = int(round(float(proba[list(self.le.classes_).index("Critical")] * 0.4
                                      + proba[list(self.le.classes_).index("High")] * 0.7
                                      + proba[list(self.le.classes_).index("Critical")] * 0.3) * 100)) \
            if "Critical" in self.le.classes_ else int(round(proba[pred_idx] * 100))
        # simpler, monotonic 0-100 severity score: weighted sum over ordered categories
        order = {"Low": 0, "Intermediate": 33, "High": 66, "Critical": 100}
        risk_score = int(round(sum(proba[i] * order[c] for i, c in enumerate(self.le.classes_))))

        shap_values = self.explainer.shap_values(X)
        # xgboost multiclass shap: list per class or (n, features, classes) array depending on version
        sv = shap_values[pred_idx][0] if isinstance(shap_values, list) else shap_values[0, :, pred_idx]
        contributions = sorted(
            [
                {"feature": FEATURE_LABELS.get(f, f), "value": float(X.iloc[0][f]), "impact": round(float(v), 4)}
                for f, v in zip(FEATURE_COLS, sv)
            ],
            key=lambda d: abs(d["impact"]), reverse=True,
        )[:5]

        return {
            "risk_score": risk_score,
            "risk_category": category,
            "fib4": float(feat_df["fib4"].iloc[0]),
            "fib4_band": fib4_band(float(feat_df["fib4"].iloc[0])),
            "apri": float(feat_df["apri"].iloc[0]),
            "platelet_trend_slope": float(feat_df["platelet_trend_slope"].iloc[0]),
            "ast_trend_slope": float(feat_df["ast_trend_slope"].iloc[0]),
            "top_contributors": contributions,
            "class_probabilities": {c: round(float(p), 4) for c, p in zip(self.le.classes_, proba)},
        }


if __name__ == "__main__":
    df = pd.read_pickle("app/data/cohort.pkl")
    model, le, metrics = train(df)
    print(json.dumps({k: v for k, v in metrics.items() if k not in ("confusion_matrix", "classification_report")}, indent=2))
