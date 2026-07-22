import { useEffect, useState } from "react";
import { Stamp as StampIcon, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

/*
 * Official stamps applied to a certificate. A document can carry several — the
 * village stamp plus a district one, for example — so each is an independent
 * object with its own position, size and rotation.
 *
 * x/y are pixels inside the certificate body. `null` means "not placed yet";
 * the certificate then drops it at its default anchor, beside the signature.
 */
export interface Stamp {
  id: string;
  kind: "preset" | "image";
  data: string; // image data-URL when kind === "image"
  line1: string;
  line2: string;
  color: string;
  size: number;
  rotation: number;
  x: number | null;
  y: number | null;
}

export const STAMP_COLORS = [
  { label: "Red", value: "#B91C1C" },
  { label: "Blue", value: "#1D4ED8" },
  { label: "Purple", value: "#6D28D9" },
];

const PRESETS: { label: string; line1: string; line2: string }[] = [
  { label: "Village office", line1: "ຫ້ອງການບ້ານ", line2: "VILLAGE OFFICE" },
  { label: "District office", line1: "ຫ້ອງການເມືອງ", line2: "DISTRICT OFFICE" },
  { label: "Civil registrar", line1: "ນາຍທະບຽນ", line2: "CIVIL REGISTRAR" },
  { label: "Certified true copy", line1: "ສຳເນົາຖືກຕ້ອງ", line2: "CERTIFIED TRUE COPY" },
];

export const DEFAULT_STAMP_SIZE = 108;

/** Renders one stamp at its configured size, colour and rotation. */
export function StampMark({ stamp }: { stamp: Stamp }) {
  const { size, rotation } = stamp;

  if (stamp.kind === "image") {
    return (
      <img
        src={stamp.data}
        alt="stamp"
        style={{ width: size, height: size, transform: `rotate(${rotation}deg)` }}
        className="object-contain pointer-events-none select-none"
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        transform: `rotate(${rotation}deg)`,
        borderColor: stamp.color,
        color: stamp.color,
      }}
      className="rounded-full border-[3px] flex items-center justify-center pointer-events-none select-none"
    >
      <div
        style={{ borderColor: stamp.color, width: size - 14, height: size - 14 }}
        className="rounded-full border flex flex-col items-center justify-center text-center px-2 leading-tight"
      >
        <span style={{ fontSize: size * 0.115 }} className="font-semibold">
          {stamp.line1}
        </span>
        <span style={{ fontSize: size * 0.085, letterSpacing: "0.04em" }} className="font-medium mt-0.5">
          {stamp.line2}
        </span>
        <span style={{ fontSize: size * 0.13 }} className="mt-0.5 leading-none">
          ★
        </span>
      </div>
    </div>
  );
}

let stampSeq = 0;

export function StampPad({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (s: Stamp) => void;
}) {
  const [tab, setTab] = useState<"preset" | "image">("preset");
  const [preset, setPreset] = useState(0);
  const [line1, setLine1] = useState(PRESETS[0].line1);
  const [line2, setLine2] = useState(PRESETS[0].line2);
  const [color, setColor] = useState(STAMP_COLORS[0].value);
  const [size, setSize] = useState(DEFAULT_STAMP_SIZE);
  const [rotation, setRotation] = useState(-12);
  const [image, setImage] = useState("");

  useEffect(() => {
    if (!open) return;
    setTab("preset");
    setPreset(0);
    setLine1(PRESETS[0].line1);
    setLine2(PRESETS[0].line2);
    setColor(STAMP_COLORS[0].value);
    setSize(DEFAULT_STAMP_SIZE);
    setRotation(-12);
    setImage("");
  }, [open]);

  function choosePreset(i: number) {
    setPreset(i);
    setLine1(PRESETS[i].line1);
    setLine2(PRESETS[i].line2);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(file);
  }

  const draft: Stamp = {
    id: "preview",
    kind: tab,
    data: image,
    line1,
    line2,
    color,
    size,
    rotation,
    x: null,
    y: null,
  };
  const canApply = tab === "preset" ? !!line1.trim() : !!image;

  function apply() {
    if (!canApply) return;
    stampSeq += 1;
    onApply({ ...draft, id: `stamp-${stampSeq}` });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add stamp</DialogTitle>
          <DialogDescription>
            Pick an official stamp or upload an image. You can drag it into place on the certificate afterwards.
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
          {([
            { id: "preset", label: "Official stamp", icon: StampIcon },
            { id: "image", label: "Upload", icon: Upload },
          ] as const).map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  active ? "bg-white text-[#3752AE] shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex gap-4">
          {/* Controls */}
          <div className="flex-1 min-w-0 space-y-3">
            {tab === "preset" ? (
              <>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Template</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PRESETS.map((p, i) => (
                      <button
                        key={p.label}
                        onClick={() => choosePreset(i)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border text-left ${
                          preset === i
                            ? "border-[#3752AE] bg-[#3752AE]/5 text-[#3752AE]"
                            : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Line 1 (Lao)</span>
                  <input
                    value={line1}
                    onChange={(e) => setLine1(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 outline-none text-sm focus:border-[#3752AE]"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-gray-500">Line 2</span>
                  <input
                    value={line2}
                    onChange={(e) => setLine2(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 outline-none text-sm focus:border-[#3752AE]"
                  />
                </label>

                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Ink colour</p>
                  <div className="flex items-center gap-2">
                    {STAMP_COLORS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => setColor(c.value)}
                        title={c.label}
                        style={{ backgroundColor: c.value }}
                        className={`w-7 h-7 rounded-full border-2 ${
                          color === c.value ? "border-gray-800" : "border-transparent"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <label className="flex flex-col items-center justify-center h-[168px] rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 cursor-pointer hover:border-[#3752AE]/50">
                {image ? (
                  <img src={image} alt="stamp" className="max-h-[148px] object-contain" />
                ) : (
                  <>
                    <Upload className="w-7 h-7 text-gray-400" />
                    <span className="text-xs text-gray-400 mt-2">Click to upload a stamp image</span>
                    <span className="text-[11px] text-gray-300 mt-0.5">PNG with transparency works best</span>
                  </>
                )}
                <input type="file" accept="image/*" onChange={onFile} className="hidden" />
              </label>
            )}

            <label className="block">
              <span className="text-xs font-medium text-gray-500">Size · {size}px</span>
              <input
                type="range"
                min="64"
                max="180"
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                className="w-full mt-1 accent-[#3752AE]"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-gray-500">Rotation · {rotation}°</span>
              <input
                type="range"
                min="-45"
                max="45"
                value={rotation}
                onChange={(e) => setRotation(Number(e.target.value))}
                className="w-full mt-1 accent-[#3752AE]"
              />
            </label>
          </div>

          {/* Live preview */}
          <div className="w-48 flex-shrink-0 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center p-3">
            {canApply ? (
              <StampMark stamp={draft} />
            ) : (
              <span className="text-xs text-gray-300">Preview</span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-1">
          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={!canApply}
            className="px-3.5 py-2 rounded-xl text-sm font-medium bg-[#3752AE] text-white hover:bg-[#2c428b] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add stamp
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
