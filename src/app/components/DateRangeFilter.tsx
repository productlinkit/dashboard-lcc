import { useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";

export interface DateRange {
  from: string; // YYYY-MM-DD, "" = open
  to: string; // YYYY-MM-DD, "" = open
}

export const ALL_TIME: DateRange = { from: "", to: "" };

const PRESETS = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "month", label: "This month" },
] as const;

type PresetId = (typeof PRESETS)[number]["id"] | "custom";

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function presetRange(id: PresetId): DateRange {
  const now = new Date();
  const to = fmt(now);
  switch (id) {
    case "today":
      return { from: to, to };
    case "7d": {
      const f = new Date(now);
      f.setDate(f.getDate() - 6);
      return { from: fmt(f), to };
    }
    case "30d": {
      const f = new Date(now);
      f.setDate(f.getDate() - 29);
      return { from: fmt(f), to };
    }
    case "month":
      return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to };
    default:
      return ALL_TIME;
  }
}

/**
 * The range as the API reads it: `date_from` / `date_to`, both "YYYY-MM-DD",
 * and both omitted when the side is open so the server does not narrow on it.
 */
export function dateParams(range: DateRange): { date_from?: string; date_to?: string } {
  const params: { date_from?: string; date_to?: string } = {};
  if (range.from) params.date_from = range.from;
  if (range.to) params.date_to = range.to;
  return params;
}

/** Whole days covered by a range, or 0 when either side is open. */
export function rangeSpanDays(range: DateRange): number {
  if (!range.from || !range.to) return 0;
  const from = Date.parse(`${range.from}T00:00:00`);
  const to = Date.parse(`${range.to}T00:00:00`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.floor((to - from) / 86_400_000) + 1;
}

/**
 * The window of equal length immediately before this one, for period-on-period
 * comparison. An open-ended range has no comparable predecessor.
 */
export function previousPeriod(range: DateRange): DateRange {
  const span = rangeSpanDays(range);
  if (span <= 0) return ALL_TIME;
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.from}T00:00:00`);
  to.setDate(to.getDate() - 1);
  from.setDate(from.getDate() - span);
  return { from: fmt(from), to: fmt(to) };
}

export function DateRangeFilter({ onChange }: { onChange: (range: DateRange) => void }) {
  const [preset, setPreset] = useState<PresetId>("all");
  const [range, setRange] = useState<DateRange>(ALL_TIME);

  function applyPreset(id: PresetId) {
    const r = presetRange(id);
    setPreset(id);
    setRange(r);
    onChange(r);
  }

  function applyCustom(next: DateRange) {
    setPreset("custom");
    setRange(next);
    onChange(next);
  }

  const label =
    preset === "custom"
      ? `${range.from || "…"} → ${range.to || "…"}`
      : PRESETS.find((p) => p.id === preset)?.label ?? "All time";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">
          <Calendar className="w-4 h-4" />
          {label}
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="space-y-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                preset === p.id ? "bg-[#3752AE]/10 text-[#3752AE] font-medium" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Custom range</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-gray-500">From</span>
              <input
                type="date"
                value={range.from}
                max={range.to || undefined}
                onChange={(e) => applyCustom({ ...range, from: e.target.value })}
                className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#3752AE]"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">To</span>
              <input
                type="date"
                value={range.to}
                min={range.from || undefined}
                onChange={(e) => applyCustom({ ...range, to: e.target.value })}
                className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#3752AE]"
              />
            </label>
          </div>
          {preset === "custom" && (
            <button onClick={() => applyPreset("all")} className="mt-2 text-xs text-[#3752AE] hover:underline">
              Reset to all time
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** True if a YYYY-MM-DD date falls within the (open-ended) range. */
export function inRange(date: string, range: DateRange): boolean {
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}
