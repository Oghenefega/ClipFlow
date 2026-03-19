import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import usePlaybackStore from "../stores/usePlaybackStore";
import useSubtitleStore from "../stores/useSubtitleStore";
import useCaptionStore from "../stores/useCaptionStore";
import useLayoutStore from "../stores/useLayoutStore";
import useEditorStore from "../stores/useEditorStore";
import { fmtTime } from "../utils/timeUtils";
import {
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  Scissors,
  PanelBottomClose,
  PanelBottomOpen,
  Music,
  Trash2,
  Copy,
  FilePlus,
} from "lucide-react";
import { Slider } from "../../../components/ui/slider";
import { Button } from "../../../components/ui/button";
import { Separator } from "../../../components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip";

// ── Constants ──
const SPEED_OPTIONS = ["0.25x", "0.5x", "0.75x", "1x", "1.25x", "1.5x", "1.75x", "2x"];
const TRACK_COLORS = {
  cap: { bg: "hsl(263 70% 58% / 0.18)", border: "hsl(263 70% 58% / 0.6)", selected: "hsl(263 70% 58% / 0.4)", text: "hsl(263 70% 85%)" },
  sub: { bg: "hsl(120 60% 45% / 0.25)", border: "hsl(120 60% 50% / 0.6)", selected: "hsl(120 60% 45% / 0.4)", text: "hsl(120 60% 90%)" },
  audio: { bg: "transparent", border: "hsl(25 90% 55% / 0.4)", selected: "hsl(25 90% 55% / 0.15)", text: "hsl(25 90% 70%)" },
};
const RULER_H = 24;
const TRACK_H = 44;
const AUDIO_TRACK_H = 64;
const LABEL_W = 84;
const END_PADDING = 200; // px of empty space after the clip ends
const MERGE_THRESHOLD = 18; // px — if avg segment width < this, show merged bar

// ── Speed Dropdown ──
function SpeedDropdown({ value, onChange, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute bottom-full right-0 mb-1 w-[100px] rounded-lg border bg-popover shadow-xl z-50 overflow-hidden">
      {SPEED_OPTIONS.map((s) => (
        <button
          key={s}
          className={`w-full px-3 py-1.5 text-xs text-left transition-colors ${
            value === s ? "text-primary bg-primary/10" : "text-foreground hover:bg-secondary/60"
          }`}
          onClick={() => { onChange(s); onClose(); }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

// ── Track Context Menu (all tracks) ──
function TrackContextMenu({ x, y, track, onClose, onSplit, onDelete, onDuplicate }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const trackLabel = track === "cap" ? "caption" : track === "sub" ? "subtitle" : "scene";

  return (
    <div
      ref={ref}
      className="fixed rounded-lg border bg-popover shadow-xl z-[100] overflow-hidden w-[200px]"
      style={{ left: x, top: y }}
    >
      <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors" onClick={() => { onSplit(); onClose(); }}>
        <Scissors className="h-3.5 w-3.5 text-primary" /> Split at playhead
      </button>
      <Separator />
      {track === "audio" && (
        <>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors" onClick={() => { /* TODO */ onClose(); }}>
            <FilePlus className="h-3.5 w-3.5 text-green-400" /> Create as new clip
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors" onClick={() => { onDuplicate(); onClose(); }}>
            <Copy className="h-3.5 w-3.5 text-blue-400" /> Duplicate original video
          </button>
          <Separator />
        </>
      )}
      <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors" onClick={() => { onDelete(); onClose(); }}>
        <Trash2 className="h-3.5 w-3.5 text-red-400" /> Delete {trackLabel}
      </button>
    </div>
  );
}

// ── Segment Block (caption or subtitle) ──
function SegmentBlock({ seg, trackColor, duration, timelineWidth, selected, onSelect, onResize }) {
  const [resizing, setResizing] = useState(null);
  const [hovered, setHovered] = useState(false);
  const startRef = useRef({ x: 0, startSec: 0, endSec: 0 });

  const leftPx = duration > 0 ? (seg.startSec / duration) * timelineWidth : 0;
  const widthPx = duration > 0 ? ((seg.endSec - seg.startSec) / duration) * timelineWidth : 0;

  const onHandleDown = useCallback((side, e) => {
    e.stopPropagation();
    setResizing(side);
    startRef.current = { x: e.clientX, startSec: seg.startSec, endSec: seg.endSec };

    const onMove = (ev) => {
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
    };
    const onUp = () => {
      setResizing(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [seg, duration, timelineWidth, onResize]);

  // Border only on hover or selection
  const showBorder = selected || hovered;

  return (
    <div
      className="absolute top-1.5 bottom-1.5 rounded-md cursor-pointer group"
      style={{
        left: leftPx,
        width: Math.max(widthPx, 4),
        background: selected ? trackColor.selected : trackColor.bg,
        border: showBorder ? `2px solid ${selected ? trackColor.text : trackColor.border}` : "2px solid transparent",
        zIndex: selected ? 5 : 1,
        transition: resizing ? "none" : "background 0.15s, border-color 0.15s",
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(seg.id); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="absolute inset-0 flex items-center px-2.5 pointer-events-none select-none overflow-hidden"
      >
        <span
          className="text-[11px] font-medium truncate block w-full"
          style={{ color: trackColor.text }}
        >
          {seg.text}
        </span>
      </div>

      {showBorder && (
        <div
          className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize flex items-center justify-center z-10"
          onPointerDown={(e) => onHandleDown("left", e)}
        >
          <div className="w-1 h-4 rounded-full bg-white/60" />
        </div>
      )}
      {showBorder && (
        <div
          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize flex items-center justify-center z-10"
          onPointerDown={(e) => onHandleDown("right", e)}
        >
          <div className="w-1 h-4 rounded-full bg-white/60" />
        </div>
      )}
    </div>
  );
}

// ── Waveform Track — continuous filled polygon, NOT bars ──
function WaveformTrack({ peaks, duration, timelineWidth, currentTime, selected, onSelect, onContextMenu, audioSeg, onResize, segStartSec = 0, segEndSec }) {
  const canvasRef = useRef(null);
  const [resizing, setResizing] = useState(null);
  const [hovered, setHovered] = useState(false);
  const startRef = useRef({ x: 0, startSec: 0, endSec: 0 });

  const onHandleDown = useCallback((side, e) => {
    if (!audioSeg || !onResize) return;
    e.stopPropagation();
    setResizing(side);
    startRef.current = { x: e.clientX, startSec: audioSeg.startSec, endSec: audioSeg.endSec };

    const onMove = (ev) => {
      const dx = ev.clientX - startRef.current.x;
      const dtSec = duration > 0 ? (dx / timelineWidth) * duration : 0;
      let newStart = startRef.current.startSec;
      let newEnd = startRef.current.endSec;
      if (side === "left") {
        newStart = Math.max(0, Math.min(startRef.current.startSec + dtSec, newEnd - 0.1));
      } else {
        newEnd = Math.min(duration, Math.max(startRef.current.endSec + dtSec, newStart + 0.1));
      }
      onResize(audioSeg.id, newStart, newEnd);
    };
    const onUp = () => {
      setResizing(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [audioSeg, onResize, duration, timelineWidth]);

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

    // NEVER draw a fake/generic waveform. Only render real audio data.
    if (!peaks || peaks.length === 0) {
      ctx.fillStyle = "hsl(25 90% 55% / 0.4)";
      ctx.font = "10px 'DM Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Extracting waveform...", w / 2, h / 2 + 3);
      return;
    }

    // Slice peaks for this segment's time range
    const effectiveEnd = segEndSec ?? duration;
    const startFrac = duration > 0 ? segStartSec / duration : 0;
    const endFrac = duration > 0 ? effectiveEnd / duration : 1;
    const sliceStart = Math.floor(startFrac * peaks.length);
    const sliceEnd = Math.ceil(endFrac * peaks.length);
    const segPeaks = peaks.slice(sliceStart, sliceEnd);

    if (segPeaks.length === 0) return;

    // Normalize peaks relative to loudest in FULL clip (for consistent amplitude)
    const maxPeak = Math.max(...peaks, 0.01);
    const centerY = h / 2;
    const maxAmp = h * 0.45; // max half-height

    // Resample segment peaks to match pixel width for smooth polygon
    const pointCount = Math.min(segPeaks.length, Math.floor(w));
    if (pointCount <= 0) return;
    const samplesPerPoint = segPeaks.length / pointCount;

    // Build points array with normalized amplitudes
    const points = [];
    for (let i = 0; i < pointCount; i++) {
      const sampleIdx = Math.floor(i * samplesPerPoint);
      const endIdx = Math.min(Math.floor((i + 1) * samplesPerPoint), segPeaks.length);
      // Take max in this bucket for peak representation
      let max = 0;
      for (let j = sampleIdx; j < endIdx; j++) {
        if (segPeaks[j] > max) max = segPeaks[j];
      }
      const normalized = max / maxPeak;
      // Power curve to boost quiet sections
      const amp = Math.pow(normalized, 0.65) * maxAmp;
      points.push({ x: (i / pointCount) * w, amp: Math.max(1, amp) });
    }

    // Draw filled polygon — mirrored waveform (like a pro DAW)
    if (points.length === 0 || !points[0]) return;
    ctx.beginPath();
    // Top half (going left to right)
    ctx.moveTo(points[0].x, centerY - points[0].amp);
    for (let i = 1; i < points.length; i++) {
      // Use quadratic curves for smooth shape
      const prevPt = points[i - 1];
      const pt = points[i];
      const cpX = (prevPt.x + pt.x) / 2;
      ctx.quadraticCurveTo(prevPt.x, centerY - prevPt.amp, cpX, centerY - (prevPt.amp + pt.amp) / 2);
    }
    // End at last point top
    const lastPt = points[points.length - 1];
    ctx.lineTo(lastPt.x, centerY - lastPt.amp);

    // Bottom half (going right to left, mirrored)
    ctx.lineTo(lastPt.x, centerY + lastPt.amp);
    for (let i = points.length - 2; i >= 0; i--) {
      const nextPt = points[i + 1];
      const pt = points[i];
      const cpX = (nextPt.x + pt.x) / 2;
      ctx.quadraticCurveTo(nextPt.x, centerY + nextPt.amp, cpX, centerY + (nextPt.amp + pt.amp) / 2);
    }
    ctx.lineTo(points[0].x, centerY + points[0].amp);
    ctx.closePath();

    // Fill with semi-transparent color
    ctx.fillStyle = selected ? "hsl(25 90% 55% / 0.6)" : "hsl(25 90% 55% / 0.4)";
    ctx.fill();

    // Stroke outline for definition
    ctx.strokeStyle = selected ? "hsl(25 90% 58% / 0.8)" : "hsl(25 90% 55% / 0.55)";
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Draw center line
    ctx.strokeStyle = "hsl(25 90% 55% / 0.15)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(w, centerY);
    ctx.stroke();
  }, [peaks, timelineWidth, selected, duration, segStartSec, segEndSec]);

  const showHandles = selected || hovered;

  return (
    <div
      className={`relative h-full cursor-pointer rounded overflow-hidden ${
        selected ? "ring-1 ring-orange-400/40" : ""
      }`}
      style={{ width: timelineWidth, background: "transparent" }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      {showHandles && (
        <>
          <div
            className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize flex items-center justify-center z-10"
            onPointerDown={(e) => onHandleDown("left", e)}
          >
            <div className="w-1 h-4 rounded-full bg-white/60" />
          </div>
          <div
            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize flex items-center justify-center z-10"
            onPointerDown={(e) => onHandleDown("right", e)}
          >
            <div className="w-1 h-4 rounded-full bg-white/60" />
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Timeline Panel ──
export default function TimelinePanelNew() {
  // Store subscriptions
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

  const captionSegments = useCaptionStore((s) => s.captionSegments);
  const updateCaptionSegmentTimes = useCaptionStore((s) => s.updateCaptionSegmentTimes);
  const splitCaptionAtPlayhead = useCaptionStore((s) => s.splitCaptionAtPlayhead);
  const deleteCaptionSegment = useCaptionStore((s) => s.deleteCaptionSegment);

  const tlCollapsed = useLayoutStore((s) => s.tlCollapsed);
  const tlZoom = useLayoutStore((s) => s.tlZoom);
  const toggleTlCollapse = useLayoutStore((s) => s.toggleTlCollapse);
  const setTlZoom = useLayoutStore((s) => s.setTlZoom);

  const waveformPeaks = useEditorStore((s) => s.waveformPeaks);
  const audioSegments = useEditorStore((s) => s.audioSegments);
  const initAudioSegments = useEditorStore((s) => s.initAudioSegments);
  const splitAudioSegment = useEditorStore((s) => s.splitAudioSegment);
  const deleteAudioSegment = useEditorStore((s) => s.deleteAudioSegment);
  const resizeAudioSegment = useEditorStore((s) => s.resizeAudioSegment);

  // Local state
  const [speedOpen, setSpeedOpen] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [selectedSegId, setSelectedSegId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, track, segId }
  const [scrubbing, setScrubbing] = useState(false);

  // Initialize audio segment when duration becomes available
  useEffect(() => {
    if (duration > 0) initAudioSegments(duration);
  }, [duration, initAudioSegments]);

  // Single scroll container ref for ruler + all tracks
  const scrollRef = useRef(null);

  // Measure visible area width
  const trackAreaRef = useRef(null);
  const [trackAreaWidth, setTrackAreaWidth] = useState(600);

  useEffect(() => {
    if (!trackAreaRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTrackAreaWidth(entry.contentRect.width);
      }
    });
    observer.observe(trackAreaRef.current);
    return () => observer.disconnect();
  }, [tlCollapsed]); // re-attach when timeline expands/collapses

  // Available space for clip content (visible area minus label column)
  const visibleContentWidth = trackAreaWidth - LABEL_W;

  // Clip content width = visible area * zoom factor
  // At zoom 0.25 → clip takes 25% of visible → lots of room
  // At zoom 1.0 → clip fills visible area
  // At zoom 4.0 → clip is 4x wider, scrolls
  const clipContentWidth = visibleContentWidth * tlZoom;

  // Total scrollable width = label column + clip content + end padding
  const totalWidth = LABEL_W + clipContentWidth + END_PADDING;

  // Playhead pixel position
  const playheadPx = duration > 0 ? LABEL_W + (currentTime / duration) * clipContentWidth : LABEL_W;

  // Ruler tick marks
  const rulerTicks = useMemo(() => {
    if (duration <= 0) return [];
    const majorInterval = Math.max(0.5, Math.round((duration / (clipContentWidth / 60)) * 2) / 2);
    const ticks = [];
    for (let t = 0; t <= duration; t += majorInterval / 2) {
      const isMajor = Math.abs(t % majorInterval) < 0.01 || Math.abs(t % majorInterval - majorInterval) < 0.01;
      ticks.push({ time: t, px: LABEL_W + (t / duration) * clipContentWidth, major: isMajor });
    }
    return ticks;
  }, [duration, clipContentWidth]);

  // Scrub / seek — works on entire scroll container
  const handleScrub = useCallback((e) => {
    if (!scrollRef.current || duration <= 0) return;
    const rect = scrollRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollRef.current.scrollLeft - LABEL_W;
    if (x < 0) return;
    const t = Math.max(0, Math.min(duration, (x / clipContentWidth) * duration));
    seekTo(t);
  }, [duration, clipContentWidth, seekTo]);

  const handleScrubStart = useCallback((e) => {
    if (e.button !== 0) return; // Only left-click seeks
    setScrubbing(true);
    handleScrub(e);
  }, [handleScrub]);

  useEffect(() => {
    if (!scrubbing) return;
    const onMove = (e) => {
      if (!scrollRef.current || duration <= 0) return;
      const rect = scrollRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollRef.current.scrollLeft - LABEL_W;
      const t = Math.max(0, Math.min(duration, (x / clipContentWidth) * duration));
      seekTo(t);
    };
    const onUp = () => setScrubbing(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [scrubbing, duration, clipContentWidth, seekTo]);

  // Track click on empty area deselects
  const handleTrackBgClick = useCallback(() => {
    setSelectedTrack(null);
    setSelectedSegId(null);
  }, []);

  // Caption segments — resolve null endSec to duration for rendering
  const captionSegs = useMemo(() => {
    return captionSegments.map((seg) => ({
      ...seg,
      endSec: seg.endSec ?? duration,
    }));
  }, [captionSegments, duration]);

  // Caption resize handler — no neighbor pushing (overlap allowed)
  const handleCaptionResize = useCallback((id, newStart, newEnd) => {
    updateCaptionSegmentTimes(id, Math.max(0, newStart), Math.min(duration, newEnd));
  }, [duration, updateCaptionSegmentTimes]);

  // Audio resize and split use store actions directly
  const handleAudioResize = useCallback((id, newStart, newEnd) => {
    resizeAudioSegment(id, newStart, newEnd);
  }, [resizeAudioSegment]);

  // Segment selection handler
  const handleSegSelect = useCallback((track, segId) => {
    setSelectedTrack(track);
    setSelectedSegId(segId);
    if (track === "sub") setActiveSegId(segId);
    if (track === "cap") useCaptionStore.getState().setActiveCaptionId(segId);
  }, [setActiveSegId]);

  // Subtitle resize with neighbor pushing — prevents overlaps
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

  // Unified split — dispatches to the correct store based on selected track
  // If no track is selected, auto-detect: try caption first, then subtitle
  const handleSplit = useCallback(() => {
    const time = usePlaybackStore.getState().currentTime;
    let track = selectedTrack;

    // Auto-detect track if none selected — check which tracks have a segment at playhead
    if (!track) {
      const capSegsNow = useCaptionStore.getState().captionSegments;
      const hasCap = capSegsNow.some(s => {
        const end = s.endSec ?? Infinity;
        return time >= s.startSec + 0.01 && time <= end - 0.01;
      });
      const subSegsNow = useSubtitleStore.getState().editSegments;
      const hasSub = subSegsNow.some(s => time >= s.startSec + 0.01 && time <= s.endSec - 0.01);
      const hasAudio = audioSegments.some(s => time >= s.startSec + 0.01 && time <= s.endSec - 0.01);
      // Prefer subtitle split (more common), then audio, then caption
      if (hasSub) track = "sub";
      else if (hasAudio) track = "audio";
      else if (hasCap) track = "cap";
    }

    if (track === "cap") {
      const newId = splitCaptionAtPlayhead(time);
      if (newId) {
        setSelectedTrack("cap");
        setSelectedSegId(newId);
      }
    } else if (track === "audio") {
      splitAudioSegment(time);
    } else {
      // Default: split subtitle at playhead time
      splitSegment(time);
      // Sync local selectedSegId to store's activeSegId (set by splitSegment)
      const newActiveId = useSubtitleStore.getState().activeSegId;
      if (newActiveId) {
        setSelectedTrack("sub");
        setSelectedSegId(newActiveId);
      }
    }
  }, [selectedTrack, splitCaptionAtPlayhead, splitSegment, splitAudioSegment, audioSegments]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.key === " " && !e.ctrlKey && !e.metaKey) {
        if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
        e.preventDefault();
        togglePlay();
      } else if (e.key === "s" && !e.ctrlKey && !e.metaKey) {
        if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
        e.preventDefault();
        handleSplit();
      } else if ((e.ctrlKey || e.metaKey) && e.key === ".") {
        e.preventDefault();
        toggleTlCollapse();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
        // Delete selected segment
        if (selectedTrack === "cap" && selectedSegId) {
          e.preventDefault();
          deleteCaptionSegment(selectedSegId);
          setSelectedTrack(null);
          setSelectedSegId(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, handleSplit, toggleTlCollapse, selectedTrack, selectedSegId, deleteCaptionSegment]);

  // Anchor zoom to playhead — when zoom changes, adjust scroll so playhead stays in place
  const prevZoomRef = useRef(tlZoom);
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || duration <= 0 || prevZoomRef.current === tlZoom) {
      prevZoomRef.current = tlZoom;
      return;
    }
    const prevClipWidth = visibleContentWidth * prevZoomRef.current;
    const newClipWidth = clipContentWidth;
    const t = currentTime / duration;
    // Where was the playhead before and after zoom?
    const prevPlayheadX = LABEL_W + t * prevClipWidth;
    const newPlayheadX = LABEL_W + t * newClipWidth;
    // Keep the playhead at the same offset from the left edge of the viewport
    const viewOffset = prevPlayheadX - container.scrollLeft;
    container.scrollLeft = newPlayheadX - viewOffset;
    prevZoomRef.current = tlZoom;
  }, [tlZoom, duration, currentTime, clipContentWidth, visibleContentWidth]);

  // Smooth auto-scroll to keep playhead visible during playback
  const lastScrollRef = useRef(0);
  useEffect(() => {
    if (!playing || !scrollRef.current || duration <= 0) return;
    const container = scrollRef.current;
    const viewWidth = container.clientWidth;
    const playheadX = LABEL_W + (currentTime / duration) * clipContentWidth;
    const scrollLeft = container.scrollLeft;

    // Only scroll when playhead goes past 70% of visible area
    if (playheadX > scrollLeft + viewWidth * 0.7) {
      const target = playheadX - viewWidth * 0.3;
      // Smooth interpolation instead of jumping
      const current = container.scrollLeft;
      container.scrollLeft = current + (target - current) * 0.15;
    } else if (playheadX < scrollLeft + LABEL_W + 20) {
      const target = Math.max(0, playheadX - LABEL_W - 20);
      const current = container.scrollLeft;
      container.scrollLeft = current + (target - current) * 0.15;
    }
  }, [playing, currentTime, duration, clipContentWidth]);

  // Apply playback speed to video
  useEffect(() => {
    const videoRef = usePlaybackStore.getState().getVideoRef();
    if (videoRef?.current) {
      videoRef.current.playbackRate = parseFloat(tlSpeed) || 1;
    }
  }, [tlSpeed]);

  // ── Collapsed mode ──
  if (tlCollapsed) {
    return (
      <div className="flex items-center h-full bg-card select-none px-3 border-t">
        <div className="flex-1 flex items-center justify-center gap-3">
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
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="text-foreground">{fmtTime(currentTime)}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">{fmtTime(duration)}</span>
          </div>
        </div>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleTlCollapse(); }}>
                <PanelBottomOpen className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Show timeline (Ctrl+.)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  // Total height of all tracks + ruler
  const totalTrackHeight = RULER_H + TRACK_H + TRACK_H + AUDIO_TRACK_H + 32; // +32 for add audio row

  // ── Full timeline ──
  return (
    <div className="flex flex-col h-full bg-card select-none overflow-hidden">
      {/* Controls bar */}
      <div className="h-10 min-h-[40px] flex items-center px-3 border-b gap-2">
        {/* Left: Zoom controls */}
        <div className="flex items-center gap-1">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost" size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setTlZoom(Math.max(0.1, +(tlZoom - 0.25).toFixed(2)))}
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Zoom out</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="w-[100px]">
            <Slider
              value={[tlZoom * 100]}
              min={10}
              max={1000}
              step={10}
              onValueChange={([v]) => setTlZoom(v / 100)}
              className="flex-1"
            />
          </div>

          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost" size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setTlZoom(Math.min(10, +(tlZoom + 0.25).toFixed(2)))}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Zoom in</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Center: Play/Pause + timecodes */}
        <div className="flex-1 flex items-center justify-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="text-foreground">{fmtTime(currentTime)}</span>
          </div>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground" onClick={togglePlay}>
                  {playing ? <Pause className="h-4.5 w-4.5" /> : <Play className="h-4.5 w-4.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">{playing ? "Pause" : "Play"} (Space)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="text-muted-foreground">{fmtTime(duration)}</span>
          </div>
        </div>

        {/* Right: Split, Speed, Hide */}
        <div className="flex items-center gap-1">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={handleSplit}>
                  <Scissors className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Split (S)</TooltipContent>
            </Tooltip>

            <div className="relative">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground font-mono"
                    onClick={() => setSpeedOpen(!speedOpen)}
                  >
                    {tlSpeed}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Playback speed</TooltipContent>
              </Tooltip>
              {speedOpen && (
                <SpeedDropdown value={tlSpeed} onChange={setTlSpeed} onClose={() => setSpeedOpen(false)} />
              )}
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleTlCollapse(); }}>
                  <PanelBottomClose className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Hide timeline (Ctrl+.)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* ── Unified scroll container: ruler + tracks + playhead as ONE unit ── */}
      <div
        ref={(el) => { scrollRef.current = el; trackAreaRef.current = el; }}
        className="flex-1 overflow-x-auto overflow-y-hidden relative"
        onPointerDown={handleScrubStart}
        onClick={handleTrackBgClick}
        style={{ cursor: scrubbing ? "grabbing" : "default" }}
      >
        {/* Inner content — sets scroll width */}
        <div className="relative" style={{ width: totalWidth, minWidth: totalWidth, minHeight: "100%" }}>

          {/* ── SINGLE PLAYHEAD LINE — spans from ruler through all tracks ── */}
          <div
            className="absolute z-30 pointer-events-none"
            style={{
              left: playheadPx,
              top: 0,
              bottom: 0,
              transform: "translateX(-50%)",
            }}
          >
            {/* Triangle head at top */}
            <div
              className="absolute -top-0.5 left-1/2 -translate-x-1/2"
              style={{
                width: 0, height: 0,
                borderLeft: "5px solid transparent",
                borderRight: "5px solid transparent",
                borderTop: "6px solid hsl(263 70% 58%)",
              }}
            />
            {/* Vertical line — full height */}
            <div className="w-0.5 h-full bg-primary" />
          </div>

          {/* ── End marker line — vertical line at clip end ── */}
          <div
            className="absolute z-20 pointer-events-none"
            style={{
              left: LABEL_W + clipContentWidth,
              top: 0,
              bottom: 0,
              width: 2,
              background: "hsl(0 0% 40% / 0.5)",
            }}
          />

          {/* ── Ruler row ── */}
          <div
            className="flex items-stretch border-b border-border/60"
            style={{ height: RULER_H }}
            onPointerDown={(e) => { if (e.button === 2) e.stopPropagation(); }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* Ruler label area (matches track labels) */}
            <div
              className="shrink-0 bg-card z-10"
              style={{ width: LABEL_W, position: "sticky", left: 0 }}
            />
            {/* Tick marks */}
            <div className="relative flex-1" style={{ width: clipContentWidth + END_PADDING }}>
              {rulerTicks.map((tick, i) => {
                const x = tick.px - LABEL_W; // position relative to content area
                return (
                  <div
                    key={i}
                    className="absolute bottom-0 flex flex-col items-center"
                    style={{ left: x }}
                  >
                    {tick.major && (
                      <span className="text-[9px] font-mono text-muted-foreground/60 leading-none mb-0.5 -translate-x-1/2 whitespace-nowrap">
                        {tick.time < 60
                          ? `${tick.time.toFixed(tick.time % 1 === 0 ? 0 : 1)}s`
                          : fmtTime(tick.time)
                        }
                      </span>
                    )}
                    <div className="bg-border/60" style={{ width: 1, height: tick.major ? 8 : 4 }} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Caption track ── */}
          <div
            className="flex items-stretch border-b border-border/40"
            style={{ height: TRACK_H }}
            onPointerDown={(e) => { if (e.button === 2) e.stopPropagation(); }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Find which caption segment was right-clicked
              const rect = e.currentTarget.querySelector(".flex-1")?.getBoundingClientRect();
              if (rect) {
                const x = e.clientX - rect.left;
                const clickTime = (x / clipContentWidth) * duration;
                const seg = captionSegs.find((s) => clickTime >= s.startSec && clickTime <= s.endSec);
                if (seg) {
                  handleSegSelect("cap", seg.id);
                  setContextMenu({ x: e.clientX, y: e.clientY, track: "cap", segId: seg.id });
                }
              }
            }}
          >
            <div className="shrink-0 flex items-center gap-1.5 px-2.5 border-r border-border/30 bg-card z-10" style={{ width: LABEL_W, position: "sticky", left: 0 }}>
              <span className="text-[9px] font-bold w-4 h-4 rounded flex items-center justify-center text-white" style={{ background: "hsl(263 70% 58%)" }}>T</span>
              <span className="text-xs text-muted-foreground font-medium">Caption</span>
            </div>
            <div className="flex-1 relative" style={{ width: clipContentWidth + END_PADDING }}>
              {captionSegs.map((seg) => (
                <SegmentBlock
                  key={seg.id} seg={seg} trackColor={TRACK_COLORS.cap}
                  duration={duration} timelineWidth={clipContentWidth}
                  selected={selectedTrack === "cap" && selectedSegId === seg.id}
                  onSelect={(id) => handleSegSelect("cap", id)}
                  onResize={handleCaptionResize}
                />
              ))}
            </div>
          </div>

          {/* ── Subtitle track ── */}
          <div
            className="flex items-stretch border-b border-border/40"
            style={{ height: TRACK_H }}
            onPointerDown={(e) => { if (e.button === 2) e.stopPropagation(); }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const rect = e.currentTarget.querySelector(".flex-1")?.getBoundingClientRect();
              if (rect) {
                const x = e.clientX - rect.left;
                const clickTime = (x / clipContentWidth) * duration;
                const seg = editSegments.find((s) => clickTime >= s.startSec && clickTime <= s.endSec);
                if (seg) {
                  handleSegSelect("sub", seg.id);
                  setContextMenu({ x: e.clientX, y: e.clientY, track: "sub", segId: seg.id });
                }
              }
            }}
          >
            <div className="shrink-0 flex items-center gap-1.5 px-2.5 border-r border-border/30 bg-card z-10" style={{ width: LABEL_W, position: "sticky", left: 0 }}>
              <span className="text-[9px] font-bold w-4 h-4 rounded flex items-center justify-center text-white" style={{ background: "hsl(120 60% 45%)" }}>S</span>
              <span className="text-xs text-muted-foreground font-medium">Subtitle</span>
            </div>
            <div className="flex-1 relative" style={{ width: clipContentWidth + END_PADDING }}>
              {(() => {
                // Check if segments are too small to render individually — show merged bar
                if (editSegments.length > 1 && duration > 0) {
                  const avgWidth = editSegments.reduce((sum, s) => sum + ((s.endSec - s.startSec) / duration) * clipContentWidth, 0) / editSegments.length;
                  if (avgWidth < MERGE_THRESHOLD) {
                    // Merged view: single bar spanning all segments
                    const minStart = Math.min(...editSegments.map(s => s.startSec));
                    const maxEnd = Math.max(...editSegments.map(s => s.endSec));
                    const leftPx = (minStart / duration) * clipContentWidth;
                    const widthPx = ((maxEnd - minStart) / duration) * clipContentWidth;
                    return (
                      <div
                        className="absolute top-1.5 bottom-1.5 rounded-md cursor-pointer"
                        style={{
                          left: leftPx,
                          width: Math.max(widthPx, 4),
                          background: TRACK_COLORS.sub.bg,
                          border: `2px solid ${TRACK_COLORS.sub.border}`,
                        }}
                        onClick={(e) => { e.stopPropagation(); setSelectedTrack("sub"); }}
                      >
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                          <span className="text-[11px] font-medium" style={{ color: TRACK_COLORS.sub.text }}>
                            Subtitle ({editSegments.length})
                          </span>
                        </div>
                      </div>
                    );
                  }
                }
                // Normal view: individual segments
                return editSegments.map((seg) => (
                  <SegmentBlock
                    key={seg.id} seg={seg} trackColor={TRACK_COLORS.sub}
                    duration={duration} timelineWidth={clipContentWidth}
                    selected={selectedTrack === "sub" && selectedSegId === seg.id}
                    onSelect={(id) => handleSegSelect("sub", id)}
                    onResize={(id, start, end) => handleSubtitleResize(id, start, end)}
                  />
                ));
              })()}
            </div>
          </div>

          {/* ── Audio/Video track ── */}
          <div className="flex items-stretch border-b border-border/40" style={{ height: AUDIO_TRACK_H }} onPointerDown={(e) => { if (e.button === 2) e.stopPropagation(); }}>
            <div className="shrink-0 flex items-center gap-1.5 px-2.5 border-r border-border/30 bg-card z-10" style={{ width: LABEL_W, position: "sticky", left: 0 }}>
              <span className="text-[9px] font-bold w-4 h-4 rounded flex items-center justify-center text-white" style={{ background: "hsl(25 90% 50%)" }}>♫</span>
              <span className="text-xs text-muted-foreground font-medium">Audio</span>
            </div>
            <div className="flex-1 relative" style={{ width: clipContentWidth + END_PADDING }}>
              {audioSegments.map((seg) => {
                const leftPx = duration > 0 ? (seg.startSec / duration) * clipContentWidth : 0;
                const widthPx = duration > 0 ? ((seg.endSec - seg.startSec) / duration) * clipContentWidth : 0;
                return (
                  <div key={seg.id} className="absolute top-0 bottom-0" style={{ left: leftPx, width: Math.max(widthPx, 4) }}>
                    <WaveformTrack
                      peaks={waveformPeaks} duration={duration}
                      timelineWidth={widthPx} currentTime={currentTime}
                      selected={selectedTrack === "audio" && selectedSegId === seg.id}
                      onSelect={() => { setSelectedTrack("audio"); setSelectedSegId(seg.id); }}
                      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, track: "audio", segId: seg.id }); }}
                      audioSeg={seg}
                      onResize={handleAudioResize}
                      segStartSec={seg.startSec}
                      segEndSec={seg.endSec}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Add audio row ── */}
          <div className="flex items-center px-3 h-9">
            <button className="text-xs text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-1.5 transition-colors">
              <Music className="h-3.5 w-3.5" /> Add audio
            </button>
          </div>
        </div>
      </div>

      {/* Track context menu */}
      {contextMenu && (
        <TrackContextMenu
          x={contextMenu.x} y={contextMenu.y}
          track={contextMenu.track}
          onClose={() => setContextMenu(null)}
          onSplit={() => {
            const time = usePlaybackStore.getState().currentTime;
            if (contextMenu.track === "cap") {
              const newId = splitCaptionAtPlayhead(time);
              if (newId) { setSelectedTrack("cap"); setSelectedSegId(newId); }
            } else if (contextMenu.track === "sub") {
              splitSegment(time);
              const newActiveId = useSubtitleStore.getState().activeSegId;
              if (newActiveId) { setSelectedTrack("sub"); setSelectedSegId(newActiveId); }
            } else if (contextMenu.track === "audio") {
              splitAudioSegment(time);
            }
          }}
          onDelete={() => {
            if (contextMenu.track === "cap" && contextMenu.segId) {
              deleteCaptionSegment(contextMenu.segId);
              setSelectedTrack(null);
              setSelectedSegId(null);
            } else if (contextMenu.track === "sub" && contextMenu.segId) {
              useSubtitleStore.getState().deleteSegment(contextMenu.segId);
              setSelectedTrack(null);
              setSelectedSegId(null);
            } else if (contextMenu.track === "audio" && contextMenu.segId) {
              // Find the audio segment being deleted to know its time range
              const deletedSeg = audioSegments.find((s) => s.id === contextMenu.segId);
              deleteAudioSegment(contextMenu.segId);
              // Also delete overlapping subtitle segments
              if (deletedSeg) {
                const subStore = useSubtitleStore.getState();
                const overlapping = subStore.editSegments.filter(
                  (s) => s.startSec >= deletedSeg.startSec && s.endSec <= deletedSeg.endSec
                );
                overlapping.forEach((s) => subStore.deleteSegment(s.id));
              }
              setSelectedTrack(null);
              setSelectedSegId(null);
            }
          }}
          onDuplicate={() => { /* TODO */ }}
        />
      )}
    </div>
  );
}
