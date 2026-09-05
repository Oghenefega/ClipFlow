import React, { useState, useEffect } from "react";
import T from "../styles/theme";

// #330: What's New — shown once on the first launch after an update, over the
// whole app. Content comes from the curated src/main/release-notes.js via
// whatsnew:get; "Got it" stamps lastSeenVersion so the screen never repeats
// for the same version. A user several versions behind sees every entry they
// missed, newest first.
//
// #339: the same overlay also serves Settings → About as ReleaseHistoryModal —
// every curated entry via whatsnew:getAll, close does NOT ack, so re-reading
// history never suppresses a pending first-launch announcement.
//
// s240 redesign (Fega: the old 520px text column read like a phone screen). One
// wide card: a header band for the release being read, its changes as a grid of
// cards (category → first sentence in bold → the rest), and, when there is more
// than one release to show, a rail on the left to move between them (click or
// ↑/↓). A single-version update hides the rail and takes the full width.
const SECTIONS = [
  { key: "added", label: "Added", color: T.green, dim: T.greenDim, border: T.greenBorder },
  { key: "changed", label: "Changed", color: T.accentLight, dim: T.accentDim, border: T.accentBorder },
  { key: "fixed", label: "Fixed", color: T.orange, dim: T.orangeDim, border: T.orangeBorder },
];

// A note is one plain paragraph (or, authored that way, { title, body }). The
// first sentence carries the card and the rest is the explanation. A note that
// is one long sentence splits at its first clause break instead; one with no
// usable break at all is shown as a paragraph, never as a bold wall.
const MAX_TITLE = 110;
const CLAUSE_BREAKS = [": ", " — ", "; ", ", so ", ", and ", ", "];
export function splitItem(item) {
  if (item && typeof item === "object") return { title: String(item.title || "").trim(), body: String(item.body || "").trim() };
  const t = String(item || "").trim();
  const m = /^(.+?[.!?])\s+(\S[\s\S]*)$/.exec(t);
  if (m && m[1].length <= MAX_TITLE) return { title: m[1], body: m[2] };
  if (t.length <= MAX_TITLE) return { title: t, body: "" };
  let cut = -1;
  const balanced = (i) => (t.slice(0, i).match(/\(/g) || []).length === (t.slice(0, i).match(/\)/g) || []).length;
  for (const br of CLAUSE_BREAKS) {
    let i = t.indexOf(br, 30);
    while (i > 0 && i <= 100 && !balanced(i)) i = t.indexOf(br, i + 1); // never cut inside (…)
    if (i > 0 && i <= 100 && (cut < 0 || i < cut)) cut = i;
  }
  if (cut < 0) return { title: "", body: t };
  const rest = t.slice(cut).replace(/^[:;,—\s]+/, "");
  return { title: t.slice(0, cut).trim(), body: rest.charAt(0).toUpperCase() + rest.slice(1) };
}

const fmtDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return iso || "";
  // Local date — never toISOString.
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const itemsOf = (entry) => SECTIONS.flatMap((s) => (Array.isArray(entry[s.key]) ? entry[s.key] : []).map((text) => ({ section: s, text })));

const countsLine = (entry) => {
  const parts = SECTIONS.map((s) => {
    const n = Array.isArray(entry[s.key]) ? entry[s.key].length : 0;
    if (!n) return null;
    const noun = s.key === "added" ? (n === 1 ? "addition" : "additions") : s.key === "fixed" ? (n === 1 ? "fix" : "fixes") : (n === 1 ? "change" : "changes");
    return `${n} ${noun}`;
  }).filter(Boolean);
  if (!parts.length) return "";
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
};

function CountChips({ entry }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {SECTIONS.map((s) => {
        const n = Array.isArray(entry[s.key]) ? entry[s.key].length : 0;
        if (!n) return null;
        return (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: s.color, background: s.dim, border: `1px solid ${s.border}`, whiteSpace: "nowrap" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, boxShadow: `0 0 6px ${s.color}`, display: "inline-block" }} />
            {n} {s.label.toLowerCase()}
          </span>
        );
      })}
    </div>
  );
}

function ChangeCard({ section: s, text, hero }) {
  const { title, body } = splitItem(text);
  return (
    <div style={{
      gridColumn: hero ? "1 / -1" : undefined,
      display: "flex", flexDirection: hero ? "row" : "column", alignItems: hero ? "flex-start" : "stretch", gap: hero ? 22 : 8,
      padding: hero ? "18px 20px" : "13px 14px 14px", borderRadius: 12, minHeight: hero ? 0 : 104,
      background: `linear-gradient(180deg, ${s.dim}, rgba(var(--lift),0.015) 70%)`, border: `1px solid ${s.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: s.color, flexShrink: 0, width: hero ? 96 : "auto", paddingTop: hero ? 5 : 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, boxShadow: `0 0 6px ${s.color}`, display: "inline-block" }} />
        {s.label}
      </div>
      <div style={{ minWidth: 0 }}>
        {title && <div style={{ fontSize: hero ? 17 : 13.5, fontWeight: 700, lineHeight: 1.3, letterSpacing: "-0.005em", color: T.text }}>{title}</div>}
        {body && (
          <div style={{ fontSize: hero ? 13 : title ? 12 : 12.5, lineHeight: 1.5, color: title ? T.textSecondary : T.text, fontWeight: title ? 400 : 500, marginTop: title ? 6 : 0, maxWidth: hero ? "70ch" : undefined }}>{body}</div>
        )}
      </div>
    </div>
  );
}

function NotesOverlay({ kicker, entries, intro, buttonLabel, onClose }) {
  const [idx, setIdx] = useState(0);
  const list = entries || [];
  const showRail = list.length > 1;
  const entry = list[Math.min(idx, Math.max(0, list.length - 1))];

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (!showRail) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(list.length - 1, i + 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showRail, list.length, onClose]);

  if (!entry) return null;
  const items = itemsOf(entry);
  const hero = items.length === 1;
  const gridCols = items.length <= 2 ? `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` : "repeat(auto-fill, minmax(260px, 1fr))";

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(var(--shade),calc(0.85 * var(--shadeK)))", backdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: T.surface, borderRadius: T.radius.xl, maxWidth: 1040, width: "min(96vw, 1040px)", maxHeight: "85vh", border: `1px solid ${T.accentBorder}`, boxShadow: "0 24px 80px rgba(139,92,246,0.2)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {showRail && (
            <div style={{ width: 210, flexShrink: 0, borderRight: `1px solid ${T.border}`, padding: "14px 10px", overflowY: "auto", background: "rgba(var(--lift),0.012)" }}>
              <div style={{ color: T.textTertiary, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", padding: "0 10px 10px" }}>Releases</div>
              {list.map((e, i) => {
                const on = i === idx;
                const bars = itemsOf(e);
                return (
                  <div key={e.version} onClick={() => setIdx(i)} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 2, padding: "9px 12px 9px 26px", borderRadius: 10, cursor: "pointer", marginBottom: 2, background: on ? T.accentDim : "transparent", border: `1px solid ${on ? T.accentBorder : "transparent"}` }}>
                    <span style={{ position: "absolute", left: 10, top: 15, width: 7, height: 7, borderRadius: "50%", background: on ? T.accentLight : T.textMuted, boxShadow: on ? `0 0 8px ${T.accentLight}` : "none" }} />
                    <span style={{ color: T.text, fontSize: 12.5, fontWeight: 700 }}>{e.version}</span>
                    <span style={{ fontSize: 10.5, color: T.textTertiary }}>{fmtDate(e.date)}{i === 0 ? " · Latest" : ""}</span>
                    <span style={{ display: "flex", gap: 4, marginTop: 3 }}>
                      {bars.slice(0, 8).map((b, j) => <span key={j} style={{ width: 14, height: 3, borderRadius: 2, background: b.section.color, display: "inline-block" }} />)}
                      {bars.length > 8 && <span style={{ fontSize: 9, color: T.textTertiary, lineHeight: "3px" }}>+{bars.length - 8}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, padding: "22px 28px 18px", background: `linear-gradient(135deg, ${T.accentDim}, transparent 55%), ${T.accentGlow}`, borderBottom: `1px solid ${T.accentBorder}`, flexShrink: 0 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: T.accentLight, fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>{kicker}</div>
                <div style={{ color: T.text, fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.05, marginTop: 6 }}>
                  {entry.version}
                  {entry.date && <span style={{ fontSize: 13, fontWeight: 600, color: T.textTertiary, marginLeft: 10, letterSpacing: 0 }}>{fmtDate(entry.date)}</span>}
                </div>
                <div style={{ color: T.textSecondary, fontSize: 12.5, marginTop: 6 }}>{intro ? intro(entry, list) : countsLine(entry)}</div>
              </div>
              <CountChips entry={entry} />
            </div>

            <div style={{ overflowY: "auto", padding: "16px 22px 20px", flex: 1 }}>
              <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 10 }}>
                {items.map((it, i) => <ChangeCard key={`${entry.version}-${it.section.key}-${i}`} section={it.section} text={it.text} hero={hero} />)}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 22px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
              <span style={{ color: T.textTertiary, fontSize: 11.5 }}>{showRail ? "↑ ↓ to move between releases" : "Re-read any time in Settings → About"}</span>
              <button
                onClick={onClose}
                style={{ background: T.accent, color: "#fff", border: "none", padding: "9px 22px", borderRadius: T.radius.md, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}
              >
                {buttonLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WhatsNewModal() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!window.clipflow?.whatsNewGet) return;
    window.clipflow.whatsNewGet().then((r) => {
      if (r?.show) setInfo(r);
    }).catch(() => {});
  }, []);

  if (!info) return null;

  const close = () => {
    window.clipflow?.whatsNewAck?.().catch(() => {});
    setInfo(null);
  };

  // Several versions missed: say so on the newest, and let the rail do the rest.
  const intro = (entry, list) => {
    const base = countsLine(entry);
    if (list.length > 1 && entry === list[0]) {
      const skipped = list.length - 1;
      return `${base ? base + " · " : ""}${skipped} earlier update${skipped === 1 ? "" : "s"} you haven't seen yet — pick one on the left.`;
    }
    return base ? `${base} in this update.` : "";
  };

  return (
    <NotesOverlay
      kicker="Corva updated"
      entries={info.entries}
      intro={intro}
      buttonLabel="Got it"
      onClose={close}
    />
  );
}

// #339: Settings → About → "View release history". Self-fetching so callers
// only manage an open flag. Closing never acks.
export function ReleaseHistoryModal({ onClose }) {
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    if (!window.clipflow?.whatsNewGetAll) { setEntries([]); return; }
    window.clipflow.whatsNewGetAll().then((r) => {
      setEntries(Array.isArray(r?.entries) ? r.entries : []);
    }).catch(() => setEntries([]));
  }, []);

  if (!entries) return null;

  return (
    <NotesOverlay
      kicker="Release history"
      entries={entries}
      buttonLabel="Close"
      onClose={onClose}
    />
  );
}
