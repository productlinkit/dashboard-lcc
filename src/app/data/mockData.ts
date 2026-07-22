import { SERVICE_BY_ID } from "../serviceConfig";
import { processingDaysFor } from "./derive";

/*
 * Demo data for the admin dashboard. Static / deterministic so the UI is stable.
 */

/*
 * Case lifecycle status model — PRD §11.4.
 * Draft → Submitted → Certified → Under Review → (Returned for Correction ⤴)
 *   → Registered/Signed → Issued, plus the terminal Rejected and Revoked/Cancelled.
 */
export type AppStatus =
  | "draft"
  | "submitted"
  | "certified"
  | "under-review"
  | "returned"
  | "registered"
  | "issued"
  | "rejected"
  | "revoked";

export interface StatusMeta {
  label: string; // English label
  laLabel: string; // Lao label (bilingual UI — PRD FR-7)
  color: string; // text color
  bg: string; // chip background
  meaning: string; // PRD §11.4 description
  actingRole: string; // who acts at this status
}

export const STATUS_META: Record<AppStatus, StatusMeta> = {
  draft: {
    label: "Draft",
    laLabel: "ຮ່າງ",
    color: "#475569",
    bg: "#F1F5F9",
    meaning: "Case created and being captured; not yet submitted.",
    actingRole: "Village Officer / Citizen",
  },
  submitted: {
    label: "Submitted",
    laLabel: "ສົ່ງແລ້ວ",
    color: "#1D4ED8",
    bg: "#DBEAFE",
    meaning: "Submitted for village-level certification.",
    actingRole: "Village Officer",
  },
  certified: {
    label: "Certified",
    laLabel: "ຢັ້ງຢືນແລ້ວ",
    color: "#0369A1",
    bg: "#E0F2FE",
    meaning: "Address/event certified and e-signed at the village.",
    actingRole: "Village Chief",
  },
  "under-review": {
    label: "Under Review",
    laLabel: "ກຳລັງກວດສອບ",
    color: "#6D28D9",
    bg: "#EDE9FE",
    meaning: "Received and being reviewed at the district.",
    actingRole: "District Registrar",
  },
  returned: {
    label: "Returned for Correction",
    laLabel: "ສົ່ງກັບແກ້ໄຂ",
    color: "#C2410C",
    bg: "#FFEDD5",
    meaning: "Sent back with notes; editable, then re-submitted.",
    actingRole: "Village Officer",
  },
  registered: {
    label: "Registered / Signed",
    laLabel: "ຈົດທະບຽນ / ເຊັນແລ້ວ",
    color: "#0F766E",
    bg: "#CCFBF1",
    meaning: "Event registered and certificate e-signed.",
    actingRole: "District Registrar",
  },
  issued: {
    label: "Issued",
    laLabel: "ອອກໃບແລ້ວ",
    color: "#047857",
    bg: "#D1FAE5",
    meaning: "QR-verifiable certificate issued; registry & family book synced.",
    actingRole: "Platform / DoPS",
  },
  rejected: {
    label: "Rejected",
    laLabel: "ປະຕິເສດ",
    color: "#B91C1C",
    bg: "#FEE2E2",
    meaning: "Declined with a recorded reason; no certificate issued.",
    actingRole: "District Registrar",
  },
  revoked: {
    label: "Revoked / Cancelled",
    laLabel: "ຖອນ / ຍົກເລີກ",
    color: "#44403C",
    bg: "#E7E5E4",
    meaning: "Issued record later invalidated, with audit.",
    actingRole: "Authorised Officer",
  },
};

/* The happy-path pipeline, in order (excludes the terminal/exception states). */
export const PIPELINE_ORDER: AppStatus[] = [
  "draft",
  "submitted",
  "certified",
  "under-review",
  "registered",
  "issued",
];

/* Every status, in display order — used for filters and legends. */
export const STATUS_ORDER: AppStatus[] = [
  "draft",
  "submitted",
  "certified",
  "under-review",
  "returned",
  "registered",
  "issued",
  "rejected",
  "revoked",
];

export interface Application {
  id: string; // reference number
  applicant: string;
  serviceId: string;
  province: string;
  submitted: string; // YYYY-MM-DD
  status: AppStatus;
  officer?: string;
}

const SEED_APPLICATIONS: Application[] = [
  { id: "RC-2026-004821", applicant: "Somchai Vongphakdy", serviceId: "resident", province: "Vientiane Capital", submitted: "2026-06-24", status: "submitted" },
  { id: "BD-2026-002310", applicant: "Noy Keomanivong", serviceId: "birth", province: "Savannakhet", submitted: "2026-06-24", status: "under-review", officer: "Khamla P." },
  { id: "MC-2026-001145", applicant: "Bounmy & Dao Sisavath", serviceId: "marriage", province: "Luang Prabang", submitted: "2026-06-23", status: "issued", officer: "Vilai S." },
  { id: "DD-2026-000877", applicant: "Phout Inthavong", serviceId: "death", province: "Champasak", submitted: "2026-06-23", status: "registered", officer: "Khamla P." },
  { id: "FB-2026-003402", applicant: "Sengdao Household", serviceId: "family-book", province: "Vientiane Capital", submitted: "2026-06-23", status: "draft" },
  { id: "DV-2026-000231", applicant: "Khamphone Soukaloun", serviceId: "divorce", province: "Xiangkhouang", submitted: "2026-06-22", status: "certified", officer: "Vilai S." },
  { id: "RC-2026-004790", applicant: "Manivanh Phommachanh", serviceId: "resident", province: "Savannakhet", submitted: "2026-06-22", status: "issued", officer: "Somsy T." },
  { id: "BD-2026-002288", applicant: "Latda Sayavong", serviceId: "birth", province: "Bokeo", submitted: "2026-06-22", status: "rejected", officer: "Khamla P." },
  { id: "MC-2026-001120", applicant: "Anousone & Mai Phila", serviceId: "marriage", province: "Vientiane Capital", submitted: "2026-06-21", status: "returned", officer: "Vilai S." },
  { id: "RC-2026-004701", applicant: "Thongchanh Detsana", serviceId: "resident", province: "Oudomxay", submitted: "2026-06-21", status: "issued", officer: "Somsy T." },
  { id: "FB-2026-003380", applicant: "Vorachit Household", serviceId: "family-book", province: "Champasak", submitted: "2026-06-20", status: "registered", officer: "Somsy T." },
  { id: "DD-2026-000861", applicant: "Bualy Khounnavong", serviceId: "death", province: "Phongsali", submitted: "2026-06-20", status: "submitted" },
  { id: "RC-2026-004655", applicant: "Khamsao Rattanavong", serviceId: "resident", province: "Vientiane Capital", submitted: "2026-06-19", status: "revoked", officer: "Somsy T." },
];

/* Generate additional deterministic rows so the list is paginated and realistic. */
const GEN_NAMES = [
  "Somchai Vongduang", "Bounthavy Detsana", "Khampheng Keomany", "Vilaiphone Soukaloun", "Noy Phommachanh",
  "Latda Sayavong", "Manivanh Khounnavong", "Souksavanh Rattanavong", "Phout Inthavong", "Khamla Sisavath",
  "Dao Chanthavong", "Bounmy Vilaysack", "Thongdy Phimmasone", "Sengphet Douangchak", "Malaythong Xayasane",
  "Chanthala Norasing", "Viengkham Boutnaseng", "Somphone Keovilay", "Oudom Panyanouvong", "Keo Souvannaphouma",
];
const GEN_PROVINCES = [
  "Vientiane Capital", "Savannakhet", "Champasak", "Luang Prabang", "Vientiane", "Khammouane", "Oudomxay",
  "Xaignabouli", "Salavan", "Xiangkhouang", "Bolikhamsai", "Houaphan", "Luang Namtha", "Bokeo", "Phongsaly",
  "Attapeu", "Xekong", "Xaisomboun",
];
/* Recombined with the given names above so 260 rows don't repeat every 20. */
const GEN_SURNAMES = [
  "Vongsa", "Sisoulath", "Phanthavong", "Keomanivong", "Sengdara", "Inthasone", "Bounyavong",
  "Chanthaphone", "Xaiyavong", "Souphanousinh", "Namvong", "Rasphone", "Thammavong",
];
const GEN_OFFICERS = ["Khamla P.", "Vilai S.", "Somsy T.", "Bounma K.", "Latda S.", "Noy K."];
/* Status depends on how old a case is, not on an independent draw: anything from
 * the last few weeks is still being worked on, older cases have been closed out.
 * Both pools are 11 long — coprime with the 120-day window below, so a given
 * calendar day doesn't always land on the same status. */
const OPEN_STATUS_POOL: AppStatus[] = [
  "submitted", "submitted", "submitted",
  "under-review", "under-review", "under-review",
  "certified", "certified",
  "returned", "returned",
  "draft",
];
/* 29 slots — coprime with the 119-day window. Revocation is rare in practice, so
 * it gets a single slot rather than the same weight as a rejection. */
const CLOSED_STATUS_POOL: AppStatus[] = [
  ...Array(21).fill("issued"),
  ...Array(5).fill("registered"),
  ...Array(2).fill("rejected"),
  "revoked",
] as AppStatus[];

/* 13 slots, weighted the way an office actually sees them. Coprime with both the
 * window and the status pools, so service, date and status stay uncorrelated —
 * otherwise every Tuesday would be a marriage and revenue would spike weekly. */
const SVC_POOL = [
  "resident", "resident", "resident", "resident",
  "birth", "birth", "birth",
  "death", "death",
  "marriage", "marriage",
  "divorce",
  "family-book",
];
const SVC_PREFIX: Record<string, string> = {
  resident: "RC", birth: "BD", death: "DD", marriage: "MC", divorce: "DV", "family-book": "FB",
};

/* 119 days of history — a whole number of weeks, so weekly chart buckets all
 * cover seven real days and none renders as a stub bar. */
const GEN_WINDOW_DAYS = 119;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function generateApplications(count: number): Application[] {
  const out: Application[] = [];
  const base = new Date(); // rolling window ending today, so dates are never in the future
  for (let i = 0; i < count; i++) {
    // Stride 47 is coprime with the window, so cases land evenly on every day of
    // it rather than bunching up — bunching is what produced revenue spikes.
    const daysAgo = (i * 47) % GEN_WINDOW_DAYS;
    const svc = SVC_POOL[(i * 5) % SVC_POOL.length];
    const id = `${SVC_PREFIX[svc]}-2026-${String(3100 + i).padStart(6, "0")}`;
    // A case is closed once its own processing time has elapsed — not at a fixed
    // cut-off. Otherwise no recent case would ever be finished and the completed
    // series would collapse to zero at the right-hand edge of every chart.
    const target = SERVICE_BY_ID[svc]?.slaDays ?? 7;
    const pool = daysAgo >= Math.ceil(processingDaysFor(id, svc, target))
      ? CLOSED_STATUS_POOL
      : OPEN_STATUS_POOL;
    const status = pool[(i * 7) % pool.length];
    const d = new Date(base);
    d.setDate(d.getDate() - daysAgo);
    const submitted = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const hasOfficer = !(status === "draft" || status === "submitted");
    out.push({
      id,
      applicant: `${GEN_NAMES[(i * 7) % GEN_NAMES.length].split(" ")[0]} ${
        GEN_SURNAMES[(i * 5) % GEN_SURNAMES.length]
      }`,
      serviceId: svc,
      province: GEN_PROVINCES[(i * 5) % GEN_PROVINCES.length],
      submitted,
      status,
      officer: hasOfficer ? GEN_OFFICERS[(i * 3) % GEN_OFFICERS.length] : undefined,
    });
  }
  return out;
}

export const APPLICATIONS: Application[] = [...SEED_APPLICATIONS, ...generateApplications(3000)];

/* KPI tiles on the overview page. The four state buckets (awaiting, issued,
 * submitted, needs correction) are split from totalApplications on the page so
 * they always add back up to it — see splitTotal() in OverviewPage. */
export const KPI = {
  totalApplications: 4821,
  revenueLak: 78_540_000,
  feesTodayLak: 2_540_000,
};

/* Applications submitted per day, last 7 days */
export const WEEKLY_VOLUME = [
  { day: "Thu", applications: 142, issued: 96 },
  { day: "Fri", applications: 168, issued: 121 },
  { day: "Sat", applications: 73, issued: 51 },
  { day: "Sun", applications: 64, issued: 40 },
  { day: "Mon", applications: 201, issued: 154 },
  { day: "Tue", applications: 188, issued: 142 },
  { day: "Wed", applications: 176, issued: 129 },
];

/* Applications registered per month — rolling last 12 months ending this month.
 * Avoids showing future months; the current (partial) month is pro-rated. */
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildMonthlyVolume(): { month: string; applications: number }[] {
  const now = new Date();
  const out: { month: string; applications: number }[] = [];
  for (let back = 11; back >= 0; back--) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const idx = 11 - back; // 0 = oldest … 11 = current
    const jitter = 0.85 + ((idx * 37) % 30) / 100;
    let value = Math.round((900 + idx * 95) * jitter);
    if (back === 0) {
      // Current month is still in progress — pro-rate by days elapsed.
      const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      value = Math.max(120, Math.round(value * (now.getDate() / daysInMonth)));
    }
    out.push({ month: `${MONTH_NAMES[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`, applications: value });
  }
  return out;
}

export const MONTHLY_VOLUME = buildMonthlyVolume();

/* Registrations by province/capital (this year) — keys match the GeoJSON `name`. */
export const PROVINCE_STATS: Record<string, number> = {
  "Vientiane Capital": 1840,
  Savannakhet: 1120,
  Champasak: 690,
  "Luang Prabang": 540,
  Vientiane: 480,
  Khammouane: 420,
  Oudomxay: 360,
  Xaignabouli: 300,
  Salavan: 310,
  Xiangkhouang: 280,
  Bolikhamsai: 260,
  Houaphan: 230,
  "Luang Namtha": 210,
  Bokeo: 180,
  Phongsaly: 160,
  Attapeu: 140,
  Xekong: 110,
  Xaisomboun: 90,
};

/* Share of applications by service (this month) */
export const SERVICE_SHARE: Record<string, number> = {
  resident: 1840,
  birth: 1120,
  death: 540,
  marriage: 690,
  divorce: 210,
  "family-book": 421,
};
