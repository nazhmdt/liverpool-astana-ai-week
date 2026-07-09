"""HepatoGuard AI — FastAPI backend."""
import time
from typing import Optional
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from fastapi import File, UploadFile
from PIL import Image
import io

from app.data.synthetic_generator import generate_cohort
from app.data.doctors import DOCTORS, DOCTOR_BY_ID, DOCTOR_BY_UCHASTOK
from app.data.lab_documents import build_documents
from app.models.risk_engine import RiskEngine, build_features, FEATURE_COLS
from app.models.imaging_engine import ImagingEngine
from app.data.imaging_generator import generate_image, CONDITIONS
from app.models.volume_engine import reconstruct

# NOTE on auth: /api/auth/login below is a DEMO login only -- it checks that
# a doctor_id exists in the hardcoded roster and returns their profile, full
# stop. There is no password, no session/JWT, no server-side enforcement
# that a doctor can only query their own uchastok (list_patients still
# trusts whatever uchastok the client sends). It exists to make the
# uchastok/panel data model and workflow correct end-to-end; real
# authentication (hashed credentials, signed sessions, server-side
# authorization checks on every endpoint) is separate follow-up work.

DIAGNOSIS_TO_IMAGING = {
    "healthy": "normal",
    "MASLD": "steatosis",
    "chronic_HBV": "normal",
    "chronic_HCV": "normal",
    "fibrosis_F1": "steatosis",
    "fibrosis_F2": "benign_nodule",
    "fibrosis_F3": "benign_nodule",
    "cirrhosis": "benign_nodule",
    "HCC": "malignant_mass",
}

app = FastAPI(title="LiverPool AI API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATE = {}
FEEDBACK_LOG = []  # in-memory feedback log (append-only, for audit)
FEEDBACK_BY_PATIENT = {}  # patient_id -> latest "useful" bool, so the UI can reflect prior feedback after reload
REFERRAL_BY_PATIENT = {}  # patient_id -> timestamp of last referral, so the UI can't lose track of an already-sent referral


@app.on_event("startup")
def startup():
    t0 = time.time()
    try:
        df = pd.read_pickle("app/data/cohort.pkl")
    except FileNotFoundError:
        df = generate_cohort(1800)
        df.to_pickle("app/data/cohort.pkl")

    engine = RiskEngine()
    STATE["imaging_engine"] = ImagingEngine()
    feat_df = build_features(df)
    X = feat_df[FEATURE_COLS]

    proba = engine.model.predict_proba(X)
    order = {"Low": 0, "Intermediate": 33, "High": 66, "Critical": 100}
    classes = list(engine.le.classes_)
    order_arr = np.array([order[c] for c in classes])
    risk_scores = (proba * order_arr).sum(axis=1).round().astype(int)
    pred_idx = proba.argmax(axis=1)
    categories = [classes[i] for i in pred_idx]

    feat_df["risk_score"] = risk_scores
    feat_df["risk_category"] = categories
    # Oncology screening percentage: the model's own P(Critical) -- the label
    # tier built from fibrosis_F3/cirrhosis/HCC -- surfaced directly rather
    # than invented as a separate ad-hoc formula.
    critical_idx = classes.index("Critical")
    feat_df["oncology_risk_pct"] = (proba[:, critical_idx] * 100).round(1)

    STATE["df"] = feat_df
    STATE["engine"] = engine
    STATE["classes"] = classes
    print(f"[startup] loaded {len(df)} patients, scored in {time.time()-t0:.2f}s")


def _patient_summary(row) -> dict:
    return {
        "patient_id": row["patient_id"],
        "name": row["name"],
        "age": int(row["age"]),
        "sex": row["sex"],
        "clinic": row["clinic"],
        "uchastok": int(row["uchastok"]),
        "ct_case_id": None if pd.isna(row["ct_case_id"]) else int(row["ct_case_id"]),
        "risk_score": int(row["risk_score"]),
        "risk_category": row["risk_category"],
        "fib4": float(row["fib4"]),
        "apri": float(row["apri"]),
        "platelet_trend_slope": float(row["platelet_trend_slope"]),
    }


@app.get("/api/health")
def health():
    return {"status": "ok", "patients_loaded": len(STATE.get("df", []))}


@app.get("/api/model/metrics")
def model_metrics():
    return STATE["engine"].metrics


@app.get("/api/analytics/real-data-validation")
def real_data_validation():
    import json
    with open("app/models/real_risk_metrics.json") as f:
        return json.load(f)


@app.get("/api/analytics/hepc-validation")
def hepc_validation():
    import json
    with open("app/models/hepc_risk_metrics.json") as f:
        return json.load(f)


@app.get("/api/doctors")
def list_doctors():
    df = STATE["df"]
    counts = df["uchastok"].value_counts().to_dict()
    return [
        {**d, "patient_count": int(counts.get(d["uchastok"], 0))}
        for d in DOCTORS
    ]


@app.post("/api/auth/login")
def login(doctor_id: str):
    doctor = DOCTOR_BY_ID.get(doctor_id)
    if not doctor:
        raise HTTPException(status_code=401, detail="Unknown doctor_id")
    return doctor


@app.get("/api/patients")
def list_patients(
    clinic: Optional[str] = None,
    uchastok: Optional[int] = None,
    risk_category: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(200, le=3000),
):
    df = STATE["df"]
    out = df
    if clinic:
        out = out[out["clinic"] == clinic]
    if uchastok is not None:
        out = out[out["uchastok"] == uchastok]
    if risk_category:
        out = out[out["risk_category"] == risk_category]
    if search:
        out = out[out["name"].str.contains(search, case=False) | out["patient_id"].str.contains(search, case=False)]
    out = out.sort_values("risk_score", ascending=False).head(limit)
    return {
        "total": len(out),
        "patients": [_patient_summary(r) for _, r in out.iterrows()],
    }


@app.get("/api/patients/{patient_id}")
def patient_detail(patient_id: str):
    df = STATE["df"]
    match = df[df["patient_id"] == patient_id]
    if match.empty:
        raise HTTPException(404, "Patient not found")
    row = match.iloc[0].to_dict()

    engine: RiskEngine = STATE["engine"]
    scored = engine.score_patient(row)

    n = len(row["ast_series"])
    quarters = [f"Y{i//4}Q{i%4+1}" for i in range(n)]
    ordering_doctor = DOCTOR_BY_UCHASTOK.get(int(row["uchastok"]), {}).get("full_name", "")

    return {
        "patient_id": row["patient_id"],
        "name": row["name"],
        "age": int(row["age"]),
        "sex": row["sex"],
        "bmi": row["bmi"],
        "clinic": row["clinic"],
        "uchastok": int(row["uchastok"]),
        "ct_case_id": None if pd.isna(row["ct_case_id"]) else int(row["ct_case_id"]),
        "lab_documents": build_documents(row, ordering_doctor),
        "risk_factors": {
            "alcohol_use": bool(row["alcohol_use"]),
            "diabetes": bool(row["diabetes"]),
            "obesity": bool(row["obesity"]),
            "injection_drug_use": bool(row["injection_drug_use"]),
            "transfusion_history": bool(row["transfusion_history"]),
        },
        "viral_markers": {
            "HBsAg": bool(row["HBsAg"]),
            "anti_HCV": bool(row["anti_HCV"]),
            "HCV_RNA": bool(row["HCV_RNA"]),
            "anti_HDV": bool(row["anti_HDV"]),
        },
        "trend": {
            "quarters": quarters,
            "ast": row["ast_series"],
            "alt": row["alt_series"],
            "ggt": row["ggt_series"],
            "platelets": row["platelets_series"],
        },
        "assessment": scored,
        "recommended_action": _recommend_action(scored),
        "referral_sent": patient_id in REFERRAL_BY_PATIENT,
        "feedback_given": FEEDBACK_BY_PATIENT.get(patient_id),
    }


def _recommend_action(scored: dict) -> dict:
    cat = scored["risk_category"]
    if cat == "Critical":
        return {"action": "Срочное направление к гепатологу", "urgency": "immediate",
                "note": "Оформить электронное направление сейчас; рассмотреть AFP + УЗИ (протокол наблюдения при ГЦК)."}
    if cat == "High":
        return {"action": "Направление к гепатологу", "urgency": "routine_priority",
                "note": "Внести в лист специалиста; при неподтверждённых вирусных маркерах — рефлекс-тестирование."}
    if cat == "Intermediate":
        return {"action": "Повторный анализ через 6 месяцев", "urgency": "monitor",
                "note": "Серая зона / ранний тренд — автоматический повторный вызов, направление пока не требуется."}
    return {"action": "Обычное наблюдение", "urgency": "none", "note": "Дополнительных действий не требуется."}


@app.get("/api/oncology/screening")
def oncology_screening(min_pct: float = 0.5, limit: int = 500):
    """Every screened patient with any non-trivial oncology-risk percentage,
    sorted descending -- highest risk first (send to deeper exam before it
    progresses further), then moderate, then low -- to confirm or rule out
    a cancer finding, not just a general liver-risk tier."""
    df = STATE["df"]
    flagged = df[df["oncology_risk_pct"] >= min_pct].sort_values("oncology_risk_pct", ascending=False)

    def tier(pct):
        if pct >= 50:
            return "urgent"
        if pct >= 15:
            return "moderate"
        return "low"

    rows = []
    for _, r in flagged.head(limit).iterrows():
        rows.append({
            **_patient_summary(r),
            "oncology_risk_pct": float(r["oncology_risk_pct"]),
            "tier": tier(r["oncology_risk_pct"]),
        })

    return {
        "total_screened": int(len(df)),
        "total_flagged": int(len(flagged)),
        "urgent_count": int((flagged["oncology_risk_pct"] >= 50).sum()),
        "moderate_count": int(((flagged["oncology_risk_pct"] >= 15) & (flagged["oncology_risk_pct"] < 50)).sum()),
        "low_count": int((flagged["oncology_risk_pct"] < 15).sum()),
        "patients": rows,
    }


@app.get("/api/triage/worklist")
def triage_worklist(limit: int = 50):
    df = STATE["df"]
    prioritized = df[df["risk_category"].isin(["Critical", "High"])].sort_values("risk_score", ascending=False)
    return {
        "total_flagged": len(prioritized),
        "worklist": [
            {
                **_patient_summary(r),
                "reason": "Снижение тромбоцитов" if r["platelet_trend_slope"] < -5 else "Повышенный комплексный риск",
            }
            for _, r in prioritized.head(limit).iterrows()
        ],
    }


@app.post("/api/patients/{patient_id}/feedback")
def submit_feedback(patient_id: str, useful: bool):
    # Recorded for audit/review by the clinical team. It is NOT wired into
    # any model retraining or threshold-tuning pipeline -- there is no
    # feedback loop that adjusts future predictions. Don't claim otherwise
    # in UI copy.
    FEEDBACK_LOG.append({"patient_id": patient_id, "useful": useful, "ts": time.time()})
    FEEDBACK_BY_PATIENT[patient_id] = useful
    return {"logged": True, "total_feedback": len(FEEDBACK_LOG)}


@app.post("/api/patients/{patient_id}/referral")
def send_referral(patient_id: str):
    df = STATE["df"]
    match = df[df["patient_id"] == patient_id]
    if match.empty:
        raise HTTPException(status_code=404, detail="Patient not found")
    REFERRAL_BY_PATIENT[patient_id] = time.time()
    return {"sent": True, "patient_id": patient_id, "total_referrals": len(REFERRAL_BY_PATIENT)}


@app.get("/api/analytics/moh")
def moh_analytics():
    df = STATE["df"]
    by_clinic = (
        df.groupby("clinic")
        .agg(
            total_patients=("patient_id", "count"),
            avg_risk_score=("risk_score", "mean"),
            critical=("risk_category", lambda s: (s == "Critical").sum()),
            high=("risk_category", lambda s: (s == "High").sum()),
            intermediate=("risk_category", lambda s: (s == "Intermediate").sum()),
            low=("risk_category", lambda s: (s == "Low").sum()),
        )
        .reset_index()
        .sort_values("avg_risk_score", ascending=False)
    )
    by_clinic["avg_risk_score"] = by_clinic["avg_risk_score"].round(1)

    summary = {
        "total_patients": int(len(df)),
        "critical": int((df["risk_category"] == "Critical").sum()),
        "high": int((df["risk_category"] == "High").sum()),
        "intermediate": int((df["risk_category"] == "Intermediate").sum()),
        "low": int((df["risk_category"] == "Low").sum()),
        "hbv_positive": int(df["HBsAg"].sum()),
        "hcv_positive": int(df["anti_HCV"].sum()),
        "avg_fib4": round(float(df["fib4"].mean()), 2),
    }

    by_diagnosis = df["diagnosis"].value_counts().to_dict()

    return {
        "summary": summary,
        "by_clinic": by_clinic.to_dict(orient="records"),
        "by_diagnosis": by_diagnosis,
    }


@app.get("/api/imaging/metrics")
def imaging_metrics():
    return STATE["imaging_engine"].metrics


@app.get("/api/imaging/sample/{condition}")
def imaging_sample(condition: str):
    if condition not in CONDITIONS:
        raise HTTPException(400, f"condition must be one of {CONDITIONS}")
    img, _ = generate_image(condition)
    result = STATE["imaging_engine"].analyze(img)
    return result


@app.post("/api/imaging/analyze")
async def imaging_analyze(file: UploadFile = File(...)):
    contents = await file.read()
    img = Image.open(io.BytesIO(contents))
    return STATE["imaging_engine"].analyze(img)


@app.post("/api/imaging/analyze_patient/{patient_id}")
def imaging_analyze_patient(patient_id: str):
    """The 'deeper exam' step: generate an ultrasound frame consistent with this
    patient's underlying (synthetic) diagnosis and run it through the imaging
    model -- this is the confirm-or-exclude step triggered after the lab-based
    risk engine flags someone, closing the loop from routine labs to imaging."""
    df = STATE["df"]
    match = df[df["patient_id"] == patient_id]
    if match.empty:
        raise HTTPException(404, "Patient not found")
    diagnosis = match.iloc[0]["diagnosis"]
    condition = DIAGNOSIS_TO_IMAGING.get(diagnosis, "normal")
    img, _ = generate_image(condition)
    result = STATE["imaging_engine"].analyze(img)
    result["triggered_by_diagnosis_stage"] = diagnosis
    return result


@app.get("/api/imaging/volume/{condition}")
def imaging_volume(condition: str, seed: int = 1):
    if condition not in CONDITIONS:
        raise HTTPException(400, f"condition must be one of {CONDITIONS}")
    return reconstruct(condition, seed=seed)


@app.get("/api/imaging/volume_patient/{patient_id}")
def imaging_volume_patient(patient_id: str):
    df = STATE["df"]
    match = df[df["patient_id"] == patient_id]
    if match.empty:
        raise HTTPException(404, "Patient not found")
    diagnosis = match.iloc[0]["diagnosis"]
    condition = DIAGNOSIS_TO_IMAGING.get(diagnosis, "normal")
    result = reconstruct(condition, seed=abs(hash(patient_id)) % 10_000)
    result["triggered_by_diagnosis_stage"] = diagnosis
    return result


@app.post("/api/simulate/screening")
def simulate_screening(extra_screening_pct: float = Query(10.0, ge=0, le=100)):
    """Digital-twin-lite: naive projection of how many more Intermediate/High
    patients would be caught earlier if screening coverage increased by X%."""
    df = STATE["df"]
    intermediate_and_up = df[df["risk_category"].isin(["Intermediate", "High", "Critical"])]
    additional_catches = int(round(len(intermediate_and_up) * (extra_screening_pct / 100.0) * 0.6))
    projected_cirrhosis_avoided = int(round(additional_catches * 0.18))
    return {
        "extra_screening_pct": extra_screening_pct,
        "additional_patients_caught_earlier": additional_catches,
        "projected_cirrhosis_cases_avoided_5yr": projected_cirrhosis_avoided,
        "note": "Иллюстративная проекция на синтетической когорте — заглушка для полноценной цифровой модели-двойника, не клинический прогноз.",
    }
