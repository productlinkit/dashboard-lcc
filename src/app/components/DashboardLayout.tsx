import React, { useMemo, useState } from "react";
import {
  LayoutDashboard,
  FileText,
  ClipboardCheck,
  ScrollText,
  Users,
  ShieldAlert,
  Banknote,
  BarChart3,
  Map,
  Bell,
  Settings,
  Menu,
  X,
  LogOut,
  Mail,
} from "lucide-react";
import logoLcc from "../../imports/logo-lcc.png";
import { applications } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import { useSession } from "../api/session";
import { text } from "../api/types";

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Access module that guards the entry — hidden when the role cannot reach it. */
  module: string;
  badge?: number;
}

/* Statuses still moving through the pipeline — the Applications badge. */
const OPEN_STATUSES = new Set(["draft", "submitted", "certified", "under-review", "returned"]);
/* Waiting on an approver — the Approval Queue badge. */
const APPROVAL_STATUSES = new Set(["certified", "under-review"]);

export const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
  { id: "applications", label: "Applications", icon: FileText, module: "intake" },
  { id: "approval-queue", label: "Approval Queue", icon: ClipboardCheck, module: "approval" },
  { id: "civil-registration", label: "Civil Registration", icon: ScrollText, module: "case-detail" },
  { id: "population", label: "Population & Households", icon: Users, module: "family-book" },
  { id: "watchlist", label: "Watchlist Search", icon: ShieldAlert, module: "registry-search" },
  { id: "payments", label: "Payments & Revenue", icon: Banknote, module: "payments" },
  { id: "reports", label: "Reports & Analytics", icon: BarChart3, module: "reporting" },
  { id: "gis-map", label: "GIS Map", icon: Map, module: "registry-search" },
  { id: "alerts", label: "Alerts & Notifications", icon: Bell, module: "dashboard" },
  { id: "settings", label: "Administration / Settings", icon: Settings, module: "user-admin" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "Ban Salakham · Hadxaifong · Vientiane Capital", narrowest first. */
function jurisdictionLabel(j: {
  village_name?: string;
  district_name?: string;
  province_name?: string;
}): string {
  return [j.village_name, j.district_name, j.province_name].filter(Boolean).join(" · ");
}

export function DashboardLayout({
  activeTab,
  onTabChange,
  onSignOut,
  children,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onSignOut?: () => void;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, can } = useSession();

  // The two sidebar badges are the only figures the shell owns; one summary call
  // covers both and stays inside the caller's jurisdiction.
  const { data: summary } = useQuery((signal) => applications.summary(undefined, signal), []);

  const items = useMemo(() => {
    const byStatus: unknown[] = summary?.by_status ?? [];
    // The API names the bucket size `total`; older builds send `count`.
    const countOf = (set: Set<string>) =>
      byStatus.reduce<number>((sum, row) => {
        const r = row as { status?: string; count?: number; total?: number };
        return sum + (r.status && set.has(r.status) ? r.count ?? r.total ?? 0 : 0);
      }, 0);
    const open = countOf(OPEN_STATUSES);
    const approval = countOf(APPROVAL_STATUSES);

    return NAV_ITEMS.filter((item) => can(item.module)).map((item) => {
      if (item.id === "applications" && open > 0) return { ...item, badge: open };
      if (item.id === "approval-queue" && approval > 0) return { ...item, badge: approval };
      return item;
    });
  }, [summary, can]);

  const roleName = text(user?.role_name);
  const jurisdiction = jurisdictionLabel(user?.jurisdiction ?? {});

  const SidebarBody = (
    <div className="flex flex-col h-full p-4">
      {/* Brand */}
      <div className="flex items-center gap-3 px-1.5 pb-4 border-b border-gray-100">
        <img src={logoLcc} alt="LCC" className="h-10 w-10 object-contain rounded-xl bg-white ring-1 ring-gray-100 p-0.5" />
        <div className="leading-tight">
          <p className="text-gray-800 text-[15px] font-bold">Lao Citizen Center</p>
          <p className="text-gray-400 text-[11px] tracking-wide">CIVIL REGISTRATION · ADMIN</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                onTabChange(item.id);
                setMobileOpen(false);
              }}
              title={item.label}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                active
                  ? "text-white font-semibold shadow-md shadow-[#3752AE]/20"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
              style={active ? { background: "linear-gradient(90deg, #3752AE 0%, #2c428b 100%)" } : undefined}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              <span className="flex-1 text-left truncate">{item.label}</span>
              {item.badge != null && (
                <span
                  className={`flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    active ? "bg-white/20 text-white" : "bg-[#3752AE] text-white"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Profile + sign out */}
      <div className="pt-3 border-t border-gray-100">
        <div className="flex items-center gap-3 px-1.5 py-2">
          <span className="w-9 h-9 rounded-full bg-[#3752AE] text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">
            {initials(user?.name ?? "")}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate" title={user?.name}>
              {user?.name ?? "—"}
            </p>
            <p className="text-[11px] text-gray-400 flex items-center gap-1 truncate" title={user?.email}>
              <Mail className="w-3 h-3 flex-shrink-0" /> {user?.email ?? ""}
            </p>
          </div>
        </div>
        <div className="px-1.5 pb-2 space-y-0.5">
          {roleName && (
            <p className="text-[11px] text-[#3752AE] font-medium truncate" title={roleName}>
              {roleName}
            </p>
          )}
          {user?.office_name && (
            <p className="text-[11px] text-gray-400 truncate" title={user.office_name}>
              {user.office_name}
            </p>
          )}
          <p className="text-[11px] text-gray-400 truncate" title={jurisdiction || "National jurisdiction"}>
            {jurisdiction || "National jurisdiction"}
          </p>
        </div>
        <button
          onClick={onSignOut}
          className="mt-1 w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-[#3752AE] font-medium hover:bg-[#3752AE]/5 transition-all"
        >
          <LogOut className="w-[18px] h-[18px]" />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-[#F0F2F8] overflow-hidden">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex flex-col w-64 flex-shrink-0 m-3 mr-0 bg-white rounded-2xl shadow-sm">
        {SidebarBody}
      </aside>

      {/* ── Mobile sidebar ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-xl">
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"
              onClick={() => setMobileOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
            {SidebarBody}
          </aside>
        </div>
      )}

      {/* ── Main column ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 h-14 px-4 bg-white border-b border-gray-100">
          <button
            className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-600 hover:bg-gray-100"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <img src={logoLcc} alt="LCC" className="h-7 w-7 object-contain" />
          <span className="text-sm font-semibold text-gray-800">Lao Citizen Center</span>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-3 lg:p-5">{children}</main>
      </div>
    </div>
  );
}
