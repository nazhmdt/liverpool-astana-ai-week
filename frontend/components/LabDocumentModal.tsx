"use client";

import { X, FlaskConical } from "lucide-react";
import { LabDocument } from "@/lib/api";

const FLAG_COLOR: Record<string, string> = {
  high: "var(--risk-high)",
  low: "var(--risk-intermediate)",
  normal: "var(--text-primary)",
};

export default function LabDocumentModal({ doc, sex, onClose }: { doc: LabDocument; sex: string; onClose: () => void }) {
  const dateFmt = new Date(doc.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(23,31,29,0.45)" }} onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-[var(--shadow-lg)] w-full max-w-xl max-h-[85vh] overflow-y-auto scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-soft)] sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <FlaskConical size={16} className="text-[var(--primary-500)]" />
            <span className="text-sm font-medium">{doc.category}</span>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={18} />
          </button>
        </div>

        <div className="p-6">
          <div className="text-xs text-[var(--text-muted)] mb-1">{doc.lab_name}</div>
          <div className="text-xs text-[var(--text-muted)] mb-4">
            № {doc.doc_number} &middot; {dateFmt} &middot; направил: {doc.ordering_doctor}
          </div>

          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-soft)]">
                <th className="py-2 font-medium">Показатель</th>
                <th className="py-2 font-medium">Результат</th>
                <th className="py-2 font-medium">Референс (М/Ж)</th>
              </tr>
            </thead>
            <tbody>
              {doc.readings.map((r) => (
                <tr key={r.code} className="border-b border-[var(--border-soft)]/60 last:border-0">
                  <td className="py-2.5 text-[var(--text-muted)]">{r.label_ru}</td>
                  <td className="py-2.5 mono font-medium" style={{ color: FLAG_COLOR[r.flag] }}>
                    {r.value} {r.unit}
                    {r.flag !== "normal" && <span className="ml-1">{r.flag === "high" ? "↑" : "↓"}</span>}
                  </td>
                  <td className="py-2.5 text-[var(--text-muted)] mono text-xs">{r.ref_male} / {r.ref_female}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-[11px] text-[var(--text-muted)] border-t border-[var(--border-soft)] pt-3">
            Результаты исследования не являются клиническим диагнозом и требуют консультации врача. Пол пациента: {sex === "M" ? "мужской" : "женский"}.
            Демо-документ, сгенерированный из синтетической когорты LiverPool AI — в пилоте заменяется реальной выпиской из МИС клиники (напр. Damumed).
          </p>
        </div>
      </div>
    </div>
  );
}
