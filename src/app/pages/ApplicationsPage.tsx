import { useEffect, useMemo, useState } from "react";
import { Search, Eye, Download, ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { STATUS_ORDER, STATUS_META, type AppStatus } from "../data/mockData";
import { SERVICES, SERVICE_BY_ID } from "../serviceConfig";
import { PAYMENT_STATE_META, PAYMENT_OPTIONS, type PaymentState } from "../data/payments";
import { StatusBadge } from "../components/StatusBadge";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { DateRangeFilter, ALL_TIME, type DateRange } from "../components/DateRangeFilter";
import { applications } from "../api/endpoints";
import { useDebounced, useQuery } from "../api/hooks";
import { text, type ApplicationRow } from "../api/types";

const SERVICE_OPTIONS = SERVICES.map((s) => ({ value: s.id, label: s.label, color: s.color }));
const STATUS_OPTIONS = STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label, color: STATUS_META[s].color }));

/* Statuses that are still moving — used to flag a case that hasn't been touched
 * in a while as stale, since only open cases can go stale. */
const OPEN_STATUSES = new Set(["draft", "submitted", "certified", "under-review", "returned"]);
const STALE_DAYS = 14;

/** Whole days between an RFC3339 timestamp and now. */
function daysSince(iso?: string): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

function relativeDays(iso?: string): string {
  if (!iso) return "—";
  const d = daysSince(iso);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d}d ago`;
  return iso.slice(0, 10);
}

function PaymentChip({ state }: { state: PaymentState }) {
  const m = PAYMENT_STATE_META[state] ?? PAYMENT_STATE_META.free;
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

export function ApplicationsPage({ onOpenCase }: { onOpenCase: (id: string) => void }) {
  const [services, setServices] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [payments, setPayments] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>(ALL_TIME);
  const [query, setQuery] = useState("");
  const search = useDebounced(query, 350);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [exporting, setExporting] = useState(false);

  // Reset to the first page whenever the result set or page size changes.
  useEffect(() => setPage(1), [services, statuses, payments, dateRange, search, pageSize]);

  /* Everything is filtered server-side: the browser never holds more than one
   * page of rows. */
  const filters = useMemo(
    () => ({
      status: statuses,
      service_code: services,
      payment_state: payments,
      date_from: dateRange.from,
      date_to: dateRange.to,
      search: search.trim(),
    }),
    [statuses, services, payments, dateRange.from, dateRange.to, search],
  );
  const filterKey = JSON.stringify(filters);

  const listQuery = useQuery(
    (signal) => applications.list({ ...filters, page, per_page: pageSize, sort: "-created_at" }, signal),
    [filterKey, page, pageSize],
  );
  const summaryQuery = useQuery((signal) => applications.summary(filters, signal), [filterKey]);

  const rows: ApplicationRow[] = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;
  const totalRows = summaryQuery.data?.total ?? meta?.total ?? 0;
  const totalPages = Math.max(1, meta?.total_pages ?? 1);
  const currentPage = meta?.page ?? page;
  const start = (currentPage - 1) * pageSize;

  async function exportCsv() {
    setExporting(true);
    try {
      const csv = await applications.exportCSV({ ...filters, sort: "-created_at" });
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `applications-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Applications</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Every case, any status — search the full record and open one to process it.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] self-start sm:self-auto disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {exporting ? "Exporting…" : "Export"}
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex-1">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by ref no, applicant, or province…"
              className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder:text-gray-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <MultiSelectFilter label="Services" options={SERVICE_OPTIONS} selected={services} onChange={setServices} />
            <MultiSelectFilter label="Status" options={STATUS_OPTIONS} selected={statuses} onChange={setStatuses} />
            <MultiSelectFilter label="Payment" options={PAYMENT_OPTIONS} selected={payments} onChange={setPayments} />
            <DateRangeFilter onChange={setDateRange} />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            {totalRows.toLocaleString()} application{totalRows !== 1 ? "s" : ""}
            {summaryQuery.data && summaryQuery.data.overdue > 0 && (
              <span className="ml-2 text-sm font-medium text-red-500">
                · {summaryQuery.data.overdue.toLocaleString()} overdue
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="hidden sm:inline">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-gray-50 border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 text-sm text-gray-700 outline-none focus:border-[#3752AE]"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-5 py-3 font-medium">Ref. No.</th>
                <th className="px-4 py-3 font-medium">Applicant</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Province</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Last activity</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 font-medium">Officer</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="pl-4 pr-5 py-3 font-medium w-px whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const svc = SERVICE_BY_ID[a.service_code];
                const activity = a.updated_at || a.created_at;
                const idle = daysSince(activity);
                const stale = OPEN_STATUSES.has(a.status) && idle >= STALE_DAYS;
                return (
                  <tr
                    key={a.id}
                    onClick={() => onOpenCase(a.id)}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 cursor-pointer"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{a.reference_no}</td>
                    <td className="px-4 py-3 text-gray-800">{a.applicant}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-gray-600 whitespace-nowrap">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: svc?.color ?? "#94A3B8" }} />
                        {svc?.short ?? text(a.service_name)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{a.jurisdiction?.province_name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {(a.submitted_at ?? a.created_at ?? "").slice(0, 10) || "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={stale ? "text-red-600 font-medium" : "text-gray-500"}
                        title={stale ? `No activity for ${idle} days` : activity?.slice(0, 10)}
                      >
                        {relativeDays(activity)}
                      </span>
                      {stale && <span className="block text-[11px] text-red-400">stale</span>}
                    </td>
                    <td className="px-4 py-3">
                      <PaymentChip state={a.payment_state as PaymentState} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{a.assigned_officer ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status as AppStatus} />
                    </td>
                    <td className="pl-4 pr-5 py-3 w-px whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onOpenCase(a.id)}
                        className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] w-[96px]"
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </button>
                    </td>
                  </tr>
                );
              })}

              {listQuery.loading && (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center text-sm text-gray-400">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading applications…
                    </span>
                  </td>
                </tr>
              )}

              {!listQuery.loading && listQuery.error && (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center">
                    <p className="text-sm text-red-600">{listQuery.error.message}</p>
                    <button
                      onClick={listQuery.refetch}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Retry
                    </button>
                  </td>
                </tr>
              )}

              {!listQuery.loading && !listQuery.error && rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center text-sm text-gray-400">
                    No applications match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {rows.length > 0 && meta && (
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Showing <span className="font-medium text-gray-700">{start + 1}</span>–
              <span className="font-medium text-gray-700">{start + rows.length}</span> of{" "}
              <span className="font-medium text-gray-700">{meta.total.toLocaleString()}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <span className="text-sm text-gray-500">
                Page {currentPage} of {totalPages}
              </span>
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
    </div>
  );
}
