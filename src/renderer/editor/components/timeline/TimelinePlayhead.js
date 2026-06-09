import React, { useEffect, useRef, useState } from "react";
import usePlaybackStore from "../../stores/usePlaybackStore";
import { fmtTime } from "../../utils/timeUtils";
import { PLAYHEAD_COLOR, RULER_H, TRACK_H, AUDIO_TRACK_H, LABEL_W } from "./timelineConstants";

// ── Live playhead (#57) ──
// Owns the 60fps rAF loop + smoothTime so the parent TimelinePanelNew does NOT
// re-render every frame. Only this tiny component reconciles at playback rate.
// Renders the moving cursor and drives auto-scroll-during-playback.
// Props: effectiveDuration, clipContentWidth (pixel scale) and scrollRef (the
// timeline scroll container) — all change occasionally (zoom/resize/edit), not per frame.
export function TimelinePlayhead({ effectiveDuration, clipContentWidth, scrollRef }) {
  const playing = usePlaybackStore((s) => s.playing);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const [smoothTime, setSmoothTime] = useState(0);
  const playheadRafRef = useRef(null);

  // ── Smooth 60fps playhead via rAF loop ──
  // Reads video.currentTime directly instead of relying on Zustand store updates.
  // IMPORTANT: rAF loop depends ONLY on `playing` — NOT `currentTime`.
  // If currentTime were a dependency, the 60fps store updates from PreviewPanel
  // would tear down and rebuild this effect every frame, killing the loop.
  useEffect(() => {
    if (!playing) {
      if (playheadRafRef.current) cancelAnimationFrame(playheadRafRef.current);
      return;
    }
    const tick = () => {
      const videoRef = usePlaybackStore.getState().getVideoRef();
      if (videoRef?.current && !videoRef.current.paused) {
        // video.currentTime is CLIP-RELATIVE; ruler is in TIMELINE coordinates.
        // Translate via the playback store's mapSourceTime (handles clipFileOffset + segments).
        const mapped = usePlaybackStore.getState().mapSourceTime(videoRef.current.currentTime);
        setSmoothTime(mapped.timelineTime);
      }
      playheadRafRef.current = requestAnimationFrame(tick);
    };
    playheadRafRef.current = requestAnimationFrame(tick);
    return () => { if (playheadRafRef.current) cancelAnimationFrame(playheadRafRef.current); };
  }, [playing]);

  // When paused, sync smoothTime to store's currentTime (for seeking, scrubbing)
  useEffect(() => {
    if (!playing) setSmoothTime(currentTime);
  }, [playing, currentTime]);

  const playheadTime = playing ? smoothTime : currentTime;
  const playheadPx = effectiveDuration > 0 ? LABEL_W + (playheadTime / effectiveDuration) * clipContentWidth : LABEL_W;

  // ── Smooth auto-scroll during playback ──
  useEffect(() => {
    if (!playing || !scrollRef.current || effectiveDuration <= 0) return;
    const container = scrollRef.current;
    const viewWidth = container.clientWidth;
    const phX = LABEL_W + (smoothTime / effectiveDuration) * clipContentWidth;

    if (phX > container.scrollLeft + viewWidth * 0.75) {
      const target = phX - viewWidth * 0.3;
      container.scrollLeft += (target - container.scrollLeft) * 0.15;
    } else if (phX < container.scrollLeft + LABEL_W + 20) {
      const target = Math.max(0, phX - LABEL_W - 20);
      container.scrollLeft += (target - container.scrollLeft) * 0.15;
    }
  }, [playing, smoothTime, effectiveDuration, clipContentWidth, scrollRef]);

  if (playheadPx > LABEL_W + clipContentWidth) return null;

  return (
    <div
      className="absolute z-30 pointer-events-none"
      style={{
        left: playheadPx, top: 0,
        height: RULER_H + TRACK_H + TRACK_H + AUDIO_TRACK_H + TRACK_H,
        transform: "translateX(-50%)",
      }}
    >
      <div
        className="absolute -top-0.5 left-1/2 -translate-x-1/2"
        style={{
          width: 0, height: 0,
          borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent",
          borderTop: `6px solid ${PLAYHEAD_COLOR}`,
        }}
      />
      <div style={{ width: 2, height: "100%", background: PLAYHEAD_COLOR, margin: "0 auto" }} />
    </div>
  );
}

// ── Live timecode readout (#57) ──
// Subscribes to currentTime so the parent toolbar doesn't re-render every frame.
export function TimelineTimecode() {
  const currentTime = usePlaybackStore((s) => s.currentTime);
  return <span className="text-[11px] font-mono text-foreground tabular-nums">{fmtTime(currentTime)}</span>;
}
