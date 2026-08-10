import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Search, Download, ChevronLeft, ChevronRight, Wallet, Banknote, TrendingUp,
  CircleAlert, Receipt, RotateCcw, Save, QrCode, Landmark, Coins, CreditCard,
  CheckCircle2, Undo2, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { catalog, locations, payments, reports } from "../api/endpoints";
import { useDebounced, useMutation, useQuery } from "../api/hooks";
import { useSession } from "../api/session";
import type { ApiError } from "../api/client";
import {
  text,
  type PaymentMethod, type RevenueBucket, type Service, type ServicePricing,
  type Transaction, type TransactionSummary,
} from "../api/types";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { DateRangeFilter, dateParams, ALL_TIME, type DateRange } from "../components/DateRangeFilter";
import { Switch } from "../components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../components/ui/dialog";

/*
 * Payments & Revenue.
 *
 * Every figure on this page comes from the payments API: the transaction list,
 * the revenue summary, the per-method reconciliation and the two configuration
 * lists. Filtering and paging are server-side — the browser never holds more
 * than one page of receipts, so the totals in the header are the API's totals
 * rather than a sum of what happens to be loaded.
 */

/* ── Wire shapes the shared types do not spell out in full ── */

type TxRow = Transaction & {
  time?: string;
  method_kind?: string;
  method_color?: string;
  external_ref?: string;
};

type RevenueSummary = TransactionSummary & {
  outstanding_lak?: number;
  refunded_lak?: number;
  paid_count?: number;
};

interface ReconciliationMethod {
  method_code: string;
  method_label?: { en: string; lo: string };
  method_kind?: string;
  settlement_account?: string;
  fee_percent?: number;
  color?: string;
  collected_lak: number;
  provider_fee_lak: number;
  net_lak: number;
  pending_lak?: number;
  refunded_lak?: number;
  count: number;
  unreconciled_count?: number;
  unreconciled_lak?: number;
}

interface ReconciliationPayload {
  methods: ReconciliationMethod[];
  totals?: {
    collected_lak?: number;
    provider_fee_lak?: number;
    net_lak?: number;
    count?: number;
    unreconciled_count?: number;
    unreconciled_lak?: number;
  };
}

type PricingRow = ServicePricing & { id?: string; active?: boolean; effective_at?: string };

type PriceField = "fee_lak" | "copy_fee_lak" | "late_fine_lak";

const METHOD_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  wallet: Wallet,
  bank: Landmark,
  qr: QrCode,
  cash: Coins,
};

const FALLBACK_COLOR = "#3752AE";

/* The API's own vocabulary — these strings go straight into the query. */
const TX_STATUS_OPTIONS = [
  { value: "paid", label: "Paid", color: "#047857" },
  { value: "pending", label: "Pending", color: "#B45309" },
  { value: "failed", label: "Failed", color: "#B91C1C" },
  { value: "refunded", label: "Refunded", color: "#6D28D9" },
];

const KIND_OPTIONS = [
  { value: "service-fee", label: "Service fee" },
  { value: "certified-copy", label: "Certified copy" },
  { value: "late-fine", label: "Late registration fine" },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(KIND_OPTIONS.map((k) => [k.value, k.label]));

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  paid: { label: "Paid", color: "#047857", bg: "#D1FAE5" },
  pending: { label: "Pending", color: "#B45309", bg: "#FEF3C7" },
  refunded: { label: "Refunded", color: "#6D28D9", bg: "#EDE9FE" },
  failed: { label: "Failed", color: "#B91C1C", bg: "#FEE2E2" },
};

const TABS = [
  { id: "overview", label: "Revenue overview" },
  { id: "transactions", label: "Transactions" },
  { id: "reconciliation", label: "Reconciliation" },
  { id: "settings", label: "Payment settings" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function lak(n: number): string {
  return `${Math.round(n || 0).toLocaleString("en-US")} LAK`;
}

/** Axis-sized money, unchanged from the shared formatter. */
function formatLakShort(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n || 0));
}

function downloadCsv(csv: string, name: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Shared loading / error / empty states, in the page's own card style ── */

function CardMessage({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-12 text-center text-sm text-gray-400">{children}</p>;
}

function ErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <div className="px-5 py-10 text-center">
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

function StatusChip({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, color: "#475569", bg: "#F1F5F9" };
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

export function PaymentsPage() {
  const { can } = useSession();
  const canManage = can("payments", "full");

  const [tab, setTab] = useState<Tab>("overview");
  const [dateRange, setDateRange] = useState<DateRange>(ALL_TIME);
  /* The API narrows on a single province_id, so the chip is single-select. */
  const [provinces, setProvinces] = useState<string[]>([]);

  // Transaction filters
  const [query, setQuery] = useState("");
  const search = useDebounced(query, 350);
  const [services, setServices] = useState<string[]>([]);
  const [methodCodes, setMethodCodes] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [kinds, setKinds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  /* ── Filter options ── */
  const provincesQuery = useQuery((signal) => locations.provinces(signal), []);
  const servicesQuery = useQuery((signal) => catalog.services({ per_page: 100 }, signal), []);
  const methodsQuery = useQuery((signal) => payments.methods(signal), []);

  const provinceOptions = useMemo(
    () => (provincesQuery.data ?? []).map((p) => ({ value: p.id, label: text(p.name) })),
    [provincesQuery.data],
  );
  const serviceList = useMemo<Service[]>(() => servicesQuery.data ?? [], [servicesQuery.data]);
  const serviceByCode = useMemo(() => {
    const map: Record<string, Service> = {};
    for (const s of serviceList) map[s.code] = s;
    return map;
  }, [serviceList]);
  const serviceOptions = useMemo(
    () => serviceList.map((s) => ({ value: s.code, label: text(s.name), color: s.color })),
    [serviceList],
  );
  const methodList = useMemo<PaymentMethod[]>(() => methodsQuery.data ?? [], [methodsQuery.data]);
  const methodOptions = useMemo(
    () => methodList.map((m) => ({ value: m.code, label: text(m.label), color: m.color })),
    [methodList],
  );

  /* ── Query parameters ──
   * `scope` (date + province) drives the overview and the reconciliation, and
   * the transaction list inherits it, so the tabs always agree on the period. */
  const scope = useMemo(
    () => ({ ...dateParams(dateRange), province_id: provinces[0] }),
    [dateRange, provinces],
  );
  const scopeKey = JSON.stringify(scope);

  const listFilters = useMemo(
    () => ({
      ...scope,
      search: search.trim() || undefined,
      service_code: services.length ? services : undefined,
      method_code: methodCodes.length ? methodCodes : undefined,
      status: statuses.length ? statuses : undefined,
      kind: kinds.length ? kinds : undefined,
      sort: "-paid_at",
    }),
    [scope, search, services, methodCodes, statuses, kinds],
  );
  const listKey = JSON.stringify(listFilters);

  useEffect(() => setPage(1), [listKey, pageSize]);

  /* ── Data ── */
  const summaryQuery = useQuery(
    (signal) => payments.summary(scope, signal) as Promise<RevenueSummary>,
    [scopeKey],
  );
  /* Outstanding per service is a separate cut of the same ledger. */
  const pendingQuery = useQuery(
    (signal) => payments.summary({ ...scope, status: "pending" }, signal) as Promise<RevenueSummary>,
    [scopeKey],
  );
  /* The province breakdown lives on the revenue report; payments summarises by
   * status, method, service and day only. */
  const provinceQuery = useQuery(
    (signal) => reports.revenue(scope, signal) as Promise<{ by_province?: RevenueBucket[] }>,
    [scopeKey],
    { enabled: tab === "overview" },
  );

  const txQuery = useQuery(
    (signal) => payments.transactions({ ...listFilters, page, per_page: pageSize }, signal),
    [listKey, page, pageSize],
    { enabled: tab === "transactions" },
  );
  const txSummaryQuery = useQuery(
    (signal) => payments.summary(listFilters, signal) as Promise<RevenueSummary>,
    [listKey],
    { enabled: tab === "transactions" },
  );

  const reconQuery = useQuery(
    async (signal) => (await payments.reconciliation(scope, signal)) as unknown as ReconciliationPayload,
    [scopeKey],
    { enabled: tab === "reconciliation" },
  );

  const pricingQuery = useQuery(
    async (signal) => (await payments.pricing(signal)) as PricingRow[],
    [],
    { enabled: tab === "settings" },
  );

  /* ── Settings, edited locally then committed row by row ── */
  const [methodEdits, setMethodEdits] = useState<Record<string, Partial<PaymentMethod>>>({});
  const [pricingEdits, setPricingEdits] = useState<Record<string, Partial<PricingRow>>>({});
  const dirty = Object.keys(methodEdits).length > 0 || Object.keys(pricingEdits).length > 0;

  const saveMethod = useMutation((v: { id: string; body: Record<string, unknown> }) =>
    payments.updateMethod(v.id, v.body),
  );
  const savePricing = useMutation((v: { code: string; body: Record<string, unknown> }) =>
    payments.updatePricing(v.code, v.body),
  );

  const methodRows = useMemo(
    () => methodList.map((m) => ({ ...m, ...methodEdits[m.id] })),
    [methodList, methodEdits],
  );
  const pricingRows = useMemo(
    () => (pricingQuery.data ?? []).map((p) => ({ ...p, ...pricingEdits[p.service_code] })),
    [pricingQuery.data, pricingEdits],
  );

  function editMethod(id: string, patch: Partial<PaymentMethod>) {
    setMethodEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }
  function editPricing(code: string, field: PriceField, value: number) {
    setPricingEdits((prev) => {
      const next: Partial<PricingRow> = { ...prev[code] };
      next[field] = value;
      return { ...prev, [code]: next };
    });
  }

  async function saveSettings() {
    const enabled = methodRows.filter((m) => m.enabled).length;
    if (methodRows.length > 0 && enabled === 0) {
      toast.error("At least one payment method must stay enabled");
      return;
    }
    try {
      for (const [id, patch] of Object.entries(methodEdits)) {
        const body: Record<string, unknown> = {};
        if (patch.enabled !== undefined) body.enabled = patch.enabled;
        if (patch.fee_percent !== undefined) body.fee_percent = patch.fee_percent;
        if (patch.settlement !== undefined) body.settlement = patch.settlement;
        await saveMethod.run({ id, body });
      }
      for (const [code, patch] of Object.entries(pricingEdits)) {
        const current = (pricingQuery.data ?? []).find((p) => p.service_code === code);
        await savePricing.run({
          code,
          body: {
            fee_lak: patch.fee_lak ?? current?.fee_lak ?? 0,
            copy_fee_lak: patch.copy_fee_lak ?? current?.copy_fee_lak ?? 0,
            late_fine_lak: patch.late_fine_lak ?? current?.late_fine_lak ?? 0,
          },
        });
      }
      setMethodEdits({});
      setPricingEdits({});
      methodsQuery.refetch();
      pricingQuery.refetch();
      toast.success("Payment settings saved", {
        description: `${enabled} method${enabled !== 1 ? "s" : ""} enabled · fees applied to new applications only.`,
      });
    } catch (err) {
      toast.error("Could not save the payment settings", { description: (err as ApiError).message });
    }
  }

  function resetSettings() {
    setMethodEdits({});
    setPricingEdits({});
    methodsQuery.refetch();
    pricingQuery.refetch();
    toast.info("Settings reverted to the published configuration");
  }

  /* ── Row actions ── */
  const confirmTx = useMutation((v: { id: string; external_ref?: string }) =>
    payments.confirm(v.id, v.external_ref ? { external_ref: v.external_ref } : {}),
  );
  const refundTx = useMutation((v: { id: string; reason: string }) => payments.refund(v.id, { reason: v.reason }));
  const [refundTarget, setRefundTarget] = useState<TxRow | null>(null);
  const [refundReason, setRefundReason] = useState("");

  async function onConfirm(row: TxRow) {
    try {
      await confirmTx.run({ id: row.id });
      toast.success(`Receipt ${row.receipt_no} confirmed`);
      txQuery.refetch();
      txSummaryQuery.refetch();
      summaryQuery.refetch();
    } catch (err) {
      toast.error("Could not confirm the receipt", { description: (err as ApiError).message });
    }
  }

  async function onRefund() {
    if (!refundTarget || !refundReason.trim()) return;
    try {
      await refundTx.run({ id: refundTarget.id, reason: refundReason.trim() });
      toast.success(`Receipt ${refundTarget.receipt_no} refunded`);
      setRefundTarget(null);
      setRefundReason("");
      txQuery.refetch();
      txSummaryQuery.refetch();
      summaryQuery.refetch();
    } catch (err) {
      toast.error("Could not refund the receipt", { description: (err as ApiError).message });
    }
  }

  /* ── Export ── */
  const [exporting, setExporting] = useState(false);
  async function exportCsv() {
    setExporting(true);
    try {
      const csv = await payments.exportCSV(listFilters);
      downloadCsv(csv, `transactions-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      toast.error("Export failed", { description: (err as ApiError).message });
    } finally {
      setExporting(false);
    }
  }

  /* ── Derived overview figures ── */
  const summary = summaryQuery.data;
  const collected = summary?.gross_lak ?? 0;
  const outstanding = summary?.outstanding_lak ?? 0;
  const refunded = summary?.refunded_lak ?? 0;
  const paidCount = summary?.paid_count ?? 0;
  const billed = collected + outstanding;
  const collectionRate = billed > 0 ? (collected / billed) * 100 : 0;
  const avgTicket = paidCount ? collected / paidCount : 0;

  const trendPoints = useMemo(
    () => (summary?.by_day ?? []).map((b) => ({ label: b.label || b.key, revenue: b.amount_lak })),
    [summary],
  );

  const byMethod = useMemo(
    () =>
      (summary?.by_method ?? [])
        .filter((b) => b.amount_lak > 0)
        .map((b) => ({ id: b.key, name: b.label || b.key, value: b.amount_lak, color: b.color || FALLBACK_COLOR })),
    [summary],
  );

  const outstandingByService = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of pendingQuery.data?.by_service ?? []) map[b.key] = b.amount_lak;
    return map;
  }, [pendingQuery.data]);

  const byService = useMemo(
    () =>
      (summary?.by_service ?? [])
        .map((b) => {
          const svc = serviceByCode[b.key];
          return {
            code: b.key,
            label: svc ? text(svc.name) : b.label || b.key,
            color: svc?.color ?? FALLBACK_COLOR,
            fee: svc?.fee_lak ?? 0,
            collected: b.amount_lak,
            count: b.count,
            outstanding: outstandingByService[b.key] ?? 0,
          };
        })
        .sort((a, b) => b.collected - a.collected),
    [summary, serviceByCode, outstandingByService],
  );
  const maxService = Math.max(1, ...byService.map((r) => r.collected));

  const byProvince = useMemo(
    () =>
      (provinceQuery.data?.by_province ?? [])
        .map((b) => ({ id: b.key, province: b.label || b.key, collected: b.amount_lak, count: b.count }))
        .sort((a, b) => b.collected - a.collected),
    [provinceQuery.data],
  );
  const maxProvince = Math.max(1, ...byProvince.map((r) => r.collected));

  const collectedByServiceCode = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of summary?.by_service ?? []) map[b.key] = b.amount_lak;
    return map;
  }, [summary]);

  /* ── Transactions page state ── */
  const rows = (txQuery.data?.data ?? []) as TxRow[];
  const meta = txQuery.data?.meta;
  const totalRows = meta?.total ?? 0;
  const totalPages = Math.max(1, meta?.total_pages ?? 1);
  const currentPage = meta?.page ?? page;
  const start = (currentPage - 1) * pageSize;

  const recon = reconQuery.data;
  const reconRows = recon?.methods ?? [];

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
        <div className="flex flex-wrap items-center gap-2">
          {tab !== "settings" && (
            <>
              <MultiSelectFilter
                label="Province"
                options={provinceOptions}
                selected={provinces}
                onChange={setProvinces}
                single
                loading={provincesQuery.loading}
                emptyLabel="No provinces in your jurisdiction"
              />
              <DateRangeFilter onChange={setDateRange} />
            </>
          )}
          {tab === "transactions" && (
            <button
              onClick={exportCsv}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] disabled:opacity-60"
            >
              <Download className="w-4 h-4" /> {exporting ? "Exporting…" : "Export"}
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
          {summaryQuery.error && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <ErrorState error={summaryQuery.error} onRetry={summaryQuery.refetch} />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Kpi
              icon={Banknote}
              label="Collected"
              value={summaryQuery.loading ? "…" : lak(collected)}
              sub={`${paidCount.toLocaleString()} paid receipts`}
              tone="#047857"
            />
            <Kpi
              icon={CircleAlert}
              label="Outstanding"
              value={summaryQuery.loading ? "…" : lak(outstanding)}
              sub="Awaiting payment"
              tone="#B45309"
            />
            <Kpi
              icon={TrendingUp}
              label="Collection rate"
              value={summaryQuery.loading ? "…" : `${collectionRate.toFixed(1)}%`}
              sub={`of ${lak(billed)} billed`}
              tone="#3752AE"
            />
            <Kpi
              icon={Receipt}
              label="Average receipt"
              value={summaryQuery.loading ? "…" : lak(avgTicket)}
              sub={`${lak(refunded)} refunded`}
              tone="#6D28D9"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* Revenue trend */}
            <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col">
              <div className="flex-shrink-0">
                <h2 className="text-base font-semibold text-gray-800">Revenue collected</h2>
                <p className="text-sm text-gray-400 mb-3">
                  Per day · {lak(collected)} total
                </p>
              </div>
              {/* Fills the leftover card height so the bars line up with the
                  payment-method card beside it. */}
              <div className="flex-1 min-h-[256px]">
                {summaryQuery.loading ? (
                  <CardMessage>Loading revenue…</CardMessage>
                ) : trendPoints.length === 0 ? (
                  <CardMessage>No revenue in this selection.</CardMessage>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendPoints} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
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
                )}
              </div>
            </div>

            {/* Method split */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-800">By payment method</h2>
              <p className="text-sm text-gray-400 mb-2">Share of collected revenue</p>
              <div className="h-44">
                {byMethod.length === 0 ? (
                  <CardMessage>{summaryQuery.loading ? "Loading…" : "No revenue in this selection."}</CardMessage>
                ) : (
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
                )}
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

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Revenue by service */}
          <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
                    <tr key={r.code} className="border-b border-gray-50 last:border-0">
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-2 text-gray-800">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
                          {r.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {r.fee === 0 ? "Free" : lak(r.fee)}
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
                            style={{ width: `${(r.collected / maxService) * 100}%`, backgroundColor: r.color }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {byService.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <CardMessage>{summaryQuery.loading ? "Loading…" : "No revenue in this selection."}</CardMessage>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Revenue by province — the counterpart to the Province filter above */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-base font-semibold text-gray-800">Revenue by province</h2>
            <p className="text-sm text-gray-400 mb-4">
              {provinces.length > 0
                ? `Filtered to ${provinces.length} province${provinces.length !== 1 ? "s" : ""}`
                : `${byProvince.length} provinces collecting fees`}
            </p>
            <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
              {provinceQuery.error ? (
                <ErrorState error={provinceQuery.error} onRetry={provinceQuery.refetch} />
              ) : (
                byProvince.map((r) => (
                  <div key={r.id}>
                    <div className="flex items-center justify-between gap-2 text-sm mb-1">
                      <span className="text-gray-600 truncate">{r.province}</span>
                      <span className="font-medium text-gray-800 whitespace-nowrap tabular-nums">
                        {formatLakShort(r.collected)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#3752AE]"
                        style={{ width: `${(r.collected / maxProvince) * 100}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">{r.count} receipts</p>
                  </div>
                ))
              )}
              {!provinceQuery.error && byProvince.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">
                  {provinceQuery.loading ? "Loading…" : "No revenue in this selection."}
                </p>
              )}
            </div>
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
                <MultiSelectFilter
                  label="Services"
                  options={serviceOptions}
                  selected={services}
                  onChange={setServices}
                  loading={servicesQuery.loading}
                />
                <MultiSelectFilter
                  label="Method"
                  options={methodOptions}
                  selected={methodCodes}
                  onChange={setMethodCodes}
                  loading={methodsQuery.loading}
                />
                <MultiSelectFilter label="Type" options={KIND_OPTIONS} selected={kinds} onChange={setKinds} />
                <MultiSelectFilter label="Status" options={TX_STATUS_OPTIONS} selected={statuses} onChange={setStatuses} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">
                {totalRows} transaction{totalRows !== 1 ? "s" : ""}
                <span className="text-gray-400 font-normal">
                  {" "}· {lak(txSummaryQuery.data?.gross_lak ?? 0)} collected
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

            {txQuery.error ? (
              <ErrorState error={txQuery.error} onRetry={txQuery.refetch} />
            ) : (
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
                      <th className="px-4 py-3 font-medium">Cashier</th>
                      <th className="pl-4 pr-5 py-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => {
                      const svc = serviceByCode[t.service_code];
                      return (
                        <tr key={t.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                          <td className="px-5 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{t.receipt_no}</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                            {t.date ?? t.paid_at?.slice(0, 10) ?? "—"}
                            <span className="block text-[11px] text-gray-400">{t.time ?? ""}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-800">
                            {t.payer_name}
                            <span className="block font-mono text-[11px] text-gray-400">{t.reference_no ?? "—"}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-2 text-gray-600 whitespace-nowrap">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: svc?.color ?? FALLBACK_COLOR }} />
                              {svc ? svc.short_name || text(svc.name) : t.service_code}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{KIND_LABEL[t.kind] ?? t.kind}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-2 text-gray-600 whitespace-nowrap">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.method_color ?? FALLBACK_COLOR }} />
                              {text(t.method_label) || t.method_code}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-gray-800 whitespace-nowrap">
                            {t.amount_lak.toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <StatusChip status={t.status} />
                          </td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{t.cashier_name ?? "—"}</td>
                          <td className="pl-4 pr-5 py-3 text-right whitespace-nowrap">
                            {canManage && t.status === "pending" && (
                              <button
                                onClick={() => onConfirm(t)}
                                disabled={confirmTx.pending}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Confirm
                              </button>
                            )}
                            {canManage && t.status === "paid" && (
                              <button
                                onClick={() => {
                                  setRefundTarget(t);
                                  setRefundReason("");
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >
                                <Undo2 className="w-3.5 h-3.5" /> Refund
                              </button>
                            )}
                            {(!canManage || (t.status !== "pending" && t.status !== "paid")) && (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={10}>
                          <CardMessage>
                            {txQuery.loading ? "Loading transactions…" : "No transactions match your filters."}
                          </CardMessage>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

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

      {/* ── Reconciliation ── */}
      {tab === "reconciliation" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">Settlement by payment method</h2>
            <p className="text-sm text-gray-400">
              What each provider collected, the commission it withholds, and what is still to be settled.
            </p>
          </div>
          {reconQuery.error ? (
            <ErrorState error={reconQuery.error} onRetry={reconQuery.refetch} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="px-5 py-3 font-medium">Method</th>
                    <th className="px-4 py-3 font-medium">Settlement account</th>
                    <th className="px-4 py-3 font-medium text-right">Receipts</th>
                    <th className="px-4 py-3 font-medium text-right">Collected</th>
                    <th className="px-4 py-3 font-medium text-right">Provider fee</th>
                    <th className="px-4 py-3 font-medium text-right">Net</th>
                    <th className="pl-4 pr-5 py-3 font-medium text-right">Unreconciled</th>
                  </tr>
                </thead>
                <tbody>
                  {reconRows.map((r) => (
                    <tr key={r.method_code} className="border-b border-gray-50 last:border-0">
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-2 text-gray-800 whitespace-nowrap">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color ?? FALLBACK_COLOR }} />
                          {text(r.method_label) || r.method_code}
                        </span>
                        <span className="block text-[11px] text-gray-400 pl-4">
                          {(r.fee_percent ?? 0).toFixed(1)}% commission
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{r.settlement_account || "—"}</td>
                      <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{r.count.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800 whitespace-nowrap">{lak(r.collected_lak)}</td>
                      <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">
                        {r.provider_fee_lak > 0 ? lak(r.provider_fee_lak) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-800 whitespace-nowrap">{lak(r.net_lak)}</td>
                      <td className="pl-4 pr-5 py-3 text-right whitespace-nowrap">
                        {(r.unreconciled_count ?? 0) > 0 ? (
                          <span className="text-amber-700">
                            {lak(r.unreconciled_lak ?? 0)}
                            <span className="block text-[11px] text-gray-400">
                              {(r.unreconciled_count ?? 0).toLocaleString()} receipts
                            </span>
                          </span>
                        ) : (
                          <span className="text-gray-400">Settled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {reconRows.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <CardMessage>
                          {reconQuery.loading ? "Loading reconciliation…" : "Nothing to reconcile in this selection."}
                        </CardMessage>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {recon?.totals && reconRows.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-500">
              <span>Collected <span className="font-medium text-gray-800">{lak(recon.totals.collected_lak ?? 0)}</span></span>
              <span>Provider fees <span className="font-medium text-gray-800">{lak(recon.totals.provider_fee_lak ?? 0)}</span></span>
              <span>Net <span className="font-medium text-gray-800">{lak(recon.totals.net_lak ?? 0)}</span></span>
              <span>Unreconciled <span className="font-medium text-gray-800">{lak(recon.totals.unreconciled_lak ?? 0)}</span></span>
            </div>
          )}
        </div>
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
            {methodsQuery.error ? (
              <ErrorState error={methodsQuery.error} onRetry={methodsQuery.refetch} />
            ) : (
              <div className="divide-y divide-gray-50">
                {methodRows.map((m) => {
                  const Icon = METHOD_ICON[m.kind] ?? CreditCard;
                  const color = m.color || FALLBACK_COLOR;
                  return (
                    <div key={m.id} className="p-5 flex flex-col lg:flex-row lg:items-center gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <span
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${color}14`, color }}
                        >
                          <Icon className="w-5 h-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{text(m.label)}</p>
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
                              disabled={!canManage}
                              value={m.fee_percent}
                              onChange={(e) => editMethod(m.id, { fee_percent: Number(e.target.value) })}
                              className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 outline-none focus:border-[#3752AE] disabled:opacity-50"
                            />
                            <span className="text-sm text-gray-500">%</span>
                          </div>
                        </label>

                        <label className="text-xs text-gray-400 block">
                          Settlement account
                          <input
                            value={m.settlement}
                            disabled={!canManage}
                            onChange={(e) => editMethod(m.id, { settlement: e.target.value })}
                            className="block w-64 mt-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 outline-none focus:border-[#3752AE] disabled:opacity-50"
                          />
                        </label>

                        <div className="flex items-center gap-2.5 lg:pl-2">
                          <Switch
                            checked={m.enabled}
                            disabled={!canManage}
                            onCheckedChange={(v) => editMethod(m.id, { enabled: v })}
                          />
                          <span className={`text-sm font-medium ${m.enabled ? "text-gray-700" : "text-gray-400"}`}>
                            {m.enabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {methodRows.length === 0 && (
                  <CardMessage>{methodsQuery.loading ? "Loading methods…" : "No payment methods configured."}</CardMessage>
                )}
              </div>
            )}
          </div>

          {/* Service pricing */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Service pricing</h2>
              <p className="text-sm text-gray-400">
                Tariffs in LAK. Set a fee to 0 to make a service free of charge.
              </p>
            </div>
            {pricingQuery.error ? (
              <ErrorState error={pricingQuery.error} onRetry={pricingQuery.refetch} />
            ) : (
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
                    {pricingRows.map((p) => {
                      const svc = serviceByCode[p.service_code];
                      return (
                        <tr key={p.service_code} className="border-b border-gray-50 last:border-0">
                          <td className="px-5 py-3">
                            <span className="inline-flex items-center gap-2 text-gray-800">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: svc?.color ?? FALLBACK_COLOR }} />
                              {svc ? text(svc.name) : text(p.service_name) || p.service_code}
                            </span>
                            <span className="block text-[11px] text-gray-400 pl-4">
                              {svc ? text(svc.name, "lo") : ""}
                            </span>
                          </td>
                          {(["fee_lak", "copy_fee_lak", "late_fine_lak"] as const).map((field) => (
                            <td key={field} className="px-4 py-3">
                              <input
                                type="number"
                                min="0"
                                step="1000"
                                disabled={!canManage}
                                value={p[field] ?? 0}
                                onChange={(e) => editPricing(p.service_code, field, Number(e.target.value))}
                                className="w-32 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 outline-none focus:border-[#3752AE] disabled:opacity-50"
                              />
                            </td>
                          ))}
                          <td className="pl-4 pr-5 py-3 text-gray-500 whitespace-nowrap">
                            {lak(collectedByServiceCode[p.service_code] ?? 0)}
                          </td>
                        </tr>
                      );
                    })}
                    {pricingRows.length === 0 && (
                      <tr>
                        <td colSpan={5}>
                          <CardMessage>{pricingQuery.loading ? "Loading tariffs…" : "No pricing configured."}</CardMessage>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Save bar */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-gray-500">
              {!canManage
                ? "Your role can view the payment configuration but not change it."
                : dirty
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
                disabled={!dirty || !canManage || saveMethod.pending || savePricing.pending}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" /> Save changes
              </button>
            </div>
          </div>
        </>
      )}

      {/* Refund needs a recorded reason — the API rejects a blank one. */}
      <Dialog open={!!refundTarget} onOpenChange={(open) => !open && setRefundTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Refund receipt {refundTarget?.receipt_no}</DialogTitle>
            <DialogDescription>
              {refundTarget ? `${lak(refundTarget.amount_lak)} paid by ${refundTarget.payer_name}.` : ""} The reason is
              written to the audit trail.
            </DialogDescription>
          </DialogHeader>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Reason</span>
            <textarea
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              rows={3}
              placeholder="Why is this receipt being refunded?"
              className="mt-1.5 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#3752AE] placeholder:text-gray-400"
            />
          </label>
          {refundTx.error && <p className="text-sm text-red-600">{refundTx.error.message}</p>}
          <DialogFooter>
            <button
              onClick={() => setRefundTarget(null)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={onRefund}
              disabled={!refundReason.trim() || refundTx.pending}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Undo2 className="w-4 h-4" /> {refundTx.pending ? "Refunding…" : "Refund"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
