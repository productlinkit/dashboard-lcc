import { useMemo, useState } from "react";
import {
  Download, FileText, Wallet, AlertTriangle, Percent, FileCheck2, RotateCcw, Ban, ScanLine, Timer,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, PieChart, Pie,
} from "recharts";
import { DateRangeFilter, inRange, ALL_TIME, type DateRange } from "../components/DateRangeFilter";
import { calendarBuckets, hashStr } from "../data/derive";
import { APPLICATIONS } from "../data/mockData";
import { serviceStatsFor, overallTurnaround, processingDays, CLOSED_STATUSES } from "../data/serviceStats";
import { TRANSACTIONS, DEFAULT_METHODS, METHOD_COLOR } from "../data/payments";
import { SERVICES, SERVICE_BY_ID, formatLak } from "../serviceConfig";

/*
 * Reports read the SAME rows the rest of the app does — APPLICATIONS and
 * TRANSACTIONS — rather than generating their own figures. Anything shown here
 * can be reconciled against Applications, Approval Queue and Payments.
 */
const REJECT_REASONS = [
  "Missing document",
  "Mismatched ID / eID",
  "Incomplete address",
  "Ineligible / not qualified",
  "Duplicate record",
  "Illegible attachment",
];

function buildReport(range: DateRange) {
  const apps = APPLICATIONS.filter((a) => inRange(a.submitted, range));
  const tx = TRANSACTIONS.filter((t) => inRange(t.date, range));
  const services = serviceStatsFor(range);
  const turnaround = overallTurnaround(range);

  const collected = services.reduce((a, s) => a + s.collected, 0);
  const outstanding = services.reduce((a, s) => a + s.outstanding, 0);
  const billed = collected + outstanding;
  const collectionRate = billed ? Math.round((collected / billed) * 100) : 0;
  const unpaidCases = services.reduce((a, s) => a + s.unpaid, 0);

  /* Time series — buckets follow the calendar span, days without data show zero. */
  const allDates = [...apps.map((a) => a.submitted), ...tx.map((t) => t.date)].sort();
  const { buckets, granularity } = calendarBuckets(range, {
    from: allDates[0] ?? "",
    to: allDates[allDates.length - 1] ?? "",
  });
  const collectedByDay: Record<string, number> = {};
  const outstandingByDay: Record<string, number> = {};
  for (const t of tx) {
    if (t.status === "paid") collectedByDay[t.date] = (collectedByDay[t.date] ?? 0) + t.amount;
    if (t.status === "pending") outstandingByDay[t.date] = (outstandingByDay[t.date] ?? 0) + t.amount;
  }
  const requestsByDay: Record<string, number> = {};
  for (const a of apps) requestsByDay[a.submitted] = (requestsByDay[a.submitted] ?? 0) + 1;

  const series = buckets.map((b) => ({
    day: b.label,
    collected: b.days.reduce((s, d) => s + (collectedByDay[d] ?? 0), 0),
    outstanding: b.days.reduce((s, d) => s + (outstandingByDay[d] ?? 0), 0),
    requests: b.days.reduce((s, d) => s + (requestsByDay[d] ?? 0), 0),
  }));

  const payMethods = DEFAULT_METHODS.map((m) => ({
    id: m.id,
    name: m.label,
    value: tx.filter((t) => t.status === "paid" && t.method === m.id).reduce((s, t) => s + t.amount, 0),
    color: METHOD_COLOR[m.id],
  })).filter((m) => m.value > 0);

  const provinceCounts: Record<string, number> = {};
  for (const a of apps) provinceCounts[a.province] = (provinceCounts[a.province] ?? 0) + 1;
  const provinces = Object.entries(provinceCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const returns = apps.filter((a) => a.status === "returned").length;
  const rejected = apps.filter((a) => a.status === "rejected").length;
  const reasonTotal = returns + rejected;
  const weights = REJECT_REASONS.map((reason, i) => ({ reason, w: 10 + ((hashStr(reason) >> i) % 22) }));
  const wSum = weights.reduce((a, r) => a + r.w, 0);
  const reasonRows = weights
    .map((r) => ({ reason: r.reason, count: Math.round((reasonTotal * r.w) / wSum) }))
    .sort((a, b) => b.count - a.count);

  const issuedCount = apps.filter((a) => a.status === "issued").length;
  const certs = {
    issued: issuedCount,
    reissued: tx.filter((t) => t.kind === "certified-copy").length,
    revoked: apps.filter((a) => a.status === "revoked").length,
    qrScans: Math.round(issuedCount * 2.4),
  };

  const countOf = (id: string) => services.find((s) => s.id === id)?.volume ?? 0;
  const familyBook = {
    added: countOf("birth"),
    removed: countOf("death"),
    statusUpdates: countOf("marriage") + countOf("divorce") + Math.round(countOf("resident") * 0.3),
  };

  const byOfficer: Record<string, { processed: number; issued: number; days: number[] }> = {};
  for (const a of apps) {
    if (!a.officer) continue;
    const o = (byOfficer[a.officer] ??= { processed: 0, issued: 0, days: [] });
    o.processed += 1;
    if (a.status === "issued") o.issued += 1;
    if (CLOSED_STATUSES.includes(a.status)) o.days.push(processingDays(a, SERVICE_BY_ID[a.serviceId]?.slaDays ?? 7));
  }
  const officers = Object.entries(byOfficer)
    .map(([name, o]) => ({
      name,
      processed: o.processed,
      issued: o.issued,
      avgDays: o.days.length ? +(o.days.reduce((s, d) => s + d, 0) / o.days.length).toFixed(1) : 0,
    }))
    .sort((a, b) => b.processed - a.processed);


  return {
    total: apps.length,
    services,
    collected,
    outstanding,
    billed,
    collectionRate,
    unpaidCases,
    series,
    granularity,
    payMethods,
    provinces,
    returns,
    rejected,
    reasonRows,
    certs,
    familyBook,
    officers,
    issuedCount,
    avgDays: turnaround.avgDays,
    slaOverall: turnaround.sla,
  };
}

type Report = ReturnType<typeof buildReport>;

function csvExport(r: Report) {
  const header = ["Service", "Applications", "Issued", "Receipts paid", "Unpaid", "Collected (LAK)", "Outstanding (LAK)", "Target days", "Avg days", "Within target %", "Overdue"];
  const body = r.services.map((s) => [
    SERVICE_BY_ID[s.id]?.label ?? s.id,
    s.volume, s.issued, s.receipts, s.unpaid, s.collected, s.outstanding, s.target, s.avgDays, s.sla, s.overdue,
  ]);
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header, ...body].map((row) => row.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Small presentational helpers ── */
function Kpi({
  icon: Icon, label, value, sub, tint,
}: {
  icon: typeof Wallet; label: string; value: string; sub?: string; tint: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${tint}1A` }}>
          <Icon className="w-5 h-5" style={{ color: tint } as React.CSSProperties} />
        </span>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-800 mt-3">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="pt-2">
      <h2 className="text-lg font-bold text-gray-800">{children}</h2>
      {sub && <p className="text-sm text-gray-400">{sub}</p>}
    </div>
  );
}

function Card({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 p-5 shadow-sm ${className}`}>
      <h3 className="text-base font-semibold text-gray-800">{title}</h3>
      {sub && <p className="text-sm text-gray-400">{sub}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

const tooltipStyle = { borderRadius: 12, border: "1px solid #EEF0F4", fontSize: 12 };
const lakShort = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}K` : String(n));

export function ReportsPage() {
  const [dateRange, setDateRange] = useState<DateRange>(ALL_TIME);
  const r = useMemo(() => buildReport(dateRange), [dateRange]);
  const perLabel = r.granularity === "day" ? "day" : r.granularity === "week" ? "week" : "month";

  return (
    <div className="max-w-screen-2xl mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Reports</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Built from the same case and receipt records as the rest of the console.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeFilter onChange={setDateRange} />
          <button
            onClick={() => csvExport(r)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b]"
          >
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Headline — the four numbers the whole report expands on */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={FileText} label="Applications" value={r.total.toLocaleString()} sub="Received in this period" tint="#3752AE" />
        <Kpi icon={FileCheck2} label="Certificates issued" value={r.issuedCount.toLocaleString()} sub={`${r.total ? Math.round((r.issuedCount / r.total) * 100) : 0}% of applications`} tint="#10B981" />
        <Kpi icon={Wallet} label="Fees collected" value={formatLak(r.collected)} sub={`${r.collectionRate}% of ${formatLak(r.billed)} billed`} tint="#047857" />
        <Kpi icon={Timer} label="Avg. processing" value={`${r.avgDays} days`} sub="Submission to decision" tint="#6D28D9" />
      </div>

      {/* ── 1. Financial ── */}
      <SectionTitle sub="Collections, outstanding fees and how citizens pay">Financial &amp; payments</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Wallet} label="Collected" value={formatLak(r.collected)} tint="#10B981" />
        <Kpi icon={AlertTriangle} label="Outstanding" value={formatLak(r.outstanding)} sub={`${r.unpaidCases} unpaid receipts`} tint="#F59E0B" />
        <Kpi icon={Percent} label="Collection rate" value={`${r.collectionRate}%`} tint="#0EA5E9" />
        <Kpi icon={FileText} label="Avg. per receipt" value={formatLak(r.certs.issued ? Math.round(r.collected / Math.max(1, r.services.reduce((a, s) => a + s.receipts, 0))) : 0)} tint="#3752AE" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title={`Revenue per ${perLabel}`} sub="Collected vs still outstanding" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={r.series} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} width={52} tickFormatter={lakShort} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatLak(v)} />
              <Bar dataKey="collected" stackId="a" fill="#10B981" barSize={18} />
              <Bar dataKey="outstanding" stackId="a" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Collected</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Outstanding</span>
          </div>
        </Card>
        <Card title="Payment method" sub="Share of collected fees">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={r.payMethods} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={44} outerRadius={72} paddingAngle={3} cornerRadius={8} stroke="none">
                {r.payMethods.map((p) => (
                  <Cell key={p.id} fill={p.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatLak(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {r.payMethods.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-gray-500 truncate">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} /> {p.name}
                </span>
                <span className="text-gray-700 font-medium">
                  {r.collected ? Math.round((p.value / r.collected) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card title="Revenue by service" sub="Receipts raised against each service in this period">
        <ReportTable
          head={["Service", "Apps", "Paid", "Unpaid", "Collected", "Outstanding"]}
          rows={r.services.map((s) => [
            <ServiceCell key="s" id={s.id} />,
            s.volume.toLocaleString(),
            s.receipts ? s.receipts.toLocaleString() : "—",
            s.unpaid ? s.unpaid.toLocaleString() : "—",
            s.collected ? formatLak(s.collected) : SERVICE_BY_ID[s.id]?.fee === 0 ? "Free" : "—",
            s.outstanding ? formatLak(s.outstanding) : "—",
          ])}
        />
      </Card>

      {/* ── 2. Volume & vital statistics ── */}
      <SectionTitle sub="Submissions, vital events and where they come from">Volume &amp; vital statistics</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {r.services.map((s) => {
          const svc = SERVICE_BY_ID[s.id];
          return (
            <div key={s.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: svc?.color }} />
                <p className="text-xs text-gray-500 truncate">{svc?.short}</p>
              </div>
              <p className="text-xl font-bold text-gray-800 mt-1.5">{s.volume.toLocaleString()}</p>
              <p className="text-[11px] text-gray-400">{s.issued.toLocaleString()} issued</p>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title={`Applications per ${perLabel}`} sub="When cases were submitted" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={r.series} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} width={40} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} applications`, ""]} />
              <Bar dataKey="requests" fill="#3752AE" radius={[4, 4, 0, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Top provinces" sub="By applications received">
          <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
            {r.provinces.map((p) => (
              <div key={p.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-600 truncate">{p.name}</span>
                  <span className="text-gray-800 font-medium tabular-nums">{p.value.toLocaleString()}</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#3752AE]"
                    style={{ width: `${(p.value / (r.provinces[0]?.value || 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── 3. Processing & SLA ── */}
      <SectionTitle sub="Turnaround against each service's own target, and rework">Processing &amp; SLA</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card
          title="Turnaround by service"
          sub="Each service is measured against its own target, not one shared deadline"
          className="lg:col-span-2"
        >
          <ReportTable
            head={["Service", "Closed", "Target", "Avg days", "Within target", "Overdue"]}
            rows={r.services.map((s) => [
              <ServiceCell key="s" id={s.id} />,
              s.closed.toLocaleString(),
              `${s.target}d`,
              <span key="d" className={s.avgDays <= s.target ? "text-emerald-600" : "text-red-500"}>{s.avgDays}</span>,
              <span key="sla" className={s.sla >= 90 ? "text-emerald-600" : s.sla >= 85 ? "text-amber-600" : "text-red-500"}>{s.sla}%</span>,
              s.overdue.toLocaleString(),
            ])}
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> On target ≥ 90%</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> At risk 85–89%</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Breaching &lt; 85%</span>
          </div>
        </Card>
        <Card title="Returns &amp; rejections" sub="Rework and its causes">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl bg-orange-50 border border-orange-100 p-3">
              <p className="text-xs text-orange-600 font-medium">Returned</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{r.returns.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-red-50 border border-red-100 p-3">
              <p className="text-xs text-red-600 font-medium">Rejected</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{r.rejected.toLocaleString()}</p>
            </div>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Top reasons</p>
          <div className="space-y-2">
            {r.reasonRows.map((row) => (
              <div key={row.reason}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-600 truncate">{row.reason}</span>
                  <span className="text-gray-500">{row.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#3752AE]"
                    style={{ width: `${(row.count / (r.reasonRows[0]?.count || 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── 4. Certificates & productivity ── */}
      <SectionTitle sub="Issuance, family book impact and workload per officer">Certificates &amp; productivity</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={FileCheck2} label="Issued" value={r.certs.issued.toLocaleString()} tint="#10B981" />
        <Kpi icon={RotateCcw} label="Certified copies" value={r.certs.reissued.toLocaleString()} tint="#0EA5E9" />
        <Kpi icon={Ban} label="Revoked" value={r.certs.revoked.toLocaleString()} tint="#EF4444" />
        <Kpi icon={ScanLine} label="QR verifications" value={r.certs.qrScans.toLocaleString()} sub="Estimated from issued certificates" tint="#3752AE" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Family Book impact" sub="Household changes these events trigger">
          <div className="space-y-3">
            {[
              { label: "Members added (births)", value: r.familyBook.added, color: "#10B981" },
              { label: "Members removed (deaths)", value: r.familyBook.removed, color: "#EF4444" },
              { label: "Status updates", value: r.familyBook.statusUpdates, color: "#3752AE" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                  {row.label}
                </span>
                <span className="text-sm font-semibold text-gray-800">{row.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Cases processed by officer" sub="Assigned cases in this period" className="lg:col-span-2">
          <ReportTable
            head={["Officer", "Processed", "Issued", "Avg days"]}
            rows={r.officers.map((o) => [
              o.name,
              o.processed.toLocaleString(),
              o.issued.toLocaleString(),
              `${o.avgDays}`,
            ])}
          />
        </Card>
      </div>
    </div>
  );
}

function ServiceCell({ id }: { id: string }) {
  const svc = SERVICE_BY_ID[id];
  return (
    <span className="inline-flex items-center gap-2 text-gray-700 whitespace-nowrap">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: svc?.color }} />
      {svc?.short ?? id}
    </span>
  );
}

function ReportTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
            {head.map((h, i) => (
              <th key={i} className={`px-3 py-2.5 font-medium ${i === 0 ? "" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={head.length} className="px-3 py-8 text-center text-sm text-gray-400">
                Nothing in this period.
              </td>
            </tr>
          )}
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-gray-50 last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className={`px-3 py-2.5 ${ci === 0 ? "text-gray-700" : "text-right text-gray-600 tabular-nums"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
