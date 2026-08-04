import { useMemo, useState } from "react";
import {
  Search, Eye, Check, Undo2, AlertTriangle, Clock, Inbox, Timer, ArrowRight, Users,
} from "lucide-react";
import { toast } from "sonner";
import { APPLICATIONS, lastActivityOf, daysAgo, type AppStatus, type Application } from "../data/mockData";
import { SERVICES, SERVICE_BY_ID } from "../serviceConfig";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";

/*
 * Approval Queue — a worklist BOARD, not a table. Each column is one stage of the
 * PRD §11.4 lifecycle that waits on an officer; a case flows left to right as it
 * is approved, and drops off the board when it registers or is returned.
 *
 * "Waiting" is time at the CURRENT stage (days since the case last moved), not
 * total age — using the `updated` field, so a case that just reached a registrar
 * doesn't read as weeks overdue.
 */
interface Stage {
  status: AppStatus;
  label: string;
  actor: string;
  sla: number; // working-day target at this stage
  approveLabel: string;
  next: AppStatus; // where an approved case goes
  accent: string;
}

const STAGES: Stage[] = [
  { status: "submitted", label: "Village certification", actor: "Village Chief", sla: 3, approveLabel: "Certify", next: "certified", accent: "#1D4ED8" },
  { status: "certified", label: "District intake", actor: "District Registrar", sla: 2, approveLabel: "Start review", next: "under-review", accent: "#0369A1" },
  { status: "under-review", label: "Registrar decision", actor: "District Registrar", sla: 5, approveLabel: "Register & sign", next: "registered", accent: "#6D28D9" },
];

const STAGE_BY_STATUS: Record<string, Stage> = Object.fromEntries(STAGES.map((s) => [s.status, s]));
const QUEUE_STATUSES = new Set(STAGES.map((s) => s.status));
const SERVICE_OPTIONS = SERVICES.map((s) => ({ value: s.id, label: s.label, color: s.color }));

type Urgency = "overdue" | "due" | "ontrack";
const URGENCY_META: Record<Urgency, { label: string; color: string; bg: string }> = {
  overdue: { label: "Overdue", color: "#B91C1C", bg: "#FEE2E2" },
  due: { label: "Due today", color: "#B45309", bg: "#FEF3C7" },
  ontrack: { label: "On track", color: "#059669", bg: "#D1FAE5" },
};

function urgencyOf(waited: number, sla: number): Urgency {
  if (waited > sla) return "overdue";
  if (waited >= sla) return "due";
  return "ontrack";
}

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

interface Card {
  app: Application;
  stage: Stage;
  waited: number;
  urgency: Urgency;
  justMoved: boolean;
}

export function ApprovalQueuePage({ onOpenCase }: { onOpenCase: (id: string) => void }) {
  const [services, setServices] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  /* Session-local moves: a case's status after being actioned on the board.
   * The mock data is constant, so decisions live here. */
  const [moved, setMoved] = useState<Record<string, AppStatus>>({});
  const [returnFor, setReturnFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const effectiveStatus = (a: Application): AppStatus => moved[a.id] ?? a.status;

  /* Cases that started in a queue stage, bucketed by where they are now. */
  const board = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cards: Record<string, Card[]> = Object.fromEntries(STAGES.map((s) => [s.status, []]));
    for (const app of APPLICATIONS) {
      if (!QUEUE_STATUSES.has(app.status)) continue; // only ever-queued cases
      const status = moved[app.id] ?? app.status;
      const stage = STAGE_BY_STATUS[status];
      if (!stage) continue; // moved off the board (registered / returned)
      if (services.length && !services.includes(app.serviceId)) continue;
      if (q && !`${app.id} ${app.applicant} ${app.province}`.toLowerCase().includes(q)) continue;

      const justMoved = app.id in moved;
      const waited = justMoved ? 0 : daysAgo(lastActivityOf(app));
      const urgency = urgencyOf(waited, stage.sla);
      if (onlyOverdue && urgency !== "overdue") continue;
      cards[status].push({ app, stage, waited, urgency, justMoved });
    }
    // Worklist ordering: longest-waiting first.
    for (const s of STAGES) cards[s.status].sort((a, b) => b.waited - a.waited);
    return cards;
  }, [moved, services, query, onlyOverdue]);

  const all = STAGES.flatMap((s) => board[s.status]);
  const overdue = all.filter((c) => c.urgency === "overdue").length;
  const dueToday = all.filter((c) => c.urgency === "due").length;
  const avgWait = all.length ? (all.reduce((sum, c) => sum + c.waited, 0) / all.length).toFixed(1) : "0";
  const processed = Object.keys(moved).length;

  function approve(card: Card) {
    setMoved((prev) => ({ ...prev, [card.app.id]: card.stage.next }));
    const advanced = card.stage.next !== "registered";
    toast.success(`${card.app.id} ${card.stage.approveLabel.toLowerCase()}`, {
      description: advanced
        ? `Moved to ${STAGE_BY_STATUS[card.stage.next].label}.`
        : "Registered and signed — off the queue.",
    });
  }

  function confirmReturn() {
    const id = returnFor;
    if (!id) return;
    if (!reason.trim()) {
      toast.error("A reason is required", { description: "PRD §11 requires a recorded note on every return." });
      return;
    }
    setMoved((prev) => ({ ...prev, [id]: "returned" }));
    toast.success(`${id} returned for correction`, { description: reason.trim() });
    setReturnFor(null);
    setReason("");
  }

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
        <Kpi icon={Inbox} label="Awaiting action" value={all.length} tone="#3752AE" sub="On the board now" />
        <Kpi icon={AlertTriangle} label="Overdue" value={overdue} tone="#B91C1C" sub="Past the stage target" />
        <Kpi icon={Clock} label="Due today" value={dueToday} tone="#B45309" sub="Target runs out today" />
        <Kpi icon={Timer} label="Avg. wait" value={`${avgWait} d`} tone="#0F766E" sub={`${processed} actioned this session`} />
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
          const cards = board[stage.status];
          const stageOverdue = cards.filter((c) => c.urgency === "overdue").length;
          return (
            <div key={stage.status} className="bg-gray-50/70 rounded-2xl border border-gray-100 flex flex-col">
              {/* Column header */}
              <div className="p-4 border-b border-gray-100">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.accent }} />
                    <h2 className="text-sm font-semibold text-gray-800 truncate">{stage.label}</h2>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white text-gray-600 border border-gray-100 flex-shrink-0">
                    {cards.length}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[11px] text-gray-400">
                  <span className="flex items-center gap-1 truncate">
                    <Users className="w-3 h-3 flex-shrink-0" /> {stage.actor} · SLA {stage.sla}d
                  </span>
                  {stageOverdue > 0 && (
                    <span className="text-red-500 font-medium flex-shrink-0">{stageOverdue} overdue</span>
                  )}
                </div>
              </div>

              {/* Cards */}
              <div className="p-3 space-y-2.5 flex-1 min-h-[120px] max-h-[calc(100vh-360px)] overflow-y-auto">
                {cards.map((card) => {
                  const svc = SERVICE_BY_ID[card.app.serviceId];
                  const u = URGENCY_META[card.urgency];
                  return (
                    <div
                      key={card.app.id}
                      className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 hover:border-gray-200 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button onClick={() => onOpenCase(card.app.id)} className="text-left min-w-0 group">
                          <p className="text-sm font-medium text-gray-800 truncate group-hover:text-[#3752AE]">
                            {card.app.applicant}
                          </p>
                          <p className="font-mono text-[11px] text-gray-400">{card.app.id}</p>
                        </button>
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
                          style={{ color: u.color, backgroundColor: u.bg }}
                        >
                          {card.justMoved ? "Just moved" : u.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: svc?.color }} />
                          {svc?.short}
                        </span>
                        <span className="text-gray-300">·</span>
                        <span className="truncate">{card.app.province}</span>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                        <span className="text-[11px] text-gray-500 whitespace-nowrap">
                          {card.justMoved ? "moved now" : `${card.waited}d`}
                          <span className="text-gray-300"> / {stage.sla}d</span>
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onOpenCase(card.app.id)}
                            title="Open case"
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setReturnFor(card.app.id)}
                            title="Return for correction"
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-orange-600 hover:bg-orange-50"
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => approve(card)}
                            title={stage.approveLabel}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] whitespace-nowrap"
                          >
                            {stage.approveLabel}
                            {i < STAGES.length - 1 ? <ArrowRight className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {cards.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Check className="w-6 h-6 text-gray-300 mb-1.5" />
                    <p className="text-xs text-gray-400">Nothing waiting here</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 px-1">
        Approving a case moves it to the next stage; the final stage registers and signs it, taking it off the board.
        Decisions are kept for this session only.
      </p>

      {/* Return-for-correction reason — PRD requires a recorded note. */}
      <Dialog open={returnFor !== null} onOpenChange={(open) => !open && setReturnFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Return for correction</DialogTitle>
            <DialogDescription>
              {returnFor ? `Case ${returnFor} will go back to the village officer.` : ""}
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
              Return case
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
