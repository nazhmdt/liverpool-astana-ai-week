"use client";

import { useEffect, useState } from "react";
import { FlaskConical, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";

type MayoMetrics = {
  cv_accuracy_mean: number; cv_accuracy_std: number;
  cv_f1_macro_mean: number; cv_f1_macro_std: number; cv_folds: number;
  n_total?: number; n_train?: number; n_test?: number;
  source?: string; caveat?: string;
};

type HepcMetrics = {
  n_total: number; accuracy: number; balanced_accuracy: number; macro_f1: number;
  cv_f1_macro_mean: number; cv_f1_macro_std: number;
  majority_class_share: number; source: string; caveat: string;
};

export default function RealDataValidation() {
  const [mayo, setMayo] = useState<MayoMetrics | null>(null);
  const [hepc, setHepc] = useState<HepcMetrics | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([
      api.realDataValidation().catch(() => null),
      api.hepcValidation().catch(() => null),
    ])
      .then(([m, h]) => {
        setMayo(m as MayoMetrics | null);
        setHepc(h as HepcMetrics | null);
        if (!m && !h) setError(true);
      });
  }, []);

  if (error) return null;
  if (!mayo && !hepc) return null;

  return (
    <div className="glass p-6 mb-6">
      <h2 className="text-sm font-medium mb-1 flex items-center gap-2"><FlaskConical size={15} /> Валидация на реальных клинических данных</h2>
      <p className="text-xs text-[var(--text-muted)] mb-5 max-w-[85ch]">
        Основная система обучена на синтетической казахстанской когорте. Эти две модели обучены отдельно на
        реальных, независимо опубликованных наборах данных — чтобы честно показать, что пайплайн генерализуется
        за пределы синтетики, а не только выдаёт красивые цифры на сгенерированных пациентах.
      </p>

      <div className="grid grid-cols-2 gap-5">
        {hepc && (
          <div className="surface p-4">
            <div className="text-xs font-semibold mb-1">Гепатит C (UCI/Kaggle, n={hepc.n_total})</div>
            <div className="grid grid-cols-3 gap-2 mb-3 mt-3">
              <div className="glass px-2 py-2 text-center">
                <div className="text-[10px] text-[var(--text-muted)]">Accuracy</div>
                <div className="mono font-semibold text-sm">{(hepc.accuracy * 100).toFixed(1)}%</div>
              </div>
              <div className="glass px-2 py-2 text-center" style={{ borderColor: "var(--primary-500)55" }}>
                <div className="text-[10px] text-[var(--text-muted)]">Macro F1 (честная)</div>
                <div className="mono font-semibold text-sm">{(hepc.macro_f1 * 100).toFixed(1)}%</div>
              </div>
              <div className="glass px-2 py-2 text-center">
                <div className="text-[10px] text-[var(--text-muted)]">Balanced Acc.</div>
                <div className="mono font-semibold text-sm">{(hepc.balanced_accuracy * 100).toFixed(1)}%</div>
              </div>
            </div>
            <div className="flex items-start gap-1.5 text-[11px] text-[var(--text-muted)] leading-relaxed">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" style={{ color: "var(--risk-intermediate)" }} />
              Accuracy {(hepc.accuracy * 100).toFixed(0)}% раздута долей здоровых доноров ({(hepc.majority_class_share * 100).toFixed(0)}% выборки) —
              Macro F1 {(hepc.macro_f1 * 100).toFixed(0)}% честнее отражает качество на редких классах (гепатит/фиброз/цирроз).
            </div>
          </div>
        )}

        {mayo && (
          <div className="surface p-4">
            <div className="text-xs font-semibold mb-1">Цирроз (Mayo Clinic PBC{mayo.n_total ? `, n=${mayo.n_total}` : ""})</div>
            <div className="grid grid-cols-2 gap-2 mb-3 mt-3">
              <div className="glass px-2 py-2 text-center" style={{ borderColor: "var(--primary-500)55" }}>
                <div className="text-[10px] text-[var(--text-muted)]">CV Accuracy</div>
                <div className="mono font-semibold text-sm">{(mayo.cv_accuracy_mean * 100).toFixed(1)}% ± {(mayo.cv_accuracy_std * 100).toFixed(1)}</div>
              </div>
              <div className="glass px-2 py-2 text-center">
                <div className="text-[10px] text-[var(--text-muted)]">CV Macro F1</div>
                <div className="mono font-semibold text-sm">{(mayo.cv_f1_macro_mean * 100).toFixed(1)}% ± {(mayo.cv_f1_macro_std * 100).toFixed(1)}</div>
              </div>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              {mayo.cv_folds}-fold кросс-валидация вместо одного разбиения — честная оценка на маленькой реальной
              выборке, стадирование фиброза/цирроза по биопсии, не гепатит.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
