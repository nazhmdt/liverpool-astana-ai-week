import { LucideIcon } from "lucide-react";

export default function StatCard({
  label,
  value,
  sub,
  accent,
  icon: Icon,
  size = "md",
  gradient = false,
  className = "",
  onClick,
  active = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  icon?: LucideIcon;
  size?: "md" | "lg";
  gradient?: boolean;
  className?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const valueSize = size === "lg" ? "text-5xl md:text-6xl" : "text-2xl";
  const clickable = !!onClick;
  const interactiveProps = clickable
    ? {
        onClick,
        role: "button" as const,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } },
      }
    : {};

  if (gradient) {
    return (
      <div
        className={`gradient-primary rounded-2xl px-5 py-4 text-white relative overflow-hidden ${clickable ? "cursor-pointer lift" : ""} ${active ? "ring-2 ring-white/80" : ""} ${className}`}
        {...interactiveProps}
      >
        <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10" />
        <div className="absolute -right-2 -bottom-8 w-20 h-20 rounded-full bg-white/10" />
        <div className="relative">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] uppercase tracking-wider text-white/75">{label}</div>
            {Icon && <Icon size={16} className="text-white/70" />}
          </div>
          <div className={`stat-huge ${valueSize} text-white`}>{value}</div>
          {sub && <div className="text-xs text-white/75 mt-1.5">{sub}</div>}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`glass px-5 py-4 ${clickable ? "cursor-pointer lift" : ""} ${className}`}
      style={active ? { borderColor: accent, boxShadow: `0 0 0 1.5px ${accent}` } : undefined}
      {...interactiveProps}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
        {Icon && (
          <div className="surface w-7 h-7 flex items-center justify-center shrink-0">
            <Icon size={14} style={{ color: accent || "var(--text-muted)" }} />
          </div>
        )}
      </div>
      <div className={`stat-huge ${valueSize}`} style={{ color: accent || "var(--text-primary)" }}>
        {value}
      </div>
      {sub && <div className="text-xs text-[var(--text-muted)] mt-1.5">{sub}</div>}
    </div>
  );
}
