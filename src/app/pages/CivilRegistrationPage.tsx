import { useEffect, useMemo, useState } from "react";
import {
  Search, Eye, Download, ChevronLeft, ChevronRight, BadgeCheck, Ban, Clock, Loader2, AlertTriangle,
  Home, Baby, Cross, Heart, HeartCrack, BookUser, FileText, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { applications, catalog } from "../api/endpoints";
import { useDebounced, useQuery } from "../api/hooks";
import { text, type ApplicationRow, type ApplicationSummary, type Service } from "../api/types";
import { formatLak } from "../serviceConfig";
import { DateRangeFilter, ALL_TIME, type DateRange } from "../components/DateRangeFilter";

/*
 * Civil Registration — the six Phase-1 services and their registers (PRD §11).
 * A register entry exists once an event is registered; it may then be issued as
 * a certificate, or later revoked. Everything before that still sits in the
 * approval queue, not here.
 *
 * The register is the case list narrowed to those three states server-side, and
 * the per-service counters come from /admin/applications/summary rather than a
 * pass over rows the browser happens to hold.
 */
const REGISTER_STATUSES = ["registered", "issued", "revoked"];

/* The catalogue names its icon; the dashboard owns the drawing of it. */
const ICONS: Record<string, LucideIcon> = {
  Home, Baby, Cross, Heart, HeartCrack, BookUser,
};

const CERT_META: Record<string, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  issued: { label: "Issued", color: "#047857", bg: "#D1FAE5", icon: BadgeCheck },
  registered: { label: "Pending issue", color: "#B45309", bg: "#FEF3C7", icon: Clock },
  revoked: { label: "Revoked", color: "#44403C", bg: "#E7E5E4", icon: Ban },
};

interface ServiceStat {
  inRegister: number;
  issued: number;
  pendingIssue: number;
}

/** Read the three register states out of a summary's by_status block. */
function statOf(summary: ApplicationSummary | undefined): ServiceStat {
  const rows = (summary?.by_status ?? []) as Array<{ status: string; count?: number; total?: number }>;
  const at = (status: string) => {
    const row = rows.find((r) => r.status === status);
    return row?.count ?? row?.total ?? 0;
  };
  const issued = at("issued");
  const registered = at("registered");
  const revoked = at("revoked");
  return { inRegister: issued + registered + revoked, issued, pendingIssue: registered };
}

/** The date an entry reached the register, newest information first. */
function registeredOn(r: ApplicationRow): string {
  return (r.issued_at ?? r.closed_at ?? r.updated_at ?? "").slice(0, 10) || "—";
}

export function CivilRegistrationPage({ onOpenCase }: { onOpenCase: (id: string) => void }) {
  const [service, setService] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(ALL_TIME);
  const [query, setQuery] = useState("");
  const search = useDebounced(query, 350);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [exporting, setExporting] = useState(false);

  const services = useQuery((signal) => catalog.services({ phase1: true }, signal), []);
  const serviceList = useMemo<Service[]>(() => services.data ?? [], [services.data]);
  const serviceCodes = serviceList.map((s) => s.code).join(",");

  /* Header totals across the whole register. */
  const overall = useQuery(
    (signal) => applications.summary({ status: REGISTER_STATUSES }, signal),
    [],
  );

  /* One summary per service tile — counted by the API, not in the browser. */
  const perService = useQuery(
    async (signal) => {
      const entries = await Promise.all(
        serviceList.map(async (s) => [s.code, await applications.summary({ service_code: s.code }, signal)] as const),
      );
      return Object.fromEntries(entries) as Record<string, ApplicationSummary>;
    },
    [serviceCodes],
    { enabled: serviceList.length > 0 },
  );

  const listQuery = useMemo(
    () => ({
      status: REGISTER_STATUSES,
      service_code: service ?? undefined,
      search: search.trim() || undefined,
      date_from: dateRange.from || undefined,
      date_to: dateRange.to || undefined,
      sort: "-submitted",
    }),
    [service, search, dateRange.from, dateRange.to],
  );

  const list = useQuery(
    (signal) => applications.list({ ...listQuery, page, per_page: pageSize }, signal),
    [service, search, dateRange.from, dateRange.to, page, pageSize],
  );

  useEffect(() => setPage(1), [service, dateRange.from, dateRange.to, search, pageSize]);

  const rows = list.data?.data ?? [];
  const totalRows = list.data?.meta.total ?? 0;
  const totalPages = Math.max(1, list.data?.meta.total_pages ?? 1);
  const currentPage = list.data?.meta.page ?? page;
  const start = (currentPage - 1) * pageSize;

  const totals = statOf(overall.data);
  const activeService = serviceList.find((s) => s.code === service);

  async function exportRegister() {
    setExporting(true);
    try {
      const csv = await applications.exportCSV(listQuery);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `civil-register-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Export failed", { description: (err as Error).message });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Civil Registration</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {overall.loading
              ? "The six Phase-1 services and their registers — loading counts…"
              : `The six Phase-1 services and their registers — ${totals.inRegister} entries · ${totals.issued} issued · ${totals.pendingIssue} pending issue.`}
          </p>
        </div>
        <button
          onClick={() => void exportRegister()}
          disabled={exporting || totalRows === 0}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] self-start sm:self-auto disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Export register
        </button>
      </div>

      {services.error && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-red-600">{services.error.message}</p>
          <button
            onClick={services.refetch}
            className="px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Service registers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {serviceList.map((s) => {
          const Icon = ICONS[s.icon] ?? FileText;
          const stat = statOf(perService.data?.[s.code]);
          const active = service === s.code;
          const label = text(s.name);
          return (
            <button
              key={s.code}
              onClick={() => setService(active ? null : s.code)}
              title={active ? "Show all registers" : `Filter the register to ${label}`}
              className={`text-left bg-white rounded-2xl border p-4 shadow-sm transition-all ${
                active ? "border-[#3752AE] ring-1 ring-[#3752AE]/20" : "border-gray-100 hover:border-gray-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${s.color}14`, color: s.color }}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-800 truncate">{label}</p>
                  <p className="text-xs text-gray-400 truncate">{text(s.name, "lo")}</p>
                </div>
                <span className="text-xs font-medium text-gray-500 whitespace-nowrap">{formatLak(s.fee_lak)}</span>
              </div>

              {/* Colours match the certificate chips in the table below:
                  blue = on the register, green = issued, amber = still moving. */}
              <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-gray-50">
                {[
                  { label: "In register", value: stat.inRegister, color: "#3752AE" },
                  { label: "Issued", value: stat.issued, color: "#047857" },
                  { label: "Pending issue", value: stat.pendingIssue, color: "#B45309" },
                ].map((k) => (
                  <div key={k.label}>
                    <p className="text-lg font-bold leading-tight" style={{ color: k.color }}>
                      {perService.loading ? "—" : k.value}
                    </p>
                    <p className="text-[11px] text-gray-400">{k.label}</p>
                  </div>
                ))}
              </div>
            </button>
          );
        })}

        {services.loading &&
          [0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-center gap-3 text-gray-300">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm text-gray-400">Loading services…</span>
              </div>
            </div>
          ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex-1">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by register no, ref no, name, or province…"
              className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder:text-gray-400"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeFilter onChange={setDateRange} />
            {service && (
              <button
                onClick={() => setService(null)}
                className="px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Clear service filter
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Register table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            {activeService ? `${text(activeService.name)} register` : "All registers"}
            <span className="text-gray-400 font-normal"> · {totalRows} entries</span>
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
                <th className="px-5 py-3 font-medium">Register No.</th>
                <th className="px-4 py-3 font-medium">Registrant</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Province</th>
                <th className="px-4 py-3 font-medium">Event date</th>
                <th className="px-4 py-3 font-medium">Registered</th>
                <th className="px-4 py-3 font-medium">Registrar</th>
                <th className="px-4 py-3 font-medium">Certificate</th>
                <th className="pl-4 pr-5 py-3 font-medium w-px whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const svc = serviceList.find((s) => s.code === r.service_code);
                const cert = CERT_META[r.status] ?? { label: r.status, color: "#475569", bg: "#F1F5F9", icon: Clock };
                const CertIcon = cert.icon;
                return (
                  <tr
                    key={r.id}
                    onClick={() => onOpenCase(r.id)}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 cursor-pointer"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                      {r.certificate_no || r.reference_no}
                    </td>
                    <td className="px-4 py-3 text-gray-800">
                      {r.subject_name || r.applicant}
                      <span className="block font-mono text-[11px] text-gray-400">{r.reference_no}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-gray-600 whitespace-nowrap">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: svc?.color ?? "#94A3B8" }} />
                        {svc?.short_name || text(r.service_name) || r.service_code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.jurisdiction?.province_name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{r.event_date ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{registeredOn(r)}</td>
                    <td className="px-4 py-3 text-gray-500">{r.assigned_officer ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
                        style={{ color: cert.color, backgroundColor: cert.bg }}
                      >
                        <CertIcon className="w-3.5 h-3.5" />
                        {cert.label}
                      </span>
                    </td>
                    <td className="pl-4 pr-5 py-3 w-px whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onOpenCase(r.id)}
                        className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] w-[96px]"
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </button>
                    </td>
                  </tr>
                );
              })}

              {list.loading && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-sm text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-gray-300" />
                    Loading the register…
                  </td>
                </tr>
              )}

              {!list.loading && list.error && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center">
                    <AlertTriangle className="w-6 h-6 text-red-300 mx-auto mb-2" />
                    <p className="text-sm text-red-600 mb-3">{list.error.message}</p>
                    <button
                      onClick={list.refetch}
                      className="px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              )}

              {!list.loading && !list.error && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-sm text-gray-400">
                    No register entries match your filters.
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
