/*
 * Alerts & Notifications (PRD §11) — SLA breaches, payment problems, registry
 * events and platform notices.
 *
 * Almost every alert is derived from a real record elsewhere in the app, so
 * clicking through always lands on something that exists: an overdue case, a
 * failed receipt, a revoked certificate. Only the platform notices are standalone.
 */
import { APPLICATIONS, type AppStatus } from "./mockData";
import { TRANSACTIONS } from "./payments";
import { SERVICE_BY_ID } from "../serviceConfig";

export type Severity = "critical" | "warning" | "info";
export type Category = "sla" | "payment" | "registry" | "system" | "security";

export interface Alert {
  id: string;
  severity: Severity;
  category: Category;
  title: string;
  message: string;
  at: number; // epoch ms
  caseId?: string; // opens the case detail when present
  actor?: string; // who/what raised it
}

export const SEVERITY_META: Record<Severity, { label: string; color: string; bg: string }> = {
  critical: { label: "Critical", color: "#B91C1C", bg: "#FEE2E2" },
  warning: { label: "Warning", color: "#B45309", bg: "#FEF3C7" },
  info: { label: "Info", color: "#1D4ED8", bg: "#DBEAFE" },
};

export const CATEGORY_META: Record<Category, { label: string; color: string }> = {
  sla: { label: "SLA & overdue", color: "#B45309" },
  payment: { label: "Payments", color: "#047857" },
  registry: { label: "Registry", color: "#6D28D9" },
  system: { label: "System", color: "#3752AE" },
  security: { label: "Security", color: "#B91C1C" },
};

/* Same stage SLAs the approval queue uses. */
const STAGE_SLA: Partial<Record<AppStatus, { days: number; stage: string; owner: string }>> = {
  submitted: { days: 2, stage: "village certification", owner: "Village Chief" },
  certified: { days: 1, stage: "district intake", owner: "District Registrar" },
  "under-review": { days: 3, stage: "registrar decision", owner: "District Registrar" },
};

/* Days past target before an SLA breach escalates from warning to critical.
 * Kept high enough that "critical" stays rare and therefore meaningful. */
const SEVERE_SLA_DAYS = 6;

const NOW = Date.now();
const DAY = 86_400_000;
const HOUR = 3_600_000;

function daysSince(date: string): number {
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.round((NOW - t) / DAY));
}

/* Deterministic minute offsets so timestamps don't all collide on the hour. */
function jitter(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % (6 * HOUR);
}

function buildAlerts(): Alert[] {
  const out: Alert[] = [];

  /* ── SLA breaches from the approval queue ── */
  for (const a of APPLICATIONS) {
    const sla = STAGE_SLA[a.status];
    if (!sla) continue;
    const waited = daysSince(a.submitted);
    const over = waited - sla.days;
    if (over <= 0) continue;
    const svc = SERVICE_BY_ID[a.serviceId]?.short ?? a.serviceId;
    out.push({
      id: `sla-${a.id}`,
      severity: over >= SEVERE_SLA_DAYS ? "critical" : "warning",
      category: "sla",
      title: `${svc} case ${over} day${over !== 1 ? "s" : ""} past SLA`,
      message: `${a.id} (${a.applicant}, ${a.province}) has been waiting ${waited} days at ${sla.stage}. Target is ${sla.days} day${sla.days !== 1 ? "s" : ""}.`,
      at: NOW - over * DAY + jitter(a.id),
      caseId: a.id,
      actor: sla.owner,
    });
  }

  /* ── Payment problems ── */
  for (const t of TRANSACTIONS) {
    if (t.status === "failed") {
      out.push({
        id: `pay-${t.id}`,
        severity: "warning",
        category: "payment",
        title: "Payment failed",
        message: `Receipt ${t.id} for ${t.payer} (${t.amount.toLocaleString()} LAK) did not complete. The case cannot be issued until the fee is settled.`,
        at: new Date(t.date).getTime() + jitter(t.id),
        caseId: t.applicationId,
        actor: t.cashier,
      });
    }
    if (t.status === "refunded") {
      out.push({
        id: `ref-${t.id}`,
        severity: "info",
        category: "payment",
        title: "Refund issued",
        message: `${t.amount.toLocaleString()} LAK refunded to ${t.payer} against receipt ${t.id}.`,
        at: new Date(t.date).getTime() + jitter(t.id),
        caseId: t.applicationId,
        actor: t.cashier,
      });
    }
  }

  /* ── Registry events ── */
  for (const a of APPLICATIONS) {
    if (a.status === "revoked") {
      out.push({
        id: `rev-${a.id}`,
        severity: "critical",
        category: "registry",
        title: "Certificate revoked",
        message: `${a.id} (${a.applicant}) was invalidated after issue. The QR verification endpoint now returns "revoked".`,
        at: new Date(a.submitted).getTime() + 5 * DAY + jitter(a.id),
        caseId: a.id,
        actor: a.officer ?? "District Registrar",
      });
    }
    if (a.status === "returned") {
      out.push({
        id: `ret-${a.id}`,
        severity: "info",
        category: "registry",
        title: "Case returned for correction",
        message: `${a.id} (${a.applicant}, ${a.province}) was sent back to the village officer with correction notes.`,
        at: new Date(a.submitted).getTime() + 2 * DAY + jitter(a.id),
        caseId: a.id,
        actor: a.officer ?? "District Registrar",
      });
    }
  }

  /* ── Platform notices — the only alerts with no underlying record ── */
  const sys: { hoursAgo: number; alert: Omit<Alert, "at"> }[] = [
    {
      hoursAgo: 2,
      alert: {
        id: "sys-sync-dops",
        severity: "critical",
        category: "system",
        title: "DoPS registry sync failing",
        message: "14 issued records could not be pushed to the national population registry. Retry queue is active; records stay valid locally.",
        actor: "Platform",
      },
    },
    {
      hoursAgo: 5,
      alert: {
        id: "sys-offline-queue",
        severity: "warning",
        category: "system",
        title: "Offline queue backlog",
        message: "3 village offices have unsynced submissions older than 24 hours. Check connectivity at Phongsaly and Xekong.",
        actor: "Platform",
      },
    },
    {
      hoursAgo: 9,
      alert: {
        id: "sec-login",
        severity: "warning",
        category: "security",
        title: "Repeated failed sign-ins",
        message: "6 failed sign-in attempts for account somsy.t@lcc.gov.la from an unrecognised device. Account not locked.",
        actor: "Security",
      },
    },
    {
      hoursAgo: 14,
      alert: {
        id: "sys-backup",
        severity: "info",
        category: "system",
        title: "Nightly backup completed",
        message: "Registry snapshot and document store backed up successfully (2.4 GB).",
        actor: "Platform",
      },
    },
    {
      hoursAgo: 26,
      alert: {
        id: "sec-role",
        severity: "info",
        category: "security",
        title: "New officer account created",
        message: "Bounma K. was granted the District Registrar role for Savannakhet by the administrator.",
        actor: "Administrator",
      },
    },
    {
      hoursAgo: 33,
      alert: {
        id: "sys-latency",
        severity: "warning",
        category: "system",
        title: "Certificate service slow",
        message: "PDF generation averaged 8.4s over the last hour, above the 3s target. No failures recorded.",
        actor: "Platform",
      },
    },
  ];
  for (const s of sys) out.push({ ...s.alert, at: NOW - s.hoursAgo * HOUR });

  return out.sort((a, b) => b.at - a.at);
}

export const ALERTS: Alert[] = buildAlerts();

/* The most recent alerts are the ones an officer hasn't opened yet. */
export const INITIAL_UNREAD: string[] = ALERTS.slice(0, 12).map((a) => a.id);

export function relativeTime(at: number): string {
  const diff = Math.max(0, NOW - at);
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(diff / HOUR);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(diff / DAY);
  if (days < 30) return `${days}d ago`;
  return new Date(at).toISOString().slice(0, 10);
}

export interface AlertRule {
  id: string;
  label: string;
  description: string;
  severity: Severity;
  enabled: boolean;
  threshold?: number;
  unit?: string;
  channels: { inApp: boolean; email: boolean; sms: boolean };
}

export const DEFAULT_RULES: AlertRule[] = [
  {
    id: "sla-breach",
    label: "SLA breach",
    description: "Raise when a case sits at one stage beyond its target.",
    severity: "warning",
    enabled: true,
    threshold: 1,
    unit: "days over target",
    channels: { inApp: true, email: true, sms: false },
  },
  {
    id: "sla-critical",
    label: "Severe SLA breach",
    description: "Escalate to the district head when a case is badly overdue.",
    severity: "critical",
    enabled: true,
    threshold: SEVERE_SLA_DAYS,
    unit: "days over target",
    channels: { inApp: true, email: true, sms: true },
  },
  {
    id: "payment-failed",
    label: "Failed payment",
    description: "Notify the cashier when a fee payment does not complete.",
    severity: "warning",
    enabled: true,
    channels: { inApp: true, email: false, sms: false },
  },
  {
    id: "sync-failure",
    label: "Registry sync failure",
    description: "Alert when issued records cannot reach the national registry.",
    severity: "critical",
    enabled: true,
    threshold: 5,
    unit: "failed records",
    channels: { inApp: true, email: true, sms: true },
  },
  {
    id: "offline-backlog",
    label: "Offline queue backlog",
    description: "Flag village offices with unsynced submissions.",
    severity: "warning",
    enabled: true,
    threshold: 24,
    unit: "hours unsynced",
    channels: { inApp: true, email: true, sms: false },
  },
  {
    id: "revocation",
    label: "Certificate revoked",
    description: "Record every revocation for audit and notify the registrar.",
    severity: "critical",
    enabled: true,
    channels: { inApp: true, email: true, sms: false },
  },
  {
    id: "failed-login",
    label: "Repeated failed sign-ins",
    description: "Security notice after consecutive failed attempts on one account.",
    severity: "warning",
    enabled: true,
    threshold: 5,
    unit: "attempts",
    channels: { inApp: true, email: true, sms: false },
  },
  {
    id: "daily-digest",
    label: "Daily digest",
    description: "End-of-day summary of volumes, revenue and pending work.",
    severity: "info",
    enabled: false,
    channels: { inApp: false, email: true, sms: false },
  },
];
