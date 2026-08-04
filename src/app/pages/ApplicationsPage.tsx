import { useEffect, useMemo, useState } from "react";
import { Search, Eye, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { APPLICATIONS, STATUS_ORDER, STATUS_META, lastActivityOf, daysAgo } from "../data/mockData";
import { SERVICES, SERVICE_BY_ID } from "../serviceConfig";
import { paymentStateFor, PAYMENT_STATE_META, PAYMENT_OPTIONS } from "../data/payments";
import { StatusBadge } from "../components/StatusBadge";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { DateRangeFilter, inRange, ALL_TIME, type DateRange } from "../components/DateRangeFilter";

const SERVICE_OPTIONS = SERVICES.map((s) => ({ value: s.id, label: s.label, color: s.color }));
const STATUS_OPTIONS = STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label, color: STATUS_META[s].color }));

/* Statuses that are still moving — used to flag a case that hasn't been touched
 * in a while as stale, since only open cases can go stale. */
const OPEN_STATUSES = new Set(["draft", "submitted", "certified", "under-review", "returned"]);
const STALE_DAYS = 14;

function relativeDays(date: string): string {
  const d = daysAgo(date);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d}d ago`;
  return date;
}

function exportCsv(rows: typeof APPLICATIONS) {
  const header = ["Ref No", "Applicant", "Service", "Province", "Submitted", "Last activity", "Payment", "Officer", "Status"];
  const body = rows.map((a) => [
    a.id,
    a.applicant,
    SERVICE_BY_ID[a.serviceId]?.label ?? a.serviceId,
    a.province,
    a.submitted,
    lastActivityOf(a),
    PAYMENT_STATE_META[paymentStateFor(a.id)].label,
    a.officer ?? "",
    STATUS_META[a.status].label,
  ]);
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header, ...body].map((r) => r.map(escape).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `applications-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function PaymentChip({ appId }: { appId: string }) {
  const m = PAYMENT_STATE_META[paymentStateFor(appId)];
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

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return APPLICATIONS.filter((a) => {
      if (statuses.length && !statuses.includes(a.status)) return false;
      if (services.length && !services.includes(a.serviceId)) return false;
      if (payments.length && !payments.includes(paymentStateFor(a.id))) return false;
      if (!inRange(a.submitted, dateRange)) return false;
      if (q && !`${a.id} ${a.applicant} ${a.province}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [services, statuses, payments, dateRange, query]);

  // Reset to first page whenever the result set or page size changes.
  useEffect(() => setPage(1), [services, statuses, payments, dateRange, query, pageSize]);

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

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
          onClick={() => exportCsv(rows)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] self-start sm:self-auto"
        >
          <Download className="w-4 h-4" /> Export
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
            {totalRows} application{totalRows !== 1 ? "s" : ""}
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
              {pageRows.map((a) => {
                const svc = SERVICE_BY_ID[a.serviceId];
                const activity = lastActivityOf(a);
                const idle = daysAgo(activity);
                const stale = OPEN_STATUSES.has(a.status) && idle >= STALE_DAYS;
                return (
                  <tr
                    key={a.id}
                    onClick={() => onOpenCase(a.id)}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 cursor-pointer"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{a.id}</td>
                    <td className="px-4 py-3 text-gray-800">{a.applicant}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-gray-600 whitespace-nowrap">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: svc?.color }} />
                        {svc?.short}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{a.province}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{a.submitted}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={stale ? "text-red-600 font-medium" : "text-gray-500"} title={stale ? `No activity for ${idle} days` : activity}>
                        {relativeDays(activity)}
                      </span>
                      {stale && <span className="block text-[11px] text-red-400">stale</span>}
                    </td>
                    <td className="px-4 py-3">
                      <PaymentChip appId={a.id} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{a.officer ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} />
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
              {totalRows === 0 && (
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
