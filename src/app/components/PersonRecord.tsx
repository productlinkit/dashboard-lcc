import { FileText, CalendarClock, Users, BadgeCheck, ShieldAlert, TriangleAlert, Printer } from "lucide-react";
import { registry, verification } from "../api/endpoints";
import { useMutation, useQuery } from "../api/hooks";
import { text, type HouseholdMember, type PersonProfile, type WatchlistEntry } from "../api/types";
import { maritalLabel } from "../data/marital";
import photo3x4 from "../../imports/photo3x4.png";

/*
 * One citizen's full record: identity, documents on file, civil registration
 * history and household — all of it from registry.person(uin), which returns the
 * person, their household, documents and life events in a single response.
 *
 * `showWatchlist` adds the law-enforcement banner and the notice detail, and runs
 * the screening check. The population screen leaves it off — that is a registry
 * view, not a screening one.
 */

export const WATCH_CATEGORY_META: Record<string, { label: string; color: string; bg: string }> = {
  wanted: { label: "Wanted person", color: "#B91C1C", bg: "#FEE2E2" },
  "travel-ban": { label: "Travel ban", color: "#B45309", bg: "#FEF3C7" },
  summons: { label: "Court summons", color: "#6D28D9", bg: "#EDE9FE" },
  missing: { label: "Missing person", color: "#1D4ED8", bg: "#DBEAFE" },
};

export const WATCH_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "Active", color: "#B91C1C", bg: "#FEE2E2" },
  cleared: { label: "Cleared", color: "#047857", bg: "#D1FAE5" },
  expired: { label: "Expired", color: "#44403C", bg: "#E7E5E4" },
};

export const RISK_META: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: "High risk", color: "#B91C1C", bg: "#FEE2E2" },
  medium: { label: "Medium risk", color: "#B45309", bg: "#FEF3C7" },
  low: { label: "Low risk", color: "#475569", bg: "#F1F5F9" },
};

export const DOC_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  valid: { label: "Valid", color: "#047857", bg: "#D1FAE5" },
  expired: { label: "Expired", color: "#B45309", bg: "#FEF3C7" },
  revoked: { label: "Revoked", color: "#B91C1C", bg: "#FEE2E2" },
  missing: { label: "Not on file", color: "#94A3B8", bg: "#F1F5F9" },
};

const FALLBACK_META = { label: "—", color: "#475569", bg: "#F1F5F9" };
export const categoryMeta = (v?: string) => WATCH_CATEGORY_META[v ?? ""] ?? { ...FALLBACK_META, label: v ?? "—" };
export const riskMeta = (v?: string) => RISK_META[v ?? ""] ?? { ...FALLBACK_META, label: v ?? "—" };
export const watchStatusMeta = (v?: string) => WATCH_STATUS_META[v ?? ""] ?? { ...FALLBACK_META, label: v ?? "—" };
const docStatusMeta = (v?: string) => DOC_STATUS_META[v ?? ""] ?? { ...FALLBACK_META, label: v ?? "—" };

/** The API sends the household with its members; the shared type stops at the summary. */
type ProfileHousehold = NonNullable<PersonProfile["household"]> & { members?: HouseholdMember[] };

/** The screening endpoint answers with a verdict, not a bare notice. */
interface ScreeningResult {
  uin?: string;
  flagged?: boolean;
  notice?: WatchlistEntry | null;
}

function noticeOf(result: WatchlistEntry | ScreeningResult | null | undefined): WatchlistEntry | null {
  if (!result) return null;
  if ("notice" in result || "flagged" in result) return (result as ScreeningResult).notice ?? null;
  return result as WatchlistEntry;
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

const REGISTRY_STATUS: Record<string, string> = {
  active: "Active",
  deceased: "Deceased",
  moved: "Moved out",
};

export function Chip({ label, color, bg }: { label: string; color: string; bg: string }) {
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2 border-b border-gray-50 last:border-0">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm text-gray-800 mt-0.5">{value}</p>
    </div>
  );
}

export function PersonRecord({
  uin,
  showWatchlist = false,
}: {
  uin: string;
  showWatchlist?: boolean;
}) {
  const { data: profile, loading, error, refetch } = useQuery(
    (signal) => registry.person(uin, signal),
    [uin],
  );

  // The screening verdict is only meaningful on the watchlist screen.
  const screening = useQuery(
    (signal) => verification.checkWatchlist(uin, signal),
    [uin],
    { enabled: showWatchlist },
  );

  // Lifting a notice is the one write this record offers; the screening banner
  // and the notice card both re-read afterwards.
  const clearNotice = useMutation((v: { id: string; note: string }) =>
    verification.clearWatchlist(v.id, { note: v.note }),
  );

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-sm text-gray-400">
        Loading record…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
        <p className="text-sm text-gray-600">{error.message}</p>
        <button
          onClick={refetch}
          className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-sm text-gray-400">
        No registry record found for {uin}.
      </div>
    );
  }

  const person = profile.person;
  const docs = profile.documents ?? [];
  const events = profile.life_events ?? [];
  const household = profile.household as ProfileHousehold | undefined;
  const members = household?.members ?? [];

  const entry = noticeOf(screening.data) ?? noticeOf(profile.watchlist);
  const cat = entry ? categoryMeta(entry.category) : null;
  const risk = entry ? riskMeta(entry.risk) : null;

  const j = person.jurisdiction ?? {};
  const address = [j.village_name, j.district_name, j.province_name].filter(Boolean).join(", ") || "—";
  const personName = text(person.name);

  return (
    <div className="space-y-4">
      {/* Watchlist banner — screening only */}
      {showWatchlist &&
        (entry && entry.status === "active" ? (
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
                  {entry.offence} · notice {entry.notice_no}
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
              <p className="text-base font-bold text-emerald-800">
                {screening.loading ? "Screening…" : "No active notice"}
              </p>
              <p className="text-sm text-emerald-700/80 mt-0.5">
                {entry
                  ? `A ${categoryMeta(entry.category).label.toLowerCase()} notice exists but is ${watchStatusMeta(entry.status).label.toLowerCase()} (${entry.notice_no}).`
                  : "This person does not appear on any watchlist. Services may be processed normally."}
              </p>
            </div>
          </div>
        ))}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Identity */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start gap-4">
            <img
              src={photo3x4}
              alt={personName}
              className="w-24 h-32 object-cover rounded-xl border border-gray-100 flex-shrink-0"
            />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-800 leading-tight">{personName}</h2>
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
            <Row label="Date of birth" value={person.date_of_birth ?? "—"} />
            <Row label="Relation in household" value={person.relation || "—"} />
            <Row label="Marital status" value={maritalLabel(person.marital_status)} />
            <Row label="Registry status" value={REGISTRY_STATUS[person.status] ?? person.status} />
            <Row label="Address" value={address} />
          </div>
        </div>

        {/* Documents */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Documents on file</h2>
              <p className="text-sm text-gray-400">{docs.length} records held across registries</p>
            </div>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 flex-shrink-0"
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
                  const s = docStatusMeta(d.status);
                  return (
                    <tr key={d.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-2 text-gray-800 whitespace-nowrap">
                          <FileText className="w-4 h-4 text-gray-400" />
                          {text(d.title) || d.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{d.number}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{d.issued_at ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{d.expires_at ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500">{d.authority}</td>
                      <td className="pl-4 pr-5 py-3">
                        <Chip label={s.label} color={s.color} bg={s.bg} />
                      </td>
                    </tr>
                  );
                })}
                {docs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-400">
                      No documents on file for this person.
                    </td>
                  </tr>
                )}
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
              <div key={e.id ?? `${e.occurred_at}-${i}`} className="flex gap-3">
                <div className="flex flex-col items-center flex-shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#3752AE] mt-1.5" />
                  {i < events.length - 1 && <span className="w-px flex-1 bg-gray-100 my-1" />}
                </div>
                <div className="pb-1">
                  <p className="text-sm font-medium text-gray-800">{e.title}</p>
                  <p className="text-xs text-gray-400">
                    {e.occurred_at} · {e.detail}
                  </p>
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <p className="text-sm text-gray-400">No civil registration events recorded.</p>
            )}
          </div>
        </div>

        {/* Household */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" /> Household members
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {person.household_no || household?.household_no || "—"} ·{" "}
            {household?.total_members ?? members.length} members
          </p>
          <div className="mt-3 divide-y divide-gray-50">
            {members.map((m) => {
              const age = ageOf(m);
              return (
                <div key={m.id ?? m.uin} className="py-2.5 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                    {m.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${m.uin === person.uin ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                      {m.name}
                      {m.uin === person.uin && <span className="text-gray-400 font-normal"> · this person</span>}
                    </p>
                    <p className="text-xs text-gray-400">
                      {m.relation}
                      {age !== undefined ? ` · ${age} years` : ""}
                    </p>
                  </div>
                  {showWatchlist && m.uin === person.uin && entry?.status === "active" && (
                    <span title="On the watchlist" className="text-red-600 flex-shrink-0">
                      <TriangleAlert className="w-4 h-4" />
                    </span>
                  )}
                </div>
              );
            })}
            {members.length === 0 && (
              <p className="py-2.5 text-sm text-gray-400">This person is not attached to a family book.</p>
            )}
          </div>
        </div>
      </div>

      {/* Notice detail — screening only */}
      {showWatchlist && entry && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-800">Watchlist notice {entry.notice_no}</h2>
            {entry.status === "active" && (
              <button
                onClick={() =>
                  clearNotice
                    .run({ id: entry.id, note: `Cleared from the registry record of ${person.uin}.` })
                    .then(() => {
                      screening.refetch();
                      refetch();
                    })
                    .catch(() => {})
                }
                disabled={clearNotice.pending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-60 flex-shrink-0"
              >
                <BadgeCheck className="w-3.5 h-3.5" /> {clearNotice.pending ? "Clearing…" : "Clear notice"}
              </button>
            )}
          </div>
          {clearNotice.error && <p className="text-xs text-red-600 mt-1">{clearNotice.error.message}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 mt-2">
            <Row label="Category" value={categoryMeta(entry.category).label} />
            <Row label="Offence / reason" value={entry.offence} />
            <Row label="Issuing authority" value={entry.authority} />
            <Row label="Issued" value={entry.issued_at} />
            <Row label="Valid until" value={entry.expires_at ?? "—"} />
            <Row
              label="Status"
              value={`${watchStatusMeta(entry.status).label} · ${riskMeta(entry.risk).label}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
