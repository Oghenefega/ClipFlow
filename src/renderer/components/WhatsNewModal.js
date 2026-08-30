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
const SECTIONS = [
  { key: "added", label: "Added", color: T.green },
  { key: "changed", label: "Changed", color: T.accentLight },
  { key: "fixed", label: "Fixed", color: T.orange },
];

function NotesOverlay({ kicker, title, entries, showVersionHeaders, buttonLabel, onClose }) {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(var(--shade),calc(0.85 * var(--shadeK)))", backdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: T.surface, borderRadius: T.radius.xl, maxWidth: 520, width: "100%", maxHeight: "80vh", border: `1px solid ${T.accentBorder}`, boxShadow: "0 24px 80px rgba(139,92,246,0.2)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ background: T.accentGlow, padding: "22px 28px 18px", borderBottom: `1px solid ${T.accentBorder}`, flexShrink: 0 }}>
          <div style={{ color: T.accentLight, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{kicker}</div>
          <div style={{ color: T.text, fontSize: 20, fontWeight: 700, marginTop: 4 }}>{title}</div>
        </div>

        <div style={{ padding: "20px 28px", overflowY: "auto" }}>
          {entries.map((entry, i) => (
            <div key={entry.version} style={{ marginBottom: i < entries.length - 1 ? 26 : 0 }}>
              {(showVersionHeaders || entries.length > 1) && (
                <div style={{ color: T.textSecondary, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                  {entry.version}{entry.date ? ` · ${entry.date}` : ""}
                </div>
              )}
              {SECTIONS.filter((s) => Array.isArray(entry[s.key]) && entry[s.key].length > 0).map((s) => (
                <div key={s.key} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, boxShadow: `0 0 6px ${s.color}`, flexShrink: 0 }} />
                    <span style={{ color: s.color, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{s.label}</span>
                  </div>
                  {entry[s.key].map((item, j) => (
                    <div key={j} style={{ color: T.textSecondary, fontSize: 13, lineHeight: 1.55, padding: "3px 0 3px 15px" }}>
                      {item}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ padding: "16px 28px", borderTop: `1px solid ${T.border}`, flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ background: T.accent, color: "#fff", border: "none", padding: "10px 24px", borderRadius: T.radius.md, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}
          >
            {buttonLabel}
          </button>
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

  return (
    <NotesOverlay
      kicker="Corva updated"
      title={`What's new in ${info.current}`}
      entries={info.entries}
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
      kicker="Corva"
      title="Release history"
      entries={entries}
      showVersionHeaders
      buttonLabel="Close"
      onClose={onClose}
    />
  );
}
