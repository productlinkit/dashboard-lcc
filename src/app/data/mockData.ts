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
const GEN_OFFICERS = ["Khamla P.", "Vilai S.", "Somsy T.", "Bounma K.", "Latda S.", "Noy K."];
const GEN_STATUS_POOL: AppStatus[] = [
  "issued", "issued", "issued", "under-review", "submitted", "certified", "registered", "returned", "rejected", "draft", "revoked",
];
const SVC_IDS = ["resident", "birth", "death", "marriage", "divorce", "family-book"];
const SVC_PREFIX: Record<string, string> = {
  resident: "RC", birth: "BD", death: "DD", marriage: "MC", divorce: "DV", "family-book": "FB",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function generateApplications(count: number): Application[] {
  const out: Application[] = [];
  const base = new Date(2026, 5, 30); // 30 Jun 2026
  for (let i = 0; i < count; i++) {
    const svc = SVC_IDS[i % SVC_IDS.length];
    const id = `${SVC_PREFIX[svc]}-2026-${String(3100 + i).padStart(6, "0")}`;
    const status = GEN_STATUS_POOL[(i * 11) % GEN_STATUS_POOL.length];
    const d = new Date(base);
    d.setDate(d.getDate() - ((i * 3) % 62));
    const submitted = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const hasOfficer = !(status === "draft" || status === "submitted");
    out.push({
      id,
      applicant: GEN_NAMES[(i * 7) % GEN_NAMES.length],
      serviceId: svc,
      province: GEN_PROVINCES[(i * 5) % GEN_PROVINCES.length],
      submitted,
      status,
      officer: hasOfficer ? GEN_OFFICERS[(i * 3) % GEN_OFFICERS.length] : undefined,
    });
  }
  return out;
}

export const APPLICATIONS: Application[] = [...SEED_APPLICATIONS, ...generateApplications(60)];

/* KPI tiles on the overview page */
export const KPI = {
  totalApplications: 4821,
  awaitingAction: 312, // not yet issued/closed (draft → under-review)
  issuedThisMonth: 1894,
  revenueLak: 78_540_000,
  submittedToday: 176,
  feesTodayLak: 2_540_000,
  needsCorrection: 48, // returned / rejected awaiting rework
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

/* Applications registered per month (this year) */
export const MONTHLY_VOLUME = [
  { month: "Jan", applications: 980 },
  { month: "Feb", applications: 1120 },
  { month: "Mar", applications: 1340 },
  { month: "Apr", applications: 1210 },
  { month: "May", applications: 1580 },
  { month: "Jun", applications: 1890 },
  { month: "Jul", applications: 4821 },
  { month: "Aug", applications: 1460 },
  { month: "Sep", applications: 1320 },
  { month: "Oct", applications: 1400 },
  { month: "Nov", applications: 1275 },
  { month: "Dec", applications: 1190 },
];

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
