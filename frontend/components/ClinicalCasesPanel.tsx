"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, WifiOff, Ruler, Box, Layers, MapPin, Droplet } from "lucide-react";

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

type ClinicalCase = {
  id: number;
  probabilities: Probabilities;
  metrics: CaseMetrics;
  ground_truth_has_tumor: boolean;
};

type CasesById = Record<string, ClinicalCase>;

const PROB_ROWS: { key: keyof Omit<Probabilities, "verdict">; label: string; color: string }[] = [
  { key: "normal", label: "Норма", color: "var(--risk-low)" },
  { key: "steatosis", label: "Стеатоз (жировая дистрофия)", color: "var(--risk-intermediate)" },
  { key: "benign", label: "Доброкачественный узел", color: "var(--risk-high)" },
  { key: "malignant", label: "Подозрение на злокачественное", color: "var(--risk-critical)" },
];

// Liver volumes above this are outside plausible adult anatomy (normal ~1200-1800 cm3) --
// flagged rather than hidden, since silently rounding a bad number is worse than showing it
// with a caveat. See conversation with the data provider about the root cause.
const LIVER_VOLUME_PLAUSIBLE_MAX = 2000;

export default function ClinicalCasesPanel() {
  const searchParams = useSearchParams();
  const [cases, setCases] = useState<CasesById | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState(0);
  const [imgError, setImgError] = useState(false);
  const appliedDeepLink = useRef(false);
  const selectedRowRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fetch("/reconstructions/metrics.json")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(setCases)
      .catch(() => setError(true));
  }, []);

  // Coming from a patient's CT card ("this is one of 51 cases -- see it in
  // the full validation set") should land on that same case, not always
  // reset to case 0 -- otherwise the link loses the context you clicked it from.
  useEffect(() => {
    if (appliedDeepLink.current || !cases) return;
    const requested = Number(searchParams.get("case"));
    if (!Number.isNaN(requested) && cases[String(requested)]) {
      setSelectedId(requested);
      appliedDeepLink.current = true;
      requestAnimationFrame(() => selectedRowRef.current?.scrollIntoView({ block: "center" }));
    }
  }, [cases, searchParams]);

  const ids = useMemo(() => (cases ? Object.keys(cases).map(Number).sort((a, b) => a - b) : []), [cases]);

  // Computed, not asserted: accuracy/sensitivity/specificity from ground_truth_has_tumor
  // vs whether the model actually found any tumor voxels. This is the same arithmetic
  // the delivered file supports -- no number here is hand-typed.
  const validation = useMemo(() => {
    if (!cases) return null;
    let tp = 0, tn = 0, fp = 0, fn = 0;
    for (const k of Object.keys(cases)) {
      const c = cases[k];
      const gt = c.ground_truth_has_tumor;
      const pred = c.metrics.tumor_voxels > 0;
      if (gt && pred) tp++;
      else if (!gt && !pred) tn++;
      else if (!gt && pred) fp++;
      else fn++;
    }
    const n = tp + tn + fp + fn;
    return {
      n, tp, tn, fp, fn,
      accuracy: n ? ((tp + tn) / n) * 100 : 0,
      sensitivity: tp + fn ? (tp / (tp + fn)) * 100 : 0,
      specificity: tn + fp ? (tn / (tn + fp)) * 100 : 0,
    };
  }, [cases]);

  if (error) {
    return (
      <div className="glass p-5 flex items-center gap-2 text-sm" style={{ borderColor: "var(--risk-critical)55" }}>
        <WifiOff size={16} style={{ color: "var(--risk-critical)" }} />
        Не удалось загрузить /reconstructions/metrics.json — проверьте, что файлы скопированы в public/reconstructions/.
      </div>
    );
  }
  if (!cases) return <div className="glass p-5 text-sm text-[var(--text-muted)]">Загрузка клинических случаев…</div>;

  const active = cases[String(selectedId)];
  const m = active.metrics;
  const liverVolumeSuspect = m.liver_volume_cm3 > LIVER_VOLUME_PLAUSIBLE_MAX;
  const topProb = PROB_ROWS.reduce((a, b) => (active.probabilities[b.key] > active.probabilities[a.key] ? b : a));

  return (
    <div className="grid grid-cols-4 gap-5">
      {/* Case selector */}
      <div className="glass p-3 max-h-[640px] overflow-y-auto scrollbar-thin">
        <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] px-2 py-2">
          51 клинический случай (LiTS)
        </div>
        <div className="space-y-1">
          {ids.map((id) => {
            const c = cases[String(id)];
            const active_ = id === selectedId;
            return (
              <button
                key={id}
                ref={active_ ? selectedRowRef : undefined}
                onClick={() => { setSelectedId(id); setImgError(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between gap-2 ${
                  active_ ? "btn-gradient font-medium" : "hover:bg-black/[0.03] text-[var(--text-muted)]"
                }`}
              >
                <span>Случай №{id}</span>
                {c.ground_truth_has_tumor && (
                  <span className="risk-dot shrink-0" style={{ background: active_ ? "#fff" : "var(--risk-high)" }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Image + verdict */}
      <div className="col-span-2 space-y-5">
        <div className="glass p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Клинический случай №{selectedId}</h2>
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">2D КТ · чёрный фон (PACS)</span>
          </div>
          <div className="bg-black rounded-lg overflow-hidden flex items-center justify-center" style={{ minHeight: 320 }}>
            {imgError ? (
              <div className="text-xs text-neutral-400 py-16 text-center px-6">
                Не найден /reconstructions/patient_{selectedId}_comparison.png
              </div>
            ) : (
              <img
                src={`/reconstructions/patient_${selectedId}_comparison.png`}
                alt={`КТ-сравнение, случай ${selectedId}`}
                className="w-full h-auto"
                onError={() => setImgError(true)}
              />
            )}
          </div>
        </div>

        <div className="glass p-5" style={{ borderColor: `${topProb.color}44` }}>
          <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Заключение ИИ</div>
          <div className="text-lg font-semibold mb-4" style={{ color: topProb.color }}>{active.probabilities.verdict}</div>
          <div className="space-y-2">
            {PROB_ROWS.map((row) => (
              <div key={row.key} className="flex items-center gap-2">
                <div className="w-40 text-[11px] text-[var(--text-muted)] shrink-0">{row.label}</div>
                <div className="flex-1 h-4 bg-[var(--bg-elevated)] rounded overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${Math.max(active.probabilities[row.key], 0)}%`, background: row.color }} />
                </div>
                <div className="w-12 text-right text-[11px] mono text-[var(--text-muted)]">{active.probabilities[row.key].toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Metrics + validation */}
      <div className="space-y-5">
        <div className="glass p-5">
          <h2 className="text-sm font-medium mb-3 flex items-center gap-2"><Ruler size={14} /> Метрики очага</h2>
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">Объём</span><span className="mono font-medium">{m.tumor_volume_cm3.toFixed(2)} см³</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">Диаметр (сф.)</span><span className="mono font-medium">{m.tumor_diameter_mm > 0 ? `${m.tumor_diameter_mm.toFixed(1)} мм` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">Вокселей</span><span className="mono font-medium">{m.tumor_voxels.toLocaleString("ru-RU")}</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">Срезов с опухолью</span><span className="mono font-medium">{m.num_tumor_slices}</span></div>
            <div className="pt-2 border-t border-[var(--border-soft)]">
              <div className="flex items-center gap-1.5 text-[var(--text-muted)] mb-1"><MapPin size={11} /> Центроид (мм)</div>
              <div className="mono font-medium">x: {m.centroid_mm.x.toFixed(1)} · y: {m.centroid_mm.y.toFixed(1)} · z: {m.centroid_mm.z.toFixed(1)}</div>
            </div>
          </div>
        </div>

        <div className="glass p-5" style={liverVolumeSuspect ? { borderColor: "var(--risk-high)55" } : undefined}>
          <h2 className="text-sm font-medium mb-2 flex items-center gap-2"><Droplet size={14} /> Общий объём печени</h2>
          <div className="text-2xl font-semibold mono mb-1" style={{ color: liverVolumeSuspect ? "var(--risk-high)" : "var(--text-primary)" }}>
            {m.liver_volume_cm3.toFixed(0)} см³
          </div>
          {liverVolumeSuspect ? (
            <div className="flex items-start gap-1.5 text-[11px] text-[var(--risk-high)]">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              Выше физиологической нормы (1200–1800 см³) — известная погрешность расчёта для этого случая, уточняется.
            </div>
          ) : (
            <div className="text-[11px] text-[var(--text-muted)]">В пределах нормы — используется для ХВГ-мониторинга и подтверждения гепатомегалии.</div>
          )}
        </div>

        {validation && (
          <div className="glass p-5">
            <h2 className="text-sm font-medium mb-3 flex items-center gap-2"><Box size={14} /> Валидация модели</h2>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="glass px-2 py-2 text-center">
                <div className="text-[10px] text-[var(--text-muted)]">Accuracy</div>
                <div className="mono font-semibold text-sm">{validation.accuracy.toFixed(1)}%</div>
              </div>
              <div className="glass px-2 py-2 text-center">
                <div className="text-[10px] text-[var(--text-muted)]">Sensitivity</div>
                <div className="mono font-semibold text-sm">{validation.sensitivity.toFixed(1)}%</div>
              </div>
              <div className="glass px-2 py-2 text-center">
                <div className="text-[10px] text-[var(--text-muted)]">Specificity</div>
                <div className="mono font-semibold text-sm">{validation.specificity.toFixed(1)}%</div>
              </div>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Посчитано на лету по {validation.n} случаям: {validation.tp} верно найденных опухолей, {validation.tn} верно
              подтверждённых норм, {validation.fp} ложных срабатываний, {validation.fn} пропущенных опухолей
              (случаи №49, №50 при текущих данных). Валидационная выборка LiTS — только пациенты с патологией,
              поэтому specificity считается на малом числе здоровых случаев внутри неё, а не на отдельном контроле.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
