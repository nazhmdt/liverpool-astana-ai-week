"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ThumbsDown, ThumbsUp, AlertTriangle, Send, ScanEye, Check, WifiOff } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { api, PatientDetail } from "@/lib/api";
import RiskBadge from "@/components/RiskBadge";
import LabDocumentsPanel from "@/components/LabDocumentsPanel";
import PatientCtCase from "@/components/PatientCtCase";
import { getSession } from "@/lib/session";

const VIRAL_LABELS: Record<string, string> = {
  HBsAg: "HBsAg (гепатит B)",
  anti_HCV: "Антитела к гепатиту C",
  HCV_RNA: "РНК гепатита C",
  anti_HDV: "Антитела к гепатиту D",
};

const RISK_FACTOR_LABELS: Record<string, string> = {
  alcohol_use: "Употребление алкоголя",
  diabetes: "Диабет",
  obesity: "Ожирение",
  injection_drug_use: "Инъекционные наркотики в анамнезе",
  transfusion_history: "Переливание крови в анамнезе",
};

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState<"useful" | "not_useful" | null>(null);
  const [referralState, setReferralState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    if (id) api.patientDetail(id).then((p) => {
      setPatient(p);
      // Reflect state already recorded on the backend so a page reload
      // doesn't make an already-sent referral or already-given feedback
      // look like it never happened.
      if (p.referral_sent) setReferralState("sent");
      if (p.feedback_given === true) setFeedbackSent("useful");
      else if (p.feedback_given === false) setFeedbackSent("not_useful");
    }).catch(() => setLoadError(true));
  }, [id]);

  async function sendReferral() {
    if (!id) return;
    setReferralState("sending");
    try {
      await api.sendReferral(id);
      setReferralState("sent");
    } catch {
      setReferralState("error");
    }
  }

  if (loadError) {
    return (
      <div className="p-8 flex items-center gap-2 text-[var(--risk-critical)] text-sm">
        <WifiOff size={16} /> Не удалось загрузить карту пациента. Проверьте соединение с сервером.
      </div>
    );
  }

  if (!patient) {
    return <div className="p-8 text-[var(--text-muted)]">Загрузка карты пациента…</div>;
  }

  const chartData = patient.trend.quarters.map((q, i) => ({
    quarter: q,
    AST: patient.trend.ast[i],
    ALT: patient.trend.alt[i],
    Тромбоциты: patient.trend.platelets[i],
  }));

  const a = patient.assessment;
  const urgencyColor =
    a.risk_category === "Critical" ? "var(--risk-critical)" :
    a.risk_category === "High" ? "var(--risk-high)" :
    a.risk_category === "Intermediate" ? "var(--risk-intermediate)" : "var(--risk-low)";

  const needsImaging = a.risk_category === "Critical" || a.risk_category === "High";

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      <button onClick={() => router.push("/")} className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-5">
        <ArrowLeft size={15} /> Назад в кабинет
      </button>

      {(() => {
        const session = getSession();
        if (session && session.uchastok !== patient.uchastok) {
          return (
            <div className="glass p-3 mb-5 flex items-center gap-2 text-xs" style={{ borderColor: "var(--risk-high)55" }}>
              <AlertTriangle size={14} style={{ color: "var(--risk-high)" }} className="shrink-0" />
              Этот пациент закреплён за участком №{patient.uchastok}, а не за вашим (№{session.uchastok}). В демо-версии
              доступ не ограничен на уровне сервера — в реальном внедрении это должно блокироваться правами доступа.
            </div>
          );
        }
        return null;
      })()}

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{patient.name}</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1 mono">
            {patient.patient_id} &middot; {patient.age} лет, {patient.sex} &middot; ИМТ {patient.bmi} &middot; {patient.clinic} &middot; Участок №{patient.uchastok}
          </p>
        </div>
        <RiskBadge category={a.risk_category} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: trend + labs */}
        <div className="lg:col-span-2 space-y-5">
          <div className="glass p-5">
            <h2 className="text-sm font-medium mb-1">Динамика анализов за 5 лет</h2>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              Смысл графика: пациент может выглядеть &laquo;здоровым&raquo; сегодня, даже если направление показателей — нет.
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                <XAxis dataKey="quarter" tick={{ fontSize: 10, fill: "var(--text-muted)" }} interval={2} />
                <YAxis yAxisId="labs" tick={{ fontSize: 10, fill: "var(--text-muted)" }} label={{ value: "АСТ/АЛТ", angle: -90, position: "insideLeft", fontSize: 10, fill: "var(--text-muted)" }} />
                <YAxis yAxisId="platelets" orientation="right" tick={{ fontSize: 10, fill: "var(--text-muted)" }} label={{ value: "Тромбоциты", angle: 90, position: "insideRight", fontSize: 10, fill: "var(--text-muted)" }} />
                <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border-soft)", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="labs" type="monotone" dataKey="AST" stroke="#63b3ed" strokeWidth={2} dot={false} />
                <Line yAxisId="labs" type="monotone" dataKey="ALT" stroke="#ed8936" strokeWidth={2} dot={false} />
                <Line yAxisId="platelets" type="monotone" dataKey="Тромбоциты" stroke="#48bb78" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
              <div className="flex items-center gap-2 text-[var(--text-muted)]">
                Тренд АСТ: <span className="mono text-[var(--text-primary)]">{a.ast_trend_slope > 0 ? "+" : ""}{a.ast_trend_slope}/год</span>
              </div>
              <div className="flex items-center gap-2 text-[var(--text-muted)]">
                Тренд тромбоцитов: <span className="mono text-[var(--text-primary)]">{a.platelet_trend_slope}/год</span>
              </div>
            </div>
          </div>

          <div className="glass p-5">
            <h2 className="text-sm font-medium mb-3">Почему пациент был отмечен</h2>
            <div className="space-y-2">
              {a.top_contributors.map((c) => (
                <div key={c.feature} className="flex items-center gap-3">
                  <div className="w-44 text-xs text-[var(--text-muted)] shrink-0">{c.feature}</div>
                  <div className="flex-1 h-5 bg-[var(--bg-elevated)] rounded overflow-hidden relative">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${Math.min(Math.abs(c.impact) * 22, 100)}%`,
                        background: c.impact > 0 ? "var(--risk-high)" : "var(--risk-low)",
                        marginLeft: c.impact > 0 ? "0" : "auto",
                      }}
                    />
                  </div>
                  <div className="w-24 text-right text-xs mono text-[var(--text-muted)]">значение {c.value}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-3">
              Полосы показывают влияние (SHAP) на прогноз риска — оранжевый повышает риск, зелёный снижает. Это объяснение
              показывается врачу вместо сырой вероятности.
            </p>
          </div>

          <LabDocumentsPanel documents={patient.lab_documents} sex={patient.sex} />

          {patient.ct_case_id !== null ? (
            <PatientCtCase ctCaseId={patient.ct_case_id} />
          ) : needsImaging && (
            <div className="glass p-5">
              <h2 className="text-sm font-medium flex items-center gap-2 mb-1"><ScanEye size={15} /> Углублённая диагностика</h2>
              <p className="text-xs text-[var(--text-muted)]">
                Лабораторный риск повышен, но результата КТ/УЗИ по этому пациенту в системе пока нет — направление
                на визуализацию ещё не выполнено.
              </p>
            </div>
          )}
        </div>

        {/* Right: scores + action + markers */}
        <div className="space-y-5">
          <div className="glass p-5" style={{ borderColor: `${urgencyColor}44` }}>
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Комплексный балл риска</div>
            <div className="text-4xl font-semibold mono mb-3" style={{ color: urgencyColor }}>{a.risk_score}<span className="text-base text-[var(--text-muted)]">/100</span></div>
            <div className="grid grid-cols-2 gap-2 text-xs mb-4">
              <div className="glass px-3 py-2"><div className="text-[var(--text-muted)]">FIB-4</div><div className="mono font-medium">{a.fib4} <span className="text-[10px] text-[var(--text-muted)]">({a.fib4_band.replace("_", " ")})</span></div></div>
              <div className="glass px-3 py-2"><div className="text-[var(--text-muted)]">APRI</div><div className="mono font-medium">{a.apri}</div></div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: `${urgencyColor}14`, border: `1px solid ${urgencyColor}33` }}>
              <AlertTriangle size={15} style={{ color: urgencyColor }} className="mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium">{patient.recommended_action.action}</div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">{patient.recommended_action.note}</div>
              </div>
            </div>
            <button
              onClick={sendReferral}
              disabled={referralState === "sending" || referralState === "sent"}
              className={`w-full mt-3 flex items-center justify-center gap-2 text-sm py-2.5 rounded-lg transition-colors font-medium disabled:cursor-default ${
                referralState === "sent"
                  ? "bg-[var(--risk-low)]/15 text-[var(--risk-low)]"
                  : "bg-[var(--primary-500)] hover:bg-[var(--primary-700)] text-white"
              }`}
            >
              {referralState === "sent" ? (
                <><Check size={14} /> Направление отправлено</>
              ) : referralState === "sending" ? (
                "Отправка…"
              ) : referralState === "error" ? (
                <><WifiOff size={14} /> Ошибка — повторить</>
              ) : (
                <><Send size={14} /> Отправить направление</>
              )}
            </button>
          </div>

          <div className="glass p-5">
            <h2 className="text-sm font-medium mb-3">Вирусные маркеры</h2>
            <div className="space-y-1.5 text-xs">
              {Object.entries(patient.viral_markers).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-[var(--text-muted)]">{VIRAL_LABELS[k] || k}</span>
                  <span className={v ? "text-[var(--risk-high)] font-medium" : "text-[var(--text-muted)]"}>{v ? "Положительно" : "Отрицательно"}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass p-5">
            <h2 className="text-sm font-medium mb-3">Факторы риска</h2>
            <div className="space-y-1.5 text-xs">
              {Object.entries(patient.risk_factors).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-[var(--text-muted)]">{RISK_FACTOR_LABELS[k] || k}</span>
                  <span className={v ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-muted)]"}>{v ? "Да" : "Нет"}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass p-5">
            <h2 className="text-sm font-medium mb-3">Было ли предупреждение полезным?</h2>
            <p className="text-xs text-[var(--text-muted)] mb-3">Записывается в журнал для клинического аудита. Модель пока не переобучается автоматически на этой обратной связи — это ручной обзор, а не автоматический контур подстройки.</p>
            <div className="flex gap-2">
              <button
                onClick={() => api.submitFeedback(patient.patient_id, true).then(() => setFeedbackSent("useful"))}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs border ${feedbackSent === "useful" ? "bg-[var(--risk-low)]/15 border-[var(--risk-low)] text-[var(--risk-low)]" : "border-[var(--border-soft)] hover:bg-black/[0.03]"}`}
              >
                <ThumbsUp size={13} /> Полезно
              </button>
              <button
                onClick={() => api.submitFeedback(patient.patient_id, false).then(() => setFeedbackSent("not_useful"))}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs border ${feedbackSent === "not_useful" ? "bg-[var(--risk-critical)]/15 border-[var(--risk-critical)] text-[var(--risk-critical)]" : "border-[var(--border-soft)] hover:bg-black/[0.03]"}`}
              >
                <ThumbsDown size={13} /> Не полезно
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
