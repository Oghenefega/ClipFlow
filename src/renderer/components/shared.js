import React, { useState, useEffect, useRef } from "react";
import T from "../styles/theme";

// ============ UTILITIES ============
export const extractGameTag = (t) => { const m = t.match(/#(\w+)/); return m ? m[1].toLowerCase() : null; };
export const hasHashtag = (t) => /#\w+/.test(t);

// ============ COMPONENTS ============
export const PulseDot = ({ color = T.green, size = 8 }) => (
  <span style={{ position: "relative", display: "inline-block", width: size, height: size }}>
    <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color }} />
    <span style={{ position: "absolute", inset: -3, borderRadius: "50%", border: `1.5px solid ${color}`, opacity: 0.4, animation: "pulse 2s ease-in-out infinite" }} />
  </span>
);

export const GamePill = ({ tag, color, size = "md" }) => {
  const s = size === "sm" ? { px: 6, py: 2, fs: 9 } : { px: 10, py: 4, fs: 11 };
  return (
    <span style={{ display: "inline-flex", padding: `${s.py}px ${s.px}px`, background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 6, fontSize: s.fs, fontWeight: 700, color, fontFamily: T.mono, letterSpacing: "1px" }}>
      {tag}
    </span>
  );
};

export const Badge = ({ children, color = T.accent, bg }) => (
  <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color, background: bg || (color === T.green ? T.greenDim : color === T.yellow ? T.yellowDim : color === T.red ? T.redDim : T.accentDim) }}>
    {children}
  </span>
);

export const Checkbox = ({ checked, size = 20 }) => (
  <div style={{ width: size, height: size, borderRadius: 6, flexShrink: 0, border: checked ? "none" : `2px solid ${T.textMuted}`, background: checked ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
    {checked && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
  </div>
);

export const Card = ({ children, style: x, onClick, borderColor }) => (
  <div onClick={onClick} style={{ background: T.surface, borderRadius: T.radius.lg, border: `1px solid ${borderColor || T.border}`, cursor: onClick ? "pointer" : "default", ...x }}>
    {children}
  </div>
);

export const SectionLabel = ({ children }) => (
  <div style={{ color: T.textSecondary, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px" }}>
    {children}
  </div>
);

export const InfoBanner = ({ color = T.accent, icon = "💡", children }) => (
  <div style={{ background: color === T.yellow ? T.yellowDim : color === T.green ? T.greenDim : T.accentGlow, border: `1px solid ${color === T.yellow ? T.yellowBorder : color === T.green ? T.greenBorder : T.accentBorder}`, borderRadius: T.radius.md, padding: "14px 18px" }}>
    <p style={{ color, fontSize: 13, margin: 0, lineHeight: 1.6 }}>{icon} {children}</p>
  </div>
);

export const PageHeader = ({ title, subtitle, backAction, children }) => (
  <div style={{ marginBottom: 28 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      {backAction && (
        <button onClick={backAction} style={{ background: T.surface, borderRadius: T.radius.md, padding: "10px 14px", color: T.textSecondary, fontSize: 16, border: `1px solid ${T.border}`, cursor: "pointer", fontFamily: T.font }}>←</button>
      )}
      <div style={{ flex: 1 }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.6px" }}>{title}</h2>
        {subtitle && <p style={{ color: T.textSecondary, fontSize: 14, margin: "6px 0 0" }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  </div>
);

export const PrimaryButton = ({ onClick, disabled, children }) => (
  <button onClick={onClick} disabled={disabled} style={{ width: "100%", padding: "16px 24px", borderRadius: T.radius.md, border: "none", background: disabled ? "rgba(255,255,255,0.04)" : `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`, color: disabled ? T.textMuted : "#fff", fontSize: 15, fontWeight: 700, fontFamily: T.font, cursor: disabled ? "default" : "pointer", boxShadow: disabled ? "none" : "0 4px 24px rgba(139,92,246,0.3)" }}>
    {children}
  </button>
);

export const TabBar = ({ tabs, active, onChange }) => (
  <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.03)", borderRadius: T.radius.md, padding: 4 }}>
    {tabs.map((t) => (
      <button key={t.id} onClick={() => onChange(t.id)} style={{ padding: "10px 16px", borderRadius: 8, border: "none", cursor: "pointer", background: active === t.id ? "rgba(255,255,255,0.07)" : "transparent", color: active === t.id ? T.text : T.textTertiary, fontSize: 13, fontWeight: 600, fontFamily: T.font, display: "flex", alignItems: "center", gap: 8 }}>
        {t.label}
        {t.count !== undefined && (
          <span style={{ background: active === t.id ? T.accentDim : "rgba(255,255,255,0.04)", color: active === t.id ? T.accentLight : T.textTertiary, padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>
            {t.count}
          </span>
        )}
      </button>
    ))}
  </div>
);

export const Select = ({ value, onChange, options, style: x, renderOption, renderSelected }) => {
  const [open, setOpen] = useState(false);
  const [hovIdx, setHovIdx] = useState(-1);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const parsed = options.map((o) => typeof o === "string" ? { value: o, label: o } : o);
  const selected = parsed.find((o) => o.value === value);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", ...x }}>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: T.surface, border: `1px solid ${open ? T.accentBorder : T.border}`, borderRadius: T.radius.md, padding: "8px 12px", color: T.text, fontSize: 13, fontFamily: T.font, cursor: "pointer", outline: "none", textAlign: "left" }}>
        <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
          {renderSelected && selected ? renderSelected(selected) : (selected?.label || value)}
        </span>
        <span style={{ color: T.textMuted, fontSize: 10, transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "none" }}>{"\u25BC"}</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, minWidth: "100%", maxHeight: 240, overflowY: "auto", overflowX: "hidden", background: T.surface, border: `1px solid ${T.borderHover || T.border}`, borderRadius: T.radius.md, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 999, padding: 4 }}>
          {parsed.map((o, i) => (
            <div key={o.value} onMouseEnter={() => setHovIdx(i)} onMouseLeave={() => setHovIdx(-1)} onClick={() => { onChange(o.value); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, cursor: "pointer", background: o.value === value ? "rgba(139,92,246,0.12)" : hovIdx === i ? "rgba(255,255,255,0.06)" : "transparent", color: o.value === value ? T.accentLight : T.text, fontSize: 13, fontFamily: T.font, fontWeight: o.value === value ? 600 : 400, transition: "background 0.1s" }}>
              {renderOption ? renderOption(o) : o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const ViralBar = ({ score }) => {
  const c = score >= 8.5 ? T.green : score >= 7 ? T.yellow : T.red;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: score >= 8.5 ? T.greenDim : score >= 7 ? T.yellowDim : T.redDim, padding: "4px 12px 4px 8px", borderRadius: 20 }}>
      <div style={{ width: 36, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${(score / 10) * 100}%`, height: "100%", background: c, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: c, fontFamily: T.mono }}>{score}</span>
    </div>
  );
};

export const MiniSpinbox = ({ value, onChange, min = 1, max = 999, label }) => {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(String(value));
  const timerRef = useRef(null);
  const intRef = useRef(null);
  const valRef = useRef(value);

  useEffect(() => { valRef.current = value; setEditVal(String(value)); }, [value]);
  // Clean up timers on unmount to prevent memory leaks
  useEffect(() => () => { clearTimeout(timerRef.current); clearInterval(intRef.current); }, []);

  const startHold = (d) => {
    const step = () => { valRef.current = Math.max(min, Math.min(max, valRef.current + d)); onChange(valRef.current); };
    step();
    timerRef.current = setTimeout(() => { intRef.current = setInterval(step, 80); }, 350);
  };
  const stopHold = () => { clearTimeout(timerRef.current); clearInterval(intRef.current); };
  const commitEdit = () => { const n = parseInt(editVal); if (!isNaN(n) && n >= min && n <= max) onChange(n); setEditing(false); };

  const bs = { width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.textSecondary, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font, userSelect: "none" };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {label && <span style={{ color: T.textTertiary, fontSize: 11, fontWeight: 600, marginRight: 4 }}>{label}</span>}
      <button onMouseDown={() => startHold(-1)} onMouseUp={stopHold} onMouseLeave={stopHold} style={bs}>−</button>
      {editing ? (
        <input value={editVal} onChange={(e) => setEditVal(e.target.value.replace(/\D/g, ""))} onBlur={commitEdit} onKeyDown={(e) => e.key === "Enter" && commitEdit()} autoFocus style={{ width: 42, textAlign: "center", background: "rgba(255,255,255,0.06)", border: `1px solid ${T.accentBorder}`, borderRadius: 6, padding: 4, color: T.text, fontSize: 14, fontWeight: 700, fontFamily: T.mono, outline: "none" }} />
      ) : (
        <div onClick={() => { setEditing(true); setEditVal(String(value)); }} style={{ width: 36, textAlign: "center", color: T.text, fontSize: 14, fontWeight: 700, fontFamily: T.mono, cursor: "text", padding: "4px 0" }}>
          {value}
        </div>
      )}
      <button onMouseDown={() => startHold(1)} onMouseUp={stopHold} onMouseLeave={stopHold} style={bs}>+</button>
    </div>
  );
};

export const ColorPicker = ({ value, onChange }) => {
  const presets = ["#ff6b35", "#00b4d8", "#ff4655", "#ffd23f", "#fca311", "#06d6a0", "#9b5de5", "#ef476f", "#00ff88", "#e0e0e0"];
  const [showWheel, setShowWheel] = useState(false);
  const [hex, setHex] = useState(value);
  const [hue, setHue] = useState(0);

  useEffect(() => { setHex(value); }, [value]);

  const commitHex = () => { if (/^#[0-9a-fA-F]{6}$/.test(hex)) onChange(hex); };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {presets.map((c) => (
          <button key={c} onClick={() => { onChange(c); setHex(c); }} style={{ width: 32, height: 32, borderRadius: 8, background: c, border: value === c ? "3px solid #fff" : "2px solid transparent", cursor: "pointer" }} />
        ))}
        <button onClick={() => setShowWheel(!showWheel)} style={{ width: 32, height: 32, borderRadius: 8, background: "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)", border: showWheel ? "3px solid #fff" : "2px solid transparent", cursor: "pointer" }} />
      </div>
      {showWheel && (
        <div style={{ marginTop: 12, padding: 14, background: "rgba(255,255,255,0.03)", borderRadius: T.radius.md, border: `1px solid ${T.border}` }}>
          <SectionLabel>Hue</SectionLabel>
          <input type="range" min="0" max="360" value={hue} onChange={(e) => { setHue(e.target.value); const c = `hsl(${e.target.value},80%,55%)`; onChange(c); setHex(c); }} style={{ width: "100%", cursor: "pointer", marginTop: 8, marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <SectionLabel>Hex</SectionLabel>
            <input value={hex} onChange={(e) => setHex(e.target.value)} onBlur={commitHex} onKeyDown={(e) => e.key === "Enter" && commitHex()} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 12px", color: T.text, fontSize: 13, fontFamily: T.mono, outline: "none" }} />
            <div style={{ width: 32, height: 32, borderRadius: 8, background: value, border: `1px solid ${T.border}`, flexShrink: 0 }} />
          </div>
        </div>
      )}
    </div>
  );
};
