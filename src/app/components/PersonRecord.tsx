import { useMemo } from "react";
import { FileText, CalendarClock, Users, BadgeCheck, ShieldAlert, TriangleAlert, Printer } from "lucide-react";
import {
  WATCH_BY_UIN, WATCH_CATEGORY_META, WATCH_STATUS_META, RISK_META, DOC_STATUS_META,
  documentsFor, eventsFor,
} from "../data/watchlist";
import { HOUSEHOLD_BY_NO, type Citizen } from "../data/population";
import photo3x4 from "../../imports/photo3x4.png";

/*
 * One citizen's full record: identity, documents on file, civil registration
 * history and household. Shared by Watchlist Search and Population & Households
 * so both screens show the same thing.
 *
 * `showWatchlist` adds the law-enforcement banner and the notice detail. The
 * population screen leaves it off — that is a registry view, not a screening one.
 */
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
  person,
  showWatchlist = false,
}: {
  person: Citizen;
  showWatchlist?: boolean;
}) {
  const entry = WATCH_BY_UIN[person.uin];
  const docs = useMemo(() => documentsFor(person), [person]);
  const events = useMemo(() => eventsFor(person), [person]);
  const household = HOUSEHOLD_BY_NO[person.householdNo];

  const cat = entry ? WATCH_CATEGORY_META[entry.category] : null;
  const risk = entry ? RISK_META[entry.risk] : null;

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
        ))}

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
            <Row
              label="Registry status"
              value={person.status === "active" ? "Active" : person.status === "deceased" ? "Deceased" : "Moved out"}
            />
            <Row label="Address" value={`${person.village}, ${person.district}, ${person.province}`} />
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
                  const s = DOC_STATUS_META[d.status];
                  return (
                    <tr key={d.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-2 text-gray-800 whitespace-nowrap">
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
                  <p className="text-xs text-gray-400">
                    {e.date} · {e.detail}
                  </p>
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
              const flagged = showWatchlist && WATCH_BY_UIN[m.uin]?.status === "active";
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
                    <p className="text-xs text-gray-400">
                      {m.relation} · {m.age} years
                    </p>
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

      {/* Notice detail — screening only */}
      {showWatchlist && entry && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-800">Watchlist notice {entry.id}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 mt-2">
            <Row label="Category" value={WATCH_CATEGORY_META[entry.category].label} />
            <Row label="Offence / reason" value={entry.offence} />
            <Row label="Issuing authority" value={entry.authority} />
            <Row label="Issued" value={entry.issued} />
            <Row label="Valid until" value={entry.expires} />
            <Row
              label="Status"
              value={`${WATCH_STATUS_META[entry.status].label} · ${RISK_META[entry.risk].label}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
