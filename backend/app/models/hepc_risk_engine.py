"""Real-data hepatitis C stage classifier, ported from the team's exploratory
notebook (Kaggle "Hepatitis C Prediction Dataset" / UCI "HCV data", 615
patients: Age, Sex, ALB, ALP, ALT, AST, BIL, CHE, CHOL, CREA, GGT, PROT ->
5-class Category: Blood Donor / suspect Blood Donor / Hepatitis / Fibrosis /
Cirrhosis).

Kept separate from risk_engine.py (synthetic cohort) and real_risk_engine.py
(Mayo PBC cirrhosis dataset) -- three different data sources, three different
model artifacts, never mixed. The preprocessing and BalancedXGBClassifier
below are a faithful port of the notebook's Step 3-8 pipeline, including its
class-imbalance handling and its choice of Macro F1 (not accuracy) as the
metric that actually matters here: the majority class is 86.7% of the data,
so a model that always predicts "healthy" scores ~87% accuracy while
catching zero hepatitis/fibrosis/cirrhosis cases.
"""
import json
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score, balanced_accuracy_score, f1_score,
    precision_score, recall_score, classification_report,
)
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler, OneHotEncoder, LabelEncoder, FunctionTransformer
from sklearn.utils.class_weight import compute_sample_weight

RAW_PATH = "app/data/hcvdat0.csv"
MODEL_PATH = "app/models/hepc_risk_xgb.json"
METRICS_PATH = "app/models/hepc_risk_metrics.json"

CATEGORY_LABELS_RU = {
    "0=Blood Donor": "Здоровый донор",
    "0s=suspect Blood Donor": "Подозрительный донор",
    "1=Hepatitis": "Гепатит",
    "2=Fibrosis": "Фиброз",
    "3=Cirrhosis": "Цирроз",
}

SKEWED = ["ALT", "AST", "GGT", "BIL", "CREA", "ALP"]
AGE_BINS = [0, 35, 45, 55, 65, 120]
AGE_LABELS = ["<35", "35-45", "45-55", "55-65", "65+"]
EPS = 1e-6


def engineer_features(X_in: pd.DataFrame) -> pd.DataFrame:
    """Row-wise, stateless clinical feature construction -- identical logic
    to the notebook's Step 4, so it is safe to run before any train/test
    split (nothing here is fitted on the data)."""
    Xe = X_in.copy()
    if {"AST", "ALT"}.issubset(Xe.columns):
        Xe["AST_ALT_ratio"] = Xe["AST"] / (Xe["ALT"] + EPS)
    if {"PROT", "ALB"}.issubset(Xe.columns):
        Xe["GLOB"] = (Xe["PROT"] - Xe["ALB"]).clip(lower=0)
        Xe["ALB_GLOB_ratio"] = Xe["ALB"] / (Xe["GLOB"] + EPS)
    for col in SKEWED:
        if col in Xe.columns:
            Xe[f"log_{col}"] = np.log1p(Xe[col].clip(lower=0))
    Xe = Xe.drop(columns=[c for c in SKEWED if c in Xe.columns])
    if "Age" in Xe.columns:
        Xe["AgeGroup"] = pd.cut(Xe["Age"], bins=AGE_BINS, labels=AGE_LABELS, right=False).astype(str)
    return Xe


def _sanitize_names(X_in: pd.DataFrame) -> pd.DataFrame:
    """XGBoost rejects feature names containing [, ] or < (e.g. 'AgeGroup_<35')."""
    X_out = X_in.copy()
    X_out.columns = (
        pd.Index(X_out.columns)
        .str.replace(r"[\[\]<>]", "", regex=True)
        .str.replace(r"[^0-9a-zA-Z_]", "_", regex=True)
    )
    return X_out


class BalancedXGBClassifier(xgb.XGBClassifier):
    """XGBClassifier with class_weight='balanced' semantics -- sample weights
    are recomputed from whichever labels are handed to .fit(), so under
    cross-validation they come from the training fold alone, never the full
    dataset."""

    def fit(self, X, y, **kwargs):
        kwargs.setdefault("sample_weight", compute_sample_weight("balanced", y))
        return super().fit(X, y, **kwargs)


def load_data() -> pd.DataFrame:
    df = pd.read_csv(RAW_PATH, index_col=0)
    return df


def build_preprocessor(scale: bool = False) -> ColumnTransformer:
    numeric_steps = [("impute", SimpleImputer(strategy="median"))]
    if scale:
        numeric_steps.append(("scale", StandardScaler()))
    numeric_pipe = Pipeline(numeric_steps)
    categorical_pipe = Pipeline([
        ("impute", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])
    # column lists are resolved lazily at fit time via the engineered preview below
    return numeric_pipe, categorical_pipe


def train():
    df = load_data()
    TARGET = "Category"
    X = df.drop(columns=[TARGET])
    y_raw = df[TARGET]

    label_encoder = LabelEncoder()
    y = label_encoder.fit_transform(y_raw)
    class_names = list(label_encoder.classes_)

    X_engineered_preview = engineer_features(X)
    numeric_features = X_engineered_preview.select_dtypes(include=np.number).columns.tolist()
    categorical_features = X_engineered_preview.select_dtypes(include=["object", "category", "bool"]).columns.tolist()

    def get_engineered_column_names(_transformer, feature_names_in):
        dummy = pd.DataFrame(columns=feature_names_in)
        return np.array(engineer_features(dummy).columns)

    feature_engineer = FunctionTransformer(engineer_features, validate=False, feature_names_out=get_engineered_column_names)

    numeric_pipe = Pipeline([("impute", SimpleImputer(strategy="median"))])
    categorical_pipe = Pipeline([
        ("impute", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])
    preprocessor = ColumnTransformer(
        transformers=[("num", numeric_pipe, numeric_features), ("cat", categorical_pipe, categorical_features)],
        remainder="drop", verbose_feature_names_out=False,
    )
    from sklearn import set_config
    set_config(transform_output="pandas")

    sanitizer = FunctionTransformer(_sanitize_names, validate=False)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.20, random_state=42, stratify=y)

    # Same hyperparameters the notebook's RandomizedSearchCV converged on
    # (Step 6, 30 candidates x 3-fold CV, scoring=f1_macro).
    best_params = dict(
        colsample_bytree=0.8, gamma=0.1, learning_rate=0.05,
        max_depth=3, min_child_weight=3, n_estimators=300, subsample=1.0,
    )

    pipe = Pipeline([
        ("engineer", feature_engineer),
        ("preprocess", preprocessor),
        ("sanitize", sanitizer),
        ("clf", BalancedXGBClassifier(
            objective="multi:softprob", num_class=len(class_names),
            eval_metric="mlogloss", random_state=42, **best_params,
        )),
    ])

    cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
    cv_f1 = cross_val_score(pipe, X_train, y_train, cv=cv, scoring="f1_macro")

    pipe.fit(X_train, y_train)
    preds = pipe.predict(X_test)

    report = classification_report(y_test, preds, target_names=class_names, output_dict=True, zero_division=0)

    metrics = {
        "n_total": int(len(df)),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "cv_f1_macro_mean": round(float(cv_f1.mean()), 4),
        "cv_f1_macro_std": round(float(cv_f1.std()), 4),
        "accuracy": round(accuracy_score(y_test, preds), 4),
        "balanced_accuracy": round(balanced_accuracy_score(y_test, preds), 4),
        "macro_f1": round(f1_score(y_test, preds, average="macro"), 4),
        "macro_precision": round(precision_score(y_test, preds, average="macro", zero_division=0), 4),
        "macro_recall": round(recall_score(y_test, preds, average="macro", zero_division=0), 4),
        "class_names": class_names,
        "class_names_ru": [CATEGORY_LABELS_RU.get(c, c) for c in class_names],
        "class_report": report,
        "class_distribution": {c: int((y_raw == c).sum()) for c in class_names},
        "majority_class_share": round(float((y_raw == y_raw.mode()[0]).mean()), 4),
        "source": "UCI HCV data / Kaggle Hepatitis C Prediction Dataset (fedesoriano), n=615",
        "caveat": (
            "Accuracy выглядит высокой (>90%) только потому, что 86.7% выборки — "
            "здоровые доноры; честная метрика здесь — Macro F1, не accuracy. "
            "Редкие классы (Hepatitis, Fibrosis, suspect Blood Donor) имеют "
            "менее 10 случаев в тесте — их метрики нестабильны: одно "
            "перевёрнутое предсказание может сдвинуть F1 на 0.2+."
        ),
    }

    pipe.named_steps["clf"].save_model(MODEL_PATH)
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)
    print(json.dumps({k: v for k, v in metrics.items() if k != "class_report"}, indent=2, ensure_ascii=False))
    return pipe, metrics


if __name__ == "__main__":
    train()
