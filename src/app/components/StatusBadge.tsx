import { STATUS_META, type AppStatus } from "../data/mockData";

export function StatusBadge({
  status,
  showLao = false,
}: {
  status: AppStatus;
  showLao?: boolean;
}) {
  const m = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ color: m.color, backgroundColor: m.bg }}
      title={m.meaning}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
      {m.label}
      {showLao && <span className="opacity-70">· {m.laLabel}</span>}
    </span>
  );
}
