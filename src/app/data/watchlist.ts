/*
 * Watchlist Search — cross-references the citizen registry against law-enforcement
 * watchlist entries (wanted persons, travel bans, missing persons).
 *
 * Entries point at real citizens from the registry, and every person's documents
 * and life events are derived from their own record, so one search returns a
 * complete, internally consistent profile.
 */
import { CITIZENS, HOUSEHOLD_BY_NO, type Citizen } from "./population";

export type WatchStatus = "active" | "cleared" | "expired";
export type RiskLevel = "high" | "medium" | "low";
export type WatchCategory = "wanted" | "travel-ban" | "missing" | "summons";

export interface WatchlistEntry {
  id: string; // notice number
  uin: string;
  category: WatchCategory;
  offence: string;
  authority: string;
  issued: string; // YYYY-MM-DD
  expires: string;
  status: WatchStatus;
  risk: RiskLevel;
  note: string;
}

export const WATCH_CATEGORY_META: Record<WatchCategory, { label: string; color: string; bg: string }> = {
  wanted: { label: "Wanted person", color: "#B91C1C", bg: "#FEE2E2" },
  "travel-ban": { label: "Travel ban", color: "#B45309", bg: "#FEF3C7" },
  summons: { label: "Court summons", color: "#6D28D9", bg: "#EDE9FE" },
  missing: { label: "Missing person", color: "#1D4ED8", bg: "#DBEAFE" },
};

export const WATCH_STATUS_META: Record<WatchStatus, { label: string; color: string; bg: string }> = {
  active: { label: "Active", color: "#B91C1C", bg: "#FEE2E2" },
  cleared: { label: "Cleared", color: "#047857", bg: "#D1FAE5" },
  expired: { label: "Expired", color: "#44403C", bg: "#E7E5E4" },
};

export const RISK_META: Record<RiskLevel, { label: string; color: string; bg: string }> = {
  high: { label: "High risk", color: "#B91C1C", bg: "#FEE2E2" },
  medium: { label: "Medium risk", color: "#B45309", bg: "#FEF3C7" },
  low: { label: "Low risk", color: "#475569", bg: "#F1F5F9" },
};

const OFFENCES: { category: WatchCategory; offence: string; risk: RiskLevel }[] = [
  { category: "wanted", offence: "Aggravated theft", risk: "high" },
  { category: "wanted", offence: "Fraud and forgery of documents", risk: "high" },
  { category: "wanted", offence: "Narcotics trafficking", risk: "high" },
  { category: "wanted", offence: "Assault causing injury", risk: "medium" },
  { category: "travel-ban", offence: "Pending tax investigation", risk: "medium" },
  { category: "travel-ban", offence: "Unresolved civil judgment", risk: "low" },
  { category: "summons", offence: "Failure to appear — civil case", risk: "low" },
  { category: "summons", offence: "Witness summons — criminal case", risk: "low" },
  { category: "missing", offence: "Reported missing by family", risk: "medium" },
];

const AUTHORITIES = [
  "Ministry of Public Security — Criminal Police",
  "Vientiane Capital Police Department",
  "Provincial Police — Savannakhet",
  "Department of Immigration",
  "People's Court — Vientiane Capital",
  "Provincial Court — Champasak",
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

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function buildWatchlist(): WatchlistEntry[] {
  const rnd = mulberry32(4471902);
  const out: WatchlistEntry[] = [];
  // Adults only — a watchlist notice against a child would be nonsense data.
  const eligible = CITIZENS.filter((c) => c.age >= 18 && c.status === "active");

  for (let i = 0; i < 34; i++) {
    const person = eligible[Math.floor(rnd() * eligible.length)];
    if (!person || out.some((e) => e.uin === person.uin)) continue;
    const o = OFFENCES[Math.floor(rnd() * OFFENCES.length)];
    const issuedDaysAgo = 20 + Math.floor(rnd() * 900);
    const roll = rnd();
    const status: WatchStatus = roll > 0.78 ? "cleared" : roll > 0.7 ? "expired" : "active";
    const issued = isoDaysAgo(issuedDaysAgo);
    const expiresDate = new Date(issued);
    expiresDate.setFullYear(expiresDate.getFullYear() + 3);
    out.push({
      id: `WL-${issued.slice(0, 4)}-${String(1000 + i).padStart(5, "0")}`,
      uin: person.uin,
      category: o.category,
      offence: o.offence,
      authority: AUTHORITIES[Math.floor(rnd() * AUTHORITIES.length)],
      issued,
      expires: `${expiresDate.getFullYear()}-${pad2(expiresDate.getMonth() + 1)}-${pad2(expiresDate.getDate())}`,
      status,
      risk: status === "active" ? o.risk : "low",
      note:
        o.category === "missing"
          ? "Family requests notification if this person appears at any registration office."
          : "Notify the issuing authority before processing any certificate for this person.",
    });
  }
  return out.sort((a, b) => b.issued.localeCompare(a.issued));
}

export const WATCHLIST: WatchlistEntry[] = buildWatchlist();

export const WATCH_BY_UIN: Record<string, WatchlistEntry> = Object.fromEntries(
  WATCHLIST.map((e) => [e.uin, e]),
);

export const CITIZEN_BY_UIN: Record<string, Citizen> = Object.fromEntries(
  CITIZENS.map((c) => [c.uin, c]),
);

/* ── Documents on file ── */
export type DocStatus = "valid" | "expired" | "missing";

export interface PersonDocument {
  id: string;
  type: string;
  number: string;
  issued: string;
  expires?: string;
  status: DocStatus;
  authority: string;
}

export const DOC_STATUS_META: Record<DocStatus, { label: string; color: string; bg: string }> = {
  valid: { label: "Valid", color: "#047857", bg: "#D1FAE5" },
  expired: { label: "Expired", color: "#B45309", bg: "#FEF3C7" },
  missing: { label: "Not on file", color: "#94A3B8", bg: "#F1F5F9" },
};

/* Deterministic per person — the same citizen always shows the same documents. */
export function documentsFor(c: Citizen): PersonDocument[] {
  const rnd = mulberry32(hashStr(c.uin));
  const digits = (n: number) => String(Math.floor(rnd() * Math.pow(10, n))).padStart(n, "0");
  const docs: PersonDocument[] = [];

  const idIssuedAge = Math.max(15, Math.min(c.age, 15 + Math.floor(rnd() * 20)));
  const idIssued = `${new Date().getFullYear() - (c.age - idIssuedAge)}-${pad2(1 + Math.floor(rnd() * 12))}-${pad2(1 + Math.floor(rnd() * 28))}`;
  const idExpiry = `${Number(idIssued.slice(0, 4)) + 10}${idIssued.slice(4)}`;

  if (c.age >= 15) {
    docs.push({
      id: `${c.uin}-id`,
      type: "National ID card",
      number: `ID-${digits(9)}`,
      issued: idIssued,
      expires: idExpiry,
      status: Number(idExpiry.slice(0, 4)) < new Date().getFullYear() ? "expired" : "valid",
      authority: `${c.province} Public Security Office`,
    });
  }

  docs.push({
    id: `${c.uin}-fb`,
    type: "Family Book",
    number: c.householdNo,
    issued: HOUSEHOLD_BY_NO[c.householdNo]?.registered ?? idIssued,
    status: "valid",
    authority: `${c.district} Office of Home Affairs`,
  });

  docs.push({
    id: `${c.uin}-birth`,
    type: "Birth certificate",
    number: `BC-${digits(8)}`,
    issued: c.dob,
    status: "valid",
    authority: `${c.province} Civil Registration Office`,
  });

  if (rnd() < 0.45 && c.age >= 18) {
    const pIssued = isoDaysAgo(200 + Math.floor(rnd() * 2000));
    docs.push({
      id: `${c.uin}-passport`,
      type: "Passport",
      number: `P${digits(7)}`,
      issued: pIssued,
      expires: `${Number(pIssued.slice(0, 4)) + 5}${pIssued.slice(4)}`,
      status: Number(pIssued.slice(0, 4)) + 5 < new Date().getFullYear() ? "expired" : "valid",
      authority: "Department of Consular Affairs",
    });
  }

  if (rnd() < 0.3 && c.age >= 22) {
    docs.push({
      id: `${c.uin}-marriage`,
      type: "Marriage certificate",
      number: `MC-${digits(6)}`,
      issued: isoDaysAgo(500 + Math.floor(rnd() * 4000)),
      status: "valid",
      authority: `${c.district} Office of Home Affairs`,
    });
  }

  return docs;
}

/* ── Civil registration history ── */
export interface LifeEvent {
  date: string;
  event: string;
  detail: string;
}

export function eventsFor(c: Citizen): LifeEvent[] {
  const rnd = mulberry32(hashStr(`${c.uin}-events`));
  const household = HOUSEHOLD_BY_NO[c.householdNo];
  const events: LifeEvent[] = [
    { date: c.dob, event: "Birth registered", detail: `${c.village}, ${c.district}, ${c.province}` },
  ];

  if (household) {
    events.push({
      date: household.registered,
      event: c.relation === "Head" ? "Family book issued" : "Added to family book",
      detail: `${household.no} · head of household ${household.head}`,
    });
  }

  if (c.age >= 15) {
    events.push({
      date: isoDaysAgo(300 + Math.floor(rnd() * 3000)),
      event: "National ID issued",
      detail: `${c.province} Public Security Office`,
    });
  }

  if (rnd() < 0.35 && c.age >= 22) {
    events.push({
      date: isoDaysAgo(400 + Math.floor(rnd() * 3500)),
      event: "Marriage registered",
      detail: `${c.district} Office of Home Affairs`,
    });
  }

  if (rnd() < 0.25) {
    events.push({
      date: isoDaysAgo(60 + Math.floor(rnd() * 900)),
      event: "Residence changed",
      detail: `Moved within ${c.district}`,
    });
  }

  if (c.status === "deceased") {
    events.push({ date: isoDaysAgo(30 + Math.floor(rnd() * 500)), event: "Death registered", detail: `${c.district} Office of Home Affairs` });
  }

  return events.sort((a, b) => b.date.localeCompare(a.date));
}

/* ── Search ── */
export function searchPeople(query: string, limit = 50): Citizen[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const scored = CITIZENS.map((c) => {
    const name = c.name.toLowerCase();
    let score = 0;
    if (c.uin.toLowerCase() === q) score = 100;
    else if (name === q) score = 90;
    else if (name.startsWith(q)) score = 70;
    else if (name.includes(q)) score = 50;
    else if (c.uin.toLowerCase().includes(q)) score = 40;
    else if (c.householdNo.toLowerCase().includes(q)) score = 30;
    else if (c.village.toLowerCase().includes(q) || c.province.toLowerCase().includes(q)) score = 10;
    // Flagged people surface first — that is the point of this screen.
    if (score > 0 && WATCH_BY_UIN[c.uin]?.status === "active") score += 15;
    return { c, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name));
  return scored.slice(0, limit).map((r) => r.c);
}

export const WATCHLIST_SUMMARY = {
  total: WATCHLIST.length,
  active: WATCHLIST.filter((e) => e.status === "active").length,
  highRisk: WATCHLIST.filter((e) => e.status === "active" && e.risk === "high").length,
  cleared: WATCHLIST.filter((e) => e.status === "cleared").length,
};
