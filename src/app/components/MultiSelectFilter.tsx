import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";

export interface Option {
  value: string;
  label: string;
  color?: string;
}

/*
 * A filter chip over a list of options.
 *
 * Purely presentational: the caller owns both the options and the selection, so
 * the values that travel out of here are exactly the strings the API expects
 * (kebab-case statuses, service codes, method codes, ids).
 *
 * `single` is for the filters the API only accepts once per request — a repeated
 * `province_id`, for instance, is read as the first value alone. The control
 * looks identical; picking a second option replaces the first instead of adding
 * to it, so the chip can never promise a filter the server will not apply.
 */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  single = false,
  loading = false,
  emptyLabel = "Nothing to filter on",
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  single?: boolean;
  loading?: boolean;
  emptyLabel?: string;
}) {
  const count = selected.length;

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
      return;
    }
    onChange(single ? [value] : [...selected, value]);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">
          {label}
          {count > 0 && (
            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-[#3752AE] text-white">{count}</span>
          )}
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <div className="flex items-center justify-between px-2 py-1 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
          {count > 0 && (
            <button onClick={() => onChange([])} className="text-xs text-[#3752AE] hover:underline">
              Clear
            </button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {loading && <p className="px-2 py-6 text-center text-sm text-gray-400">Loading…</p>}
          {!loading && options.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-gray-400">{emptyLabel}</p>
          )}
          {!loading &&
            options.map((o) => {
              const checked = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  onClick={() => toggle(o.value)}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm text-gray-700"
                >
                  <span
                    className={`w-4 h-4 rounded flex items-center justify-center border ${
                      checked ? "bg-[#3752AE] border-[#3752AE]" : "border-gray-300"
                    }`}
                  >
                    {checked && <Check className="w-3 h-3 text-white" />}
                  </span>
                  {o.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: o.color }} />}
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
