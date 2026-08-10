import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Search, Users, Home, Briefcase, TrendingUp, TrendingDown, Baby, Globe, ArrowLeftRight,
  Eye, FileText, ArrowLeft, ChevronLeft, ChevronRight, Download,
} from "lucide-react";
import { households as householdsApi, registry } from "../api/endpoints";
import { useDebounced, useMutation, useQuery } from "../api/hooks";
import { text, type HouseholdMember, type PersonRow } from "../api/types";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { LocationFilter, NO_LOCATION, locationName, type LocationValue } from "../components/LocationFilter";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "../components/ui/dialog";
import { PersonRecord } from "../components/PersonRecord";

const MALE_COLOR = "#3752AE";
const FEMALE_COLOR = "#EC4899";
const BIRTH_COLOR = "#10B981";
const DEATH_COLOR = "#64748B";
const OUT_COLOR = "#F59E0B";
const LOCAL_COLOR = "#3752AE";
const FOREIGN_COLOR = "#F59E0B";
const tooltipStyle = { borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 };

/** Working age follows the standard 15–64 band, the same split the API reports. */
const WORKING_AGE = { from: 15, to: 64 };

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "Active", color: "#047857", bg: "#D1FAE5" },
  deceased: { label: "Deceased", color: "#44403C", bg: "#E7E5E4" },
  moved: { label: "Moved out", color: "#B45309", bg: "#FEF3C7" },
};

const GENDER_OPTIONS = [
  { value: "male", label: "Male", color: MALE_COLOR },
  { value: "female", label: "Female", color: FEMALE_COLOR },
];
const CITIZEN_STATUS_OPTIONS = Object.entries(STATUS_META).map(([value, m]) => ({ value, label: m.label, color: m.color }));

/** The register endpoints read a multi-select as one comma-separated parameter. */
const listParam = (values: string[]) => (values.length ? values.join(",") : undefined);

interface OpenPerson {
  uin: string;
  name: string;
  address: string;
}

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

function StatusChip({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, color: "#475569", bg: "#F1F5F9" };
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap" style={{ color: m.color, backgroundColor: m.bg }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
      {m.label}
    </span>
  );
}

function GenderDot({ gender }: { gender: string }) {
  const color = gender === "male" ? MALE_COLOR : FEMALE_COLOR;
  return (
    <span className="inline-flex items-center gap-2 capitalize text-gray-600">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      {gender}
    </span>
  );
}

function ageOf(member: HouseholdMember): number | undefined {
  if (typeof member.age === "number") return member.age;
  if (!member.date_of_birth) return undefined;
  const born = new Date(member.date_of_birth);
  if (Number.isNaN(born.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const monthDiff = now.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) age -= 1;
  return age;
}

function downloadCitizens(rows: PersonRow[]) {
  const header = ["UIN", "Name", "Gender", "Date of birth", "Age", "Household", "Village", "District", "Province", "Status"];
  const body = rows.map((c) => [
    c.uin,
    text(c.name),
    c.gender,
    c.date_of_birth ?? "",
    String(c.age),
    c.household_no,
    c.jurisdiction?.village_name ?? "",
    c.jurisdiction?.district_name ?? "",
    c.jurisdiction?.province_name ?? "",
    STATUS_META[c.status]?.label ?? c.status,
  ]);
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header, ...body].map((r) => r.map(escape).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `citizens-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Loading / failure / empty body for a table, in the row style of the page. */
function TableState({
  colSpan, loading, message, onRetry, empty,
}: {
  colSpan: number; loading: boolean; message?: string; onRetry?: () => void; empty: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center">
        {loading ? (
          <span className="text-sm text-gray-400">Loading…</span>
        ) : message ? (
          <span className="inline-flex flex-col items-center gap-2">
            <span className="text-sm text-gray-600">{message}</span>
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b]"
            >
              Retry
            </button>
          </span>
        ) : (
          <span className="text-sm text-gray-400">{empty}</span>
        )}
      </td>
    </tr>
  );
}

export function PopulationPage() {
  const [tab, setTab] = useState<"citizens" | "households">("citizens");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState<LocationValue>(NO_LOCATION);
  const [genders, setGenders] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openHouseholdNo, setOpenHouseholdNo] = useState<string | null>(null);
  const [openPerson, setOpenPerson] = useState<OpenPerson | null>(null);

  const search = useDebounced(query.trim());
  const areaName = locationName(location);
  const scoped = !!location.provinceId;

  const provinceId = location.provinceId;
  const districtId = location.districtId;
  const villageId = location.villageId;

  const scope = useMemo(
    () => ({ province_id: provinceId, district_id: districtId, village_id: villageId }),
    [provinceId, districtId, villageId],
  );

  useEffect(() => setPage(1), [tab, search, provinceId, districtId, villageId, genders, statuses, pageSize]);

  /* ── Demographic aggregates, all scoped by the location filter ───────── */
  const summaryQuery = useQuery((signal) => registry.populationSummary(scope, signal), [scope]);
  const ageQuery = useQuery((signal) => registry.ageDistribution(scope, signal), [scope]);
  const trendQuery = useQuery((signal) => registry.trend(scope, signal), [scope]);
  const regionsQuery = useQuery((signal) => registry.regions(scope, signal), [scope], { enabled: !scoped });
  const areaQuery = useQuery((signal) => registry.area(scope, signal), [scope], { enabled: scoped });

  const summary = summaryQuery.data;
  const ageBands = ageQuery.data ?? [];
  const trend = trendQuery.data ?? [];

  /* ── The register itself — filtered and paginated by the API ─────────── */
  const citizensQuery = useQuery(
    (signal) =>
      registry.persons(
        {
          ...scope,
          search: search || undefined,
          gender: listParam(genders),
          status: listParam(statuses),
          page: tab === "citizens" ? page : 1,
          per_page: tab === "citizens" ? pageSize : 1,
          sort: search ? undefined : "name",
        },
        signal,
      ),
    [scope, search, genders.join(","), statuses.join(","), tab, page, pageSize],
  );

  const householdsQuery = useQuery(
    (signal) =>
      householdsApi.list(
        {
          ...scope,
          search: search || undefined,
          page: tab === "households" ? page : 1,
          per_page: tab === "households" ? pageSize : 1,
        },
        signal,
      ),
    [scope, search, tab, page, pageSize],
  );

  // A person row carries the family book number, not its id, so look it up by number.
  const householdQuery = useQuery(
    (signal) => householdsApi.byNo(openHouseholdNo as string, signal),
    [openHouseholdNo],
    { enabled: !!openHouseholdNo },
  );

  /* Export walks the filtered result set on the server rather than the page. */
  const exportRun = useMutation(async () => {
    const collected: PersonRow[] = [];
    for (let p = 1; p <= 10; p++) {
      const result = await registry.persons({
        ...scope,
        search: search || undefined,
        gender: listParam(genders),
        status: listParam(statuses),
        page: p,
        per_page: 200,
        sort: search ? undefined : "name",
      });
      collected.push(...result.data);
      if (!result.meta.has_next) break;
    }
    downloadCitizens(collected);
    return collected.length;
  });

  const citizenTotal = citizensQuery.data?.meta.total ?? 0;
  const householdTotal = householdsQuery.data?.meta.total ?? 0;
  const activeQuery = tab === "citizens" ? citizensQuery : householdsQuery;
  const totalRows = tab === "citizens" ? citizenTotal : householdTotal;
  const meta = activeQuery.data?.meta;
  const totalPages = Math.max(1, meta?.total_pages ?? 1);
  const currentPage = meta?.page ?? page;
  const start = (currentPage - 1) * pageSize;
  const pageCitizens = citizensQuery.data?.data ?? [];
  const pageHouseholds = householdsQuery.data?.data ?? [];

  const genderData = [
    { name: "Male", value: summary?.male ?? 0, color: MALE_COLOR },
    { name: "Female", value: summary?.female ?? 0, color: FEMALE_COLOR },
  ];
  const originData = [
    { name: "Lao nationals", value: summary?.local ?? 0, color: LOCAL_COLOR },
    { name: "Foreign residents", value: summary?.foreign ?? 0, color: FOREIGN_COLOR },
  ];
  const population = summary?.citizens ?? 0;
  const avgHousehold = summary?.avg_household_size ?? 0;
  const workingPct = population ? Math.round(((summary?.working_age ?? 0) / population) * 100) : 0;

  /* The breakdown table: provinces nationwide, children of the area when scoped. */
  const breakdown = useMemo(() => {
    if (scoped) {
      return {
        label: areaQuery.data?.child_label || "Districts",
        rows: (areaQuery.data?.children ?? []).map((c) => ({
          key: c.id ?? c.name,
          name: c.name,
          population: c.population,
          households: c.households,
        })),
        query: areaQuery,
      };
    }
    return {
      label: "Provinces",
      rows: (regionsQuery.data ?? []).map((r) => ({
        key: r.province_id ?? r.province,
        name: r.province,
        population: r.population,
        households: r.households,
      })),
      query: regionsQuery,
    };
  }, [scoped, areaQuery, regionsQuery]);
  const maxChild = Math.max(1, ...breakdown.rows.map((r) => r.population));

  const growthPct = summary?.growth_pct ?? 0;
  const growthUp = growthPct >= 0;
  const changeSeries = trend.map((m) => ({
    month: m.month,
    births: m.births,
    deaths: m.deaths,
    movedIn: m.moved_in,
    movedOut: m.moved_out,
    population: m.population,
  }));

  const household = householdQuery.data;

  /* Opening a citizen replaces the page, the same way Watchlist Search does. */
  if (openPerson) {
    return (
      <div className="max-w-screen-2xl mx-auto space-y-4">
        <button
          onClick={() => setOpenPerson(null)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#3752AE] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Population &amp; Households
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h1 className="text-xl font-bold text-gray-800">{openPerson.name}</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {openPerson.uin}
            {openPerson.address ? ` · ${openPerson.address}` : ""}
          </p>
        </div>
        <PersonRecord uin={openPerson.uin} />
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Population &amp; Households</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Registered population of {areaName} — filter by province, district or village.
          </p>
        </div>
        <button
          onClick={() => exportRun.run(undefined).catch(() => {})}
          disabled={exportRun.pending}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] disabled:opacity-60 self-start sm:self-auto"
        >
          <Download className="w-4 h-4" /> {exportRun.pending ? "Exporting…" : "Export"}
        </button>
      </div>

      {/* Location filter — scopes the whole page */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        <LocationFilter value={location} onChange={setLocation} />
      </div>

      {summaryQuery.error && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600">{summaryQuery.error.message}</p>
          <button
            onClick={summaryQuery.refetch}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b]"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPIs (scoped to the selected area) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi icon={Users} label="Registered population" value={population.toLocaleString()} sub={`${(summary?.male ?? 0).toLocaleString()} male · ${(summary?.female ?? 0).toLocaleString()} female`} tone="#3752AE" />
        <Kpi icon={Home} label="Households" value={(summary?.households ?? 0).toLocaleString()} sub={`Avg ${avgHousehold.toFixed(1)} people per household`} tone="#10B981" />
        <Kpi icon={Briefcase} label="Working age (15–64)" value={(summary?.working_age ?? 0).toLocaleString()} sub={`${workingPct}% · dependency ${summary?.dependency_ratio ?? 0}%`} tone="#6D28D9" />
        <Kpi icon={Globe} label="Foreign residents" value={(summary?.foreign ?? 0).toLocaleString()} sub={population ? `${(((summary?.foreign ?? 0) / population) * 100).toFixed(1)}% of population` : "—"} tone="#F59E0B" />
      </div>

      {/* Age & gender + composition (scoped) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800">Age &amp; gender — {areaName}</h2>
          <p className="text-sm text-gray-400 mb-3">Registered population by age band · working age {WORKING_AGE.from}–{WORKING_AGE.to}</p>
          <div className="h-64">
            {ageQuery.error ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-gray-600">{ageQuery.error.message}</p>
                <button onClick={ageQuery.refetch} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b]">Retry</button>
              </div>
            ) : ageBands.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                {ageQuery.loading ? "Loading…" : "No population registered in this area."}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ageBands} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }} barGap={2}>
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

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col">
          <h2 className="text-base font-semibold text-gray-800">Composition</h2>
          <p className="text-sm text-gray-400">Gender and nationality</p>
          <div className="flex-1 flex flex-col justify-center divide-y divide-gray-50 mt-1">
            {[
              { title: "Gender", data: genderData },
              { title: "Nationality", data: originData },
            ].map((dd) => {
              const total = dd.data.reduce((a, e) => a + e.value, 0);
              return (
                <div key={dd.title} className="flex items-center gap-4 py-3.5">
                  <div className="w-[76px] h-[76px] flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={dd.data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={24} outerRadius={38} paddingAngle={2} stroke="none">
                          {dd.data.map((e) => (
                            <Cell key={e.name} fill={e.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => v.toLocaleString()} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{dd.title}</p>
                    <div className="space-y-1.5">
                      {dd.data.map((e) => (
                        <div key={e.name} className="flex items-center gap-2 text-sm">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} />
                          <span className="text-gray-600 flex-1 truncate">{e.name}</span>
                          <span className="text-gray-400 tabular-nums text-xs">{e.value.toLocaleString()}</span>
                          <span className="font-semibold text-gray-800 tabular-nums w-9 text-right">
                            {total ? Math.round((e.value / total) * 100) : 0}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Area breakdown — provinces nationwide, or the children of the selected level */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{breakdown.label} of {areaName}</h2>
          <p className="text-sm text-gray-400">Population and households within this area</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-5 py-3 font-medium">{breakdown.label.replace(/s$/, "")}</th>
                <th className="px-4 py-3 font-medium w-1/2">Population</th>
                <th className="pl-4 pr-5 py-3 font-medium text-right">Households</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.rows.map((c) => (
                <tr key={c.key} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-5 py-3 text-gray-800">{c.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums text-gray-700 w-10 flex-shrink-0">{c.population.toLocaleString()}</span>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden flex-1 min-w-[40px]">
                        <div className="h-full rounded-full bg-[#3752AE]" style={{ width: `${(c.population / maxChild) * 100}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="pl-4 pr-5 py-3 text-right text-gray-600 tabular-nums">{c.households.toLocaleString()}</td>
                </tr>
              ))}
              {breakdown.rows.length === 0 && (
                <TableState
                  colSpan={3}
                  loading={breakdown.query.loading}
                  message={breakdown.query.error?.message}
                  onRetry={breakdown.query.refetch}
                  empty="No sub-areas registered here."
                />
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* National demographic trend — only meaningful at country level */}
      {!scoped && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <Kpi icon={growthUp ? TrendingUp : TrendingDown} label="Population growth (12 mo)" value={`${growthUp ? "+" : ""}${growthPct}%`} sub={`${growthUp ? "+" : ""}${(summary?.growth_abs ?? 0).toLocaleString()} people`} tone={growthUp ? "#047857" : "#B91C1C"} />
            <Kpi icon={Baby} label="Births (12 mo)" value={(summary?.births ?? 0).toLocaleString()} sub={`natural increase +${summary?.natural_increase ?? 0}`} tone="#10B981" />
            <Kpi icon={Baby} label="Deaths (12 mo)" value={(summary?.deaths ?? 0).toLocaleString()} sub="registered deaths" tone="#64748B" />
            <Kpi icon={ArrowLeftRight} label="Net migration" value={`${(summary?.net_migration ?? 0) >= 0 ? "+" : ""}${summary?.net_migration ?? 0}`} sub={`${summary?.moved_in ?? 0} in · ${summary?.moved_out ?? 0} out`} tone="#3752AE" />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-800">Population growth</h2>
              <p className="text-sm text-gray-400 mb-3">Registered population, last 12 months</p>
              <div className="h-56">
                {trendQuery.error ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                    <p className="text-sm text-gray-600">{trendQuery.error.message}</p>
                    <button onClick={trendQuery.refetch} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b]">Retry</button>
                  </div>
                ) : changeSeries.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-gray-400">
                    {trendQuery.loading ? "Loading…" : "No trend recorded."}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={changeSeries} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
                      <CartesianGrid vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} width={48} domain={["dataMin - 40", "dataMax + 40"]} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toLocaleString(), "Population"]} />
                      <Line type="monotone" dataKey="population" stroke="#3752AE" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-800">Births, deaths &amp; migration</h2>
                  <p className="text-sm text-gray-400">Monthly flows</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs flex-shrink-0">
                  <span className="flex items-center gap-1.5 text-gray-500"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BIRTH_COLOR }} /> Births</span>
                  <span className="flex items-center gap-1.5 text-gray-500"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DEATH_COLOR }} /> Deaths</span>
                  <span className="flex items-center gap-1.5 text-gray-500"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: OUT_COLOR }} /> Net migration</span>
                </div>
              </div>
              <div className="h-56">
                {changeSeries.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-gray-400">
                    {trendQuery.loading ? "Loading…" : "No flows recorded."}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={changeSeries} margin={{ top: 4, right: 8, bottom: 0, left: -8 }} barGap={2}>
                      <CartesianGrid vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip cursor={{ fill: "#F8FAFC" }} contentStyle={tooltipStyle} />
                      <Bar dataKey="births" name="Births" fill={BIRTH_COLOR} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="deaths" name="Deaths" fill={DEATH_COLOR} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Tabs + filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {([
            { id: "citizens", label: "Citizen registry", count: citizenTotal },
            { id: "households", label: "Family books", count: householdTotal },
          ] as const).map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm transition-colors ${
                  active ? "bg-[#3752AE] text-white font-semibold" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {t.label}
                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
                  {t.count.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex-1">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "citizens" ? "Search by UIN, name, household no, or village…" : "Search by family book no, head of household, or village…"}
              className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder:text-gray-400"
            />
          </div>
          {tab === "citizens" && (
            <div className="flex flex-wrap items-center gap-2">
              <MultiSelectFilter label="Gender" options={GENDER_OPTIONS} selected={genders} onChange={setGenders} />
              <MultiSelectFilter label="Status" options={CITIZEN_STATUS_OPTIONS} selected={statuses} onChange={setStatuses} />
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            {totalRows.toLocaleString()} {tab === "citizens" ? "citizen" : "household"}{totalRows !== 1 ? "s" : ""}
          </h2>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="hidden sm:inline">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-gray-50 border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 text-sm text-gray-700 outline-none focus:border-[#3752AE]"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {tab === "citizens" ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="px-5 py-3 font-medium">UIN</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Gender</th>
                  <th className="px-4 py-3 font-medium">Date of birth</th>
                  <th className="px-4 py-3 font-medium">Age</th>
                  <th className="px-4 py-3 font-medium">Household</th>
                  <th className="px-4 py-3 font-medium">Address</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="pl-4 pr-5 py-3 font-medium w-px whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageCitizens.map((c) => {
                  const address = [c.jurisdiction?.district_name, c.jurisdiction?.province_name].filter(Boolean).join(", ");
                  return (
                    <tr key={c.id ?? c.uin} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      <td className="px-5 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{c.uin}</td>
                      <td className="px-4 py-3 text-gray-800">
                        {text(c.name)}
                        <span className="block text-[11px] text-gray-400">{c.relation}</span>
                      </td>
                      <td className="px-4 py-3"><GenderDot gender={c.gender} /></td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{c.date_of_birth ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{c.age}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{c.household_no}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {c.jurisdiction?.village_name ?? "—"}
                        <span className="block text-[11px] text-gray-400">{address}</span>
                      </td>
                      <td className="px-4 py-3"><StatusChip status={c.status} /></td>
                      <td className="pl-4 pr-5 py-3 w-px whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() =>
                              setOpenPerson({
                                uin: c.uin,
                                name: text(c.name),
                                address: [c.jurisdiction?.village_name, address].filter(Boolean).join(", "),
                              })
                            }
                            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] w-[110px]"
                          >
                            <FileText className="w-3.5 h-3.5" /> See doc
                          </button>
                          <button
                            onClick={() => setOpenHouseholdNo(c.household_no || null)}
                            disabled={!c.household_no}
                            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 w-[110px]"
                          >
                            <Eye className="w-3.5 h-3.5" /> Household
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {pageCitizens.length === 0 && (
                  <TableState
                    colSpan={9}
                    loading={citizensQuery.loading}
                    message={citizensQuery.error?.message}
                    onRetry={citizensQuery.refetch}
                    empty="No citizens match your filters."
                  />
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="px-5 py-3 font-medium">Family book no.</th>
                  <th className="px-4 py-3 font-medium">Head of household</th>
                  <th className="px-4 py-3 font-medium">Members</th>
                  <th className="px-4 py-3 font-medium">Village</th>
                  <th className="px-4 py-3 font-medium">District</th>
                  <th className="px-4 py-3 font-medium">Province</th>
                  <th className="px-4 py-3 font-medium">Registered</th>
                  <th className="pl-4 pr-5 py-3 font-medium w-px whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageHouseholds.map((h) => (
                  <tr key={h.id} onClick={() => setOpenHouseholdNo(h.household_no)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 cursor-pointer">
                    <td className="px-5 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{h.household_no}</td>
                    <td className="px-4 py-3 text-gray-800">{h.head_name}</td>
                    <td className="px-4 py-3 text-gray-600">{h.total_members}</td>
                    <td className="px-4 py-3 text-gray-600">{h.jurisdiction?.village_name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{h.jurisdiction?.district_name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{h.jurisdiction?.province_name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{h.registered_at ?? "—"}</td>
                    <td className="pl-4 pr-5 py-3 w-px whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setOpenHouseholdNo(h.household_no)}
                        className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] w-[110px]"
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </button>
                    </td>
                  </tr>
                ))}
                {pageHouseholds.length === 0 && (
                  <TableState
                    colSpan={8}
                    loading={householdsQuery.loading}
                    message={householdsQuery.error?.message}
                    onRetry={householdsQuery.refetch}
                    empty="No households match your filters."
                  />
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalRows > 0 && (
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Showing <span className="font-medium text-gray-700">{start + 1}</span>–
              <span className="font-medium text-gray-700">{Math.min(start + pageSize, totalRows)}</span> of{" "}
              <span className="font-medium text-gray-700">{totalRows.toLocaleString()}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <span className="text-sm text-gray-500">Page {currentPage} of {totalPages}</span>
              <button
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Family book detail */}
      <Dialog open={openHouseholdNo !== null} onOpenChange={(open) => !open && setOpenHouseholdNo(null)}>
        <DialogContent className="sm:max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Family book {household?.household_no ?? ""}</DialogTitle>
            <DialogDescription>
              {household
                ? `${[household.jurisdiction?.village_name, household.jurisdiction?.district_name, household.jurisdiction?.province_name].filter(Boolean).join(", ")} · registered ${household.registered_at ?? "—"}`
                : householdQuery.loading
                  ? "Loading family book…"
                  : ""}
            </DialogDescription>
          </DialogHeader>

          {householdQuery.error ? (
            <div className="py-10 text-center">
              <p className="text-sm text-gray-600">{householdQuery.error.message}</p>
              <button
                onClick={householdQuery.refetch}
                className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b]"
              >
                Retry
              </button>
            </div>
          ) : householdQuery.loading ? (
            <p className="py-10 text-center text-sm text-gray-400">Loading family book…</p>
          ) : household ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-lg font-bold text-gray-800">{household.total_members}</p>
                  <p className="text-xs text-gray-400">Members</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-lg font-bold text-gray-800">
                    {household.male_members} / {household.female_members}
                  </p>
                  <p className="text-xs text-gray-400">Male / female</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-lg font-bold text-gray-800">
                    {household.members.filter((m) => (ageOf(m) ?? 99) < 18).length}
                  </p>
                  <p className="text-xs text-gray-400">Under 18</p>
                </div>
              </div>

              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-400 bg-gray-50">
                      <th className="px-4 py-2.5 font-medium">Name</th>
                      <th className="px-4 py-2.5 font-medium">Relation</th>
                      <th className="px-4 py-2.5 font-medium">Gender</th>
                      <th className="px-4 py-2.5 font-medium">Date of birth</th>
                      <th className="px-4 py-2.5 font-medium">Age</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="pl-2 pr-4 py-2.5 font-medium w-px" />
                    </tr>
                  </thead>
                  <tbody>
                    {household.members.map((m) => (
                      <tr key={m.id ?? m.uin} className="border-t border-gray-50">
                        <td className="px-4 py-2.5 text-gray-800">
                          {m.name}
                          <span className="block font-mono text-[11px] text-gray-400">{m.uin}</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{m.relation}</td>
                        <td className="px-4 py-2.5"><GenderDot gender={m.gender} /></td>
                        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{m.date_of_birth ?? "—"}</td>
                        <td className="px-4 py-2.5 text-gray-600">{ageOf(m) ?? "—"}</td>
                        <td className="px-4 py-2.5"><StatusChip status={m.status} /></td>
                        <td className="pl-2 pr-4 py-2.5 w-px">
                          <button
                            onClick={() => {
                              setOpenHouseholdNo(null);
                              setOpenPerson({
                                uin: m.uin,
                                name: m.name,
                                address: [
                                  household.jurisdiction?.village_name,
                                  household.jurisdiction?.district_name,
                                  household.jurisdiction?.province_name,
                                ].filter(Boolean).join(", "),
                              });
                            }}
                            title="See documents"
                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#3752AE] hover:bg-[#3752AE]/10"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
