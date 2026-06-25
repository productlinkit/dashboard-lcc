import { useMemo, useRef, useState } from "react";
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
  Eye,
  FileText,
  Download,
  Award,
  ShieldCheck,
  Printer,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { SignaturePad, SignatureMark, type Signature } from "../components/SignaturePad";
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
import {
  APPLICATIONS,
  PIPELINE_ORDER,
  STATUS_META,
  type AppStatus,
  type Application,
} from "../data/mockData";
import {
  SERVICE_FORMS,
  REQUIREMENT_META,
  type FieldDef,
  type FormSection,
  type FieldType,
} from "../data/serviceForms";
import { SERVICE_BY_ID } from "../serviceConfig";
import { StatusBadge } from "../components/StatusBadge";

/* Allowed status transitions (village → district workflow). */
type Tone = "primary" | "neutral" | "danger";
interface Transition {
  to: AppStatus;
  label: string;
  tone: Tone;
  icon: React.ComponentType<{ className?: string }>;
}
const TRANSITIONS: Record<AppStatus, Transition[]> = {
  draft: [{ to: "submitted", label: "Submit", tone: "primary", icon: Send }],
  submitted: [
    { to: "certified", label: "Certify (village)", tone: "primary", icon: BadgeCheck },
    { to: "returned", label: "Return for correction", tone: "neutral", icon: CornerUpLeft },
    { to: "rejected", label: "Reject", tone: "danger", icon: X },
  ],
  certified: [
    { to: "under-review", label: "Send to district review", tone: "primary", icon: Send },
    { to: "returned", label: "Return for correction", tone: "neutral", icon: CornerUpLeft },
    { to: "rejected", label: "Reject", tone: "danger", icon: X },
  ],
  "under-review": [
    { to: "registered", label: "Register & sign", tone: "primary", icon: FileSignature },
    { to: "returned", label: "Return for correction", tone: "neutral", icon: CornerUpLeft },
    { to: "rejected", label: "Reject", tone: "danger", icon: X },
  ],
  returned: [{ to: "submitted", label: "Re-submit", tone: "primary", icon: Send }],
  registered: [{ to: "issued", label: "Issue certificate", tone: "primary", icon: Check }],
  issued: [{ to: "revoked", label: "Revoke / cancel", tone: "danger", icon: Ban }],
  rejected: [],
  revoked: [],
};

const TONE_CLASS: Record<Tone, string> = {
  primary: "bg-[#344EAD] text-white hover:bg-[#2a3f8a]",
  neutral: "bg-gray-100 text-gray-700 hover:bg-gray-200",
  danger: "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200",
};

interface HistoryEntry {
  status: AppStatus;
  at: string;
  by: string;
  note?: string;
}

/* Negative / auditable transitions that require a written reason (PRD §11.4). */
const REQUIRES_REASON = new Set<AppStatus>(["returned", "rejected", "revoked"]);

/* ── Deterministic demo values ── */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function pick<T>(arr: T[], seed: string): T {
  return arr[hash(seed) % arr.length];
}

const MALE_NAMES = ["Somchai Vongduang", "Bounthavy Detsana", "Khamla Sisavath", "Phout Inthavong", "Souksavanh Rattanavong"];
const FEMALE_NAMES = ["Khampheng Keomany", "Vilaiphone Soukaloun", "Noy Phommachanh", "Latda Sayavong", "Manivanh Khounnavong"];
const ANY_NAMES = [...MALE_NAMES, ...FEMALE_NAMES];
const ETHNIC_GROUPS = ["Lao Loum", "Lao Theung", "Hmong", "Khmu", "Tai Dam"];
const RELIGIONS = ["Buddhism", "Christianity", "Animism", "None"];
const OCCUPATIONS = ["Farmer", "Teacher", "Trader", "Civil servant", "Nurse"];
const EDUCATION = ["Primary", "Lower secondary", "Upper secondary", "Bachelor's degree"];
const MARITAL = ["Single", "Married", "Widowed", "Divorced"];

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** A realistic, deterministic value for a field on the review screen. */
function demoValue(f: FieldDef, app: Application, ctx: string): string {
  const seed = app.id + "|" + ctx + "|" + f.en;
  const name = f.en.toLowerCase();
  const isMother = /mother|wife/i.test(ctx);
  const isFather = /father|husband/i.test(ctx);

  if (f.type === "static") return "Family Law No. 44/NA, dated 14/06/2018";
  if (f.type === "document") return `${slug(f.en)}.pdf`;
  if (f.type === "image") return "photo-3x4.jpg";

  // Header / reference numbers
  if (/^(ref\. no\.|document no\.|family book no\.)/.test(name)) return app.id;
  if (name.includes("uin")) return "LA-" + (hash(seed) % 9000000 + 1000000);
  if (name.includes("census book") || name.includes("id card")) {
    return `01-${hash(seed) % 90 + 10}-${hash(seed) % 9000 + 1000} · issued ${app.submitted}`;
  }

  // Names
  if (/full name|citizen's name|holder's name|name and surname/.test(name)) {
    if (isMother) return pick(FEMALE_NAMES, seed);
    if (isFather) return pick(MALE_NAMES, seed);
    if (/informant|witness/i.test(ctx)) return pick(ANY_NAMES, seed);
    return app.applicant;
  }
  if (name.startsWith("witness")) return `${pick(ANY_NAMES, seed)} · 1-${hash(seed) % 9000 + 1000}`;

  // Dates / time
  if (name === "date" || name.startsWith("dated") || name.startsWith("date /") || name.startsWith("date of issue")) return app.submitted;
  if (name.startsWith("date of birth")) {
    const y = 1960 + (hash(seed) % 55);
    const m = String((hash(seed) % 12) + 1).padStart(2, "0");
    const d = String((hash(seed) % 28) + 1).padStart(2, "0");
    return `${d}/${m}/${y}`;
  }
  if (name.startsWith("date of death") || name.startsWith("date of marriage") || name.startsWith("date of divorce")) return app.submitted;
  if (f.type === "time") return ["06:45", "08:30", "14:10", "21:05"][hash(seed) % 4];

  // Demographics
  if (name === "gender") return isMother ? "Female" : isFather ? "Male" : pick(["Male", "Female"], seed);
  if (name === "age") return String(20 + (hash(seed) % 45));
  if (name === "nationality") return "Lao";
  if (name === "ethnicity") return "Lao Loum";
  if (name === "ethnic group") return pick(ETHNIC_GROUPS, seed);
  if (name === "religion") return pick(RELIGIONS, seed);
  if (name.startsWith("ethnicity /")) return `Lao Loum · Lao · ${pick(RELIGIONS, seed)}`;
  if (name === "occupation") return pick(OCCUPATIONS, seed);
  if (name.includes("education")) return pick(EDUCATION, seed);
  if (name.includes("marital status")) return pick(MARITAL, seed);

  // Addresses / places (lookups)
  if (name.startsWith("province") || name.includes("/ province")) return app.province;
  if (name.includes("address") || name.includes("place of") || name.includes("current village") || name === "village" || name.includes("native village")) {
    return `Ban ${pick(["Nasai", "Dongdok", "Phonsavang", "Sikhai", "Thatluang"], seed)}, ${app.province}`;
  }
  if (name.includes("certifying district")) return app.province;
  if (name.includes("place of registration")) return `DoHA Office, ${app.province}`;

  // Household / location detail
  if (name.startsWith("house no")) return String(hash(seed) % 400 + 1);
  if (name.startsWith("group")) return "Khum " + ((hash(seed) % 6) + 1);
  if (name.startsWith("unit")) return "Unit " + ((hash(seed) % 9) + 1);
  if (name.startsWith("village chief")) return pick(MALE_NAMES, seed);
  if (name.startsWith("total people")) return String(hash(seed) % 6 + 2);
  if (name.startsWith("number of men")) return `${hash(seed) % 3 + 1} / ${hash(seed) % 3 + 1}`;

  // Birth specifics
  if (name.startsWith("weight")) return `${(hash(seed) % 20 + 25) / 10} kg / ${hash(seed) % 10 + 45} cm`;
  if (name.startsWith("blood")) return pick(["O+", "A+", "B+", "AB+", "O-"], seed);
  if (name.startsWith("fingerprint")) return "FP-" + (hash(seed) % 900000 + 100000);
  if (name.startsWith("mode of delivery")) return pick(["Natural", "C-section"], seed);
  if (name.startsWith("type of birth")) return pick(["Single", "Twins"], seed);
  if (name.startsWith("co-delivered")) return "N/A (single birth)";

  // Death specifics
  if (name.startsWith("cause of death")) return pick(["Illness", "Accident", "Natural causes"], seed);

  // Marriage / divorce
  if (name.startsWith("divorce type")) return pick(["Voluntary", "Contested"], seed);
  if (name.includes("residence certificate ref")) return "RC-2026-00" + (hash(seed) % 9000 + 1000);
  if (name.includes("marriage certificate ref")) return "MC-2026-00" + (hash(seed) % 9000 + 1000);
  if (name.includes("children") || name.includes("custody")) return "1 dependent — joint custody";

  // Contact
  if (name.startsWith("phone")) return "+856 20 " + (hash(seed) % 9000000 + 1000000);
  if (name.startsWith("email")) return slug(app.applicant) + "@example.la";
  if (name.startsWith("relationship")) return pick(["Spouse", "Child", "Parent", "Sibling"], seed);
  if (name.startsWith("this certificate is used for")) return pick(["School enrolment", "Bank account", "Employment"], seed);

  // Signatures / auto
  if (f.type === "signature") return "E-signed · National CA";
  if (f.type === "auto") return "Auto-generated";

  return "—";
}

const TYPE_ICON: Partial<Record<FieldType, React.ComponentType<{ className?: string }>>> = {
  image: ImageIcon,
  document: Paperclip,
  signature: PenLine,
  auto: Hash,
  time: Clock,
};

interface PreviewTarget {
  title: string;
  filename: string;
  kind: "document" | "image";
}

function ReqChip({ req }: { req: FieldDef["req"] }) {
  const m = REQUIREMENT_META[req];
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide"
      style={{ color: m.color, backgroundColor: m.bg }}
    >
      {m.label}
    </span>
  );
}

/* ── Edit-mode helpers ── */
export function fieldKey(sectionTitle: string, instance: string | null, en: string): string {
  return `${sectionTitle}::${instance ?? ""}::${en}`;
}

export function isEmptyValue(v: string | undefined): boolean {
  return !v || v.trim() === "" || v.trim() === "—";
}

function choiceOptions(en: string): string[] | null {
  const n = en.toLowerCase();
  if (n === "gender") return ["Male", "Female"];
  if (n.includes("marital status")) return ["Single", "Married", "Widowed", "Divorced"];
  if (n.startsWith("type of birth")) return ["Single", "Twins"];
  if (n.startsWith("mode of delivery")) return ["Natural", "C-section"];
  if (n.startsWith("cause of death")) return ["Illness", "Accident", "Suicide", "Homicide", "Other"];
  if (n.startsWith("divorce type")) return ["Voluntary", "Contested"];
  if (n.startsWith("relationship to household")) return ["Spouse", "Child", "Parent", "Sibling", "Other"];
  return null;
}

function FieldInput({
  f,
  value,
  invalid,
  warn,
  onChange,
}: {
  f: FieldDef;
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
        : "border-gray-200 bg-white focus:border-[#344EAD]"
  }`;

  if (f.type === "document" || f.type === "image") {
    return (
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-sm text-gray-600 truncate">{value || "No file"}</span>
        <button className="text-xs text-[#344EAD] hover:underline whitespace-nowrap">Upload</button>
      </div>
    );
  }
  if (f.type === "auto" || f.type === "static" || f.type === "signature") {
    return <div className="mt-1.5 text-sm text-gray-400">{value} <span className="text-[10px]">(auto)</span></div>;
  }

  const options = f.type === "choice" ? choiceOptions(f.en) : null;
  if (options) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={base}>
        <option value="">— Select —</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={`Enter ${f.en.toLowerCase()}…`}
      className={base}
    />
  );
}

function FieldRow({
  f,
  value,
  editing,
  invalid,
  warn,
  onPreview,
  onChange,
}: {
  f: FieldDef;
  value: string;
  editing: boolean;
  invalid: boolean;
  warn: boolean;
  onPreview: (t: PreviewTarget) => void;
  onChange: (v: string) => void;
}) {
  const Icon = TYPE_ICON[f.type];
  const previewable = f.type === "document" || f.type === "image";

  return (
    <div className="py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {Icon && <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
            <span className="text-sm font-medium text-gray-800">{f.en}</span>
            <span className="text-xs text-gray-400">{f.lo}</span>
          </div>
          {f.desc && <p className="text-xs text-gray-400 mt-0.5">{f.desc}</p>}
        </div>
        <ReqChip req={f.req} />
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
          {previewable ? (
            <button
              onClick={() => onPreview({ title: f.en, filename: value, kind: f.type as "document" | "image" })}
              className="inline-flex items-center gap-1.5 text-[#344EAD] hover:underline"
            >
              <Eye className="w-3.5 h-3.5" />
              {value}
            </button>
          ) : isEmptyValue(value) ? (
            <span className="text-gray-300 italic">—</span>
          ) : (
            <span className="text-gray-700">{value}</span>
          )}
        </div>
      )}
    </div>
  );
}

function SectionCard({
  section,
  values,
  editing,
  errorKeys,
  warnKeys,
  onPreview,
  onChange,
}: {
  section: FormSection;
  values: Record<string, string>;
  editing: boolean;
  errorKeys: Set<string>;
  warnKeys: Set<string>;
  onPreview: (t: PreviewTarget) => void;
  onChange: (key: string, v: string) => void;
}) {
  const instances = section.instances ?? [null];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-800">
          {section.title}
          {section.laTitle && <span className="ml-2 text-sm font-normal text-gray-400">{section.laTitle}</span>}
        </h3>
        {section.note && <p className="text-xs text-gray-400 mt-1">{section.note}</p>}
      </div>
      <div className="p-5 space-y-5">
        {instances.map((inst, i) => (
          <div key={i}>
            {inst && (
              <div className="mb-1 inline-flex items-center px-2.5 py-1 rounded-lg bg-gray-50 text-xs font-semibold text-gray-600">
                {inst}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              {section.fields.map((f) => {
                const key = fieldKey(section.title, inst, f.en);
                return (
                  <FieldRow
                    key={key}
                    f={f}
                    value={values[key] ?? ""}
                    editing={editing}
                    invalid={errorKeys.has(key)}
                    warn={warnKeys.has(key)}
                    onPreview={onPreview}
                    onChange={(v) => onChange(key, v)}
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

function PreviewDialog({ target, onClose }: { target: PreviewTarget | null; onClose: () => void }) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {target?.kind === "image" ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            {target?.title}
          </DialogTitle>
        </DialogHeader>

        {target?.kind === "image" ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 flex justify-center">
            <img
              src={photo3x4}
              alt="3×4 photograph"
              className="rounded-lg object-cover aspect-[3/4] max-h-80 w-auto shadow-sm"
            />
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-inner">
            <div className="flex items-center gap-2 text-gray-700 mb-4">
              <FileText className="w-5 h-5 text-[#344EAD]" />
              <span className="font-medium text-sm">{target?.title}</span>
            </div>
            <div className="space-y-2">
              <div className="h-2.5 rounded bg-gray-100 w-3/4" />
              <div className="h-2.5 rounded bg-gray-100 w-full" />
              <div className="h-2.5 rounded bg-gray-100 w-5/6" />
              <div className="h-2.5 rounded bg-gray-100 w-2/3" />
              <div className="h-20 rounded bg-gray-50 border border-dashed border-gray-200 mt-4 flex items-center justify-center text-xs text-gray-400">
                Document preview
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-400 font-mono">{target?.filename}</span>
          <button className="inline-flex items-center gap-1.5 text-sm text-[#344EAD] hover:underline">
            <Download className="w-4 h-4" /> Download
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Deterministic faux QR code (decorative, offline) ── */
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

/* Generic certificate kept for non-resident services. */
function GenericCertificate({ app }: { app: Application }) {
  const svc = SERVICE_BY_ID[app.serviceId];
  const verifyUrl = `verify.gov.la/c/${app.id}`;
  const rows: [string, string][] = [
    [svc.id === "family-book" ? "Household head" : "Full name", app.applicant],
    ["Jurisdiction", app.province],
    ["Date of issue", app.submitted],
  ];
  if (svc.id === "birth") rows.push(["UIN", "LA-" + (hash(app.id) % 9000000 + 1000000)]);

  return (
    <div className="bg-white">
      <div className="h-1.5" style={{ backgroundColor: svc.color }} />
      <div className="p-8">
        <div className="text-center">
          <p className="text-[11px] tracking-wide text-gray-500">ສາທາລະນະລັດ ປະຊາທິປະໄຕ ປະຊາຊົນລາວ</p>
          <p className="text-[11px] tracking-wide text-gray-500">Lao People's Democratic Republic</p>
          <p className="text-[10px] text-gray-400 mt-0.5">ສັນຕິພາບ ເອກະລາດ ປະຊາທິປະໄຕ ເອກະພາບ ວັດທະນະຖາວອນ</p>
          <p className="text-[10px] text-gray-400">Ministry of Home Affairs (MoHA)</p>
        </div>
        <div className="flex items-center justify-center my-5">
          <span className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: `${svc.color}1A` }}>
            <Award className="w-6 h-6" style={{ color: svc.color } as React.CSSProperties} />
          </span>
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-800">{svc.label}</h2>
          <p className="text-sm text-gray-400">{svc.laLabel}</p>
          <p className="mt-1 text-xs font-mono text-gray-500">No. {app.id}</p>
        </div>
        <p className="text-center text-sm text-gray-600 mt-5 max-w-md mx-auto">{CERT_STATEMENT[svc.id]}</p>
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
              <QrCode value={verifyUrl} />
            </div>
            <div className="text-[11px] text-gray-400 leading-snug">
              <p className="font-medium text-gray-500">Scan to verify</p>
              <p className="font-mono">{verifyUrl}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
              <ShieldCheck className="w-4 h-4" /> Protected e-signature
            </div>
            <p className="text-sm font-semibold text-gray-700 mt-1">{app.officer ?? "District Registrar"}</p>
            <p className="text-[11px] text-gray-400">DoHA Registrar · National CA</p>
            <p className="text-[11px] text-gray-400">Signed {app.submitted}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Resident Certificate — laid out to match the official RC form. */
function ResidentCertificate({
  app,
  values,
  signature,
  onSign,
}: {
  app: Application;
  values: Record<string, string>;
  signature: Signature | null;
  onSign: () => void;
}) {
  const v = (section: string, en: string) => values[fieldKey(section, null, en)] ?? "";
  const province = v("Header & jurisdiction", "Province") || app.province;
  const district = v("Header & jurisdiction", "District");
  const village = v("Header & jurisdiction", "Village's Name");
  const ref = v("Header & jurisdiction", "Ref. No.") || app.id;
  const chief = v("Certifying authority", "Village Chief's Name");
  const citizen = v("Applicant identity", "Citizen's Name") || app.applicant;
  const age = v("Applicant identity", "Age");
  const occupation = v("Applicant identity", "Occupation");
  const nationality = v("Applicant identity", "Nationality");
  const currentVillage = v("Applicant identity", "Current Village");
  const houseNo = v("Applicant identity", "House No.");
  const censusNo = v("Household reference (from Family Book)", "Household Census Book No.");
  const censusDate = v("Household reference (from Family Book)", "Date issued (census book)");
  const censusDP = v("Household reference (from Family Book)", "Census District / Province");
  const father = v("Parentage", "Is the child of Mr.");
  const mother = v("Parentage", "Is the child of Mrs.");
  const nativeVDP = v("Parentage", "Native Village / District / Province");
  const purpose = v("Purpose & issuance", "This certificate is used for");
  const issued = v("Purpose & issuance", "Date / Month / Year (issued)") || app.submitted;
  const verifyUrl = `verify.gov.la/c/${ref}`;

  return (
    <div className="bg-white">
      <div className="px-10 py-8 text-[13px] leading-7 text-slate-800">
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
            <QrCode value={verifyUrl} size={92} />
          </div>
          <div className="text-center min-w-44">
            <p>ວັນທີ {issued}</p>
            <p className="font-bold mt-1">ຫົວໜ້າບ້ານ</p>
            <div className="h-20 flex items-center justify-center">
              {signature ? (
                <SignatureMark sig={signature} />
              ) : (
                <button
                  onClick={onSign}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-[#344EAD]/40 text-[#344EAD] text-xs hover:bg-[#344EAD]/5"
                >
                  <PenLine className="w-3.5 h-3.5" /> Sign here
                </button>
              )}
            </div>
            {signature && (
              <button
                onClick={onSign}
                data-pdf-exclude="true"
                className="text-[11px] text-[#344EAD] hover:underline"
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
  app,
  values,
  open,
  onClose,
  signature,
  onSignatureChange,
  submitted,
  onSubmit,
}: {
  app: Application;
  values: Record<string, string>;
  open: boolean;
  onClose: () => void;
  signature: Signature | null;
  onSignatureChange: (s: Signature) => void;
  submitted: boolean;
  onSubmit: () => void;
}) {
  const svc = SERVICE_BY_ID[app.serviceId];
  const [padOpen, setPadOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const certRef = useRef<HTMLDivElement>(null);
  const showSubmit = svc.id === "resident";
  const canSubmit = !submitted && (!showSubmit || !!signature);

  async function handleDownload() {
    if (!certRef.current) return;
    setGenerating(true);
    try {
      await downloadCertificatePdf(certRef.current, `${app.id}.pdf`);
      toast.success("Certificate downloaded", { description: `${app.id}.pdf` });
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
            <DialogTitle>{svc.label} certificate</DialogTitle>
          </DialogHeader>

          <div ref={certRef}>
            {svc.id === "resident" ? (
              <ResidentCertificate app={app} values={values} signature={signature} onSign={() => setPadOpen(true)} />
            ) : (
              <GenericCertificate app={app} />
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
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-[#344EAD] text-white hover:bg-[#2a3f8a] disabled:opacity-40 disabled:cursor-not-allowed"
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
    </>
  );
}

/* Build the editable values map from the schema + demo values. When the case is
 * still being captured (draft) or sent back (returned), a couple of mandatory
 * fields are left blank to reflect an incomplete submission. */
function buildInitialValues(app?: Application): Record<string, string> {
  const out: Record<string, string> = {};
  if (!app) return out;
  const form = SERVICE_FORMS[app.serviceId];
  if (!form) return out;
  for (const section of form.sections) {
    for (const inst of section.instances ?? [null]) {
      for (const f of section.fields) {
        out[fieldKey(section.title, inst, f.en)] = demoValue(f, app, inst ?? section.title);
      }
    }
  }
  // Simulate an incomplete capture for draft / returned cases.
  if (app.status === "draft" || app.status === "returned") {
    let cleared = 0;
    for (let si = 1; si < form.sections.length && cleared < 2; si++) {
      const section = form.sections[si];
      for (const inst of section.instances ?? [null]) {
        for (const f of section.fields) {
          if (f.req === "mandatory") {
            out[fieldKey(section.title, inst, f.en)] = "";
            if (++cleared >= 2) break;
          }
        }
        if (cleared >= 2) break;
      }
    }
  }
  return out;
}

export function CaseDetailPage({ caseId, onBack }: { caseId: string; onBack: () => void }) {
  const app = useMemo(() => APPLICATIONS.find((a) => a.id === caseId), [caseId]);
  const [status, setStatus] = useState<AppStatus>(app?.status ?? "draft");
  const [history, setHistory] = useState<HistoryEntry[]>(
    app ? [{ status: app.status, at: app.submitted, by: app.officer ?? "Village Officer" }] : [],
  );
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [reasonFor, setReasonFor] = useState<Transition | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [certOpen, setCertOpen] = useState(false);
  const [certSubmitted, setCertSubmitted] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => buildInitialValues(app));
  const [backup, setBackup] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [signature, setSignature] = useState<Signature | null>(null);

  const validation = useMemo(() => {
    const errorKeys = new Set<string>();
    const warnKeys = new Set<string>();
    const form = app ? SERVICE_FORMS[app.serviceId] : undefined;
    if (!form) return { errorKeys, warnKeys };
    for (const section of form.sections) {
      for (const inst of section.instances ?? [null]) {
        for (const f of section.fields) {
          const key = fieldKey(section.title, inst, f.en);
          if (!isEmptyValue(values[key])) continue;
          if (f.req === "mandatory") errorKeys.add(key);
          else if (f.req === "conditional") warnKeys.add(key);
        }
      }
    }
    return { errorKeys, warnKeys };
  }, [app, values]);

  if (!app) {
    return (
      <div className="max-w-screen-2xl mx-auto">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-[#344EAD] hover:underline mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to applications
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
          Case <span className="font-mono">{caseId}</span> not found.
        </div>
      </div>
    );
  }

  const svc = SERVICE_BY_ID[app.serviceId];
  const form = SERVICE_FORMS[app.serviceId];
  const transitions = TRANSITIONS[status];

  const isEditable = status === "draft" || status === "returned";
  // The resident certificate must be signed + submitted before it can be issued.
  const certReady = certSubmitted || status === "issued";

  function submitCertificate() {
    if (svc.id === "resident" && !signature) {
      toast.error("Signature required", { description: "Sign the certificate before submitting." });
      return;
    }
    setCertSubmitted(true);
    setCertOpen(false);
    toast.success("Certificate submitted", { description: "You can now issue the certificate." });
  }

  function apply(to: AppStatus, label: string, note?: string) {
    setStatus(to);
    setEditing(false);
    setHistory((h) => [...h, { status: to, at: "just now", by: "You (current officer)", note }]);
    toast.success(`Case ${app!.id} → ${STATUS_META[to].label}`, { description: note ?? label });
  }

  function onTransition(t: Transition) {
    // Enforce mandatory fields before submitting / re-submitting (FR-1).
    if (t.to === "submitted" && validation.errorKeys.size > 0) {
      toast.error(`${validation.errorKeys.size} mandatory field(s) missing`, {
        description: "Complete the required fields before submitting.",
      });
      setEditing(true);
      return;
    }
    // A certificate must be signed + submitted before it can be issued.
    if (t.to === "issued" && svc.id === "resident" && !certReady) {
      toast.error("Certificate not submitted", { description: "Sign and submit the certificate first." });
      setCertOpen(true);
      return;
    }
    if (REQUIRES_REASON.has(t.to)) {
      setReasonText("");
      setReasonFor(t);
    } else {
      apply(t.to, t.label);
    }
  }

  function startEdit() {
    setBackup({ ...values });
    setEditing(true);
  }
  function cancelEdit() {
    setValues(backup);
    setEditing(false);
  }
  function changeField(key: string, v: string) {
    setValues((p) => ({ ...p, [key]: v }));
  }

  function confirmReason() {
    if (!reasonFor || !reasonText.trim()) return;
    apply(reasonFor.to, reasonFor.label, reasonText.trim());
    setReasonFor(null);
    setReasonText("");
  }

  return (
    <div className="max-w-screen-2xl mx-auto space-y-5">
      {/* Back + header */}
      <div>
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-[#344EAD] hover:underline mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to applications
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start gap-4">
            <span
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${svc?.color}1A` }}
            >
              {svc && <svc.icon className="w-6 h-6" style={{ color: svc.color } as React.CSSProperties} />}
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-gray-800">{app.applicant}</h2>
                <StatusBadge status={status} showLao />
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                <span className="font-mono">{app.id}</span> · {svc?.label}{" "}
                <span className="text-gray-400">{svc?.laLabel}</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {app.province} · Submitted {app.submitted} · Acting role: {STATUS_META[status].actingRole}
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
          {isEditable && form && (
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
                    className="px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-3.5 py-2 rounded-xl text-sm font-medium bg-[#344EAD] text-white hover:bg-[#2a3f8a]"
                  >
                    Done editing
                  </button>
                </div>
              ) : (
                <button
                  onClick={startEdit}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-[#344EAD] text-white hover:bg-[#2a3f8a]"
                >
                  <PenLine className="w-4 h-4" /> Edit fields
                </button>
              )}
            </div>
          )}

          {form ? (
            form.sections.map((s) => (
              <SectionCard
                key={s.title}
                section={s}
                values={values}
                editing={editing}
                errorKeys={validation.errorKeys}
                warnKeys={validation.warnKeys}
                onPreview={setPreview}
                onChange={changeField}
              />
            ))
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">
              No form schema for this service.
            </div>
          )}
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
                    : "bg-[#344EAD] text-white hover:bg-[#2a3f8a]"
                }`}
              >
                <Award className="w-4 h-4" />
                {certReady ? "View certificate" : "View & sign certificate"}
              </button>
            )}
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Actions</h3>
            {transitions.length > 0 ? (
              <div className="space-y-2">
                {transitions.map((t) => {
                  const Icon = t.icon;
                  const disabled = t.to === "issued" && svc.id === "resident" && !certReady;
                  return (
                    <button
                      key={t.to}
                      onClick={() => onTransition(t)}
                      disabled={disabled}
                      className={`w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${TONE_CLASS[t.tone]} disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      <Icon className="w-4 h-4" />
                      {t.label}
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
            <ol className="space-y-3">
              {history.map((h, i) => {
                const meta = STATUS_META[h.status];
                return (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: meta.color }} />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700">{meta.label}</p>
                      <p className="text-xs text-gray-400">
                        {h.at} · {h.by}
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
          </div>
        </div>
      </div>

      <PreviewDialog target={preview} onClose={() => setPreview(null)} />
      <CertificateDialog
        app={app}
        values={values}
        open={certOpen}
        onClose={() => setCertOpen(false)}
        signature={signature}
        onSignatureChange={setSignature}
        submitted={certSubmitted}
        onSubmit={submitCertificate}
      />

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
                reasonFor && reasonFor.tone === "danger"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-[#344EAD] text-white hover:bg-[#2a3f8a]"
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
