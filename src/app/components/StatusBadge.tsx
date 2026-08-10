import { useEffect, useState } from "react";
import { catalog } from "../api/endpoints";
import type { StatusCatalogue, StatusMeta } from "../api/types";

/*
 * The case-status chip.
 *
 * Colours, labels and the hover explanation come from the backend's status
 * catalogue (GET /status-catalogue) rather than a table duplicated in the
 * frontend, so a chip can never drift from the lifecycle the API enforces.
 *
 * The catalogue is fetched once for the whole app and cached at module level:
 * a table with fifty rows renders fifty badges, and fifty requests for the same
 * static document would be absurd. Every mounted badge subscribes, so they all
 * re-render together the moment it lands.
 */

export interface StatusChipMeta {
  label: string;
  labelLo: string;
  color: string;
  background: string;
  meaning: string;
}

/*
 * Shown for the first paint, before the catalogue resolves, and if the request
 * fails. Keys are the API's kebab-case status values.
 */
const FALLBACK: Record<string, StatusChipMeta> = {
  draft: { label: "Draft", labelLo: "ຮ່າງ", color: "#475569", background: "#F1F5F9", meaning: "Case created and being captured; not yet submitted." },
  submitted: { label: "Submitted", labelLo: "ສົ່ງແລ້ວ", color: "#1D4ED8", background: "#DBEAFE", meaning: "Submitted for village-level certification." },
  certified: { label: "Certified", labelLo: "ຢັ້ງຢືນແລ້ວ", color: "#0369A1", background: "#E0F2FE", meaning: "Address/event certified and e-signed at the village." },
  "under-review": { label: "Under Review", labelLo: "ກຳລັງກວດສອບ", color: "#6D28D9", background: "#EDE9FE", meaning: "Received and being reviewed at the district." },
  returned: { label: "Returned for Correction", labelLo: "ສົ່ງກັບແກ້ໄຂ", color: "#C2410C", background: "#FFEDD5", meaning: "Sent back with notes; editable, then re-submitted." },
  registered: { label: "Registered / Signed", labelLo: "ຈົດທະບຽນ / ເຊັນແລ້ວ", color: "#0F766E", background: "#CCFBF1", meaning: "Event registered and certificate e-signed." },
  issued: { label: "Issued", labelLo: "ອອກໃບແລ້ວ", color: "#047857", background: "#D1FAE5", meaning: "QR-verifiable certificate issued; registry & family book synced." },
  rejected: { label: "Rejected", labelLo: "ປະຕິເສດ", color: "#B91C1C", background: "#FEE2E2", meaning: "Declined with a recorded reason; no certificate issued." },
  revoked: { label: "Revoked / Cancelled", labelLo: "ຖອນ / ຍົກເລີກ", color: "#44403C", background: "#E7E5E4", meaning: "Issued record later invalidated, with audit." },
};

const FALLBACK_ORDER = Object.keys(FALLBACK);

let cached: StatusCatalogue | undefined;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function loadCatalogue() {
  if (cached || inflight) return;
  inflight = catalog
    .statusCatalogue()
    .then((result) => {
      cached = result;
    })
    .catch(() => {
      // The fallback table keeps every chip readable; a status chip is not
      // worth surfacing an error banner for.
    })
    .finally(() => {
      inflight = null;
      listeners.forEach((notify) => notify());
    });
}

/** Subscribe to the shared catalogue, triggering the one fetch if needed. */
export function useStatusCatalogue(): StatusCatalogue | undefined {
  const [, force] = useState(0);

  useEffect(() => {
    const notify = () => force((n) => n + 1);
    listeners.add(notify);
    loadCatalogue();
    return () => {
      listeners.delete(notify);
    };
  }, []);

  return cached;
}

function toChipMeta(meta: StatusMeta): StatusChipMeta {
  return {
    label: meta.label,
    labelLo: meta.label_lo,
    color: meta.color,
    background: meta.background,
    meaning: meta.meaning,
  };
}

/** Everything known about one status, catalogue first and fallback second. */
export function useStatusMeta(status: string): StatusChipMeta {
  const cat = useStatusCatalogue();
  const fromApi = cat?.statuses.find((s) => s.status === status);
  if (fromApi) return toChipMeta(fromApi);
  return (
    FALLBACK[status] ?? {
      label: status,
      labelLo: "",
      color: "#475569",
      background: "#F1F5F9",
      meaning: status,
    }
  );
}

/**
 * Status options for a filter control, in the backend's own pipeline order.
 * The values are the exact kebab-case strings the list endpoints expect.
 */
export function useStatusOptions(): Array<{ value: string; label: string; color: string }> {
  const cat = useStatusCatalogue();
  if (cat?.statuses?.length) {
    const order = cat.pipeline_order ?? [];
    return [...cat.statuses]
      .sort((a, b) => {
        const ai = order.indexOf(a.status);
        const bi = order.indexOf(b.status);
        return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
      })
      .map((s) => ({ value: s.status, label: s.label, color: s.color }));
  }
  return FALLBACK_ORDER.map((s) => ({ value: s, label: FALLBACK[s].label, color: FALLBACK[s].color }));
}

export function StatusBadge({
  status,
  showLao = false,
}: {
  status: string;
  showLao?: boolean;
}) {
  const m = useStatusMeta(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ color: m.color, backgroundColor: m.background }}
      title={m.meaning}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
      {m.label}
      {showLao && m.labelLo && <span className="opacity-70">· {m.labelLo}</span>}
    </span>
  );
}
