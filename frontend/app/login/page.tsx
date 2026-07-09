"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, ArrowRight, WifiOff } from "lucide-react";
import { api, Doctor } from "@/lib/api";
import { setSession } from "@/lib/session";
import { patientsRu } from "@/lib/plural";

export default function LoginPage() {
  const router = useRouter();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.listDoctors().then(setDoctors).catch(() => setError(true));
  }, []);

  function chooseDoctor(d: Doctor) {
    setSession(d);
    router.push("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-12 h-12 rounded-2xl overflow-hidden mb-4 shadow-[var(--shadow-md)] bg-white">
            <img src="/logo.png" alt="LiverPool" className="w-full h-full object-contain" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">LiverPool</h1>
          <p className="text-sm text-[var(--text-muted)] mt-2 max-w-[46ch]">
            Выберите свой профиль, чтобы открыть кабинет врача — вы увидите пациентов только своего участка.
          </p>
        </div>

        {error && (
          <div className="glass p-4 flex items-center gap-2 text-sm mb-4" style={{ borderColor: "var(--risk-critical)55" }}>
            <WifiOff size={16} style={{ color: "var(--risk-critical)" }} />
            Не удалось загрузить список врачей. Проверьте, что backend запущен.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {doctors.map((d, i) => (
            <button
              key={d.doctor_id}
              onClick={() => chooseDoctor(d)}
              className={`glass lift text-left p-4 flex items-center gap-3 float-in float-in-${Math.min((i % 4) + 1, 4)}`}
            >
              <div className="w-10 h-10 rounded-xl surface flex items-center justify-center shrink-0">
                <User size={18} className="text-[var(--primary-500)]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{d.full_name}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  Участок №{d.uchastok} &middot; {d.specialization} &middot; {d.patient_count ?? "…"}{" "}
                  {d.patient_count !== undefined ? patientsRu(d.patient_count) : "пациентов"}
                </div>
              </div>
              <ArrowRight size={15} className="text-[var(--text-muted)] shrink-0" />
            </button>
          ))}
        </div>

        <p className="text-[11px] text-[var(--text-muted)] text-center mt-8 max-w-[56ch] mx-auto">
          Демо-вход: выбор профиля без пароля, только для прототипа. В реальном внедрении — защищённая аутентификация
          и подтверждение личности врача поликлиникой.
        </p>
      </div>
    </div>
  );
}
