import { useEffect, useMemo, useState } from "react";
import {
  Search, Bell, BellOff, AlertTriangle, CircleAlert, Info, CheckCheck, Check,
  Clock, CreditCard, ScrollText, Server, ShieldAlert, ArrowRight, Save, RotateCcw, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { alerts as alertsApi } from "../api/endpoints";
import { useDebounced, useQuery } from "../api/hooks";
import { text, type Alert as WireAlert, type AlertRule } from "../api/types";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { Switch } from "../components/ui/switch";

/*
 * Alerts & Notifications (PRD §11) — SLA breaches, payment problems, registry
 * events and platform notices.
 *
 * Everything on this screen is served by /admin/alerts: the inbox is filtered
 * and paged by the API, the header counts come from its summary, and the rules
 * tab reads and writes /admin/alert-rules. Acknowledging is "read"; resolving is
 * "dismiss" — both are recorded server-side rather than kept in this tab.
 */

type Severity = "critical" | "warning" | "info";
type Category = "sla" | "payment" | "registry" | "system" | "security";

const SEVERITY_META: Record<Severity, { label: string; color: string; bg: string }> = {
  critical: { label: "Critical", color: "#B91C1C", bg: "#FEE2E2" },
  warning: { label: "Warning", color: "#B45309", bg: "#FEF3C7" },
  info: { label: "Info", color: "#1D4ED8", bg: "#DBEAFE" },
};

const CATEGORY_META: Record<Category, { label: string; color: string }> = {
  sla: { label: "SLA & overdue", color: "#B45309" },
  payment: { label: "Payments", color: "#047857" },
  registry: { label: "Registry", color: "#6D28D9" },
  system: { label: "System", color: "#3752AE" },
  security: { label: "Security", color: "#B91C1C" },
};

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

const PAGE_SIZE = 20;

/* ── Wire shapes wider than the shared types ──────────────────────────────── */

type Alert = WireAlert & {
  acknowledged?: boolean;
  resolved?: boolean;
  acknowledge_at?: string;
};

interface ServerAlertSummary {
  total?: number;
  unacknowledged?: number;
  last_24h?: number;
  critical?: number;
  warning?: number;
  info?: number;
  sla?: number;
  by_severity?: Record<string, number> | Array<{ severity: string; count: number }>;
  by_category?: Record<string, number> | Array<{ category: string; count: number }>;
}

/** The summary sends its breakdowns as a map; older builds sent a list. */
function bucket(block: unknown, key: string): number {
  if (!block) return 0;
  if (Array.isArray(block)) {
    const rows = block as Array<{ severity?: string; category?: string; count?: number }>;
    const row = rows.find((r) => r.severity === key || r.category === key);
    return row?.count ?? 0;
  }
  return (block as Record<string, number>)[key] ?? 0;
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return "";
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return "";
  const diff = Math.max(0, Date.now() - at);
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(diff / 3_600_000);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(diff / 86_400_000);
  if (days < 30) return `${days}d ago`;
  return iso.slice(0, 10);
}

function isUnread(a: Alert): boolean {
  return a.acknowledged === false || (a.acknowledged === undefined && !a.acknowledged_at);
}

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
  const [query, setQuery] = useState("");
  const search = useDebounced(query, 350);
  const [severities, setSeverities] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [busyId, setBusyId] = useState<string | null>(null);

  /* Rules are edited locally and saved as a batch, so the tab keeps a draft. */
  const [draft, setDraft] = useState<Record<string, AlertRule>>({});
  const [saving, setSaving] = useState(false);

  const severityKey = severities.join(",");
  const categoryKey = categories.join(",");

  const filters = useMemo(
    () => ({
      severity: severities,
      category: categories,
      acknowledged: unreadOnly ? false : undefined,
      search: search.trim() || undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [severityKey, categoryKey, unreadOnly, search],
  );

  const summary = useQuery(
    (signal) => alertsApi.summary({ ...filters }, signal) as unknown as Promise<ServerAlertSummary>,
    [severityKey, categoryKey, unreadOnly, search],
  );

  const list = useQuery(
    (signal) => alertsApi.list({ ...filters, page: 1, per_page: limit, sort: "-raised" }, signal),
    [severityKey, categoryKey, unreadOnly, search, limit],
  );

  const rules = useQuery((signal) => alertsApi.rules(signal), [], { enabled: tab === "rules" });

  useEffect(() => setLimit(PAGE_SIZE), [severityKey, categoryKey, unreadOnly, search]);

  const rows = (list.data?.data ?? []) as Alert[];
  const total = list.data?.meta.total ?? 0;

  const unreadCount = summary.data?.unacknowledged ?? 0;
  const criticalCount = summary.data?.critical ?? bucket(summary.data?.by_severity, "critical");
  const slaCount = summary.data?.sla ?? bucket(summary.data?.by_category, "sla");
  const todayCount = summary.data?.last_24h ?? 0;
  const totalCount = summary.data?.total ?? total;

  function refetchInbox() {
    summary.refetch();
    list.refetch();
  }

  async function markRead(a: Alert) {
    setBusyId(a.id);
    try {
      await alertsApi.acknowledge(a.id);
      refetchInbox();
    } catch (err) {
      toast.error("Could not mark as read", { description: (err as Error).message });
    } finally {
      setBusyId(null);
    }
  }

  async function markAllRead() {
    if (unreadCount === 0) return;
    try {
      await alertsApi.acknowledgeAll();
      toast.success(`${unreadCount} notification${unreadCount !== 1 ? "s" : ""} marked as read`);
      refetchInbox();
    } catch (err) {
      toast.error("Could not mark everything as read", { description: (err as Error).message });
    }
  }

  async function dismiss(a: Alert) {
    setBusyId(a.id);
    try {
      await alertsApi.resolve(a.id);
      toast.success("Notification dismissed", { description: a.title });
      refetchInbox();
    } catch (err) {
      toast.error("Could not dismiss", { description: (err as Error).message });
    } finally {
      setBusyId(null);
    }
  }

  function openCase(a: Alert) {
    const target = a.application_id || a.case_ref;
    if (!target) return;
    if (isUnread(a)) void markRead(a);
    onOpenCase(target);
  }

  /* ── Rules ─────────────────────────────────────────────────────────────── */

  const ruleList = useMemo(
    () => (rules.data ?? []).map((r) => draft[r.code] ?? r),
    [rules.data, draft],
  );
  const dirty = Object.keys(draft).length > 0;

  function editRule(rule: AlertRule, patch: Partial<AlertRule>) {
    setDraft((prev) => ({ ...prev, [rule.code]: { ...(prev[rule.code] ?? rule), ...patch } }));
  }

  function editChannel(rule: AlertRule, channel: keyof AlertRule["channels"], value: boolean) {
    const current = draft[rule.code] ?? rule;
    editRule(rule, { channels: { ...current.channels, [channel]: value } });
  }

  async function saveRules() {
    const changed = Object.values(draft);
    if (!changed.length) return;
    setSaving(true);
    try {
      for (const r of changed) {
        await alertsApi.updateRule(r.code, {
          enabled: r.enabled,
          threshold: r.threshold ?? null,
          severity: r.severity,
          channels: r.channels,
        });
      }
      setDraft({});
      const active = ruleList.filter((r) => r.enabled).length;
      toast.success("Alert rules saved", { description: `${active} of ${ruleList.length} rules active.` });
      rules.refetch();
    } catch (err) {
      toast.error("Could not save the alert rules", { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
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
            onClick={() => void markAllRead()}
            disabled={unreadCount === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] disabled:opacity-40 disabled:cursor-not-allowed self-start sm:self-auto"
          >
            <CheckCheck className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi icon={Bell} label="Unread" value={summary.loading ? "—" : unreadCount} sub={`${totalCount} notifications in total`} tone="#3752AE" />
        <Kpi icon={CircleAlert} label="Critical" value={summary.loading ? "—" : criticalCount} sub="Need action today" tone="#B91C1C" />
        <Kpi icon={Clock} label="SLA breaches" value={summary.loading ? "—" : slaCount} sub="Cases past their stage target" tone="#B45309" />
        <Kpi icon={Info} label="Last 24 hours" value={summary.loading ? "—" : todayCount} sub="New since yesterday" tone="#0F766E" />
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
                {total} notification{total !== 1 ? "s" : ""}
              </h2>
              <p className="text-sm text-gray-400">Newest first</p>
            </div>

            <div className="divide-y divide-gray-50">
              {rows.map((a) => {
                const sev = SEVERITY_META[a.severity as Severity] ?? SEVERITY_META.info;
                const cat = CATEGORY_META[a.category as Category] ?? CATEGORY_META.system;
                const SevIcon = SEVERITY_ICON[a.severity as Severity] ?? Info;
                const CatIcon = CATEGORY_ICON[a.category as Category] ?? Server;
                const unread = isUnread(a);
                const busy = busyId === a.id;
                return (
                  <div
                    key={a.id}
                    className={`flex gap-3 p-4 sm:p-5 transition-colors ${unread ? "bg-[#3752AE]/[0.03]" : ""} hover:bg-gray-50/60`}
                  >
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: sev.bg, color: sev.color }}
                    >
                      <SevIcon className="w-5 h-5" />
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {unread && <span className="w-2 h-2 rounded-full bg-[#3752AE] flex-shrink-0" />}
                        <p className={`text-sm ${unread ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>
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
                        <span>{a.relative_time || relativeTime(a.raised_at)}</span>
                        {a.actor && <span>· {a.actor}</span>}
                        {a.case_ref && (
                          <button
                            onClick={() => openCase(a)}
                            className="inline-flex items-center gap-1 text-[#3752AE] font-medium hover:underline"
                          >
                            Open {a.case_ref} <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-end sm:items-start gap-1.5 flex-shrink-0">
                      {unread && (
                        <button
                          onClick={() => void markRead(a)}
                          disabled={busy}
                          title="Mark as read"
                          className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
                        >
                          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                      )}
                      <button
                        onClick={() => void dismiss(a)}
                        disabled={busy}
                        title="Dismiss"
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
                      >
                        <BellOff className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {list.loading && (
                <div className="px-5 py-16 text-center">
                  <Loader2 className="w-8 h-8 text-gray-300 mx-auto mb-2 animate-spin" />
                  <p className="text-sm text-gray-400">Loading notifications…</p>
                </div>
              )}

              {!list.loading && list.error && (
                <div className="px-5 py-16 text-center">
                  <AlertTriangle className="w-8 h-8 text-red-300 mx-auto mb-2" />
                  <p className="text-sm text-red-600 mb-3">{list.error.message}</p>
                  <button
                    onClick={list.refetch}
                    className="px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    Retry
                  </button>
                </div>
              )}

              {!list.loading && !list.error && rows.length === 0 && (
                <div className="px-5 py-16 text-center">
                  <CheckCheck className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">
                    {severities.length || categories.length || unreadOnly || search.trim()
                      ? "No notifications match your filters."
                      : "Nothing has been raised — you're all caught up."}
                  </p>
                </div>
              )}
            </div>

            {rows.length > 0 && rows.length < total && (
              <div className="px-5 py-3 border-t border-gray-100 text-center">
                <button
                  onClick={() => setLimit(limit + PAGE_SIZE)}
                  className="text-sm font-medium text-[#3752AE] hover:underline"
                >
                  Load {Math.min(PAGE_SIZE, total - rows.length)} more
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
              {ruleList.map((r) => {
                const sev = SEVERITY_META[r.severity as Severity] ?? SEVERITY_META.info;
                return (
                  <div key={r.code} className="p-5 flex flex-col xl:flex-row xl:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold ${r.enabled ? "text-gray-800" : "text-gray-400"}`}>
                          {text(r.label)}
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
                              onChange={(e) => editRule(r, { threshold: Number(e.target.value) })}
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
                            { key: "in_app", label: "In-app" },
                            { key: "email", label: "Email" },
                            { key: "sms", label: "SMS" },
                          ] as const).map((c) => (
                            <label key={c.key} className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={r.channels?.[c.key] ?? false}
                                disabled={!r.enabled}
                                onChange={(e) => editChannel(r, c.key, e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 accent-[#3752AE] cursor-pointer disabled:opacity-50"
                              />
                              <span className={`text-sm ${r.enabled ? "text-gray-600" : "text-gray-400"}`}>{c.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 xl:pl-2">
                        <Switch checked={r.enabled} onCheckedChange={(v) => editRule(r, { enabled: v })} />
                        <span className={`text-sm font-medium ${r.enabled ? "text-gray-700" : "text-gray-400"}`}>
                          {r.enabled ? "On" : "Off"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {rules.loading && (
                <div className="px-5 py-16 text-center">
                  <Loader2 className="w-8 h-8 text-gray-300 mx-auto mb-2 animate-spin" />
                  <p className="text-sm text-gray-400">Loading alert rules…</p>
                </div>
              )}

              {!rules.loading && rules.error && (
                <div className="px-5 py-16 text-center">
                  <AlertTriangle className="w-8 h-8 text-red-300 mx-auto mb-2" />
                  <p className="text-sm text-red-600 mb-3">{rules.error.message}</p>
                  <button
                    onClick={rules.refetch}
                    className="px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    Retry
                  </button>
                </div>
              )}

              {!rules.loading && !rules.error && ruleList.length === 0 && (
                <div className="px-5 py-16 text-center">
                  <p className="text-sm text-gray-400">No alert rules are configured.</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-gray-500">
              {dirty
                ? "You have unsaved changes to the alert rules."
                : `${ruleList.filter((r) => r.enabled).length} of ${ruleList.length} rules are active.`}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setDraft({});
                  rules.refetch();
                  toast.info("Alert rules reverted");
                }}
                disabled={!dirty || saving}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4" /> Revert
              </button>
              <button
                onClick={() => void saveRules()}
                disabled={!dirty || saving}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save rules
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
