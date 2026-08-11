import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ReferenceLine,
} from "recharts";
import {
  Search, Users, Home, Briefcase, TrendingUp, TrendingDown, Baby, Globe, ArrowLeftRight,
  Heart, HeartCrack, Eye, FileText, ArrowLeft, ChevronLeft, ChevronRight, Download,
} from "lucide-react";
import {
  CITIZENS,
  HOUSEHOLDS,
  POPULATION_SUMMARY,
  DEMOGRAPHIC_TREND,
  WORKING_AGE,
  MARITAL_META,
  MARITAL_ORDER,
  areaStat,
  type Citizen,
  type Household,
} from "../data/population";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { LocationFilter, NO_LOCATION, type LocationValue } from "../components/LocationFilter";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "../components/ui/dialog";
import { PersonRecord } from "../components/PersonRecord";
import { hashStr } from "../data/derive";

const MALE_COLOR = "#3752AE";
const FEMALE_COLOR = "#EC4899";
const BIRTH_COLOR = "#10B981";
const DEATH_COLOR = "#64748B";
const IN_COLOR = "#3752AE";
const OUT_COLOR = "#F59E0B";
const LOCAL_COLOR = "#3752AE";
const FOREIGN_COLOR = "#F59E0B";
const tooltipStyle = { borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 };

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
  const m = STATUS_META[status];
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

function exportCitizens(rows: Citizen[]) {
  const header = ["UIN", "Name", "Gender", "Date of birth", "Age", "Household", "Village", "District", "Province", "Marital", "Status"];
  const body = rows.map((c) => [
    c.uin, c.name, c.gender, c.dob, String(c.age), c.householdNo, c.village, c.district, c.province,
    MARITAL_META[c.maritalStatus].label, STATUS_META[c.status].label,
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

export function PopulationPage() {
  const [tab, setTab] = useState<"citizens" | "households">("citizens");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState<LocationValue>(NO_LOCATION);
  const [genders, setGenders] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openHousehold, setOpenHousehold] = useState<Household | null>(null);
  const [openPerson, setOpenPerson] = useState<Citizen | null>(null);

  const inLocation = (o: { province: string; district: string; village: string }) =>
    (!location.province || o.province === location.province) &&
    (!location.district || o.district === location.district) &&
    (!location.village || o.village === location.village);

  const citizenRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CITIZENS.filter((c) => {
      if (!inLocation(c)) return false;
      if (genders.length && !genders.includes(c.gender)) return false;
      if (statuses.length && !statuses.includes(c.status)) return false;
      if (q && !`${c.uin} ${c.name} ${c.householdNo} ${c.village} ${c.province}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, location, genders, statuses]);

  const householdRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return HOUSEHOLDS.filter((h) => {
      if (!inLocation(h)) return false;
      if (q && !`${h.no} ${h.head} ${h.village} ${h.district} ${h.province}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, location]);

  useEffect(() => setPage(1), [tab, query, location, genders, statuses, pageSize]);

  const totalRows = tab === "citizens" ? citizenRows.length : householdRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageCitizens = citizenRows.slice(start, start + pageSize);
  const pageHouseholds = householdRows.slice(start, start + pageSize);

  // The demographic overview is scoped to the selected area (country when none).
  const area = useMemo(() => areaStat(location.province, location.district, location.village), [location]);
  const scoped = !!location.province;

  const genderData = [
    { name: "Male", value: area.male, color: MALE_COLOR },
    { name: "Female", value: area.female, color: FEMALE_COLOR },
  ];
  const originData = [
    { name: "Lao nationals", value: area.population - area.foreign, color: LOCAL_COLOR },
    { name: "Foreign residents", value: area.foreign, color: FOREIGN_COLOR },
  ];
  const maritalData = MARITAL_ORDER.map((k) => ({ name: MARITAL_META[k].label, value: area.marital[k], color: MARITAL_META[k].color }));
  const avgHousehold = area.households ? area.population / area.households : 0;
  const workingPct = area.population ? Math.round((area.workingAge / area.population) * 100) : 0;
  const maxChild = area.children[0]?.population ?? 1;

  // Vital & migration trend. The national figures are the only monthly series we
  // hold, so when an area is selected we estimate its trend from its share of the
  // national population — the shape holds and the totals reconcile to the area.
  const share = POPULATION_SUMMARY.citizens ? area.population / POPULATION_SUMMARY.citizens : 0;
  // Population line is large, so plain rounding is fine. Monthly flows are small
  // nationally (divorces 3–8, deaths 10–17), so a small area's share rounds them
  // to 0 and leaves empty bars. Instead, vary each flow deterministically around
  // its scaled mean (0.5×–1.6×) so months differ; never let it fall to 0.
  const scalePop = (n: number) => (scoped ? Math.round(n * share) : n);
  const scaleFlow = (n: number, key: string, i: number) => {
    if (!scoped) return n;
    const jitter = (hashStr(`${area.name}|${key}|${i}`) % 1000) / 1000; // 0–1, stable per area/metric/month
    const v = Math.round(n * share * (0.5 + jitter * 1.1));
    if (v >= 1) return v;
    // Area so small the scaled mean is below 1 — still show a realistic 1–2.
    return (hashStr(`${area.name}|${key}|${i}|lo`) % 100) < 75 ? 1 : 2;
  };
  const changeSeries = DEMOGRAPHIC_TREND.map((m, i) => {
    const movedIn = scaleFlow(m.movedIn, "movedIn", i);
    const movedOut = scaleFlow(m.movedOut, "movedOut", i);
    return {
      month: m.month,
      births: scaleFlow(m.births, "births", i),
      deaths: scaleFlow(m.deaths, "deaths", i),
      marriages: scaleFlow(m.marriages, "marriages", i),
      divorces: scaleFlow(m.divorces, "divorces", i),
      movedIn,
      movedOut,
      net: movedIn - movedOut,
      population: scalePop(m.population),
    };
  });
  const sumSeries = (k: keyof (typeof changeSeries)[number]) =>
    changeSeries.reduce((a, m) => a + (m[k] as number), 0);
  const popFirst = changeSeries[0].population;
  const popLast = changeSeries[changeSeries.length - 1].population;
  // Summary KPIs — national totals, or the area's share when scoped.
  const s = scoped
    ? {
        births: sumSeries("births"),
        deaths: sumSeries("deaths"),
        marriages: sumSeries("marriages"),
        divorces: sumSeries("divorces"),
        movedIn: sumSeries("movedIn"),
        movedOut: sumSeries("movedOut"),
        netMigration: sumSeries("movedIn") - sumSeries("movedOut"),
        naturalIncrease: sumSeries("births") - sumSeries("deaths"),
        growthAbs: popLast - popFirst,
        growthPct: popFirst ? +(((popLast - popFirst) / popFirst) * 100).toFixed(1) : 0,
        married: area.marital.married,
        single: area.marital.single,
        divorced: area.marital.divorced,
        widowed: area.marital.widowed,
      }
    : POPULATION_SUMMARY;
  const growthUp = s.growthPct >= 0;

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
            {openPerson.uin} · {openPerson.village}, {openPerson.district}, {openPerson.province}
          </p>
        </div>
        <PersonRecord person={openPerson} />
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
            Registered population of {area.name} — filter by province, district or village.
          </p>
        </div>
        <button
          onClick={() => exportCitizens(citizenRows)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] self-start sm:self-auto"
        >
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      {/* Location filter — scopes the whole page */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        <LocationFilter value={location} onChange={setLocation} />
      </div>

      {/* KPIs (scoped to the selected area) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi icon={Users} label="Registered population" value={area.population.toLocaleString()} sub={`${area.male.toLocaleString()} male · ${area.female.toLocaleString()} female`} tone="#3752AE" />
        <Kpi icon={Home} label="Households" value={area.households.toLocaleString()} sub={`Avg ${avgHousehold.toFixed(1)} people per household`} tone="#10B981" />
        <Kpi icon={Briefcase} label="Working age (15–64)" value={area.workingAge.toLocaleString()} sub={`${workingPct}% · dependency ${area.workingAge ? Math.round(((area.population - area.workingAge) / area.workingAge) * 100) : 0}%`} tone="#6D28D9" />
        <Kpi icon={Globe} label="Foreign residents" value={area.foreign.toLocaleString()} sub={area.population ? `${((area.foreign / area.population) * 100).toFixed(1)}% of population` : "—"} tone="#F59E0B" />
      </div>

      {/* Demographic trend KPIs — national, or the selected area's share when scoped */}
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        <Kpi icon={growthUp ? TrendingUp : TrendingDown} label="Population growth (12 mo)" value={`${growthUp ? "+" : ""}${s.growthPct}%`} sub={`${growthUp ? "+" : ""}${s.growthAbs.toLocaleString()} people`} tone={growthUp ? "#047857" : "#B91C1C"} />
        <Kpi icon={Baby} label="Births (12 mo)" value={s.births.toLocaleString()} sub={`natural increase +${s.naturalIncrease}`} tone="#10B981" />
        <Kpi icon={Baby} label="Deaths (12 mo)" value={s.deaths.toLocaleString()} sub="registered deaths" tone="#64748B" />
        <Kpi icon={Heart} label="Marriages (12 mo)" value={s.marriages.toLocaleString()} sub={`${s.married.toLocaleString()} married residents`} tone="#EC4899" />
        <Kpi icon={HeartCrack} label="Divorces (12 mo)" value={s.divorces.toLocaleString()} sub={`${s.divorced.toLocaleString()} divorced residents`} tone="#F59E0B" />
        <Kpi icon={ArrowLeftRight} label="Net migration" value={`${s.netMigration >= 0 ? "+" : ""}${s.netMigration}`} sub={`${s.movedIn} in · ${s.movedOut} out`} tone="#3752AE" />
      </div>

      {/* Age & gender + composition (scoped) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col">
          <div className="flex items-start justify-between gap-4 flex-shrink-0">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Age &amp; gender — {area.name}</h2>
              <p className="text-sm text-gray-400">Registered population by age band · working age {WORKING_AGE.from}–{WORKING_AGE.to}</p>
            </div>
            <div className="flex items-center gap-3 text-xs flex-shrink-0">
              <span className="flex items-center gap-1.5 text-gray-500"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: MALE_COLOR }} /> Male</span>
              <span className="flex items-center gap-1.5 text-gray-500"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: FEMALE_COLOR }} /> Female</span>
            </div>
          </div>
          <div className="flex-1 min-h-[280px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={area.ageBands} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }} barCategoryGap="26%" barGap={4}>
                <CartesianGrid horizontal={false} stroke="#F1F5F9" />
                <XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="band" tick={{ fill: "#64748B", fontSize: 12 }} axisLine={false} tickLine={false} width={52} />
                <Tooltip cursor={{ fill: "#F8FAFC" }} contentStyle={tooltipStyle} />
                <Bar dataKey="male" name="Male" fill={MALE_COLOR} radius={[0, 4, 4, 0]} maxBarSize={18} />
                <Bar dataKey="female" name="Female" fill={FEMALE_COLOR} radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col">
          <h2 className="text-base font-semibold text-gray-800">Composition</h2>
          <p className="text-sm text-gray-400">Gender, nationality and marital status</p>
          <div className="flex-1 flex flex-col justify-center divide-y divide-gray-50 mt-1">
            {[
              { title: "Gender", data: genderData },
              { title: "Nationality", data: originData },
              { title: "Marital status", data: maritalData },
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

      {/* Area breakdown — the children of the selected level */}
      {scoped && area.children.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">{area.childLabel} of {area.name}</h2>
            <p className="text-sm text-gray-400">Population and households within this area</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="px-5 py-3 font-medium">{area.childLabel.replace(/s$/, "")}</th>
                  <th className="px-4 py-3 font-medium w-1/2">Population</th>
                  <th className="pl-4 pr-5 py-3 font-medium text-right">Households</th>
                </tr>
              </thead>
              <tbody>
                {area.children.map((c) => (
                  <tr key={c.name} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
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
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Demographic trend charts — national, or the selected area's share when scoped */}
      <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-800">Population growth</h2>
              <p className="text-sm text-gray-400 mb-3">{scoped ? `${area.name} · estimated from area share` : "Registered population, last 12 months"}</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={changeSeries} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
                    <CartesianGrid vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} width={48} domain={["dataMin - 40", "dataMax + 40"]} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toLocaleString(), "Population"]} />
                    <Line type="monotone" dataKey="population" stroke="#3752AE" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
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
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={changeSeries} margin={{ top: 4, right: 8, bottom: 0, left: -8 }} barGap={2}>
                    <CartesianGrid vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} width={32} domain={["auto", "auto"]} />
                    <Tooltip cursor={{ fill: "#F8FAFC" }} contentStyle={tooltipStyle} />
                    <ReferenceLine y={0} stroke="#E2E8F0" />
                    <Bar dataKey="births" name="Births" fill={BIRTH_COLOR} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="deaths" name="Deaths" fill={DEATH_COLOR} radius={[3, 3, 0, 0]} />
                    <Line type="monotone" dataKey="net" name="Net migration" stroke={OUT_COLOR} strokeWidth={2.5} dot={{ r: 2.5, fill: OUT_COLOR, strokeWidth: 0 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h2 className="text-base font-semibold text-gray-800">Marriages &amp; divorces</h2>
                <p className="text-sm text-gray-400">Registered civil events per month, last 12 months</p>
              </div>
              <div className="flex items-center gap-3 text-xs flex-shrink-0">
                <span className="flex items-center gap-1.5 text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-[#EC4899]" /> Marriages</span>
                <span className="flex items-center gap-1.5 text-gray-500"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: OUT_COLOR }} /> Divorces</span>
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={changeSeries} margin={{ top: 4, right: 8, bottom: 0, left: -8 }} barGap={2}>
                  <CartesianGrid vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip cursor={{ fill: "#F8FAFC" }} contentStyle={tooltipStyle} />
                  <Bar dataKey="marriages" name="Marriages" fill="#EC4899" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="divorces" name="Divorces" fill={OUT_COLOR} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
      </>

      {/* Tabs + filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {([
            { id: "citizens", label: "Citizen registry", count: citizenRows.length },
            { id: "households", label: "Family books", count: householdRows.length },
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
                  <th className="px-4 py-3 font-medium">Marital</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="pl-4 pr-5 py-3 font-medium w-px whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageCitizens.map((c) => (
                  <tr key={c.uin} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-5 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{c.uin}</td>
                    <td className="px-4 py-3 text-gray-800">
                      {c.name}
                      <span className="block text-[11px] text-gray-400">{c.relation}</span>
                    </td>
                    <td className="px-4 py-3"><GenderDot gender={c.gender} /></td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{c.dob}</td>
                    <td className="px-4 py-3 text-gray-600">{c.age}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{c.householdNo}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.village}
                      <span className="block text-[11px] text-gray-400">{c.district}, {c.province}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-gray-600 whitespace-nowrap">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MARITAL_META[c.maritalStatus].color }} />
                        {MARITAL_META[c.maritalStatus].label}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatusChip status={c.status} /></td>
                    <td className="pl-4 pr-5 py-3 w-px whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setOpenPerson(c)}
                          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] w-[110px]"
                        >
                          <FileText className="w-3.5 h-3.5" /> See doc
                        </button>
                        <button
                          onClick={() => setOpenHousehold(HOUSEHOLDS.find((h) => h.no === c.householdNo) ?? null)}
                          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 w-[110px]"
                        >
                          <Eye className="w-3.5 h-3.5" /> Household
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {totalRows === 0 && (
                  <tr>
                    <td colSpan={10} className="px-5 py-12 text-center text-sm text-gray-400">No citizens match your filters.</td>
                  </tr>
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
                  <tr key={h.no} onClick={() => setOpenHousehold(h)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 cursor-pointer">
                    <td className="px-5 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{h.no}</td>
                    <td className="px-4 py-3 text-gray-800">{h.head}</td>
                    <td className="px-4 py-3 text-gray-600">{h.members.length}</td>
                    <td className="px-4 py-3 text-gray-600">{h.village}</td>
                    <td className="px-4 py-3 text-gray-500">{h.district}</td>
                    <td className="px-4 py-3 text-gray-600">{h.province}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{h.registered}</td>
                    <td className="pl-4 pr-5 py-3 w-px whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setOpenHousehold(h)}
                        className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] w-[110px]"
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </button>
                    </td>
                  </tr>
                ))}
                {totalRows === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">No households match your filters.</td>
                  </tr>
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
      <Dialog open={openHousehold !== null} onOpenChange={(open) => !open && setOpenHousehold(null)}>
        <DialogContent className="sm:max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Family book {openHousehold?.no}</DialogTitle>
            <DialogDescription>
              {openHousehold ? `${openHousehold.village}, ${openHousehold.district}, ${openHousehold.province} · registered ${openHousehold.registered}` : ""}
            </DialogDescription>
          </DialogHeader>

          {openHousehold && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-lg font-bold text-gray-800">{openHousehold.members.length}</p>
                  <p className="text-xs text-gray-400">Members</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-lg font-bold text-gray-800">
                    {openHousehold.members.filter((m) => m.gender === "male").length} /{" "}
                    {openHousehold.members.filter((m) => m.gender === "female").length}
                  </p>
                  <p className="text-xs text-gray-400">Male / female</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-lg font-bold text-gray-800">{openHousehold.members.filter((m) => m.age < 18).length}</p>
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
                      <th className="px-4 py-2.5 font-medium">Marital</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="pl-2 pr-4 py-2.5 font-medium w-px" />
                    </tr>
                  </thead>
                  <tbody>
                    {openHousehold.members.map((m) => (
                      <tr key={m.uin} className="border-t border-gray-50">
                        <td className="px-4 py-2.5 text-gray-800">
                          {m.name}
                          <span className="block font-mono text-[11px] text-gray-400">{m.uin}</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{m.relation}</td>
                        <td className="px-4 py-2.5"><GenderDot gender={m.gender} /></td>
                        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{m.dob}</td>
                        <td className="px-4 py-2.5 text-gray-600">{m.age}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-gray-600 whitespace-nowrap">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MARITAL_META[m.maritalStatus].color }} />
                            {MARITAL_META[m.maritalStatus].label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5"><StatusChip status={m.status} /></td>
                        <td className="pl-2 pr-4 py-2.5 w-px">
                          <button
                            onClick={() => { setOpenHousehold(null); setOpenPerson(m); }}
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
