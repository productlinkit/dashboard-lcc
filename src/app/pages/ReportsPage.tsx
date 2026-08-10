import { useMemo, useState } from "react";
import {
  Download, FileText, FileCheck2, Wallet, Percent, Timer, ArrowUpRight, ArrowDownRight,
  Users, Globe, Scale, AlertTriangle, RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Cell, PieChart, Pie,
} from "recharts";
import { toast } from "sonner";
import { dashboard, payments, registry, reports } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import type { ApiError } from "../api/client";
import {
  text,
  type AreaSummary, type DemographicMonth, type OperationalReportRow, type RegionStat,
  type RevenueReport, type TransactionSummary, type VolumePoint,
} from "../api/types";
import {
  DateRangeFilter, dateParams, previousPeriod, rangeSpanDays, ALL_TIME, type DateRange,
} from "../components/DateRangeFilter";
import { formatLak } from "../serviceConfig";
import { LocationFilter, NO_LOCATION, type LocationValue } from "../components/LocationFilter";
import { Popover, PopoverTrigger, PopoverContent } from "../components/ui/popover";

/*
 * Reports & Analytics — turns the registry's raw records into insight: trends,
 * rates, period-on-period change and regional comparison. Structured as the
 * ministry reads it: Certificate volume → Financial → Population analytics.
 *
 * Every number is aggregated by the API. The three report endpoints answer for
 * the selected period, and the same call is repeated over the preceding window
 * of equal length so each figure can carry a real delta rather than a guess.
 */

/* ── Wire shapes the shared types do not spell out in full ── */

type OpRow = OperationalReportRow & {
  short_name?: string;
  color?: string;
  rejected?: number;
  in_progress?: number;
  closed_cases?: number;
  target_days?: number;
  median_days?: number;
  certificates_issued?: number;
  collected_lak?: number;
  outstanding_lak?: number;
  paid_receipts?: number;
  unpaid_receipts?: number;
};

type RevenueFull = RevenueReport & {
  collected_lak?: number;
  outstanding_lak?: number;
  refunded_lak?: number;
  billed_lak?: number;
  avg_receipt_lak?: number;
  receipts?: number;
  paid_receipts?: number;
  unpaid_receipts?: number;
  collection_rate_pct?: number;
};

interface RegistrationCounts {
  births: number;
  deaths: number;
  marriages: number;
  divorces: number;
  residence_certificates: number;
  family_books: number;
  total: number;
}

interface RegistrationFull {
  totals: RegistrationCounts;
  by_period: Array<{ period: string; month: string; counts: RegistrationCounts }>;
  by_area: Array<{ province_id?: string; geo_name?: string; counts: RegistrationCounts }>;
}

type AreaFull = AreaSummary & {
  id?: string;
  children: Array<{ id?: string; name: string; population: number; households: number }>;
};

const REPORT_EXPORTS = [
  { id: "operational", label: "Operational report" },
  { id: "revenue", label: "Revenue report" },
  { id: "registration", label: "Registration report" },
  { id: "audit", label: "Audit trail" },
] as const;

const FALLBACK_COLOR = "#3752AE";

function pctChange(now: number, prev: number): number {
  if (prev === 0) return now === 0 ? 0 : 100;
  return ((now - prev) / prev) * 100;
}

function sum<T>(rows: T[], pick: (row: T) => number | undefined): number {
  return rows.reduce((acc, row) => acc + (pick(row) ?? 0), 0);
}

/** Volume-weighted mean, so a high-traffic service is not outvoted by a rare one. */
function weighted<T>(rows: T[], value: (row: T) => number | undefined, weight: (row: T) => number | undefined): number {
  const total = sum(rows, weight);
  if (total === 0) return 0;
  return sum(rows, (r) => (value(r) ?? 0) * (weight(r) ?? 0)) / total;
}

function downloadCsv(csv: string, name: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
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

function ServiceCell({ label, color }: { label: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-gray-700 whitespace-nowrap">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color ?? FALLBACK_COLOR }} />
      {label}
    </span>
  );
}

function Failed({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm text-center">
      <p className="text-sm text-gray-600">{error.message}</p>
      <button
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
      >
        <RefreshCw className="w-4 h-4" /> Retry
      </button>
    </div>
  );
}

const tooltipStyle = { borderRadius: 12, border: "1px solid #EEF0F4", fontSize: 12 };
const lakShort = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}K` : String(n));

export function ReportsPage() {
  const [dateRange, setDateRange] = useState<DateRange>(ALL_TIME);
  const [location, setLocation] = useState<LocationValue>(NO_LOCATION);

  /* Case and receipt records carry a province, so the operational and financial
   * reports narrow no further than that; the population section drills all the
   * way to a village. */
  const reportParams = useMemo(
    () => ({ ...dateParams(dateRange), province_id: location.provinceId ?? undefined }),
    [dateRange, location.provinceId],
  );
  const reportKey = JSON.stringify(reportParams);

  const prevRange = useMemo(() => previousPeriod(dateRange), [dateRange]);
  const comparable = rangeSpanDays(dateRange) > 0;
  const prevParams = useMemo(
    () => ({ ...dateParams(prevRange), province_id: location.provinceId ?? undefined }),
    [prevRange, location.provinceId],
  );
  const prevKey = JSON.stringify(prevParams);

  const areaParams = useMemo(
    () => ({
      province_id: location.provinceId ?? undefined,
      district_id: location.districtId ?? undefined,
      village_id: location.villageId ?? undefined,
    }),
    [location.provinceId, location.districtId, location.villageId],
  );
  const areaKey = JSON.stringify(areaParams);

  /* ── Queries ── */
  const opQuery = useQuery(
    async (signal) => ((await reports.operational(reportParams, signal)) as { rows: OpRow[] }).rows ?? [],
    [reportKey],
  );
  const revenueQuery = useQuery(
    (signal) => reports.revenue(reportParams, signal) as Promise<RevenueFull>,
    [reportKey],
  );
  const registrationQuery = useQuery(
    async (signal) => (await reports.registration(reportParams, signal)) as unknown as RegistrationFull,
    [reportKey],
  );
  /* Outstanding has no per-day bucket on the revenue report, so the pending
   * side of the stacked bars comes from the payments ledger. */
  const pendingQuery = useQuery(
    (signal) => payments.summary({ ...reportParams, status: "pending" }, signal) as Promise<TransactionSummary>,
    [reportKey],
  );

  const prevOpQuery = useQuery(
    async (signal) => ((await reports.operational(prevParams, signal)) as { rows: OpRow[] }).rows ?? [],
    [prevKey],
    { enabled: comparable },
  );
  const prevRevenueQuery = useQuery(
    (signal) => reports.revenue(prevParams, signal) as Promise<RevenueFull>,
    [prevKey],
    { enabled: comparable },
  );

  /* Throughput over time: days while the window is short enough to read, months
   * once it is not. */
  const span = rangeSpanDays(dateRange);
  const granularity: "day" | "month" = span > 0 && span <= 62 ? "day" : "month";
  const volumeQuery = useQuery(
    (signal) =>
      granularity === "day"
        ? dashboard.volumeDaily(reportParams, signal)
        : dashboard.volumeMonthly({ province_id: location.provinceId ?? undefined }, signal),
    [reportKey, granularity],
  );

  const areaQuery = useQuery((signal) => registry.area(areaParams, signal) as Promise<AreaFull>, [areaKey]);
  const trendQuery = useQuery(
    (signal) => registry.trend({ province_id: location.provinceId ?? undefined }, signal),
    [location.provinceId],
  );
  const regionsQuery = useQuery((signal) => registry.regions(undefined, signal), []);

  /* ── Certificate volume ── */
  const opRows = useMemo<OpRow[]>(() => opQuery.data ?? [], [opQuery.data]);
  const prevOpRows = useMemo<OpRow[]>(() => prevOpQuery.data ?? [], [prevOpQuery.data]);

  const received = sum(opRows, (r) => r.volume);
  const prevReceived = sum(prevOpRows, (r) => r.volume);
  const issued = sum(opRows, (r) => r.issued);
  const prevIssued = sum(prevOpRows, (r) => r.issued);
  const issuanceRate = received ? (issued / received) * 100 : 0;
  const prevIssuanceRate = prevReceived ? (prevIssued / prevReceived) * 100 : 0;
  const avgDays = weighted(opRows, (r) => r.avg_days, (r) => r.closed_cases ?? r.volume);
  const prevAvgDays = weighted(prevOpRows, (r) => r.avg_days, (r) => r.closed_cases ?? r.volume);
  const slaOverall = weighted(opRows, (r) => r.on_time_pct, (r) => r.closed_cases ?? r.volume);

  const serviceRows = useMemo(
    () =>
      opRows
        .map((r) => {
          const prev = prevOpRows.find((p) => p.service_code === r.service_code);
          return {
            code: r.service_code,
            label: r.short_name || text(r.label) || r.service_code,
            color: r.color,
            issued: r.issued,
            share: issued ? (r.issued / issued) * 100 : 0,
            issuedDelta: pctChange(r.issued, prev?.issued ?? 0),
            collected: r.collected_lak ?? 0,
            outstanding: r.outstanding_lak ?? 0,
            receipts: r.paid_receipts ?? 0,
            unpaid: r.unpaid_receipts ?? 0,
          };
        })
        .sort((a, b) => b.issued - a.issued),
    [opRows, prevOpRows, issued],
  );

  const registration = registrationQuery.data;

  /* ── Financial ── */
  const revenue = revenueQuery.data;
  const prevRevenue = prevRevenueQuery.data;
  const collected = revenue?.collected_lak ?? 0;
  const prevCollected = prevRevenue?.collected_lak ?? 0;
  const outstanding = revenue?.outstanding_lak ?? 0;
  const billed = revenue?.billed_lak ?? collected + outstanding;
  const collectionRate = revenue?.collection_rate_pct ?? (billed ? (collected / billed) * 100 : 0);
  const prevCollectionRate = prevRevenue?.collection_rate_pct ?? 0;
  const avgReceipt = revenue?.avg_receipt_lak ?? 0;
  const unpaidReceipts = revenue?.unpaid_receipts ?? 0;

  const payMethods = useMemo(
    () =>
      (revenue?.by_method ?? [])
        .filter((m) => m.amount_lak > 0)
        .map((m) => ({ id: m.key, name: m.label || m.key, value: m.amount_lak, color: m.color || FALLBACK_COLOR })),
    [revenue],
  );

  /* ── Time series ── */
  const series = useMemo(() => {
    const volume = (volumeQuery.data ?? []) as VolumePoint[];
    const collectedByKey: Record<string, number> = {};
    for (const b of revenue?.by_day ?? []) collectedByKey[b.key] = b.amount_lak;
    const outstandingByKey: Record<string, number> = {};
    for (const b of pendingQuery.data?.by_day ?? []) outstandingByKey[b.key] = b.amount_lak;

    if (volume.length > 0) {
      return volume.map((p) => {
        const key = p.date ?? p.month ?? p.day ?? "";
        return {
          day: granularity === "day" ? key.slice(5) : key,
          received: p.applications,
          issued: p.issued ?? 0,
          collected: collectedByKey[key] ?? 0,
          outstanding: outstandingByKey[key] ?? 0,
        };
      });
    }

    // No case volume to plot: still show the money, keyed by its own days.
    const keys = Array.from(new Set([...Object.keys(collectedByKey), ...Object.keys(outstandingByKey)])).sort();
    return keys.map((key) => ({
      day: key.slice(5),
      received: 0,
      issued: 0,
      collected: collectedByKey[key] ?? 0,
      outstanding: outstandingByKey[key] ?? 0,
    }));
  }, [volumeQuery.data, revenue, pendingQuery.data, granularity]);

  const per = granularity === "day" ? "day" : "month";

  /* ── Population analytics ── */
  const area = areaQuery.data;
  const regionByProvince = useMemo(() => {
    const map: Record<string, RegionStat> = {};
    for (const r of regionsQuery.data ?? []) if (r.province_id) map[r.province_id] = r;
    return map;
  }, [regionsQuery.data]);

  const sexRatio = area && area.female ? Math.round((area.male / area.female) * 100) : 0;
  const workingPct = area && area.population ? Math.round((area.working_age / area.population) * 100) : 0;
  const foreignPct = area && area.population ? (area.foreign / area.population) * 100 : 0;

  const childRows = useMemo(() => {
    if (!area) return [];
    return area.children.map((c) => {
      const region = c.id ? regionByProvince[c.id] : undefined;
      return {
        key: c.id ?? c.name,
        name: c.name,
        population: c.population,
        households: c.households,
        share: area.population ? (c.population / area.population) * 100 : 0,
        sexRatio: region && region.female ? Math.round((region.male / region.female) * 100) : null,
        workingPct: region && region.population ? Math.round((region.working_age / region.population) * 100) : null,
      };
    });
  }, [area, regionByProvince]);
  const sortedChildren = useMemo(() => [...childRows].sort((a, b) => b.share - a.share), [childRows]);

  const change = useMemo(
    () =>
      ((trendQuery.data ?? []) as DemographicMonth[]).map((m) => ({
        month: m.month,
        natural: m.births - m.deaths,
        migration: m.moved_in - m.moved_out,
        population: m.population,
      })),
    [trendQuery.data],
  );

  /* ── Export ── */
  const [exporting, setExporting] = useState<string | null>(null);
  async function exportReport(report: string) {
    setExporting(report);
    try {
      const csv = await reports.exportCSV(report, reportParams);
      downloadCsv(csv, `${report}-report-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      toast.error("Export failed", { description: (err as ApiError).message });
    } finally {
      setExporting(null);
    }
  }

  const areaName = area?.name ?? location.village ?? location.district ?? location.province ?? "Lao PDR";
  const childLabel = area?.child_label ?? "Areas";
  const deeperThanProvince = !!(location.districtId || location.villageId);

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
          <Popover>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b]">
                <Download className="w-4 h-4" /> Export
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
              <p className="px-2 py-1 mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Download CSV
              </p>
              {REPORT_EXPORTS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => exportReport(r.id)}
                  disabled={exporting !== null}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {exporting === r.id ? "Preparing…" : r.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>
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
      {opQuery.error ? (
        <Failed error={opQuery.error} onRetry={opQuery.refetch} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi
              icon={FileText}
              label="Applications received"
              value={opQuery.loading ? "…" : received.toLocaleString()}
              tint="#3752AE"
              delta={comparable && !prevOpQuery.loading && <Delta value={pctChange(received, prevReceived)} />}
            />
            <Kpi
              icon={FileCheck2}
              label="Certificates issued"
              value={opQuery.loading ? "…" : issued.toLocaleString()}
              sub={registration ? `${registration.totals.total.toLocaleString()} events entered the register` : undefined}
              tint="#10B981"
              delta={comparable && !prevOpQuery.loading && <Delta value={pctChange(issued, prevIssued)} />}
            />
            <Kpi
              icon={Percent}
              label="Issuance rate"
              value={`${issuanceRate.toFixed(1)}%`}
              sub="issued ÷ received"
              tint="#0EA5E9"
              delta={comparable && !prevOpQuery.loading && <Delta value={issuanceRate - prevIssuanceRate} unit=" pp" />}
            />
            <Kpi
              icon={Timer}
              label="Avg. processing"
              value={`${avgDays.toFixed(1)} days`}
              sub={`${slaOverall.toFixed(0)}% within target`}
              tint="#6D28D9"
              delta={comparable && !prevOpQuery.loading && <Delta value={pctChange(avgDays, prevAvgDays)} invert />}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title={`Received vs issued per ${per}`} sub="Throughput trend" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={series} margin={{ left: 4, right: 8, top: 8 }}>
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
                loading={opQuery.loading}
                head={["Service", "Issued", "Share", "Δ"]}
                rows={serviceRows.map((s) => [
                  <ServiceCell key="s" label={s.label} color={s.color} />,
                  s.issued.toLocaleString(),
                  `${s.share.toFixed(0)}%`,
                  comparable ? <Delta key="d" value={s.issuedDelta} /> : <span key="d" className="text-gray-300">—</span>,
                ])}
              />
            </Card>
          </div>
        </>
      )}

      {/* ═══ 2. Financial report ═══ */}
      <SectionTitle sub="Fee collection, outstanding balances and payment mix">Financial report</SectionTitle>
      {revenueQuery.error ? (
        <Failed error={revenueQuery.error} onRetry={revenueQuery.refetch} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi
              icon={Wallet}
              label="Collected"
              value={revenueQuery.loading ? "…" : formatLak(collected)}
              tint="#10B981"
              delta={comparable && !prevRevenueQuery.loading && <Delta value={pctChange(collected, prevCollected)} />}
            />
            <Kpi
              icon={Percent}
              label="Collection rate"
              value={`${collectionRate.toFixed(1)}%`}
              sub={`of ${formatLak(billed)} billed`}
              tint="#0EA5E9"
              delta={comparable && !prevRevenueQuery.loading && <Delta value={collectionRate - prevCollectionRate} unit=" pp" />}
            />
            <Kpi
              icon={AlertTriangle}
              label="Outstanding"
              value={formatLak(outstanding)}
              sub={`${unpaidReceipts} unpaid receipts`}
              tint="#F59E0B"
            />
            <Kpi icon={FileText} label="Avg. per receipt" value={formatLak(avgReceipt)} tint="#3752AE" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title={`Revenue per ${per}`} sub="Collected vs still outstanding" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={series} margin={{ left: 4, right: 8, top: 8 }}>
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
                  <Pie data={payMethods} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={44} outerRadius={72} paddingAngle={3} cornerRadius={8} stroke="none">
                    {payMethods.map((p) => (
                      <Cell key={p.id} fill={p.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatLak(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {payMethods.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-gray-500 truncate">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} /> {p.name}
                    </span>
                    <span className="text-gray-700 font-medium">{collected ? Math.round((p.value / collected) * 100) : 0}%</span>
                  </div>
                ))}
                {payMethods.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-2">
                    {revenueQuery.loading ? "Loading…" : "No fees collected in this period."}
                  </p>
                )}
              </div>
            </Card>
          </div>
          <Card title="Revenue by service" sub="Collected against each service this period">
            <ReportTable
              loading={opQuery.loading}
              head={["Service", "Collected", "Outstanding", "Paid receipts", "Unpaid"]}
              rows={serviceRows.map((s) => [
                <ServiceCell key="s" label={s.label} color={s.color} />,
                s.collected ? formatLak(s.collected) : "—",
                s.outstanding ? formatLak(s.outstanding) : "—",
                s.receipts ? s.receipts.toLocaleString() : "—",
                s.unpaid ? s.unpaid.toLocaleString() : "—",
              ])}
            />
          </Card>
        </>
      )}

      {/* ═══ 3. Population & demographic analytics ═══ */}
      <SectionTitle sub={`Structure and distribution — ${areaName}`}>
        Population &amp; demographic analytics
      </SectionTitle>
      {areaQuery.error ? (
        <Failed error={areaQuery.error} onRetry={areaQuery.refetch} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi
              icon={Users}
              label="Registered population"
              value={areaQuery.loading ? "…" : (area?.population ?? 0).toLocaleString()}
              sub={`${(area?.male ?? 0).toLocaleString()} M · ${(area?.female ?? 0).toLocaleString()} F`}
              tint="#3752AE"
            />
            <Kpi icon={Scale} label="Sex ratio" value={`${sexRatio}`} sub="males per 100 females" tint="#0EA5E9" />
            <Kpi
              icon={Users}
              label="Working-age share"
              value={`${workingPct}%`}
              sub={`${(area?.working_age ?? 0).toLocaleString()} aged 15–64`}
              tint="#6D28D9"
            />
            <Kpi
              icon={Globe}
              label="Foreign residents"
              value={`${foreignPct.toFixed(1)}%`}
              sub={`${(area?.foreign ?? 0).toLocaleString()} people`}
              tint="#F59E0B"
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="Components of population change" sub="What drives growth each month" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={change} margin={{ left: 4, right: 8, top: 8 }} barGap={2}>
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
            <Card title="Concentration" sub={`Largest ${childLabel.replace(/s$/, "").toLowerCase() || "area"} in ${areaName}`}>
              {sortedChildren.length > 0 ? (
                <>
                  <div className="flex flex-col items-center justify-center py-2">
                    <p className="text-4xl font-bold text-gray-800">{sortedChildren[0].share.toFixed(0)}%</p>
                    <p className="text-sm text-gray-500 mt-1 text-center">
                      of the population lives in <span className="font-medium text-gray-700">{sortedChildren[0].name}</span>
                    </p>
                  </div>
                  <div className="mt-3 space-y-2">
                    {sortedChildren.slice(0, 5).map((rg) => (
                      <div key={rg.key}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-600 truncate pr-2">{rg.name}</span>
                          <span className="text-gray-500 tabular-nums">{rg.share.toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#3752AE]"
                            style={{ width: `${(rg.share / (sortedChildren[0].share || 1)) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400 py-8 text-center">
                  {areaQuery.loading ? "Loading…" : "Village level — no further breakdown."}
                </p>
              )}
            </Card>
          </div>
          {sortedChildren.length > 0 && (
            <Card
              title={`${childLabel} of ${areaName}`}
              sub={`Distribution and structure across ${sortedChildren.length} ${childLabel.toLowerCase()}`}
            >
              <ReportTable
                head={[childLabel.replace(/s$/, ""), "Population", "Share", "Households", "Sex ratio", "Working-age"]}
                rows={sortedChildren.map((rg) => [
                  <span key="p" className="text-gray-800">{rg.name}</span>,
                  rg.population.toLocaleString(),
                  `${rg.share.toFixed(1)}%`,
                  rg.households.toLocaleString(),
                  rg.sexRatio === null ? "—" : `${rg.sexRatio}`,
                  rg.workingPct === null ? "—" : `${rg.workingPct}%`,
                ])}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ReportTable({
  head,
  rows,
  loading = false,
}: {
  head: string[];
  rows: React.ReactNode[][];
  loading?: boolean;
}) {
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
                {loading ? "Loading…" : "Nothing in this period."}
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
