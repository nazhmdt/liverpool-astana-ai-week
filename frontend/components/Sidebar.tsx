"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, ShieldAlert, Map, FlaskConical, PanelLeftClose, PanelLeftOpen, User, LogOut } from "lucide-react";
import { Doctor } from "@/lib/api";
import { getSession, clearSession } from "@/lib/session";

// Grouped, not flat -- clinical work (what a doctor does every day) is
// visually separate from the model-validation showcase and from clinic-wide
// reporting, because those three pages answer different questions for
// different people and were getting confused for one "kitchen sink" menu.
const NAV_GROUPS = [
  {
    label: "Клиническая работа",
    items: [
      { href: "/", label: "Кабинет врача", icon: LayoutDashboard },
      { href: "/oncology-screening", label: "Онко-скрининг", icon: ShieldAlert },
    ],
  },
  {
    label: "Модель ИИ",
    items: [
      { href: "/imaging", label: "Валидация модели (51 случай)", icon: FlaskConical },
    ],
  },
  {
    label: "Отчётность",
    items: [
      { href: "/analytics", label: "Статистика клиники", icon: Map },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [doctor, setDoctor] = useState<Doctor | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("lp-sidebar-collapsed");
    if (saved === "1") setCollapsed(true);
    setDoctor(getSession());
  }, [pathname]);

  if (pathname === "/login") return null;

  function toggle() {
    setCollapsed((v) => {
      localStorage.setItem("lp-sidebar-collapsed", !v ? "1" : "0");
      return !v;
    });
  }

  function logout() {
    if (!window.confirm("Сменить врача? Текущая сессия будет закрыта.")) return;
    clearSession();
    router.push("/login");
  }

  return (
    <aside className={`shrink-0 sticky top-0 h-screen flex flex-col px-3 py-4 transition-[width] duration-200 ${collapsed ? "w-20" : "w-64"}`}>
      <div className="glass flex-1 flex flex-col overflow-hidden">
        <div className={`py-5 flex items-center gap-2.5 ${collapsed ? "px-3 justify-center" : "px-4"}`}>
          <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 shadow-[var(--shadow-sm)] bg-white">
            <img src="/logo.png" alt="LiverPool" className="w-full h-full object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-display font-bold text-[16px] tracking-tight text-[var(--text-primary)]">LiverPool</div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] truncate">ИИ-платформа для клиник</div>
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 space-y-4 overflow-y-auto scrollbar-thin">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <div className="px-3 mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
                  {group.label}
                </div>
              )}
              <div className="space-y-1">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      title={collapsed ? label : undefined}
                      className={`flex items-center gap-3 py-2.5 rounded-xl text-sm transition-all ${collapsed ? "px-0 justify-center" : "px-3"} ${
                        active
                          ? "btn-gradient font-medium"
                          : "text-[var(--text-muted)] hover:bg-white/50 hover:text-[var(--text-primary)] border border-transparent"
                      }`}
                    >
                      <Icon size={16} strokeWidth={2} className="shrink-0" />
                      {!collapsed && label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <button
          onClick={toggle}
          className={`mx-3 mb-2 flex items-center gap-2 py-2 rounded-lg text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/50 transition-colors ${collapsed ? "justify-center px-0" : "px-3"}`}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <><PanelLeftClose size={15} /> Свернуть меню</>}
        </button>

        {doctor && (
          <div className={`px-3 pb-3 pt-3 border-t border-[var(--border-soft)] ${collapsed ? "flex justify-center" : ""}`}>
            {collapsed ? (
              <div className="flex flex-col items-center gap-1.5">
                <div title={`${doctor.full_name} · Участок №${doctor.uchastok}`} className="w-9 h-9 rounded-full surface flex items-center justify-center">
                  <User size={15} className="text-[var(--primary-500)]" />
                </div>
                <button onClick={logout} title="Сменить врача" className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--risk-critical)] hover:bg-white/50 transition-colors">
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <div className="surface p-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[var(--primary-100)] flex items-center justify-center shrink-0">
                  <User size={14} className="text-[var(--primary-700)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{doctor.full_name}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Участок №{doctor.uchastok}</div>
                </div>
                <button onClick={logout} title="Сменить врача" className="text-[var(--text-muted)] hover:text-[var(--risk-critical)] transition-colors shrink-0">
                  <LogOut size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
