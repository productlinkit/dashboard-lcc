import { useMemo, useState } from "react";
import {
  Search, ShieldAlert, ArrowLeft, FileText, CalendarClock, Users, MapPin,
  BadgeCheck, TriangleAlert, ScanSearch, ChevronRight, Printer,
} from "lucide-react";
import {
  WATCHLIST, WATCH_BY_UIN, CITIZEN_BY_UIN, WATCHLIST_SUMMARY,
  WATCH_CATEGORY_META, WATCH_STATUS_META, RISK_META, DOC_STATUS_META,
  documentsFor, eventsFor, searchPeople,
  type WatchlistEntry,
} from "../data/watchlist";
import { HOUSEHOLD_BY_NO, type Citizen } from "../data/population";
import photo3x4 from "../../imports/photo3x4.png";

function Chip({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ color, backgroundColor: bg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function Kpi({
  icon: Icon, label, value, sub, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number; sub: string; tone: string;
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2 border-b border-gray-50 last:border-0">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm text-gray-800 mt-0.5">{value}</p>
    </div>
  );
}

/* ── Full profile for one person ── */
function PersonProfile({ person, onBack }: { person: Citizen; onBack: () => void }) {
  const entry = WATCH_BY_UIN[person.uin];
  const docs = useMemo(() => documentsFor(person), [person]);
  const events = useMemo(() => eventsFor(person), [person]);
  const household = HOUSEHOLD_BY_NO[person.householdNo];

  const cat = entry ? WATCH_CATEGORY_META[entry.category] : null;
  const st = entry ? WATCH_STATUS_META[entry.status] : null;
  const risk = entry ? RISK_META[entry.risk] : null;

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#3752AE] hover:underline"
      >
        <ArrowLeft className="w-4 h-4" /> Back to search
      </button>

      {/* Watchlist banner — the first thing an officer must see */}
      {entry && entry.status === "active" ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-bold text-red-800">Active watchlist notice</p>
                {cat && <Chip label={cat.label} color={cat.color} bg={cat.bg} />}
                {risk && <Chip label={risk.label} color={risk.color} bg={risk.bg} />}
              </div>
              <p className="text-sm text-red-800 mt-1">
                {entry.offence} · notice {entry.id}
              </p>
              <p className="text-sm text-red-700/80 mt-1">{entry.note}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
            <BadgeCheck className="w-5 h-5" />
          </span>
          <div>
            <p className="text-base font-bold text-emerald-800">No active notice</p>
            <p className="text-sm text-emerald-700/80 mt-0.5">
              {entry
                ? `A ${WATCH_CATEGORY_META[entry.category].label.toLowerCase()} notice exists but is ${WATCH_STATUS_META[entry.status].label.toLowerCase()} (${entry.id}).`
                : "This person does not appear on any watchlist. Services may be processed normally."}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Identity */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start gap-4">
            <img
              src={photo3x4}
              alt={person.name}
              className="w-24 h-32 object-cover rounded-xl border border-gray-100 flex-shrink-0"
            />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-800 leading-tight">{person.name}</h2>
              <p className="font-mono text-xs text-gray-500 mt-0.5">{person.uin}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Chip
                  label={person.gender === "male" ? "Male" : "Female"}
                  color={person.gender === "male" ? "#3752AE" : "#EC4899"}
                  bg={person.gender === "male" ? "#E8ECF9" : "#FCE7F3"}
                />
                <Chip label={`${person.age} years`} color="#475569" bg="#F1F5F9" />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <Row label="Date of birth" value={person.dob} />
            <Row label="Relation in household" value={person.relation} />
            <Row label="Registry status" value={person.status === "active" ? "Active" : person.status === "deceased" ? "Deceased" : "Moved out"} />
            <Row label="Address" value={`${person.village}, ${person.district}, ${person.province}`} />
          </div>
        </div>

        {/* Documents */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Documents on file</h2>
              <p className="text-sm text-gray-400">{docs.length} records held across registries</p>
            </div>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="px-5 py-3 font-medium">Document</th>
                  <th className="px-4 py-3 font-medium">Number</th>
                  <th className="px-4 py-3 font-medium">Issued</th>
                  <th className="px-4 py-3 font-medium">Expires</th>
                  <th className="px-4 py-3 font-medium">Issuing authority</th>
                  <th className="pl-4 pr-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => {
                  const s = DOC_STATUS_META[d.status];
                  return (
                    <tr key={d.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-2 text-gray-800">
                          <FileText className="w-4 h-4 text-gray-400" />
                          {d.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{d.number}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{d.issued}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{d.expires ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500">{d.authority}</td>
                      <td className="pl-4 pr-5 py-3">
                        <Chip label={s.label} color={s.color} bg={s.bg} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Life events */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-gray-400" /> Civil registration history
          </h2>
          <div className="mt-4 space-y-4">
            {events.map((e, i) => (
              <div key={`${e.date}-${i}`} className="flex gap-3">
                <div className="flex flex-col items-center flex-shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#3752AE] mt-1.5" />
                  {i < events.length - 1 && <span className="w-px flex-1 bg-gray-100 my-1" />}
                </div>
                <div className="pb-1">
                  <p className="text-sm font-medium text-gray-800">{e.event}</p>
                  <p className="text-xs text-gray-400">{e.date} · {e.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Household */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" /> Household members
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {person.householdNo} · {household?.members.length ?? 0} members
          </p>
          <div className="mt-3 divide-y divide-gray-50">
            {household?.members.map((m) => {
              const flagged = WATCH_BY_UIN[m.uin]?.status === "active";
              return (
                <div key={m.uin} className="py-2.5 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                    {m.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${m.uin === person.uin ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                      {m.name}
                      {m.uin === person.uin && <span className="text-gray-400 font-normal"> · this person</span>}
                    </p>
                    <p className="text-xs text-gray-400">{m.relation} · {m.age} years</p>
                  </div>
                  {flagged && (
                    <span title="On the watchlist" className="text-red-600 flex-shrink-0">
                      <TriangleAlert className="w-4 h-4" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Notice detail */}
      {entry && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-800">Watchlist notice {entry.id}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 mt-2">
            <Row label="Category" value={WATCH_CATEGORY_META[entry.category].label} />
            <Row label="Offence / reason" value={entry.offence} />
            <Row label="Issuing authority" value={entry.authority} />
            <Row label="Issued" value={entry.issued} />
            <Row label="Valid until" value={entry.expires} />
            <Row label="Status" value={`${WATCH_STATUS_META[entry.status].label} · ${RISK_META[entry.risk].label}`} />
          </div>
        </div>
      )}
    </div>
  );
}

export function WatchlistPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Citizen | null>(null);

  const results = useMemo(() => searchPeople(query), [query]);
  const activeEntries = useMemo(
    () => WATCHLIST.filter((e) => e.status === "active").slice(0, 8),
    [],
  );

  function openEntry(entry: WatchlistEntry) {
    const person = CITIZEN_BY_UIN[entry.uin];
    if (person) setSelected(person);
  }

  if (selected) {
    return (
      <div className="max-w-screen-2xl mx-auto">
        <PersonProfile person={selected} onBack={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h1 className="text-xl font-bold text-gray-800">Watchlist Search</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Check a person against law-enforcement notices, then open their full registry record and documents.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi icon={ShieldAlert} label="Active notices" value={WATCHLIST_SUMMARY.active} sub="Currently enforceable" tone="#B91C1C" />
        <Kpi icon={TriangleAlert} label="High risk" value={WATCHLIST_SUMMARY.highRisk} sub="Notify authority before processing" tone="#B45309" />
        <Kpi icon={BadgeCheck} label="Cleared" value={WATCHLIST_SUMMARY.cleared} sub="Notice lifted" tone="#047857" />
        <Kpi icon={ScanSearch} label="Total on file" value={WATCHLIST_SUMMARY.total} sub="Across all categories" tone="#3752AE" />
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 focus-within:border-[#3752AE]">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a name, UIN, family book number, or village…"
            className="flex-1 bg-transparent outline-none text-base text-gray-800 placeholder:text-gray-400"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-sm text-gray-400 hover:text-gray-600">
              Clear
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          People with an active notice are listed first. Minimum two characters.
        </p>
      </div>

      {/* Results, or the active-notice shortlist before searching */}
      {query.trim().length >= 2 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">
              {results.length} result{results.length !== 1 ? "s" : ""} for “{query.trim()}”
            </h2>
          </div>
          <div className="divide-y divide-gray-50">
            {results.map((p) => {
              const entry = WATCH_BY_UIN[p.uin];
              const flagged = entry?.status === "active";
              return (
                <button
                  key={p.uin}
                  onClick={() => setSelected(p)}
                  className={`w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50/60 ${
                    flagged ? "bg-red-50/40" : ""
                  }`}
                >
                  <span
                    className={`w-10 h-10 rounded-full text-xs font-semibold flex items-center justify-center flex-shrink-0 ${
                      flagged ? "bg-red-100 text-red-700" : "bg-[#3752AE]/10 text-[#3752AE]"
                    }`}
                  >
                    {p.name.split(" ").map((s) => s[0]).join("").slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-gray-800">{p.name}</p>
                      {flagged && (
                        <Chip
                          label={WATCH_CATEGORY_META[entry.category].label}
                          color={WATCH_CATEGORY_META[entry.category].color}
                          bg={WATCH_CATEGORY_META[entry.category].bg}
                        />
                      )}
                    </div>
                    <p className="text-xs text-gray-400 font-mono">{p.uin}</p>
                  </div>
                  <div className="hidden sm:block text-right flex-shrink-0">
                    <p className="text-sm text-gray-600">{p.age} years · {p.gender === "male" ? "Male" : "Female"}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 justify-end">
                      <MapPin className="w-3 h-3" /> {p.village}, {p.province}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </button>
              );
            })}
            {results.length === 0 && (
              <p className="px-5 py-16 text-center text-sm text-gray-400">
                No person in the registry matches “{query.trim()}”.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">Recent active notices</h2>
            <p className="text-sm text-gray-400">Open one directly, or search above for any citizen</p>
          </div>
          <div className="divide-y divide-gray-50">
            {activeEntries.map((e) => {
              const person = CITIZEN_BY_UIN[e.uin];
              const cat = WATCH_CATEGORY_META[e.category];
              const risk = RISK_META[e.risk];
              return (
                <button
                  key={e.id}
                  onClick={() => openEntry(e)}
                  className="w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50/60"
                >
                  <span className="w-10 h-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center flex-shrink-0">
                    <ShieldAlert className="w-5 h-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-gray-800">{person?.name ?? e.uin}</p>
                      <Chip label={cat.label} color={cat.color} bg={cat.bg} />
                      <Chip label={risk.label} color={risk.color} bg={risk.bg} />
                    </div>
                    <p className="text-xs text-gray-400">
                      {e.offence} · {e.id} · issued {e.issued}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
