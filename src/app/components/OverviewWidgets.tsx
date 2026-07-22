import { AlertTriangle, Activity } from "lucide-react";
import { formatLak } from "../serviceConfig";
import { STATUS_ORDER, STATUS_META, type AppStatus } from "../data/mockData";

/* Per-service figures come from the shared stats module, so By service and the
 * SLA tracker show exactly what Reports shows. */
export type { ServiceStat as ServiceRow } from "../data/serviceStats";
import type { ServiceStat as ServiceRow } from "../data/serviceStats";

const pct = (n: number, total: number) => (total > 0 ? (n / total) * 100 : 0);

/* ── 1. Per-service panel ── */
export function PerServicePanel({ services }: { services: ServiceRow[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold text-gray-800">By service</h2>
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Issued</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3752AE]" /> In progress</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Rejected</span>
        </div>
      </div>
      <div className="divide-y divide-gray-50">
        {services.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.id} className="flex items-center gap-3 py-3">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${s.color}1A` }}>
                <Icon className="w-4 h-4" style={{ color: s.color } as React.CSSProperties} />
              </span>
              <div className="w-24 flex-shrink-0 hidden sm:block text-sm text-gray-700 truncate">{s.short}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3 text-xs mb-1">
                  <span className="text-gray-500 flex-shrink-0">{s.volume.toLocaleString()} apps</span>
                  <span className="flex items-center gap-2.5 text-gray-600 tabular-nums">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {s.issued.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#3752AE]" />
                      {s.inProgress.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      {s.rejected.toLocaleString()}
                    </span>
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden flex bg-gray-100">
                  <div style={{ width: `${pct(s.issued, s.volume)}%`, backgroundColor: "#10B981" }} />
                  <div style={{ width: `${pct(s.inProgress, s.volume)}%`, backgroundColor: "#3752AE" }} />
                  <div style={{ width: `${pct(s.rejected, s.volume)}%`, backgroundColor: "#EF4444" }} />
                </div>
              </div>
              <div className="w-24 flex-shrink-0 text-right text-sm font-medium text-gray-700">{s.collected > 0 ? formatLak(s.collected) : "Free"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── 2. SLA & overdue tracker ──
 * Bands explain the red/amber/green: a service is On target at 90%+ of cases
 * closed inside the target, At risk from 85%, and Breaching below that. */
const SLA_BANDS = [
  { min: 90, label: "On target", color: "#10B981", text: "text-emerald-600" },
  { min: 85, label: "At risk", color: "#F59E0B", text: "text-amber-600" },
  { min: 0, label: "Breaching", color: "#EF4444", text: "text-red-500" },
];
function slaBand(pct: number) {
  return SLA_BANDS.find((b) => pct >= b.min) ?? SLA_BANDS[SLA_BANDS.length - 1];
}

export function SlaTracker({ services }: { services: ServiceRow[] }) {
  /* One question only: how many cases missed their target, and where. Every
   * figure comes from the same per-service percentages shown in the rows, so
   * the headline and the bars can never disagree. */
  const rows = services.map((s) => ({ ...s, band: slaBand(s.sla) }));
  const volume = rows.reduce((sum, s) => sum + s.closed, 0);
  const overdue = rows.reduce((sum, s) => sum + s.overdue, 0);
  const share = volume > 0 ? Math.round((overdue / volume) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <h2 className="text-base font-semibold text-gray-800">SLA &amp; overdue</h2>
      <p className="text-xs text-gray-400 mb-3">Cases closed past their service target</p>

      <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 mb-3">
        <div className="flex items-center gap-1.5 text-amber-600 text-xs font-medium">
          <AlertTriangle className="w-3.5 h-3.5" /> Overdue
        </div>
        <p className="text-2xl font-bold text-gray-800 mt-1">
          {overdue.toLocaleString()}
          <span className="text-sm font-medium text-gray-400"> cases</span>
        </p>
        <p className="text-[11px] text-gray-400">
          {share}% of {volume.toLocaleString()} closed cases
        </p>
      </div>

      {/* What the colours mean */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-[11px] text-gray-500">
        {SLA_BANDS.map((b, i) => (
          <span key={b.label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />
            {b.label} {i === 0 ? `≥ ${b.min}%` : i === SLA_BANDS.length - 1 ? `< ${SLA_BANDS[i - 1].min}%` : `${b.min}–${SLA_BANDS[i - 1].min - 1}%`}
          </span>
        ))}
      </div>

      <div className="space-y-2.5">
        {rows.map((s) => (
          <div key={s.id}>
            <div className="flex items-center justify-between gap-2 text-xs mb-1">
              <span className="text-gray-600 truncate">{s.short}</span>
              <span className="flex items-center gap-2 flex-shrink-0 tabular-nums">
                <span className={s.band.text} title={`${s.band.label} — ${s.sla}% closed within the ${s.target}-day target`}>
                  {s.sla}%
                </span>
                <span className="text-gray-400">{s.overdue.toLocaleString()} overdue</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${s.sla}%`, backgroundColor: s.band.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 3. Pipeline funnel ──
 * Every status from the Applications filter, in the same order and counted from
 * the same rows. Exception states are marked so they don't read as funnel steps. */
const EXCEPTION_STATUSES = new Set(["returned", "rejected", "revoked"]);
const SHORT_LABEL: Record<string, string> = {
  returned: "Returned",
  registered: "Registered",
  revoked: "Revoked",
};

export function PipelineFunnel({ counts }: { counts: Record<AppStatus, number> }) {
  const stages = STATUS_ORDER.map((s) => ({ status: s, count: counts[s] ?? 0 }));
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm h-full flex flex-col">
      <h2 className="text-base font-semibold text-gray-800">Case pipeline</h2>
      <p className="text-sm text-gray-400 mb-3">All nine case statuses · exceptions marked ⤴</p>
      <div className="flex-1 flex flex-col justify-between gap-1.5">
        {stages.map((s) => {
          const meta = STATUS_META[s.status];
          const exception = EXCEPTION_STATUSES.has(s.status);
          return (
            <div key={s.status} className="flex items-center gap-2.5">
              <span
                className="w-[104px] flex-shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
                style={{ color: meta.color, backgroundColor: meta.bg }}
                title={`${meta.label} — ${meta.meaning}`}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: meta.color }} />
                <span className="truncate">{SHORT_LABEL[s.status] ?? meta.label}</span>
                {exception && <span className="flex-shrink-0 opacity-60">⤴</span>}
              </span>
              <div className="flex-1 h-5 rounded-lg overflow-hidden" style={{ backgroundColor: meta.bg }}>
                <div
                  className="h-full rounded-lg flex items-center justify-end px-2 text-[11px] font-medium text-white"
                  style={{ width: `${Math.max(14, (s.count / max) * 100)}%`, backgroundColor: meta.color }}
                >
                  {s.count.toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── 4. Recent activity feed ── */
const ACTIVITY: { status: keyof typeof STATUS_META; text: string; ref: string; by: string; time: string }[] = [
  { status: "issued", text: "Certificate issued", ref: "RC-2026-004790", by: "Somsy T.", time: "2m ago" },
  { status: "registered", text: "Registered & e-signed", ref: "DD-2026-000877", by: "Khamla P.", time: "18m ago" },
  { status: "returned", text: "Returned for correction", ref: "MC-2026-001120", by: "Vilai S.", time: "41m ago" },
  { status: "certified", text: "Certified at village", ref: "DV-2026-000231", by: "Vilai S.", time: "1h ago" },
  { status: "submitted", text: "New submission", ref: "RC-2026-004821", by: "Village office", time: "2h ago" },
  { status: "rejected", text: "Rejected with reason", ref: "BD-2026-002288", by: "Khamla P.", time: "3h ago" },
];

export function ActivityFeed() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm h-full">
      <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <Activity className="w-4 h-4 text-gray-400" /> Recent activity
      </h2>
      <ol className="space-y-3.5">
        {ACTIVITY.map((a, i) => {
          const meta = STATUS_META[a.status];
          return (
            <li key={i} className="flex items-start gap-3">
              <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: meta.color }} />
              <div className="min-w-0">
                <p className="text-sm text-gray-700">
                  {a.text} <span className="font-mono text-xs text-gray-500">{a.ref}</span>
                </p>
                <p className="text-xs text-gray-400">{a.by} · {a.time}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
