import React, { useState } from "react";
import {
  LayoutDashboard,
  FileText,
  Users,
  BarChart3,
  Settings,
  Bell,
  Search,
  Menu,
  X,
  LogOut,
  ChevronDown,
} from "lucide-react";
import logoLcc from "../../imports/logo-lcc.png";

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "applications", label: "Applications", icon: FileText },
  { id: "citizens", label: "Citizens", icon: Users },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

const PAGE_TITLES: Record<string, string> = {
  overview: "Dashboard",
  applications: "Applications",
  citizens: "Citizens",
  reports: "Reports",
  settings: "Settings",
};

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

  const SidebarBody = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-white/10">
        <img
          src={logoLcc}
          alt="LCC"
          className="h-9 w-9 object-contain rounded-lg bg-white p-0.5"
        />
        <div className="leading-tight">
          <p className="text-white text-sm font-semibold tracking-wide">LCC ADMIN</p>
          <p className="text-white/50 text-[11px]">Civil Registration</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                onTabChange(item.id);
                setMobileOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                active
                  ? "bg-white/15 text-white font-semibold"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              <Icon className="w-[18px] h-[18px]" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer / sign out */}
      <div className="px-3 py-4 border-t border-white/10">
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-white/70 hover:text-white hover:bg-white/10 transition-all"
        >
          <LogOut className="w-[18px] h-[18px]" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-[#F0F2F8] overflow-hidden">
      {/* ── Desktop sidebar ── */}
      <aside
        className="hidden lg:flex flex-col w-64 flex-shrink-0"
        style={{ background: "linear-gradient(180deg, #344EAD 0%, #1a2d7a 100%)" }}
      >
        {SidebarBody}
      </aside>

      {/* ── Mobile sidebar ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="absolute left-0 top-0 bottom-0 w-64 flex flex-col"
            style={{ background: "linear-gradient(180deg, #344EAD 0%, #1a2d7a 100%)" }}
          >
            <button
              className="absolute top-4 right-4 text-white/70 hover:text-white"
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
        {/* Topbar */}
        <header className="flex-shrink-0 h-16 bg-white border-b border-gray-100 flex items-center gap-3 px-4 lg:px-6">
          <button
            className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center text-gray-600 hover:bg-gray-100"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          <h1 className="text-lg font-semibold text-gray-800">
            {PAGE_TITLES[activeTab] ?? "Dashboard"}
          </h1>

          {/* Search */}
          <div className="hidden md:flex items-center gap-2 ml-6 flex-1 max-w-md">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 w-full">
              <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                placeholder="Search applications, citizens, ref no…"
                className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button className="relative w-9 h-9 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 flex items-center justify-center">
              <Bell className="w-4 h-4 text-gray-600" />
              <span
                className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                style={{ backgroundColor: "#F59E0B" }}
              />
            </button>

            <button className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-gray-100">
              <span className="w-8 h-8 rounded-lg bg-[#344EAD] text-white text-xs font-semibold flex items-center justify-center">
                AD
              </span>
              <span className="hidden sm:block text-left leading-tight">
                <span className="block text-sm font-medium text-gray-800">Admin</span>
                <span className="block text-[11px] text-gray-400">Registrar</span>
              </span>
              <ChevronDown className="hidden sm:block w-4 h-4 text-gray-400" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
