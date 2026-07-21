import { useEffect, useMemo, useState } from "react";
import { Search, Eye, Download, ChevronLeft, ChevronRight, BadgeCheck, Ban, Clock } from "lucide-react";
import { APPLICATIONS, STATUS_META, type AppStatus, type Application } from "../data/mockData";
import { SERVICES, SERVICE_BY_ID, formatLak } from "../serviceConfig";
import { StatusBadge } from "../components/StatusBadge";
import { DateRangeFilter, inRange, ALL_TIME, type DateRange } from "../components/DateRangeFilter";

/*
 * Civil Registration — the six Phase-1 services and their registers (PRD §11).
 * A register entry exists once an event is registered; it may then be issued as
 * a certificate, or later revoked. Everything before that still sits in the
 * approval queue, not here.
 */
const REGISTER_STATUSES = new Set<AppStatus>(["registered", "issued", "revoked"]);
const PENDING_STATUSES = new Set<AppStatus>(["draft", "submitted", "certified", "under-review", "returned"]);

const SVC_BOOK: Record<string, string> = {
  resident: "RES",
  birth: "BIR",
  death: "DEA",
  marriage: "MAR",
  divorce: "DIV",
  "family-book": "FAM",
};

/* Register numbers are sequential per service book, in registration order. */
function buildRegister(): (Application & { regNo: string })[] {
  const counters: Record<string, number> = {};
  return APPLICATIONS.filter((a) => REGISTER_STATUSES.has(a.status))
    .slice()
    .sort((a, b) => a.submitted.localeCompare(b.submitted))
    .map((a) => {
      const book = SVC_BOOK[a.serviceId] ?? "GEN";
      counters[book] = (counters[book] ?? 0) + 1;
      const year = a.submitted.slice(0, 4);
      return { ...a, regNo: `LAO/${book}/${year}/${String(counters[book]).padStart(5, "0")}` };
    })
    .reverse(); // newest first
}

const REGISTER = buildRegister();

interface ServiceStat {
  id: string;
  registered: number;
  issued: number;
  revoked: number;
  pending: number;
}

function buildServiceStats(): Record<string, ServiceStat> {
  const out: Record<string, ServiceStat> = Object.fromEntries(
    SERVICES.map((s) => [s.id, { id: s.id, registered: 0, issued: 0, revoked: 0, pending: 0 }]),
  );
  for (const a of APPLICATIONS) {
    const s = out[a.serviceId];
    if (!s) continue;
    if (REGISTER_STATUSES.has(a.status)) s.registered += 1;
    if (a.status === "issued") s.issued += 1;
    if (a.status === "revoked") s.revoked += 1;
    if (PENDING_STATUSES.has(a.status)) s.pending += 1;
  }
  return out;
}

const SERVICE_STATS = buildServiceStats();

function exportCsv(rows: (Application & { regNo: string })[]) {
  const header = ["Register No", "Registrant", "Service", "Province", "Event date", "Registrar", "Status"];
  const body = rows.map((r) => [
    r.regNo,
    r.applicant,
    SERVICE_BY_ID[r.serviceId]?.label ?? r.serviceId,
    r.province,
    r.submitted,
    r.officer ?? "",
    STATUS_META[r.status].label,
  ]);
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header, ...body].map((r) => r.map(escape).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `civil-register-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const CERT_META: Record<string, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  issued: { label: "Issued", color: "#047857", bg: "#D1FAE5", icon: BadgeCheck },
  registered: { label: "Pending issue", color: "#B45309", bg: "#FEF3C7", icon: Clock },
  revoked: { label: "Revoked", color: "#44403C", bg: "#E7E5E4", icon: Ban },
};

export function CivilRegistrationPage({ onOpenCase }: { onOpenCase: (id: string) => void }) {
  const [service, setService] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(ALL_TIME);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return REGISTER.filter((r) => {
      if (service && r.serviceId !== service) return false;
      if (!inRange(r.submitted, dateRange)) return false;
      if (q && !`${r.regNo} ${r.id} ${r.applicant} ${r.province}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [service, dateRange, query]);

  useEffect(() => setPage(1), [service, dateRange, query, pageSize]);

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  const totalRegistered = REGISTER.length;
  const totalIssued = REGISTER.filter((r) => r.status === "issued").length;
  const totalPendingIssue = REGISTER.filter((r) => r.status === "registered").length;

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Civil Registration</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            The six Phase-1 services and their registers — {totalRegistered} entries · {totalIssued} issued ·{" "}
            {totalPendingIssue} pending issue.
          </p>
        </div>
        <button
          onClick={() => exportCsv(rows)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] self-start sm:self-auto"
        >
          <Download className="w-4 h-4" /> Export register
        </button>
      </div>

      {/* Service registers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {SERVICES.map((s) => {
          const Icon = s.icon;
          const stat = SERVICE_STATS[s.id];
          const active = service === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setService(active ? null : s.id)}
              title={active ? "Show all registers" : `Filter the register to ${s.label}`}
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
                  <p className="text-sm font-semibold text-gray-800 truncate">{s.label}</p>
                  <p className="text-xs text-gray-400 truncate">{s.laLabel}</p>
                </div>
                <span className="text-xs font-medium text-gray-500 whitespace-nowrap">{formatLak(s.fee)}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-gray-50">
                <div>
                  <p className="text-lg font-bold text-gray-800 leading-tight">{stat.registered}</p>
                  <p className="text-[11px] text-gray-400">In register</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-800 leading-tight">{stat.issued}</p>
                  <p className="text-[11px] text-gray-400">Issued</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-800 leading-tight">{stat.pending}</p>
                  <p className="text-[11px] text-gray-400">In progress</p>
                </div>
              </div>
            </button>
          );
        })}
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
            {service ? `${SERVICE_BY_ID[service].label} register` : "All registers"}
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
                <th className="px-4 py-3 font-medium">Registrar</th>
                <th className="px-4 py-3 font-medium">Certificate</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="pl-4 pr-5 py-3 font-medium w-px whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const svc = SERVICE_BY_ID[r.serviceId];
                const cert = CERT_META[r.status];
                const CertIcon = cert.icon;
                return (
                  <tr
                    key={r.id}
                    onClick={() => onOpenCase(r.id)}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 cursor-pointer"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{r.regNo}</td>
                    <td className="px-4 py-3 text-gray-800">
                      {r.applicant}
                      <span className="block font-mono text-[11px] text-gray-400">{r.id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-gray-600 whitespace-nowrap">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: svc?.color }} />
                        {svc?.short}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.province}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{r.submitted}</td>
                    <td className="px-4 py-3 text-gray-500">{r.officer ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
                        style={{ color: cert.color, backgroundColor: cert.bg }}
                      >
                        <CertIcon className="w-3.5 h-3.5" />
                        {cert.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
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
              {totalRows === 0 && (
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
