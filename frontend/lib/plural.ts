// Russian plural forms depend on the last two digits of the number, not just
// the last one (11-14 are always "many", unlike 1/2-4 elsewhere) -- a plain
// template string like `${n} документов` reads as a typo to any Russian
// speaker for n=1, 21, 41, 101...
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function patientsRu(n: number): string {
  return pluralRu(n, "пациент", "пациента", "пациентов");
}

export function documentsRu(n: number): string {
  return pluralRu(n, "документ", "документа", "документов");
}
