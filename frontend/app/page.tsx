"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, RefreshCw, TrendingDown, TrendingUp, AlertTriangle, Stethoscope, ClipboardCheck, ShieldCheck, WifiOff } from "lucide-react";
import { api, PatientSummary, Doctor } from "@/lib/api";
import RiskBadge from "@/components/RiskBadge";
import StatCard from "@/components/StatCard";
import { getSession } from "@/lib/session";
import { patientsRu } from "@/lib/plural";

const RISK_ORDER = ["Critical", "High", "Intermediate", "Low"];
const RISK_LABELS: Record<string, string> = { Critical: "Критический", High: "Высокий", Intermediate: "Средний", Low: "Низкий" };

export default function DashboardPage() {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("");
  const tableRef = useRef<HTMLDivElement>(null);

  // Fetched once per doctor, unfiltered by risk/search -- counts on the stat
  // cards must always reflect the doctor's whole uchastok panel, not
  // whatever risk_category/search happens to be selected for the table
  // below. Filtering for the table is done client-side.
  function loadPatients(uchastok: number) {
    setLoading(true);
    setError(null);
    api
      .listPatients({ uchastok, limit: 2000 })
      .then((r) => setPatients(r.patients))
      .catch(() => setError("Не удалось связаться с сервером. Проверьте, что backend запущен, и попробуйте снова."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const d = getSession();
    setDoctor(d);
    if (d) loadPatients(d.uchastok);
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { Critical: 0, High: 0, Intermediate: 0, Low: 0 };
    patients.forEach((p) => (c[p.risk_category] = (c[p.risk_category] || 0) + 1));
    return c;
  }, [patients]);

  const total = counts.Critical + counts.High + counts.Intermediate + counts.Low;

  const filteredPatients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return patients.filter((p) => {
      if (riskFilter && p.risk_category !== riskFilter) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.patient_id.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [patients, riskFilter, search]);

  function filterByRisk(category: string) {
    setRiskFilter((current) => (current === category ? "" : category));
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      <div className="bento-grid mb-6">
        <div className="bento-4x2 glass p-7 flex flex-col justify-between float-in relative overflow-hidden">
          <svg className="wave-divider absolute top-0 left-0 text-[var(--primary-400)]" viewBox="0 0 400 20" preserveAspectRatio="none">
            <path d="M0,10 C 30,0 70,20 100,10 C 130,0 170,20 200,10 C 230,0 270,20 300,10 C 330,0 370,20 400,10" />
          </svg>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-2 flex items-center gap-2">
              <Stethoscope size={13} /> {doctor ? `${doctor.full_name} · Участок №${doctor.uchastok}` : "Кабинет врача"}
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-wrap-balance leading-tight">
              Печень &mdash; тихий орган.<br />Данные говорят за него.
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-3 max-w-[52ch]">
              Рабочий список по риску печени &middot; авто-расчёт по обычным анализам,
              без дополнительных тестов &middot; из {total.toLocaleString("ru-RU")} прикреплённых {patientsRu(total)} вашего участка.
            </p>
          </div>
          <button
            onClick={() => doctor && loadPatients(doctor.uchastok)}
            className="self-start flex items-center gap-2 text-xs px-4 py-2.5 rounded-xl btn-gradient font-medium mt-5"
          >
            <RefreshCw size={13} /> Обновить данные
          </button>
        </div>

        <div className="bento-2x2">
          <StatCard
            label="Критический"
            value={counts.Critical}
            sub="Нужно срочное направление"
            icon={AlertTriangle}
            size="lg"
            gradient
            className="h-full float-in float-in-1"
            onClick={() => filterByRisk("Critical")}
            active={riskFilter === "Critical"}
          />
        </div>

        <div className="bento-2x1">
          <StatCard label="Высокий" value={counts.High} accent="var(--risk-high)" sub="Направление к гепатологу" icon={Stethoscope} className="h-full float-in float-in-2" onClick={() => filterByRisk("High")} active={riskFilter === "High"} />
        </div>
        <div className="bento-2x1">
          <StatCard label="Средний" value={counts.Intermediate} accent="var(--risk-intermediate)" sub="Повторный анализ, наблюдение" icon={ClipboardCheck} className="h-full float-in float-in-3" onClick={() => filterByRisk("Intermediate")} active={riskFilter === "Intermediate"} />
        </div>
        <div className="bento-2x1">
          <StatCard label="Низкий" value={counts.Low} accent="var(--risk-low)" sub="Обычное наблюдение" icon={ShieldCheck} className="h-full float-in float-in-4" onClick={() => filterByRisk("Low")} active={riskFilter === "Low"} />
        </div>
      </div>

      {error && (
        <div className="glass p-4 mb-4 flex items-center gap-3 text-sm" style={{ borderColor: "var(--risk-critical)55" }}>
          <WifiOff size={16} style={{ color: "var(--risk-critical)" }} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => doctor && loadPatients(doctor.uchastok)} className="text-xs px-3 py-1.5 rounded-lg btn-gradient font-medium shrink-0">Повторить</button>
        </div>
      )}

      <div className="glass p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] surface">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени или ID пациента..."
            className="w-full bg-transparent border-0 pl-9 pr-3 py-2.5 text-sm outline-none"
          />
        </div>
        <select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value)}
          className="surface bg-transparent px-3 py-2.5 text-sm outline-none"
        >
          <option value="">Все уровни риска</option>
          {RISK_ORDER.map((r) => (
            <option key={r} value={r}>{RISK_LABELS[r]}</option>
          ))}
        </select>
      </div>

      <div ref={tableRef} className="glass overflow-hidden scroll-mt-6">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-soft)]">
                <th className="px-4 py-3 font-medium">Пациент</th>
                <th className="px-4 py-3 font-medium">Возраст/Пол</th>
                <th className="px-4 py-3 font-medium">FIB-4</th>
                <th className="px-4 py-3 font-medium">APRI</th>
                <th className="px-4 py-3 font-medium">Тренд тромбоцитов</th>
                <th className="px-4 py-3 font-medium">Балл риска</th>
                <th className="px-4 py-3 font-medium">Категория</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--text-muted)]">Загрузка пациентов…</td></tr>
              ) : filteredPatients.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--text-muted)]">Нет пациентов по этому фильтру.</td></tr>
              ) : (
                filteredPatients.map((p) => (
                  <tr key={p.patient_id} className="row-hover border-b border-[var(--border-soft)]/60 last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/patients/${p.patient_id}`} className="hover:text-[var(--primary-300)] transition-colors">
                        <div className="font-medium flex items-center gap-1.5">
                          {p.name}
                          {p.ct_case_id !== null && (
                            <span title="Есть КТ" className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold" style={{ color: "var(--primary-700)", background: "var(--primary-100)" }}>
                              КТ
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mono">{p.patient_id}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">{p.age} / {p.sex}</td>
                    <td className="px-4 py-2.5 mono">{p.fib4.toFixed(2)}</td>
                    <td className="px-4 py-2.5 mono">{p.apri.toFixed(2)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 mono text-xs ${p.platelet_trend_slope < -2 ? "text-[var(--risk-high)]" : "text-[var(--text-muted)]"}`}>
                        {p.platelet_trend_slope < -2 ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
                        {p.platelet_trend_slope.toFixed(1)}/год
                      </span>
                    </td>
                    <td className="px-4 py-2.5 mono font-medium">{p.risk_score}</td>
                    <td className="px-4 py-2.5"><RiskBadge category={p.risk_category} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
