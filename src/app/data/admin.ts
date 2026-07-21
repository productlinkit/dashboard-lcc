/*
 * Administration data (PRD §11.2, §11.3, §11.5) — the six roles, the twelve core
 * modules, the role→module access matrix, officer accounts and platform config.
 */
import { PROVINCE_STATS } from "./mockData";

export type Access = "full" | "view" | "none";

export interface Role {
  id: string;
  label: string;
  laLabel: string;
  scope: string; // jurisdiction the role is scoped to
  summary: string;
}

/* §11.2 — six roles, each scoped to a jurisdiction as well as a permission set. */
export const ROLES: Role[] = [
  { id: "village-officer", label: "Village Officer", laLabel: "ພະນັກງານບ້ານ", scope: "Village", summary: "Intake and case creation on behalf of citizens." },
  { id: "village-chief", label: "Village Chief (Nai Ban)", laLabel: "ນາຍບ້ານ", scope: "Village", summary: "Certifies address and events, applies the village e-stamp." },
  { id: "district-registrar", label: "District Registrar (DoHA)", laLabel: "ນາຍທະບຽນເມືອງ", scope: "District", summary: "Reviews, registers, e-signs, returns or rejects with reason." },
  { id: "dops-officer", label: "DoPS Officer", laLabel: "ພະນັກງານ ກປສ", scope: "Province", summary: "Maintains the family book — add, update and remove members." },
  { id: "supervisor", label: "Head of Office / Supervisor", laLabel: "ຫົວໜ້າຫ້ອງການ", scope: "District / Province", summary: "Final approval, SLA oversight and workload distribution." },
  { id: "sysadmin", label: "System Administrator", laLabel: "ຜູ້ຄຸ້ມຄອງລະບົບ", scope: "National", summary: "Users, roles, master data and platform configuration." },
];

export const ROLE_BY_ID: Record<string, Role> = Object.fromEntries(ROLES.map((r) => [r.id, r]));

/* §11.3 — the twelve core modules the matrix is defined over. */
export const MODULES = [
  { id: "dashboard", label: "Dashboard & work queue" },
  { id: "intake", label: "Application intake" },
  { id: "case-detail", label: "Case detail & processing" },
  { id: "approval", label: "Review & approval workflow" },
  { id: "esign", label: "E-signature & issuance" },
  { id: "family-book", label: "Family book management" },
  { id: "registry-search", label: "Citizen & registry search" },
  { id: "master-data", label: "Master data management" },
  { id: "user-admin", label: "User & role administration" },
  { id: "payments", label: "Payments & fees" },
  { id: "reporting", label: "Reporting & analytics" },
  { id: "audit", label: "Audit log & verification" },
];

export const ACCESS_META: Record<Access, { label: string; short: string; color: string; bg: string }> = {
  full: { label: "Full access", short: "F", color: "#047857", bg: "#D1FAE5" },
  view: { label: "View only", short: "V", color: "#1D4ED8", bg: "#DBEAFE" },
  none: { label: "No access", short: "—", color: "#94A3B8", bg: "#F1F5F9" },
};

/* §11.5 access matrix — [roleId][moduleId]. */
export const DEFAULT_MATRIX: Record<string, Record<string, Access>> = {
  "village-officer": {
    dashboard: "full", intake: "full", "case-detail": "full", approval: "none", esign: "none",
    "family-book": "view", "registry-search": "view", "master-data": "none", "user-admin": "none",
    payments: "view", reporting: "view", audit: "none",
  },
  "village-chief": {
    dashboard: "full", intake: "full", "case-detail": "full", approval: "full", esign: "full",
    "family-book": "view", "registry-search": "view", "master-data": "none", "user-admin": "none",
    payments: "view", reporting: "view", audit: "view",
  },
  "district-registrar": {
    dashboard: "full", intake: "view", "case-detail": "full", approval: "full", esign: "full",
    "family-book": "view", "registry-search": "full", "master-data": "none", "user-admin": "none",
    payments: "full", reporting: "full", audit: "view",
  },
  "dops-officer": {
    dashboard: "full", intake: "none", "case-detail": "view", approval: "none", esign: "none",
    "family-book": "full", "registry-search": "full", "master-data": "view", "user-admin": "none",
    payments: "none", reporting: "view", audit: "view",
  },
  supervisor: {
    dashboard: "full", intake: "view", "case-detail": "view", approval: "full", esign: "view",
    "family-book": "view", "registry-search": "full", "master-data": "view", "user-admin": "view",
    payments: "full", reporting: "full", audit: "full",
  },
  sysadmin: {
    dashboard: "full", intake: "view", "case-detail": "view", approval: "view", esign: "view",
    "family-book": "view", "registry-search": "full", "master-data": "full", "user-admin": "full",
    payments: "view", reporting: "full", audit: "full",
  },
};

export interface OfficerUser {
  id: string;
  name: string;
  email: string;
  roleId: string;
  province: string;
  office: string;
  active: boolean;
  lastActive: string; // YYYY-MM-DD
}

const FIRST = ["Khamla", "Vilai", "Somsy", "Bounma", "Latda", "Noy", "Phout", "Manivanh", "Oudom", "Chanthala", "Souksavanh", "Viengkham", "Sengphet", "Dao", "Bounthavy", "Malaythong"];
const LAST = ["Phommachanh", "Sisoulath", "Keomanivong", "Vongphakdy", "Inthasone", "Rattanavong", "Xaiyavong", "Thammavong"];
const PROVINCES = Object.keys(PROVINCE_STATS);
/* Roles weighted the way a real deployment looks: many village officers, one admin. */
const ROLE_POOL = [
  "village-officer", "village-officer", "village-officer", "village-officer", "village-officer",
  "village-chief", "village-chief", "village-chief",
  "district-registrar", "district-registrar",
  "dops-officer", "supervisor", "sysadmin",
];

function buildUsers(count: number): OfficerUser[] {
  const out: OfficerUser[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const first = FIRST[(i * 7) % FIRST.length];
    const last = LAST[(i * 5) % LAST.length];
    const roleId = ROLE_POOL[(i * 3) % ROLE_POOL.length];
    const province = PROVINCES[(i * 11) % PROVINCES.length];
    const d = new Date(today);
    d.setDate(d.getDate() - ((i * 13) % 40));
    const role = ROLE_BY_ID[roleId];
    out.push({
      id: `USR-${String(100 + i).padStart(4, "0")}`,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last[0].toLowerCase()}@lcc.gov.la`,
      roleId,
      province,
      office:
        role.scope === "Village" ? `Ban ${last} village office`
        : role.scope === "District" ? `${province} district office`
        : role.scope === "National" ? "DoHA headquarters"
        : `${province} provincial office`,
      active: i % 11 !== 5, // a couple of suspended accounts
      lastActive: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    });
  }
  return out;
}

export const USERS: OfficerUser[] = buildUsers(46);

/* ── Master data ── */
export interface MasterItem {
  id: string;
  label: string;
  laLabel: string;
  note: string;
  active: boolean;
}

export const DEFAULT_DOCUMENT_TYPES: MasterItem[] = [
  { id: "family-book", label: "Family Book", laLabel: "ປຶ້ມສຳມະໂນຄົວ", note: "Required for residence and family book services", active: true },
  { id: "national-id", label: "National ID card", laLabel: "ບັດປະຈຳຕົວ", note: "Primary identity document", active: true },
  { id: "passport", label: "Passport", laLabel: "ໜັງສືຜ່ານແດນ", note: "Accepted for citizens abroad", active: true },
  { id: "birth-cert", label: "Birth certificate", laLabel: "ໃບແຈ້ງເກີດ", note: "Required for minors without an ID", active: true },
  { id: "hospital-notice", label: "Hospital birth notice", laLabel: "ໃບແຈ້ງເກີດຈາກໂຮງໝໍ", note: "Supporting evidence for birth declaration", active: true },
  { id: "death-notice", label: "Medical death notice", laLabel: "ໃບຢັ້ງຢືນການເສຍຊີວິດ", note: "Supporting evidence for death declaration", active: true },
  { id: "village-letter", label: "Village recommendation letter", laLabel: "ໜັງສືແນະນຳຈາກບ້ານ", note: "Legacy paper flow; being phased out", active: false },
];

export const DEFAULT_ID_TYPES: MasterItem[] = [
  { id: "uin", label: "Unique Identification Number (UIN)", laLabel: "ເລກປະຈຳຕົວ", note: "12 characters, issued by DoPS", active: true },
  { id: "eid", label: "eID (national digital identity)", laLabel: "ອີໄອດີ", note: "Used for verification and auto-populate (FR-2)", active: true },
  { id: "family-book-no", label: "Family book number", laLabel: "ເລກປຶ້ມສຳມະໂນຄົວ", note: "Household reference", active: true },
];

/* ── Platform configuration ── */
export interface PlatformConfig {
  defaultLanguage: "lo" | "en";
  bilingualLabels: boolean;
  sessionTimeoutMinutes: number;
  offlineSyncMinutes: number;
  auditRetentionYears: number;
  verificationBaseUrl: string;
  caEndpoint: string;
  maintenanceMode: boolean;
  requireTwoFactor: boolean;
  allowReissue: boolean;
}

export const DEFAULT_CONFIG: PlatformConfig = {
  defaultLanguage: "lo",
  bilingualLabels: true,
  sessionTimeoutMinutes: 30,
  offlineSyncMinutes: 15,
  auditRetentionYears: 10,
  verificationBaseUrl: "https://verify.lcc.gov.la/c/",
  caEndpoint: "https://ca.gov.la/api/v1/sign",
  maintenanceMode: false,
  requireTwoFactor: true,
  allowReissue: true,
};

export const JURISDICTION_SUMMARY = {
  provinces: PROVINCES.length,
  districts: 148,
  villages: 8_507,
};
