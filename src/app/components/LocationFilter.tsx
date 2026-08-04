import { useMemo } from "react";
import { MapPin, X } from "lucide-react";
import { areaStat, PROVINCE_NAMES } from "../data/population";

/*
 * Cascading location filter — Province → District → Village — mirroring the GIS
 * map's drill path. District options depend on the chosen province, villages on
 * the district, all derived from the same areaStat() aggregation.
 */
export interface LocationValue {
  province: string | null;
  district: string | null;
  village: string | null;
}

export const NO_LOCATION: LocationValue = { province: null, district: null, village: null };

const PROVINCES = [...PROVINCE_NAMES].sort();

export function LocationFilter({ value, onChange }: { value: LocationValue; onChange: (v: LocationValue) => void }) {
  const districts = useMemo(
    () => (value.province ? areaStat(value.province).children.map((c) => c.name).sort() : []),
    [value.province],
  );
  const villages = useMemo(
    () =>
      value.province && value.district
        ? areaStat(value.province, value.district).children.map((c) => c.name).sort()
        : [],
    [value.province, value.district],
  );

  const has = !!(value.province || value.district || value.village);

  const selectClass =
    "bg-gray-50 border border-gray-200 rounded-xl pl-3 pr-8 py-2 text-sm text-gray-700 outline-none focus:border-[#3752AE] disabled:opacity-50 disabled:cursor-not-allowed max-w-[190px]";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400">
        <MapPin className="w-3.5 h-3.5" /> Location
      </span>
      <select
        value={value.province ?? ""}
        onChange={(e) => onChange({ province: e.target.value || null, district: null, village: null })}
        className={selectClass}
      >
        <option value="">All provinces</option>
        {PROVINCES.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <select
        value={value.district ?? ""}
        disabled={!value.province}
        onChange={(e) => onChange({ ...value, district: e.target.value || null, village: null })}
        className={selectClass}
      >
        <option value="">{value.province ? "All districts" : "District"}</option>
        {districts.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <select
        value={value.village ?? ""}
        disabled={!value.district}
        onChange={(e) => onChange({ ...value, village: e.target.value || null })}
        className={selectClass}
      >
        <option value="">{value.district ? "All villages" : "Village"}</option>
        {villages.map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
      {has && (
        <button
          onClick={() => onChange(NO_LOCATION)}
          className="inline-flex items-center gap-1 text-xs font-medium text-[#3752AE] hover:underline"
        >
          <X className="w-3.5 h-3.5" /> Clear
        </button>
      )}
    </div>
  );
}
