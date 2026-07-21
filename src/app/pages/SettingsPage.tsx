import { useEffect, useMemo, useState } from "react";
import {
  Search, Users, ShieldCheck, Database, SlidersHorizontal, Save, RotateCcw,
  ChevronLeft, ChevronRight, Plus, Trash2, MapPin, Building2, Home,
} from "lucide-react";
import { toast } from "sonner";
import {
  ROLES, ROLE_BY_ID, MODULES, ACCESS_META, DEFAULT_MATRIX, USERS,
  DEFAULT_DOCUMENT_TYPES, DEFAULT_ID_TYPES, DEFAULT_CONFIG, JURISDICTION_SUMMARY,
  type Access, type OfficerUser, type MasterItem, type PlatformConfig,
} from "../data/admin";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { Switch } from "../components/ui/switch";

const TABS = [
  { id: "users", label: "Users", icon: Users },
  { id: "roles", label: "Roles & access", icon: ShieldCheck },
  { id: "master", label: "Master data", icon: Database },
  { id: "platform", label: "Platform", icon: SlidersHorizontal },
] as const;
type Tab = (typeof TABS)[number]["id"];

const ROLE_OPTIONS = ROLES.map((r) => ({ value: r.id, label: r.label }));
const ACCESS_CYCLE: Access[] = ["full", "view", "none"];

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

function MasterList({
  items, onToggle, onRemove, onAdd,
}: {
  items: MasterItem[];
  onToggle: (id: string, active: boolean) => void;
  onRemove: (id: string) => void;
  onAdd: (label: string) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <>
      <div className="divide-y divide-gray-50">
        {items.map((it) => (
          <div key={it.id} className="px-5 py-3.5 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${it.active ? "text-gray-800" : "text-gray-400"}`}>
                {it.label}
                {it.laLabel && <span className="text-gray-400 font-normal"> · {it.laLabel}</span>}
              </p>
              <p className="text-xs text-gray-400 truncate">{it.note}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Switch checked={it.active} onCheckedChange={(v) => onToggle(it.id, v)} />
              <button
                onClick={() => onRemove(it.id)}
                title="Remove"
                className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-gray-400">Nothing configured yet.</p>
        )}
      </div>
      <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              onAdd(draft.trim());
              setDraft("");
            }
          }}
          placeholder="Add a new entry…"
          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#3752AE] placeholder:text-gray-400"
        />
        <button
          onClick={() => {
            if (!draft.trim()) return;
            onAdd(draft.trim());
            setDraft("");
          }}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
    </>
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

const inputClass =
  "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#3752AE]";

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>("users");

  // Users
  const [users, setUsers] = useState<OfficerUser[]>(USERS);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Roles matrix
  const [matrix, setMatrix] = useState(DEFAULT_MATRIX);

  // Master data
  const [docTypes, setDocTypes] = useState<MasterItem[]>(DEFAULT_DOCUMENT_TYPES);
  const [idTypes, setIdTypes] = useState<MasterItem[]>(DEFAULT_ID_TYPES);

  // Platform
  const [config, setConfig] = useState<PlatformConfig>(DEFAULT_CONFIG);

  const [dirty, setDirty] = useState(false);
  const touch = () => setDirty(true);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter.length && !roleFilter.includes(u.roleId)) return false;
      if (q && !`${u.id} ${u.name} ${u.email} ${u.province} ${u.office}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [users, query, roleFilter]);

  useEffect(() => setPage(1), [query, roleFilter, pageSize]);

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  const activeUsers = users.filter((u) => u.active).length;

  function toggleUser(id: string, active: boolean) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, active } : u)));
    const u = users.find((x) => x.id === id);
    toast.success(active ? `${u?.name} reactivated` : `${u?.name} suspended`, {
      description: active ? "The account can sign in again." : "Sessions are revoked immediately.",
    });
  }

  function changeRole(id: string, roleId: string) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, roleId } : u)));
    touch();
  }

  /* Clicking a matrix cell cycles Full → View → None. */
  function cycleAccess(roleId: string, moduleId: string) {
    setMatrix((prev) => {
      const current = prev[roleId][moduleId];
      const next = ACCESS_CYCLE[(ACCESS_CYCLE.indexOf(current) + 1) % ACCESS_CYCLE.length];
      return { ...prev, [roleId]: { ...prev[roleId], [moduleId]: next } };
    });
    touch();
  }

  function saveAll() {
    setDirty(false);
    toast.success("Administration settings saved", {
      description: `${activeUsers} active accounts · ${docTypes.filter((d) => d.active).length} document types enabled.`,
    });
  }

  function revertAll() {
    setUsers(USERS);
    setMatrix(DEFAULT_MATRIX);
    setDocTypes(DEFAULT_DOCUMENT_TYPES);
    setIdTypes(DEFAULT_ID_TYPES);
    setConfig(DEFAULT_CONFIG);
    setDirty(false);
    toast.info("Reverted to the published configuration");
  }

  function updateConfig<K extends keyof PlatformConfig>(key: K, value: PlatformConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
    touch();
  }

  function masterHandlers(
    list: MasterItem[],
    setList: React.Dispatch<React.SetStateAction<MasterItem[]>>,
  ) {
    return {
      onToggle: (id: string, active: boolean) => {
        setList((prev) => prev.map((i) => (i.id === id ? { ...i, active } : i)));
        touch();
      },
      onRemove: (id: string) => {
        setList((prev) => prev.filter((i) => i.id !== id));
        touch();
      },
      onAdd: (label: string) => {
        const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
        if (list.some((i) => i.id === id)) {
          toast.error("That entry already exists");
          return;
        }
        setList((prev) => [...prev, { id, label, laLabel: "", note: "Added by administrator", active: true }]);
        touch();
      },
    };
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
            onClick={revertAll}
            disabled={!dirty}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-4 h-4" /> Revert
          </button>
          <button
            onClick={saveAll}
            disabled={!dirty}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" /> Save changes
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => {
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
              <MultiSelectFilter label="Role" options={ROLE_OPTIONS} selected={roleFilter} onChange={setRoleFilter} />
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

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="px-5 py-3 font-medium">Officer</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Jurisdiction</th>
                    <th className="px-4 py-3 font-medium">Office</th>
                    <th className="px-4 py-3 font-medium">Last active</th>
                    <th className="pl-4 pr-5 py-3 font-medium w-px whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((u) => {
                    const role = ROLE_BY_ID[u.roleId];
                    return (
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
                            value={u.roleId}
                            onChange={(e) => changeRole(u.id, e.target.value)}
                            className="bg-gray-50 border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 text-sm text-gray-700 outline-none focus:border-[#3752AE] max-w-[190px]"
                          >
                            {ROLES.map((r) => (
                              <option key={r.id} value={r.id}>{r.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-gray-600">{u.province}</span>
                          <span className="block text-[11px] text-gray-400">{role.scope} scope</span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{u.office}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{u.lastActive}</td>
                        <td className="pl-4 pr-5 py-3 w-px whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <Switch checked={u.active} onCheckedChange={(v) => toggleUser(u.id, v)} />
                            <span className={`text-sm ${u.active ? "text-gray-700" : "text-gray-400"}`}>
                              {u.active ? "Active" : "Suspended"}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {totalRows === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-400">
                        No accounts match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

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
            {ROLES.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-sm font-semibold text-gray-800">{r.label}</p>
                <p className="text-xs text-gray-400">{r.laLabel}</p>
                <p className="text-sm text-gray-500 mt-2">{r.summary}</p>
                <span className="inline-flex items-center gap-1.5 mt-3 text-[11px] font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                  <MapPin className="w-3 h-3" /> {r.scope} scope
                </span>
              </div>
            ))}
          </div>

          <Card
            title="Role → module access matrix"
            desc="Click a cell to cycle Full access → View only → No access. Access is combined with the role's jurisdiction scope."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="px-5 py-3 font-medium sticky left-0 bg-white">Module</th>
                    {ROLES.map((r) => (
                      <th key={r.id} className="px-3 py-3 font-medium text-center min-w-[110px]">
                        {r.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map((m) => (
                    <tr key={m.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-5 py-2.5 text-gray-700 sticky left-0 bg-white whitespace-nowrap">{m.label}</td>
                      {ROLES.map((r) => {
                        const access = matrix[r.id][m.id];
                        const meta = ACCESS_META[access];
                        return (
                          <td key={r.id} className="px-3 py-2.5 text-center">
                            <button
                              onClick={() => cycleAccess(r.id, m.id)}
                              title={`${r.label} · ${m.label} — ${meta.label}`}
                              className="w-9 h-7 rounded-lg text-xs font-bold transition-transform hover:scale-105"
                              style={{ color: meta.color, backgroundColor: meta.bg }}
                            >
                              {meta.short}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap items-center gap-4">
              {(Object.keys(ACCESS_META) as Access[]).map((a) => (
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
              { icon: MapPin, label: "Provinces & capital", value: JURISDICTION_SUMMARY.provinces, tone: "#3752AE" },
              { icon: Building2, label: "Districts", value: JURISDICTION_SUMMARY.districts, tone: "#10B981" },
              { icon: Home, label: "Villages", value: JURISDICTION_SUMMARY.villages, tone: "#F59E0B" },
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
                    <p className="text-2xl font-bold text-gray-800 leading-tight">{k.value.toLocaleString()}</p>
                    <p className="text-sm text-gray-600">{k.label}</p>
                    <p className="text-xs text-gray-400">Administrative boundaries</p>
                  </div>
                </div>
              );
            })}
          </div>

          <Card title="Document types" desc="Accepted supporting documents across the six services.">
            <MasterList items={docTypes} {...masterHandlers(docTypes, setDocTypes)} />
          </Card>

          <Card title="Identifier types" desc="Identifiers a citizen record can be searched and matched on.">
            <MasterList items={idTypes} {...masterHandlers(idTypes, setIdTypes)} />
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
          <Card title="Language & session" desc="Applies to every officer in the back office.">
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Default language" hint="Lao is the legal default; officers can switch per session.">
                <select
                  value={config.defaultLanguage}
                  onChange={(e) => updateConfig("defaultLanguage", e.target.value as "lo" | "en")}
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
                  value={config.sessionTimeoutMinutes}
                  onChange={(e) => updateConfig("sessionTimeoutMinutes", Number(e.target.value))}
                  className={inputClass}
                />
              </Field>

              <div className="flex items-start gap-3">
                <Switch
                  checked={config.bilingualLabels}
                  onCheckedChange={(v) => updateConfig("bilingualLabels", v)}
                />
                <div>
                  <p className="text-sm font-medium text-gray-700">Bilingual form labels</p>
                  <p className="text-xs text-gray-400">Show Lao and English labels together on every form (FR-7).</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Switch
                  checked={config.requireTwoFactor}
                  onCheckedChange={(v) => updateConfig("requireTwoFactor", v)}
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
                  value={config.verificationBaseUrl}
                  onChange={(e) => updateConfig("verificationBaseUrl", e.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field label="National CA endpoint" hint="Certificate authority used for e-signatures (FR-4).">
                <input
                  value={config.caEndpoint}
                  onChange={(e) => updateConfig("caEndpoint", e.target.value)}
                  className={inputClass}
                />
              </Field>

              <div className="flex items-start gap-3">
                <Switch checked={config.allowReissue} onCheckedChange={(v) => updateConfig("allowReissue", v)} />
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
                  value={config.offlineSyncMinutes}
                  onChange={(e) => updateConfig("offlineSyncMinutes", Number(e.target.value))}
                  className={inputClass}
                />
              </Field>

              <Field label="Audit log retention" hint="Years the immutable audit trail is retained (FR-8).">
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={config.auditRetentionYears}
                  onChange={(e) => updateConfig("auditRetentionYears", Number(e.target.value))}
                  className={inputClass}
                />
              </Field>
            </div>
          </Card>

          <div
            className={`rounded-2xl border shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4 ${
              config.maintenanceMode ? "bg-amber-50 border-amber-200" : "bg-white border-gray-100"
            }`}
          >
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">Maintenance mode</p>
              <p className="text-sm text-gray-500">
                {config.maintenanceMode
                  ? "Citizens see a maintenance notice. Officers can still sign in and clear the queue."
                  : "The citizen app and back office are both serving traffic normally."}
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <Switch checked={config.maintenanceMode} onCheckedChange={(v) => updateConfig("maintenanceMode", v)} />
              <span className="text-sm font-medium text-gray-700">{config.maintenanceMode ? "On" : "Off"}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
