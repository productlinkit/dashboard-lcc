import {
  FileText,
  Clock,
  CheckCircle2,
  Banknote,
  ArrowUpRight,
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
import { KPI, MONTHLY_VOLUME, APPLICATIONS } from "../data/mockData";
import { SERVICE_BY_ID, formatLak } from "../serviceConfig";
import { StatusBadge } from "../components/StatusBadge";
import { LaosMap } from "../components/LaosMap";
import { DateRangeFilter, inRange, ALL_TIME, type DateRange } from "../components/DateRangeFilter";
import {
  deriveServices,
  PerServicePanel,
  SlaTracker,
  PipelineFunnel,
  ActivityFeed,
} from "../components/OverviewWidgets";

/* Registration status breakdown — palette validated for CVD separation. */
const REG_COLORS: Record<string, { color: string; text: string }> = {
  Approved: { color: "#3752AE", text: "#ffffff" },
  Pending: { color: "#F59E0B", text: "#0F172A" },
  Revision: { color: "#0EA5E9", text: "#0F172A" },
  Failed: { color: "#EF4444", text: "#ffffff" },
};

const REG_STATS = [
  { name: "Approved", value: 71, color: REG_COLORS.Approved.color },
  { name: "Pending", value: 23, color: REG_COLORS.Pending.color },
  { name: "Revision", value: 1, color: REG_COLORS.Revision.color },
  { name: "Failed", value: 5, color: REG_COLORS.Failed.color },
];

const YEAR = 2026;
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const RECEIVED_COLOR = "#3752AE";
const COMPLETED_COLOR = "#10B981";

export interface TrendPoint {
  label: string;
  received: number;
  completed: number;
}

/* Application trend — bucket size follows the selected range:
 * ≤31 days → daily, ≤120 days → weekly, otherwise monthly. */
function buildTrend(
  range: DateRange,
  total: number,
  seed: number,
): { points: TrendPoint[]; granularity: "day" | "week" | "month" } {
  const allTime = !range.from && !range.to;
  if (allTime) {
    const points = MONTHLY_VOLUME.map((mo, i) => {
      const sd = (seed * (i + 3)) >>> 0;
      return {
        label: mo.month,
        received: mo.applications,
        completed: Math.round(mo.applications * (0.58 + (sd % 18) / 100)),
      };
    });
    return { points, granularity: "month" };
  }

  const from = range.from ? new Date(range.from) : new Date(YEAR, 0, 1);
  const to = range.to ? new Date(range.to) : new Date();
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);

  let granularity: "day" | "week" | "month";
  let buckets: { label: string; weight: number }[];

  if (days <= 31) {
    granularity = "day";
    buckets = Array.from({ length: days }, (_, i) => {
      const d = new Date(from);
      d.setDate(d.getDate() + i);
      return { label: `${d.getMonth() + 1}/${d.getDate()}`, weight: 1 };
    });
  } else if (days <= 120) {
    granularity = "week";
    const n = Math.ceil(days / 7);
    buckets = Array.from({ length: n }, (_, i) => {
      const d = new Date(from);
      d.setDate(d.getDate() + i * 7);
      return { label: `${d.getMonth() + 1}/${d.getDate()}`, weight: Math.min(7, days - i * 7) };
    });
  } else {
    granularity = "month";
    buckets = [];
    const cur = new Date(from.getFullYear(), from.getMonth(), 1);
    while (cur <= to && buckets.length < 12) {
      buckets.push({ label: `${MONTH_ABBR[cur.getMonth()]} '${String(cur.getFullYear()).slice(2)}`, weight: 30 });
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  const wSum = buckets.reduce((a, b) => a + b.weight, 0) || 1;
  const points = buckets.map((b, i) => {
    const sd = (seed * (i + 7)) >>> 0;
    const jitter = 0.75 + (sd % 50) / 100;
    const received = Math.max(3, Math.round(((total * b.weight) / wSum) * jitter));
    return { label: b.label, received, completed: Math.round(received * (0.55 + (sd % 20) / 100)) };
  });

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
  reg: { name: string; value: number; color: string }[];
  deltas: { total: string; awaiting: string; issued: string };
  sub: string;
  seed: number;
}

/* Dummy metrics derived from the selected date range so the dashboard visibly reacts. */
function metricsFor(range: DateRange): Metrics {
  const allTime = !range.from && !range.to;
  if (allTime) {
    return {
      total: KPI.totalApplications,
      awaiting: KPI.awaitingAction,
      issued: KPI.issuedThisMonth,
      submitted: KPI.submittedToday,
      feesLak: KPI.feesTodayLak,
      needs: KPI.needsCorrection,
      reg: REG_STATS,
      deltas: { total: "+8.2%", awaiting: "+3.1%", issued: "+12.5%" },
      sub: "all time",
      seed: hashStr("all-time"),
    };
  }

  const from = (range.from ? new Date(range.from) : new Date(YEAR, 0, 1)).getTime();
  const to = (range.to ? new Date(range.to) : new Date()).getTime();
  const DAY = 86400000;
  const days = Math.max(1, Math.round((to - from) / DAY) + 1);
  const seed = hashStr(`${range.from}|${range.to}`);

  const rate = 55 + (seed % 25); // applications per day
  const total = Math.max(240, Math.round(rate * days));
  const approved = 60 + (seed % 12);
  const failed = 3 + (seed % 5);
  const revision = 1 + (seed % 3);
  const pending = Math.max(0, 100 - approved - failed - revision);
  const delta = (n: number) => `+${2 + (Math.floor(seed / n) % 14)}.${seed % 9}%`;

  return {
    total,
    awaiting: Math.max(12, Math.round(total * 0.07)),
    issued: Math.max(60, Math.round(total * 0.62)),
    submitted: Math.max(8, Math.round(total * 0.11)),
    feesLak: Math.max(200_000, Math.round(total * 8000)),
    needs: Math.max(4, Math.round(total * 0.03)),
    reg: [
      { name: "Approved", value: approved, color: REG_COLORS.Approved.color },
      { name: "Pending", value: pending, color: REG_COLORS.Pending.color },
      { name: "Revision", value: revision, color: REG_COLORS.Revision.color },
      { name: "Failed", value: failed, color: REG_COLORS.Failed.color },
    ],
    deltas: { total: delta(1), awaiting: delta(3), issued: delta(7) },
    sub: "in selected period",
    seed,
  };
}

function DeltaBadge({ value, onDark = false }: { value: string; onDark?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
        onDark ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"
      }`}
    >
      <ArrowUpRight className="w-3.5 h-3.5" />
      {value}
    </span>
  );
}

function KpiBig({
  filled,
  label,
  value,
  delta,
}: {
  filled?: boolean;
  label: string;
  value: string;
  delta: string;
}) {
  return (
    <div
      className={`rounded-2xl p-5 shadow-sm ${filled ? "text-white" : "bg-white border border-gray-100 text-gray-800"}`}
      style={filled ? { background: "linear-gradient(135deg, #3752AE 0%, #2c428b 100%)" } : undefined}
    >
      <p className={`text-sm ${filled ? "text-white/80" : "text-gray-500"}`}>{label}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
      <div className="flex items-center gap-2 mt-3">
        <DeltaBadge value={delta} onDark={filled} />
        <span className={`text-xs ${filled ? "text-white/70" : "text-gray-400"}`}>vs previous period</span>
      </div>
    </div>
  );
}

function KpiSmall({ icon: Icon, label, value, tint, sub }: { icon: LucideIcon; label: string; value: string; tint: string; sub: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${tint}1A` }}>
          <Icon className="w-5 h-5" style={{ color: tint } as React.CSSProperties} />
        </span>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-800 mt-3">{value}</p>
      <p className="text-xs text-[#3752AE] mt-0.5">{sub}</p>
    </div>
  );
}

export function OverviewPage({ onOpenCase }: { onOpenCase: (id: string) => void }) {
  const [dateRange, setDateRange] = useState<DateRange>(ALL_TIME);
  const m = useMemo(() => metricsFor(dateRange), [dateRange]);
  const services = useMemo(() => deriveServices(m.total, m.seed), [m.total, m.seed]);
  const trend = useMemo(() => buildTrend(dateRange, m.total, m.seed), [dateRange, m.total, m.seed]);
  const useBars = trend.points.length <= 14;

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
        <KpiBig filled label="Total applications" value={m.total.toLocaleString()} delta={m.deltas.total} />
        <KpiBig label="Awaiting action" value={m.awaiting.toLocaleString()} delta={m.deltas.awaiting} />
        <KpiBig label="Issued" value={m.issued.toLocaleString()} delta={m.deltas.issued} />
      </div>

      {/* KPI row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiSmall icon={Send} label="Submitted" value={m.submitted.toLocaleString()} tint="#0EA5E9" sub={m.sub} />
        <KpiSmall icon={Banknote} label="Fees collected" value={formatLak(m.feesLak)} tint="#10B981" sub={m.sub} />
        <KpiSmall icon={AlertTriangle} label="Needs correction" value={m.needs.toLocaleString()} tint="#F59E0B" sub={m.sub} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly bar chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-4">
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
          <ResponsiveContainer width="100%" height={260}>
            {useBars ? (
              <BarChart data={trend.points} margin={{ left: -12, right: 8, top: 8 }} barGap={2} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9CA3AF" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9CA3AF" }} width={44} />
                <Tooltip cursor={{ fill: "#F8FAFC" }} contentStyle={{ borderRadius: 12, border: "1px solid #EEF0F4", fontSize: 12 }} />
                <Bar dataKey="received" name="Received" fill={RECEIVED_COLOR} radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="Completed" fill={COMPLETED_COLOR} radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={trend.points} margin={{ left: -12, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} minTickGap={16} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9CA3AF" }} width={44} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #EEF0F4", fontSize: 12 }} />
                <Line type="monotone" dataKey="received" name="Received" stroke={RECEIVED_COLOR} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="completed" name="Completed" stroke={COMPLETED_COLOR} strokeWidth={2} dot={false} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Donut chart */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800">Registration statistics</h2>
          <p className="text-sm text-gray-400">Status breakdown</p>

          <div className="relative mt-2">
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie
                  data={m.reg}
                  dataKey="value"
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
                  formatter={(v: number) => `${v}%`}
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

          {/* Legend rows */}
          <div className="mt-4 space-y-2">
            {m.reg.map((s) => {
              const count = Math.round((m.total * s.value) / 100);
              return (
                <div key={s.name} className="flex items-center gap-3">
                  <span
                    className="w-12 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: s.color, color: REG_COLORS[s.name]?.text ?? "#ffffff" }}
                  >
                    {s.value}%
                  </span>
                  <span className="flex-1 text-sm text-gray-600 truncate">{s.name}</span>
                  <span className="text-sm font-semibold text-gray-800 tabular-nums">{count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Per-service + SLA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <PerServicePanel services={services} />
        </div>
        <SlaTracker services={services} total={m.total} seed={m.seed} />
      </div>

      {/* Pipeline funnel + activity feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <div className="lg:col-span-2 h-full">
          <PipelineFunnel total={m.total} seed={m.seed} />
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
