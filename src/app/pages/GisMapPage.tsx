import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";
import { ChevronRight, MapPin, Users, Home, Briefcase, Globe, FileText, X } from "lucide-react";
import { LaosMap, mapProvinceRows, mapValues } from "../components/LaosMap";
import { applications, registry } from "../api/endpoints";
import { useQuery } from "../api/hooks";
import type { AreaSummary, CaseStatus } from "../api/types";

const MALE_COLOR = "#3752AE";
const FEMALE_COLOR = "#EC4899";
const tooltipStyle = { borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 };

const PENDING_STATUSES: CaseStatus[] = ["draft", "submitted", "certified", "under-review", "returned"];
const REGISTER_STATUSES: CaseStatus[] = ["registered", "issued", "revoked"];

/** The area endpoint also reports the case volume recorded in the area. */
type Area = AreaSummary & { id?: string; applications?: number };

const EMPTY_AREA: Area = {
  level: "country",
  name: "Lao PDR",
  population: 0,
  households: 0,
  male: 0,
  female: 0,
  working_age: 0,
  minors: 0,
  seniors: 0,
  foreign: 0,
  single: 0,
  married: 0,
  divorced: 0,
  widowed: 0,
  age_bands: [],
  child_label: "",
  children: [],
};

interface Selection {
  provinceId: string | null;
  province: string | null;
  districtId: string | null;
  district: string | null;
  villageId: string | null;
  village: string | null;
}

const NO_SELECTION: Selection = {
  provinceId: null, province: null,
  districtId: null, district: null,
  villageId: null, village: null,
};

function Kpi({
  icon: Icon, label, value, sub, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; sub: string; tone: string;
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

export function GisMapPage() {
  const [sel, setSel] = useState<Selection>(NO_SELECTION);

  /* Choropleth values, per province, straight from the registry. */
  const mapQuery = useQuery((signal) => registry.mapProvinces({ metric: "population" }, signal), []);
  const mapRows = useMemo(() => mapProvinceRows(mapQuery.data), [mapQuery.data]);
  const values = useMemo(() => mapValues(mapRows), [mapRows]);

  /* Country → province → district → village aggregates for the selected area. */
  const areaQuery = useQuery(
    (signal) =>
      registry.area(
        { province_id: sel.provinceId, district_id: sel.districtId, village_id: sel.villageId },
        signal,
      ),
    [sel.provinceId, sel.districtId, sel.villageId],
  );
  const area = (areaQuery.data as Area | undefined) ?? EMPTY_AREA;

  /* Case volume for the same province (cases are recorded at province level). */
  const casesQuery = useQuery(
    (signal) => applications.summary({ province_id: sel.provinceId }, signal),
    [sel.provinceId],
  );

  const appScope = useMemo(() => {
    const rows = casesQuery.data?.by_status ?? [];
    const countOf = (row: { count?: number; total?: number }) => row.count ?? row.total ?? 0;
    const sumOf = (statuses: CaseStatus[]) =>
      rows.filter((r) => statuses.includes(r.status)).reduce((a, r) => a + countOf(r), 0);
    return {
      total: casesQuery.data?.total ?? 0,
      issued: sumOf(["issued"]),
      pending: sumOf(PENDING_STATUSES),
      inRegister: sumOf(REGISTER_STATUSES),
    };
  }, [casesQuery.data]);

  /* The GeoJSON feature name of the selected province, so the map highlights it. */
  const selectedGeoName = useMemo(() => {
    if (!sel.provinceId) return null;
    return mapRows.find((r) => r.province_id === sel.provinceId)?.geo_name ?? sel.province;
  }, [mapRows, sel.provinceId, sel.province]);

  function selectProvinceByGeoName(name: string | null) {
    if (!name) {
      setSel(NO_SELECTION);
      return;
    }
    const row = mapRows.find((r) => r.geo_name === name || r.province === name);
    setSel({
      ...NO_SELECTION,
      provinceId: row?.province_id ?? null,
      province: row?.province ?? name,
    });
  }

  function drillInto(child: { id?: string; name: string }) {
    if (area.level === "country") {
      setSel({ ...NO_SELECTION, provinceId: child.id ?? null, province: child.name });
    } else if (area.level === "province") {
      setSel({ ...sel, districtId: child.id ?? null, district: child.name, villageId: null, village: null });
    } else if (area.level === "district") {
      setSel({ ...sel, villageId: child.id ?? null, village: child.name });
    }
  }

  // Breadcrumb steps — each jumps back to that level.
  const crumbs: { label: string; onClick: () => void }[] = [
    { label: "Lao PDR", onClick: () => setSel(NO_SELECTION) },
  ];
  if (sel.province) {
    crumbs.push({
      label: sel.province,
      onClick: () => setSel({ ...sel, districtId: null, district: null, villageId: null, village: null }),
    });
  }
  if (sel.district) {
    crumbs.push({ label: sel.district, onClick: () => setSel({ ...sel, villageId: null, village: null }) });
  }
  if (sel.village) crumbs.push({ label: sel.village, onClick: () => {} });

  const genderData = [
    { name: "Male", value: area.male, color: MALE_COLOR },
    { name: "Female", value: area.female, color: FEMALE_COLOR },
  ];
  const maxChild = area.children[0]?.population ?? 1;
  const avgHousehold = area.households ? area.population / area.households : 0;
  const workingPct = area.population ? Math.round((area.working_age / area.population) * 100) : 0;

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      {/* Header + breadcrumb */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">GIS Map</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Explore the registered population by location — drill from country to village.
            </p>
          </div>
          {(sel.province || sel.district || sel.village) && (
            <button
              onClick={() => setSel(NO_SELECTION)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 self-start"
            >
              <X className="w-4 h-4" /> Reset to country
            </button>
          )}
        </div>
        <div className="flex items-center flex-wrap gap-1 mt-3 text-sm">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={c.label} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-300" />}
                <button
                  onClick={c.onClick}
                  disabled={last}
                  className={last ? "font-semibold text-[#3752AE]" : "text-gray-500 hover:text-[#3752AE] hover:underline"}
                >
                  {c.label}
                </button>
              </span>
            );
          })}
        </div>
      </div>

      {/* Map + drill panel */}
      <div className="flex flex-col lg:flex-row gap-4 lg:h-[520px]">
        <div className="flex-1 bg-white rounded-2xl border border-gray-100 p-4 shadow-sm min-h-[380px] flex flex-col">
          <div className="flex-shrink-0 flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800">Population by province</h2>
            <span className="text-xs text-gray-400">Click a province to drill in</span>
          </div>
          <div className="flex-1 min-h-0">
            {mapQuery.error ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-gray-600">{mapQuery.error.message}</p>
                <button
                  onClick={mapQuery.refetch}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b]"
                >
                  Retry
                </button>
              </div>
            ) : mapQuery.loading ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">Loading map…</div>
            ) : (
              <LaosMap
                fill
                zoom={6}
                showList={false}
                values={values}
                valueLabel="Population"
                selected={selectedGeoName}
                onSelect={selectProvinceByGeoName}
              />
            )}
          </div>
        </div>

        {/* Drill panel */}
        <div className="lg:w-72 flex-shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{area.level}</p>
            <p className="text-base font-bold text-gray-800 leading-tight flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#3752AE] flex-shrink-0" /> {area.name}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {area.population.toLocaleString()} people · {area.households.toLocaleString()} households
            </p>
          </div>
          {areaQuery.error ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-gray-600">{areaQuery.error.message}</p>
              <button
                onClick={areaQuery.refetch}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b]"
              >
                Retry
              </button>
            </div>
          ) : areaQuery.loading ? (
            <div className="flex-1 flex items-center justify-center p-6 text-sm text-gray-400">Loading area…</div>
          ) : area.children.length > 0 ? (
            <>
              <div className="px-4 py-2 flex items-center justify-between border-b border-gray-50">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{area.child_label}</span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Population</span>
              </div>
              <div className="flex-1 overflow-y-auto min-h-[180px]">
                {area.children.map((c) => (
                  <button
                    key={c.id ?? c.name}
                    onClick={() => drillInto(c)}
                    className="w-full px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-gray-700 truncate flex items-center gap-1.5">
                        {c.name}
                        <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                      </span>
                      <span className="text-sm font-medium text-gray-800 tabular-nums flex-shrink-0">
                        {c.population.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-1.5">
                      <div className="h-full rounded-full bg-[#3752AE]" style={{ width: `${(c.population / maxChild) * 100}%` }} />
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <p className="text-sm text-gray-400">Village level — the smallest administrative unit.</p>
            </div>
          )}
        </div>
      </div>

      {/* Area statistics */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi icon={Users} label="Total population" value={area.population.toLocaleString()} sub={`${area.male.toLocaleString()} M · ${area.female.toLocaleString()} F`} tone="#3752AE" />
        <Kpi icon={Home} label="Households" value={area.households.toLocaleString()} sub={`Avg ${avgHousehold.toFixed(1)} per household`} tone="#10B981" />
        <Kpi icon={Briefcase} label="Working age (15–64)" value={area.working_age.toLocaleString()} sub={`${workingPct}% of population`} tone="#6D28D9" />
        <Kpi icon={Globe} label="Foreign residents" value={area.foreign.toLocaleString()} sub={area.population ? `${((area.foreign / area.population) * 100).toFixed(1)}% of population` : "—"} tone="#F59E0B" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Age & gender for the selected area */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800">Age &amp; gender — {area.name}</h2>
          <p className="text-sm text-gray-400 mb-3">Registered population by age band</p>
          <div className="h-64">
            {area.age_bands.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                {areaQuery.loading ? "Loading…" : "No population registered in this area."}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={area.age_bands} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }} barGap={2}>
                  <CartesianGrid horizontal={false} stroke="#F1F5F9" />
                  <XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="band" tick={{ fill: "#64748B", fontSize: 12 }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip cursor={{ fill: "#F8FAFC" }} contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar dataKey="male" name="Male" fill={MALE_COLOR} radius={[0, 4, 4, 0]} barSize={14} />
                  <Bar dataKey="female" name="Female" fill={FEMALE_COLOR} radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Gender split */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800">Gender split</h2>
          <p className="text-sm text-gray-400">{area.name}</p>
          <div className="h-40 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={genderData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={44} outerRadius={66} paddingAngle={3} stroke="none">
                  {genderData.map((e) => (
                    <Cell key={e.name} fill={e.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => v.toLocaleString()} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 mt-2">
            {genderData.map((e) => (
              <div key={e.name} className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} />
                <span className="text-gray-600 flex-1">{e.name}</span>
                <span className="text-gray-400 text-xs tabular-nums">{e.value.toLocaleString()}</span>
                <span className="font-semibold text-gray-800 tabular-nums w-9 text-right">
                  {area.population ? Math.round((e.value / area.population) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Administrative activity */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-400" /> Administrative activity
            </h2>
            <p className="text-sm text-gray-400">
              {sel.province
                ? `Civil registration cases in ${sel.province}`
                : "Civil registration cases across Lao PDR"}
              {(sel.district || sel.village) && " · recorded at province level"}
            </p>
          </div>
          {casesQuery.error && (
            <button onClick={casesQuery.refetch} className="text-sm font-medium text-red-600 hover:underline">
              {casesQuery.error.message} · Retry
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          {[
            { label: "Applications", value: appScope.total, tone: "#3752AE" },
            { label: "In register", value: appScope.inRegister, tone: "#6D28D9" },
            { label: "Certificates issued", value: appScope.issued, tone: "#047857" },
            { label: "In progress", value: appScope.pending, tone: "#B45309" },
          ].map((m) => (
            <div key={m.label} className="rounded-xl bg-gray-50 p-4">
              <p className="text-2xl font-bold" style={{ color: m.tone }}>
                {casesQuery.loading ? "—" : m.value.toLocaleString()}
              </p>
              <p className="text-sm text-gray-500">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
