"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, WifiOff, ScanEye, Maximize2 } from "lucide-react";
import CtCaseModal from "./CtCaseModal";

type Probabilities = {
  normal: number;
  steatosis: number;
  benign: number;
  malignant: number;
  verdict: string;
};

type CaseMetrics = {
  liver_volume_cm3: number;
  tumor_volume_cm3: number;
  tumor_diameter_mm: number;
  tumor_voxels: number;
  num_tumor_slices: number;
  centroid_mm: { x: number; y: number; z: number };
};

type ClinicalCase = { id: number; probabilities: Probabilities; metrics: CaseMetrics; ground_truth_has_tumor: boolean };

const PROB_ROWS: { key: keyof Omit<Probabilities, "verdict">; label: string; color: string }[] = [
  { key: "normal", label: "Норма", color: "var(--risk-low)" },
  { key: "steatosis", label: "Стеатоз", color: "var(--risk-intermediate)" },
  { key: "benign", label: "Доброкачественный узел", color: "var(--risk-high)" },
  { key: "malignant", label: "Подозрение на злокачественное", color: "var(--risk-critical)" },
];

const LIVER_VOLUME_PLAUSIBLE_MAX = 2000;

export default function PatientCtCase({ ctCaseId }: { ctCaseId: number }) {
  const [caseData, setCaseData] = useState<ClinicalCase | null>(null);
  const [error, setError] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    fetch("/reconstructions/metrics.json")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((all) => setCaseData(all[String(ctCaseId)] ?? null))
      .catch(() => setError(true));
  }, [ctCaseId]);

  if (error) {
    return (
      <div className="glass p-5 flex items-center gap-2 text-sm" style={{ borderColor: "var(--risk-critical)55" }}>
        <WifiOff size={16} style={{ color: "var(--risk-critical)" }} /> Не удалось загрузить данные КТ.
      </div>
    );
  }
  if (!caseData) return <div className="glass p-5 text-sm text-[var(--text-muted)]">Загрузка данных КТ…</div>;

  const m = caseData.metrics;
  const liverVolumeSuspect = m.liver_volume_cm3 > LIVER_VOLUME_PLAUSIBLE_MAX;
  const topProb = PROB_ROWS.reduce((a, b) => (caseData.probabilities[b.key] > caseData.probabilities[a.key] ? b : a));

  return (
    <div className="glass p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium flex items-center gap-2"><ScanEye size={15} /> Углублённая диагностика (КТ)</h2>
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">LiTS · случай №{ctCaseId}</span>
      </div>

      <div className="flex gap-4 items-start flex-wrap">
        <button
          onClick={() => setModalOpen(true)}
          className="relative bg-black rounded-lg overflow-hidden shrink-0 group lift text-left"
          style={{ width: 260 }}
        >
          {imgError ? (
            <div className="text-[11px] text-neutral-400 py-10 text-center px-3">Снимок не найден</div>
          ) : (
            <img
              src={`/reconstructions/patient_${ctCaseId}_comparison.png`}
              alt={`КТ-сравнение, случай ${ctCaseId}`}
              className="w-full h-auto"
              onError={() => setImgError(true)}
            />
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <span className="flex items-center gap-1.5 text-white text-xs font-medium px-3 py-1.5 rounded-lg" style={{ background: "rgba(0,0,0,0.55)" }}>
              <Maximize2 size={13} /> Открыть полный анализ
            </span>
          </div>
        </button>

        <div className="flex-1 min-w-[220px]">
          <div className="text-sm font-semibold mb-2" style={{ color: topProb.color }}>{caseData.probabilities.verdict}</div>
          <div className="space-y-1.5 mb-3">
            {PROB_ROWS.map((row) => (
              <div key={row.key} className="flex items-center gap-2">
                <div className="w-32 text-[10px] text-[var(--text-muted)] shrink-0">{row.label}</div>
                <div className="flex-1 h-3 bg-[var(--bg-elevated)] rounded overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${Math.max(caseData.probabilities[row.key], 0)}%`, background: row.color }} />
                </div>
                <div className="w-10 text-right text-[10px] mono text-[var(--text-muted)]">{caseData.probabilities[row.key].toFixed(1)}%</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">Объём очага</span><span className="mono">{m.tumor_volume_cm3.toFixed(2)} см³</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">Диаметр</span><span className="mono">{m.tumor_diameter_mm > 0 ? `${m.tumor_diameter_mm.toFixed(1)} мм` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">Срезов с опухолью</span><span className="mono">{m.num_tumor_slices}</span></div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Объём печени</span>
              <span className="mono" style={{ color: liverVolumeSuspect ? "var(--risk-high)" : undefined }}>{m.liver_volume_cm3.toFixed(0)} см³</span>
            </div>
          </div>
          {liverVolumeSuspect && (
            <div className="flex items-start gap-1.5 text-[10px] text-[var(--risk-high)] mt-2">
              <AlertTriangle size={11} className="shrink-0 mt-0.5" /> Объём печени выше физиологической нормы — известная погрешность расчёта, уточняется.
            </div>
          )}
        </div>
      </div>

      {modalOpen && <CtCaseModal ctCaseId={ctCaseId} caseData={caseData} onClose={() => setModalOpen(false)} />}
    </div>
  );
}
