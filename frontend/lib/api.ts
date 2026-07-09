const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type Doctor = {
  doctor_id: string;
  full_name: string;
  uchastok: number;
  specialization: string;
  patient_count?: number;
};

export type PatientSummary = {
  patient_id: string;
  name: string;
  age: number;
  sex: string;
  clinic: string;
  uchastok: number;
  ct_case_id: number | null;
  risk_score: number;
  risk_category: "Low" | "Intermediate" | "High" | "Critical";
  fib4: number;
  apri: number;
  platelet_trend_slope: number;
};

export type LabReading = {
  code: string;
  label_ru: string;
  value: number | string;
  unit: string;
  ref_male: string;
  ref_female: string;
  flag: "high" | "low" | "normal";
};

export type LabDocument = {
  doc_id: string;
  date: string;
  category: string;
  lab_name: string;
  doc_number: string;
  ordering_doctor: string;
  readings: LabReading[];
};

export type PatientDetail = {
  patient_id: string;
  name: string;
  age: number;
  sex: string;
  bmi: number;
  clinic: string;
  uchastok: number;
  ct_case_id: number | null;
  lab_documents: LabDocument[];
  risk_factors: Record<string, boolean>;
  viral_markers: Record<string, boolean>;
  trend: {
    quarters: string[];
    ast: number[];
    alt: number[];
    ggt: number[];
    platelets: number[];
  };
  assessment: {
    risk_score: number;
    risk_category: string;
    fib4: number;
    fib4_band: string;
    apri: number;
    platelet_trend_slope: number;
    ast_trend_slope: number;
    top_contributors: { feature: string; value: number; impact: number }[];
    class_probabilities: Record<string, number>;
  };
  recommended_action: { action: string; urgency: string; note: string };
  referral_sent: boolean;
  feedback_given: boolean | null;
};

export type MohAnalytics = {
  summary: {
    total_patients: number;
    critical: number;
    high: number;
    intermediate: number;
    low: number;
    hbv_positive: number;
    hcv_positive: number;
    avg_fib4: number;
  };
  by_clinic: {
    clinic: string;
    total_patients: number;
    avg_risk_score: number;
    critical: number;
    high: number;
    intermediate: number;
    low: number;
  }[];
  by_diagnosis: Record<string, number>;
};

async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

export const api = {
  health: () => getJSON<{ status: string; patients_loaded: number }>("/api/health"),
  listPatients: (params: { clinic?: string; uchastok?: number; risk_category?: string; search?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
    return getJSON<{ total: number; patients: PatientSummary[] }>(`/api/patients?${qs.toString()}`);
  },
  patientDetail: (id: string) => getJSON<PatientDetail>(`/api/patients/${id}`),
  listDoctors: () => getJSON<Doctor[]>("/api/doctors"),
  login: (doctorId: string) => getJSON<Doctor>(`/api/auth/login?doctor_id=${doctorId}`, { method: "POST" }),
  triageWorklist: (limit = 50) => getJSON<{ total_flagged: number; worklist: (PatientSummary & { reason: string })[] }>(`/api/triage/worklist?limit=${limit}`),
  mohAnalytics: () => getJSON<MohAnalytics>("/api/analytics/moh"),
  realDataValidation: () => getJSON<Record<string, unknown>>("/api/analytics/real-data-validation"),
  hepcValidation: () => getJSON<Record<string, unknown>>("/api/analytics/hepc-validation"),
  submitFeedback: (id: string, useful: boolean) =>
    getJSON(`/api/patients/${id}/feedback?useful=${useful}`, { method: "POST" }),
  sendReferral: (id: string) =>
    getJSON<{ sent: boolean; patient_id: string; total_referrals: number }>(`/api/patients/${id}/referral`, { method: "POST" }),
  simulateScreening: (pct: number) =>
    getJSON<{ extra_screening_pct: number; additional_patients_caught_earlier: number; projected_cirrhosis_cases_avoided_5yr: number; note: string }>(
      `/api/simulate/screening?extra_screening_pct=${pct}`,
      { method: "POST" }
    ),
  imagingMetrics: () => getJSON<ImagingMetrics>("/api/imaging/metrics"),
  imagingSample: (condition: string) => getJSON<ImagingResult>(`/api/imaging/sample/${condition}`),
  imagingAnalyzePatient: (patientId: string) =>
    getJSON<ImagingResult & { triggered_by_diagnosis_stage: string }>(`/api/imaging/analyze_patient/${patientId}`, { method: "POST" }),
  imagingAnalyzeUpload: async (file: File): Promise<ImagingResult> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/api/imaging/analyze`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  },
  imagingVolume: (condition: string, seed = 1) => getJSON<VolumeResult>(`/api/imaging/volume/${condition}?seed=${seed}`),
  imagingVolumePatient: (patientId: string) => getJSON<VolumeResult & { triggered_by_diagnosis_stage: string }>(`/api/imaging/volume_patient/${patientId}`),
  oncologyScreening: (minPct = 0.5, limit = 500) =>
    getJSON<OncologyScreening>(`/api/oncology/screening?min_pct=${minPct}&limit=${limit}`),
};

export type MeshData = { vertices: number[]; faces: number[]; n_vertices: number; n_faces: number };

export type VolumeResult = {
  condition: string;
  liver_mesh: MeshData;
  lesion_mesh: MeshData | null;
  volume_cm3: number | null;
  centroid_mm: { x: number; y: number; z: number } | null;
  voxel_mm: number;
  grid: number;
};

export type OncologyScreening = {
  total_screened: number;
  total_flagged: number;
  urgent_count: number;
  moderate_count: number;
  low_count: number;
  patients: (PatientSummary & { oncology_risk_pct: number; tier: "urgent" | "moderate" | "low" })[];
};

export type ImagingResult = {
  condition: string;
  condition_label_ru: string;
  confidence: number;
  class_probabilities: Record<string, number>;
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
  image_png_b64: string;
  heatmap_png_b64: string;
};

export type ImagingMetrics = {
  accuracy: number;
  f1_macro: number;
  confusion_matrix: number[][];
  classes: string[];
  n_train: number;
  n_test: number;
};
