import React, { useState, useRef, useCallback } from "react";
import { SEGMENT_RADIUS, TRIM_HANDLE_HIT_W, WORD_TOOTH_HIT_W, RIPPLE_ANIM_MS } from "./timelineConstants";

function SegmentBlock({ seg, trackColor, duration, timelineWidth, selected, onSelect, onResize, onResizeEnd, onDrag, onDragEnd, onWordBoundaryDrag, onWordBoundaryDragEnd, sourceWordCount, rippleAnimating }) {
  const [resizing, setResizing] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const startRef = useRef({ x: 0, startSec: 0, endSec: 0 });
  const rafRef = useRef(null);
  const dragThresholdRef = useRef(false);
  const startToothRef = useRef({ x: 0, t0: 0 });
  const toothRafRef = useRef(null);

  const segDur = seg.endSec - seg.startSec;
  const leftPx = duration > 0 ? (seg.startSec / duration) * timelineWidth : 0;
  const widthPx = duration > 0 ? (segDur / duration) * timelineWidth : 0;

  const onHandleDown = useCallback((side, e) => {
    e.stopPropagation();
    setResizing(side);
    startRef.current = { x: e.clientX, startSec: seg.startSec, endSec: seg.endSec };
    document.body.style.cursor = "col-resize";

    const onMove = (ev) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const dx = ev.clientX - startRef.current.x;
        const dtSec = duration > 0 ? (dx / timelineWidth) * duration : 0;
        let newStart = startRef.current.startSec;
        let newEnd = startRef.current.endSec;
        if (side === "left") {
          newStart = Math.max(0, Math.min(startRef.current.startSec + dtSec, newEnd - 0.01));
        } else {
          newEnd = Math.min(duration, Math.max(startRef.current.endSec + dtSec, newStart + 0.01));
        }
        onResize(seg.id, newStart, newEnd);
      });
    };
    const onUp = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setResizing(null);
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (onResizeEnd) onResizeEnd(seg.id);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [seg.id, seg.startSec, seg.endSec, duration, timelineWidth, onResize, onResizeEnd]);

  // ── Drag (move) handler — hold and drag segment body ──
  const onDragStart = useCallback((e) => {
    if (!onDrag) return; // drag not supported for this track
    e.stopPropagation();
    startRef.current = { x: e.clientX, startSec: seg.startSec, endSec: seg.endSec };
    dragThresholdRef.current = false;

    const onMove = (ev) => {
      const dx = ev.clientX - startRef.current.x;
      // Require 3px movement before starting drag (prevent accidental drags)
      if (!dragThresholdRef.current && Math.abs(dx) < 3) return;
      dragThresholdRef.current = true;
      if (!dragging) setDragging(true);

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const dtSec = duration > 0 ? (dx / timelineWidth) * duration : 0;
        const segDur = startRef.current.endSec - startRef.current.startSec;
        let newStart = startRef.current.startSec + dtSec;
        let newEnd = newStart + segDur;
        // Clamp to timeline bounds
        if (newStart < 0) { newStart = 0; newEnd = segDur; }
        if (newEnd > duration) { newEnd = duration; newStart = duration - segDur; }
        onDrag(seg.id, newStart, newEnd);
      });
    };
    const onUp = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (dragThresholdRef.current && onDragEnd) {
        onDragEnd(seg.id);
      }
      setDragging(false);
      dragThresholdRef.current = false;
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [seg.id, seg.startSec, seg.endSec, duration, timelineWidth, onDrag, onDragEnd, dragging]);

  // ── Per-word boundary "teeth" drag (#119) — selected subtitle blocks only ──
  // Mirrors onHandleDown but moves an INTERNAL word boundary, not a block edge.
  // words[i].end is in the block's display coordinate space (timeline when the clip
  // has NLE cuts, source otherwise); the parent maps the reported time back to
  // source via toSource() before committing through setWordBoundary.
  const onToothDown = useCallback((boundaryIdx, e) => {
    e.stopPropagation();
    const w = (seg.words || [])[boundaryIdx];
    if (!w) return;
    startToothRef.current = { x: e.clientX, t0: w.end };
    document.body.style.cursor = "col-resize";

    const onMove = (ev) => {
      if (toothRafRef.current) cancelAnimationFrame(toothRafRef.current);
      toothRafRef.current = requestAnimationFrame(() => {
        const dx = ev.clientX - startToothRef.current.x;
        const dtSec = duration > 0 ? (dx / timelineWidth) * duration : 0;
        onWordBoundaryDrag(seg.id, boundaryIdx, startToothRef.current.t0 + dtSec);
      });
    };
    const onUp = () => {
      if (toothRafRef.current) cancelAnimationFrame(toothRafRef.current);
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (onWordBoundaryDragEnd) onWordBoundaryDragEnd(seg.id);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [seg.id, seg.words, duration, timelineWidth, onWordBoundaryDrag, onWordBoundaryDragEnd]);

  const showHandles = selected || hovered;

  // Internal word boundaries to draw as draggable "teeth" (#119). Only on a
  // selected subtitle block (parent supplies onWordBoundaryDrag) with ≥2 words, and
  // only when no NLE cut splits the block (mapped word count === source count — else
  // a positional boundary index wouldn't line up with the source word it edits).
  const teethWords = seg.words || [];
  const showTeeth = selected && typeof onWordBoundaryDrag === "function"
    && teethWords.length >= 2 && teethWords.length === sourceWordCount && duration > 0;

  // Background with subtle gradient for depth
  const bgColor = selected ? trackColor.selected : hovered ? trackColor.hover : trackColor.bg;
  const borderColor = selected ? trackColor.ring : showHandles ? trackColor.border : "transparent";

  // Transition for ripple animation (sliding segments into place)
  let transition;
  if (resizing) {
    transition = "none";
  } else if (rippleAnimating) {
    transition = `left ${RIPPLE_ANIM_MS}ms cubic-bezier(0.25, 0.1, 0.25, 1), width ${RIPPLE_ANIM_MS}ms cubic-bezier(0.25, 0.1, 0.25, 1)`;
  } else {
    transition = "background 0.15s ease-out, border-color 0.15s ease-out, box-shadow 0.15s ease-out";
  }

  // Don't render segments shrunk to near-zero (consumed by resize/drag)
  if (segDur < 0.01) return null;

  return (
    <div
      className="segment-block absolute top-1 bottom-1 cursor-pointer group"
      style={{
        left: leftPx,
        width: Math.max(widthPx, 4),
        background: bgColor,
        border: `1.5px solid ${borderColor}`,
        borderRadius: SEGMENT_RADIUS,
        boxShadow: selected
          ? `0 0 0 1px ${trackColor.ring}, inset 0 1px 0 rgba(255,255,255,0.08)`
          : "inset 0 1px 0 rgba(255,255,255,0.06)",
        zIndex: selected ? 5 : hovered ? 3 : 1,
        transition,
      }}
      onClick={(e) => { e.stopPropagation(); if (!dragThresholdRef.current) onSelect(seg.id, e); }}
      onPointerDown={onDrag ? onDragStart : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Segment text */}
      <div className="absolute inset-0 flex items-center px-2 pointer-events-none select-none overflow-hidden">
        <span
          className="text-[10px] font-medium truncate block w-full leading-tight"
          style={{ color: trackColor.text }}
        >
          {seg.text}
        </span>
      </div>

      {/* Left trim handle — wide hit area, thin visual */}
      <div
        className="absolute top-0 bottom-0 z-10 cursor-col-resize"
        style={{ left: -Math.floor(TRIM_HANDLE_HIT_W / 2), width: TRIM_HANDLE_HIT_W }}
        onPointerDown={(e) => onHandleDown("left", e)}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full transition-opacity duration-150"
          style={{
            left: Math.floor(TRIM_HANDLE_HIT_W / 2) - 2,
            width: 4,
            height: 16,
            background: "rgba(255,255,255,0.55)",
            opacity: showHandles ? 1 : 0,
          }}
        />
      </div>

      {/* Right trim handle */}
      <div
        className="absolute top-0 bottom-0 z-10 cursor-col-resize"
        style={{ right: -Math.floor(TRIM_HANDLE_HIT_W / 2), width: TRIM_HANDLE_HIT_W }}
        onPointerDown={(e) => onHandleDown("right", e)}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full transition-opacity duration-150"
          style={{
            right: Math.floor(TRIM_HANDLE_HIT_W / 2) - 2,
            width: 4,
            height: 16,
            background: "rgba(255,255,255,0.55)",
            opacity: showHandles ? 1 : 0,
          }}
        />
      </div>

      {/* Per-word boundary "teeth" — draggable internal word boundaries (#119) */}
      {showTeeth && teethWords.slice(0, -1).map((w, i) => {
        const relPx = ((w.end - seg.startSec) / duration) * timelineWidth;
        // Skip teeth sitting on/over the block edges (where the trim handles live)
        if (relPx <= 2 || relPx >= widthPx - 2) return null;
        return (
          <div
            key={`tooth-${i}`}
            className="absolute top-0 bottom-0 z-20 cursor-col-resize"
            style={{ left: relPx - WORD_TOOTH_HIT_W / 2, width: WORD_TOOTH_HIT_W }}
            onPointerDown={(e) => onToothDown(i, e)}
            onClick={(e) => e.stopPropagation()}
          >
            {/* vertical divider line */}
            <div
              className="absolute top-0 bottom-0"
              style={{ left: WORD_TOOTH_HIT_W / 2 - 0.75, width: 1.5, background: "rgba(255,255,255,0.4)" }}
            />
            {/* top grab knob */}
            <div
              className="absolute -top-0.5"
              style={{
                left: WORD_TOOTH_HIT_W / 2 - 3,
                width: 6, height: 7, borderRadius: 2,
                background: trackColor.ring,
                boxShadow: `0 0 5px ${trackColor.ring}`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default React.memo(SegmentBlock, (prev, next) => {
  return (
    prev.seg.id === next.seg.id &&
    prev.seg.startSec === next.seg.startSec &&
    prev.seg.endSec === next.seg.endSec &&
    prev.seg.text === next.seg.text &&
    prev.seg.words === next.seg.words &&
    prev.selected === next.selected &&
    prev.duration === next.duration &&
    prev.timelineWidth === next.timelineWidth &&
    prev.rippleAnimating === next.rippleAnimating &&
    prev.sourceWordCount === next.sourceWordCount &&
    prev.onDrag === next.onDrag &&
    prev.onWordBoundaryDrag === next.onWordBoundaryDrag
  );
});
