"""Loader for the real Mayo Clinic PBC (cirrhosis) dataset.

Public research dataset (418 US PBC-trial patients, Mayo Clinic 1974-1984).
This is a different liver disease (primary biliary cirrhosis, autoimmune)
than the pilot's main hepatitis/MASLD focus, but it is real, de-identified,
peer-reviewed clinical data with real biomarkers and histologic staging --
used to validate that the ML pipeline generalizes beyond the synthetic
cohort, not to represent Kazakhstan epidemiology.
"""
import pandas as pd

RAW_PATH = "app/data/real/cirrhosis.csv"

BINARY_COLS = ["Ascites", "Hepatomegaly", "Spiders"]  # Y/N -> 1/0
FEATURES = [
    "age_years", "sex_F", "Bilirubin", "Cholesterol", "Albumin", "Copper",
    "Alk_Phos", "SGOT", "Tryglicerides", "Platelets", "Prothrombin",
    "Ascites", "Hepatomegaly", "Spiders", "edema_score",
]


def load_real_cohort() -> pd.DataFrame:
    df = pd.read_csv(RAW_PATH, na_values="NA")
    df["age_years"] = (df["Age"] / 365.25).round(1)
    df["sex_F"] = (df["Sex"] == "F").astype(int)
    for c in BINARY_COLS:
        df[c] = df[c].map({"Y": 1, "N": 0})
    df["edema_score"] = df["Edema"].map({"N": 0, "S": 1, "Y": 2})
    df["Stage"] = pd.to_numeric(df["Stage"], errors="coerce")
    df = df.dropna(subset=["Stage"]).copy()
    df["Stage"] = df["Stage"].astype(int)
    return df


def to_model_matrix(df: pd.DataFrame):
    X = df[FEATURES]          # contains NaN for incomplete rows -- fine,
    y = df["Stage"] - 1       # XGBoost handles missing values natively
    return X, y
