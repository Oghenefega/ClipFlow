import React, { useState, useRef, useCallback } from "react";
import { SEGMENT_RADIUS, TRIM_HANDLE_HIT_W, RIPPLE_ANIM_MS } from "./timelineConstants";

function SegmentBlock({ seg, trackColor, duration, timelineWidth, selected, onSelect, onResize, onDrag, onDragEnd, rippleAnimating, leftOffset = 0 }) {
  const [resizing, setResizing] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const startRef = useRef({ x: 0, startSec: 0, endSec: 0 });
  const rafRef = useRef(null);
  const dragThresholdRef = useRef(false);

  const leftPx = duration > 0 ? ((seg.startSec + leftOffset) / duration) * timelineWidth : 0;
  const widthPx = duration > 0 ? ((seg.endSec - seg.startSec) / duration) * timelineWidth : 0;

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
          newStart = Math.max(0, Math.min(startRef.current.startSec + dtSec, newEnd - 0.1));
        } else {
          newEnd = Math.min(duration, Math.max(startRef.current.endSec + dtSec, newStart + 0.1));
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
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [seg.id, seg.startSec, seg.endSec, duration, timelineWidth, onResize]);

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

  const showHandles = selected || hovered;

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

  return (
    <div
      className="absolute top-1 bottom-1 cursor-pointer group"
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
    </div>
  );
}

export default React.memo(SegmentBlock, (prev, next) => {
  return (
    prev.seg.id === next.seg.id &&
    prev.seg.startSec === next.seg.startSec &&
    prev.seg.endSec === next.seg.endSec &&
    prev.seg.text === next.seg.text &&
    prev.selected === next.selected &&
    prev.duration === next.duration &&
    prev.timelineWidth === next.timelineWidth &&
    prev.rippleAnimating === next.rippleAnimating &&
    prev.onDrag === next.onDrag
  );
});
