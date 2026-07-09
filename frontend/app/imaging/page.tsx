"use client";

import { Suspense } from "react";
import { ScanEye } from "lucide-react";
import ClinicalCasesPanel from "@/components/ClinicalCasesPanel";
import RealDataValidation from "@/components/RealDataValidation";

export default function ImagingPage() {
  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2.5">
          <ScanEye size={22} className="text-[var(--primary-500)]" />
          Валидация модели КТ-анализа
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1 max-w-[72ch]">
          Кому и зачем: эта страница — не рабочий инструмент на приёме, а ответ на вопрос &laquo;а вы вообще
          проверяли модель на данных, которые она раньше не видела?&raquo;. Здесь — все 51 случай из тестовой
          части датасета LiTS (не участвовавшие в обучении), по каждому — снимок, вердикт ИИ и разметка врача
          рядом, и Accuracy/Sensitivity/Specificity, честно посчитанные по этим случаям, а не заявленные.
          Профильному врачу или комиссии, которая принимает решение — доверять ли системе — эта страница
          отвечает: <strong>на какой выборке проверено и с каким результатом</strong>. Участковому врачу на
          приёме она не нужна — там КТ-данные того же случая показаны прямо в карточке пациента, без похода
          сюда.
        </p>
      </header>

      <Suspense fallback={<div className="glass p-5 text-sm text-[var(--text-muted)]">Загрузка…</div>}>
        <ClinicalCasesPanel />
      </Suspense>

      <div className="mt-6">
        <RealDataValidation />
      </div>
    </div>
  );
}
