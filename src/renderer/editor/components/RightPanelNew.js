import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Separator } from "../../../components/ui/separator";
import { ScrollArea } from "../../../components/ui/scroll-area";
import { Button } from "../../../components/ui/button";
import { Slider } from "../../../components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip";
import {
  Sparkles, Palette, Captions, Type, Music, Upload, ImagePlus,
  X, Search, Play, Star, Plus, Minus, ChevronDown, ChevronRight,
  Check, RefreshCw, Loader2, AlignLeft, AlignCenter, AlignRight,
  Bold, Italic, Underline, Pipette, Heart,
  UploadCloud, FolderOpen, FileImage, Film, Volume2,
} from "lucide-react";
import useSubtitleStore from "../stores/useSubtitleStore";
import useCaptionStore from "../stores/useCaptionStore";
import useAIStore from "../stores/useAIStore";
import useEditorStore from "../stores/useEditorStore";
import useLayoutStore from "../stores/useLayoutStore";

// ════════════════════════════════════════════════════════════════
//  SHARED: Color Palette (matches Vizard predefined palette)
// ════════════════════════════════════════════════════════════════
const PALETTE_COLORS = [
  "#ffffff","#4cce8a","#000000","#333333","#555555","#777777","#999999","#bbbbbb",
  "#e8e87a","#cccc00","#a0a000","#808000","#606000","#404000","#e0e0e0","#c0c0c0",
  "#f87171","#ef4444","#dc2626","#ff8c00","#ffa500","#ffbf00","#ffd700","#ffec8b",
  "#d946ef","#c026d3","#f87171","#fb923c","#fbbf24","#a3e635","#34d399","#22d3ee",
  "#818cf8","#a78bfa","#c084fc","#e879f9","#f472b6","#fb7185","#6366f1","#8b5cf6",
];

// ════════════════════════════════════════════════════════════════
//  SHARED: Section Label
// ════════════════════════════════════════════════════════════════
function SectionLabel({ children, className = "" }) {
  return <div className={`text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 ${className}`}>{children}</div>;
}

// ════════════════════════════════════════════════════════════════
//  SHARED: Hold-to-repeat button
// ════════════════════════════════════════════════════════════════
function RepeatButton({ onClick, children, className }) {
  const intervalRef = useRef(null);
  const onDown = useCallback(() => {
    onClick();
    let delay = 400;
    const repeat = () => {
      intervalRef.current = setTimeout(() => { onClick(); delay = Math.max(50, delay * 0.85); repeat(); }, delay);
    };
    repeat();
  }, [onClick]);
  const onUp = useCallback(() => { clearTimeout(intervalRef.current); }, []);
  useEffect(() => () => clearTimeout(intervalRef.current), []);
  return (
    <button className={className} onMouseDown={onDown} onMouseUp={onUp} onMouseLeave={onUp}>
      {children}
    </button>
  );
}

// ════════════════════════════════════════════════════════════════
//  SHARED: Toggle Switch
// ════════════════════════════════════════════════════════════════
function ToggleSwitch({ value, onChange, size = "default" }) {
  const w = size === "sm" ? "w-8 h-4" : "w-9 h-5";
  const dot = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  const off = size === "sm" ? "left-0.5" : "left-0.5";
  const on = size === "sm" ? "left-[16px]" : "left-[18px]";
  return (
    <button onClick={() => onChange(!value)} className={`relative ${w} rounded-full transition-colors duration-200 cursor-pointer shrink-0 ${value ? "bg-primary" : "bg-secondary"}`}>
      <span className={`absolute top-0.5 ${dot} rounded-full bg-white shadow-sm transition-transform duration-200 ${value ? on : off}`} />
    </button>
  );
}

// ════════════════════════════════════════════════════════════════
//  SHARED: HSV ↔ RGB helpers
// ════════════════════════════════════════════════════════════════
function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0, s = max === 0 ? 0 : d / max, v = max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, s, v];
}

function rgbToHex(r, g, b) {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [255, 255, 255];
}

// ════════════════════════════════════════════════════════════════
//  SHARED: Color Picker Popover (proper HSV model)
// ════════════════════════════════════════════════════════════════
function ColorPickerPopover({ color, onChange, children }) {
  const [hex, setHex] = useState(color || "#ffffff");
  const [r, setR] = useState(255);
  const [g, setG] = useState(255);
  const [b, setB] = useState(255);
  const [hue, setHue] = useState(0);
  const [sat, setSat] = useState(0);
  const [val, setVal] = useState(1);
  const [open, setOpen] = useState(false);
  const gradientRef = useRef(null);
  const hueRef = useRef(null);

  // Sync state from prop when popover opens
  useEffect(() => {
    if (open && color) {
      const [cr, cg, cb] = hexToRgb(color);
      setR(cr); setG(cg); setB(cb); setHex(color);
      const [ch, cs, cv] = rgbToHsv(cr, cg, cb);
      setHue(ch); setSat(cs); setVal(cv);
    }
  }, [open, color]);

  const applyHSV = (h, s, v) => {
    setHue(h); setSat(s); setVal(v);
    const [nr, ng, nb] = hsvToRgb(h, s, v);
    setR(nr); setG(ng); setB(nb);
    const nh = rgbToHex(nr, ng, nb);
    setHex(nh);
    onChange(nh);
  };

  const applyRGB = (nr, ng, nb) => {
    setR(nr); setG(ng); setB(nb);
    const nh = rgbToHex(nr, ng, nb);
    setHex(nh); onChange(nh);
    const [ch, cs, cv] = rgbToHsv(nr, ng, nb);
    setHue(ch); setSat(cs); setVal(cv);
  };

  const handlePaletteClick = (c) => {
    const [cr, cg, cb] = hexToRgb(c);
    setR(cr); setG(cg); setB(cb); setHex(c); onChange(c);
    const [ch, cs, cv] = rgbToHsv(cr, cg, cb);
    setHue(ch); setSat(cs); setVal(cv);
  };

  const handleHexInput = (val) => {
    setHex(val);
    if (/^#[0-9a-f]{6}$/i.test(val)) {
      const [cr, cg, cb] = hexToRgb(val);
      applyRGB(cr, cg, cb);
    }
  };

  // Gradient drag support
  const onGradientInteract = useCallback((e) => {
    const rect = (gradientRef.current || e.currentTarget).getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    applyHSV(hue, x, 1 - y);
  }, [hue]);

  const onGradientDown = useCallback((e) => {
    onGradientInteract(e);
    const onMove = (ev) => {
      const rect = gradientRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
      applyHSV(hue, x, 1 - y);
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [hue, onGradientInteract]);

  // Hue bar drag support
  const onHueInteract = useCallback((e) => {
    const rect = (hueRef.current || e.currentTarget).getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    applyHSV(x * 360, sat, val);
  }, [sat, val]);

  const onHueDown = useCallback((e) => {
    onHueInteract(e);
    const onMove = (ev) => {
      const rect = hueRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      applyHSV(x * 360, sat, val);
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [sat, val, onHueInteract]);

  // Pure hue color for gradient background
  const pureHueHex = useMemo(() => rgbToHex(...hsvToRgb(hue, 1, 1)), [hue]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-[260px] p-3 bg-card border-border" side="left" align="start" sideOffset={8}>
        {/* SV gradient area */}
        <div
          ref={gradientRef}
          className="w-full h-[140px] rounded-md mb-3 cursor-crosshair relative overflow-hidden"
          style={{
            background: `linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, ${pureHueHex})`,
          }}
          onPointerDown={onGradientDown}
        >
          {/* Picker dot */}
          <div
            className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-md pointer-events-none"
            style={{
              left: `${sat * 100}%`, top: `${(1 - val) * 100}%`,
              transform: "translate(-50%, -50%)",
              background: hex,
            }}
          />
        </div>

        {/* Hue spectrum bar */}
        <div
          ref={hueRef}
          className="w-full h-3 rounded-full mb-3 cursor-pointer relative"
          style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
          onPointerDown={onHueDown}
        >
          <div
            className="absolute top-1/2 w-3 h-3 rounded-full border-2 border-white shadow pointer-events-none"
            style={{ left: `${(hue / 360) * 100}%`, transform: "translate(-50%, -50%)", background: pureHueHex }}
          />
        </div>

        {/* RGB inputs */}
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-[10px] text-muted-foreground w-7 shrink-0">RGB</span>
          {[
            { val: r, set: (v) => applyRGB(v, g, b) },
            { val: g, set: (v) => applyRGB(r, v, b) },
            { val: b, set: (v) => applyRGB(r, g, v) },
          ].map((ch, i) => (
            <input key={i} type="number" min={0} max={255} value={ch.val}
              onChange={(e) => ch.set(Math.max(0, Math.min(255, parseInt(e.target.value) || 0)))}
              className="w-12 h-6 text-[10px] text-center rounded bg-secondary border border-border text-foreground outline-none focus:border-primary/40"
            />
          ))}
          <input value={hex} onChange={(e) => handleHexInput(e.target.value)}
            className="flex-1 h-6 text-[10px] text-center rounded bg-secondary border border-border text-foreground outline-none focus:border-primary/40"
          />
        </div>

        {/* Predefined palette */}
        <div className="grid grid-cols-8 gap-1">
          {PALETTE_COLORS.map((c, i) => (
            <button key={i} onClick={() => handlePaletteClick(c)}
              className={`w-6 h-6 rounded-full border cursor-pointer transition-transform hover:scale-110 ${hex === c ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : ""}`}
              style={{ background: c, borderColor: c === "#ffffff" ? "hsl(240 4% 30%)" : "transparent" }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ════════════════════════════════════════════════════════════════
//  SHARED: Font/Style toolbar row
// ════════════════════════════════════════════════════════════════
const FONT_OPTIONS = ["Latina Essential", "Montserrat", "DM Sans", "Impact", "Arial", "Roboto", "Inter", "Oswald", "Poppins"];

function FontToolbar({ fontFamily, setFontFamily, fontWeight, setFontWeight, fontSize, setFontSize, align, setAlign, bold, setBold, italic, setItalic, underline, setUnderline, color, setColor, lineMode, setLineMode }) {
  return (
    <div className="space-y-2">
      {/* Font + weight + size */}
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}
            className="w-full h-8 px-2 pr-6 text-xs rounded-md bg-secondary border border-border text-foreground outline-none appearance-none cursor-pointer focus:border-primary/40"
          >
            {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        </div>
        {setFontWeight && (
          <div className="relative w-20">
            <select value={fontWeight || 400} onChange={(e) => setFontWeight(parseInt(e.target.value))}
              className="w-full h-8 px-2 pr-5 text-xs rounded-md bg-secondary border border-border text-foreground outline-none appearance-none cursor-pointer focus:border-primary/40"
            >
              <option value={300}>Light</option>
              <option value={400}>Regular</option>
              <option value={500}>Medium</option>
              <option value={700}>Bold</option>
              <option value={900}>Heavy</option>
            </select>
            <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>
        )}
        <div className="flex items-center w-20">
          <RepeatButton onClick={() => setFontSize(Math.max(1, fontSize - 1))}
            className="w-6 h-8 rounded-l-md bg-secondary border border-border border-r-0 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors">
            <Minus className="h-3 w-3" />
          </RepeatButton>
          <input type="text" value={fontSize}
            onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 1 && v <= 999) setFontSize(v); }}
            onFocus={(e) => e.target.select()}
            onWheel={(e) => { e.preventDefault(); setFontSize(Math.max(1, Math.min(999, fontSize + (e.deltaY < 0 ? 1 : -1)))); }}
            className="w-8 h-8 text-xs text-center bg-secondary border-y border-border text-foreground outline-none focus:border-primary/40" />
          <RepeatButton onClick={() => setFontSize(Math.min(999, fontSize + 1))}
            className="w-6 h-8 rounded-r-md bg-secondary border border-border border-l-0 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors">
            <Plus className="h-3 w-3" />
          </RepeatButton>
        </div>
      </div>

      {/* Alignment + B/I/U */}
      <div className="flex gap-1">
        {[
          { icon: AlignLeft, val: "left" }, { icon: AlignCenter, val: "center" }, { icon: AlignRight, val: "right" },
        ].map(({ icon: Icon, val }) => (
          <button key={val} onClick={() => setAlign?.(val)}
            className={`h-8 w-8 rounded-md flex items-center justify-center text-xs transition-colors ${align === val ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}>
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
        <Separator orientation="vertical" className="h-6 self-center mx-0.5" />
        <button onClick={() => setBold?.(!bold)} className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${bold ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60"}`}>
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setItalic?.(!italic)} className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${italic ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60"}`}>
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setUnderline?.(!underline)} className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${underline ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60"}`}>
          <Underline className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Casing + size + color */}
      <div className="flex items-center gap-1">
        <button className="h-8 px-2.5 rounded-md text-xs text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors">Aa</button>
        <button className="h-8 px-2.5 rounded-md text-xs text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors">AB</button>
        <Separator orientation="vertical" className="h-5 mx-0.5" />
        <span className="text-xs text-muted-foreground px-1">{fontSize}</span>
        {color !== undefined && setColor && (
          <ColorPickerPopover color={color} onChange={setColor}>
            <button className="w-6 h-6 rounded-full border border-border/60 cursor-pointer ml-auto shrink-0" style={{ background: color }} />
          </ColorPickerPopover>
        )}
      </div>

      {/* Line mode removed — always 1L for fast-paced content */}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  SHARED: Expandable effect section (Shadow, Stroke, Background)
// ════════════════════════════════════════════════════════════════
function EffectSection({ label, enabled, onToggle, color, onColorChange, children }) {
  return (
    <div className="border-t border-border/40">
      <div className="flex items-center justify-between py-3 px-1">
        <span className="text-xs text-foreground font-medium">{label}</span>
        <div className="flex items-center gap-2">
          {enabled && color && (
            <ColorPickerPopover color={color} onChange={onColorChange}>
              <button className="w-5 h-5 rounded-full border border-border/60 cursor-pointer" style={{ background: color }} />
            </ColorPickerPopover>
          )}
          <button onClick={() => onToggle(!enabled)} className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors">
            {enabled ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {enabled && children && <div className="pb-3 px-1">{children}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  SHARED: Drop Zone
// ════════════════════════════════════════════════════════════════
function DropZone({ accept, label, icon: Icon = UploadCloud }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); }}
      className={`border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
        dragOver ? "border-primary/50 bg-primary/5" : "border-border/40 hover:border-border/60"
      }`}
    >
      <Icon className="h-6 w-6 text-muted-foreground/50" />
      <div className="text-[11px] text-muted-foreground text-center">
        Drop {accept || "files"}<br />
        or <span className="text-primary cursor-pointer hover:underline">browse</span>
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
//  DRAWER 1: AI TOOLS
// ════════════════════════════════════════════════════════════════
function AIToolsPanel({ gamesDb, anthropicApiKey }) {
  const voiceMode = useAIStore((s) => s.voiceMode);
  const setVoiceMode = useAIStore((s) => s.setVoiceMode);
  const aiContext = useAIStore((s) => s.aiContext);
  const setAiContext = useAIStore((s) => s.setAiContext);
  const aiGame = useAIStore((s) => s.aiGame);
  const setAiGame = useAIStore((s) => s.setAiGame);
  const aiGenerating = useAIStore((s) => s.aiGenerating);
  const aiError = useAIStore((s) => s.aiError);
  const aiSuggestions = useAIStore((s) => s.aiSuggestions);
  const aiRejections = useAIStore((s) => s.aiRejections);
  const acceptedTitleIdx = useAIStore((s) => s.acceptedTitleIdx);
  const acceptedCaptionIdx = useAIStore((s) => s.acceptedCaptionIdx);
  const generate = useAIStore((s) => s.generate);
  const acceptTitle = useAIStore((s) => s.acceptTitle);
  const acceptCaption = useAIStore((s) => s.acceptCaption);
  const reject = useAIStore((s) => s.reject);

  return (
    <div className="p-3 space-y-3">
      {/* Voice mode */}
      <div>
        <SectionLabel>Voice</SectionLabel>
        <div className="flex gap-1.5">
          {["hype", "chill"].map((m) => (
            <button key={m} onClick={() => setVoiceMode(m)}
              className={`flex-1 h-8 rounded-md text-xs font-medium transition-colors ${voiceMode === m ? "bg-primary/15 text-primary border border-primary/30" : "bg-secondary/50 text-muted-foreground border border-transparent hover:bg-secondary"}`}>
              {m === "hype" ? "🔥 Hype" : "😎 Chill"}
            </button>
          ))}
        </div>
      </div>

      {/* Context */}
      <div>
        <SectionLabel>Context (optional)</SectionLabel>
        <textarea value={aiContext} onChange={(e) => setAiContext(e.target.value)} rows={2} placeholder="Add context for better titles..."
          className="w-full px-2.5 py-2 text-xs rounded-md bg-secondary/50 border border-border text-foreground outline-none resize-y placeholder:text-muted-foreground focus:border-primary/30" />
      </div>

      {/* Game + Generate */}
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <select value={aiGame} onChange={(e) => setAiGame(e.target.value)}
            className="w-full h-8 px-2 pr-6 text-xs rounded-md bg-secondary border border-border text-foreground outline-none appearance-none cursor-pointer">
            <option value="">Auto-detect</option>
            {(gamesDb || []).map(g => <option key={g.tag} value={g.name}>{g.name}</option>)}
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        </div>
        <Button size="sm" onClick={() => generate(anthropicApiKey, gamesDb)} disabled={aiGenerating}
          className="h-8 px-3 text-xs bg-primary text-primary-foreground disabled:opacity-50">
          {aiGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Sparkles className="h-3 w-3 mr-1" />Generate</>}
        </Button>
      </div>

      {/* Error */}
      {aiError && <div className="text-[11px] text-red-400 bg-red-500/10 rounded-md px-2.5 py-2">{aiError}</div>}

      {/* Results */}
      {aiSuggestions && (
        <div className="space-y-3">
          {/* Titles */}
          <div>
            <SectionLabel>Titles</SectionLabel>
            <div className="space-y-1.5">
              {(aiSuggestions.titles || []).map((t, i) => {
                const isAccepted = acceptedTitleIdx === i;
                const isRejected = aiRejections.includes(t.title);
                return (
                  <div key={i} className={`rounded-md border p-2.5 transition-colors ${isAccepted ? "border-green-500/40 bg-green-500/5" : isRejected ? "opacity-40 border-border/30" : "border-border/40 hover:border-border/60"}`}>
                    <div className="text-xs text-foreground font-medium mb-1">{t.title}</div>
                    {t.why && <div className="text-[10px] text-muted-foreground mb-2">{t.why}</div>}
                    <div className="flex gap-1">
                      {isAccepted ? (
                        <span className="text-[10px] text-green-500 flex items-center gap-1"><Check className="h-3 w-3" /> Applied</span>
                      ) : !isRejected && (
                        <>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-primary hover:bg-primary/10" onClick={() => acceptTitle(t, i)}>Apply</Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-muted-foreground" onClick={() => reject(t.title)}>Skip</Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Captions */}
          <div>
            <SectionLabel>Captions</SectionLabel>
            <div className="space-y-1.5">
              {(aiSuggestions.captions || []).map((c, i) => {
                const isAccepted = acceptedCaptionIdx === i;
                const isRejected = aiRejections.includes(c.caption);
                return (
                  <div key={i} className={`rounded-md border p-2.5 transition-colors ${isAccepted ? "border-green-500/40 bg-green-500/5" : isRejected ? "opacity-40 border-border/30" : "border-border/40 hover:border-border/60"}`}>
                    <div className="text-xs text-foreground mb-1">{c.caption}</div>
                    {c.why && <div className="text-[10px] text-muted-foreground mb-2">{c.why}</div>}
                    <div className="flex gap-1">
                      {isAccepted ? (
                        <span className="text-[10px] text-green-500 flex items-center gap-1"><Check className="h-3 w-3" /> Applied</span>
                      ) : !isRejected && (
                        <>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-primary hover:bg-primary/10" onClick={() => acceptCaption(c, i)}>Apply</Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-muted-foreground" onClick={() => reject(c.caption)}>Skip</Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Regenerate */}
          {aiRejections.length > 0 && (
            <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={() => generate(anthropicApiKey, gamesDb)} disabled={aiGenerating}>
              <RefreshCw className="h-3 w-3 mr-1.5" /> Regenerate
            </Button>
          )}
        </div>
      )}
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
//  DRAWER 2: AUDIO
// ════════════════════════════════════════════════════════════════
const AUDIO_FILTERS = ["All", "Ambient", "Chill", "Happy", "Inspiring", "Cinematic", "Pop", "Instrumental", "Celebrations"];

const DEMO_TRACKS = [
  { id: 1, name: "Cinematic ambient", dur: "03:10", filter: "Cinematic", gradient: "from-purple-400/40 to-purple-600/20" },
  { id: 2, name: "Water stream river", dur: "01:47", filter: "Ambient", gradient: "from-blue-300/30 to-blue-500/20" },
  { id: 3, name: "Spiritual healing", dur: "03:13", filter: "Chill", gradient: "from-pink-300/30 to-orange-300/20" },
  { id: 4, name: "Space", dur: "02:26", filter: "Ambient", gradient: "from-indigo-400/30 to-violet-500/20" },
  { id: 5, name: "Soothing ocean waves", dur: "02:13", filter: "Ambient", gradient: "from-cyan-300/30 to-blue-400/20" },
  { id: 6, name: "Nature meditation", dur: "09:11", filter: "Chill", gradient: "from-amber-300/30 to-yellow-400/20" },
  { id: 7, name: "Epic battle", dur: "04:22", filter: "Cinematic", gradient: "from-red-400/30 to-orange-500/20" },
  { id: 8, name: "Happy morning", dur: "02:45", filter: "Happy", gradient: "from-yellow-300/30 to-green-300/20" },
];

function AudioPanel() {
  const [subTab, setSubTab] = useState("music");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [hoveredId, setHoveredId] = useState(null);

  const filteredTracks = useMemo(() => {
    let t = DEMO_TRACKS;
    if (activeFilter !== "All") t = t.filter(tr => tr.filter === activeFilter);
    if (search) t = t.filter(tr => tr.name.toLowerCase().includes(search.toLowerCase()));
    return t;
  }, [activeFilter, search]);

  return (
    <div className="flex flex-col h-full">
      {/* Sub tabs */}
      <div className="flex gap-4 px-3 pt-2 pb-1 border-b border-border/40">
        {["music", "sfx"].map((t) => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`text-xs font-medium pb-2 border-b-2 transition-colors ${subTab === t ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}>
            {t === "music" ? "Music" : "Sound effect"}
          </button>
        ))}
      </div>

      {/* Search + upload */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <div className="flex items-center gap-2 px-2.5 h-8 rounded-md bg-secondary/50 border border-border/40 flex-1">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..."
            className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground" />
        </div>
        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
          <Upload className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-1.5 px-3 pb-2 overflow-x-auto">
        <button className="shrink-0 h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:bg-secondary/60">
          <span className="text-sm">≡</span>
        </button>
        {AUDIO_FILTERS.map((f) => (
          <button key={f} onClick={() => setActiveFilter(f)}
            className={`shrink-0 h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors ${
              activeFilter === f ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground border border-border/40 hover:border-border/60 hover:text-foreground"
            }`}>
            {f}
          </button>
        ))}
      </div>

      <Separator />

      {/* Track list */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {filteredTracks.map((track) => (
            <div key={track.id}
              onMouseEnter={() => setHoveredId(track.id)}
              onMouseLeave={() => setHoveredId(null)}
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-secondary/30 transition-colors cursor-pointer group">
              {/* Thumbnail */}
              <div className={`w-10 h-10 rounded-md flex items-center justify-center bg-gradient-to-br ${track.gradient} shrink-0`}>
                <Play className="h-3.5 w-3.5 text-foreground/70" />
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-foreground font-medium truncate">{track.name}</div>
                <div className="text-[10px] text-muted-foreground">{track.dur}</div>
              </div>
              {/* Hover actions */}
              {hoveredId === track.id && (
                <div className="flex items-center gap-1 shrink-0">
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                          <Star className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-[10px]">Favorite</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="h-6 w-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors">
                          <Plus className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-[10px]">Add to timeline</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>
          ))}
          {filteredTracks.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">No tracks found</div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
//  DRAWER 3: BRAND KIT
// ════════════════════════════════════════════════════════════════
// ── Template utilities (imported from shared module to avoid circular deps) ──
import { BUILTIN_TEMPLATE, DEFAULT_TEMPLATE_KEY, applyTemplate, snapshotTemplate } from "../utils/templateUtils";
const WEIGHT_LABELS = { 300: "Light", 400: "Regular", 500: "Medium", 700: "Bold", 900: "Heavy" };

function BrandKitPanel() {
  const [templates, setTemplates] = useState([]);
  const [activeId, setActiveId] = useState("fega-default");
  const [defaultId, setDefaultId] = useState("fega-default");
  const [builtInDeleted, setBuiltInDeleted] = useState(false);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (window.clipflow?.storeGet) {
      window.clipflow.storeGet("layoutTemplates").then((saved) => { if (Array.isArray(saved)) setTemplates(saved); });
      window.clipflow.storeGet("activeTemplateId").then((id) => { if (id) setActiveId(id); });
      window.clipflow.storeGet(DEFAULT_TEMPLATE_KEY).then((id) => { if (id) setDefaultId(id); });
      window.clipflow.storeGet("builtInTemplateDeleted").then((v) => { if (v) setBuiltInDeleted(true); });
    }
  }, []);

  const persist = useCallback((tpls) => {
    setTemplates(tpls);
    window.clipflow?.storeSet?.("layoutTemplates", tpls);
  }, []);
  const persistActive = useCallback((id) => {
    setActiveId(id);
    window.clipflow?.storeSet?.("activeTemplateId", id);
  }, []);
  const persistDefault = useCallback((id) => {
    setDefaultId(id);
    window.clipflow?.storeSet?.(DEFAULT_TEMPLATE_KEY, id);
  }, []);

  const allTemplates = builtInDeleted ? templates : [BUILTIN_TEMPLATE, ...templates];

  const handleSave = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    const tpl = snapshotTemplate(name);
    persist([...templates, tpl]);
    persistActive(tpl.id);
    setNaming(false);
    setNewName("");
  }, [newName, templates, persist, persistActive]);

  const handleApply = useCallback((tpl) => {
    applyTemplate(tpl);
    persistActive(tpl.id);
  }, [persistActive]);

  const handleUpdate = useCallback((id) => {
    const existing = templates.find((t) => t.id === id);
    if (!existing) return;
    const updated = snapshotTemplate(existing.name);
    updated.id = id;
    persist(templates.map((t) => t.id === id ? updated : t));
    persistActive(id);
  }, [templates, persist, persistActive]);

  const handleDelete = useCallback((id) => {
    if (id === "fega-default") {
      setBuiltInDeleted(true);
      window.clipflow?.storeSet?.("builtInTemplateDeleted", true);
      if (activeId === id) {
        const first = templates[0];
        if (first) persistActive(first.id);
      }
      if (defaultId === id) {
        const first = templates[0];
        if (first) persistDefault(first.id);
      }
      return;
    }
    const updated = templates.filter((t) => t.id !== id);
    persist(updated);
    if (activeId === id) {
      const remaining = builtInDeleted ? updated : [BUILTIN_TEMPLATE, ...updated];
      if (remaining.length > 0) persistActive(remaining[0].id);
    }
    if (defaultId === id) {
      const remaining = builtInDeleted ? updated : [BUILTIN_TEMPLATE, ...updated];
      if (remaining.length > 0) persistDefault(remaining[0].id);
    }
  }, [templates, activeId, defaultId, builtInDeleted, persist, persistActive, persistDefault]);

  const handleSetDefault = useCallback((id) => {
    persistDefault(id);
  }, [persistDefault]);

  return (
    <div className="p-3 space-y-4">
      {/* Templates */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel className="mb-0">Templates</SectionLabel>
        </div>

        {/* Name input */}
        {naming && (
          <div className="flex gap-1.5 mb-3">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setNaming(false); }}
              placeholder="Template name..."
              className="flex-1 h-8 px-2.5 text-sm rounded-md bg-secondary border border-border text-foreground outline-none focus:border-primary/40" />
            <Button size="sm" className="h-8 px-4 text-xs" onClick={handleSave}>Save</Button>
            <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => setNaming(false)}>Cancel</Button>
          </div>
        )}

        {/* No templates warning */}
        {allTemplates.length === 0 && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            No templates yet. Save your current layout to create one.
          </div>
        )}

        {/* Template cards */}
        <div className="space-y-2">
          {allTemplates.map((tpl) => {
            const isActive = tpl.id === activeId;
            const isDefault = tpl.id === defaultId;
            const s = tpl.subtitle;
            const c = tpl.caption;
            return (
              <div key={tpl.id} onClick={() => handleApply(tpl)}
                className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${isActive ? "bg-primary/10 border border-primary/30" : "bg-secondary/40 border border-border/30 hover:border-border/60"}`}>
                {/* Mini 9:16 preview */}
                <div className="w-9 h-16 rounded bg-secondary/80 border border-border/40 relative shrink-0 overflow-hidden">
                  <div className="absolute left-1 right-1 h-[3px] rounded-full" style={{ top: `${c.yPercent}%`, transform: "translateY(-50%)", background: "#a78bfa", opacity: 0.9 }} />
                  <div className="absolute left-1.5 right-1.5 h-[2px] rounded-full" style={{ top: `${s.yPercent}%`, transform: "translateY(-50%)", background: s.highlightColor || "#4cce8a", opacity: 0.9 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-foreground truncate">{tpl.name}</span>
                    {isDefault && <span className="text-[10px] font-bold text-yellow-400 bg-yellow-400/15 px-1.5 py-0.5 rounded shrink-0">★ DEFAULT</span>}
                    {isActive && <span className="text-[10px] font-semibold text-primary bg-primary/15 px-1.5 py-0.5 rounded-full shrink-0">Active</span>}
                  </div>
                  <span className="text-xs text-muted-foreground block mt-0.5">
                    {s.fontFamily} · {s.fontSize} · {WEIGHT_LABELS[s.fontWeight] || s.fontWeight}{s.italic ? " · Italic" : ""}
                  </span>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {!isDefault && (
                    <button onClick={(e) => { e.stopPropagation(); handleSetDefault(tpl.id); }}
                      className="text-[10px] text-muted-foreground hover:text-yellow-400 px-2 py-1 rounded hover:bg-yellow-400/10 transition-colors" title="Set as default">★ Default</button>
                  )}
                  {!tpl.builtIn && (
                    <button onClick={(e) => { e.stopPropagation(); handleUpdate(tpl.id); }}
                      className="text-[10px] text-muted-foreground hover:text-primary px-2 py-1 rounded hover:bg-primary/10 transition-colors" title="Update with current settings">Update</button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(tpl.id); }}
                    className="text-[10px] text-muted-foreground hover:text-destructive px-2 py-1 rounded hover:bg-destructive/10 transition-colors" title="Delete template">Delete</button>
                </div>
              </div>
            );
          })}
        </div>

        <Button variant="outline" size="sm" className="w-full h-9 text-xs mt-3" onClick={() => { setNaming(true); setNewName(""); }}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Save current layout
        </Button>
      </div>

      <Separator />

      {/* Logos */}
      <div>
        <SectionLabel>Logos</SectionLabel>
        <DropZone accept="JPG, PNG, JPEG" icon={ImagePlus} />
      </div>

      <Separator />

      {/* Images */}
      <div>
        <SectionLabel>Images</SectionLabel>
        <DropZone accept="JPG, PNG, JPEG" icon={FileImage} />
      </div>

      <Separator />

      {/* Outros */}
      <div>
        <SectionLabel>Outros</SectionLabel>
        <DropZone accept="MP4, MOV, 3GP" icon={Film} />
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
//  DRAWER 4: SUBTITLES
// ════════════════════════════════════════════════════════════════
const HIGHLIGHT_COLORS = ["#4cce8a", "#ffffff", "#f87171", "#fbbf24", "#a78bfa"];

function SubtitlesPanel() {
  const [subTab, setSubTab] = useState("settings");

  const subFontFamily = useSubtitleStore((s) => s.subFontFamily);
  const setSubFontFamily = useSubtitleStore((s) => s.setSubFontFamily);
  const subFontWeight = useSubtitleStore((s) => s.subFontWeight);
  const setSubFontWeight = useSubtitleStore((s) => s.setSubFontWeight);
  const fontSize = useSubtitleStore((s) => s.fontSize);
  const setFontSize = useSubtitleStore((s) => s.setFontSize);
  const lineMode = useSubtitleStore((s) => s.lineMode);
  const setLineMode = useSubtitleStore((s) => s.setLineMode);
  const highlightColor = useSubtitleStore((s) => s.highlightColor);
  const setHighlightColor = useSubtitleStore((s) => s.setHighlightColor);
  const strokeOn = useSubtitleStore((s) => s.strokeOn);
  const setStrokeOn = useSubtitleStore((s) => s.setStrokeOn);
  const strokeWidth = useSubtitleStore((s) => s.strokeWidth);
  const setStrokeWidth = useSubtitleStore((s) => s.setStrokeWidth);
  const strokeColor = useSubtitleStore((s) => s.strokeColor);
  const setStrokeColor = useSubtitleStore((s) => s.setStrokeColor);
  const strokeOpacity = useSubtitleStore((s) => s.strokeOpacity);
  const setStrokeOpacity = useSubtitleStore((s) => s.setStrokeOpacity);
  const shadowOn = useSubtitleStore((s) => s.shadowOn);
  const setShadowOn = useSubtitleStore((s) => s.setShadowOn);
  const shadowBlur = useSubtitleStore((s) => s.shadowBlur);
  const setShadowBlur = useSubtitleStore((s) => s.setShadowBlur);
  const shadowColor = useSubtitleStore((s) => s.shadowColor);
  const setShadowColor = useSubtitleStore((s) => s.setShadowColor);
  const shadowOpacity = useSubtitleStore((s) => s.shadowOpacity);
  const setShadowOpacity = useSubtitleStore((s) => s.setShadowOpacity);
  const bgOn = useSubtitleStore((s) => s.bgOn);
  const setBgOn = useSubtitleStore((s) => s.setBgOn);
  const bgOpacity = useSubtitleStore((s) => s.bgOpacity);
  const setBgOpacity = useSubtitleStore((s) => s.setBgOpacity);
  const showSubs = useSubtitleStore((s) => s.showSubs);
  const setShowSubs = useSubtitleStore((s) => s.setShowSubs);
  const syncOffset = useSubtitleStore((s) => s.syncOffset);
  const setSyncOffset = useSubtitleStore((s) => s.setSyncOffset);

  // B/I/U wired to subtitle store
  const subBold = useSubtitleStore((s) => s.subBold);
  const toggleSubBold = useSubtitleStore((s) => s.toggleSubBold);
  const subItalic = useSubtitleStore((s) => s.subItalic);
  const toggleSubItalic = useSubtitleStore((s) => s.toggleSubItalic);
  const subUnderline = useSubtitleStore((s) => s.subUnderline);
  const toggleSubUnderline = useSubtitleStore((s) => s.toggleSubUnderline);
  const [align, setAlign] = useState("center");
  const [fontColor, setFontColor] = useState("#ffffff");

  return (
    <div className="flex flex-col h-full">
      {/* Sub tabs */}
      <div className="flex items-center gap-3 px-3 pt-2 pb-1 border-b border-border/40">
        {["presets", "settings"].map((t) => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`text-xs font-medium pb-2 border-b-2 transition-colors ${subTab === t ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}>
            {t === "presets" ? "Presets" : "Settings"}
          </button>
        ))}
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 cursor-pointer pb-1">
          <div className="w-4 h-4 rounded border border-primary bg-primary flex items-center justify-center">
            <Check className="h-2.5 w-2.5 text-primary-foreground" />
          </div>
          <span className="text-[10px] text-muted-foreground">Apply to all</span>
        </label>
      </div>

      <ScrollArea className="flex-1">
        {subTab === "presets" ? (
          /* Presets grid */
          <div className="p-3 grid grid-cols-2 gap-2">
            {["Bold Impact", "Clean White", "Neon Glow", "Shadow Pop", "Minimal", "Gaming"].map((name, i) => (
              <div key={i} className="aspect-video rounded-lg bg-secondary/60 border border-border/40 hover:border-primary/30 cursor-pointer transition-colors flex items-center justify-center">
                <span className="text-[10px] text-muted-foreground font-medium">{name}</span>
              </div>
            ))}
          </div>
        ) : (
          /* Settings */
          <div className="p-3 space-y-3">
            {/* Font toolbar */}
            <FontToolbar
              fontFamily={subFontFamily} setFontFamily={setSubFontFamily}
              fontWeight={subFontWeight} setFontWeight={setSubFontWeight}
              fontSize={fontSize} setFontSize={setFontSize}
              align={align} setAlign={setAlign}
              bold={subBold} setBold={toggleSubBold}
              italic={subItalic} setItalic={toggleSubItalic}
              underline={subUnderline} setUnderline={toggleSubUnderline}
              color={fontColor} setColor={setFontColor}
              lineMode={lineMode} setLineMode={setLineMode}
            />

            <Separator />

            {/* Highlight */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-foreground font-medium">Highlight</span>
              </div>
              <div className="flex items-center gap-2">
                {HIGHLIGHT_COLORS.map((c) => (
                  <ColorPickerPopover key={c} color={c} onChange={setHighlightColor}>
                    <button
                      className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-transform hover:scale-110 ${
                        highlightColor === c ? "border-foreground scale-110" : "border-transparent"
                      }`}
                      style={{ background: c }}
                    />
                  </ColorPickerPopover>
                ))}
                <button className="w-7 h-7 rounded-full border-2 border-dashed border-border/50 flex items-center justify-center text-muted-foreground hover:border-border hover:text-foreground transition-colors">
                  <Minus className="h-3 w-3" />
                </button>
              </div>
            </div>

            <Separator />

            {/* Stroke */}
            <EffectSection label="Stroke" enabled={strokeOn} onToggle={setStrokeOn} color={strokeColor} onColorChange={setStrokeColor}>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-14">Width</span>
                  <Slider value={[strokeWidth]} onValueChange={([v]) => setStrokeWidth(v)} min={0} max={20} step={1} className="flex-1" />
                  <span className="text-[10px] text-muted-foreground w-6 text-right">{strokeWidth}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-14">Opacity</span>
                  <Slider value={[strokeOpacity]} onValueChange={([v]) => setStrokeOpacity(v)} min={0} max={100} step={1} className="flex-1" />
                  <span className="text-[10px] text-muted-foreground w-6 text-right">{strokeOpacity}%</span>
                </div>
              </div>
            </EffectSection>

            {/* Shadow */}
            <EffectSection label="Shadow" enabled={shadowOn} onToggle={setShadowOn} color={shadowColor} onColorChange={setShadowColor}>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-14">Blur</span>
                  <Slider value={[shadowBlur]} onValueChange={([v]) => setShadowBlur(v)} min={0} max={30} step={1} className="flex-1" />
                  <span className="text-[10px] text-muted-foreground w-6 text-right">{shadowBlur}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-14">Opacity</span>
                  <Slider value={[shadowOpacity]} onValueChange={([v]) => setShadowOpacity(v)} min={0} max={100} step={1} className="flex-1" />
                  <span className="text-[10px] text-muted-foreground w-6 text-right">{shadowOpacity}%</span>
                </div>
              </div>
            </EffectSection>

            {/* Background */}
            <EffectSection label="Background" enabled={bgOn} onToggle={setBgOn} color="#000000" onColorChange={() => {}}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-10">Opacity</span>
                <Slider value={[bgOpacity]} onValueChange={([v]) => setBgOpacity(v)} min={0} max={100} step={1} className="flex-1" />
                <span className="text-[10px] text-muted-foreground w-6 text-right">{bgOpacity}%</span>
              </div>
            </EffectSection>

            <Separator />

            {/* Sync offset */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-foreground font-medium">Sync offset</span>
                <span className="text-[10px] text-muted-foreground font-mono">{syncOffset > 0 ? "+" : ""}{syncOffset.toFixed(1)}s</span>
              </div>
              <Slider value={[syncOffset]} onValueChange={([v]) => setSyncOffset(v)} min={-10} max={10} step={0.1} />
            </div>

            <Separator />

            {/* Quick toggles */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground">Show subtitles</span>
                <ToggleSwitch value={showSubs} onChange={setShowSubs} />
              </div>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
//  DRAWER 5: TEXT / HEADLINES
// ════════════════════════════════════════════════════════════════
function TextPanel() {
  const [subTab, setSubTab] = useState("settings");
  const captionText = useCaptionStore((s) => s.captionText);
  const setCaptionText = useCaptionStore((s) => s.setCaptionText);
  const captionFontFamily = useCaptionStore((s) => s.captionFontFamily);
  const setCaptionFontFamily = useCaptionStore((s) => s.setCaptionFontFamily);
  const captionFontWeight = useCaptionStore((s) => s.captionFontWeight);
  const setCaptionFontWeight = useCaptionStore((s) => s.setCaptionFontWeight);
  const captionFontSize = useCaptionStore((s) => s.captionFontSize);
  const setCaptionFontSize = useCaptionStore((s) => s.setCaptionFontSize);
  const captionColor = useCaptionStore((s) => s.captionColor);
  const setCaptionColor = useCaptionStore((s) => s.setCaptionColor);
  const captionBold = useCaptionStore((s) => s.captionBold);
  const captionItalic = useCaptionStore((s) => s.captionItalic);
  const captionUnderline = useCaptionStore((s) => s.captionUnderline);
  const toggleBold = useCaptionStore((s) => s.toggleBold);
  const toggleItalic = useCaptionStore((s) => s.toggleItalic);
  const toggleUnderline = useCaptionStore((s) => s.toggleUnderline);
  const captionLineSpacing = useCaptionStore((s) => s.captionLineSpacing);
  const setCaptionLineSpacing = useCaptionStore((s) => s.setCaptionLineSpacing);
  const captionShadowOn = useCaptionStore((s) => s.captionShadowOn);
  const setCaptionShadowOn = useCaptionStore((s) => s.setCaptionShadowOn);
  const captionShadowColor = useCaptionStore((s) => s.captionShadowColor);
  const setCaptionShadowColor = useCaptionStore((s) => s.setCaptionShadowColor);
  const captionShadowBlur = useCaptionStore((s) => s.captionShadowBlur);
  const setCaptionShadowBlur = useCaptionStore((s) => s.setCaptionShadowBlur);
  const captionShadowOpacity = useCaptionStore((s) => s.captionShadowOpacity);
  const setCaptionShadowOpacity = useCaptionStore((s) => s.setCaptionShadowOpacity);
  const captionStrokeOn = useCaptionStore((s) => s.captionStrokeOn);
  const setCaptionStrokeOn = useCaptionStore((s) => s.setCaptionStrokeOn);
  const captionStrokeColor = useCaptionStore((s) => s.captionStrokeColor);
  const setCaptionStrokeColor = useCaptionStore((s) => s.setCaptionStrokeColor);
  const captionStrokeWidth = useCaptionStore((s) => s.captionStrokeWidth);
  const setCaptionStrokeWidth = useCaptionStore((s) => s.setCaptionStrokeWidth);
  const captionStrokeOpacity = useCaptionStore((s) => s.captionStrokeOpacity);
  const setCaptionStrokeOpacity = useCaptionStore((s) => s.setCaptionStrokeOpacity);
  const markDirty = useEditorStore((s) => s.markDirty);

  const [align, setAlign] = useState("center");

  return (
    <div className="flex flex-col h-full">
      {/* Sub tabs */}
      <div className="flex gap-3 px-3 pt-2 pb-1 border-b border-border/40">
        {["presets", "settings"].map((t) => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`text-xs font-medium pb-2 border-b-2 transition-colors ${subTab === t ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}>
            {t === "presets" ? "Presets" : "Settings"}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        {subTab === "presets" ? (
          <div className="p-3 space-y-3">
            {/* Add buttons */}
            <div className="space-y-1.5">
              <Button variant="outline" className="w-full h-9 text-xs justify-start gap-2">
                <Type className="h-3.5 w-3.5" /> Add a headline
              </Button>
              <Button variant="outline" className="w-full h-9 text-xs justify-start gap-2">
                <AlignLeft className="h-3.5 w-3.5" /> Add body text
              </Button>
            </div>

            <Separator />

            {/* Preset grid */}
            <div>
              <SectionLabel>Recommended</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                {["Bold Title", "Clean Sans", "Neon", "Retro", "Outline", "Gradient"].map((name, i) => (
                  <div key={i} className="aspect-[3/2] rounded-lg bg-secondary/60 border border-border/40 hover:border-primary/30 cursor-pointer transition-colors flex items-center justify-center">
                    <span className="text-[10px] text-muted-foreground">{name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {/* Text content */}
            <div>
              <textarea value={captionText} onChange={(e) => { setCaptionText(e.target.value); markDirty(); }} rows={3} placeholder="Enter caption text..."
                className="w-full px-3 py-2.5 text-sm rounded-md bg-secondary/30 border border-border/40 text-foreground outline-none resize-none placeholder:text-muted-foreground focus:border-primary/30" />
            </div>

            {/* Font toolbar */}
            <FontToolbar
              fontFamily={captionFontFamily} setFontFamily={(f) => { setCaptionFontFamily(f); markDirty(); }}
              fontWeight={captionFontWeight} setFontWeight={(w) => { setCaptionFontWeight(w); markDirty(); }}
              fontSize={captionFontSize} setFontSize={(s) => { setCaptionFontSize(s); markDirty(); }}
              align={align} setAlign={setAlign}
              bold={captionBold} setBold={() => { toggleBold(); markDirty(); }}
              italic={captionItalic} setItalic={() => { toggleItalic(); markDirty(); }}
              underline={captionUnderline} setUnderline={() => { toggleUnderline(); markDirty(); }}
              color={captionColor} setColor={(c) => { setCaptionColor(c); markDirty(); }}
            />

            {/* Line Spacing */}
            <div className="border-t border-border/40 pt-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-foreground font-medium w-20">Line spacing</span>
                <Slider value={[captionLineSpacing * 10]} onValueChange={([v]) => { setCaptionLineSpacing(v / 10); markDirty(); }} min={8} max={30} step={1} className="flex-1" />
                <span className="text-[10px] text-muted-foreground w-8 text-right">{captionLineSpacing.toFixed(1)}</span>
              </div>
            </div>

            {/* Shadow */}
            <EffectSection label="Shadow" enabled={captionShadowOn} onToggle={(v) => { setCaptionShadowOn(v); markDirty(); }} color={captionShadowColor} onColorChange={(c) => { setCaptionShadowColor(c); markDirty(); }}>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-14">Blur</span>
                  <Slider value={[captionShadowBlur]} onValueChange={([v]) => { setCaptionShadowBlur(v); markDirty(); }} min={0} max={30} step={1} className="flex-1" />
                  <span className="text-[10px] text-muted-foreground w-6 text-right">{captionShadowBlur}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-14">Opacity</span>
                  <Slider value={[captionShadowOpacity]} onValueChange={([v]) => { setCaptionShadowOpacity(v); markDirty(); }} min={0} max={100} step={1} className="flex-1" />
                  <span className="text-[10px] text-muted-foreground w-6 text-right">{captionShadowOpacity}%</span>
                </div>
              </div>
            </EffectSection>

            {/* Stroke */}
            <EffectSection label="Stroke" enabled={captionStrokeOn} onToggle={(v) => { setCaptionStrokeOn(v); markDirty(); }} color={captionStrokeColor} onColorChange={(c) => { setCaptionStrokeColor(c); markDirty(); }}>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-14">Width</span>
                  <Slider value={[captionStrokeWidth]} onValueChange={([v]) => { setCaptionStrokeWidth(v); markDirty(); }} min={0} max={20} step={1} className="flex-1" />
                  <span className="text-[10px] text-muted-foreground w-6 text-right">{captionStrokeWidth}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-14">Opacity</span>
                  <Slider value={[captionStrokeOpacity]} onValueChange={([v]) => { setCaptionStrokeOpacity(v); markDirty(); }} min={0} max={100} step={1} className="flex-1" />
                  <span className="text-[10px] text-muted-foreground w-6 text-right">{captionStrokeOpacity}%</span>
                </div>
              </div>
            </EffectSection>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
//  DRAWER 6: UPLOAD
// ════════════════════════════════════════════════════════════════
function UploadPanel() {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Upload button */}
      <div className="px-3 pt-3 pb-2">
        <Button variant="outline" className="w-full h-10 text-xs gap-2">
          <Upload className="h-4 w-4" /> Upload
        </Button>
      </div>

      {/* Drop zone */}
      <div className="flex-1 flex items-center justify-center px-3 pb-3">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); }}
          className={`w-full h-full min-h-[200px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-4 transition-colors ${
            dragOver ? "border-primary/50 bg-primary/5" : "border-border/30"
          }`}
        >
          {/* Folder illustration */}
          <div className="relative">
            <FolderOpen className="h-16 w-16 text-primary/20" />
            <div className="absolute -top-1 -right-2 w-6 h-6 rounded bg-primary/10 flex items-center justify-center">
              <FileImage className="h-3 w-3 text-primary/40" />
            </div>
          </div>
          <span className="text-xs text-muted-foreground text-center">
            Drop images, videos<br />or audio here
          </span>
        </div>
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
//  ICON RAIL CONFIG
// ════════════════════════════════════════════════════════════════
const RAIL_ICONS = [
  { id: "ai", icon: Sparkles, label: "AI Tools", group: 1 },
  { id: "brand", icon: Palette, label: "Brand Kit", group: 1 },
  { id: "subs", icon: Captions, label: "Subtitles", group: 2 },
  { id: "text", icon: Type, label: "Text", group: 2 },
  { id: "audio", icon: Music, label: "Audio", group: 3 },
  { id: "upload", icon: Upload, label: "Upload", group: 3 },
];

const DRAWER_LABELS = {
  ai: "AI Tools", brand: "Brand Kit", subs: "Subtitles", text: "Text", audio: "Audio", upload: "Upload",
};


// ════════════════════════════════════════════════════════════════
//  MAIN EXPORT: RIGHT PANEL
// ════════════════════════════════════════════════════════════════
export default function RightPanelNew({ gamesDb, anthropicApiKey }) {
  const drawerOpen = useLayoutStore((s) => s.drawerOpen);
  const activePanel = useLayoutStore((s) => s.activePanel);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const setDrawerOpen = useLayoutStore((s) => s.setDrawerOpen);

  const renderDrawer = () => {
    switch (activePanel) {
      case "ai": return <AIToolsPanel gamesDb={gamesDb} anthropicApiKey={anthropicApiKey} />;
      case "audio": return <AudioPanel />;
      case "brand": return <BrandKitPanel />;
      case "subs": return <SubtitlesPanel />;
      case "text": return <TextPanel />;
      case "upload": return <UploadPanel />;
      default: return (
        <div className="p-4 flex items-center justify-center h-[200px] text-muted-foreground">
          <span className="text-xs opacity-60">{DRAWER_LABELS[activePanel] || activePanel} — coming soon</span>
        </div>
      );
    }
  };

  // Resizable drawer width
  const [drawerWidth, setDrawerWidth] = useState(340);
  const resizing = useRef(false);

  const onResizeStart = useCallback((e) => {
    e.preventDefault();
    resizing.current = true;
    const startX = e.clientX;
    const startW = drawerWidth;
    const onMove = (ev) => {
      if (!resizing.current) return;
      const delta = startX - ev.clientX; // dragging left = wider
      setDrawerWidth(Math.max(260, Math.min(600, startW + delta)));
    };
    const onUp = () => {
      resizing.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [drawerWidth]);

  return (
    <div className="flex h-full">
      {/* Drawer (conditional) */}
      {drawerOpen && (
        <div className="border-l bg-card flex flex-col overflow-hidden relative" style={{ width: drawerWidth }}>
          {/* Resize handle on left edge */}
          <div
            className="absolute top-0 left-0 w-1.5 h-full cursor-ew-resize z-30 hover:bg-primary/20 active:bg-primary/30 transition-colors"
            onPointerDown={onResizeStart}
          />
          {/* Header */}
          <div className="h-11 min-h-[44px] flex items-center justify-between px-3 border-b shrink-0">
            <span className="text-sm font-semibold text-foreground">{DRAWER_LABELS[activePanel] || activePanel}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => setDrawerOpen(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {/* Body */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {activePanel === "audio" || activePanel === "subs" || activePanel === "text" ? (
              renderDrawer()
            ) : (
              <ScrollArea className="h-full">{renderDrawer()}</ScrollArea>
            )}
          </div>
        </div>
      )}

      {/* Icon rail (always visible) */}
      <div className="w-16 min-w-[64px] border-l bg-card flex flex-col items-center py-3 gap-1">
        <TooltipProvider delayDuration={300}>
          {RAIL_ICONS.map((item, i) => {
            const Icon = item.icon;
            const prevGroup = i > 0 ? RAIL_ICONS[i - 1].group : item.group;
            const isActive = drawerOpen && activePanel === item.id;

            return (
              <React.Fragment key={item.id}>
                {i > 0 && item.group !== prevGroup && <Separator className="w-10 my-1.5" />}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => togglePanel(item.id)}
                      className={`w-14 h-14 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                        isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-[10px] leading-none font-medium">{item.label}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">{item.label}</TooltipContent>
                </Tooltip>
              </React.Fragment>
            );
          })}
        </TooltipProvider>
      </div>
    </div>
  );
}
