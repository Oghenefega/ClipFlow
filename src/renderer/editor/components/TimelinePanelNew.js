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
// Minimum pill width (px) below which pills merge into one continuous bar
const MERGE_THRESHOLD = 30;
const RULER_H = 24;
const TRACK_H = 44;
const AUDIO_TRACK_H = 64;
const LABEL_W = 84;
const END_PADDING = 200; // px of empty space after the clip ends

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

// ── Audio Context Menu ──
function AudioContextMenu({ x, y, onClose, onDelete, onCreateClip, onDuplicate }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed rounded-lg border bg-popover shadow-xl z-[100] overflow-hidden w-[200px]"
      style={{ left: x, top: y }}
    >
      <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors" onClick={() => { onDelete(); onClose(); }}>
        <Trash2 className="h-3.5 w-3.5 text-red-400" /> Delete scene
      </button>
      <Separator />
      <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors" onClick={() => { onCreateClip(); onClose(); }}>
        <FilePlus className="h-3.5 w-3.5 text-green-400" /> Create as new clip
      </button>
      <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors" onClick={() => { onDuplicate(); onClose(); }}>
        <Copy className="h-3.5 w-3.5 text-blue-400" /> Duplicate original video
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
function WaveformTrack({ peaks, duration, timelineWidth, currentTime, selected, onSelect, onContextMenu, audioSeg, onResize }) {
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

    // Normalize peaks relative to loudest
    const maxPeak = Math.max(...peaks, 0.01);
    const centerY = h / 2;
    const maxAmp = h * 0.45; // max half-height

    // Resample peaks to match pixel width for smooth polygon
    const pointCount = Math.min(peaks.length, Math.floor(w));
    if (pointCount <= 0) return; // Guard: no points to draw if width is 0
    const samplesPerPoint = peaks.length / pointCount;

    // Build points array with normalized amplitudes
    const points = [];
    for (let i = 0; i < pointCount; i++) {
      const sampleIdx = Math.floor(i * samplesPerPoint);
      const endIdx = Math.min(Math.floor((i + 1) * samplesPerPoint), peaks.length);
      // Take max in this bucket for peak representation
      let max = 0;
      for (let j = sampleIdx; j < endIdx; j++) {
        if (peaks[j] > max) max = peaks[j];
      }
      const normalized = max / maxPeak;
      // Power curve to boost quiet sections
      const amp = Math.pow(normalized, 0.65) * maxAmp;
      points.push({ x: (i / pointCount) * w, amp: Math.max(1, amp) });
    }

    // Draw filled polygon — mirrored waveform (like a pro DAW)
    if (points.length === 0) return;
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
  }, [peaks, timelineWidth, selected]);

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

  const captionText = useCaptionStore((s) => s.captionText);
  const captionStartSec = useCaptionStore((s) => s.captionStartSec);
  const captionEndSec = useCaptionStore((s) => s.captionEndSec);
  const setCaptionStartSec = useCaptionStore((s) => s.setCaptionStartSec);
  const setCaptionEndSec = useCaptionStore((s) => s.setCaptionEndSec);

  const tlCollapsed = useLayoutStore((s) => s.tlCollapsed);
  const tlZoom = useLayoutStore((s) => s.tlZoom);
  const toggleTlCollapse = useLayoutStore((s) => s.toggleTlCollapse);
  const setTlZoom = useLayoutStore((s) => s.setTlZoom);

  const waveformPeaks = useEditorStore((s) => s.waveformPeaks);

  // Local state
  const [speedOpen, setSpeedOpen] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [selectedSegId, setSelectedSegId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [audioStartSec, setAudioStartSec] = useState(0);
  const [audioEndSec, setAudioEndSec] = useState(null); // null = full duration

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
  }, []);

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

  // Caption segments (resizable via store)
  const captionSegs = useMemo(() => {
    if (!captionText) return [];
    return [{ id: "cap-1", text: captionText, startSec: captionStartSec, endSec: captionEndSec ?? duration }];
  }, [captionText, captionStartSec, captionEndSec, duration]);

  // Audio segment (resizable via local state)
  const audioSeg = useMemo(() => {
    return { id: "audio-1", startSec: audioStartSec, endSec: audioEndSec ?? duration };
  }, [audioStartSec, audioEndSec, duration]);

  // Caption resize handler
  const handleCaptionResize = useCallback((id, newStart, newEnd) => {
    setCaptionStartSec(Math.max(0, newStart));
    setCaptionEndSec(Math.min(duration, newEnd));
  }, [duration, setCaptionStartSec, setCaptionEndSec]);

  // Audio resize handler
  const handleAudioResize = useCallback((id, newStart, newEnd) => {
    setAudioStartSec(Math.max(0, newStart));
    setAudioEndSec(Math.min(duration, newEnd));
  }, [duration]);

  // Determine if pills should merge (Vizard-style): when average pill width < MERGE_THRESHOLD
  const shouldMerge = useMemo(() => {
    if (!editSegments || editSegments.length === 0 || duration <= 0) return false;
    const avgPillWidth = clipContentWidth / editSegments.length;
    return avgPillWidth < MERGE_THRESHOLD;
  }, [editSegments, clipContentWidth, duration]);

  // Segment selection handler
  const handleSegSelect = useCallback((track, segId) => {
    setSelectedTrack(track);
    setSelectedSegId(segId);
    if (track === "sub") setActiveSegId(segId);
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
        splitSegment();
      } else if ((e.ctrlKey || e.metaKey) && e.key === ".") {
        e.preventDefault();
        toggleTlCollapse();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, splitSegment, toggleTlCollapse]);

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
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={splitSegment}>
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

          {/* ── Ruler row ── */}
          <div
            className="flex items-stretch border-b border-border/60"
            style={{ height: RULER_H }}
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
          <div className="flex items-stretch border-b border-border/40" style={{ height: TRACK_H }}>
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
          <div className="flex items-stretch border-b border-border/40" style={{ height: TRACK_H }}>
            <div className="shrink-0 flex items-center gap-1.5 px-2.5 border-r border-border/30 bg-card z-10" style={{ width: LABEL_W, position: "sticky", left: 0 }}>
              <span className="text-[9px] font-bold w-4 h-4 rounded flex items-center justify-center text-white" style={{ background: "hsl(120 60% 45%)" }}>S</span>
              <span className="text-xs text-muted-foreground font-medium">Subtitle</span>
            </div>
            <div className="flex-1 relative" style={{ width: clipContentWidth + END_PADDING }}>
              {shouldMerge ? (
                /* Zoom-merged: one continuous bar showing "Subtitle" */
                (() => {
                  const first = editSegments[0];
                  const last = editSegments[editSegments.length - 1];
                  if (!first || !last) return null;
                  const mergedSeg = { id: "merged-sub", text: "Subtitle", startSec: first.startSec, endSec: last.endSec };
                  return (
                    <SegmentBlock
                      seg={mergedSeg} trackColor={TRACK_COLORS.sub}
                      duration={duration} timelineWidth={clipContentWidth}
                      selected={selectedTrack === "sub"}
                      onSelect={() => handleSegSelect("sub", "merged-sub")}
                      onResize={() => {}}
                    />
                  );
                })()
              ) : (
                editSegments.map((seg) => (
                  <SegmentBlock
                    key={seg.id} seg={seg} trackColor={TRACK_COLORS.sub}
                    duration={duration} timelineWidth={clipContentWidth}
                    selected={selectedTrack === "sub" && selectedSegId === seg.id}
                    onSelect={(id) => handleSegSelect("sub", id)}
                    onResize={(id, start, end) => handleSubtitleResize(id, start, end)}
                  />
                ))
              )}
            </div>
          </div>

          {/* ── Audio/Video track ── */}
          <div className="flex items-stretch border-b border-border/40" style={{ height: AUDIO_TRACK_H }}>
            <div className="shrink-0 flex items-center gap-1.5 px-2.5 border-r border-border/30 bg-card z-10" style={{ width: LABEL_W, position: "sticky", left: 0 }}>
              <span className="text-[9px] font-bold w-4 h-4 rounded flex items-center justify-center text-white" style={{ background: "hsl(25 90% 50%)" }}>♫</span>
              <span className="text-xs text-muted-foreground font-medium">Audio</span>
            </div>
            <div className="flex-1 relative" style={{ width: clipContentWidth + END_PADDING }}>
              <WaveformTrack
                peaks={waveformPeaks} duration={duration}
                timelineWidth={clipContentWidth} currentTime={currentTime}
                selected={selectedTrack === "audio"}
                onSelect={() => { setSelectedTrack("audio"); setSelectedSegId(null); }}
                onContextMenu={(e) => setContextMenu({ x: e.clientX, y: e.clientY })}
                audioSeg={audioSeg}
                onResize={handleAudioResize}
              />
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

      {/* Audio context menu */}
      {contextMenu && (
        <AudioContextMenu
          x={contextMenu.x} y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onDelete={() => { /* TODO */ }}
          onCreateClip={() => { /* TODO */ }}
          onDuplicate={() => { /* TODO */ }}
        />
      )}
    </div>
  );
}
