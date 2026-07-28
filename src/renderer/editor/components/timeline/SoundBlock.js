import React, { useRef, useState, useEffect, useCallback } from "react";
import { Music, Volume2 } from "lucide-react";
import { SEGMENT_RADIUS, SOUND_COLORS } from "./timelineConstants";

// ── Peaks cache (#202b) ──
// Waveform shape per sound FILE, fetched once per session and shared by every
// block that uses it (the same sound placed five times draws five waveforms
// from one extraction). Module-level so it survives clip switches.
const peaksCache = new Map(); // path → { peaks } | { error }
const peaksPending = new Map(); // path → Promise

function useAssetPeaks(filePath) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!filePath || peaksCache.has(filePath)) return;
    let alive = true;
    if (!peaksPending.has(filePath)) {
      const req = window.clipflow?.assetsPeaks?.(filePath);
      const p = (req && typeof req.then === "function" ? req : Promise.resolve(null))
        .then((r) => {
          peaksCache.set(filePath, r?.peaks?.length ? { peaks: r.peaks } : { error: r?.error || "no peaks" });
        })
        .catch(() => { peaksCache.set(filePath, { error: "failed" }); })
        .finally(() => { peaksPending.delete(filePath); });
      peaksPending.set(filePath, p);
    }
    peaksPending.get(filePath)?.then(() => { if (alive) bump((n) => n + 1); });
    return () => { alive = false; };
  }, [filePath]);
  return peaksCache.get(filePath)?.peaks || null;
}

/**
 * One sound on the timeline — a song on the Music lane or a one-shot on the
 * SFX lane. Same component for both: they differ only in colour, icon and
 * whether fades apply.
 *
 * Gestures (all committed through the parent, which pushes ONE undo entry per
 * gesture via onGestureStart):
 *   drag body       → move to another moment
 *   Alt + drag body → duplicate and drag the copy (subtitle-block convention)
 *   drag either end → trim the file window; the left end keeps the audible part
 *                     where it is and cuts the silence off the front
 *   right-click     → parent opens the settings popover
 */
function SoundBlock({
  p, pxPerSec, maxTl, top, height, selected,
  onSelect, onContextMenu, onGestureStart, onMove, onTrimLeft, onTrimRight, onDuplicate,
}) {
  const canvasRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [gesture, setGesture] = useState(null); // "move" | "left" | "right"
  const rafRef = useRef(null);
  const movedRef = useRef(false);
  const targetRef = useRef(p.id);

  const peaks = useAssetPeaks(p.path);
  const colors = p.kind === "music" ? SOUND_COLORS.music : SOUND_COLORS.sfx;
  const trimStart = p.trimStart || 0;
  const trimEnd = p.trimEnd != null ? p.trimEnd : (p.durationSec || 0);
  const widthPx = Math.max(10, (trimEnd - trimStart) * pxPerSec);
  const leftPx = p.tlStart * pxPerSec;

  // ── Body drag = move (Alt = duplicate then move the copy) ──
  const onBodyDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startX = e.clientX;
    const origTl = p.tlStart;
    movedRef.current = false;
    targetRef.current = p.id;
    const wantDuplicate = !!(e.altKey && onDuplicate);

    const onMoveEv = (ev) => {
      const dx = ev.clientX - startX;
      if (!movedRef.current && Math.abs(dx) < 3) return;
      if (!movedRef.current) {
        // Alt is read at press time OR live off the move event — Windows can
        // swallow the press-time modifier (menu accelerator).
        if (onDuplicate && (wantDuplicate || ev.altKey)) {
          const cloneId = onDuplicate(p.id);
          if (cloneId) targetRef.current = cloneId;
        } else if (onGestureStart) {
          onGestureStart();
        }
        movedRef.current = true;
        setGesture("move");
        document.body.style.cursor = "grabbing";
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const next = Math.max(0, Math.min(origTl + dx / (pxPerSec || 1), Math.max(0, maxTl - 0.05)));
        onMove(targetRef.current, next);
      });
    };
    const onUp = (ev) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("pointermove", onMoveEv);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      setGesture(null);
      if (!movedRef.current) onSelect(p.id, ev);
    };
    window.addEventListener("pointermove", onMoveEv);
    window.addEventListener("pointerup", onUp);
  }, [p.id, p.tlStart, pxPerSec, maxTl, onMove, onSelect, onDuplicate, onGestureStart]);

  // ── Trim handles ──
  const onHandleDown = useCallback((side, e) => {
    e.stopPropagation();
    const startX = e.clientX;
    const origTl = p.tlStart;
    const fileLen = p.durationSec || trimEnd;
    setGesture(side);
    document.body.style.cursor = "col-resize";
    if (onGestureStart) onGestureStart();

    const onMoveEv = (ev) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const dt = (ev.clientX - startX) / (pxPerSec || 1);
        if (side === "left") {
          // Cut silence off the front WITHOUT moving the audible part: the
          // window start and the timeline anchor advance together.
          const delta = Math.max(-trimStart, Math.min(dt, trimEnd - trimStart - 0.05));
          onTrimLeft(p.id, trimStart + delta, Math.max(0, origTl + delta));
        } else {
          const next = Math.max(trimStart + 0.05, Math.min(trimEnd + dt, fileLen));
          onTrimRight(p.id, next);
        }
      });
    };
    const onUp = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("pointermove", onMoveEv);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      setGesture(null);
    };
    window.addEventListener("pointermove", onMoveEv);
    window.addEventListener("pointerup", onUp);
  }, [p.id, p.tlStart, p.durationSec, trimStart, trimEnd, pxPerSec, onTrimLeft, onTrimRight, onGestureStart]);

  // ── Waveform ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, widthPx - 2);
    const h = Math.max(1, height - 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!peaks || peaks.length === 0) return;

    // Peaks span the whole FILE — slice out the window that plays.
    const fileLen = p.durationSec || trimEnd || 1;
    const from = Math.floor(Math.max(0, trimStart / fileLen) * peaks.length);
    const to = Math.max(from + 1, Math.ceil(Math.min(1, trimEnd / fileLen) * peaks.length));
    const win = peaks.slice(from, to);

    // Normalize against the whole file so a quiet tail still reads as quiet.
    let maxPeak = 0.01;
    for (let i = 0; i < peaks.length; i++) if (peaks[i] > maxPeak) maxPeak = peaks[i];

    const centerY = h / 2;
    const maxAmp = h * 0.42;
    const pointCount = Math.max(1, Math.min(win.length, Math.floor(w)));
    const per = win.length / pointCount;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    for (let i = 0; i < pointCount; i++) {
      let max = 0;
      for (let j = Math.floor(i * per); j < Math.min(Math.floor((i + 1) * per) + 1, win.length); j++) {
        if (win[j] > max) max = win[j];
      }
      const amp = Math.max(0.5, Math.pow(max / maxPeak, 0.65) * maxAmp);
      ctx.lineTo((i / pointCount) * w, centerY - amp);
    }
    for (let i = pointCount - 1; i >= 0; i--) {
      let max = 0;
      for (let j = Math.floor(i * per); j < Math.min(Math.floor((i + 1) * per) + 1, win.length); j++) {
        if (win[j] > max) max = win[j];
      }
      const amp = Math.max(0.5, Math.pow(max / maxPeak, 0.65) * maxAmp);
      ctx.lineTo((i / pointCount) * w, centerY + amp);
    }
    ctx.closePath();
    ctx.fillStyle = colors.wave;
    ctx.fill();
  }, [peaks, widthPx, height, trimStart, trimEnd, p.durationSec, colors.wave]);

  const showHandles = (selected || hovered || gesture) && widthPx >= 22;
  const handleW = Math.min(10, Math.max(5, widthPx / 3));
  const labelHidden = height < 20 && widthPx < 60;

  return (
    <div
      title={`${p.name} · ${Math.round((p.volume ?? 1) * 100)}%`}
      onPointerDown={onBodyDown}
      // The scroll container's onClick deselects everything — a click that
      // reached it would undo the selection this block just made (pointerup
      // fires first). Every other lane's block stops it the same way.
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(p.id, e); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="absolute overflow-hidden select-none"
      style={{
        left: leftPx,
        width: widthPx,
        top,
        height,
        zIndex: selected ? 6 : gesture ? 5 : 2,
        borderRadius: SEGMENT_RADIUS,
        background: colors.bg,
        border: `1px solid ${selected ? colors.ring : colors.border}`,
        boxShadow: selected ? `0 0 0 1px ${colors.ring}` : "none",
        opacity: gesture === "move" ? 0.85 : 1,
        cursor: gesture === "move" ? "grabbing" : "grab",
      }}
    >
      <canvas ref={canvasRef} className="absolute pointer-events-none" style={{ left: 1, top: 1 }} />
      <div className="absolute inset-0 flex items-center gap-1 px-1.5 pointer-events-none">
        {p.kind === "music"
          ? <Music className="h-3 w-3 shrink-0" style={{ color: colors.icon }} />
          : <Volume2 className="h-3 w-3 shrink-0" style={{ color: colors.icon }} />}
        {!labelHidden && (
          <span className="text-[10px] truncate" style={{ color: colors.text, textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
            {p.name}
          </span>
        )}
      </div>
      {showHandles && ["left", "right"].map((side) => (
        <div
          key={side}
          className="absolute top-0 bottom-0 z-10 cursor-col-resize"
          style={{ [side]: 0, width: handleW }}
          onPointerDown={(e) => onHandleDown(side, e)}
        >
          <div
            className="absolute top-1/2 -translate-y-1/2 rounded-full"
            style={{
              [side]: 2, width: 3, height: Math.min(14, height - 6),
              background: "rgba(255,255,255,0.7)",
            }}
          />
        </div>
      ))}
    </div>
  );
}

export default React.memo(SoundBlock);
