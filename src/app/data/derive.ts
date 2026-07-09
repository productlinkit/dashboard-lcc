import type { DateRange } from "../components/DateRangeFilter";

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Base figures derived from a date range — shared by dashboard-style widgets. */
export function rangeBase(range: DateRange): { total: number; seed: number; days: number } {
  const allTime = !range.from && !range.to;
  if (allTime) return { total: 4821, seed: hashStr("all-time"), days: 220 };
  const from = (range.from ? new Date(range.from) : new Date(2026, 0, 1)).getTime();
  const to = (range.to ? new Date(range.to) : new Date()).getTime();
  const days = Math.max(1, Math.round((to - from) / 86400000) + 1);
  const seed = hashStr(`${range.from}|${range.to}`);
  const rate = 55 + (seed % 25);
  const total = Math.max(240, Math.round(rate * days));
  return { total, seed, days };
}

/** Short M/D labels for the last `n` days ending at the range end (or today). */
export function dayLabels(range: DateRange, n: number): string[] {
  const end = range.to ? new Date(range.to) : new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end);
    d.setDate(d.getDate() - (n - 1 - i));
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });
}
