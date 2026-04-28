import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import usePlaybackStore from "../stores/usePlaybackStore";
import useSubtitleStore from "../stores/useSubtitleStore";
import useCaptionStore from "../stores/useCaptionStore";
import useLayoutStore from "../stores/useLayoutStore";
import useEditorStore from "../stores/useEditorStore";
import { fmtTime } from "../utils/timeUtils";
import { getTimelineDuration, getSegmentTimelineRange, sourceToTimeline, timelineToSource } from "../models/timeMapping";
import {
  Play, Pause, ZoomIn, ZoomOut, Scissors,
  PanelBottomClose, Music,
} from "lucide-react";
import { Slider } from "../../../components/ui/slider";
import { Button } from "../../../components/ui/button";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "../../../components/ui/tooltip";

// ── Extracted sub-components ──
import {
  TRACK_COLORS, PLAYHEAD_COLOR, SNAP_GUIDE_COLOR,
  TIMELINE_BG, RULER_BG, TRACK_SEPARATOR,
  RULER_H, TRACK_H, AUDIO_TRACK_H, LABEL_W, END_PADDING,
  CLUSTER_GAP_PX, CLUSTER_MIN_WIDTH_PX, SEGMENT_RADIUS, RIPPLE_ANIM_MS, SNAP_THRESHOLD_PX,
} from "./timeline/timelineConstants";
import SpeedDropdown from "./timeline/SpeedDropdown";
import TrackContextMenu from "./timeline/TrackContextMenu";
import SegmentBlock from "./timeline/SegmentBlock";
import WaveformTrack from "./timeline/WaveformTrack";
import Ruler from "./timeline/Ruler";

// ── Main Timeline Panel ──
export default function TimelinePanelNew() {
  // ── Store subscriptions ──
  const playing = usePlaybackStore((s) => s.playing);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const duration = usePlaybackStore((s) => s.duration);
  const clipFileDuration = usePlaybackStore((s) => s.clipFileDuration);
  const tlSpeed = usePlaybackStore((s) => s.tlSpeed);
  const togglePlay = usePlaybackStore((s) => s.togglePlay);
  const seekTo = usePlaybackStore((s) => s.seekTo);
  const setTlSpeed = usePlaybackStore((s) => s.setTlSpeed);

  // Subtitle segments — mapped to timeline coordinates for display
  const rawEditSegments = useSubtitleStore((s) => s.editSegments);
  const updateSegmentTimes = useSubtitleStore((s) => s.updateSegmentTimes);
  const splitSegment = useSubtitleStore((s) => s.splitSegment);
  const setActiveSegId = useSubtitleStore((s) => s.setActiveSegId);
  const deleteSegment = useSubtitleStore((s) => s.deleteSegment);
  const rippleDeleteSegment = useSubtitleStore((s) => s.rippleDeleteSegment);

  const captionSegments = useCaptionStore((s) => s.captionSegments);
  const updateCaptionSegmentTimes = useCaptionStore((s) => s.updateCaptionSegmentTimes);
  const splitCaptionAtPlayhead = useCaptionStore((s) => s.splitCaptionAtPlayhead);
  const deleteCaptionSegment = useCaptionStore((s) => s.deleteCaptionSegment);
  const rippleDeleteCaptionSegment = useCaptionStore((s) => s.rippleDeleteCaptionSegment);

  const tlZoom = useLayoutStore((s) => s.tlZoom);
  const toggleTlCollapse = useLayoutStore((s) => s.toggleTlCollapse);
  const setTlZoom = useLayoutStore((s) => s.setTlZoom);

  const waveformPeaks = useEditorStore((s) => s.waveformPeaks);
  const waveformError = useEditorStore((s) => s.waveformError);
  const nleSegments = useEditorStore((s) => s.nleSegments);
  const sourceDuration = useEditorStore((s) => s.sourceDuration);
  const sourceStartTime = useEditorStore((s) => s.sourceStartTime);
  const splitAtTimeline = useEditorStore((s) => s.splitAtTimeline);
  const deleteNleSegment = useEditorStore((s) => s.deleteNleSegment);
  const trimNleSegmentLeft = useEditorStore((s) => s.trimNleSegmentLeft);
  const trimNleSegmentRight = useEditorStore((s) => s.trimNleSegmentRight);

  // ── Local state ──
  const [speedOpen, setSpeedOpen] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [selectedSegIds, setSelectedSegIds] = useState(new Set());
  const [contextMenu, setContextMenu] = useState(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [rippleAnimating, setRippleAnimating] = useState(false);
  const [snapGuides, setSnapGuides] = useState([]);

  // Refs
  const scrollRef = useRef(null);
  const trackAreaRef = useRef(null);
  const mouseXRef = useRef(0);
  const prevZoomRef = useRef(tlZoom);
  const dragOriginalsRef = useRef(null); // snapshot of all segment positions before drag
  const resizeOriginalsRef = useRef(null); // snapshot of all segment positions before resize
  const dragPhantomsRef = useRef([]); // phantom right portions during middle-case drag
  const [dragPhantoms, setDragPhantoms] = useState([]);
  const scrubRafRef = useRef(null);
  const playheadRafRef = useRef(null);
  const [smoothTime, setSmoothTime] = useState(0);

  // Helper — first selected ID (for backwards compat with single-select APIs)
  const selectedSegId = useMemo(() => {
    const arr = Array.from(selectedSegIds);
    return arr.length > 0 ? arr[0] : null;
  }, [selectedSegIds]);

  // Derive timeline-mapped subtitle segments (source-absolute → timeline coordinates)
  const editSegments = useMemo(
    () => useSubtitleStore.getState().getTimelineMappedSegments(),
    [rawEditSegments, nleSegments]
  );

  // Helper: convert timeline time → source time for subtitle operations
  const toSource = useCallback((timelineTime) => {
    if (!nleSegments || nleSegments.length === 0) return timelineTime;
    const result = timelineToSource(timelineTime, nleSegments);
    return result.found ? result.sourceTime : timelineTime;
  }, [nleSegments]);

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

  // ── Layout measurements ──
  const [trackAreaWidth, setTrackAreaWidth] = useState(600);
  useEffect(() => {
    if (!trackAreaRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setTrackAreaWidth(entry.contentRect.width);
    });
    observer.observe(trackAreaRef.current);
    return () => observer.disconnect();
  }, []);

  // Effective duration: derived from NLE segment list (sum of all segment durations)
  const nleDuration = nleSegments.length > 0 ? getTimelineDuration(nleSegments) : 0;
  const rawEffectiveDuration = Math.max(duration, nleDuration);
  // During an active trim drag, we freeze the pixel scale to its pre-drag value
  // so the timeline doesn't "zoom" live as segments shrink. Set via onTrimStart
  // from WaveformTrack; cleared on pointerup.
  const [trimSnapshot, setTrimSnapshot] = useState(null);
  const effectiveDuration = trimSnapshot ?? rawEffectiveDuration;

  const visibleContentWidth = trackAreaWidth - LABEL_W;
  const clipContentWidth = visibleContentWidth * tlZoom;
  const totalWidth = LABEL_W + clipContentWidth + END_PADDING;
  const playheadTime = playing ? smoothTime : currentTime;
  const playheadPx = effectiveDuration > 0 ? LABEL_W + (playheadTime / effectiveDuration) * clipContentWidth : LABEL_W;

  // ── Scrubbing ──
  const handleScrub = useCallback((e) => {
    if (!scrollRef.current || effectiveDuration <= 0) return;
    const rect = scrollRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollRef.current.scrollLeft - LABEL_W;
    if (x < 0) return;
    const rawT = (x / clipContentWidth) * effectiveDuration;
    const t = Math.max(0, Math.min(effectiveDuration, rawT));
    seekTo(t);
  }, [effectiveDuration, clipContentWidth, seekTo]);

  const handleScrubStart = useCallback((e) => {
    if (e.button !== 0) return;
    // Don't seek when clicking on a segment block — let the segment handle it
    if (e.target.closest(".segment-block")) return;
    setScrubbing(true);
    handleScrub(e);
  }, [handleScrub]);

  useEffect(() => {
    if (!scrubbing) return;
    const onMove = (e) => {
      if (scrubRafRef.current) cancelAnimationFrame(scrubRafRef.current);
      scrubRafRef.current = requestAnimationFrame(() => {
        if (!scrollRef.current || effectiveDuration <= 0) return;
        const rect = scrollRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + scrollRef.current.scrollLeft - LABEL_W;
        const rawT = (x / clipContentWidth) * effectiveDuration;
        const t = Math.max(0, Math.min(effectiveDuration, rawT));
        seekTo(t);
      });
    };
    const onUp = () => {
      if (scrubRafRef.current) cancelAnimationFrame(scrubRafRef.current);
      setScrubbing(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [scrubbing, effectiveDuration, clipContentWidth, seekTo]);

  // Handle wheel events on timeline — horizontal scroll support
  // MX Master and similar mice send deltaX for horizontal wheel;
  // vertical scroll (deltaY without shift) is ignored to avoid fighting with page scroll.
  // Shift+scroll converts vertical to horizontal for mice without a horizontal wheel.
  const handleTimelineWheel = useCallback((e) => {
    const container = scrollRef.current;
    if (!container) return;

    if (e.shiftKey && Math.abs(e.deltaY) > 0) {
      // Shift + vertical scroll → horizontal scroll
      e.preventDefault();
      container.scrollLeft += e.deltaY;
    } else if (Math.abs(e.deltaX) > 0) {
      // Native horizontal scroll (e.g. MX Master horizontal wheel)
      e.preventDefault();
      container.scrollLeft += e.deltaX;
    }
  }, []);

  // Track mouse position for zoom-to-cursor
  const handleMouseMove = useCallback((e) => {
    mouseXRef.current = e.clientX;
  }, []);

  // ── Deselect on empty area click ──
  const handleTrackBgClick = useCallback(() => {
    setSelectedTrack(null);
    setSelectedSegIds(new Set());
  }, []);

  // Clear snap guides on any pointer up (end of drag/resize)
  useEffect(() => {
    const onUp = () => setSnapGuides([]);
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, []);

  // ── Caption segments — resolve null endSec ──
  const captionSegs = useMemo(() => {
    return captionSegments.map((seg) => ({ ...seg, endSec: seg.endSec ?? duration }));
  }, [captionSegments, duration]);

  // ── Snap system ──
  // Collect all segment edge times across all tracks for snap detection
  const snapPoints = useMemo(() => {
    const points = new Set();
    for (const s of editSegments) { points.add(s.startSec); points.add(s.endSec); }
    for (const s of captionSegs) { points.add(s.startSec); points.add(s.endSec); }
    // NLE segment edges in timeline coordinates
    let tlOffset = 0;
    for (const seg of nleSegments) {
      points.add(tlOffset);
      tlOffset += seg.sourceEnd - seg.sourceStart;
      points.add(tlOffset);
    }
    return Array.from(points);
  }, [editSegments, captionSegs, nleSegments]);

  // Snap a time value to the nearest snap point (returns snapped time + active guide lines)
  const applySnap = useCallback((time, excludeId, excludeTrack) => {
    const thresholdSec = effectiveDuration > 0
      ? (SNAP_THRESHOLD_PX / clipContentWidth) * effectiveDuration
      : 0.1;
    let closest = null;
    let closestDist = Infinity;
    for (const pt of snapPoints) {
      const dist = Math.abs(time - pt);
      if (dist < thresholdSec && dist < closestDist) {
        closest = pt;
        closestDist = dist;
      }
    }
    if (closest !== null && closestDist > 0.001) {
      // Show snap guide at this position
      const guidePx = LABEL_W + (closest / effectiveDuration) * clipContentWidth;
      setSnapGuides([guidePx]);
      return closest;
    }
    setSnapGuides([]);
    return time;
  }, [snapPoints, effectiveDuration, clipContentWidth]);

  // Clear snap guides when no drag is happening (called on pointer up via wrapped handlers)
  const clearSnapGuides = useCallback(() => setSnapGuides([]), []);

  // ── Resize handlers ──
  // Resize caption — same originals-based approach as subtitle resize
  const capResizeOriginalsRef = useRef(null);

  const handleCaptionResize = useCallback((id, rawStart, rawEnd) => {
    const capStore = useCaptionStore.getState();

    if (!capResizeOriginalsRef.current) {
      capResizeOriginalsRef.current = {};
      const segs = capStore.captionSegments.map(s => ({ ...s, endSec: s.endSec ?? duration }));
      for (const seg of segs) {
        capResizeOriginalsRef.current[seg.id] = { startSec: seg.startSec, endSec: seg.endSec };
      }
    }
    const originals = capResizeOriginalsRef.current;
    const origSeg = originals[id];
    if (!origSeg) return;

    const resizingLeft = Math.abs(rawStart - origSeg.startSec) > 0.001;
    const resizingRight = Math.abs(rawEnd - origSeg.endSec) > 0.001;

    let newStart = resizingLeft ? applySnap(rawStart, id, "cap") : rawStart;
    let newEnd = resizingRight ? applySnap(rawEnd, id, "cap") : rawEnd;
    newStart = Math.max(0, newStart);
    newEnd = Math.min(duration, newEnd);
    if (newEnd - newStart < 0.01) {
      if (resizingLeft) newStart = newEnd - 0.01;
      else newEnd = newStart + 0.01;
    }

    // Iterate caption segments (preserves number IDs)
    const capSegsSnapshot = capStore.captionSegments;
    for (const seg of capSegsSnapshot) {
      if (seg.id === id) continue;
      const orig = originals[seg.id];
      if (!orig) continue;
      const overlapStart = Math.max(newStart, orig.startSec);
      const overlapEnd = Math.min(newEnd, orig.endSec);

      if (overlapStart < overlapEnd) {
        if (newStart <= orig.startSec && newEnd >= orig.endSec) {
          capStore.updateCaptionSegmentTimes(seg.id, orig.startSec, orig.startSec + 0.001);
        } else if (resizingRight && newEnd > orig.startSec) {
          capStore.updateCaptionSegmentTimes(seg.id, newEnd, orig.endSec);
        } else if (resizingLeft && newStart < orig.endSec) {
          capStore.updateCaptionSegmentTimes(seg.id, orig.startSec, newStart);
        }
      } else {
        capStore.updateCaptionSegmentTimes(seg.id, orig.startSec, orig.endSec);
      }
    }

    capStore.updateCaptionSegmentTimes(id, Math.max(0, newStart), Math.min(duration, newEnd));
  }, [duration, applySnap]);

  const handleCaptionResizeEnd = useCallback((id) => {
    capResizeOriginalsRef.current = null;
    const currentSegs = useCaptionStore.getState().captionSegments;
    const toDelete = currentSegs.filter(seg => (seg.endSec ?? duration) - seg.startSec < 0.05);
    for (const seg of toDelete) {
      deleteCaptionSegment(seg.id);
    }
  }, [duration, deleteCaptionSegment]);

  // Drag (move) subtitle segment — pushes overlapping neighbors.
  // Uses getState() to avoid stale closure issues during drag.
  const handleSubtitleDrag = useCallback((segId, newStart, newEnd) => {
    const store = useSubtitleStore.getState();
    const segDur = newEnd - newStart;
    let sStart = applySnap(newStart, segId, "sub");
    sStart = Math.max(0, sStart);
    let sEnd = Math.min(effectiveDuration, sStart + segDur);

    // Snapshot originals on first drag call (timeline coordinates for overlap detection)
    if (!dragOriginalsRef.current) {
      store.startDrag();
      dragOriginalsRef.current = {};
      const mapped = store.getTimelineMappedSegments();
      for (const seg of mapped) {
        dragOriginalsRef.current[seg.id] = { startSec: seg.startSec, endSec: seg.endSec };
      }
    }

    const originals = dragOriginalsRef.current;
    const phantoms = [];
    const mapped = store.getTimelineMappedSegments();

    for (const seg of mapped) {
      if (seg.id === segId) continue;
      const orig = originals[seg.id];
      if (!orig) continue;

      // Overlap detection in timeline coordinates
      const overlapStart = Math.max(sStart, orig.startSec);
      const overlapEnd = Math.min(sEnd, orig.endSec);

      if (overlapStart < overlapEnd) {
        if (sStart <= orig.startSec && sEnd > orig.startSec && sEnd < orig.endSec) {
          store.updateSegmentTimes(seg.id, toSource(sEnd), toSource(orig.endSec));
        }
        else if (sEnd >= orig.endSec && sStart < orig.endSec && sStart > orig.startSec) {
          store.updateSegmentTimes(seg.id, toSource(orig.startSec), toSource(sStart));
        }
        else if (sStart > orig.startSec && sEnd < orig.endSec) {
          store.updateSegmentTimes(seg.id, toSource(orig.startSec), toSource(sStart));
          phantoms.push({ startSec: sEnd, endSec: orig.endSec, text: seg.text || "", parentId: seg.id });
        }
        else if (sStart <= orig.startSec && sEnd >= orig.endSec) {
          store.deleteSegment(seg.id);
        }
      } else {
        store.updateSegmentTimes(seg.id, toSource(orig.startSec), toSource(orig.endSec));
      }
    }

    dragPhantomsRef.current = phantoms;
    setDragPhantoms(phantoms);
    store.updateSegmentTimes(segId, toSource(sStart), toSource(sEnd));
  }, [effectiveDuration, applySnap, toSource]);

  // On drag end — create real segments from phantoms, clear state
  const handleSubtitleDragEnd = useCallback((segId) => {
    useSubtitleStore.getState().endDrag();
    const phantoms = dragPhantomsRef.current;
    if (phantoms.length > 0) {
      const { addSegmentAt } = useSubtitleStore.getState();
      if (addSegmentAt) {
        for (const p of phantoms) {
          addSegmentAt(p.startSec, p.endSec, p.text);
        }
      }
    }
    dragPhantomsRef.current = [];
    setDragPhantoms([]);
    dragOriginalsRef.current = null;
  }, []);

  // Drag (move) caption segment
  const handleCaptionDrag = useCallback((id, newStart, newEnd) => {
    const segDur = newEnd - newStart;
    const sStart = applySnap(newStart, id, "cap");
    updateCaptionSegmentTimes(id, Math.max(0, sStart), Math.min(duration, sStart + segDur));
  }, [duration, updateCaptionSegmentTimes, applySnap]);

  // NLE trim handlers — called from WaveformTrack with source-absolute values
  const handleNleTrimLeft = useCallback((id, newSourceStart) => {
    trimNleSegmentLeft(id, newSourceStart);
  }, [trimNleSegmentLeft]);

  const handleNleTrimRight = useCallback((id, newSourceEnd) => {
    trimNleSegmentRight(id, newSourceEnd);
  }, [trimNleSegmentRight]);

  // Resize subtitle — uses originals snapshot so neighbors restore when dragging back.
  // Originals are in timeline coordinates (from getTimelineMappedSegments) since
  // SegmentBlock passes timeline-time values. Convert to source at updateSegmentTimes calls.
  const handleSubtitleResize = useCallback((segId, rawStart, rawEnd) => {
    const store = useSubtitleStore.getState();

    // Snapshot originals on first resize call + push single pre-resize undo entry
    if (!resizeOriginalsRef.current) {
      store.startDrag();
      resizeOriginalsRef.current = {};
      // Use timeline-mapped segments so originals match the coordinate space of rawStart/rawEnd
      const mapped = store.getTimelineMappedSegments();
      for (const seg of mapped) {
        resizeOriginalsRef.current[seg.id] = { startSec: seg.startSec, endSec: seg.endSec };
      }
    }
    const originals = resizeOriginalsRef.current;
    const origSeg = originals[segId];
    if (!origSeg) return;

    // Determine which edge is being resized
    const resizingLeft = Math.abs(rawStart - origSeg.startSec) > 0.001;
    const resizingRight = Math.abs(rawEnd - origSeg.endSec) > 0.001;

    // Apply snap to the moving edge (all in timeline space)
    let newStart = resizingLeft ? applySnap(rawStart, segId, "sub") : rawStart;
    let newEnd = resizingRight ? applySnap(rawEnd, segId, "sub") : rawEnd;
    newStart = Math.max(0, newStart);
    newEnd = Math.min(effectiveDuration, newEnd);
    if (newEnd - newStart < 0.01) {
      if (resizingLeft) newStart = newEnd - 0.01;
      else newEnd = newStart + 0.01;
    }

    // Iterate mapped segments — overlap detection in timeline space
    const mapped = store.getTimelineMappedSegments();
    for (const seg of mapped) {
      if (seg.id === segId) continue;
      const orig = originals[seg.id];
      if (!orig) continue;

      const overlapStart = Math.max(newStart, orig.startSec);
      const overlapEnd = Math.min(newEnd, orig.endSec);

      if (overlapStart < overlapEnd) {
        if (newStart <= orig.startSec && newEnd >= orig.endSec) {
          store.updateSegmentTimes(seg.id, toSource(orig.startSec), toSource(orig.startSec) + 0.001);
        } else if (resizingRight && newEnd > orig.startSec) {
          store.updateSegmentTimes(seg.id, toSource(newEnd), toSource(orig.endSec));
        } else if (resizingLeft && newStart < orig.endSec) {
          store.updateSegmentTimes(seg.id, toSource(orig.startSec), toSource(newStart));
        }
      } else {
        store.updateSegmentTimes(seg.id, toSource(orig.startSec), toSource(orig.endSec));
      }
    }

    store.updateSegmentTimes(segId, toSource(newStart), toSource(newEnd));
  }, [effectiveDuration, applySnap, toSource]);

  // On resize end — delete any segments shrunk to near-zero (including self if shrunk to nothing)
  const handleSubtitleResizeEnd = useCallback((segId) => {
    useSubtitleStore.getState().endDrag();
    resizeOriginalsRef.current = null;

    // Delete ALL segments below threshold — neighbors consumed by extend, or self shrunk to zero
    const currentSegs = useSubtitleStore.getState().editSegments;
    const toDelete = currentSegs.filter(seg => seg.endSec - seg.startSec < 0.05);
    for (const seg of toDelete) {
      deleteSegment(seg.id);
    }
  }, [deleteSegment]);

  // ── Segment selection (multi-select support) ──
  const handleSegSelect = useCallback((track, segId, event) => {
    if (event?.ctrlKey || event?.metaKey) {
      // Toggle individual segment
      setSelectedSegIds(prev => {
        const next = new Set(prev);
        if (next.has(segId)) next.delete(segId);
        else next.add(segId);
        return next;
      });
    } else {
      // Single select
      setSelectedSegIds(new Set([segId]));
    }
    setSelectedTrack(track);
    if (track === "sub") {
      setActiveSegId(segId);
      // Highlight the first word of the clicked segment in the Edit Subtitles panel
      useSubtitleStore.getState().setSelectedWordInfo({ segId, wordIdx: 0 });
    }
    if (track === "cap") useCaptionStore.getState().setActiveCaptionId(segId);
  }, [setActiveSegId]);

  // ── Unified split ──
  const handleSplit = useCallback(() => {
    const time = usePlaybackStore.getState().currentTime;
    let track = selectedTrack;

    if (!track) {
      const capSegsNow = useCaptionStore.getState().captionSegments;
      const hasCap = capSegsNow.some(s => {
        const end = s.endSec ?? Infinity;
        return time >= s.startSec + 0.01 && time <= end - 0.01;
      });
      const subSegsNow = useSubtitleStore.getState().editSegments;
      const hasSub = subSegsNow.some(s => time >= s.startSec + 0.01 && time <= s.endSec - 0.01);
      // NLE: check if playhead is within timeline duration
      const hasAudio = nleSegments.length > 0 && time >= 0.01 && time <= getTimelineDuration(nleSegments) - 0.01;
      if (hasSub) track = "sub";
      else if (hasAudio) track = "audio";
      else if (hasCap) track = "cap";
    }

    if (track === "cap") {
      const newId = splitCaptionAtPlayhead(time);
      if (newId) { setSelectedTrack("cap"); setSelectedSegIds(new Set([newId])); }
    } else if (track === "audio") {
      splitAtTimeline(time);
    } else {
      splitSegment(time);
      const newActiveId = useSubtitleStore.getState().activeSegId;
      if (newActiveId) { setSelectedTrack("sub"); setSelectedSegIds(new Set([newActiveId])); }
    }
  }, [selectedTrack, splitCaptionAtPlayhead, splitSegment, splitAtTimeline, nleSegments]);

  // ── Delete handler (ripple vs gap) ──
  const handleDelete = useCallback((isRipple, track, segId) => {
    if (!track || !segId) return;

    if (track === "cap") {
      isRipple ? rippleDeleteCaptionSegment(segId) : deleteCaptionSegment(segId);
    } else if (track === "sub") {
      isRipple ? rippleDeleteSegment(segId) : deleteSegment(segId);
    } else if (track === "audio") {
      // NLE: delete the NLE segment; also delete overlapping subtitle segments
      const deletedSeg = nleSegments.find((s) => s.id === segId);
      if (deletedSeg) {
        // Find the timeline range of this NLE segment
        const tlRange = getSegmentTimelineRange(segId, nleSegments);
        if (tlRange) {
          const subStore = useSubtitleStore.getState();
          // Get timeline-mapped subtitles to compare in timeline space
          const mappedSubs = subStore.getTimelineMappedSegments();
          const overlapping = mappedSubs.filter(
            (s) => s.startSec >= tlRange.start && s.endSec <= tlRange.end
          );
          overlapping.forEach((s) => isRipple ? subStore.rippleDeleteSegment(s.id) : subStore.deleteSegment(s.id));
        }
      }
      deleteNleSegment(segId);
    }

    if (isRipple) {
      setRippleAnimating(true);
      setTimeout(() => setRippleAnimating(false), RIPPLE_ANIM_MS + 50);
    }
    setSelectedTrack(null);
    setSelectedSegIds(new Set());
  }, [
    rippleDeleteCaptionSegment, deleteCaptionSegment,
    rippleDeleteSegment, deleteSegment,
    deleteNleSegment, nleSegments,
  ]);

  // ── Batch delete for multi-select ──
  const handleBatchDelete = useCallback((isRipple) => {
    if (selectedSegIds.size === 0 || !selectedTrack) return;
    // Sort by startSec descending to avoid cascading offset issues during ripple
    let segs;
    if (selectedTrack === "sub") segs = editSegments;
    else if (selectedTrack === "cap") segs = captionSegs;
    else {
      // NLE segments: derive timeline positions for sorting
      segs = nleSegments.map((seg, i) => {
        const range = getSegmentTimelineRange(seg.id, nleSegments);
        return { ...seg, startSec: range ? range.start : 0 };
      });
    }

    const toDelete = segs
      .filter(s => selectedSegIds.has(s.id))
      .sort((a, b) => b.startSec - a.startSec);

    toDelete.forEach(s => handleDelete(isRipple, selectedTrack, s.id));
  }, [selectedSegIds, selectedTrack, editSegments, captionSegs, nleSegments, handleDelete]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e) => {
      const isInput = document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA";

      if (e.key === " " && !e.ctrlKey && !e.metaKey) {
        if (isInput) return;
        e.preventDefault();
        togglePlay();
      } else if (e.key === "s" && !e.ctrlKey && !e.metaKey) {
        if (isInput) return;
        e.preventDefault();
        handleSplit();
      } else if ((e.ctrlKey || e.metaKey) && e.key === ".") {
        e.preventDefault();
        toggleTlCollapse();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (isInput) return;
        if (selectedSegIds.size === 0) return;
        e.preventDefault();
        // Ripple delete only for audio track; sub/cap always regular delete
        const isRipple = selectedTrack === "audio" ? !e.ctrlKey : false;
        if (selectedSegIds.size > 1) {
          handleBatchDelete(isRipple);
        } else {
          handleDelete(isRipple, selectedTrack, selectedSegId);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, handleSplit, toggleTlCollapse, selectedTrack, selectedSegId, selectedSegIds, handleDelete, handleBatchDelete]);

  // ── Zoom anchored to PLAYHEAD — gently slides playhead toward center ──
  // Uses zoom ratio to scale scroll position, then smoothly drifts toward centering.
  // No rAF animation loop — single immediate scroll + CSS smooth behavior avoids glitchy feedback.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || effectiveDuration <= 0 || prevZoomRef.current === tlZoom) {
      prevZoomRef.current = tlZoom;
      return;
    }

    const prevZoom = prevZoomRef.current;
    const zoomRatio = tlZoom / prevZoom;
    const viewWidth = container.clientWidth;

    // Playhead position in new content space
    const playheadFrac = effectiveDuration > 0 ? currentTime / effectiveDuration : 0;
    const newPlayheadX = LABEL_W + playheadFrac * clipContentWidth;

    // Where playhead currently is on screen
    const prevPlayheadX = LABEL_W + playheadFrac * (visibleContentWidth * prevZoom);
    const playheadScreenX = prevPlayheadX - container.scrollLeft;

    // Two targets: (A) keep playhead at same screen position, (B) center playhead
    const keepInPlaceScroll = newPlayheadX - playheadScreenX;
    const centerScroll = newPlayheadX - viewWidth / 2;

    // Blend: mostly keep-in-place, drift 30% toward center each zoom step
    // This creates the "gentle slide to center" effect without oscillation
    const blendedScroll = keepInPlaceScroll + (centerScroll - keepInPlaceScroll) * 0.3;

    container.scrollLeft = Math.max(0, blendedScroll);
    prevZoomRef.current = tlZoom;
  }, [tlZoom, effectiveDuration, clipContentWidth, visibleContentWidth, currentTime]);

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
  }, [playing, smoothTime, duration, clipContentWidth]);

  // ── Apply playback speed ──
  useEffect(() => {
    const videoRef = usePlaybackStore.getState().getVideoRef();
    if (videoRef?.current) videoRef.current.playbackRate = parseFloat(tlSpeed) || 1;
  }, [tlSpeed]);

  // Collapsed mode is handled by EditorLayout — this component is unmounted when collapsed

  // ════════════════════════════════════════
  //  FULL TIMELINE
  // ════════════════════════════════════════
  return (
    <div className="flex flex-col h-full select-none overflow-hidden" style={{ background: TIMELINE_BG }}>
      {/* ── Controls bar ── */}
      <div className="h-9 min-h-[36px] flex items-center px-3 gap-2" style={{ borderBottom: `1px solid ${TRACK_SEPARATOR}` }}>
        {/* Left: Zoom — logarithmic scale, 1.0 = fit to view (slider center) */}
        {/* Zoom range: 0.2x to 20x. Log scale makes each step feel equal. */}
        {/* Slider 0-100: 50 = fit (1.0x). Left of 50 = zoom out, right = zoom in */}
        <div className="flex items-center gap-0.5">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    // Logarithmic step: multiply by 0.8 (zoom out 20%)
                    setTlZoom(Math.max(0.2, +(tlZoom * 0.8).toFixed(3)));
                  }}
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Zoom out</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="w-[90px]">
            <Slider
              value={[Math.round((Math.log(tlZoom / 0.2) / Math.log(100)) * 100)]}
              min={0} max={100} step={1}
              onValueChange={([v]) => {
                // Slider 0-100 spans zoom [0.2x, 20x] log scale: v=0 → 0.2x, v=50 → 2x, v=100 → 20x
                const zoom = 0.2 * Math.pow(100, v / 100);
                setTlZoom(Math.max(0.2, Math.min(20, +zoom.toFixed(3))));
              }}
              className="flex-1"
            />
          </div>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    // Logarithmic step: multiply by 1.25 (zoom in 25%)
                    setTlZoom(Math.min(20, +(tlZoom * 1.25).toFixed(3)));
                  }}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Zoom in</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Center: Play + timecodes */}
        <div className="flex-1 flex items-center justify-center gap-2">
          <span className="text-[11px] font-mono text-foreground tabular-nums">{fmtTime(currentTime)}</span>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-foreground" onClick={togglePlay}>
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">{playing ? "Pause" : "Play"} (Space)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="text-[11px] font-mono text-muted-foreground tabular-nums">{fmtTime(effectiveDuration)}</span>
        </div>

        {/* Right: Split, Speed, Hide */}
        <div className="flex items-center gap-0.5">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={handleSplit}>
                  <Scissors className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Split (S)</TooltipContent>
            </Tooltip>

            <div className="relative">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground font-mono"
                    onClick={() => setSpeedOpen(!speedOpen)}
                  >
                    {tlSpeed}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Playback speed</TooltipContent>
              </Tooltip>
              {speedOpen && <SpeedDropdown value={tlSpeed} onChange={setTlSpeed} onClose={() => setSpeedOpen(false)} />}
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleTlCollapse(); }}
                >
                  <PanelBottomClose className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Hide timeline (Ctrl+.)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* ── Unified scroll container ── */}
      <div
        ref={(el) => { scrollRef.current = el; trackAreaRef.current = el; }}
        className="flex-1 overflow-x-auto overflow-y-hidden relative"
        onPointerDown={handleScrubStart}
        onClick={handleTrackBgClick}
        onMouseMove={handleMouseMove}
        onWheel={handleTimelineWheel}
        style={{ cursor: scrubbing ? "grabbing" : "default" }}
      >
        <div className="relative" style={{ width: totalWidth, minWidth: "100%" }}>

          {/* ── PLAYHEAD — red line + triangle, clipped to track area ── */}
          {playheadPx <= LABEL_W + clipContentWidth && (
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
          )}

          {/* End marker removed — timeline ends naturally where content ends */}

          {/* ── Snap guides ── */}
          {snapGuides.map((x, i) => (
            <div
              key={i}
              className="absolute z-25 pointer-events-none"
              style={{
                left: x, top: 0, bottom: 0, width: 0,
                borderLeft: `1px dashed ${SNAP_GUIDE_COLOR}`,
                opacity: 0.6,
              }}
            />
          ))}

          {/* ── Ruler ── */}
          <Ruler duration={effectiveDuration} clipContentWidth={clipContentWidth} />

          {/* ── Caption track ── */}
          <div
            className="flex items-stretch"
            style={{ height: TRACK_H, borderBottom: `1px solid ${TRACK_SEPARATOR}` }}
            onPointerDown={(e) => { if (e.button === 2) e.stopPropagation(); }}
            onContextMenu={(e) => {
              e.preventDefault(); e.stopPropagation();
              const rect = e.currentTarget.querySelector("[data-track-content]")?.getBoundingClientRect();
              if (rect) {
                const x = e.clientX - rect.left;
                const clickTime = (x / clipContentWidth) * effectiveDuration;
                const seg = captionSegs.find((s) => clickTime >= s.startSec && clickTime <= s.endSec);
                if (seg) {
                  handleSegSelect("cap", seg.id);
                  setContextMenu({ x: e.clientX, y: e.clientY, track: "cap", segId: seg.id });
                }
              }
            }}
          >
            <div
              className="shrink-0 flex items-center gap-1 px-2 z-10"
              style={{ width: LABEL_W, position: "sticky", left: 0, background: TIMELINE_BG, borderRight: `1px solid ${TRACK_SEPARATOR}` }}
            >
              <span className="text-[12px] text-muted-foreground font-medium">Caption</span>
            </div>
            <div data-track-content className="flex-1 relative" style={{ minWidth: clipContentWidth + END_PADDING }}>
              {captionSegs.map((seg) => (
                <SegmentBlock
                  key={seg.id} seg={seg} trackColor={TRACK_COLORS.cap}
                  duration={effectiveDuration} timelineWidth={clipContentWidth}
                  selected={selectedSegIds.has(seg.id) && selectedTrack === "cap"}
                  onSelect={(id, e) => handleSegSelect("cap", id, e)}
                  onResize={handleCaptionResize}
                  onResizeEnd={handleCaptionResizeEnd}
                  onDrag={handleCaptionDrag}
                  rippleAnimating={rippleAnimating}
                />
              ))}
            </div>
          </div>

          {/* ── Subtitle track ── */}
          <div
            className="flex items-stretch"
            style={{ height: TRACK_H, borderBottom: `1px solid ${TRACK_SEPARATOR}` }}
            onPointerDown={(e) => { if (e.button === 2) e.stopPropagation(); }}
            onContextMenu={(e) => {
              e.preventDefault(); e.stopPropagation();
              const rect = e.currentTarget.querySelector("[data-track-content]")?.getBoundingClientRect();
              if (rect) {
                const x = e.clientX - rect.left;
                const clickTime = (x / clipContentWidth) * effectiveDuration;
                const seg = editSegments.find((s) => clickTime >= s.startSec && clickTime <= s.endSec);
                if (seg) {
                  handleSegSelect("sub", seg.id);
                  setContextMenu({ x: e.clientX, y: e.clientY, track: "sub", segId: seg.id });
                }
              }
            }}
          >
            <div
              className="shrink-0 flex items-center gap-1 px-2 z-10"
              style={{ width: LABEL_W, position: "sticky", left: 0, background: TIMELINE_BG, borderRight: `1px solid ${TRACK_SEPARATOR}` }}
            >
              <span className="text-[12px] text-muted-foreground font-medium">Subtitle</span>
            </div>
            <div data-track-content className="flex-1 relative" style={{ minWidth: clipContentWidth + END_PADDING }}>
              {(() => {
                const visibleSubs = editSegments;
                // No clustering — always render subs individually. Zoom controls density.
                return (<>
                  {visibleSubs.map((seg) => (
                    <SegmentBlock
                      key={seg.id} seg={seg} trackColor={TRACK_COLORS.sub}
                      duration={effectiveDuration} timelineWidth={clipContentWidth}
                      selected={selectedSegIds.has(seg.id) && selectedTrack === "sub"}
                      onSelect={(id, e) => handleSegSelect("sub", id, e)}
                      onResize={(id, start, end) => handleSubtitleResize(id, start, end)}
                      onResizeEnd={handleSubtitleResizeEnd}
                      onDrag={handleSubtitleDrag}
                      onDragEnd={handleSubtitleDragEnd}
                      rippleAnimating={rippleAnimating}
                    />
                  ))}
                  {/* Phantom right portions during middle-case drag */}
                  {dragPhantoms.map((phantom, i) => {
                    // Phantom positions are source-absolute — convert to timeline for rendering
                    const tlStart = sourceToTimeline(phantom.startSec, nleSegments);
                    const tlEnd = sourceToTimeline(phantom.endSec, nleSegments);
                    const pStartSec = tlStart.found ? tlStart.timelineTime : 0;
                    const pEndSec = tlEnd.found ? tlEnd.timelineTime : pStartSec;
                    const pLeft = effectiveDuration > 0 ? (pStartSec / effectiveDuration) * clipContentWidth : 0;
                    const pWidth = effectiveDuration > 0 ? ((pEndSec - pStartSec) / effectiveDuration) * clipContentWidth : 0;
                    return (
                      <div
                        key={`phantom-${i}`}
                        className="absolute top-1 bottom-1 pointer-events-none"
                        style={{
                          left: pLeft,
                          width: Math.max(pWidth, 4),
                          background: TRACK_COLORS.sub.bg,
                          border: `1.5px dashed ${TRACK_COLORS.sub.border}`,
                          borderRadius: SEGMENT_RADIUS,
                          opacity: 0.6,
                        }}
                      >
                        <div className="absolute inset-0 flex items-center px-2 select-none overflow-hidden">
                          <span className="text-[10px] font-medium truncate" style={{ color: TRACK_COLORS.sub.text }}>
                            {phantom.text}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </>);
              })()}
            </div>
          </div>

          {/* ── Audio track ── */}
          <div
            className="flex items-stretch"
            style={{ height: AUDIO_TRACK_H, borderBottom: `1px solid ${TRACK_SEPARATOR}` }}
            onPointerDown={(e) => { if (e.button === 2) e.stopPropagation(); }}
          >
            <div
              className="shrink-0 flex items-center gap-1 px-2 z-10"
              style={{ width: LABEL_W, position: "sticky", left: 0, background: TIMELINE_BG, borderRight: `1px solid ${TRACK_SEPARATOR}` }}
            >
              <span className="text-[12px] text-muted-foreground font-medium">Audio</span>
            </div>
            <div className="flex-1 relative" style={{ minWidth: clipContentWidth + END_PADDING }}>
              {nleSegments.map((seg) => {
                const range = getSegmentTimelineRange(seg.id, nleSegments);
                if (!range) return null;
                const leftPx = effectiveDuration > 0 ? (range.start / effectiveDuration) * clipContentWidth : 0;
                const segDur = seg.sourceEnd - seg.sourceStart;
                const widthPx = effectiveDuration > 0 ? (segDur / effectiveDuration) * clipContentWidth : 0;
                return (
                  <div key={seg.id} className="absolute top-0 bottom-0" style={{
                    left: leftPx, width: Math.max(widthPx, 4),
                    transition: rippleAnimating ? `left ${RIPPLE_ANIM_MS}ms cubic-bezier(0.25,0.1,0.25,1)` : "none",
                  }}>
                    <WaveformTrack
                      peaks={waveformPeaks}
                      error={waveformError}
                      clipFileDuration={sourceDuration || clipFileDuration || duration}
                      clipOrigin={0}
                      sourceDuration={sourceDuration}
                      timelineWidth={widthPx} currentTime={currentTime}
                      selected={selectedSegIds.has(seg.id) && selectedTrack === "audio"}
                      onSelect={() => handleSegSelect("audio", seg.id)}
                      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, track: "audio", segId: seg.id }); }}
                      nleSegment={seg}
                      onTrimLeft={handleNleTrimLeft}
                      onTrimRight={handleNleTrimRight}
                      onTrimStart={() => setTrimSnapshot(rawEffectiveDuration)}
                      onTrimEnd={() => setTrimSnapshot(null)}
                      rippleAnimating={rippleAnimating}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Additional audio track (empty placeholder) ── */}
          <div
            className="flex items-stretch"
            style={{ height: TRACK_H, borderBottom: `1px solid ${TRACK_SEPARATOR}` }}
          >
            <div
              className="shrink-0 flex items-center gap-1 px-2 z-10"
              style={{ width: LABEL_W, position: "sticky", left: 0, background: TIMELINE_BG, borderRight: `1px solid ${TRACK_SEPARATOR}` }}
            >
              <span className="text-[12px] text-muted-foreground/40 font-medium">Audio 2</span>
            </div>
            <div className="flex-1 relative flex items-center" style={{ minWidth: clipContentWidth + END_PADDING }}>
              <button className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 flex items-center gap-1.5 transition-colors ml-3">
                <Music className="h-3 w-3" /> Drop audio or click to add
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Context menu ── */}
      {contextMenu && (
        <TrackContextMenu
          x={contextMenu.x} y={contextMenu.y}
          track={contextMenu.track}
          onClose={() => setContextMenu(null)}
          onSplit={() => {
            const time = usePlaybackStore.getState().currentTime;
            if (contextMenu.track === "cap") {
              const newId = splitCaptionAtPlayhead(time);
              if (newId) { setSelectedTrack("cap"); setSelectedSegIds(new Set([newId])); }
            } else if (contextMenu.track === "sub") {
              splitSegment(time);
              const newActiveId = useSubtitleStore.getState().activeSegId;
              if (newActiveId) { setSelectedTrack("sub"); setSelectedSegIds(new Set([newActiveId])); }
            } else if (contextMenu.track === "audio") {
              splitAtTimeline(time);
            }
          }}
          onRippleDelete={() => handleDelete(true, contextMenu.track, contextMenu.segId)}
          onDelete={() => handleDelete(false, contextMenu.track, contextMenu.segId)}
          onDuplicate={() => { /* TODO */ }}
          onDeleteWithAudio={() => {
            // Delete the subtitle/caption AND the overlapping NLE segment
            const track = contextMenu.track;
            const segId = contextMenu.segId;
            // Find the subtitle/caption segment to get its time range (timeline coords)
            let seg;
            if (track === "sub") {
              seg = editSegments.find(s => s.id === segId);
            } else if (track === "cap") {
              seg = captionSegs.find(s => s.id === segId);
            }
            if (!seg) return;

            // Find overlapping NLE segment(s) in timeline space
            const overlappingNle = nleSegments.filter(nleSeg => {
              const range = getSegmentTimelineRange(nleSeg.id, nleSegments);
              return range && range.start < seg.endSec && range.end > seg.startSec;
            });

            // Delete the subtitle/caption first
            if (track === "sub") {
              rippleDeleteSegment(segId);
            } else if (track === "cap") {
              rippleDeleteCaptionSegment(segId);
            }

            // Then delete matching NLE segments and their overlapping subtitles
            overlappingNle.forEach(nleSeg => {
              const range = getSegmentTimelineRange(nleSeg.id, nleSegments);
              if (range) {
                const subStore = useSubtitleStore.getState();
                const mappedSubs = subStore.getTimelineMappedSegments();
                const overlappingSubs = mappedSubs.filter(
                  s => s.startSec >= range.start && s.endSec <= range.end && s.id !== segId
                );
                overlappingSubs.forEach(s => subStore.rippleDeleteSegment(s.id));
              }
              deleteNleSegment(nleSeg.id);
            });

            setSelectedTrack(null);
            setSelectedSegIds(new Set());
          }}
        />
      )}
    </div>
  );
}
