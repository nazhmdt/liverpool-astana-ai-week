"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, AlertTriangle, ArrowUpRight } from "lucide-react";

type Probabilities = { normal: number; steatosis: number; benign: number; malignant: number; verdict: string };
type CaseMetrics = {
  liver_volume_cm3: number; tumor_volume_cm3: number; tumor_diameter_mm: number;
  tumor_voxels: number; num_tumor_slices: number; centroid_mm: { x: number; y: number; z: number };
};
type ClinicalCase = { id: number; probabilities: Probabilities; metrics: CaseMetrics; ground_truth_has_tumor: boolean };

const PROB_ROWS: { key: keyof Omit<Probabilities, "verdict">; label: string; color: string }[] = [
  { key: "normal", label: "Норма", color: "var(--risk-low)" },
  { key: "steatosis", label: "Стеатоз", color: "var(--risk-intermediate)" },
  { key: "benign", label: "Доброкачественный узел", color: "var(--risk-high)" },
  { key: "malignant", label: "Подозрение на злокачественное", color: "var(--risk-critical)" },
];

const LIVER_VOLUME_PLAUSIBLE_MAX = 2000;

export default function CtCaseModal({ ctCaseId, caseData, onClose }: { ctCaseId: number; caseData: ClinicalCase; onClose: () => void }) {
  // Lock background scroll while the modal is open -- without this the page
  // behind keeps scrolling under the fixed overlay, which is what made
  // scrolling inside the modal feel broken/unresponsive.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Rendered via a portal into document.body: PatientCtCase's wrapping card
  // uses the `.glass` class (backdrop-filter), and per the CSS spec any
  // filter/backdrop-filter ancestor becomes the containing block for
  // `position: fixed` descendants -- so without the portal this "full
  // screen" overlay was actually being clipped to that small card instead
  // of the viewport.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const m = caseData.metrics;
  const liverVolumeSuspect = m.liver_volume_cm3 > LIVER_VOLUME_PLAUSIBLE_MAX;
  const topProb = PROB_ROWS.reduce((a, b) => (caseData.probabilities[b.key] > caseData.probabilities[a.key] ? b : a));

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(23,31,29,0.55)" }} onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-[var(--shadow-lg)] w-full max-w-4xl max-h-[90vh] overflow-y-auto scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-soft)] sticky top-0 bg-white z-10">
          <div>
            <div className="text-sm font-medium">Полный анализ КТ — случай №{ctCaseId}</div>
            <div className="text-[11px] text-[var(--text-muted)]">Датасет LiTS, сегментация ИИ vs врачебный консилиум</div>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <div className="bg-black rounded-lg overflow-hidden mb-5">
            <img
              src={`/reconstructions/patient_${ctCaseId}_comparison.png`}
              alt={`КТ-сравнение, случай ${ctCaseId}`}
              className="w-full h-auto"
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <div className="text-base font-semibold mb-3" style={{ color: topProb.color }}>{caseData.probabilities.verdict}</div>
              <div className="space-y-2">
                {PROB_ROWS.map((row) => (
                  <div key={row.key} className="flex items-center gap-2">
                    <div className="w-40 text-[11px] text-[var(--text-muted)] shrink-0">{row.label}</div>
                    <div className="flex-1 h-4 bg-[var(--bg-elevated)] rounded overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${Math.max(caseData.probabilities[row.key], 0)}%`, background: row.color }} />
                    </div>
                    <div className="w-12 text-right text-[11px] mono text-[var(--text-muted)]">{caseData.probabilities[row.key].toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface p-4">
              <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Метрики очага</div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-[var(--text-muted)]">Объём очага</span><span className="mono">{m.tumor_volume_cm3.toFixed(2)} см³</span></div>
                <div className="flex justify-between"><span className="text-[var(--text-muted)]">Диаметр (RECIST 1.1)</span><span className="mono">{m.tumor_diameter_mm > 0 ? `${m.tumor_diameter_mm.toFixed(1)} мм` : "—"}</span></div>
                <div className="flex justify-between"><span className="text-[var(--text-muted)]">Вокселей</span><span className="mono">{m.tumor_voxels.toLocaleString("ru-RU")}</span></div>
                <div className="flex justify-between"><span className="text-[var(--text-muted)]">Срезов с опухолью</span><span className="mono">{m.num_tumor_slices}</span></div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Объём печени</span>
                  <span className="mono" style={{ color: liverVolumeSuspect ? "var(--risk-high)" : undefined }}>{m.liver_volume_cm3.toFixed(0)} см³</span>
                </div>
                <div className="pt-2 border-t border-[var(--border-soft)] text-xs text-[var(--text-muted)]">
                  Центроид (мм): x {m.centroid_mm.x.toFixed(1)} · y {m.centroid_mm.y.toFixed(1)} · z {m.centroid_mm.z.toFixed(1)}
                </div>
              </div>
              {liverVolumeSuspect && (
                <div className="flex items-start gap-1.5 text-[11px] text-[var(--risk-high)] mt-2">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" /> Объём печени выше физиологической нормы — известная погрешность расчёта.
                </div>
              )}
            </div>
          </div>

          <Link
            href={`/imaging?case=${ctCaseId}`}
            className="mt-5 flex items-center justify-between px-4 py-3 rounded-lg surface text-sm hover:bg-black/[0.02] transition-colors"
          >
            <span className="text-[var(--text-muted)]">Этот случай — один из 51, на которых проверялась модель. Посмотреть его вместе с точностью на всей выборке</span>
            <ArrowUpRight size={16} className="shrink-0 text-[var(--primary-500)]" />
          </Link>
        </div>
      </div>
    </div>,
    document.body
  );
}
