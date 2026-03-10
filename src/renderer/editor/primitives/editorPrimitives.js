import React from "react";
import T from "../../styles/theme";
import { S2, S3, BD, BDH } from "../utils/constants";
import { fmtTime, parseTime } from "../utils/timeUtils";

// ── Icon Button ──
export const Ib = ({ title, children, onClick, active, style: x }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
      borderRadius: 5, border: "none", background: active ? T.accentDim : "transparent",
      color: active ? T.accentLight : T.textSecondary, cursor: "pointer", fontSize: 14,
      fontFamily: T.font, transition: "all 0.15s", flexShrink: 0, ...x,
    }}
  >
    {children}
  </button>
);

// ── Pill / Tab Button ──
export const Pill = ({ label, active, onClick, icon }) => (
  <button
    onClick={onClick}
    style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
      padding: "5px 4px", borderRadius: 5, border: `1px solid ${active ? T.accentBorder : BD}`,
      background: active ? T.accentDim : S2, fontSize: 10, color: active ? T.accentLight : T.textSecondary,
      cursor: "pointer", fontFamily: T.font, fontWeight: 500, whiteSpace: "nowrap", transition: "all 0.15s",
    }}
  >
    {icon && <span style={{ fontSize: 10, fontWeight: 800 }}>{icon}</span>}
    {label}
  </button>
);

// ── Tool Button ──
export const ToolBtn = ({ children, onClick, active, style: x }) => (
  <button
    onClick={onClick}
    style={{
      display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: active ? T.accentLight : T.textSecondary,
      background: active ? T.accentDim : S2, border: `1px solid ${active ? T.accentBorder : BD}`,
      borderRadius: 5, padding: "4px 9px", cursor: "pointer", fontFamily: T.font, whiteSpace: "nowrap",
      transition: "all 0.15s", ...x,
    }}
  >
    {children}
  </button>
);

// ── Panel Tab ──
export const PanelTab = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      flex: 1, padding: "10px 0", textAlign: "center", fontSize: 12, fontWeight: 500,
      color: active ? T.text : T.textSecondary, cursor: "pointer",
      background: "transparent", border: "none", borderBottomStyle: "solid", borderBottomWidth: 2,
      borderBottomColor: active ? T.accent : "transparent", fontFamily: T.font, transition: "all 0.15s",
    }}
  >
    {label}
  </button>
);

// ── Divider ──
export const Divider = () => <div style={{ height: 1, background: BD }} />;

// ── Toggle Switch ──
export const Toggle = ({ on, onClick }) => (
  <div
    onClick={onClick}
    style={{
      width: 30, height: 16, borderRadius: 8, background: on ? T.accent : S3,
      border: `1px solid ${on ? T.accent : BD}`, cursor: "pointer", position: "relative",
      transition: "background 0.2s", flexShrink: 0,
    }}
  >
    <div
      style={{
        position: "absolute", top: 2, left: on ? 16 : 2, width: 10, height: 10,
        borderRadius: "50%", background: "#fff", transition: "left 0.2s",
      }}
    />
  </div>
);

// ── Color Swatch Button ──
export const SwatchBtn = ({ color, size = 20, selected, onClick, style: x }) => (
  <div
    onClick={onClick}
    style={{
      width: size, height: size, borderRadius: selected ? "50%" : 4, background: color,
      cursor: "pointer", border: selected ? "2px solid #fff" : `1px solid ${BD}`,
      boxShadow: selected ? `0 0 0 2px ${T.accent}` : "none",
      flexShrink: 0, transition: "transform 0.1s", ...x,
    }}
  />
);

// ── 3x3 Position Grid ──
export const PosGrid = ({ value, onChange, cellSize = 14, gap = 3, width = 60 }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap, width, flexShrink: 0 }}>
    {[0,1,2,3,4,5,6,7,8].map(i => (
      <div
        key={i}
        onClick={() => onChange(i)}
        style={{
          height: cellSize, borderRadius: 2, background: value === i ? T.accent : S3,
          border: `1px solid ${value === i ? T.accent : BD}`, cursor: "pointer", transition: "all 0.15s",
        }}
      />
    ))}
  </div>
);

// ── Number Input with +/- ──
export const NumBox = ({ value, onChange, min = 0, max = 999 }) => (
  <div style={{ display: "flex", alignItems: "center", background: S2, border: `1px solid ${BD}`, borderRadius: 5, overflow: "hidden" }}>
    <button onClick={() => onChange(Math.max(min, value - 1))} style={{ width: 22, height: 28, background: "transparent", border: "none", color: T.textSecondary, cursor: "pointer", fontSize: 13, fontFamily: T.font, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
    <span style={{ fontSize: 11, fontFamily: T.mono, color: T.text, padding: "0 4px", minWidth: 24, textAlign: "center" }}>{value}</span>
    <button onClick={() => onChange(Math.min(max, value + 1))} style={{ width: 22, height: 28, background: "transparent", border: "none", color: T.textSecondary, cursor: "pointer", fontSize: 13, fontFamily: T.font, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
  </div>
);

// ── Labeled Slider Row ──
export const SliderRow = ({ label, value, onChange, min = 0, max = 100, suffix = "" }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    {label && <span style={{ fontSize: 10, color: T.textSecondary, flexShrink: 0 }}>{label}</span>}
    <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} style={{ flex: 1, height: 3, accentColor: T.accent, cursor: "pointer" }} />
    <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textSecondary, minWidth: 22, textAlign: "right", flexShrink: 0 }}>{value}{suffix}</span>
  </div>
);

// ── Editable Timecode with Popover ──
export const EditableTC = ({ value, onChange, clipDuration }) => {
  const [open, setOpen] = React.useState(false);
  const [val, setVal] = React.useState(value);
  const [secVal, setSecVal] = React.useState(0);
  const containerRef = React.useRef(null);
  React.useEffect(() => { setVal(value); setSecVal(parseTime(value)); }, [value]);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) { setOpen(false); setVal(value); } };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, value]);

  return (
    <span ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <span
        onClick={e => { e.stopPropagation(); setOpen(!open); }}
        style={{
          fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: open ? "#a78bfa" : T.textSecondary,
          padding: "2px 5px", borderRadius: 3, cursor: "pointer",
          background: open ? "rgba(139,92,246,0.1)" : "transparent",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = "rgba(139,92,246,0.1)"; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = "transparent"; }}
        title="Click to adjust timecode"
      >
        {value}
      </span>
      {open && (
        <div onClick={e => e.stopPropagation()} style={{
          position: "absolute", top: "100%", left: -10, zIndex: 50,
          background: "#1a1b22", border: "1px solid rgba(139,92,246,0.4)",
          borderRadius: 6, padding: "8px 10px", minWidth: 180, marginTop: 4,
          boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <input
              value={val}
              onChange={e => { setVal(e.target.value); setSecVal(parseTime(e.target.value)); }}
              style={{
                width: 60, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#a78bfa",
                background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)",
                borderRadius: 3, padding: "3px 5px", outline: "none", textAlign: "center",
              }}
            />
            <span style={{ fontSize: 10, color: T.textTertiary }}>{secVal.toFixed(1)}s</span>
          </div>
          <input
            type="range" min={0} max={(clipDuration || 60) * 10} step={1}
            value={secVal * 10}
            onChange={e => { const s = Number(e.target.value) / 10; setSecVal(s); setVal(fmtTime(s)); }}
            style={{ width: "100%", height: 3, accentColor: "#a78bfa", cursor: "pointer" }}
          />
          <div style={{ display: "flex", gap: 4, marginTop: 6, justifyContent: "flex-end" }}>
            <button onClick={() => { setOpen(false); setVal(value); }}
              style={{ padding: "3px 8px", fontSize: 10, borderRadius: 3, border: `1px solid ${BD}`, background: "transparent", color: T.textSecondary, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
            <button onClick={() => { setOpen(false); onChange(fmtTime(secVal)); }}
              style={{ padding: "3px 8px", fontSize: 10, borderRadius: 3, border: "1px solid rgba(139,92,246,0.4)", background: "rgba(139,92,246,0.15)", color: "#a78bfa", cursor: "pointer", fontFamily: T.font }}>Apply</button>
          </div>
        </div>
      )}
    </span>
  );
};
