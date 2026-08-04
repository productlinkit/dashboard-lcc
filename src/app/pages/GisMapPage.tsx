import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";
import { ChevronRight, MapPin, Users, Home, Briefcase, Globe, FileText, X } from "lucide-react";
import { LaosMap } from "../components/LaosMap";
import { areaStat, POPULATION_BY_PROVINCE } from "../data/population";
import { APPLICATIONS } from "../data/mockData";

const MALE_COLOR = "#3752AE";
const FEMALE_COLOR = "#EC4899";
const tooltipStyle = { borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 };

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
  const [province, setProvince] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [village, setVillage] = useState<string | null>(null);

  const area = useMemo(() => areaStat(province, district, village), [province, district, village]);

  /* Application activity is recorded at province level, so it follows the
   * selected province (or the whole country when none is chosen). */
  const appScope = useMemo(() => {
    const rows = APPLICATIONS.filter((a) => !province || a.province === province);
    return {
      total: rows.length,
      issued: rows.filter((a) => a.status === "issued").length,
      pending: rows.filter((a) => ["draft", "submitted", "certified", "under-review", "returned"].includes(a.status)).length,
      inRegister: rows.filter((a) => ["registered", "issued", "revoked"].includes(a.status)).length,
    };
  }, [province]);

  function drillInto(name: string) {
    if (area.level === "country") setProvince(name);
    else if (area.level === "province") setDistrict(name);
    else if (area.level === "district") setVillage(name);
  }

  // Breadcrumb steps — each jumps back to that level.
  const crumbs: { label: string; onClick: () => void }[] = [
    { label: "Lao PDR", onClick: () => { setProvince(null); setDistrict(null); setVillage(null); } },
  ];
  if (province) crumbs.push({ label: province, onClick: () => { setDistrict(null); setVillage(null); } });
  if (district) crumbs.push({ label: district, onClick: () => setVillage(null) });
  if (village) crumbs.push({ label: village, onClick: () => {} });

  const genderData = [
    { name: "Male", value: area.male, color: MALE_COLOR },
    { name: "Female", value: area.female, color: FEMALE_COLOR },
  ];
  const maxChild = area.children[0]?.population ?? 1;
  const avgHousehold = area.households ? area.population / area.households : 0;
  const workingPct = area.population ? Math.round((area.workingAge / area.population) * 100) : 0;

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
          {(province || district || village) && (
            <button
              onClick={() => { setProvince(null); setDistrict(null); setVillage(null); }}
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
            <LaosMap
              fill
              zoom={6}
              showList={false}
              values={POPULATION_BY_PROVINCE}
              valueLabel="Population"
              selected={province}
              onSelect={(name) => { setProvince(name); setDistrict(null); setVillage(null); }}
            />
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
          {area.children.length > 0 ? (
            <>
              <div className="px-4 py-2 flex items-center justify-between border-b border-gray-50">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{area.childLabel}</span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Population</span>
              </div>
              <div className="flex-1 overflow-y-auto min-h-[180px]">
                {area.children.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => drillInto(c.name)}
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
        <Kpi icon={Briefcase} label="Working age (15–64)" value={area.workingAge.toLocaleString()} sub={`${workingPct}% of population`} tone="#6D28D9" />
        <Kpi icon={Globe} label="Foreign residents" value={area.foreign.toLocaleString()} sub={area.population ? `${((area.foreign / area.population) * 100).toFixed(1)}% of population` : "—"} tone="#F59E0B" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Age & gender for the selected area */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800">Age &amp; gender — {area.name}</h2>
          <p className="text-sm text-gray-400 mb-3">Registered population by age band</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={area.ageBands} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }} barGap={2}>
                <CartesianGrid horizontal={false} stroke="#F1F5F9" />
                <XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="band" tick={{ fill: "#64748B", fontSize: 12 }} axisLine={false} tickLine={false} width={52} />
                <Tooltip cursor={{ fill: "#F8FAFC" }} contentStyle={tooltipStyle} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="male" name="Male" fill={MALE_COLOR} radius={[0, 4, 4, 0]} barSize={14} />
                <Bar dataKey="female" name="Female" fill={FEMALE_COLOR} radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
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
              {province
                ? `Civil registration cases in ${province}`
                : "Civil registration cases across Lao PDR"}
              {(district || village) && " · recorded at province level"}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          {[
            { label: "Applications", value: appScope.total, tone: "#3752AE" },
            { label: "In register", value: appScope.inRegister, tone: "#6D28D9" },
            { label: "Certificates issued", value: appScope.issued, tone: "#047857" },
            { label: "In progress", value: appScope.pending, tone: "#B45309" },
          ].map((m) => (
            <div key={m.label} className="rounded-xl bg-gray-50 p-4">
              <p className="text-2xl font-bold" style={{ color: m.tone }}>{m.value.toLocaleString()}</p>
              <p className="text-sm text-gray-500">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
