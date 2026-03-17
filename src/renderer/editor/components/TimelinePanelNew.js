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
  cap: { bg: "hsl(263 70% 58% / 0.15)", border: "hsl(263 70% 58% / 0.5)", selected: "hsl(263 70% 58% / 0.35)", text: "hsl(263 70% 80%)" },
  sub: { bg: "hsl(220 50% 72% / 0.15)", border: "hsl(220 50% 72% / 0.5)", selected: "hsl(220 50% 72% / 0.35)", text: "hsl(220 50% 85%)" },
  audio: { bg: "hsl(200 40% 50% / 0.12)", border: "hsl(200 40% 50% / 0.4)", selected: "hsl(200 40% 50% / 0.3)", text: "hsl(200 40% 70%)" },
};
const RULER_H = 24;
const TRACK_H = 36;
const LABEL_W = 72;

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
  const [resizing, setResizing] = useState(null); // "left" | "right" | null
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

  return (
    <div
      className="absolute top-1 bottom-1 rounded cursor-pointer group"
      style={{
        left: leftPx,
        width: Math.max(widthPx, 4),
        background: selected ? trackColor.selected : trackColor.bg,
        border: `1.5px solid ${selected ? "hsl(263 70% 58%)" : trackColor.border}`,
        zIndex: selected ? 5 : 1,
        transition: resizing ? "none" : "background 0.15s, border-color 0.15s",
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(seg.id); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Text label */}
      <span
        className="absolute inset-0 flex items-center px-1.5 text-[9px] font-medium truncate pointer-events-none select-none"
        style={{ color: trackColor.text }}
      >
        {seg.text}
      </span>

      {/* Left handle */}
      {(selected || hovered) && (
        <div
          className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize flex items-center justify-center z-10"
          onPointerDown={(e) => onHandleDown("left", e)}
        >
          <div className="w-1 h-4 rounded-full bg-white/60" />
        </div>
      )}
      {/* Right handle */}
      {(selected || hovered) && (
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

// ── Waveform Track ──
function WaveformTrack({ peaks, duration, timelineWidth, currentTime, selected, onSelect, onContextMenu }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = timelineWidth;
    const h = TRACK_H - 4;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    if (!peaks || peaks.length === 0) {
      // Draw placeholder waveform
      const barCount = Math.floor(w / 3);
      for (let i = 0; i < barCount; i++) {
        const amp = 0.15 + Math.abs(Math.sin(i * 0.35)) * 0.6;
        const barH = amp * h * 0.8;
        const x = (i / barCount) * w;
        ctx.fillStyle = selected ? "hsl(200 50% 60% / 0.5)" : "hsl(200 40% 50% / 0.35)";
        ctx.fillRect(x, (h - barH) / 2, 2, barH);
      }
      return;
    }

    const barWidth = Math.max(1, w / peaks.length);
    for (let i = 0; i < peaks.length; i++) {
      const amp = peaks[i];
      const barH = amp * h * 0.85;
      const x = i * barWidth;
      ctx.fillStyle = selected ? "hsl(200 50% 60% / 0.55)" : "hsl(200 40% 50% / 0.35)";
      ctx.fillRect(x, (h - barH) / 2, Math.max(1, barWidth - 0.5), barH);
    }
  }, [peaks, timelineWidth, selected]);

  return (
    <div
      className={`relative h-full cursor-pointer rounded overflow-hidden ${
        selected ? "ring-1 ring-primary/60" : ""
      }`}
      style={{ width: timelineWidth, background: TRACK_COLORS.audio.bg }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e); }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      {/* Resize handles when selected */}
      {selected && (
        <>
          <div className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize flex items-center justify-center z-10">
            <div className="w-1 h-4 rounded-full bg-white/60" />
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize flex items-center justify-center z-10">
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
  const tlSpeed = usePlaybackStore((s) => s.tlSpeed);
  const togglePlay = usePlaybackStore((s) => s.togglePlay);
  const seekTo = usePlaybackStore((s) => s.seekTo);
  const setTlSpeed = usePlaybackStore((s) => s.setTlSpeed);

  const editSegments = useSubtitleStore((s) => s.editSegments);
  const updateSegmentTimes = useSubtitleStore((s) => s.updateSegmentTimes);
  const splitSegment = useSubtitleStore((s) => s.splitSegment);
  const setActiveSegId = useSubtitleStore((s) => s.setActiveSegId);
  const activeSegId = useSubtitleStore((s) => s.activeSegId);

  const captionText = useCaptionStore((s) => s.captionText);

  const tlCollapsed = useLayoutStore((s) => s.tlCollapsed);
  const tlZoom = useLayoutStore((s) => s.tlZoom);
  const toggleTlCollapse = useLayoutStore((s) => s.toggleTlCollapse);
  const setTlZoom = useLayoutStore((s) => s.setTlZoom);

  const clip = useEditorStore((s) => s.clip);
  const waveformPeaks = useEditorStore((s) => s.waveformPeaks);

  // Local state
  const [speedOpen, setSpeedOpen] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null); // "cap" | "sub" | "audio" | null
  const [selectedSegId, setSelectedSegId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y }
  const [scrubbing, setScrubbing] = useState(false);

  const tracksRef = useRef(null);
  const rulerRef = useRef(null);

  // Video duration
  const duration = clip?.duration || 0;

  // Timeline pixel width based on zoom
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

  const timelineWidth = Math.max(trackAreaWidth, trackAreaWidth * tlZoom);

  // Playhead position
  const playheadPx = duration > 0 ? (currentTime / duration) * timelineWidth : 0;

  // Ruler tick marks
  const rulerTicks = useMemo(() => {
    if (duration <= 0) return [];
    // Target ~60px between major ticks
    const majorInterval = Math.max(0.5, Math.round((duration / (timelineWidth / 60)) * 2) / 2);
    const ticks = [];
    for (let t = 0; t <= duration; t += majorInterval / 2) {
      const isMajor = Math.abs(t % majorInterval) < 0.01 || Math.abs(t % majorInterval - majorInterval) < 0.01;
      ticks.push({ time: t, px: (t / duration) * timelineWidth, major: isMajor });
    }
    return ticks;
  }, [duration, timelineWidth]);

  // Scrub / seek on ruler click
  const handleRulerClick = useCallback((e) => {
    if (!rulerRef.current || duration <= 0) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + rulerRef.current.scrollLeft;
    const t = Math.max(0, Math.min(duration, (x / timelineWidth) * duration));
    seekTo(t);
  }, [duration, timelineWidth, seekTo]);

  // Scrubbing
  const handleScrubStart = useCallback((e) => {
    setScrubbing(true);
    handleRulerClick(e);
  }, [handleRulerClick]);

  useEffect(() => {
    if (!scrubbing) return;
    const onMove = (e) => {
      if (!rulerRef.current || duration <= 0) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + rulerRef.current.scrollLeft;
      const t = Math.max(0, Math.min(duration, (x / timelineWidth) * duration));
      seekTo(t);
    };
    const onUp = () => setScrubbing(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [scrubbing, duration, timelineWidth, seekTo]);

  // Track click on empty area deselects
  const handleTrackBgClick = useCallback(() => {
    setSelectedTrack(null);
    setSelectedSegId(null);
  }, []);

  // Caption segments (treat caption as a single block spanning full duration)
  const captionSegs = useMemo(() => {
    if (!captionText) return [];
    return [{ id: "cap-1", text: captionText, startSec: 0, endSec: duration }];
  }, [captionText, duration]);

  // Segment selection handler
  const handleSegSelect = useCallback((track, segId) => {
    setSelectedTrack(track);
    setSelectedSegId(segId);
    if (track === "sub") setActiveSegId(segId);
  }, [setActiveSegId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.key === " " && !e.ctrlKey && !e.metaKey) {
        // Only if not in an input
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

  // Zoom keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // Ctrl+Shift+= for timeline zoom in, Ctrl+Shift+- for timeline zoom out
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Sync scroll between ruler and tracks
  const handleScroll = useCallback((e) => {
    if (rulerRef.current) rulerRef.current.scrollLeft = e.target.scrollLeft;
  }, []);
  const handleRulerScroll = useCallback((e) => {
    if (tracksRef.current) tracksRef.current.scrollLeft = e.target.scrollLeft;
  }, []);

  // Apply playback speed to video
  useEffect(() => {
    const videoRef = usePlaybackStore.getState().getVideoRef();
    if (videoRef?.current) {
      videoRef.current.playbackRate = parseFloat(tlSpeed) || 1;
    }
  }, [tlSpeed]);

  // ── Collapsed mode: just controls bar ──
  if (tlCollapsed) {
    return (
      <div className="flex items-center h-full bg-card select-none px-3 border-t">
        <div className="flex-1 flex items-center justify-center gap-3">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-foreground"
                  onClick={togglePlay}
                >
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
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={toggleTlCollapse}
              >
                <PanelBottomOpen className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Show timeline (Ctrl+.)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  // ── Full timeline ──
  return (
    <div className="flex flex-col h-full bg-card select-none">
      {/* Controls bar */}
      <div className="h-10 min-h-[40px] flex items-center px-3 border-b gap-2">
        {/* Left: Zoom controls */}
        <div className="flex items-center gap-1">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setTlZoom(Math.max(0.5, tlZoom - 0.25))}
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
              min={50}
              max={400}
              step={25}
              onValueChange={([v]) => setTlZoom(v / 100)}
              className="flex-1"
            />
          </div>

          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setTlZoom(Math.min(4, tlZoom + 0.25))}
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-foreground"
                  onClick={togglePlay}
                >
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={splitSegment}
                >
                  <Scissors className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Split (S)</TooltipContent>
            </Tooltip>

            {/* Speed dropdown */}
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={toggleTlCollapse}
                >
                  <PanelBottomClose className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Hide timeline (Ctrl+.)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Ruler + Tracks area */}
      <div className="flex-1 flex flex-col overflow-hidden" ref={trackAreaRef}>
        {/* Time ruler */}
        <div
          ref={rulerRef}
          className="flex-shrink-0 border-b relative overflow-x-auto overflow-y-hidden cursor-pointer"
          style={{ height: RULER_H }}
          onPointerDown={handleScrubStart}
          onScroll={handleRulerScroll}
        >
          <div className="relative" style={{ width: timelineWidth, height: RULER_H }}>
            {/* Tick marks */}
            {rulerTicks.map((tick, i) => (
              <div
                key={i}
                className="absolute bottom-0 flex flex-col items-center"
                style={{ left: tick.px }}
              >
                {tick.major && (
                  <span className="text-[9px] font-mono text-muted-foreground/60 leading-none mb-0.5 -translate-x-1/2 whitespace-nowrap">
                    {tick.time < 60
                      ? `${tick.time.toFixed(tick.time % 1 === 0 ? 0 : 1)}s`
                      : fmtTime(tick.time)
                    }
                  </span>
                )}
                <div
                  className="bg-border/60"
                  style={{ width: 1, height: tick.major ? 8 : 4 }}
                />
              </div>
            ))}

            {/* Playhead on ruler */}
            <div
              className="absolute top-0 bottom-0 z-20 pointer-events-none"
              style={{ left: playheadPx, transform: "translateX(-50%)" }}
            >
              <div className="w-0.5 h-full bg-primary" />
              {/* Playhead head (triangle) */}
              <div
                className="absolute -top-0.5 left-1/2 -translate-x-1/2"
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderTop: "6px solid hsl(263 70% 58%)",
                }}
              />
            </div>
          </div>
        </div>

        {/* Tracks */}
        <div
          ref={tracksRef}
          className="flex-1 overflow-x-auto overflow-y-auto"
          onScroll={handleScroll}
          onClick={handleTrackBgClick}
        >
          <div style={{ width: timelineWidth, minHeight: "100%" }}>
            {/* Caption track */}
            <div className="flex items-stretch border-b border-border/40" style={{ height: TRACK_H }}>
              <div className="shrink-0 flex items-center gap-1.5 px-2 border-r border-border/30" style={{ width: LABEL_W }}>
                <span
                  className="text-[9px] font-bold w-4 h-4 rounded flex items-center justify-center text-white"
                  style={{ background: "hsl(263 70% 58%)" }}
                >
                  T
                </span>
                <span className="text-[10px] text-muted-foreground font-medium">Caption</span>
              </div>
              <div className="flex-1 relative" style={{ width: timelineWidth - LABEL_W }}>
                {captionSegs.map((seg) => (
                  <SegmentBlock
                    key={seg.id}
                    seg={seg}
                    trackColor={TRACK_COLORS.cap}
                    duration={duration}
                    timelineWidth={timelineWidth - LABEL_W}
                    selected={selectedTrack === "cap" && selectedSegId === seg.id}
                    onSelect={(id) => handleSegSelect("cap", id)}
                    onResize={() => {}} // Caption spans full duration
                  />
                ))}
                {/* Playhead line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-primary z-20 pointer-events-none"
                  style={{ left: duration > 0 ? ((currentTime / duration) * (timelineWidth - LABEL_W)) : 0 }}
                />
              </div>
            </div>

            {/* Subtitle track */}
            <div className="flex items-stretch border-b border-border/40" style={{ height: TRACK_H }}>
              <div className="shrink-0 flex items-center gap-1.5 px-2 border-r border-border/30" style={{ width: LABEL_W }}>
                <span className="text-[10px] text-muted-foreground font-medium">Subtitle</span>
              </div>
              <div className="flex-1 relative" style={{ width: timelineWidth - LABEL_W }}>
                {editSegments.map((seg) => (
                  <SegmentBlock
                    key={seg.id}
                    seg={seg}
                    trackColor={TRACK_COLORS.sub}
                    duration={duration}
                    timelineWidth={timelineWidth - LABEL_W}
                    selected={selectedTrack === "sub" && selectedSegId === seg.id}
                    onSelect={(id) => handleSegSelect("sub", id)}
                    onResize={(id, start, end) => updateSegmentTimes(id, start, end)}
                  />
                ))}
                {/* Playhead line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-primary z-20 pointer-events-none"
                  style={{ left: duration > 0 ? ((currentTime / duration) * (timelineWidth - LABEL_W)) : 0 }}
                />
              </div>
            </div>

            {/* Audio/Video track */}
            <div className="flex items-stretch border-b border-border/40" style={{ height: TRACK_H }}>
              <div className="shrink-0 flex items-center gap-1.5 px-2 border-r border-border/30" style={{ width: LABEL_W }}>
                <span className="text-[10px] text-muted-foreground font-medium">Audio</span>
              </div>
              <div className="flex-1 relative" style={{ width: timelineWidth - LABEL_W }}>
                <WaveformTrack
                  peaks={waveformPeaks}
                  duration={duration}
                  timelineWidth={timelineWidth - LABEL_W}
                  currentTime={currentTime}
                  selected={selectedTrack === "audio"}
                  onSelect={() => { setSelectedTrack("audio"); setSelectedSegId(null); }}
                  onContextMenu={(e) => setContextMenu({ x: e.clientX, y: e.clientY })}
                />
                {/* Playhead line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-primary z-20 pointer-events-none"
                  style={{ left: duration > 0 ? ((currentTime / duration) * (timelineWidth - LABEL_W)) : 0 }}
                />
              </div>
            </div>

            {/* Add audio row */}
            <div className="flex items-center px-2 h-8">
              <button className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1 transition-colors ml-1">
                <Music className="h-3 w-3" />
                Add audio
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Audio context menu */}
      {contextMenu && (
        <AudioContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onDelete={() => { /* TODO: delete scene */ }}
          onCreateClip={() => { /* TODO: create as new clip */ }}
          onDuplicate={() => { /* TODO: duplicate original */ }}
        />
      )}
    </div>
  );
}
