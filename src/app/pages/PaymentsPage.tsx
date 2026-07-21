import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Search, Download, ChevronLeft, ChevronRight, Wallet, Banknote, TrendingUp,
  CircleAlert, Receipt, RotateCcw, Save, QrCode, Landmark, Coins,
} from "lucide-react";
import { toast } from "sonner";
import {
  TRANSACTIONS, DEFAULT_METHODS, DEFAULT_PRICING, KIND_LABEL, TX_STATUS_META,
  METHOD_OPTIONS, TX_STATUS_OPTIONS, SERVICE_OPTIONS, serviceLabel, formatLakShort,
  type Transaction, type PaymentMethod, type ServicePricing, type TxStatus,
} from "../data/payments";
import { SERVICES, SERVICE_BY_ID } from "../serviceConfig";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { DateRangeFilter, inRange, ALL_TIME, type DateRange } from "../components/DateRangeFilter";
import { Switch } from "../components/ui/switch";

/* Validated categorical palette (dataviz six checks — ALL PASS in this order). */
const METHOD_COLORS = ["#3752AE", "#10B981", "#F59E0B", "#EC4899", "#0EA5E9", "#8B5CF6"];
const METHOD_COLOR: Record<string, string> = Object.fromEntries(
  DEFAULT_METHODS.map((m, i) => [m.id, METHOD_COLORS[i % METHOD_COLORS.length]]),
);

const METHOD_ICON: Record<PaymentMethod["kind"], React.ComponentType<{ className?: string }>> = {
  wallet: Wallet,
  bank: Landmark,
  qr: QrCode,
  cash: Coins,
};

const TABS = [
  { id: "overview", label: "Revenue overview" },
  { id: "transactions", label: "Transactions" },
  { id: "settings", label: "Payment settings" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function lak(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} LAK`;
}

function Kpi({
  icon: Icon, label, value, sub, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; sub: string; tone: string;
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
        <p className="text-xl font-bold text-gray-800 leading-tight truncate">{value}</p>
        <p className="text-sm text-gray-600 truncate">{label}</p>
        <p className="text-xs text-gray-400 truncate">{sub}</p>
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: TxStatus }) {
  const m = TX_STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ color: m.color, backgroundColor: m.bg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
      {m.label}
    </span>
  );
}

function exportCsv(rows: Transaction[]) {
  const header = ["Receipt", "Date", "Time", "Ref no", "Payer", "Service", "Type", "Method", "Amount (LAK)", "Status", "Cashier"];
  const body = rows.map((t) => [
    t.id, t.date, t.time, t.applicationId, t.payer,
    SERVICE_BY_ID[t.serviceId]?.label ?? t.serviceId,
    KIND_LABEL[t.kind],
    DEFAULT_METHODS.find((m) => m.id === t.method)?.label ?? t.method,
    String(t.amount), TX_STATUS_META[t.status].label, t.cashier,
  ]);
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header, ...body].map((r) => r.map(escape).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PaymentsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [dateRange, setDateRange] = useState<DateRange>(ALL_TIME);

  // Transaction filters
  const [query, setQuery] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [methods, setMethods] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Settings (edited locally; Save is a mock commit)
  const [methodConfig, setMethodConfig] = useState<PaymentMethod[]>(DEFAULT_METHODS);
  const [pricing, setPricing] = useState<ServicePricing[]>(DEFAULT_PRICING);
  const [dirty, setDirty] = useState(false);

  /* The date range drives every revenue figure on the overview. */
  const inScope = useMemo(() => TRANSACTIONS.filter((t) => inRange(t.date, dateRange)), [dateRange]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inScope.filter((t) => {
      if (services.length && !services.includes(t.serviceId)) return false;
      if (methods.length && !methods.includes(t.method)) return false;
      if (statuses.length && !statuses.includes(t.status)) return false;
      if (q && !`${t.id} ${t.applicationId} ${t.payer} ${t.province}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [inScope, query, services, methods, statuses]);

  useEffect(() => setPage(1), [query, services, methods, statuses, dateRange, pageSize]);

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  /* ── Revenue aggregates ── */
  const paid = inScope.filter((t) => t.status === "paid");
  const collected = paid.reduce((s, t) => s + t.amount, 0);
  const outstanding = inScope.filter((t) => t.status === "pending").reduce((s, t) => s + t.amount, 0);
  const refunded = inScope.filter((t) => t.status === "refunded").reduce((s, t) => s + t.amount, 0);
  const billed = collected + outstanding;
  const collectionRate = billed > 0 ? (collected / billed) * 100 : 0;
  const avgTicket = paid.length ? collected / paid.length : 0;

  /* Daily revenue — collapses to weekly buckets on long ranges so bars stay readable. */
  const trend = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const t of paid) byDay[t.date] = (byDay[t.date] ?? 0) + t.amount;
    const days = Object.keys(byDay).sort();
    if (days.length <= 31) {
      return days.map((d) => ({ label: `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`, revenue: byDay[d] }));
    }
    const buckets: { label: string; revenue: number }[] = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      const d = chunk[0];
      buckets.push({
        label: `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`,
        revenue: chunk.reduce((s, k) => s + byDay[k], 0),
      });
    }
    return buckets;
  }, [paid]);

  const byService = useMemo(() => {
    const acc: Record<string, { collected: number; outstanding: number; count: number }> = {};
    for (const s of SERVICES) acc[s.id] = { collected: 0, outstanding: 0, count: 0 };
    for (const t of inScope) {
      const a = acc[t.serviceId];
      if (!a) continue;
      if (t.status === "paid") { a.collected += t.amount; a.count += 1; }
      if (t.status === "pending") a.outstanding += t.amount;
    }
    return SERVICES.map((s) => ({ service: s, ...acc[s.id] })).sort((a, b) => b.collected - a.collected);
  }, [inScope]);
  const maxService = Math.max(1, ...byService.map((r) => r.collected));

  const byMethod = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const t of paid) acc[t.method] = (acc[t.method] ?? 0) + t.amount;
    return DEFAULT_METHODS.map((m) => ({
      id: m.id, name: m.label, value: acc[m.id] ?? 0, color: METHOD_COLOR[m.id],
    })).filter((r) => r.value > 0);
  }, [paid]);

  function updateMethod(id: string, patch: Partial<PaymentMethod>) {
    setMethodConfig((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    setDirty(true);
  }

  function updatePricing(serviceId: string, patch: Partial<ServicePricing>) {
    setPricing((prev) => prev.map((p) => (p.serviceId === serviceId ? { ...p, ...patch } : p)));
    setDirty(true);
  }

  function saveSettings() {
    const enabled = methodConfig.filter((m) => m.enabled).length;
    if (enabled === 0) {
      toast.error("At least one payment method must stay enabled");
      return;
    }
    setDirty(false);
    toast.success("Payment settings saved", {
      description: `${enabled} method${enabled !== 1 ? "s" : ""} enabled · fees applied to new applications only.`,
    });
  }

  function resetSettings() {
    setMethodConfig(DEFAULT_METHODS);
    setPricing(DEFAULT_PRICING);
    setDirty(false);
    toast.info("Settings reverted to the published configuration");
  }

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Payments &amp; Revenue</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Fee collection, receipts and reconciliation across the fee-bearing services.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab !== "settings" && <DateRangeFilter onChange={setDateRange} />}
          {tab === "transactions" && (
            <button
              onClick={() => exportCsv(rows)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b]"
            >
              <Download className="w-4 h-4" /> Export
            </button>
          )}
        </div>
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
                className={`px-3.5 py-2 rounded-xl text-sm transition-colors ${
                  active ? "bg-[#3752AE] text-white font-semibold" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {t.label}
                {t.id === "settings" && dirty && (
                  <span className="ml-2 text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    Unsaved
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Overview ── */}
      {tab === "overview" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Kpi icon={Banknote} label="Collected" value={lak(collected)} sub={`${paid.length} paid receipts`} tone="#047857" />
            <Kpi icon={CircleAlert} label="Outstanding" value={lak(outstanding)} sub="Awaiting payment" tone="#B45309" />
            <Kpi icon={TrendingUp} label="Collection rate" value={`${collectionRate.toFixed(1)}%`} sub={`of ${lak(billed)} billed`} tone="#3752AE" />
            <Kpi icon={Receipt} label="Average receipt" value={lak(avgTicket)} sub={`${lak(refunded)} refunded`} tone="#6D28D9" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* Revenue trend */}
            <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-800">Revenue collected</h2>
              <p className="text-sm text-gray-400 mb-3">
                {trend.length <= 31 ? "Per day" : "Per week"} · {lak(collected)} total
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
                    <CartesianGrid vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="label" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tickFormatter={formatLakShort} tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip
                      cursor={{ fill: "#F8FAFC" }}
                      formatter={(v: number) => [lak(v), "Collected"]}
                      contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }}
                    />
                    <Bar dataKey="revenue" fill="#3752AE" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Method split */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-800">By payment method</h2>
              <p className="text-sm text-gray-400 mb-2">Share of collected revenue</p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byMethod} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={70} paddingAngle={3} cornerRadius={8} stroke="none">
                      {byMethod.map((m) => (
                        <Cell key={m.id} fill={m.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number, n) => [lak(v), n as string]}
                      contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 mt-2">
                {byMethod.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
                    <span className="text-gray-600 flex-1 truncate">{m.name}</span>
                    <span className="font-medium text-gray-800">
                      {collected > 0 ? ((m.value / collected) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Revenue by service */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Revenue by service</h2>
              <p className="text-sm text-gray-400">Collected, outstanding, and current tariff</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="px-5 py-3 font-medium">Service</th>
                    <th className="px-4 py-3 font-medium">Tariff</th>
                    <th className="px-4 py-3 font-medium">Receipts</th>
                    <th className="px-4 py-3 font-medium">Collected</th>
                    <th className="px-4 py-3 font-medium">Outstanding</th>
                    <th className="px-4 py-3 font-medium w-1/4">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {byService.map((r) => (
                    <tr key={r.service.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-2 text-gray-800">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: r.service.color }} />
                          {r.service.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {r.service.fee === 0 ? "Free" : lak(r.service.fee)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{r.count}</td>
                      <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{lak(r.collected)}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {r.outstanding > 0 ? lak(r.outstanding) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${(r.collected / maxService) * 100}%`, backgroundColor: r.service.color }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Transactions ── */}
      {tab === "transactions" && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex-1">
                <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by receipt, ref no, payer, or province…"
                  className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder:text-gray-400"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <MultiSelectFilter label="Services" options={SERVICE_OPTIONS} selected={services} onChange={setServices} />
                <MultiSelectFilter label="Method" options={METHOD_OPTIONS} selected={methods} onChange={setMethods} />
                <MultiSelectFilter label="Status" options={TX_STATUS_OPTIONS} selected={statuses} onChange={setStatuses} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">
                {totalRows} transaction{totalRows !== 1 ? "s" : ""}
                <span className="text-gray-400 font-normal">
                  {" "}· {lak(rows.filter((t) => t.status === "paid").reduce((s, t) => s + t.amount, 0))} collected
                </span>
              </h2>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="hidden sm:inline">Rows</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="bg-gray-50 border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 text-sm text-gray-700 outline-none focus:border-[#3752AE]"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="px-5 py-3 font-medium">Receipt</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Payer</th>
                    <th className="px-4 py-3 font-medium">Service</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Method</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="pl-4 pr-5 py-3 font-medium">Cashier</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((t) => (
                    <tr key={t.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      <td className="px-5 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{t.id}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {t.date}
                        <span className="block text-[11px] text-gray-400">{t.time}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        {t.payer}
                        <span className="block font-mono text-[11px] text-gray-400">{t.applicationId}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 text-gray-600 whitespace-nowrap">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SERVICE_BY_ID[t.serviceId]?.color }} />
                          {serviceLabel(t.serviceId)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{KIND_LABEL[t.kind]}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 text-gray-600 whitespace-nowrap">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: METHOD_COLOR[t.method] }} />
                          {DEFAULT_METHODS.find((m) => m.id === t.method)?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800 whitespace-nowrap">
                        {t.amount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip status={t.status} />
                      </td>
                      <td className="pl-4 pr-5 py-3 text-gray-500 whitespace-nowrap">{t.cashier}</td>
                    </tr>
                  ))}
                  {totalRows === 0 && (
                    <tr>
                      <td colSpan={9} className="px-5 py-12 text-center text-sm text-gray-400">
                        No transactions match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalRows > 0 && (
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  Showing <span className="font-medium text-gray-700">{start + 1}</span>–
                  <span className="font-medium text-gray-700">{Math.min(start + pageSize, totalRows)}</span> of{" "}
                  <span className="font-medium text-gray-700">{totalRows}</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" /> Prev
                  </button>
                  <span className="text-sm text-gray-500">Page {currentPage} of {totalPages}</span>
                  <button
                    onClick={() => setPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Settings ── */}
      {tab === "settings" && (
        <>
          {/* Payment methods */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Payment methods</h2>
              <p className="text-sm text-gray-400">
                Enable the channels citizens can pay with, and record the commission withheld on settlement.
              </p>
            </div>
            <div className="divide-y divide-gray-50">
              {methodConfig.map((m) => {
                const Icon = METHOD_ICON[m.kind];
                return (
                  <div key={m.id} className="p-5 flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${METHOD_COLOR[m.id]}14`, color: METHOD_COLOR[m.id] }}
                      >
                        <Icon className="w-5 h-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{m.label}</p>
                        <p className="text-xs text-gray-400">{m.note}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <label className="text-xs text-gray-400 block">
                        Commission
                        <div className="flex items-center gap-1 mt-1">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="10"
                            value={m.feePercent}
                            onChange={(e) => updateMethod(m.id, { feePercent: Number(e.target.value) })}
                            className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 outline-none focus:border-[#3752AE]"
                          />
                          <span className="text-sm text-gray-500">%</span>
                        </div>
                      </label>

                      <label className="text-xs text-gray-400 block">
                        Settlement account
                        <input
                          value={m.settlement}
                          onChange={(e) => updateMethod(m.id, { settlement: e.target.value })}
                          className="block w-64 mt-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 outline-none focus:border-[#3752AE]"
                        />
                      </label>

                      <div className="flex items-center gap-2.5 lg:pl-2">
                        <Switch checked={m.enabled} onCheckedChange={(v) => updateMethod(m.id, { enabled: v })} />
                        <span className={`text-sm font-medium ${m.enabled ? "text-gray-700" : "text-gray-400"}`}>
                          {m.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Service pricing */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Service pricing</h2>
              <p className="text-sm text-gray-400">
                Tariffs in LAK. Set a fee to 0 to make the service free — birth and death declarations are free by law.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="px-5 py-3 font-medium">Service</th>
                    <th className="px-4 py-3 font-medium">Service fee</th>
                    <th className="px-4 py-3 font-medium">Certified copy</th>
                    <th className="px-4 py-3 font-medium">Late fine</th>
                    <th className="pl-4 pr-5 py-3 font-medium">Collected to date</th>
                  </tr>
                </thead>
                <tbody>
                  {pricing.map((p) => {
                    const svc = SERVICE_BY_ID[p.serviceId];
                    const collectedForService = TRANSACTIONS
                      .filter((t) => t.serviceId === p.serviceId && t.status === "paid")
                      .reduce((s, t) => s + t.amount, 0);
                    return (
                      <tr key={p.serviceId} className="border-b border-gray-50 last:border-0">
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-2 text-gray-800">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: svc?.color }} />
                            {svc?.label}
                          </span>
                          <span className="block text-[11px] text-gray-400 pl-4">{svc?.laLabel}</span>
                        </td>
                        {(["fee", "copyFee", "lateFine"] as const).map((field) => (
                          <td key={field} className="px-4 py-3">
                            <input
                              type="number"
                              min="0"
                              step="1000"
                              value={p[field]}
                              onChange={(e) => updatePricing(p.serviceId, { [field]: Number(e.target.value) })}
                              className="w-32 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 outline-none focus:border-[#3752AE]"
                            />
                          </td>
                        ))}
                        <td className="pl-4 pr-5 py-3 text-gray-500 whitespace-nowrap">{lak(collectedForService)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Save bar */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-gray-500">
              {dirty
                ? "You have unsaved changes. New tariffs apply to applications created after saving."
                : "Configuration matches the published settings."}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={resetSettings}
                disabled={!dirty}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4" /> Revert
              </button>
              <button
                onClick={saveSettings}
                disabled={!dirty}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" /> Save changes
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
