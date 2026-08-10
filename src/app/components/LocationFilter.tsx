import { useMemo } from "react";
import { MapPin, X } from "lucide-react";
import { locations } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import { text } from "../api/types";

/*
 * Cascading location filter — Province → District → Village — mirroring the GIS
 * map's drill path. The options come from the locations catalogue: districts are
 * loaded for the chosen province, villages for the chosen district.
 *
 * Both the id and the display name of each level are reported upward: every page
 * above filters the API by province_id / district_id / village_id, while the
 * headings still want a readable name.
 */
export interface LocationValue {
  province: string | null;
  district: string | null;
  village: string | null;
  provinceId: string | null;
  districtId: string | null;
  villageId: string | null;
}

export const NO_LOCATION: LocationValue = {
  province: null,
  district: null,
  village: null,
  provinceId: null,
  districtId: null,
  villageId: null,
};

/** The area the current selection points at, for a heading. */
export function locationName(value: LocationValue): string {
  return value.village || value.district || value.province || "Lao PDR";
}

export function LocationFilter({ value, onChange }: { value: LocationValue; onChange: (v: LocationValue) => void }) {
  const provincesQuery = useQuery((signal) => locations.provinces(signal), []);
  const districtsQuery = useQuery(
    (signal) => locations.districts(value.provinceId as string, signal),
    [value.provinceId],
    { enabled: !!value.provinceId },
  );
  const villagesQuery = useQuery(
    (signal) => locations.villages(value.districtId as string, signal),
    [value.districtId],
    { enabled: !!value.districtId },
  );

  const provinces = useMemo(
    () => [...(provincesQuery.data ?? [])].sort((a, b) => text(a.name).localeCompare(text(b.name))),
    [provincesQuery.data],
  );
  const districts = useMemo(
    () => [...(districtsQuery.data ?? [])].sort((a, b) => text(a.name).localeCompare(text(b.name))),
    [districtsQuery.data],
  );
  const villages = useMemo(
    () => [...(villagesQuery.data?.data ?? [])].sort((a, b) => text(a.name).localeCompare(text(b.name))),
    [villagesQuery.data],
  );

  const has = !!(value.provinceId || value.districtId || value.villageId);
  const failed = provincesQuery.error ?? districtsQuery.error ?? villagesQuery.error;

  const selectClass =
    "bg-gray-50 border border-gray-200 rounded-xl pl-3 pr-8 py-2 text-sm text-gray-700 outline-none focus:border-[#3752AE] disabled:opacity-50 disabled:cursor-not-allowed max-w-[190px]";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400">
        <MapPin className="w-3.5 h-3.5" /> Location
      </span>
      <select
        value={value.provinceId ?? ""}
        disabled={provincesQuery.loading || provinces.length === 0}
        onChange={(e) => {
          const p = provinces.find((x) => x.id === e.target.value);
          onChange({
            province: p ? text(p.name) : null,
            district: null,
            village: null,
            provinceId: p?.id ?? null,
            districtId: null,
            villageId: null,
          });
        }}
        className={selectClass}
      >
        <option value="">{provincesQuery.loading ? "Loading…" : "All provinces"}</option>
        {provinces.map((p) => (
          <option key={p.id} value={p.id}>{text(p.name)}</option>
        ))}
      </select>
      <select
        value={value.districtId ?? ""}
        disabled={!value.provinceId || districtsQuery.loading}
        onChange={(e) => {
          const d = districts.find((x) => x.id === e.target.value);
          onChange({
            ...value,
            district: d ? text(d.name) : null,
            village: null,
            districtId: d?.id ?? null,
            villageId: null,
          });
        }}
        className={selectClass}
      >
        <option value="">
          {!value.provinceId ? "District" : districtsQuery.loading ? "Loading…" : "All districts"}
        </option>
        {districts.map((d) => (
          <option key={d.id} value={d.id}>{text(d.name)}</option>
        ))}
      </select>
      <select
        value={value.villageId ?? ""}
        disabled={!value.districtId || villagesQuery.loading}
        onChange={(e) => {
          const v = villages.find((x) => x.id === e.target.value);
          onChange({ ...value, village: v ? text(v.name) : null, villageId: v?.id ?? null });
        }}
        className={selectClass}
      >
        <option value="">
          {!value.districtId ? "Village" : villagesQuery.loading ? "Loading…" : "All villages"}
        </option>
        {villages.map((v) => (
          <option key={v.id} value={v.id}>{text(v.name)}</option>
        ))}
      </select>
      {failed && (
        <button
          onClick={() => {
            if (provincesQuery.error) provincesQuery.refetch();
            if (districtsQuery.error) districtsQuery.refetch();
            if (villagesQuery.error) villagesQuery.refetch();
          }}
          className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
        >
          {failed.message} · Retry
        </button>
      )}
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
