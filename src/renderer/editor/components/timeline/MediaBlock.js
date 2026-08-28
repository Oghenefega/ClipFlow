import React, { useRef, useState, useCallback } from "react";
import { Image as ImageIcon, Film, Video as VideoIcon } from "lucide-react";
import { SEGMENT_RADIUS, MEDIA_COLORS } from "./timelineConstants";
import { toFileUrl } from "../../../components/shared";

/**
 * One image or GIF overlay on the timeline (#310). A leaner sibling of
 * SoundBlock — same gesture vocabulary, so the two lanes feel like one editor:
 *
 *   drag body       → move to another moment
 *   Alt + drag body → duplicate and drag the copy
 *   drag either end → change how long the overlay is on screen. A still has no
 *                     length of its own and a GIF just loops, so those can be
 *                     stretched forever. A VIDEO (#311) can't: its edges trim
 *                     the window of the file that plays, the way a sound's do,
 *                     and neither edge can leave the file.
 *   right-click     → parent opens the settings popover
 *
 * Every gesture commits through the parent, which pushes ONE undo entry at the
 * start (Alt+drag is the exception — the duplicate pushes its own, covering both).
 */
function MediaBlock({
  p, pxPerSec, maxTl, top, height, selected,
  onSelect, onContextMenu, onGestureStart, onMove, onResizeLeft, onResizeRight, onDuplicate,
  disabled = false,
}) {
  const [hovered, setHovered] = useState(false);
  const [gesture, setGesture] = useState(null); // "move" | "left" | "right"
  const rafRef = useRef(null);
  const movedRef = useRef(false);
  const targetRef = useRef(p.id);

  const length = Math.max(0.1, p.tlEnd - p.tlStart);
  const widthPx = Math.max(10, length * pxPerSec);
  const leftPx = p.tlStart * pxPerSec;
  // #311: a video's edges are a window into its file, so they stop at its ends.
  // fileLen 0 means "never probed" — leave that one unclamped rather than guess.
  const isVideo = p.mediaType === "video";
  const trimStart = isVideo ? Math.max(0, p.trimStart || 0) : 0;
  const fileLen = isVideo && p.durationSec > 0 ? p.durationSec : 0;

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

  // ── Length handles ──
  const onHandleDown = useCallback((side, e) => {
    e.stopPropagation();
    const startX = e.clientX;
    const origTl = p.tlStart;
    setGesture(side);
    document.body.style.cursor = "col-resize";
    if (onGestureStart) onGestureStart();

    const onMoveEv = (ev) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const dt = (ev.clientX - startX) / (pxPerSec || 1);
        if (side === "left") {
          // The right edge stays put: the overlay starts later and shows for
          // correspondingly less time. On a video that also means starting
          // FURTHER INTO the file, so dragging left can't go past its head.
          // Stills/GIFs keep trimStart 0 — their trimEnd IS the on-screen
          // length, so the handler must receive 0 here or the new length is
          // cancelled out and the drag turns into a move.
          const back = isVideo ? Math.min(origTl, trimStart) : origTl;
          const delta = Math.max(-back, Math.min(dt, length - 0.1));
          onResizeLeft(p.id, length - delta, origTl + delta, isVideo ? trimStart + delta : 0);
        } else {
          // A video can't play past its own end.
          const maxLen = fileLen ? Math.max(0.1, fileLen - trimStart) : Infinity;
          onResizeRight(p.id, Math.min(maxLen, Math.max(0.1, length + dt)));
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
  }, [p.id, p.tlStart, length, pxPerSec, isVideo, trimStart, fileLen, onResizeLeft, onResizeRight, onGestureStart]);

  const showHandles = (selected || hovered || gesture) && widthPx >= 22;
  const handleW = Math.min(10, Math.max(5, widthPx / 3));
  // No thumbnail for a video: painting one means a live <video> element per
  // block, and a stray one of those is what crashes Chromium. The icon carries it.
  const thumbW = isVideo ? 0 : Math.min(height - 2, widthPx - 2);
  const labelHidden = widthPx < 60;

  return (
    <div
      title={`${p.name} · ${length.toFixed(1)}s${isVideo && p.muted ? " · Muted" : ""}${disabled ? " · Off" : ""}`}
      onPointerDown={onBodyDown}
      // The scroll container's onClick deselects everything — a click that
      // reached it would undo the selection this block just made.
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
        background: MEDIA_COLORS.bg,
        border: `1px solid ${selected ? MEDIA_COLORS.ring : MEDIA_COLORS.border}`,
        boxShadow: selected ? `0 0 0 1px ${MEDIA_COLORS.ring}` : "none",
        // #296 convention: switched off reads as greyed but stays draggable.
        filter: disabled ? "grayscale(1)" : "none",
        opacity: disabled ? 0.4 : gesture === "move" ? 0.85 : 1,
        cursor: gesture === "move" ? "grabbing" : "grab",
      }}
    >
      {thumbW > 8 && (
        <img
          src={toFileUrl(p.path)}
          alt=""
          draggable={false}
          className="absolute left-px top-px object-cover pointer-events-none"
          style={{ width: thumbW, height: height - 2, borderRadius: SEGMENT_RADIUS - 1 }}
        />
      )}
      <div
        className="absolute inset-y-0 right-0 flex items-center gap-1 px-1.5 pointer-events-none"
        style={{ left: thumbW > 8 ? thumbW + 3 : 4 }}
      >
        {p.mediaType === "video"
          ? <VideoIcon className="h-3 w-3 shrink-0" style={{ color: MEDIA_COLORS.icon }} />
          : p.mediaType === "gif"
            ? <Film className="h-3 w-3 shrink-0" style={{ color: MEDIA_COLORS.icon }} />
            : <ImageIcon className="h-3 w-3 shrink-0" style={{ color: MEDIA_COLORS.icon }} />}
        {!labelHidden && (
          <span className="text-[10px] truncate" style={{ color: MEDIA_COLORS.text, textShadow: "0 1px 2px rgba(var(--shade),calc(0.6 * var(--shadeK)))" }}>
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
              background: "rgba(var(--lift),0.7)",
            }}
          />
        </div>
      ))}
    </div>
  );
}

export default React.memo(MediaBlock);
