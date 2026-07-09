const LABELS_RU: Record<string, string> = {
  Critical: "Критический",
  High: "Высокий",
  Intermediate: "Средний",
  Low: "Низкий",
};

export default function RiskBadge({ category }: { category: string }) {
  return (
    <span className={`risk-pill ${category}`}>
      <span className="risk-dot" />
      {LABELS_RU[category] || category}
    </span>
  );
}
