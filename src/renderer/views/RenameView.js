import React, { useState, useEffect, useRef, useCallback } from "react";
import T from "../styles/theme";
import { PulseDot, GamePill, Card, SectionLabel, InfoBanner, TabBar, Select, MiniSpinbox, Checkbox, formatDuration, toFileUrl } from "../components/shared";
import ThumbnailScrubber from "../components/ThumbnailScrubber";
import TestChip from "../components/TestChip";

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

const IcFolder = <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M1.5 4.5a1 1 0 0 1 1-1h3l1.5 2h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1z" /></svg>;
const IcSplit = <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="4" cy="4.5" r="2" /><circle cx="4" cy="11.5" r="2" /><path d="M5.7 5.6 14 12M5.7 10.4 14 4" /></svg>;
const IcHide = <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" /><path d="M3 13 13 3" /></svg>;

const THUMB_H = 56;
const PEEK_W = 240;

// Floating batch bar shell — same glass treatment as the Recordings action
// cluster (#123), bottom-centered. bottom:72 clears the 56px bottom nav.
const BAR_SHELL = {
  position: "fixed", left: "50%", bottom: 72, zIndex: 90,
  transform: "translateX(-50%)",
  display: "flex", alignItems: "center", gap: 10,
  padding: "9px 12px", borderRadius: T.radius.lg,
  background: "rgba(22,23,31,0.92)", backdropFilter: "blur(14px)",
  border: `1px solid ${T.borderHover}`, boxShadow: "0 10px 32px rgba(0,0,0,0.5)",
  animation: "cfrBarUp 0.18s ease-out",
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

// Hover-scrub thumbnail: small native-aspect handle in the row, full-size
// fixed-position peek with a timestamp badge while scrubbing. Static <img>
// frames only — no <video>, no timers.
function HoverScrubThumb({ frames, loading, durationSeconds }) {
  const [idx, setIdx] = useState(0);
  const [frac, setFrac] = useState(0);
  const [hover, setHover] = useState(false);
  const [aspect, setAspect] = useState(null); // naturalWidth / naturalHeight of the frames
  const [peekPos, setPeekPos] = useState(null);
  const ref = useRef(null);

  const width = aspect ? Math.max(32, Math.min(100, Math.round(THUMB_H * aspect))) : 50;
  const peekH = aspect ? Math.max(96, Math.min(270, Math.round(PEEK_W / aspect))) : 270;

  const containerStyle = {
    width, height: THUMB_H, borderRadius: 6, overflow: "hidden",
    background: "#0d0e14", border: `1px solid ${T.border}`,
    flexShrink: 0, position: "relative", cursor: "pointer",
  };

  if (loading) {
    return <div style={{ ...containerStyle, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: T.textMuted, fontSize: 9 }}>…</span></div>;
  }
  if (!frames || frames.length === 0) {
    return <div style={{ ...containerStyle, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 14, opacity: 0.3 }}>🎬</span></div>;
  }

  const onMove = (e) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const f = Math.max(0, Math.min(0.999, (e.clientX - rect.left) / rect.width));
    setFrac(f);
    setIdx(Math.min(frames.length - 1, Math.floor(f * frames.length)));
    const fitsRight = rect.right + 14 + PEEK_W < window.innerWidth;
    const left = fitsRight ? rect.right + 14 : rect.left - PEEK_W - 14;
    const top = Math.max(10, Math.min(rect.top + rect.height / 2 - peekH / 2, window.innerHeight - peekH - 10));
    setPeekPos({ left, top });
  };

  const ts = frames[idx]?.timestampSeconds != null ? frames[idx].timestampSeconds : frac * (durationSeconds || 0);

  return (
    <div
      ref={ref}
      style={containerStyle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setIdx(0); setFrac(0); setPeekPos(null); }}
      onMouseMove={onMove}
    >
      {/* all frames stay mounted (decoded) so scrubbing never flickers */}
      {frames.map((fr, i) => (
        <img
          key={fr.path}
          src={toFileUrl(fr.path)}
          alt=""
          draggable={false}
          onLoad={i === 0 ? (e) => { const el = e.currentTarget; if (el.naturalWidth && el.naturalHeight) setAspect((prev) => prev || el.naturalWidth / el.naturalHeight); } : undefined}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: i === idx ? 1 : 0 }}
        />
      ))}
      {/* position tick */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, background: "rgba(255,255,255,0.12)" }}>
        <div style={{ height: "100%", width: "25%", background: T.accentLight, transform: `translateX(${frac * 300}%)`, transition: "transform 0.05s linear" }} />
      </div>
      {/* full-size peek pop-out (flips left near the screen edge) */}
      {hover && peekPos && (
        <div style={{ position: "fixed", left: peekPos.left, top: peekPos.top, width: PEEK_W, height: peekH, zIndex: 95, borderRadius: 12, border: `1px solid ${T.borderHover}`, boxShadow: "0 14px 44px rgba(0,0,0,0.65)", overflow: "hidden", pointerEvents: "none", background: "#0d0e14" }}>
          <img src={toFileUrl(frames[idx].path)} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <span style={{ position: "absolute", right: 8, top: 8, fontSize: 10.5, fontWeight: 700, background: "rgba(0,0,0,0.55)", borderRadius: 5, padding: "2px 7px", color: "#fff" }}>{fmtClock(ts)}</span>
          <div style={{ position: "absolute", left: 10, right: 10, bottom: 8, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.18)" }}>
            <div style={{ height: "100%", width: "25%", borderRadius: 2, background: T.accentLight, transform: `translateX(${frac * 300}%)` }} />
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

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const current = PRESET_LIST.find((p) => p.id === presetId);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <span
        onClick={() => setOpen(!open)}
        title="Naming format for every file in this session"
        style={{ fontSize: 11, color: T.textSecondary, border: `1px dashed ${T.borderHover}`, borderRadius: 8, padding: "4px 10px", cursor: "pointer", whiteSpace: "nowrap" }}
      >{current ? current.label : "Mixed formats"} ▾</span>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 999, width: "max-content",
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)", padding: 4, maxHeight: 280, overflowY: "auto",
        }}>
          {PRESET_LIST.map((p) => {
            const isActive = presetId === p.id;
            return (
              <div
                key={p.id}
                onClick={() => { onChange(p.id); setOpen(false); }}
                style={{
                  padding: "8px 12px", borderRadius: 6, cursor: "pointer",
                  background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                  borderLeft: isActive ? `3px solid ${T.accent}` : "3px solid transparent",
                  marginBottom: 2,
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ color: isActive ? T.accentLight : T.text, fontSize: 13, fontWeight: 600 }}>{p.label}</div>
                <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2, fontFamily: T.mono }}>{p.example}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PresetNamePicker({ rename, presets, currentPreset, getProposed, onPresetChange, color }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const c = color || T.yellow;

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const currentName = getProposed(rename);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <span
        onClick={() => setOpen(!open)}
        style={{ color: c, fontSize: 14, fontWeight: 700, fontFamily: T.mono, whiteSpace: "nowrap", cursor: "pointer", borderBottom: `1px dashed ${c}55`, paddingBottom: 1 }}
        title="Click to change naming format"
      >{currentName}</span>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 999, width: "max-content",
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)", padding: 4, maxHeight: 280, overflowY: "auto",
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
                  background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                  borderLeft: isActive ? `3px solid ${c}` : "3px solid transparent",
                  marginBottom: 2,
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ color: isActive ? c : T.text, fontSize: 13, fontWeight: 600, fontFamily: T.mono }}>{previewName}</div>
                <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2 }}>{p.label}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function RenameView({ gamesDb, mainGameName, pendingRenames, setPendingRenames, renameHistory, setRenameHistory, onAddGame, onGameDayUpdate, watchFolder, testWatchFolder }) {
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

  // Game-switch scrubber state
  // scrubberOpen: { [fileId]: true } — which files have scrubber expanded
  // scrubberMarkers: { [fileId]: [{timeSeconds, gameBefore, gameAfter}] }
  // scrubberThumbs: { [fileId]: {thumbnails, duration} }
  // scrubberLoading: { [fileId]: true }
  const [scrubberOpen, setScrubberOpen] = useState({});
  const [scrubberMarkers, setScrubberMarkers] = useState({});
  const [scrubberThumbs, setScrubberThumbs] = useState({});
  const [scrubberLoading, setScrubberLoading] = useState({});

  // Drag-and-drop state
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(null); // { filename, pct }

  // Preview frames state: { [fileId]: { frames: [{path, timestampSeconds}], loading: bool } }
  const [previewFrames, setPreviewFrames] = useState({});
  const previewRequested = useRef(new Set());

  // #172: session-ledger selection state
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const lastClickedRef = useRef(null); // anchor for shift-click range select
  const gameMenuRef = useRef(null);
  const rootRef = useRef(null);

  // Remember last renamed game for auto-selecting on new files
  const lastRenamedGame = useRef(null);

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

  // File watcher integration
  useEffect(() => {
    if (!isElectron || !watchFolder) return; // #167: no folder yet (pre-load) — don't scan
    window.clipflow.startWatching(watchFolder);
    window.clipflow.onFileAdded((file) => {
      setPendingRenames((prev) => {
        if (prev.find((p) => p.filePath === file.path)) return prev;
        const detected = detectGame(file.name, gamesDb, prev);
        // If user recently renamed a file, default new files to that game
        let game = detected.game, tag = detected.tag, color = detected.color, day = detected.day;
        if (lastRenamedGame.current) {
          const lastGame = gamesDb.find((g) => g.name === lastRenamedGame.current);
          if (lastGame) {
            game = lastGame.name; tag = lastGame.tag; color = lastGame.color;
            day = (lastGame.dayCount || 0) + 1;
          }
        }
        return [...prev, {
          id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fileName: file.name, filePath: file.path,
          game, tag, color,
          day, part: detected.part,
          preset: defaultPreset,
          customLabel: "",
          createdAt: file.createdAt,
          isTest: false,
        }];
      });
    });
    return () => { window.clipflow.removeFileListeners(); };
  }, [watchFolder, isElectron, gamesDb, defaultPreset]);

  // Test file watcher integration (separate chokidar instance, separate IPC events)
  useEffect(() => {
    if (!isElectron || !testWatchFolder) return;
    window.clipflow.startTestWatching(testWatchFolder);
    window.clipflow.onTestFileAdded((file) => {
      setPendingRenames((prev) => {
        if (prev.find((p) => p.filePath === file.path)) return prev;
        const detected = detectGame(file.name, gamesDb, prev);
        let game = detected.game, tag = detected.tag, color = detected.color, day = detected.day;
        if (lastRenamedGame.current) {
          const lastGame = gamesDb.find((g) => g.name === lastRenamedGame.current);
          if (lastGame) {
            game = lastGame.name; tag = lastGame.tag; color = lastGame.color;
            day = (lastGame.dayCount || 0) + 1;
          }
        }
        return [...prev, {
          id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fileName: file.name, filePath: file.path,
          game, tag, color,
          day, part: detected.part,
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

  // Probe duration for new pending files (auto-split detection)
  useEffect(() => {
    if (!isElectron || !autoSplitEnabled) return;
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
        const splitCount = dur > thresholdSec && (tailLength === 0 || tailLength >= MIN_TAIL) ? Math.ceil(dur / thresholdSec) : 0;
        setSplitInfo((prev) => ({
          ...prev,
          [r.id]: { durationSeconds: dur, splitCount, probing: false, skipSplit: false },
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

  // Recalculate split counts when threshold changes
  useEffect(() => {
    setSplitInfo((prev) => {
      const updated = {};
      for (const [id, info] of Object.entries(prev)) {
        if (!info.durationSeconds) { updated[id] = info; continue; }
        const thresholdSec = splitThreshold * 60;
        const MIN_TAIL = 120;
        const tailLength = info.durationSeconds % thresholdSec;
        const splitCount = info.durationSeconds > thresholdSec && (tailLength === 0 || tailLength >= MIN_TAIL) ? Math.ceil(info.durationSeconds / thresholdSec) : 0;
        updated[id] = { ...info, splitCount };
      }
      return updated;
    });
  }, [splitThreshold]);

  // Load history from SQLite when History tab is opened
  useEffect(() => {
    if (subTab !== "history" || !isElectron) return;
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

  // Recalculate pending PART numbers once dbManagedFiles loads from SQLite.
  const managedLoaded = useRef(false);
  useEffect(() => {
    if (dbManagedFiles.length === 0 || managedLoaded.current) return;
    managedLoaded.current = true;

    setPendingRenames((prev) => {
      if (prev.length === 0) return prev;
      const updated = [];
      for (const r of prev) {
        const fileDate = r.fileName.slice(0, 10);
        const existingParts = [
          ...dbManagedFiles.filter((f) => f.tag === r.tag && f.date === fileDate && f.day_number === r.day).map((f) => f.part_number).filter(Boolean),
          ...renameHistory.filter((h) => !h.undone && h.tag === r.tag && h.newName?.startsWith(fileDate)).map((h) => h.part),
          ...updated.filter((p) => p.tag === r.tag && p.fileName.slice(0, 10) === fileDate && p.day === r.day).map((p) => p.part),
        ];
        const part = existingParts.length > 0 ? Math.max(...existingParts) + 1 : 1;
        updated.push({ ...r, part });
      }
      return updated;
    });
  }, [dbManagedFiles]);

  // Recalculate pending DAY numbers when gamesDb changes
  const prevGamesRef = useRef(null);
  useEffect(() => {
    const isFirstMount = !prevGamesRef.current;
    if (!isFirstMount) {
      const changed = gamesDb.some((g) => {
        const prev = prevGamesRef.current.find((p) => p.tag === g.tag);
        return prev && (prev.dayCount !== g.dayCount || prev.lastDayDate !== g.lastDayDate);
      });
      if (!changed) { prevGamesRef.current = gamesDb; return; }
    }
    prevGamesRef.current = gamesDb;

    setPendingRenames((prev) => {
      if (prev.length === 0) return prev;
      const updated = [];
      for (const r of prev) {
        const game = gamesDb.find((g) => g.tag === r.tag);
        if (!game) { updated.push(r); continue; }
        const detected = detectForGame(game, r.fileName, updated.filter((p) => p.tag === r.tag));
        updated.push({ ...r, day: detected.day, part: detected.part });
      }
      return updated;
    });
  }, [gamesDb]);

  // ============ DAY DETECTION ============
  const detectGame = (fileName, games, currentPending) => {
    const game = games.find((g) => g.name === mainGameName) || games[0] || { name: "Unknown", tag: "??", color: "#888", dayCount: 0 };
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

  // ============ SPLIT HELPERS ============
  const getSplitPreview = (r) => {
    const info = splitInfo[r.id];
    if (!info || !info.splitCount || info.skipSplit) return null;
    const thresholdSec = splitThreshold * 60;
    const parts = [];
    for (let i = 0; i < info.splitCount; i++) {
      const start = i * thresholdSec;
      const end = Math.min((i + 1) * thresholdSec, info.durationSeconds);
      parts.push({ start, end, partNumber: i + 1 });
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

  // Per-row field update (game changes go through setGameForRows, which
  // re-derives day/part for every affected game)
  const updatePending = (id, field, value) => {
    setPendingRenames((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  // #172: assign a game to a set of rows (session header picker or the batch
  // bar's Set Game), then re-derive day/part chronologically for every row of
  // the affected games — rows leaving a game free up parts, rows joining take
  // the next ones. Untouched games keep any manual tweaks.
  const setGameForRows = (ids, gameName) => {
    const g = gamesDb.find((x) => x.name === gameName);
    if (!g) return;
    const idSet = new Set(ids);
    setPendingRenames((prev) => {
      const affectedTags = new Set([g.tag]);
      prev.forEach((r) => { if (idSet.has(r.id)) affectedTags.add(r.tag); });
      const assigned = prev.map((r) => (idSet.has(r.id) ? { ...r, game: g.name, tag: g.tag, color: g.color } : r));
      const sorted = [...assigned].sort((a, b) => a.fileName.localeCompare(b.fileName));
      const done = [];
      const byId = {};
      for (const r of sorted) {
        const game = affectedTags.has(r.tag) ? gamesDb.find((x) => x.tag === r.tag) : null;
        if (!game) { done.push(r); continue; }
        const det = detectForGame(game, r.fileName, done);
        const nr = { ...r, day: det.day, part: det.part };
        byId[r.id] = nr;
        done.push(nr);
      }
      return assigned.map((r) => byId[r.id] || r);
    });
  };

  const setDayForRows = (ids, day) => {
    const idSet = new Set(ids);
    setPendingRenames((prev) => prev.map((r) => (idSet.has(r.id) ? { ...r, day } : r)));
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
      const result = await window.clipflow.renameFile(r.filePath, newPath);
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

  // Helper: split a file then rename all children
  const splitAndRename = async (r, preset, fileDate) => {
    const info = splitInfo[r.id];
    if (!info || !info.splitCount) return null;

    const thresholdSec = splitThreshold * 60;
    const game = gamesDb.find((g) => g.tag === r.tag);

    // First, create a parent file_metadata record so split:execute can find it
    const targetDir = resolveTargetDir(r);

    // Rename source to monthly subfolder first
    const tempName = r.fileName; // keep original name for now
    const parentPath = `${targetDir}\\${tempName}`;
    const moveResult = await window.clipflow.renameFile(r.filePath, parentPath);
    if (moveResult.error) { console.error("Move to subfolder failed:", moveResult.error); return null; }

    const parentResult = await window.clipflow.fileMetadataCreate({
      originalFilename: r.fileName,
      currentFilename: tempName,
      originalPath: r.filePath,
      currentPath: parentPath,
      tag: r.tag,
      entryType: game?.entryType || "game",
      date: fileDate,
      dayNumber: PRESETS_USING_DAY.has(preset) ? r.day : null,
      partNumber: null,
      customLabel: r.customLabel || null,
      namingPreset: preset,
      durationSeconds: info.durationSeconds,
      status: "pending",
      isTest: r.isTest || false,
    });

    if (!parentResult?.id) { console.error("Failed to create parent metadata"); return null; }

    // Build split points
    const splitPoints = [];
    for (let i = 0; i < info.splitCount; i++) {
      const start = i * thresholdSec;
      const end = Math.min((i + 1) * thresholdSec, info.durationSeconds);
      splitPoints.push({
        startSeconds: start,
        endSeconds: end,
        tag: r.tag,
        entryType: game?.entryType || "game",
        partNumber: i + 1,
      });
    }

    setSplitProgress({ fileId: r.id, current: 0, total: info.splitCount });

    const splitResult = await window.clipflow.splitExecute(parentResult.id, splitPoints);
    if (splitResult.error) {
      console.error("Split failed:", splitResult.error);
      setSplitProgress(null);
      return null;
    }

    // Now rename each child file using the preset engine with part numbers
    const renamedChildren = [];
    for (let i = 0; i < splitResult.results.length; i++) {
      const child = splitResult.results[i];
      const partNum = i + 1;
      setSplitProgress({ fileId: r.id, current: i + 1, total: info.splitCount });

      const childMeta = {
        tag: r.tag,
        date: fileDate,
        dayNumber: PRESETS_USING_DAY.has(preset) ? r.day : null,
        partNumber: partNum,
        customLabel: r.customLabel || null,
        originalFilename: r.fileName,
      };

      const fmtResult = await window.clipflow.presetFormatFilename(childMeta, preset);
      if (fmtResult.error) continue;

      const childNewName = fmtResult.filename;
      const childNewPath = `${targetDir}\\${childNewName}`;

      // Rename the temp split file
      const renResult = await window.clipflow.renameFile(child.filePath, childNewPath);
      if (renResult.error) continue;

      // Update the child metadata record
      await window.clipflow.fileMetadataUpdate(child.childId, {
        current_filename: childNewName,
        current_path: childNewPath,
        part_number: partNum,
        day_number: PRESETS_USING_DAY.has(preset) ? r.day : null,
      });

      renamedChildren.push({ newName: childNewName, partNumber: partNum });
    }

    // Record label usage
    if (PRESETS_USING_LABEL.has(preset) && r.customLabel) {
      await window.clipflow.labelRecord(r.tag, r.customLabel);
    }

    setSplitProgress(null);
    return renamedChildren;
  };

  // ============ GAME-SWITCH SCRUBBER ============
  const toggleScrubber = async (fileId, filePath) => {
    if (scrubberOpen[fileId]) {
      // Close scrubber and clean up thumbnails
      setScrubberOpen((prev) => { const n = { ...prev }; delete n[fileId]; return n; });
      if (isElectron && filePath) window.clipflow.cleanupThumbnails(filePath);
      setScrubberThumbs((prev) => { const n = { ...prev }; delete n[fileId]; return n; });
      setScrubberMarkers((prev) => { const n = { ...prev }; delete n[fileId]; return n; });
      return;
    }

    // Open scrubber — generate thumbnails
    setScrubberOpen((prev) => ({ ...prev, [fileId]: true }));
    setScrubberLoading((prev) => ({ ...prev, [fileId]: true }));

    if (isElectron) {
      try {
        console.log("[Scrubber] Generating thumbnails for:", filePath);
        const result = await window.clipflow.generateThumbnails(filePath);
        console.log("[Scrubber] Result:", result.error || `${result.thumbnails?.length} thumbnails`);
        if (result.error) {
          console.error("Thumbnail generation failed:", result.error);
          setScrubberOpen((prev) => { const n = { ...prev }; delete n[fileId]; return n; });
        } else {
          setScrubberThumbs((prev) => ({ ...prev, [fileId]: { thumbnails: result.thumbnails, duration: result.duration } }));
        }
      } catch (err) {
        console.error("Thumbnail generation failed:", err);
        setScrubberOpen((prev) => { const n = { ...prev }; delete n[fileId]; return n; });
      } finally {
        setScrubberLoading((prev) => { const n = { ...prev }; delete n[fileId]; return n; });
      }
    } else {
      setScrubberLoading((prev) => { const n = { ...prev }; delete n[fileId]; return n; });
    }
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

    const thumbData = scrubberThumbs[r.id];
    if (!thumbData) return null;

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
      endSeconds: thumbData.duration,
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
      durationSeconds: thumbData.duration,
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
            entryType: segGame?.entryType || "game",
            partNumber: subCount > 1 ? (j + 1) : null,
          });
        }
      } else {
        allSplitPoints.push({
          startSeconds: seg.startSeconds,
          endSeconds: seg.endSeconds,
          tag: seg.gameTag,
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
        dayNumber: PRESETS_USING_DAY.has(preset) ? r.day : null,
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
        day_number: PRESETS_USING_DAY.has(preset) ? r.day : null,
      });

      const segGame = gamesDb.find((g) => g.tag === sp.tag);
      renamedChildren.push({
        newName: childNewName,
        partNumber: sp.partNumber,
        tag: sp.tag,
        color: segGame?.color || r.color,
        game: segGame?.name || r.game,
      });
    }

    // Record label usage
    if (PRESETS_USING_LABEL.has(preset) && r.customLabel) {
      await window.clipflow.labelRecord(r.tag, r.customLabel);
    }

    // Clean up scrubber thumbnails
    if (isElectron && r.filePath) window.clipflow.cleanupThumbnails(r.filePath);
    setScrubberOpen((prev) => { const n = { ...prev }; delete n[r.id]; return n; });
    setScrubberThumbs((prev) => { const n = { ...prev }; delete n[r.id]; return n; });
    setScrubberMarkers((prev) => { const n = { ...prev }; delete n[r.id]; return n; });

    setSplitProgress(null);
    return renamedChildren;
  };

  const hideOne = (id) => {
    // Clean up scrubber if open
    const r = pendingRenames.find((x) => x.id === id);
    if (r && scrubberOpen[id] && isElectron && r.filePath) {
      window.clipflow.cleanupThumbnails(r.filePath);
    }
    setScrubberOpen((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setScrubberMarkers((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setScrubberThumbs((prev) => { const n = { ...prev }; delete n[id]; return n; });
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
              game: c.game || r.game, tag: c.tag || r.tag, color: c.color || r.color, day: r.day,
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
              id: `h-${Date.now()}-${r.id}-${c.partNumber}`, oldName: r.fileName, newName: c.newName,
              game: r.game, tag: r.tag, color: r.color, day: r.day,
              part: c.partNumber, time, undone: false, isTest: !!r.isTest,
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
    setScrubberOpen((prev) => drop(prev));
    setScrubberMarkers((prev) => drop(prev));
    setScrubberThumbs((prev) => drop(prev));
    setScrubberLoading((prev) => drop(prev));
    setPendingRenames((prev) => prev.filter((x) => !renamedIds.has(x.id)));

    // Remember the last renamed game for auto-selecting on future files
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (renamedIds.has(sorted[i].id)) { lastRenamedGame.current = sorted[i].game; break; }
    }

    setRenaming(false);
    if (renamedIds.size > 0 && pendingRenames.every((x) => renamedIds.has(x.id))) {
      setRenameDone(true);
      setTimeout(() => setRenameDone(false), 3000);
    }
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
      // add event a few seconds later dedupes on filePath.
      if (result.restoredPath) {
        setPendingRenames((prev) => {
          if (prev.find((p) => p.filePath === result.restoredPath)) return prev;
          return [...prev, {
            id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            fileName: h.oldName, filePath: result.restoredPath,
            game: h.game, tag: h.tag, color: h.color,
            day: h.day || 1, part: h.part || 1,
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
      window.clipflow.stopWatching().then(() => {
        window.clipflow.startWatching(watchFolder);
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
  const getGroupedGameOptions = () => {
    const games = gamesDb.filter((g) => !g.entryType || g.entryType === "game");
    const contentTypes = gamesDb.filter((g) => g.entryType === "content");

    const options = [];

    // Games header
    if (games.length > 0) {
      options.push({ value: "__header_games__", label: "Games", isHeader: true });
      games.forEach((g) => options.push({ value: g.name, label: g.name, tag: g.tag, color: g.color }));
    }

    // Content Types header
    if (contentTypes.length > 0) {
      options.push({ value: "__header_content__", label: "Content Types", isHeader: true });
      contentTypes.forEach((g) => options.push({ value: g.name, label: g.name, tag: g.tag, color: g.color }));
    }

    // If no entryType set yet (pre-migration), show all as flat list
    if (games.length === 0 && contentTypes.length === 0) {
      gamesDb.forEach((g) => options.push({ value: g.name, label: g.name, tag: g.tag, color: g.color }));
    }

    return options;
  };

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
    if (!file.name.toLowerCase().endsWith(".mp4")) {
      setRetroNotification("Only .mp4 files are supported");
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
    // (watcher is suppressed for this file)
    const detected = detectGame(result.filename, gamesDb, pendingRenames);
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

  return (
    <div
      ref={rootRef}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      style={{ position: "relative" }}
    >
      {/* #172: ledger row hover/selection states + batch bar entrance */}
      <style>{`
        @keyframes cfrBarUp { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .cfr-row:hover { background: ${T.surfaceHover}; }
        .cfr-row.rowsel { background: ${T.accentGlow}; }
        .cfr-row .cfr-acts { opacity: 0; transition: opacity 0.12s; }
        .cfr-row:hover .cfr-acts, .cfr-row.rowsel .cfr-acts { opacity: 1; }
        .cfr-iconbt { width: 26px; height: 26px; border-radius: 7px; border: 1px solid transparent; background: transparent; color: rgba(255,255,255,0.32); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex: none; padding: 0; }
        .cfr-iconbt:hover { color: ${T.text}; background: ${T.surfaceHover}; border-color: ${T.border}; }
        .cfr-iconbt:disabled { opacity: 0.35; cursor: default; }
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
            <div style={{ color: T.textMuted, fontSize: 12, fontWeight: 500, marginTop: 4 }}>.mp4 files only</div>
          </div>
        </div>
      )}

      {/* Import progress banner */}
      {importing && (
        <div style={{ padding: "10px 16px", borderRadius: T.radius.md, background: T.accentDim, border: `1px solid ${T.accentBorder}`, marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: T.accentLight, fontSize: 13, fontWeight: 600 }}>Importing {importing.filename}... {importing.pct}%</span>
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 2, background: T.accent, width: `${importing.pct}%`, transition: "width 0.3s ease" }} />
          </div>
        </div>
      )}

      {/* #172: slim header strip — replaces the old page header, WATCHING
          banner and 4 stat cards so pending files start ~200px higher */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${T.border}`, background: T.surface, borderRadius: T.radius.lg, padding: "10px 16px", marginBottom: 14 }}>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.2px", color: T.text, flexShrink: 0 }}>Rename</span>
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flex: 1 }} title={`Watching ${watchFolder}`}>
          <PulseDot size={7} />
          <span style={{ color: T.textSecondary, fontSize: 11.5, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{watchFolder}</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {[[totalRenamed, "total"], [pendingRenames.length, "pending"], [gamesDb.length, "games"]].map(([v, l]) => (
            <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: T.textSecondary, border: `1px solid ${T.border}`, borderRadius: 20, padding: "3px 10px", whiteSpace: "nowrap" }}>
              <b style={{ color: T.text, fontWeight: 700, fontSize: 12 }}>{v}</b> {l}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={refresh} disabled={refreshing} style={{ padding: "6px 12px", borderRadius: T.radius.md, border: `1px solid ${refreshing ? T.greenBorder : T.border}`, background: refreshing ? T.greenDim : "rgba(255,255,255,0.03)", color: refreshing ? T.green : T.textSecondary, fontSize: 12, fontWeight: 700, cursor: refreshing ? "default" : "pointer", fontFamily: T.font, transition: "all 0.3s ease" }}>{refreshing ? "✓ Refreshed" : "🔄 Refresh"}</button>
          <button onClick={onAddGame} style={{ padding: "6px 12px", borderRadius: T.radius.md, border: `1px solid ${T.accentBorder}`, background: T.accentDim, color: T.accentLight, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>+ Add Game</button>
        </div>
      </div>

      {/* Tabs */}
      <TabBar tabs={[{ id: "pending", label: "Pending", count: pendingRenames.length }, { id: "history", label: "History", count: renameHistory.length }, { id: "manage", label: "Manage" }]} active={subTab} onChange={setSubTab} />

      {/* Retroactive part notification */}
      {retroNotification && (
        <div style={{ margin: "12px 0", padding: "12px 16px", borderRadius: T.radius.md, background: T.yellowDim, border: `1px solid ${T.yellowBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <span style={{ color: T.yellow, fontSize: 13, fontWeight: 600 }}>{retroNotification}</span>
          <button onClick={() => setRetroNotification(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: T.textMuted, fontSize: 16, cursor: "pointer", padding: "2px 6px" }}>×</button>
        </div>
      )}

      {/* Content */}
      <div style={{ marginTop: 16 }}>
        {/* PENDING TAB — #172 session ledger */}
        {subTab === "pending" && (
          <>
            {pendingRenames.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 90 }}>
                {sessionGroups.map((grp) => {
                  const rowIds = grp.rows.map((r) => r.id);
                  const selCount = grp.rows.filter((r) => selectedIds.has(r.id)).length;
                  const headState = selCount === grp.rows.length ? "on" : selCount > 0 ? "half" : "off";
                  const samePreset = grp.rows.every((r) => (r.preset || defaultPreset) === (grp.rows[0].preset || defaultPreset));
                  const headPreset = samePreset ? (grp.rows[0].preset || defaultPreset) : null;
                  const firstWithPath = grp.rows.find((r) => r.filePath);
                  const knownDur = grp.rows.reduce((s, r) => s + (splitInfo[r.id]?.durationSeconds || 0), 0);
                  return (
                    <div key={grp.key} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.lg, background: T.surface, overflow: "hidden" }}>
                      {/* session header — owns everything the parts share */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderBottom: `1px solid ${T.border}` }}>
                        <LedgerCheck state={headState} onClick={() => toggleGroup(grp)} title="Select every file in this session" />
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: T.text, whiteSpace: "nowrap" }}>{fmtSessionDate(grp.date)}</span>
                        <GroupedSelect
                          value={grp.rows[0].game}
                          onChange={(v) => setGameForRows(rowIds, v)}
                          options={gameOptions}
                          renderSelected={(o) => <><GamePill tag={o.tag || grp.tag} color={o.color || grp.rows[0].color} size="sm" />{o.label}</>}
                          renderOption={(o) => <><GamePill tag={o.tag} color={o.color} size="sm" />{o.label}</>}
                          style={{ minWidth: 150 }}
                          borderColor={`${grp.rows[0].color}44`}
                        />
                        <MiniSpinbox compact label="Day" value={grp.rows[0].day} onChange={(v) => setDayForRows(rowIds, v)} />
                        <SessionPresetPicker presetId={headPreset} onChange={(v) => setPresetForRows(rowIds, v)} />
                        <span style={{ marginLeft: "auto", fontSize: 11.5, color: T.textTertiary, flexShrink: 0 }}>
                          {grp.rows.length} part{grp.rows.length === 1 ? "" : "s"}{knownDur > 0 ? ` · ${formatDuration(knownDur)}` : ""}
                        </span>
                        {firstWithPath && (
                          <button className="cfr-iconbt" title="Show session in Explorer" onClick={() => window.clipflow?.revealInFolder(firstWithPath.filePath)}>{IcFolder}</button>
                        )}
                      </div>
                      {/* rows — only what varies per file */}
                      <div>
                        {grp.rows.map((r, ri) => {
                          const preset = r.preset || defaultPreset;
                          const showLabel = PRESETS_USING_LABEL.has(preset);
                          const showPart = PRESETS_ALWAYS_PARTS.has(preset);
                          const info = splitInfo[r.id];
                          const hasSplit = info && info.splitCount > 0 && !info.skipSplit;
                          const splitSkipped = info && info.splitCount > 0 && info.skipSplit;
                          const preview = previewFrames[r.id];
                          const isSel = selectedIds.has(r.id);
                          const labelInvalid = showLabel && r.customLabel && /[\\/:*?"<>|]/.test(r.customLabel);
                          const splitParts = hasSplit ? getSplitPreview(r) : null;
                          const splitTitle = splitParts ? `Splits into ${splitParts.map((p) => `Pt${p.partNumber} ${fmtClock(p.start)}–${fmtClock(p.end)}`).join(", ")}. Click to keep as one file.` : "";
                          return (
                            <React.Fragment key={r.id}>
                              <div className={`cfr-row${isSel ? " rowsel" : ""}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 14px", borderTop: ri === 0 ? "none" : `1px solid ${T.border}` }}>
                                <LedgerCheck state={isSel ? "on" : "off"} onClick={(e) => toggleRow(r.id, e)} />
                                <HoverScrubThumb frames={preview?.frames || []} loading={!!preview?.loading} durationSeconds={info?.durationSeconds} />
                                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 11.5, color: T.textTertiary, fontFamily: T.mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1, maxWidth: 170 }} title={r.fileName}>{r.fileName}</span>
                                  <TestChip isTest={!!r.isTest} onToggle={(next) => updatePending(r.id, "isTest", next)} />
                                  <span style={{ color: T.textMuted, fontSize: 11, flexShrink: 0 }}>→</span>
                                  <PresetNamePicker
                                    rename={r}
                                    presets={PRESET_LIST}
                                    currentPreset={preset}
                                    getProposed={getProposed}
                                    onPresetChange={(v) => updatePending(r.id, "preset", v)}
                                    color={r.color}
                                  />
                                  {info && info.probing && <span style={{ fontSize: 10.5, color: T.textMuted, flexShrink: 0 }}>probing…</span>}
                                  {hasSplit && (
                                    <span onClick={() => toggleSkipSplit(r.id)} title={splitTitle} style={{ fontSize: 10.5, color: T.accentLight, background: T.accentDim, border: `1px solid ${T.accentBorder}`, borderRadius: 5, padding: "1px 7px", flexShrink: 0, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                                      {fmtClock(info.durationSeconds)} · splits into {info.splitCount}
                                    </span>
                                  )}
                                  {splitSkipped && (
                                    <span onClick={() => toggleSkipSplit(r.id)} title="Auto-split is off for this file — click to split it again" style={{ fontSize: 10.5, color: T.yellow, background: T.yellowDim, border: `1px solid ${T.yellowBorder}`, borderRadius: 5, padding: "1px 7px", flexShrink: 0, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                                      split off
                                    </span>
                                  )}
                                </div>
                                {showLabel && (
                                  <div style={{ position: "relative", flexShrink: 0, width: 150 }}>
                                    <input
                                      value={r.customLabel || ""}
                                      onChange={(e) => updateLabel(r.id, e.target.value)}
                                      onFocus={() => { setActiveLabelFileId(r.id); fetchLabelSuggestions(r.tag, r.customLabel || ""); }}
                                      onBlur={() => setTimeout(() => setActiveLabelFileId(null), 200)}
                                      placeholder="custom-label"
                                      title={labelInvalid ? "Labels can't contain special characters" : undefined}
                                      style={{
                                        width: "100%", background: "rgba(255,255,255,0.04)",
                                        border: `1px solid ${labelInvalid ? T.red : T.border}`,
                                        borderRadius: 7, padding: "5px 9px",
                                        color: T.text, fontSize: 12, fontFamily: T.mono, outline: "none",
                                      }}
                                    />
                                    {/* Autocomplete dropdown */}
                                    {activeLabelFileId === r.id && labelSuggestions.length > 0 && (
                                      <div style={{
                                        position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                                        background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md,
                                        boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 999, padding: 4,
                                        maxHeight: 180, overflowY: "auto",
                                      }}>
                                        {labelSuggestions.map((s) => (
                                          <div
                                            key={s.label}
                                            onMouseDown={() => selectLabelSuggestion(r.id, s.label)}
                                            style={{
                                              padding: "8px 12px", borderRadius: 6, cursor: "pointer",
                                              color: T.text, fontSize: 13, fontFamily: T.mono,
                                              display: "flex", justifyContent: "space-between", alignItems: "center",
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
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
                                {showPart && <MiniSpinbox compact label="Pt" value={r.part} onChange={(v) => updatePending(r.id, "part", v)} />}
                                <span style={{ fontSize: 11.5, color: T.textTertiary, width: 48, textAlign: "right", flexShrink: 0, fontFamily: T.mono }}>{info?.probing ? "…" : info?.durationSeconds ? fmtClock(info.durationSeconds) : "—"}</span>
                                <span className="cfr-acts" style={{ display: "flex", gap: 2, flexShrink: 0, justifyContent: "flex-end" }}>
                                  {r.filePath && <button className="cfr-iconbt" title="Show in Explorer" onClick={() => window.clipflow?.revealInFolder(r.filePath)}>{IcFolder}</button>}
                                  {r.filePath && info?.durationSeconds > 0 && (
                                    <button className="cfr-iconbt" title={scrubberOpen[r.id] ? "Close the split view" : "Split this recording at specific points"} disabled={renaming} onClick={() => toggleScrubber(r.id, r.filePath)} style={scrubberOpen[r.id] ? { color: T.accentLight } : undefined}>{IcSplit}</button>
                                  )}
                                  <button className="cfr-iconbt" title="Hide from pending" onClick={() => hideOne(r.id)}>{IcHide}</button>
                                </span>
                              </div>
                              {/* game-switch scrubber still expands full-width under its row */}
                              {scrubberOpen[r.id] && r.filePath && (
                                <div style={{ borderTop: `1px solid ${T.border}`, padding: "12px 14px", background: "rgba(255,255,255,0.015)" }}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                    <span style={{ color: T.accentLight, fontSize: 12, fontWeight: 600 }}>Mark where games change in this recording</span>
                                    <button
                                      onClick={() => toggleScrubber(r.id, r.filePath)}
                                      style={{ background: "none", border: "none", color: T.textMuted, fontSize: 14, cursor: "pointer", padding: "2px 6px", fontFamily: T.font }}
                                    >✕</button>
                                  </div>
                                  <ThumbnailScrubber
                                    thumbnails={scrubberThumbs[r.id]?.thumbnails || []}
                                    duration={scrubberThumbs[r.id]?.duration || splitInfo[r.id]?.durationSeconds || 0}
                                    games={gamesDb}
                                    markers={scrubberMarkers[r.id] || []}
                                    onMarkersChange={(m) => updateScrubberMarkers(r.id, m)}
                                    loading={!!scrubberLoading[r.id]}
                                    defaultGameTag={r.tag}
                                  />
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Card style={{ padding: "40px 20px", textAlign: "center" }}>
                {renameDone ? (<><div style={{ fontSize: 32, marginBottom: 8 }}>✅</div><div style={{ color: T.green, fontSize: 16, fontWeight: 700 }}>All files renamed!</div></>) : (<><div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>📁</div><div style={{ color: T.textTertiary, fontSize: 14 }}>No pending files — watching for new recordings...</div><div style={{ color: T.textMuted, fontSize: 12, marginTop: 8 }}>Or drag and drop an .mp4 file here</div></>)}
              </Card>
            )}
          </>
        )}

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
                        <span style={{ color: T.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", flexShrink: 0 }}>UNDONE</span>
                      ) : h.historyId ? (
                        <button onClick={() => undoLocalEntry(h)} disabled={undoBusy === h.id} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${T.yellowBorder}`, background: T.yellowDim, color: T.yellow, fontSize: 11, fontWeight: 700, cursor: undoBusy === h.id ? "default" : "pointer", fontFamily: T.font, opacity: undoBusy === h.id ? 0.5 : 1 }}>{undoBusy === h.id ? "UNDOING…" : "UNDO"}</button>
                      ) : null}
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
              <button onClick={selectAllM} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>{manageSelected.size === folderFiles.length && folderFiles.length > 0 ? "NONE" : "ALL"}</button>
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
                    {f.part_number != null && <span style={{ color: T.green, fontSize: 12, fontFamily: T.mono }}>Pt{f.part_number}</span>}
                  </Card>
                );
              })}
            </div>

            {manageSelected.size > 0 && (
              <Card style={{ padding: "16px 20px" }}>
                <div style={{ color: T.textSecondary, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{manageSelected.size} file{manageSelected.size > 1 ? "s" : ""} selected</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["part", "day", "tag"].map((a) => (
                    <button key={a} onClick={() => { setBatchAction(a); setBatchValue(""); }} style={{ padding: "10px 18px", borderRadius: 8, border: batchAction === a ? `1px solid ${T.accentBorder}` : `1px solid ${T.border}`, background: batchAction === a ? T.accentDim : "rgba(255,255,255,0.03)", color: batchAction === a ? T.accentLight : T.textSecondary, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font, textTransform: "uppercase" }}>Change {a}</button>
                  ))}
                </div>
                {batchAction && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                    {batchAction === "tag" ? (
                      <Select value={batchValue} onChange={setBatchValue} options={[{ value: "", label: "Select game..." }, ...gamesDb.map((g) => ({ value: g.tag, label: `${g.tag} (${g.name})` }))]} style={{ flex: 1, padding: "10px 14px", fontSize: 13 }} />
                    ) : (
                      <input value={batchValue} onChange={(e) => setBatchValue(e.target.value.replace(/\D/g, ""))} placeholder={batchAction === "part" ? "Starting part #" : `New ${batchAction} #`} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "10px 14px", color: T.text, fontSize: 14, fontFamily: T.mono, outline: "none" }} />
                    )}
                    <button onClick={applyBatch} disabled={!batchValue} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: batchValue ? T.accent : "rgba(255,255,255,0.04)", color: batchValue ? "#fff" : T.textMuted, fontSize: 13, fontWeight: 700, cursor: batchValue ? "pointer" : "default", fontFamily: T.font }}>Apply</button>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </div>

      {/* #172: floating batch bar — "Rename All" with no selection, selection
          tools once rows are ticked. Same glass shell as Recordings (#123). */}
      {subTab === "pending" && pendingRenames.length > 0 && (
        <div style={BAR_SHELL}>
          {selectedIds.size === 0 ? (
            <button
              onClick={() => renameFiles(pendingRenames)}
              disabled={renaming}
              style={{ ...BAR_BTN, background: renaming ? "rgba(255,255,255,0.06)" : T.accent, color: renaming ? T.textTertiary : "#fff", cursor: renaming ? "default" : "pointer" }}
            >{renaming ? (splitProgress ? `Splitting… (${splitProgress.current}/${splitProgress.total})` : "Renaming…") : `Rename All ${pendingRenames.length} File${pendingRenames.length === 1 ? "" : "s"}`}</button>
          ) : (
            <>
              <span style={{ fontSize: 12.5, color: T.textSecondary, padding: "0 4px", whiteSpace: "nowrap", fontFamily: T.font }}><b style={{ color: T.text }}>{selectedIds.size}</b> selected</span>
              <div ref={gameMenuRef} style={{ position: "relative" }}>
                <button onClick={() => setGameMenuOpen((v) => !v)} disabled={renaming} style={{ ...BAR_BTN, background: gameMenuOpen ? T.surfaceHover : "transparent", borderColor: T.border, color: T.textSecondary }}>Set Game ▾</button>
                {gameMenuOpen && (
                  <div style={{ position: "absolute", bottom: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)", background: "rgba(22,23,31,0.97)", border: `1px solid ${T.borderHover}`, borderRadius: 12, boxShadow: "0 10px 32px rgba(0,0,0,0.55)", padding: 5, minWidth: 210, maxHeight: 320, overflowY: "auto" }}>
                    {gameOptions.map((o) => o.isHeader ? (
                      <div key={o.value} style={{ padding: "7px 12px 3px", fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.5px" }}>{o.label}</div>
                    ) : (
                      <div
                        key={o.value}
                        onClick={() => { setGameForRows(selectedIds, o.value); setGameMenuOpen(false); clearSelection(); }}
                        style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", color: T.text, whiteSpace: "nowrap", fontFamily: T.font }}
                        onMouseEnter={(e) => e.currentTarget.style.background = T.surfaceHover}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                      >
                        <GamePill tag={o.tag} color={o.color} size="sm" />{o.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={hideSelected} disabled={renaming} style={{ ...BAR_BTN, background: "transparent", borderColor: T.border, color: T.textSecondary }}>Hide Selected</button>
              <button onClick={clearSelection} disabled={renaming} style={{ ...BAR_BTN, background: "transparent", borderColor: T.border, color: T.textSecondary }}>Clear</button>
              <button
                onClick={() => renameFiles(pendingRenames.filter((r) => selectedIds.has(r.id)))}
                disabled={renaming}
                style={{ ...BAR_BTN, background: renaming ? "rgba(255,255,255,0.06)" : T.accent, color: renaming ? T.textTertiary : "#fff", cursor: renaming ? "default" : "pointer" }}
              >{renaming ? (splitProgress ? `Splitting… (${splitProgress.current}/${splitProgress.total})` : "Renaming…") : `Rename ${selectedIds.size} Selected`}</button>
            </>
          )}
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

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.value === value && !o.isHeader);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", ...x }}>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", height: 36, background: T.surface, border: `1px solid ${borderColor || (open ? T.accentBorder : T.border)}`, borderRadius: T.radius.md, padding: "0 12px", color: T.text, fontSize: 13, fontFamily: T.font, cursor: "pointer", outline: "none", textAlign: "left" }}>
        <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
          {renderSelected && selected ? renderSelected(selected) : (selected?.label || value)}
        </span>
        <span style={{ color: T.textMuted, fontSize: 10, transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "none" }}>{"\u25BC"}</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, minWidth: "100%", maxHeight: 300, overflowY: "auto", overflowX: "hidden", background: T.surface, border: `1px solid ${T.borderHover || T.border}`, borderRadius: T.radius.md, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 999, padding: 4 }}>
          {options.map((o, i) => {
            if (o.isHeader) {
              return (
                <div key={o.value} style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", borderTop: i > 0 ? `1px solid ${T.border}` : "none", marginTop: i > 0 ? 4 : 0 }}>
                  {o.label}
                </div>
              );
            }
            return (
              <div key={o.value} onMouseEnter={() => setHovIdx(i)} onMouseLeave={() => setHovIdx(-1)} onClick={() => { onChange(o.value); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, cursor: "pointer", background: o.value === value ? "rgba(139,92,246,0.12)" : hovIdx === i ? "rgba(255,255,255,0.06)" : "transparent", color: o.value === value ? T.accentLight : T.text, fontSize: 13, fontFamily: T.font, fontWeight: o.value === value ? 600 : 400, transition: "background 0.1s" }}>
                {renderOption ? renderOption(o) : o.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
