/*
 * The table-style Approval Queue. The live board is ApprovalQueuePage.tsx; this
 * view is kept for officers who prefer a worklist they can multi-select, and it
 * reads the same /admin/cases/queue endpoint with the same server-side filters.
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { catalog, workflow } from "../api/endpoints";
import { useDebounced, useQuery } from "../api/hooks";
import { ApiError } from "../api/client";
import { text, type Bilingual, type CaseStatus, type QueueRow, type ReferenceItem } from "../api/types";
import { StatusBadge } from "../components/StatusBadge";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { DateRangeFilter, ALL_TIME, type DateRange } from "../components/DateRangeFilter";
import { SignaturePad, type Signature } from "../components/SignaturePad";
import { StampPad, type Stamp } from "../components/StampPad";
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
  status: CaseStatus;
  label: string;
  desc: string;
  actor: string;
  sla: number; // working-day target before the case is overdue
  approveLabel: string;
  /** The transition this stage's approve button asks the API to perform. */
  action: string;
  nextLabel: string;
}

const STAGES: Stage[] = [
  {
    status: "submitted",
    label: "Village certification",
    desc: "Submitted cases awaiting address/event certification and e-signature.",
    actor: "Village Chief",
    sla: 3,
    approveLabel: "Certify",
    action: "certify",
    nextLabel: "Certified",
  },
  {
    status: "certified",
    label: "District intake",
    desc: "Certified cases waiting to be picked up for district review.",
    actor: "District Registrar",
    sla: 2,
    approveLabel: "Start review",
    action: "receive",
    nextLabel: "Under Review",
  },
  {
    status: "under-review",
    label: "Registrar decision",
    desc: "Cases under review, pending registration and e-signature.",
    actor: "District Registrar",
    sla: 5,
    approveLabel: "Register & sign",
    action: "register",
    nextLabel: "Registered / Signed",
  },
];

const STAGE_BY_STATUS: Record<string, Stage> = Object.fromEntries(STAGES.map((s) => [s.status, s]));

type Urgency = "overdue" | "due" | "ontrack";

const URGENCY_META: Record<Urgency, { label: string; color: string; bg: string }> = {
  overdue: { label: "Overdue", color: "#B91C1C", bg: "#FEE2E2" },
  due: { label: "Due today", color: "#B45309", bg: "#FEF3C7" },
  ontrack: { label: "On track", color: "#475569", bg: "#F1F5F9" },
};

/* ── Wire shapes wider than the shared types ──────────────────────────────── */

type QueueCard = QueueRow & { urgency?: Urgency };

interface StageBucket {
  status: CaseStatus;
  stage: string;
  stage_owner: string;
  sla_days: number;
  total: number;
  overdue: number;
  due_today: number;
}

interface ServerQueueSummary {
  stages?: StageBucket[];
  awaiting?: number;
  total?: number;
  overdue?: number;
  due_today?: number;
}

interface ServerAction {
  action: string;
  label: string;
  to_status: CaseStatus;
  needs_reason?: boolean;
  needs_signature?: boolean;
  needs_paid_fee?: boolean;
  blocked?: boolean;
  blocked_reason?: string;
}

interface BulkOutcome {
  action: string;
  succeeded: number;
  failed: number;
  results?: Array<{ application_id: string; reference_no?: string; success: boolean; message?: string }>;
}

function referenceItems(payload: unknown): ReferenceItem[] {
  if (Array.isArray(payload)) return payload as ReferenceItem[];
  const items = (payload as { items?: ReferenceItem[] } | null)?.items;
  return Array.isArray(items) ? items : [];
}

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

export function ApprovalQueueTable({ onOpenCase }: { onOpenCase: (id: string) => void }) {
  const [stageTab, setStageTab] = useState<CaseStatus | "all">("all");
  const [services, setServices] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>(ALL_TIME);
  const [query, setQuery] = useState("");
  const search = useDebounced(query, 350);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [sort, setSort] = useState<"oldest" | "newest">("oldest");

  const [selected, setSelected] = useState<string[]>([]);
  const [actioned, setActioned] = useState(0);

  /* A reason-backed move over one case or a selection. */
  const [pending, setPending] = useState<{ rows: QueueCard[]; action: ServerAction; bulk: boolean } | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [reason, setReason] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [stampOpen, setStampOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const signatureRef = useRef("");
  const signatureHandled = useRef(false);
  const stampHandled = useRef(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const serviceKey = services.join(",");

  const serviceList = useQuery((signal) => catalog.services({ phase1: true }, signal), []);
  const reasonCodes = useQuery((signal) => catalog.referenceList("reason-code", signal), []);

  const summary = useQuery(
    (signal) =>
      workflow.queueSummary(
        { service_code: services, search: search.trim() || undefined },
        signal,
      ) as unknown as Promise<ServerQueueSummary>,
    [serviceKey, search],
  );

  const list = useQuery(
    (signal) =>
      workflow.queue(
        {
          page,
          per_page: pageSize,
          status: stageTab === "all" ? undefined : stageTab,
          service_code: services,
          search: search.trim() || undefined,
          overdue: onlyOverdue ? true : undefined,
          sort: sort === "oldest" ? "submitted" : "-submitted",
          date_from: dateRange.from || undefined,
          date_to: dateRange.to || undefined,
        },
        signal,
      ),
    [page, pageSize, stageTab, serviceKey, search, onlyOverdue, sort, dateRange.from, dateRange.to],
  );

  useEffect(() => setPage(1), [stageTab, serviceKey, dateRange.from, dateRange.to, onlyOverdue, search, pageSize]);
  useEffect(() => setSelected([]), [stageTab, serviceKey, dateRange.from, dateRange.to, onlyOverdue, search, page]);

  function refetchAll() {
    summary.refetch();
    list.refetch();
  }

  const serviceOptions = useMemo(
    () => (serviceList.data ?? []).map((s) => ({ value: s.code, label: text(s.name), color: s.color })),
    [serviceList.data],
  );
  const reasonOptions = useMemo(() => referenceItems(reasonCodes.data), [reasonCodes.data]);

  const buckets = summary.data?.stages ?? [];
  const awaiting = summary.data?.awaiting ?? summary.data?.total ?? 0;
  const overdue = summary.data?.overdue ?? 0;
  const dueToday = summary.data?.due_today ?? 0;
  const countFor = (key: CaseStatus | "all") =>
    key === "all" ? awaiting : buckets.find((b) => b.status === key)?.total ?? 0;

  const rows = (list.data?.data ?? []) as QueueCard[];
  const totalRows = list.data?.meta.total ?? 0;
  const totalPages = Math.max(1, list.data?.meta.total_pages ?? 1);
  const currentPage = list.data?.meta.page ?? page;
  const start = (currentPage - 1) * pageSize;

  const avgWait = rows.length
    ? (rows.reduce((sum, r) => sum + (r.days_waiting ?? 0), 0) / rows.length).toFixed(1)
    : "0";

  const pageIds = rows.map((r) => r.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  function toggleAllOnPage() {
    setSelected(
      allOnPageSelected ? selected.filter((id) => !pageIds.includes(id)) : [...new Set([...selected, ...pageIds])],
    );
  }

  function toggleRow(id: string) {
    setSelected(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  /* ── Transitions ───────────────────────────────────────────────────────── */

  function closeDialogs() {
    setPending(null);
    setReasonCode("");
    setReason("");
    setDialogError(null);
    setSignOpen(false);
    setStampOpen(false);
    signatureRef.current = "";
  }

  function reportError(err: unknown, fallback: string) {
    const apiErr = err instanceof ApiError ? err : null;
    const message = apiErr?.message ?? fallback;
    setDialogError(message);
    toast.error(apiErr?.status === 409 ? "That move is not allowed right now" : "Action failed", {
      description: message,
    });
  }

  /** Ask the API what this role may do to one case, then take the right step. */
  async function begin(row: QueueCard, wanted: string) {
    setBusy(true);
    setDialogError(null);
    try {
      const res = (await workflow.actions(row.id)) as unknown as { actions?: ServerAction[] };
      const available = res.actions ?? [];
      const action = available.find((a) => a.action === wanted);
      if (!action) {
        toast.error("Not available to your role", {
          description: available.length
            ? `You may ${available.map((a) => a.action).join(", ")} on ${row.reference_no}.`
            : `No action is open to you on ${row.reference_no}.`,
        });
        return;
      }
      if (action.blocked) {
        toast.error(action.label, { description: action.blocked_reason ?? "This move is blocked on this case." });
        return;
      }
      setPending({ rows: [row], action, bulk: false });
      if (action.needs_reason) {
        setReasonCode("");
        setReason("");
      } else if (action.needs_signature) {
        signatureRef.current = "";
        signatureHandled.current = false;
        setSignOpen(true);
      } else {
        await runSingle(row, action, {});
      }
    } catch (err) {
      reportError(err, "Could not read the available actions.");
    } finally {
      setBusy(false);
    }
  }

  async function runSingle(
    row: QueueCard,
    action: ServerAction,
    body: { reason_code?: string; reason?: string; signature_data_url?: string; stamp_data_url?: string },
  ) {
    setBusy(true);
    try {
      switch (action.action) {
        case "certify":
          await workflow.certify(row.id, body);
          break;
        case "receive":
          await workflow.receive(row.id, body);
          break;
        case "register":
          await workflow.register(row.id, body);
          break;
        case "issue":
          await workflow.issue(row.id, body);
          break;
        case "return":
          await workflow.returnCase(row.id, body);
          break;
        case "reject":
          await workflow.reject(row.id, body);
          break;
        case "revoke":
          await workflow.revoke(row.id, body);
          break;
        default:
          throw new ApiError(400, "BAD_REQUEST", `Unknown action "${action.action}".`);
      }
      setActioned((n) => n + 1);
      setSelected((prev) => prev.filter((id) => id !== row.id));
      toast.success(`${row.reference_no} — ${action.label.toLowerCase()}`, {
        description: `Now ${action.to_status.replace("-", " ")}.`,
      });
      closeDialogs();
      refetchAll();
    } catch (err) {
      reportError(err, "The case could not be moved.");
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(action: ServerAction, ids: string[], body: { reason_code?: string; reason?: string }) {
    setBusy(true);
    try {
      const out = (await workflow.bulk({
        application_ids: ids,
        action: action.action,
        ...body,
      })) as unknown as BulkOutcome;
      const ok = out.succeeded ?? 0;
      const bad = out.failed ?? 0;
      setActioned((n) => n + ok);
      setSelected([]);
      const firstFailure = out.results?.find((r) => !r.success)?.message;
      if (ok > 0) {
        toast.success(`${action.label} — ${ok} case${ok !== 1 ? "s" : ""}`, {
          description: bad > 0 ? `${bad} refused — ${firstFailure ?? "see the case history."}` : undefined,
        });
      } else {
        toast.error("No case could be moved", { description: firstFailure ?? "Every case refused the transition." });
      }
      closeDialogs();
      refetchAll();
    } catch (err) {
      reportError(err, "The selection could not be moved.");
    } finally {
      setBusy(false);
    }
  }

  /** The bulk endpoint applies one transition, so the selection needs one stage. */
  function beginBulk(wanted: "approve" | "return") {
    const chosen = selected.map((id) => rowById.get(id)).filter((r): r is QueueCard => !!r);
    if (!chosen.length) return;

    if (wanted === "return") {
      setPending({
        rows: chosen,
        action: { action: "return", label: "Return for correction", to_status: "returned", needs_reason: true },
        bulk: true,
      });
      setReasonCode("");
      setReason("");
      setDialogError(null);
      return;
    }

    const statuses = [...new Set(chosen.map((r) => r.status))];
    if (statuses.length > 1) {
      toast.error("Pick one stage first", {
        description: "A bulk approval applies a single transition, so every selected case must sit at the same stage.",
      });
      return;
    }
    const stage = STAGE_BY_STATUS[statuses[0]];
    if (!stage) {
      toast.error("Nothing to approve", { description: "These cases are not waiting on an approval." });
      return;
    }
    void runBulk(
      { action: stage.action, label: stage.approveLabel, to_status: "submitted" as CaseStatus },
      chosen.map((r) => r.id),
      {},
    );
  }

  function onSignature(sig: Signature) {
    signatureHandled.current = true;
    signatureRef.current = sig.dataUrl ?? sig.data;
    setSignOpen(false);
    if (!pending) return;
    if (pending.action.action === "certify") {
      stampHandled.current = false;
      setStampOpen(true);
      return;
    }
    void runSingle(pending.rows[0], pending.action, { signature_data_url: signatureRef.current });
  }

  function onStamp(stamp: Stamp) {
    stampHandled.current = true;
    setStampOpen(false);
    if (!pending) return;
    void runSingle(pending.rows[0], pending.action, {
      signature_data_url: signatureRef.current,
      stamp_data_url: stamp.dataUrl ?? stamp.data,
    });
  }

  function onStampClosed() {
    setStampOpen(false);
    if (stampHandled.current || !pending) return;
    void runSingle(pending.rows[0], pending.action, { signature_data_url: signatureRef.current });
  }

  function confirmReasoned() {
    if (!pending) return;
    if (!reasonCode) {
      setDialogError("Choose a reason code — it is recorded against the case.");
      return;
    }
    if (!reason.trim()) {
      setDialogError("A written reason is required. PRD §11 records a note on every return.");
      return;
    }
    const body = { reason_code: reasonCode, reason: reason.trim() };
    if (pending.bulk) void runBulk(pending.action, pending.rows.map((r) => r.id), body);
    else void runSingle(pending.rows[0], pending.action, body);
  }

  const reasoned = pending?.action.needs_reason ? pending : null;

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
        <Kpi icon={Inbox} label="Awaiting action" value={summary.loading ? "—" : awaiting} tone="#3752AE" sub="Across all three stages" />
        <Kpi icon={AlertTriangle} label="Overdue" value={summary.loading ? "—" : overdue} tone="#B91C1C" sub="Past the stage SLA" />
        <Kpi icon={Clock} label="Due today" value={summary.loading ? "—" : dueToday} tone="#B45309" sub="SLA runs out today" />
        <Kpi icon={Timer} label="Avg. wait" value={`${avgWait} d`} tone="#0F766E" sub={`${actioned} actioned this session`} />
      </div>

      {/* Stage tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2">
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...STAGES.map((s) => s.status)] as const).map((key) => {
            const stage = key === "all" ? null : STAGE_BY_STATUS[key];
            const count = countFor(key as CaseStatus | "all");
            const active = stageTab === key;
            return (
              <button
                key={key}
                onClick={() => setStageTab(key as CaseStatus | "all")}
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
                  {summary.loading ? "…" : count}
                </span>
              </button>
            );
          })}
        </div>
        {stageTab !== "all" && (
          <p className="px-3.5 pt-2 pb-1 text-xs text-gray-400">
            {STAGE_BY_STATUS[stageTab].desc} Handled by {STAGE_BY_STATUS[stageTab].actor} · SLA{" "}
            {buckets.find((b) => b.status === stageTab)?.sla_days ?? STAGE_BY_STATUS[stageTab].sla} day
            {(buckets.find((b) => b.status === stageTab)?.sla_days ?? STAGE_BY_STATUS[stageTab].sla) !== 1 ? "s" : ""}.
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
            <MultiSelectFilter label="Services" options={serviceOptions} selected={services} onChange={setServices} />
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
                  onClick={() => beginBulk("return")}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-40"
                >
                  <Undo2 className="w-4 h-4" /> Return
                </button>
                <button
                  onClick={() => beginBulk("approve")}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] disabled:opacity-40"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve
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
              {rows.map((a) => {
                const stage = STAGE_BY_STATUS[a.status];
                const urgency = (a.urgency ?? (a.days_overdue > 0 ? "overdue" : "ontrack")) as Urgency;
                const u = URGENCY_META[urgency] ?? URGENCY_META.ontrack;
                const checked = selected.includes(a.id);
                const svcColor = serviceOptions.find((o) => o.value === a.service_code)?.color ?? "#94A3B8";
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
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{a.reference_no}</td>
                    <td className="px-4 py-3 text-gray-800">{a.applicant}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-gray-600">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: svcColor }} />
                        {text(a.service_name as Bilingual) || a.service_code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{a.jurisdiction?.province_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className="text-gray-700 whitespace-nowrap">
                          {a.days_waiting} d<span className="text-gray-400"> / {a.sla_days ?? stage?.sla ?? 0}</span>
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
                          onClick={() => void begin(a, "return")}
                          disabled={busy}
                          title="Return for correction"
                          className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-orange-600 hover:bg-orange-50 disabled:opacity-40"
                        >
                          <Undo2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => void begin(a, stage?.action ?? "issue")}
                          disabled={busy}
                          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] whitespace-nowrap w-[132px] disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" /> {stage?.approveLabel ?? "Approve"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {list.loading && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-gray-300" />
                    Loading the queue…
                  </td>
                </tr>
              )}

              {!list.loading && list.error && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center">
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
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">
                    {awaiting === 0
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

      {/* Reason-backed moves — the API requires a code and a written note. */}
      <Dialog open={!!reasoned} onOpenChange={(open) => !open && closeDialogs()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{reasoned?.action.label ?? "Return for correction"}</DialogTitle>
            <DialogDescription>
              {reasoned?.rows.length === 1
                ? `Case ${reasoned.rows[0].reference_no} will go back to the village officer.`
                : `${reasoned?.rows.length ?? 0} cases will go back to their village officers.`}
            </DialogDescription>
          </DialogHeader>

          <select
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#3752AE]"
          >
            <option value="">Select a reason code…</option>
            {reasonOptions.map((r) => (
              <option key={r.code} value={r.code}>
                {text(r.label)}
              </option>
            ))}
          </select>

          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="What needs to be corrected? This note is recorded in the case history."
          />

          {dialogError && <p className="text-sm text-red-600">{dialogError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={closeDialogs}
              className="px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={confirmReasoned}
              disabled={!reason.trim() || !reasonCode || busy}
              className="px-3.5 py-2 rounded-xl text-sm font-medium bg-[#C2410C] text-white hover:bg-[#9A3412] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Return case{(reasoned?.rows.length ?? 0) > 1 ? "s" : ""}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Certify / register carry the officer's e-signature. */}
      <SignaturePad
        open={signOpen}
        onClose={() => {
          setSignOpen(false);
          if (!signatureHandled.current) setPending(null);
        }}
        onApply={onSignature}
      />
      <StampPad open={stampOpen} onClose={onStampClosed} onApply={onStamp} />

      <p className="text-xs text-gray-400 px-1">
        Statuses shown follow the PRD §11.4 lifecycle: Submitted → Certified → Under Review → Registered / Signed.
      </p>
    </div>
  );
}
