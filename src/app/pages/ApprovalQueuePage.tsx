import { useMemo, useRef, useState } from "react";
import {
  Search, Eye, Check, Undo2, AlertTriangle, Clock, Inbox, Timer, ArrowRight, Users, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { catalog, workflow } from "../api/endpoints";
import { useDebounced, useQuery } from "../api/hooks";
import { ApiError } from "../api/client";
import { text, type Bilingual, type CaseStatus, type QueueRow, type ReferenceItem } from "../api/types";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { SignaturePad, type Signature } from "../components/SignaturePad";
import { StampPad, type Stamp } from "../components/StampPad";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";

/*
 * Approval Queue — a worklist BOARD, not a table. Each column is one stage of the
 * PRD §11.4 lifecycle that waits on an officer; a case flows left to right as it
 * is approved, and drops off the board when it registers or is returned.
 *
 * The board is served by /admin/cases/queue: one request per column, filtered
 * server-side by status, service, search and the overdue flag. The waiting time
 * and the urgency badge are the API's own (`days_waiting` / `urgency`), so the
 * board agrees with the SLA the backend enforces.
 */
interface Stage {
  status: CaseStatus;
  label: string;
  actor: string;
  sla: number; // working-day target at this stage, until the API states its own
  approveLabel: string;
  /** The transition this column's approve button asks the API to perform. */
  action: string;
  next: CaseStatus; // where an approved case goes
  accent: string;
}

const STAGES: Stage[] = [
  { status: "submitted", label: "Village certification", actor: "Village Chief", sla: 3, approveLabel: "Certify", action: "certify", next: "certified", accent: "#1D4ED8" },
  { status: "certified", label: "District intake", actor: "District Registrar", sla: 2, approveLabel: "Start review", action: "receive", next: "under-review", accent: "#0369A1" },
  { status: "under-review", label: "Registrar decision", actor: "District Registrar", sla: 5, approveLabel: "Register & sign", action: "register", next: "registered", accent: "#6D28D9" },
];

type Urgency = "overdue" | "due" | "ontrack";
const URGENCY_META: Record<Urgency, { label: string; color: string; bg: string }> = {
  overdue: { label: "Overdue", color: "#B91C1C", bg: "#FEE2E2" },
  due: { label: "Due today", color: "#B45309", bg: "#FEF3C7" },
  ontrack: { label: "On track", color: "#059669", bg: "#D1FAE5" },
};

/* ── Wire shapes the API sends that are wider than the shared types ────────── */

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

/** The reference-list endpoint answers either a bare array or { items }. */
function referenceItems(payload: unknown): ReferenceItem[] {
  if (Array.isArray(payload)) return payload as ReferenceItem[];
  const items = (payload as { items?: ReferenceItem[] } | null)?.items;
  return Array.isArray(items) ? items : [];
}

const PER_COLUMN = 40;

/* A negative move the officer has to justify. */
const REASONED_ACTIONS: Record<string, { title: string; verb: string; blurb: string }> = {
  return: { title: "Return for correction", verb: "Return case", blurb: "will go back to the village officer." },
  reject: { title: "Reject case", verb: "Reject case", blurb: "will be closed as rejected." },
  revoke: { title: "Revoke case", verb: "Revoke case", blurb: "will have its certificate revoked." },
};

function Kpi({
  icon: Icon, label, value, tone, sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number | string; tone: string; sub: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
      <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${tone}14`, color: tone }}>
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
  const [services, setServices] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const search = useDebounced(query, 350);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [actioned, setActioned] = useState(0);

  /* The move being taken: which case, which transition, what it still needs. */
  const [pending, setPending] = useState<{ row: QueueCard; action: ServerAction } | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [reason, setReason] = useState("");
  const [signOpen, setSignOpen] = useState(false);
  const [stampOpen, setStampOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const signatureRef = useRef("");
  // The pads call onApply and then onClose, so "was it applied?" has to survive
  // the same tick — state would still be stale when onClose reads it.
  const signatureHandled = useRef(false);
  const stampHandled = useRef(false);

  const serviceKey = services.join(",");
  const filters = useMemo(
    () => ({
      service_code: services,
      search: search.trim() || undefined,
      overdue: onlyOverdue ? true : undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serviceKey, search, onlyOverdue],
  );

  const serviceList = useQuery((signal) => catalog.services({ phase1: true }, signal), []);
  const reasonCodes = useQuery((signal) => catalog.referenceList("reason-code", signal), []);

  const summary = useQuery(
    (signal) => workflow.queueSummary({ ...filters }, signal) as unknown as Promise<ServerQueueSummary>,
    [serviceKey, search, onlyOverdue],
  );

  /* One request per column: the status filter is a query parameter, not a
   * client-side pass over a downloaded array. */
  const colSubmitted = useQuery(
    (signal) => workflow.queue({ ...filters, status: "submitted", page: 1, per_page: limits.submitted ?? PER_COLUMN, sort: "submitted" }, signal),
    [serviceKey, search, onlyOverdue, limits.submitted],
  );
  const colCertified = useQuery(
    (signal) => workflow.queue({ ...filters, status: "certified", page: 1, per_page: limits.certified ?? PER_COLUMN, sort: "submitted" }, signal),
    [serviceKey, search, onlyOverdue, limits.certified],
  );
  const colReview = useQuery(
    (signal) => workflow.queue({ ...filters, status: "under-review", page: 1, per_page: limits["under-review"] ?? PER_COLUMN, sort: "submitted" }, signal),
    [serviceKey, search, onlyOverdue, limits["under-review"]],
  );

  const columns = { submitted: colSubmitted, certified: colCertified, "under-review": colReview } as const;

  function refetchAll() {
    summary.refetch();
    colSubmitted.refetch();
    colCertified.refetch();
    colReview.refetch();
  }

  const serviceOptions = useMemo(
    () => (serviceList.data ?? []).map((s) => ({ value: s.code, label: text(s.name), color: s.color })),
    [serviceList.data],
  );
  const reasonOptions = useMemo(() => referenceItems(reasonCodes.data), [reasonCodes.data]);

  const buckets = summary.data?.stages ?? [];
  const bucketOf = (status: string) => buckets.find((b) => b.status === status);
  const awaiting = summary.data?.awaiting ?? summary.data?.total ?? 0;
  const overdue = summary.data?.overdue ?? 0;
  const dueToday = summary.data?.due_today ?? 0;

  const loadedCards = STAGES.flatMap((s) => (columns[s.status as keyof typeof columns].data?.data ?? []) as QueueCard[]);
  const avgWait = loadedCards.length
    ? (loadedCards.reduce((sum, c) => sum + (c.days_waiting ?? 0), 0) / loadedCards.length).toFixed(1)
    : "0";

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
    // A refused transition comes back 409 with a message worth reading.
    const message = apiErr?.message ?? fallback;
    setDialogError(message);
    toast.error(apiErr?.status === 409 ? "That move is not allowed right now" : "Action failed", {
      description: message,
    });
  }

  /** Ask the API what this role may do to this case, then open the right step. */
  async function begin(row: QueueCard, wanted: string) {
    setBusyId(row.id);
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
      setPending({ row, action });
      if (action.needs_reason) {
        setReasonCode("");
        setReason("");
      } else if (action.needs_signature) {
        signatureRef.current = "";
        signatureHandled.current = false;
        setSignOpen(true);
      } else {
        await submit(row, action, {});
      }
    } catch (err) {
      reportError(err, "Could not read the available actions.");
    } finally {
      setBusyId(null);
    }
  }

  async function submit(
    row: QueueCard,
    action: ServerAction,
    body: { reason_code?: string; reason?: string; signature_data_url?: string; stamp_data_url?: string },
  ) {
    setBusyId(row.id);
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
      toast.success(`${row.reference_no} — ${action.label.toLowerCase()}`, {
        description: `Now ${action.to_status.replace("-", " ")}.`,
      });
      closeDialogs();
      refetchAll();
    } catch (err) {
      reportError(err, "The case could not be moved.");
    } finally {
      setBusyId(null);
    }
  }

  function onSignature(sig: Signature) {
    signatureHandled.current = true;
    signatureRef.current = sig.dataUrl ?? sig.data;
    setSignOpen(false);
    if (!pending) return;
    // Certification carries the village stamp alongside the signature; the
    // stamp step is optional and closing it submits the signature alone.
    if (pending.action.action === "certify") {
      stampHandled.current = false;
      setStampOpen(true);
      return;
    }
    void submit(pending.row, pending.action, { signature_data_url: signatureRef.current });
  }

  function onStamp(stamp: Stamp) {
    stampHandled.current = true;
    setStampOpen(false);
    if (!pending) return;
    void submit(pending.row, pending.action, {
      signature_data_url: signatureRef.current,
      stamp_data_url: stamp.dataUrl ?? stamp.data,
    });
  }

  function onStampClosed() {
    setStampOpen(false);
    if (stampHandled.current || !pending) return;
    void submit(pending.row, pending.action, { signature_data_url: signatureRef.current });
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
    void submit(pending.row, pending.action, { reason_code: reasonCode, reason: reason.trim() });
  }

  const reasoned = pending && pending.action.needs_reason ? REASONED_ACTIONS[pending.action.action] : undefined;

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h1 className="text-xl font-bold text-gray-800">Approval Queue</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Your worklist — move a case right as you approve it, or send it back with a note.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi icon={Inbox} label="Awaiting action" value={summary.loading ? "—" : awaiting} tone="#3752AE" sub="On the board now" />
        <Kpi icon={AlertTriangle} label="Overdue" value={summary.loading ? "—" : overdue} tone="#B91C1C" sub="Past the stage target" />
        <Kpi icon={Clock} label="Due today" value={summary.loading ? "—" : dueToday} tone="#B45309" sub="Target runs out today" />
        <Kpi icon={Timer} label="Avg. wait" value={`${avgWait} d`} tone="#0F766E" sub={`${actioned} actioned this session`} />
      </div>

      {summary.error && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-red-600">{summary.error.message}</p>
          <button
            onClick={() => refetchAll()}
            className="px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            Retry
          </button>
        </div>
      )}

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
            <button
              onClick={() => setOnlyOverdue(!onlyOverdue)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium ${
                onlyOverdue ? "bg-[#B91C1C] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              <AlertTriangle className="w-4 h-4" /> Overdue only
            </button>
          </div>
        </div>
      </div>

      {/* Board */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {STAGES.map((stage, i) => {
          const column = columns[stage.status as keyof typeof columns];
          const cards = (column.data?.data ?? []) as QueueCard[];
          const bucket = bucketOf(stage.status);
          const total = column.data?.meta.total ?? bucket?.total ?? 0;
          const stageOverdue = bucket?.overdue ?? cards.filter((c) => c.urgency === "overdue").length;
          const sla = bucket?.sla_days ?? stage.sla;
          const actor = bucket?.stage_owner || stage.actor;
          const stageLabel = bucket?.stage ? bucket.stage : stage.label;
          return (
            <div key={stage.status} className="bg-gray-50/70 rounded-2xl border border-gray-100 flex flex-col">
              {/* Column header */}
              <div className="p-4 border-b border-gray-100">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.accent }} />
                    <h2 className="text-sm font-semibold text-gray-800 truncate capitalize">{stageLabel}</h2>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white text-gray-600 border border-gray-100 flex-shrink-0">
                    {column.loading ? "…" : total}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[11px] text-gray-400">
                  <span className="flex items-center gap-1 truncate">
                    <Users className="w-3 h-3 flex-shrink-0" /> {actor} · SLA {sla}d
                  </span>
                  {stageOverdue > 0 && (
                    <span className="text-red-500 font-medium flex-shrink-0">{stageOverdue} overdue</span>
                  )}
                </div>
              </div>

              {/* Cards */}
              <div className="p-3 space-y-2.5 flex-1 min-h-[120px] max-h-[calc(100vh-360px)] overflow-y-auto">
                {column.loading && (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Loader2 className="w-6 h-6 text-gray-300 mb-1.5 animate-spin" />
                    <p className="text-xs text-gray-400">Loading cases…</p>
                  </div>
                )}

                {!column.loading && column.error && (
                  <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                    <AlertTriangle className="w-6 h-6 text-red-300" />
                    <p className="text-xs text-red-600 px-3">{column.error.message}</p>
                    <button
                      onClick={column.refetch}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {!column.loading && !column.error && cards.map((card) => {
                  const urgency = (card.urgency ?? (card.days_overdue > 0 ? "overdue" : "ontrack")) as Urgency;
                  const u = URGENCY_META[urgency] ?? URGENCY_META.ontrack;
                  const svcColor = serviceOptions.find((o) => o.value === card.service_code)?.color ?? stage.accent;
                  const busy = busyId === card.id;
                  return (
                    <div
                      key={card.id}
                      className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 hover:border-gray-200 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button onClick={() => onOpenCase(card.id)} className="text-left min-w-0 group">
                          <p className="text-sm font-medium text-gray-800 truncate group-hover:text-[#3752AE]">
                            {card.applicant}
                          </p>
                          <p className="font-mono text-[11px] text-gray-400">{card.reference_no}</p>
                        </button>
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
                          style={{ color: u.color, backgroundColor: u.bg }}
                        >
                          {u.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: svcColor }} />
                          {text(card.service_name as Bilingual) || card.service_code}
                        </span>
                        <span className="text-gray-300">·</span>
                        <span className="truncate">{card.jurisdiction?.province_name ?? "—"}</span>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                        <span className="text-[11px] text-gray-500 whitespace-nowrap">
                          {card.days_waiting}d
                          <span className="text-gray-300"> / {card.sla_days ?? sla}d</span>
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onOpenCase(card.id)}
                            title="Open case"
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => void begin(card, "return")}
                            disabled={busy}
                            title="Return for correction"
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-orange-600 hover:bg-orange-50 disabled:opacity-40"
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => void begin(card, stage.action)}
                            disabled={busy}
                            title={stage.approveLabel}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] whitespace-nowrap disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                            {stage.approveLabel}
                            {i < STAGES.length - 1 ? <ArrowRight className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!column.loading && !column.error && cards.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Check className="w-6 h-6 text-gray-300 mb-1.5" />
                    <p className="text-xs text-gray-400">Nothing waiting here</p>
                  </div>
                )}

                {!column.loading && !column.error && cards.length > 0 && cards.length < total && (
                  <button
                    onClick={() => setLimits((prev) => ({ ...prev, [stage.status]: cards.length + PER_COLUMN }))}
                    className="w-full py-2 text-xs font-medium text-[#3752AE] hover:underline"
                  >
                    Load {Math.min(PER_COLUMN, total - cards.length)} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 px-1">
        Approving a case moves it to the next stage; the final stage registers and signs it, taking it off the board.
        Every move is recorded against the case by the registry.
      </p>

      {/* Reason-backed moves — the API requires a code and a written note. */}
      <Dialog open={!!reasoned} onOpenChange={(open) => !open && closeDialogs()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{reasoned?.title ?? "Return for correction"}</DialogTitle>
            <DialogDescription>
              {pending ? `Case ${pending.row.reference_no} ${reasoned?.blurb ?? ""}` : ""}
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
              disabled={!reason.trim() || !reasonCode || busyId !== null}
              className="px-3.5 py-2 rounded-xl text-sm font-medium bg-[#C2410C] text-white hover:bg-[#9A3412] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {reasoned?.verb ?? "Return case"}
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
    </div>
  );
}
