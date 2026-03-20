import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import usePlaybackStore from "../stores/usePlaybackStore";
import useSubtitleStore from "../stores/useSubtitleStore";
import useCaptionStore from "../stores/useCaptionStore";
import useLayoutStore from "../stores/useLayoutStore";
import useEditorStore from "../stores/useEditorStore";
import { fmtTime } from "../utils/timeUtils";
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
  MERGE_THRESHOLD, SEGMENT_RADIUS, RIPPLE_ANIM_MS, SNAP_THRESHOLD_PX,
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
  const tlSpeed = usePlaybackStore((s) => s.tlSpeed);
  const togglePlay = usePlaybackStore((s) => s.togglePlay);
  const seekTo = usePlaybackStore((s) => s.seekTo);
  const setTlSpeed = usePlaybackStore((s) => s.setTlSpeed);

  const editSegments = useSubtitleStore((s) => s.editSegments);
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
  const audioSegments = useEditorStore((s) => s.audioSegments);
  const initAudioSegments = useEditorStore((s) => s.initAudioSegments);
  const splitAudioSegment = useEditorStore((s) => s.splitAudioSegment);
  const deleteAudioSegment = useEditorStore((s) => s.deleteAudioSegment);
  const rippleDeleteAudioSegment = useEditorStore((s) => s.rippleDeleteAudioSegment);
  const resizeAudioSegment = useEditorStore((s) => s.resizeAudioSegment);
  const commitAudioResize = useEditorStore((s) => s.commitAudioResize);
  const maxExtendSec = useEditorStore((s) => s.maxExtendSec);
  const extending = useEditorStore((s) => s.extending);

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
  const scrubRafRef = useRef(null);
  const playheadRafRef = useRef(null);
  const [smoothTime, setSmoothTime] = useState(0);

  // Helper — first selected ID (for backwards compat with single-select APIs)
  const selectedSegId = useMemo(() => {
    const arr = Array.from(selectedSegIds);
    return arr.length > 0 ? arr[0] : null;
  }, [selectedSegIds]);

  // Initialize audio segment when duration becomes available
  useEffect(() => {
    if (duration > 0) initAudioSegments(duration);
  }, [duration, initAudioSegments]);

  // ── Smooth 60fps playhead via rAF loop ──
  // Reads video.currentTime directly instead of relying on Zustand's ~4Hz timeupdate
  useEffect(() => {
    if (!playing) {
      // When paused, sync smoothTime to the store's currentTime
      setSmoothTime(currentTime);
      if (playheadRafRef.current) cancelAnimationFrame(playheadRafRef.current);
      return;
    }
    const tick = () => {
      const videoRef = usePlaybackStore.getState().getVideoRef();
      if (videoRef?.current && !videoRef.current.paused) {
        setSmoothTime(videoRef.current.currentTime);
      }
      playheadRafRef.current = requestAnimationFrame(tick);
    };
    playheadRafRef.current = requestAnimationFrame(tick);
    return () => { if (playheadRafRef.current) cancelAnimationFrame(playheadRafRef.current); };
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

  // Effective duration: max of video duration and furthest audio segment end
  // This allows the timeline to grow when a clip is being extended
  const audioMaxEnd = audioSegments.length > 0
    ? Math.max(...audioSegments.map((s) => s.endSec))
    : 0;
  const effectiveDuration = Math.max(duration, audioMaxEnd);

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
    const t = Math.max(0, Math.min(effectiveDuration, (x / clipContentWidth) * effectiveDuration));
    seekTo(t); // seekTo already clamps to audio bounds
  }, [effectiveDuration, clipContentWidth, seekTo]);

  const handleScrubStart = useCallback((e) => {
    if (e.button !== 0) return;
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
        const t = Math.max(0, Math.min(effectiveDuration, (x / clipContentWidth) * effectiveDuration));
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

  // Track mouse position for zoom-to-cursor
  const handleMouseMove = useCallback((e) => {
    mouseXRef.current = e.clientX;
  }, []);

  // ── Deselect on empty area click ──
  const handleTrackBgClick = useCallback(() => {
    setSelectedTrack(null);
    setSelectedSegIds(new Set());
  }, []);

  // ── Caption segments — resolve null endSec ──
  const captionSegs = useMemo(() => {
    return captionSegments.map((seg) => ({ ...seg, endSec: seg.endSec ?? duration }));
  }, [captionSegments, duration]);

  // ── Resize handlers ──
  const handleCaptionResize = useCallback((id, newStart, newEnd) => {
    updateCaptionSegmentTimes(id, Math.max(0, newStart), Math.min(duration, newEnd));
  }, [duration, updateCaptionSegmentTimes]);

  // Drag (move) subtitle segment — updates startSec/endSec maintaining duration
  const handleSubtitleDrag = useCallback((segId, newStart, newEnd) => {
    updateSegmentTimes(segId, Math.max(0, newStart), Math.min(effectiveDuration, newEnd));
  }, [effectiveDuration, updateSegmentTimes]);

  // Drag (move) caption segment
  const handleCaptionDrag = useCallback((id, newStart, newEnd) => {
    updateCaptionSegmentTimes(id, Math.max(0, newStart), Math.min(duration, newEnd));
  }, [duration, updateCaptionSegmentTimes]);

  const handleAudioResize = useCallback((id, newStart, newEnd) => {
    resizeAudioSegment(id, newStart, newEnd);
  }, [resizeAudioSegment]);

  const handleSubtitleResize = useCallback((segId, newStart, newEnd) => {
    const sorted = [...editSegments].sort((a, b) => a.startSec - b.startSec);
    const idx = sorted.findIndex((s) => s.id === segId);
    if (idx < 0) return;
    const seg = sorted[idx];
    const prevSeg = idx > 0 ? sorted[idx - 1] : null;
    const nextSeg = idx < sorted.length - 1 ? sorted[idx + 1] : null;
    const minDur = 0.1;

    if (newStart !== seg.startSec) {
      newStart = Math.max(0, newStart);
      newStart = Math.min(newStart, newEnd - minDur);
      if (prevSeg && newStart < prevSeg.endSec) {
        const pushEnd = newStart;
        const pushStart = Math.max(0, Math.min(prevSeg.startSec, pushEnd - minDur));
        if (pushEnd - pushStart >= minDur) {
          updateSegmentTimes(prevSeg.id, pushStart, pushEnd);
        } else {
          newStart = prevSeg.endSec;
        }
      }
    }
    if (newEnd !== seg.endSec) {
      newEnd = Math.min(duration, newEnd);
      newEnd = Math.max(newEnd, newStart + minDur);
      if (nextSeg && newEnd > nextSeg.startSec) {
        const pushStart = newEnd;
        const pushEnd = Math.max(nextSeg.endSec, pushStart + minDur);
        const clampedEnd = Math.min(pushEnd, duration);
        if (clampedEnd - pushStart >= minDur) {
          updateSegmentTimes(nextSeg.id, pushStart, clampedEnd);
        } else {
          newEnd = nextSeg.startSec;
        }
      }
    }
    updateSegmentTimes(segId, newStart, newEnd);
  }, [editSegments, duration, updateSegmentTimes]);

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
    if (track === "sub") setActiveSegId(segId);
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
      const hasAudio = audioSegments.some(s => time >= s.startSec + 0.01 && time <= s.endSec - 0.01);
      if (hasSub) track = "sub";
      else if (hasAudio) track = "audio";
      else if (hasCap) track = "cap";
    }

    if (track === "cap") {
      const newId = splitCaptionAtPlayhead(time);
      if (newId) { setSelectedTrack("cap"); setSelectedSegIds(new Set([newId])); }
    } else if (track === "audio") {
      splitAudioSegment(time);
    } else {
      splitSegment(time);
      const newActiveId = useSubtitleStore.getState().activeSegId;
      if (newActiveId) { setSelectedTrack("sub"); setSelectedSegIds(new Set([newActiveId])); }
    }
  }, [selectedTrack, splitCaptionAtPlayhead, splitSegment, splitAudioSegment, audioSegments]);

  // ── Delete handler (ripple vs gap) ──
  const handleDelete = useCallback((isRipple, track, segId) => {
    if (!track || !segId) return;

    if (track === "cap") {
      isRipple ? rippleDeleteCaptionSegment(segId) : deleteCaptionSegment(segId);
    } else if (track === "sub") {
      isRipple ? rippleDeleteSegment(segId) : deleteSegment(segId);
    } else if (track === "audio") {
      const deletedSeg = audioSegments.find((s) => s.id === segId);
      isRipple ? rippleDeleteAudioSegment(segId) : deleteAudioSegment(segId);
      // Also delete overlapping subtitle segments
      if (deletedSeg) {
        const subStore = useSubtitleStore.getState();
        const overlapping = subStore.editSegments.filter(
          (s) => s.startSec >= deletedSeg.startSec && s.endSec <= deletedSeg.endSec
        );
        overlapping.forEach((s) => isRipple ? subStore.rippleDeleteSegment(s.id) : subStore.deleteSegment(s.id));
      }
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
    rippleDeleteAudioSegment, deleteAudioSegment, audioSegments,
  ]);

  // ── Batch delete for multi-select ──
  const handleBatchDelete = useCallback((isRipple) => {
    if (selectedSegIds.size === 0 || !selectedTrack) return;
    // Sort by startSec descending to avoid cascading offset issues during ripple
    let segs;
    if (selectedTrack === "sub") segs = editSegments;
    else if (selectedTrack === "cap") segs = captionSegs;
    else segs = audioSegments;

    const toDelete = segs
      .filter(s => selectedSegIds.has(s.id))
      .sort((a, b) => b.startSec - a.startSec);

    toDelete.forEach(s => handleDelete(isRipple, selectedTrack, s.id));
  }, [selectedSegIds, selectedTrack, editSegments, captionSegs, audioSegments, handleDelete]);

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
              value={[Math.round(50 + (Math.log2(tlZoom) / Math.log2(20)) * 50)]}
              min={0} max={100} step={1}
              onValueChange={([v]) => {
                // Map slider 0-100 to zoom: 50=1.0x, 0=0.05x, 100=20x (log scale)
                const t = (v - 50) / 50; // -1 to +1
                const zoom = Math.pow(20, t); // 20^-1=0.05 → 20^0=1 → 20^1=20
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
          <span className="text-[11px] font-mono text-muted-foreground tabular-nums">{fmtTime(duration)}</span>
          {extending && (
            <span className="text-[10px] text-yellow-400 ml-2 animate-pulse">Extending clip...</span>
          )}
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
              <span className="text-[8px] font-bold w-3.5 h-3.5 rounded flex items-center justify-center text-white" style={{ background: TRACK_COLORS.cap.badge }}>T</span>
              <span className="text-[10px] text-muted-foreground font-medium">Caption</span>
            </div>
            <div data-track-content className="flex-1 relative" style={{ minWidth: clipContentWidth + END_PADDING }}>
              {captionSegs.map((seg) => {
                // Visually clamp to audio boundary during drag (non-destructive)
                const clampedSeg = audioMaxEnd > 0 && seg.endSec > audioMaxEnd
                  ? { ...seg, endSec: Math.max(seg.startSec + 0.05, audioMaxEnd) }
                  : seg;
                // Hide segments fully past audio boundary
                if (audioMaxEnd > 0 && seg.startSec >= audioMaxEnd) return null;
                return (
                  <SegmentBlock
                    key={seg.id} seg={clampedSeg} trackColor={TRACK_COLORS.cap}
                    duration={effectiveDuration} timelineWidth={clipContentWidth}
                    selected={selectedSegIds.has(seg.id) && selectedTrack === "cap"}
                    onSelect={(id, e) => handleSegSelect("cap", id, e)}
                    onResize={handleCaptionResize}
                    onDrag={handleCaptionDrag}
                    rippleAnimating={rippleAnimating}
                  />
                );
              })}
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
              <span className="text-[8px] font-bold w-3.5 h-3.5 rounded flex items-center justify-center text-white" style={{ background: TRACK_COLORS.sub.badge }}>S</span>
              <span className="text-[10px] text-muted-foreground font-medium">Subtitle</span>
            </div>
            <div data-track-content className="flex-1 relative" style={{ minWidth: clipContentWidth + END_PADDING }}>
              {(() => {
                // Visually clamp subtitles to audio boundary
                const visibleSubs = audioMaxEnd > 0
                  ? editSegments
                      .filter((s) => s.startSec < audioMaxEnd)
                      .map((s) => s.endSec > audioMaxEnd ? { ...s, endSec: Math.max(s.startSec + 0.05, audioMaxEnd) } : s)
                  : editSegments;

                if (visibleSubs.length > 1 && effectiveDuration > 0) {
                  const avgWidth = visibleSubs.reduce((sum, s) => sum + ((s.endSec - s.startSec) / effectiveDuration) * clipContentWidth, 0) / visibleSubs.length;
                  if (avgWidth < MERGE_THRESHOLD) {
                    const minStart = Math.min(...visibleSubs.map(s => s.startSec));
                    const maxEnd = Math.min(Math.max(...visibleSubs.map(s => s.endSec)), audioMaxEnd > 0 ? audioMaxEnd : Infinity);
                    const leftPx = (minStart / effectiveDuration) * clipContentWidth;
                    const widthPx = ((maxEnd - minStart) / effectiveDuration) * clipContentWidth;
                    return (
                      <div
                        className="absolute top-1 bottom-1 cursor-pointer"
                        style={{
                          left: leftPx, width: Math.max(widthPx, 4),
                          background: TRACK_COLORS.sub.bg,
                          border: `1.5px solid ${TRACK_COLORS.sub.border}`,
                          borderRadius: SEGMENT_RADIUS,
                        }}
                        onClick={(e) => { e.stopPropagation(); setSelectedTrack("sub"); }}
                      >
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                          <span className="text-[10px] font-medium" style={{ color: TRACK_COLORS.sub.text }}>
                            Subtitle ({visibleSubs.length})
                          </span>
                        </div>
                      </div>
                    );
                  }
                }
                return visibleSubs.map((seg) => (
                  <SegmentBlock
                    key={seg.id} seg={seg} trackColor={TRACK_COLORS.sub}
                    duration={effectiveDuration} timelineWidth={clipContentWidth}
                    selected={selectedSegIds.has(seg.id) && selectedTrack === "sub"}
                    onSelect={(id, e) => handleSegSelect("sub", id, e)}
                    onResize={(id, start, end) => handleSubtitleResize(id, start, end)}
                    onDrag={handleSubtitleDrag}
                    rippleAnimating={rippleAnimating}
                  />
                ));
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
              <span className="text-[8px] font-bold w-3.5 h-3.5 rounded flex items-center justify-center text-white" style={{ background: TRACK_COLORS.audio.badge }}>&#9835;</span>
              <span className="text-[10px] text-muted-foreground font-medium">Audio</span>
            </div>
            <div className="flex-1 relative" style={{ minWidth: clipContentWidth + END_PADDING }}>
              {audioSegments.map((seg) => {
                const leftPx = effectiveDuration > 0 ? (seg.startSec / effectiveDuration) * clipContentWidth : 0;
                const widthPx = effectiveDuration > 0 ? ((seg.endSec - seg.startSec) / effectiveDuration) * clipContentWidth : 0;
                return (
                  <div key={seg.id} className="absolute top-0 bottom-0" style={{
                    left: leftPx, width: Math.max(widthPx, 4),
                    transition: rippleAnimating ? `left ${RIPPLE_ANIM_MS}ms cubic-bezier(0.25,0.1,0.25,1)` : "none",
                  }}>
                    <WaveformTrack
                      peaks={waveformPeaks} duration={effectiveDuration}
                      timelineWidth={widthPx} currentTime={currentTime}
                      selected={selectedSegIds.has(seg.id) && selectedTrack === "audio"}
                      onSelect={() => handleSegSelect("audio", seg.id)}
                      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, track: "audio", segId: seg.id }); }}
                      audioSeg={seg} onResize={handleAudioResize} onResizeEnd={commitAudioResize}
                      maxExtendSec={maxExtendSec}
                      segStartSec={seg.startSec} segEndSec={seg.endSec}
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
              <span className="text-[8px] font-bold w-3.5 h-3.5 rounded flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.25)" }}>&#9835;</span>
              <span className="text-[10px] text-muted-foreground/40 font-medium">Audio 2</span>
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
              splitAudioSegment(time);
            }
          }}
          onRippleDelete={() => handleDelete(true, contextMenu.track, contextMenu.segId)}
          onDelete={() => handleDelete(false, contextMenu.track, contextMenu.segId)}
          onDuplicate={() => { /* TODO */ }}
          onDeleteWithAudio={() => {
            // Delete the subtitle/caption AND the overlapping audio segment
            const track = contextMenu.track;
            const segId = contextMenu.segId;
            // Find the subtitle/caption segment to get its time range
            let seg;
            if (track === "sub") {
              seg = editSegments.find(s => s.id === segId);
            } else if (track === "cap") {
              seg = captionSegs.find(s => s.id === segId);
            }
            if (!seg) return;

            // Find overlapping audio segment(s) that contain this subtitle's time range
            const overlappingAudio = audioSegments.filter(
              a => a.startSec < seg.endSec && a.endSec > seg.startSec
            );

            // Delete the subtitle/caption first
            if (track === "sub") {
              rippleDeleteSegment(segId);
            } else if (track === "cap") {
              rippleDeleteCaptionSegment(segId);
            }

            // Then ripple-delete matching audio segments and their overlapping subtitles
            overlappingAudio.forEach(a => {
              // Delete subtitles within this audio segment
              const subStore = useSubtitleStore.getState();
              const overlappingSubs = subStore.editSegments.filter(
                s => s.startSec >= a.startSec && s.endSec <= a.endSec && s.id !== segId
              );
              overlappingSubs.forEach(s => subStore.rippleDeleteSegment(s.id));
              // Delete the audio segment
              rippleDeleteAudioSegment(a.id);
            });

            setSelectedTrack(null);
            setSelectedSegIds(new Set());
          }}
        />
      )}
    </div>
  );
}
