/*
 * The single source of per-service figures.
 *
 * Dashboard, Reports and the SLA widgets all read from here, so a service can
 * never show one turnaround on one screen and a different one on another. Every
 * number is counted from the real APPLICATIONS and TRANSACTIONS rows.
 */
import { inRange, type DateRange } from "../components/DateRangeFilter";
import { APPLICATIONS, STATUS_ORDER, type AppStatus, type Application } from "./mockData";
import { TRANSACTIONS } from "./payments";
import { SERVICES, SERVICE_BY_ID } from "../serviceConfig";
import { processingDaysFor } from "./derive";

/* Statuses that have reached a final decision — the ones turnaround is measured on. */
export const CLOSED_STATUSES: AppStatus[] = ["registered", "issued", "rejected", "revoked"];

/*
 * The demo data has no close timestamp, so turnaround is derived from the case's
 * own reference number: most cases land inside the service target, a tail runs
 * past it. Deterministic, and the same everywhere it is used.
 */
export function processingDays(app: Application, target: number): number {
  return processingDaysFor(app.id, app.serviceId, target);
}

/**
 * When a closed case actually finished. Trend charts must count completions on
 * the day the work ended, not the day the case arrived — counting by submission
 * date leaves the most recent buckets empty, because those cases are still open.
 */
export function completionDate(app: Application): string | null {
  if (!CLOSED_STATUSES.includes(app.status)) return null;
  const target = SERVICE_BY_ID[app.serviceId]?.slaDays ?? 7;
  const d = new Date(`${app.submitted}T00:00:00`);
  d.setDate(d.getDate() + Math.ceil(processingDays(app, target)));
  if (d.getTime() > Date.now()) return null; // not finished yet
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface ServiceStat {
  id: string;
  short: string;
  color: string;
  icon: (typeof SERVICES)[number]["icon"];
  volume: number;
  issued: number;
  inProgress: number;
  rejected: number;
  /* Turnaround */
  target: number;
  closed: number;
  avgDays: number;
  sla: number; // % of closed cases inside the target
  overdue: number;
  /* Money */
  receipts: number;
  unpaid: number;
  collected: number;
  outstanding: number;
}

const IN_PROGRESS: AppStatus[] = ["draft", "submitted", "certified", "under-review", "returned"];

export function serviceStatsFor(range: DateRange): ServiceStat[] {
  const apps = APPLICATIONS.filter((a) => inRange(a.submitted, range));
  const tx = TRANSACTIONS.filter((t) => inRange(t.date, range));

  return SERVICES.map((svc) => {
    const rows = apps.filter((a) => a.serviceId === svc.id);
    const stx = tx.filter((t) => t.serviceId === svc.id);

    const closed = rows.filter((a) => CLOSED_STATUSES.includes(a.status));
    const times = closed.map((a) => processingDays(a, svc.slaDays));
    const withinTarget = times.filter((d) => d <= svc.slaDays).length;

    return {
      id: svc.id,
      short: svc.short,
      color: svc.color,
      icon: svc.icon,
      volume: rows.length,
      issued: rows.filter((a) => a.status === "issued").length,
      inProgress: rows.filter((a) => IN_PROGRESS.includes(a.status)).length,
      rejected: rows.filter((a) => a.status === "rejected" || a.status === "revoked").length,
      target: svc.slaDays,
      closed: closed.length,
      avgDays: times.length ? +(times.reduce((s, d) => s + d, 0) / times.length).toFixed(1) : 0,
      sla: times.length ? Math.round((withinTarget / times.length) * 100) : 100,
      overdue: times.length - withinTarget,
      receipts: stx.filter((t) => t.status === "paid").length,
      unpaid: stx.filter((t) => t.status === "pending").length,
      collected: stx.filter((t) => t.status === "paid").reduce((s, t) => s + t.amount, 0),
      outstanding: stx.filter((t) => t.status === "pending").reduce((s, t) => s + t.amount, 0),
    };
  });
}

/** Overall turnaround across every closed case in the range. */
export function overallTurnaround(range: DateRange): { avgDays: number; sla: number; overdue: number; closed: number } {
  const apps = APPLICATIONS.filter((a) => inRange(a.submitted, range) && CLOSED_STATUSES.includes(a.status));
  const times = apps.map((a) => processingDays(a, SERVICE_BY_ID[a.serviceId]?.slaDays ?? 7));
  const within = apps.filter((a) => {
    const target = SERVICE_BY_ID[a.serviceId]?.slaDays ?? 7;
    return processingDays(a, target) <= target;
  }).length;
  return {
    closed: apps.length,
    avgDays: times.length ? +(times.reduce((s, d) => s + d, 0) / times.length).toFixed(1) : 0,
    sla: times.length ? Math.round((within / times.length) * 100) : 100,
    overdue: times.length - within,
  };
}

export function appsIn(range: DateRange): Application[] {
  return APPLICATIONS.filter((a) => inRange(a.submitted, range));
}

export function statusCountsFor(range: DateRange): Record<AppStatus, number> {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<AppStatus, number>;
  for (const a of appsIn(range)) counts[a.status] += 1;
  return counts;
}

export function collectedIn(range: DateRange): number {
  return TRANSACTIONS.filter((t) => inRange(t.date, range) && t.status === "paid").reduce((s, t) => s + t.amount, 0);
}

/** The equally long window immediately before `range`, for period-on-period deltas. */
export function previousRange(range: DateRange): DateRange {
  const dates = APPLICATIONS.map((a) => a.submitted).sort();
  const from = range.from || dates[0];
  const to = range.to || dates[dates.length - 1];
  if (!from || !to) return { from: "", to: "" };
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const span = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (span - 1));
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(prevStart), to: iso(prevEnd) };
}
