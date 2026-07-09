"""Lab-document view over a patient's existing quarterly series.

This does NOT generate new clinical values -- it re-packages the same
AST/ALT/GGT/platelet numbers already in the cohort (so the document a doctor
opens always matches the trend chart) into the shape a real lab feed would
have: one document per visit, a lab/org name, reference ranges, and a
flag per value. Swapping this for a real integration (e.g. Damumed) later
means replacing this module's output with an API call -- the patient page
does not need to change, only where the list comes from.
"""
from datetime import date, timedelta

LABS = ["ТОО «Sanguis Astana»", "ТОО «Invitro Kazakhstan»", "КГП «Городская поликлиника №1»"]

# (male_low, male_high, female_low, female_high), units
REF_RANGES = {
    "ALT": (10, 41, 10, 31, "Ед/л"),
    "AST": (10, 37, 10, 31, "Ед/л"),
    "GGT": (10, 71, 6, 42, "Ед/л"),
    "Platelets": (150, 400, 150, 400, "x10^9/л"),
}

RU_LABEL = {"ALT": "АлАТ", "AST": "АсАТ", "GGT": "ГГТ", "Platelets": "Тромбоциты"}


def _flag(value: float, sex: str, marker: str) -> str:
    lo_m, hi_m, lo_f, hi_f, _ = REF_RANGES[marker]
    lo, hi = (lo_m, hi_m) if sex == "M" else (lo_f, hi_f)
    if value > hi:
        return "high"
    if value < lo:
        return "low"
    return "normal"


def _reading(marker: str, value: float, sex: str) -> dict:
    lo_m, hi_m, lo_f, hi_f, unit = REF_RANGES[marker]
    return {
        "code": marker,
        "label_ru": RU_LABEL[marker],
        "value": value,
        "unit": unit,
        "ref_male": f"{lo_m}-{hi_m}",
        "ref_female": f"{lo_f}-{hi_f}",
        "flag": _flag(value, sex, marker),
    }


def build_documents(row: dict, ordering_doctor: str) -> list[dict]:
    """One biochemistry (АЛТ/АСТ/ГГТ) + one hematology (ОАК/тромбоциты)
    document per quarter, dated backward from today -- mirrors how a real
    lab feed separates panels ordered together but resulted as separate
    documents."""
    ast_s, alt_s, ggt_s, plt_s = row["ast_series"], row["alt_series"], row["ggt_series"], row["platelets_series"]
    n = len(ast_s)
    sex = row["sex"]
    lab = LABS[hash(row["patient_id"]) % len(LABS)]
    today = date.today()
    docs = []
    for i in range(n):
        quarters_ago = n - 1 - i
        visit_date = today - timedelta(days=quarters_ago * 91)
        doc_no = f"{visit_date.year}{visit_date.timetuple().tm_yday:03d}{i:02d}"

        docs.append({
            "doc_id": f"{row['patient_id']}-BIOCHEM-{i}",
            "date": visit_date.isoformat(),
            "category": "Биохимия крови",
            "lab_name": lab,
            "doc_number": doc_no,
            "ordering_doctor": ordering_doctor,
            "readings": [
                _reading("ALT", alt_s[i], sex),
                _reading("AST", ast_s[i], sex),
                _reading("GGT", ggt_s[i], sex),
            ],
        })
        docs.append({
            "doc_id": f"{row['patient_id']}-HEMA-{i}",
            "date": visit_date.isoformat(),
            "category": "Гематология (ОАК)",
            "lab_name": lab,
            "doc_number": doc_no,
            "ordering_doctor": ordering_doctor,
            "readings": [
                _reading("Platelets", plt_s[i], sex),
            ],
        })

    if row.get("HBsAg") is not None:
        visit_date = today - timedelta(days=(n - 1) * 91)
        docs.append({
            "doc_id": f"{row['patient_id']}-VIRO-0",
            "date": visit_date.isoformat(),
            "category": "Вирусология",
            "lab_name": lab,
            "doc_number": f"{visit_date.year}{visit_date.timetuple().tm_yday:03d}99",
            "ordering_doctor": ordering_doctor,
            "readings": [
                {"code": "HBsAg", "label_ru": "HBsAg (гепатит B)", "value": "Положительно" if row["HBsAg"] else "Отрицательно", "unit": "", "ref_male": "Отрицательно", "ref_female": "Отрицательно", "flag": "high" if row["HBsAg"] else "normal"},
                {"code": "anti_HCV", "label_ru": "Антитела к гепатиту C", "value": "Положительно" if row["anti_HCV"] else "Отрицательно", "unit": "", "ref_male": "Отрицательно", "ref_female": "Отрицательно", "flag": "high" if row["anti_HCV"] else "normal"},
            ],
        })

    docs.sort(key=lambda d: d["date"], reverse=True)
    return docs
