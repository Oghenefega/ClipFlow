import React, { useState, useRef, useCallback, useEffect } from "react";
import T from "../styles/theme";
import { SectionLabel } from "../components/shared";

// ============ CONSTANTS ============
const TOPBAR_H = 48;
const RAIL_W = 80;
const LP_DEFAULT = 300;
const LP_MIN = 180;
const LP_MAX = 500;
const DRAWER_DEFAULT = 360;
const DRAWER_MIN = 260;
const DRAWER_MAX = 560;
const TL_DEFAULT = 220;
const TL_MIN = 120;
const TL_MAX = 480;
const TL_COLLAPSED_H = 38;
const LP_GHOST_W = 20;

// surface helpers matching ClipFlow theme
const S2 = T.surfaceHover;          // surface-2 equivalent
const S3 = "rgba(255,255,255,0.06)"; // surface-3 equivalent
const BD = T.border;
const BDH = T.borderHover;

// ============ SMALL HELPERS ============
const Ib = ({ title, children, onClick, active, style: x }) => (
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

const Pill = ({ label, active, onClick, icon }) => (
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

const ToolBtn = ({ children, onClick, active, style: x }) => (
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

const PanelTab = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      flex: 1, padding: "10px 0", textAlign: "center", fontSize: 12, fontWeight: 500,
      color: active ? T.text : T.textSecondary, cursor: "pointer", borderBottom: `2px solid ${active ? T.accent : "transparent"}`,
      background: "transparent", border: "none", borderBottomStyle: "solid", borderBottomWidth: 2,
      borderBottomColor: active ? T.accent : "transparent", fontFamily: T.font, transition: "all 0.15s",
    }}
  >
    {label}
  </button>
);

const Divider = () => <div style={{ height: 1, background: BD }} />;

const Toggle = ({ on, onClick }) => (
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

const SwatchBtn = ({ color, size = 20, selected, onClick, style: x }) => (
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

const PosGrid = ({ value, onChange, cellSize = 14, gap = 3, width = 60 }) => (
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

const NumBox = ({ value, onChange, min = 0, max = 999 }) => (
  <div style={{ display: "flex", alignItems: "center", background: S2, border: `1px solid ${BD}`, borderRadius: 5, overflow: "hidden" }}>
    <button onClick={() => onChange(Math.max(min, value - 1))} style={{ width: 22, height: 28, background: "transparent", border: "none", color: T.textSecondary, cursor: "pointer", fontSize: 13, fontFamily: T.font, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
    <span style={{ fontSize: 11, fontFamily: T.mono, color: T.text, padding: "0 4px", minWidth: 24, textAlign: "center" }}>{value}</span>
    <button onClick={() => onChange(Math.min(max, value + 1))} style={{ width: 22, height: 28, background: "transparent", border: "none", color: T.textSecondary, cursor: "pointer", fontSize: 13, fontFamily: T.font, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
  </div>
);

const SliderRow = ({ label, value, onChange, min = 0, max = 100, suffix = "" }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    {label && <span style={{ fontSize: 10, color: T.textSecondary, flexShrink: 0 }}>{label}</span>}
    <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} style={{ flex: 1, height: 3, accentColor: T.accent, cursor: "pointer" }} />
    <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textSecondary, minWidth: 22, textAlign: "right", flexShrink: 0 }}>{value}{suffix}</span>
  </div>
);


// ── Helpers: format time ──
const fmtTime = (sec) => {
  if (!sec || sec < 0) return "00:00.0";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
};

// Parse "MM:SS.d" or "SS.d" back to seconds
const parseTime = (str) => {
  if (!str) return 0;
  const parts = str.split(":");
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(str) || 0;
};

// Editable timecode component
const EditableTC = ({ value, onChange, clipDuration }) => {
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

// ============ EDITOR VIEW ============
export default function EditorView({ gamesDb = [], editorContext, localProjects = [], anthropicApiKey = "", styleGuide = "", onBack }) {
  // ── Resolve real project/clip data from editorContext ──
  const project = editorContext ? localProjects.find((p) => p.id === editorContext.projectId) : null;
  const clip = project ? (project.clips || []).find((c) => c.id === editorContext.clipId) : null;

  // ── Layout state ──
  const [lpTab, setLpTab] = useState("transcript");
  const [lpCollapsed, setLpCollapsed] = useState(false);
  const [lpWidth, setLpWidth] = useState(LP_DEFAULT);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [activePanel, setActivePanel] = useState("ai");
  const [drawerWidth, setDrawerWidth] = useState(DRAWER_DEFAULT);
  const [tlCollapsed, setTlCollapsed] = useState(false);
  const [tlHeight, setTlHeight] = useState(TL_DEFAULT);
  const [tlOverlay, setTlOverlay] = useState(false);

  // ── Left panel: Transcript state ──
  const [transcriptMode, setTranscriptMode] = useState("karaoke");
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [activeRow, setActiveRow] = useState(0);

  // ── Left panel: Edit Subtitles state ──
  const [esFilter, setEsFilter] = useState("all");
  const [activeSegId, setActiveSegId] = useState(null);

  // ── Topbar ──
  const [clipTitle, setClipTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [dirty, setDirty] = useState(false);
  const titleInputRef = useRef(null);

  // ── AI Tools ──
  const [voiceMode, setVoiceMode] = useState("hype");
  const [aiContext, setAiContext] = useState("");
  const [aiGame, setAiGame] = useState(gamesDb[0]?.name || "Arc Raiders");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiSuggestions, setAiSuggestions] = useState(null); // { titles: [], captions: [] }
  const [aiRejections, setAiRejections] = useState([]); // rejected text strings this session
  const [acceptedTitleIdx, setAcceptedTitleIdx] = useState(null);
  const [acceptedCaptionIdx, setAcceptedCaptionIdx] = useState(null);

  // ── Caption (separate from title) ──
  const [captionText, setCaptionText] = useState("");
  const [captionFontFamily, setCaptionFontFamily] = useState("Montserrat");
  const [captionFontSize, setCaptionFontSize] = useState(12);
  const [captionColor, setCaptionColor] = useState("#ffffff");
  const [captionBold, setCaptionBold] = useState(true);
  const [captionItalic, setCaptionItalic] = useState(false);
  const [captionUnderline, setCaptionUnderline] = useState(false);

  // ── Subtitles drawer ──
  const [subMode, setSubMode] = useState("karaoke");
  const [fontSize, setFontSize] = useState(52);
  const [strokeWidth, setStrokeWidth] = useState(7);
  const [strokeOn, setStrokeOn] = useState(true);
  const [shadowOn, setShadowOn] = useState(false);
  const [shadowBlur, setShadowBlur] = useState(8);
  const [bgOn, setBgOn] = useState(false);
  const [bgOpacity, setBgOpacity] = useState(80);
  const [highlightColor, setHighlightColor] = useState("#4cce8a");
  const [subPos, setSubPos] = useState(7);
  const [punctOn, setPunctOn] = useState(false);
  const [showSubs, setShowSubs] = useState(true);
  const [emojiOn, setEmojiOn] = useState(false);
  const [s1Open, setS1Open] = useState(false);
  const [s2Open, setS2Open] = useState(false);
  const [subFontFamily, setSubFontFamily] = useState("Montserrat");
  const [lineMode, setLineMode] = useState("2L");
  const [syncOffset, setSyncOffset] = useState(0); // seconds offset for subtitle sync

  // ── Transcript ──
  const [editingWordKey, setEditingWordKey] = useState(null); // "segId-wordIdx" for inline editing

  // ── Edit Subtitles ──
  const [selectedWordInfo, setSelectedWordInfo] = useState(null); // { segId, wordIdx }

  // ── Editable subtitle segments ──
  const [editSegments, setEditSegments] = useState([]);

  // ── Render state ──
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState({ stage: "", pct: 0, detail: "" });
  const [renderResult, setRenderResult] = useState(null); // { success, path, error }

  // ── Brand Kit ──
  const [activePreset, setActivePreset] = useState("gaming");
  const [wmOn, setWmOn] = useState(false);
  const [wmPos, setWmPos] = useState(2);
  const [wmOpacity, setWmOpacity] = useState(60);

  // ── Media ──
  const [mediaFilter, setMediaFilter] = useState("all");
  const [sfxFiles, setSfxFiles] = useState([]);

  // ── Timeline ──
  const [tlSpeed, setTlSpeed] = useState("1x");
  const [tlZoom, setTlZoom] = useState(1); // 1 = 100%
  const [tlScrubbing, setTlScrubbing] = useState(false);
  const timelineContentRef = useRef(null);
  const tlDragRef = useRef(null); // { segId, mode: "move"|"resize-l"|"resize-r", startX, origStart, origEnd }

  // ── Playback ──
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const videoRef = useRef(null);

  // ── Drag refs ──
  const lpResizing = useRef(false);
  const drawerResizing = useRef(false);
  const tlResizing = useRef(false);

  // ── Initialize from real clip data ──
  useEffect(() => {
    if (!clip) return;
    setClipTitle(clip.title || "Untitled Clip");
    setCaptionText(clip.caption || clip.title || "");
    setActiveRow(0);
    setActiveSegId(null);
    setCurrentTime(0);
    setPlaying(false);
    setDirty(false);
    // Build editable subtitle segments from project transcription
    if (project?.transcription?.segments) {
      const clipStart = clip.startTime || 0;
      const clipEnd = clip.endTime || 0;
      const segs = project.transcription.segments
        .filter((s) => s.start >= clipStart && s.end <= clipEnd)
        .map((s, i) => ({
          id: i + 1,
          start: fmtTime(s.start - clipStart),
          end: fmtTime(s.end - clipStart),
          dur: ((s.end - s.start).toFixed(1)) + "s",
          text: s.text,
          track: "s1",
          conf: "high",
          startSec: s.start - clipStart,
          endSec: s.end - clipStart,
          warning: (s.end - s.start) > 10 ? "Long segment — consider splitting" : null,
        }));
      setEditSegments(segs);
      if (segs.length > 0) setActiveSegId(segs[0].id);
    }
    // Set AI game from project data
    if (project?.game) setAiGame(project.game);
  }, [clip?.id, project?.id]);

  // ── Video time update ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleEnded = () => setPlaying(false);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);
    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
    };
  }, [clip?.id]);

  // ── Play/Pause sync ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) video.play().catch(() => setPlaying(false));
    else video.pause();
  }, [playing]);

  // ── Speed sync ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = tlSpeed === "2x" ? 2 : 1;
  }, [tlSpeed]);

  // ── Save handler ──
  const handleSave = useCallback(async () => {
    if (!clip || !project) return;
    try {
      await window.clipflow.projectUpdateClip(project.id, clip.id, {
        title: clipTitle,
        caption: captionText,
        subtitles: { sub1: editSegments.filter((s) => s.track === "s1"), sub2: editSegments.filter((s) => s.track === "s2") },
      });
      setDirty(false);
    } catch (e) {
      console.error("Save failed:", e);
    }
  }, [clip, project, clipTitle, captionText, editSegments]);

  // ── Transcript rows — derived from editSegments for bidirectional sync ──
  const transcriptRows = React.useMemo(() => {
    return editSegments.map(s => ({
      id: s.id, start: s.start, end: s.end, dur: s.dur,
      text: s.text, startSec: s.startSec, endSec: s.endSec,
    }));
  }, [editSegments]);

  // ── Use editSegments as the subtitle segments ──
  const segments = editSegments;

  // ── Resize: left panel ──
  const onLpResizeStart = useCallback((e) => {
    e.preventDefault();
    lpResizing.current = true;
    const startX = e.clientX;
    const startW = lpWidth;
    const onMove = (ev) => {
      if (!lpResizing.current) return;
      const newW = Math.max(LP_MIN, Math.min(LP_MAX, startW + (ev.clientX - startX)));
      setLpWidth(newW);
    };
    const onUp = () => { lpResizing.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [lpWidth]);

  // ── Resize: drawer ──
  const onDrawerResizeStart = useCallback((e) => {
    e.preventDefault();
    drawerResizing.current = true;
    const startX = e.clientX;
    const startW = drawerWidth;
    const onMove = (ev) => {
      if (!drawerResizing.current) return;
      const newW = Math.max(DRAWER_MIN, Math.min(DRAWER_MAX, startW - (ev.clientX - startX)));
      setDrawerWidth(newW);
    };
    const onUp = () => { drawerResizing.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [drawerWidth]);

  // ── Resize: timeline ──
  const onTlResizeStart = useCallback((e) => {
    e.preventDefault();
    tlResizing.current = true;
    const startY = e.clientY;
    const startH = tlHeight;
    const onMove = (ev) => {
      if (!tlResizing.current) return;
      const newH = Math.max(TL_MIN, Math.min(TL_MAX, startH - (ev.clientY - startY)));
      setTlHeight(newH);
    };
    const onUp = () => { tlResizing.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [tlHeight]);

  // ── Timeline scrub (draggable playhead) ──
  useEffect(() => {
    if (!tlScrubbing) return;
    const dur = clipDuration || 1;
    const contentW = Math.max(500, 500 * tlZoom);
    const onMove = (e) => {
      const scrollEl = timelineContentRef.current;
      if (!scrollEl) return;
      const rect = scrollEl.getBoundingClientRect();
      const scrollLeft = scrollEl.scrollLeft;
      const xInContent = e.clientX - rect.left + scrollLeft - 104;
      const ratio = Math.max(0, Math.min(1, xInContent / contentW));
      const newTime = ratio * dur;
      if (videoRef.current) videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    };
    const onUp = () => setTlScrubbing(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [tlScrubbing, clipDuration, tlZoom]);

  // ── Timeline segment drag/resize ──
  const handleSegMouseDown = useCallback((e, segId, mode) => {
    e.stopPropagation();
    e.preventDefault();
    const seg = editSegments.find(s => s.id === segId);
    if (!seg) return;
    setActiveSegId(segId);
    tlDragRef.current = { segId, mode, startX: e.clientX, origStart: seg.startSec, origEnd: seg.endSec };

    const dur = clipDuration || 1;
    const contentW = Math.max(500, 500 * tlZoom);
    const pxPerSec = contentW / dur;

    const onMove = (ev) => {
      const drag = tlDragRef.current;
      if (!drag) return;
      const dx = ev.clientX - drag.startX;
      const dtSec = dx / pxPerSec;

      setEditSegments(prev => prev.map(s => {
        if (s.id !== drag.segId) return s;
        let newStart = drag.origStart;
        let newEnd = drag.origEnd;
        if (drag.mode === "move") {
          const segDur = drag.origEnd - drag.origStart;
          newStart = Math.max(0, Math.min(dur - segDur, drag.origStart + dtSec));
          newEnd = newStart + segDur;
        } else if (drag.mode === "resize-l") {
          newStart = Math.max(0, Math.min(drag.origEnd - 0.1, drag.origStart + dtSec));
        } else if (drag.mode === "resize-r") {
          newEnd = Math.max(drag.origStart + 0.1, Math.min(dur, drag.origEnd + dtSec));
        }
        const fmtTC = (sec) => {
          const m = Math.floor(sec / 60);
          const s2 = Math.floor(sec % 60);
          const ms = Math.round((sec % 1) * 100);
          return `${String(m).padStart(2, "0")}:${String(s2).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
        };
        return { ...s, startSec: newStart, endSec: newEnd, start: fmtTC(newStart), end: fmtTC(newEnd), dur: fmtTC(newEnd - newStart) };
      }));
      setDirty(true);
    };

    const onUp = () => {
      tlDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [editSegments, clipDuration, tlZoom]);

  // ── Drawer toggle ──
  const togglePanel = (panel) => {
    if (activePanel === panel && drawerOpen) {
      setDrawerOpen(false);
    } else {
      setActivePanel(panel);
      setDrawerOpen(true);
    }
  };

  // ── AI generation handler ──
  const handleAiGenerate = useCallback(async () => {
    if (!clip || !project || aiGenerating) return;
    if (!anthropicApiKey) { setAiError("Anthropic API key not set. Go to Settings."); return; }
    setAiGenerating(true);
    setAiError("");
    try {
      // Build clip transcript from project transcription
      const clipStart = clip.startTime || 0;
      const clipEnd = clip.endTime || 0;
      const transcript = project?.transcription?.segments
        ? project.transcription.segments
            .filter((s) => s.start >= clipStart && s.end <= clipEnd)
            .map((s) => s.text)
            .join(" ")
            .trim()
        : "";
      const activeGame = gamesDb.find((g) => g.name === aiGame);
      const result = await window.clipflow.anthropicGenerate({
        transcript,
        userContext: `${voiceMode === "hype" ? "Use HYPE energy — punchy, exciting, gaming energy." : "Use CHILL tone — laid-back, conversational, relatable."} ${aiContext}`.trim(),
        gameName: aiGame,
        gameContextAuto: activeGame?.aiContextAuto || "",
        gameContextUser: activeGame?.aiContextUser || "",
        projectName: project.name || "",
        rejectedSuggestions: aiRejections,
      });
      if (result.error) {
        setAiError(result.error);
      } else if (result.success && result.data) {
        setAiSuggestions(result.data);
      }
    } catch (e) {
      setAiError(e.message);
    }
    setAiGenerating(false);
  }, [clip, project, aiGenerating, anthropicApiKey, aiGame, aiContext, voiceMode, gamesDb, aiRejections]);

  // ── AI accept/reject handlers ──
  const handleAiAcceptTitle = useCallback((titleObj, idx) => {
    const newTitle = titleObj.title || titleObj.text || "";
    setClipTitle(newTitle);
    setAcceptedTitleIdx(idx);
    setDirty(true);
    window.clipflow?.anthropicLogHistory?.({
      type: "pick", titleChosen: newTitle, game: aiGame, timestamp: Date.now(),
    });
  }, [aiGame]);

  const handleAiAcceptCaption = useCallback((captionObj, idx) => {
    const text = captionObj.caption || captionObj.text || "";
    setCaptionText(text);
    setAcceptedCaptionIdx(idx);
    setDirty(true);
    window.clipflow?.anthropicLogHistory?.({
      type: "pick", captionChosen: text, game: aiGame, timestamp: Date.now(),
    });
  }, [aiGame]);

  const handleAiReject = useCallback((text) => {
    setAiRejections((prev) => [...prev, text]);
    window.clipflow?.anthropicLogHistory?.({
      type: "reject", titleRejected: text, game: aiGame, timestamp: Date.now(),
    });
  }, [aiGame]);

  // ── Render handler ──
  const handleRender = useCallback(async () => {
    if (!clip || !project || rendering) return;
    setRendering(true);
    setRenderProgress({ stage: "rendering", pct: 0, detail: "Starting render..." });
    setRenderResult(null);

    // Listen for progress
    const onProgress = (p) => setRenderProgress(p);
    window.clipflow?.onRenderProgress?.(onProgress);

    try {
      // Build subtitle style from current editor settings
      const subtitleStyle = {
        fontSize,
        fontName: "Montserrat",
        highlightColor: `&H00${highlightColor.slice(5, 7)}${highlightColor.slice(3, 5)}${highlightColor.slice(1, 3)}`,
        strokeWidth: strokeOn ? strokeWidth : 0,
        position: subPos,
      };

      const result = await window.clipflow.renderClip(clip, project, null, { subtitleStyle });

      if (result.error) {
        setRenderResult({ success: false, error: result.error });
      } else {
        setRenderResult({ success: true, path: result.path });
      }
    } catch (e) {
      setRenderResult({ success: false, error: e.message });
    }

    window.clipflow?.removeRenderProgressListener?.();
    setRendering(false);
  }, [clip, project, rendering, fontSize, highlightColor, strokeOn, strokeWidth, subPos]);

  // ── Subtitle editing handlers ──
  const handleSplitSegment = useCallback(() => {
    if (!activeSegId) return;
    const idx = editSegments.findIndex(s => s.id === activeSegId);
    if (idx < 0) return;
    const seg = editSegments[idx];
    const words = seg.text.split(" ");
    // Use selected word position if available, otherwise midpoint
    let splitWordIdx = Math.max(1, Math.floor(words.length / 2));
    let splitSec = (seg.startSec + seg.endSec) / 2;
    if (selectedWordInfo && selectedWordInfo.segId === activeSegId && selectedWordInfo.wordIdx > 0) {
      splitWordIdx = selectedWordInfo.wordIdx;
      const segDur = seg.endSec - seg.startSec;
      splitSec = seg.startSec + (splitWordIdx / words.length) * segDur;
    }
    const seg1 = { ...seg, endSec: splitSec, end: fmtTime(splitSec), dur: (splitSec - seg.startSec).toFixed(1) + "s", text: words.slice(0, splitWordIdx).join(" ") };
    const seg2 = { ...seg, id: Date.now(), startSec: splitSec, start: fmtTime(splitSec), dur: (seg.endSec - splitSec).toFixed(1) + "s", text: words.slice(splitWordIdx).join(" ") };
    const next = [...editSegments];
    next.splice(idx, 1, seg1, seg2);
    setEditSegments(next);
    setSelectedWordInfo(null);
    setDirty(true);
  }, [activeSegId, editSegments, selectedWordInfo]);

  const handleMergeSegment = useCallback(() => {
    if (!activeSegId) return;
    const idx = editSegments.findIndex(s => s.id === activeSegId);
    if (idx < 0 || idx >= editSegments.length - 1) return;
    const seg = editSegments[idx];
    const next = editSegments[idx + 1];
    const merged = { ...seg, endSec: next.endSec, end: fmtTime(next.endSec), dur: (next.endSec - seg.startSec).toFixed(1) + "s", text: seg.text + " " + next.text };
    const arr = [...editSegments];
    arr.splice(idx, 2, merged);
    setEditSegments(arr);
    setDirty(true);
  }, [activeSegId, editSegments]);

  const handleSplitToWords = useCallback(() => {
    if (!activeSegId) return;
    const idx = editSegments.findIndex(s => s.id === activeSegId);
    if (idx < 0) return;
    const seg = editSegments[idx];
    const words = seg.text.split(/\s+/).filter(Boolean);
    if (words.length <= 1) return;
    const totalDur = seg.endSec - seg.startSec;
    const perWord = totalDur / words.length;
    const wordSegs = words.map((w, i) => ({
      ...seg,
      id: Date.now() + i,
      startSec: seg.startSec + i * perWord,
      endSec: seg.startSec + (i + 1) * perWord,
      start: fmtTime(seg.startSec + i * perWord),
      end: fmtTime(seg.startSec + (i + 1) * perWord),
      dur: perWord.toFixed(1) + "s",
      text: w,
    }));
    const arr = [...editSegments];
    arr.splice(idx, 1, ...wordSegs);
    setEditSegments(arr);
    setActiveSegId(wordSegs[0].id);
    setDirty(true);
  }, [activeSegId, editSegments]);

  const handleDeleteSegment = useCallback((segId) => {
    setEditSegments(prev => prev.filter(s => s.id !== segId));
    setDirty(true);
  }, []);

  // ── Brand presets (static for now) ──
  const brandPresets = [
    { id: "gaming", name: "Gaming Default", detail: "Montserrat · 52 · Green", tracks: ["Sub 1", "Sub 2"] },
    { id: "chill", name: "Chill Vlog", detail: "DM Sans · 42 · Blue", tracks: ["Sub 1"] },
    { id: "bold", name: "Bold Impact", detail: "Impact · 64 · Red", tracks: ["Caption"] },
  ];

  // ── Media assets from SFX folder ──
  const mediaAssets = sfxFiles.length > 0 ? sfxFiles : [];
  // Load SFX files from folder on mount
  useEffect(() => {
    const loadSfx = async () => {
      if (!window.clipflow?.storeGetAll) return;
      try {
        const all = await window.clipflow.storeGetAll();
        const folder = all.sfxFolder;
        if (!folder) return;
        const files = await window.clipflow.readDir(folder);
        if (files && !files.error) {
          const media = files
            .filter((f) => !f.isDirectory && /\.(mp3|wav|ogg|png|jpg|gif|mp4)$/i.test(f.name))
            .map((f, i) => {
              const ext = f.name.split(".").pop().toUpperCase();
              const type = /^(mp3|wav|ogg)$/i.test(ext) ? "audio" : /^gif$/i.test(ext) ? "gif" : "image";
              return { id: `sfx_${i}`, name: f.name.replace(/\.[^.]+$/, ""), type, ext, path: f.path };
            });
          setSfxFiles(media);
        }
      } catch (e) { /* ignore */ }
    };
    loadSfx();
  }, []);

  // ── Timeline tracks ──
  const tracks = [
    { id: "cap", label: "CAPTION", color: T.accent, type: "cap" },
    { id: "s1", label: "SUB 1", color: "#90b8e0", type: "sub" },
    { id: "s2", label: "SUB 2", color: "#d4b94a", type: "sub" },
    { id: "v1", label: "VIDEO 1", color: T.green, type: "video" },
    { id: "a1", label: "AUDIO 1", color: "#4a7fa0", type: "audio" },
    { id: "a2", label: "AUDIO 2", color: "#7a5fa0", type: "audio" },
  ];

  // ── Rail items ──
  const railItems = [
    { id: "ai", icon: "✦", label: "AI Tools", group: 1 },
    { id: "subs", icon: "CC", label: "Subtitles", group: 2 },
    { id: "head", icon: "T", label: "Caption", group: 2 },
    { id: "brand", icon: "◈", label: "Brand Kit", group: 2 },
    { id: "audio", icon: "♫", label: "Audio", group: 3 },
    { id: "media", icon: "⊞", label: "Media", group: 3 },
    { id: "text", icon: "Aa", label: "Text", group: 3 },
  ];

  const highlights = ["#4cce8a", "#f4c430", "#ffffff", "#e63946", T.accent];

  // ═══════════════════════════════════════
  // RENDER: TOPBAR
  // ═══════════════════════════════════════
  const renderTopbar = () => (
    <div style={{
      height: TOPBAR_H, minHeight: TOPBAR_H, background: T.surface, borderBottom: `1px solid ${BD}`,
      display: "flex", alignItems: "center", padding: "0 16px", gap: 12, zIndex: 9, flexShrink: 0,
    }}>
      {/* Left: Back + Undo/Redo/AutoSave */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {onBack && <Ib title="Back to clips" onClick={async () => { if (dirty) await handleSave(); onBack(); }} style={{ fontSize: 14 }}>←</Ib>}
        <Ib title="Undo">↩</Ib>
        <Ib title="Redo">↪</Ib>
        <Ib title="Auto-save">◎</Ib>
      </div>

      {/* Center: Clip title — click to edit */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={clipTitle}
            onChange={(e) => { setClipTitle(e.target.value); setDirty(true); }}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => { if (e.key === "Enter") setEditingTitle(false); if (e.key === "Escape") { setClipTitle(clip?.title || "Untitled Clip"); setEditingTitle(false); } }}
            autoFocus
            style={{
              background: S2, border: `1px solid ${T.accentBorder}`, borderRadius: 5,
              padding: "5px 12px", color: T.text, fontSize: 13, fontWeight: 500,
              fontFamily: T.font, maxWidth: 340, width: 300, outline: "none",
              textAlign: "center",
            }}
          />
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6, background: S2, border: `1px solid ${BD}`,
              borderRadius: 5, padding: "5px 12px", color: T.text, fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: T.font, maxWidth: 340, transition: "all 0.15s",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 2l3 3-9 9H2v-3L11 2z"/></svg>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clipTitle}</span>
          </button>
        )}
      </div>

      {/* Right: Zoom, Fullscreen, Save, Render */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
        <span style={{ fontSize: 11, color: T.textSecondary }}>{zoom}%</span>
        <Ib title="Fullscreen">⛶</Ib>
        <button
          onClick={handleSave}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: dirty ? T.accent : "rgba(255,255,255,0.06)",
            color: dirty ? "#fff" : T.textTertiary,
            border: "none", borderRadius: 5, padding: "6px 14px", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: T.font, transition: "background 0.15s",
          }}
        >
          {dirty ? "● Save" : "✓ Saved"}
        </button>
        <button
          onClick={handleRender}
          disabled={rendering || !clip}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: rendering ? T.yellow : `linear-gradient(135deg, ${T.green}, #2dd4a8)`,
            color: rendering ? "#000" : "#fff",
            border: "none", borderRadius: 5, padding: "6px 14px", fontSize: 12, fontWeight: 700,
            cursor: rendering ? "default" : "pointer", fontFamily: T.font, transition: "all 0.15s",
            opacity: !clip ? 0.4 : 1,
          }}
        >
          {rendering ? `⏳ ${renderProgress.pct}%` : "🚀 Ready to Share"}
        </button>
      </div>
    </div>
  );

  // ═══════════════════════════════════════
  // RENDER: LEFT PANEL — TRANSCRIPT
  // ═══════════════════════════════════════
  const renderTranscript = () => (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Search + full text */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, background: S2, border: `1px solid ${BD}`,
          borderRadius: 5, padding: "6px 10px", marginBottom: 12,
        }}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke={T.textSecondary} strokeWidth="1.5"><circle cx="7" cy="7" r="4"/><path d="M10.5 10.5l3 3"/></svg>
          <input
            type="text"
            placeholder="Search transcript…"
            value={transcriptSearch}
            onChange={e => setTranscriptSearch(e.target.value)}
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: T.text, fontSize: 12, fontFamily: T.font,
            }}
          />
        </div>

        {/* Full transcript as continuous text block */}
        <div style={{
          fontSize: 13, color: T.text, lineHeight: 1.8, whiteSpace: "pre-wrap",
          fontFamily: T.font, letterSpacing: "0.2px",
        }}>
          {transcriptRows
            .filter(row => !transcriptSearch || row.text.toLowerCase().includes(transcriptSearch.toLowerCase()))
            .map((row) => {
              const words = row.text.split(/\s+/);
              const segDur = row.endSec - row.startSec;
              const isActiveRow = currentTime >= row.startSec && currentTime <= row.endSec;
              return words.map((word, wi) => {
                const wordStart = row.startSec + (wi / words.length) * segDur;
                const wordEnd = row.startSec + ((wi + 1) / words.length) * segDur;
                const isActiveWord = isActiveRow && currentTime >= wordStart && currentTime < wordEnd;
                const wKey = `${row.id}-${wi}`;
                const isEditing = editingWordKey === wKey;

                if (isEditing) {
                  return (
                    <input
                      key={wKey}
                      autoFocus
                      defaultValue={word}
                      onBlur={e => {
                        const newWord = e.target.value.trim();
                        if (newWord && newWord !== word) {
                          const newWords = [...words];
                          newWords[wi] = newWord;
                          const newText = newWords.join(" ");
                          setEditSegments(prev => prev.map(s => s.id === row.id ? { ...s, text: newText } : s));
                          setDirty(true);
                        }
                        setEditingWordKey(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") e.target.blur();
                        if (e.key === "Escape") setEditingWordKey(null);
                      }}
                      onClick={e => e.stopPropagation()}
                      style={{
                        width: Math.max(30, word.length * 8), fontSize: 13, fontFamily: T.font,
                        color: T.accentLight, background: "rgba(139,92,246,0.15)",
                        border: `1px solid ${T.accentBorder}`, borderRadius: 3,
                        padding: "1px 3px", outline: "none", display: "inline",
                      }}
                    />
                  );
                }

                return (
                  <span
                    key={wKey}
                    onClick={() => {
                      setActiveRow(row.id);
                      if (videoRef.current) {
                        videoRef.current.currentTime = wordStart;
                        setCurrentTime(wordStart);
                      }
                    }}
                    onDoubleClick={() => setEditingWordKey(wKey)}
                    style={{
                      cursor: "pointer", padding: "1px 0", borderRadius: 2,
                      background: isActiveWord ? T.accentDim : "transparent",
                      color: isActiveWord ? T.accentLight : T.text,
                      transition: "background 0.1s",
                    }}
                  >
                    {word}{" "}
                  </span>
                );
              });
            })
          }
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════
  // RENDER: LEFT PANEL — EDIT SUBTITLES
  // ═══════════════════════════════════════
  const renderEditSubs = () => {
    const filtered = esFilter === "all" ? segments : segments.filter(s => s.track === esFilter);
    const confColor = { high: T.green, med: T.yellow, low: T.red };

    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 10px", borderBottom: `1px solid ${BD}` }}>
          <ToolBtn onClick={handleSplitSegment} active={!!activeSegId}>⌇ Split</ToolBtn>
          <ToolBtn onClick={handleMergeSegment}>⇔ Merge</ToolBtn>
          <div style={{ width: 1, height: 16, background: BD, margin: "0 2px" }} />
          <ToolBtn onClick={handleSplitToWords}>≈ Words</ToolBtn>
          <div style={{ flex: 1 }} />
          {["all", "s1", "s2"].map(f => (
            <button
              key={f}
              onClick={() => setEsFilter(f)}
              style={{
                padding: "3px 8px", borderRadius: 12,
                border: `1px solid ${esFilter === f ? T.accentBorder : f === "s1" ? "#90b8e0" : f === "s2" ? "#d4b94a" : BD}`,
                fontSize: 10, fontWeight: 600,
                color: esFilter === f ? T.accentLight : f === "s1" ? "#90b8e0" : f === "s2" ? "#d4b94a" : T.textTertiary,
                background: esFilter === f ? T.accentDim : "transparent",
                cursor: "pointer", fontFamily: T.font, transition: "all 0.15s",
              }}
            >
              {f === "all" ? "All" : f.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Segment list */}
        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {filtered.map(seg => {
            const isActive = seg.id === activeSegId;
            const dotColor = seg.track === "s1" ? "#90b8e0" : "#d4b94a";
            return (
              <div
                key={seg.id}
                onClick={() => {
                  setActiveSegId(seg.id);
                  // Seek video to this segment's start time
                  if (videoRef.current && seg.startSec !== undefined) {
                    videoRef.current.currentTime = seg.startSec;
                    setCurrentTime(seg.startSec);
                  }
                }}
                style={{
                  background: isActive ? "rgba(139,92,246,0.06)" : S2,
                  border: `1px solid ${isActive ? T.accentBorder : BD}`,
                  borderRadius: T.radius.md, marginBottom: 6, cursor: "pointer", transition: "border-color 0.15s",
                }}
              >
                {/* Header: timecodes + actions */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 9px 4px", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, minWidth: 0 }}>
                    <EditableTC value={seg.start} clipDuration={clipDuration} onChange={(newVal) => {
                      const newSec = parseTime(newVal);
                      setEditSegments(prev => prev.map(s => s.id === seg.id ? { ...s, startSec: newSec, start: fmtTime(newSec), dur: (s.endSec - newSec).toFixed(1) + "s" } : s));
                      setDirty(true);
                    }} />
                    <span style={{ fontSize: 9, color: T.textTertiary }}>→</span>
                    <EditableTC value={seg.end} clipDuration={clipDuration} onChange={(newVal) => {
                      const newSec = parseTime(newVal);
                      setEditSegments(prev => prev.map(s => s.id === seg.id ? { ...s, endSec: newSec, end: fmtTime(newSec), dur: (newSec - s.startSec).toFixed(1) + "s" } : s));
                      setDirty(true);
                    }} />
                    <span style={{ fontSize: 9, color: T.textTertiary, fontFamily: T.mono }}>[{seg.dur}]</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor }} title={seg.track === "s1" ? "Sub 1" : "Sub 2"} />
                    <Ib title="Split here" onClick={(e) => { e.stopPropagation(); setActiveSegId(seg.id); setTimeout(handleSplitSegment, 0); }} style={{ width: 20, height: 20, fontSize: 11 }}>⌇</Ib>
                    <Ib title="Delete segment" onClick={(e) => { e.stopPropagation(); handleDeleteSegment(seg.id); }} style={{ width: 20, height: 20, fontSize: 11 }}>✕</Ib>
                  </div>
                </div>

                {/* Text as word spans — hover highlight, click to seek, double-click to edit */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "0 9px 8px" }}>
                  <div
                    style={{
                      flex: 1, fontSize: 12.5, color: T.text, lineHeight: 1.8, minHeight: 18,
                      borderRadius: 3, padding: "2px 4px", background: isActive ? "rgba(255,255,255,0.04)" : "transparent",
                      border: isActive ? `1px solid ${BD}` : "1px solid transparent",
                      fontFamily: T.font, cursor: "text",
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    {seg.text.split(/\s+/).map((word, wi, arr) => {
                      const segDur = seg.endSec - seg.startSec;
                      const wordStart = seg.startSec + (wi / arr.length) * segDur;
                      const isSelected = selectedWordInfo && selectedWordInfo.segId === seg.id && selectedWordInfo.wordIdx === wi;
                      const wKey = `es-${seg.id}-${wi}`;
                      const isEditing = editingWordKey === wKey;

                      if (isEditing) {
                        return (
                          <input
                            key={wKey}
                            autoFocus
                            defaultValue={word}
                            onBlur={e => {
                              const newWord = e.target.value.trim();
                              if (newWord && newWord !== word) {
                                const newWords = seg.text.split(/\s+/);
                                newWords[wi] = newWord;
                                setEditSegments(prev => prev.map(s => s.id === seg.id ? { ...s, text: newWords.join(" ") } : s));
                                setDirty(true);
                              }
                              setEditingWordKey(null);
                            }}
                            onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingWordKey(null); }}
                            onClick={e => e.stopPropagation()}
                            style={{
                              width: Math.max(30, word.length * 8), fontSize: 12.5, fontFamily: T.font,
                              color: T.accentLight, background: "rgba(139,92,246,0.15)",
                              border: `1px solid ${T.accentBorder}`, borderRadius: 3,
                              padding: "1px 3px", outline: "none", display: "inline",
                            }}
                          />
                        );
                      }

                      return (
                        <span
                          key={wKey}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedWordInfo({ segId: seg.id, wordIdx: wi });
                            setActiveSegId(seg.id);
                            if (videoRef.current) {
                              videoRef.current.currentTime = wordStart;
                              setCurrentTime(wordStart);
                            }
                          }}
                          onDoubleClick={() => setEditingWordKey(wKey)}
                          style={{
                            cursor: "pointer", padding: "1px 2px", borderRadius: 2,
                            background: isSelected ? T.accentDim : "transparent",
                            color: isSelected ? T.accentLight : T.text,
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "rgba(139,92,246,0.08)"; }}
                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                        >
                          {word}{wi < arr.length - 1 ? " " : ""}
                        </span>
                      );
                    })}
                  </div>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0, marginTop: 6,
                    background: confColor[seg.conf],
                    boxShadow: seg.conf === "low" ? `0 0 4px ${T.red}` : "none",
                  }} title={`Confidence: ${seg.conf}`} />
                </div>

                {/* Warning */}
                {seg.warning && (
                  <div style={{ fontSize: 10, color: T.yellow, padding: "0 9px 7px", display: "flex", alignItems: "center", gap: 4 }}>
                    ⚠ {seg.warning}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════
  // RENDER: LEFT PANEL
  // ═══════════════════════════════════════
  const renderLeftPanel = () => {
    if (lpCollapsed) {
      return (
        <div
          onClick={() => setLpCollapsed(false)}
          title="Expand panel"
          style={{
            width: LP_GHOST_W, minWidth: LP_GHOST_W, background: T.surface, borderRight: `1px solid ${BD}`,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            color: T.textTertiary, fontSize: 16, transition: "all 0.15s", userSelect: "none",
          }}
        >
          ›
        </div>
      );
    }

    return (
      <div style={{
        width: lpWidth, minWidth: lpWidth, background: T.surface, borderRight: `1px solid ${BD}`,
        display: "flex", flexDirection: "column", overflow: "hidden", position: "relative",
      }}>
        {/* Tabs + collapse btn */}
        <div style={{ display: "flex", borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
          <PanelTab label="Transcript" active={lpTab === "transcript"} onClick={() => setLpTab("transcript")} />
          <PanelTab label="Edit Subtitles" active={lpTab === "editsubs"} onClick={() => setLpTab("editsubs")} />
          <button
            onClick={() => setLpCollapsed(true)}
            title="Collapse panel"
            style={{
              marginLeft: "auto", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
              border: "none", background: "transparent", color: T.textTertiary, cursor: "pointer", fontSize: 14,
              borderRadius: 4, alignSelf: "center", marginRight: 6, flexShrink: 0,
            }}
          >
            ‹
          </button>
        </div>

        {/* Content */}
        {lpTab === "transcript" ? renderTranscript() : renderEditSubs()}

        {/* Resize handle */}
        <div
          onMouseDown={onLpResizeStart}
          style={{
            position: "absolute", top: 0, right: -3, width: 6, height: "100%",
            cursor: "ew-resize", zIndex: 20,
          }}
        />
      </div>
    );
  };

  // ═══════════════════════════════════════
  // RENDER: CENTER PREVIEW
  // ═══════════════════════════════════════
  // ── Find active subtitle at current time ──
  const adjustedPlayTime = currentTime - syncOffset;
  const activeSubtitle = segments.find((s) => s.startSec !== undefined && adjustedPlayTime >= s.startSec && adjustedPlayTime <= s.endSec);
  const clipDuration = clip ? ((clip.endTime || 0) - (clip.startTime || 0)) : 0;
  const videoSrc = clip?.filePath ? `file://${clip.filePath.replace(/\\/g, "/")}` : null;

  const handlePreviewWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -10 : 10;
    setZoom(prev => Math.max(50, Math.min(300, prev + delta)));
  }, []);

  const renderPreview = () => (
    <div
      onWheel={handlePreviewWheel}
      style={{
        flex: 1, background: T.bg, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", overflow: "hidden", minWidth: 0,
      }}
    >
      {/* 9:16 preview */}
      <div style={{
        height: "calc(100% - 44px)", aspectRatio: "9/16", maxHeight: 600, maxWidth: 338,
        background: "#000", borderRadius: 6, position: "relative", overflow: "hidden",
        boxShadow: `0 0 0 1px ${BD}, 0 20px 60px rgba(0,0,0,0.7)`, flexShrink: 0,
        transform: `scale(${zoom / 100})`, transformOrigin: "center center",
        transition: "transform 0.1s ease-out",
      }}>
        {/* Video element — click to play/pause */}
        {videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            onClick={() => setPlaying(!playing)}
            style={{ width: "100%", height: "calc(100% - 40px)", objectFit: "cover", cursor: "pointer" }}
            preload="auto"
            muted={false}
          />
        ) : (
          <>
            <div style={{ width: "100%", height: "62%", background: "linear-gradient(180deg, #1a1a2e, #16213e)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: T.textTertiary, fontSize: 13 }}>{clip ? "Loading video..." : "No clip loaded"}</span>
            </div>
            <div style={{ width: "100%", height: "38%", background: "linear-gradient(180deg, #0d0d0d, #1a1a1a)", borderTop: "1px solid #222" }} />
          </>
        )}

        {/* Subtitle overlay — synced to playback, mode-aware */}
        {showSubs && activeSubtitle && (() => {
          const words = activeSubtitle.text.split(/\s+/);
          const segDur = activeSubtitle.endSec - activeSubtitle.startSec;
          const adjustedTime = currentTime - syncOffset;
          const elapsed = adjustedTime - activeSubtitle.startSec;
          const progress = segDur > 0 ? Math.max(0, Math.min(1, elapsed / segDur)) : 0;
          const activeWordIdx = Math.min(Math.floor(progress * words.length), words.length - 1);

          // Build dynamic text shadow from stroke/shadow settings
          const shadows = [];
          if (strokeOn) {
            const sw = Math.max(1, strokeWidth * 0.3);
            shadows.push(`-${sw}px -${sw}px 0 #000`, `${sw}px -${sw}px 0 #000`, `-${sw}px ${sw}px 0 #000`, `${sw}px ${sw}px 0 #000`);
          }
          shadows.push(shadowOn ? `0 2px ${shadowBlur}px rgba(0,0,0,0.9)` : "0 2px 8px rgba(0,0,0,0.9)");
          const subTextShadow = shadows.join(", ");

          // 1L mode: show only ~3 words around active word
          const visibleWords = lineMode === "1L"
            ? words.slice(Math.max(0, activeWordIdx - 1), Math.min(words.length, activeWordIdx + 2))
            : words;
          const visibleOffset = lineMode === "1L" ? Math.max(0, activeWordIdx - 1) : 0;

          return (
            <div style={{
              position: "absolute", bottom: "40%", left: 0, right: 0, textAlign: "center",
              padding: bgOn ? "4px 14px" : "0 14px", pointerEvents: "none",
              background: bgOn ? `rgba(0,0,0,${bgOpacity / 100})` : "transparent",
              borderRadius: bgOn ? 4 : 0,
            }}>
              <div style={{
                fontSize: Math.max(10, fontSize * 0.27), fontWeight: 800, lineHeight: 1.3,
                textShadow: subTextShadow, fontFamily: `'${subFontFamily}', sans-serif`,
              }}>
                {subMode === "word" ? (
                  /* Word×Word: show one word at a time */
                  <span style={{ color: highlightColor }}>{words[activeWordIdx] || ""}</span>
                ) : subMode === "karaoke" ? (
                  /* Karaoke: highlight only the current word */
                  visibleWords.map((w, i) => (
                    <span key={i + visibleOffset} style={{ color: (i + visibleOffset) === activeWordIdx ? highlightColor : "#fff" }}>
                      {w}{i < visibleWords.length - 1 ? " " : ""}
                    </span>
                  ))
                ) : (
                  /* Phrase: show full text (or 1L subset) */
                  lineMode === "1L" ? (
                    visibleWords.map((w, i) => (
                      <span key={i + visibleOffset} style={{ color: "#fff" }}>
                        {w}{i < visibleWords.length - 1 ? " " : ""}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "#fff" }}>{activeSubtitle.text}</span>
                  )
                )}
              </div>
            </div>
          );
        })()}

        {/* Caption overlay */}
        {captionText && (
          <div style={{ position: "absolute", bottom: videoSrc ? "12%" : "9%", left: 0, right: 0, textAlign: "center", padding: "0 10px", pointerEvents: "none" }}>
            <div style={{
              fontSize: captionFontSize, fontWeight: captionBold ? 800 : 400,
              fontStyle: captionItalic ? "italic" : "normal",
              textDecoration: captionUnderline ? "underline" : "none",
              color: captionColor, fontFamily: `'${captionFontFamily}', sans-serif`,
              textShadow: "0 2px 6px rgba(0,0,0,0.95)", lineHeight: 1.3,
            }}>
              {captionText}
            </div>
          </div>
        )}

        {/* Playback controls */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          padding: "7px 12px", background: T.surface, borderTop: `1px solid ${BD}`,
        }}>
          <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textSecondary, minWidth: 64 }}>{fmtTime(currentTime)}</span>
          <button
            onClick={() => setPlaying(!playing)}
            style={{
              width: 26, height: 26, background: T.accent, border: "none", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              color: "#fff", fontSize: 10,
            }}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textSecondary, minWidth: 64, textAlign: "right" }}>{fmtTime(clipDuration)}</span>
          <span
            onClick={() => setTlSpeed(tlSpeed === "1x" ? "2x" : "1x")}
            style={{
              fontSize: 10, fontWeight: 600, color: T.textSecondary, border: `1px solid ${BD}`,
              borderRadius: 4, padding: "2px 5px", cursor: "pointer",
            }}
          >
            {tlSpeed}
          </span>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 14px",
        background: T.surface, borderTop: `1px solid ${BD}`, width: "100%",
      }}>
        <ToolBtn active>📱 9:16</ToolBtn>
        <ToolBtn>Background</ToolBtn>
        <ToolBtn>Layouts</ToolBtn>
        <ToolBtn style={{ marginLeft: "auto" }}>⛶ Expand</ToolBtn>
      </div>
    </div>
  );

  // ═══════════════════════════════════════
  // RENDER: AI TOOLS DRAWER
  // ═══════════════════════════════════════
  const renderAIPanel = () => {
    const activeGame = gamesDb.find((g) => g.name === aiGame);
    const titles = aiSuggestions?.titles || [];
    const captions = aiSuggestions?.captions || [];

    return (
      <div>
        {/* Voice fingerprint bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", background: S2, borderBottom: `1px solid ${BD}`, gap: 8,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: T.textTertiary }}>Voice</span>
            <span style={{ fontSize: 10, color: T.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {voiceMode === "hype" ? "Hype — Gaming energy, punchy hooks" : "Chill — Laid-back, conversational"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <Pill label="🔥 Hype" active={voiceMode === "hype"} onClick={() => setVoiceMode("hype")} />
            <Pill label="😌 Chill" active={voiceMode === "chill"} onClick={() => setVoiceMode("chill")} />
          </div>
        </div>

        {/* Context textarea */}
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${BD}` }}>
          <textarea
            value={aiContext}
            onChange={e => setAiContext(e.target.value)}
            placeholder="Additional context (optional)…"
            rows={Math.max(2, aiContext.split('\n').length + 1)}
            style={{
              width: "100%", background: S2, border: `1px solid ${BD}`, borderRadius: 5,
              padding: "6px 9px", color: T.text, fontSize: 11, fontFamily: T.font,
              outline: "none", resize: "vertical", minHeight: 30, lineHeight: 1.5,
            }}
          />
        </div>

        {/* Game select + Generate */}
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${BD}`, display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={aiGame}
            onChange={(e) => setAiGame(e.target.value)}
            style={{
              background: S2, border: `1px solid ${BD}`, borderRadius: 5,
              padding: "6px 10px", fontSize: 11, color: T.textSecondary,
              cursor: "pointer", fontFamily: T.font, flexShrink: 0, outline: "none",
            }}
          >
            {gamesDb.map((g) => (
              <option key={g.tag} value={g.name}>{g.tag} — {g.name}</option>
            ))}
            <option value="Just Chatting / Off-topic">Just Chatting / Off-topic</option>
          </select>
          <button
            onClick={handleAiGenerate}
            disabled={aiGenerating || !anthropicApiKey}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              background: aiGenerating ? "rgba(255,255,255,0.06)" : (!anthropicApiKey ? "rgba(255,255,255,0.04)" : T.accent),
              color: aiGenerating || !anthropicApiKey ? T.textMuted : "#fff",
              border: "none", borderRadius: 5, padding: "6px 10px", fontSize: 11, fontWeight: 600,
              cursor: aiGenerating || !anthropicApiKey ? "default" : "pointer", fontFamily: T.font,
              opacity: !anthropicApiKey ? 0.5 : 1,
            }}
          >
            {aiGenerating ? "⏳ Generating..." : `✦ ${aiSuggestions ? "Regenerate" : "Generate"}`}
          </button>
        </div>

        {/* Error */}
        {aiError && (
          <div style={{ padding: "8px 12px", color: T.red, fontSize: 11, background: "rgba(248,113,113,0.08)", borderBottom: `1px solid ${BD}` }}>
            {aiError}
          </div>
        )}

        {/* Results or empty state */}
        {!aiSuggestions && !aiGenerating ? (
          <div style={{ padding: "28px 16px", textAlign: "center", color: T.textTertiary, fontSize: 12, lineHeight: 1.6 }}>
            {!anthropicApiKey ? (
              <>Set your <strong style={{ color: T.textSecondary }}>Anthropic API key</strong> in Settings first</>
            ) : (
              <>Set your game category,<br />add context if you want,<br />then hit <strong style={{ color: T.textSecondary }}>Generate</strong></>
            )}
          </div>
        ) : aiGenerating ? (
          <div style={{ padding: "28px 16px", textAlign: "center", color: T.textTertiary, fontSize: 12 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>✦</div>
            Generating titles & captions...
          </div>
        ) : (
          <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
            {/* Titles */}
            <SectionLabel>Titles ({titles.length})</SectionLabel>
            {titles.map((t, i) => {
              const text = t.title || t.text || "";
              const isRejected = aiRejections.includes(text);
              const isAccepted = acceptedTitleIdx === i;
              return (
                <div key={i} style={{
                  background: S2, border: `1px solid ${isAccepted ? T.green : BD}`, borderRadius: 5,
                  padding: "9px 10px", position: "relative", opacity: isRejected ? 0.35 : 1,
                  transition: "opacity 0.2s, border 0.2s",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isAccepted ? T.green : T.text, lineHeight: 1.4, paddingRight: 50, marginBottom: 4 }}>
                    {text}
                  </div>
                  <div style={{ fontSize: 10, color: T.textSecondary, lineHeight: 1.4 }}>{t.why}</div>
                  {isAccepted ? (
                    <div style={{ position: "absolute", top: 8, right: 8, fontSize: 10, color: T.green, fontWeight: 600 }}>✓ Applied</div>
                  ) : !isRejected ? (
                    <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 3 }}>
                      <Ib title="Apply as title" onClick={() => handleAiAcceptTitle(t, i)} style={{ width: 22, height: 22, fontSize: 10, border: `1px solid ${T.green}`, background: "rgba(52,211,153,0.1)", color: T.green }}>✓</Ib>
                      <Ib title="Dismiss" onClick={() => handleAiReject(text)} style={{ width: 22, height: 22, fontSize: 10, border: `1px solid ${BD}`, background: S3 }}>✕</Ib>
                    </div>
                  ) : null}
                </div>
              );
            })}

            {/* Captions */}
            <SectionLabel style={{ marginTop: 6 }}>Captions ({captions.length})</SectionLabel>
            {captions.map((c, i) => {
              const text = c.caption || c.text || "";
              const isRejected = aiRejections.includes(text);
              const isAccepted = acceptedCaptionIdx === i;
              return (
                <div key={i} style={{
                  background: S2, border: `1px solid ${isAccepted ? T.green : BD}`, borderRadius: 5,
                  padding: "9px 10px", position: "relative", opacity: isRejected ? 0.35 : 1,
                  transition: "opacity 0.2s, border 0.2s",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isAccepted ? T.green : T.text, lineHeight: 1.4, paddingRight: 50, marginBottom: 4 }}>
                    {text}
                  </div>
                  <div style={{ fontSize: 10, color: T.textSecondary, lineHeight: 1.4 }}>{c.why}</div>
                  {isAccepted ? (
                    <div style={{ position: "absolute", top: 8, right: 8, fontSize: 10, color: T.green, fontWeight: 600 }}>✓ Applied</div>
                  ) : !isRejected ? (
                    <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 3 }}>
                      <Ib title="Apply caption" onClick={() => handleAiAcceptCaption(c, i)} style={{ width: 22, height: 22, fontSize: 10, border: `1px solid ${T.green}`, background: "rgba(52,211,153,0.1)", color: T.green }}>✓</Ib>
                      <Ib title="Dismiss" onClick={() => handleAiReject(text)} style={{ width: 22, height: 22, fontSize: 10, border: `1px solid ${BD}`, background: S3 }}>✕</Ib>
                    </div>
                  ) : null}
                </div>
              );
            })}

            {/* Regenerate hint if rejections */}
            {aiRejections.length > 0 && (
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                <button
                  onClick={handleAiGenerate}
                  style={{
                    background: "transparent", border: `1px solid ${T.accentBorder}`, borderRadius: 5,
                    padding: "5px 14px", fontSize: 11, color: T.accentLight, cursor: "pointer", fontFamily: T.font,
                  }}
                >
                  ✦ Regenerate ({aiRejections.length} rejected)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════
  // RENDER: SUBTITLES DRAWER
  // ═══════════════════════════════════════
  const renderSubsPanel = () => (
    <div>
      {/* ── GLOBAL ── */}
      <div style={{ borderBottom: `2px solid ${BD}` }}>
        <div style={{ padding: "8px 13px 4px", fontSize: 9, fontWeight: 700, letterSpacing: "0.7px", textTransform: "uppercase", color: T.textTertiary }}>GLOBAL</div>

        {/* Mode */}
        <div style={{ padding: "10px 13px" }}>
          <SectionLabel>Mode</SectionLabel>
          <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
            <Pill label="Karaoke" active={subMode === "karaoke"} onClick={() => setSubMode("karaoke")} icon={<span style={{ color: T.green, fontWeight: 800 }}>the</span>} />
            <Pill label="Word" active={subMode === "word"} onClick={() => setSubMode("word")} icon={<span style={{ fontWeight: 800, fontSize: 11 }}>the</span>} />
            <Pill label="Phrase" active={subMode === "phrase"} onClick={() => setSubMode("phrase")} />
          </div>
        </div>
        <Divider />

        {/* Basic: Font + size + format */}
        <div style={{ padding: "10px 13px" }}>
          <SectionLabel>Basic</SectionLabel>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, marginBottom: 7 }}>
            <select
              value={subFontFamily}
              onChange={e => setSubFontFamily(e.target.value)}
              style={{
                flex: 1, background: S2, border: `1px solid ${BD}`, borderRadius: 5,
                padding: "6px 9px", fontSize: 11, color: T.text, cursor: "pointer",
                fontFamily: T.font, outline: "none",
              }}
            >
              {["Montserrat", "DM Sans", "Impact", "Arial", "Roboto", "Georgia"].map(f =>
                <option key={f} value={f}>{f}</option>
              )}
            </select>
            <NumBox value={fontSize} onChange={setFontSize} min={8} max={120} />
          </div>

          {/* Format toolbar row 1 */}
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Ib title="As typed" active style={{ fontSize: 12 }}>Aa</Ib>
            <Ib title="Uppercase" style={{ fontSize: 12 }}>AB</Ib>
            <div style={{ width: 1, height: 16, background: BD, margin: "0 2px" }} />
            <Ib title="Align left" active style={{ fontSize: 12 }}>☰</Ib>
            <Ib title="Align center" style={{ fontSize: 12 }}>☰</Ib>
            <Ib title="Align right" style={{ fontSize: 12 }}>☰</Ib>
            <div style={{ width: 1, height: 16, background: BD, margin: "0 2px" }} />
            <Ib title="Italic" style={{ fontSize: 12, fontStyle: "italic" }}>I</Ib>
            <Ib title="Bold" active style={{ fontSize: 12, fontWeight: 800 }}>B</Ib>
            <Ib title="Underline" style={{ fontSize: 12, textDecoration: "underline" }}>U</Ib>
          </div>

          {/* Format toolbar row 2 */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, marginTop: 5 }}>
            <Ib title="1 line (~3 words)" active={lineMode === "1L"} onClick={() => setLineMode("1L")} style={{ fontSize: 9, fontWeight: 700 }}>1L</Ib>
            <Ib title="2 lines (full phrase)" active={lineMode === "2L"} onClick={() => setLineMode("2L")} style={{ fontSize: 9, fontWeight: 700 }}>2L</Ib>
            <div style={{ width: 1, height: 16, background: BD, margin: "0 2px" }} />
            <SwatchBtn color="#fff" size={18} style={{ border: "1px solid #555" }} />
            <SwatchBtn color={highlightColor} size={18} style={{ marginLeft: 4 }} />
          </div>
        </div>
        <Divider />

        {/* Stroke */}
        <div style={{ padding: "10px 13px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <SectionLabel>Stroke</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: T.textSecondary }}>{strokeWidth}</span>
              <SwatchBtn color="#000" size={18} />
              <Ib onClick={() => setStrokeOn(!strokeOn)} style={{ width: 20, height: 20, fontSize: 13, border: `1px solid ${BD}`, background: S2 }}>
                {strokeOn ? "−" : "+"}
              </Ib>
            </div>
          </div>
          {strokeOn && (
            <div style={{ marginTop: 6 }}>
              <SliderRow value={strokeWidth} onChange={setStrokeWidth} min={0} max={20} />
            </div>
          )}
        </div>
        <Divider />

        {/* Shadow */}
        <div style={{ padding: "10px 13px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <SectionLabel>Shadow</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <SwatchBtn color="#000" size={18} style={{ opacity: 0.4 }} />
              <Ib onClick={() => setShadowOn(!shadowOn)} style={{ width: 20, height: 20, fontSize: 13, border: `1px solid ${BD}`, background: S2 }}>
                {shadowOn ? "−" : "+"}
              </Ib>
            </div>
          </div>
          {shadowOn && (
            <div style={{ marginTop: 8 }}>
              <SliderRow label="Blur" value={shadowBlur} onChange={setShadowBlur} min={0} max={30} />
            </div>
          )}
        </div>
        <Divider />

        {/* Background */}
        <div style={{ padding: "10px 13px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <SectionLabel>Background</SectionLabel>
            <Ib onClick={() => setBgOn(!bgOn)} style={{ width: 20, height: 20, fontSize: 13, border: `1px solid ${BD}`, background: S2 }}>
              {bgOn ? "−" : "+"}
            </Ib>
          </div>
          {bgOn && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <SwatchBtn color="#000" size={24} />
                <SliderRow label="Opacity" value={bgOpacity} onChange={setBgOpacity} suffix="%" />
              </div>
            </div>
          )}
        </div>
        <Divider />

        {/* Highlight */}
        <div style={{ padding: "10px 13px" }}>
          <SectionLabel>Highlight</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {highlights.map(c => (
              <SwatchBtn
                key={c}
                color={c}
                size={22}
                selected={highlightColor === c}
                onClick={() => setHighlightColor(c)}
                style={{ borderRadius: "50%", border: c === "#ffffff" ? "1px solid #555" : undefined }}
              />
            ))}
            <div style={{
              width: 22, height: 22, borderRadius: "50%", border: `1px dashed ${BDH}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: T.textTertiary, fontSize: 13, cursor: "pointer",
            }}>+</div>
          </div>
        </div>
        <Divider />

        {/* Position */}
        <div style={{ padding: "10px 13px" }}>
          <SectionLabel>Position</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
            <PosGrid value={subPos} onChange={setSubPos} />
          </div>
        </div>
        <Divider />

        {/* Punctuation */}
        <div style={{ padding: "10px 13px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <SectionLabel>Punctuation</SectionLabel>
            <Toggle on={punctOn} onClick={() => setPunctOn(!punctOn)} />
          </div>
          <div style={{ opacity: punctOn ? 1 : 0.35, pointerEvents: punctOn ? "auto" : "none", marginTop: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {[", Commas", ". Periods", "? Questions", "! Exclamation", "… Ellipsis", ": Colons"].map((p, i) => (
                <label key={p} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: T.textSecondary, cursor: "pointer", padding: "3px 0" }}>
                  <input type="checkbox" defaultChecked={i < 2 || i === 4} style={{ accentColor: T.accent, width: 12, height: 12 }} />
                  <span>{p}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <Divider />

        {/* Sync offset */}
        <div style={{ padding: "10px 13px" }}>
          <SectionLabel>Sync Offset</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <input type="range" min={-10} max={10} step={1} value={syncOffset * 10}
              onChange={e => setSyncOffset(Number(e.target.value) / 10)}
              style={{ flex: 1, height: 3, accentColor: T.accent, cursor: "pointer" }}
            />
            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textSecondary, minWidth: 40, textAlign: "right" }}>
              {syncOffset > 0 ? "+" : ""}{syncOffset.toFixed(1)}s
            </span>
          </div>
        </div>
        <Divider />

        {/* Quick toggles */}
        <div style={{ padding: "10px 13px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: T.textSecondary }}>Show subtitles</span>
            <Toggle on={showSubs} onClick={() => setShowSubs(!showSubs)} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: 11, color: T.textSecondary }}>Emoji</span>
            <Toggle on={emojiOn} onClick={() => setEmojiOn(!emojiOn)} />
          </div>
        </div>
      </div>

      {/* ── Sub 1 accordion ── */}
      <div style={{ borderBottom: `1px solid ${BD}` }}>
        <div onClick={() => setS1Open(!s1Open)} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 13px", cursor: "pointer", userSelect: "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#90b8e0" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>Sub 1</span>
            <span style={{ fontSize: 10, color: T.accentLight, background: T.accentDim, borderRadius: 10, padding: "1px 7px" }}>1 override</span>
          </div>
          <span style={{ fontSize: 14, color: T.textTertiary, transform: s1Open ? "rotate(90deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>›</span>
        </div>
        {s1Open && (
          <div style={{ borderTop: `1px solid ${BD}` }}>
            <div style={{ padding: "7px 13px", fontSize: 10, color: T.textTertiary, background: "rgba(139,92,246,0.06)", borderBottom: `1px solid ${BD}` }}>
              Changes here override Global for Sub 1 only.
            </div>
            <div style={{ padding: "10px 13px" }}>
              <SectionLabel>Size <span style={{ fontSize: 9, color: T.accentLight, fontWeight: 500, marginLeft: 4 }}>overriding global (52)</span></SectionLabel>
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <NumBox value={64} onChange={() => {}} />
                <button style={{ fontSize: 10, color: T.accentLight, background: "transparent", border: `1px solid ${T.accentBorder}`, borderRadius: 5, padding: "2px 7px", cursor: "pointer", fontFamily: T.font }}>↺</button>
              </div>
            </div>
            <Divider />
            <div style={{ padding: "10px 13px" }}>
              <SectionLabel>Highlight</SectionLabel>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {highlights.map(c => <SwatchBtn key={c} color={c} size={22} style={{ borderRadius: "50%", border: c === "#ffffff" ? "1px solid #555" : undefined }} selected={c === "#f4c430"} />)}
              </div>
            </div>
            <div style={{ padding: "10px 13px", borderTop: `1px solid ${BD}` }}>
              <button style={{
                width: "100%", background: "transparent", border: `1px solid ${BDH}`, borderRadius: 5,
                padding: 6, fontSize: 11, color: T.textSecondary, cursor: "pointer", fontFamily: T.font,
              }}>
                ↺ Reset all Sub 1 overrides
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Sub 2 accordion ── */}
      <div style={{ borderBottom: `1px solid ${BD}` }}>
        <div onClick={() => setS2Open(!s2Open)} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 13px", cursor: "pointer", userSelect: "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#d4b94a" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>Sub 2</span>
            <span style={{ fontSize: 10, color: T.accentLight, background: T.accentDim, borderRadius: 10, padding: "1px 7px" }}>2 overrides</span>
          </div>
          <span style={{ fontSize: 14, color: T.textTertiary, transform: s2Open ? "rotate(90deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>›</span>
        </div>
        {s2Open && (
          <div style={{ borderTop: `1px solid ${BD}` }}>
            <div style={{ padding: "7px 13px", fontSize: 10, color: T.textTertiary, background: "rgba(139,92,246,0.06)", borderBottom: `1px solid ${BD}` }}>
              Changes here override Global for Sub 2 only.
            </div>
            <div style={{ padding: "10px 13px" }}>
              <SectionLabel>Mode <span style={{ fontSize: 9, color: T.accentLight, fontWeight: 500, marginLeft: 4 }}>overriding global (Karaoke)</span></SectionLabel>
              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                <Pill label="Karaoke" active={false} onClick={() => {}} />
                <Pill label="Word" active onClick={() => {}} />
                <Pill label="Phrase" active={false} onClick={() => {}} />
              </div>
              <div style={{ marginTop: 6 }}>
                <button style={{ fontSize: 10, color: T.accentLight, background: "transparent", border: `1px solid ${T.accentBorder}`, borderRadius: 5, padding: "2px 7px", cursor: "pointer", fontFamily: T.font }}>↺ Reset</button>
              </div>
            </div>
            <Divider />
            <div style={{ padding: "10px 13px" }}>
              <SectionLabel>Highlight <span style={{ fontSize: 9, color: T.accentLight, fontWeight: 500, marginLeft: 4 }}>overriding global (Green)</span></SectionLabel>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {highlights.map(c => <SwatchBtn key={c} color={c} size={22} style={{ borderRadius: "50%", border: c === "#ffffff" ? "1px solid #555" : undefined }} selected={c === "#e63946"} />)}
              </div>
              <div style={{ marginTop: 6 }}>
                <button style={{ fontSize: 10, color: T.accentLight, background: "transparent", border: `1px solid ${T.accentBorder}`, borderRadius: 5, padding: "2px 7px", cursor: "pointer", fontFamily: T.font }}>↺ Reset</button>
              </div>
            </div>
            <div style={{ padding: "10px 13px", borderTop: `1px solid ${BD}` }}>
              <button style={{
                width: "100%", background: "transparent", border: `1px solid ${BDH}`, borderRadius: 5,
                padding: 6, fontSize: 11, color: T.textSecondary, cursor: "pointer", fontFamily: T.font,
              }}>
                ↺ Reset all Sub 2 overrides
              </button>
            </div>
          </div>
        )}
      </div>
      <div style={{ height: 20 }} />
    </div>
  );

  // ═══════════════════════════════════════
  // RENDER: BRAND KIT DRAWER
  // ═══════════════════════════════════════
  const renderBrandPanel = () => (
    <div>
      {/* Apply CTA */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 13px", background: T.accentDim, borderBottom: `1px solid ${T.accentBorder}`,
      }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.text, display: "block" }}>Gaming Default</span>
          <span style={{ fontSize: 10, color: T.accentLight, display: "block", marginTop: 2 }}>Active preset</span>
        </div>
        <button style={{
          background: T.accent, color: "#fff", border: "none", borderRadius: 5,
          padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
        }}>
          ↳ Apply to clip
        </button>
      </div>

      {/* Style Presets */}
      <div style={{ padding: "10px 13px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <SectionLabel>Style Presets</SectionLabel>
          <button style={{
            fontSize: 10, color: T.accentLight, background: "transparent",
            border: `1px solid ${T.accentBorder}`, borderRadius: 5, padding: "2px 8px",
            cursor: "pointer", fontFamily: T.font,
          }}>+ Save current</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {brandPresets.map(p => (
            <div
              key={p.id}
              onClick={() => setActivePreset(p.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                background: activePreset === p.id ? T.accentDim : S2,
                border: `1px solid ${activePreset === p.id ? T.accentBorder : BD}`,
                borderRadius: 5, cursor: "pointer", transition: "all 0.15s",
              }}
            >
              <div style={{
                width: 44, height: 32, background: S3, borderRadius: 4,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 2, flexShrink: 0,
              }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: "#fff" }}>AB</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: T.text, display: "block" }}>{p.name}</span>
                <span style={{ fontSize: 10, color: T.textSecondary, display: "block", marginTop: 2 }}>{p.detail}</span>
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  {p.tracks.map(t => {
                    const tc = t === "Sub 1" ? "#90b8e0" : t === "Sub 2" ? "#d4b94a" : t === "Caption" ? T.green : T.accentLight;
                    return (
                      <span key={t} style={{
                        fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                        background: `${tc}33`, color: tc,
                      }}>{t}</span>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Divider />

      {/* Brand Colors */}
      <div style={{ padding: "10px 13px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <SectionLabel>Brand Colors</SectionLabel>
          <button style={{ fontSize: 10, color: T.accentLight, background: "transparent", border: `1px solid ${T.accentBorder}`, borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontFamily: T.font }}>+ Add</button>
        </div>
        {[
          { name: "Fega Purple", hex: "#7C5CBF", color: "#7c5cbf" },
          { name: "Karaoke Green", hex: "#4CCE8A", color: "#4cce8a" },
          { name: "Clean White", hex: "#FFFFFF", color: "#fff" },
          { name: "Hype Red", hex: "#E63946", color: "#e63946" },
        ].map(c => (
          <div key={c.hex} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", borderRadius: 5, cursor: "pointer" }}>
            <div style={{ width: 22, height: 22, borderRadius: 5, background: c.color, border: c.color === "#fff" ? "1px solid #444" : "none" }} />
            <span style={{ flex: 1, fontSize: 11, color: T.textSecondary }}>{c.name}</span>
            <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textTertiary }}>{c.hex}</span>
          </div>
        ))}
      </div>
      <Divider />

      {/* Fonts */}
      <div style={{ padding: "10px 13px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <SectionLabel>Fonts</SectionLabel>
          <button style={{ fontSize: 10, color: T.accentLight, background: "transparent", border: `1px solid ${T.accentBorder}`, borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontFamily: T.font }}>+ Add</button>
        </div>
        {[
          { name: "Montserrat", weight: "Bold · 900", badge: "Primary", active: true },
          { name: "DM Sans", weight: "Regular · 400", badge: "Secondary", active: false },
        ].map(f => (
          <div key={f.name} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 5,
            background: f.active ? T.accentDim : S2, border: `1px solid ${f.active ? T.accentBorder : BD}`,
            borderRadius: 5, cursor: "pointer",
          }}>
            <span style={{ width: 32, textAlign: "center", color: T.text, fontWeight: f.active ? 900 : 400, fontSize: f.active ? 15 : 13 }}>Aa</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: T.text, display: "block" }}>{f.name}</span>
              <span style={{ fontSize: 10, color: T.textSecondary, display: "block", marginTop: 1 }}>{f.weight}</span>
            </div>
            <span style={{
              fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 10,
              background: f.active ? T.accent : S3, color: f.active ? "#fff" : T.textSecondary,
            }}>{f.badge}</span>
          </div>
        ))}
      </div>
      <Divider />

      {/* Watermark */}
      <div style={{ padding: "10px 13px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <SectionLabel>Watermark</SectionLabel>
          <Toggle on={wmOn} onClick={() => setWmOn(!wmOn)} />
        </div>
        <div style={{ opacity: wmOn ? 1 : 0.35, pointerEvents: wmOn ? "auto" : "none" }}>
          <div style={{
            border: `1px dashed ${BDH}`, borderRadius: 5, padding: 16, textAlign: "center",
            fontSize: 11, color: T.textTertiary, cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}>
            <span style={{ fontSize: 20, opacity: 0.4 }}>◈</span>
            <span>Drop logo here or click to upload</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <span style={{ fontSize: 11, color: T.textSecondary }}>Position</span>
            <PosGrid value={wmPos} onChange={setWmPos} cellSize={12} gap={3} width={54} />
          </div>
          <div style={{ marginTop: 8 }}>
            <SliderRow label="Opacity" value={wmOpacity} onChange={setWmOpacity} min={10} max={100} suffix="%" />
          </div>
        </div>
      </div>
      <div style={{ height: 20 }} />
    </div>
  );

  // ═══════════════════════════════════════
  // RENDER: MEDIA DRAWER
  // ═══════════════════════════════════════
  const renderMediaPanel = () => {
    const filtered = mediaFilter === "all" ? mediaAssets : mediaAssets.filter(a => a.type === mediaFilter);
    const typeBadgeColors = { image: { bg: "rgba(139,92,246,0.2)", color: T.accentLight }, gif: { bg: "rgba(251,191,36,0.15)", color: T.yellow }, audio: { bg: "rgba(52,211,153,0.15)", color: T.green } };

    return (
      <div>
        {/* Upload drop zone */}
        <div style={{
          margin: 12, border: `1.5px dashed ${BDH}`, borderRadius: T.radius.md,
          padding: "18px 12px", textAlign: "center", cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
        }}>
          <span style={{ fontSize: 22, opacity: 0.35 }}>⊞</span>
          <span style={{ fontSize: 12, color: T.textSecondary }}>Drop files here or <span style={{ color: T.accentLight, cursor: "pointer" }}>browse</span></span>
          <span style={{ fontSize: 10, color: T.textTertiary }}>Images · GIFs · Audio</span>
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${BD}`, padding: "0 12px", gap: 2 }}>
          {["all", "image", "gif", "audio"].map(f => (
            <button
              key={f}
              onClick={() => setMediaFilter(f)}
              style={{
                padding: "7px 10px", fontSize: 11, fontWeight: 500,
                color: mediaFilter === f ? T.text : T.textSecondary,
                borderBottom: `2px solid ${mediaFilter === f ? T.accent : "transparent"}`,
                background: "transparent", border: "none", cursor: "pointer", fontFamily: T.font,
              }}
            >
              {f === "all" ? "All" : f === "image" ? "Images" : f === "gif" ? "GIFs" : "Audio"}
            </button>
          ))}
        </div>

        {/* Asset grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "10px 12px", overflowY: "auto" }}>
          {filtered.map(asset => {
            const tc = typeBadgeColors[asset.type];
            const isAudio = asset.type === "audio";
            return (
              <div
                key={asset.id}
                style={{
                  background: S2, border: `1px solid ${BD}`, borderRadius: 5,
                  overflow: "hidden", position: "relative", cursor: "pointer",
                  gridColumn: isAudio ? "span 2" : undefined,
                }}
              >
                {/* Thumbnail */}
                <div style={{
                  width: "100%", height: 70, background: isAudio
                    ? "linear-gradient(135deg, #1a1a2e, #16213e)"
                    : asset.type === "gif" ? S3 : "linear-gradient(135deg, #7c5cbf, #4a3080)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {isAudio ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 30 }}>
                      {[8,18,24,14,28,16,20,10].map((h, i) => (
                        <span key={i} style={{ display: "block", width: 3, height: h, background: T.accent, borderRadius: 2 }} />
                      ))}
                    </div>
                  ) : asset.type === "gif" ? (
                    <span style={{ fontSize: 16 }}>{asset.name === "Hype" ? "🔥" : "💀"}</span>
                  ) : (
                    <span style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>F</span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 7px", gap: 4 }}>
                  <span style={{ fontSize: 10, color: T.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{asset.name}</span>
                  <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: tc.bg, color: tc.color, flexShrink: 0 }}>{asset.ext}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════
  // RENDER: CAPTION PANEL
  // ═══════════════════════════════════════
  const renderCaptionPanel = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Caption text editing */}
      <div style={{ padding: "10px 13px", borderBottom: `1px solid ${BD}` }}>
        <SectionLabel>Caption Text</SectionLabel>
        <textarea
          value={captionText}
          onChange={e => { setCaptionText(e.target.value); setDirty(true); }}
          placeholder="Enter caption text…"
          rows={3}
          style={{
            width: "100%", background: S2, border: `1px solid ${BD}`, borderRadius: 5,
            padding: "8px 10px", color: T.text, fontSize: 13, fontFamily: T.font,
            outline: "none", resize: "vertical", marginTop: 8, lineHeight: 1.5,
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Font family + size */}
      <div style={{ padding: "10px 13px", borderBottom: `1px solid ${BD}` }}>
        <SectionLabel>Font</SectionLabel>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
          <select
            value={captionFontFamily}
            onChange={e => { setCaptionFontFamily(e.target.value); setDirty(true); }}
            style={{
              flex: 1, background: S2, border: `1px solid ${BD}`, borderRadius: 5,
              padding: "6px 10px", fontSize: 11, color: T.text, cursor: "pointer",
              fontFamily: T.font, outline: "none",
            }}
          >
            {["Montserrat", "DM Sans", "Impact", "Arial", "Roboto", "Georgia", "Courier New"].map(f =>
              <option key={f} value={f}>{f}</option>
            )}
          </select>
          <NumBox value={captionFontSize} onChange={v => { setCaptionFontSize(v); setDirty(true); }} min={8} max={72} />
        </div>
      </div>

      {/* Color */}
      <div style={{ padding: "10px 13px", borderBottom: `1px solid ${BD}` }}>
        <SectionLabel>Color</SectionLabel>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {["#ffffff", "#f4c430", "#4cce8a", "#e63946", T.accent, "#22d3ee"].map(c => (
            <SwatchBtn key={c} color={c} size={22} selected={captionColor === c}
              onClick={() => { setCaptionColor(c); setDirty(true); }}
            />
          ))}
        </div>
      </div>

      {/* Format: B/I/U */}
      <div style={{ padding: "10px 13px" }}>
        <SectionLabel>Format</SectionLabel>
        <div style={{ display: "flex", gap: 2, marginTop: 8 }}>
          <Ib title="Bold" active={captionBold} onClick={() => { setCaptionBold(!captionBold); setDirty(true); }}
            style={{ fontSize: 12, fontWeight: 800 }}>B</Ib>
          <Ib title="Italic" active={captionItalic} onClick={() => { setCaptionItalic(!captionItalic); setDirty(true); }}
            style={{ fontSize: 12, fontStyle: "italic" }}>I</Ib>
          <Ib title="Underline" active={captionUnderline} onClick={() => { setCaptionUnderline(!captionUnderline); setDirty(true); }}
            style={{ fontSize: 12, textDecoration: "underline" }}>U</Ib>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════
  // RENDER: RIGHT ZONE (DRAWER + RAIL)
  // ═══════════════════════════════════════
  const renderDrawerContent = () => {
    switch (activePanel) {
      case "ai": return renderAIPanel();
      case "subs": return renderSubsPanel();
      case "head": return renderCaptionPanel();
      case "brand": return renderBrandPanel();
      case "media": return renderMediaPanel();
      default: return (
        <div style={{ padding: 20, textAlign: "center", color: T.textTertiary, fontSize: 12 }}>
          {activePanel.charAt(0).toUpperCase() + activePanel.slice(1)} panel — coming soon
        </div>
      );
    }
  };

  const panelLabels = { ai: "AI Tools", subs: "Subtitles", head: "Caption", brand: "Brand Kit", audio: "Audio", media: "Media", text: "Text" };

  const renderRightZone = () => (
    <div style={{ display: "flex", alignItems: "stretch", borderLeft: `1px solid ${BD}`, position: "relative" }}>
      {/* Drawer */}
      {drawerOpen && (
        <div style={{
          width: drawerWidth, overflow: "hidden", background: T.surface,
          display: "flex", flexDirection: "column", borderRight: `1px solid ${BD}`, position: "relative",
        }}>
          {/* Drawer resize handle */}
          <div
            onMouseDown={onDrawerResizeStart}
            style={{ position: "absolute", top: 0, left: 0, width: 5, height: "100%", cursor: "ew-resize", zIndex: 30 }}
          />

          {/* Drawer header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 14px", borderBottom: `1px solid ${BD}`, flexShrink: 0, minWidth: 260,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{panelLabels[activePanel]}</span>
            <button
              onClick={() => setDrawerOpen(false)}
              style={{
                width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                border: "none", background: "transparent", color: T.textSecondary, cursor: "pointer",
                borderRadius: 4, fontSize: 13,
              }}
            >✕</button>
          </div>

          {/* Drawer body */}
          <div style={{ flex: 1, overflowY: "auto", minWidth: 260 }}>
            {renderDrawerContent()}
          </div>
        </div>
      )}

      {/* Rail */}
      <div style={{
        width: RAIL_W, minWidth: RAIL_W, background: T.surface,
        display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0", gap: 2,
      }}>
        {railItems.map((item, i) => {
          const prevGroup = i > 0 ? railItems[i - 1].group : item.group;
          return (
            <React.Fragment key={item.id}>
              {i > 0 && item.group !== prevGroup && (
                <div style={{ width: 50, height: 1, background: BD, margin: "4px 0" }} />
              )}
              <button
                onClick={() => togglePanel(item.id)}
                style={{
                  width: 70, minHeight: 54, display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 4, borderRadius: 5, cursor: "pointer",
                  background: activePanel === item.id && drawerOpen ? T.accentDim : "transparent",
                  color: activePanel === item.id && drawerOpen ? T.accentLight : T.textSecondary,
                  fontSize: 10, fontWeight: 500, textAlign: "center", padding: "6px 4px",
                  border: "none", fontFamily: T.font, userSelect: "none", transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );

  // ═══════════════════════════════════════
  // RENDER: TIMELINE
  // ═══════════════════════════════════════
  const renderTimeline = () => {
    const effectiveHeight = tlCollapsed ? TL_COLLAPSED_H : tlHeight;

    return (
      <div style={{
        height: effectiveHeight, minHeight: tlCollapsed ? TL_COLLAPSED_H : TL_MIN,
        maxHeight: tlCollapsed ? TL_COLLAPSED_H : TL_MAX,
        background: T.surface, borderTop: `1px solid ${BD}`,
        display: "flex", flexDirection: "column", overflow: "hidden",
        position: tlOverlay ? "absolute" : "relative",
        ...(tlOverlay ? { bottom: 0, left: 0, right: 0, zIndex: 40, boxShadow: "0 -8px 32px rgba(0,0,0,0.7)", background: "rgba(17,18,24,0.97)", backdropFilter: "blur(8px)" } : {}),
        flexShrink: 0,
      }}>
        {/* Resize handle */}
        {!tlCollapsed && (
          <div
            onMouseDown={onTlResizeStart}
            style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, cursor: "ns-resize", zIndex: 20 }}
          />
        )}

        {/* Toolbar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
          borderBottom: tlCollapsed ? "none" : `1px solid ${BD}`,
          height: 36, minHeight: 36, marginTop: tlCollapsed ? 0 : 4,
          borderTop: tlCollapsed ? `1px solid ${BD}` : "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Ib title="Split">⌇</Ib>
            <Ib title="Select">A</Ib>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <Ib onClick={() => setTlZoom(Math.max(0.5, tlZoom - 0.25))}>−</Ib>
            <input type="range" min={50} max={400} value={tlZoom * 100}
              onChange={e => setTlZoom(Number(e.target.value) / 100)}
              style={{ width: 60, height: 3, accentColor: T.accent, cursor: "pointer" }}
            />
            <Ib onClick={() => setTlZoom(Math.min(4, tlZoom + 0.25))}>+</Ib>
            <span style={{ fontSize: 9, color: T.textTertiary, fontFamily: T.mono }}>{Math.round(tlZoom * 100)}%</span>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textSecondary }}>{fmtTime(currentTime)} / {fmtTime(clipDuration)}</span>
          <Ib onClick={() => setPlaying(!playing)}>{playing ? "⏸" : "▶"}</Ib>
          <span
            onClick={() => setTlSpeed(tlSpeed === "1x" ? "2x" : "1x")}
            style={{
              fontSize: 11, fontWeight: 600, color: T.textSecondary, border: `1px solid ${BD}`,
              borderRadius: 4, padding: "2px 6px", cursor: "pointer",
            }}
          >{tlSpeed}</span>
          <Ib onClick={() => setTlCollapsed(!tlCollapsed)} title={tlCollapsed ? "Expand timeline" : "Collapse timeline"} style={{ marginLeft: 6 }}>
            {tlCollapsed ? "⊞" : "⊟"}
          </Ib>
          <Ib onClick={() => setTlOverlay(!tlOverlay)} title="Float timeline" active={tlOverlay}>⧉</Ib>
        </div>

        {/* Timeline area (hidden when collapsed) */}
        {!tlCollapsed && (() => {
          const dur = clipDuration || 1;
          const contentW = Math.max(500, 500 * tlZoom);
          const s1Segs = editSegments.filter(s => s.track === "s1");
          const s2Segs = editSegments.filter(s => s.track === "s2");
          const hasSub2 = s2Segs.length > 0;
          const visibleTracks = tracks.filter(t => t.id !== "s2" || hasSub2);

          // Ruler marks — adaptive step based on zoom + duration
          const rulerStep = dur <= 10 ? 1 : dur <= 30 ? 2 : dur <= 60 ? 5 : 10;
          const rulerMarks = [];
          for (let t = 0; t <= dur; t += rulerStep) rulerMarks.push(t);

          // Scrub handler — calculates time from mouse X position in content area
          const scrubFromEvent = (e) => {
            const scrollEl = timelineContentRef.current;
            if (!scrollEl) return;
            const rect = scrollEl.getBoundingClientRect();
            const scrollLeft = scrollEl.scrollLeft;
            const xInContent = e.clientX - rect.left + scrollLeft - 104; // subtract label width
            const ratio = Math.max(0, Math.min(1, xInContent / contentW));
            const newTime = ratio * dur;
            if (videoRef.current) videoRef.current.currentTime = newTime;
            setCurrentTime(newTime);
          };

          const handleTimelineMouseDown = (e) => {
            e.preventDefault();
            setTlScrubbing(true);
            setPlaying(false);
            scrubFromEvent(e);
          };

          return (
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {/* Shared scrollable container for ruler + tracks */}
              <div
                ref={timelineContentRef}
                style={{ flex: 1, overflowX: "auto", overflowY: "auto", position: "relative" }}
              >
                {/* Ruler row — sticky at top */}
                <div
                  onMouseDown={handleTimelineMouseDown}
                  style={{
                    display: "flex", height: 22, minHeight: 22, background: S2,
                    borderBottom: `1px solid ${BD}`, position: "sticky", top: 0, zIndex: 6,
                    cursor: "crosshair",
                  }}
                >
                  {/* Ruler label area */}
                  <div style={{
                    width: 104, minWidth: 104, borderRight: `1px solid ${BD}`, background: S2,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 8, color: T.textTertiary, fontFamily: T.mono, flexShrink: 0,
                  }}>TIME</div>
                  {/* Ruler marks — absolute positioned */}
                  <div style={{ flex: 1, position: "relative", minWidth: contentW, height: "100%" }}>
                    {rulerMarks.map(t => (
                      <div key={t} style={{
                        position: "absolute", left: `${(t / dur) * 100}%`, bottom: 0, height: "100%",
                        display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "flex-start",
                      }}>
                        <span style={{
                          fontSize: 9, fontFamily: T.mono, color: T.textTertiary,
                          position: "absolute", top: 3, left: 3, whiteSpace: "nowrap",
                        }}>{t}s</span>
                        <div style={{ width: 1, height: 6, background: BDH }} />
                      </div>
                    ))}
                    {/* Ruler playhead */}
                    {dur > 0 && (
                      <div style={{
                        position: "absolute", left: `${(currentTime / dur) * 100}%`, top: 0, bottom: 0,
                        width: 2, background: T.accentLight, pointerEvents: "none", zIndex: 5,
                        transform: "translateX(-1px)",
                      }}>
                        <div style={{
                          position: "absolute", bottom: -2, left: -4, width: 0, height: 0,
                          borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
                          borderBottom: `5px solid ${T.accentLight}`,
                        }} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Track rows */}
                <div style={{ position: "relative" }}>
                  {visibleTracks.map(track => (
                    <div key={track.id} style={{
                      display: "flex", alignItems: "center", borderBottom: `1px solid ${BD}`, flexShrink: 0,
                      minHeight: track.type === "video" ? 30 : track.type === "audio" ? 32 : 26,
                    }}>
                      {/* Label */}
                      <div style={{
                        width: 104, minWidth: 104, padding: "0 8px", fontSize: 9, fontWeight: 600,
                        color: T.textTertiary, borderRight: `1px solid ${BD}`, height: "100%",
                        display: "flex", alignItems: "center", background: S2, textTransform: "uppercase",
                        letterSpacing: "0.3px", gap: 5, flexShrink: 0,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: track.color, flexShrink: 0 }} />
                        {track.label}
                      </div>

                      {/* Content — real data */}
                      <div
                        onMouseDown={handleTimelineMouseDown}
                        style={{ flex: 1, height: "100%", position: "relative", minWidth: contentW, cursor: "crosshair" }}
                      >
                        {/* CAPTION: full-duration block */}
                        {track.id === "cap" && (
                          <div style={{
                            position: "absolute", top: 3, left: 4, right: 4, height: 20,
                            borderRadius: 3, background: "rgba(139,92,246,0.3)", border: "1px solid rgba(139,92,246,0.5)",
                            color: "#c4b0ef", fontSize: 9.5, fontWeight: 500, display: "flex", alignItems: "center",
                            padding: "0 7px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                            cursor: "default", pointerEvents: "none",
                          }}>{captionText || clipTitle || "Caption"}</div>
                        )}

                        {/* SUB 1: draggable segments */}
                        {track.id === "s1" && s1Segs.map(seg => {
                          const isActive = seg.id === activeSegId;
                          return (
                            <div key={seg.id}
                              onMouseDown={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const xInSeg = e.clientX - rect.left;
                                const mode = xInSeg < 6 ? "resize-l" : xInSeg > rect.width - 6 ? "resize-r" : "move";
                                handleSegMouseDown(e, seg.id, mode);
                              }}
                              style={{
                                position: "absolute", top: 3, height: 20, borderRadius: 3,
                                left: `${(seg.startSec / dur) * 100}%`,
                                width: `${Math.max(0.5, ((seg.endSec - seg.startSec) / dur) * 100)}%`,
                                background: isActive ? "rgba(139,92,246,0.3)" : "rgba(76,130,200,0.25)",
                                border: isActive ? "1.5px solid rgba(139,92,246,0.8)" : "1px solid rgba(76,130,200,0.4)",
                                color: "#90b8e0", fontSize: 8, fontWeight: 500, display: "flex", alignItems: "center",
                                padding: "0 6px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                                cursor: "grab", zIndex: isActive ? 3 : 2, userSelect: "none",
                              }}
                              title={seg.text}
                            >
                              {/* Left resize handle */}
                              <div style={{ position: "absolute", left: 0, top: 0, width: 6, height: "100%", cursor: "ew-resize", zIndex: 4 }} />
                              <span style={{ pointerEvents: "none" }}>{seg.text}</span>
                              {/* Right resize handle */}
                              <div style={{ position: "absolute", right: 0, top: 0, width: 6, height: "100%", cursor: "ew-resize", zIndex: 4 }} />
                            </div>
                          );
                        })}

                        {/* SUB 2: draggable segments */}
                        {track.id === "s2" && s2Segs.map(seg => {
                          const isActive = seg.id === activeSegId;
                          return (
                            <div key={seg.id}
                              onMouseDown={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const xInSeg = e.clientX - rect.left;
                                const mode = xInSeg < 6 ? "resize-l" : xInSeg > rect.width - 6 ? "resize-r" : "move";
                                handleSegMouseDown(e, seg.id, mode);
                              }}
                              style={{
                                position: "absolute", top: 3, height: 20, borderRadius: 3,
                                left: `${(seg.startSec / dur) * 100}%`,
                                width: `${Math.max(0.5, ((seg.endSec - seg.startSec) / dur) * 100)}%`,
                                background: isActive ? "rgba(139,92,246,0.3)" : "rgba(210,170,40,0.2)",
                                border: isActive ? "1.5px solid rgba(139,92,246,0.8)" : "1px solid rgba(210,170,40,0.4)",
                                color: "#d4b94a", fontSize: 8, fontWeight: 500, display: "flex", alignItems: "center",
                                padding: "0 6px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                                cursor: "grab", zIndex: isActive ? 3 : 2, userSelect: "none",
                              }}
                              title={seg.text}
                            >
                              <div style={{ position: "absolute", left: 0, top: 0, width: 6, height: "100%", cursor: "ew-resize", zIndex: 4 }} />
                              <span style={{ pointerEvents: "none" }}>{seg.text}</span>
                              <div style={{ position: "absolute", right: 0, top: 0, width: 6, height: "100%", cursor: "ew-resize", zIndex: 4 }} />
                            </div>
                          );
                        })}

                        {/* VIDEO: full-duration block */}
                        {track.id === "v1" && (
                          <div style={{
                            position: "absolute", top: 4, left: 4, right: 4, height: 22,
                            borderRadius: 3, background: "rgba(52,211,153,0.2)", border: "1px solid rgba(52,211,153,0.4)",
                            color: "#7dc49a", fontSize: 9.5, fontWeight: 500, display: "flex", alignItems: "center",
                            padding: "0 7px", pointerEvents: "none",
                          }}>Source video</div>
                        )}

                        {/* AUDIO: deterministic waveform */}
                        {track.type === "audio" && (
                          <div style={{
                            position: "absolute", left: 4, right: 4, top: 4, height: 24,
                            display: "flex", alignItems: "center", gap: 1, overflow: "hidden", pointerEvents: "none",
                          }}>
                            {Array.from({ length: Math.max(60, Math.round(60 * tlZoom)) }, (_, i) => {
                              const seed = (track.id === "a1" ? 7 : 13) * (i + 1);
                              const h = ((seed * 2654435761 >>> 0) % 18) + 4;
                              return (
                                <span key={i} style={{
                                  flexShrink: 0, width: 2, borderRadius: 1, opacity: 0.65,
                                  height: h, background: track.color,
                                }} />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Global playhead — spans all tracks */}
                  {dur > 0 && (
                    <div style={{
                      position: "absolute", top: 0, bottom: 0,
                      left: `calc(104px + ${(currentTime / dur) * 100}% - ${(currentTime / dur) * 104}px)`,
                      width: 2, background: T.accentLight, pointerEvents: "none", zIndex: 10,
                      transition: (playing || tlScrubbing) ? "none" : "left 0.1s",
                      transform: "translateX(-1px)",
                    }}>
                      <div style={{
                        position: "absolute", top: -2, left: -4, width: 0, height: 0,
                        borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
                        borderTop: `7px solid ${T.accentLight}`,
                      }} />
                    </div>
                  )}

                  {/* Add track row */}
                  <div style={{
                    display: "flex", alignItems: "center", borderBottom: `1px solid ${BD}`,
                    minHeight: 22, cursor: "pointer", opacity: 0.5, transition: "opacity 0.15s",
                  }}>
                    <div style={{
                      width: 104, minWidth: 104, padding: "0 8px", fontSize: 9, fontWeight: 600,
                      color: T.textTertiary, borderRight: `1px solid ${BD}`, height: "100%",
                      display: "flex", alignItems: "center", background: S2, gap: 5,
                    }}>
                      + Add track
                    </div>
                    <div style={{ flex: 1, minWidth: contentW }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  // ═══════════════════════════════════════
  // MAIN LAYOUT
  // ═══════════════════════════════════════

  // Empty state — no clip loaded
  if (!clip) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", height: "100%", width: "100%",
        alignItems: "center", justifyContent: "center", background: T.bg,
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
        <div style={{ color: T.textSecondary, fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No clip loaded</div>
        <div style={{ color: T.textTertiary, fontSize: 13, maxWidth: 320, textAlign: "center", lineHeight: 1.6 }}>
          Open a clip from the Projects tab to start editing. Click "Open in Editor" on any clip to load it here.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%", width: "100%",
      overflow: "hidden", background: T.bg, position: "relative",
    }}>
      {renderTopbar()}

      {/* Editor body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0, position: "relative" }}>
        {renderLeftPanel()}
        {renderPreview()}
        {renderRightZone()}
      </div>

      {/* Timeline */}
      {renderTimeline()}

      {/* Render progress/result overlay */}
      {(rendering || renderResult) && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: T.surface, border: `1px solid ${BD}`, borderRadius: T.radius.lg,
            padding: "32px 40px", maxWidth: 420, width: "100%", textAlign: "center",
          }}>
            {rendering ? (
              <>
                <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
                <div style={{ color: T.text, fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Rendering...</div>
                <div style={{ color: T.textSecondary, fontSize: 13, marginBottom: 16 }}>{renderProgress.detail || "Processing..."}</div>
                <div style={{ height: 6, borderRadius: 3, background: S3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${renderProgress.pct}%`, background: `linear-gradient(90deg, ${T.green}, #2dd4a8)`, borderRadius: 3, transition: "width 0.3s" }} />
                </div>
                <div style={{ color: T.textTertiary, fontSize: 11, fontFamily: T.mono, marginTop: 8 }}>{renderProgress.pct}%</div>
              </>
            ) : renderResult?.success ? (
              <>
                <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
                <div style={{ color: T.green, fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Render Complete!</div>
                <div style={{ color: T.textSecondary, fontSize: 13, marginBottom: 16, wordBreak: "break-all" }}>{renderResult.path}</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <button
                    onClick={() => { const folder = renderResult.path.replace(/[/\\][^/\\]+$/, ""); window.clipflow?.openFolder?.(folder); }}
                    style={{ padding: "8px 20px", borderRadius: 6, border: `1px solid ${T.greenBorder}`, background: T.greenDim, color: T.green, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}
                  >📂 Open Folder</button>
                  <button
                    onClick={() => setRenderResult(null)}
                    style={{ padding: "8px 20px", borderRadius: 6, border: `1px solid ${BD}`, background: S2, color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}
                  >Close</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 36, marginBottom: 12 }}>❌</div>
                <div style={{ color: T.red, fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Render Failed</div>
                <div style={{ color: T.textSecondary, fontSize: 13, marginBottom: 16, maxHeight: 120, overflow: "auto", wordBreak: "break-all" }}>{renderResult?.error || "Unknown error"}</div>
                <button
                  onClick={() => setRenderResult(null)}
                  style={{ padding: "8px 20px", borderRadius: 6, border: `1px solid ${BD}`, background: S2, color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}
                >Close</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
