import { Clock, AlertTriangle, Activity } from "lucide-react";
import { SERVICES, formatLak } from "../serviceConfig";
import { PIPELINE_ORDER, STATUS_META } from "../data/mockData";

/* ── Per-service derivation (reacts to total + seed from the date filter) ── */
const SERVICE_WEIGHT: Record<string, number> = {
  resident: 0.38,
  birth: 0.23,
  death: 0.11,
  marriage: 0.14,
  divorce: 0.04,
  "family-book": 0.1,
};

export interface ServiceRow {
  id: string;
  short: string;
  color: string;
  icon: (typeof SERVICES)[number]["icon"];
  volume: number;
  issued: number;
  progress: number;
  rejected: number;
  sla: number;
  feesLak: number;
}

export function deriveServices(total: number, seed: number): ServiceRow[] {
  return SERVICES.map((s, i) => {
    const sd = (seed * (i + 3)) >>> 0;
    const volume = Math.max(20, Math.round(total * (SERVICE_WEIGHT[s.id] ?? 0.1)));
    const issued = 60 + (sd % 12);
    const rejected = 3 + (sd % 5);
    return {
      id: s.id,
      short: s.short,
      color: s.color,
      icon: s.icon,
      volume,
      issued,
      progress: 100 - issued - rejected,
      rejected,
      sla: 82 + (sd % 16),
      feesLak: volume * s.fee,
    };
  });
}

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
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-500">{s.volume.toLocaleString()} apps</span>
                  <span className="text-gray-400">SLA {s.sla}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden flex bg-gray-100">
                  <div style={{ width: `${s.issued}%`, backgroundColor: "#10B981" }} />
                  <div style={{ width: `${s.progress}%`, backgroundColor: "#3752AE" }} />
                  <div style={{ width: `${s.rejected}%`, backgroundColor: "#EF4444" }} />
                </div>
              </div>
              <div className="w-24 flex-shrink-0 text-right text-sm font-medium text-gray-700">{formatLak(s.feesLak)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── 2. SLA & overdue tracker ── */
export function SlaTracker({ services, total, seed }: { services: ServiceRow[]; total: number; seed: number }) {
  const overdue = Math.max(3, Math.round(total * 0.05));
  const avgDays = (1.2 + (seed % 20) / 10).toFixed(1);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <h2 className="text-base font-semibold text-gray-800 mb-4">SLA &amp; overdue</h2>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
          <div className="flex items-center gap-1.5 text-amber-600 text-xs font-medium">
            <AlertTriangle className="w-3.5 h-3.5" /> Overdue
          </div>
          <p className="text-2xl font-bold text-gray-800 mt-1">{overdue.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-[#3752AE]/5 border border-[#3752AE]/10 p-3">
          <div className="flex items-center gap-1.5 text-[#3752AE] text-xs font-medium">
            <Clock className="w-3.5 h-3.5" /> Avg. time
          </div>
          <p className="text-2xl font-bold text-gray-800 mt-1">
            {avgDays}<span className="text-sm font-medium text-gray-400"> days</span>
          </p>
        </div>
      </div>
      <div className="space-y-2.5">
        {services.map((s) => (
          <div key={s.id}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-600">{s.short}</span>
              <span className={s.sla >= 90 ? "text-emerald-600" : s.sla >= 85 ? "text-amber-600" : "text-red-500"}>{s.sla}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${s.sla}%`, backgroundColor: s.sla >= 90 ? "#10B981" : s.sla >= 85 ? "#F59E0B" : "#EF4444" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 3. Pipeline funnel ── */
const FUNNEL_FACTOR = [0.3, 0.26, 0.22, 0.18, 0.14, 0.11];
export function PipelineFunnel({ total, seed }: { total: number; seed: number }) {
  const stages = PIPELINE_ORDER.map((s, i) => {
    const sd = (seed * (i + 5)) >>> 0;
    const jitter = 0.9 + (sd % 20) / 100;
    return { status: s, count: Math.max(5, Math.round(total * FUNNEL_FACTOR[i] * jitter)) };
  });
  const max = Math.max(...stages.map((s) => s.count));
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm h-full flex flex-col">
      <h2 className="text-base font-semibold text-gray-800">Case pipeline</h2>
      <p className="text-sm text-gray-400 mb-4">Cases at each lifecycle stage</p>
      <div className="flex-1 flex flex-col justify-between gap-2.5">
        {stages.map((s) => {
          const meta = STATUS_META[s.status];
          return (
            <div key={s.status} className="flex items-center gap-3">
              <div className="w-28 flex-shrink-0 text-sm text-gray-600 truncate">{meta.label}</div>
              <div className="flex-1 h-6 rounded-lg bg-gray-50 overflow-hidden">
                <div
                  className="h-full rounded-lg flex items-center justify-end px-2 text-[11px] font-medium text-white"
                  style={{ width: `${Math.max(12, (s.count / max) * 100)}%`, backgroundColor: meta.color }}
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
