import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import {
  ArrowLeft,
  Check,
  CornerUpLeft,
  X,
  FileSignature,
  BadgeCheck,
  Ban,
  Send,
  Paperclip,
  PenLine,
  Image as ImageIcon,
  Hash,
  Clock,
  History,
  Download,
  Award,
  ShieldCheck,
  Printer,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Stamp as StampIcon,
} from "lucide-react";
import { SignaturePad, SignatureMark, signatureDataUrl, type Signature } from "../components/SignaturePad";
import { StampPad, StampMark, type Stamp } from "../components/StampPad";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import photo3x4 from "../../imports/photo3x4.png";
import laoEmblem from "../../imports/logo-lao-people-democratic.png";
import { PIPELINE_ORDER, STATUS_META, type AppStatus } from "../data/mockData";
import { REQUIREMENT_META } from "../data/serviceForms";
import { SERVICE_BY_ID } from "../serviceConfig";
import { StatusBadge } from "../components/StatusBadge";
import { applications, catalog, workflow, type TransitionBody } from "../api/endpoints";
import { useMutation, useQuery } from "../api/hooks";
import {
  text,
  type ApplicationDetail,
  type Attachment,
  type CaseEvent,
  type FieldRequirement,
  type FormField,
  type FormSection,
  type Jurisdiction,
} from "../api/types";

/* ── Workflow actions ──
 * The buttons come from /admin/cases/{id}/actions, so the caller only ever sees
 * a transition their role may actually perform. Tone and icon are presentation
 * only, keyed by the action name. */
type Tone = "primary" | "neutral" | "danger";

interface AllowedActionRow {
  action: string;
  label: string;
  to_status: AppStatus;
  needs_reason?: boolean;
  needs_signature?: boolean;
  needs_paid_fee?: boolean;
  blocked?: boolean;
  block_reason?: string;
}

const ACTION_STYLE: Record<string, { tone: Tone; icon: React.ComponentType<{ className?: string }> }> = {
  submit: { tone: "primary", icon: Send },
  resubmit: { tone: "primary", icon: Send },
  certify: { tone: "primary", icon: BadgeCheck },
  receive: { tone: "primary", icon: Send },
  register: { tone: "primary", icon: FileSignature },
  issue: { tone: "primary", icon: Check },
  return: { tone: "neutral", icon: CornerUpLeft },
  reject: { tone: "danger", icon: X },
  revoke: { tone: "danger", icon: Ban },
  cancel: { tone: "danger", icon: Ban },
};

/* Transitions the back office owns. Submit / re-submit / cancel a draft belong
 * to the applicant in the citizen app, so they are shown but not pressable. */
const ACTION_ENDPOINT: Record<string, (id: string, body: TransitionBody) => Promise<ApplicationDetail>> = {
  certify: (id, body) => workflow.certify(id, body),
  receive: (id, body) => workflow.receive(id, body),
  register: (id, body) => workflow.register(id, body),
  issue: (id, body) => workflow.issue(id, body),
  return: (id, body) => workflow.returnCase(id, body),
  reject: (id, body) => workflow.reject(id, body),
  revoke: (id, body) => workflow.revoke(id, body),
};

const TONE_CLASS: Record<Tone, string> = {
  primary: "bg-[#3752AE] text-white hover:bg-[#2c428b]",
  neutral: "bg-gray-100 text-gray-700 hover:bg-gray-200",
  danger: "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200",
};

/* ── form_data addressing ──
 * The API stores a field under "<section>.<field>", "<section>.<instance>.<field>"
 * or, on older records, the bare field key. One resolver covers all three so a
 * screen never has to know which seed wrote the case. */
export function fieldKey(sectionKey: string, instance: string | null, key: string): string {
  return instance ? `${sectionKey}.${instance}.${key}` : `${sectionKey}.${key}`;
}

function candidateKeys(sectionKey: string, instance: string | null, key: string): string[] {
  return instance
    ? [`${sectionKey}.${instance}.${key}`, `${sectionKey}.${key}`, `${instance}.${key}`, key]
    : [`${sectionKey}.${key}`, key];
}

function resolveKey(data: Record<string, unknown>, sectionKey: string, instance: string | null, key: string): string {
  const candidates = candidateKeys(sectionKey, instance, key);
  return candidates.find((c) => c in data) ?? candidates[0];
}

function asText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

export function isEmptyValue(v: string | undefined): boolean {
  return !v || v.trim() === "" || v.trim() === "—";
}

/** Swap a jurisdiction id for the name the case already carries. */
function displayValue(raw: string, j: Jurisdiction | undefined): string {
  if (!j || !raw) return raw;
  if (raw === j.province_id) return j.province_name ?? raw;
  if (raw === j.district_id) return j.district_name ?? raw;
  if (raw === j.village_id) return j.village_name ?? raw;
  return raw;
}

const TYPE_ICON: Partial<Record<string, React.ComponentType<{ className?: string }>>> = {
  image: ImageIcon,
  document: Paperclip,
  signature: PenLine,
  auto: Hash,
  time: Clock,
};

function ReqChip({ req }: { req: FieldRequirement }) {
  const m = REQUIREMENT_META[req] ?? REQUIREMENT_META.optional;
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide"
      style={{ color: m.color, backgroundColor: m.bg }}
    >
      {m.label}
    </span>
  );
}

function FieldInput({
  f,
  value,
  invalid,
  warn,
  onChange,
}: {
  f: FormField;
  value: string;
  invalid: boolean;
  warn: boolean;
  onChange: (v: string) => void;
}) {
  const base = `w-full mt-1.5 px-3 py-2 rounded-lg text-sm outline-none border transition-colors ${
    invalid
      ? "border-red-400 bg-red-50 focus:border-red-500"
      : warn
        ? "border-amber-300 bg-amber-50/40 focus:border-amber-400"
        : "border-gray-200 bg-white focus:border-[#3752AE]"
  }`;

  if (f.type === "document" || f.type === "image") {
    return (
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-sm text-gray-600 truncate">{value || "No file"}</span>
        <span className="text-xs text-gray-400 whitespace-nowrap">uploaded from the citizen app</span>
      </div>
    );
  }
  if (f.type === "auto" || f.type === "static" || f.type === "signature") {
    return <div className="mt-1.5 text-sm text-gray-400">{value} <span className="text-[10px]">(auto)</span></div>;
  }

  const options = f.options ?? null;
  if (options && options.length > 0) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={base}>
        <option value="">— Select —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {text(o.label) || o.value}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={`Enter ${text(f.label).toLowerCase()}…`}
      className={base}
    />
  );
}

function FieldRow({
  f,
  value,
  display,
  attachment,
  editing,
  invalid,
  warn,
  onChange,
}: {
  f: FormField;
  value: string;
  display: string;
  attachment?: Attachment;
  editing: boolean;
  invalid: boolean;
  warn: boolean;
  onChange: (v: string) => void;
}) {
  const Icon = TYPE_ICON[f.type];
  const fileLike = f.type === "document" || f.type === "image";

  return (
    <div className="py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {Icon && <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
            <span className="text-sm font-medium text-gray-800">{text(f.label)}</span>
            <span className="text-xs text-gray-400">{f.label?.lo}</span>
          </div>
          {f.description && <p className="text-xs text-gray-400 mt-0.5">{f.description}</p>}
        </div>
        <ReqChip req={f.requirement} />
      </div>

      {editing ? (
        <>
          <FieldInput f={f} value={value} invalid={invalid} warn={warn} onChange={onChange} />
          {invalid && <p className="text-xs text-red-500 mt-1">This mandatory field is required.</p>}
          {warn && !invalid && (
            <p className="text-xs text-amber-600 mt-1">Conditional — fill in if it applies to this case.</p>
          )}
        </>
      ) : (
        <div className="mt-1.5 text-sm">
          {fileLike && attachment ? (
            <a
              href={attachment.file_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[#3752AE] hover:underline"
            >
              <Paperclip className="w-3.5 h-3.5" />
              {attachment.file_name || attachment.label}
            </a>
          ) : isEmptyValue(display) ? (
            <span className="text-gray-300 italic">—</span>
          ) : (
            <span className="text-gray-700">{display}</span>
          )}
        </div>
      )}
    </div>
  );
}

interface RenderedField {
  storeKey: string;
  field: FormField;
}

function SectionCard({
  section,
  fieldsFor,
  formData,
  jurisdiction,
  attachmentFor,
  editing,
  errorKeys,
  warnKeys,
  onChange,
}: {
  section: FormSection;
  fieldsFor: (section: FormSection, instance: string | null) => RenderedField[];
  formData: Record<string, unknown>;
  jurisdiction: Jurisdiction | undefined;
  attachmentFor: (field: FormField) => Attachment | undefined;
  editing: boolean;
  errorKeys: Set<string>;
  warnKeys: Set<string>;
  onChange: (key: string, v: string) => void;
}) {
  const instances = section.instances && section.instances.length > 0 ? section.instances : [null];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-800">
          {text(section.title)}
          {section.title?.lo && <span className="ml-2 text-sm font-normal text-gray-400">{section.title.lo}</span>}
        </h3>
        {section.note && <p className="text-xs text-gray-400 mt-1">{section.note}</p>}
      </div>
      <div className="p-5 space-y-5">
        {instances.map((inst, i) => (
          <div key={inst ?? i}>
            {inst && (
              <div className="mb-1 inline-flex items-center px-2.5 py-1 rounded-lg bg-gray-50 text-xs font-semibold text-gray-600">
                {inst}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              {fieldsFor(section, inst).map(({ storeKey, field }) => {
                const raw = asText(formData[storeKey]);
                return (
                  <FieldRow
                    key={storeKey}
                    f={field}
                    value={raw}
                    display={displayValue(raw, jurisdiction)}
                    attachment={attachmentFor(field)}
                    editing={editing}
                    invalid={errorKeys.has(storeKey)}
                    warn={warnKeys.has(storeKey)}
                    onChange={(v) => onChange(storeKey, v)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pipeline({ status }: { status: AppStatus }) {
  const offPath = status === "returned" || status === "rejected" || status === "revoked";
  const activeIdx = PIPELINE_ORDER.indexOf(status);
  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {PIPELINE_ORDER.map((s, i) => {
        const meta = STATUS_META[s];
        const done = !offPath && i < activeIdx;
        const current = !offPath && i === activeIdx;
        return (
          <div key={s} className="flex items-center gap-1 flex-shrink-0">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={{
                color: done || current ? meta.color : "#9CA3AF",
                backgroundColor: current ? meta.bg : done ? `${meta.color}14` : "#F8FAFC",
              }}
            >
              {done ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: current ? meta.color : "#CBD5E1" }} />
              )}
              {meta.label}
            </div>
            {i < PIPELINE_ORDER.length - 1 && <span className="text-gray-300">›</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ── Deterministic faux QR code (decorative, offline) ── */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function QrCode({ value, size = 104 }: { value: string; size?: number }) {
  const n = 25; // modules per side
  const m = size / n;
  const isFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  const rects: React.ReactElement[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (isFinder(r, c)) continue;
      if (hash(`${value}:${r}:${c}`) % 100 < 48) {
        rects.push(<rect key={`${r}-${c}`} x={c * m} y={r * m} width={m} height={m} />);
      }
    }
  }

  const finder = (ox: number, oy: number) => (
    <g key={`f-${ox}-${oy}`}>
      <rect x={ox * m} y={oy * m} width={7 * m} height={7 * m} />
      <rect x={(ox + 1) * m} y={(oy + 1) * m} width={5 * m} height={5 * m} fill="#fff" />
      <rect x={(ox + 2) * m} y={(oy + 2) * m} width={3 * m} height={3 * m} />
    </g>
  );

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" fill="#0f172a">
      <rect x={0} y={0} width={size} height={size} fill="#fff" />
      {rects}
      {finder(0, 0)}
      {finder(n - 7, 0)}
      {finder(0, n - 7)}
    </svg>
  );
}

const CERT_STATEMENT: Record<string, string> = {
  resident:
    "This certifies that the above-named person currently resides at the stated address within the issuing jurisdiction.",
  birth:
    "This registers the birth of the above-named child and the assignment of a Unique Identification Number (UIN).",
  death:
    "This registers the death of the above-named person and their removal from the household record.",
  marriage: "This certifies the registration of marriage between the named spouses.",
  divorce: "This certifies the registration of divorce dissolving the prior marriage.",
  "family-book": "This is the official household record for the named household head and members.",
};

/* Lao national emblem. */
function Emblem() {
  return <img src={laoEmblem} alt="Lao PDR emblem" className="w-16 h-16 object-contain" />;
}

/** The handful of case facts the certificate prints. */
interface CertCase {
  ref: string;
  serviceCode: string;
  serviceLabel: string;
  serviceLaLabel: string;
  color: string;
  applicant: string;
  province: string;
  district: string;
  village: string;
  issuedOn: string;
  officer: string;
  certificateNo?: string;
  verifyUrl: string;
}

/* Generic certificate kept for non-resident services. */
function GenericCertificate({ c }: { c: CertCase }) {
  const rows: [string, string][] = [
    [c.serviceCode === "family-book" ? "Household head" : "Full name", c.applicant],
    ["Jurisdiction", [c.village, c.district, c.province].filter(Boolean).join(" · ") || c.province],
    ["Date of issue", c.issuedOn],
  ];
  if (c.certificateNo) rows.push(["Certificate No.", c.certificateNo]);

  return (
    <div className="bg-white">
      <div className="h-1.5" style={{ backgroundColor: c.color }} />
      <div className="p-8">
        <div className="text-center">
          <p className="text-[11px] tracking-wide text-gray-500">ສາທາລະນະລັດ ປະຊາທິປະໄຕ ປະຊາຊົນລາວ</p>
          <p className="text-[11px] tracking-wide text-gray-500">Lao People's Democratic Republic</p>
          <p className="text-[10px] text-gray-400 mt-0.5">ສັນຕິພາບ ເອກະລາດ ປະຊາທິປະໄຕ ເອກະພາບ ວັດທະນະຖາວອນ</p>
          <p className="text-[10px] text-gray-400">Ministry of Home Affairs (MoHA)</p>
        </div>
        <div className="flex items-center justify-center my-5">
          <span className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: `${c.color}1A` }}>
            <Award className="w-6 h-6" style={{ color: c.color } as React.CSSProperties} />
          </span>
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-800">{c.serviceLabel}</h2>
          <p className="text-sm text-gray-400">{c.serviceLaLabel}</p>
          <p className="mt-1 text-xs font-mono text-gray-500">No. {c.ref}</p>
        </div>
        <p className="text-center text-sm text-gray-600 mt-5 max-w-md mx-auto">{CERT_STATEMENT[c.serviceCode]}</p>
        <div className="mt-6 border border-gray-100 rounded-xl divide-y divide-gray-100">
          {rows.map(([k, val]) => (
            <div key={k} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-gray-400">{k}</span>
              <span className="text-gray-800 font-medium">{val}</span>
            </div>
          ))}
        </div>
        <div className="mt-7 flex items-end justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="border border-gray-200 rounded-lg p-1.5">
              <QrCode value={c.verifyUrl} />
            </div>
            <div className="text-[11px] text-gray-400 leading-snug">
              <p className="font-medium text-gray-500">Scan to verify</p>
              <p className="font-mono">{c.verifyUrl}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
              <ShieldCheck className="w-4 h-4" /> Protected e-signature
            </div>
            <p className="text-sm font-semibold text-gray-700 mt-1">{c.officer || "District Registrar"}</p>
            <p className="text-[11px] text-gray-400">DoHA Registrar · National CA</p>
            <p className="text-[11px] text-gray-400">Signed {c.issuedOn}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Draggable stamp overlay. Stamps live in page coordinates inside the certificate
 * body, so they can be placed anywhere on the document, not just near the
 * signature. A stamp with no position yet is anchored to the left of the
 * signature block — the conventional spot on a Lao certificate. */
function StampLayer({
  stamps,
  onChange,
  bodyRef,
  anchorRef,
}: {
  stamps: Stamp[];
  onChange: (next: Stamp[]) => void;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  anchorRef: React.RefObject<HTMLDivElement | null>;
}) {
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  /* Place any newly added stamp beside the signature, cascading if there are
   * several so they never land exactly on top of each other. */
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const anchor = anchorRef.current;
    if (!body || !anchor) return;
    const pending = stamps.filter((s) => s.x == null || s.y == null);
    if (pending.length === 0) return;

    const b = body.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    let placed = stamps.length - pending.length;
    onChange(
      stamps.map((s) => {
        if (s.x != null && s.y != null) return s;
        const offset = placed * 18;
        placed += 1;
        return {
          ...s,
          x: Math.max(8, a.left - b.left - s.size - 20 + offset),
          y: Math.max(8, a.top - b.top + 6 + offset),
        };
      }),
    );
  }, [stamps, onChange, bodyRef, anchorRef]);

  function startDrag(e: React.PointerEvent<HTMLDivElement>, s: Stamp) {
    const b = bodyRef.current?.getBoundingClientRect();
    if (!b) return;
    drag.current = { id: s.id, dx: e.clientX - b.left - (s.x ?? 0), dy: e.clientY - b.top - (s.y ?? 0) };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const b = bodyRef.current?.getBoundingClientRect();
    if (!d || !b) return;
    onChange(
      stamps.map((s) =>
        s.id === d.id
          ? {
              ...s,
              x: Math.min(Math.max(0, e.clientX - b.left - d.dx), b.width - s.size),
              y: Math.min(Math.max(0, e.clientY - b.top - d.dy), b.height - s.size),
            }
          : s,
      ),
    );
  }

  return (
    <>
      {stamps.map((s) =>
        s.x == null || s.y == null ? null : (
          <div
            key={s.id}
            onPointerDown={(e) => startDrag(e, s)}
            onPointerMove={onMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            style={{ left: s.x, top: s.y, width: s.size, height: s.size }}
            className="absolute z-10 cursor-move touch-none group"
            title="Drag to reposition"
          >
            <StampMark stamp={s} />
            <button
              data-pdf-exclude="true"
              // Stops the parent's drag handler from swallowing the click.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onChange(stamps.filter((x) => x.id !== s.id))}
              title="Remove stamp"
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-gray-200 text-gray-400 text-xs leading-none opacity-0 group-hover:opacity-100 hover:text-red-600 shadow-sm"
            >
              ×
            </button>
          </div>
        ),
      )}
    </>
  );
}

/* Resident Certificate — laid out to match the official RC form, filled from the
 * case's own form_data. */
function ResidentCertificate({
  c,
  get,
  signature,
  onSign,
  stamps,
  onStampsChange,
}: {
  c: CertCase;
  get: (key: string) => string;
  signature: Signature | null;
  onSign: () => void;
  stamps: Stamp[];
  onStampsChange: (next: Stamp[]) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const signatureRef = useRef<HTMLDivElement>(null);

  const province = c.province;
  const district = c.district;
  const village = c.village;
  const ref = get("ref_no") || c.ref;
  const chief = get("village_chief_name");
  const citizen = get("citizen_name") || c.applicant;
  const age = get("age");
  const occupation = get("occupation");
  const nationality = get("nationality");
  const currentVillage = get("current_village_id") || village;
  const houseNo = get("house_no");
  const censusNo = get("household_no");
  const censusDate = get("household_issued_at");
  const censusDP = get("household_district") || `${district} / ${province}`;
  const father = get("father_name");
  const mother = get("mother_name");
  const nativeVDP = get("native_place");
  const purpose = get("purpose");
  const issued = get("issue_date") || c.issuedOn;

  return (
    <div className="bg-white">
      <div ref={bodyRef} className="relative px-10 py-8 text-[13px] leading-7 text-slate-800">
        <StampLayer stamps={stamps} onChange={onStampsChange} bodyRef={bodyRef} anchorRef={signatureRef} />
        {/* Emblem + national header */}
        <div className="flex flex-col items-center">
          <Emblem />
          <p className="mt-2 font-semibold text-center">ສາທາລະນະລັດ ປະຊາທິປະໄຕ ປະຊາຊົນລາວ</p>
          <p className="font-semibold text-center">ສັນຕິພາບ ເອກະລາດ ປະຊາທິປະໄຕ ເອກະພາບ ວັດທະນະຖາວອນ</p>
          <span className="inline-block w-44 border-t-2 border-slate-400 mt-1" />
        </div>

        {/* Jurisdiction block */}
        <div className="flex justify-between mt-5">
          <div className="space-y-1">
            <p>ແຂວງ: {province}</p>
            <p>ເມືອງ: {district}</p>
            <p>ບ້ານ: {village}</p>
          </div>
          <p>ເລກທີ: {ref}</p>
        </div>

        {/* Photo + title */}
        <div className="flex items-start gap-5 mt-4">
          <img src={photo3x4} alt="3x4" className="w-24 h-32 object-cover border border-slate-200 flex-shrink-0" />
          <div className="flex-1 flex justify-center pt-8">
            <h2 className="text-lg font-bold">ໃບຢັ້ງຢືນທີ່ຢູ່</h2>
          </div>
        </div>

        {/* Narrative body */}
        <p className="mt-3 text-justify indent-8">
          ນາຍບ້ານ: {chief}, ເມືອງ: {district}, ແຂວງ: {province} ຂໍຢັ້ງຢືນວ່າ ທ້າວ ຫຼື ນາງ: {citizen}, ອາຍຸ: {age} ປີ,
          ອາຊີບ: {occupation} ສັນຊາດ: {nationality}, ປະຈຸບັນຢູ່ບ້ານ: {currentVillage}, ເຮືອນເລກທີ: {houseNo},
          ໄດ້ຈົດເຂົ້າສຳມະໂນຄົວເລກທີ: {censusNo} ລົງວັນທີ: {censusDate} ເມືອງ/ແຂວງ: {censusDP} ເປັນລູກຂອງທ້າວ: {father},
          ແລະ ນາງ: {mother} ທີ່ບ້ານ: {nativeVDP}.
        </p>
        <p className="mt-3 text-justify">
          ຜູ້ກ່ຽວຢູ່ໃນຄວາມຮັບຜິດຊອບຂອງພວກເຮົາ ແລະ ຢູ່ໃນການຈັດຕັ້ງຂອງພວກເຮົາແທ້ຈິງ.
        </p>
        <p className="mt-2 text-justify indent-8">
          ດັ່ງນັ້ນ, ຈຶ່ງອອກໃບຢັ້ງຢືນສະບັບນີ້ໃຫ້ຜູ້ກ່ຽວໄວ້ເປັນຫຼັກຖານ. ຖ້າຜູ້ກ່ຽວບໍ່ມີພຶດຕິກຳທີ່ຂັດຕໍ່ກັບປະຊາຊົນ ແລະ
          ອຳນາດການປົກຄອງຂອງລັດແລ້ວ. ຂໍໃຫ້ພະນັກງານທີ່ກ່ຽວຂ້ອງໄດ້ອຳນວຍຄວາມສະດວກຕາມຫາງທີ່ຄວນດ້ວຍ.
        </p>
        <p className="mt-3 text-justify indent-8">
          ໃບຢັ້ງຢືນສະບັບນີ້ໃຊ້ເພື່ອ {purpose} ແລະ ຢັ້ງຢືນວ່າຜູ້ກ່ຽວຢູ່ໃນຄວາມປົກຄອງຂອງພວກເຮົາ ຢ່າງແທ້ຈິງ.
        </p>

        {/* QR (left) + date & signature (right) */}
        <div className="mt-8 flex items-end justify-between">
          <div className="border border-gray-200 rounded p-1.5">
            <QrCode value={c.verifyUrl} size={92} />
          </div>
          <div ref={signatureRef} className="text-center min-w-44">
            <p>ວັນທີ {issued}</p>
            <p className="font-bold mt-1">ຫົວໜ້າບ້ານ</p>
            <div className="h-20 flex items-center justify-center">
              {signature ? (
                <SignatureMark sig={signature} />
              ) : (
                <button
                  onClick={onSign}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-[#3752AE]/40 text-[#3752AE] text-xs hover:bg-[#3752AE]/5"
                >
                  <PenLine className="w-3.5 h-3.5" /> Sign here
                </button>
              )}
            </div>
            {signature && (
              <button
                onClick={onSign}
                data-pdf-exclude="true"
                className="text-[11px] text-[#3752AE] hover:underline"
              >
                Re-sign
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Render a DOM node to a single-page A4 PDF and download it. */
async function downloadCertificatePdf(el: HTMLElement, filename: string) {
  const dataUrl = await toPng(el, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    cacheBust: true,
    filter: (node) => !(node instanceof HTMLElement && node.dataset.pdfExclude === "true"),
  });
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image load failed"));
  });
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const ratio = Math.min(pageW / img.width, pageH / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  pdf.addImage(dataUrl, "PNG", (pageW - w) / 2, 0, w, h);
  pdf.save(filename);
}

function CertificateDialog({
  c,
  get,
  open,
  onClose,
  signature,
  onSignatureChange,
  stamps,
  onStampsChange,
  submitted,
  onSubmit,
}: {
  c: CertCase;
  get: (key: string) => string;
  open: boolean;
  onClose: () => void;
  signature: Signature | null;
  onSignatureChange: (s: Signature) => void;
  stamps: Stamp[];
  onStampsChange: (next: Stamp[]) => void;
  submitted: boolean;
  onSubmit: () => void;
}) {
  const [padOpen, setPadOpen] = useState(false);
  const [stampOpen, setStampOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const certRef = useRef<HTMLDivElement>(null);
  const showSubmit = c.serviceCode === "resident";
  const canSubmit = !submitted && (!showSubmit || !!signature);

  async function handleDownload() {
    if (!certRef.current) return;
    setGenerating(true);
    try {
      await downloadCertificatePdf(certRef.current, `${c.ref}.pdf`);
      toast.success("Certificate downloaded", { description: `${c.ref}.pdf` });
    } catch {
      toast.error("Could not generate PDF");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden max-h-[92vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>{c.serviceLabel} certificate</DialogTitle>
          </DialogHeader>

          <div ref={certRef}>
            {c.serviceCode === "resident" ? (
              <ResidentCertificate
                c={c}
                get={get}
                signature={signature}
                onSign={() => setPadOpen(true)}
                stamps={stamps}
                onStampsChange={onStampsChange}
              />
            ) : (
              <GenericCertificate c={c} />
            )}
          </div>

          <div
            className={`sticky bottom-0 flex items-center gap-2 px-6 py-3 bg-gray-50 border-t border-gray-100 ${
              showSubmit ? "justify-between" : "justify-end"
            }`}
          >
            <div className="flex items-center gap-2">
              <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">
                <Printer className="w-4 h-4" /> Print
              </button>
              {showSubmit && (
                <button
                  onClick={() => setStampOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  <StampIcon className="w-4 h-4" /> Add stamp
                  {stamps.length > 0 && (
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-[#3752AE] text-white">
                      {stamps.length}
                    </span>
                  )}
                </button>
              )}
              <button
                onClick={handleDownload}
                disabled={generating}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {generating ? "Generating…" : "Download PDF"}
              </button>
            </div>

            {showSubmit && (
              <button
                onClick={onSubmit}
                disabled={!canSubmit}
                title={!signature && !submitted ? "Sign the certificate first" : undefined}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitted ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Submitted
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Submit
                  </>
                )}
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <SignaturePad open={padOpen} onClose={() => setPadOpen(false)} onApply={onSignatureChange} />
      <StampPad
        open={stampOpen}
        onClose={() => setStampOpen(false)}
        onApply={(s) => onStampsChange([...stamps, s])}
      />
    </>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export function CaseDetailPage({ caseId, onBack }: { caseId: string; onBack: () => void }) {
  const detailQuery = useQuery((signal) => applications.get(caseId, signal), [caseId]);
  const detail = detailQuery.data;

  const schemaQuery = useQuery(
    (signal) => catalog.formSchema(detail!.service_code, signal),
    [detail?.service_code],
    { enabled: !!detail?.service_code },
  );

  const actionsQuery = useQuery((signal) => workflow.actions(caseId, signal), [caseId, detail?.status]);

  // The case payload already carries its history; the standalone timeline
  // endpoint is only asked for when it does not.
  const timelineQuery = useQuery((signal) => applications.timeline(caseId, signal), [caseId], {
    enabled: !!detail && !detail.timeline,
  });
  const events: CaseEvent[] = detail?.timeline ?? timelineQuery.data?.events ?? [];

  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [backup, setBackup] = useState<Record<string, unknown>>({});
  const [editing, setEditing] = useState(false);
  const [reasonFor, setReasonFor] = useState<AllowedActionRow | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [certOpen, setCertOpen] = useState(false);
  const [certSubmitted, setCertSubmitted] = useState(false);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [padOpen, setPadOpen] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  // The server is the source of truth for the form; a fresh case payload
  // replaces whatever the screen was holding.
  useEffect(() => {
    if (detail) setFormData({ ...(detail.form_data ?? {}) });
  }, [detail]);

  const save = useMutation((body: { form_data: Record<string, unknown> }) => applications.update(caseId, body));

  const schema = schemaQuery.data;

  /* Which storage key each schema field maps to, resolved once per render. */
  const fieldsFor = useMemo(
    () => (section: FormSection, instance: string | null): RenderedField[] =>
      (section.fields ?? []).map((field) => ({
        storeKey: resolveKey(formData, section.key, instance, field.key),
        field,
      })),
    [formData],
  );

  const validation = useMemo(() => {
    const errorKeys = new Set<string>();
    const warnKeys = new Set<string>();
    for (const section of schema?.sections ?? []) {
      const instances = section.instances && section.instances.length > 0 ? section.instances : [null];
      for (const inst of instances) {
        for (const { storeKey, field } of fieldsFor(section, inst)) {
          if (!isEmptyValue(asText(formData[storeKey]))) continue;
          if (field.requirement === "mandatory") errorKeys.add(storeKey);
          else if (field.requirement === "conditional") warnKeys.add(storeKey);
        }
      }
    }
    return { errorKeys, warnKeys };
  }, [schema, formData, fieldsFor]);

  /* Look a form value up by its bare field key, whatever prefix it was stored
   * under — the certificate reads the case this way. */
  const getValue = useMemo(
    () => (key: string): string => {
      const exact = Object.keys(formData).find((k) => k === key || k.endsWith(`.${key}`));
      return exact ? asText(formData[exact]) : "";
    },
    [formData],
  );

  const attachmentFor = useMemo(
    () => (field: FormField): Attachment | undefined =>
      (detail?.attachments ?? []).find((a) => a.slot === field.key || a.label === text(field.label)),
    [detail],
  );

  /* ── Loading / failure states ── */
  if (detailQuery.loading) {
    return (
      <div className="max-w-screen-2xl mx-auto">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-[#3752AE] hover:underline mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to applications
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading case…
          </span>
        </div>
      </div>
    );
  }

  if (detailQuery.error || !detail) {
    return (
      <div className="max-w-screen-2xl mx-auto">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-[#3752AE] hover:underline mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to applications
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-sm text-red-600">
            {detailQuery.error?.message ?? `Case ${caseId} not found.`}
          </p>
          <button
            onClick={detailQuery.refetch}
            className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const status = detail.status as AppStatus;
  const svc = SERVICE_BY_ID[detail.service_code];
  const serviceColor = svc?.color ?? "#3752AE";
  const jurisdiction = detail.jurisdiction;
  const actions = (actionsQuery.data?.actions ?? []) as unknown as AllowedActionRow[];
  const isEditable = status === "draft" || status === "returned";
  const certReady = certSubmitted || status === "issued";

  const cert: CertCase = {
    ref: detail.reference_no,
    serviceCode: detail.service_code,
    serviceLabel: svc?.label ?? text(detail.service_name),
    serviceLaLabel: svc?.laLabel ?? detail.service_name?.lo ?? "",
    color: serviceColor,
    applicant: detail.subject_name || detail.applicant,
    province: jurisdiction?.province_name ?? "",
    district: jurisdiction?.district_name ?? "",
    village: jurisdiction?.village_name ?? "",
    issuedOn: (detail.issued_at ?? detail.submitted_at ?? detail.created_at ?? "").slice(0, 10),
    officer: detail.assigned_officer ?? "",
    certificateNo: detail.certificate_no,
    verifyUrl: `verify.gov.la/c/${detail.certificate_no ?? detail.reference_no}`,
  };

  function submitCertificate() {
    if (detail!.service_code === "resident" && !signature) {
      toast.error("Signature required", { description: "Sign the certificate before submitting." });
      return;
    }
    setCertSubmitted(true);
    setCertOpen(false);
    toast.success("Certificate submitted", { description: "You can now issue the certificate." });
  }

  function changeField(key: string, v: string) {
    setFormData((p) => ({ ...p, [key]: v }));
  }

  function startEdit() {
    setBackup({ ...formData });
    setEditing(true);
  }

  function cancelEdit() {
    setFormData(backup);
    setEditing(false);
  }

  async function saveEdit() {
    try {
      await save.run({ form_data: formData });
      setEditing(false);
      toast.success("Case updated", { description: detail!.reference_no });
      detailQuery.refetch();
    } catch (err) {
      toast.error("Could not save the case", { description: (err as Error).message });
    }
  }

  async function runAction(a: AllowedActionRow, reason?: string) {
    const call = ACTION_ENDPOINT[a.action];
    if (!call) {
      toast.error("Not available here", {
        description: "This step belongs to the applicant in the citizen app.",
      });
      return;
    }

    const sigUrl = signatureDataUrl(signature);
    if (a.needs_signature && !sigUrl) {
      toast.error("Signature required", { description: "Sign before completing this step." });
      setPadOpen(true);
      return;
    }

    const body: TransitionBody = {};
    if (reason) {
      body.reason = reason;
      body.note = reason;
    }
    if (sigUrl) body.signature_data_url = sigUrl;

    setRunning(a.action);
    try {
      await call(caseId, body);
      toast.success(`Case ${detail!.reference_no} → ${STATUS_META[a.to_status]?.label ?? a.to_status}`, {
        description: reason ?? a.label,
      });
      detailQuery.refetch();
      actionsQuery.refetch();
    } catch (err) {
      toast.error("The transition was refused", { description: (err as Error).message });
    } finally {
      setRunning(null);
    }
  }

  function onTransition(a: AllowedActionRow) {
    if (a.blocked) {
      toast.error("Blocked", { description: a.block_reason ?? "This step cannot run yet." });
      return;
    }
    if (a.action === "issue" && detail!.service_code === "resident" && !certReady) {
      toast.error("Certificate not submitted", { description: "Sign and submit the certificate first." });
      setCertOpen(true);
      return;
    }
    if (a.needs_reason) {
      setReasonText("");
      setReasonFor(a);
    } else {
      void runAction(a);
    }
  }

  function confirmReason() {
    if (!reasonFor || !reasonText.trim()) return;
    const a = reasonFor;
    const reason = reasonText.trim();
    setReasonFor(null);
    setReasonText("");
    void runAction(a, reason);
  }

  return (
    <div className="max-w-screen-2xl mx-auto space-y-5">
      {/* Back + header */}
      <div>
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-[#3752AE] hover:underline mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to applications
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start gap-4">
            <span
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${serviceColor}1A` }}
            >
              {svc && <svc.icon className="w-6 h-6" style={{ color: serviceColor } as React.CSSProperties} />}
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-gray-800">{detail.applicant}</h2>
                <StatusBadge status={status} showLao />
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                <span className="font-mono">{detail.reference_no}</span> · {svc?.label ?? text(detail.service_name)}{" "}
                <span className="text-gray-400">{svc?.laLabel ?? detail.service_name?.lo}</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {[jurisdiction?.village_name, jurisdiction?.district_name, jurisdiction?.province_name]
                  .filter(Boolean)
                  .join(" · ")}{" "}
                · Submitted {(detail.submitted_at ?? detail.created_at ?? "").slice(0, 10)} · Acting role:{" "}
                {STATUS_META[status]?.actingRole}
              </p>
            </div>
          </div>

          {/* Pipeline */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <Pipeline status={status} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Form sections */}
        <div className="lg:col-span-2 space-y-5">
          {/* Edit toolbar + validation summary (capture / return only) */}
          {isEditable && schema && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                {validation.errorKeys.size > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-red-600 font-medium">
                    <AlertCircle className="w-4 h-4" />
                    {validation.errorKeys.size} mandatory field{validation.errorKeys.size !== 1 ? "s" : ""} need attention
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 font-medium">
                    <CheckCircle2 className="w-4 h-4" /> All mandatory fields complete
                  </span>
                )}
                {validation.warnKeys.size > 0 && (
                  <span className="text-amber-600">· {validation.warnKeys.size} conditional empty</span>
                )}
              </div>
              {editing ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={cancelEdit}
                    disabled={save.pending}
                    className="px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={save.pending}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] disabled:opacity-50"
                  >
                    {save.pending && <Loader2 className="w-4 h-4 animate-spin" />}
                    {save.pending ? "Saving…" : "Done editing"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={startEdit}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b]"
                >
                  <PenLine className="w-4 h-4" /> Edit fields
                </button>
              )}
            </div>
          )}

          {schemaQuery.loading ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading the form…
              </span>
            </div>
          ) : schemaQuery.error ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
              <p className="text-sm text-red-600">{schemaQuery.error.message}</p>
              <button
                onClick={schemaQuery.refetch}
                className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            </div>
          ) : schema && schema.sections.length > 0 ? (
            schema.sections.map((s) => (
              <SectionCard
                key={s.id ?? s.key}
                section={s}
                fieldsFor={fieldsFor}
                formData={formData}
                jurisdiction={jurisdiction}
                attachmentFor={attachmentFor}
                editing={editing}
                errorKeys={validation.errorKeys}
                warnKeys={validation.warnKeys}
                onChange={changeField}
              />
            ))
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">
              No form schema for this service.
            </div>
          )}

          {/* Attachments */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-gray-400" /> Attachments
              </h3>
            </div>
            <div className="p-5">
              {detail.attachments && detail.attachments.length > 0 ? (
                <ul className="divide-y divide-gray-50">
                  {detail.attachments.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-3 py-2.5">
                      <a
                        href={f.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-[#3752AE] hover:underline min-w-0"
                      >
                        {f.kind === "photo" || f.kind === "signature" ? (
                          <ImageIcon className="w-3.5 h-3.5 flex-shrink-0" />
                        ) : (
                          <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
                        )}
                        <span className="truncate">{f.label || f.file_name}</span>
                      </a>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {f.slot} · {(f.uploaded_at ?? "").slice(0, 10)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">No documents uploaded for this case.</p>
              )}
            </div>
          </div>
        </div>

        {/* Action panel + history */}
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 lg:sticky lg:top-4">
            {(status === "registered" || status === "issued") && (
              <button
                onClick={() => setCertOpen(true)}
                className={`w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all mb-3 ${
                  certReady
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                    : "bg-[#3752AE] text-white hover:bg-[#2c428b]"
                }`}
              >
                <Award className="w-4 h-4" />
                {certReady ? "View certificate" : "View & sign certificate"}
              </button>
            )}
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Actions</h3>
            {actionsQuery.loading ? (
              <p className="text-sm text-gray-400 inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading actions…
              </p>
            ) : actionsQuery.error ? (
              <div>
                <p className="text-sm text-red-600">{actionsQuery.error.message}</p>
                <button
                  onClick={actionsQuery.refetch}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
              </div>
            ) : actions.length > 0 ? (
              <div className="space-y-2">
                {actions.map((a) => {
                  const style = ACTION_STYLE[a.action] ?? { tone: "primary" as Tone, icon: Send };
                  const Icon = style.icon;
                  const unsupported = !ACTION_ENDPOINT[a.action];
                  const disabled =
                    !!running ||
                    a.blocked ||
                    unsupported ||
                    (a.action === "issue" && detail.service_code === "resident" && !certReady);
                  return (
                    <button
                      key={a.action}
                      onClick={() => onTransition(a)}
                      disabled={disabled}
                      title={
                        unsupported
                          ? "This step belongs to the applicant in the citizen app."
                          : a.block_reason ?? a.label
                      }
                      className={`w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${TONE_CLASS[style.tone]} disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {running === a.action ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                      {a.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No further actions — this is a terminal state.</p>
            )}
          </div>

          {/* History / audit trail */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <History className="w-4 h-4 text-gray-400" /> Case history
            </h3>
            {timelineQuery.loading ? (
              <p className="text-sm text-gray-400 inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading history…
              </p>
            ) : events.length === 0 ? (
              <p className="text-sm text-gray-400">
                {timelineQuery.error ? timelineQuery.error.message : "No recorded activity yet."}
              </p>
            ) : (
              <ol className="space-y-3">
                {events.map((h) => {
                  const meta = STATUS_META[h.to_status as AppStatus];
                  return (
                    <li key={h.id} className="flex items-start gap-3">
                      <span
                        className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                        style={{ backgroundColor: meta?.color ?? "#94A3B8" }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-700">{meta?.label ?? text(h.status_label)}</p>
                        <p className="text-xs text-gray-400">
                          {(h.occurred_at ?? "").replace("T", " ").slice(0, 16)} ·{" "}
                          {h.actor_name ?? h.actor_role ?? "System"}
                        </p>
                        {h.note && (
                          <p className="mt-1 text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">
                            “{h.note}”
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </div>

      <CertificateDialog
        c={cert}
        get={getValue}
        open={certOpen}
        onClose={() => setCertOpen(false)}
        signature={signature}
        onSignatureChange={setSignature}
        stamps={stamps}
        onStampsChange={setStamps}
        submitted={certSubmitted}
        onSubmit={submitCertificate}
      />

      {/* A transition that needs a signature opens the pad directly. */}
      <SignaturePad open={padOpen} onClose={() => setPadOpen(false)} onApply={setSignature} />

      {/* Reason-required dialog for Return / Reject / Revoke */}
      <Dialog open={!!reasonFor} onOpenChange={(o) => !o && setReasonFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{reasonFor?.label}</DialogTitle>
            <DialogDescription>
              A written reason is required and will be recorded in the case history.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            autoFocus
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder="Describe the reason (e.g. missing residence certificate, mismatched ID number)…"
            className="min-h-28"
          />

          <div className="flex items-center justify-end gap-2 mt-2">
            <button
              onClick={() => setReasonFor(null)}
              className="px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={confirmReason}
              disabled={!reasonText.trim()}
              className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
                reasonFor && (ACTION_STYLE[reasonFor.action]?.tone ?? "primary") === "danger"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-[#3752AE] text-white hover:bg-[#2c428b]"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              Confirm {reasonFor?.label}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
