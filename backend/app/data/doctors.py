"""Uchastok (precinct) roster for the pilot clinic.

Kazakhstan's ПМСП system attaches patients to a numbered uchastok served by
one participant physician (участковый терапевт) -- a doctor does not see
"all patients of the clinic", only their own attached panel. This file is
the demo roster; in a real deployment it is replaced by the clinic's HR/HIS
system data (staff table + attachment records), not hardcoded.
"""

DOCTORS = [
    {"doctor_id": "D01", "full_name": "Асель Нурлановна Жаксыбекова", "uchastok": 1, "specialization": "Врач общей практики"},
    {"doctor_id": "D02", "full_name": "Ерлан Тимурович Абенов", "uchastok": 2, "specialization": "Участковый терапевт"},
    {"doctor_id": "D03", "full_name": "Гульнара Сериковна Мухамедова", "uchastok": 3, "specialization": "Участковый терапевт"},
    {"doctor_id": "D04", "full_name": "Дамир Асхатович Кенжебаев", "uchastok": 4, "specialization": "Врач общей практики"},
    {"doctor_id": "D05", "full_name": "Айгерим Болатовна Сатпаева", "uchastok": 5, "specialization": "Участковый терапевт"},
    {"doctor_id": "D06", "full_name": "Нурбек Мейрамович Оспанов", "uchastok": 6, "specialization": "Врач общей практики"},
    {"doctor_id": "D07", "full_name": "Динара Ерболатовна Тулегенова", "uchastok": 7, "specialization": "Участковый терапевт"},
    {"doctor_id": "D08", "full_name": "Максат Женисович Байтасов", "uchastok": 8, "specialization": "Врач общей практики"},
]

N_UCHASTKI = len(DOCTORS)

DOCTOR_BY_ID = {d["doctor_id"]: d for d in DOCTORS}
DOCTOR_BY_UCHASTOK = {d["uchastok"]: d for d in DOCTORS}
