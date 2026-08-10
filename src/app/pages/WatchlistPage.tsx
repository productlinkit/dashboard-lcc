import { useMemo, useState } from "react";
import {
  Search, ShieldAlert, ArrowLeft, MapPin,
  BadgeCheck, TriangleAlert, ScanSearch, ChevronRight,
} from "lucide-react";
import { registry, verification } from "../api/endpoints";
import { useDebounced, useQuery } from "../api/hooks";
import { text, type WatchlistEntry } from "../api/types";
import { PersonRecord, Chip, categoryMeta, riskMeta } from "../components/PersonRecord";

interface SelectedPerson {
  uin: string;
  name: string;
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

function Retry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="px-5 py-16 text-center">
      <p className="text-sm text-gray-600">{message}</p>
      <button
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b]"
      >
        Retry
      </button>
    </div>
  );
}

export function WatchlistPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectedPerson | null>(null);
  const [page, setPage] = useState(1);

  const search = useDebounced(query.trim());
  const searching = search.length >= 2;

  /* Header counters. */
  const summaryQuery = useQuery((signal) => verification.watchlistSummary(signal), []);
  const summary = summaryQuery.data;

  /* The registry search — the API ranks an exact UIN and an exact name first. */
  const peopleQuery = useQuery(
    (signal) => registry.persons({ search, page, per_page: 50 }, signal),
    [search, page],
    { enabled: searching },
  );

  /* Active notices matching the same search, so a result row can be flagged. */
  const flaggedQuery = useQuery(
    (signal) => verification.watchlist({ search, status: "active", per_page: 100 }, signal),
    [search],
    { enabled: searching },
  );

  /* Before searching: the most recent active notices. */
  const noticesQuery = useQuery(
    (signal) => verification.watchlist({ status: "active", per_page: 8 }, signal),
    [],
    { enabled: !searching },
  );

  const flagged = useMemo(() => {
    const map: Record<string, WatchlistEntry> = {};
    for (const entry of flaggedQuery.data?.data ?? []) map[entry.uin] = entry;
    return map;
  }, [flaggedQuery.data]);

  const results = peopleQuery.data?.data ?? [];
  const total = peopleQuery.data?.meta.total ?? 0;
  const notices = noticesQuery.data?.data ?? [];

  if (selected) {
    return (
      <div className="max-w-screen-2xl mx-auto space-y-4">
        <button
          onClick={() => setSelected(null)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#3752AE] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Back to search
        </button>
        <PersonRecord uin={selected.uin} showWatchlist />
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
        <Kpi icon={ShieldAlert} label="Active notices" value={summary?.active ?? 0} sub={summaryQuery.error ? summaryQuery.error.message : "Currently enforceable"} tone="#B91C1C" />
        <Kpi icon={TriangleAlert} label="High risk" value={summary?.high_risk ?? 0} sub="Notify authority before processing" tone="#B45309" />
        <Kpi icon={BadgeCheck} label="Cleared" value={summary?.cleared ?? 0} sub="Notice lifted" tone="#047857" />
        <Kpi icon={ScanSearch} label="Total on file" value={summary?.total ?? 0} sub="Across all categories" tone="#3752AE" />
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 focus-within:border-[#3752AE]">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Type a name, UIN, family book number, or village…"
            className="flex-1 bg-transparent outline-none text-base text-gray-800 placeholder:text-gray-400"
          />
          {query && (
            <button onClick={() => { setQuery(""); setPage(1); }} className="text-sm text-gray-400 hover:text-gray-600">
              Clear
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          People with an active notice are listed first. Minimum two characters.
        </p>
      </div>

      {/* Results, or the active-notice shortlist before searching */}
      {searching ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">
              {total.toLocaleString()} result{total !== 1 ? "s" : ""} for “{search}”
            </h2>
          </div>
          {peopleQuery.error ? (
            <Retry message={peopleQuery.error.message} onRetry={peopleQuery.refetch} />
          ) : peopleQuery.loading ? (
            <p className="px-5 py-16 text-center text-sm text-gray-400">Searching the register…</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {results.map((p) => {
                const entry = flagged[p.uin];
                const isFlagged = entry?.status === "active";
                const name = text(p.name);
                const cat = entry ? categoryMeta(entry.category) : null;
                return (
                  <button
                    key={p.id ?? p.uin}
                    onClick={() => setSelected({ uin: p.uin, name })}
                    className={`w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50/60 ${
                      isFlagged ? "bg-red-50/40" : ""
                    }`}
                  >
                    <span
                      className={`w-10 h-10 rounded-full text-xs font-semibold flex items-center justify-center flex-shrink-0 ${
                        isFlagged ? "bg-red-100 text-red-700" : "bg-[#3752AE]/10 text-[#3752AE]"
                      }`}
                    >
                      {name.split(" ").map((s) => s[0]).join("").slice(0, 2)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-gray-800">{name}</p>
                        {isFlagged && cat && <Chip label={cat.label} color={cat.color} bg={cat.bg} />}
                      </div>
                      <p className="text-xs text-gray-400 font-mono">{p.uin}</p>
                    </div>
                    <div className="hidden sm:block text-right flex-shrink-0">
                      <p className="text-sm text-gray-600">{p.age} years · {p.gender === "male" ? "Male" : "Female"}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1 justify-end">
                        <MapPin className="w-3 h-3" /> {p.jurisdiction?.village_name ?? "—"}, {p.jurisdiction?.province_name ?? "—"}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </button>
                );
              })}
              {results.length === 0 && (
                <p className="px-5 py-16 text-center text-sm text-gray-400">
                  No person in the registry matches “{search}”.
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">Recent active notices</h2>
            <p className="text-sm text-gray-400">Open one directly, or search above for any citizen</p>
          </div>
          {noticesQuery.error ? (
            <Retry message={noticesQuery.error.message} onRetry={noticesQuery.refetch} />
          ) : noticesQuery.loading ? (
            <p className="px-5 py-16 text-center text-sm text-gray-400">Loading notices…</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {notices.map((e) => {
                const cat = categoryMeta(e.category);
                const risk = riskMeta(e.risk);
                return (
                  <button
                    key={e.id}
                    onClick={() => setSelected({ uin: e.uin, name: e.name })}
                    className="w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50/60"
                  >
                    <span className="w-10 h-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center flex-shrink-0">
                      <ShieldAlert className="w-5 h-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-gray-800">{e.name || e.uin}</p>
                        <Chip label={cat.label} color={cat.color} bg={cat.bg} />
                        <Chip label={risk.label} color={risk.color} bg={risk.bg} />
                      </div>
                      <p className="text-xs text-gray-400">
                        {e.offence} · {e.notice_no} · issued {e.issued_at}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </button>
                );
              })}
              {notices.length === 0 && (
                <p className="px-5 py-16 text-center text-sm text-gray-400">
                  No active watchlist notices in your jurisdiction.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
