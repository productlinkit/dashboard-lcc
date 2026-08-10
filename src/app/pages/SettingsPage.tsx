import { useEffect, useMemo, useState } from "react";
import {
  Search, Users, ShieldCheck, Database, SlidersHorizontal, Save, RotateCcw,
  ChevronLeft, ChevronRight, Plus, Trash2, MapPin, Building2, Home,
  ScrollText, KeyRound, UserPlus, RefreshCw, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { admin, locations } from "../api/endpoints";
import { useDebounced, useMutation, useQuery } from "../api/hooks";
import { useSession } from "../api/session";
import type { ApiError } from "../api/client";
import {
  text,
  type AuditLog, type Bilingual, type MasterItem, type ModuleAccess, type OfficerUser, type Office, type Role,
} from "../api/types";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { DateRangeFilter, dateParams, ALL_TIME, type DateRange } from "../components/DateRangeFilter";
import { Switch } from "../components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../components/ui/dialog";

/*
 * Administration.
 *
 * Officer accounts, the role → module access matrix, the reference lists and
 * the platform configuration, all read from and written back to the admin API.
 *
 * A tab is only offered when the signed-in role can view its module, and the
 * controls inside it are read-only unless the role has full access — the same
 * rule the backend enforces, applied before the user can click into a 403.
 */

/* ── Wire shapes the shared types do not spell out in full ── */

type UserRow = OfficerUser & { role_label?: Bilingual; last_active?: string };

interface MatrixModule {
  code: string;
  label: Bilingual;
  group?: string;
  sort_order?: number;
}

interface AccessMatrixPayload {
  roles: Role[];
  modules: MatrixModule[];
  matrix: Record<string, Record<string, ModuleAccess>>;
  access_levels?: string[];
}

interface PlatformSettingRow {
  key: string;
  value: string;
  type: string;
  group: string;
  label?: Bilingual;
  description?: string;
  editable: boolean;
}

interface SettingsPayload {
  groups: Array<{ group: string; settings: PlatformSettingRow[] }>;
}

interface CreatedAccount {
  user?: OfficerUser;
  temporary_password?: string;
  password?: string;
}

const ACCESS_META: Record<ModuleAccess, { label: string; short: string; color: string; bg: string }> = {
  full: { label: "Full access", short: "F", color: "#047857", bg: "#D1FAE5" },
  view: { label: "View only", short: "V", color: "#1D4ED8", bg: "#DBEAFE" },
  none: { label: "No access", short: "—", color: "#94A3B8", bg: "#F1F5F9" },
};

const ACCESS_CYCLE: ModuleAccess[] = ["full", "view", "none"];

/* Which module each tab lives behind, and the tab order. */
const TABS = [
  { id: "users", label: "Users", icon: Users, module: "user-admin" },
  { id: "roles", label: "Roles & access", icon: ShieldCheck, module: "user-admin" },
  { id: "master", label: "Master data", icon: Database, module: "master-data" },
  { id: "platform", label: "Platform", icon: SlidersHorizontal, module: "master-data" },
  { id: "audit", label: "Audit log", icon: ScrollText, module: "audit" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/* The reference lists this screen curates, by their master-data type. */
const DOC_TYPE = "document-type";
const ID_TYPE = "id-type";

const inputClass =
  "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#3752AE]";

function Card({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        <p className="text-sm text-gray-400">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-gray-400">{children}</p>;
}

function Failed({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <div className="px-5 py-8 text-center">
      <p className="text-sm text-gray-600">{error.message}</p>
      <button
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
      >
        <RefreshCw className="w-4 h-4" /> Retry
      </button>
    </div>
  );
}

function Field({
  label, hint, children,
}: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {hint && <span className="block text-xs text-gray-400 mb-1.5">{hint}</span>}
      <div className={hint ? "" : "mt-1.5"}>{children}</div>
    </label>
  );
}

/** One reference list: toggle, remove and append, each committed straight away. */
function MasterList({
  type,
  editable,
}: {
  type: string;
  editable: boolean;
}) {
  const [page, setPage] = useState(1);
  const listQuery = useQuery((signal) => admin.masterData(type, { page, per_page: 100 }, signal), [type, page]);
  const items = listQuery.data?.data ?? [];
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await action();
      listQuery.refetch();
      toast.success(ok);
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  function add(label: string) {
    const code = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    if (!code) {
      toast.error("Enter a name that contains at least one letter or digit");
      return;
    }
    if (items.some((i: MasterItem) => i.code === code)) {
      toast.error("That entry already exists");
      return;
    }
    run(() => admin.createMasterItem(type, { code, label: { en: label, lo: "" }, active: true }), "Entry added");
  }

  if (listQuery.error) return <Failed error={listQuery.error} onRetry={listQuery.refetch} />;

  return (
    <>
      <div className="divide-y divide-gray-50">
        {items.map((it: MasterItem) => (
          <div key={it.id} className="px-5 py-3.5 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${it.active ? "text-gray-800" : "text-gray-400"}`}>
                {text(it.label)}
                {it.label?.lo && <span className="text-gray-400 font-normal"> · {it.label.lo}</span>}
              </p>
              <p className="text-xs text-gray-400 truncate">{it.note || it.code}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Switch
                checked={it.active}
                disabled={!editable || busy}
                onCheckedChange={(v) =>
                  run(() => admin.updateMasterItem(type, it.id, { active: v }), v ? "Entry enabled" : "Entry disabled")
                }
              />
              <button
                onClick={() => run(() => admin.deleteMasterItem(type, it.id), "Entry removed")}
                disabled={!editable || busy}
                title="Remove"
                className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <Message>{listQuery.loading ? "Loading…" : "Nothing configured yet."}</Message>
        )}
      </div>
      <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!editable}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              add(draft.trim());
              setDraft("");
            }
          }}
          placeholder="Add a new entry…"
          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#3752AE] placeholder:text-gray-400 disabled:opacity-50"
        />
        <button
          onClick={() => {
            if (!draft.trim()) return;
            add(draft.trim());
            setDraft("");
          }}
          disabled={!draft.trim() || !editable || busy}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
      {(listQuery.data?.meta.total_pages ?? 1) > 1 && (
        <div className="px-5 py-2 border-t border-gray-100 flex items-center justify-end gap-2 text-sm text-gray-500">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <span>Page {page} of {listQuery.data?.meta.total_pages}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!listQuery.data?.meta.has_next}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}

export function SettingsPage() {
  const { can } = useSession();

  const visibleTabs = useMemo(() => TABS.filter((t) => can(t.module)), [can]);
  const [tab, setTab] = useState<Tab>("users");
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.id === tab)) setTab(visibleTabs[0].id);
  }, [visibleTabs, tab]);

  const canAdminUsers = can("user-admin", "full");
  const canAdminMaster = can("master-data", "full");

  /* ── Users ── */
  const [query, setQuery] = useState("");
  const search = useDebounced(query, 350);
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [provinceFilter, setProvinceFilter] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const rolesQuery = useQuery((signal) => admin.roles(signal), [], { enabled: can("user-admin") });
  const provincesQuery = useQuery((signal) => locations.provinces(signal), []);

  const roles = useMemo<Role[]>(() => rolesQuery.data ?? [], [rolesQuery.data]);
  const roleOptions = useMemo(() => roles.map((r) => ({ value: r.code, label: text(r.name) })), [roles]);
  const provinceOptions = useMemo(
    () => (provincesQuery.data ?? []).map((p) => ({ value: p.id, label: text(p.name) })),
    [provincesQuery.data],
  );

  const userFilters = useMemo(
    () => ({
      search: search.trim() || undefined,
      role_code: roleFilter[0],
      province_id: provinceFilter[0],
      active: activeFilter.length === 1 ? activeFilter[0] : undefined,
    }),
    [search, roleFilter, provinceFilter, activeFilter],
  );
  const userKey = JSON.stringify(userFilters);
  useEffect(() => setPage(1), [userKey, pageSize]);

  const usersQuery = useQuery(
    (signal) => admin.users({ ...userFilters, page, per_page: pageSize }, signal),
    [userKey, page, pageSize],
    { enabled: tab === "users" },
  );
  const activeCountQuery = useQuery(
    (signal) => admin.users({ active: "true", per_page: 1 }, signal),
    [],
    { enabled: tab === "users" },
  );

  const userRows = (usersQuery.data?.data ?? []) as UserRow[];
  const totalRows = usersQuery.data?.meta.total ?? 0;
  const totalPages = Math.max(1, usersQuery.data?.meta.total_pages ?? 1);
  const currentPage = usersQuery.data?.meta.page ?? page;
  const start = (currentPage - 1) * pageSize;
  const activeUsers = activeCountQuery.data?.meta.total ?? 0;

  const [busyUser, setBusyUser] = useState<string | null>(null);

  async function withUser(id: string, action: () => Promise<unknown>, ok: string) {
    setBusyUser(id);
    try {
      await action();
      usersQuery.refetch();
      activeCountQuery.refetch();
      toast.success(ok);
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusyUser(null);
    }
  }

  /* A generated password is shown once and never again. */
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);

  const [newUserOpen, setNewUserOpen] = useState(false);
  const [draftUser, setDraftUser] = useState({ name: "", email: "", phone: "", role_code: "", province_id: "" });
  const createUser = useMutation((body: Record<string, unknown>) => admin.createUser(body));

  async function submitNewUser() {
    try {
      const created = (await createUser.run({
        name: draftUser.name.trim(),
        email: draftUser.email.trim(),
        phone: draftUser.phone.trim() || undefined,
        role_code: draftUser.role_code,
        province_id: draftUser.province_id || undefined,
      })) as unknown as CreatedAccount;
      const password = created.temporary_password ?? created.password ?? "";
      setNewUserOpen(false);
      setDraftUser({ name: "", email: "", phone: "", role_code: "", province_id: "" });
      usersQuery.refetch();
      activeCountQuery.refetch();
      if (password) setCredential({ email: created.user?.email ?? draftUser.email.trim(), password });
      else toast.success("Account created");
    } catch {
      /* createUser.fieldErrors is rendered against the form fields. */
    }
  }

  async function resetPassword(u: UserRow) {
    setBusyUser(u.id);
    try {
      const result = (await admin.resetUserPassword(u.id)) as unknown as {
        password?: string;
        temporary_password?: string;
      };
      const password = result.temporary_password ?? result.password ?? "";
      if (password) setCredential({ email: u.email, password });
      else toast.success("Password reset");
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusyUser(null);
    }
  }

  /* ── Roles & access ── */
  const matrixQuery = useQuery(
    async (signal) => (await admin.accessMatrix(signal)) as unknown as AccessMatrixPayload,
    [],
    { enabled: tab === "roles" },
  );
  /* The module catalogue names the matrix rows and the audit filter alike. */
  const modulesQuery = useQuery((signal) => admin.modules(signal), [], {
    enabled: tab === "roles" || tab === "audit",
  });

  const matrixRoles = matrixQuery.data?.roles ?? roles;
  const matrixModules = useMemo<MatrixModule[]>(() => {
    const fromEndpoint = (modulesQuery.data ?? []) as unknown as MatrixModule[];
    if (fromEndpoint.length > 0) return fromEndpoint;
    return matrixQuery.data?.modules ?? [];
  }, [modulesQuery.data, matrixQuery.data]);

  /* Optimistic overlay so a cell responds on click, reconciled by the refetch. */
  const [accessDraft, setAccessDraft] = useState<Record<string, ModuleAccess>>({});
  const setAccess = useMutation((v: { role_code: string; module: string; access: ModuleAccess }) =>
    admin.setModuleAccess(v),
  );

  function accessOf(roleCode: string, moduleCode: string): ModuleAccess {
    return accessDraft[`${roleCode}|${moduleCode}`] ?? matrixQuery.data?.matrix?.[roleCode]?.[moduleCode] ?? "none";
  }

  async function cycleAccess(roleCode: string, moduleCode: string) {
    const current = accessOf(roleCode, moduleCode);
    const next = ACCESS_CYCLE[(ACCESS_CYCLE.indexOf(current) + 1) % ACCESS_CYCLE.length];
    const cell = `${roleCode}|${moduleCode}`;
    setAccessDraft((prev) => ({ ...prev, [cell]: next }));
    try {
      await setAccess.run({ role_code: roleCode, module: moduleCode, access: next });
    } catch (err) {
      setAccessDraft((prev) => {
        const rolled = { ...prev };
        rolled[cell] = current;
        return rolled;
      });
      toast.error((err as ApiError).message);
    }
  }

  /* ── Master data ── */
  const jurisdictionQuery = useQuery((signal) => admin.jurisdictionSummary(signal), [], {
    enabled: tab === "master",
  });
  const officesQuery = useQuery((signal) => admin.offices({ per_page: 20 }, signal), [], {
    enabled: tab === "master",
  });

  /* ── Platform ── */
  const settingsQuery = useQuery(
    async (signal) => (await admin.settings(signal)) as unknown as SettingsPayload,
    [],
    { enabled: tab === "platform" },
  );
  const [settingEdits, setSettingEdits] = useState<Record<string, string>>({});
  const saveSettings = useMutation((body: Record<string, string>) => admin.saveSettings(body));

  const settingRows = useMemo<PlatformSettingRow[]>(
    () => (settingsQuery.data?.groups ?? []).flatMap((g) => g.settings),
    [settingsQuery.data],
  );
  const settingByKey = useMemo(() => {
    const map: Record<string, PlatformSettingRow> = {};
    for (const s of settingRows) map[s.key] = s;
    return map;
  }, [settingRows]);

  function settingValue(key: string, fallback = ""): string {
    return settingEdits[key] ?? settingByKey[key]?.value ?? fallback;
  }
  function settingBool(key: string): boolean {
    return settingValue(key, "false") === "true";
  }
  function editSetting(key: string, value: string) {
    setSettingEdits((prev) => ({ ...prev, [key]: value }));
  }

  const dirty = Object.keys(settingEdits).length > 0;

  async function commitSettings() {
    try {
      await saveSettings.run(settingEdits);
      setSettingEdits({});
      settingsQuery.refetch();
      toast.success("Administration settings saved", {
        description: `${Object.keys(settingEdits).length} setting${Object.keys(settingEdits).length !== 1 ? "s" : ""} updated.`,
      });
    } catch (err) {
      toast.error("Could not save the settings", { description: (err as ApiError).message });
    }
  }

  function revertSettings() {
    setSettingEdits({});
    settingsQuery.refetch();
    toast.info("Reverted to the published configuration");
  }

  /* ── Audit log ── */
  const [auditQueryText, setAuditQueryText] = useState("");
  const auditSearch = useDebounced(auditQueryText, 350);
  const [auditRange, setAuditRange] = useState<DateRange>(ALL_TIME);
  const [auditModules, setAuditModules] = useState<string[]>([]);
  const [auditPage, setAuditPage] = useState(1);

  const auditFilters = useMemo(
    () => ({
      ...dateParams(auditRange),
      search: auditSearch.trim() || undefined,
      module: auditModules[0],
    }),
    [auditRange, auditSearch, auditModules],
  );
  const auditKey = JSON.stringify(auditFilters);
  useEffect(() => setAuditPage(1), [auditKey]);

  const auditLogsQuery = useQuery(
    (signal) => admin.auditLogs({ ...auditFilters, page: auditPage, per_page: 25 }, signal),
    [auditKey, auditPage],
    { enabled: tab === "audit" },
  );
  const auditRows = (auditLogsQuery.data?.data ?? []) as AuditLog[];
  const auditModuleOptions = useMemo(
    () => matrixModules.map((m) => ({ value: m.code, label: text(m.label) })),
    [matrixModules],
  );

  if (visibleTabs.length === 0) {
    return (
      <div className="max-w-screen-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <h1 className="text-xl font-bold text-gray-800">Administration / Settings</h1>
          <p className="text-sm text-gray-400 mt-2">
            Your role does not reach any administration module. Ask a system administrator for access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Administration / Settings</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Officer accounts, role permissions, master data and platform configuration.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={revertSettings}
            disabled={!dirty}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-4 h-4" /> Revert
          </button>
          <button
            onClick={commitSettings}
            disabled={!dirty || !canAdminMaster || saveSettings.pending}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" /> Save changes
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2">
        <div className="flex flex-wrap gap-1.5">
          {visibleTabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm transition-colors ${
                  active ? "bg-[#3752AE] text-white font-semibold" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
          {dirty && (
            <span className="self-center ml-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
              Unsaved changes
            </span>
          )}
        </div>
      </div>

      {/* ── Users ── */}
      {tab === "users" && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex-1">
                <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, email, office, or province…"
                  className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder:text-gray-400"
                />
              </div>
              <MultiSelectFilter
                label="Role"
                options={roleOptions}
                selected={roleFilter}
                onChange={setRoleFilter}
                single
                loading={rolesQuery.loading}
              />
              <MultiSelectFilter
                label="Province"
                options={provinceOptions}
                selected={provinceFilter}
                onChange={setProvinceFilter}
                single
                loading={provincesQuery.loading}
              />
              <MultiSelectFilter
                label="Status"
                options={[
                  { value: "true", label: "Active" },
                  { value: "false", label: "Suspended" },
                ]}
                selected={activeFilter}
                onChange={setActiveFilter}
                single
              />
              {canAdminUsers && (
                <button
                  onClick={() => {
                    createUser.reset();
                    setNewUserOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b]"
                >
                  <UserPlus className="w-4 h-4" /> New officer
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">
                {totalRows} account{totalRows !== 1 ? "s" : ""}
                <span className="text-gray-400 font-normal"> · {activeUsers} active</span>
              </h2>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="hidden sm:inline">Rows</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="bg-gray-50 border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 text-sm text-gray-700 outline-none focus:border-[#3752AE]"
                >
                  {[10, 25, 50].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            {usersQuery.error ? (
              <Failed error={usersQuery.error} onRetry={usersQuery.refetch} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                      <th className="px-5 py-3 font-medium">Officer</th>
                      <th className="px-4 py-3 font-medium">Role</th>
                      <th className="px-4 py-3 font-medium">Jurisdiction</th>
                      <th className="px-4 py-3 font-medium">Office</th>
                      <th className="px-4 py-3 font-medium">Last active</th>
                      <th className="px-4 py-3 font-medium">Password</th>
                      <th className="pl-4 pr-5 py-3 font-medium w-px whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userRows.map((u) => (
                      <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span className="w-9 h-9 rounded-full bg-[#3752AE]/10 text-[#3752AE] text-xs font-semibold flex items-center justify-center flex-shrink-0">
                              {u.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
                            </span>
                            <div className="min-w-0">
                              <p className={`font-medium ${u.active ? "text-gray-800" : "text-gray-400"}`}>{u.name}</p>
                              <p className="text-[11px] text-gray-400">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={u.role_code}
                            disabled={!canAdminUsers || busyUser === u.id}
                            onChange={(e) =>
                              withUser(u.id, () => admin.updateUser(u.id, { role_code: e.target.value }), "Role updated")
                            }
                            className="bg-gray-50 border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 text-sm text-gray-700 outline-none focus:border-[#3752AE] max-w-[190px] disabled:opacity-60"
                          >
                            {roles.length === 0 && <option value={u.role_code}>{text(u.role_label ?? u.role_name)}</option>}
                            {roles.map((r) => (
                              <option key={r.code} value={r.code}>{text(r.name)}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-gray-600">
                            {u.jurisdiction?.village_name ??
                              u.jurisdiction?.district_name ??
                              u.jurisdiction?.province_name ??
                              "National"}
                          </span>
                          <span className="block text-[11px] text-gray-400">{u.role_scope} scope</span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{u.office_name || "—"}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {u.last_active ?? u.last_active_at?.slice(0, 10) ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => resetPassword(u)}
                            disabled={!canAdminUsers || busyUser === u.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <KeyRound className="w-3.5 h-3.5" /> Reset
                          </button>
                        </td>
                        <td className="pl-4 pr-5 py-3 w-px whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <Switch
                              checked={u.active}
                              disabled={!canAdminUsers || busyUser === u.id}
                              onCheckedChange={(v) =>
                                withUser(
                                  u.id,
                                  () => (v ? admin.activateUser(u.id) : admin.deactivateUser(u.id)),
                                  v ? `${u.name} reactivated` : `${u.name} suspended`,
                                )
                              }
                            />
                            <span className={`text-sm ${u.active ? "text-gray-700" : "text-gray-400"}`}>
                              {u.active ? "Active" : "Suspended"}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {userRows.length === 0 && (
                      <tr>
                        <td colSpan={7}>
                          <Message>{usersQuery.loading ? "Loading accounts…" : "No accounts match your filters."}</Message>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {totalRows > 0 && (
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  Showing <span className="font-medium text-gray-700">{start + 1}</span>–
                  <span className="font-medium text-gray-700">{Math.min(start + pageSize, totalRows)}</span> of{" "}
                  <span className="font-medium text-gray-700">{totalRows}</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" /> Prev
                  </button>
                  <span className="text-sm text-gray-500">Page {currentPage} of {totalPages}</span>
                  <button
                    onClick={() => setPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Roles & access ── */}
      {tab === "roles" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {matrixRoles.map((r) => (
              <div key={r.code} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-sm font-semibold text-gray-800">{text(r.name)}</p>
                <p className="text-xs text-gray-400">{r.name?.lo}</p>
                <p className="text-sm text-gray-500 mt-2">{r.summary}</p>
                <span className="inline-flex items-center gap-1.5 mt-3 text-[11px] font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                  <MapPin className="w-3 h-3" /> {r.scope} scope
                </span>
              </div>
            ))}
            {matrixRoles.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <Message>{matrixQuery.loading ? "Loading roles…" : "No roles configured."}</Message>
              </div>
            )}
          </div>

          <Card
            title="Role → module access matrix"
            desc="Click a cell to cycle Full access → View only → No access. Access is combined with the role's jurisdiction scope."
          >
            {matrixQuery.error ? (
              <Failed error={matrixQuery.error} onRetry={matrixQuery.refetch} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                      <th className="px-5 py-3 font-medium sticky left-0 bg-white">Module</th>
                      {matrixRoles.map((r) => (
                        <th key={r.code} className="px-3 py-3 font-medium text-center min-w-[110px]">
                          {text(r.name)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixModules.map((m) => (
                      <tr key={m.code} className="border-b border-gray-50 last:border-0">
                        <td className="px-5 py-2.5 text-gray-700 sticky left-0 bg-white whitespace-nowrap">
                          {text(m.label)}
                        </td>
                        {matrixRoles.map((r) => {
                          const access = accessOf(r.code, m.code);
                          const meta = ACCESS_META[access] ?? ACCESS_META.none;
                          return (
                            <td key={r.code} className="px-3 py-2.5 text-center">
                              <button
                                onClick={() => cycleAccess(r.code, m.code)}
                                disabled={!canAdminUsers || setAccess.pending}
                                title={`${text(r.name)} · ${text(m.label)} — ${meta.label}`}
                                className="w-9 h-7 rounded-lg text-xs font-bold transition-transform hover:scale-105 disabled:cursor-not-allowed"
                                style={{ color: meta.color, backgroundColor: meta.bg }}
                              >
                                {meta.short}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {matrixModules.length === 0 && (
                      <tr>
                        <td colSpan={matrixRoles.length + 1}>
                          <Message>{matrixQuery.loading ? "Loading the matrix…" : "No modules configured."}</Message>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap items-center gap-4">
              {(Object.keys(ACCESS_META) as ModuleAccess[]).map((a) => (
                <span key={a} className="inline-flex items-center gap-2 text-xs text-gray-500">
                  <span
                    className="w-6 h-5 rounded text-[11px] font-bold flex items-center justify-center"
                    style={{ color: ACCESS_META[a].color, backgroundColor: ACCESS_META[a].bg }}
                  >
                    {ACCESS_META[a].short}
                  </span>
                  {ACCESS_META[a].label}
                </span>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* ── Master data ── */}
      {tab === "master" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: MapPin, label: "Provinces & capital", value: jurisdictionQuery.data?.provinces ?? 0, tone: "#3752AE" },
              { icon: Building2, label: "Districts", value: jurisdictionQuery.data?.districts ?? 0, tone: "#10B981" },
              { icon: Home, label: "Villages", value: jurisdictionQuery.data?.villages ?? 0, tone: "#F59E0B" },
            ].map((k) => {
              const Icon = k.icon;
              return (
                <div key={k.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-3">
                  <span
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${k.tone}14`, color: k.tone }}
                  >
                    <Icon className="w-5 h-5" />
                  </span>
                  <div>
                    <p className="text-2xl font-bold text-gray-800 leading-tight">
                      {jurisdictionQuery.loading ? "…" : k.value.toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-600">{k.label}</p>
                    <p className="text-xs text-gray-400">Administrative boundaries</p>
                  </div>
                </div>
              );
            })}
          </div>

          <Card title="Document types" desc="Accepted supporting documents across the six services.">
            <MasterList type={DOC_TYPE} editable={canAdminMaster} />
          </Card>

          <Card title="Identifier types" desc="Identifiers a citizen record can be searched and matched on.">
            <MasterList type={ID_TYPE} editable={canAdminMaster} />
          </Card>

          <Card
            title="Registration offices"
            desc={`${jurisdictionQuery.data?.offices ?? 0} offices issue and register on the platform.`}
          >
            {officesQuery.error ? (
              <Failed error={officesQuery.error} onRetry={officesQuery.refetch} />
            ) : (
              <div className="divide-y divide-gray-50">
                {((officesQuery.data?.data ?? []) as Office[]).map((o) => (
                  <div key={o.id} className="px-5 py-3.5 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${o.active ? "text-gray-800" : "text-gray-400"}`}>
                        {text(o.name)}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {o.code} · {o.level} level{o.address ? ` · ${o.address}` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-gray-500 flex-shrink-0">{o.kind}</span>
                  </div>
                ))}
                {(officesQuery.data?.data ?? []).length === 0 && (
                  <Message>{officesQuery.loading ? "Loading offices…" : "No offices configured."}</Message>
                )}
              </div>
            )}
          </Card>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm text-gray-500">
              Service fees and tariffs are managed in{" "}
              <span className="font-medium text-gray-700">Payments &amp; Revenue → Payment settings</span>, so pricing
              stays next to the revenue it produces.
            </p>
          </div>
        </>
      )}

      {/* ── Platform ── */}
      {tab === "platform" && (
        <>
          {settingsQuery.error && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <Failed error={settingsQuery.error} onRetry={settingsQuery.refetch} />
            </div>
          )}

          <Card title="Language & session" desc="Applies to every officer in the back office.">
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Default language" hint="Lao is the legal default; officers can switch per session.">
                <select
                  value={settingValue("default_language", "lo")}
                  disabled={!canAdminMaster}
                  onChange={(e) => editSetting("default_language", e.target.value)}
                  className={inputClass}
                >
                  <option value="lo">ລາວ (Lao)</option>
                  <option value="en">English</option>
                </select>
              </Field>

              <Field label="Session timeout" hint="Minutes of inactivity before an officer is signed out.">
                <input
                  type="number"
                  min="5"
                  max="240"
                  disabled={!canAdminMaster}
                  value={settingValue("session_timeout_minutes", "30")}
                  onChange={(e) => editSetting("session_timeout_minutes", e.target.value)}
                  className={inputClass}
                />
              </Field>

              <div className="flex items-start gap-3">
                <Switch
                  checked={settingBool("bilingual_labels")}
                  disabled={!canAdminMaster}
                  onCheckedChange={(v) => editSetting("bilingual_labels", String(v))}
                />
                <div>
                  <p className="text-sm font-medium text-gray-700">Bilingual form labels</p>
                  <p className="text-xs text-gray-400">Show Lao and English labels together on every form (FR-7).</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Switch
                  checked={settingBool("require_two_factor")}
                  disabled={!canAdminMaster}
                  onCheckedChange={(v) => editSetting("require_two_factor", String(v))}
                />
                <div>
                  <p className="text-sm font-medium text-gray-700">Require two-factor sign-in</p>
                  <p className="text-xs text-gray-400">OTP on top of the password for every officer account.</p>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Certificates & verification" desc="E-signature endpoint and the public QR verification address.">
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Verification base URL" hint="Printed into the QR code on every issued certificate.">
                <input
                  value={settingValue("verification_base_url")}
                  disabled={!canAdminMaster}
                  onChange={(e) => editSetting("verification_base_url", e.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field label="National CA endpoint" hint="Certificate authority used for e-signatures (FR-4).">
                <input
                  value={settingValue("ca_endpoint")}
                  disabled={!canAdminMaster}
                  onChange={(e) => editSetting("ca_endpoint", e.target.value)}
                  className={inputClass}
                />
              </Field>

              <div className="flex items-start gap-3">
                <Switch
                  checked={settingBool("allow_reissue")}
                  disabled={!canAdminMaster}
                  onCheckedChange={(v) => editSetting("allow_reissue", String(v))}
                />
                <div>
                  <p className="text-sm font-medium text-gray-700">Allow reissue and revocation</p>
                  <p className="text-xs text-gray-400">
                    Officers may reissue or revoke an issued certificate with a recorded reason (FR-10).
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Sync & retention" desc="Offline-first behaviour and how long the audit trail is kept.">
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Offline sync interval" hint="Minutes between sync attempts from village offices (FR-6).">
                <input
                  type="number"
                  min="1"
                  max="120"
                  disabled={!canAdminMaster}
                  value={settingValue("offline_sync_minutes", "15")}
                  onChange={(e) => editSetting("offline_sync_minutes", e.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field label="Audit log retention" hint="Years the immutable audit trail is retained (FR-8).">
                <input
                  type="number"
                  min="1"
                  max="50"
                  disabled={!canAdminMaster}
                  value={settingValue("audit_retention_years", "10")}
                  onChange={(e) => editSetting("audit_retention_years", e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          </Card>

          <div
            className={`rounded-2xl border shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4 ${
              settingBool("maintenance_mode") ? "bg-amber-50 border-amber-200" : "bg-white border-gray-100"
            }`}
          >
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">Maintenance mode</p>
              <p className="text-sm text-gray-500">
                {settingBool("maintenance_mode")
                  ? "Citizens see a maintenance notice. Officers can still sign in and clear the queue."
                  : "The citizen app and back office are both serving traffic normally."}
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <Switch
                checked={settingBool("maintenance_mode")}
                disabled={!canAdminMaster}
                onCheckedChange={(v) => editSetting("maintenance_mode", String(v))}
              />
              <span className="text-sm font-medium text-gray-700">{settingBool("maintenance_mode") ? "On" : "Off"}</span>
            </div>
          </div>
        </>
      )}

      {/* ── Audit log ── */}
      {tab === "audit" && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex-1">
                <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input
                  value={auditQueryText}
                  onChange={(e) => setAuditQueryText(e.target.value)}
                  placeholder="Search by actor, action, or record reference…"
                  className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder:text-gray-400"
                />
              </div>
              <MultiSelectFilter
                label="Module"
                options={auditModuleOptions}
                selected={auditModules}
                onChange={setAuditModules}
                single
                loading={modulesQuery.loading}
              />
              <DateRangeFilter onChange={setAuditRange} />
            </div>
          </div>

          <Card title="Audit trail" desc="Every administrative change, with the officer who made it (FR-8).">
            {auditLogsQuery.error ? (
              <Failed error={auditLogsQuery.error} onRetry={auditLogsQuery.refetch} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                      <th className="px-5 py-3 font-medium">When</th>
                      <th className="px-4 py-3 font-medium">Officer</th>
                      <th className="px-4 py-3 font-medium">Action</th>
                      <th className="px-4 py-3 font-medium">Module</th>
                      <th className="px-4 py-3 font-medium">Record</th>
                      <th className="pl-4 pr-5 py-3 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditRows.map((a) => (
                      <tr key={a.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                          {a.occurred_at?.slice(0, 10)}
                          <span className="block text-[11px] text-gray-400">{a.occurred_at?.slice(11, 16)}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-800">
                          {a.actor_name ?? "—"}
                          <span className="block text-[11px] text-gray-400">{a.actor_role ?? a.actor_type ?? ""}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{a.action}</td>
                        <td className="px-4 py-3 text-gray-500">{a.module ?? "—"}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-gray-500">
                          {a.entity_ref ?? a.entity_type ?? "—"}
                        </td>
                        <td className="pl-4 pr-5 py-3 text-gray-500">{a.reason ?? "—"}</td>
                      </tr>
                    ))}
                    {auditRows.length === 0 && (
                      <tr>
                        <td colSpan={6}>
                          <Message>
                            {auditLogsQuery.loading ? "Loading the audit trail…" : "No audit entries in this selection."}
                          </Message>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {(auditLogsQuery.data?.meta.total ?? 0) > 0 && (
              <div className="pt-3 mt-1 border-t border-gray-100 flex items-center justify-between gap-3">
                <p className="text-sm text-gray-500">
                  {auditLogsQuery.data?.meta.total.toLocaleString()} entries
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                    disabled={auditPage <= 1}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" /> Prev
                  </button>
                  <span className="text-sm text-gray-500">
                    Page {auditLogsQuery.data?.meta.page} of {auditLogsQuery.data?.meta.total_pages}
                  </span>
                  <button
                    onClick={() => setAuditPage((p) => p + 1)}
                    disabled={!auditLogsQuery.data?.meta.has_next}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {/* New officer */}
      <Dialog open={newUserOpen} onOpenChange={setNewUserOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New officer account</DialogTitle>
            <DialogDescription>
              The platform generates the first password and shows it once — hand it over in person.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full name">
              <input
                value={draftUser.name}
                onChange={(e) => setDraftUser({ ...draftUser, name: e.target.value })}
                className={inputClass}
              />
              {createUser.fieldErrors.name && <span className="text-xs text-red-600">{createUser.fieldErrors.name}</span>}
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={draftUser.email}
                onChange={(e) => setDraftUser({ ...draftUser, email: e.target.value })}
                className={inputClass}
              />
              {createUser.fieldErrors.email && <span className="text-xs text-red-600">{createUser.fieldErrors.email}</span>}
            </Field>
            <Field label="Phone">
              <input
                value={draftUser.phone}
                onChange={(e) => setDraftUser({ ...draftUser, phone: e.target.value })}
                className={inputClass}
              />
              {createUser.fieldErrors.phone && <span className="text-xs text-red-600">{createUser.fieldErrors.phone}</span>}
            </Field>
            <Field label="Role">
              <select
                value={draftUser.role_code}
                onChange={(e) => setDraftUser({ ...draftUser, role_code: e.target.value })}
                className={inputClass}
              >
                <option value="">Choose a role…</option>
                {roles.map((r) => (
                  <option key={r.code} value={r.code}>{text(r.name)}</option>
                ))}
              </select>
              {createUser.fieldErrors.role_code && (
                <span className="text-xs text-red-600">{createUser.fieldErrors.role_code}</span>
              )}
            </Field>
            <Field label="Province" hint="Leave empty for a national account.">
              <select
                value={draftUser.province_id}
                onChange={(e) => setDraftUser({ ...draftUser, province_id: e.target.value })}
                className={inputClass}
              >
                <option value="">National</option>
                {provinceOptions.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </Field>
          </div>
          {createUser.error && !createUser.error.isValidation && (
            <p className="text-sm text-red-600">{createUser.error.message}</p>
          )}
          <DialogFooter>
            <button
              onClick={() => setNewUserOpen(false)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={submitNewUser}
              disabled={createUser.pending || !draftUser.name.trim() || !draftUser.email.trim() || !draftUser.role_code}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <UserPlus className="w-4 h-4" /> {createUser.pending ? "Creating…" : "Create account"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The generated password, shown exactly once */}
      <Dialog open={!!credential} onOpenChange={(open) => !open && setCredential(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>One-time password</DialogTitle>
            <DialogDescription>
              This is the only time the platform will show it. The officer is asked to change it at first sign-in.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
            <p className="text-xs text-gray-400">{credential?.email}</p>
            <p className="mt-1 font-mono text-lg font-semibold tracking-wide text-gray-800 break-all">
              {credential?.password}
            </p>
          </div>
          <DialogFooter>
            <button
              onClick={() => {
                if (credential) {
                  navigator.clipboard?.writeText(credential.password).then(
                    () => toast.success("Password copied"),
                    () => toast.error("Could not copy — select it by hand"),
                  );
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              <Copy className="w-4 h-4" /> Copy
            </button>
            <button
              onClick={() => setCredential(null)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b]"
            >
              Done
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
