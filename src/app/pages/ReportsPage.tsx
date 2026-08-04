import { useMemo, useState } from "react";
import {
  Download, FileText, FileCheck2, Wallet, Percent, Timer, ArrowUpRight, ArrowDownRight,
  Users, Globe, Scale, AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Cell, PieChart, Pie,
} from "recharts";
import { DateRangeFilter, inRange, ALL_TIME, type DateRange } from "../components/DateRangeFilter";
import { calendarBuckets } from "../data/derive";
import { APPLICATIONS } from "../data/mockData";
import { serviceStatsFor, overallTurnaround, previousRange, completionDate } from "../data/serviceStats";
import { TRANSACTIONS, DEFAULT_METHODS, METHOD_COLOR } from "../data/payments";
import { SERVICE_BY_ID, formatLak } from "../serviceConfig";
import { POPULATION_SUMMARY, DEMOGRAPHIC_TREND, areaStat } from "../data/population";
import { LocationFilter, NO_LOCATION, type LocationValue } from "../components/LocationFilter";

/*
 * Reports & Analytics — turns the registry's raw records into insight: trends,
 * rates, period-on-period change and regional comparison. Structured as the
 * ministry reads it: Certificate volume → Financial → Population analytics.
 *
 * Raw census/case rows live in their own modules (Population, Applications);
 * this page only aggregates and compares them.
 */

function pctChange(now: number, prev: number): number {
  if (prev === 0) return now === 0 ? 0 : 100;
  return ((now - prev) / prev) * 100;
}

/* ── Report model ──
 * `province` scopes case & financial figures. Case and receipt records only carry
 * a province, so district/village can't refine them — the page notes this. */
function buildReport(range: DateRange, province: string | null) {
  const inProv = (p: string) => !province || p === province;
  const apps = APPLICATIONS.filter((a) => inRange(a.submitted, range) && inProv(a.province));
  const tx = TRANSACTIONS.filter((t) => inRange(t.date, range) && inProv(t.province));
  const services = serviceStatsFor(range, province);
  const turnaround = overallTurnaround(range, province);

  const prevRange = previousRange(range);
  const prevApps = APPLICATIONS.filter((a) => inRange(a.submitted, prevRange) && inProv(a.province));
  const prevTx = TRANSACTIONS.filter((t) => inRange(t.date, prevRange) && inProv(t.province));
  const prevServices = serviceStatsFor(prevRange, province);
  const prevTurn = overallTurnaround(prevRange, province);

  // ── Certificate volume ──
  const received = apps.length;
  const prevReceived = prevApps.length;
  const issued = services.reduce((a, s) => a + s.issued, 0);
  const prevIssued = prevServices.reduce((a, s) => a + s.issued, 0);
  const inRegister = apps.filter((a) => ["registered", "issued", "revoked"].includes(a.status)).length;
  const issuanceRate = received ? (issued / received) * 100 : 0;
  const prevIssuanceRate = prevReceived ? (prevIssued / prevReceived) * 100 : 0;

  // ── Financial ──
  const paidTx = tx.filter((t) => t.status === "paid");
  const collected = paidTx.reduce((s, t) => s + t.amount, 0);
  const prevCollected = prevTx.filter((t) => t.status === "paid").reduce((s, t) => s + t.amount, 0);
  const outstanding = tx.filter((t) => t.status === "pending").reduce((s, t) => s + t.amount, 0);
  const billed = collected + outstanding;
  const collectionRate = billed ? (collected / billed) * 100 : 0;
  const prevBilled = prevCollected + prevTx.filter((t) => t.status === "pending").reduce((s, t) => s + t.amount, 0);
  const prevCollectionRate = prevBilled ? (prevCollected / prevBilled) * 100 : 0;
  const avgReceipt = paidTx.length ? collected / paidTx.length : 0;
  const unpaidCases = services.reduce((a, s) => a + s.unpaid, 0);

  // ── Time series (received & issued by period; collected & outstanding) ──
  const dates = [...apps.map((a) => a.submitted), ...tx.map((t) => t.date)].sort();
  const { buckets, granularity } = calendarBuckets(range, { from: dates[0] ?? "", to: dates[dates.length - 1] ?? "" });
  const receivedByDay: Record<string, number> = {};
  for (const a of apps) receivedByDay[a.submitted] = (receivedByDay[a.submitted] ?? 0) + 1;
  const issuedByDay: Record<string, number> = {};
  for (const a of APPLICATIONS) {
    if (a.status !== "issued") continue;
    const d = completionDate(a);
    if (d) issuedByDay[d] = (issuedByDay[d] ?? 0) + 1;
  }
  const collectedByDay: Record<string, number> = {};
  const outstandingByDay: Record<string, number> = {};
  for (const t of tx) {
    if (t.status === "paid") collectedByDay[t.date] = (collectedByDay[t.date] ?? 0) + t.amount;
    if (t.status === "pending") outstandingByDay[t.date] = (outstandingByDay[t.date] ?? 0) + t.amount;
  }
  const series = buckets.map((b) => ({
    day: b.label,
    received: b.days.reduce((s, d) => s + (receivedByDay[d] ?? 0), 0),
    issued: b.days.reduce((s, d) => s + (issuedByDay[d] ?? 0), 0),
    collected: b.days.reduce((s, d) => s + (collectedByDay[d] ?? 0), 0),
    outstanding: b.days.reduce((s, d) => s + (outstandingByDay[d] ?? 0), 0),
  }));

  const payMethods = DEFAULT_METHODS.map((m) => ({
    id: m.id,
    name: m.label,
    value: paidTx.filter((t) => t.method === m.id).reduce((s, t) => s + t.amount, 0),
    color: METHOD_COLOR[m.id],
  })).filter((m) => m.value > 0);

  // ── Certificate volume by service, with share & delta ──
  const serviceRows = services
    .map((s) => {
      const prev = prevServices.find((p) => p.id === s.id);
      return {
        ...s,
        share: issued ? (s.issued / issued) * 100 : 0,
        issuedDelta: pctChange(s.issued, prev?.issued ?? 0),
      };
    })
    .sort((a, b) => b.issued - a.issued);

  return {
    granularity,
    // Deltas need a real prior window; "all time" has none.
    comparable: !!(range.from || range.to),
    // certificate volume
    received, receivedDelta: pctChange(received, prevReceived),
    issued, issuedDelta: pctChange(issued, prevIssued),
    inRegister,
    issuanceRate, issuanceRateDelta: issuanceRate - prevIssuanceRate,
    avgDays: turnaround.avgDays, avgDaysDelta: pctChange(turnaround.avgDays, prevTurn.avgDays),
    slaOverall: turnaround.sla,
    serviceRows,
    // financial
    collected, collectedDelta: pctChange(collected, prevCollected),
    outstanding, unpaidCases,
    collectionRate, collectionRateDelta: collectionRate - prevCollectionRate,
    avgReceipt,
    billed,
    payMethods,
    series,
  };
}

type Report = ReturnType<typeof buildReport>;

/* ── Population analytics — scoped to the selected area via areaStat ──
 * Structure (sex ratio, working-age, distribution) is area-specific; the 12-month
 * demographic trend is national and labelled as such. */
function buildDemographics(location: LocationValue) {
  const s = POPULATION_SUMMARY;
  const area = areaStat(location.province, location.district, location.village);

  // Per-child breakdown, each aggregated the same way.
  const childRows = area.children.map((c) => {
    const sub = areaStat(
      area.level === "country" ? c.name : area.path.province,
      area.level === "province" ? c.name : area.path.district,
      area.level === "district" ? c.name : area.path.village,
    );
    return {
      name: c.name,
      population: sub.population,
      households: sub.households,
      share: area.population ? (sub.population / area.population) * 100 : 0,
      sexRatio: sub.female ? Math.round((sub.male / sub.female) * 100) : 0,
      workingPct: sub.population ? Math.round((sub.workingAge / sub.population) * 100) : 0,
    };
  });

  const change = DEMOGRAPHIC_TREND.map((m) => ({
    month: m.month,
    natural: m.births - m.deaths,
    migration: m.movedIn - m.movedOut,
    population: m.population,
  }));

  return {
    s,
    area,
    sexRatio: area.female ? Math.round((area.male / area.female) * 100) : 0,
    workingPct: area.population ? Math.round((area.workingAge / area.population) * 100) : 0,
    foreignPct: area.population ? (area.foreign / area.population) * 100 : 0,
    childRows,
    change,
    concentration: childRows[0]?.share ?? 0,
    topChild: childRows[0]?.name ?? "",
    maxShare: childRows[0]?.share ?? 1,
  };
}

function csvExport(r: Report) {
  const header = ["Service", "Issued", "Share %", "Issued Δ%", "Closed", "Avg days", "Within target %", "Collected (LAK)", "Outstanding (LAK)"];
  const body = r.serviceRows.map((s) => [
    SERVICE_BY_ID[s.id]?.label ?? s.id,
    s.issued, s.share.toFixed(1), s.issuedDelta.toFixed(1), s.closed, s.avgDays, s.sla, s.collected, s.outstanding,
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

/* ── Presentational helpers ── */
function Delta({ value, invert = false, unit = "%" }: { value: number; invert?: boolean; unit?: string }) {
  const flat = Math.abs(value) < 0.05;
  const down = value < 0;
  const good = invert ? down : !down;
  const Icon = down ? ArrowDownRight : ArrowUpRight;
  if (flat) return <span className="text-[11px] font-medium text-gray-400">no change</span>;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${good ? "text-emerald-600" : "text-red-500"}`}>
      <Icon className="w-3 h-3" />
      {value >= 0 ? "+" : ""}{value.toFixed(1)}{unit}
    </span>
  );
}

function Kpi({
  icon: Icon, label, value, sub, tint, delta,
}: {
  icon: typeof Wallet; label: string; value: string; sub?: string; tint: string; delta?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${tint}1A` }}>
          <Icon className="w-5 h-5" style={{ color: tint } as React.CSSProperties} />
        </span>
        {delta}
      </div>
      <p className="text-2xl font-bold text-gray-800 mt-3">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="pt-2">
      <h2 className="text-lg font-bold text-gray-800 leading-tight">{children}</h2>
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

function ServiceCell({ id }: { id: string }) {
  const svc = SERVICE_BY_ID[id];
  return (
    <span className="inline-flex items-center gap-2 text-gray-700 whitespace-nowrap">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: svc?.color }} />
      {svc?.short ?? id}
    </span>
  );
}

const tooltipStyle = { borderRadius: 12, border: "1px solid #EEF0F4", fontSize: 12 };
const lakShort = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}K` : String(n));

export function ReportsPage() {
  const [dateRange, setDateRange] = useState<DateRange>(ALL_TIME);
  const [location, setLocation] = useState<LocationValue>(NO_LOCATION);
  const r = useMemo(() => buildReport(dateRange, location.province), [dateRange, location.province]);
  const d = useMemo(() => buildDemographics(location), [location]);
  const per = r.granularity === "day" ? "day" : r.granularity === "week" ? "week" : "month";
  const deeperThanProvince = !!(location.district || location.village);

  return (
    <div className="max-w-screen-2xl mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Reports &amp; Analytics</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Trends, rates and regional comparison — deltas are versus the previous period of equal length.
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

      {/* Location filter — scopes the whole report */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        <LocationFilter value={location} onChange={setLocation} />
        {deeperThanProvince && (
          <p className="text-xs text-gray-400 mt-2">
            Certificate and financial figures are tracked at province level, so they reflect{" "}
            <span className="font-medium text-gray-600">{location.province}</span>. Population analytics below use the
            selected {location.village ? "village" : "district"}.
          </p>
        )}
      </div>

      {/* ═══ 1. Certificate volume ═══ */}
      <SectionTitle sub="Registration and issuance output over time">Certificate volume</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={FileText} label="Applications received" value={r.received.toLocaleString()} tint="#3752AE" delta={r.comparable && <Delta value={r.receivedDelta} />} />
        <Kpi icon={FileCheck2} label="Certificates issued" value={r.issued.toLocaleString()} tint="#10B981" delta={r.comparable && <Delta value={r.issuedDelta} />} />
        <Kpi icon={Percent} label="Issuance rate" value={`${r.issuanceRate.toFixed(1)}%`} sub="issued ÷ received" tint="#0EA5E9" delta={r.comparable && <Delta value={r.issuanceRateDelta} unit=" pp" />} />
        <Kpi icon={Timer} label="Avg. processing" value={`${r.avgDays} days`} sub={`${r.slaOverall}% within target`} tint="#6D28D9" delta={r.comparable && <Delta value={r.avgDaysDelta} invert />} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title={`Received vs issued per ${per}`} sub="Throughput trend" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={r.series} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} width={36} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="received" name="Received" stroke="#3752AE" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="issued" name="Issued" stroke="#10B981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#3752AE]" /> Received</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Issued</span>
          </div>
        </Card>
        <Card title="Issued by service" sub="Share of certificates issued">
          <ReportTable
            head={["Service", "Issued", "Share", "Δ"]}
            rows={r.serviceRows.map((s) => [
              <ServiceCell key="s" id={s.id} />,
              s.issued.toLocaleString(),
              `${s.share.toFixed(0)}%`,
              r.comparable ? <Delta key="d" value={s.issuedDelta} /> : <span key="d" className="text-gray-300">—</span>,
            ])}
          />
        </Card>
      </div>

      {/* ═══ 2. Financial report ═══ */}
      <SectionTitle sub="Fee collection, outstanding balances and payment mix">Financial report</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Wallet} label="Collected" value={formatLak(r.collected)} tint="#10B981" delta={r.comparable && <Delta value={r.collectedDelta} />} />
        <Kpi icon={Percent} label="Collection rate" value={`${r.collectionRate.toFixed(1)}%`} sub={`of ${formatLak(r.billed)} billed`} tint="#0EA5E9" delta={r.comparable && <Delta value={r.collectionRateDelta} unit=" pp" />} />
        <Kpi icon={AlertTriangle} label="Outstanding" value={formatLak(r.outstanding)} sub={`${r.unpaidCases} unpaid receipts`} tint="#F59E0B" />
        <Kpi icon={FileText} label="Avg. per receipt" value={formatLak(r.avgReceipt)} tint="#3752AE" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title={`Revenue per ${per}`} sub="Collected vs still outstanding" className="lg:col-span-2">
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
                <span className="text-gray-700 font-medium">{r.collected ? Math.round((p.value / r.collected) * 100) : 0}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card title="Revenue by service" sub="Collected against each service this period">
        <ReportTable
          head={["Service", "Collected", "Outstanding", "Paid receipts", "Unpaid"]}
          rows={r.serviceRows.map((s) => [
            <ServiceCell key="s" id={s.id} />,
            s.collected ? formatLak(s.collected) : SERVICE_BY_ID[s.id]?.fee === 0 ? "Free" : "—",
            s.outstanding ? formatLak(s.outstanding) : "—",
            s.receipts ? s.receipts.toLocaleString() : "—",
            s.unpaid ? s.unpaid.toLocaleString() : "—",
          ])}
        />
      </Card>

      {/* ═══ 3. Population & demographic analytics ═══ */}
      <SectionTitle sub={`Structure and distribution — ${d.area.name}`}>
        Population &amp; demographic analytics
      </SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Users} label="Registered population" value={d.area.population.toLocaleString()} sub={`${d.area.male.toLocaleString()} M · ${d.area.female.toLocaleString()} F`} tint="#3752AE" />
        <Kpi icon={Scale} label="Sex ratio" value={`${d.sexRatio}`} sub="males per 100 females" tint="#0EA5E9" />
        <Kpi icon={Users} label="Working-age share" value={`${d.workingPct}%`} sub={`${d.area.workingAge.toLocaleString()} aged 15–64`} tint="#6D28D9" />
        <Kpi icon={Globe} label="Foreign residents" value={`${d.foreignPct.toFixed(1)}%`} sub={`${d.area.foreign.toLocaleString()} people`} tint="#F59E0B" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Components of population change" sub="What drives growth each month · national" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={d.change} margin={{ left: 4, right: 8, top: 8 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} width={36} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="natural" name="Natural increase" fill="#10B981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="migration" name="Net migration" fill="#3752AE" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Natural increase (births − deaths)</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#3752AE]" /> Net migration (in − out)</span>
          </div>
        </Card>
        <Card title="Concentration" sub={`Largest ${d.area.childLabel.replace(/s$/, "").toLowerCase() || "area"} in ${d.area.name}`}>
          {d.childRows.length > 0 ? (
            <>
              <div className="flex flex-col items-center justify-center py-2">
                <p className="text-4xl font-bold text-gray-800">{d.concentration.toFixed(0)}%</p>
                <p className="text-sm text-gray-500 mt-1 text-center">
                  of the population lives in <span className="font-medium text-gray-700">{d.topChild}</span>
                </p>
              </div>
              <div className="mt-3 space-y-2">
                {d.childRows.slice(0, 5).map((rg) => (
                  <div key={rg.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-600 truncate pr-2">{rg.name}</span>
                      <span className="text-gray-500 tabular-nums">{rg.share.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-[#3752AE]" style={{ width: `${(rg.share / d.maxShare) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 py-8 text-center">Village level — no further breakdown.</p>
          )}
        </Card>
      </div>
      {d.childRows.length > 0 && (
        <Card
          title={`${d.area.childLabel} of ${d.area.name}`}
          sub={`Distribution and structure across ${d.childRows.length} ${d.area.childLabel.toLowerCase()}`}
        >
          <ReportTable
            head={[d.area.childLabel.replace(/s$/, ""), "Population", "Share", "Households", "Sex ratio", "Working-age"]}
            rows={d.childRows.map((rg) => [
              <span key="p" className="text-gray-800">{rg.name}</span>,
              rg.population.toLocaleString(),
              `${rg.share.toFixed(1)}%`,
              rg.households.toLocaleString(),
              `${rg.sexRatio}`,
              `${rg.workingPct}%`,
            ])}
          />
        </Card>
      )}
    </div>
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
