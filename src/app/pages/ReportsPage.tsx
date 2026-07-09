import { useMemo, useState } from "react";
import { Download, Banknote, Wallet, AlertTriangle, Percent, FileCheck2, RotateCcw, Ban, ScanLine } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { DateRangeFilter, ALL_TIME, type DateRange } from "../components/DateRangeFilter";
import { deriveServices } from "../components/OverviewWidgets";
import { rangeBase, dayLabels } from "../data/derive";
import { PROVINCE_STATS } from "../data/mockData";
import { SERVICES, SERVICE_BY_ID, formatLak } from "../serviceConfig";

const OFFICERS = ["Khamla P.", "Vilai S.", "Somsy T.", "Bounma K.", "Latda S."];
const REJECT_REASONS = [
  "Missing document",
  "Mismatched ID / eID",
  "Incomplete address",
  "Ineligible / not qualified",
  "Duplicate record",
  "Illegible attachment",
];
const PAY_COLORS = ["#3752AE", "#10B981", "#F59E0B"];

function buildReport(range: DateRange) {
  const { total, seed, days } = rangeBase(range);
  const n = Math.min(Math.max(days, 5), 14);
  const labels = dayLabels(range, n);

  const services = deriveServices(total, seed).map((s, i) => {
    const sd = (seed * (i + 11)) >>> 0;
    const rate = 0.78 + (sd % 18) / 100; // collection rate
    const revenue = s.feesLak;
    const collected = Math.round(revenue * rate);
    const paidCount = revenue > 0 ? Math.round(s.volume * rate) : 0;
    const avgDays = +(1.2 + (sd % 45) / 10).toFixed(1);
    const overdue = Math.max(0, Math.round((s.volume * (100 - s.sla)) / 100));
    return {
      ...s,
      rate,
      revenue,
      collected,
      outstanding: revenue - collected,
      paidCount,
      unpaidCount: revenue > 0 ? s.volume - paidCount : 0,
      avgDays,
      overdue,
    };
  });

  const revenue = services.reduce((a, s) => a + s.revenue, 0);
  const collected = services.reduce((a, s) => a + s.collected, 0);
  const outstanding = revenue - collected;
  const collectionRate = revenue ? Math.round((collected / revenue) * 100) : 0;

  const daily = labels.map((day, i) => {
    const sd = (seed * (i + 7)) >>> 0;
    const j = 0.7 + (sd % 60) / 100;
    return {
      day,
      collected: Math.round((collected / n) * j),
      outstanding: Math.round((outstanding / n) * j * 0.9),
      requests: Math.max(5, Math.round((total / n) * j)),
    };
  });

  const digital = 55 + (seed % 20);
  const cash = 100 - digital - 6;
  const payMethods = [
    { name: "QR / digital", value: digital },
    { name: "Cash", value: cash },
    { name: "Bank transfer", value: 6 },
  ];

  const volById = Object.fromEntries(services.map((s) => [s.id, s.volume]));
  const vital = [
    { id: "birth", label: "Births", value: volById.birth ?? 0 },
    { id: "death", label: "Deaths", value: volById.death ?? 0 },
    { id: "marriage", label: "Marriages", value: volById.marriage ?? 0 },
    { id: "divorce", label: "Divorces", value: volById.divorce ?? 0 },
    { id: "resident", label: "Residence", value: volById.resident ?? 0 },
    { id: "family-book", label: "Family Book", value: volById["family-book"] ?? 0 },
  ];

  const factor = total / 4821;
  const provinces = Object.entries(PROVINCE_STATS)
    .map(([name, v]) => ({ name, value: Math.max(5, Math.round(v * factor)) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const returns = Math.round(total * 0.05);
  const rejected = Math.round(total * 0.03);
  const reasonTotal = returns + rejected;
  const reasons = REJECT_REASONS.map((r, i) => {
    const w = 10 + (((seed >> i) % 20) + 4);
    return { reason: r, weight: w };
  });
  const wSum = reasons.reduce((a, r) => a + r.weight, 0);
  const reasonRows = reasons
    .map((r) => ({ reason: r.reason, count: Math.max(1, Math.round((reasonTotal * r.weight) / wSum)) }))
    .sort((a, b) => b.count - a.count);

  const issued = Math.round(total * 0.62);
  const certs = {
    issued,
    reissued: Math.max(1, Math.round(total * 0.02)),
    revoked: Math.max(0, Math.round(total * 0.006)),
    qrScans: Math.round(total * 1.4),
  };
  const familyBook = {
    added: volById.birth ?? 0,
    removed: volById.death ?? 0,
    statusUpdates: (volById.marriage ?? 0) + (volById.divorce ?? 0) + Math.round((volById.resident ?? 0) * 0.3),
  };

  const officers = OFFICERS.map((name, i) => {
    const sd = (seed * (i + 17)) >>> 0;
    const w = 0.14 + (sd % 12) / 100;
    const processed = Math.max(4, Math.round(total * w));
    return {
      name,
      processed,
      issued: Math.round(processed * (0.55 + (sd % 20) / 100)),
      avgDays: +(1.3 + (sd % 40) / 10).toFixed(1),
    };
  });

  return {
    total,
    services,
    revenue,
    collected,
    outstanding,
    collectionRate,
    daily,
    payMethods,
    vital,
    provinces,
    returns,
    rejected,
    reasonRows,
    certs,
    familyBook,
    officers,
  };
}

type Report = ReturnType<typeof buildReport>;

function csvExport(r: Report) {
  const header = ["Service", "Applications", "Paid", "Unpaid", "Revenue (LAK)", "Collected (LAK)", "Outstanding (LAK)", "SLA %", "Avg days", "Overdue"];
  const body = r.services.map((s) => [
    SERVICE_BY_ID[s.id]?.label ?? s.id,
    s.volume,
    s.paidCount,
    s.unpaidCount,
    s.revenue,
    s.collected,
    s.outstanding,
    s.sla,
    s.avgDays,
    s.overdue,
  ]);
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header, ...body].map((row) => row.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Small presentational helpers ── */
function Kpi({ icon: Icon, label, value, tint }: { icon: typeof Banknote; label: string; value: string; tint: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${tint}1A` }}>
          <Icon className="w-5 h-5" style={{ color: tint } as React.CSSProperties} />
        </span>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-800 mt-3">{value}</p>
    </div>
  );
}

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="pt-2">
      <h2 className="text-lg font-bold text-gray-800">{children}</h2>
      {sub && <p className="text-sm text-gray-400">{sub}</p>}
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 p-5 shadow-sm ${className}`}>
      <h3 className="text-base font-semibold text-gray-800 mb-4">{title}</h3>
      {children}
    </div>
  );
}

const tooltipStyle = { borderRadius: 12, border: "1px solid #EEF0F4", fontSize: 12 };

export function ReportsPage() {
  const [dateRange, setDateRange] = useState<DateRange>(ALL_TIME);
  const r = useMemo(() => buildReport(dateRange), [dateRange]);

  return (
    <div className="max-w-screen-2xl mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Reports</h1>
          <p className="text-sm text-gray-400 mt-0.5">Financial, volume, SLA and certificate reporting.</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeFilter onChange={setDateRange} />
          <button
            onClick={() => csvExport(r)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b]"
          >
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* ── 1. Financial ── */}
      <SectionTitle sub="Revenue, collections and outstanding fees">Financial &amp; payments</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Banknote} label="Revenue (potential)" value={formatLak(r.revenue)} tint="#3752AE" />
        <Kpi icon={Wallet} label="Collected" value={formatLak(r.collected)} tint="#10B981" />
        <Kpi icon={AlertTriangle} label="Outstanding" value={formatLak(r.outstanding)} tint="#F59E0B" />
        <Kpi icon={Percent} label="Collection rate" value={`${r.collectionRate}%`} tint="#0EA5E9" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Daily revenue — collected vs outstanding" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={r.daily} margin={{ left: -8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatLak(v)} />
              <Bar dataKey="collected" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} barSize={18} />
              <Bar dataKey="outstanding" stackId="a" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Payment method">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={r.payMethods} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={72}>
                {r.payMethods.map((p, i) => (
                  <Cell key={p.name} fill={PAY_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {r.payMethods.map((p, i) => (
              <div key={p.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PAY_COLORS[i] }} /> {p.name}
                </span>
                <span className="text-gray-700 font-medium">{p.value}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card title="Revenue by service">
        <ReportTable
          head={["Service", "Apps", "Paid", "Unpaid", "Revenue", "Collected", "Outstanding"]}
          rows={r.services.map((s) => [
            <ServiceCell key="s" id={s.id} />,
            s.volume.toLocaleString(),
            s.revenue > 0 ? s.paidCount.toLocaleString() : "—",
            s.revenue > 0 ? s.unpaidCount.toLocaleString() : "—",
            s.revenue > 0 ? formatLak(s.revenue) : "Free",
            s.revenue > 0 ? formatLak(s.collected) : "—",
            s.revenue > 0 ? formatLak(s.outstanding) : "—",
          ])}
        />
      </Card>

      {/* ── 2. Volume & vital statistics ── */}
      <SectionTitle sub="Submissions, vital events and geography">Volume &amp; vital statistics</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {r.vital.map((v) => {
          const svc = SERVICE_BY_ID[v.id];
          return (
            <div key={v.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: svc?.color }} />
                <p className="text-xs text-gray-500 truncate">{v.label}</p>
              </div>
              <p className="text-xl font-bold text-gray-800 mt-1.5">{v.value.toLocaleString()}</p>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Requests per day" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={r.daily} margin={{ left: -8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F4" vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="requests" fill="#3752AE" radius={[4, 4, 0, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Top provinces">
          <div className="space-y-2 max-h-[220px] overflow-y-auto">
            {r.provinces.map((p) => (
              <div key={p.name} className="flex items-center justify-between text-sm">
                <span className="text-gray-600 truncate">{p.name}</span>
                <span className="text-gray-800 font-medium tabular-nums">{p.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── 3. Processing & SLA ── */}
      <SectionTitle sub="Turnaround, SLA compliance and rework">Processing &amp; SLA</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="SLA by service" className="lg:col-span-2">
          <ReportTable
            head={["Service", "Volume", "Avg days", "SLA %", "Overdue"]}
            rows={r.services.map((s) => [
              <ServiceCell key="s" id={s.id} />,
              s.volume.toLocaleString(),
              `${s.avgDays}`,
              <span key="sla" className={s.sla >= 90 ? "text-emerald-600" : s.sla >= 85 ? "text-amber-600" : "text-red-500"}>{s.sla}%</span>,
              s.overdue.toLocaleString(),
            ])}
          />
        </Card>
        <Card title="Returns & rejections">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl bg-orange-50 border border-orange-100 p-3">
              <p className="text-xs text-orange-600 font-medium">Returned</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{r.returns.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-red-50 border border-red-100 p-3">
              <p className="text-xs text-red-600 font-medium">Rejected</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{r.rejected.toLocaleString()}</p>
            </div>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Top reasons</p>
          <div className="space-y-2">
            {r.reasonRows.map((row) => {
              const max = r.reasonRows[0].count;
              return (
                <div key={row.reason}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-600 truncate">{row.reason}</span>
                    <span className="text-gray-500">{row.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full bg-[#3752AE]" style={{ width: `${(row.count / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ── 4. Certificates & productivity ── */}
      <SectionTitle sub="Issuance, family book updates and staff output">Certificates &amp; productivity</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={FileCheck2} label="Issued" value={r.certs.issued.toLocaleString()} tint="#10B981" />
        <Kpi icon={RotateCcw} label="Reissued" value={r.certs.reissued.toLocaleString()} tint="#0EA5E9" />
        <Kpi icon={Ban} label="Revoked" value={r.certs.revoked.toLocaleString()} tint="#EF4444" />
        <Kpi icon={ScanLine} label="QR verifications" value={r.certs.qrScans.toLocaleString()} tint="#3752AE" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Family Book updates">
          <div className="space-y-3">
            {[
              { label: "Members added (births)", value: r.familyBook.added, color: "#10B981" },
              { label: "Members removed (deaths)", value: r.familyBook.removed, color: "#EF4444" },
              { label: "Status updates", value: r.familyBook.statusUpdates, color: "#3752AE" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                  {row.label}
                </span>
                <span className="text-sm font-semibold text-gray-800">{row.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Cases processed by officer" className="lg:col-span-2">
          <ReportTable
            head={["Officer", "Processed", "Issued", "Avg days"]}
            rows={r.officers.map((o) => [o.name, o.processed.toLocaleString(), o.issued.toLocaleString(), `${o.avgDays}`])}
          />
        </Card>
      </div>
    </div>
  );
}

function ServiceCell({ id }: { id: string }) {
  const svc = SERVICE_BY_ID[id];
  return (
    <span className="inline-flex items-center gap-2 text-gray-700">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: svc?.color }} />
      {svc?.short ?? id}
    </span>
  );
}

function ReportTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
            {head.map((h, i) => (
              <th key={i} className={`px-3 py-2.5 font-medium ${i === 0 ? "" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-gray-50 last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className={`px-3 py-2.5 ${ci === 0 ? "text-gray-700" : "text-right text-gray-600 tabular-nums"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
