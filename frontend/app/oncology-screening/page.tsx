"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, Eye, WifiOff } from "lucide-react";
import { api, OncologyScreening } from "@/lib/api";

const TIER_META = {
  urgent: { label: "Срочно — направить на углублённое обследование в первую очередь", color: "var(--risk-critical)", icon: AlertTriangle },
  moderate: { label: "Средний приоритет — плановое дообследование", color: "var(--risk-high)", icon: Clock },
  low: { label: "Низкий приоритет — наблюдение", color: "var(--risk-low)", icon: Eye },
} as const;

type Tier = "urgent" | "moderate" | "low";

export default function OncologyScreeningPage() {
  const [data, setData] = useState<OncologyScreening | null>(null);
  const [error, setError] = useState(false);
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.oncologyScreening(0.5, 500).then(setData).catch(() => setError(true));
  }, []);

  function selectTier(tier: Tier) {
    setSelectedTier((current) => (current === tier ? null : tier));
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (error) {
    return (
      <div className="p-8 flex items-center gap-2 text-[var(--risk-critical)] text-sm">
        <WifiOff size={16} /> Не удалось загрузить результаты скрининга. Проверьте соединение с сервером.
      </div>
    );
  }

  if (!data) return <div className="p-8 text-[var(--text-muted)]">Загрузка результатов скрининга…</div>;

  const grouped = {
    urgent: data.patients.filter((p) => p.tier === "urgent"),
    moderate: data.patients.filter((p) => p.tier === "moderate"),
    low: data.patients.filter((p) => p.tier === "low"),
  };

  return (
    <div className="p-8 max-w-[1100px] mx-auto">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">Онко-скрининг печени</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1 max-w-[75ch]">
          Из {data.total_screened.toLocaleString("ru-RU")} прошедших скрининг пациентов у {data.total_flagged} обнаружен
          ненулевой процент вероятности онкологического процесса. Список отсортирован по убыванию процента — чтобы
          подтвердить или исключить рак печени, пациентов с наибольшим риском нужно направить на углублённое обследование
          в первую очередь, пока процесс ещё не развился дальше.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <button
          onClick={() => selectTier("urgent")}
          className={`glass lift text-left p-4 ${selectedTier === "urgent" ? "ring-2" : ""}`}
          style={{ borderColor: selectedTier === "urgent" ? "var(--risk-critical)" : "var(--risk-critical)33" }}
        >
          <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Срочно (≥50%)</div>
          <div className="text-2xl font-semibold mono" style={{ color: "var(--risk-critical)" }}>{data.urgent_count}</div>
        </button>
        <button
          onClick={() => selectTier("moderate")}
          className={`glass lift text-left p-4 ${selectedTier === "moderate" ? "ring-2" : ""}`}
          style={selectedTier === "moderate" ? { borderColor: "var(--risk-high)" } : undefined}
        >
          <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Средний приоритет (15–50%)</div>
          <div className="text-2xl font-semibold mono" style={{ color: "var(--risk-high)" }}>{data.moderate_count}</div>
        </button>
        <button
          onClick={() => selectTier("low")}
          className={`glass lift text-left p-4 ${selectedTier === "low" ? "ring-2" : ""}`}
          style={selectedTier === "low" ? { borderColor: "var(--risk-low)" } : undefined}
        >
          <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Низкий приоритет (&lt;15%)</div>
          <div className="text-2xl font-semibold mono" style={{ color: "var(--risk-low)" }}>{data.low_count}</div>
        </button>
      </div>

      <div ref={listRef} className="scroll-mt-6">
      {(["urgent", "moderate", "low"] as const)
        .filter((tier) => !selectedTier || selectedTier === tier)
        .map((tier) => {
        const meta = TIER_META[tier];
        const Icon = meta.icon;
        const list = grouped[tier];
        if (list.length === 0) return null;
        return (
          <div key={tier} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Icon size={16} style={{ color: meta.color }} />
              <h2 className="text-sm font-semibold" style={{ color: meta.color }}>{meta.label}</h2>
              <span className="text-xs text-[var(--text-muted)] mono">({list.length})</span>
            </div>
            <div className="space-y-1.5">
              {list.map((p) => (
                <Link
                  key={p.patient_id}
                  href={`/patients/${p.patient_id}`}
                  className="glass flex items-center gap-4 px-4 py-3 hover:bg-black/[0.02] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-[var(--text-muted)] mono">{p.patient_id} &middot; {p.age} лет</div>
                  </div>
                  <div className="w-32">
                    <div className="h-1.5 bg-[var(--bg-elevated)] rounded overflow-hidden border border-[var(--border-soft)]">
                      <div className="h-full rounded" style={{ width: `${p.oncology_risk_pct}%`, background: meta.color }} />
                    </div>
                  </div>
                  <div className="text-lg font-semibold mono w-16 text-right" style={{ color: meta.color }}>
                    {p.oncology_risk_pct.toFixed(0)}%
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
      </div>

      <p className="text-[11px] text-[var(--text-muted)] max-w-[75ch]">
        Процент — это доля вероятности модели, соответствующая клиническому пути фиброз F3 / цирроз / ГЦК (та же
        оценка, что вычисляется в лабораторном риск-движке, здесь показана как самостоятельный показатель для
        онкологической сортировки, а не отдельная непроверенная формула).
      </p>
    </div>
  );
}
