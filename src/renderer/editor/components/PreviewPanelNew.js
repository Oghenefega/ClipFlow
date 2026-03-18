import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import usePlaybackStore from "../stores/usePlaybackStore";
import useSubtitleStore from "../stores/useSubtitleStore";
import useCaptionStore from "../stores/useCaptionStore";
import useEditorStore from "../stores/useEditorStore";
import useLayoutStore from "../stores/useLayoutStore";
import {
  Maximize,
  ChevronDown,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  MoreHorizontal,
  Plus,
  Minus,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip";
import { Separator } from "../../../components/ui/separator";

// ── Constants ──
const ZOOM_PRESETS = [10, 25, 50, 75, 100, 200, 400];
const FONT_OPTIONS = [
  "Latina Essential", "Montserrat", "Roboto", "Arial", "DM Sans", "Inter",
  "Oswald", "Poppins", "Lato", "Bebas Neue", "Playfair Display",
];
const FONT_WEIGHT_OPTIONS = [
  { label: "Light", value: 300 },
  { label: "Regular", value: 400 },
  { label: "Medium", value: 500 },
  { label: "Bold", value: 700 },
  { label: "Heavy", value: 900 },
];

// ── Zoom Menu ──
function ZoomMenu({ zoom, setZoom, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="absolute top-full right-0 mt-1 w-[180px] rounded-lg border bg-popover shadow-xl z-50 overflow-hidden"
    >
      <button
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-foreground hover:bg-secondary/60 transition-colors"
        onClick={() => { setZoom(Math.min(zoom + 25, 400)); onClose(); }}
      >
        <span className="flex items-center gap-2"><Plus className="h-3 w-3" /> Zoom in</span>
        <span className="text-muted-foreground text-[10px]">Ctrl +</span>
      </button>
      <button
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-foreground hover:bg-secondary/60 transition-colors"
        onClick={() => { setZoom(Math.max(zoom - 25, 10)); onClose(); }}
      >
        <span className="flex items-center gap-2"><Minus className="h-3 w-3" /> Zoom out</span>
        <span className="text-muted-foreground text-[10px]">Ctrl -</span>
      </button>
      <button
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-foreground hover:bg-secondary/60 transition-colors"
        onClick={() => { setZoom(-1); onClose(); }} // -1 = fit
      >
        <span>Zoom to fit</span>
        <span className="text-muted-foreground text-[10px]">Ctrl 0</span>
      </button>
      <Separator />
      {ZOOM_PRESETS.map((p) => (
        <button
          key={p}
          className={`w-full flex items-center px-3 py-1.5 text-xs transition-colors ${
            zoom === p ? "text-primary bg-primary/10" : "text-foreground hover:bg-secondary/60"
          }`}
          onClick={() => { setZoom(p); onClose(); }}
        >
          {p}%
        </button>
      ))}
    </div>
  );
}

// ── Font Dropdown ──
function FontDropdown({ value, onChange, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 w-[200px] rounded-lg border bg-popover shadow-xl z-50 overflow-hidden max-h-[240px] overflow-y-auto"
    >
      {FONT_OPTIONS.map((f) => (
        <button
          key={f}
          className={`w-full flex items-center px-3 py-1.5 text-xs transition-colors ${
            value === f ? "text-primary bg-primary/10" : "text-foreground hover:bg-secondary/60"
          }`}
          style={{ fontFamily: f }}
          onClick={() => { onChange(f); onClose(); }}
        >
          {f}
        </button>
      ))}
    </div>
  );
}

// ── Inline Editing Toolbar (positioned below text element) ──
function InlineToolbar({ target, fontFamily, fontSize, fontWeight, onFontFamily, onFontSize, onFontWeight, onAlign, onBold, onItalic, onUnderline, bold, italic, underline }) {
  const [fontOpen, setFontOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg border bg-card shadow-lg">
      {/* Font family */}
      <div className="relative">
        <button
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-secondary/60 text-xs text-foreground transition-colors min-w-[100px]"
          onClick={() => setFontOpen(!fontOpen)}
        >
          <span className="truncate" style={{ fontFamily }}>{fontFamily}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </button>
        {fontOpen && (
          <FontDropdown value={fontFamily} onChange={onFontFamily} onClose={() => setFontOpen(false)} />
        )}
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* Font weight */}
      {onFontWeight && (
        <>
          <div className="relative">
            <button
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-secondary/60 text-xs text-foreground transition-colors min-w-[60px]"
              onClick={() => setWeightOpen(!weightOpen)}
            >
              <span className="truncate" style={{ fontWeight: fontWeight || 400 }}>
                {FONT_WEIGHT_OPTIONS.find(w => w.value === fontWeight)?.label || "Regular"}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            </button>
            {weightOpen && (
              <div className="absolute top-full left-0 mt-1 w-[120px] rounded-lg border bg-popover shadow-xl z-50 overflow-hidden">
                {FONT_WEIGHT_OPTIONS.map((w) => (
                  <button
                    key={w.value}
                    className={`w-full flex items-center px-3 py-1.5 text-xs transition-colors ${
                      fontWeight === w.value ? "text-primary bg-primary/10" : "text-foreground hover:bg-secondary/60"
                    }`}
                    style={{ fontWeight: w.value }}
                    onClick={() => { onFontWeight(w.value); setWeightOpen(false); }}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Separator orientation="vertical" className="h-5" />
        </>
      )}

      {/* Font size */}
      <div className="flex items-center gap-0.5">
        <button
          className="w-6 h-6 rounded hover:bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => onFontSize(Math.max(8, fontSize - 1))}
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="text-xs text-foreground font-mono w-6 text-center">{fontSize}</span>
        <button
          className="w-6 h-6 rounded hover:bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => onFontSize(Math.min(120, fontSize + 1))}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* Alignment */}
      <div className="flex items-center gap-0.5">
        {[
          { icon: AlignLeft, val: "left" },
          { icon: AlignCenter, val: "center" },
          { icon: AlignRight, val: "right" },
        ].map(({ icon: Icon, val }) => (
          <button
            key={val}
            className="w-6 h-6 rounded hover:bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => onAlign(val)}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* Text formatting */}
      <div className="flex items-center gap-0.5">
        <button
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${bold ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}
          onClick={onBold}
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${italic ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}
          onClick={onItalic}
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${underline ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}
          onClick={onUnderline}
        >
          <Underline className="h-3.5 w-3.5" />
        </button>
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* More options */}
      <button className="w-6 h-6 rounded hover:bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Draggable Text Overlay with optional horizontal resize ──
function DraggableOverlay({
  children,
  yPercent,
  onYChange,
  widthPercent,
  onWidthChange,
  selected,
  onSelect,
  overlayId,
  canvasRef,
  overlayRef,
}) {
  const [dragging, setDragging] = useState(false);
  const [resizeSide, setResizeSide] = useState(null); // "left" | "right" | null
  const startY = useRef(0);
  const startPct = useRef(0);
  const resizeStart = useRef({ x: 0, width: 0 });
  const elRef = useRef(null);

  // Expose ref for toolbar positioning
  useEffect(() => {
    if (overlayRef) overlayRef.current = elRef.current;
  });

  const onPointerDown = useCallback((e) => {
    if (resizeSide) return; // Don't drag while resizing
    e.stopPropagation();
    onSelect(overlayId);
    setDragging(true);
    startY.current = e.clientY;
    startPct.current = yPercent;
    e.target.setPointerCapture(e.pointerId);
  }, [yPercent, onSelect, overlayId, resizeSide]);

  const onPointerMove = useCallback((e) => {
    if (!dragging || !canvasRef.current) return;
    const canvasH = canvasRef.current.getBoundingClientRect().height;
    const deltaY = e.clientY - startY.current;
    const deltaPct = (deltaY / canvasH) * 100;
    onYChange(Math.max(2, Math.min(95, startPct.current + deltaPct)));
  }, [dragging, canvasRef, onYChange]);

  const onPointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  // Horizontal resize via edge handles
  const onResizeDown = useCallback((side, e) => {
    if (!onWidthChange || !canvasRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    setResizeSide(side);
    resizeStart.current = { x: e.clientX, width: widthPercent || 90 };

    const onMove = (ev) => {
      const canvasW = canvasRef.current.getBoundingClientRect().width;
      const dx = ev.clientX - resizeStart.current.x;
      const dPct = (dx / canvasW) * 100;
      let newWidth;
      if (side === "right") {
        newWidth = resizeStart.current.width + dPct * 2; // *2 because centered
      } else {
        newWidth = resizeStart.current.width - dPct * 2;
      }
      onWidthChange(Math.max(20, Math.min(100, newWidth)));
    };
    const onUp = () => {
      setResizeSide(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [onWidthChange, canvasRef, widthPercent]);

  return (
    <div
      ref={elRef}
      className="absolute left-0 right-0 flex justify-center"
      style={{
        top: `${yPercent}%`,
        transform: "translateY(-50%)",
        zIndex: selected ? 20 : 10,
      }}
    >
      <div
        className="relative group cursor-move"
        style={{ maxWidth: widthPercent ? `${widthPercent}%` : "90%" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Selection frame */}
        {selected && (
          <div className="absolute -inset-1.5 border-2 border-primary/60 rounded pointer-events-none" />
        )}
        {/* Left resize handle */}
        {selected && onWidthChange && (
          <div
            className="absolute top-1/2 -left-2.5 -translate-y-1/2 w-4 h-4 rounded-full bg-primary border-2 border-white shadow cursor-ew-resize z-30 pointer-events-auto"
            onPointerDown={(e) => onResizeDown("left", e)}
          />
        )}
        {/* Right resize handle */}
        {selected && onWidthChange && (
          <div
            className="absolute top-1/2 -right-2.5 -translate-y-1/2 w-4 h-4 rounded-full bg-primary border-2 border-white shadow cursor-ew-resize z-30 pointer-events-auto"
            onPointerDown={(e) => onResizeDown("right", e)}
          />
        )}
        {/* Drag-only handles (no resize) */}
        {selected && !onWidthChange && (
          <>
            <div className="absolute top-1/2 -left-2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-white shadow pointer-events-none" />
            <div className="absolute top-1/2 -right-2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-white shadow pointer-events-none" />
          </>
        )}
        {children}
      </div>
    </div>
  );
}

// ── Main Preview Panel ──
export default function PreviewPanelNew() {
  const clip = useEditorStore((s) => s.clip);
  const project = useEditorStore((s) => s.project);

  // Playback
  const playing = usePlaybackStore((s) => s.playing);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const setCurrentTime = usePlaybackStore((s) => s.setCurrentTime);
  const setDuration = usePlaybackStore((s) => s.setDuration);
  const setPlaying = usePlaybackStore((s) => s.setPlaying);
  const initVideoRef = usePlaybackStore((s) => s.initVideoRef);
  const setWaveformPeaks = useEditorStore((s) => s.setWaveformPeaks);

  // Subtitles
  const editSegments = useSubtitleStore((s) => s.editSegments);
  const showSubs = useSubtitleStore((s) => s.showSubs);
  const subFontFamily = useSubtitleStore((s) => s.subFontFamily);
  const subFontWeight = useSubtitleStore((s) => s.subFontWeight);
  const fontSize = useSubtitleStore((s) => s.fontSize);
  const strokeWidth = useSubtitleStore((s) => s.strokeWidth);
  const strokeOn = useSubtitleStore((s) => s.strokeOn);
  const shadowOn = useSubtitleStore((s) => s.shadowOn);
  const shadowBlur = useSubtitleStore((s) => s.shadowBlur);
  const bgOn = useSubtitleStore((s) => s.bgOn);
  const bgOpacity = useSubtitleStore((s) => s.bgOpacity);
  const highlightColor = useSubtitleStore((s) => s.highlightColor);
  const subMode = useSubtitleStore((s) => s.subMode);
  const lineMode = useSubtitleStore((s) => s.lineMode);
  const setSubFontFamily = useSubtitleStore((s) => s.setSubFontFamily);
  const setSubFontWeight = useSubtitleStore((s) => s.setSubFontWeight);
  const setFontSize = useSubtitleStore((s) => s.setFontSize);

  // Caption
  const captionText = useCaptionStore((s) => s.captionText);
  const captionFontFamily = useCaptionStore((s) => s.captionFontFamily);
  const captionFontWeight = useCaptionStore((s) => s.captionFontWeight);
  const captionFontSize = useCaptionStore((s) => s.captionFontSize);
  const captionColor = useCaptionStore((s) => s.captionColor);
  const captionBold = useCaptionStore((s) => s.captionBold);
  const captionItalic = useCaptionStore((s) => s.captionItalic);
  const captionUnderline = useCaptionStore((s) => s.captionUnderline);
  const setCaptionText = useCaptionStore((s) => s.setCaptionText);
  const setCaptionFontFamily = useCaptionStore((s) => s.setCaptionFontFamily);
  const setCaptionFontWeight = useCaptionStore((s) => s.setCaptionFontWeight);
  const setCaptionFontSize = useCaptionStore((s) => s.setCaptionFontSize);
  const toggleBold = useCaptionStore((s) => s.toggleBold);
  const toggleItalic = useCaptionStore((s) => s.toggleItalic);
  const toggleUnderline = useCaptionStore((s) => s.toggleUnderline);

  // Layout — for switching right panel on double-click
  const setActivePanel = useLayoutStore((s) => s.setActivePanel);
  const setDrawerOpen = useLayoutStore((s) => s.setDrawerOpen);

  // Local state
  const [zoom, setZoomState] = useState(-1); // -1 = fit
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const [selectedOverlay, setSelectedOverlay] = useState(null); // "sub" | "cap" | null
  const [subYPercent, setSubYPercent] = useState(80); // subtitle position %
  const [capYPercent, setCapYPercent] = useState(15); // caption position %
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [capWidthPercent, setCapWidthPercent] = useState(90);

  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const captionInputRef = useRef(null);
  const capOverlayRef = useRef(null);
  const subOverlayRef = useRef(null);

  // Track canvas size for proportional text scaling
  const [canvasWidth, setCanvasWidth] = useState(360);
  useEffect(() => {
    if (!canvasRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasWidth(entry.contentRect.width);
      }
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, []);

  // Register video ref with playback store
  useEffect(() => {
    initVideoRef(videoRef);
  }, [initVideoRef]);

  // Video source path
  const videoSrc = useMemo(() => {
    if (!clip?.filePath) return null;
    return `file://${clip.filePath.replace(/\\/g, "/")}`;
  }, [clip?.filePath]);

  // Compute display zoom
  const displayZoom = zoom === -1 ? "Fit" : `${zoom}%`;
  const zoomScale = zoom === -1 ? 1 : zoom / 100;

  // Handle zoom with keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setZoomState((z) => Math.min((z === -1 ? 100 : z) + 25, 400));
      } else if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        setZoomState((z) => Math.max((z === -1 ? 100 : z) - 25, 10));
      } else if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        setZoomState(-1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Current subtitle segment
  const currentSeg = useMemo(() => {
    if (!showSubs || editSegments.length === 0) return null;
    return editSegments.find(
      (s) => currentTime >= s.startSec && currentTime <= s.endSec
    ) || null;
  }, [editSegments, currentTime, showSubs]);

  // Current word for karaoke highlighting
  const currentWordIdx = useMemo(() => {
    if (!currentSeg || subMode !== "karaoke" || !currentSeg.words?.length) return -1;
    return currentSeg.words.findIndex(
      (w) => currentTime >= w.start && currentTime <= w.end
    );
  }, [currentSeg, currentTime, subMode]);

  // Video event handlers
  const onTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, [setCurrentTime]);

  const onLoadedMetadata = useCallback(() => {
    if (videoRef.current && videoRef.current.duration && isFinite(videoRef.current.duration)) {
      setDuration(videoRef.current.duration);

      // Extract real waveform peaks via FFmpeg in main process
      if (clip?.filePath && window.clipflow?.ffmpegExtractWaveformPeaks) {
        window.clipflow.ffmpegExtractWaveformPeaks(clip.filePath, 400).then((result) => {
          if (result?.peaks?.length > 0) {
            setWaveformPeaks(result.peaks);
          }
        }).catch((err) => {
          console.warn("Waveform extraction failed:", err);
        });
      }
    }
  }, [setDuration, clip?.filePath, setWaveformPeaks]);

  const onVideoEnd = useCallback(() => {
    setPlaying(false);
  }, [setPlaying]);

  useEffect(() => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [playing]);

  // Deselect overlay when clicking canvas background
  const onCanvasClick = useCallback((e) => {
    if (e.target === canvasRef.current || e.target.dataset.canvasBg) {
      setSelectedOverlay(null);
      setEditingCaption(false);
    }
  }, []);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Scale factor: text sizes are authored for 1080px canvas width (9:16 portrait)
  // Scale proportionally to actual canvas width
  const scaleFactor = canvasWidth / 1080;

  // Build subtitle text style (scales proportionally with preview canvas)
  const subTextStyle = useMemo(() => {
    const scaledFontSize = fontSize * scaleFactor;
    const style = {
      fontFamily: `'${subFontFamily}', sans-serif`,
      fontSize: `${scaledFontSize}px`,
      fontWeight: subFontWeight || 700,
      color: "#ffffff",
      textAlign: "center",
      lineHeight: 1.3,
      padding: `${4 * scaleFactor}px ${10 * scaleFactor}px`,
      borderRadius: 4 * scaleFactor,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      maxWidth: "90%",
    };
    if (bgOn) {
      style.background = `rgba(0,0,0,${bgOpacity / 100})`;
    }
    if (strokeOn) {
      const scaledStroke = Math.max(0.5, strokeWidth * scaleFactor * 0.5);
      style.WebkitTextStroke = `${scaledStroke}px rgba(0,0,0,0.8)`;
      style.paintOrder = "stroke fill";
    }
    if (shadowOn) {
      const scaledBlur = shadowBlur * scaleFactor * 0.5;
      style.textShadow = `0 ${2 * scaleFactor}px ${scaledBlur}px rgba(0,0,0,0.7)`;
    }
    return style;
  }, [subFontFamily, subFontWeight, fontSize, bgOn, bgOpacity, strokeOn, strokeWidth, shadowOn, shadowBlur, scaleFactor]);

  // Build caption text style (scales proportionally with preview canvas)
  const capTextStyle = useMemo(() => {
    const scaledFontSize = captionFontSize * 2.4 * scaleFactor;
    return {
      fontFamily: `'${captionFontFamily}', sans-serif`,
      fontSize: `${scaledFontSize}px`,
      fontWeight: captionFontWeight || (captionBold ? 700 : 400),
      fontStyle: captionItalic ? "italic" : "normal",
      textDecoration: captionUnderline ? "underline" : "none",
      color: captionColor,
      textAlign: "center",
      lineHeight: 1.3,
      padding: `${4 * scaleFactor}px ${10 * scaleFactor}px`,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      maxWidth: "90%",
      textShadow: `0 ${2 * scaleFactor}px ${8 * scaleFactor}px rgba(0,0,0,0.6)`,
    };
  }, [captionFontFamily, captionFontSize, captionBold, captionItalic, captionUnderline, captionColor, scaleFactor]);

  // Render subtitle words with karaoke highlight + 1L/2L line mode
  const renderSubtitleText = () => {
    if (!currentSeg) return null;
    const words = currentSeg.words || [];
    const CHUNK = 3; // words per line for 1L mode

    if (words.length > 0) {
      // Determine which words to show based on lineMode
      let visibleWords = words;
      let visibleOffset = 0;

      if (lineMode === "1L") {
        // Show chunks of ~3 words around the active word
        const activeIdx = currentWordIdx >= 0 ? currentWordIdx : 0;
        const chunkIndex = Math.floor(activeIdx / CHUNK);
        const chunkStart = chunkIndex * CHUNK;
        const chunkEnd = Math.min(words.length, chunkStart + CHUNK);
        visibleWords = words.slice(chunkStart, chunkEnd);
        visibleOffset = chunkStart;
      }

      return (
        <span style={subTextStyle}>
          {visibleWords.map((w, i) => {
            const globalIdx = i + visibleOffset;
            const isActive = subMode === "karaoke" && globalIdx === currentWordIdx;
            return (
              <span
                key={globalIdx}
                style={{
                  color: isActive ? highlightColor : "#ffffff",
                  transition: "color 0.1s",
                }}
              >
                {w.word}{i < visibleWords.length - 1 ? " " : ""}
              </span>
            );
          })}
        </span>
      );
    }

    // Fallback: no word-level data, use segment text
    if (lineMode === "1L") {
      // Split text into ~3-word chunks and show the chunk matching current time position
      const textWords = currentSeg.text.split(/\s+/);
      const segDuration = currentSeg.endSec - currentSeg.startSec;
      const progress = segDuration > 0 ? (currentTime - currentSeg.startSec) / segDuration : 0;
      const totalChunks = Math.ceil(textWords.length / CHUNK);
      const chunkIdx = Math.min(Math.floor(progress * totalChunks), totalChunks - 1);
      const chunkStart = chunkIdx * CHUNK;
      const visibleText = textWords.slice(chunkStart, chunkStart + CHUNK).join(" ");
      return <span style={subTextStyle}>{visibleText}</span>;
    }

    return <span style={subTextStyle}>{currentSeg.text}</span>;
  };

  // Double-click handler for caption — switch right panel to Text tab
  const onCaptionDoubleClick = useCallback((e) => {
    e.stopPropagation();
    setSelectedOverlay("cap");
    setEditingCaption(true);
    setActivePanel("text");
    setDrawerOpen(true);
  }, [setActivePanel, setDrawerOpen]);

  // Double-click handler for subtitle — switch right panel to Subtitles tab
  const onSubtitleDoubleClick = useCallback((e) => {
    e.stopPropagation();
    setSelectedOverlay("sub");
    setActivePanel("sub");
    setDrawerOpen(true);
  }, [setActivePanel, setDrawerOpen]);

  // Compute toolbar position relative to canvas
  const [toolbarPos, setToolbarPos] = useState({ bottom: 8 });
  useEffect(() => {
    if (!selectedOverlay || !canvasRef.current) return;
    const overlayRef = selectedOverlay === "cap" ? capOverlayRef : subOverlayRef;
    if (!overlayRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const overlayRect = overlayRef.current.getBoundingClientRect();
    // Position toolbar just below the overlay element, relative to canvas
    const bottomOfOverlay = overlayRect.bottom - canvasRect.top;
    setToolbarPos({ top: bottomOfOverlay + 6 });
  }, [selectedOverlay, currentTime, capYPercent, subYPercent, canvasWidth]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full w-full overflow-hidden relative select-none"
      style={{ background: "hsl(240 8% 3%)" }}
    >
      {/* Top controls overlay */}
      <div className="absolute top-2 left-2 right-2 z-30 flex items-center justify-between pointer-events-none">
        {/* Left: Fullscreen */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 bg-black/40 hover:bg-black/60 text-white/80 hover:text-white backdrop-blur-sm pointer-events-auto"
                onClick={toggleFullscreen}
              >
                <Maximize className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Fullscreen</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Right: Zoom control */}
        <div className="relative pointer-events-auto">
          <button
            className="flex items-center gap-1 px-2 py-1 rounded bg-black/40 hover:bg-black/60 text-white/80 hover:text-white text-[11px] font-medium backdrop-blur-sm transition-colors"
            onClick={() => setZoomMenuOpen(!zoomMenuOpen)}
          >
            {displayZoom}
            <ChevronDown className={`h-3 w-3 transition-transform ${zoomMenuOpen ? "rotate-180" : ""}`} />
          </button>
          {zoomMenuOpen && (
            <ZoomMenu
              zoom={zoom === -1 ? 100 : zoom}
              setZoom={setZoomState}
              onClose={() => setZoomMenuOpen(false)}
            />
          )}
        </div>
      </div>

      {/* Video canvas area — scrollable when zoomed in */}
      <div className="flex-1 flex items-center justify-center overflow-auto p-1">
        <div
          ref={canvasRef}
          className="relative overflow-hidden rounded-lg shrink-0"
          style={{
            aspectRatio: "9 / 16",
            ...(zoom === -1
              ? {
                  // Fit mode: fill available height, auto width from aspect ratio
                  height: "100%",
                  maxHeight: "100%",
                  maxWidth: "100%",
                }
              : {
                  // Zoom mode: fixed height based on percentage of container
                  height: `${zoom}%`,
                }),
            background: "hsl(240 6% 6%)",
            border: "1px solid hsl(240 4% 14% / 0.4)",
          }}
          onClick={onCanvasClick}
          data-canvas-bg="true"
        >
          {/* Video element */}
          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              className="absolute inset-0 w-full h-full object-contain"
              onTimeUpdate={onTimeUpdate}
              onLoadedMetadata={onLoadedMetadata}
              onEnded={onVideoEnd}
              preload="auto"
              data-canvas-bg="true"
            />
          ) : (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground"
              data-canvas-bg="true"
            >
              <div className="w-12 h-12 rounded-full border-2 border-muted-foreground/20 flex items-center justify-center mb-2">
                <div className="w-0 h-0 border-t-[8px] border-b-[8px] border-l-[14px] border-transparent border-l-muted-foreground/30 ml-1" />
              </div>
              <span className="text-xs opacity-40">No video loaded</span>
            </div>
          )}

          {/* Caption overlay with resize handles */}
          {captionText && (
            <DraggableOverlay
              yPercent={capYPercent}
              onYChange={setCapYPercent}
              widthPercent={capWidthPercent}
              onWidthChange={setCapWidthPercent}
              selected={selectedOverlay === "cap"}
              onSelect={setSelectedOverlay}
              overlayId="cap"
              canvasRef={canvasRef}
              overlayRef={capOverlayRef}
            >
              {editingCaption && selectedOverlay === "cap" ? (
                <textarea
                  ref={captionInputRef}
                  value={captionText}
                  onChange={(e) => setCaptionText(e.target.value)}
                  onBlur={() => setEditingCaption(false)}
                  onKeyDown={(e) => { if (e.key === "Escape") setEditingCaption(false); }}
                  className="bg-transparent border-none outline-none resize-none text-center w-full"
                  style={{
                    ...capTextStyle,
                    minWidth: 60,
                    cursor: "text",
                  }}
                  rows={Math.max(1, captionText.split("\n").length)}
                  autoFocus
                />
              ) : (
                <div
                  style={capTextStyle}
                  onDoubleClick={onCaptionDoubleClick}
                >
                  {captionText}
                </div>
              )}
            </DraggableOverlay>
          )}

          {/* Subtitle overlay (no width resize, just move) */}
          {showSubs && currentSeg && (
            <DraggableOverlay
              yPercent={subYPercent}
              onYChange={setSubYPercent}
              selected={selectedOverlay === "sub"}
              onSelect={setSelectedOverlay}
              overlayId="sub"
              canvasRef={canvasRef}
              overlayRef={subOverlayRef}
            >
              <div onDoubleClick={onSubtitleDoubleClick}>
                {renderSubtitleText()}
              </div>
            </DraggableOverlay>
          )}

          {/* Inline editing toolbar — positioned inside canvas, below the selected element */}
          {selectedOverlay && (
            <div
              className="absolute left-0 right-0 flex justify-center z-40 pointer-events-auto"
              style={{ top: toolbarPos.top || "auto", bottom: toolbarPos.bottom }}
            >
              {selectedOverlay === "sub" ? (
                <InlineToolbar
                  target="sub"
                  fontFamily={subFontFamily}
                  fontSize={fontSize}
                  fontWeight={subFontWeight}
                  onFontFamily={setSubFontFamily}
                  onFontSize={setFontSize}
                  onFontWeight={setSubFontWeight}
                  onAlign={() => {}}
                  onBold={() => {}}
                  onItalic={() => {}}
                  onUnderline={() => {}}
                  bold={false}
                  italic={false}
                  underline={false}
                />
              ) : (
                <InlineToolbar
                  target="cap"
                  fontFamily={captionFontFamily}
                  fontSize={captionFontSize}
                  fontWeight={captionFontWeight}
                  onFontFamily={setCaptionFontFamily}
                  onFontSize={setCaptionFontSize}
                  onFontWeight={setCaptionFontWeight}
                  onAlign={() => {}}
                  onBold={toggleBold}
                  onItalic={toggleItalic}
                  onUnderline={toggleUnderline}
                  bold={captionBold}
                  italic={captionItalic}
                  underline={captionUnderline}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
