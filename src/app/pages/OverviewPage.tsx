import {
  Banknote,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Wifi,
  Send,
  AlertTriangle,
  Loader2,
  RefreshCw,
  FileText,
  type LucideIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useMemo, useState } from "react";
import { SERVICE_BY_ID, formatLak } from "../serviceConfig";
import { StatusBadge } from "../components/StatusBadge";
import { LaosMap } from "../components/LaosMap";
import { DateRangeFilter, ALL_TIME, type DateRange } from "../components/DateRangeFilter";
import {
  PerServicePanel,
  SlaTracker,
  PipelineFunnel,
  ActivityFeed,
  type ServiceRow,
} from "../components/OverviewWidgets";
import { applications, dashboard } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import { text, type Bilingual } from "../api/types";
import type { ApiError } from "../api/client";
import type { AppStatus } from "../data/mockData";

/* The analytics rows this page reads, as the Go handlers actually send them. */
interface ProvinceRow {
  province_id?: string;
  province?: Bilingual;
  geo_name?: string;
  count?: number;
}
interface ShareRow {
  service_code: string;
  label?: Bilingual;
  short_name?: string;
  color?: string;
  count?: number;
  issued?: number;
  in_progress?: number;
  rejected?: number;
  revenue_lak?: number;
}
interface SlaServiceRow {
  service_code: string;
  target_days?: number;
  closed_cases?: number;
  on_time_pct?: number;
  breached?: number;
}
interface StatusRow {
  status: string;
  count?: number;
}

/* Registration breakdown — the nine case statuses grouped into four buckets, so
 * a slice always says which statuses it covers. Values come from the same KPI
 * split as the cards, so donut and cards can never disagree.
 * Palette validated for CVD separation (dataviz six checks — ALL PASS). */
interface RegGroup {
  name: string;
  statuses: string[];
  color: string;
  key: "issued" | "awaiting" | "submitted" | "needs";
}

const REG_GROUPS: RegGroup[] = [
  { key: "issued", name: "Completed", statuses: ["Registered / Signed", "Issued"], color: "#10B981" },
  { key: "awaiting", name: "Awaiting action", statuses: ["Certified", "Under Review"], color: "#3752AE" },
  { key: "submitted", name: "Newly submitted", statuses: ["Draft", "Submitted"], color: "#0EA5E9" },
  { key: "needs", name: "Needs correction", statuses: ["Returned", "Rejected", "Revoked"], color: "#C2410C" },
];

export interface RegSlice extends RegGroup {
  count: number;
  pct: number;
}

function regBreakdown(parts: Record<RegGroup["key"], number>, total: number): RegSlice[] {
  return REG_GROUPS.map((g) => ({
    ...g,
    count: parts[g.key],
    pct: total > 0 ? Math.round((parts[g.key] / total) * 100) : 0,
  }));
}

/* Keeps y-axis ticks short so they always fit the gutter (1200 → "1.2K"). */
function compactNumber(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

const RECEIVED_COLOR = "#3752AE";
const COMPLETED_COLOR = "#10B981";

export interface TrendPoint {
  label: string;
  received: number;
  completed: number;
}

/* Which volume series answers the selected range: a short window is read day by
 * day, a long one month by month, so the bars never collapse into a hairline. */
type Granularity = "day" | "week" | "month";

function spanDays(range: DateRange): number | null {
  if (!range.from || !range.to) return null;
  const from = new Date(`${range.from}T00:00:00`).getTime();
  const to = new Date(`${range.to}T00:00:00`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(1, Math.round((to - from) / 86_400_000) + 1);
}

function granularityFor(range: DateRange): Granularity {
  const span = spanDays(range);
  if (span === null) return "month";
  if (span <= 7) return "week";
  if (span <= 92) return "day";
  return "month";
}

/* Deltas are real period-on-period changes, so they can be negative. */
function deltaLabel(pct: number | undefined): string {
  const d = pct ?? 0;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
}

function DeltaBadge({ value, onDark = false }: { value: string; onDark?: boolean }) {
  const down = value.startsWith("-");
  const Icon = down ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
        onDark ? "bg-white/20 text-white" : down ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {value}
    </span>
  );
}

function KpiBig({
  filled,
  label,
  value,
  delta,
  note,
}: {
  filled?: boolean;
  label: string;
  value: string;
  delta: string;
  note?: string;
}) {
  return (
    <div
      className={`rounded-2xl p-5 shadow-sm ${filled ? "text-white" : "bg-white border border-gray-100 text-gray-800"}`}
      style={filled ? { background: "linear-gradient(135deg, #3752AE 0%, #2c428b 100%)" } : undefined}
    >
      <p className={`text-sm ${filled ? "text-white/80" : "text-gray-500"}`}>{label}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
      {note && <p className={`text-xs mt-1 ${filled ? "text-white/70" : "text-gray-400"}`}>{note}</p>}
      <div className="flex items-center gap-2 mt-3">
        <DeltaBadge value={delta} onDark={filled} />
        <span className={`text-xs ${filled ? "text-white/70" : "text-gray-400"}`}>vs previous period</span>
      </div>
    </div>
  );
}

/* `filled` gives the card a solid tinted background — used for Fees collected so
 * it reads as a companion to the filled Total applications card above it. */
function KpiSmall({
  icon: Icon, label, value, tint, sub, filled = false,
}: {
  icon: LucideIcon; label: string; value: string; tint: string; sub: string; filled?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-5 shadow-sm ${filled ? "text-white" : "bg-white border border-gray-100"}`}
      style={filled ? { background: `linear-gradient(135deg, ${tint} 0%, #047857 100%)` } : undefined}
    >
      <div className="flex items-center gap-3">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: filled ? "rgba(255,255,255,0.2)" : `${tint}1A` }}
        >
          <Icon className="w-5 h-5" style={{ color: filled ? "#ffffff" : tint } as React.CSSProperties} />
        </span>
        <p className={`text-sm ${filled ? "text-white/80" : "text-gray-500"}`}>{label}</p>
      </div>
      <p className={`text-2xl font-bold mt-3 ${filled ? "text-white" : "text-gray-800"}`}>{value}</p>
      <p className={`text-xs mt-0.5 ${filled ? "text-white/70" : "text-[#3752AE]"}`}>{sub}</p>
    </div>
  );
}

/* One inline load / fail / empty block, in the card's own visual style. */
function CardState({
  loading,
  error,
  onRetry,
  empty,
  emptyText,
}: {
  loading?: boolean;
  error?: ApiError;
  onRetry?: () => void;
  empty?: boolean;
  emptyText: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-red-600">{error.message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        )}
      </div>
    );
  }
  if (empty) return <div className="py-12 text-center text-sm text-gray-400">{emptyText}</div>;
  return null;
}

/* The open statuses the "needs action" table lists. */
const NEEDS_ACTION_STATUSES = ["submitted", "certified", "under-review", "returned"];

export function OverviewPage({ onOpenCase }: { onOpenCase: (id: string) => void }) {
  const [dateRange, setDateRange] = useState<DateRange>(ALL_TIME);
  // The map doubles as the location filter: picking a province narrows every
  // figure on the page to that jurisdiction.
  const [province, setProvince] = useState<string | null>(null);

  const granularity = granularityFor(dateRange);

  const provinceStatsQuery = useQuery(
    (signal) => dashboard.provinceStats({ date_from: dateRange.from, date_to: dateRange.to }, signal),
    [dateRange.from, dateRange.to],
  );
  const provinces = useMemo(
    () => unwrap<ProvinceRow>(provinceStatsQuery.data, "provinces"),
    [provinceStatsQuery.data],
  );
  const provinceId = useMemo(
    () => provinces.find((p) => (p.geo_name ?? text(p.province)) === province)?.province_id,
    [provinces, province],
  );

  /* Every request carries the same four filter parameters. */
  const filters = useMemo(
    () => ({ date_from: dateRange.from, date_to: dateRange.to, province_id: provinceId }),
    [dateRange.from, dateRange.to, provinceId],
  );
  const deps = [filters.date_from, filters.date_to, filters.province_id];

  const kpiQuery = useQuery((signal) => dashboard.kpis(filters, signal), deps);
  const volumeQuery = useQuery(
    (signal) =>
      granularity === "week"
        ? dashboard.volumeWeekly(filters, signal)
        : granularity === "day"
          ? dashboard.volumeDaily(filters, signal)
          : dashboard.volumeMonthly(filters, signal),
    [...deps, granularity],
  );
  const shareQuery = useQuery((signal) => dashboard.serviceShare(filters, signal), deps);
  const slaQuery = useQuery((signal) => dashboard.sla(filters, signal), deps);
  const statusQuery = useQuery((signal) => dashboard.statusBreakdown(filters, signal), deps);
  const activityQuery = useQuery((signal) => dashboard.recentActivity({ ...filters, per_page: 6 }, signal), deps);
  const needsActionQuery = useQuery(
    (signal) =>
      applications.list(
        { ...filters, status: NEEDS_ACTION_STATUSES, per_page: 8, page: 1, sort: "-submitted_at" },
        signal,
      ),
    deps,
  );

  /* ── KPI tiles ── */
  const kpis = kpiQuery.data;
  const parts = {
    issued: kpis?.issued.value ?? 0,
    awaiting: kpis?.awaiting_action.value ?? 0,
    submitted: kpis?.submitted.value ?? 0,
    needs: kpis?.needs_correction.value ?? 0,
  };
  const total = kpis?.total_applications.value ?? 0;
  const reg = regBreakdown(parts, total || parts.issued + parts.awaiting + parts.submitted + parts.needs);
  const feesLak = kpis?.revenue_lak.value_lak ?? kpis?.revenue_lak.value ?? 0;
  const sub = !dateRange.from && !dateRange.to ? "all time" : "in selected period";

  /* ── Trend chart ── */
  const trendPoints: TrendPoint[] = useMemo(
    () =>
      (volumeQuery.data ?? []).map((p) => ({
        label: p.day ?? p.month ?? (p.date ? p.date.slice(5) : ""),
        received: p.applications ?? 0,
        completed: p.issued ?? 0,
      })),
    [volumeQuery.data],
  );
  const useBars = trendPoints.length <= 14;

  /* ── Per-service rows: share joined to the SLA table by service code ── */
  const services: ServiceRow[] = useMemo(() => {
    const share = unwrap<ShareRow>(shareQuery.data, "services");
    const slaByCode = new Map(
      unwrap<SlaServiceRow>(slaQuery.data, "services").map((s) => [s.service_code, s]),
    );
    return share.map((s) => {
      const sla = slaByCode.get(s.service_code);
      return {
        id: s.service_code,
        short: s.short_name || text(s.label),
        color: s.color || SERVICE_BY_ID[s.service_code]?.color || "#94A3B8",
        icon: SERVICE_BY_ID[s.service_code]?.icon ?? FileText,
        volume: s.count ?? 0,
        issued: s.issued ?? 0,
        inProgress: s.in_progress ?? 0,
        rejected: s.rejected ?? 0,
        target: sla?.target_days ?? SERVICE_BY_ID[s.service_code]?.slaDays ?? 0,
        closed: sla?.closed_cases ?? 0,
        sla: Math.round(sla?.on_time_pct ?? 0),
        overdue: sla?.breached ?? 0,
        collected: s.revenue_lak ?? 0,
      };
    });
  }, [shareQuery.data, slaQuery.data]);

  /* ── Pipeline counts ── */
  const statusCounts = useMemo(() => {
    const counts = {} as Record<AppStatus, number>;
    for (const row of unwrap<StatusRow>(statusQuery.data, "statuses")) {
      counts[row.status as AppStatus] = row.count ?? 0;
    }
    return counts;
  }, [statusQuery.data]);

  /* ── Choropleth values, keyed by the map's geo name ── */
  const mapValues = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of provinces) out[p.geo_name ?? text(p.province)] = p.count ?? 0;
    return out;
  }, [provinces]);

  const needsAction = needsActionQuery.data?.data ?? [];

  async function exportOverview() {
    try {
      const csv = await applications.exportCSV(filters);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* the toolbar has no error surface; the table below still shows failures */
    }
  }

  const refreshTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="max-w-screen-2xl mx-auto space-y-5 pb-16">
      {/* Welcome header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">Welcome back!</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeFilter onChange={setDateRange} />
          <button
            onClick={exportOverview}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* KPI row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiBig
          filled
          label="Total applications"
          value={total.toLocaleString()}
          delta={deltaLabel(kpis?.total_applications.delta_pct)}
          note="Awaiting + Issued + Submitted + Needs correction"
        />
        <KpiBig
          label="Awaiting action"
          value={parts.awaiting.toLocaleString()}
          delta={deltaLabel(kpis?.awaiting_action.delta_pct)}
        />
        <KpiBig label="Issued" value={parts.issued.toLocaleString()} delta={deltaLabel(kpis?.issued.delta_pct)} />
      </div>

      {/* KPI row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiSmall filled icon={Banknote} label="Fees collected" value={formatLak(feesLak)} tint="#10B981" sub={sub} />
        <KpiSmall icon={Send} label="Submitted" value={parts.submitted.toLocaleString()} tint="#0EA5E9" sub={sub} />
        <KpiSmall icon={AlertTriangle} label="Needs correction" value={parts.needs.toLocaleString()} tint="#F59E0B" sub={sub} />
      </div>

      {/* KPI failure surfaces once, above the charts it feeds. */}
      {kpiQuery.error && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <CardState error={kpiQuery.error} onRetry={kpiQuery.refetch} emptyText="" />
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly bar chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col">
          <div className="flex items-start justify-between gap-4 mb-4 flex-shrink-0">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Application trend</h2>
              <p className="text-sm text-gray-400">
                Received vs completed ·{" "}
                {granularity === "day" ? "daily" : granularity === "week" ? "weekly" : "monthly"}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs flex-shrink-0">
              <span className="flex items-center gap-1.5 text-gray-500">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RECEIVED_COLOR }} /> Received
              </span>
              <span className="flex items-center gap-1.5 text-gray-500">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COMPLETED_COLOR }} /> Completed
              </span>
            </div>
          </div>
          {/* Fills the leftover card height so the bars line up with the donut card beside it. */}
          <div className="flex-1 min-h-[260px]">
            {volumeQuery.loading || volumeQuery.error || trendPoints.length === 0 ? (
              <CardState
                loading={volumeQuery.loading}
                error={volumeQuery.error}
                onRetry={volumeQuery.refetch}
                empty={trendPoints.length === 0}
                emptyText="No applications in the selected period."
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {useBars ? (
                  <BarChart data={trendPoints} margin={{ left: 4, right: 8, top: 8 }} barGap={2} barCategoryGap="28%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9CA3AF" }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9CA3AF" }} width={52} tickFormatter={compactNumber} />
                    <Tooltip cursor={{ fill: "#F8FAFC" }} contentStyle={{ borderRadius: 12, border: "1px solid #EEF0F4", fontSize: 12 }} />
                    <Bar dataKey="received" name="Received" fill={RECEIVED_COLOR} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completed" name="Completed" fill={COMPLETED_COLOR} radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <LineChart data={trendPoints} margin={{ left: 4, right: 8, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} minTickGap={16} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9CA3AF" }} width={52} tickFormatter={compactNumber} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #EEF0F4", fontSize: 12 }} />
                    <Line type="monotone" dataKey="received" name="Received" stroke={RECEIVED_COLOR} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="completed" name="Completed" stroke={COMPLETED_COLOR} strokeWidth={2} dot={false} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Donut chart */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800">Registration statistics</h2>
          <p className="text-sm text-gray-400">The nine case statuses, grouped</p>

          {kpiQuery.loading || total === 0 ? (
            <CardState
              loading={kpiQuery.loading}
              empty={!kpiQuery.loading && total === 0}
              emptyText="No cases in the selected period."
            />
          ) : (
            <>
              <div className="relative mt-2">
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie
                      data={reg}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={64}
                      outerRadius={92}
                      paddingAngle={4}
                      cornerRadius={10}
                      stroke="none"
                    >
                      {reg.map((s) => (
                        <Cell key={s.name} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number, name, item) => [
                        `${v.toLocaleString()} cases · ${(item?.payload as RegSlice | undefined)?.statuses.join(", ")}`,
                        name as string,
                      ]}
                      contentStyle={{ borderRadius: 12, border: "1px solid #EEF0F4", fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Centre total */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-xs text-gray-400">Total applications</p>
                  <p className="text-2xl font-bold text-gray-800">{total.toLocaleString()}</p>
                </div>
              </div>

              {/* Legend rows — each names the statuses it groups, so the buckets
                  can be traced back to the Applications status filter. */}
              <div className="mt-4 space-y-2">
                {reg.map((s) => (
                  <div key={s.name} className="flex items-center gap-3">
                    <span
                      className="w-12 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: s.color }}
                    >
                      {s.pct}%
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-gray-700 truncate">{s.name}</span>
                      <span className="block text-[11px] text-gray-400 truncate" title={s.statuses.join(" · ")}>
                        {s.statuses.join(" · ")}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-gray-800 tabular-nums">{s.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Per-service + SLA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <PerServicePanel
            services={services}
            loading={shareQuery.loading || slaQuery.loading}
            error={shareQuery.error ?? slaQuery.error}
            onRetry={() => {
              shareQuery.refetch();
              slaQuery.refetch();
            }}
          />
        </div>
        <SlaTracker
          services={services}
          loading={shareQuery.loading || slaQuery.loading}
          error={slaQuery.error ?? shareQuery.error}
          onRetry={() => {
            slaQuery.refetch();
            shareQuery.refetch();
          }}
        />
      </div>

      {/* Pipeline funnel + activity feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <div className="lg:col-span-2 h-full">
          <PipelineFunnel
            counts={statusCounts}
            loading={statusQuery.loading}
            error={statusQuery.error}
            onRetry={statusQuery.refetch}
          />
        </div>
        <ActivityFeed
          events={activityQuery.data ?? []}
          loading={activityQuery.loading}
          error={activityQuery.error}
          onRetry={activityQuery.refetch}
        />
      </div>

      {/* Registrations by province */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-800">Registrations by province</h2>
        <p className="text-sm text-gray-400 mb-4">Choropleth across Laos provinces &amp; the capital</p>
        {provinceStatsQuery.loading || provinceStatsQuery.error ? (
          <CardState
            loading={provinceStatsQuery.loading}
            error={provinceStatsQuery.error}
            onRetry={provinceStatsQuery.refetch}
            emptyText="No provincial figures in the selected period."
          />
        ) : (
          <LaosMap values={mapValues} selected={province} onSelect={setProvince} />
        )}
      </div>

      {/* Recent submissions needing action */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Recent submissions needing action</h2>
          <span className="text-xs text-gray-400">
            {(needsActionQuery.data?.meta.total ?? needsAction.length).toLocaleString()} open
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-5 py-3 font-medium">Ref. No.</th>
                <th className="px-5 py-3 font-medium">Applicant</th>
                <th className="px-5 py-3 font-medium">Service</th>
                <th className="px-5 py-3 font-medium">Submitted</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {needsAction.map((a) => {
                const svc = SERVICE_BY_ID[a.service_code];
                return (
                  <tr
                    key={a.id}
                    onClick={() => onOpenCase(a.id)}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 cursor-pointer"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{a.reference_no}</td>
                    <td className="px-5 py-3 text-gray-800">{a.applicant}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-2 text-gray-600">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: svc?.color ?? "#94A3B8" }} />
                        {svc?.short ?? text(a.service_name)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{(a.submitted_at ?? a.created_at ?? "").slice(0, 10)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={a.status as AppStatus} />
                    </td>
                  </tr>
                );
              })}
              {(needsActionQuery.loading || needsActionQuery.error || needsAction.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-5 py-4">
                    <CardState
                      loading={needsActionQuery.loading}
                      error={needsActionQuery.error}
                      onRetry={needsActionQuery.refetch}
                      empty={needsAction.length === 0}
                      emptyText="No submissions in the selected date range."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live indicator */}
      <div className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white border border-emerald-200 shadow-md text-xs">
        <Wifi className="w-4 h-4 text-emerald-500" />
        <span className="font-semibold text-emerald-600">Live</span>
        <span className="text-gray-400">· Last refresh {refreshTime}</span>
      </div>
    </div>
  );
}

/*
 * Several analytics endpoints wrap their rows in a named object
 * ({ services: [...] }, { provinces: [...] }) while others send a bare array.
 * One helper accepts both so a page never has to care which.
 */
function unwrap<T>(payload: unknown, key: string): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const row = (payload as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(row) ? (row as T[]) : [];
}
