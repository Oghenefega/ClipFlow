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

// ============ EDITOR VIEW ============
export default function EditorView({ gamesDb = [], editorContext, localProjects = [], anthropicApiKey = "", styleGuide = "" }) {
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

  // ── Editable subtitle segments ──
  const [editSegments, setEditSegments] = useState([]);

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

  // ── Save handler ──
  const handleSave = useCallback(async () => {
    if (!clip || !project) return;
    try {
      await window.clipflow.projectUpdateClip(project.id, clip.id, {
        title: clipTitle,
        subtitles: { sub1: editSegments.filter((s) => s.track === "s1"), sub2: editSegments.filter((s) => s.track === "s2") },
      });
      setDirty(false);
    } catch (e) {
      console.error("Save failed:", e);
    }
  }, [clip, project, clipTitle, editSegments]);

  // ── Build transcript rows from clip data ──
  const transcriptRows = React.useMemo(() => {
    if (!project?.transcription?.segments || !clip) return [];
    const clipStart = clip.startTime || 0;
    const clipEnd = clip.endTime || 0;
    return project.transcription.segments
      .filter((s) => s.start >= clipStart && s.end <= clipEnd)
      .map((s, i) => ({
        id: i,
        start: fmtTime(s.start - clipStart),
        end: fmtTime(s.end - clipStart),
        dur: ((s.end - s.start).toFixed(1)) + "s",
        text: s.text,
        startSec: s.start - clipStart,
        endSec: s.end - clipStart,
      }));
  }, [project?.transcription, clip?.startTime, clip?.endTime]);

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
  const handleAiAcceptTitle = useCallback((titleObj) => {
    const newTitle = titleObj.title || titleObj.text || "";
    setClipTitle(newTitle);
    setDirty(true);
    // Log to history
    window.clipflow?.anthropicLogHistory?.({
      type: "pick", titleChosen: newTitle, game: aiGame, timestamp: Date.now(),
    });
  }, [aiGame]);

  const handleAiAcceptCaption = useCallback((captionObj) => {
    // Store caption on clip for render pipeline
    const captionText = captionObj.caption || captionObj.text || "";
    // Mark dirty — caption will be saved with next save
    setDirty(true);
    window.clipflow?.anthropicLogHistory?.({
      type: "pick", captionChosen: captionText, game: aiGame, timestamp: Date.now(),
    });
  }, [aiGame]);

  const handleAiReject = useCallback((text) => {
    setAiRejections((prev) => [...prev, text]);
    window.clipflow?.anthropicLogHistory?.({
      type: "reject", titleRejected: text, game: aiGame, timestamp: Date.now(),
    });
  }, [aiGame]);

  // ── Brand presets (static for now — Phase 7 will make these configurable) ──
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
    { id: "head", icon: "T", label: "Headline", group: 2 },
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
      {/* Left: Undo/Redo/AutoSave */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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

      {/* Right: Zoom, Fullscreen, Save */}
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
      </div>
    </div>
  );

  // ═══════════════════════════════════════
  // RENDER: LEFT PANEL — TRANSCRIPT
  // ═══════════════════════════════════════
  const renderTranscript = () => (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Mode pills */}
      <div style={{ display: "flex", gap: 4, padding: "8px 10px", borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
        <Pill label="Karaoke" active={transcriptMode === "karaoke"} onClick={() => setTranscriptMode("karaoke")} icon={<span style={{ color: T.green, fontSize: 10, fontWeight: 800 }}>the</span>} />
        <Pill label="Word×Word" active={transcriptMode === "word"} onClick={() => setTranscriptMode("word")} icon={<span style={{ fontWeight: 800, fontSize: 11 }}>the</span>} />
        <Pill label="Phrase" active={transcriptMode === "phrase"} onClick={() => setTranscriptMode("phrase")} />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 10px", borderBottom: `1px solid ${BD}` }}>
        <ToolBtn>⌇ Split</ToolBtn>
        <ToolBtn>⇔ Merge</ToolBtn>
        <div style={{ width: 1, height: 16, background: BD, margin: "0 2px" }} />
        <ToolBtn>≈ Words</ToolBtn>
      </div>

      {/* Search + rows */}
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

        {transcriptRows.map(row => {
          const isActive = row.id === activeRow;
          return (
            <div
              key={row.id}
              onClick={() => {
                setActiveRow(row.id);
                // Seek video to this segment's start time
                if (videoRef.current && row.startSec !== undefined) {
                  videoRef.current.currentTime = row.startSec;
                  setCurrentTime(row.startSec);
                }
              }}
              style={{
                padding: "10px 8px", borderBottom: `1px solid ${BD}`,
                borderLeft: `2px solid ${isActive ? T.accent : "transparent"}`,
                borderRadius: 5, cursor: "pointer", transition: "background 0.1s",
                background: isActive ? T.accentDim : "transparent",
              }}
            >
              <div style={{ fontSize: 10, fontFamily: T.mono, color: T.textSecondary, marginBottom: 3 }}>
                {row.start} — {row.end} [{row.dur}]
              </div>
              <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.5 }}>{row.text}</div>
            </div>
          );
        })}
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
          <ToolBtn active>⌇ Split</ToolBtn>
          <ToolBtn>⇔ Merge</ToolBtn>
          <div style={{ width: 1, height: 16, background: BD, margin: "0 2px" }} />
          <ToolBtn>↩</ToolBtn>
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
                    <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textSecondary, padding: "2px 5px", borderRadius: 3 }}>{seg.start}</span>
                    <span style={{ fontSize: 9, color: T.textTertiary }}>→</span>
                    <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textSecondary, padding: "2px 5px", borderRadius: 3 }}>{seg.end}</span>
                    <span style={{ fontSize: 9, color: T.textTertiary, fontFamily: T.mono }}>[{seg.dur}]</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor }} title={seg.track === "s1" ? "Sub 1" : "Sub 2"} />
                    <Ib title="Split here" style={{ width: 20, height: 20, fontSize: 11 }}>⌇</Ib>
                    <Ib title="Delete segment" style={{ width: 20, height: 20, fontSize: 11 }}>✕</Ib>
                  </div>
                </div>

                {/* Text + confidence — editable */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "0 9px 8px" }}>
                  <input
                    value={seg.text}
                    onChange={(e) => {
                      e.stopPropagation();
                      const newText = e.target.value;
                      setEditSegments((prev) => prev.map((s) => s.id === seg.id ? { ...s, text: newText } : s));
                      setDirty(true);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flex: 1, fontSize: 12.5, color: T.text, lineHeight: 1.5, minHeight: 18,
                      borderRadius: 3, padding: "2px 4px", background: isActive ? "rgba(255,255,255,0.04)" : "transparent",
                      border: isActive ? `1px solid ${BD}` : "1px solid transparent", outline: "none",
                      fontFamily: T.font, width: "100%",
                    }}
                  />
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
  const activeSubtitle = segments.find((s) => s.startSec !== undefined && currentTime >= s.startSec && currentTime <= s.endSec);
  const clipDuration = clip ? ((clip.endTime || 0) - (clip.startTime || 0)) : 0;
  const videoSrc = clip?.filePath ? `file://${clip.filePath.replace(/\\/g, "/")}` : null;

  const renderPreview = () => (
    <div style={{
      flex: 1, background: T.bg, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", overflow: "hidden", minWidth: 0,
    }}>
      {/* 9:16 preview */}
      <div style={{
        height: "calc(100% - 44px)", aspectRatio: "9/16", maxHeight: 460, maxWidth: 258,
        background: "#000", borderRadius: 6, position: "relative", overflow: "hidden",
        boxShadow: `0 0 0 1px ${BD}, 0 20px 60px rgba(0,0,0,0.7)`, flexShrink: 0,
      }}>
        {/* Video element */}
        {videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            style={{ width: "100%", height: "calc(100% - 40px)", objectFit: "cover" }}
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

        {/* Subtitle overlay — synced to playback */}
        {showSubs && activeSubtitle && (
          <div style={{ position: "absolute", bottom: "40%", left: 0, right: 0, textAlign: "center", padding: "0 14px", pointerEvents: "none" }}>
            <div style={{
              fontSize: 14, fontWeight: 800, color: "#fff",
              textShadow: "0 2px 8px rgba(0,0,0,0.9)", lineHeight: 1.3,
            }}>
              {activeSubtitle.text}
            </div>
          </div>
        )}

        {/* Caption overlay */}
        {clipTitle && (
          <div style={{ position: "absolute", bottom: videoSrc ? "12%" : "9%", left: 0, right: 0, textAlign: "center", padding: "0 10px", pointerEvents: "none" }}>
            <div style={{
              fontSize: 12, fontWeight: 800, color: "#fff",
              textShadow: "0 2px 6px rgba(0,0,0,0.95)", lineHeight: 1.3,
            }}>
              {clipTitle}
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
          <span style={{
            fontSize: 10, fontWeight: 600, color: T.textSecondary, border: `1px solid ${BD}`,
            borderRadius: 4, padding: "2px 5px", cursor: "pointer",
          }}>
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
            rows={2}
            style={{
              width: "100%", background: S2, border: `1px solid ${BD}`, borderRadius: 5,
              padding: "6px 9px", color: T.text, fontSize: 11, fontFamily: T.font,
              outline: "none", resize: "none", minHeight: 30, lineHeight: 1.5,
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
              return (
                <div key={i} style={{
                  background: S2, border: `1px solid ${BD}`, borderRadius: 5,
                  padding: "9px 10px", position: "relative", opacity: isRejected ? 0.35 : 1,
                  transition: "opacity 0.2s",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text, lineHeight: 1.4, paddingRight: 50, marginBottom: 4 }}>
                    {text}
                  </div>
                  <div style={{ fontSize: 10, color: T.textSecondary, lineHeight: 1.4 }}>{t.why}</div>
                  {!isRejected && (
                    <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 3 }}>
                      <Ib title="Apply as title" onClick={() => handleAiAcceptTitle(t)} style={{ width: 22, height: 22, fontSize: 10, border: `1px solid ${T.green}`, background: "rgba(52,211,153,0.1)", color: T.green }}>✓</Ib>
                      <Ib title="Dismiss" onClick={() => handleAiReject(text)} style={{ width: 22, height: 22, fontSize: 10, border: `1px solid ${BD}`, background: S3 }}>✕</Ib>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Captions */}
            <SectionLabel style={{ marginTop: 6 }}>Captions ({captions.length})</SectionLabel>
            {captions.map((c, i) => {
              const text = c.caption || c.text || "";
              const isRejected = aiRejections.includes(text);
              return (
                <div key={i} style={{
                  background: S2, border: `1px solid ${BD}`, borderRadius: 5,
                  padding: "9px 10px", position: "relative", opacity: isRejected ? 0.35 : 1,
                  transition: "opacity 0.2s",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text, lineHeight: 1.4, paddingRight: 50, marginBottom: 4 }}>
                    {text}
                  </div>
                  <div style={{ fontSize: 10, color: T.textSecondary, lineHeight: 1.4 }}>{c.why}</div>
                  {!isRejected && (
                    <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 3 }}>
                      <Ib title="Apply caption" onClick={() => handleAiAcceptCaption(c)} style={{ width: 22, height: 22, fontSize: 10, border: `1px solid ${T.green}`, background: "rgba(52,211,153,0.1)", color: T.green }}>✓</Ib>
                      <Ib title="Dismiss" onClick={() => handleAiReject(text)} style={{ width: 22, height: 22, fontSize: 10, border: `1px solid ${BD}`, background: S3 }}>✕</Ib>
                    </div>
                  )}
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
            <div style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between",
              background: S2, border: `1px solid ${BD}`, borderRadius: 5, padding: "5px 9px",
              fontSize: 11, color: T.text, cursor: "pointer",
            }}>
              <span style={{ fontStyle: "italic", fontWeight: 700 }}>Montserrat Bold</span>
              <span style={{ opacity: 0.4, fontSize: 9 }}>▾</span>
            </div>
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
            <Ib title="1 line" active style={{ fontSize: 9, fontWeight: 700 }}>1L</Ib>
            <Ib title="2 lines" style={{ fontSize: 9, fontWeight: 700 }}>2L</Ib>
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
  // RENDER: RIGHT ZONE (DRAWER + RAIL)
  // ═══════════════════════════════════════
  const renderDrawerContent = () => {
    switch (activePanel) {
      case "ai": return renderAIPanel();
      case "subs": return renderSubsPanel();
      case "brand": return renderBrandPanel();
      case "media": return renderMediaPanel();
      default: return (
        <div style={{ padding: 20, textAlign: "center", color: T.textTertiary, fontSize: 12 }}>
          {activePanel.charAt(0).toUpperCase() + activePanel.slice(1)} panel — coming soon
        </div>
      );
    }
  };

  const panelLabels = { ai: "AI Tools", subs: "Subtitles", head: "Headline", brand: "Brand Kit", audio: "Audio", media: "Media", text: "Text" };

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
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Ib>−</Ib>
            <div style={{ width: 60, height: 3, background: BDH, borderRadius: 2, position: "relative", cursor: "pointer" }}>
              <div style={{ position: "absolute", left: "35%", top: "50%", transform: "translate(-50%,-50%)", width: 11, height: 11, background: T.accent, borderRadius: "50%" }} />
            </div>
            <Ib>+</Ib>
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
        {!tlCollapsed && (
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* Ruler — real clip duration */}
            <div style={{
              height: 20, minHeight: 20, background: S2, borderBottom: `1px solid ${BD}`,
              display: "flex", alignItems: "flex-end", paddingLeft: 104, overflow: "hidden", position: "relative",
            }}>
              {(() => {
                const dur = clipDuration || 30;
                const step = dur <= 15 ? 2 : dur <= 30 ? 4 : dur <= 60 ? 8 : 16;
                const marks = [];
                for (let t = 0; t <= dur; t += step) marks.push(t);
                return marks.map(t => (
                  <div key={t} style={{ width: 80, flexShrink: 0, position: "relative", height: "100%" }}>
                    <span style={{ fontSize: 9, fontFamily: T.mono, color: T.textTertiary, position: "absolute", left: 0, bottom: 3 }}>{t}s</span>
                    <div style={{ width: 1, height: 5, background: BDH, position: "absolute", left: 0, bottom: 0 }} />
                  </div>
                ));
              })()}
            </div>

            {/* Track rows */}
            <div style={{ flex: 1, overflowX: "auto", overflowY: "auto", display: "flex", flexDirection: "column" }}>
              {tracks.map(track => (
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

                  {/* Content */}
                  <div style={{ flex: 1, height: "100%", position: "relative", minWidth: 500 }}>
                    {/* Colored blocks (mock) */}
                    {track.id === "v1" && (
                      <div style={{
                        position: "absolute", top: 4, left: 10, width: "90%", height: 22,
                        borderRadius: 3, background: "rgba(52,211,153,0.2)", border: "1px solid rgba(52,211,153,0.4)",
                        color: "#7dc49a", fontSize: 9.5, fontWeight: 500, display: "flex", alignItems: "center", padding: "0 7px",
                      }}>Source video</div>
                    )}
                    {track.id === "cap" && (
                      <div style={{
                        position: "absolute", top: 3, left: 10, width: "62%", height: 20,
                        borderRadius: 3, background: "rgba(139,92,246,0.3)", border: `1px solid rgba(139,92,246,0.5)`,
                        color: "#c4b0ef", fontSize: 9.5, fontWeight: 500, display: "flex", alignItems: "center", padding: "0 7px",
                      }}>Caption</div>
                    )}
                    {track.id === "s1" && (
                      <div style={{
                        position: "absolute", top: 3, left: 10, width: "88%", height: 20,
                        borderRadius: 3, background: "rgba(76,130,200,0.25)", border: "1px solid rgba(76,130,200,0.4)",
                        color: "#90b8e0", fontSize: 9.5, fontWeight: 500, display: "flex", alignItems: "center", padding: "0 7px",
                      }}>Sub 1</div>
                    )}
                    {track.id === "s2" && (
                      <div style={{
                        position: "absolute", top: 3, left: "28%", width: "55%", height: 20,
                        borderRadius: 3, background: "rgba(210,170,40,0.2)", border: "1px solid rgba(210,170,40,0.4)",
                        color: "#d4b94a", fontSize: 9.5, fontWeight: 500, display: "flex", alignItems: "center", padding: "0 7px",
                      }}>Sub 2</div>
                    )}
                    {track.type === "audio" && (
                      <div style={{ position: "absolute", left: 10, right: 10, top: 4, height: 24, display: "flex", alignItems: "center", gap: 1, overflow: "hidden" }}>
                        {Array.from({ length: 60 }, (_, i) => (
                          <span key={i} style={{
                            flexShrink: 0, width: 2, borderRadius: 1, opacity: 0.65,
                            height: Math.random() * 18 + 4, background: track.color,
                          }} />
                        ))}
                      </div>
                    )}

                    {/* Playhead — synced to currentTime */}
                    {track.id === "cap" && (
                      <div style={{
                        position: "absolute", top: 0, bottom: 0, width: 1, background: T.accentLight,
                        left: `${clipDuration > 0 ? (currentTime / clipDuration) * 100 : 0}%`,
                        pointerEvents: "none", zIndex: 10, transition: playing ? "none" : "left 0.1s",
                      }}>
                        <div style={{
                          position: "absolute", top: 0, left: -4, width: 0, height: 0,
                          borderLeft: "4px solid transparent", borderRight: "4px solid transparent",
                          borderTop: `6px solid ${T.accentLight}`,
                        }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}

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
                <div style={{ flex: 1 }} />
              </div>
            </div>
          </div>
        )}
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
    </div>
  );
}
