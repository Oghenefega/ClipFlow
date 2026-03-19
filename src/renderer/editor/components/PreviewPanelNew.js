import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import usePlaybackStore from "../stores/usePlaybackStore";
import useSubtitleStore from "../stores/useSubtitleStore";
import useCaptionStore from "../stores/useCaptionStore";
import useEditorStore from "../stores/useEditorStore";
import useLayoutStore from "../stores/useLayoutStore";
import {
  Maximize,
  ChevronDown,
  Minus,
  Plus,
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
function ZoomMenu({ zoom, setZoom, onClose, triggerRef }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          triggerRef?.current && !triggerRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, triggerRef]);

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

// ── Hold-to-repeat button helper ──
// ── Compact Inline Toolbar (Vizard-style, single row) ──
// ── Color picker popover for inline toolbar ──
function InlineColorPicker({ color, onChange, onClose }) {
  const ref = useRef(null);
  const SWATCHES = [
    "#ffffff", "#000000", "#ff0000", "#00ff00", "#0000ff", "#ffff00",
    "#ff6b6b", "#ffa500", "#a4ff00", "#00e5ff", "#8b5cf6", "#ff69b4",
    "#4cce8a", "#fbbf24", "#22d3ee", "#f87171", "#34d399", "#c084fc",
  ];

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-2 rounded-lg border bg-popover shadow-xl z-[60]">
      <div className="grid grid-cols-6 gap-1.5">
        {SWATCHES.map((c) => (
          <button
            key={c}
            className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${color === c ? "border-primary ring-1 ring-primary" : "border-transparent"}`}
            style={{ background: c }}
            onClick={() => { onChange(c); onClose(); }}
          />
        ))}
      </div>
      {/* Custom color input */}
      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/40">
        <input
          type="color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
        />
        <input
          type="text"
          value={color}
          onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) onChange(e.target.value); }}
          className="flex-1 h-6 px-1.5 text-[10px] font-mono text-foreground rounded bg-secondary border border-border outline-none"
        />
      </div>
    </div>
  );
}

function InlineToolbar({ target, fontFamily, fontSize, fontWeight, onFontFamily, onFontSize, onFontWeight, color, onColor }) {
  const [fontOpen, setFontOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);

  // Font size scroll — use ref to attach non-passive wheel listener (preventDefault needs non-passive)
  const sizeInputRef = useRef(null);
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;
  useEffect(() => {
    const el = sizeInputRef.current;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY < 0 ? 1 : -1;
      onFontSize(Math.max(1, Math.min(999, fontSizeRef.current + delta)));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [onFontSize]);

  // Truncated font name (first word only if long)
  const shortFont = fontFamily.length > 10 ? fontFamily.split(" ")[0] + "..." : fontFamily;
  const weightLabel = FONT_WEIGHT_OPTIONS.find(w => w.value === fontWeight)?.label || "Regular";

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg border bg-card shadow-lg">
      {/* Font family (truncated) */}
      <div className="relative">
        <button
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-secondary/60 text-[13px] text-foreground transition-colors"
          onClick={() => { setFontOpen(!fontOpen); setWeightOpen(false); setColorOpen(false); }}
        >
          <span className="truncate max-w-[80px]" style={{ fontFamily, fontWeight: fontWeight || 900, fontStyle: "italic" }}>{shortFont}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </button>
        {fontOpen && (
          <FontDropdown value={fontFamily} onChange={(f) => { onFontFamily(f); setFontOpen(false); }} onClose={() => setFontOpen(false)} />
        )}
      </div>

      <Separator orientation="vertical" className="h-4" />

      {/* Font size (scroll to change, click to edit) */}
      <input
        ref={sizeInputRef}
        type="text"
        value={fontSize}
        onChange={(e) => {
          const v = parseInt(e.target.value);
          if (!isNaN(v) && v >= 1 && v <= 999) onFontSize(v);
        }}
        onFocus={(e) => e.target.select()}
        className="w-8 h-7 text-[13px] text-foreground font-mono text-center rounded bg-transparent border border-transparent hover:border-border focus:border-primary/50 outline-none cursor-ns-resize"
      />

      <Separator orientation="vertical" className="h-4" />

      {/* Font weight */}
      {onFontWeight && (
        <div className="relative">
          <button
            className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-secondary/60 text-[13px] text-foreground transition-colors"
            onClick={() => { setWeightOpen(!weightOpen); setFontOpen(false); setColorOpen(false); }}
          >
            <span style={{ fontWeight: fontWeight || 400 }}>{weightLabel}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          </button>
          {weightOpen && (
            <div className="absolute top-full left-0 mt-1 w-[110px] rounded-lg border bg-popover shadow-xl z-50 overflow-hidden">
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
      )}

      <Separator orientation="vertical" className="h-4" />

      {/* Color dot */}
      <div className="relative">
        <button
          className="w-5 h-5 rounded-full border-2 border-white/30 hover:border-white/60 transition-colors shadow-sm"
          style={{ background: color || "#ffffff" }}
          onClick={() => { setColorOpen(!colorOpen); setFontOpen(false); setWeightOpen(false); }}
        />
        {colorOpen && (
          <InlineColorPicker color={color || "#ffffff"} onChange={onColor} onClose={() => setColorOpen(false)} />
        )}
      </div>
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
  const segmentMode = useSubtitleStore((s) => s.segmentMode);
  const showSubs = useSubtitleStore((s) => s.showSubs);
  const subColor = useSubtitleStore((s) => s.subColor);
  const setSubColor = useSubtitleStore((s) => s.setSubColor);
  const subFontFamily = useSubtitleStore((s) => s.subFontFamily);
  const subFontWeight = useSubtitleStore((s) => s.subFontWeight);
  const subItalic = useSubtitleStore((s) => s.subItalic);
  const subBold = useSubtitleStore((s) => s.subBold);
  const subUnderline = useSubtitleStore((s) => s.subUnderline);
  const fontSize = useSubtitleStore((s) => s.fontSize);
  const strokeWidth = useSubtitleStore((s) => s.strokeWidth);
  const strokeOn = useSubtitleStore((s) => s.strokeOn);
  const shadowOn = useSubtitleStore((s) => s.shadowOn);
  const shadowBlur = useSubtitleStore((s) => s.shadowBlur);
  const shadowColor = useSubtitleStore((s) => s.shadowColor);
  const shadowOpacity = useSubtitleStore((s) => s.shadowOpacity);
  const strokeColor = useSubtitleStore((s) => s.strokeColor);
  const strokeOpacity = useSubtitleStore((s) => s.strokeOpacity);
  const strokeBlur = useSubtitleStore((s) => s.strokeBlur);
  const strokeOffsetX = useSubtitleStore((s) => s.strokeOffsetX);
  const strokeOffsetY = useSubtitleStore((s) => s.strokeOffsetY);
  const shadowOffsetX = useSubtitleStore((s) => s.shadowOffsetX);
  const shadowOffsetY = useSubtitleStore((s) => s.shadowOffsetY);
  const glowOn = useSubtitleStore((s) => s.glowOn);
  const glowColor = useSubtitleStore((s) => s.glowColor);
  const glowOpacity = useSubtitleStore((s) => s.glowOpacity);
  const glowIntensity = useSubtitleStore((s) => s.glowIntensity);
  const glowBlur = useSubtitleStore((s) => s.glowBlur);
  const glowBlend = useSubtitleStore((s) => s.glowBlend);
  const glowOffsetX = useSubtitleStore((s) => s.glowOffsetX);
  const glowOffsetY = useSubtitleStore((s) => s.glowOffsetY);
  const bgOn = useSubtitleStore((s) => s.bgOn);
  const bgOpacity = useSubtitleStore((s) => s.bgOpacity);
  const bgColor = useSubtitleStore((s) => s.bgColor);
  const bgPaddingX = useSubtitleStore((s) => s.bgPaddingX);
  const bgPaddingY = useSubtitleStore((s) => s.bgPaddingY);
  const bgRadius = useSubtitleStore((s) => s.bgRadius);
  const effectOrder = useSubtitleStore((s) => s.effectOrder);
  const highlightColor = useSubtitleStore((s) => s.highlightColor);
  const subMode = useSubtitleStore((s) => s.subMode);
  const syncOffset = useSubtitleStore((s) => s.syncOffset);
  const lineMode = useSubtitleStore((s) => s.lineMode);
  const punctuationRemove = useSubtitleStore((s) => s.punctuationRemove);
  const animateOn = useSubtitleStore((s) => s.animateOn);
  const animateScale = useSubtitleStore((s) => s.animateScale);
  const animateGrowFrom = useSubtitleStore((s) => s.animateGrowFrom);
  const animateSpeed = useSubtitleStore((s) => s.animateSpeed);
  const setSubFontFamily = useSubtitleStore((s) => s.setSubFontFamily);
  const setSubFontWeight = useSubtitleStore((s) => s.setSubFontWeight);
  const setFontSize = useSubtitleStore((s) => s.setFontSize);
  // B/I/U toggles are in the right panel settings, not inline toolbar

  // Caption
  const captionSegments = useCaptionStore((s) => s.captionSegments);
  const captionFontFamily = useCaptionStore((s) => s.captionFontFamily);
  const captionFontWeight = useCaptionStore((s) => s.captionFontWeight);
  const captionFontSize = useCaptionStore((s) => s.captionFontSize);
  const captionColor = useCaptionStore((s) => s.captionColor);
  const captionBold = useCaptionStore((s) => s.captionBold);
  const captionItalic = useCaptionStore((s) => s.captionItalic);
  const captionUnderline = useCaptionStore((s) => s.captionUnderline);
  const captionLineSpacing = useCaptionStore((s) => s.captionLineSpacing);
  const captionShadowOn = useCaptionStore((s) => s.captionShadowOn);
  const captionShadowColor = useCaptionStore((s) => s.captionShadowColor);
  const captionShadowBlur = useCaptionStore((s) => s.captionShadowBlur);
  const captionShadowOpacity = useCaptionStore((s) => s.captionShadowOpacity);
  const captionStrokeOn = useCaptionStore((s) => s.captionStrokeOn);
  const captionStrokeColor = useCaptionStore((s) => s.captionStrokeColor);
  const captionStrokeWidth = useCaptionStore((s) => s.captionStrokeWidth);
  const captionStrokeOpacity = useCaptionStore((s) => s.captionStrokeOpacity);
  const captionStrokeBlur = useCaptionStore((s) => s.captionStrokeBlur);
  const captionStrokeOffsetX = useCaptionStore((s) => s.captionStrokeOffsetX);
  const captionStrokeOffsetY = useCaptionStore((s) => s.captionStrokeOffsetY);
  const captionGlowOn = useCaptionStore((s) => s.captionGlowOn);
  const captionGlowColor = useCaptionStore((s) => s.captionGlowColor);
  const captionGlowOpacity = useCaptionStore((s) => s.captionGlowOpacity);
  const captionGlowIntensity = useCaptionStore((s) => s.captionGlowIntensity);
  const captionGlowBlur = useCaptionStore((s) => s.captionGlowBlur);
  const captionGlowBlend = useCaptionStore((s) => s.captionGlowBlend);
  const captionGlowOffsetX = useCaptionStore((s) => s.captionGlowOffsetX);
  const captionGlowOffsetY = useCaptionStore((s) => s.captionGlowOffsetY);
  const captionShadowOffsetX = useCaptionStore((s) => s.captionShadowOffsetX);
  const captionShadowOffsetY = useCaptionStore((s) => s.captionShadowOffsetY);
  const captionBgOn = useCaptionStore((s) => s.captionBgOn);
  const captionBgColor = useCaptionStore((s) => s.captionBgColor);
  const captionBgOpacity = useCaptionStore((s) => s.captionBgOpacity);
  const captionBgPaddingX = useCaptionStore((s) => s.captionBgPaddingX);
  const captionBgPaddingY = useCaptionStore((s) => s.captionBgPaddingY);
  const captionBgRadius = useCaptionStore((s) => s.captionBgRadius);
  const captionEffectOrder = useCaptionStore((s) => s.captionEffectOrder);
  const setCaptionText = useCaptionStore((s) => s.setCaptionText);
  const setCaptionFontFamily = useCaptionStore((s) => s.setCaptionFontFamily);
  const setCaptionFontWeight = useCaptionStore((s) => s.setCaptionFontWeight);
  const setCaptionFontSize = useCaptionStore((s) => s.setCaptionFontSize);
  // Caption B/I/U toggles are in the right panel settings

  // Layout — for switching right panel on double-click + overlay positions
  const setActivePanel = useLayoutStore((s) => s.setActivePanel);
  const setDrawerOpen = useLayoutStore((s) => s.setDrawerOpen);
  const subYPercent = useLayoutStore((s) => s.subYPercent);
  const setSubYPercent = useLayoutStore((s) => s.setSubYPercent);
  const capYPercent = useLayoutStore((s) => s.capYPercent);
  const setCapYPercent = useLayoutStore((s) => s.setCapYPercent);
  const capWidthPercent = useLayoutStore((s) => s.capWidthPercent);
  const setCapWidthPercent = useLayoutStore((s) => s.setCapWidthPercent);

  // Local state
  const [zoom, setZoomState] = useState(-1); // -1 = fit
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const [selectedOverlay, setSelectedOverlay] = useState(null); // "sub" | "cap" | null
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);

  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const captionInputRef = useRef(null);
  const capOverlayRef = useRef(null);
  const subOverlayRef = useRef(null);
  const zoomBtnRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

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

  // Mouse wheel zoom on the preview area
  const onWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoomState((z) => {
        const current = z === -1 ? 100 : z;
        const delta = e.deltaY < 0 ? 10 : -10;
        return Math.max(10, Math.min(400, current + delta));
      });
    }
    // Otherwise allow normal scroll for panning when zoomed
  }, []);

  // Middle-mouse drag to pan zoomed preview
  const onPanDown = useCallback((e) => {
    if (e.button !== 1) return; // middle mouse only
    e.preventDefault();
    const container = scrollContainerRef.current;
    if (!container) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY, scrollLeft: container.scrollLeft, scrollTop: container.scrollTop };
    const onMove = (ev) => {
      const dx = ev.clientX - panStartRef.current.x;
      const dy = ev.clientY - panStartRef.current.y;
      container.scrollLeft = panStartRef.current.scrollLeft - dx;
      container.scrollTop = panStartRef.current.scrollTop - dy;
    };
    const onUp = () => {
      setIsPanning(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  // Current subtitle segment (adjusted for sync offset)
  const adjustedTime = currentTime - syncOffset;
  const currentSeg = useMemo(() => {
    if (!showSubs || editSegments.length === 0) return null;
    return editSegments.find(
      (s) => adjustedTime >= s.startSec && adjustedTime <= s.endSec
    ) || null;
  }, [editSegments, adjustedTime, showSubs]);

  // Current word for karaoke highlighting
  // Karaoke is disabled in 1-word mode (only 1 word shows at a time, highlighting is pointless)
  const karaokeActive = subMode === "karaoke" && segmentMode !== "1word";
  const currentWordIdx = useMemo(() => {
    if (!currentSeg || !karaokeActive || !currentSeg.words?.length) return -1;
    const words = currentSeg.words;
    // First: try exact match (time within word boundaries)
    const exact = words.findIndex(
      (w) => adjustedTime >= w.start && adjustedTime <= w.end
    );
    if (exact >= 0) return exact;
    // Fallback: find the most recent word that has started (handles gaps between words)
    // This prevents karaoke highlights from "skipping" during inter-word silence
    let best = -1;
    for (let i = 0; i < words.length; i++) {
      if (adjustedTime >= words[i].start) best = i;
      else break; // words are sorted, no need to check further
    }
    // Only use fallback if we're not too far past the word's end (< 0.5s gap)
    if (best >= 0 && adjustedTime <= words[best].end + 0.5) return best;
    // Before first word: highlight first word if we're close (< 0.2s)
    if (best < 0 && words.length > 0 && adjustedTime >= words[0].start - 0.2) return 0;
    return -1;
  }, [currentSeg, adjustedTime, karaokeActive]);

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

  // ── Helper: parse hex to rgba string ──
  const hexToRgba = useCallback((hex, opacity) => {
    const c = hex || "#000000";
    const r = parseInt(c.slice(1, 3), 16) || 0;
    const g = parseInt(c.slice(3, 5), 16) || 0;
    const b = parseInt(c.slice(5, 7), 16) || 0;
    return `rgba(${r},${g},${b},${opacity / 100})`;
  }, []);

  // Generate outside stroke via multi-ring text-shadow (adaptive point count for smooth edges)
  const buildStrokeShadows = useCallback((width, colorHex, opacity, blur = 0, offX = 0, offY = 0) => {
    if (width <= 0) return "";
    const rgba = hexToRgba(colorHex, opacity);
    const shadows = [];
    // Adaptive: more points for larger widths to avoid jagged edges
    const steps = Math.max(24, Math.round(width * 8));
    // Multiple rings from 40% to 100% width for solid fill (no gaps)
    const rings = width > 3 ? 3 : width > 1 ? 2 : 1;
    for (let ring = 1; ring <= rings; ring++) {
      const r = width * (ring / rings);
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const x = (Math.cos(angle) * r + offX).toFixed(2);
        const y = (Math.sin(angle) * r + offY).toFixed(2);
        shadows.push(`${x}px ${y}px ${blur}px ${rgba}`);
      }
    }
    return shadows.join(", ");
  }, [hexToRgba]);

  // Generate glow via text-shadow (large soft halo)
  const buildGlowShadow = useCallback((colorHex, opacity, intensity, blur, blend, offX, offY, sf) => {
    const scaledBlur = blur * sf * 0.5;
    const scaledIntensity = intensity / 100;
    const effectiveOpacity = (opacity / 100) * (blend / 100 + (1 - blend / 100) * scaledIntensity);
    const rgba = hexToRgba(colorHex, effectiveOpacity * 100);
    const ox = (offX * sf * 0.5).toFixed(1);
    const oy = (offY * sf * 0.5).toFixed(1);
    const layers = Math.max(1, Math.round(scaledIntensity * 3));
    const parts = [];
    for (let i = 0; i < layers; i++) {
      parts.push(`${ox}px ${oy}px ${scaledBlur}px ${rgba}`);
    }
    return parts.join(", ");
  }, [hexToRgba]);

  // ── Build unified text-shadow respecting effect order ──
  const buildAllShadows = useCallback((opts) => {
    const { sf, stroke, glow: glowOpts, shadow: shadowOpts, order } = opts;
    // Render in reverse order: last in array = closest to text (drawn last by CSS)
    // So we iterate in order and CSS paints first entries on top
    const builders = {
      shadow: () => {
        if (!shadowOpts.on) return "";
        const scaledBlur = shadowOpts.blur * sf * 0.5;
        const ox = (shadowOpts.offX * sf * 0.5).toFixed(1);
        const oy = (shadowOpts.offY * sf * 0.5).toFixed(1);
        return `${ox}px ${oy}px ${scaledBlur}px ${hexToRgba(shadowOpts.color, shadowOpts.opacity)}`;
      },
      glow: () => {
        if (!glowOpts.on) return "";
        return buildGlowShadow(glowOpts.color, glowOpts.opacity, glowOpts.intensity, glowOpts.blur, glowOpts.blend, glowOpts.offX, glowOpts.offY, sf);
      },
      stroke: () => {
        if (!stroke.on) return "";
        const scaledW = Math.max(0.5, stroke.width * sf * 0.5);
        const scaledBlur = stroke.blur * sf * 0.3;
        return buildStrokeShadows(scaledW, stroke.color, stroke.opacity, scaledBlur, stroke.offX * sf * 0.5, stroke.offY * sf * 0.5);
      },
      background: () => "", // background is handled via CSS background, not text-shadow
    };
    // CSS text-shadow: first shadow listed is drawn on top (closest to text)
    // So the effect at index 0 in order should appear on top = listed first
    const effectOrder = order || ["glow", "stroke", "shadow", "background"];
    const parts = effectOrder.map(key => builders[key] ? builders[key]() : "").filter(Boolean);
    return parts.join(", ");
  }, [hexToRgba, buildStrokeShadows, buildGlowShadow]);

  // Build subtitle text style (scales proportionally with preview canvas)
  // textShadow is NOT included here — it's applied per-word so active word can have highlight-colored glow
  const subTextStyle = useMemo(() => {
    const scaledFontSize = fontSize * scaleFactor;
    const style = {
      fontFamily: `'${subFontFamily}', sans-serif`,
      fontSize: `${scaledFontSize}px`,
      fontWeight: subFontWeight || 700,
      fontStyle: subItalic ? "italic" : "normal",
      textDecoration: subUnderline ? "underline" : "none",
      color: subColor || "#ffffff",
      textAlign: "center",
      lineHeight: 1.3,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      width: "100%",
    };
    // Background
    if (bgOn) {
      const bgRgba = hexToRgba(bgColor, bgOpacity);
      style.background = bgRgba;
      style.padding = `${bgPaddingY * scaleFactor * 0.5}px ${bgPaddingX * scaleFactor * 0.5}px`;
      style.borderRadius = bgRadius * scaleFactor * 0.5;
    } else {
      style.padding = `${4 * scaleFactor}px ${10 * scaleFactor}px`;
      style.borderRadius = 4 * scaleFactor;
    }
    return style;
  }, [subFontFamily, subFontWeight, subItalic, subUnderline, fontSize, subColor,
    bgOn, bgOpacity, bgColor, bgPaddingX, bgPaddingY, bgRadius,
    scaleFactor, hexToRgba]);

  // Per-word text-shadow: normal (subtitle glow color) + active (highlight glow color)
  const subWordShadows = useMemo(() => {
    const shadowOpts = { sf: scaleFactor,
      stroke: { on: strokeOn, width: strokeWidth, color: strokeColor, opacity: strokeOpacity, blur: strokeBlur, offX: strokeOffsetX, offY: strokeOffsetY },
      shadow: { on: shadowOn, color: shadowColor, opacity: shadowOpacity, blur: shadowBlur, offX: shadowOffsetX, offY: shadowOffsetY },
      order: effectOrder,
    };
    const normal = buildAllShadows({ ...shadowOpts,
      glow: { on: glowOn, color: glowColor, opacity: glowOpacity, intensity: glowIntensity, blur: glowBlur, blend: glowBlend, offX: glowOffsetX, offY: glowOffsetY },
    });
    // Active word: use highlightColor for glow instead of glowColor
    const active = buildAllShadows({ ...shadowOpts,
      glow: { on: glowOn, color: highlightColor, opacity: glowOpacity, intensity: glowIntensity, blur: glowBlur, blend: glowBlend, offX: glowOffsetX, offY: glowOffsetY },
    });
    return { normal, active };
  }, [strokeOn, strokeWidth, strokeColor, strokeOpacity, strokeBlur, strokeOffsetX, strokeOffsetY,
    glowOn, glowColor, glowOpacity, glowIntensity, glowBlur, glowBlend, glowOffsetX, glowOffsetY,
    shadowOn, shadowBlur, shadowColor, shadowOpacity, shadowOffsetX, shadowOffsetY,
    scaleFactor, buildAllShadows, effectOrder, highlightColor]);

  // Build caption text style (scales proportionally with preview canvas)
  const capTextStyle = useMemo(() => {
    const scaledFontSize = captionFontSize * 2.4 * scaleFactor;
    const style = {
      fontFamily: `'${captionFontFamily}', sans-serif`,
      fontSize: `${scaledFontSize}px`,
      fontWeight: captionFontWeight || (captionBold ? 700 : 400),
      fontStyle: captionItalic ? "italic" : "normal",
      textDecoration: captionUnderline ? "underline" : "none",
      color: captionColor,
      textAlign: "center",
      lineHeight: captionLineSpacing,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      width: "100%",
    };
    // Background
    if (captionBgOn) {
      style.background = hexToRgba(captionBgColor, captionBgOpacity);
      style.padding = `${captionBgPaddingY * scaleFactor * 0.5}px ${captionBgPaddingX * scaleFactor * 0.5}px`;
      style.borderRadius = captionBgRadius * scaleFactor * 0.5;
    } else {
      style.padding = `${4 * scaleFactor}px ${10 * scaleFactor}px`;
    }
    // Text shadows (stroke + glow + shadow)
    const allShadows = buildAllShadows({
      sf: scaleFactor,
      stroke: { on: captionStrokeOn, width: captionStrokeWidth, color: captionStrokeColor, opacity: captionStrokeOpacity, blur: captionStrokeBlur, offX: captionStrokeOffsetX, offY: captionStrokeOffsetY },
      glow: { on: captionGlowOn, color: captionGlowColor, opacity: captionGlowOpacity, intensity: captionGlowIntensity, blur: captionGlowBlur, blend: captionGlowBlend, offX: captionGlowOffsetX, offY: captionGlowOffsetY },
      shadow: { on: captionShadowOn, color: captionShadowColor, opacity: captionShadowOpacity, blur: captionShadowBlur, offX: captionShadowOffsetX, offY: captionShadowOffsetY },
      order: captionEffectOrder,
    });
    if (allShadows) {
      style.textShadow = allShadows;
    } else {
      style.textShadow = `0 ${2 * scaleFactor}px ${8 * scaleFactor}px rgba(0,0,0,0.6)`;
    }
    return style;
  }, [captionFontFamily, captionFontSize, captionFontWeight, captionBold, captionItalic, captionUnderline, captionColor, captionLineSpacing,
    captionBgOn, captionBgColor, captionBgOpacity, captionBgPaddingX, captionBgPaddingY, captionBgRadius,
    captionStrokeOn, captionStrokeColor, captionStrokeWidth, captionStrokeOpacity, captionStrokeBlur, captionStrokeOffsetX, captionStrokeOffsetY,
    captionGlowOn, captionGlowColor, captionGlowOpacity, captionGlowIntensity, captionGlowBlur, captionGlowBlend, captionGlowOffsetX, captionGlowOffsetY,
    captionShadowOn, captionShadowColor, captionShadowBlur, captionShadowOpacity, captionShadowOffsetX, captionShadowOffsetY,
    scaleFactor, hexToRgba, buildAllShadows, captionEffectOrder]);

  // Strip punctuation from a word based on per-character config
  const stripPunct = useCallback((word) => {
    if (!word) return word;
    const rm = punctuationRemove || {};
    // Check if any removal is active
    const hasAny = Object.values(rm).some(Boolean);
    if (!hasAny) return word;
    let result = word;
    if (rm.ellipsis) result = result.replace(/\.\.\./g, "");
    if (rm.period) result = result.replace(/\./g, "");
    if (rm.comma) result = result.replace(/,/g, "");
    if (rm.question) result = result.replace(/\?/g, "");
    if (rm.exclamation) result = result.replace(/!/g, "");
    if (rm.semicolon) result = result.replace(/;/g, "");
    if (rm.colon) result = result.replace(/:/g, "");
    return result;
  }, [punctuationRemove]);

  // Build character-limit chunks: instead of fixed 3-word chunks, group words
  // until the line exceeds ~20 characters. Long words get fewer per line.
  const buildCharChunks = useCallback((words) => {
    const CHAR_LIMIT = 16;
    const chunks = [];
    let current = [];
    let currentLen = 0;
    for (const w of words) {
      const wordLen = w.word ? w.word.length : 0;
      // If adding this word exceeds the limit AND we already have words, start new chunk
      if (current.length > 0 && currentLen + wordLen + 1 > CHAR_LIMIT) {
        chunks.push(current);
        current = [w];
        currentLen = wordLen;
      } else {
        current.push(w);
        currentLen += (current.length > 1 ? 1 : 0) + wordLen; // +1 for space
      }
    }
    if (current.length > 0) chunks.push(current);
    return chunks;
  }, []);

  // Render subtitle words with karaoke highlight (always 1 line per screen)
  // Track previous single-word segment for grow animation
  const prevSingleWordRef = useRef(null);
  const [singleWordKey, setSingleWordKey] = useState(0);

  const renderSubtitleText = () => {
    if (!currentSeg) return null;
    const words = currentSeg.words || [];
    const isSingleWord = segmentMode === "1word";
    const speed = animateOn ? animateSpeed : 0.1;

    if (words.length > 0) {
      // Character-limit chunking — group words until line exceeds char limit
      const chunks = buildCharChunks(words);
      const activeIdx = currentWordIdx >= 0 ? currentWordIdx : 0;
      // Find which chunk contains the active word
      let cumulative = 0;
      let chunkIdx = 0;
      for (let c = 0; c < chunks.length; c++) {
        if (activeIdx < cumulative + chunks[c].length) {
          chunkIdx = c;
          break;
        }
        cumulative += chunks[c].length;
      }
      const visibleWords = chunks[chunkIdx] || chunks[0];
      // Calculate offset for correct karaoke highlight index
      let visibleOffset = 0;
      for (let c = 0; c < chunkIdx; c++) visibleOffset += chunks[c].length;

      // Single-word grow animation: track segment changes
      if (isSingleWord && animateOn) {
        const segId = currentSeg.id;
        if (prevSingleWordRef.current !== segId) {
          prevSingleWordRef.current = segId;
          setSingleWordKey(k => k + 1);
        }
      }

      return (
        <div style={{ ...subTextStyle, display: "block" }}>
          {visibleWords.map((w, i) => {
            const globalIdx = i + visibleOffset;
            const isActive = karaokeActive && globalIdx === currentWordIdx;
            const wordShadow = isActive ? subWordShadows.active : subWordShadows.normal;

            // Animation styles
            const wordStyle = {
              color: isActive ? highlightColor : (subColor || "#ffffff"),
              textShadow: wordShadow || undefined,
              display: "inline-block", // required for transform
              transformOrigin: "center bottom", // anchor at bottom so pop goes upward
              verticalAlign: "baseline",
              transition: `color ${speed}s, transform ${speed}s ease-out`,
            };

            if (animateOn) {
              if (isSingleWord) {
                // Single word mode: grow from animateGrowFrom to 1.0
                wordStyle.animation = `subGrow ${speed}s ease-out forwards`;
              } else if (isActive) {
                // Karaoke mode: active word pops up to animateScale
                wordStyle.transform = `scale(${animateScale})`;
              } else {
                wordStyle.transform = "scale(1)";
              }
            }

            return (
              <span key={isSingleWord ? `sw-${singleWordKey}-${globalIdx}` : globalIdx} style={wordStyle}>
                {stripPunct(w.word)}{i < visibleWords.length - 1 ? " " : ""}
              </span>
            );
          })}
        </div>
      );
    }

    // Fallback: no word-level data, use segment text with char-limit chunking
    const textWords = currentSeg.text.split(/\s+/);
    const chunks = buildCharChunks(textWords.map(w => ({ word: w })));
    const segDuration = currentSeg.endSec - currentSeg.startSec;
    const progress = segDuration > 0 ? (currentTime - currentSeg.startSec) / segDuration : 0;
    const chunkIdx = Math.min(Math.floor(progress * chunks.length), chunks.length - 1);
    const visibleText = (chunks[chunkIdx] || []).map(w => stripPunct(w.word)).join(" ");
    return <div style={{ ...subTextStyle, display: "block", textShadow: subWordShadows.normal || undefined }}>{visibleText}</div>;
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
    setActivePanel("subs");
    setDrawerOpen(true);
  }, [setActivePanel, setDrawerOpen]);


  // Dynamic CSS for single-word grow animation
  const growKeyframes = animateOn ? `@keyframes subGrow { from { transform: scale(${animateGrowFrom}); transform-origin: center bottom; } to { transform: scale(1); transform-origin: center bottom; } }` : "";

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full w-full overflow-hidden relative select-none"
      style={{ background: "hsl(240 8% 3%)" }}
    >
      {growKeyframes && <style>{growKeyframes}</style>}
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
            ref={zoomBtnRef}
            className="flex items-center gap-1 px-2 py-1 rounded bg-black/40 hover:bg-black/60 text-white/80 hover:text-white text-[11px] font-medium backdrop-blur-sm transition-colors"
            onClick={() => setZoomMenuOpen((prev) => !prev)}
          >
            {displayZoom}
            <ChevronDown className={`h-3 w-3 transition-transform ${zoomMenuOpen ? "rotate-180" : ""}`} />
          </button>
          {zoomMenuOpen && (
            <ZoomMenu
              zoom={zoom === -1 ? 100 : zoom}
              setZoom={setZoomState}
              onClose={() => setZoomMenuOpen(false)}
              triggerRef={zoomBtnRef}
            />
          )}
        </div>
      </div>

      {/* Video canvas area — scrollable when zoomed in, middle-click to pan */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto p-1"
        style={{ cursor: isPanning ? "grabbing" : (zoom !== -1 ? "default" : "default"), display: "flex", alignItems: zoom === -1 ? "center" : "flex-start", justifyContent: zoom === -1 ? "center" : "flex-start" }}
        onWheel={onWheel}
        onPointerDown={onPanDown}
        onContextMenu={(e) => { if (isPanning) e.preventDefault(); }}
      >
        <div
          ref={canvasRef}
          className="relative rounded-lg shrink-0"
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
          {/* Video element (overflow-hidden here for rounded corners) */}
          <div className="absolute inset-0 overflow-hidden rounded-lg" />
          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              className="absolute inset-0 w-full h-full object-contain rounded-lg"
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

          {/* Caption overlay(s) — render all active caption segments at current time */}
          {captionSegments
            .filter((seg) => seg.text && currentTime >= seg.startSec && currentTime <= (seg.endSec ?? Infinity))
            .map((seg, idx) => (
            <DraggableOverlay
              key={seg.id}
              yPercent={capYPercent}
              onYChange={setCapYPercent}
              widthPercent={capWidthPercent}
              onWidthChange={setCapWidthPercent}
              selected={selectedOverlay === "cap"}
              onSelect={setSelectedOverlay}
              overlayId="cap"
              canvasRef={canvasRef}
              overlayRef={idx === 0 ? capOverlayRef : undefined}
            >
              {editingCaption && selectedOverlay === "cap" && idx === 0 ? (
                <textarea
                  ref={(el) => {
                    captionInputRef.current = el;
                    if (el) {
                      el.style.height = "auto";
                      el.style.height = el.scrollHeight + "px";
                    }
                  }}
                  value={seg.text}
                  onChange={(e) => {
                    useCaptionStore.getState().updateCaptionSegmentText(seg.id, e.target.value);
                    if (captionInputRef.current) {
                      captionInputRef.current.style.height = "auto";
                      captionInputRef.current.style.height = captionInputRef.current.scrollHeight + "px";
                    }
                  }}
                  onBlur={() => setEditingCaption(false)}
                  onKeyDown={(e) => { if (e.key === "Escape") setEditingCaption(false); }}
                  className="bg-transparent border-none outline-none resize-none text-center w-full"
                  style={{
                    ...capTextStyle,
                    minWidth: 60,
                    cursor: "text",
                    overflow: "hidden",
                  }}
                  autoFocus
                />
              ) : (
                <div
                  style={capTextStyle}
                  onDoubleClick={onCaptionDoubleClick}
                >
                  {seg.text}
                </div>
              )}
              {/* Inline toolbar below caption when selected */}
              {selectedOverlay === "cap" && idx === 0 && (
                <div className="absolute left-1/2 -translate-x-1/2 mt-1 pointer-events-auto z-40" style={{ top: "100%" }} onClick={(e) => e.stopPropagation()}>
                  <InlineToolbar
                    target="cap"
                    fontFamily={captionFontFamily}
                    fontSize={captionFontSize}
                    fontWeight={captionFontWeight}
                    onFontFamily={setCaptionFontFamily}
                    onFontSize={setCaptionFontSize}
                    onFontWeight={setCaptionFontWeight}
                    color={captionColor}
                    onColor={(c) => useCaptionStore.getState().setCaptionColor(c)}
                  />
                </div>
              )}
            </DraggableOverlay>
          ))}

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
              {/* Inline toolbar below subtitle when selected */}
              {selectedOverlay === "sub" && (
                <div className="absolute left-1/2 -translate-x-1/2 mt-1 pointer-events-auto z-40" style={{ top: "100%" }} onClick={(e) => e.stopPropagation()}>
                  <InlineToolbar
                    target="sub"
                    fontFamily={subFontFamily}
                    fontSize={fontSize}
                    fontWeight={subFontWeight}
                    onFontFamily={setSubFontFamily}
                    onFontSize={setFontSize}
                    onFontWeight={setSubFontWeight}
                    color={subColor}
                    onColor={setSubColor}
                  />
                </div>
              )}
            </DraggableOverlay>
          )}

        </div>
      </div>

      {/* Toolbar spacer — toolbar is now inside canvas overlays */}
    </div>
  );
}
