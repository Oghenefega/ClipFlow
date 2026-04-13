import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import usePlaybackStore from "../stores/usePlaybackStore";
import useSubtitleStore from "../stores/useSubtitleStore";
import useCaptionStore from "../stores/useCaptionStore";
import useEditorStore from "../stores/useEditorStore";
import useLayoutStore from "../stores/useLayoutStore";
import { SubtitleOverlay, CaptionOverlay } from "./PreviewOverlays";
import { buildCaptionStyle } from "../utils/subtitleStyleEngine";
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
  const videoVersion = useEditorStore((s) => s.videoVersion);

  // Playback
  const playing = usePlaybackStore((s) => s.playing);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const setCurrentTime = usePlaybackStore((s) => s.setCurrentTime);
  const setDuration = usePlaybackStore((s) => s.setDuration);
  const setPlaying = usePlaybackStore((s) => s.setPlaying);
  const initVideoRef = usePlaybackStore((s) => s.initVideoRef);
  const setWaveformPeaks = useEditorStore((s) => s.setWaveformPeaks);
  const initNleSegments = useEditorStore((s) => s.initNleSegments);

  // Subtitles — raw segments (source-absolute), mapped to timeline below after nleSegments loads
  const rawEditSegments = useSubtitleStore((s) => s.editSegments);
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

  // ── Construct style config objects for shared overlays ──
  // Same shape as clip.subtitleStyle / clip.captionStyle (what handleSave persists)
  const subtitleStyleConfig = useMemo(() => ({
    fontFamily: subFontFamily, fontWeight: subFontWeight,
    fontSize, bold: subBold, italic: subItalic, underline: subUnderline,
    subColor,
    strokeOn, strokeWidth, strokeColor, strokeOpacity, strokeBlur, strokeOffsetX, strokeOffsetY,
    shadowOn, shadowBlur, shadowColor, shadowOpacity, shadowOffsetX, shadowOffsetY,
    glowOn, glowColor, glowOpacity, glowIntensity, glowBlur, glowBlend, glowOffsetX, glowOffsetY,
    bgOn, bgOpacity, bgColor, bgPaddingX, bgPaddingY, bgRadius,
    effectOrder, highlightColor,
    animateOn, animateScale, animateGrowFrom, animateSpeed,
    segmentMode, punctuationRemove,
  }), [subFontFamily, subFontWeight, fontSize, subBold, subItalic, subUnderline, subColor,
    strokeOn, strokeWidth, strokeColor, strokeOpacity, strokeBlur, strokeOffsetX, strokeOffsetY,
    shadowOn, shadowBlur, shadowColor, shadowOpacity, shadowOffsetX, shadowOffsetY,
    glowOn, glowColor, glowOpacity, glowIntensity, glowBlur, glowBlend, glowOffsetX, glowOffsetY,
    bgOn, bgOpacity, bgColor, bgPaddingX, bgPaddingY, bgRadius,
    effectOrder, highlightColor, animateOn, animateScale, animateGrowFrom, animateSpeed,
    segmentMode, punctuationRemove]);

  const captionStyleConfig = useMemo(() => ({
    fontFamily: captionFontFamily, fontWeight: captionFontWeight,
    fontSize: captionFontSize, bold: captionBold, italic: captionItalic,
    underline: captionUnderline, color: captionColor, lineSpacing: captionLineSpacing,
    strokeOn: captionStrokeOn, strokeColor: captionStrokeColor, strokeWidth: captionStrokeWidth,
    strokeOpacity: captionStrokeOpacity, strokeBlur: captionStrokeBlur,
    strokeOffsetX: captionStrokeOffsetX, strokeOffsetY: captionStrokeOffsetY,
    glowOn: captionGlowOn, glowColor: captionGlowColor, glowOpacity: captionGlowOpacity,
    glowIntensity: captionGlowIntensity, glowBlur: captionGlowBlur, glowBlend: captionGlowBlend,
    glowOffsetX: captionGlowOffsetX, glowOffsetY: captionGlowOffsetY,
    shadowOn: captionShadowOn, shadowColor: captionShadowColor, shadowOpacity: captionShadowOpacity,
    shadowBlur: captionShadowBlur, shadowOffsetX: captionShadowOffsetX, shadowOffsetY: captionShadowOffsetY,
    bgOn: captionBgOn, bgColor: captionBgColor, bgOpacity: captionBgOpacity,
    bgPaddingX: captionBgPaddingX, bgPaddingY: captionBgPaddingY, bgRadius: captionBgRadius,
    effectOrder: captionEffectOrder,
  }), [captionFontFamily, captionFontWeight, captionFontSize, captionBold, captionItalic,
    captionUnderline, captionColor, captionLineSpacing,
    captionStrokeOn, captionStrokeColor, captionStrokeWidth, captionStrokeOpacity, captionStrokeBlur,
    captionStrokeOffsetX, captionStrokeOffsetY,
    captionGlowOn, captionGlowColor, captionGlowOpacity, captionGlowIntensity, captionGlowBlur,
    captionGlowBlend, captionGlowOffsetX, captionGlowOffsetY,
    captionShadowOn, captionShadowColor, captionShadowOpacity, captionShadowBlur,
    captionShadowOffsetX, captionShadowOffsetY,
    captionBgOn, captionBgColor, captionBgOpacity, captionBgPaddingX, captionBgPaddingY,
    captionBgRadius, captionEffectOrder]);

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

  // Abort video fetch on unmount — prevents Chromium renderer crash
  // (blink::DOMDataStore::GetWrapper null deref when stream outlives element)
  useEffect(() => {
    return () => {
      const vid = videoRef.current;
      if (vid) {
        vid.pause();
        vid.removeAttribute("src");
        vid.load();
      }
    };
  }, []);

  // Video source path — use clip's cut file for now.
  // Phase 4 (segment-aware playback) will switch to project.sourceFile
  // so the video plays the original recording with NLE segments controlling what's visible.
  const videoSrc = useMemo(() => {
    if (!clip?.filePath) return null;
    const cacheBuster = videoVersion > 0 ? `?v=${videoVersion}` : "";
    return `file://${clip.filePath.replace(/\\/g, "/")}${cacheBuster}`;
  }, [clip?.filePath, videoVersion]);

  // Force video reload when videoSrc changes (React setAttribute doesn't auto-load)
  const prevVideoSrcRef = useRef(null);
  useEffect(() => {
    if (videoSrc && videoRef.current && prevVideoSrcRef.current !== null && prevVideoSrcRef.current !== videoSrc) {
      videoRef.current.load();
    }
    prevVideoSrcRef.current = videoSrc;
  }, [videoSrc]);

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

  // Mouse wheel zoom anchored to cursor position (vertical scroll only)
  // Allow horizontal scroll (e.g. MX Master horizontal wheel) to pass through
  const onWheel = useCallback((e) => {
    // Only intercept vertical scroll for zoom — let horizontal scroll pass through
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    const container = scrollContainerRef.current;
    if (!container) {
      setZoomState((z) => {
        const current = z === -1 ? 100 : z;
        const delta = e.deltaY < 0 ? 10 : -10;
        return Math.max(10, Math.min(400, current + delta));
      });
      return;
    }

    const rect = container.getBoundingClientRect();
    // Mouse position relative to container viewport
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    // Mouse position in scrolled content space
    const contentX = container.scrollLeft + mouseX;
    const contentY = container.scrollTop + mouseY;

    setZoomState((z) => {
      const oldZoom = z === -1 ? 100 : z;
      const delta = e.deltaY < 0 ? 10 : -10;
      const newZoom = Math.max(10, Math.min(400, oldZoom + delta));

      // After React re-renders with new zoom, adjust scroll to keep mouse point fixed
      const scale = newZoom / oldZoom;
      requestAnimationFrame(() => {
        if (newZoom <= 100) {
          // At or below 100%, content is centered — no scroll adjustment needed
          container.scrollLeft = 0;
          container.scrollTop = 0;
        } else {
          // Scale the content position under the mouse and re-center it
          container.scrollLeft = contentX * scale - mouseX;
          container.scrollTop = contentY * scale - mouseY;
        }
      });

      return newZoom;
    });
  }, []);

  // Middle-mouse drag to pan zoomed preview
  const onPanDown = useCallback((e) => {
    if (e.button !== 1) return; // middle mouse only
    e.preventDefault();
    e.stopPropagation();
    const container = scrollContainerRef.current;
    if (!container) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY, scrollLeft: container.scrollLeft, scrollTop: container.scrollTop };
    const onMove = (ev) => {
      ev.preventDefault();
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

  // Prevent browser auto-scroll on middle-click
  const onAuxClick = useCallback((e) => {
    if (e.button === 1) e.preventDefault();
  }, []);

  // Adjusted time for subtitle sync
  const adjustedTime = currentTime - syncOffset;
  const karaokeActive = subMode === "karaoke" && segmentMode !== "1word";

  // NLE segments from editor store — used for gap-crossing during playback
  const nleSegments = useEditorStore((s) => s.nleSegments);
  const mapSourceTime = usePlaybackStore((s) => s.mapSourceTime);

  // Derive timeline-mapped subtitle segments (source-absolute → timeline time)
  const editSegments = useMemo(
    () => useSubtitleStore.getState().getTimelineMappedSegments(),
    [rawEditSegments, nleSegments] // re-derive when either store changes
  );

  // 60fps rAF loop — SOLE source of currentTime updates during playback
  // Video element plays source file; we map source time → timeline time via NLE segments
  useEffect(() => {
    if (!playing) return;
    let rafId;
    const tick = () => {
      const video = videoRef.current;
      if (!video) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const sourceTime = video.currentTime;
      const result = mapSourceTime(sourceTime);

      if (result.atEnd) {
        // Past last segment — stop playback
        video.pause();
        setCurrentTime(result.timelineTime);
        setPlaying(false);
        return;
      }

      if (result.needsSeek) {
        // At segment boundary or in gap — seek to next segment's source position
        video.currentTime = result.seekToSource;
      }

      // Update store with timeline time (not source time)
      setCurrentTime(result.timelineTime);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing, setCurrentTime, setPlaying, mapSourceTime, nleSegments]);

  // Video event handlers — only enforce bounds when paused (seek while paused)
  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.paused) return; // rAF handles playback — only act when paused

    const sourceTime = video.currentTime;
    const result = mapSourceTime(sourceTime);

    if (result.atEnd) {
      setCurrentTime(result.timelineTime);
    } else if (result.needsSeek) {
      video.currentTime = result.seekToSource;
    } else {
      setCurrentTime(result.timelineTime);
    }
  }, [setCurrentTime, mapSourceTime]);

  const onLoadedMetadata = useCallback(() => {
    if (videoRef.current && videoRef.current.duration && isFinite(videoRef.current.duration)) {
      // Duration comes from NLE segments (timeline duration), not video.duration (source duration)
      // The editor store sets this when nleSegments change, but set source duration as fallback
      // Ensure NLE segments exist — creates them from video duration if missing
      // (handles clips without startTime/endTime or saved nleSegments)
      initNleSegments(videoRef.current.duration);

      const editorNleSegs = useEditorStore.getState().nleSegments;
      if (!editorNleSegs || editorNleSegs.length === 0) {
        setDuration(videoRef.current.duration);
      }

      // Extract waveform peaks from clip file (Phase 4 will switch to source)
      const sourcePath = clip?.filePath;
      if (sourcePath && window.clipflow?.ffmpegExtractWaveformPeaks) {
        window.clipflow.ffmpegExtractWaveformPeaks(sourcePath, 800).then((result) => {
          if (result?.peaks?.length > 0) {
            setWaveformPeaks(result.peaks);
          }
        }).catch((err) => {
          console.warn("Waveform extraction failed:", err);
        });
      }
    }
  }, [setDuration, initNleSegments, clip?.filePath, setWaveformPeaks]);

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

  // Caption text style — needed for inline editing textarea
  const capTextStyle = useMemo(
    () => buildCaptionStyle(captionStyleConfig, scaleFactor),
    [captionStyleConfig, scaleFactor]
  );

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
        style={{ cursor: isPanning ? "grabbing" : "default", display: "flex", alignItems: (zoom === -1 || zoom <= 100) ? "center" : "flex-start", justifyContent: (zoom === -1 || zoom <= 100) ? "center" : "flex-start" }}
        onWheel={onWheel}
        onPointerDown={onPanDown}
        onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
        onAuxClick={onAuxClick}
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

          {/* Subtitle overlay — shared renderer (no width resize, just move) */}
          {showSubs && editSegments.length > 0 && (
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
                <SubtitleOverlay
                  segments={editSegments}
                  currentTime={currentTime}
                  syncOffset={syncOffset}
                  subtitleStyle={subtitleStyleConfig}
                  scaleFactor={scaleFactor}
                  karaokeActive={karaokeActive}
                />
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
