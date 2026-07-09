"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { api, MohAnalytics } from "@/lib/api";
import StatCard from "@/components/StatCard";
import RealDataValidation from "@/components/RealDataValidation";
import { WifiOff } from "lucide-react";

const DIAGNOSIS_LABELS: Record<string, string> = {
  healthy: "Здоров",
  MASLD: "Жировая болезнь печени",
  chronic_HBV: "Хронический гепатит B",
  chronic_HCV: "Хронический гепатит C",
  fibrosis_F1: "Фиброз F1",
  fibrosis_F2: "Фиброз F2",
  fibrosis_F3: "Фиброз F3",
  cirrhosis: "Цирроз",
  HCC: "ГЦК (рак печени)",
};

const RISK_TIER_COLOR: Record<string, string> = {
  critical: "#A8402F",
  high: "#B3701E",
  intermediate: "#937518",
  low: "#29765A",
};

export default function AnalyticsPage() {
  const [data, setData] = useState<MohAnalytics | null>(null);
  const [error, setError] = useState(false);
  const [screeningPct, setScreeningPct] = useState(10);
  const [sim, setSim] = useState<{ additional_patients_caught_earlier: number; projected_cirrhosis_cases_avoided_5yr: number } | null>(null);

  useEffect(() => {
    api.mohAnalytics().then(setData).catch(() => setError(true));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      api.simulateScreening(screeningPct).then(setSim).catch(() => {});
    }, 150);
    return () => clearTimeout(t);
  }, [screeningPct]);

  if (error) {
    return (
      <div className="p-8 flex items-center gap-2 text-[var(--risk-critical)] text-sm">
        <WifiOff size={16} /> Не удалось загрузить аналитику. Проверьте соединение с сервером.
      </div>
    );
  }

  if (!data) return <div className="p-8 text-[var(--text-muted)]">Загрузка аналитики…</div>;

  const n = data.summary;
  const clinicName = data.by_clinic[0]?.clinic ?? "";

  const diagnosisData = Object.entries(data.by_diagnosis)
    .map(([code, count]) => ({ code, label: DIAGNOSIS_LABELS[code] ?? code, count }))
    .sort((a, b) => b.count - a.count);

  const riskTierData = [
    { tier: "critical", label: "Критический", count: n.critical },
    { tier: "high", label: "Высокий", count: n.high },
    { tier: "intermediate", label: "Средний", count: n.intermediate },
    { tier: "low", label: "Низкий", count: n.low },
  ];

  return (
    <div className="p-8 max-w-[1300px] mx-auto">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">Статистика &mdash; {clinicName || "пилотная поликлиника"}</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5 max-w-[80ch]">
          Не для повседневной работы с пациентом — это агрегированный, обезличенный срез по всей клинике для
          главного врача и отчётности в Минздрав: сколько пациентов на каком этапе, куда движется нагрузка,
          что изменится при расширении скрининга. По {n.total_patients.toLocaleString("ru-RU")} синтетическим
          пациентам, калиброванным по опубликованной эпидемиологии Казахстана.
        </p>
      </header>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Всего обследовано" value={n.total_patients.toLocaleString("ru-RU")} />
        <StatCard label="Критический + Высокий риск" value={(n.critical + n.high).toLocaleString("ru-RU")} accent="var(--risk-high)" />
        <StatCard label="HBsAg положительно" value={n.hbv_positive.toLocaleString("ru-RU")} />
        <StatCard label="Анти-HCV положительно" value={n.hcv_positive.toLocaleString("ru-RU")} />
      </div>

      <div className="grid grid-cols-2 gap-5 mb-6">
        <div className="glass p-5">
          <h2 className="text-sm font-medium mb-4">Пациенты по диагнозу</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={diagnosisData} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <YAxis dataKey="label" type="category" tick={{ fontSize: 10, fill: "var(--text-muted)" }} width={150} />
              <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border-soft)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="#3D7E88" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass p-5">
          <h2 className="text-sm font-medium mb-4">Распределение по уровню риска</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={riskTierData} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <YAxis dataKey="label" type="category" tick={{ fontSize: 11, fill: "var(--text-muted)" }} width={90} />
              <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border-soft)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {riskTierData.map((entry) => (
                  <Cell key={entry.tier} fill={RISK_TIER_COLOR[entry.tier]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <RealDataValidation />

      <div className="glass p-6">
        <h2 className="text-sm font-medium mb-1">Песочница политики: &laquo;Что если охватить скринингом больше?&raquo;</h2>
        <p className="text-xs text-[var(--text-muted)] mb-5">
          Иллюстративная проекция на синтетической когорте — заглушка для полноценной цифровой модели-двойника, не клинический прогноз.
        </p>
        <div className="flex items-center gap-4 mb-5">
          <span className="text-xs text-[var(--text-muted)] w-40">Доп. охват скринингом</span>
          <input
            type="range"
            min={0}
            max={50}
            value={screeningPct}
            onChange={(e) => setScreeningPct(Number(e.target.value))}
            className="flex-1 accent-[var(--primary-500)]"
          />
          <span className="mono text-sm font-medium w-14 text-right">+{screeningPct}%</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="glass px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Доп. пациентов выявлено раньше</div>
            <div className="text-2xl font-semibold mono text-[var(--primary-300)]">{sim?.additional_patients_caught_earlier ?? "…"}</div>
          </div>
          <div className="glass px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Прогноз: избежано случаев цирроза (5 лет)</div>
            <div className="text-2xl font-semibold mono text-[var(--risk-low)]">{sim?.projected_cirrhosis_cases_avoided_5yr ?? "…"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
