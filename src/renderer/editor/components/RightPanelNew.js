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
  Bold, Italic, Underline, Pipette, Heart, GripVertical,
  UploadCloud, FolderOpen, FileImage, Film, Volume2,
} from "lucide-react";
import useSubtitleStore from "../stores/useSubtitleStore";
import useCaptionStore from "../stores/useCaptionStore";
import useAIStore from "../stores/useAIStore";
import useEditorStore from "../stores/useEditorStore";
import useLayoutStore from "../stores/useLayoutStore";
import { EFFECT_PRESETS, applyEffectPreset, snapshotEffectPreset } from "../utils/templateUtils";

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
          <span className="text-[12px] text-muted-foreground w-7 shrink-0">RGB</span>
          {[
            { val: r, set: (v) => applyRGB(v, g, b) },
            { val: g, set: (v) => applyRGB(r, v, b) },
            { val: b, set: (v) => applyRGB(r, g, v) },
          ].map((ch, i) => (
            <input key={i} type="number" min={0} max={255} value={ch.val}
              onChange={(e) => ch.set(Math.max(0, Math.min(255, parseInt(e.target.value) || 0)))}
              className="w-12 h-6 text-[12px] text-center rounded bg-secondary border border-border text-foreground outline-none focus:border-primary/40"
            />
          ))}
          <input value={hex} onChange={(e) => handleHexInput(e.target.value)}
            className="flex-1 h-6 text-[12px] text-center rounded bg-secondary border border-border text-foreground outline-none focus:border-primary/40"
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
//  SHARED: Expandable effect section with toggle + chevron + drag handle
// ════════════════════════════════════════════════════════════════
function EffectSection({ label, effectKey, enabled, onToggle, color, onColorChange, defaultExpanded = false, onDragStart, onDragOver, onDrop, children }) {
  const [expanded, setExpanded] = useState(defaultExpanded || enabled);
  return (
    <div
      className="border-t border-border/40"
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", effectKey); onDragStart?.(effectKey); }}
      onDragOver={(e) => { e.preventDefault(); onDragOver?.(effectKey); }}
      onDrop={(e) => { e.preventDefault(); const from = e.dataTransfer.getData("text/plain"); onDrop?.(from, effectKey); }}
    >
      <div className="flex items-center justify-between py-1.5 px-1">
        <div className="flex items-center gap-1">
          <GripVertical className="h-3 w-3 text-muted-foreground/40 cursor-grab active:cursor-grabbing shrink-0" />
          <button className="flex items-center gap-1.5 cursor-pointer" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            <span className="text-xs text-foreground font-medium">{label}</span>
            {!expanded && enabled && color && (
              <span className="w-2.5 h-2.5 rounded-full ml-1" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
            )}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {color && (
            <ColorPickerPopover color={color} onChange={onColorChange}>
              <button className={`w-5 h-5 rounded-full border border-border/60 cursor-pointer transition-opacity ${enabled ? "opacity-100" : "opacity-40"}`} style={{ background: color }} />
            </ColorPickerPopover>
          )}
          <ToggleSwitch value={enabled} onChange={onToggle} />
        </div>
      </div>
      {expanded && children && (
        <div className={`pb-3 px-1 transition-opacity ${enabled ? "opacity-100" : "opacity-30 pointer-events-none"}`}>
          {children}
        </div>
      )}
    </div>
  );
}

// Shared slider row for effect sections
function EffectSlider({ label, value, onChange, min, max, step = 1, suffix = "", labelWidth = "w-14" }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[12px] text-muted-foreground ${labelWidth}`}>{label}</span>
      <Slider value={[value]} onValueChange={([v]) => onChange(v)} min={min} max={max} step={step} className="flex-1" />
      <span className="text-[12px] text-muted-foreground w-8 text-right">{typeof value === "number" && value % 1 !== 0 ? value.toFixed(1) : value}{suffix}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  SHARED: Effect Presets Manager (used by Subtitles + Text panels)
// ════════════════════════════════════════════════════════════════
const STORE_KEY = "userEffectPresets";

function useUserPresets() {
  const [userPresets, setUserPresets] = useState([]);
  useEffect(() => {
    window.clipflow?.storeGet(STORE_KEY).then((saved) => {
      if (Array.isArray(saved)) setUserPresets(saved);
    }).catch(() => {});
  }, []);
  const persist = useCallback((presets) => {
    setUserPresets(presets);
    window.clipflow?.storeSet(STORE_KEY, presets);
  }, []);
  return { userPresets, persist };
}

// Preset indicator dot colors — matches timeline track colors for consistency
const PRESET_DOT_COLORS = {
  subtitle: { bg: "#84cc16", shadow: "0 0 6px #84cc16" },  // lime green (matches sub track)
  caption:  { bg: "hsl(217 70% 65%)", shadow: "0 0 6px hsl(217 70% 65%)" },  // blue (matches cap track)
  both:     { bg: "#34d399", shadow: "0 0 6px #34d399" },  // fallback green
};

function EffectPresetsGrid({ userPresets, persist, target = "both" }) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameText, setRenameText] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [activePresetId, setActivePresetId] = useState(null);
  const [flashId, setFlashId] = useState(null); // For overwrite visual feedback
  const renameRef = useRef(null);
  const newRef = useRef(null);

  const dotColor = PRESET_DOT_COLORS[target] || PRESET_DOT_COLORS.both;

  // Persist active preset ID so it survives page navigation
  const storeKey = `activePresetId_${target}`;
  useEffect(() => {
    window.clipflow?.storeGet(storeKey).then((saved) => {
      if (saved) setActivePresetId(saved);
    }).catch(() => {});
  }, [storeKey]);
  const setAndPersistActive = useCallback((id) => {
    setActivePresetId(id);
    window.clipflow?.storeSet(storeKey, id);
  }, [storeKey]);

  useEffect(() => { if (renamingId && renameRef.current) renameRef.current.focus(); }, [renamingId]);
  useEffect(() => { if (savingNew && newRef.current) newRef.current.focus(); }, [savingNew]);

  // Filter presets: only show presets that match this panel's target type
  const filteredPresets = userPresets.filter(p => !p.type || p.type === target || p.type === "both");

  const handleSaveNew = () => {
    const name = newName.trim();
    if (!name) return;
    const preset = snapshotEffectPreset(name, target);
    persist([...userPresets, preset]);
    setSavingNew(false); setNewName("");
  };

  const handleUpdate = (id) => {
    const existing = userPresets.find(p => p.id === id);
    if (!existing) return;
    const updated = snapshotEffectPreset(existing.name, target);
    updated.id = id;
    persist(userPresets.map(p => p.id === id ? updated : p));
    setAndPersistActive(id);
    // Visual flash to confirm overwrite
    setFlashId(id);
    setTimeout(() => setFlashId(null), 1200);
  };

  const handleRename = (id) => {
    const name = renameText.trim();
    if (!name) { setRenamingId(null); return; }
    persist(userPresets.map(p => p.id === id ? { ...p, name } : p));
    setRenamingId(null);
  };

  const handleDelete = (id) => {
    persist(userPresets.filter(p => p.id !== id));
  };

  return (
    <div className="p-3 space-y-3">
      {/* Save current as preset */}
      <div>
        {savingNew ? (
          <div className="flex gap-1.5">
            <input ref={newRef} value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveNew(); if (e.key === "Escape") setSavingNew(false); }}
              placeholder="Preset name..."
              className="flex-1 px-2 py-1.5 text-xs rounded bg-secondary/50 border border-border/40 text-foreground outline-none focus:border-primary/50" />
            <Button size="sm" className="h-7 text-[12px] px-2" onClick={handleSaveNew}>Save</Button>
            <Button size="sm" variant="ghost" className="h-7 text-[12px] px-1.5" onClick={() => setSavingNew(false)}><X className="h-3 w-3" /></Button>
          </div>
        ) : (
          <Button variant="outline" className="w-full h-8 text-xs gap-2" onClick={() => setSavingNew(true)}>
            <Plus className="h-3 w-3" /> Save current as preset
          </Button>
        )}
      </div>

      {/* User presets */}
      {filteredPresets.length > 0 && (
        <div>
          <SectionLabel>My Presets</SectionLabel>
          <div className="space-y-1">
            {filteredPresets.map((preset) => (
              <div key={preset.id} className={`group flex items-center gap-1 rounded-md border transition-all ${
                flashId === preset.id ? "bg-green-500/10 border-green-500/40" :
                activePresetId === preset.id ? "bg-secondary/50 border-border/50" : "bg-secondary/40 border-border/30 hover:border-muted-foreground/30"
              }`}>
                {renamingId === preset.id ? (
                  <input ref={renameRef} value={renameText} onChange={(e) => setRenameText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRename(preset.id); if (e.key === "Escape") setRenamingId(null); }}
                    onBlur={() => handleRename(preset.id)}
                    className="flex-1 px-2 py-1.5 text-xs bg-transparent text-foreground outline-none" />
                ) : (
                  <button className="flex-1 text-left px-2 py-1.5 text-xs truncate flex items-center gap-1.5 text-foreground" onClick={() => { applyEffectPreset(preset, target); setAndPersistActive(preset.id); }}>
                    {/* Active indicator: color-coded dot (blue=caption, lime=subtitle) */}
                    {activePresetId === preset.id && (
                      <span className="shrink-0 w-[7px] h-[7px] rounded-full" style={{ background: dotColor.bg, boxShadow: dotColor.shadow }} />
                    )}
                    <span className="truncate">{preset.name}</span>
                    {/* Overwrite flash */}
                    {flashId === preset.id && (
                      <span className="text-[9px] text-green-400 animate-pulse ml-auto shrink-0">Updated</span>
                    )}
                  </button>
                )}
                <TooltipProvider delayDuration={200}>
                <div className="flex items-center gap-0.5 pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Tooltip><TooltipTrigger asChild>
                    <button className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground" onClick={() => { setRenamingId(preset.id); setRenameText(preset.name); }}>
                      <Pipette className="h-3 w-3" />
                    </button>
                  </TooltipTrigger><TooltipContent className="text-[12px]">Rename</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild>
                    <button className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground" onClick={() => handleUpdate(preset.id)}>
                      <RefreshCw className="h-3 w-3" />
                    </button>
                  </TooltipTrigger><TooltipContent className="text-[12px]">Overwrite preset</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild>
                    <button className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-red-400" onClick={() => handleDelete(preset.id)}>
                      <X className="h-3 w-3" />
                    </button>
                  </TooltipTrigger><TooltipContent className="text-[12px]">Delete</TooltipContent></Tooltip>
                </div>
                </TooltipProvider>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Built-in presets removed — user manages their own presets */}
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
                    {t.why && <div className="text-[12px] text-muted-foreground mb-2">{t.why}</div>}
                    <div className="flex gap-1">
                      {isAccepted ? (
                        <span className="text-[12px] text-green-500 flex items-center gap-1"><Check className="h-3 w-3" /> Applied</span>
                      ) : !isRejected && (
                        <>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[12px] text-primary hover:bg-primary/10" onClick={() => acceptTitle(t, i)}>Apply</Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[12px] text-muted-foreground" onClick={() => reject(t.title)}>Skip</Button>
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
                    {c.why && <div className="text-[12px] text-muted-foreground mb-2">{c.why}</div>}
                    <div className="flex gap-1">
                      {isAccepted ? (
                        <span className="text-[12px] text-green-500 flex items-center gap-1"><Check className="h-3 w-3" /> Applied</span>
                      ) : !isRejected && (
                        <>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[12px] text-primary hover:bg-primary/10" onClick={() => acceptCaption(c, i)}>Apply</Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[12px] text-muted-foreground" onClick={() => reject(c.caption)}>Skip</Button>
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

const DEMO_TRACKS = []; // Audio tracks will be populated when audio integration is built

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
                <div className="text-[12px] text-muted-foreground">{track.dur}</div>
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
                      <TooltipContent className="text-[12px]">Favorite</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="h-6 w-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors">
                          <Plus className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-[12px]">Add to timeline</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>
          ))}
          {filteredTracks.length === 0 && (
            <div className="py-12 text-center">
              <Music className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <div className="text-xs text-muted-foreground">No audio tracks yet</div>
              <div className="text-[12px] text-muted-foreground/60 mt-1">Upload audio files to add to your clips</div>
            </div>
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

  const handleRename = useCallback((id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    persist(templates.map((t) => t.id === id ? { ...t, name: trimmed } : t));
  }, [templates, persist]);

  const [renamingId, setRenamingId] = useState(null);
  const [renameText, setRenameText] = useState("");

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
                    {renamingId === tpl.id ? (
                      <input autoFocus value={renameText} onChange={(e) => setRenameText(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => { if (e.key === "Enter") { handleRename(tpl.id, renameText); setRenamingId(null); } if (e.key === "Escape") setRenamingId(null); }}
                        onBlur={() => { handleRename(tpl.id, renameText); setRenamingId(null); }}
                        className="text-sm font-medium text-foreground bg-transparent outline-none border-b border-primary/50 w-full" />
                    ) : (
                      <span className="text-sm font-medium text-foreground truncate">{tpl.name}</span>
                    )}
                    {isDefault && <span className="text-[12px] font-bold text-yellow-400 bg-yellow-400/15 px-1.5 py-0.5 rounded shrink-0">★ DEFAULT</span>}
                    {isActive && <span className="text-[12px] font-semibold text-primary bg-primary/15 px-1.5 py-0.5 rounded-full shrink-0">Active</span>}
                  </div>
                  <span className="text-xs text-muted-foreground block mt-0.5">
                    {s.fontFamily} · {s.fontSize} · {WEIGHT_LABELS[s.fontWeight] || s.fontWeight}{s.italic ? " · Italic" : ""}
                  </span>
                  <div className="flex items-center gap-1.5 mt-1">
                    {s.strokeOn && <span className="text-[9px] px-1 py-0.5 rounded bg-secondary/80 text-muted-foreground border border-border/30" style={{ borderLeftColor: s.strokeColor || "#000", borderLeftWidth: 2 }}>Stroke</span>}
                    {s.glowOn && <span className="text-[9px] px-1 py-0.5 rounded bg-secondary/80 text-muted-foreground border border-border/30" style={{ borderLeftColor: s.glowColor || "#fff", borderLeftWidth: 2 }}>Glow</span>}
                    {s.shadowOn && <span className="text-[9px] px-1 py-0.5 rounded bg-secondary/80 text-muted-foreground border border-border/30" style={{ borderLeftColor: s.shadowColor || "#000", borderLeftWidth: 2 }}>Shadow</span>}
                    {s.bgOn && <span className="text-[9px] px-1 py-0.5 rounded bg-secondary/80 text-muted-foreground border border-border/30" style={{ borderLeftColor: s.bgColor || "#000", borderLeftWidth: 2 }}>BG</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {!isDefault && (
                    <button onClick={(e) => { e.stopPropagation(); handleSetDefault(tpl.id); }}
                      className="text-[12px] text-muted-foreground hover:text-yellow-400 px-2 py-1 rounded hover:bg-yellow-400/10 transition-colors" title="Set as default">★ Default</button>
                  )}
                  {!tpl.builtIn && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); setRenamingId(tpl.id); setRenameText(tpl.name); }}
                        className="text-[12px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-secondary/80 transition-colors" title="Rename">Rename</button>
                      <button onClick={(e) => { e.stopPropagation(); handleUpdate(tpl.id); }}
                        className="text-[12px] text-muted-foreground hover:text-primary px-2 py-1 rounded hover:bg-primary/10 transition-colors" title="Overwrite preset settings">Update</button>
                    </>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(tpl.id); }}
                    className="text-[12px] text-muted-foreground hover:text-destructive px-2 py-1 rounded hover:bg-destructive/10 transition-colors" title="Delete template">Delete</button>
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
const DEFAULT_HIGHLIGHT_SWATCHES = ["#4cce8a", "#ffffff", "#f87171", "#fbbf24", "#a78bfa"];

function useHighlightSwatches() {
  const [swatches, setSwatches] = useState(DEFAULT_HIGHLIGHT_SWATCHES);
  useEffect(() => {
    window.clipflow?.storeGet?.("highlightSwatches").then((saved) => {
      if (Array.isArray(saved) && saved.length === 5) setSwatches(saved);
    }).catch(() => {});
  }, []);
  const updateSwatch = useCallback((index, color) => {
    setSwatches((prev) => {
      const next = [...prev];
      next[index] = color;
      window.clipflow?.storeSet?.("highlightSwatches", next).catch(() => {});
      return next;
    });
  }, []);
  return { swatches, updateSwatch };
}

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
  const { swatches: hlSwatches, updateSwatch: updateHlSwatch } = useHighlightSwatches();
  const [selectedSwatchIdx, setSelectedSwatchIdx] = useState(null);
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
  const strokeBlur = useSubtitleStore((s) => s.strokeBlur);
  const setStrokeBlur = useSubtitleStore((s) => s.setStrokeBlur);
  const strokeOffsetX = useSubtitleStore((s) => s.strokeOffsetX);
  const setStrokeOffsetX = useSubtitleStore((s) => s.setStrokeOffsetX);
  const strokeOffsetY = useSubtitleStore((s) => s.strokeOffsetY);
  const setStrokeOffsetY = useSubtitleStore((s) => s.setStrokeOffsetY);
  const glowOn = useSubtitleStore((s) => s.glowOn);
  const setGlowOn = useSubtitleStore((s) => s.setGlowOn);
  const glowColor = useSubtitleStore((s) => s.glowColor);
  const setGlowColor = useSubtitleStore((s) => s.setGlowColor);
  const glowOpacity = useSubtitleStore((s) => s.glowOpacity);
  const setGlowOpacity = useSubtitleStore((s) => s.setGlowOpacity);
  const glowIntensity = useSubtitleStore((s) => s.glowIntensity);
  const setGlowIntensity = useSubtitleStore((s) => s.setGlowIntensity);
  const glowBlur = useSubtitleStore((s) => s.glowBlur);
  const setGlowBlur = useSubtitleStore((s) => s.setGlowBlur);
  const glowBlend = useSubtitleStore((s) => s.glowBlend);
  const setGlowBlend = useSubtitleStore((s) => s.setGlowBlend);
  const glowOffsetX = useSubtitleStore((s) => s.glowOffsetX);
  const setGlowOffsetX = useSubtitleStore((s) => s.setGlowOffsetX);
  const glowOffsetY = useSubtitleStore((s) => s.glowOffsetY);
  const setGlowOffsetY = useSubtitleStore((s) => s.setGlowOffsetY);
  const shadowOffsetX = useSubtitleStore((s) => s.shadowOffsetX);
  const setShadowOffsetX = useSubtitleStore((s) => s.setShadowOffsetX);
  const shadowOffsetY = useSubtitleStore((s) => s.shadowOffsetY);
  const setShadowOffsetY = useSubtitleStore((s) => s.setShadowOffsetY);
  const bgOn = useSubtitleStore((s) => s.bgOn);
  const setBgOn = useSubtitleStore((s) => s.setBgOn);
  const bgOpacity = useSubtitleStore((s) => s.bgOpacity);
  const setBgOpacity = useSubtitleStore((s) => s.setBgOpacity);
  const bgColor = useSubtitleStore((s) => s.bgColor);
  const setBgColor = useSubtitleStore((s) => s.setBgColor);
  const bgPaddingX = useSubtitleStore((s) => s.bgPaddingX);
  const setBgPaddingX = useSubtitleStore((s) => s.setBgPaddingX);
  const bgPaddingY = useSubtitleStore((s) => s.bgPaddingY);
  const setBgPaddingY = useSubtitleStore((s) => s.setBgPaddingY);
  const bgRadius = useSubtitleStore((s) => s.bgRadius);
  const setBgRadius = useSubtitleStore((s) => s.setBgRadius);
  const showSubs = useSubtitleStore((s) => s.showSubs);
  const setShowSubs = useSubtitleStore((s) => s.setShowSubs);
  const syncOffset = useSubtitleStore((s) => s.syncOffset);
  const setSyncOffset = useSubtitleStore((s) => s.setSyncOffset);
  const effectOrder = useSubtitleStore((s) => s.effectOrder);
  const setEffectOrder = useSubtitleStore((s) => s.setEffectOrder);
  const animateOn = useSubtitleStore((s) => s.animateOn);
  const setAnimateOn = useSubtitleStore((s) => s.setAnimateOn);
  const animateScale = useSubtitleStore((s) => s.animateScale);
  const setAnimateScale = useSubtitleStore((s) => s.setAnimateScale);
  const animateGrowFrom = useSubtitleStore((s) => s.animateGrowFrom);
  const setAnimateGrowFrom = useSubtitleStore((s) => s.setAnimateGrowFrom);
  const animateSpeed = useSubtitleStore((s) => s.animateSpeed);
  const setAnimateSpeed = useSubtitleStore((s) => s.setAnimateSpeed);

  // B/I/U wired to subtitle store
  const subBold = useSubtitleStore((s) => s.subBold);
  const toggleSubBold = useSubtitleStore((s) => s.toggleSubBold);
  const subItalic = useSubtitleStore((s) => s.subItalic);
  const toggleSubItalic = useSubtitleStore((s) => s.toggleSubItalic);
  const subUnderline = useSubtitleStore((s) => s.subUnderline);
  const toggleSubUnderline = useSubtitleStore((s) => s.toggleSubUnderline);
  const [align, setAlign] = useState("center");
  const [fontColor, setFontColor] = useState("#ffffff");
  const { userPresets, persist } = useUserPresets();

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
          <span className="text-[12px] text-muted-foreground">Apply to all</span>
        </label>
      </div>

      <ScrollArea className="flex-1">
        {subTab === "presets" ? (
          <EffectPresetsGrid userPresets={userPresets} persist={persist} target="subtitle" />
        ) : (
          /* Settings */
          <div className="p-3 space-y-2">
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
                {hlSwatches.map((c, i) => (
                  <ColorPickerPopover key={i} color={c} onChange={(newColor) => {
                    updateHlSwatch(i, newColor);
                    setHighlightColor(newColor);
                    setSelectedSwatchIdx(i);
                  }}>
                    <button
                      className={`w-5 h-5 rounded-full border-2 cursor-pointer transition-transform hover:scale-110 ${
                        highlightColor === c ? "border-foreground scale-110" : "border-transparent"
                      }`}
                      style={{ background: c }}
                      onClick={(e) => {
                        // Single click = use this swatch color; right-click opens picker
                        if (!e.defaultPrevented) {
                          setHighlightColor(c);
                          setSelectedSwatchIdx(i);
                        }
                      }}
                    />
                  </ColorPickerPopover>
                ))}
              </div>
            </div>

            <Separator />

            {/* Effect sections — rendered in draggable order */}
            {(effectOrder || ["glow", "stroke", "shadow", "background"]).map((key) => {
              const dragProps = {
                effectKey: key,
                onDragStart: () => {},
                onDragOver: () => {},
                onDrop: (from, to) => {
                  if (from === to) return;
                  const order = [...(effectOrder || ["glow", "stroke", "shadow", "background"])];
                  const fi = order.indexOf(from); const ti = order.indexOf(to);
                  if (fi < 0 || ti < 0) return;
                  order.splice(fi, 1); order.splice(ti, 0, from);
                  setEffectOrder(order);
                },
              };
              if (key === "glow") return (
                <EffectSection key="glow" label="Glow" enabled={glowOn} onToggle={setGlowOn} color={glowColor} onColorChange={setGlowColor} {...dragProps}>
                  <div className="space-y-2">
                    <EffectSlider label="Opacity" value={glowOpacity} onChange={setGlowOpacity} min={0} max={100} suffix="%" />
                    <EffectSlider label="Intensity" value={glowIntensity} onChange={setGlowIntensity} min={0} max={100} suffix="%" />
                    <EffectSlider label="Softness" value={glowBlur} onChange={setGlowBlur} min={0} max={50} />
                    <EffectSlider label="Blend" value={glowBlend} onChange={setGlowBlend} min={0} max={100} suffix="%" />
                    <EffectSlider label="Offset X" value={glowOffsetX} onChange={setGlowOffsetX} min={-20} max={20} />
                    <EffectSlider label="Offset Y" value={glowOffsetY} onChange={setGlowOffsetY} min={-20} max={20} />
                  </div>
                </EffectSection>
              );
              if (key === "stroke") return (
                <EffectSection key="stroke" label="Stroke" enabled={strokeOn} onToggle={setStrokeOn} color={strokeColor} onColorChange={setStrokeColor} defaultExpanded {...dragProps}>
                  <div className="space-y-2">
                    <EffectSlider label="Thickness" value={strokeWidth} onChange={setStrokeWidth} min={0} max={20} />
                    <EffectSlider label="Opacity" value={strokeOpacity} onChange={setStrokeOpacity} min={0} max={100} suffix="%" />
                    <EffectSlider label="Softness" value={strokeBlur} onChange={setStrokeBlur} min={0} max={20} />
                    <EffectSlider label="Offset X" value={strokeOffsetX} onChange={setStrokeOffsetX} min={-20} max={20} />
                    <EffectSlider label="Offset Y" value={strokeOffsetY} onChange={setStrokeOffsetY} min={-20} max={20} />
                  </div>
                </EffectSection>
              );
              if (key === "shadow") return (
                <EffectSection key="shadow" label="Shadow" enabled={shadowOn} onToggle={setShadowOn} color={shadowColor} onColorChange={setShadowColor} {...dragProps}>
                  <div className="space-y-2">
                    <EffectSlider label="Softness" value={shadowBlur} onChange={setShadowBlur} min={0} max={30} />
                    <EffectSlider label="Opacity" value={shadowOpacity} onChange={setShadowOpacity} min={0} max={100} suffix="%" />
                    <EffectSlider label="Offset X" value={shadowOffsetX} onChange={setShadowOffsetX} min={-30} max={30} />
                    <EffectSlider label="Offset Y" value={shadowOffsetY} onChange={setShadowOffsetY} min={-30} max={30} />
                  </div>
                </EffectSection>
              );
              if (key === "background") return (
                <EffectSection key="background" label="Background" enabled={bgOn} onToggle={setBgOn} color={bgColor} onColorChange={setBgColor} {...dragProps}>
                  <div className="space-y-2">
                    <EffectSlider label="Opacity" value={bgOpacity} onChange={setBgOpacity} min={0} max={100} suffix="%" />
                    <EffectSlider label="Padding X" value={bgPaddingX} onChange={setBgPaddingX} min={0} max={40} />
                    <EffectSlider label="Padding Y" value={bgPaddingY} onChange={setBgPaddingY} min={0} max={20} />
                    <EffectSlider label="Radius" value={bgRadius} onChange={setBgRadius} min={0} max={20} />
                  </div>
                </EffectSection>
              );
              return null;
            })}

            <Separator />

            {/* Sync offset */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-foreground font-medium">Sync offset</span>
                <span className="text-[12px] text-muted-foreground font-mono">{syncOffset > 0 ? "+" : ""}{syncOffset.toFixed(1)}s</span>
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

            <Separator />

            {/* Animation */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-foreground font-medium">Animation</span>
                <ToggleSwitch value={animateOn} onChange={setAnimateOn} />
              </div>
              {animateOn && (
                <div className="space-y-2 mt-2">
                  <EffectSlider label="Pop scale" value={Math.round(animateScale * 100)} onChange={(v) => setAnimateScale(v / 100)} min={100} max={150} suffix="%" />
                  <EffectSlider label="Grow from" value={Math.round(animateGrowFrom * 100)} onChange={(v) => setAnimateGrowFrom(v / 100)} min={50} max={100} suffix="%" />
                  <EffectSlider label="Speed" value={Math.round(animateSpeed * 1000)} onChange={(v) => setAnimateSpeed(v / 1000)} min={50} max={500} suffix="ms" />
                </div>
              )}
            </div>

            <Separator />

            {/* Save as preset shortcut */}
            <Button variant="outline" className="w-full h-8 text-xs gap-2" onClick={() => setSubTab("presets")}>
              <Star className="h-3 w-3" /> Save as preset
            </Button>
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
  const captionSegments = useCaptionStore((s) => s.captionSegments);
  const activeCaptionId = useCaptionStore((s) => s.activeCaptionId);
  const setCaptionText = useCaptionStore((s) => s.setCaptionText);
  // Show the active segment's text (or first segment's text if none selected)
  const captionText = useMemo(() => {
    if (!captionSegments || captionSegments.length === 0) return "";
    const active = captionSegments.find((s) => s.id === activeCaptionId);
    return active ? active.text : captionSegments[0].text;
  }, [captionSegments, activeCaptionId]);
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
  const captionStrokeBlur = useCaptionStore((s) => s.captionStrokeBlur);
  const setCaptionStrokeBlur = useCaptionStore((s) => s.setCaptionStrokeBlur);
  const captionStrokeOffsetX = useCaptionStore((s) => s.captionStrokeOffsetX);
  const setCaptionStrokeOffsetX = useCaptionStore((s) => s.setCaptionStrokeOffsetX);
  const captionStrokeOffsetY = useCaptionStore((s) => s.captionStrokeOffsetY);
  const setCaptionStrokeOffsetY = useCaptionStore((s) => s.setCaptionStrokeOffsetY);
  const captionGlowOn = useCaptionStore((s) => s.captionGlowOn);
  const setCaptionGlowOn = useCaptionStore((s) => s.setCaptionGlowOn);
  const captionGlowColor = useCaptionStore((s) => s.captionGlowColor);
  const setCaptionGlowColor = useCaptionStore((s) => s.setCaptionGlowColor);
  const captionGlowOpacity = useCaptionStore((s) => s.captionGlowOpacity);
  const setCaptionGlowOpacity = useCaptionStore((s) => s.setCaptionGlowOpacity);
  const captionGlowIntensity = useCaptionStore((s) => s.captionGlowIntensity);
  const setCaptionGlowIntensity = useCaptionStore((s) => s.setCaptionGlowIntensity);
  const captionGlowBlur = useCaptionStore((s) => s.captionGlowBlur);
  const setCaptionGlowBlur = useCaptionStore((s) => s.setCaptionGlowBlur);
  const captionGlowBlend = useCaptionStore((s) => s.captionGlowBlend);
  const setCaptionGlowBlend = useCaptionStore((s) => s.setCaptionGlowBlend);
  const captionGlowOffsetX = useCaptionStore((s) => s.captionGlowOffsetX);
  const setCaptionGlowOffsetX = useCaptionStore((s) => s.setCaptionGlowOffsetX);
  const captionGlowOffsetY = useCaptionStore((s) => s.captionGlowOffsetY);
  const setCaptionGlowOffsetY = useCaptionStore((s) => s.setCaptionGlowOffsetY);
  const captionShadowOffsetX = useCaptionStore((s) => s.captionShadowOffsetX);
  const setCaptionShadowOffsetX = useCaptionStore((s) => s.setCaptionShadowOffsetX);
  const captionShadowOffsetY = useCaptionStore((s) => s.captionShadowOffsetY);
  const setCaptionShadowOffsetY = useCaptionStore((s) => s.setCaptionShadowOffsetY);
  const captionBgOn = useCaptionStore((s) => s.captionBgOn);
  const setCaptionBgOn = useCaptionStore((s) => s.setCaptionBgOn);
  const captionBgColor = useCaptionStore((s) => s.captionBgColor);
  const setCaptionBgColor = useCaptionStore((s) => s.setCaptionBgColor);
  const captionBgOpacity = useCaptionStore((s) => s.captionBgOpacity);
  const setCaptionBgOpacity = useCaptionStore((s) => s.setCaptionBgOpacity);
  const captionBgPaddingX = useCaptionStore((s) => s.captionBgPaddingX);
  const setCaptionBgPaddingX = useCaptionStore((s) => s.setCaptionBgPaddingX);
  const captionBgPaddingY = useCaptionStore((s) => s.captionBgPaddingY);
  const setCaptionBgPaddingY = useCaptionStore((s) => s.setCaptionBgPaddingY);
  const captionBgRadius = useCaptionStore((s) => s.captionBgRadius);
  const setCaptionBgRadius = useCaptionStore((s) => s.setCaptionBgRadius);
  const captionEffectOrder = useCaptionStore((s) => s.captionEffectOrder);
  const setCaptionEffectOrder = useCaptionStore((s) => s.setCaptionEffectOrder);
  const markDirty = useEditorStore((s) => s.markDirty);
  const { userPresets, persist } = useUserPresets();

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
          <EffectPresetsGrid userPresets={userPresets} persist={persist} target="caption" />
        ) : (
          <div className="p-3 space-y-2">
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
                <span className="text-[12px] text-muted-foreground w-8 text-right">{captionLineSpacing.toFixed(1)}</span>
              </div>
            </div>

            {/* Effect sections — rendered in draggable order */}
            {(captionEffectOrder || ["glow", "stroke", "shadow", "background"]).map((key) => {
              const dragProps = {
                effectKey: key,
                onDragStart: () => {},
                onDragOver: () => {},
                onDrop: (from, to) => {
                  if (from === to) return;
                  const order = [...(captionEffectOrder || ["glow", "stroke", "shadow", "background"])];
                  const fi = order.indexOf(from); const ti = order.indexOf(to);
                  if (fi < 0 || ti < 0) return;
                  order.splice(fi, 1); order.splice(ti, 0, from);
                  setCaptionEffectOrder(order); markDirty();
                },
              };
              if (key === "glow") return (
                <EffectSection key="glow" label="Glow" enabled={captionGlowOn} onToggle={(v) => { setCaptionGlowOn(v); markDirty(); }} color={captionGlowColor} onColorChange={(c) => { setCaptionGlowColor(c); markDirty(); }} {...dragProps}>
                  <div className="space-y-2">
                    <EffectSlider label="Opacity" value={captionGlowOpacity} onChange={(v) => { setCaptionGlowOpacity(v); markDirty(); }} min={0} max={100} suffix="%" />
                    <EffectSlider label="Intensity" value={captionGlowIntensity} onChange={(v) => { setCaptionGlowIntensity(v); markDirty(); }} min={0} max={100} suffix="%" />
                    <EffectSlider label="Softness" value={captionGlowBlur} onChange={(v) => { setCaptionGlowBlur(v); markDirty(); }} min={0} max={50} />
                    <EffectSlider label="Blend" value={captionGlowBlend} onChange={(v) => { setCaptionGlowBlend(v); markDirty(); }} min={0} max={100} suffix="%" />
                    <EffectSlider label="Offset X" value={captionGlowOffsetX} onChange={(v) => { setCaptionGlowOffsetX(v); markDirty(); }} min={-20} max={20} />
                    <EffectSlider label="Offset Y" value={captionGlowOffsetY} onChange={(v) => { setCaptionGlowOffsetY(v); markDirty(); }} min={-20} max={20} />
                  </div>
                </EffectSection>
              );
              if (key === "stroke") return (
                <EffectSection key="stroke" label="Stroke" enabled={captionStrokeOn} onToggle={(v) => { setCaptionStrokeOn(v); markDirty(); }} color={captionStrokeColor} onColorChange={(c) => { setCaptionStrokeColor(c); markDirty(); }} defaultExpanded {...dragProps}>
                  <div className="space-y-2">
                    <EffectSlider label="Thickness" value={captionStrokeWidth} onChange={(v) => { setCaptionStrokeWidth(v); markDirty(); }} min={0} max={20} />
                    <EffectSlider label="Opacity" value={captionStrokeOpacity} onChange={(v) => { setCaptionStrokeOpacity(v); markDirty(); }} min={0} max={100} suffix="%" />
                    <EffectSlider label="Softness" value={captionStrokeBlur} onChange={(v) => { setCaptionStrokeBlur(v); markDirty(); }} min={0} max={20} />
                    <EffectSlider label="Offset X" value={captionStrokeOffsetX} onChange={(v) => { setCaptionStrokeOffsetX(v); markDirty(); }} min={-20} max={20} />
                    <EffectSlider label="Offset Y" value={captionStrokeOffsetY} onChange={(v) => { setCaptionStrokeOffsetY(v); markDirty(); }} min={-20} max={20} />
                  </div>
                </EffectSection>
              );
              if (key === "shadow") return (
                <EffectSection key="shadow" label="Shadow" enabled={captionShadowOn} onToggle={(v) => { setCaptionShadowOn(v); markDirty(); }} color={captionShadowColor} onColorChange={(c) => { setCaptionShadowColor(c); markDirty(); }} {...dragProps}>
                  <div className="space-y-2">
                    <EffectSlider label="Softness" value={captionShadowBlur} onChange={(v) => { setCaptionShadowBlur(v); markDirty(); }} min={0} max={30} />
                    <EffectSlider label="Opacity" value={captionShadowOpacity} onChange={(v) => { setCaptionShadowOpacity(v); markDirty(); }} min={0} max={100} suffix="%" />
                    <EffectSlider label="Offset X" value={captionShadowOffsetX} onChange={(v) => { setCaptionShadowOffsetX(v); markDirty(); }} min={-30} max={30} />
                    <EffectSlider label="Offset Y" value={captionShadowOffsetY} onChange={(v) => { setCaptionShadowOffsetY(v); markDirty(); }} min={-30} max={30} />
                  </div>
                </EffectSection>
              );
              if (key === "background") return (
                <EffectSection key="background" label="Background" enabled={captionBgOn} onToggle={(v) => { setCaptionBgOn(v); markDirty(); }} color={captionBgColor} onColorChange={(c) => { setCaptionBgColor(c); markDirty(); }} {...dragProps}>
                  <div className="space-y-2">
                    <EffectSlider label="Opacity" value={captionBgOpacity} onChange={(v) => { setCaptionBgOpacity(v); markDirty(); }} min={0} max={100} suffix="%" />
                    <EffectSlider label="Padding X" value={captionBgPaddingX} onChange={(v) => { setCaptionBgPaddingX(v); markDirty(); }} min={0} max={40} />
                    <EffectSlider label="Padding Y" value={captionBgPaddingY} onChange={(v) => { setCaptionBgPaddingY(v); markDirty(); }} min={0} max={20} />
                    <EffectSlider label="Radius" value={captionBgRadius} onChange={(v) => { setCaptionBgRadius(v); markDirty(); }} min={0} max={20} />
                  </div>
                </EffectSection>
              );
              return null;
            })}
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
                      <span className="text-[12px] leading-none font-medium">{item.label}</span>
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
