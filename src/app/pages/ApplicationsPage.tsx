import { useState } from "react";
import { Search, Filter, Eye } from "lucide-react";
import {
  APPLICATIONS,
  STATUS_ORDER,
  STATUS_META,
  type AppStatus,
} from "../data/mockData";
import { SERVICES, SERVICE_BY_ID } from "../serviceConfig";
import { StatusBadge } from "../components/StatusBadge";

const STATUS_FILTERS: { id: AppStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  ...STATUS_ORDER.map((s) => ({ id: s, label: STATUS_META[s].label })),
];

export function ApplicationsPage({ onOpenCase }: { onOpenCase: (id: string) => void }) {
  const [status, setStatus] = useState<AppStatus | "all">("all");
  const [service, setService] = useState<string>("all");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const rows = APPLICATIONS.filter((a) => {
    if (status !== "all" && a.status !== status) return false;
    if (service !== "all" && a.serviceId !== service) return false;
    if (q && !`${a.id} ${a.applicant} ${a.province}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
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

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#344EAD]"
            >
              <option value="all">All services</option>
              {SERVICES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {STATUS_FILTERS.map((f) => {
            const active = status === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setStatus(f.id)}
                className={`px-3.5 py-1.5 rounded-full text-sm transition-all ${
                  active
                    ? "bg-[#344EAD] text-white font-medium"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            {rows.length} application{rows.length !== 1 ? "s" : ""}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-5 py-3 font-medium">Ref. No.</th>
                <th className="px-5 py-3 font-medium">Applicant</th>
                <th className="px-5 py-3 font-medium">Service</th>
                <th className="px-5 py-3 font-medium">Province</th>
                <th className="px-5 py-3 font-medium">Submitted</th>
                <th className="px-5 py-3 font-medium">Officer</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
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
                    <td className="px-5 py-3 text-gray-600">{a.province}</td>
                    <td className="px-5 py-3 text-gray-500">{a.submitted}</td>
                    <td className="px-5 py-3 text-gray-500">{a.officer ?? "—"}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenCase(a.id);
                        }}
                        className="inline-flex items-center gap-1.5 text-[#344EAD] hover:underline text-sm"
                      >
                        <Eye className="w-4 h-4" /> View
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">
                    No applications match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
