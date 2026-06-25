import {
  FileText,
  Clock,
  CheckCircle2,
  Banknote,
  ArrowUpRight,
  ArrowDownRight,
  type LucideIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  KPI,
  WEEKLY_VOLUME,
  SERVICE_SHARE,
  APPLICATIONS,
} from "../data/mockData";
import { SERVICES, SERVICE_BY_ID, formatLak } from "../serviceConfig";
import { StatusBadge } from "../components/StatusBadge";

function Kpi({
  icon: Icon,
  label,
  value,
  delta,
  up,
  tint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  delta: string;
  up: boolean;
  tint: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${tint}1A` }}
        >
          <Icon className="w-5 h-5" style={{ color: tint } as React.CSSProperties} />
        </div>
        <span
          className={`flex items-center gap-1 text-xs font-medium ${
            up ? "text-emerald-600" : "text-red-500"
          }`}
        >
          {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
          {delta}
        </span>
      </div>
      <p className="mt-4 text-2xl font-bold text-gray-800">{value}</p>
      <p className="text-sm text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

export function OverviewPage({ onOpenCase }: { onOpenCase: (id: string) => void }) {
  const maxShare = Math.max(...Object.values(SERVICE_SHARE));
  const recent = APPLICATIONS.slice(0, 6);

  const serviceBars = SERVICES.map((s) => ({
    name: s.short,
    value: SERVICE_SHARE[s.id] ?? 0,
    fill: s.color,
  }));

  return (
    <div className="max-w-screen-2xl mx-auto space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi icon={FileText} label="Total applications" value={KPI.totalApplications.toLocaleString()} delta="8.2%" up tint="#344EAD" />
        <Kpi icon={Clock} label="Awaiting action" value={KPI.awaitingAction.toLocaleString()} delta="3.1%" up={false} tint="#F59E0B" />
        <Kpi icon={CheckCircle2} label="Issued this month" value={KPI.issuedThisMonth.toLocaleString()} delta="12.5%" up tint="#10B981" />
        <Kpi icon={Banknote} label="Fees collected" value={formatLak(KPI.revenueLak)} delta="6.4%" up tint="#0EA5E9" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Volume area chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Application volume</h2>
              <p className="text-sm text-gray-400">Submitted vs. approved · last 7 days</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-gray-500">
                <span className="w-2.5 h-2.5 rounded-full bg-[#344EAD]" /> Submitted
              </span>
              <span className="flex items-center gap-1.5 text-gray-500">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" /> Issued
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={WEEKLY_VOLUME} margin={{ left: -20, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="gSub" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#344EAD" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#344EAD" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gApp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9CA3AF" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9CA3AF" }} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #EEF0F4", fontSize: 12 }} />
              <Area type="monotone" dataKey="applications" stroke="#344EAD" strokeWidth={2} fill="url(#gSub)" />
              <Area type="monotone" dataKey="issued" stroke="#10B981" strokeWidth={2} fill="url(#gApp)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Service mix bar chart */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800">By service</h2>
          <p className="text-sm text-gray-400 mb-4">This month</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={serviceBars} layout="vertical" margin={{ left: 10, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                width={70}
                tick={{ fontSize: 12, fill: "#6B7280" }}
              />
              <Tooltip cursor={{ fill: "#F8FAFC" }} contentStyle={{ borderRadius: 12, border: "1px solid #EEF0F4", fontSize: 12 }} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16}>
                {serviceBars.map((b) => (
                  <Cell key={b.name} fill={b.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent applications + service queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">Recent applications</h2>
            <span className="text-xs text-gray-400">Last submitted</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="px-5 py-3 font-medium">Ref. No.</th>
                  <th className="px-5 py-3 font-medium">Applicant</th>
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => {
                  const svc = SERVICE_BY_ID[a.serviceId];
                  return (
                    <tr
                      key={a.id}
                      onClick={() => onOpenCase(a.id)}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 cursor-pointer"
                    >
                      <td className="px-5 py-3 font-mono text-xs text-gray-500">{a.id}</td>
                      <td className="px-5 py-3 text-gray-800">{a.applicant}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-2 text-gray-600">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: svc?.color }}
                          />
                          {svc?.short}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={a.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Service queue */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Service queue</h2>
          <div className="space-y-4">
            {SERVICES.map((s) => {
              const Icon = s.icon;
              const count = SERVICE_SHARE[s.id] ?? 0;
              return (
                <div key={s.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-2 text-sm text-gray-700">
                      <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${s.color}1A` }}
                      >
                        <Icon className="w-4 h-4" style={{ color: s.color } as React.CSSProperties} />
                      </span>
                      {s.short}
                    </span>
                    <span className="text-sm font-medium text-gray-800">{count.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(count / maxShare) * 100}%`, backgroundColor: s.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
