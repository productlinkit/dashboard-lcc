import { useEffect, useMemo, useState } from "react";
import {
  Search, Bell, BellOff, AlertTriangle, CircleAlert, Info, CheckCheck, Check,
  Clock, CreditCard, ScrollText, Server, ShieldAlert, ArrowRight, Save, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  ALERTS, INITIAL_UNREAD, SEVERITY_META, CATEGORY_META, DEFAULT_RULES, relativeTime,
  type Alert, type Severity, type Category, type AlertRule,
} from "../data/alerts";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { Switch } from "../components/ui/switch";

const SEVERITY_ICON: Record<Severity, React.ComponentType<{ className?: string }>> = {
  critical: CircleAlert,
  warning: AlertTriangle,
  info: Info,
};

const CATEGORY_ICON: Record<Category, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  sla: Clock,
  payment: CreditCard,
  registry: ScrollText,
  system: Server,
  security: ShieldAlert,
};

const SEVERITY_OPTIONS = (Object.keys(SEVERITY_META) as Severity[]).map((s) => ({
  value: s, label: SEVERITY_META[s].label, color: SEVERITY_META[s].color,
}));
const CATEGORY_OPTIONS = (Object.keys(CATEGORY_META) as Category[]).map((c) => ({
  value: c, label: CATEGORY_META[c].label, color: CATEGORY_META[c].color,
}));

const TABS = [
  { id: "inbox", label: "Inbox" },
  { id: "rules", label: "Alert rules" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function Kpi({
  icon: Icon, label, value, sub, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number | string; sub: string; tone: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
      <span
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${tone}14`, color: tone }}
      >
        <Icon className="w-5 h-5" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-800 leading-tight">{value}</p>
        <p className="text-sm text-gray-600 truncate">{label}</p>
        <p className="text-xs text-gray-400 truncate">{sub}</p>
      </div>
    </div>
  );
}

export function AlertsPage({ onOpenCase }: { onOpenCase: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>("inbox");
  const [unread, setUnread] = useState<Set<string>>(new Set(INITIAL_UNREAD));
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [severities, setSeverities] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [limit, setLimit] = useState(20);

  const [rules, setRules] = useState<AlertRule[]>(DEFAULT_RULES);
  const [dirty, setDirty] = useState(false);

  const live = useMemo(() => ALERTS.filter((a) => !dismissed.has(a.id)), [dismissed]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return live.filter((a) => {
      if (severities.length && !severities.includes(a.severity)) return false;
      if (categories.length && !categories.includes(a.category)) return false;
      if (unreadOnly && !unread.has(a.id)) return false;
      if (q && !`${a.title} ${a.message} ${a.caseId ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [live, query, severities, categories, unreadOnly, unread]);

  useEffect(() => setLimit(20), [query, severities, categories, unreadOnly]);

  const visible = rows.slice(0, limit);
  const unreadCount = live.filter((a) => unread.has(a.id)).length;
  const criticalCount = live.filter((a) => a.severity === "critical").length;
  const slaCount = live.filter((a) => a.category === "sla").length;
  const todayCount = live.filter((a) => Date.now() - a.at < 86_400_000).length;

  function markRead(id: string) {
    setUnread((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function markAllRead() {
    if (unreadCount === 0) return;
    setUnread(new Set());
    toast.success(`${unreadCount} notification${unreadCount !== 1 ? "s" : ""} marked as read`);
  }

  function dismiss(a: Alert) {
    setDismissed((prev) => new Set(prev).add(a.id));
    markRead(a.id);
    toast.success("Notification dismissed", { description: a.title });
  }

  function openCase(a: Alert) {
    markRead(a.id);
    if (a.caseId) onOpenCase(a.caseId);
  }

  function updateRule(id: string, patch: Partial<AlertRule>) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty(true);
  }

  function updateChannel(id: string, channel: keyof AlertRule["channels"], value: boolean) {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, channels: { ...r.channels, [channel]: value } } : r)),
    );
    setDirty(true);
  }

  function saveRules() {
    const enabled = rules.filter((r) => r.enabled).length;
    setDirty(false);
    toast.success("Alert rules saved", { description: `${enabled} of ${rules.length} rules active.` });
  }

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Alerts &amp; Notifications</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            SLA breaches, payment problems, registry events and platform notices.
          </p>
        </div>
        {tab === "inbox" && (
          <button
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] disabled:opacity-40 disabled:cursor-not-allowed self-start sm:self-auto"
          >
            <CheckCheck className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi icon={Bell} label="Unread" value={unreadCount} sub={`${live.length} notifications in total`} tone="#3752AE" />
        <Kpi icon={CircleAlert} label="Critical" value={criticalCount} sub="Need action today" tone="#B91C1C" />
        <Kpi icon={Clock} label="SLA breaches" value={slaCount} sub="Cases past their stage target" tone="#B45309" />
        <Kpi icon={Info} label="Last 24 hours" value={todayCount} sub="New since yesterday" tone="#0F766E" />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm transition-colors ${
                  active ? "bg-[#3752AE] text-white font-semibold" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {t.label}
                {t.id === "inbox" && unreadCount > 0 && (
                  <span
                    className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                      active ? "bg-white/20 text-white" : "bg-[#3752AE] text-white"
                    }`}
                  >
                    {unreadCount}
                  </span>
                )}
                {t.id === "rules" && dirty && (
                  <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    Unsaved
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Inbox ── */}
      {tab === "inbox" && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex-1">
                <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search notifications or case reference…"
                  className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder:text-gray-400"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <MultiSelectFilter label="Severity" options={SEVERITY_OPTIONS} selected={severities} onChange={setSeverities} />
                <MultiSelectFilter label="Category" options={CATEGORY_OPTIONS} selected={categories} onChange={setCategories} />
                <button
                  onClick={() => setUnreadOnly(!unreadOnly)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium ${
                    unreadOnly ? "bg-[#3752AE] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <Bell className="w-4 h-4" /> Unread only
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">
                {rows.length} notification{rows.length !== 1 ? "s" : ""}
              </h2>
              <p className="text-sm text-gray-400">Newest first</p>
            </div>

            <div className="divide-y divide-gray-50">
              {visible.map((a) => {
                const sev = SEVERITY_META[a.severity];
                const cat = CATEGORY_META[a.category];
                const SevIcon = SEVERITY_ICON[a.severity];
                const CatIcon = CATEGORY_ICON[a.category];
                const isUnread = unread.has(a.id);
                return (
                  <div
                    key={a.id}
                    className={`flex gap-3 p-4 sm:p-5 transition-colors ${isUnread ? "bg-[#3752AE]/[0.03]" : ""} hover:bg-gray-50/60`}
                  >
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: sev.bg, color: sev.color }}
                    >
                      <SevIcon className="w-5 h-5" />
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {isUnread && <span className="w-2 h-2 rounded-full bg-[#3752AE] flex-shrink-0" />}
                        <p className={`text-sm ${isUnread ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>
                          {a.title}
                        </p>
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                          style={{ color: sev.color, backgroundColor: sev.bg }}
                        >
                          {sev.label}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          <CatIcon className="w-3 h-3" style={{ color: cat.color }} />
                          {cat.label}
                        </span>
                      </div>

                      <p className="text-sm text-gray-500 mt-1">{a.message}</p>

                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400">
                        <span>{relativeTime(a.at)}</span>
                        {a.actor && <span>· {a.actor}</span>}
                        {a.caseId && (
                          <button
                            onClick={() => openCase(a)}
                            className="inline-flex items-center gap-1 text-[#3752AE] font-medium hover:underline"
                          >
                            Open {a.caseId} <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-end sm:items-start gap-1.5 flex-shrink-0">
                      {isUnread && (
                        <button
                          onClick={() => markRead(a.id)}
                          title="Mark as read"
                          className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => dismiss(a)}
                        title="Dismiss"
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <BellOff className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {rows.length === 0 && (
                <div className="px-5 py-16 text-center">
                  <CheckCheck className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">
                    {live.length === 0 ? "Everything is dismissed — you're all caught up." : "No notifications match your filters."}
                  </p>
                </div>
              )}
            </div>

            {rows.length > visible.length && (
              <div className="px-5 py-3 border-t border-gray-100 text-center">
                <button
                  onClick={() => setLimit(limit + 20)}
                  className="text-sm font-medium text-[#3752AE] hover:underline"
                >
                  Load {Math.min(20, rows.length - visible.length)} more
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Rules ── */}
      {tab === "rules" && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Alert rules</h2>
              <p className="text-sm text-gray-400">
                What raises a notification, and where it is delivered. Thresholds apply from the next evaluation.
              </p>
            </div>

            <div className="divide-y divide-gray-50">
              {rules.map((r) => {
                const sev = SEVERITY_META[r.severity];
                return (
                  <div key={r.id} className="p-5 flex flex-col xl:flex-row xl:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold ${r.enabled ? "text-gray-800" : "text-gray-400"}`}>
                          {r.label}
                        </p>
                        <span
                          className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                          style={{ color: sev.color, backgroundColor: sev.bg }}
                        >
                          {sev.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{r.description}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-5">
                      {r.threshold != null && (
                        <label className="text-xs text-gray-400 block">
                          Threshold
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              type="number"
                              min="1"
                              value={r.threshold}
                              disabled={!r.enabled}
                              onChange={(e) => updateRule(r.id, { threshold: Number(e.target.value) })}
                              className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 outline-none focus:border-[#3752AE] disabled:opacity-50"
                            />
                            <span className="text-xs text-gray-500 whitespace-nowrap">{r.unit}</span>
                          </div>
                        </label>
                      )}

                      <div className="text-xs text-gray-400">
                        Delivery
                        <div className="flex items-center gap-3 mt-1.5">
                          {([
                            { key: "inApp", label: "In-app" },
                            { key: "email", label: "Email" },
                            { key: "sms", label: "SMS" },
                          ] as const).map((c) => (
                            <label key={c.key} className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={r.channels[c.key]}
                                disabled={!r.enabled}
                                onChange={(e) => updateChannel(r.id, c.key, e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 accent-[#3752AE] cursor-pointer disabled:opacity-50"
                              />
                              <span className={`text-sm ${r.enabled ? "text-gray-600" : "text-gray-400"}`}>{c.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 xl:pl-2">
                        <Switch checked={r.enabled} onCheckedChange={(v) => updateRule(r.id, { enabled: v })} />
                        <span className={`text-sm font-medium ${r.enabled ? "text-gray-700" : "text-gray-400"}`}>
                          {r.enabled ? "On" : "Off"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-gray-500">
              {dirty
                ? "You have unsaved changes to the alert rules."
                : `${rules.filter((r) => r.enabled).length} of ${rules.length} rules are active.`}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setRules(DEFAULT_RULES);
                  setDirty(false);
                  toast.info("Alert rules reverted");
                }}
                disabled={!dirty}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4" /> Revert
              </button>
              <button
                onClick={saveRules}
                disabled={!dirty}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" /> Save rules
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
