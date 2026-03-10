import React, { useState, useRef, useEffect, useCallback } from "react";
import T from "../../styles/theme";
import usePlaybackStore from "../stores/usePlaybackStore";
import useSubtitleStore from "../stores/useSubtitleStore";
import useLayoutStore from "../stores/useLayoutStore";
import useEditorStore from "../stores/useEditorStore";
import useCaptionStore from "../stores/useCaptionStore";
import { Ib } from "../primitives/editorPrimitives";
import { BD, S2, S3, BDH, TL_COLLAPSED_H, TL_MIN, TL_MAX, TRACKS } from "../utils/constants";
import { fmtTime } from "../utils/timeUtils";

export default function Timeline({ onTlResizeStart }) {
  // ── Store selectors ──
  const playing = usePlaybackStore((s) => s.playing);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const tlSpeed = usePlaybackStore((s) => s.tlSpeed);
  const setPlaying = usePlaybackStore((s) => s.setPlaying);
  const setCurrentTime = usePlaybackStore((s) => s.setCurrentTime);
  const setTlSpeed = usePlaybackStore((s) => s.setTlSpeed);
  const tlScrubbing = usePlaybackStore((s) => s.tlScrubbing);
  const setTlScrubbing = usePlaybackStore((s) => s.setTlScrubbing);

  const editSegments = useSubtitleStore((s) => s.editSegments);
  const activeSegId = useSubtitleStore((s) => s.activeSegId);
  const setActiveSegId = useSubtitleStore((s) => s.setActiveSegId);
  const setEditSegments = useSubtitleStore((s) => s.setEditSegments);

  const tlCollapsed = useLayoutStore((s) => s.tlCollapsed);
  const setTlCollapsed = useLayoutStore((s) => s.setTlCollapsed);
  const tlHeight = useLayoutStore((s) => s.tlHeight);
  const tlOverlay = useLayoutStore((s) => s.tlOverlay);
  const setTlOverlay = useLayoutStore((s) => s.setTlOverlay);

  const clip = useEditorStore((s) => s.clip);
  const clipTitle = useEditorStore((s) => s.clipTitle);
  const markDirty = useEditorStore((s) => s.markDirty);

  const captionText = useCaptionStore((s) => s.captionText);

  // ── Local state ──
  const [tlZoom, setTlZoom] = useState(1);
  const timelineContentRef = useRef(null);
  const tlDragRef = useRef(null);

  // ── Derived ──
  const clipDuration = clip ? ((clip.endTime || 0) - (clip.startTime || 0)) : 0;
  const effectiveHeight = tlCollapsed ? TL_COLLAPSED_H : tlHeight;

  // ── Timeline scrub (draggable playhead) ──
  useEffect(() => {
    if (!tlScrubbing) return;
    const dur = clipDuration || 1;
    const contentW = Math.max(500, 500 * tlZoom);
    const onMove = (e) => {
      const scrollEl = timelineContentRef.current;
      if (!scrollEl) return;
      const rect = scrollEl.getBoundingClientRect();
      const scrollLeft = scrollEl.scrollLeft;
      const xInContent = e.clientX - rect.left + scrollLeft - 104;
      const ratio = Math.max(0, Math.min(1, xInContent / contentW));
      const newTime = ratio * dur;
      usePlaybackStore.getState().seekTo(newTime);
    };
    const onUp = () => setTlScrubbing(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [tlScrubbing, clipDuration, tlZoom]);

  // ── Segment drag/resize ──
  const handleSegMouseDown = useCallback((e, segId, mode) => {
    e.stopPropagation();
    e.preventDefault();
    const seg = useSubtitleStore.getState().editSegments.find(s => s.id === segId);
    if (!seg) return;
    setActiveSegId(segId);
    tlDragRef.current = { segId, mode, startX: e.clientX, origStart: seg.startSec, origEnd: seg.endSec };

    const dur = clipDuration || 1;
    const contentW = Math.max(500, 500 * tlZoom);
    const pxPerSec = contentW / dur;

    const onMove = (ev) => {
      const drag = tlDragRef.current;
      if (!drag) return;
      const dx = ev.clientX - drag.startX;
      const dtSec = dx / pxPerSec;

      setEditSegments(prev => prev.map(s => {
        if (s.id !== drag.segId) return s;
        let newStart = drag.origStart;
        let newEnd = drag.origEnd;
        if (drag.mode === "move") {
          const segDur = drag.origEnd - drag.origStart;
          newStart = Math.max(0, Math.min(dur - segDur, drag.origStart + dtSec));
          newEnd = newStart + segDur;
        } else if (drag.mode === "resize-l") {
          newStart = Math.max(0, Math.min(drag.origEnd - 0.1, drag.origStart + dtSec));
        } else if (drag.mode === "resize-r") {
          newEnd = Math.max(drag.origStart + 0.1, Math.min(dur, drag.origEnd + dtSec));
        }
        return { ...s, startSec: newStart, endSec: newEnd, start: fmtTime(newStart), end: fmtTime(newEnd), dur: (newEnd - newStart).toFixed(1) + "s" };
      }));
      markDirty();
    };

    const onUp = () => {
      tlDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [clipDuration, tlZoom, setActiveSegId, setEditSegments, markDirty]);

  // ── Scrub from event ──
  const scrubFromEvent = useCallback((e) => {
    const scrollEl = timelineContentRef.current;
    if (!scrollEl) return;
    const dur = clipDuration || 1;
    const contentW = Math.max(500, 500 * tlZoom);
    const rect = scrollEl.getBoundingClientRect();
    const scrollLeft = scrollEl.scrollLeft;
    const xInContent = e.clientX - rect.left + scrollLeft - 104;
    const ratio = Math.max(0, Math.min(1, xInContent / contentW));
    const newTime = ratio * dur;
    usePlaybackStore.getState().seekTo(newTime);
  }, [clipDuration, tlZoom]);

  const handleTimelineMouseDown = useCallback((e) => {
    e.preventDefault();
    setTlScrubbing(true);
    setPlaying(false);
    scrubFromEvent(e);
  }, [scrubFromEvent, setTlScrubbing, setPlaying]);

  return (
    <div style={{
      height: effectiveHeight, minHeight: tlCollapsed ? TL_COLLAPSED_H : TL_MIN,
      maxHeight: tlCollapsed ? TL_COLLAPSED_H : TL_MAX,
      background: T.surface, borderTop: `1px solid ${BD}`,
      display: "flex", flexDirection: "column", overflow: "hidden",
      position: tlOverlay ? "absolute" : "relative",
      ...(tlOverlay ? { bottom: 0, left: 0, right: 0, zIndex: 40, boxShadow: "0 -8px 32px rgba(0,0,0,0.7)", background: "rgba(17,18,24,0.97)", backdropFilter: "blur(8px)" } : {}),
      flexShrink: 0,
    }}>
      {/* Resize handle */}
      {!tlCollapsed && (
        <div
          onMouseDown={onTlResizeStart}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, cursor: "ns-resize", zIndex: 20 }}
        />
      )}

      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
        borderBottom: tlCollapsed ? "none" : `1px solid ${BD}`,
        height: 36, minHeight: 36, marginTop: tlCollapsed ? 0 : 4,
        borderTop: tlCollapsed ? `1px solid ${BD}` : "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Ib title="Split">⌇</Ib>
          <Ib title="Select">A</Ib>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <Ib onClick={() => setTlZoom(Math.max(0.5, tlZoom - 0.25))}>−</Ib>
          <input type="range" min={50} max={400} value={tlZoom * 100}
            onChange={e => setTlZoom(Number(e.target.value) / 100)}
            style={{ width: 60, height: 3, accentColor: T.accent, cursor: "pointer" }}
          />
          <Ib onClick={() => setTlZoom(Math.min(4, tlZoom + 0.25))}>+</Ib>
          <span style={{ fontSize: 9, color: T.textTertiary, fontFamily: T.mono }}>{Math.round(tlZoom * 100)}%</span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textSecondary }}>{fmtTime(currentTime)} / {fmtTime(clipDuration)}</span>
        <Ib onClick={() => setPlaying(!playing)}>{playing ? "⏸" : "▶"}</Ib>
        <span
          onClick={() => setTlSpeed(tlSpeed === "1x" ? "2x" : "1x")}
          style={{
            fontSize: 11, fontWeight: 600, color: T.textSecondary, border: `1px solid ${BD}`,
            borderRadius: 4, padding: "2px 6px", cursor: "pointer",
          }}
        >{tlSpeed}</span>
        <Ib onClick={() => setTlCollapsed(!tlCollapsed)} title={tlCollapsed ? "Expand timeline" : "Collapse timeline"} style={{ marginLeft: 6 }}>
          {tlCollapsed ? "⊞" : "⊟"}
        </Ib>
        <Ib onClick={() => setTlOverlay(!tlOverlay)} title="Float timeline" active={tlOverlay}>⧉</Ib>
      </div>

      {/* Timeline area (hidden when collapsed) */}
      {!tlCollapsed && (() => {
        const dur = clipDuration || 1;
        const contentW = Math.max(500, 500 * tlZoom);
        const s1Segs = editSegments.filter(s => s.track === "s1");
        const s2Segs = editSegments.filter(s => s.track === "s2");
        const hasSub2 = s2Segs.length > 0;
        const visibleTracks = TRACKS.filter(t => t.id !== "s2" || hasSub2);

        // Ruler marks
        const rulerStep = dur <= 10 ? 1 : dur <= 30 ? 2 : dur <= 60 ? 5 : 10;
        const rulerMarks = [];
        for (let t = 0; t <= dur; t += rulerStep) rulerMarks.push(t);

        return (
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div
              ref={timelineContentRef}
              style={{ flex: 1, overflowX: "auto", overflowY: "auto", position: "relative" }}
            >
              {/* Ruler row */}
              <div
                onMouseDown={handleTimelineMouseDown}
                style={{
                  display: "flex", height: 22, minHeight: 22, background: S2,
                  borderBottom: `1px solid ${BD}`, position: "sticky", top: 0, zIndex: 6,
                  cursor: "crosshair",
                }}
              >
                <div style={{
                  width: 104, minWidth: 104, borderRight: `1px solid ${BD}`, background: S2,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 8, color: T.textTertiary, fontFamily: T.mono, flexShrink: 0,
                }}>TIME</div>
                <div style={{ flex: 1, position: "relative", minWidth: contentW, height: "100%" }}>
                  {rulerMarks.map(t => (
                    <div key={t} style={{
                      position: "absolute", left: `${(t / dur) * 100}%`, bottom: 0, height: "100%",
                      display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "flex-start",
                    }}>
                      <span style={{
                        fontSize: 9, fontFamily: T.mono, color: T.textTertiary,
                        position: "absolute", top: 3, left: 3, whiteSpace: "nowrap",
                      }}>{t}s</span>
                      <div style={{ width: 1, height: 6, background: BDH }} />
                    </div>
                  ))}
                  {/* Ruler playhead */}
                  {dur > 0 && (
                    <div style={{
                      position: "absolute", left: `${(currentTime / dur) * 100}%`, top: 0, bottom: 0,
                      width: 2, background: T.accentLight, pointerEvents: "none", zIndex: 5,
                      transform: "translateX(-1px)",
                    }}>
                      <div style={{
                        position: "absolute", bottom: -2, left: -4, width: 0, height: 0,
                        borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
                        borderBottom: `5px solid ${T.accentLight}`,
                      }} />
                    </div>
                  )}
                </div>
              </div>

              {/* Track rows */}
              <div style={{ position: "relative" }}>
                {visibleTracks.map(track => (
                  <div key={track.id} style={{
                    display: "flex", alignItems: "center", borderBottom: `1px solid ${BD}`, flexShrink: 0,
                    minHeight: track.type === "video" ? 30 : track.type === "audio" ? 32 : 26,
                  }}>
                    <div style={{
                      width: 104, minWidth: 104, padding: "0 8px", fontSize: 9, fontWeight: 600,
                      color: T.textTertiary, borderRight: `1px solid ${BD}`, height: "100%",
                      display: "flex", alignItems: "center", background: S2, textTransform: "uppercase",
                      letterSpacing: "0.3px", gap: 5, flexShrink: 0,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: track.color, flexShrink: 0 }} />
                      {track.label}
                    </div>

                    <div
                      onMouseDown={handleTimelineMouseDown}
                      style={{ flex: 1, height: "100%", position: "relative", minWidth: contentW, cursor: "crosshair" }}
                    >
                      {/* CAPTION block */}
                      {track.id === "cap" && (
                        <div style={{
                          position: "absolute", top: 3, left: 4, right: 4, height: 20,
                          borderRadius: 3, background: "rgba(139,92,246,0.3)", border: "1px solid rgba(139,92,246,0.5)",
                          color: "#c4b0ef", fontSize: 9.5, fontWeight: 500, display: "flex", alignItems: "center",
                          padding: "0 7px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                          cursor: "default", pointerEvents: "none",
                        }}>{captionText || clipTitle || "Caption"}</div>
                      )}

                      {/* SUB 1 segments */}
                      {track.id === "s1" && s1Segs.map(seg => {
                        const isActive = seg.id === activeSegId;
                        return (
                          <div key={seg.id}
                            onMouseDown={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const xInSeg = e.clientX - rect.left;
                              const mode = xInSeg < 6 ? "resize-l" : xInSeg > rect.width - 6 ? "resize-r" : "move";
                              handleSegMouseDown(e, seg.id, mode);
                            }}
                            style={{
                              position: "absolute", top: 3, height: 20, borderRadius: 3,
                              left: `${(seg.startSec / dur) * 100}%`,
                              width: `${Math.max(0.5, ((seg.endSec - seg.startSec) / dur) * 100)}%`,
                              background: isActive ? "rgba(139,92,246,0.3)" : "rgba(76,130,200,0.25)",
                              border: isActive ? "1.5px solid rgba(139,92,246,0.8)" : "1px solid rgba(76,130,200,0.4)",
                              color: "#90b8e0", fontSize: 8, fontWeight: 500, display: "flex", alignItems: "center",
                              padding: "0 6px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                              cursor: "grab", zIndex: isActive ? 3 : 2, userSelect: "none",
                            }}
                            title={seg.text}
                          >
                            <div style={{ position: "absolute", left: 0, top: 0, width: 6, height: "100%", cursor: "ew-resize", zIndex: 4 }} />
                            <span style={{ pointerEvents: "none" }}>{seg.text}</span>
                            <div style={{ position: "absolute", right: 0, top: 0, width: 6, height: "100%", cursor: "ew-resize", zIndex: 4 }} />
                          </div>
                        );
                      })}

                      {/* SUB 2 segments */}
                      {track.id === "s2" && s2Segs.map(seg => {
                        const isActive = seg.id === activeSegId;
                        return (
                          <div key={seg.id}
                            onMouseDown={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const xInSeg = e.clientX - rect.left;
                              const mode = xInSeg < 6 ? "resize-l" : xInSeg > rect.width - 6 ? "resize-r" : "move";
                              handleSegMouseDown(e, seg.id, mode);
                            }}
                            style={{
                              position: "absolute", top: 3, height: 20, borderRadius: 3,
                              left: `${(seg.startSec / dur) * 100}%`,
                              width: `${Math.max(0.5, ((seg.endSec - seg.startSec) / dur) * 100)}%`,
                              background: isActive ? "rgba(139,92,246,0.3)" : "rgba(210,170,40,0.2)",
                              border: isActive ? "1.5px solid rgba(139,92,246,0.8)" : "1px solid rgba(210,170,40,0.4)",
                              color: "#d4b94a", fontSize: 8, fontWeight: 500, display: "flex", alignItems: "center",
                              padding: "0 6px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                              cursor: "grab", zIndex: isActive ? 3 : 2, userSelect: "none",
                            }}
                            title={seg.text}
                          >
                            <div style={{ position: "absolute", left: 0, top: 0, width: 6, height: "100%", cursor: "ew-resize", zIndex: 4 }} />
                            <span style={{ pointerEvents: "none" }}>{seg.text}</span>
                            <div style={{ position: "absolute", right: 0, top: 0, width: 6, height: "100%", cursor: "ew-resize", zIndex: 4 }} />
                          </div>
                        );
                      })}

                      {/* VIDEO block */}
                      {track.id === "v1" && (
                        <div style={{
                          position: "absolute", top: 4, left: 4, right: 4, height: 22,
                          borderRadius: 3, background: "rgba(52,211,153,0.2)", border: "1px solid rgba(52,211,153,0.4)",
                          color: "#7dc49a", fontSize: 9.5, fontWeight: 500, display: "flex", alignItems: "center",
                          padding: "0 7px", pointerEvents: "none",
                        }}>Source video</div>
                      )}

                      {/* AUDIO waveform */}
                      {track.type === "audio" && (
                        <div style={{
                          position: "absolute", left: 4, right: 4, top: 4, height: 24,
                          display: "flex", alignItems: "center", gap: 1, overflow: "hidden", pointerEvents: "none",
                        }}>
                          {Array.from({ length: Math.max(60, Math.round(60 * tlZoom)) }, (_, i) => {
                            const seed = (track.id === "a1" ? 7 : 13) * (i + 1);
                            const h = ((seed * 2654435761 >>> 0) % 18) + 4;
                            return (
                              <span key={i} style={{
                                flexShrink: 0, width: 2, borderRadius: 1, opacity: 0.65,
                                height: h, background: track.color,
                              }} />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Global playhead */}
                {dur > 0 && (
                  <div style={{
                    position: "absolute", top: 0, bottom: 0,
                    left: `calc(104px + ${(currentTime / dur) * 100}% - ${(currentTime / dur) * 104}px)`,
                    width: 2, background: T.accentLight, pointerEvents: "none", zIndex: 10,
                    transition: (playing || tlScrubbing) ? "none" : "left 0.1s",
                    transform: "translateX(-1px)",
                  }}>
                    <div style={{
                      position: "absolute", top: -2, left: -4, width: 0, height: 0,
                      borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
                      borderTop: `7px solid ${T.accentLight}`,
                    }} />
                  </div>
                )}

                {/* Add track row */}
                <div style={{
                  display: "flex", alignItems: "center", borderBottom: `1px solid ${BD}`,
                  minHeight: 22, cursor: "pointer", opacity: 0.5, transition: "opacity 0.15s",
                }}>
                  <div style={{
                    width: 104, minWidth: 104, padding: "0 8px", fontSize: 9, fontWeight: 600,
                    color: T.textTertiary, borderRight: `1px solid ${BD}`, height: "100%",
                    display: "flex", alignItems: "center", background: S2, gap: 5,
                  }}>
                    + Add track
                  </div>
                  <div style={{ flex: 1, minWidth: contentW }} />
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
