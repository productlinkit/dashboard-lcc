import { useMemo, useState } from "react";
import {
  Search, ShieldAlert, ArrowLeft, MapPin,
  BadgeCheck, TriangleAlert, ScanSearch, ChevronRight,
} from "lucide-react";
import {
  WATCHLIST, WATCH_BY_UIN, CITIZEN_BY_UIN, WATCHLIST_SUMMARY,
  WATCH_CATEGORY_META, RISK_META, searchPeople,
  type WatchlistEntry,
} from "../data/watchlist";
import { type Citizen } from "../data/population";
import { PersonRecord, Chip } from "../components/PersonRecord";

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
      <div className="max-w-screen-2xl mx-auto space-y-4">
        <button
          onClick={() => setSelected(null)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#3752AE] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Back to search
        </button>
        <PersonRecord person={selected} showWatchlist />
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
