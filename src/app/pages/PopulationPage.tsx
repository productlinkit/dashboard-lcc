import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Search, Users, Home, UserCheck, Baby, Eye, FileText, ArrowLeft, ChevronLeft, ChevronRight, Download } from "lucide-react";
import {
  CITIZENS,
  HOUSEHOLDS,
  POPULATION_SUMMARY,
  PROVINCE_NAMES,
  ageDistribution,
  type Citizen,
  type Household,
} from "../data/population";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { PersonRecord } from "../components/PersonRecord";

const MALE_COLOR = "#3752AE";
const FEMALE_COLOR = "#EC4899";

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "Active", color: "#047857", bg: "#D1FAE5" },
  deceased: { label: "Deceased", color: "#44403C", bg: "#E7E5E4" },
  moved: { label: "Moved out", color: "#B45309", bg: "#FEF3C7" },
};

const PROVINCE_OPTIONS = PROVINCE_NAMES.map((p) => ({ value: p, label: p }));
const GENDER_OPTIONS = [
  { value: "male", label: "Male", color: MALE_COLOR },
  { value: "female", label: "Female", color: FEMALE_COLOR },
];
const CITIZEN_STATUS_OPTIONS = Object.entries(STATUS_META).map(([value, m]) => ({
  value,
  label: m.label,
  color: m.color,
}));

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
      <span
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${tone}14`, color: tone }}
      >
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
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ color: m.color, backgroundColor: m.bg }}
    >
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
  const header = ["UIN", "Name", "Gender", "Date of birth", "Age", "Household", "Village", "District", "Province", "Status"];
  const body = rows.map((c) => [
    c.uin, c.name, c.gender, c.dob, String(c.age), c.householdNo, c.village, c.district, c.province,
    STATUS_META[c.status].label,
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
  const [provinces, setProvinces] = useState<string[]>([]);
  const [genders, setGenders] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openHousehold, setOpenHousehold] = useState<Household | null>(null);
  const [openPerson, setOpenPerson] = useState<Citizen | null>(null);

  const citizenRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CITIZENS.filter((c) => {
      if (provinces.length && !provinces.includes(c.province)) return false;
      if (genders.length && !genders.includes(c.gender)) return false;
      if (statuses.length && !statuses.includes(c.status)) return false;
      if (q && !`${c.uin} ${c.name} ${c.householdNo} ${c.village} ${c.province}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, provinces, genders, statuses]);

  const householdRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return HOUSEHOLDS.filter((h) => {
      if (provinces.length && !provinces.includes(h.province)) return false;
      if (q && !`${h.no} ${h.head} ${h.village} ${h.district} ${h.province}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, provinces]);

  useEffect(() => setPage(1), [tab, query, provinces, genders, statuses, pageSize]);

  const totalRows = tab === "citizens" ? citizenRows.length : householdRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageCitizens = citizenRows.slice(start, start + pageSize);
  const pageHouseholds = householdRows.slice(start, start + pageSize);

  /* The pyramid follows the filters, so it explains the table below it. */
  const ageData = useMemo(() => ageDistribution(citizenRows), [citizenRows]);

  const s = POPULATION_SUMMARY;
  const topProvinces = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of CITIZENS) counts[c.province] = (counts[c.province] ?? 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, []);
  const maxProvince = topProvinces[0]?.[1] ?? 1;

  /* Opening a citizen replaces the page, the same way Watchlist Search does —
   * the record is too big to read comfortably inside a dialog. */
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
            Citizen registry and family book — search by UIN or name, open a household to see its members.
          </p>
        </div>
        <button
          onClick={() => exportCitizens(citizenRows)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] self-start sm:self-auto"
        >
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi
          icon={Users}
          label="Registered citizens"
          value={s.citizens.toLocaleString()}
          sub={`${s.male.toLocaleString()} male · ${s.female.toLocaleString()} female`}
          tone="#3752AE"
        />
        <Kpi
          icon={Home}
          label="Family books"
          value={s.households.toLocaleString()}
          sub={`Avg ${s.avgHouseholdSize.toFixed(1)} members per household`}
          tone="#10B981"
        />
        <Kpi
          icon={UserCheck}
          label="Active records"
          value={s.active.toLocaleString()}
          sub={`${s.deceased} deceased · ${s.moved} moved out`}
          tone="#0F766E"
        />
        <Kpi
          icon={Baby}
          label="Under 18"
          value={s.minors.toLocaleString()}
          sub={`${s.seniors.toLocaleString()} aged 60 and over`}
          tone="#F59E0B"
        />
      </div>

      {/* Distribution */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800">Age and gender distribution</h2>
          <p className="text-sm text-gray-400 mb-3">
            {citizenRows.length.toLocaleString()} citizens matching the current filters
          </p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ageData} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }} barGap={2}>
                <CartesianGrid horizontal={false} stroke="#F1F5F9" />
                <XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="band"
                  tick={{ fill: "#64748B", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip
                  cursor={{ fill: "#F8FAFC" }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="male" name="Male" fill={MALE_COLOR} radius={[0, 4, 4, 0]} barSize={14} />
                <Bar dataKey="female" name="Female" fill={FEMALE_COLOR} radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800">Citizens by province</h2>
          <p className="text-sm text-gray-400 mb-4">Top six by registered population</p>
          <div className="space-y-3">
            {topProvinces.map(([name, count]) => (
              <div key={name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-600 truncate pr-2">{name}</span>
                  <span className="font-semibold text-gray-800">{count.toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(count / maxProvince) * 100}%`, backgroundColor: MALE_COLOR }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs + filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {([
            { id: "citizens", label: "Citizen registry", count: CITIZENS.length },
            { id: "households", label: "Family books", count: HOUSEHOLDS.length },
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
                <span
                  className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                    active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                  }`}
                >
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
              placeholder={
                tab === "citizens"
                  ? "Search by UIN, name, household no, or village…"
                  : "Search by family book no, head of household, or village…"
              }
              className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder:text-gray-400"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MultiSelectFilter label="Province" options={PROVINCE_OPTIONS} selected={provinces} onChange={setProvinces} />
            {tab === "citizens" && (
              <>
                <MultiSelectFilter label="Gender" options={GENDER_OPTIONS} selected={genders} onChange={setGenders} />
                <MultiSelectFilter
                  label="Status"
                  options={CITIZEN_STATUS_OPTIONS}
                  selected={statuses}
                  onChange={setStatuses}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            {totalRows.toLocaleString()} {tab === "citizens" ? "citizen" : "household"}
            {totalRows !== 1 ? "s" : ""}
          </h2>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="hidden sm:inline">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-gray-50 border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 text-sm text-gray-700 outline-none focus:border-[#3752AE]"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
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
                {pageCitizens.map((c) => (
                  <tr key={c.uin} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-5 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{c.uin}</td>
                    <td className="px-4 py-3 text-gray-800">
                      {c.name}
                      <span className="block text-[11px] text-gray-400">{c.relation}</span>
                    </td>
                    <td className="px-4 py-3">
                      <GenderDot gender={c.gender} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{c.dob}</td>
                    <td className="px-4 py-3 text-gray-600">{c.age}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{c.householdNo}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.village}
                      <span className="block text-[11px] text-gray-400">{c.province}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={c.status} />
                    </td>
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
                    <td colSpan={9} className="px-5 py-12 text-center text-sm text-gray-400">
                      No citizens match your filters.
                    </td>
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
                  <tr
                    key={h.no}
                    onClick={() => setOpenHousehold(h)}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 cursor-pointer"
                  >
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
                    <td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">
                      No households match your filters.
                    </td>
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
              <span className="text-sm text-gray-500">
                Page {currentPage} of {totalPages}
              </span>
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
              {openHousehold
                ? `${openHousehold.village}, ${openHousehold.district}, ${openHousehold.province} · registered ${openHousehold.registered}`
                : ""}
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
                  <p className="text-lg font-bold text-gray-800">
                    {openHousehold.members.filter((m) => m.age < 18).length}
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
                    {openHousehold.members.map((m) => (
                      <tr key={m.uin} className="border-t border-gray-50">
                        <td className="px-4 py-2.5 text-gray-800">
                          {m.name}
                          <span className="block font-mono text-[11px] text-gray-400">{m.uin}</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{m.relation}</td>
                        <td className="px-4 py-2.5">
                          <GenderDot gender={m.gender} />
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{m.dob}</td>
                        <td className="px-4 py-2.5 text-gray-600">{m.age}</td>
                        <td className="px-4 py-2.5">
                          <StatusChip status={m.status} />
                        </td>
                        <td className="pl-2 pr-4 py-2.5 w-px">
                          <button
                            onClick={() => {
                              setOpenHousehold(null);
                              setOpenPerson(m);
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
