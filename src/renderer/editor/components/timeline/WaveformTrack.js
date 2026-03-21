import React, { useRef, useState, useCallback, useEffect } from "react";
import { AUDIO_TRACK_H, TRIM_HANDLE_HIT_W, SEGMENT_RADIUS, RIPPLE_ANIM_MS } from "./timelineConstants";

function WaveformTrack({ peaks, duration, timelineWidth, currentTime, selected, onSelect, onContextMenu, audioSeg, onResize, onResizeEnd, maxExtendSec, maxExtendLeftSec = 0, segStartSec = 0, segEndSec, rippleAnimating }) {
  const canvasRef = useRef(null);
  const [resizing, setResizing] = useState(null);
  const [hovered, setHovered] = useState(false);
  const startRef = useRef({ x: 0, startSec: 0, endSec: 0 });
  const rafRef = useRef(null);

  const onHandleDown = useCallback((side, e) => {
    if (!audioSeg || !onResize) return;
    e.stopPropagation();
    setResizing(side);
    startRef.current = { x: e.clientX, startSec: audioSeg.startSec, endSec: audioSeg.endSec };
    document.body.style.cursor = "col-resize";

    const onMove = (ev) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const dx = ev.clientX - startRef.current.x;
        const dtSec = duration > 0 ? (dx / timelineWidth) * duration : 0;
        let newStart = startRef.current.startSec;
        let newEnd = startRef.current.endSec;
        if (side === "left") {
          // Allow extending left past 0 (negative) up to -maxExtendLeftSec
          const minStart = -(maxExtendLeftSec || 0);
          newStart = Math.max(minStart, Math.min(startRef.current.startSec + dtSec, newEnd - 0.1));
        } else {
          // Allow extending past current duration up to maxExtendSec (source boundary)
          const maxEnd = maxExtendSec || duration;
          newEnd = Math.min(maxEnd, Math.max(startRef.current.endSec + dtSec, newStart + 0.1));
        }
        onResize(audioSeg.id, newStart, newEnd);
      });
    };
    const onUp = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setResizing(null);
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      // Commit trim on mouse release
      if (onResizeEnd) onResizeEnd();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [audioSeg, onResize, duration, timelineWidth, maxExtendLeftSec]);

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
      ctx.fillStyle = "hsl(25 90% 55% / 0.4)";
      ctx.font = "10px 'DM Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Extracting waveform...", w / 2, h / 2 + 3);
      return;
    }

    const effectiveEnd = segEndSec ?? duration;
    const startFrac = duration > 0 ? segStartSec / duration : 0;
    const endFrac = duration > 0 ? effectiveEnd / duration : 1;
    const sliceStart = Math.floor(startFrac * peaks.length);
    const sliceEnd = Math.ceil(endFrac * peaks.length);
    const segPeaks = peaks.slice(sliceStart, sliceEnd);
    if (segPeaks.length === 0) return;

    const maxPeak = Math.max(...peaks, 0.01);
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
  }, [peaks, timelineWidth, selected, duration, segStartSec, segEndSec]);

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
    ? "0 0 0 1px hsl(25 90% 60% / 0.25), inset 0 1px 0 rgba(255,255,255,0.06)"
    : "inset 0 1px 0 rgba(255,255,255,0.03)";

  return (
    <div
      className="relative h-full cursor-pointer overflow-hidden"
      style={{
        width: timelineWidth,
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: SEGMENT_RADIUS,
        boxShadow: shadow,
        transition: resizing ? "none" : rippleAnimating
          ? `all ${RIPPLE_ANIM_MS}ms cubic-bezier(0.25, 0.1, 0.25, 1)`
          : "background 0.15s ease-out, border-color 0.15s ease-out, box-shadow 0.15s ease-out",
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <canvas ref={canvasRef} className="absolute inset-0" style={{ margin: 1 }} />
      {/* Left handle */}
      <div
        className="absolute left-0 top-0 bottom-0 z-10 cursor-col-resize"
        style={{ left: -Math.floor(TRIM_HANDLE_HIT_W / 2), width: TRIM_HANDLE_HIT_W }}
        onPointerDown={(e) => onHandleDown("left", e)}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full transition-opacity duration-150"
          style={{
            left: Math.floor(TRIM_HANDLE_HIT_W / 2) - 2,
            width: 4, height: 16,
            background: "rgba(255,255,255,0.55)",
            opacity: showHandles ? 1 : 0,
          }}
        />
      </div>
      {/* Right handle */}
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
            background: "rgba(255,255,255,0.55)",
            opacity: showHandles ? 1 : 0,
          }}
        />
      </div>
    </div>
  );
}

export default React.memo(WaveformTrack, (prev, next) => {
  return (
    prev.peaks === next.peaks &&
    prev.duration === next.duration &&
    prev.timelineWidth === next.timelineWidth &&
    prev.selected === next.selected &&
    prev.segStartSec === next.segStartSec &&
    prev.segEndSec === next.segEndSec &&
    prev.rippleAnimating === next.rippleAnimating
  );
});
