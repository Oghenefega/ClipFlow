import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import T from "../styles/theme";
import { PulseDot, GamePill, Card, SectionLabel, InfoBanner, Select, MiniSpinbox, Checkbox, formatDuration, toFileUrl, ReactSwitch, renderEntryOption } from "../components/shared";
import { groupedEntryOptions, linkedGame } from "../../shared/reactions";
import ThumbnailScrubber from "../components/ThumbnailScrubber";

// ── Preset metadata (mirrored from naming-presets.js for UI rendering) ──
const PRESET_LIST = [
  { id: "tag-date-day-part", label: "Date + Tag + Day + Part", example: "2026-03-15 AR Day30 Pt1" },
  { id: "tag-day-part", label: "Tag + Day + Part", example: "AR Day30 Pt1" },
  { id: "tag-date", label: "Date + Tag", example: "2026-03-15 AR" },
  { id: "tag-label", label: "Tag + Custom Label", example: "AR ranked-grind" },
  { id: "tag-date-label", label: "Date + Tag + Custom Label", example: "2026-03-15 AR ranked-grind" },
  { id: "original-tag", label: "Tag + Original", example: "AR 2026-03-15 14-30-22" },
];

const PRESETS_USING_DAY = new Set(["tag-date-day-part", "tag-day-part"]);
const PRESETS_USING_LABEL = new Set(["tag-label", "tag-date-label"]);
const PRESETS_ALWAYS_PARTS = new Set(["tag-date-day-part", "tag-day-part"]);

// ── #172 session-ledger helpers ──

// #264: split-child letter suffix — 0→"a", 25→"z", 26→"aa" (bijective base-26)
const subPartLetter = (i) => {
  let n = i + 1, s = "";
  while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
};

// Seconds → clock string ("29:52", "1:04:12")
const fmtClock = (s) => {
  if (s == null || isNaN(s)) return "—";
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = String(t % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

// "2026-07-17" → "Fri, Jul 17". Built from local date parts, never toISOString.
const fmtSessionDate = (dateStr) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || "");
  if (!m) return dateStr || "Unknown date";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};


// Floating batch bar shell — same glass treatment as the Recordings action
// cluster (#123), bottom-centered. bottom:72 clears the 56px bottom nav.
const BAR_SHELL = {
  position: "fixed", left: "50%", bottom: 72, zIndex: 90,
  transform: "translateX(-50%)",
  display: "flex", alignItems: "center", gap: 10,
  animation: "cfrBarUp 0.18s ease-out",
};
// The glass, applied ONLY when the bar holds the selection cluster. Wrapped
// around the lone "Rename All" button it shrink-wrapped it, and its 12%-white
// border read as a silver halo around the purple — never the intent, and not
// how the button looked before it moved into this bar in #172.
const BAR_GLASS = {
  padding: "9px 12px", borderRadius: T.radius.lg,
  background: "rgba(22,23,31,0.92)", backdropFilter: "blur(14px)",
  border: `1px solid ${T.borderHover}`, boxShadow: "0 10px 32px rgba(var(--shade),calc(0.5 * var(--shadeK)))",
};
const BAR_BTN = { fontFamily: T.font, fontSize: 12, fontWeight: 700, borderRadius: 9, padding: "8px 16px", cursor: "pointer", border: "1px solid transparent", whiteSpace: "nowrap" };

// Compact visual checkbox with a half-selected state. Single click handler on
// the element itself (no nested toggles).
function LedgerCheck({ state, onClick, title }) {
  return (
    <span
      onClick={onClick}
      title={title}
      style={{
        width: 16, height: 16, borderRadius: 5, flexShrink: 0, cursor: "pointer",
        border: `1px solid ${state === "on" ? T.accent : state === "half" ? T.accentBorder : T.borderHover}`,
        background: state === "on" ? T.accent : state === "half" ? T.accentDim : "transparent",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: state === "half" ? T.accentLight : "#fff", fontSize: 10, fontWeight: 800,
        lineHeight: 1, userSelect: "none",
        transition: "background 0.12s, border-color 0.12s",
      }}
    >{state === "on" ? "✓" : state === "half" ? "–" : ""}</span>
  );
}

// ── #485 layout helpers ──

// A game colour (gamesDb hex, sometimes "#888") at an alpha. Anything that
// isn't a hex — a theme var — goes through color-mix instead.
const hexA = (c, a) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c || "");
  if (!m) return `color-mix(in srgb, ${c || T.accent} ${Math.round(a * 100)}%, transparent)`;
  const h = m[1].length === 3 ? m[1].split("").map((x) => x + x).join("") : m[1];
  const n = parseInt(h, 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

// The tile tint and its selected state, in the file's own game colour (s284/s285).
const gameVars = (c) => ({
  "--gc1": hexA(c, 0.12), "--gc2": hexA(c, 0.10), "--gc3": hexA(c, 0.025), "--gcb": hexA(c, 0.24),
  "--gs1": hexA(c, 0.30), "--gs2": hexA(c, 0.26), "--gs3": hexA(c, 0.07), "--gsb": hexA(c, 0.7),
});

// OBS names carry the recording's start: "2026-09-21 13-24-52" → minutes after midnight.
const obsStartMin = (fileName) => {
  const m = /^\d{4}-\d{2}-\d{2}[ _](\d{2})-(\d{2})-(\d{2})/.exec(fileName || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 60 : null;
};
const fmtClockOfDay = (min) => {
  let h = Math.floor(min / 60) % 24, mm = Math.round(min % 60);
  if (mm === 60) { h = (h + 1) % 24; mm = 0; }
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const fmtBytes = (n) => (!n ? "—" : n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${Math.round(n / 1e6)} MB`);
const localDate = (dateStr) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const relDay = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return "";
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  return days <= 0 ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : days === 1 ? "yesterday" : `${days} days ago`;
};

const IcRefresh = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></svg>;
const IcPlus = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M5 12h14M12 5v14" /></svg>;
const IcArrow = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>;
const IcChevron = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>;
const IcScissorsL = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><path d="M8.12 8.12 12 12M20 4 8.12 15.88" /><circle cx="6" cy="18" r="3" /><path d="M14.8 14.8 20 20" /></svg>;
const IcFolderL = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>;
const IcEyeOff = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" /></svg>;

// Opens and closes its content by animating the row height (the split strip).
// While closing it keeps showing what it last held.
function Collapse({ open, children }) {
  const [shown, setShown] = useState(open);
  const [on, setOn] = useState(false);
  const last = useRef(children);
  if (open) last.current = children;
  useEffect(() => {
    if (open) {
      setShown(true);
      let id2 = 0;
      const id = requestAnimationFrame(() => { id2 = requestAnimationFrame(() => setOn(true)); });
      return () => { cancelAnimationFrame(id); cancelAnimationFrame(id2); };
    }
    setOn(false);
    const t = setTimeout(() => setShown(false), 330);
    return () => clearTimeout(t);
  }, [open]);
  if (!shown) return null;
  return (
    <div style={{ display: "grid", gridTemplateRows: on ? "1fr" : "0fr", transition: "grid-template-rows 0.32s cubic-bezier(.22,1,.36,1)" }}>
      <div style={{ overflow: "hidden", minHeight: 0 }}>{open ? children : last.current}</div>
    </div>
  );
}

// #485: the right-hand panel for the selected file. The preview scrubs by
// swapping the recording's preview frames (decoded up front), so it never
// opens the video file — a <video> on it would block the rename (s269).
function RenameInspector({ row, info, frames, loading, hoverAt, savesAs, splitOn, onSplit, onHide, history, onAllHistory }) {
  const [frac, setFrac] = useState(0);
  const [hovering, setHovering] = useState(false);
  const imgRef = useRef(null);
  const rafRef = useRef(0);
  const pendingRef = useRef(0);
  const dur = info?.durationSeconds || 0;
  const facts = info?.facts || {};
  const aspect = facts.width && facts.height ? `${facts.width} / ${facts.height}` : "16 / 9";

  useEffect(() => { setFrac(0); }, [row.id]);

  // Decode every frame once, so a swap is instant. Released when the file changes.
  const framesKey = frames.map((f) => f.path).join("|");
  useEffect(() => {
    const imgs = frames.map((f) => { const im = new Image(); im.src = toFileUrl(f.path); im.decode?.().catch(() => {}); return im; });
    return () => { imgs.forEach((im) => { im.src = ""; }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framesKey]);

  const shown = hoverAt != null && dur > 0 ? Math.min(0.9999, hoverAt / dur) : frac;
  const idx = frames.length ? Math.min(frames.length - 1, Math.floor(shown * frames.length)) : -1;

  const scrub = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    pendingRef.current = Math.max(0, Math.min(0.9999, (e.clientX - r.left) / r.width));
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; setFrac(pendingRef.current); });
  };
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const date = localDate(row.fileName.slice(0, 10));
  const start = obsStartMin(row.fileName);
  const dayLabel = date ? date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
  const video = facts.width ? `${facts.width} × ${facts.height}${facts.fps ? ` · ${Math.round(facts.fps)} fps` : ""}${facts.videoCodec ? ` · ${facts.videoCodec.toUpperCase()}` : ""}` : "—";
  const label = { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T.textTertiary };
  const actBtn = (on) => ({ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, height: 32, padding: "0 6px", borderRadius: 9, fontSize: 12, fontWeight: 600, fontFamily: T.font, cursor: "pointer", border: `1px solid ${on ? T.accentBorder : T.border}`, background: on ? T.accentDim : "rgba(var(--lift),0.035)", color: on ? T.accentLight : T.labelStrong || T.textSecondary });

  return (
    <div style={{ padding: 14, display: "grid", gap: 14, alignContent: "start" }}>
      <div style={label}>{row.part ? `Pt${row.part} · ` : ""}{dayLabel}</div>
      <div
        onMouseMove={scrub}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: `1px solid ${T.border}`, aspectRatio: aspect, height: "min(330px, 36vh)", maxWidth: "100%", margin: "0 auto", background: "rgba(var(--lift),0.05)", cursor: "ew-resize" }}
      >
        {idx >= 0 ? (
          <img ref={imgRef} src={toFileUrl(frames[idx].path)} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: T.textTertiary, fontSize: 12 }}>{loading ? "Preparing preview…" : "No preview"}</span>
        )}
        {/* #328: literal dark chips — they sit over the footage */}
        <span style={{ position: "absolute", left: 10, bottom: 10, padding: "3px 8px", borderRadius: 6, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", color: "#fff", fontSize: 11.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtClock(shown * dur)} / {fmtClock(dur)}</span>
        {idx >= 0 && <span style={{ position: "absolute", right: 10, bottom: 10, padding: "3px 8px", borderRadius: 6, background: "rgba(0,0,0,0.55)", color: "rgba(255,255,255,0.7)", fontSize: 11, opacity: hovering ? 0 : 1, transition: "opacity 0.2s" }}>Move across to scrub</span>}
      </div>
      <div onMouseMove={scrub} style={{ position: "relative", height: 6, borderRadius: 6, background: "rgba(var(--lift),0.07)", cursor: "ew-resize" }}>
        <i style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${shown * 100}%`, borderRadius: 6, background: `linear-gradient(90deg, ${T.accent}, ${T.accentLight})` }} />
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "7px 16px", fontSize: 12.5, margin: 0, fontVariantNumeric: "tabular-nums" }}>
        {[
          ["Recorded", `${dayLabel}${start != null ? ` · ${fmtClockOfDay(start)}` : ""}`],
          ["Length", dur ? fmtClock(dur) : info?.probing ? "…" : "—"],
          ["Size", fmtBytes(facts.size)],
          ["Video", video],
          ["Audio", facts.audioTracks ? `${facts.audioTracks} track${facts.audioTracks === 1 ? "" : "s"}` : "—"],
        ].map(([k, v]) => (
          <React.Fragment key={k}>
            <dt style={{ color: T.textSecondary }}>{k}</dt>
            <dd style={{ margin: 0, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: T.text }}>{v}</dd>
          </React.Fragment>
        ))}
      </dl>
      <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(var(--lift),0.03)", border: `1px solid ${T.border}`, fontSize: 12.5, lineHeight: 1.45, overflowWrap: "anywhere", color: T.text }}>
        <span style={{ color: T.textTertiary }}>Saves as</span><br />{savesAs.dir}\<b>{savesAs.name}</b>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
        <button onClick={onSplit} disabled={!dur} style={actBtn(splitOn)}>{IcScissorsL}Split</button>
        <button onClick={() => window.clipflow?.revealInFolder(row.filePath)} style={actBtn(false)}>{IcFolderL}Explorer</button>
        <button onClick={onHide} style={actBtn(false)}>{IcEyeOff}Hide</button>
      </div>
      {history.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
            <span style={{ ...label, marginRight: "auto" }}>Recently renamed</span>
            <span onClick={onAllHistory} style={{ color: T.accentLight, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>All history</span>
          </div>
          <div style={{ display: "grid", gap: 2 }}>
            {history.map((h) => (
              <div key={h.key} className="cfr-hrow" style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 9, padding: "7px 8px", borderRadius: 8, fontSize: 12.5 }}>
                <GamePill tag={h.tag} color={h.color} size="sm" />
                <span title={h.name} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: T.text }}>{h.name}</span>
                <span style={{ fontSize: 11.5 }}>
                  <span className="cfr-hw" style={{ color: T.textSecondary }}>{h.when}</span>
                  {h.undo && <span className="cfr-hu" onClick={h.undo} style={{ color: T.yellow, fontWeight: 700, cursor: "pointer" }}>{h.busy ? "Undoing…" : "Undo"}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Session-header naming preset chip: shows the preset shared by the session's
// rows ("Mixed formats" when they diverge); picking one applies it to all rows.
function SessionPresetPicker({ presetId, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const [rect, setRect] = useState(null);

  // Portal the menu to <body> so it escapes the session card's overflow:hidden
  // clip. Same pattern as GroupedSelect: rect positions it (right-aligned to the
  // chip), outside-click checks both trigger and menu, page scroll closes it but
  // scrolling inside the menu does not.
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

  const current = PRESET_LIST.find((p) => p.id === presetId);

  const menu = open && rect ? createPortal(
    <div ref={menuRef} style={{
      position: "fixed", top: rect.bottom + 6, right: window.innerWidth - rect.right, zIndex: 1000, width: "max-content",
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md,
      boxShadow: "0 8px 32px rgba(var(--shade),calc(0.5 * var(--shadeK)))", padding: 4, maxHeight: 300, overflowY: "auto",
    }}>
      {PRESET_LIST.map((p) => {
        const isActive = presetId === p.id;
        return (
          <div
            key={p.id}
            onClick={() => { onChange(p.id); setOpen(false); }}
            style={{
              padding: "8px 12px", borderRadius: 6, cursor: "pointer",
              background: isActive ? "rgba(var(--lift),0.06)" : "transparent",
              marginBottom: 2,
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(var(--lift),0.04)"; }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{ color: isActive ? T.accentLight : T.text, fontSize: 13, fontWeight: 600 }}>{p.label}</div>
            <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2, fontFamily: T.mono }}>{p.example}</div>
          </div>
        );
      })}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <span
        onClick={() => setOpen(!open)}
        title="Naming format for every file in this session"
        style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 30, padding: "0 10px", border: `1px solid ${T.border}`, borderRadius: 9, background: "rgba(var(--lift),0.03)", fontSize: 13, fontWeight: 500, color: T.labelStrong || T.textSecondary, cursor: "pointer", whiteSpace: "nowrap" }}
      >{current ? current.label.replace(/ \+ /g, " · ") : "Mixed formats"}<span style={{ color: T.textTertiary, display: "inline-flex" }}>{IcChevron}</span></span>
      {menu}
    </div>
  );
}

function PresetNamePicker({ rename, presets, currentPreset, getProposed, onPresetChange, color }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const [rect, setRect] = useState(null);
  const c = color || T.yellow;

  // Portal to <body> so the menu escapes the session card's overflow:hidden clip
  // (left-aligned to the name). Page scroll closes it; scrolling inside does not.
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

  const currentName = getProposed(rename);

  const menu = open && rect ? createPortal(
    <div ref={menuRef} style={{
      position: "fixed", top: rect.bottom + 6, left: rect.left, zIndex: 1000, width: "max-content",
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md,
      boxShadow: "0 8px 32px rgba(var(--shade),calc(0.5 * var(--shadeK)))", padding: 4, maxHeight: 300, overflowY: "auto",
    }}>
      {presets.map((p) => {
        const previewR = { ...rename, preset: p.id };
        const previewName = getProposed(previewR);
        const isActive = currentPreset === p.id;
        return (
          <div
            key={p.id}
            onClick={() => { onPresetChange(p.id); setOpen(false); }}
            style={{
              padding: "8px 12px", borderRadius: 6, cursor: "pointer",
              background: isActive ? "rgba(var(--lift),0.06)" : "transparent",
              marginBottom: 2,
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(var(--lift),0.04)"; }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{ color: isActive ? c : T.text, fontSize: 13, fontWeight: 600, fontFamily: T.mono }}>{previewName}</div>
            <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2 }}>{p.label}</div>
          </div>
        );
      })}
    </div>,
    document.body
  ) : null;

  // #485: the name reads as plain text with the game tag in its colour.
  const base = currentName.replace(/\.mp4$/i, "");
  return (
    <div ref={ref} style={{ position: "relative", display: "flex", minWidth: 0, maxWidth: "100%" }}>
      <span
        onClick={() => setOpen(!open)}
        style={{ color: T.text, fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer", minWidth: 0 }}
        title="Click to change naming format"
      >
        {base.split(" ").map((w, i) => <React.Fragment key={i}>{i > 0 ? " " : ""}{w === rename.tag ? <span style={{ color: c }}>{w}</span> : w}</React.Fragment>)}
        <span style={{ color: T.textTertiary, fontWeight: 500 }}>.mp4</span>
      </span>
      {menu}
    </div>
  );
}

export default function RenameView({ gamesDb, mainGameName, pendingRenames, setPendingRenames, renameHistory, setRenameHistory, onAddGame, onGameDayUpdate, onReactionFor, watchFolder, testWatchFolder, onFilesRenamed, onNavigate }) {
  const [subTab, setSubTab] = useState("pending");
  const [renaming, setRenaming] = useState(false);
  const [renameDone, setRenameDone] = useState(false);
  const [undoBusy, setUndoBusy] = useState(null); // history entry id mid-undo (#175)
  const [refreshing, setRefreshing] = useState(false);
  const [manageFolder, setManageFolder] = useState("2026-03");
  const [manageSelected, setManageSelected] = useState(new Set());
  const [batchAction, setBatchAction] = useState(null);
  const [batchValue, setBatchValue] = useState("");
  const [retroNotification, setRetroNotification] = useState(null);
  // #473: relink tip for recordings already in an editor project. Hidden until
  // the store says it wasn't dismissed, so it never flashes on load.
  const [relinkTipDismissed, setRelinkTipDismissed] = useState(true);
  const [relinkTipOpen, setRelinkTipOpen] = useState(false);

  // #153: the strip used to render green WATCHING unconditionally. Three real
  // states now: "watching" | "unset" (no folder picked) | "missing" (gone/unreadable).
  const [watchStatus, setWatchStatus] = useState({ state: "watching" });

  // Global default preset from Settings (loaded from electron-store)
  const [defaultPreset, setDefaultPreset] = useState("tag-date-day-part");

  // Label autocomplete state
  const [labelSuggestions, setLabelSuggestions] = useState([]);
  const [activeLabelFileId, setActiveLabelFileId] = useState(null);

  // History from SQLite
  const [dbHistory, setDbHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Manage from SQLite
  const [dbManagedFiles, setDbManagedFiles] = useState([]);

  // Auto-split state: { [fileId]: { durationSeconds, splitCount, probing, skipSplit } }
  const [splitInfo, setSplitInfo] = useState({});
  const [splitThreshold, setSplitThreshold] = useState(30);
  const [autoSplitEnabled, setAutoSplitEnabled] = useState(true);
  const [splitProgress, setSplitProgress] = useState(null); // { fileId, current, total }
  const [convertProgress, setConvertProgress] = useState(null); // { fileName } — #300 MKV → MP4

  // Game-switch split markers: { [fileId]: [{timeSeconds, gameBefore, gameAfter}] }.
  // #485: one split strip is open at a time (splitOpenId); closing it keeps the
  // markers, which apply when the file is renamed.
  const [scrubberMarkers, setScrubberMarkers] = useState({});
  const [splitOpenId, setSplitOpenId] = useState(null);
  const [splitHoverAt, setSplitHoverAt] = useState(null); // seconds under the pointer on the split strip
  // #485: the file the right-hand panel shows
  const [focusId, setFocusId] = useState(null);

  // Drag-and-drop state
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(null); // { filename, pct }

  // Preview frames state: { [fileId]: { frames: [{path, timestampSeconds}], loading: bool } }
  const [previewFrames, setPreviewFrames] = useState({});
  const previewRequested = useRef(new Set());

  // #172: session-ledger selection state
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [bulkReacting, setBulkReacting] = useState(false);
  const lastClickedRef = useRef(null); // anchor for shift-click range select
  const gameMenuRef = useRef(null);
  const rootRef = useRef(null);

  // Remember last renamed game for auto-selecting on new files
  const lastRenamedGame = useRef(null);
  // #474: every split part in this rename batch labelled with another entry
  // than its row, so each part's Day counts the batch's other dates for that
  // entry, whatever order the rows are renamed in.
  const batchSegRows = useRef([]);

  const isElectron = typeof window !== "undefined" && window.clipflow;

  // Load split settings from store
  useEffect(() => {
    if (!isElectron) return;
    Promise.all([
      window.clipflow.storeGet("splitThresholdMinutes"),
      window.clipflow.storeGet("autoSplitEnabled"),
    ]).then(([threshold, enabled]) => {
      if (threshold != null) setSplitThreshold(threshold);
      if (enabled != null) setAutoSplitEnabled(enabled);
    });
  }, []);

  // Load default preset from electron-store on mount
  useEffect(() => {
    if (!isElectron) return;
    window.clipflow.storeGet("namingPreset").then((v) => {
      if (v) setDefaultPreset(v);
    });
  }, [isElectron]);

  useEffect(() => {
    if (!isElectron) return;
    window.clipflow.storeGet("relinkTipDismissed").then((v) => setRelinkTipDismissed(!!v));
  }, [isElectron]);

  const dismissRelinkTip = () => {
    setRelinkTipDismissed(true);
    window.clipflow?.storeSet?.("relinkTipDismissed", true);
  };

  // File watcher integration
  useEffect(() => {
    if (!isElectron) return;
    // #167: no folder yet (pre-load) — don't scan. #153: and say so on the strip.
    if (!watchFolder) { setWatchStatus({ state: "unset" }); return; }
    let stale = false;
    window.clipflow.startWatching(watchFolder).then((res) => {
      if (stale) return;
      setWatchStatus(res?.error ? { state: "missing", message: res.error } : { state: "watching" });
    });
    // A folder can also disappear mid-session — chokidar reports that here.
    const offError = window.clipflow.onWatcherError?.(({ folderPath, message }) => {
      if (folderPath === watchFolder) setWatchStatus({ state: "missing", message });
    });
    window.clipflow.onFileAdded((file) => {
      setPendingRenames((prev) => {
        if (prev.find((p) => p.filePath === file.path)) return prev;
        // If user recently renamed a file, default new files to that game —
        // but derive day/part through the same detectForGame accounting as
        // everything else. #267: a hand-rolled dayCount+1 here ignored the
        // same-date rule (Day+1 proposed for recordings landing after a
        // same-day rename) and kept a part computed for the main game.
        // #263: an auto-detected game (foreground majority / AI frames) is
        // direct evidence and outranks the last-renamed heuristic.
        const detectedEntry = file.detectedGame ? gamesDb.find((g) => g.name === file.detectedGame) : null;
        const lastGame = lastRenamedGame.current ? gamesDb.find((g) => g.name === lastRenamedGame.current) : null;
        const base = detectedEntry || lastGame;
        const detected = base ? detectForGame(base, file.name, prev) : detectGame(file.name, gamesDb, prev);
        return [...prev, {
          id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fileName: file.name, filePath: file.path,
          game: detected.game, tag: detected.tag, color: detected.color,
          day: detected.day, part: detected.part,
          preset: defaultPreset,
          customLabel: "",
          createdAt: file.createdAt,
          isTest: false,
        }];
      });
    });
    return () => { stale = true; offError?.(); window.clipflow.removeFileListeners(); };
  }, [watchFolder, isElectron, gamesDb, defaultPreset]);

  // Test file watcher integration (separate chokidar instance, separate IPC events)
  useEffect(() => {
    if (!isElectron || !testWatchFolder) return;
    window.clipflow.startTestWatching(testWatchFolder);
    window.clipflow.onTestFileAdded((file) => {
      setPendingRenames((prev) => {
        if (prev.find((p) => p.filePath === file.path)) return prev;
        // #267/#263: same accounting-based defaulting as the main watcher above.
        const detectedEntry = file.detectedGame ? gamesDb.find((g) => g.name === file.detectedGame) : null;
        const lastGame = lastRenamedGame.current ? gamesDb.find((g) => g.name === lastRenamedGame.current) : null;
        const base = detectedEntry || lastGame;
        const detected = base ? detectForGame(base, file.name, prev) : detectGame(file.name, gamesDb, prev);
        return [...prev, {
          id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fileName: file.name, filePath: file.path,
          game: detected.game, tag: detected.tag, color: detected.color,
          day: detected.day, part: detected.part,
          preset: defaultPreset,
          customLabel: "",
          createdAt: file.createdAt,
          isTest: true,
        }];
      });
    });
    return () => {
      window.clipflow.removeTestFileListeners();
      // Clear test files from pending when test folder changes
      setPendingRenames((prev) => prev.filter((p) => !p.isTest));
    };
  }, [testWatchFolder, isElectron, gamesDb, defaultPreset]);

  // #263: late AI frame-sniff results (imports, boot rescans). Retags the row
  // only while its game is still an untouched default — never over a manual pick.
  useEffect(() => {
    if (!isElectron || !window.clipflow.onGameDetectResult) return;
    const unsub = window.clipflow.onGameDetectResult((data) => {
      setPendingRenames((prev) => {
        const idx = prev.findIndex((r) => r.filePath === data.path);
        if (idx === -1) return prev;
        const row = prev[idx];
        if (row.gameManual) return prev;
        const g = gamesDb.find((x) => x.name === data.game);
        if (!g || row.game === g.name) return prev;
        // #449: day/part come from the renumber pass; hand-typed ones belonged
        // to the old game, so they're released.
        const next = [...prev];
        next[idx] = { ...row, game: g.name, tag: g.tag, color: g.color, dayManual: false, partManual: false };
        return next;
      });
    });
    return unsub;
  }, [isElectron, gamesDb]);

  // Probe new pending files: duration drives auto-split (when it's on), and
  // the rest fills the file details panel (#485).
  useEffect(() => {
    if (!isElectron) return;
    const unprobed = pendingRenames.filter((r) => r.filePath && !splitInfo[r.id]);
    if (unprobed.length === 0) return;

    for (const r of unprobed) {
      // Mark as probing immediately to avoid re-triggering
      setSplitInfo((prev) => ({ ...prev, [r.id]: { probing: true } }));
      window.clipflow.ffmpegProbe(r.filePath).then((probe) => {
        const dur = probe?.duration || probe?.format?.duration || 0;
        const thresholdSec = splitThreshold * 60;
        const MIN_TAIL = 120; // Don't split if last segment would be < 2 minutes
        const tailLength = dur % thresholdSec;
        const splitCount = autoSplitEnabled && dur > thresholdSec && (tailLength === 0 || tailLength >= MIN_TAIL) ? Math.ceil(dur / thresholdSec) : 0;
        const facts = { width: probe?.width || 0, height: probe?.height || 0, fps: probe?.fps || 0, videoCodec: probe?.videoCodec || null, audioTracks: probe?.audioTracks || 0, size: probe?.size || 0 };
        setSplitInfo((prev) => ({
          ...prev,
          [r.id]: { durationSeconds: dur, splitCount, probing: false, skipSplit: false, facts },
        }));
      }).catch(() => {
        setSplitInfo((prev) => ({ ...prev, [r.id]: { durationSeconds: 0, splitCount: 0, probing: false, skipSplit: false } }));
      });
    }
  }, [pendingRenames, isElectron, autoSplitEnabled, splitThreshold]);

  // Generate preview frames for pending files (lazy, one-by-one)
  useEffect(() => {
    if (!isElectron) return;
    for (const r of pendingRenames) {
      if (!r.filePath || previewRequested.current.has(r.id)) continue;
      previewRequested.current.add(r.id);
      setPreviewFrames((prev) => ({ ...prev, [r.id]: { frames: [], loading: true } }));
      window.clipflow.generatePreviewFrames(r.filePath).then((result) => {
        if (result && !result.error && result.frames) {
          setPreviewFrames((prev) => ({ ...prev, [r.id]: { frames: result.frames, loading: false } }));
        } else {
          setPreviewFrames((prev) => ({ ...prev, [r.id]: { frames: [], loading: false } }));
        }
      }).catch(() => {
        setPreviewFrames((prev) => ({ ...prev, [r.id]: { frames: [], loading: false } }));
      });
    }
  }, [pendingRenames, isElectron]);

  // #172: drop selection entries for rows that left the pending list
  useEffect(() => {
    setSelectedIds((prev) => {
      const ids = new Set(pendingRenames.map((r) => r.id));
      let changed = false;
      const next = new Set();
      for (const id of prev) {
        if (ids.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [pendingRenames]);

  // #172: Ctrl+A selects every pending file (only while this view is visible
  // and focus isn't in a text field — the view stays mounted on other tabs)
  useEffect(() => {
    if (subTab !== "pending") return;
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "a") return;
      if (!rootRef.current || rootRef.current.offsetParent === null) return; // hidden tab pane
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (pendingRenames.length === 0) return;
      e.preventDefault();
      setSelectedIds(new Set(pendingRenames.map((r) => r.id)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [subTab, pendingRenames]);

  // #172: close the Set Game menu on outside click
  useEffect(() => {
    if (!gameMenuOpen) return;
    const handler = (e) => { if (gameMenuRef.current && !gameMenuRef.current.contains(e.target)) setGameMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [gameMenuOpen]);

  // Recalculate split counts when threshold changes (auto-split off = no splits)
  useEffect(() => {
    setSplitInfo((prev) => {
      const updated = {};
      for (const [id, info] of Object.entries(prev)) {
        if (!info.durationSeconds) { updated[id] = info; continue; }
        const thresholdSec = splitThreshold * 60;
        const MIN_TAIL = 120;
        const tailLength = info.durationSeconds % thresholdSec;
        const splitCount = autoSplitEnabled && info.durationSeconds > thresholdSec && (tailLength === 0 || tailLength >= MIN_TAIL) ? Math.ceil(info.durationSeconds / thresholdSec) : 0;
        updated[id] = { ...info, splitCount };
      }
      return updated;
    });
  }, [splitThreshold, autoSplitEnabled]);

  // Load history from SQLite when History tab is opened
  useEffect(() => {
    if ((subTab !== "history" && subTab !== "pending") || !isElectron) return;
    loadDbHistory();
  }, [subTab, isElectron]);

  const loadDbHistory = async () => {
    if (!isElectron) return;
    setHistoryLoading(true);
    try {
      const rows = await window.clipflow.renameHistoryRecent(100);
      setDbHistory(rows || []);
    } catch (e) { console.error("Failed to load rename history:", e); }
    setHistoryLoading(false);
  };

  // Load managed files from SQLite on mount + when Manage tab is opened
  useEffect(() => {
    if (!isElectron) return;
    loadDbManagedFiles();
  }, [isElectron]);

  useEffect(() => {
    if (subTab !== "manage" || !isElectron) return;
    loadDbManagedFiles();
  }, [subTab]);

  const loadDbManagedFiles = async () => {
    if (!isElectron) return;
    try {
      const rows = await window.clipflow.fileMetadataSearch({ type: "byStatus", status: "renamed" });
      setDbManagedFiles(rows || []);
    } catch (e) { console.error("Failed to load managed files:", e); }
  };

  // #449: ONE pass owns pending day/part numbers. Every path that adds or
  // retags a row (watchers, boot rescan, import, AI retag, Set Game) just lands
  // it; this re-derives the whole list in recording order against fresh
  // library/history/day-counter state. A boot rescan announces every waiting
  // file at once in no guaranteed order — numbering by arrival swapped Pt1/Pt2.
  useEffect(() => {
    setPendingRenames((prev) => {
      const next = renumberRows(prev);
      return next.some((r, i) => r !== prev[i]) ? next : prev;
    });
  }, [pendingRenames, gamesDb, dbManagedFiles, renameHistory]);

  // ============ DAY DETECTION ============
  const detectGame = (fileName, games, currentPending) => {
    // #406: games[0] used to win here, and on a fresh install that is the
    // migration-injected "Just Chatting" CONTENT type — so every recording was
    // silently tagged JC. Only a real game may stand in for an unset main game;
    // with none added we genuinely don't know, and Unknown says so.
    const game = games.find((g) => g.name === mainGameName)
      || games.find((g) => g.entryType !== "content")
      || { name: "Unknown", tag: "??", color: "#888", dayCount: 0 };
    return detectForGame(game, fileName, currentPending);
  };

  const detectForGame = (game, fileName, currentPending) => {
    const fileDate = fileName.slice(0, 10);
    const baseDayCount = game.dayCount || 0;
    const baseLastDate = game.lastDayDate || null;

    const dateToDay = {};
    if (baseLastDate) dateToDay[baseLastDate] = baseDayCount;

    const allDates = new Set();
    if (baseLastDate) allDates.add(baseLastDate);
    (currentPending || []).forEach((p) => {
      if (p.tag === game.tag) allDates.add(p.fileName.slice(0, 10));
    });
    allDates.add(fileDate);

    let runningDay = baseDayCount;
    let runningLastDate = baseLastDate;
    for (const d of [...allDates].sort()) {
      if (dateToDay[d] !== undefined) continue;
      if (!runningLastDate || d > runningLastDate) {
        runningDay++;
        dateToDay[d] = runningDay;
        runningLastDate = d;
      } else {
        dateToDay[d] = baseDayCount;
      }
    }

    const day = dateToDay[fileDate] !== undefined ? dateToDay[fileDate] : baseDayCount + 1;

    const existingParts = [
      ...dbManagedFiles.filter((f) => f.tag === game.tag && f.date === fileDate && f.day_number === day).map((f) => f.part_number).filter(Boolean),
      ...renameHistory.filter((h) => !h.undone && h.tag === game.tag && h.newName?.startsWith(fileDate)).map((h) => h.part),
      ...(currentPending || []).filter((p) => p.tag === game.tag && p.fileName.slice(0, 10) === fileDate).map((p) => p.part),
    ];
    const part = existingParts.length > 0 ? Math.max(...existingParts) + 1 : 1;

    return { game: game.name, tag: game.tag, color: game.color, day, part };
  };

  // #449: re-derive day/part for every row in filename order (OBS names sort
  // by recording time), so earlier recordings always take the lower numbers.
  // Hand-typed values (dayManual/partManual) are kept, and a hand-typed part
  // holds its slot — derived parts step around it. Unchanged rows keep their
  // identity so the caller can tell nothing moved.
  const renumberRows = (rows) => {
    const sorted = [...rows].sort((a, b) => a.fileName.localeCompare(b.fileName));
    const done = [];
    const byId = {};
    for (const r of sorted) {
      const game = gamesDb.find((g) => g.tag === r.tag);
      if (!game) { done.push(r); continue; }
      const det = detectForGame(game, r.fileName, done);
      let part = r.part;
      if (!r.partManual) {
        const date = r.fileName.slice(0, 10);
        const held = new Set(rows.filter((p) => p.partManual && p.tag === r.tag && p.fileName.slice(0, 10) === date).map((p) => p.part));
        part = det.part;
        while (held.has(part)) part++;
      }
      const day = r.dayManual ? r.day : det.day;
      const nr = day === r.day && part === r.part ? r : { ...r, day, part };
      byId[r.id] = nr;
      done.push(nr);
    }
    return rows.map((r) => byId[r.id] || r);
  };

  // ============ SPLIT HELPERS ============
  const getSplitPreview = (r) => {
    const info = splitInfo[r.id];
    if (!info || !info.splitCount || info.skipSplit) return null;
    const thresholdSec = splitThreshold * 60;
    const preset = r.preset || defaultPreset;
    // #264: children inherit the row's part slot plus a letter (Pt2a, Pt2b).
    // Conditional-part presets get their number at rename time — letters only.
    const showPt = PRESETS_ALWAYS_PARTS.has(preset);
    const parts = [];
    for (let i = 0; i < info.splitCount; i++) {
      const start = i * thresholdSec;
      const end = Math.min((i + 1) * thresholdSec, info.durationSeconds);
      parts.push({ start, end, label: showPt ? `Pt${r.part}${subPartLetter(i)}` : `part ${subPartLetter(i)}` });
    }
    return parts;
  };

  const toggleSkipSplit = (fileId) => {
    setSplitInfo((prev) => ({
      ...prev,
      [fileId]: { ...prev[fileId], skipSplit: !prev[fileId]?.skipSplit },
    }));
  };

  // ============ LIVE FILENAME PREVIEW (preset-aware) ============
  const getProposed = (r) => {
    const preset = r.preset || defaultPreset;
    // Date leads for date-using presets — must mirror formatFilename() in
    // naming-presets.js ("2026-03-04 RL Day7 Pt1"), which does the real rename.
    const parts = [];

    // Date (from OBS filename)
    const usesDate = ["tag-date-day-part", "tag-date", "tag-date-label"].includes(preset);
    if (usesDate) parts.push(r.fileName.slice(0, 10));

    parts.push(r.tag);

    // Original filename
    if (preset === "original-tag") {
      parts.push(r.fileName.replace(/\.[^.]+$/, ""));
    }

    // Day number
    if (PRESETS_USING_DAY.has(preset)) {
      parts.push(`Day${r.day}`);
    }

    // Custom label
    if (PRESETS_USING_LABEL.has(preset) && r.customLabel) {
      parts.push(r.customLabel);
    }

    // Part number
    if (PRESETS_ALWAYS_PARTS.has(preset)) {
      parts.push(`Pt${r.part}`);
    }
    // For conditional-part presets, parts are added via collision detection at rename time
    // Preview doesn't show parts unless they already exist (collision will add them)

    return parts.join(" ") + ".mp4";
  };

  // Per-row field update (game changes go through setGameForRows; day/part
  // numbers are re-derived by the #449 renumber pass)
  const updatePending = (id, field, value) => {
    setPendingRenames((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  // #172: assign a game to a set of rows (session header picker or the batch
  // bar's Set Game). The renumber pass then re-derives day/part in recording
  // order — rows leaving a game free up parts, rows joining take the next ones.
  // #474: `entry` is passed when the React switch just created it (not in gamesDb yet).
  const setGameForRows = (ids, gameName, entry) => {
    const g = entry || gamesDb.find((x) => x.name === gameName);
    if (!g) return;
    const idSet = new Set(ids);
    // #263: a hand-picked game must never be overwritten by a late AI result.
    // #449: hand-typed day/part belonged to the old game — released on a switch.
    setPendingRenames((prev) => prev.map((r) => {
      if (!idSet.has(r.id)) return r;
      const released = r.tag === g.tag ? {} : { dayManual: false, partManual: false };
      return { ...r, game: g.name, tag: g.tag, color: g.color, gameManual: true, ...released };
    }));
  };

  // #449: a hand-typed Day/Pt pins that value through every renumber pass.
  const setDayForRows = (ids, day) => {
    const idSet = new Set(ids);
    setPendingRenames((prev) => prev.map((r) => (idSet.has(r.id) ? { ...r, day, dayManual: true } : r)));
  };

  const setPartForRow = (id, part) => {
    setPendingRenames((prev) => prev.map((r) => (r.id === id ? { ...r, part, partManual: true } : r)));
  };

  const setPresetForRows = (ids, presetId) => {
    const idSet = new Set(ids);
    setPendingRenames((prev) => prev.map((r) => (idSet.has(r.id) ? { ...r, preset: presetId } : r)));
  };

  // ============ LABEL AUTOCOMPLETE ============
  const fetchLabelSuggestions = useCallback(async (tag, prefix) => {
    if (!isElectron) return;
    try {
      const suggestions = await window.clipflow.labelSuggest(tag, prefix || "");
      setLabelSuggestions(suggestions || []);
    } catch (e) { setLabelSuggestions([]); }
  }, [isElectron]);

  const updateLabel = (id, value) => {
    setPendingRenames((prev) => prev.map((r) => r.id === id ? { ...r, customLabel: value } : r));
    const r = pendingRenames.find((x) => x.id === id);
    if (r) {
      setActiveLabelFileId(id);
      fetchLabelSuggestions(r.tag, value);
    }
  };

  const selectLabelSuggestion = (id, label) => {
    setPendingRenames((prev) => prev.map((r) => r.id === id ? { ...r, customLabel: label } : r));
    setLabelSuggestions([]);
    setActiveLabelFileId(null);
  };

  // ============ RENAME HANDLERS (DB-backed) ============

  // Where a renamed file lands. Renamed files go into a monthly subfolder —
  // unless the recording already sits in one (OBS can bucket recordings into
  // <Game>\<YYYY-MM>\ itself; appending another month folder would nest, #171).
  const resolveTargetDir = (r) => {
    const dir = r.filePath.substring(0, r.filePath.lastIndexOf("\\"));
    const monthFolder = r.fileName.slice(0, 7);
    const testRoot = r.isTest ? (testWatchFolder || `${watchFolder}\\Test`) : null;
    if (testRoot) return `${testRoot}\\${monthFolder}`;
    return /[\\/]\d{4}-\d{2}$/.test(dir) ? dir : `${dir}\\${monthFolder}`;
  };

  // #300: OBS's other recommended container is MKV, and the renamer used to
  // write MKV bytes out under a .mp4 name. Renaming converts it into a real MP4
  // (video stream-copied) so the extension always describes the bytes, and the
  // editor gets a container it is guaranteed to preview.
  const sourceExt = (fileName) => {
    const m = (fileName || "").match(/\.[^.\\/]+$/);
    return m ? m[0].toLowerCase() : ".mp4";
  };
  const needsConvert = (fileName) => sourceExt(fileName) !== ".mp4";

  // Move a recording to its renamed path, converting the container first when
  // it isn't already MP4. Returns the same { success } / { error } shape as
  // renameFile — a failed conversion refuses the rename rather than leaving a
  // file whose extension lies about its contents.
  const moveToRenamedPath = async (r, newPath) => {
    if (!needsConvert(r.fileName)) return window.clipflow.renameFile(r.filePath, newPath);
    setConvertProgress({ fileName: r.fileName });
    try {
      const result = await window.clipflow.convertAndRenameFile(r.filePath, newPath);
      if (result.error) {
        return { error: `couldn't convert ${sourceExt(r.fileName).slice(1).toUpperCase()} to MP4 — ${result.error}` };
      }
      return result;
    } finally {
      setConvertProgress(null);
    }
  };

  // Helper: rename a single file (no split) — extracted for reuse
  const renameSingleFile = async (r, preset, fileDate) => {
    const meta = {
      tag: r.tag,
      date: fileDate,
      dayNumber: r.day,
      partNumber: PRESETS_ALWAYS_PARTS.has(preset) ? r.part : null,
      customLabel: r.customLabel || null,
      originalFilename: r.fileName,
    };

    let newName;

    if (isElectron) {
      // Check collisions for conditional-part presets
      if (!PRESETS_ALWAYS_PARTS.has(preset)) {
        const collisions = await window.clipflow.presetFindCollisions(meta, preset);
        if (collisions && collisions.length > 0) {
          for (const existing of collisions) {
            await window.clipflow.presetRetroactiveRename(existing, null);
          }
          const nextPart = await window.clipflow.presetGetNextPartNumber(meta, preset);
          meta.partNumber = nextPart.partNumber;
          const collisionMsg = getRetroNotificationMessage(preset, r.tag, r.customLabel);
          setRetroNotification(collisionMsg);
          setTimeout(() => setRetroNotification(null), 6000);
        }
      }

      const result = await window.clipflow.presetFormatFilename(meta, preset);
      if (result.error) { console.error("Format failed:", result.error); return null; }
      newName = result.filename;
    } else {
      newName = getProposed(r);
    }

    let historyId = null;
    if (isElectron && r.filePath) {
      const targetDir = resolveTargetDir(r);
      const newPath = `${targetDir}\\${newName}`;
      const result = await moveToRenamedPath(r, newPath);
      if (result.error) {
        // #173: collisions now refuse instead of overwriting — say so.
        console.error("Rename failed:", result.error);
        setRetroNotification(`Couldn't rename "${r.fileName}": ${result.error}`);
        setTimeout(() => setRetroNotification(null), 8000);
        return null;
      }

      const game = gamesDb.find((g) => g.tag === r.tag);
      const metaResult = await window.clipflow.fileMetadataCreate({
        originalFilename: r.fileName,
        currentFilename: newName,
        originalPath: r.filePath,
        currentPath: newPath,
        tag: r.tag,
        entryType: game?.entryType || "game",
        date: fileDate,
        dayNumber: PRESETS_USING_DAY.has(preset) ? r.day : null,
        partNumber: meta.partNumber,
        customLabel: r.customLabel || null,
        namingPreset: preset,
        status: "renamed",
        isTest: r.isTest || false,
      });
      // The disk rename already happened — a failed library write must be
      // loud, or the file silently never appears in Recordings.
      if (metaResult?.error) {
        console.error("fileMetadataCreate failed:", metaResult.error);
        setRetroNotification(`"${newName}" was renamed, but saving it to the library failed (${metaResult.error}). It will be re-detected the next time Recordings loads.`);
        setTimeout(() => setRetroNotification(null), 10000);
      }
      // #175: the DB history row is what makes this rename undoable.
      historyId = metaResult?.historyId || null;

      if (PRESETS_USING_LABEL.has(preset) && r.customLabel) {
        await window.clipflow.labelRecord(r.tag, r.customLabel);
      }
    }

    return { newName, partNumber: meta.partNumber, historyId };
  };

  // Helper: split a file into letter-suffixed children (#264).
  // Rename-first: the whole file takes its real name (its own part slot, same
  // collision rules as a plain rename), THEN splits — children inherit the
  // parent's full identity plus a letter (Pt2a, Pt2b, ...). The parent never
  // sits on disk under a raw OBS name, so the watcher has nothing to re-add
  // (#174), and children can't renumber over same-day files (#173).
  const splitAndRename = async (r, preset, fileDate) => {
    const info = splitInfo[r.id];
    if (!info || !info.splitCount) return null;

    const thresholdSec = splitThreshold * 60;
    const game = gamesDb.find((g) => g.tag === r.tag);
    const targetDir = resolveTargetDir(r);

    // Parent naming meta — the pending row's own slot for always-part presets;
    // conditional presets take the next number via the same collision
    // machinery renameSingleFile uses (a split parent always needs a part
    // number for the letters to hang off).
    const meta = {
      tag: r.tag,
      date: fileDate,
      dayNumber: PRESETS_USING_DAY.has(preset) ? r.day : null,
      partNumber: PRESETS_ALWAYS_PARTS.has(preset) ? r.part : null,
      customLabel: r.customLabel || null,
      originalFilename: r.fileName,
    };

    if (!PRESETS_ALWAYS_PARTS.has(preset)) {
      const collisions = await window.clipflow.presetFindCollisions(meta, preset);
      if (collisions && collisions.length > 0) {
        for (const existing of collisions) {
          await window.clipflow.presetRetroactiveRename(existing, null);
        }
        const collisionMsg = getRetroNotificationMessage(preset, r.tag, r.customLabel);
        setRetroNotification(collisionMsg);
        setTimeout(() => setRetroNotification(null), 6000);
      }
      const nextPart = await window.clipflow.presetGetNextPartNumber(meta, preset);
      meta.partNumber = nextPart.partNumber;
    }

    const fmtParent = await window.clipflow.presetFormatFilename(meta, preset);
    if (fmtParent.error) { console.error("Format failed:", fmtParent.error); return null; }
    const parentName = fmtParent.filename;
    const parentPath = `${targetDir}\\${parentName}`;

    const moveResult = await moveToRenamedPath(r, parentPath);
    if (moveResult.error) {
      console.error("Split parent rename failed:", moveResult.error);
      setRetroNotification(`Couldn't rename "${r.fileName}": ${moveResult.error}`);
      setTimeout(() => setRetroNotification(null), 8000);
      return null;
    }

    // noHistory: undoing this row would orphan the children's split lineage
    // and hand the watcher back a raw-named file — splits aren't undoable.
    const parentResult = await window.clipflow.fileMetadataCreate({
      originalFilename: r.fileName,
      currentFilename: parentName,
      originalPath: r.filePath,
      currentPath: parentPath,
      tag: r.tag,
      entryType: game?.entryType || "game",
      date: fileDate,
      dayNumber: PRESETS_USING_DAY.has(preset) ? r.day : null,
      partNumber: meta.partNumber,
      customLabel: r.customLabel || null,
      namingPreset: preset,
      durationSeconds: info.durationSeconds,
      status: "pending",
      isTest: r.isTest || false,
      noHistory: true,
    });

    if (!parentResult?.id) { console.error("Failed to create parent metadata"); return null; }

    // Build split points — every child carries the parent's part number + letter
    const splitPoints = [];
    for (let i = 0; i < info.splitCount; i++) {
      const start = i * thresholdSec;
      const end = Math.min((i + 1) * thresholdSec, info.durationSeconds);
      splitPoints.push({
        startSeconds: start,
        endSeconds: end,
        tag: r.tag,
        entryType: game?.entryType || "game",
        partNumber: meta.partNumber,
        subPart: subPartLetter(i),
      });
    }

    setSplitProgress({ fileId: r.id, current: 0, total: info.splitCount });

    const splitResult = await window.clipflow.splitExecute(parentResult.id, splitPoints);
    if (splitResult.error) {
      console.error("Split failed:", splitResult.error);
      // The rename already succeeded — surface the file as a normal whole
      // recording instead of stranding an invisible pending row.
      await window.clipflow.fileMetadataUpdate(parentResult.id, { status: "renamed" });
      setRetroNotification(`"${parentName}" was renamed, but splitting failed (${splitResult.error}). It stays whole.`);
      setTimeout(() => setRetroNotification(null), 10000);
      setSplitProgress(null);
      return [{ newName: parentName, partNumber: meta.partNumber, subPart: null }];
    }

    // Rename each temp child to the parent's name + letter
    const renamedChildren = [];
    for (let i = 0; i < splitResult.results.length; i++) {
      const child = splitResult.results[i];
      const letter = subPartLetter(i);
      setSplitProgress({ fileId: r.id, current: i + 1, total: info.splitCount });

      const childMeta = { ...meta, subPart: letter };
      const fmtResult = await window.clipflow.presetFormatFilename(childMeta, preset);
      if (fmtResult.error) continue;

      const childNewName = fmtResult.filename;
      const childNewPath = `${targetDir}\\${childNewName}`;

      const renResult = await window.clipflow.renameFile(child.filePath, childNewPath);
      if (renResult.error) {
        console.error(`Split child rename failed (${childNewName}):`, renResult.error);
        continue;
      }

      await window.clipflow.fileMetadataUpdate(child.childId, {
        current_filename: childNewName,
        current_path: childNewPath,
        part_number: meta.partNumber,
        sub_part: letter,
        day_number: PRESETS_USING_DAY.has(preset) ? r.day : null,
      });

      renamedChildren.push({ newName: childNewName, partNumber: meta.partNumber, subPart: letter });
    }

    // Record label usage
    if (PRESETS_USING_LABEL.has(preset) && r.customLabel) {
      await window.clipflow.labelRecord(r.tag, r.customLabel);
    }

    setSplitProgress(null);
    return renamedChildren;
  };

  // ============ GAME-SWITCH SPLIT ============
  // #485: the strip draws the recording's preview frames, so opening it makes
  // nothing new and closing it keeps the markers.
  const toggleSplit = (fileId) => {
    setSplitHoverAt(null);
    setSplitOpenId((cur) => (cur === fileId ? null : fileId));
    setFocusId(fileId);
  };

  const updateScrubberMarkers = (fileId, markers) => {
    setScrubberMarkers((prev) => ({ ...prev, [fileId]: markers }));
  };

  /**
   * Game-switch split + rename: split by markers, then auto-split long segments.
   * Each segment gets its own tag based on scrubber assignments.
   */
  const gameSwitchSplitAndRename = async (r, preset, fileDate) => {
    const markers = scrubberMarkers[r.id] || [];
    if (markers.length === 0) return null;

    const duration = splitInfo[r.id]?.durationSeconds;
    if (!duration) return null;

    const sorted = [...markers].sort((a, b) => a.timeSeconds - b.timeSeconds);

    // Build segments from markers
    const segments = [];
    let prevTime = 0;
    for (let i = 0; i < sorted.length; i++) {
      const gameTag = i === 0 ? (sorted[i].gameBefore || r.tag) : (sorted[i - 1].gameAfter || r.tag);
      segments.push({ startSeconds: prevTime, endSeconds: sorted[i].timeSeconds, gameTag });
      prevTime = sorted[i].timeSeconds;
    }
    // Last segment
    segments.push({
      startSeconds: prevTime,
      endSeconds: duration,
      gameTag: sorted[sorted.length - 1].gameAfter || r.tag,
    });

    // Create parent file_metadata record
    const dir = r.filePath.substring(0, r.filePath.lastIndexOf("\\"));
    const game = gamesDb.find((g) => g.tag === r.tag);

    const parentResult = await window.clipflow.fileMetadataCreate({
      originalFilename: r.fileName,
      currentFilename: r.fileName,
      originalPath: r.filePath,
      currentPath: r.filePath,
      tag: r.tag,
      entryType: game?.entryType || "game",
      date: fileDate,
      dayNumber: PRESETS_USING_DAY.has(preset) ? r.day : null,
      partNumber: null,
      customLabel: r.customLabel || null,
      namingPreset: preset,
      durationSeconds: duration,
      status: "pending",
    });

    if (!parentResult?.id) { console.error("Failed to create parent metadata"); return null; }

    // Build split points with per-segment tags
    const thresholdSec = splitThreshold * 60;
    const MIN_TAIL = 120;
    const allSplitPoints = [];

    for (const seg of segments) {
      const segDuration = seg.endSeconds - seg.startSeconds;
      const segGame = gamesDb.find((g) => g.tag === seg.gameTag);
      // #474: a part labelled with another entry (a reaction after gameplay)
      // takes that entry's own Day, not this row's.
      let segDay = r.day;
      if (segGame && segGame.tag !== r.tag) {
        const others = [...pendingRenames, ...batchSegRows.current].filter((p) => p.id !== r.id);
        segDay = detectForGame(segGame, r.fileName, others).day;
      }

      // Check if this segment itself needs auto-splitting
      const tailLength = segDuration % thresholdSec;
      const needsAutoSplit = autoSplitEnabled && segDuration > thresholdSec && (tailLength === 0 || tailLength >= MIN_TAIL);

      if (needsAutoSplit) {
        const subCount = Math.ceil(segDuration / thresholdSec);
        for (let j = 0; j < subCount; j++) {
          const subStart = seg.startSeconds + j * thresholdSec;
          const subEnd = Math.min(seg.startSeconds + (j + 1) * thresholdSec, seg.endSeconds);
          allSplitPoints.push({
            startSeconds: subStart,
            endSeconds: subEnd,
            tag: seg.gameTag,
            day: segDay,
            entryType: segGame?.entryType || "game",
            partNumber: subCount > 1 ? (j + 1) : null,
          });
        }
      } else {
        allSplitPoints.push({
          startSeconds: seg.startSeconds,
          endSeconds: seg.endSeconds,
          tag: seg.gameTag,
          day: segDay,
          entryType: segGame?.entryType || "game",
          partNumber: null,
        });
      }
    }

    setSplitProgress({ fileId: r.id, current: 0, total: allSplitPoints.length });

    const splitResult = await window.clipflow.splitExecute(parentResult.id, allSplitPoints);
    if (splitResult.error) {
      console.error("Game-switch split failed:", splitResult.error);
      setSplitProgress(null);
      return null;
    }

    // Rename each child file using the preset engine
    const renamedChildren = [];
    for (let i = 0; i < splitResult.results.length; i++) {
      const child = splitResult.results[i];
      const sp = allSplitPoints[i];
      setSplitProgress({ fileId: r.id, current: i + 1, total: allSplitPoints.length });

      const childMeta = {
        tag: sp.tag,
        date: fileDate,
        dayNumber: PRESETS_USING_DAY.has(preset) ? sp.day : null,
        partNumber: sp.partNumber,
        customLabel: r.customLabel || null,
        originalFilename: r.fileName,
      };

      const fmtResult = await window.clipflow.presetFormatFilename(childMeta, preset);
      if (fmtResult.error) continue;

      const childNewName = fmtResult.filename;
      const childNewPath = `${dir}\\${childNewName}`;

      const renResult = await window.clipflow.renameFile(child.filePath, childNewPath);
      if (renResult.error) continue;

      await window.clipflow.fileMetadataUpdate(child.childId, {
        current_filename: childNewName,
        current_path: childNewPath,
        tag: sp.tag,
        part_number: sp.partNumber,
        day_number: PRESETS_USING_DAY.has(preset) ? sp.day : null,
      });

      const segGame = gamesDb.find((g) => g.tag === sp.tag);
      renamedChildren.push({
        newName: childNewName,
        partNumber: sp.partNumber,
        tag: sp.tag,
        day: sp.day,
        color: segGame?.color || r.color,
        game: segGame?.name || r.game,
      });
    }

    // Record label usage
    if (PRESETS_USING_LABEL.has(preset) && r.customLabel) {
      await window.clipflow.labelRecord(r.tag, r.customLabel);
    }

    setScrubberMarkers((prev) => { const n = { ...prev }; delete n[r.id]; return n; });
    setSplitOpenId((cur) => (cur === r.id ? null : cur));

    setSplitProgress(null);
    return renamedChildren;
  };

  const hideOne = (id) => {
    setScrubberMarkers((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setSplitOpenId((cur) => (cur === id ? null : cur));
    setPendingRenames((prev) => prev.filter((x) => x.id !== id));
  };

  // ============ #172 SELECTION ============
  const toggleRow = (id, e) => {
    // Read the anchor BEFORE setState — the updater runs after this handler
    // finishes, by which point the ref already holds the clicked row.
    const anchor = lastClickedRef.current;
    const useRange = !!(e?.shiftKey && anchor && anchor !== id && displayIds.includes(anchor) && displayIds.includes(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (useRange) {
        // Shift-click: apply the clicked row's NEW state to the whole range
        const a = displayIds.indexOf(anchor);
        const b = displayIds.indexOf(id);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const turnOn = !prev.has(id);
        for (let i = lo; i <= hi; i++) {
          if (turnOn) next.add(displayIds[i]);
          else next.delete(displayIds[i]);
        }
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastClickedRef.current = id;
  };

  const toggleGroup = (grp) => {
    const ids = grp.rows.map((r) => r.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => prev.has(id));
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setGameMenuOpen(false);
    lastClickedRef.current = null;
  };

  const hideSelected = () => {
    [...selectedIds].forEach((id) => hideOne(id));
    clearSelection();
  };

  // #172: rename a specific list of pending rows — the whole list for
  // "Rename All", a subset for "Rename N Selected". Same per-file pipeline
  // as ever (game-switch markers, auto-split, collisions, history, #170
  // test-mode exclusion). Only successfully renamed rows leave the pending
  // list; failed or label-missing rows stay visible.
  const renameFiles = async (list) => {
    if (renaming || !list || list.length === 0) return;
    setRenaming(true);
    batchSegRows.current = list.flatMap((row) => {
      const tags = new Set((scrubberMarkers[row.id] || []).flatMap((m) => [m.gameBefore, m.gameAfter]));
      return [...tags].filter((t) => t && t !== row.tag).map((tag) => ({ id: row.id, tag, fileName: row.fileName, part: null }));
    });
    const sorted = [...list].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

    const corrected = [];
    const renamedIds = new Set();
    for (const r of sorted) {
      const preset = r.preset || defaultPreset;
      const fileDate = r.fileName.slice(0, 10);

      // Skip files with missing required labels
      if (PRESETS_USING_LABEL.has(preset) && (!r.customLabel || r.customLabel.trim().length === 0)) {
        continue;
      }

      // Check game-switch markers first, then auto-split
      const hasGameSwitch = isElectron && scrubberMarkers[r.id] && scrubberMarkers[r.id].length > 0;
      const info = splitInfo[r.id];
      const needsSplit = isElectron && info && info.splitCount > 0 && !info.skipSplit;

      if (hasGameSwitch) {
        const children = await gameSwitchSplitAndRename(r, preset, fileDate);
        if (children && children.length > 0) {
          renamedIds.add(r.id);
          const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          for (const c of children) {
            corrected.push({
              id: `h-${Date.now()}-${r.id}-${c.tag}-${c.partNumber}`, oldName: r.fileName, newName: c.newName,
              game: c.game || r.game, tag: c.tag || r.tag, color: c.color || r.color, day: c.day ?? r.day,
              part: c.partNumber, time, undone: false, isTest: !!r.isTest,
            });
          }
        }
      } else if (needsSplit) {
        const children = await splitAndRename(r, preset, fileDate);
        if (children && children.length > 0) {
          renamedIds.add(r.id);
          const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          for (const c of children) {
            corrected.push({
              id: `h-${Date.now()}-${r.id}-${c.partNumber}${c.subPart || ""}`, oldName: r.fileName, newName: c.newName,
              game: r.game, tag: r.tag, color: r.color, day: r.day,
              part: c.partNumber, subPart: c.subPart || null, time, undone: false, isTest: !!r.isTest,
            });
          }
        }
      } else {
        const result = await renameSingleFile(r, preset, fileDate);
        if (!result) continue;

        renamedIds.add(r.id);
        corrected.push({
          id: `h-${Date.now()}-${r.id}`, oldName: r.fileName, newName: result.newName,
          game: r.game, tag: r.tag, color: r.color, day: r.day,
          part: result.partNumber || r.part,
          time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
          undone: false, isTest: !!r.isTest, historyId: result.historyId || null,
        });
      }
    }

    // Persist dayCount/lastDayDate for all affected games
    // #170: test-mode renames excluded — they must not advance real counters.
    if (onGameDayUpdate) {
      const gameUpdates = {};
      for (const h of corrected) {
        if (h.isTest) continue;
        const fileDate = h.oldName.slice(0, 10);
        if (!gameUpdates[h.tag]) {
          const game = gamesDb.find((g) => g.tag === h.tag);
          gameUpdates[h.tag] = { dayCount: game?.dayCount || 0, lastDayDate: game?.lastDayDate || null };
        }
        if (h.day > gameUpdates[h.tag].dayCount) gameUpdates[h.tag].dayCount = h.day;
        if (!gameUpdates[h.tag].lastDayDate || fileDate >= gameUpdates[h.tag].lastDayDate) gameUpdates[h.tag].lastDayDate = fileDate;
      }
      for (const [tag, update] of Object.entries(gameUpdates)) {
        onGameDayUpdate(tag, update.dayCount, update.lastDayDate);
      }
    }

    setRenameHistory((prev) => [...corrected, ...prev]);

    // Clear ONLY the renamed rows' state — un-renamed rows (failures,
    // missing labels, unselected files) keep their split/scrubber state.
    const drop = (obj) => { const n = { ...obj }; renamedIds.forEach((id) => delete n[id]); return n; };
    setSplitInfo((prev) => drop(prev));
    setScrubberMarkers((prev) => drop(prev));
    setSplitOpenId((cur) => (cur && renamedIds.has(cur) ? null : cur));
    setPendingRenames((prev) => prev.filter((x) => !renamedIds.has(x.id)));

    // Remember the last renamed game for auto-selecting on future files
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (renamedIds.has(sorted[i].id)) {
        // #474: after a reaction, the next file defaults back to its game (switch off).
        const e = gamesDb.find((g) => g.name === sorted[i].game);
        lastRenamedGame.current = linkedGame(e, gamesDb)?.name || sorted[i].game;
        break;
      }
    }

    setRenaming(false);
    if (renamedIds.size > 0 && pendingRenames.every((x) => renamedIds.has(x.id))) {
      setRenameDone(true);
      setTimeout(() => setRenameDone(false), 3000);
    }
    // Renamed files enter the Recordings library — tell App so the Recordings
    // tab reloads (it otherwise only reads SQLite on mount → stale until Ctrl+R).
    if (renamedIds.size > 0) onFilesRenamed?.();
  };

  // ============ UNDO ============
  // #175: real one-way undo. The DB handler renames the file back to its
  // original path and deletes its library row; the watcher then re-detects
  // the restored raw file, so it returns to Pending as a REAL row (thumb,
  // probe, same part proposal). No ghost rows, no REDO. Entries without a
  // historyId (renamed before this shipped, or split children) can't be
  // undone and render without a button.
  const undoLocalEntry = async (h) => {
    if (!isElectron || !h.historyId || h.undone || undoBusy) return;
    setUndoBusy(h.id);
    const result = await window.clipflow.renameHistoryUndo(h.historyId);
    setUndoBusy(null);
    if (result?.success) {
      setRenameHistory((prev) => prev.map((x) => (x.id === h.id ? { ...x, undone: true } : x)));
      // Put the file straight back into Pending in its ORIGINAL slot (same
      // game/day/part) — deterministic, instead of waiting for the watcher,
      // whose re-detection would propose max+1 numbering. The watcher's own
      // add event a few seconds later dedupes on filePath. #449: pinned like a
      // hand-typed value, or the renumber pass would re-derive it to max+1.
      if (result.restoredPath) {
        setPendingRenames((prev) => {
          if (prev.find((p) => p.filePath === result.restoredPath)) return prev;
          return [...prev, {
            id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            fileName: h.oldName, filePath: result.restoredPath,
            game: h.game, tag: h.tag, color: h.color,
            day: h.day || 1, part: h.part || 1, dayManual: true, partManual: true,
            preset: defaultPreset, customLabel: "",
            createdAt: new Date().toISOString(),
            isTest: !!h.isTest,
          }];
        });
      }
    } else {
      console.error("Undo failed:", result?.error);
      setRetroNotification(`Undo failed: ${result?.error || "unknown error"}`);
      setTimeout(() => setRetroNotification(null), 8000);
    }
  };

  // SQLite history undo
  const undoDbHistory = async (historyId) => {
    if (!isElectron) return;
    const result = await window.clipflow.renameHistoryUndo(historyId);
    if (result.success) {
      loadDbHistory(); // Refresh
    } else {
      console.error("Undo failed:", result.error);
    }
  };

  const refresh = () => {
    if (isElectron) {
      setRefreshing(true);
      window.clipflow.stopWatching().then(async () => {
        // #153: Refresh restarts the watcher, so it has to re-judge the strip —
        // otherwise a folder that vanished still reads green after a refresh.
        if (!watchFolder) setWatchStatus({ state: "unset" });
        else {
          const res = await window.clipflow.startWatching(watchFolder);
          setWatchStatus(res?.error ? { state: "missing", message: res.error } : { state: "watching" });
        }
        setTimeout(() => setRefreshing(false), 1200);
      });
    }
  };

  // ============ RETROACTIVE NOTIFICATION MESSAGES ============
  const getRetroNotificationMessage = (preset, tag, label) => {
    if (preset === "tag-label") {
      return `You already have a file named ${tag} ${label || ""}. Your earlier file has been updated to Pt1.`;
    }
    return `This is your second ${tag} session today. Your earlier file has been updated to Pt1.`;
  };

  // ============ GROUPED DROPDOWN OPTIONS ============
  // #474: a game's linked reactions are listed under it; Content Types keeps the rest.
  const getGroupedGameOptions = () => groupedEntryOptions(gamesDb, "name");

  // ============ DRAG-AND-DROP IMPORT ============
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    if (!isElectron || !watchFolder) return;

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    // Single file only
    if (files.length > 1) {
      setRetroNotification("Drop one file at a time");
      setTimeout(() => setRetroNotification(null), 3000);
    }

    const file = files[0];
    // #300: MKV is accepted here too — it converts to MP4 on rename, the same
    // as a watcher-detected MKV.
    if (!/\.(mp4|mkv)$/i.test(file.name)) {
      setRetroNotification("Only .mp4 and .mkv files are supported");
      setTimeout(() => setRetroNotification(null), 3000);
      return;
    }

    // Resolve the dropped File's native path via webUtils (Electron 30+ removed File.path)
    const filePath = window.clipflow.getPathForFile(file);
    if (!filePath) return;

    setImporting({ filename: file.name, pct: 0 });

    // Listen for import progress
    const progressHandler = (data) => {
      setImporting({ filename: data.filename, pct: data.pct });
    };
    window.clipflow.onImportProgress(progressHandler);

    const result = await window.clipflow.importExternalFile(filePath, watchFolder);

    window.clipflow.removeImportProgressListener();
    setImporting(null);

    if (result.error) {
      setRetroNotification(`Import failed: ${result.error}`);
      setTimeout(() => setRetroNotification(null), 4000);
      return;
    }

    // File is now in the watch folder — add to pending manually
    // (watcher is suppressed for this file). #263: imports get the same
    // last-renamed-game defaulting as watcher files (this path used to skip
    // it); the AI frame sniff may still retag the row via gameDetect:result.
    const lastGame = lastRenamedGame.current ? gamesDb.find((g) => g.name === lastRenamedGame.current) : null;
    const detected = lastGame ? detectForGame(lastGame, result.filename, pendingRenames) : detectGame(result.filename, gamesDb, pendingRenames);
    setPendingRenames((prev) => {
      if (prev.find((p) => p.fileName === result.filename)) return prev;
      return [...prev, {
        id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fileName: result.filename,
        filePath: result.targetPath,
        game: detected.game, tag: detected.tag, color: detected.color,
        day: detected.day, part: detected.part,
        preset: defaultPreset,
        customLabel: "",
        createdAt: new Date().toISOString(),
        importEntry: result.importEntry, // Store for cleanup
      }];
    });

    // Clear suppression after file is in pending
    if (result.importEntry) {
      await window.clipflow.importClearSuppression(result.importEntry.filename, result.importEntry.sizeBytes);
    }
  };

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); };

  // Manage tab — group by month from date column
  const folders = [...new Set(dbManagedFiles.map((f) => f.date ? f.date.slice(0, 7) : "unknown"))].sort().reverse();
  const folderFiles = dbManagedFiles.filter((f) => (f.date ? f.date.slice(0, 7) : "unknown") === manageFolder).sort((a, b) => (a.renamed_at || "").localeCompare(b.renamed_at || ""));
  const toggleMS = (id) => setManageSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAllM = () => setManageSelected((p) => p.size === folderFiles.length ? new Set() : new Set(folderFiles.map((f) => f.id)));

  const applyBatch = async () => {
    if (!batchAction || manageSelected.size === 0) return;
    const sf = folderFiles.filter((f) => manageSelected.has(f.id)).sort((a, b) => (a.renamed_at || "").localeCompare(b.renamed_at || ""));
    if (batchAction === "part") {
      const sp = parseInt(batchValue); if (isNaN(sp)) return;
      for (let idx = 0; idx < sf.length; idx++) {
        await window.clipflow.fileMetadataUpdate(sf[idx].id, { part_number: sp + idx });
      }
    } else if (batchAction === "day") {
      const n = parseInt(batchValue); if (isNaN(n)) return;
      for (const f of sf) {
        await window.clipflow.fileMetadataUpdate(f.id, { day_number: n });
      }
    } else if (batchAction === "tag") {
      const g = gamesDb.find((x) => x.tag === batchValue || x.name === batchValue);
      if (g) {
        for (const f of sf) {
          await window.clipflow.fileMetadataUpdate(f.id, { tag: g.tag, entry_type: g.entryType || "game" });
        }
      }
    }
    setBatchAction(null); setBatchValue(""); setManageSelected(new Set());
    loadDbManagedFiles(); // Refresh from SQLite
  };

  // Computed stats
  const totalRenamed = dbManagedFiles.length + renameHistory.filter((h) => !h.undone).length;

  // #175: local entries carry their DB history id — hide those rows from the
  // "Previous Sessions" list so a current-session rename doesn't show twice.
  const dbHistoryVisible = dbHistory.filter((dh) => !renameHistory.some((l) => l.historyId === dh.id));

  const gameOptions = getGroupedGameOptions();

  // #172: session-ledger grouping — pending files grouped by (date + game
  // tag). Groups are a VIEW of each row's current game, not folders: change a
  // row's game and it re-groups automatically. Sessions sort chronologically,
  // rows inside by original filename (OBS names sort by recording time).
  const sessionGroups = (() => {
    const map = new Map();
    for (const r of pendingRenames) {
      const date = r.fileName.slice(0, 10);
      const key = `${date}|${r.tag}`;
      if (!map.has(key)) map.set(key, { key, date, tag: r.tag, rows: [] });
      map.get(key).rows.push(r);
    }
    const groups = [...map.values()];
    groups.forEach((g) => g.rows.sort((a, b) => a.fileName.localeCompare(b.fileName)));
    groups.sort((a, b) => a.date.localeCompare(b.date) || a.rows[0].fileName.localeCompare(b.rows[0].fileName));
    return groups;
  })();
  const displayIds = sessionGroups.flatMap((g) => g.rows.map((r) => r.id));

  // #153: what the status strip should say. "watching" is the only state that
  // gets the pulsing dot — the other two are dead-stop conditions the user
  // has to fix in Settings, so they carry the button.
  // #406: a library with only content types (or nothing at all) means neither
  // game detector can ever match, and naming has nothing to go on.
  const hasRealGame = (gamesDb || []).some((g) => g.entryType !== "content");
  const watchTone = watchStatus.state === "watching" ? T.green : watchStatus.state === "unset" ? T.yellow : T.red;
  const watchLabel = watchStatus.state === "watching" ? "WATCHING" : watchStatus.state === "unset" ? "NO FOLDER SET" : "FOLDER NOT FOUND";
  const watchDetail = watchStatus.state === "watching"
    ? watchFolder
    : watchStatus.state === "unset"
      ? "Pick the folder OBS saves your recordings to — nothing lands here until you do."
      : watchStatus.message && watchStatus.message !== "Folder not found"
        ? `${watchFolder} — ${watchStatus.message}`
        : watchFolder;

  // #485: the file the right panel shows — the clicked one, else the first
  const focusRow = pendingRenames.find((r) => r.id === focusId) || (displayIds.length ? pendingRenames.find((r) => r.id === displayIds[0]) : null);
  const totalFootage = pendingRenames.reduce((sum, r) => sum + (splitInfo[r.id]?.durationSeconds || 0), 0);
  const shortWatch = watchFolder ? (() => { const parts = watchFolder.split("\\").filter(Boolean); return parts.length > 2 ? `${parts[0]}\\…\\${parts[parts.length - 1]}` : watchFolder; })() : "";
  const renameLabel = renaming
    ? (convertProgress ? "Converting to MP4…" : splitProgress ? `Splitting… (${splitProgress.current}/${splitProgress.total})` : "Renaming…")
    : selectedIds.size > 0 ? `Rename ${selectedIds.size} selected` : `Rename ${pendingRenames.length} file${pendingRenames.length === 1 ? "" : "s"}`;
  const renameTargets = () => (selectedIds.size > 0 ? pendingRenames.filter((r) => selectedIds.has(r.id)) : pendingRenames);

  // Recently renamed (panel): this session's renames first, then the library's
  const recentHistory = [
    ...renameHistory.map((h) => ({
      key: h.id, tag: h.tag, color: h.color, name: h.newName.replace(/\.mp4$/i, ""), when: h.undone ? "undone" : h.time,
      undo: !h.undone && h.historyId ? () => undoLocalEntry(h) : null, busy: undoBusy === h.id,
    })),
    ...dbHistoryVisible.map((h) => {
      const game = gamesDb.find((g) => g.tag === h.tag) || gamesDb.find((g) => h.new_filename?.includes(g.tag));
      return {
        key: `db-${h.id}`, tag: game?.tag || h.tag || "?", color: game?.color || "#888", name: (h.new_filename || "").replace(/\.mp4$/i, ""),
        when: relDay(h.created_at), undo: h.action !== "split" ? () => undoDbHistory(h.id) : null, busy: false,
      };
    }),
  ].slice(0, 6);

  const pill = { display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 13px", borderRadius: 9, fontWeight: 600, fontSize: 12.5, whiteSpace: "nowrap", border: `1px solid ${T.border}`, background: "rgba(var(--lift),0.035)", color: T.labelStrong || T.textSecondary, cursor: "pointer", fontFamily: T.font };
  const strip = (tone, dim, title, text, action) => (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 14px", marginBottom: 10, borderRadius: 12, border: `1px solid ${T.border}`, background: dim }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: tone, boxShadow: `0 0 6px ${tone}`, flexShrink: 0 }} />
      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "1.2px", color: tone, flexShrink: 0 }}>{title}</span>
      <span style={{ color: T.textSecondary, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>
      {action}
    </div>
  );
  const stripBtn = (label, onClick) => (
    <button onClick={onClick} style={{ marginLeft: "auto", flexShrink: 0, padding: "4px 10px", borderRadius: T.radius.md, border: `1px solid ${T.accentBorder}`, background: T.accentDim, color: T.accentLight, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>{label}</button>
  );

  return (
    <div
      ref={rootRef}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}
    >
      {/* #485: tiles, inspector and history rows */}
      <style>{`
        @keyframes cfrBarUp { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .cfr-body { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 20px; flex: 1; min-height: 0; }
        @media (max-width: 1400px) { .cfr-body { grid-template-columns: minmax(0, 1fr) 320px; } }
        .cfr-scroll { overflow: auto; min-height: 0; }
        .cfr-scroll::-webkit-scrollbar { width: 10px; }
        .cfr-scroll::-webkit-scrollbar-thumb { background: rgba(var(--lift),0.08); border-radius: 10px; border: 3px solid transparent; background-clip: padding-box; }
        .cfr-ftiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 10px; padding: 12px; }
        .cfr-ft { position: relative; display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 12px; padding: 10px; border-radius: 13px; cursor: pointer;
          background: radial-gradient(90% 160% at 100% 0%, var(--gc1) 0%, transparent 55%), linear-gradient(100deg, var(--gc2) 0%, var(--gc3) 40%, rgba(var(--lift),0.02) 65%);
          border: 1px solid var(--gcb); transition: transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s, border-color .18s; }
        .cfr-ft:focus-within { z-index: 3; }
        .cfr-ft:hover { transform: translateY(-2px); box-shadow: 0 2px 4px rgba(var(--shade),calc(.5 * var(--shadeK))), 0 26px 60px -22px rgba(var(--shade),calc(.85 * var(--shadeK))); }
        .cfr-ft.sel { background: radial-gradient(90% 160% at 100% 0%, var(--gs1) 0%, transparent 60%), linear-gradient(100deg, var(--gs2) 0%, var(--gs3) 55%, rgba(var(--lift),0.03) 85%); border-color: var(--gsb); box-shadow: inset 0 1px 0 rgba(var(--lift),0.09); }
        .cfr-ft .cfr-acts { opacity: 0; transition: opacity .15s; }
        .cfr-ft:hover .cfr-acts, .cfr-ft.sel .cfr-acts { opacity: 1; }
        .cfr-ft .cfr-cb { position: absolute; left: 6px; top: 6px; z-index: 2; opacity: 0; transition: opacity .15s; }
        .cfr-ft:hover .cfr-cb, .cfr-selecting .cfr-cb, .cfr-ft.rowsel .cfr-cb { opacity: 1; }
        .cfr-check { display: inline-flex; align-items: center; overflow: hidden; width: 0; opacity: 0; margin-left: -6px; transition: opacity 0.13s ease, width 0.13s ease, margin 0.13s ease; }
        .cfr-shead:hover .cfr-check, .cfr-selecting .cfr-check { width: 16px; opacity: 1; margin-left: 0; }
        .cfr-iconbt { width: 26px; height: 26px; border-radius: 7px; border: 1px solid transparent; background: transparent; color: ${T.textSecondary}; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex: none; padding: 0; }
        .cfr-iconbt:hover { color: ${T.text}; background: rgba(var(--lift),0.08); }
        .cfr-iconbt.on { color: ${T.accentLight}; background: ${T.accentDim}; }
        .cfr-iconbt:disabled { opacity: 0.35; cursor: default; }
        .cfr-hrow:hover { background: rgba(var(--lift),0.035); }
        .cfr-hrow .cfr-hu { display: none; }
        .cfr-hrow:hover .cfr-hu { display: inline; }
        .cfr-hrow:hover .cfr-hw { display: none; }
      `}</style>
      {/* Drop zone overlay */}
      {dragOver && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 100,
          background: "rgba(139,92,246,0.08)",
          border: "2px dashed rgba(139,92,246,0.5)",
          borderRadius: T.radius.lg || 12,
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{ color: T.accentLight, fontSize: 16, fontWeight: 700, textAlign: "center" }}>
            Drop recording here
            <div style={{ color: T.textMuted, fontSize: 12, fontWeight: 500, marginTop: 4 }}>.mp4 or .mkv files only</div>
          </div>
        </div>
      )}

      {/* #485 header: title + what's waiting, then the tab switch and actions */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, paddingBottom: 18, flexShrink: 0, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1, color: T.text }}>Rename</div>
          <div style={{ color: T.textSecondary, marginTop: 5, fontSize: 13 }}>
            {pendingRenames.length > 0
              ? <><b style={{ color: T.text, fontWeight: 600 }}>{pendingRenames.length} recording{pendingRenames.length === 1 ? "" : "s"}</b> waiting from {sessionGroups.length} session{sessionGroups.length === 1 ? "" : "s"}{totalFootage > 0 ? ` · ${formatDuration(totalFootage)} of footage` : ""}</>
              : "Nothing waiting to be renamed"}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {watchStatus.state === "watching" && (
            <span title={watchFolder} style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 30, padding: "0 12px", borderRadius: 999, border: `1px solid ${T.border}`, background: "rgba(var(--lift),0.03)", color: T.labelStrong || T.textSecondary, fontWeight: 600, fontSize: 12.5, whiteSpace: "nowrap" }}>
              <PulseDot size={7} />Watching {shortWatch}
            </span>
          )}
          <div style={{ display: "flex", padding: 3, borderRadius: 10, background: "rgba(var(--lift),0.035)", border: `1px solid ${T.border}` }}>
            {[["pending", "Pending", pendingRenames.length], ["history", "History", renameHistory.length + dbHistoryVisible.length], ["manage", "Manage", null]].map(([id, lbl, c]) => (
              <button key={id} onClick={() => setSubTab(id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 7, border: "none", fontFamily: T.font, fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", background: subTab === id ? "rgba(var(--lift),0.08)" : "transparent", color: subTab === id ? T.text : T.textSecondary }}>
                {lbl}{c != null && <span style={{ fontSize: 11, color: subTab === id ? T.accentLight : T.textTertiary }}>{c}</span>}
              </button>
            ))}
          </div>
          <button onClick={refresh} disabled={refreshing} title={refreshing ? "Refreshed" : "Refresh"} style={{ ...pill, width: 34, padding: 0, justifyContent: "center", color: refreshing ? T.green : pill.color, borderColor: refreshing ? T.greenBorder : T.border }}>{refreshing ? "✓" : IcRefresh}</button>
          <button onClick={() => onAddGame("game")} style={pill}>{IcPlus}Add game</button>
          {subTab === "pending" && pendingRenames.length > 0 && (
            <button
              onClick={() => renameFiles(renameTargets())}
              disabled={renaming}
              style={{ ...pill, color: "#fff", border: "1px solid rgba(255,255,255,0.12)", background: renaming ? "rgba(var(--lift),0.06)" : `linear-gradient(180deg, ${T.accentLight}, ${T.accent})`, boxShadow: renaming ? "none" : `inset 0 1px 0 rgba(255,255,255,0.18), 0 6px 20px color-mix(in srgb, ${T.accent} 30%, transparent)`, cursor: renaming ? "default" : "pointer" }}
            >{renameLabel}{!renaming && IcArrow}</button>
          )}
        </div>
      </div>

      {/* Dead-stop states: no folder, folder gone, no games */}
      {watchStatus.state !== "watching" && strip(watchTone, watchStatus.state === "unset" ? T.yellowDim : T.redDim, watchLabel, watchDetail, onNavigate && stripBtn("Choose folder", () => onNavigate("settings")))}
      {/* #406: without a real game neither detector can match and naming has
          nothing to go on — say so here rather than quietly tagging Unknown. */}
      {!hasRealGame && strip(T.yellow, T.yellowDim, "NO GAMES SET UP", "Corva can't tell what you're playing — recordings stay Unknown until you add a game.", stripBtn("+ Add Game", () => onAddGame("game")))}

      {/* Import progress banner */}
      {importing && (
        <div style={{ padding: "10px 16px", borderRadius: T.radius.md, background: T.accentDim, border: `1px solid ${T.accentBorder}`, marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ color: T.accentLight, fontSize: 13, fontWeight: 600 }}>Importing {importing.filename}... {importing.pct}%</span>
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(var(--lift),0.06)", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 2, background: T.accent, width: `${importing.pct}%`, transition: "width 0.3s ease" }} />
          </div>
        </div>
      )}

      {/* Retroactive part notification */}
      {retroNotification && (
        <div style={{ margin: "0 0 12px", padding: "12px 16px", borderRadius: T.radius.md, background: T.yellowDim, border: `1px solid ${T.yellowBorder}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <span style={{ color: T.yellow, fontSize: 13, fontWeight: 600 }}>{retroNotification}</span>
          <button onClick={() => setRetroNotification(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: T.textMuted, fontSize: 16, cursor: "pointer", padding: "2px 6px" }}>×</button>
        </div>
      )}

      {/* PENDING — #172 sessions, #485 tiles + inspector */}
      {subTab === "pending" && (pendingRenames.length > 0 && focusRow ? (
        <div className="cfr-body">
          <div className="cfr-scroll">
            {/* #473: renaming a file an editor project already uses knocks it
                offline there. The steps to relink, until the full feature is built. */}
            {!relinkTipDismissed && (
              <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, background: "rgba(var(--lift),0.02)", marginBottom: 12, padding: "8px 12px", fontSize: 12, color: T.textSecondary }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent, boxShadow: `0 0 6px ${T.accent}`, flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Already editing a recording in Resolve or Premiere? Renaming it shows as media offline there.</span>
                  <button onClick={() => setRelinkTipOpen((o) => !o)} style={{ flexShrink: 0, background: "none", border: "none", padding: 0, color: T.accentLight, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>{relinkTipOpen ? "Hide steps" : "How to relink"}</button>
                  <button onClick={dismissRelinkTip} title="Don't show this again" style={{ marginLeft: "auto", flexShrink: 0, background: "none", border: "none", color: T.textMuted, fontSize: 16, lineHeight: 1, cursor: "pointer", padding: "0 4px" }}>×</button>
                </div>
                {relinkTipOpen && (
                  <div style={{ marginTop: 8, paddingLeft: 17, display: "flex", flexDirection: "column", gap: 5, lineHeight: 1.45 }}>
                    <div><b style={{ color: T.text }}>Resolve:</b> in the Media Pool, right-click the offline clip, choose Replace Selected Clip, and pick the renamed file. Every cut that uses it comes back.</div>
                    <div><b style={{ color: T.text }}>Premiere:</b> right-click the offline clip, choose Link Media, untick File Name under "Match File Properties", and pick the renamed file.</div>
                  </div>
                )}
              </div>
            )}
            <div className={selectedIds.size > 0 ? "cfr-selecting" : ""} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16, alignContent: "start", paddingBottom: selectedIds.size > 0 ? 90 : 24 }}>
              {sessionGroups.map((grp) => {
                const rowIds = grp.rows.map((r) => r.id);
                const selCount = grp.rows.filter((r) => selectedIds.has(r.id)).length;
                const headState = selCount === grp.rows.length ? "on" : selCount > 0 ? "half" : "off";
                const samePreset = grp.rows.every((r) => (r.preset || defaultPreset) === (grp.rows[0].preset || defaultPreset));
                const headPreset = samePreset ? (grp.rows[0].preset || defaultPreset) : null;
                const firstWithPath = grp.rows.find((r) => r.filePath);
                const knownDur = grp.rows.reduce((s, r) => s + (splitInfo[r.id]?.durationSeconds || 0), 0);
                const gDate = localDate(grp.date);
                const startMin = obsStartMin(grp.rows[0].fileName);
                const lastRow = grp.rows[grp.rows.length - 1];
                const lastStart = obsStartMin(lastRow.fileName);
                const lastDur = splitInfo[lastRow.id]?.durationSeconds || 0;
                const endMin = lastStart != null && lastDur ? lastStart + lastDur / 60 : null;
                const splitRow = grp.rows.find((r) => r.id === splitOpenId) || null;
                return (
                  <div key={grp.key} style={{ borderRadius: 16, border: `1px solid ${T.border}`, background: "linear-gradient(180deg, rgba(var(--lift),0.025), rgba(var(--lift),0.01))", boxShadow: "inset 0 1px 0 rgba(var(--lift),0.04)" }}>
                    {/* session header — owns everything the parts share */}
                    <div className="cfr-shead" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", rowGap: 8, padding: "12px 14px", borderBottom: `1px solid ${T.border}` }}>
                      <span className="cfr-check"><LedgerCheck state={headState} onClick={() => toggleGroup(grp)} title="Select every file in this session" /></span>
                      <div style={{ width: 42, height: 44, borderRadius: 10, background: "rgba(var(--lift),0.045)", border: `1px solid ${T.border}`, display: "grid", placeContent: "center", textAlign: "center", lineHeight: 1, flexShrink: 0 }}>
                        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em", color: T.red }}>{gDate ? gDate.toLocaleDateString("en-US", { month: "short" }).toUpperCase() : "?"}</span>
                        <b style={{ fontSize: 17, fontWeight: 700, marginTop: 3, color: T.text }}>{gDate ? gDate.getDate() : ""}</b>
                      </div>
                      <div style={{ minWidth: 150 }}>
                        <b style={{ display: "block", fontSize: 14, fontWeight: 600, color: T.text }}>{gDate ? gDate.toLocaleDateString("en-US", { weekday: "long" }) : fmtSessionDate(grp.date)}</b>
                        <span style={{ fontSize: 12, color: T.textSecondary, fontVariantNumeric: "tabular-nums" }}>
                          {startMin != null ? fmtClockOfDay(startMin) : ""}{endMin != null ? ` to ${fmtClockOfDay(endMin)}` : ""}{knownDur > 0 ? ` · ${formatDuration(knownDur)}` : ""}
                        </span>
                      </div>
                      <GroupedSelect
                        value={grp.rows[0].game}
                        onChange={(v) => setGameForRows(rowIds, v)}
                        options={gameOptions}
                        renderSelected={(o) => <><GamePill tag={o.tag || grp.tag} color={o.color || grp.rows[0].color} size="sm" />{o.label}</>}
                        renderOption={renderEntryOption}
                        style={{ minWidth: 150 }}
                        borderColor={T.border}
                      />
                      <ReactSwitch
                        compact
                        entry={gamesDb.find((g) => g.name === grp.rows[0].game)}
                        gamesDb={gamesDb}
                        onPick={(e) => setGameForRows(rowIds, e.name, e)}
                        onReactionFor={onReactionFor}
                      />
                      <MiniSpinbox pill label="Day" value={grp.rows[0].day} onChange={(v) => setDayForRows(rowIds, v)} />
                      <SessionPresetPicker presetId={headPreset} onChange={(v) => setPresetForRows(rowIds, v)} />
                      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, color: T.textSecondary, fontSize: 12.5 }}>
                        {grp.rows.length} part{grp.rows.length === 1 ? "" : "s"}
                        {firstWithPath && (
                          <button className="cfr-iconbt" title="Show session in Explorer" onClick={() => window.clipflow?.revealInFolder(firstWithPath.filePath)} style={{ width: 28, height: 28, border: `1px solid ${T.border}`, borderRadius: 8 }}>{IcFolderL}</button>
                        )}
                      </span>
                    </div>
                    {/* files side by side — only what varies per file */}
                    <div className="cfr-ftiles">
                      {grp.rows.map((r) => {
                        const preset = r.preset || defaultPreset;
                        const showLabel = PRESETS_USING_LABEL.has(preset);
                        const showPart = PRESETS_ALWAYS_PARTS.has(preset);
                        const info = splitInfo[r.id];
                        const hasSplit = info && info.splitCount > 0 && !info.skipSplit;
                        const splitSkipped = info && info.splitCount > 0 && info.skipSplit;
                        const preview = previewFrames[r.id];
                        const frames = preview?.frames || [];
                        const still = frames.length ? frames[Math.floor(frames.length * 0.3)] : null;
                        const isSel = selectedIds.has(r.id);
                        const labelInvalid = showLabel && r.customLabel && /[\\/:*?"<>|]/.test(r.customLabel);
                        const splitParts = hasSplit ? getSplitPreview(r) : null;
                        const splitTitle = splitParts ? `Splits into ${splitParts.map((p) => `${p.label} ${fmtClock(p.start)}–${fmtClock(p.end)}`).join(", ")}. Click to keep as one file.` : "";
                        const markers = scrubberMarkers[r.id] || [];
                        const chip = (color, bg, border) => ({ fontSize: 10.5, color, background: bg, border: `1px solid ${border}`, borderRadius: 5, padding: "1px 7px", flexShrink: 0, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" });
                        return (
                          <div
                            key={r.id}
                            className={`cfr-ft${focusRow.id === r.id ? " sel" : ""}${isSel ? " rowsel" : ""}`}
                            style={gameVars(r.color)}
                            onClick={(e) => { if (!e.target.closest("button, input, [data-nofocus]")) setFocusId(r.id); }}
                          >
                            <span className="cfr-cb" data-nofocus=""><LedgerCheck state={isSel ? "on" : "off"} onClick={(e) => toggleRow(r.id, e)} title="Select (shift-click for a range)" /></span>
                            <div style={{ width: 64, height: 72, borderRadius: 9, overflow: "hidden", border: "1px solid rgba(var(--lift),0.08)", background: "rgba(var(--lift),0.05)", display: "grid", placeItems: "center" }}>
                              {still
                                ? <img src={toFileUrl(still.path)} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                                : <span style={{ color: T.textMuted, fontSize: 10 }}>{preview?.loading ? "…" : ""}</span>}
                            </div>
                            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                              <div data-nofocus="" style={{ minWidth: 0, display: "flex" }}>
                                <PresetNamePicker
                                  rename={r}
                                  presets={PRESET_LIST}
                                  currentPreset={preset}
                                  getProposed={getProposed}
                                  onPresetChange={(v) => updatePending(r.id, "preset", v)}
                                  color={r.color}
                                />
                              </div>
                              <div title={r.fileName} style={{ fontSize: 11.5, color: T.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>from {r.fileName}</div>
                              {showLabel && (
                                <div data-nofocus="" style={{ position: "relative", marginTop: 4, maxWidth: 220 }}>
                                  <input
                                    value={r.customLabel || ""}
                                    onChange={(e) => updateLabel(r.id, e.target.value)}
                                    onFocus={() => { setActiveLabelFileId(r.id); fetchLabelSuggestions(r.tag, r.customLabel || ""); }}
                                    onBlur={() => setTimeout(() => setActiveLabelFileId(null), 200)}
                                    placeholder="custom-label"
                                    title={labelInvalid ? "Labels can't contain special characters" : undefined}
                                    style={{
                                      width: "100%", background: "rgba(var(--lift),0.04)",
                                      border: `1px solid ${labelInvalid ? T.red : T.border}`,
                                      borderRadius: 7, padding: "5px 9px",
                                      color: T.text, fontSize: 12, fontFamily: T.font, outline: "none",
                                    }}
                                  />
                                  {/* Autocomplete dropdown */}
                                  {activeLabelFileId === r.id && labelSuggestions.length > 0 && (
                                    <div style={{
                                      position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                                      background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md,
                                      boxShadow: "0 8px 32px rgba(var(--shade),calc(0.5 * var(--shadeK)))", zIndex: 999, padding: 4,
                                      maxHeight: 180, overflowY: "auto",
                                    }}>
                                      {labelSuggestions.map((s) => (
                                        <div
                                          key={s.label}
                                          onMouseDown={() => selectLabelSuggestion(r.id, s.label)}
                                          style={{
                                            padding: "8px 12px", borderRadius: 6, cursor: "pointer",
                                            color: T.text, fontSize: 13, fontFamily: T.font,
                                            display: "flex", justifyContent: "space-between", alignItems: "center",
                                          }}
                                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(var(--lift),0.06)"}
                                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                                        >
                                          <span>{s.label}</span>
                                          <span style={{ color: T.textMuted, fontSize: 11 }}>×{s.use_count}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              <div style={{ marginTop: "auto", paddingTop: 6, display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                {showPart && <span data-nofocus=""><MiniSpinbox pill compact label="Pt" value={r.part} onChange={(v) => setPartForRow(r.id, v)} /></span>}
                                <span style={{ fontSize: 12, color: T.textSecondary, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{info?.probing ? "…" : info?.durationSeconds ? fmtClock(info.durationSeconds) : "—"}</span>
                                {hasSplit && (
                                  <span data-nofocus="" onClick={() => toggleSkipSplit(r.id)} title={splitTitle} style={chip(T.accentLight, T.accentDim, T.accentBorder)}>splits into {info.splitCount}</span>
                                )}
                                {splitSkipped && (
                                  <span data-nofocus="" onClick={() => toggleSkipSplit(r.id)} title="Auto-split is off for this file — click to split it again" style={chip(T.yellow, T.yellowDim, T.yellowBorder)}>split off</span>
                                )}
                                {markers.length > 0 && splitOpenId !== r.id && (
                                  <span data-nofocus="" onClick={() => toggleSplit(r.id)} title="Splits where the game changes when you rename. Click to edit." style={chip(T.accentLight, T.accentDim, T.accentBorder)}>{markers.length + 1} games</span>
                                )}
                                <span className="cfr-acts" style={{ marginLeft: "auto", display: "flex", gap: 2, flexShrink: 0 }}>
                                  {r.filePath && info?.durationSeconds > 0 && (
                                    <button className={`cfr-iconbt${splitOpenId === r.id ? " on" : ""}`} title={splitOpenId === r.id ? "Close the split strip" : "Mark where the game changes"} disabled={renaming} onClick={() => toggleSplit(r.id)}>{IcScissorsL}</button>
                                  )}
                                  {r.filePath && <button className="cfr-iconbt" title="Show in Explorer" onClick={() => window.clipflow?.revealInFolder(r.filePath)}>{IcFolderL}</button>}
                                  <button className="cfr-iconbt" title="Hide from pending" onClick={() => hideOne(r.id)}>{IcEyeOff}</button>
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* #485: the split strip opens under its session */}
                    <Collapse open={!!splitRow}>
                      {splitRow && (
                        <ThumbnailScrubber
                          thumbnails={previewFrames[splitRow.id]?.frames || []}
                          duration={splitInfo[splitRow.id]?.durationSeconds || 0}
                          games={gamesDb}
                          markers={scrubberMarkers[splitRow.id] || []}
                          onMarkersChange={(m) => updateScrubberMarkers(splitRow.id, m)}
                          loading={!!previewFrames[splitRow.id]?.loading}
                          defaultGameTag={splitRow.tag}
                          onReactionFor={onReactionFor}
                          partLabel={`Pt${splitRow.part}`}
                          onHover={(t) => { setSplitHoverAt(t); if (t != null) setFocusId(splitRow.id); }}
                          onDone={() => toggleSplit(splitRow.id)}
                        />
                      )}
                    </Collapse>
                  </div>
                );
              })}
              <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", padding: 14, border: "1px dashed rgba(var(--lift),0.1)", borderRadius: 12, color: T.textTertiary, fontSize: 12.5 }}>
                {IcPlus}Drop an .mp4 or .mkv anywhere on this page to add it
              </div>
            </div>
          </div>
          <aside className="cfr-scroll" style={{ marginBottom: 22, borderRadius: 16, border: `1px solid ${T.border}`, background: "linear-gradient(180deg, rgba(var(--lift),0.03), rgba(var(--lift),0.012))", boxShadow: "inset 0 1px 0 rgba(var(--lift),0.04)" }}>
            <RenameInspector
              row={focusRow}
              info={splitInfo[focusRow.id]}
              frames={previewFrames[focusRow.id]?.frames || []}
              loading={!!previewFrames[focusRow.id]?.loading}
              hoverAt={splitOpenId === focusRow.id ? splitHoverAt : null}
              savesAs={(() => { const dir = focusRow.filePath ? resolveTargetDir(focusRow) : ""; const parts = dir.split("\\").filter(Boolean); return { dir: parts.slice(-2).join("\\"), name: getProposed(focusRow) }; })()}
              splitOn={splitOpenId === focusRow.id}
              onSplit={() => toggleSplit(focusRow.id)}
              onHide={() => hideOne(focusRow.id)}
              history={recentHistory}
              onAllHistory={() => setSubTab("history")}
            />
          </aside>
        </div>
      ) : (
        <div className="cfr-scroll" style={{ flex: 1 }}>
          <Card style={{ padding: "40px 20px", textAlign: "center", maxWidth: 860, margin: "0 auto" }}>
            {renameDone ? (<><div style={{ fontSize: 32, marginBottom: 8 }}>✅</div><div style={{ color: T.green, fontSize: 16, fontWeight: 700 }}>All files renamed!</div></>) : (<><div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>📁</div><div style={{ color: T.textTertiary, fontSize: 14 }}>{watchStatus.state === "watching" ? "No pending files — watching for new recordings..." : "Nothing is being watched yet."}</div><div style={{ color: T.textMuted, fontSize: 12, marginTop: 8 }}>Or drag and drop an .mp4 or .mkv file here</div></>)}
          </Card>
        </div>
      ))}

      {subTab !== "pending" && (
        <div className="cfr-scroll" style={{ flex: 1 }}>
          <div style={{ maxWidth: 860, margin: "0 auto", paddingBottom: 24 }}>
        {/* HISTORY TAB — reads from both local state (current session) and SQLite (past sessions) */}
        {subTab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Current session history (from local state) */}
            {renameHistory.length === 0 && dbHistory.length === 0 ? (
              <Card style={{ padding: 40, textAlign: "center" }}><div style={{ color: T.textTertiary }}>No rename history yet</div></Card>
            ) : (
              <>
                {/* Local history entries (current session) */}
                {renameHistory.map((h) => (
                  <Card key={h.id} style={{ padding: "14px 18px", opacity: h.undone ? 0.45 : 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <GamePill tag={h.tag} color={h.color} size="sm" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: T.textTertiary, fontSize: 12, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.oldName}</div>
                        <div style={{ color: h.undone ? T.red : T.green, fontSize: 14, fontWeight: 600, fontFamily: T.mono, marginTop: 2, textDecoration: h.undone ? "line-through" : "none" }}>{h.newName}</div>
                      </div>
                      {h.undone ? (
                        <span title="This rename was undone — the file went back to its original name and returned to Pending" style={{ color: T.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", flexShrink: 0, cursor: "help" }}>UNDONE</span>
                      ) : h.historyId ? (
                        <button onClick={() => undoLocalEntry(h)} disabled={undoBusy === h.id} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${T.yellowBorder}`, background: T.yellowDim, color: T.yellow, fontSize: 11, fontWeight: 700, cursor: undoBusy === h.id ? "default" : "pointer", fontFamily: T.font, opacity: undoBusy === h.id ? 0.5 : 1 }}>{undoBusy === h.id ? "UNDOING…" : "UNDO"}</button>
                      ) : (
                        <span title="Renamed before Corva tracked undo — this entry can't be undone" style={{ color: T.textMuted, opacity: 0.5, fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", flexShrink: 0, cursor: "help" }}>NO UNDO</span>
                      )}
                      <span style={{ color: T.textMuted, fontSize: 11, fontFamily: T.mono, flexShrink: 0 }}>{h.time}</span>
                    </div>
                  </Card>
                ))}

                {/* SQLite history entries (past sessions) */}
                {dbHistoryVisible.length > 0 && renameHistory.length > 0 && (
                  <div style={{ color: T.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", padding: "12px 0 4px", borderTop: `1px solid ${T.border}`, marginTop: 4 }}>Previous Sessions</div>
                )}
                {dbHistoryVisible.map((h) => {
                  const game = gamesDb.find((g) => g.tag === h.tag) || gamesDb.find((g) => {
                    // Try to match by looking at filenames
                    return h.new_filename?.includes(g.tag);
                  });
                  return (
                    <Card key={h.id} style={{ padding: "14px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {game && <GamePill tag={game.tag} color={game.color} size="sm" />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: T.textTertiary, fontSize: 12, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.previous_filename}</div>
                          <div style={{ color: T.green, fontSize: 14, fontWeight: 600, fontFamily: T.mono, marginTop: 2 }}>{h.new_filename}</div>
                        </div>
                        {h.action === "retroactive_part" && (
                          <span style={{ padding: "3px 8px", borderRadius: 6, background: T.yellowDim, color: T.yellow, fontSize: 10, fontWeight: 700 }}>RETRO</span>
                        )}
                        {h.action === "split" && (
                          <span style={{ padding: "3px 8px", borderRadius: 6, background: T.accentDim, color: T.accentLight, fontSize: 10, fontWeight: 700 }}>SPLIT</span>
                        )}
                        {h.action !== "split" && (
                          <button onClick={() => undoDbHistory(h.id)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${T.yellowBorder}`, background: T.yellowDim, color: T.yellow, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>UNDO</button>
                        )}
                        <span style={{ color: T.textMuted, fontSize: 11, fontFamily: T.mono, flexShrink: 0 }}>{h.created_at ? new Date(h.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}</span>
                      </div>
                    </Card>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* MANAGE TAB */}
        {subTab === "manage" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <SectionLabel>Subfolder</SectionLabel>
                <Select value={manageFolder} onChange={(v) => { setManageFolder(v); setManageSelected(new Set()); }} options={folders.map((f) => ({ value: f, label: f }))} style={{ padding: "8px 12px", fontSize: 13 }} />
              </div>
              <button onClick={selectAllM} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(var(--lift),0.03)", color: T.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>{manageSelected.size === folderFiles.length && folderFiles.length > 0 ? "NONE" : "ALL"}</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
              {folderFiles.map((f) => {
                const game = gamesDb.find((g) => g.tag === f.tag);
                return (
                  <Card key={f.id} onClick={() => toggleMS(f.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: manageSelected.has(f.id) ? T.accentGlow : T.surface, borderColor: manageSelected.has(f.id) ? T.accentBorder : T.border }}>
                    <Checkbox checked={manageSelected.has(f.id)} />
                    <GamePill tag={f.tag} color={game?.color || "#888"} size="sm" />
                    <div style={{ flex: 1, color: T.text, fontSize: 14, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.current_filename}</div>
                    {f.day_number != null && <span style={{ color: T.accent, fontSize: 12, fontFamily: T.mono }}>Day{f.day_number}</span>}
                    {f.part_number != null && <span style={{ color: T.green, fontSize: 12, fontFamily: T.mono }}>Pt{f.part_number}{f.sub_part || ""}</span>}
                  </Card>
                );
              })}
            </div>

            {manageSelected.size > 0 && (
              <Card style={{ padding: "16px 20px" }}>
                <div style={{ color: T.textSecondary, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{manageSelected.size} file{manageSelected.size > 1 ? "s" : ""} selected</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["part", "day", "tag"].map((a) => (
                    <button key={a} onClick={() => { setBatchAction(a); setBatchValue(""); }} style={{ padding: "10px 18px", borderRadius: 8, border: batchAction === a ? `1px solid ${T.accentBorder}` : `1px solid ${T.border}`, background: batchAction === a ? T.accentDim : "rgba(var(--lift),0.03)", color: batchAction === a ? T.accentLight : T.textSecondary, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font, textTransform: "uppercase" }}>Change {a}</button>
                  ))}
                </div>
                {batchAction && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                    {batchAction === "tag" ? (
                      <Select value={batchValue} onChange={setBatchValue} options={[{ value: "", label: "Select game..." }, ...gamesDb.map((g) => ({ value: g.tag, label: `${g.tag} (${g.name})` }))]} style={{ flex: 1, padding: "10px 14px", fontSize: 13 }} />
                    ) : (
                      <input value={batchValue} onChange={(e) => setBatchValue(e.target.value.replace(/\D/g, ""))} placeholder={batchAction === "part" ? "Starting part #" : `New ${batchAction} #`} style={{ flex: 1, background: "rgba(var(--lift),0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "10px 14px", color: T.text, fontSize: 14, fontFamily: T.mono, outline: "none" }} />
                    )}
                    <button onClick={applyBatch} disabled={!batchValue} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: batchValue ? T.accent : "rgba(var(--lift),0.04)", color: batchValue ? "#fff" : T.textMuted, fontSize: 13, fontWeight: 700, cursor: batchValue ? "pointer" : "default", fontFamily: T.font }}>Apply</button>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
          </div>
        </div>
      )}

      {/* #172: floating selection bar (#485: Rename lives in the header and
          follows the selection). Same glass shell as Recordings (#123). */}
      {subTab === "pending" && selectedIds.size > 0 && (
        <div style={{ ...BAR_SHELL, ...BAR_GLASS }}>
          <span style={{ fontSize: 12.5, color: T.textSecondary, padding: "0 4px", whiteSpace: "nowrap", fontFamily: T.font }}><b style={{ color: T.text }}>{selectedIds.size}</b> selected</span>
          <div ref={gameMenuRef} style={{ position: "relative" }}>
            <button onClick={() => { setGameMenuOpen((v) => !v); setBulkReacting(false); }} disabled={renaming} style={{ ...BAR_BTN, background: gameMenuOpen ? T.surfaceHover : "transparent", borderColor: T.border, color: T.textSecondary }}>Set Game ▾</button>
            {gameMenuOpen && (
              <div style={{ position: "absolute", bottom: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)", background: "rgba(22,23,31,0.97)", border: `1px solid ${T.borderHover}`, borderRadius: 12, boxShadow: "0 10px 32px rgba(var(--shade),calc(0.55 * var(--shadeK)))", padding: 5, minWidth: 210, maxHeight: 320, overflowY: "auto" }}>
                {/* #474: with Reacting on, a picked game labels the files as its reaction. */}
                <div
                  onClick={() => setBulkReacting((v) => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", margin: "0 0 4px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: T.font, color: bulkReacting ? T.accentLight : T.textSecondary, background: bulkReacting ? T.accentDim : "transparent", borderBottom: `1px solid ${T.border}` }}
                >
                  <Checkbox checked={bulkReacting} size={14} />🎙 Reacting
                </div>
                {gameOptions.map((o) => o.isHeader ? (
                  <div key={o.value} style={{ padding: "7px 12px 3px", fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.5px" }}>{o.label}</div>
                ) : (
                  <div
                    key={o.value}
                    onClick={() => {
                      const g = gamesDb.find((x) => x.name === o.value);
                      const target = bulkReacting && g && (!g.entryType || g.entryType === "game") ? onReactionFor?.(g) : g;
                      if (target) setGameForRows(selectedIds, target.name, target);
                      setGameMenuOpen(false); clearSelection();
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", color: T.text, whiteSpace: "nowrap", fontFamily: T.font }}
                    onMouseEnter={(e) => e.currentTarget.style.background = T.surfaceHover}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    {renderEntryOption(o)}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={hideSelected} disabled={renaming} style={{ ...BAR_BTN, background: "transparent", borderColor: T.border, color: T.textSecondary }}>Hide Selected</button>
          <button onClick={clearSelection} disabled={renaming} style={{ ...BAR_BTN, background: "transparent", borderColor: T.border, color: T.textSecondary }}>Clear</button>
        </div>
      )}
    </div>
  );
}

// ── GroupedSelect: Select with section headers ──
function GroupedSelect({ value, onChange, options, style: x, renderOption, renderSelected, borderColor }) {
  const [open, setOpen] = useState(false);
  const [hovIdx, setHovIdx] = useState(-1);
  const ref = useRef(null);

  // Portal the menu to <body> so it escapes the session card's overflow:hidden
  // clip (it opens downward past the header). getBoundingClientRect positions it;
  // outside-click checks BOTH trigger and menu since the menu is no longer a
  // descendant of the wrapper; any scroll/resize closes it (fixed pos detaches).
  const [rect, setRect] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (ref.current) setRect(ref.current.getBoundingClientRect());
    const onDown = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    // Close on page scroll (fixed menu detaches from trigger), but NOT when
    // scrolling inside the menu itself — else middle-mouse/wheel scroll closes it.
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

  const selected = options.find((o) => o.value === value && !o.isHeader);

  const menu = open && rect ? createPortal(
    <div ref={menuRef} style={{ position: "fixed", top: rect.bottom + 4, left: rect.left, minWidth: rect.width, maxHeight: 300, overflowY: "auto", overflowX: "hidden", background: T.surface, border: `1px solid ${T.borderHover || T.border}`, borderRadius: T.radius.md, boxShadow: "0 8px 32px rgba(var(--shade),calc(0.5 * var(--shadeK)))", zIndex: 1000, padding: 4 }}>
      {options.map((o, i) => {
        if (o.isHeader) {
          return (
            <div key={o.value} style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", borderTop: i > 0 ? `1px solid ${T.border}` : "none", marginTop: i > 0 ? 4 : 0 }}>
              {o.label}
            </div>
          );
        }
        return (
          <div key={o.value} onMouseEnter={() => setHovIdx(i)} onMouseLeave={() => setHovIdx(-1)} onClick={() => { onChange(o.value); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, cursor: "pointer", background: o.value === value ? "rgba(139,92,246,0.12)" : hovIdx === i ? "rgba(var(--lift),0.06)" : "transparent", color: o.value === value ? T.accentLight : T.text, fontSize: 13, fontFamily: T.font, fontWeight: o.value === value ? 600 : 400, transition: "background 0.1s" }}>
            {renderOption ? renderOption(o) : o.label}
          </div>
        );
      })}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", ...x }}>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", height: 36, background: T.surface, border: `1px solid ${borderColor || (open ? T.accentBorder : T.border)}`, borderRadius: T.radius.md, padding: "0 12px", color: T.text, fontSize: 13, fontFamily: T.font, cursor: "pointer", outline: "none", textAlign: "left" }}>
        <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
          {renderSelected && selected ? renderSelected(selected) : (selected?.label || value)}
        </span>
        <span style={{ color: T.textMuted, fontSize: 10, transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "none" }}>{"\u25BC"}</span>
      </button>
      {menu}
    </div>
  );
}
