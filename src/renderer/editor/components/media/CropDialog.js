import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Loader2 } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { toFileUrl } from "../../../components/shared";

// Shape presets. null = free. Width ÷ height.
const SHAPES = [
  ["Free", null],
  ["1:1", 1],
  ["16:9", 16 / 9],
  ["9:16", 9 / 16],
  ["4:5", 4 / 5],
];
const EDGE_HANDLES = ["n", "e", "s", "w"];
const CORNER_HANDLES = ["nw", "ne", "se", "sw"];
const HANDLE_POS = {
  nw: "-left-1.5 -top-1.5 cursor-nwse-resize",
  ne: "-right-1.5 -top-1.5 cursor-nesw-resize",
  se: "-right-1.5 -bottom-1.5 cursor-nwse-resize",
  sw: "-left-1.5 -bottom-1.5 cursor-nesw-resize",
  n: "left-1/2 -ml-1.5 -top-1.5 cursor-ns-resize",
  s: "left-1/2 -ml-1.5 -bottom-1.5 cursor-ns-resize",
  e: "top-1/2 -mt-1.5 -right-1.5 cursor-ew-resize",
  w: "top-1/2 -mt-1.5 -left-1.5 cursor-ew-resize",
};

/**
 * #448: the one crop window — opened from the screenshot message and from a
 * Media tab picture. Drag the box or its handles, or pick a shape; the box
 * lives in the IMAGE's own pixels, so what Save hands back is exactly the
 * region to cut. Saving always makes a copy (the caller decides where); this
 * component never touches a file.
 *
 * onSave(rect) may return { error } to keep the window open with the reason.
 */
export default function CropDialog({ path, title, onCancel, onSave }) {
  const [natural, setNatural] = useState(null); // { w, h } once the image loads
  const [scale, setScale] = useState(1);        // display px per image px
  const [rect, setRect] = useState(null);
  const [aspect, setAspect] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // The drag handlers read the box from here, never from a render closure —
  // one writer (applyRect) keeps it and the state in step.
  const rectRef = useRef(null);
  const dragRef = useRef(null);

  const applyRect = useCallback((r) => {
    rectRef.current = r;
    setRect(r);
  }, []);

  const onImgLoad = useCallback((e) => {
    const w = e.currentTarget.naturalWidth;
    const h = e.currentTarget.naturalHeight;
    const maxW = Math.min(720, window.innerWidth - 96);
    const maxH = Math.min(460, window.innerHeight - 220);
    setNatural({ w, h });
    setScale(Math.min(maxW / w, maxH / h, 1));
    applyRect({ x: 0, y: 0, w, h });
  }, [applyRect]);

  const pickShape = useCallback((a) => {
    setAspect(a);
    if (!a || !natural) return;
    // Largest box of that shape, centred.
    const w = Math.min(natural.w, natural.h * a);
    const h = w / a;
    applyRect({ x: (natural.w - w) / 2, y: (natural.h - h) / 2, w, h });
  }, [natural, applyRect]);

  const save = useCallback(async () => {
    const r = rectRef.current;
    if (!r || busy) return;
    setBusy(true);
    setError(null);
    const result = await onSave({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
    // On success the caller unmounts this window; only a refusal lands here.
    if (result?.error) {
      setError(result.error);
      setBusy(false);
    }
  }, [busy, onSave]);

  // Enter saves, Esc cancels, and no key reaches the editor underneath while
  // this is open (Space would play, Delete would delete). Capture phase so
  // nothing else sees the key first — the ShortcutsDialog pattern.
  useEffect(() => {
    const onKey = (e) => {
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); if (!busy) onCancel(); }
      else if (e.key === "Enter") { e.preventDefault(); save(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, onCancel, save]);

  const onPointerDown = (e) => {
    if (!rectRef.current || busy) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { handle: e.target.dataset.handle || "move", x0: e.clientX, y0: e.clientY, r0: { ...rectRef.current } };
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || !natural) return;
    const W = natural.w;
    const H = natural.h;
    const min = Math.max(16, 24 / scale);
    const dx = (e.clientX - d.x0) / scale;
    const dy = (e.clientY - d.y0) / scale;
    const s = d.r0;
    const hd = d.handle;
    let { x, y, w, h } = s;
    if (hd === "move") {
      x = Math.max(0, Math.min(s.x + dx, W - s.w));
      y = Math.max(0, Math.min(s.y + dy, H - s.h));
    } else if (aspect) {
      // Shape locked: corners only, the opposite corner stays put.
      const east = hd.includes("e");
      const south = hd.includes("s");
      const maxW = east ? W - s.x : s.x + s.w;
      const maxH = south ? H - s.y : s.y + s.h;
      w = Math.max(min, Math.min(s.w + (east ? dx : -dx), maxW, maxH * aspect));
      h = w / aspect;
      x = east ? s.x : s.x + s.w - w;
      y = south ? s.y : s.y + s.h - h;
    } else {
      if (hd.includes("e")) w = Math.max(min, Math.min(s.w + dx, W - s.x));
      if (hd.includes("s")) h = Math.max(min, Math.min(s.h + dy, H - s.y));
      if (hd.includes("w")) { const nx = Math.max(0, Math.min(s.x + dx, s.x + s.w - min)); w = s.x + s.w - nx; x = nx; }
      if (hd.includes("n")) { const ny = Math.max(0, Math.min(s.y + dy, s.y + s.h - min)); h = s.y + s.h - ny; y = ny; }
    }
    applyRect({ x, y, w, h });
  };
  const onPointerUp = () => { dragRef.current = null; };

  const handles = aspect ? CORNER_HANDLES : [...CORNER_HANDLES, ...EDGE_HANDLES];

  // Portaled: a drawer ancestor with a transform would otherwise trap the
  // fixed overlay inside it. Into the fullscreen element when there is one,
  // or it would open behind a fullscreen viewer.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <div className="rounded-xl border bg-popover shadow-2xl max-w-[calc(100vw-32px)]">
        <div className="flex items-center gap-2 px-3.5 py-2.5 border-b">
          <span className="text-[13px] font-semibold text-foreground">Crop</span>
          <span className="text-[11px] text-muted-foreground truncate min-w-0" title={path}>{title}</span>
          <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={onCancel} disabled={busy} title="Cancel">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="p-3.5 flex items-center justify-center" style={{ background: "hsl(var(--stage))" }}>
          <div
            className="relative select-none"
            style={natural ? { width: natural.w * scale, height: natural.h * scale } : { width: 320, height: 180 }}
          >
            {/* The picture and the dimming outside the box, clipped to the
                picture. The box you drag sits outside this clip, so handles on
                the picture's edge aren't cut in half. */}
            <div className="absolute inset-0 overflow-hidden">
              <img
                src={toFileUrl(path)}
                alt=""
                onLoad={onImgLoad}
                onError={() => setError("Couldn't open this picture")}
                draggable={false}
                className="block w-full h-full pointer-events-none"
              />
              {rect && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: rect.x * scale, top: rect.y * scale, width: rect.w * scale, height: rect.h * scale,
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.58)",
                  }}
                />
              )}
            </div>
            {rect && (
              <div
                className="absolute cursor-move outline outline-[1.5px] outline-white"
                style={{
                  left: rect.x * scale, top: rect.y * scale, width: rect.w * scale, height: rect.h * scale,
                  touchAction: "none",
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {/* Thirds, the usual framing guide */}
                <div className="absolute inset-y-0 left-1/3 w-px bg-white/30 pointer-events-none" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-white/30 pointer-events-none" />
                <div className="absolute inset-x-0 top-1/3 h-px bg-white/30 pointer-events-none" />
                <div className="absolute inset-x-0 top-2/3 h-px bg-white/30 pointer-events-none" />
                {handles.map((hd) => (
                  <div
                    key={hd}
                    data-handle={hd}
                    className={`absolute h-3 w-3 rounded-sm bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)] ${HANDLE_POS[hd]}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3.5 py-2.5 border-t">
          {SHAPES.map(([label, a]) => (
            <button
              key={label}
              onClick={() => pickShape(a)}
              disabled={!natural || busy}
              className={`h-[26px] px-2.5 rounded-md border text-[11.5px] transition-colors ${
                aspect === a
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              }`}
            >
              {label}
            </button>
          ))}
          {rect && (
            <span className="ml-2 text-[11px] text-muted-foreground tabular-nums">
              {Math.round(rect.w)} × {Math.round(rect.h)} px
            </span>
          )}
          <span className="flex-1" />
          {error ? (
            <span className="text-[11px] text-red-400 mr-1.5 max-w-[240px] truncate" title={error}>{error}</span>
          ) : (
            <span className="text-[10.5px] text-muted-foreground/70 mr-1.5">Enter saves · Esc cancels</span>
          )}
          <Button variant="outline" size="sm" className="h-[30px] text-xs" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" className="h-[30px] text-xs" onClick={save} disabled={!rect || busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save cropped copy"}
          </Button>
        </div>
      </div>
    </div>,
    document.fullscreenElement || document.body
  );
}
