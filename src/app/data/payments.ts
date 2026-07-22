/*
 * Payments & Revenue demo data (PRD §11 — fee collection and reconciliation).
 *
 * Transactions are derived from the application records, so revenue always ties
 * back to a real case: a service fee for every fee-bearing application, plus the
 * occasional certified copy or late-registration fine. Deterministic.
 */
import { APPLICATIONS, type Application } from "./mockData";
import { SERVICES, SERVICE_BY_ID } from "../serviceConfig";

export type TxStatus = "paid" | "pending" | "refunded" | "failed";
export type TxKind = "service-fee" | "certified-copy" | "late-fine";

export interface PaymentMethod {
  id: string;
  label: string;
  kind: "wallet" | "bank" | "cash" | "qr";
  enabled: boolean;
  feePercent: number; // provider commission withheld on settlement
  settlement: string; // settlement account / destination
  note: string;
}

/* Defaults — the settings tab edits a copy of these in local state. */
export const DEFAULT_METHODS: PaymentMethod[] = [
  { id: "bcel-one", label: "BCEL One", kind: "wallet", enabled: true, feePercent: 1.2, settlement: "BCEL · 010-12-00-0045821", note: "Most used wallet; settles next business day." },
  { id: "ldb-onepay", label: "LDB OnePay", kind: "wallet", enabled: true, feePercent: 1.5, settlement: "LDB · 220-88-00-0011204", note: "Wallet payment via the citizen app." },
  { id: "laoqr", label: "LaoQR", kind: "qr", enabled: true, feePercent: 0.8, settlement: "BCEL · 010-12-00-0045821", note: "Interoperable QR accepted by all local banks." },
  { id: "unitel-money", label: "U-Money (Unitel)", kind: "wallet", enabled: true, feePercent: 1.8, settlement: "Unitel · MM-4471902", note: "Mobile money, popular outside the capital." },
  { id: "bank-transfer", label: "Bank transfer", kind: "bank", enabled: true, feePercent: 0, settlement: "National Treasury · 001-00-11-9000", note: "Manual reconciliation; proof of transfer required." },
  { id: "cash", label: "Cash at office", kind: "cash", enabled: true, feePercent: 0, settlement: "District cash book", note: "Receipt issued at the counter; banked daily." },
];

/* Validated categorical palette (dataviz six checks — ALL PASS in this order).
 * Shared so Payments and Reports colour a method identically. */
export const METHOD_PALETTE = ["#3752AE", "#10B981", "#F59E0B", "#EC4899", "#0EA5E9", "#8B5CF6"];
export const METHOD_COLOR: Record<string, string> = Object.fromEntries(
  DEFAULT_METHODS.map((m, i) => [m.id, METHOD_PALETTE[i % METHOD_PALETTE.length]]),
);

export const METHOD_BY_ID: Record<string, PaymentMethod> = Object.fromEntries(
  DEFAULT_METHODS.map((m) => [m.id, m]),
);

export interface ServicePricing {
  serviceId: string;
  fee: number; // primary service fee, LAK
  copyFee: number; // certified copy / reprint
  lateFine: number; // late registration fine
}

export const DEFAULT_PRICING: ServicePricing[] = SERVICES.map((s) => ({
  serviceId: s.id,
  fee: s.fee,
  copyFee: s.fee > 0 ? 10_000 : 5_000,
  lateFine: s.id === "birth" || s.id === "death" ? 15_000 : 0,
}));

export interface Transaction {
  id: string; // receipt number
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  applicationId: string;
  payer: string;
  serviceId: string;
  province: string;
  kind: TxKind;
  method: string; // PaymentMethod id
  amount: number; // LAK
  status: TxStatus;
  cashier: string;
}

export const KIND_LABEL: Record<TxKind, string> = {
  "service-fee": "Service fee",
  "certified-copy": "Certified copy",
  "late-fine": "Late registration fine",
};

export const TX_STATUS_META: Record<TxStatus, { label: string; color: string; bg: string }> = {
  paid: { label: "Paid", color: "#047857", bg: "#D1FAE5" },
  pending: { label: "Pending", color: "#B45309", bg: "#FEF3C7" },
  refunded: { label: "Refunded", color: "#6D28D9", bg: "#EDE9FE" },
  failed: { label: "Failed", color: "#B91C1C", bg: "#FEE2E2" },
};

const CASHIERS = ["Khamla P.", "Vilai S.", "Somsy T.", "Bounma K.", "Latda S.", "Noy K."];
/* Weighted so wallets dominate and cash is the long tail — mirrors the PRD's
 * assumption that most citizens pay in-app. */
const METHOD_POOL = [
  "bcel-one", "bcel-one", "bcel-one", "bcel-one",
  "ldb-onepay", "ldb-onepay", "ldb-onepay",
  "laoqr", "laoqr",
  "unitel-money", "unitel-money",
  "bank-transfer",
  "cash", "cash",
];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

const PRICING_BY_ID: Record<string, ServicePricing> = Object.fromEntries(
  DEFAULT_PRICING.map((p) => [p.serviceId, p]),
);

function buildTransactions(): Transaction[] {
  const rnd = mulberry32(72026);
  const out: Transaction[] = [];
  let seq = 0;

  const receipt = (date: string) => {
    seq += 1;
    return `RCP-${date.slice(0, 4)}-${String(1000 + seq).padStart(6, "0")}`;
  };

  const push = (a: Application, kind: TxKind, amount: number, dayShift: number) => {
    if (amount <= 0) return;
    const d = new Date(a.submitted);
    d.setDate(d.getDate() + dayShift);
    if (d.getTime() > Date.now()) return; // never bill into the future
    const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const roll = rnd();
    // Drafts and rejected cases are the ones that realistically stay unpaid.
    const status: TxStatus =
      a.status === "draft" ? "pending"
      : a.status === "rejected" && roll > 0.5 ? "refunded"
      : roll > 0.93 ? "pending"
      : roll > 0.90 ? "failed"
      : "paid";
    out.push({
      id: receipt(date),
      date,
      time: `${pad2(8 + Math.floor(rnd() * 9))}:${pad2(Math.floor(rnd() * 60))}`,
      applicationId: a.id,
      payer: a.applicant,
      serviceId: a.serviceId,
      province: a.province,
      kind,
      method: METHOD_POOL[Math.floor(rnd() * METHOD_POOL.length)],
      amount,
      status,
      cashier: CASHIERS[Math.floor(rnd() * CASHIERS.length)],
    });
  };

  for (const a of APPLICATIONS) {
    const price = PRICING_BY_ID[a.serviceId];
    if (!price) continue;
    push(a, "service-fee", price.fee, 0);
    // A quarter of issued cases also buy a certified copy.
    if (a.status === "issued" && rnd() < 0.25) push(a, "certified-copy", price.copyFee, 2);
    // Late fines only apply to birth/death declarations filed past the window.
    if (price.lateFine > 0 && rnd() < 0.18) push(a, "late-fine", price.lateFine, 1);
  }

  return out.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}

export const TRANSACTIONS: Transaction[] = buildTransactions();

export const SERVICE_OPTIONS = SERVICES.map((s) => ({ value: s.id, label: s.label, color: s.color }));
export const METHOD_OPTIONS = DEFAULT_METHODS.map((m) => ({ value: m.id, label: m.label }));
export const TX_STATUS_OPTIONS = (Object.keys(TX_STATUS_META) as TxStatus[]).map((k) => ({
  value: k,
  label: TX_STATUS_META[k].label,
  color: TX_STATUS_META[k].color,
}));

export function serviceLabel(id: string): string {
  return SERVICE_BY_ID[id]?.short ?? id;
}

export function formatLakShort(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
