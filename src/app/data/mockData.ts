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

export const APPLICATIONS: Application[] = [
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

/* KPI tiles on the overview page */
export const KPI = {
  totalApplications: 4821,
  awaitingAction: 312, // not yet issued/closed (draft → under-review)
  issuedThisMonth: 1894,
  revenueLak: 78_540_000,
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

/* Share of applications by service (this month) */
export const SERVICE_SHARE: Record<string, number> = {
  resident: 1840,
  birth: 1120,
  death: 540,
  marriage: 690,
  divorce: 210,
  "family-book": 421,
};
