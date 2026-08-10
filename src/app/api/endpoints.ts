/*
 * Every backend call the back-office dashboard makes.
 *
 * A page imports the function it needs rather than assembling a path, so a
 * change to the API surface shows up here as a compile error instead of a 404
 * at runtime.
 */

import { api, type QueryValue } from "./client";
import type {
  AccessMatrix,
  Alert,
  AlertRule,
  AlertSummary,
  ApplicationDetail,
  ApplicationRow,
  ApplicationSummary,
  AreaSummary,
  AuditLog,
  BulkActionResult,
  CaseTimeline,
  Certificate,
  ChatMessage,
  ChatThread,
  DashboardKpis,
  DemographicMonth,
  District,
  FormSchema,
  HouseholdDetail,
  HouseholdSummary,
  JurisdictionSummary,
  MasterItem,
  ModuleDescriptor,
  NotificationTemplate,
  Office,
  OfficerSession,
  OfficerUser,
  OfficerWorkload,
  OperationalReportRow,
  PaymentMethod,
  PersonProfile,
  PersonRow,
  PlatformSetting,
  PopulationSummary,
  Province,
  ProvinceStat,
  QueueRow,
  QueueSummary,
  ReconciliationRow,
  ReferenceItem,
  RegionStat,
  RegistrationReport,
  RevenueReport,
  Role,
  Service,
  ServicePricing,
  ServiceShare,
  SlaRow,
  StatusBreakdown,
  StatusCatalogue,
  Transaction,
  TransactionSummary,
  Village,
  VolumePoint,
  WatchlistEntry,
  WatchlistSummary,
  AgeBand,
  MapProvince,
  CaseEvent,
  Attachment,
} from "./types";

type Query = Record<string, QueryValue>;

/* ── Auth ──────────────────────────────────────────────────────────────── */

export const auth = {
  login: (body: { email: string; password: string }) =>
    api.post<OfficerSession>("/auth/officer/login", body, { anonymous: true }),

  me: () => api.get<{ actor: string; user: OfficerUser; module_access?: Record<string, string> }>("/auth/me"),

  logout: (refresh_token: string) => api.post<unknown>("/auth/logout", { refresh_token }),

  changePassword: (body: { current_password: string; new_password: string }) =>
    api.post<unknown>("/auth/change-password", body),
};

/* ── Shared catalogues ─────────────────────────────────────────────────── */

export const catalog = {
  services: (query?: Query, signal?: AbortSignal) =>
    api.get<Service[]>("/services", { query, signal, anonymous: true }),
  service: (code: string, signal?: AbortSignal) =>
    api.get<Service>(`/services/${code}`, { signal, anonymous: true }),
  formSchema: (code: string, signal?: AbortSignal) =>
    api.get<FormSchema>(`/services/${code}/form-schema`, { signal, anonymous: true }),
  referenceList: (type: string, signal?: AbortSignal) =>
    api.get<ReferenceItem[]>(`/reference-lists/${type}`, { signal, anonymous: true }),
  statusCatalogue: (signal?: AbortSignal) =>
    api.get<StatusCatalogue>("/status-catalogue", { signal, anonymous: true }),
};

export const locations = {
  provinces: (signal?: AbortSignal) => api.get<Province[]>("/locations/provinces", { signal, anonymous: true }),
  districts: (provinceId: string, signal?: AbortSignal) =>
    api.get<District[]>(`/locations/provinces/${provinceId}/districts`, { signal, anonymous: true }),
  villages: (districtId: string, signal?: AbortSignal) =>
    api.paged<Village>(`/locations/districts/${districtId}/villages`, {
      query: { per_page: 200 },
      signal,
      anonymous: true,
    }),
};

/* ── Applications ──────────────────────────────────────────────────────── */

export const applications = {
  list: (query?: Query, signal?: AbortSignal) => api.paged<ApplicationRow>("/admin/applications", { query, signal }),
  summary: (query?: Query, signal?: AbortSignal) =>
    api.get<ApplicationSummary>("/admin/applications/summary", { query, signal }),
  get: (id: string, signal?: AbortSignal) => api.get<ApplicationDetail>(`/admin/applications/${id}`, { signal }),
  update: (id: string, body: { form_data: Record<string, unknown> }) =>
    api.patch<ApplicationDetail>(`/admin/applications/${id}`, body),
  intake: (body: Record<string, unknown>) => api.post<ApplicationDetail>("/admin/applications", body),
  assign: (id: string, officerId: string) =>
    api.post<ApplicationDetail>(`/admin/applications/${id}/assign`, { officer_id: officerId }),
  timeline: (id: string, signal?: AbortSignal) => api.get<CaseTimeline>(`/applications/${id}/timeline`, { signal }),
  attachments: (id: string, file: File, slot: string, kind: string, label?: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("slot", slot);
    form.append("kind", kind);
    if (label) form.append("label", label);
    return api.upload<Attachment>(`/applications/${id}/attachments`, form);
  },
  /** CSV of the filtered list; the caller turns it into a download. */
  exportCSV: (query?: Query) => api.get<string>("/admin/applications/export", { query, raw: true }),
};

/* ── Approval workflow ─────────────────────────────────────────────────── */

export interface TransitionBody {
  reason_code?: string;
  reason?: string;
  note?: string;
  signature_data_url?: string;
  stamp_data_url?: string;
}

export const workflow = {
  queue: (query?: Query, signal?: AbortSignal) => api.paged<QueueRow>("/admin/cases/queue", { query, signal }),
  queueSummary: (query?: Query, signal?: AbortSignal) =>
    api.get<QueueSummary>("/admin/cases/queue/summary", { query, signal }),
  actions: (id: string, signal?: AbortSignal) =>
    api.get<{ status: string; actions: ApplicationDetail["allowed_actions"] }>(`/admin/cases/${id}/actions`, { signal }),
  signatures: (id: string, signal?: AbortSignal) => api.get<Attachment[]>(`/admin/cases/${id}/signatures`, { signal }),

  certify: (id: string, body: TransitionBody) => api.post<ApplicationDetail>(`/admin/cases/${id}/certify`, body),
  receive: (id: string, body: TransitionBody = {}) => api.post<ApplicationDetail>(`/admin/cases/${id}/receive`, body),
  register: (id: string, body: TransitionBody) => api.post<ApplicationDetail>(`/admin/cases/${id}/register`, body),
  issue: (id: string, body: TransitionBody = {}) => api.post<ApplicationDetail>(`/admin/cases/${id}/issue`, body),
  returnCase: (id: string, body: TransitionBody) => api.post<ApplicationDetail>(`/admin/cases/${id}/return`, body),
  reject: (id: string, body: TransitionBody) => api.post<ApplicationDetail>(`/admin/cases/${id}/reject`, body),
  revoke: (id: string, body: TransitionBody) => api.post<ApplicationDetail>(`/admin/cases/${id}/revoke`, body),

  bulk: (body: { application_ids: string[]; action: string; reason?: string; reason_code?: string }) =>
    api.post<BulkActionResult>("/admin/cases/bulk-action", body),
};

/* ── Registry ──────────────────────────────────────────────────────────── */

export const registry = {
  persons: (query?: Query, signal?: AbortSignal) => api.paged<PersonRow>("/admin/registry/persons", { query, signal }),
  person: (uin: string, signal?: AbortSignal) => api.get<PersonProfile>(`/admin/registry/persons/${uin}`, { signal }),
  personDocuments: (uin: string, signal?: AbortSignal) =>
    api.get<PersonProfile["documents"]>(`/admin/registry/persons/${uin}/documents`, { signal }),
  personLifeEvents: (uin: string, signal?: AbortSignal) =>
    api.get<PersonProfile["life_events"]>(`/admin/registry/persons/${uin}/life-events`, { signal }),

  populationSummary: (query?: Query, signal?: AbortSignal) =>
    api.get<PopulationSummary>("/admin/registry/population/summary", { query, signal }),
  ageDistribution: (query?: Query, signal?: AbortSignal) =>
    api.get<AgeBand[]>("/admin/registry/population/age-distribution", { query, signal }),
  trend: (query?: Query, signal?: AbortSignal) =>
    api.get<DemographicMonth[]>("/admin/registry/population/trend", { query, signal }),
  regions: (query?: Query, signal?: AbortSignal) =>
    api.get<RegionStat[]>("/admin/registry/population/regions", { query, signal }),

  area: (query?: Query, signal?: AbortSignal) => api.get<AreaSummary>("/admin/registry/areas", { query, signal }),
  mapProvinces: (query?: Query, signal?: AbortSignal) =>
    api.get<MapProvince[]>("/admin/registry/map/provinces", { query, signal }),
};

/* ── Households ────────────────────────────────────────────────────────── */

export const households = {
  list: (query?: Query, signal?: AbortSignal) => api.paged<HouseholdSummary>("/admin/households", { query, signal }),
  get: (id: string, signal?: AbortSignal) => api.get<HouseholdDetail>(`/admin/households/${id}`, { signal }),
  byNo: (householdNo: string, signal?: AbortSignal) =>
    api.get<HouseholdDetail>(`/admin/households/by-no/${householdNo}`, { signal }),
  create: (body: Record<string, unknown>) => api.post<HouseholdDetail>("/admin/households", body),
  update: (id: string, body: Record<string, unknown>) => api.patch<HouseholdDetail>(`/admin/households/${id}`, body),
  addMember: (id: string, body: Record<string, unknown>) =>
    api.post<HouseholdDetail>(`/admin/households/${id}/members`, body),
  updateMember: (id: string, memberId: string, body: Record<string, unknown>) =>
    api.patch<HouseholdDetail>(`/admin/households/${id}/members/${memberId}`, body),
  removeMember: (id: string, memberId: string, body: { reason: string; left_at?: string }) =>
    api.delete<HouseholdDetail>(`/admin/households/${id}/members/${memberId}`, { body }),
  transferHead: (id: string, memberId: string) =>
    api.post<HouseholdDetail>(`/admin/households/${id}/transfer-head`, { member_id: memberId }),
  reissue: (id: string) => api.post<HouseholdDetail>(`/admin/households/${id}/reissue`, {}),
  history: (id: string, signal?: AbortSignal) =>
    api.get<CaseEvent[]>(`/admin/households/${id}/history`, { signal }),
};

/* ── Payments ──────────────────────────────────────────────────────────── */

export const payments = {
  transactions: (query?: Query, signal?: AbortSignal) =>
    api.paged<Transaction>("/admin/payments/transactions", { query, signal }),
  summary: (query?: Query, signal?: AbortSignal) =>
    api.get<TransactionSummary>("/admin/payments/transactions/summary", { query, signal }),
  transaction: (id: string, signal?: AbortSignal) =>
    api.get<Transaction>(`/admin/payments/transactions/${id}`, { signal }),
  confirm: (id: string, body?: { external_ref?: string }) =>
    api.post<Transaction>(`/admin/payments/transactions/${id}/confirm`, body ?? {}),
  refund: (id: string, body: { reason: string }) =>
    api.post<Transaction>(`/admin/payments/transactions/${id}/refund`, body),
  create: (body: Record<string, unknown>) => api.post<Transaction>("/admin/payments/transactions", body),
  reconciliation: (query?: Query, signal?: AbortSignal) =>
    api.get<ReconciliationRow[]>("/admin/payments/reconciliation", { query, signal }),
  methods: (signal?: AbortSignal) => api.get<PaymentMethod[]>("/admin/payments/methods", { signal }),
  createMethod: (body: Record<string, unknown>) => api.post<PaymentMethod>("/admin/payments/methods", body),
  updateMethod: (id: string, body: Record<string, unknown>) =>
    api.patch<PaymentMethod>(`/admin/payments/methods/${id}`, body),
  pricing: (signal?: AbortSignal) => api.get<ServicePricing[]>("/admin/payments/pricing", { signal }),
  updatePricing: (serviceCode: string, body: Record<string, unknown>) =>
    api.put<ServicePricing>(`/admin/payments/pricing/${serviceCode}`, body),
  exportCSV: (query?: Query) => api.get<string>("/admin/payments/export", { query, raw: true }),
};

/* ── Certificates and watchlist ────────────────────────────────────────── */

export const verification = {
  certificates: (query?: Query, signal?: AbortSignal) =>
    api.paged<Certificate>("/admin/certificates", { query, signal }),
  certificate: (id: string, signal?: AbortSignal) => api.get<Certificate>(`/admin/certificates/${id}`, { signal }),
  reissue: (id: string, body: { reason: string }) => api.post<Certificate>(`/admin/certificates/${id}/reissue`, body),
  revoke: (id: string, body: { reason: string }) => api.post<Certificate>(`/admin/certificates/${id}/revoke`, body),

  watchlist: (query?: Query, signal?: AbortSignal) =>
    api.paged<WatchlistEntry>("/admin/watchlist", { query, signal }),
  watchlistSummary: (signal?: AbortSignal) => api.get<WatchlistSummary>("/admin/watchlist/summary", { signal }),
  createWatchlist: (body: Record<string, unknown>) => api.post<WatchlistEntry>("/admin/watchlist", body),
  updateWatchlist: (id: string, body: Record<string, unknown>) =>
    api.patch<WatchlistEntry>(`/admin/watchlist/${id}`, body),
  clearWatchlist: (id: string, body: { note?: string }) =>
    api.post<WatchlistEntry>(`/admin/watchlist/${id}/clear`, body),
  checkWatchlist: (uin: string, signal?: AbortSignal) =>
    api.get<WatchlistEntry | null>(`/admin/watchlist/check/${uin}`, { signal }),
};

/* ── Alerts and notifications ──────────────────────────────────────────── */

export const alerts = {
  list: (query?: Query, signal?: AbortSignal) => api.paged<Alert>("/admin/alerts", { query, signal }),
  summary: (query?: Query, signal?: AbortSignal) => api.get<AlertSummary>("/admin/alerts/summary", { query, signal }),
  acknowledge: (id: string) => api.post<Alert>(`/admin/alerts/${id}/acknowledge`, {}),
  resolve: (id: string) => api.post<Alert>(`/admin/alerts/${id}/resolve`, {}),
  acknowledgeAll: () => api.post<unknown>("/admin/alerts/read-all", {}),
  rules: (signal?: AbortSignal) => api.get<AlertRule[]>("/admin/alert-rules", { signal }),
  updateRule: (code: string, body: Record<string, unknown>) =>
    api.patch<AlertRule>(`/admin/alert-rules/${code}`, body),
  templates: (signal?: AbortSignal) => api.get<NotificationTemplate[]>("/admin/notification-templates", { signal }),
  updateTemplate: (code: string, body: Record<string, unknown>) =>
    api.patch<NotificationTemplate>(`/admin/notification-templates/${code}`, body),
};

/* ── Analytics ─────────────────────────────────────────────────────────── */

export const dashboard = {
  kpis: (query?: Query, signal?: AbortSignal) => api.get<DashboardKpis>("/admin/dashboard/kpis", { query, signal }),
  volumeDaily: (query?: Query, signal?: AbortSignal) =>
    api.get<VolumePoint[]>("/admin/dashboard/volume/daily", { query, signal }),
  volumeWeekly: (query?: Query, signal?: AbortSignal) =>
    api.get<VolumePoint[]>("/admin/dashboard/volume/weekly", { query, signal }),
  volumeMonthly: (query?: Query, signal?: AbortSignal) =>
    api.get<VolumePoint[]>("/admin/dashboard/volume/monthly", { query, signal }),
  serviceShare: (query?: Query, signal?: AbortSignal) =>
    api.get<ServiceShare[]>("/admin/dashboard/service-share", { query, signal }),
  statusBreakdown: (query?: Query, signal?: AbortSignal) =>
    api.get<StatusBreakdown[]>("/admin/dashboard/status-breakdown", { query, signal }),
  provinceStats: (query?: Query, signal?: AbortSignal) =>
    api.get<ProvinceStat[]>("/admin/dashboard/province-stats", { query, signal }),
  sla: (query?: Query, signal?: AbortSignal) => api.get<SlaRow[]>("/admin/dashboard/sla", { query, signal }),
  officerWorkload: (query?: Query, signal?: AbortSignal) =>
    api.get<OfficerWorkload[]>("/admin/dashboard/officer-workload", { query, signal }),
  recentActivity: (query?: Query, signal?: AbortSignal) =>
    api.get<CaseEvent[]>("/admin/dashboard/recent-activity", { query, signal }),
};

export const reports = {
  operational: (query?: Query, signal?: AbortSignal) =>
    api.get<{ rows: OperationalReportRow[] }>("/admin/reports/operational", { query, signal }),
  revenue: (query?: Query, signal?: AbortSignal) => api.get<RevenueReport>("/admin/reports/revenue", { query, signal }),
  registration: (query?: Query, signal?: AbortSignal) =>
    api.get<RegistrationReport>("/admin/reports/registration", { query, signal }),
  audit: (query?: Query, signal?: AbortSignal) => api.paged<AuditLog>("/admin/reports/audit", { query, signal }),
  exportCSV: (report: string, query?: Query) =>
    api.get<string>(`/admin/reports/${report}/export`, { query, raw: true }),
};

/* ── Administration ────────────────────────────────────────────────────── */

export const admin = {
  users: (query?: Query, signal?: AbortSignal) => api.paged<OfficerUser>("/admin/users", { query, signal }),
  user: (id: string, signal?: AbortSignal) => api.get<OfficerUser>(`/admin/users/${id}`, { signal }),
  createUser: (body: Record<string, unknown>) =>
    api.post<OfficerUser & { password?: string }>("/admin/users", body),
  updateUser: (id: string, body: Record<string, unknown>) => api.patch<OfficerUser>(`/admin/users/${id}`, body),
  activateUser: (id: string) => api.post<OfficerUser>(`/admin/users/${id}/activate`, {}),
  deactivateUser: (id: string) => api.post<OfficerUser>(`/admin/users/${id}/deactivate`, {}),
  resetUserPassword: (id: string) => api.post<{ password: string }>(`/admin/users/${id}/reset-password`, {}),

  roles: (signal?: AbortSignal) => api.get<Role[]>("/admin/roles", { signal }),
  createRole: (body: Record<string, unknown>) => api.post<Role>("/admin/roles", body),
  updateRole: (code: string, body: Record<string, unknown>) => api.patch<Role>(`/admin/roles/${code}`, body),

  accessMatrix: (signal?: AbortSignal) => api.get<AccessMatrix>("/admin/access-matrix", { signal }),
  setModuleAccess: (body: { role_code: string; module: string; access: string }) =>
    api.put<AccessMatrix>("/admin/access-matrix", body),
  modules: (signal?: AbortSignal) => api.get<ModuleDescriptor[]>("/admin/modules", { signal }),

  offices: (query?: Query, signal?: AbortSignal) => api.paged<Office>("/admin/offices", { query, signal }),
  createOffice: (body: Record<string, unknown>) => api.post<Office>("/admin/offices", body),
  updateOffice: (id: string, body: Record<string, unknown>) => api.patch<Office>(`/admin/offices/${id}`, body),

  masterData: (type: string, query?: Query, signal?: AbortSignal) =>
    api.paged<MasterItem>(`/admin/master-data/${type}`, { query, signal }),
  createMasterItem: (type: string, body: Record<string, unknown>) =>
    api.post<MasterItem>(`/admin/master-data/${type}`, body),
  updateMasterItem: (type: string, id: string, body: Record<string, unknown>) =>
    api.patch<MasterItem>(`/admin/master-data/${type}/${id}`, body),
  deleteMasterItem: (type: string, id: string) => api.delete<unknown>(`/admin/master-data/${type}/${id}`),

  settings: (signal?: AbortSignal) => api.get<PlatformSetting[] | Record<string, unknown>>("/admin/settings", { signal }),
  saveSettings: (body: Record<string, string>) => api.put<unknown>("/admin/settings", body),

  auditLogs: (query?: Query, signal?: AbortSignal) => api.paged<AuditLog>("/admin/audit-logs", { query, signal }),
  auditLog: (id: string, signal?: AbortSignal) => api.get<AuditLog>(`/admin/audit-logs/${id}`, { signal }),

  jurisdictionSummary: (signal?: AbortSignal) =>
    api.get<JurisdictionSummary>("/admin/jurisdiction-summary", { signal }),

  chatThreads: (query?: Query, signal?: AbortSignal) => api.paged<ChatThread>("/admin/chat/threads", { query, signal }),
  chatMessages: (threadId: string, query?: Query, signal?: AbortSignal) =>
    api.paged<ChatMessage>(`/admin/chat/threads/${threadId}/messages`, { query, signal }),
  assignChat: (threadId: string, userId: string) =>
    api.post<ChatThread>(`/admin/chat/threads/${threadId}/assign`, { user_id: userId }),
  replyChat: (threadId: string, body: string) =>
    api.post<ChatMessage>(`/admin/chat/threads/${threadId}/messages`, { body }),
  resolveChat: (threadId: string) => api.post<ChatThread>(`/admin/chat/threads/${threadId}/resolve`, {}),
};
