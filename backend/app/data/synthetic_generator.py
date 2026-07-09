"""
Synthetic patient cohort generator for LiverPool AI.

Scope: pilot launch, a single primary-care clinic in Astana. Individual
patients are fabricated. The *population-level* shape is calibrated to
published Kazakhstan epidemiology (Jumabayeva et al. 2022; PLOS One 2025;
WHO Global Hepatitis Report 2024):
  - ~269,000 hepatitis B/C/D cases identified 2015-2020
  - HBV incidence ~128.3 / 100,000
  - Liver cancer mortality rising 3.75 -> 4.75 / 100,000 (2014-2023)

Every patient has 5 years of quarterly labs (20 timepoints) so the
longitudinal trend engine has real trajectories to detect, not snapshots.

NOTE: CLINICS holds one placeholder entry -- swap the name for the real
onboarded clinic once known. Kept as a list (not a bare string) so adding a
second clinic later is a one-line change, not a refactor.
"""
import numpy as np
import pandas as pd
from faker import Faker

from app.data.doctors import N_UCHASTKI

fake = Faker("ru_RU")  # clinic is in Astana; ru_RU is the closest Faker locale to real KZ clinical records
RNG = np.random.default_rng(42)

CLINICS = [
    ("Пилотная поликлиника, Астана", 1.0),
]
CLINIC_NAMES = [c[0] for c in CLINICS]
CLINIC_WEIGHTS = np.array([c[1] for c in CLINICS])
CLINIC_WEIGHTS = CLINIC_WEIGHTS / CLINIC_WEIGHTS.sum()

DIAGNOSES = [
    "healthy", "MASLD", "chronic_HBV", "chronic_HCV",
    "fibrosis_F1", "fibrosis_F2", "fibrosis_F3", "cirrhosis", "HCC",
]
# Base population shares, roughly consistent with published KZ/global prevalence
DIAGNOSIS_BASE_P = np.array([0.55, 0.24, 0.05, 0.05, 0.05, 0.03, 0.015, 0.01, 0.005])
DIAGNOSIS_BASE_P = DIAGNOSIS_BASE_P / DIAGNOSIS_BASE_P.sum()

N_QUARTERS = 20  # 5 years


def _sample_diagnosis(clinic_burden_mult: float) -> str:
    p = DIAGNOSIS_BASE_P.copy()
    # the clinic with an older/heavier-comorbidity panel shifts mass away from "healthy"
    shift = (clinic_burden_mult - 1.0) * 0.12
    p[0] = max(p[0] - shift, 0.05)
    p = p / p.sum()
    return RNG.choice(DIAGNOSES, p=p)


def _trajectory_for(diagnosis: str, n=N_QUARTERS):
    """Generate 5-year quarterly AST/ALT/platelets/GGT trajectories.

    The key design choice: even 'healthy-looking today' patients in the
    fibrosis/cirrhosis path get a slow, quiet decline over years -- this is
    what the longitudinal trend model is supposed to catch that a single
    snapshot FIB-4 would miss.
    """
    age = int(np.clip(RNG.normal(47, 14), 18, 90))
    sex = RNG.choice(["M", "F"])
    bmi = float(np.clip(RNG.normal(27, 5), 16, 48))

    # baseline levels
    ast0 = RNG.normal(24, 5)
    alt0 = RNG.normal(26, 6)
    ggt0 = RNG.normal(30, 10)
    plt0 = RNG.normal(260, 40)

    # per-diagnosis annual drift (the "silent" progression)
    drift = {
        "healthy": dict(ast=0.0, alt=0.0, ggt=0.0, plt=0.0),
        "MASLD": dict(ast=0.8, alt=1.4, ggt=1.2, plt=-1.0),
        "chronic_HBV": dict(ast=1.2, alt=1.8, ggt=1.0, plt=-2.0),
        "chronic_HCV": dict(ast=1.6, alt=2.0, ggt=1.3, plt=-3.0),
        "fibrosis_F1": dict(ast=1.5, alt=1.8, ggt=1.5, plt=-3.5),
        "fibrosis_F2": dict(ast=2.5, alt=2.6, ggt=2.0, plt=-6.0),
        "fibrosis_F3": dict(ast=4.0, alt=3.8, ggt=3.0, plt=-10.0),
        "cirrhosis": dict(ast=6.0, alt=4.5, ggt=4.5, plt=-16.0),
        "HCC": dict(ast=8.0, alt=5.5, ggt=6.0, plt=-20.0),
    }[diagnosis]

    ast, alt, ggt, plt = [], [], [], []
    a, l, g, p = ast0, alt0, ggt0, plt0
    for q in range(n):
        yr = q / 4.0
        noise = RNG.normal(0, 1, 4)
        a = max(8, ast0 + drift["ast"] * yr + noise[0] * 3)
        l = max(8, alt0 + drift["alt"] * yr + noise[1] * 3)
        g = max(8, ggt0 + drift["ggt"] * yr + noise[2] * 4)
        p = max(30, plt0 + drift["plt"] * yr + noise[3] * 8)
        ast.append(round(a, 1))
        alt.append(round(l, 1))
        ggt.append(round(g, 1))
        plt.append(round(p, 1))

    return dict(age=age, sex=sex, bmi=round(bmi, 1), ast=ast, alt=alt, ggt=ggt, platelets=plt)


def _viral_markers(diagnosis: str):
    hbsag = diagnosis == "chronic_HBV" or (diagnosis in ("cirrhosis", "HCC") and RNG.random() < 0.3)
    anti_hcv = diagnosis == "chronic_HCV" or (diagnosis in ("cirrhosis", "HCC") and RNG.random() < 0.3)
    hcv_rna = anti_hcv and RNG.random() < 0.75  # ~25% spontaneous clearance
    anti_hdv = hbsag and RNG.random() < 0.09  # KZ HDV coinfection ballpark
    return dict(HBsAg=bool(hbsag), anti_HCV=bool(anti_hcv), HCV_RNA=bool(hcv_rna), anti_HDV=bool(anti_hdv))


def _risk_factors(diagnosis: str, age: int):
    alcohol = RNG.random() < (0.35 if diagnosis in ("cirrhosis", "fibrosis_F3", "HCC") else 0.18)
    diabetes = RNG.random() < (0.4 if diagnosis == "MASLD" else 0.15)
    obesity = RNG.random() < (0.5 if diagnosis == "MASLD" else 0.2)
    idu = RNG.random() < (0.3 if diagnosis == "chronic_HCV" else 0.03)
    transfusion = RNG.random() < (0.15 if age > 50 and diagnosis == "chronic_HCV" else 0.02)
    return dict(alcohol_use=bool(alcohol), diabetes=bool(diabetes), obesity=bool(obesity),
                injection_drug_use=bool(idu), transfusion_history=bool(transfusion))


N_CT_CASES = 51  # must match the number of entries in frontend/public/reconstructions/metrics.json


def generate_cohort(n_patients: int = 1800, seed: int = 42) -> pd.DataFrame:
    global RNG
    RNG = np.random.default_rng(seed)
    rows = []
    ct_case_counter = 0
    for i in range(n_patients):
        clinic_idx = RNG.choice(len(CLINICS), p=CLINIC_WEIGHTS)
        clinic, burden = CLINICS[clinic_idx]
        diagnosis = _sample_diagnosis(burden)
        traj = _trajectory_for(diagnosis)
        viral = _viral_markers(diagnosis)
        risk_f = _risk_factors(diagnosis, traj["age"])

        # Not every patient has had a CT -- only those whose diagnosis would
        # clinically warrant one (advanced fibrosis/cirrhosis/HCC) get one of
        # the 51 real LiTS comparison cases attached. This is what makes
        # "Углублённая диагностика" on the patient page conditional instead
        # of a disconnected standalone case browser.
        ct_case_id = None
        if diagnosis in ("fibrosis_F3", "cirrhosis", "HCC") and ct_case_counter < N_CT_CASES:
            ct_case_id = ct_case_counter
            ct_case_counter += 1

        rows.append({
            "patient_id": f"P{i+1:05d}",
            "name": fake.name_male() if traj["sex"] == "M" else fake.name_female(),
            "age": traj["age"],
            "sex": traj["sex"],
            "bmi": traj["bmi"],
            "clinic": clinic,
            # attach every patient to one of the clinic's numbered uchastki --
            # a doctor's "Кабинет врача" is their uchastok's panel, never the
            # whole clinic (that view belongs to a chief physician role, not
            # implemented yet -- see the login/roles note in main.py).
            "uchastok": int(RNG.integers(1, N_UCHASTKI + 1)),
            "ct_case_id": ct_case_id,
            "diagnosis": diagnosis,
            "ast_series": traj["ast"],
            "alt_series": traj["alt"],
            "ggt_series": traj["ggt"],
            "platelets_series": traj["platelets"],
            **viral,
            **risk_f,
            # "current" (latest quarter) snapshot values, most-used by the risk engine
            "ast": traj["ast"][-1],
            "alt": traj["alt"][-1],
            "ggt": traj["ggt"][-1],
            "platelets": traj["platelets"][-1],
        })
    return pd.DataFrame(rows)


if __name__ == "__main__":
    df = generate_cohort(1800)
    df.to_pickle("app/data/cohort.pkl")
    print(f"Generated {len(df)} synthetic patients")
    print(df["diagnosis"].value_counts(normalize=True))
    print(df["clinic"].value_counts(normalize=True))
