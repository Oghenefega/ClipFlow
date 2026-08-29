import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import T from "../styles/theme";
import { parseTags } from "../utils/ytTags";

// ============ UTILITIES ============
// #329: defined in src/shared/captionResolve.js so the main process can require()
// the same function — the publish scheduler resolves game tags with no renderer.
// Re-exported here so existing importers keep their import path.
export { extractGameTag } from "../../shared/captionResolve";
export const hasHashtag = (t) => /#\w+/.test(t);

// Convert a Windows file path to a Chromium-safe file:// URL.
// `#` and `?` would otherwise be parsed as URL fragment/query delimiters and
// truncate the path — common when clip filenames contain a hashtag (e.g. "...#rocketleague.jpg").
export const toFileUrl = (p) =>
  p ? `file://${p.replace(/\\/g, "/").replace(/#/g, "%23").replace(/\?/g, "%3F")}` : "";

// Seconds → "Xh Ym" / "Ym" (human-readable duration)
export const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// ============ COMPONENTS ============
export const PulseDot = ({ color = T.green, size = 8 }) => (
  <span style={{ position: "relative", display: "inline-block", width: size, height: size }}>
    <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color }} />
    <span style={{ position: "absolute", inset: -3, borderRadius: "50%", border: `1.5px solid ${color}`, opacity: 0.4, animation: "pulse 2s ease-in-out infinite" }} />
  </span>
);

export const GamePill = ({ tag, color, size = "md", variant }) => {
  const s = size === "sm" ? { px: 6, py: 3, fs: 10 } : { px: 10, py: 4, fs: 11 };
  // "solid": bold game-hue gradient fill with white text — the Projects-tab
  // poster look shrunk to pill size (Queue rows). Default stays the subtle
  // tint used across Rename/Settings.
  if (variant === "solid") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: `${s.py + 1}px ${s.px + 2}px`, borderRadius: 6, fontSize: s.fs, fontWeight: 800, color: "#fff", fontFamily: T.mono, letterSpacing: "1px", lineHeight: 1, background: `linear-gradient(150deg, ${color}, ${color}99 70%, ${color}55)`, textShadow: "0 1px 3px rgba(var(--shade),calc(0.55 * var(--shadeK)))", boxShadow: `0 0 10px ${color}33` }}>
        {tag}
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: `${s.py}px ${s.px}px`, background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 6, fontSize: s.fs, fontWeight: 700, color, fontFamily: T.mono, letterSpacing: "1px", lineHeight: 1 }}>
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

// #291: icon-only copy button. Swaps to a tick for 1.5s so the click answers
// itself without the label reflowing the row it sits in.
export const CopyIconButton = ({ value, title = "Copy", size = 13, style: x }) => {
  const [done, setDone] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value || "");
    setDone(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1500);
  };
  return (
    <button
      onClick={copy}
      title={done ? "Copied" : title}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 3, borderRadius: 5, border: "none", background: "transparent", color: done ? T.green : T.textTertiary, cursor: "pointer", lineHeight: 0, transition: "color 0.15s", ...x }}
      onMouseEnter={(e) => { if (!done) e.currentTarget.style.color = T.text; }}
      onMouseLeave={(e) => { if (!done) e.currentTarget.style.color = T.textTertiary; }}
    >
      {done ? (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      )}
    </button>
  );
};

// Token editor for a YouTube tag list. Replaces the flat comma-separated text
// both tag editors used to show while editing — a list you could only unpick
// with backspace. Comma or Enter commits the typed word; every pill carries an
// ✕. All the commit rules live here so the Queue's per-clip editor and the
// per-game editor in Captions & Descriptions can never disagree.
//
// FULLY CONTROLLED, including the half-typed word (`draft`). That is deliberate:
// clicking Save or clicking outside blurs the input in the same event that would
// read state back, so an internally-held draft would be lost exactly when the
// user expects it saved. For the same reason `onCommitBlur` is handed the
// finished list — callers must save from that argument, never from their state.
export const TagInput = ({
  tags = [], draft = "", onChange, onCommitBlur, onEscape,
  invalid, autoFocus, placeholder, minHeight = 56,
}) => {
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const skipBlur = useRef(false);
  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  // Fold `text` (one word, or a pasted comma list) into the committed tags.
  // parseTags applied to the whole concatenation is what drops blanks and
  // case-insensitive duplicates while keeping the spelling already on screen.
  const commit = (text) => {
    const next = parseTags([...tags, text].join(","));
    onChange?.(next, "");
    return next;
  };

  const keyDown = (e) => {
    if (e.key === "," || e.key === "Enter") { e.preventDefault(); commit(draft); return; }
    if (e.key === "Escape") { e.preventDefault(); skipBlur.current = true; onEscape?.(); return; }
    // Only when there is nothing to delete in the box itself, so backspace never
    // eats a pill while a word is still being typed.
    if (e.key === "Backspace" && draft === "" && tags.length) { e.preventDefault(); onChange?.(tags.slice(0, -1), ""); }
  };

  const paste = (e) => {
    const text = e.clipboardData?.getData("text") || "";
    // A single word can just land in the box; only a list needs splitting.
    if (!text.includes(",")) return;
    e.preventDefault();
    commit(draft + text);
  };

  const blur = (e) => {
    // Escape already tore the editor down — don't also save on the way out.
    if (skipBlur.current) { skipBlur.current = false; return; }
    // A click that lands back inside the box is not leaving the field.
    if (boxRef.current?.contains(e.relatedTarget)) return;
    onCommitBlur?.(commit(draft));
  };

  const remove = (t) => onChange?.(tags.filter((x) => x !== t), draft);

  return (
    <div
      ref={boxRef}
      // Any press inside the box that isn't in the text field itself puts the
      // caret there instead — including on a pill's label, which must not read
      // as leaving the field and trigger a save. (The ✕ stops propagation and
      // handles its own preventDefault.)
      onMouseDown={(e) => { if (e.target !== inputRef.current) { e.preventDefault(); inputRef.current?.focus(); } }}
      onClick={(e) => e.stopPropagation()}
      style={{ width: "100%", minHeight, background: "rgba(var(--lift),0.06)", border: `1px solid ${invalid ? T.red : T.accentBorder}`, borderRadius: 8, padding: "7px 9px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5, cursor: "text", boxSizing: "border-box" }}
    >
      {tags.map((t) => (
        <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: T.textSecondary, background: "rgba(var(--lift),0.05)", border: `1px solid ${T.border}`, borderRadius: 5, padding: "2px 4px 2px 7px", whiteSpace: "nowrap", maxWidth: "100%" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t}</span>
          <button
            // preventDefault keeps focus in the input, so removing a pill never
            // reads as leaving the field and never triggers a save.
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); remove(t); }}
            title={`Remove ${t}`}
            tabIndex={-1}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, padding: 0, border: "none", borderRadius: 3, background: "transparent", color: T.textTertiary, cursor: "pointer", lineHeight: 0, flexShrink: 0, transition: "color 0.12s, background 0.12s" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.red; e.currentTarget.style.background = T.redDim; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.textTertiary; e.currentTarget.style.background = "transparent"; }}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => onChange?.(tags, e.target.value)}
        onKeyDown={keyDown}
        onPaste={paste}
        onBlur={blur}
        placeholder={tags.length === 0 ? placeholder : ""}
        style={{ flex: "1 1 90px", minWidth: 90, background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12.5, fontFamily: T.font, padding: "2px 0" }}
      />
      {/* Empty the whole list in one click — 20 individual ✕ presses was the
          only way to start a tag set over. Not a confirm step on purpose:
          nothing is written until the field is left, so Escape (Queue) or
          Cancel (Captions) puts the list back untouched. */}
      {(tags.length > 0 || draft) && (
        <button
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); onChange?.([], ""); inputRef.current?.focus(); }}
          title="Clear all tags"
          tabIndex={-1}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3, marginLeft: "auto", padding: "2px 6px", border: `1px solid ${T.border}`, borderRadius: 5, background: "transparent", color: T.textTertiary, cursor: "pointer", fontSize: 10, fontWeight: 700, fontFamily: T.font, lineHeight: 1.4, flexShrink: 0, transition: "color 0.12s, background 0.12s, border-color 0.12s" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.red; e.currentTarget.style.background = T.redDim; e.currentTarget.style.borderColor = T.redBorder; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.textTertiary; e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = T.border; }}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ display: "block" }}><path d="M18 6 6 18M6 6l12 12" /></svg>
          Clear all
        </button>
      )}
    </div>
  );
};

// `id` exists so Settings search can scroll a specific card into view (#331).
export const Card = ({ children, style: x, onClick, borderColor, id }) => (
  <div id={id} onClick={onClick} style={{ background: T.surface, borderRadius: T.radius.lg, border: `1px solid ${borderColor || T.border}`, cursor: onClick ? "pointer" : "default", ...x }}>
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
  <button onClick={onClick} disabled={disabled} style={{ width: "100%", padding: "16px 24px", borderRadius: T.radius.md, border: "none", background: disabled ? "rgba(var(--lift),0.04)" : `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`, color: disabled ? T.textMuted : "#fff", fontSize: 15, fontWeight: 700, fontFamily: T.font, cursor: disabled ? "default" : "pointer", boxShadow: disabled ? "none" : "0 4px 24px rgba(139,92,246,0.3)" }}>
    {children}
  </button>
);

export const TabBar = ({ tabs, active, onChange }) => (
  <div style={{ display: "flex", gap: 2, background: "rgba(var(--lift),0.03)", borderRadius: T.radius.md, padding: 4 }}>
    {tabs.map((t) => (
      <button key={t.id} onClick={() => onChange(t.id)} style={{ padding: "10px 16px", borderRadius: 8, border: "none", cursor: "pointer", background: active === t.id ? "rgba(var(--lift),0.07)" : "transparent", color: active === t.id ? T.text : T.textTertiary, fontSize: 13, fontWeight: 600, fontFamily: T.font, display: "flex", alignItems: "center", gap: 8 }}>
        {t.label}
        {t.count !== undefined && (
          <span style={{ background: active === t.id ? T.accentDim : "rgba(var(--lift),0.04)", color: active === t.id ? T.accentLight : T.textTertiary, padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>
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
  const menuRef = useRef(null);
  const [rect, setRect] = useState(null);

  // Portal the menu to <body> so it escapes ancestors' overflow:hidden and the
  // stacking contexts dnd-kit's row transforms create (Queue schedule pickers
  // were clipped by their section card \u2014 same disease as the Rename pickers).
  // Outside-click checks trigger AND menu; page scroll closes it but scrolling
  // inside the menu does not (RenameView pattern).
  useEffect(() => {
    if (!open) return;
    if (ref.current) setRect(ref.current.getBoundingClientRect());
    const onDown = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onScroll = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const parsed = options.map((o) => typeof o === "string" ? { value: o, label: o } : o);
  const selected = parsed.find((o) => o.value === value);

  const menu = open && rect ? createPortal(
    <div ref={menuRef} style={{ position: "fixed", top: rect.bottom + 4, left: rect.left, minWidth: rect.width, width: "max-content", maxWidth: Math.max(rect.width, window.innerWidth - rect.left - 12), maxHeight: 240, overflowY: "auto", overflowX: "hidden", background: T.surface, border: `1px solid ${T.borderHover || T.border}`, borderRadius: T.radius.md, boxShadow: "0 8px 32px rgba(var(--shade),calc(0.5 * var(--shadeK)))", zIndex: 10000, padding: 4 }}>
      {/* An option with isHeader is a group label (#322 game-scope pickers):
          it must not select, close the menu, or invite a click. */}
      {parsed.map((o, i) => (
        <div key={o.value} onMouseEnter={() => setHovIdx(i)} onMouseLeave={() => setHovIdx(-1)} onClick={() => { if (o.isHeader) return; onChange(o.value); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, cursor: o.isHeader ? "default" : "pointer", background: o.value === value ? "rgba(139,92,246,0.12)" : hovIdx === i && !o.isHeader ? "rgba(var(--lift),0.06)" : "transparent", color: o.value === value ? T.accentLight : T.text, fontSize: 13, fontFamily: T.font, fontWeight: o.value === value ? 600 : 400, transition: "background 0.1s" }}>
          {renderOption ? renderOption(o) : o.label}
        </div>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", ...x }}>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: T.surface, border: `1px solid ${open ? T.accentBorder : T.border}`, borderRadius: T.radius.md, padding: "8px 12px", color: T.text, fontSize: 13, fontFamily: T.font, cursor: "pointer", outline: "none", textAlign: "left" }}>
        <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
          {renderSelected && selected ? renderSelected(selected) : (selected?.label || value)}
        </span>
        <span style={{ color: T.textMuted, fontSize: 10, transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "none" }}>{"\u25BC"}</span>
      </button>
      {menu}
    </div>
  );
};

export const ViralBar = ({ score }) => {
  const c = score >= 8.5 ? T.green : score >= 7 ? T.yellow : T.red;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: score >= 8.5 ? T.greenDim : score >= 7 ? T.yellowDim : T.redDim, padding: "4px 12px 4px 8px", borderRadius: 20 }}>
      <div style={{ width: 36, height: 3, background: "rgba(var(--lift),0.06)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${(score / 10) * 100}%`, height: "100%", background: c, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: c, fontFamily: T.mono }}>{score}</span>
    </div>
  );
};

export const MiniSpinbox = ({ value, onChange, min = 1, max = 999, label, compact }) => {
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

  const btnSize = compact ? 22 : 28;
  const btnFont = compact ? 12 : 14;
  const valWidth = compact ? 28 : 36;
  const valFont = compact ? 13 : 14;
  const editWidth = compact ? 34 : 42;
  const bs = { width: btnSize, height: btnSize, borderRadius: compact ? 4 : 6, border: `1px solid ${T.border}`, background: "rgba(var(--lift),0.03)", color: T.textSecondary, fontSize: btnFont, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font, userSelect: "none" };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 2 : 4 }}>
      {label && <span style={{ color: compact ? T.textSecondary : T.textTertiary, fontSize: 11, fontWeight: 600, marginRight: compact ? 2 : 4 }}>{label}</span>}
      <button onMouseDown={() => startHold(-1)} onMouseUp={stopHold} onMouseLeave={stopHold} style={bs}>−</button>
      {editing ? (
        <input value={editVal} onChange={(e) => setEditVal(e.target.value.replace(/\D/g, ""))} onBlur={commitEdit} onKeyDown={(e) => e.key === "Enter" && commitEdit()} autoFocus style={{ width: editWidth, textAlign: "center", background: "rgba(var(--lift),0.06)", border: `1px solid ${T.accentBorder}`, borderRadius: compact ? 4 : 6, padding: compact ? 2 : 4, color: T.text, fontSize: valFont, fontWeight: 700, fontFamily: T.mono, outline: "none" }} />
      ) : (
        <div onClick={() => { setEditing(true); setEditVal(String(value)); }} style={{ width: valWidth, textAlign: "center", color: T.text, fontSize: valFont, fontWeight: 700, fontFamily: T.mono, cursor: "text", padding: compact ? "2px 0" : "4px 0" }}>
          {value}
        </div>
      )}
      <button onMouseDown={() => startHold(1)} onMouseUp={stopHold} onMouseLeave={stopHold} style={bs}>+</button>
    </div>
  );
};

export const PillSpinbox = ({ value, onChange, min = 1, max = 999, label, color = T.accent }) => {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(String(value));

  useEffect(() => { setEditVal(String(value)); }, [value]);

  const commitEdit = () => {
    const n = parseInt(editVal);
    if (!isNaN(n) && n >= min && n <= max) onChange(n);
    setEditing(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const d = e.deltaY < 0 ? 1 : -1;
    const next = Math.max(min, Math.min(max, value + d));
    onChange(next);
  };

  return (
    <div
      onWheel={handleWheel}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, height: 36,
        background: T.surface, border: `1px solid ${color}44`,
        borderRadius: T.radius.md, padding: "0 12px", cursor: "default", userSelect: "none",
      }}
    >
      <span style={{ color, fontSize: 13, fontWeight: 600, fontFamily: T.font }}>{label}</span>
      <div style={{ width: value > 99 ? 30 : 20, textAlign: "center" }}>
        {editing ? (
          <input
            value={editVal}
            onChange={(e) => setEditVal(e.target.value.replace(/\D/g, ""))}
            onBlur={commitEdit}
            onKeyDown={(e) => e.key === "Enter" && commitEdit()}
            autoFocus
            style={{
              width: "100%", textAlign: "center", background: "transparent", border: "none",
              color: T.text, fontSize: 13, fontWeight: 700, fontFamily: T.mono, outline: "none", padding: 0,
            }}
          />
        ) : (
          <span
            onClick={() => { setEditing(true); setEditVal(String(value)); }}
            style={{ color: T.text, fontSize: 13, fontWeight: 700, fontFamily: T.mono, cursor: "text" }}
          >{value}</span>
        )}
      </div>
    </div>
  );
};

// #242: game colors must be 6-digit hex — GamePill and the game-hue gradients
// build tints by suffixing alpha onto the hex (`${color}18`), which silently
// produces invalid CSS for any other format (the old hue wheel emitted hsl()).
export const hslToHex = (h, s, l) => {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return "#" + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("");
};

export const normalizeHexColor = (color) => {
  if (typeof color !== "string" || /^#[0-9a-fA-F]{6}$/.test(color)) return color;
  const m = color.match(/^hsl\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)$/i);
  return m ? hslToHex(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])) : color;
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
        <div style={{ marginTop: 12, padding: 14, background: "rgba(var(--lift),0.03)", borderRadius: T.radius.md, border: `1px solid ${T.border}` }}>
          <SectionLabel>Hue</SectionLabel>
          <input type="range" min="0" max="360" value={hue} onChange={(e) => { setHue(e.target.value); const c = hslToHex(parseInt(e.target.value, 10), 80, 55); onChange(c); setHex(c); }} style={{ width: "100%", cursor: "pointer", marginTop: 8, marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <SectionLabel>Hex</SectionLabel>
            <input value={hex} onChange={(e) => setHex(e.target.value)} onBlur={commitHex} onKeyDown={(e) => e.key === "Enter" && commitHex()} style={{ flex: 1, background: "rgba(var(--lift),0.04)", border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 12px", color: T.text, fontSize: 13, fontFamily: T.mono, outline: "none" }} />
            <div style={{ width: 32, height: 32, borderRadius: 8, background: value, border: `1px solid ${T.border}`, flexShrink: 0 }} />
          </div>
        </div>
      )}
    </div>
  );
};
