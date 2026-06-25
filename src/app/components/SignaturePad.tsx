import { useEffect, useRef, useState } from "react";
import { PenLine, Type as TypeIcon, Upload, Eraser } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

export type Signature = { kind: "draw" | "type" | "image"; data: string };

const SIGN_FONT = '"Brush Script MT", "Segoe Script", "Snell Roundhand", cursive';

/** Renders an applied signature (image data-URL or typed cursive text). */
export function SignatureMark({ sig, className = "" }: { sig: Signature; className?: string }) {
  if (sig.kind === "type") {
    return (
      <span style={{ fontFamily: SIGN_FONT }} className={`text-3xl leading-none text-slate-900 ${className}`}>
        {sig.data}
      </span>
    );
  }
  return <img src={sig.data} alt="signature" className={`h-16 object-contain ${className}`} />;
}

type Tab = "draw" | "type" | "image";

export function SignaturePad({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (s: Signature) => void;
}) {
  const [tab, setTab] = useState<Tab>("draw");
  const [typed, setTyped] = useState("");
  const [image, setImage] = useState("");
  const [drawn, setDrawn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  // Reset when reopened.
  useEffect(() => {
    if (open) {
      setTab("draw");
      setTyped("");
      setImage("");
      setDrawn(false);
    }
  }, [open]);

  // Configure stroke each time the draw canvas mounts.
  useEffect(() => {
    if (tab !== "draw") return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    setDrawn(false);
  }, [tab, open]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    setDrawn(true);
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function up() {
    drawing.current = false;
  }
  function clearCanvas() {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setDrawn(false);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(file);
  }

  const canApply = tab === "draw" ? drawn : tab === "type" ? !!typed.trim() : !!image;

  function apply() {
    if (tab === "draw") {
      if (!drawn) return;
      onApply({ kind: "draw", data: canvasRef.current!.toDataURL("image/png") });
    } else if (tab === "type") {
      if (!typed.trim()) return;
      onApply({ kind: "type", data: typed.trim() });
    } else {
      if (!image) return;
      onApply({ kind: "image", data: image });
    }
    onClose();
  }

  const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "draw", label: "Draw", icon: PenLine },
    { id: "type", label: "Type", icon: TypeIcon },
    { id: "image", label: "Upload", icon: Upload },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Digital signature</DialogTitle>
          <DialogDescription>Draw, type, or upload your signature.</DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  active ? "bg-white text-[#344EAD] shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Panel */}
        <div className="mt-1">
          {tab === "draw" && (
            <div>
              <canvas
                ref={canvasRef}
                width={440}
                height={170}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerLeave={up}
                className="w-full h-[170px] rounded-xl border border-gray-200 bg-white touch-none cursor-crosshair"
              />
              <button
                onClick={clearCanvas}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
              >
                <Eraser className="w-3.5 h-3.5" /> Clear
              </button>
            </div>
          )}

          {tab === "type" && (
            <div>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Type your name"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white outline-none text-sm focus:border-[#344EAD]"
              />
              <div className="mt-3 h-[120px] rounded-xl border border-gray-200 bg-white flex items-center justify-center">
                {typed.trim() ? (
                  <span style={{ fontFamily: SIGN_FONT }} className="text-4xl text-slate-900">
                    {typed}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300">Preview</span>
                )}
              </div>
            </div>
          )}

          {tab === "image" && (
            <div>
              <label className="flex flex-col items-center justify-center h-[170px] rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 cursor-pointer hover:border-[#344EAD]/50">
                {image ? (
                  <img src={image} alt="signature" className="max-h-[150px] object-contain" />
                ) : (
                  <>
                    <Upload className="w-7 h-7 text-gray-400" />
                    <span className="text-xs text-gray-400 mt-2">Click to upload an image</span>
                  </>
                )}
                <input type="file" accept="image/*" onChange={onFile} className="hidden" />
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 mt-2">
          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={!canApply}
            className="px-3.5 py-2 rounded-xl text-sm font-medium bg-[#344EAD] text-white hover:bg-[#2a3f8a] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply signature
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
