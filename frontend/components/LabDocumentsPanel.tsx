"use client";

import { useMemo, useState } from "react";
import { FileText, ChevronDown, FlaskConical } from "lucide-react";
import { LabDocument } from "@/lib/api";
import LabDocumentModal from "./LabDocumentModal";
import { documentsRu } from "@/lib/plural";

const CATEGORY_ICON_COLOR: Record<string, string> = {
  "Биохимия крови": "var(--primary-500)",
  "Гематология (ОАК)": "var(--risk-intermediate)",
  "Вирусология": "var(--risk-high)",
};

export default function LabDocumentsPanel({ documents, sex }: { documents: LabDocument[]; sex: string }) {
  const [openYears, setOpenYears] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<LabDocument | null>(null);

  const byYear = useMemo(() => {
    const groups: Record<string, LabDocument[]> = {};
    documents.forEach((d) => {
      const y = d.date.slice(0, 4);
      (groups[y] ||= []).push(d);
    });
    return Object.entries(groups).sort((a, b) => Number(b[0]) - Number(a[0]));
  }, [documents]);

  function toggleYear(y: string) {
    setOpenYears((s) => {
      const next = new Set(s);
      next.has(y) ? next.delete(y) : next.add(y);
      return next;
    });
  }

  const anyFlagged = (docs: LabDocument[]) => docs.some((d) => d.readings.some((r) => r.flag !== "normal"));

  return (
    <div className="glass p-5">
      <h2 className="text-sm font-medium mb-1 flex items-center gap-2">
        <FileText size={15} /> Файлы анализов
      </h2>
      <p className="text-xs text-[var(--text-muted)] mb-4">
        {documents.length} {documentsRu(documents.length)} &middot; сгруппированы по году, откройте, чтобы сверить с оригиналом лаборатории.
      </p>

      <div className="space-y-2">
        {byYear.map(([year, docs], idx) => {
          const open = openYears.has(year) || idx === 0;
          return (
            <div key={year} className="surface overflow-hidden">
              <button
                onClick={() => toggleYear(year)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm"
              >
                <span className="font-medium flex items-center gap-2">
                  {year}
                  {anyFlagged(docs) && <span className="risk-dot" style={{ background: "var(--risk-high)" }} />}
                </span>
                <span className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  {docs.length} &middot; <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
                </span>
              </button>
              {open && (
                <div className="border-t border-[var(--border-soft)]">
                  {docs.map((d) => {
                    const flagged = d.readings.some((r) => r.flag !== "normal");
                    return (
                      <button
                        key={d.doc_id}
                        onClick={() => setSelected(d)}
                        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-black/[0.03] transition-colors border-t border-[var(--border-soft)] first:border-t-0"
                      >
                        <FlaskConical size={14} style={{ color: CATEGORY_ICON_COLOR[d.category] || "var(--text-muted)" }} className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium truncate">{d.category}</div>
                          <div className="text-[11px] text-[var(--text-muted)]">
                            {new Date(d.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" })} &middot; {d.lab_name}
                          </div>
                        </div>
                        {flagged && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ color: "var(--risk-high)", background: "rgba(179,112,30,0.1)" }}>вне нормы</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selected && <LabDocumentModal doc={selected} sex={sex} onClose={() => setSelected(null)} />}
    </div>
  );
}
