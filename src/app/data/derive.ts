import type { DateRange } from "../components/DateRangeFilter";

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * How long a case took, derived from its own reference number. Most cases land
 * inside the service target and a tail runs past it. Lives here — with no data
 * imports — so the case generator and the stats module can share one definition.
 */
export function processingDaysFor(id: string, serviceId: string, target: number): number {
  const r = (hashStr(id) % 1000) / 1000;
  // Per-service share that finishes on time — 82%…94%, so services differ.
  const onTimeShare = 0.82 + (hashStr(serviceId) % 13) / 100;
  if (r < onTimeShare) return +(0.8 + (r / onTimeShare) * (target - 0.8)).toFixed(1);
  return +(target + ((r - onTimeShare) / (1 - onTimeShare)) * target * 0.8).toFixed(1);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export interface Bucket {
  label: string;
  days: string[]; // ISO dates covered by this bucket
}

/**
 * Split a date range into chart buckets by CALENDAR span, not by which days
 * happen to contain data — otherwise applying a filter changes the bar count and
 * the chart appears to shrink. Buckets are cut from the end, so the most recent
 * one is always complete and any short bucket lands on the oldest edge.
 */
export function calendarBuckets(
  range: DateRange,
  fallback: { from: string; to: string },
): { buckets: Bucket[]; granularity: "day" | "week" | "month" } {
  const fromStr = range.from || fallback.from;
  const toStr = range.to || fallback.to;
  if (!fromStr || !toStr) return { buckets: [], granularity: "day" };

  const start = new Date(`${fromStr}T00:00:00`);
  const end = new Date(`${toStr}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { buckets: [], granularity: "day" };
  }

  const iso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const span = Math.min(1100, Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1));

  const days: string[] = [];
  for (let i = 0; i < span; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(iso(d));
  }
  const label = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

  if (span <= 31) {
    return { buckets: days.map((d) => ({ label: label(d), days: [d] })), granularity: "day" };
  }

  const size = span <= 120 ? 7 : 30;
  const buckets: Bucket[] = [];
  for (let e = days.length; e > 0; e -= size) {
    const chunk = days.slice(Math.max(0, e - size), e);
    buckets.unshift({ label: label(chunk[0]), days: chunk });
  }
  return { buckets, granularity: size === 7 ? "week" : "month" };
}
