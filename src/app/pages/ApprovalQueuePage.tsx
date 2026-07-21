import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Eye,
  Check,
  Undo2,
  AlertTriangle,
  Clock,
  Inbox,
  Timer,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { APPLICATIONS, STATUS_META, type AppStatus, type Application } from "../data/mockData";
import { SERVICES, SERVICE_BY_ID } from "../serviceConfig";
import { StatusBadge } from "../components/StatusBadge";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { DateRangeFilter, inRange, ALL_TIME, type DateRange } from "../components/DateRangeFilter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";

/*
 * Approval Queue — PRD §11.4 lifecycle, the three stages that are waiting on an
 * officer. Draft sits with the applicant and Returned sits with the village for
 * correction, so neither belongs in an approval worklist.
 */
interface Stage {
  status: AppStatus;
  label: string;
  desc: string;
  actor: string;
  sla: number; // working-day target before the case is overdue
  approveLabel: string;
  nextLabel: string;
}

const STAGES: Stage[] = [
  {
    status: "submitted",
    label: "Village certification",
    desc: "Submitted cases awaiting address/event certification and e-signature.",
    actor: "Village Chief",
    sla: 2,
    approveLabel: "Certify",
    nextLabel: "Certified",
  },
  {
    status: "certified",
    label: "District intake",
    desc: "Certified cases waiting to be picked up for district review.",
    actor: "District Registrar",
    sla: 1,
    approveLabel: "Start review",
    nextLabel: "Under Review",
  },
  {
    status: "under-review",
    label: "Registrar decision",
    desc: "Cases under review, pending registration and e-signature.",
    actor: "District Registrar",
    sla: 3,
    approveLabel: "Register & sign",
    nextLabel: "Registered / Signed",
  },
];

const STAGE_BY_STATUS: Record<string, Stage> = Object.fromEntries(STAGES.map((s) => [s.status, s]));
const QUEUE_STATUSES = new Set(STAGES.map((s) => s.status));
const SERVICE_OPTIONS = SERVICES.map((s) => ({ value: s.id, label: s.label, color: s.color }));

const TODAY = new Date();

function daysWaiting(submitted: string): number {
  const then = new Date(submitted).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.round((TODAY.getTime() - then) / 86400000));
}

type Urgency = "overdue" | "due" | "ontrack";

function urgencyOf(app: Application): Urgency {
  const stage = STAGE_BY_STATUS[app.status];
  const waited = daysWaiting(app.submitted);
  if (waited > stage.sla) return "overdue";
  if (waited >= stage.sla) return "due";
  return "ontrack";
}

const URGENCY_META: Record<Urgency, { label: string; color: string; bg: string }> = {
  overdue: { label: "Overdue", color: "#B91C1C", bg: "#FEE2E2" },
  due: { label: "Due today", color: "#B45309", bg: "#FEF3C7" },
  ontrack: { label: "On track", color: "#475569", bg: "#F1F5F9" },
};

/* A decision taken in this session — the queue is mock data, so it lives here. */
type Decision = "approved" | "returned";

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  tone: string;
  sub: string;
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
        <p className="text-2xl font-bold text-gray-800 leading-tight">{value}</p>
        <p className="text-sm text-gray-600 truncate">{label}</p>
        <p className="text-xs text-gray-400 truncate">{sub}</p>
      </div>
    </div>
  );
}

export function ApprovalQueuePage({ onOpenCase }: { onOpenCase: (id: string) => void }) {
  const [stageTab, setStageTab] = useState<AppStatus | "all">("all");
  const [services, setServices] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>(ALL_TIME);
  const [query, setQuery] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [sort, setSort] = useState<"oldest" | "newest">("oldest");

  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [returnFor, setReturnFor] = useState<string[] | null>(null);
  const [reason, setReason] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  /* Everything still awaiting an officer, minus what was actioned this session. */
  const queue = useMemo(
    () => APPLICATIONS.filter((a) => QUEUE_STATUSES.has(a.status) && !decisions[a.id]),
    [decisions],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = queue.filter((a) => {
      if (stageTab !== "all" && a.status !== stageTab) return false;
      if (services.length && !services.includes(a.serviceId)) return false;
      if (!inRange(a.submitted, dateRange)) return false;
      if (onlyOverdue && urgencyOf(a) !== "overdue") return false;
      if (q && !`${a.id} ${a.applicant} ${a.province}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return out.sort((a, b) =>
      sort === "oldest" ? a.submitted.localeCompare(b.submitted) : b.submitted.localeCompare(a.submitted),
    );
  }, [queue, stageTab, services, dateRange, onlyOverdue, query, sort]);

  useEffect(() => setPage(1), [stageTab, services, dateRange, onlyOverdue, query, pageSize]);
  useEffect(() => setSelected([]), [stageTab, services, dateRange, onlyOverdue, query]);

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  const overdue = queue.filter((a) => urgencyOf(a) === "overdue").length;
  const dueToday = queue.filter((a) => urgencyOf(a) === "due").length;
  const avgWait = queue.length
    ? (queue.reduce((sum, a) => sum + daysWaiting(a.submitted), 0) / queue.length).toFixed(1)
    : "0";
  const processed = Object.keys(decisions).length;

  const pageIds = pageRows.map((a) => a.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  function toggleAllOnPage() {
    setSelected(allOnPageSelected ? selected.filter((id) => !pageIds.includes(id)) : [...new Set([...selected, ...pageIds])]);
  }

  function toggleRow(id: string) {
    setSelected(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  function approve(ids: string[]) {
    if (!ids.length) return;
    setDecisions((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, "approved" as Decision])) }));
    setSelected((prev) => prev.filter((id) => !ids.includes(id)));
    toast.success(
      ids.length === 1 ? `${ids[0]} approved` : `${ids.length} cases approved`,
      { description: "Moved to the next stage of the lifecycle." },
    );
  }

  function confirmReturn() {
    const ids = returnFor ?? [];
    if (!reason.trim()) {
      toast.error("A reason is required", { description: "PRD §11 requires a recorded note on every return." });
      return;
    }
    setDecisions((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, "returned" as Decision])) }));
    setSelected((prev) => prev.filter((id) => !ids.includes(id)));
    toast.success(
      ids.length === 1 ? `${ids[0]} returned for correction` : `${ids.length} cases returned for correction`,
      { description: reason.trim() },
    );
    setReturnFor(null);
    setReason("");
  }

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h1 className="text-xl font-bold text-gray-800">Approval Queue</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Cases waiting on an officer — certify, review, register or return with a note.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi icon={Inbox} label="Awaiting action" value={queue.length} tone="#3752AE" sub="Across all three stages" />
        <Kpi icon={AlertTriangle} label="Overdue" value={overdue} tone="#B91C1C" sub="Past the stage SLA" />
        <Kpi icon={Clock} label="Due today" value={dueToday} tone="#B45309" sub="SLA runs out today" />
        <Kpi icon={Timer} label="Avg. wait" value={`${avgWait} d`} tone="#0F766E" sub={`${processed} actioned this session`} />
      </div>

      {/* Stage tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2">
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...STAGES.map((s) => s.status)] as const).map((key) => {
            const stage = key === "all" ? null : STAGE_BY_STATUS[key];
            const count = key === "all" ? queue.length : queue.filter((a) => a.status === key).length;
            const active = stageTab === key;
            return (
              <button
                key={key}
                onClick={() => setStageTab(key as AppStatus | "all")}
                title={stage ? `${stage.desc} · ${stage.actor} · SLA ${stage.sla}d` : "Every stage awaiting an officer"}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm transition-colors ${
                  active ? "bg-[#3752AE] text-white font-semibold" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {stage ? stage.label : "All stages"}
                <span
                  className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                    active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        {stageTab !== "all" && (
          <p className="px-3.5 pt-2 pb-1 text-xs text-gray-400">
            {STAGE_BY_STATUS[stageTab].desc} Handled by {STAGE_BY_STATUS[stageTab].actor} · SLA{" "}
            {STAGE_BY_STATUS[stageTab].sla} day{STAGE_BY_STATUS[stageTab].sla !== 1 ? "s" : ""}.
          </p>
        )}
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
            <DateRangeFilter onChange={setDateRange} />
            <button
              onClick={() => setOnlyOverdue(!onlyOverdue)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium ${
                onlyOverdue ? "bg-[#B91C1C] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              <AlertTriangle className="w-4 h-4" /> Overdue only
            </button>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as "oldest" | "newest")}
              className="bg-gray-100 rounded-xl pl-3 pr-8 py-2 text-sm font-medium text-gray-700 outline-none hover:bg-gray-200"
            >
              <option value="oldest">Oldest first</option>
              <option value="newest">Newest first</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
          {selected.length > 0 ? (
            <>
              <p className="text-sm font-semibold text-gray-800">{selected.length} selected</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setReturnFor(selected)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-orange-50 text-orange-700 hover:bg-orange-100"
                >
                  <Undo2 className="w-4 h-4" /> Return
                </button>
                <button
                  onClick={() => approve(selected)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b]"
                >
                  <Check className="w-4 h-4" /> Approve
                </button>
                <button onClick={() => setSelected([])} className="text-sm text-gray-500 hover:underline px-1">
                  Clear
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold text-gray-800">
                {totalRows} case{totalRows !== 1 ? "s" : ""} in queue
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
            </>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="pl-5 pr-2 py-3 w-9">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleAllOnPage}
                    className="w-4 h-4 rounded border-gray-300 accent-[#3752AE] cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Ref. No.</th>
                <th className="px-4 py-3 font-medium">Applicant</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Province</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">Waiting</th>
                <th className="pl-4 pr-5 py-3 font-medium w-px whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((a) => {
                const svc = SERVICE_BY_ID[a.serviceId];
                const stage = STAGE_BY_STATUS[a.status];
                const waited = daysWaiting(a.submitted);
                const urgency = urgencyOf(a);
                const u = URGENCY_META[urgency];
                const checked = selected.includes(a.id);
                return (
                  <tr
                    key={a.id}
                    onClick={() => onOpenCase(a.id)}
                    className={`border-b border-gray-50 last:border-0 cursor-pointer ${
                      checked ? "bg-[#3752AE]/5" : "hover:bg-gray-50/60"
                    }`}
                  >
                    <td className="pl-5 pr-2 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRow(a.id)}
                        className="w-4 h-4 rounded border-gray-300 accent-[#3752AE] cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{a.id}</td>
                    <td className="px-4 py-3 text-gray-800">{a.applicant}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-gray-600">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: svc?.color }} />
                        {svc?.short}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{a.province}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className="text-gray-700 whitespace-nowrap">
                          {waited} d<span className="text-gray-400"> / {stage.sla}</span>
                        </span>
                        <span
                          className="text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{ color: u.color, backgroundColor: u.bg }}
                        >
                          {u.label}
                        </span>
                      </span>
                    </td>
                    <td className="pl-4 pr-5 py-3 w-px whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => onOpenCase(a.id)}
                          title="Open case"
                          className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setReturnFor([a.id])}
                          title="Return for correction"
                          className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-orange-600 hover:bg-orange-50"
                        >
                          <Undo2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => approve([a.id])}
                          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] whitespace-nowrap w-[132px]"
                        >
                          <Check className="w-3.5 h-3.5" /> {stage.approveLabel}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {totalRows === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">
                    {queue.length === 0
                      ? "Queue is clear — nothing is waiting on an officer."
                      : "No cases match your filters."}
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

      {/* Return-for-correction reason — PRD requires a recorded note. */}
      <Dialog open={returnFor !== null} onOpenChange={(open) => !open && setReturnFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Return for correction</DialogTitle>
            <DialogDescription>
              {returnFor?.length === 1
                ? `Case ${returnFor[0]} will go back to the village officer.`
                : `${returnFor?.length ?? 0} cases will go back to their village officers.`}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="What needs to be corrected? This note is recorded in the case history."
          />
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setReturnFor(null)}
              className="px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={confirmReturn}
              disabled={!reason.trim()}
              className="px-3.5 py-2 rounded-xl text-sm font-medium bg-[#C2410C] text-white hover:bg-[#9A3412] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Return case{(returnFor?.length ?? 0) > 1 ? "s" : ""}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-gray-400 px-1">
        Statuses shown follow the PRD §11.4 lifecycle: {STATUS_META.submitted.label} → {STATUS_META.certified.label} →{" "}
        {STATUS_META["under-review"].label} → {STATUS_META.registered.label}.
      </p>
    </div>
  );
}
