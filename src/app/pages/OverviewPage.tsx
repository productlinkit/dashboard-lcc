import {
  FileText,
  Clock,
  CheckCircle2,
  Banknote,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Plus,
  Wifi,
  Send,
  AlertTriangle,
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
import { APPLICATIONS } from "../data/mockData";
import { calendarBuckets } from "../data/derive";
import {
  serviceStatsFor,
  statusCountsFor,
  collectedIn,
  previousRange,
  appsIn,
  completionDate,
} from "../data/serviceStats";
import { SERVICE_BY_ID, formatLak } from "../serviceConfig";
import { StatusBadge } from "../components/StatusBadge";
import { LaosMap } from "../components/LaosMap";
import { DateRangeFilter, inRange, ALL_TIME, type DateRange } from "../components/DateRangeFilter";
import {
  PerServicePanel,
  SlaTracker,
  PipelineFunnel,
  ActivityFeed,
} from "../components/OverviewWidgets";

/* Registration breakdown — the nine case statuses grouped into four buckets, so
 * a slice always says which statuses it covers. Values come from the same split
 * as the KPI cards, so donut and cards can never disagree.
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

const YEAR = 2026;
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

/* Application trend — received vs completed, counted from the case rows and
 * bucketed by the shared calendar helper so it matches every other chart. */
function buildTrend(range: DateRange): { points: TrendPoint[]; granularity: "day" | "week" | "month" } {
  const apps = appsIn(range);
  const dates = APPLICATIONS.map((a) => a.submitted).sort();
  const { buckets, granularity } = calendarBuckets(range, {
    from: dates[0] ?? "",
    to: dates[dates.length - 1] ?? "",
  });

  const receivedByDay: Record<string, number> = {};
  const completedByDay: Record<string, number> = {};
  for (const a of apps) receivedByDay[a.submitted] = (receivedByDay[a.submitted] ?? 0) + 1;
  /* Completions are counted on the day the case closed, from every case in the
   * dataset — a case received before this period can still complete inside it. */
  for (const a of APPLICATIONS) {
    const done = completionDate(a);
    if (done) completedByDay[done] = (completedByDay[done] ?? 0) + 1;
  }

  const points = buckets.map((b) => ({
    label: b.label,
    received: b.days.reduce((s, d) => s + (receivedByDay[d] ?? 0), 0),
    completed: b.days.reduce((s, d) => s + (completedByDay[d] ?? 0), 0),
  }));
  return { points, granularity };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
interface Metrics {
  total: number;
  awaiting: number;
  issued: number;
  submitted: number;
  feesLak: number;
  needs: number;
  reg: RegSlice[];
  deltas: { total: string; awaiting: string; issued: string };
  sub: string;
  seed: number;
}

/* The four state buckets, counted from the real case rows. They partition the
 * nine statuses, so they always add back up to Total applications. */
function bucketsFor(range: DateRange) {
  const c = statusCountsFor(range);
  return {
    issued: c.registered + c.issued,
    awaiting: c.certified + c["under-review"],
    submitted: c.draft + c.submitted,
    needs: c.returned + c.rejected + c.revoked,
  };
}

function pctDelta(now: number, before: number): string {
  if (before === 0) return now === 0 ? "0%" : "+100%";
  const d = ((now - before) / before) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
}

/* Every figure below is counted from APPLICATIONS / TRANSACTIONS, so the dashboard
 * reconciles with Applications, Payments and Reports. */
function metricsFor(range: DateRange): Metrics {
  const parts = bucketsFor(range);
  const total = parts.issued + parts.awaiting + parts.submitted + parts.needs;

  const prev = previousRange(range);
  const prevParts = bucketsFor(prev);
  const prevTotal = prevParts.issued + prevParts.awaiting + prevParts.submitted + prevParts.needs;

  return {
    total,
    ...parts,
    feesLak: collectedIn(range),
    reg: regBreakdown(parts, total),
    deltas: {
      total: pctDelta(total, prevTotal),
      awaiting: pctDelta(parts.awaiting, prevParts.awaiting),
      issued: pctDelta(parts.issued, prevParts.issued),
    },
    sub: !range.from && !range.to ? "all time" : "in selected period",
    seed: hashStr(`${range.from}|${range.to}`),
  };
}

/* Deltas are now real period-on-period changes, so they can be negative. */
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

export function OverviewPage({ onOpenCase }: { onOpenCase: (id: string) => void }) {
  const [dateRange, setDateRange] = useState<DateRange>(ALL_TIME);
  const m = useMemo(() => metricsFor(dateRange), [dateRange]);
  const services = useMemo(() => serviceStatsFor(dateRange), [dateRange]);
  const trend = useMemo(() => buildTrend(dateRange), [dateRange]);
  const useBars = trend.points.length <= 14;
  const statusCounts = useMemo(() => statusCountsFor(dateRange), [dateRange]);

  const openCases = APPLICATIONS.filter((a) =>
    ["submitted", "certified", "under-review", "returned"].includes(a.status),
  );
  const filtered = openCases.filter((a) => inRange(a.submitted, dateRange));
  const needsAction = (filtered.length ? filtered : openCases).slice(0, 8);

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
          <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">
            <Download className="w-4 h-4" /> Export
          </button>
          <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b]">
            <Plus className="w-4 h-4" /> New application
          </button>
        </div>
      </div>

      {/* KPI row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiBig
          filled
          label="Total applications"
          value={m.total.toLocaleString()}
          delta={m.deltas.total}
          note="Awaiting + Issued + Submitted + Needs correction"
        />
        <KpiBig label="Awaiting action" value={m.awaiting.toLocaleString()} delta={m.deltas.awaiting} />
        <KpiBig label="Issued" value={m.issued.toLocaleString()} delta={m.deltas.issued} />
      </div>

      {/* KPI row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiSmall filled icon={Banknote} label="Fees collected" value={formatLak(m.feesLak)} tint="#10B981" sub={m.sub} />
        <KpiSmall icon={Send} label="Submitted" value={m.submitted.toLocaleString()} tint="#0EA5E9" sub={m.sub} />
        <KpiSmall icon={AlertTriangle} label="Needs correction" value={m.needs.toLocaleString()} tint="#F59E0B" sub={m.sub} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly bar chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col">
          <div className="flex items-start justify-between gap-4 mb-4 flex-shrink-0">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Application trend</h2>
              <p className="text-sm text-gray-400">
                Received vs completed ·{" "}
                {trend.granularity === "day" ? "daily" : trend.granularity === "week" ? "weekly" : "monthly"}
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
            <ResponsiveContainer width="100%" height="100%">
              {useBars ? (
                <BarChart data={trend.points} margin={{ left: 4, right: 8, top: 8 }} barGap={2} barCategoryGap="28%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9CA3AF" }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9CA3AF" }} width={52} tickFormatter={compactNumber} />
                  <Tooltip cursor={{ fill: "#F8FAFC" }} contentStyle={{ borderRadius: 12, border: "1px solid #EEF0F4", fontSize: 12 }} />
                  <Bar dataKey="received" name="Received" fill={RECEIVED_COLOR} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completed" name="Completed" fill={COMPLETED_COLOR} radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : (
                <LineChart data={trend.points} margin={{ left: 4, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} minTickGap={16} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9CA3AF" }} width={52} tickFormatter={compactNumber} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #EEF0F4", fontSize: 12 }} />
                  <Line type="monotone" dataKey="received" name="Received" stroke={RECEIVED_COLOR} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="completed" name="Completed" stroke={COMPLETED_COLOR} strokeWidth={2} dot={false} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut chart */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800">Registration statistics</h2>
          <p className="text-sm text-gray-400">The nine case statuses, grouped</p>

          <div className="relative mt-2">
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie
                  data={m.reg}
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
                  {m.reg.map((s) => (
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
              <p className="text-2xl font-bold text-gray-800">{m.total.toLocaleString()}</p>
            </div>
          </div>

          {/* Legend rows — each names the statuses it groups, so the buckets
              can be traced back to the Applications status filter. */}
          <div className="mt-4 space-y-2">
            {m.reg.map((s) => (
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
        </div>
      </div>

      {/* Per-service + SLA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <PerServicePanel services={services} />
        </div>
        <SlaTracker services={services} />
      </div>

      {/* Pipeline funnel + activity feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <div className="lg:col-span-2 h-full">
          <PipelineFunnel counts={statusCounts} />
        </div>
        <ActivityFeed />
      </div>

      {/* Registrations by province */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-800">Registrations by province</h2>
        <p className="text-sm text-gray-400 mb-4">Choropleth across Laos provinces &amp; the capital</p>
        <LaosMap />
      </div>

      {/* Recent submissions needing action */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Recent submissions needing action</h2>
          <span className="text-xs text-gray-400">{needsAction.length} open</span>
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
                const svc = SERVICE_BY_ID[a.serviceId];
                return (
                  <tr
                    key={a.id}
                    onClick={() => onOpenCase(a.id)}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 cursor-pointer"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{a.id}</td>
                    <td className="px-5 py-3 text-gray-800">{a.applicant}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-2 text-gray-600">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: svc?.color }} />
                        {svc?.short}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{a.submitted}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                  </tr>
                );
              })}
              {needsAction.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">
                    No submissions in the selected date range.
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
