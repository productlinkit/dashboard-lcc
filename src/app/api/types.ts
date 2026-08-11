/*
 * The wire types the back-office dashboard consumes, mirroring what the Go API
 * sends.
 *
 * Money is a whole number of kip in a *_lak field. Dates are "YYYY-MM-DD";
 * timestamps are RFC3339. Bilingual text is a { en, lo } pair.
 */

export interface Bilingual {
  en: string;
  lo: string;
}

export type Lang = "en" | "lo";

export function text(value: Bilingual | undefined | null, lang: Lang = "en"): string {
  if (!value) return "";
  const wanted = lang === "lo" ? value.lo : value.en;
  return wanted || value.en || value.lo || "";
}

/* ── Case lifecycle ────────────────────────────────────────────────────── */

export type CaseStatus =
  | "draft"
  | "submitted"
  | "certified"
  | "under-review"
  | "returned"
  | "registered"
  | "issued"
  | "rejected"
  | "revoked";

export type PaymentState = "paid" | "pending" | "failed" | "refunded" | "free";

export interface StatusTransition {
  action: string;
  to: CaseStatus;
  label: string;
  roles: string[] | null;
  requires_reason: boolean;
  requires_signature: boolean;
  requires_paid_fee: boolean;
}

export interface StatusMeta {
  status: CaseStatus;
  label: string;
  label_lo: string;
  color: string;
  background: string;
  meaning: string;
  acting_role: string;
  is_open: boolean;
  is_terminal: boolean;
  is_editable: boolean;
  transitions: StatusTransition[];
}

export interface StatusCatalogue {
  statuses: StatusMeta[];
  pipeline_order: CaseStatus[];
}

/* ── Identity and access ───────────────────────────────────────────────── */

export type ModuleAccess = "full" | "view" | "none";

export type RoleCode =
  | "village-officer"
  | "village-chief"
  | "district-registrar"
  | "dops-officer"
  | "supervisor"
  | "sysadmin";

export interface Jurisdiction {
  province_id?: string;
  province_name?: string;
  district_id?: string;
  district_name?: string;
  village_id?: string;
  village_name?: string;
}

export interface OfficerUser {
  id: string;
  employee_no: string;
  name: string;
  email: string;
  phone: string;
  role_id?: string;
  role_code: RoleCode | string;
  role_name: Bilingual;
  role_scope: string;
  permissions: string[] | null;
  office_id?: string;
  office_name: string;
  jurisdiction: Jurisdiction;
  avatar_url?: string;
  active: boolean;
  two_factor: boolean;
  last_active_at?: string;
  created_at?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in?: number;
  expires_at?: string;
}

export interface OfficerSession {
  actor: "officer";
  user: OfficerUser;
  module_access: Record<string, ModuleAccess>;
  tokens: AuthTokens;
}

export interface Role {
  id: string;
  code: string;
  name: Bilingual;
  scope: string;
  summary: string;
  permissions: string[] | null;
  is_system: boolean;
  sort_order: number;
}

export interface AccessMatrix {
  roles: string[];
  modules: string[];
  matrix: Record<string, Record<string, ModuleAccess>>;
}

export interface ModuleDescriptor {
  id: string;
  label: string;
}

export interface Office {
  id: string;
  code: string;
  name: Bilingual;
  kind: string;
  level: string;
  jurisdiction?: Jurisdiction;
  address: string;
  phone: string;
  email: string;
  active: boolean;
}

/* ── Locations ─────────────────────────────────────────────────────────── */

export interface Province {
  id: string;
  code: string;
  name: Bilingual;
  region: string;
  capital: string;
  latitude: number;
  longitude: number;
  geo_name: string;
  active: boolean;
}

export interface District {
  id: string;
  province_id: string;
  code: string;
  name: Bilingual;
  active: boolean;
}

export interface Village {
  id: string;
  district_id: string;
  province_id: string;
  code: string;
  name: Bilingual;
  active: boolean;
}

/* ── Service catalogue ─────────────────────────────────────────────────── */

export interface Service {
  id: string;
  code: string;
  category_code: string;
  name: Bilingual;
  short_name: string;
  description: Bilingual;
  icon: string;
  color: string;
  fee_lak: number;
  fee_max_lak: number;
  sla_days: number;
  processing_time: Bilingual;
  required_docs: Bilingual[];
  is_phase1: boolean;
  active: boolean;
}

export type FieldRequirement = "mandatory" | "conditional" | "optional";

export interface FormFieldOption {
  value: string;
  label: Bilingual;
}

export interface FormField {
  id: string;
  key: string;
  label: Bilingual;
  description: string;
  type: string;
  requirement: FieldRequirement;
  options: FormFieldOption[] | null;
  lookup_key: string;
  sort_order: number;
}

export interface FormSection {
  id: string;
  key: string;
  title: Bilingual;
  note?: string;
  instances: string[] | null;
  repeatable: boolean;
  sort_order: number;
  fields: FormField[];
}

export interface FormSchema {
  id: string;
  service_code: string;
  service_name: Bilingual;
  version: number;
  source: string;
  section_count: number;
  field_count: number;
  sections: FormSection[];
}

export interface ReferenceItem {
  id: string;
  type: string;
  code: string;
  label: Bilingual;
  note?: string;
  active: boolean;
  sort_order: number;
}

/* ── Cases ─────────────────────────────────────────────────────────────── */

export interface ApplicationRow {
  id: string;
  reference_no: string;
  service_code: string;
  service_name: Bilingual;
  applicant: string;
  applicant_id?: string;
  citizen_id?: string;
  subject_name: string;
  status: CaseStatus;
  status_label: Bilingual;
  payment_state: PaymentState;
  fee_lak: number;
  channel: string;
  jurisdiction: Jurisdiction;
  assigned_officer_id?: string;
  assigned_officer?: string;
  sla_days: number;
  days_waiting: number;
  days_overdue: number;
  is_overdue: boolean;
  submitted_at?: string;
  event_date?: string;
  due_at?: string;
  issued_at?: string;
  closed_at?: string;
  created_at: string;
  updated_at: string;
  reason_code?: string;
  reason_note?: string;
  certificate_id?: string;
  certificate_no?: string;
}

export interface Attachment {
  id: string;
  kind: "document" | "photo" | "signature" | "stamp";
  slot: string;
  label: string;
  file_name: string;
  file_url: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface CaseEvent {
  id: string;
  action: string;
  from_status?: CaseStatus;
  to_status: CaseStatus;
  status_label?: Bilingual;
  actor_id?: string;
  actor_name?: string;
  actor_role?: string;
  reason_code?: string;
  note?: string;
  occurred_at: string;
}

export interface AllowedAction {
  action: string;
  to: CaseStatus;
  label: string;
  requires_reason: boolean;
  requires_signature: boolean;
  requires_paid_fee: boolean;
}

export interface ApplicationDetail extends ApplicationRow {
  form_data: Record<string, unknown>;
  attachments: Attachment[];
  timeline?: CaseEvent[];
  allowed_actions?: AllowedAction[];
  linked_reference_no?: string;
}

export interface CaseTimeline {
  application_id: string;
  reference_no: string;
  status: CaseStatus;
  events: CaseEvent[];
}

export interface ApplicationSummary {
  total: number;
  overdue: number;
  by_status: Array<{ status: CaseStatus; label?: Bilingual; count: number }>;
  by_service: Array<{ service_code: string; label?: Bilingual; count: number }>;
}

export interface QueueRow extends ApplicationRow {
  stage?: string;
  stage_owner?: string;
}

export interface QueueSummary {
  total: number;
  overdue: number;
  due_today: number;
  by_stage: Array<{ status: CaseStatus; stage: string; owner: string; count: number; overdue: number }>;
}

export interface BulkActionResult {
  succeeded: string[];
  failed: Array<{ application_id: string; message: string }>;
}

/* ── Registry ──────────────────────────────────────────────────────────── */

export interface PersonRow {
  id: string;
  uin: string;
  national_id_no: string;
  name: Bilingual;
  gender: string;
  date_of_birth?: string;
  age: number;
  nationality: string;
  relation: string;
  marital_status?: string;
  household_no: string;
  status: string;
  jurisdiction?: Jurisdiction;
  province_name?: string;
  district_name?: string;
  village_name?: string;
  has_active_watchlist?: boolean;
}

export interface PersonDocument {
  id: string;
  type: string;
  title?: Bilingual;
  number: string;
  issued_at?: string;
  expires_at?: string;
  status: string;
  authority: string;
}

export interface PersonLifeEvent {
  id: string;
  event_type: string;
  title: string;
  detail: string;
  occurred_at: string;
  reference_no?: string;
}

export interface PersonProfile {
  person: PersonRow;
  household?: HouseholdSummary;
  documents: PersonDocument[];
  life_events: PersonLifeEvent[];
  watchlist?: WatchlistEntry | null;
}

export interface PopulationSummary {
  citizens: number;
  households: number;
  avg_household_size: number;
  male: number;
  female: number;
  active: number;
  deceased: number;
  moved: number;
  minors: number;
  seniors: number;
  working_age: number;
  dependants: number;
  dependency_ratio: number;
  foreign: number;
  local: number;
  /* Marital standing of the register as it stands today. */
  single: number;
  married: number;
  divorced: number;
  widowed: number;
  births: number;
  deaths: number;
  moved_in: number;
  moved_out: number;
  /* Civil events over the window — reported, but not part of growth. */
  marriages: number;
  divorces: number;
  natural_increase: number;
  net_migration: number;
  growth_abs: number;
  growth_pct: number;
}

export interface AgeBand {
  band: string;
  male: number;
  female: number;
}

export interface DemographicMonth {
  month: string;
  births: number;
  deaths: number;
  moved_in: number;
  moved_out: number;
  marriages: number;
  divorces: number;
  population: number;
}

export interface RegionStat {
  province: string;
  province_id?: string;
  population: number;
  households: number;
  male: number;
  female: number;
  foreign: number;
  working_age: number;
  growth_pct: number;
}

export interface AreaChild {
  id?: string;
  name: string;
  population: number;
  households: number;
}

export interface AreaSummary {
  level: "country" | "province" | "district" | "village";
  name: string;
  population: number;
  households: number;
  male: number;
  female: number;
  working_age: number;
  minors: number;
  seniors: number;
  foreign: number;
  single: number;
  married: number;
  divorced: number;
  widowed: number;
  age_bands: AgeBand[];
  child_label: string;
  children: AreaChild[];
}

export interface MapProvince {
  province: string;
  geo_name: string;
  province_id?: string;
  population: number;
  households: number;
  applications: number;
  issued: number;
  revenue_lak: number;
  latitude: number;
  longitude: number;
  value?: number;
}

/* ── Households ────────────────────────────────────────────────────────── */

export interface HouseholdMember {
  id: string;
  person_id?: string;
  uin: string;
  name: string;
  gender: string;
  date_of_birth?: string;
  age?: number;
  relation: string;
  nationality: string;
  /* Read through from the person register — blank when no person is linked. */
  marital_status?: string;
  status: string;
  photo_url?: string;
}

export interface HouseholdSummary {
  id: string;
  household_no: string;
  head_name: string;
  head_person_id?: string;
  address: string;
  house_no: string;
  unit: string;
  group: string;
  nationality?: string;
  total_members: number;
  male_members: number;
  female_members: number;
  status: string;
  registered_at?: string;
  issued_at?: string;
  reissue_count?: number;
  jurisdiction?: Jurisdiction;
}

export interface HouseholdDetail extends HouseholdSummary {
  members: HouseholdMember[];
}

/* ── Money ─────────────────────────────────────────────────────────────── */

export interface PaymentMethod {
  id: string;
  code: string;
  label: Bilingual;
  kind: string;
  enabled: boolean;
  fee_percent: number;
  settlement: string;
  note: string;
  color: string;
}

export interface Transaction {
  id: string;
  receipt_no: string;
  application_id?: string;
  reference_no?: string;
  payer_name: string;
  service_code: string;
  service_name?: Bilingual;
  jurisdiction?: Jurisdiction;
  kind: string;
  method_code: string;
  method_label?: Bilingual;
  amount_lak: number;
  fee_lak: number;
  net_lak: number;
  status: string;
  paid_at?: string;
  date?: string;
  cashier_name?: string;
  note?: string;
}

export interface RevenueBucket {
  key: string;
  label: string;
  amount_lak: number;
  net_lak: number;
  count: number;
  color?: string;
}

export interface TransactionSummary {
  gross_lak: number;
  net_lak: number;
  provider_fee_lak: number;
  count: number;
  by_status: RevenueBucket[];
  by_method: RevenueBucket[];
  by_service: RevenueBucket[];
  by_day: RevenueBucket[];
}

export interface ReconciliationRow {
  method_code: string;
  method_label?: Bilingual;
  settlement: string;
  collected_lak: number;
  provider_fee_lak: number;
  net_lak: number;
  count: number;
  unreconciled: number;
}

export interface ServicePricing {
  service_code: string;
  service_name?: Bilingual;
  fee_lak: number;
  copy_fee_lak: number;
  late_fine_lak: number;
  note?: string;
}

/* ── Certificates and watchlist ────────────────────────────────────────── */

export interface Certificate {
  id: string;
  certificate_no: string;
  application_id?: string;
  reference_no?: string;
  service_code: string;
  service_name?: Bilingual;
  holder_name: string;
  uin?: string;
  jurisdiction?: Jurisdiction;
  issued_at: string;
  issued_by_name?: string;
  status: string;
  verify_code: string;
  verify_url?: string;
  revoked_at?: string;
  revoke_reason?: string;
  document_hash?: string;
}

export type WatchCategory = "wanted" | "travel-ban" | "missing" | "summons";
export type WatchStatus = "active" | "cleared" | "expired";
export type RiskLevel = "high" | "medium" | "low";

export interface WatchlistEntry {
  id: string;
  notice_no: string;
  uin: string;
  name: string;
  category: WatchCategory | string;
  offence: string;
  authority: string;
  issued_at: string;
  expires_at?: string;
  status: WatchStatus | string;
  risk: RiskLevel | string;
  note: string;
  cleared_at?: string;
}

export interface WatchlistSummary {
  total: number;
  active: number;
  high_risk: number;
  cleared: number;
}

/* ── Alerts and notifications ──────────────────────────────────────────── */

export type Severity = "critical" | "warning" | "info";
export type AlertCategory = "sla" | "payment" | "registry" | "system" | "security";

export interface Alert {
  id: string;
  code: string;
  severity: Severity | string;
  category: AlertCategory | string;
  title: string;
  message: string;
  application_id?: string;
  case_ref?: string;
  actor?: string;
  raised_at: string;
  acknowledged_at?: string;
  resolved_at?: string;
  relative_time?: string;
}

export interface AlertSummary {
  total: number;
  unacknowledged: number;
  by_severity: Array<{ severity: string; count: number }>;
  by_category: Array<{ category: string; count: number }>;
}

export interface AlertRule {
  id: string;
  code: string;
  label: Bilingual;
  description: string;
  severity: string;
  enabled: boolean;
  threshold?: number | null;
  unit?: string;
  channels: { in_app: boolean; email: boolean; sms: boolean };
}

export interface NotificationTemplate {
  id: string;
  code: string;
  name: Bilingual;
  subject: Bilingual;
  body: Bilingual;
  channels: string[] | null;
  variables: string[] | null;
  active: boolean;
}

export interface Notification {
  id: string;
  title: Bilingual;
  body: Bilingual;
  category: string;
  severity: string;
  action_url?: string;
  read_at?: string;
  sent_at: string;
}

/* ── Dashboard analytics ───────────────────────────────────────────────── */

export interface KpiValue {
  value?: number;
  value_lak?: number;
  previous?: number;
  previous_lak?: number;
  delta_pct: number;
  delta_points?: number;
  direction: "up" | "down" | "flat" | string;
}

export interface DashboardKpis {
  total_applications: KpiValue;
  issued: KpiValue;
  awaiting_action: KpiValue;
  needs_correction: KpiValue;
  submitted: KpiValue;
  revenue_lak: KpiValue;
  fees_today_lak: KpiValue;
  avg_processing_days: KpiValue;
  sla_compliance_pct: KpiValue;
}

export interface VolumePoint {
  date?: string;
  day?: string;
  month?: string;
  applications: number;
  issued?: number;
}

export interface ServiceShare {
  service_code: string;
  label: Bilingual;
  count: number;
  color: string;
}

export interface StatusBreakdown {
  status: CaseStatus;
  label: Bilingual;
  count: number;
  color?: string;
}

export interface ProvinceStat {
  province: string;
  geo_name: string;
  count: number;
}

export interface SlaRow {
  service_code: string;
  label?: Bilingual;
  target_days: number;
  median_days: number;
  p90_days: number;
  on_time_pct: number;
  breached: number;
}

export interface OfficerWorkload {
  officer_id: string;
  name: string;
  assigned: number;
  completed: number;
  overdue: number;
  avg_days: number;
}

export interface OperationalReportRow {
  service_code: string;
  label: Bilingual;
  volume: number;
  issued: number;
  revoked: number;
  pending: number;
  overdue: number;
  avg_days: number;
  on_time_pct: number;
}

export interface RevenueReport {
  by_service: RevenueBucket[];
  by_method: RevenueBucket[];
  by_province: RevenueBucket[];
  by_day: RevenueBucket[];
  total_lak?: number;
}

export interface RegistrationReport {
  rows: Array<{ period: string; births: number; deaths: number; marriages: number; divorces: number; residence: number }>;
}

export interface AuditLog {
  id: string;
  actor_id?: string;
  actor_type?: string;
  actor_name?: string;
  actor_role?: string;
  action: string;
  module?: string;
  entity_type?: string;
  entity_id?: string;
  entity_ref?: string;
  reason?: string;
  ip?: string;
  request_id?: string;
  occurred_at: string;
}

/* ── Master data and settings ──────────────────────────────────────────── */

export interface MasterItem {
  id: string;
  type: string;
  code: string;
  label: Bilingual;
  note?: string;
  active: boolean;
  sort_order: number;
}

export interface PlatformSetting {
  key: string;
  value: string;
  type: string;
  group: string;
  label?: Bilingual;
  description?: string;
  editable: boolean;
}

export interface JurisdictionSummary {
  provinces: number;
  districts: number;
  villages: number;
  offices: number;
  users: number;
}

/* ── Chat ──────────────────────────────────────────────────────────────── */

export interface ChatThread {
  id: string;
  citizen_id: string;
  citizen_name?: string;
  subject: string;
  topic: string;
  status: string;
  assigned_id?: string;
  assigned_name?: string;
  application_id?: string;
  last_message_at?: string;
  unread_agent: number;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  sender_type: string;
  sender_name: string;
  body: string;
  sent_at: string;
}
