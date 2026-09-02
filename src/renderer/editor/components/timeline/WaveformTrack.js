import React, { useRef, useState, useCallback, useEffect } from "react";
import { LayoutTemplate } from "lucide-react";
import { AUDIO_TRACK_H, TRIM_HANDLE_HIT_W, SEGMENT_RADIUS, RIPPLE_ANIM_MS } from "./timelineConstants";

// Section edges (#352). A block's LEFT handle sits on the join with the section
// before it (prevSegment), and that join is shared: the previous block's own
// right handle is not drawn (hasNext), since the two overlapped pixel-for-pixel
// and the later block always won. On a join a plain drag MOVES THE CUT — the
// section before ends later/earlier and this one starts later/earlier by the
// same amount, total length unchanged. Ctrl+drag keeps the old single-edge
// trim, for whichever side of the join the pointer started on. The first
// section's left edge and the last section's right edge stay plain trims.
function WaveformTrack({ peaks, error, clipFileDuration = 0, clipOrigin = 0, sourceDuration = Infinity, timelineWidth, currentTime, selected, onSelect, onContextMenu, nleSegment, prevSegment = null, hasNext = false, onTrimLeft, onTrimRight, onRoll, onTrimStart, onTrimEnd, rippleAnimating, onMoveStart, onMoveDrag, onMoveEnd, onSeekClick, moveDragging }) {
  const canvasRef = useRef(null);
  const [resizing, setResizing] = useState(null);
  const [hovered, setHovered] = useState(false);
  const startRef = useRef({ x: 0, sourceStart: 0, sourceEnd: 0 });
  const rafRef = useRef(null);
  const moveXRef = useRef(0);
  const movedRef = useRef(false); // true once the 3px threshold is crossed

  const onHandleDown = useCallback((side, e) => {
    if (!nleSegment) return;
    e.stopPropagation();

    // Which edit this drag performs and which section it edits.
    let mode = side === "left" ? "trimLeft" : "trimRight";
    let target = nleSegment;
    if (side === "left" && prevSegment) {
      if (e.ctrlKey || e.metaKey) {
        // The handle is centred on the join: pointer left of centre = the
        // previous section's end, right of it = this section's start.
        const rect = e.currentTarget.getBoundingClientRect();
        if (e.clientX < rect.left + rect.width / 2) { mode = "trimRight"; target = prevSegment; }
      } else if (onRoll) {
        mode = "roll";
        target = prevSegment;
      }
    }

    setResizing(side);
    startRef.current = { x: e.clientX, sourceStart: target.sourceStart, sourceEnd: target.sourceEnd };
    document.body.style.cursor = mode === "roll" ? "ew-resize" : "col-resize";
    if (onTrimStart) onTrimStart();

    // Pixel scale from this block's own width; the scale is uniform along the
    // timeline (and frozen for the drag by trimSnapshot), so it serves the
    // previous section's edge too.
    const segSourceDur = nleSegment.sourceEnd - nleSegment.sourceStart;
    const pxPerSec = segSourceDur > 0 ? timelineWidth / segSourceDur : 0;
    const onMove = (ev) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const dx = ev.clientX - startRef.current.x;
        const dtSec = pxPerSec > 0 ? dx / pxPerSec : 0;
        if (mode === "roll") {
          // Store clamps both sides (minimum lengths, 0, recording end).
          onRoll(target.id, startRef.current.sourceEnd + dtSec);
        } else if (mode === "trimLeft") {
          // Lower bound: source-time 0 (start of source recording).
          // Upper bound: our own end minus minimum duration.
          const newSourceStart = Math.max(0, Math.min(
            startRef.current.sourceStart + dtSec,
            startRef.current.sourceEnd - 0.1
          ));
          if (onTrimLeft) onTrimLeft(target.id, newSourceStart);
        } else {
          // Upper bound: source recording end (can't extend past actual audio).
          // Lower bound: our own start plus minimum duration.
          const newSourceEnd = Math.max(
            startRef.current.sourceStart + 0.1,
            Math.min(sourceDuration, startRef.current.sourceEnd + dtSec)
          );
          if (onTrimRight) onTrimRight(target.id, newSourceEnd);
        }
      });
    };
    const onUp = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setResizing(null);
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (onTrimEnd) onTrimEnd();
      // Phase 4: no post-drag recut needed. The <video> element plays the full
      // source, so updated segment bounds take effect immediately — no FFmpeg.
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [nleSegment, prevSegment, onTrimLeft, onTrimRight, onRoll, onTrimStart, onTrimEnd, timelineWidth, sourceDuration]);

  // ── Body drag = reorder this section on the timeline ──
  // Pressing the block swallows the container's scrub handler, so a press that
  // never becomes a drag seeks explicitly via onSeekClick — otherwise adding the
  // gesture would silently remove click-to-seek over the waveform.
  const onBodyDown = useCallback((e) => {
    if (!onMoveDrag || !nleSegment || e.button !== 0) return;
    e.stopPropagation();
    moveXRef.current = e.clientX;
    movedRef.current = false;
    const segId = nleSegment.id;

    const onMove = (ev) => {
      if (!movedRef.current) {
        if (Math.abs(ev.clientX - moveXRef.current) < 3) return;
        movedRef.current = true;
        document.body.style.cursor = "grabbing";
        if (onMoveStart) onMoveStart(segId);
      }
      onMoveDrag(segId, ev.clientX);
    };
    const onUp = (ev) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      if (movedRef.current) {
        if (onMoveEnd) onMoveEnd(segId);
      } else if (onSeekClick) {
        onSeekClick(ev.clientX);
      }
      // movedRef stays set until the next pointerdown so the click that follows
      // this pointerup can tell a drag from a plain click.
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [nleSegment, onMoveDrag, onMoveStart, onMoveEnd, onSeekClick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = timelineWidth;
    const h = AUDIO_TRACK_H - 4;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    if (!peaks || peaks.length === 0) {
      ctx.fillStyle = error ? "hsl(0 70% 60% / 0.55)" : "hsl(25 90% 55% / 0.4)";
      ctx.font = "10px 'DM Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(error ? "Waveform unavailable" : "Extracting waveform...", w / 2, h / 2 + 3);
      return;
    }

    // Peaks come from the clip file (spans 0 → clipFileDuration).
    // NLE segments use source-absolute coords — offset by clipOrigin to get clip-relative.
    // clipFileDuration is passed as the actual video file duration (from playback store).
    const sourceStart = nleSegment?.sourceStart ?? clipOrigin;
    const sourceEnd = nleSegment?.sourceEnd ?? (clipOrigin + clipFileDuration);
    const clipRelStart = Math.max(0, sourceStart - clipOrigin);
    const clipRelEnd = Math.max(clipRelStart + 0.01, sourceEnd - clipOrigin);
    const startFrac = clipFileDuration > 0 ? clipRelStart / clipFileDuration : 0;
    const endFrac = clipFileDuration > 0 ? Math.min(1, clipRelEnd / clipFileDuration) : 1;
    const sliceStart = Math.floor(startFrac * peaks.length);
    const sliceEnd = Math.ceil(endFrac * peaks.length);
    const segPeaks = peaks.slice(sliceStart, sliceEnd);
    if (segPeaks.length === 0) return;

    let maxPeak = 0.01;
    for (let i = 0; i < peaks.length; i++) { if (peaks[i] > maxPeak) maxPeak = peaks[i]; }
    const centerY = h / 2;
    const maxAmp = h * 0.45;
    const pointCount = Math.min(segPeaks.length, Math.floor(w));
    if (pointCount <= 0) return;
    const samplesPerPoint = segPeaks.length / pointCount;

    const points = [];
    for (let i = 0; i < pointCount; i++) {
      const sampleIdx = Math.floor(i * samplesPerPoint);
      const endIdx = Math.min(Math.floor((i + 1) * samplesPerPoint), segPeaks.length);
      let max = 0;
      for (let j = sampleIdx; j < endIdx; j++) {
        if (segPeaks[j] > max) max = segPeaks[j];
      }
      const normalized = max / maxPeak;
      const amp = Math.pow(normalized, 0.65) * maxAmp;
      points.push({ x: (i / pointCount) * w, amp: Math.max(1, amp) });
    }

    if (points.length === 0 || !points[0]) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, centerY - points[0].amp);
    for (let i = 1; i < points.length; i++) {
      const prevPt = points[i - 1];
      const pt = points[i];
      const cpX = (prevPt.x + pt.x) / 2;
      ctx.quadraticCurveTo(prevPt.x, centerY - prevPt.amp, cpX, centerY - (prevPt.amp + pt.amp) / 2);
    }
    const lastPt = points[points.length - 1];
    ctx.lineTo(lastPt.x, centerY - lastPt.amp);
    ctx.lineTo(lastPt.x, centerY + lastPt.amp);
    for (let i = points.length - 2; i >= 0; i--) {
      const nextPt = points[i + 1];
      const pt = points[i];
      const cpX = (nextPt.x + pt.x) / 2;
      ctx.quadraticCurveTo(nextPt.x, centerY + nextPt.amp, cpX, centerY + (nextPt.amp + pt.amp) / 2);
    }
    ctx.lineTo(points[0].x, centerY + points[0].amp);
    ctx.closePath();

    ctx.fillStyle = selected ? "hsl(25 90% 55% / 0.6)" : "hsl(25 90% 55% / 0.35)";
    ctx.fill();
    ctx.strokeStyle = selected ? "hsl(25 90% 58% / 0.8)" : "hsl(25 90% 55% / 0.45)";
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.strokeStyle = "hsl(25 90% 55% / 0.12)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(w, centerY);
    ctx.stroke();
  }, [peaks, error, timelineWidth, selected, clipFileDuration, nleSegment]);

  const showHandles = selected || hovered;

  // 3-state visual: default (subtle border), hovered (brighter border), selected (bright + glow)
  const borderColor = selected
    ? "hsl(25 90% 60% / 0.6)"
    : hovered
      ? "hsl(25 90% 55% / 0.35)"
      : "hsl(25 90% 55% / 0.18)";
  const bgColor = selected
    ? "hsl(25 90% 55% / 0.08)"
    : hovered
      ? "hsl(25 90% 55% / 0.04)"
      : "hsl(25 90% 55% / 0.02)";
  const shadow = selected
    ? "0 0 0 1px hsl(25 90% 60% / 0.25), inset 0 1px 0 rgba(var(--lift),0.06)"
    : "inset 0 1px 0 rgba(var(--lift),0.03)";

  return (
    <div
      className="relative h-full"
      style={{
        width: timelineWidth,
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: SEGMENT_RADIUS,
        boxShadow: shadow,
        cursor: onMoveDrag ? (moveDragging ? "grabbing" : "grab") : "pointer",
        opacity: moveDragging ? 0.45 : 1,
        transition: resizing || moveDragging ? "none" : rippleAnimating
          ? `all ${RIPPLE_ANIM_MS}ms cubic-bezier(0.25, 0.1, 0.25, 1)`
          : "background 0.15s ease-out, border-color 0.15s ease-out, box-shadow 0.15s ease-out",
      }}
      onPointerDown={onBodyDown}
      onClick={(e) => { e.stopPropagation(); if (!movedRef.current) onSelect(); }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: SEGMENT_RADIUS }}>
        <canvas ref={canvasRef} className="absolute inset-0" style={{ margin: 1 }} />
      </div>
      {/* #349: this section carries its own layout (override or opted out) —
          a small badge so the cut where the picture changes is visible on the
          timeline. Absent key = inherits the clip, no badge. */}
      {nleSegment && nleSegment.reframe !== undefined && (
        <div
          className="absolute top-0.5 left-1 z-10 flex items-center justify-center rounded pointer-events-none"
          style={{
            width: 14, height: 14,
            background: "rgba(var(--lift),0.14)",
            color: nleSegment.reframe ? "#22d3ee" : "hsl(25 90% 55% / 0.9)",
            boxShadow: `0 0 6px ${nleSegment.reframe ? "rgba(34,211,238,0.5)" : "hsl(25 90% 55% / 0.4)"}`,
          }}
          title={nleSegment.reframe ? "This section has its own layout" : "This section has no layout"}
        >
          <LayoutTemplate size={9} strokeWidth={2.5} />
        </div>
      )}
      {/* Left handle — on a join it moves the cut (two bars); at the very
          start it trims this edge (one bar). Ctrl+drag on a join = trim. */}
      <div
        className="absolute left-0 top-0 bottom-0 z-10"
        style={{ left: -Math.floor(TRIM_HANDLE_HIT_W / 2), width: TRIM_HANDLE_HIT_W, cursor: prevSegment ? "ew-resize" : "col-resize" }}
        title={prevSegment ? "Drag to move the cut · Ctrl+drag to trim one side" : undefined}
        onPointerDown={(e) => onHandleDown("left", e)}
      >
        {prevSegment ? (
          <>
            <div
              className="absolute top-1/2 -translate-y-1/2 rounded-full transition-opacity duration-150"
              style={{ left: Math.floor(TRIM_HANDLE_HIT_W / 2) - 4, width: 3, height: 16, background: "rgba(var(--lift),0.55)", opacity: showHandles ? 1 : 0 }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 rounded-full transition-opacity duration-150"
              style={{ left: Math.floor(TRIM_HANDLE_HIT_W / 2) + 1, width: 3, height: 16, background: "rgba(var(--lift),0.55)", opacity: showHandles ? 1 : 0 }}
            />
          </>
        ) : (
          <div
            className="absolute top-1/2 -translate-y-1/2 rounded-full transition-opacity duration-150"
            style={{
              left: Math.floor(TRIM_HANDLE_HIT_W / 2) - 2,
              width: 4, height: 16,
              background: "rgba(var(--lift),0.55)",
              opacity: showHandles ? 1 : 0,
            }}
          />
        )}
      </div>
      {/* Right handle — only on the last section; inner joins are owned by the
          next block's left handle (they shared the same pixels anyway). */}
      {!hasNext && (
        <div
          className="absolute right-0 top-0 bottom-0 z-10 cursor-col-resize"
          style={{ right: -Math.floor(TRIM_HANDLE_HIT_W / 2), width: TRIM_HANDLE_HIT_W }}
          onPointerDown={(e) => onHandleDown("right", e)}
        >
          <div
            className="absolute top-1/2 -translate-y-1/2 rounded-full transition-opacity duration-150"
            style={{
              right: Math.floor(TRIM_HANDLE_HIT_W / 2) - 2,
              width: 4, height: 16,
              background: "rgba(var(--lift),0.55)",
              opacity: showHandles ? 1 : 0,
            }}
          />
        </div>
      )}
    </div>
  );
}

export default React.memo(WaveformTrack, (prev, next) => {
  return (
    prev.peaks === next.peaks &&
    prev.error === next.error &&
    prev.clipFileDuration === next.clipFileDuration &&
    prev.sourceDuration === next.sourceDuration &&
    prev.timelineWidth === next.timelineWidth &&
    prev.selected === next.selected &&
    prev.nleSegment === next.nleSegment &&
    prev.prevSegment === next.prevSegment &&
    prev.hasNext === next.hasNext &&
    prev.onRoll === next.onRoll &&
    prev.rippleAnimating === next.rippleAnimating &&
    prev.moveDragging === next.moveDragging &&
    prev.onMoveDrag === next.onMoveDrag
  );
});
