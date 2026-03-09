import React, { useState, useEffect, useRef } from "react";
import T from "../styles/theme";
import { Card, Badge, PageHeader, TabBar, InfoBanner, ViralBar } from "../components/shared";

// Pure helper — determine project game color
const getGameColor = (p, gamesDb) => {
  if (p.gameColor) return p.gameColor;
  const g = gamesDb.find((x) => x.name === p.game);
  return g ? g.color : T.accent;
};

// Pure helper — determine project status
const getProjectStatus = (p) => {
  if (p.status === "processing") return "processing";
  if (p.status === "error") return "error";
  if (p.clips && p.clips.length > 0) {
    const allReviewed = p.clips.filter((c) => c.status === "none").length === 0;
    return allReviewed ? "done" : "ready";
  }
  return "ready";
};

// ============ PROJECT LIST ============
export function ProjectsListView({ vizardProjects = [], onSelect, onPollProject, onImportProject, mainGame, gamesDb = [] }) {
  const [showImport, setShowImport] = useState(false);
  const [importId, setImportId] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    const id = importId.trim();
    if (!id) return;
    if (vizardProjects.some((p) => String(p.id) === id)) {
      setImportError("Project already exists");
      return;
    }
    setImporting(true);
    setImportError("");
    try {
      const result = await window.clipflow.vizardQueryProject(id);
      if (result.error) {
        setImportError(result.error);
        setImporting(false);
        return;
      }
      // Vizard API returns data at top level: { code, videos, projectName, projectId }
      if (result.code !== 2000 || !result.projectId) {
        setImportError(result.msg || "Project not found");
        setImporting(false);
        return;
      }
      // Map and deduplicate clips — videoId is THE unique identifier per Vizard API docs
      // Vizard returns multiple re-edit versions sharing the same clipEditorUrl id; keep latest (highest videoId)
      const mapped = (result.videos || []).map((v) => {
        const editorMatch = (v.clipEditorUrl || "").match(/id=(\d+)/);
        return {
          id: String(v.videoId),
          videoId: v.videoId,
          title: v.title || "Untitled",
          duration: Math.round((v.videoMsDuration || 0) / 1000),
          viralScore: v.viralScore || 0,
          viralReason: v.viralReason || "",
          transcript: v.transcript || "",
          videoUrl: v.videoUrl || "",
          clipEditorUrl: v.clipEditorUrl || "",
          clipEditorId: editorMatch ? editorMatch[1] : null,
          status: "none",
        };
      });
      // Deduplicate by clipEditorId — keep highest videoId (latest version)
      const groups = {};
      for (const c of mapped) {
        const key = c.clipEditorId || c.id;
        if (!groups[key] || c.videoId > (groups[key].videoId || 0)) groups[key] = c;
      }
      const clips = Object.values(groups);
      const project = {
        id: String(result.projectId || id),
        name: result.projectName || `Vizard Project ${id}`,
        status: result.videos && result.videos.length > 0 ? "ready" : "processing",
        progress: result.progress || 0,
        clips,
        createdAt: new Date().toISOString(),
        game: "Unknown",
        gameTag: "?",
        gameColor: T.accent,
        imported: true,
      };
      if (onImportProject) onImportProject(project);
      setImportId("");
      setShowImport(false);
    } catch (e) {
      setImportError(e.message || "Import failed");
    }
    setImporting(false);
  };

  // Poll for processing projects every 30 seconds
  useEffect(() => {
    const processing = vizardProjects.filter((p) => p.status === "processing");
    if (processing.length === 0) return;

    const poll = async () => {
      for (const proj of processing) {
        if (onPollProject) await onPollProject(proj.id);
      }
    };

    poll(); // poll immediately on mount
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, [vizardProjects, onPollProject]);

  const importUI = (
    <>
      {showImport ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input value={importId} onChange={(e) => { setImportId(e.target.value); setImportError(""); }} onKeyDown={(e) => e.key === "Enter" && handleImport()} placeholder="Vizard Project ID" autoFocus style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${importError ? T.redBorder : T.accentBorder}`, background: "rgba(255,255,255,0.04)", color: T.text, fontSize: 12, fontFamily: T.mono, outline: "none", width: 180 }} />
          <button onClick={handleImport} disabled={importing} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: T.green, color: "#fff", fontSize: 11, fontWeight: 700, cursor: importing ? "default" : "pointer", fontFamily: T.font, opacity: importing ? 0.6 : 1 }}>{importing ? "..." : "Import"}</button>
          <button onClick={() => { setShowImport(false); setImportError(""); setImportId(""); }} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.textTertiary, fontSize: 11, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
          {importError && <span style={{ color: T.red, fontSize: 11 }}>{importError}</span>}
        </div>
      ) : (
        <button onClick={() => setShowImport(true)} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.accentBorder}`, background: T.accentDim, color: T.accentLight, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>+ Add Project</button>
      )}
    </>
  );

  if (vizardProjects.length === 0) {
    return (
      <div>
        <PageHeader title="Projects" subtitle="Vizard AI clip review">{importUI}</PageHeader>
        <Card style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>{"\ud83c\udfac"}</div>
          <div style={{ color: T.textSecondary, fontSize: 15, fontWeight: 600 }}>No projects yet</div>
          <div style={{ color: T.textTertiary, fontSize: 13, marginTop: 8 }}>Upload files in the Upload tab or add an existing Vizard project by ID.</div>
        </Card>
      </div>
    );
  }

  // Sort: processing first, then ready, then done, then error
  const sorted = [...vizardProjects].sort((a, b) => {
    const order = { processing: 0, ready: 1, done: 2, error: 3 };
    const sa = order[getProjectStatus(a)] ?? 1;
    const sb = order[getProjectStatus(b)] ?? 1;
    if (sa !== sb) return sa - sb;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const processingCount = sorted.filter((p) => p.status === "processing").length;
  const readyCount = sorted.filter((p) => getProjectStatus(p) === "ready").length;

  return (
    <div>
      <PageHeader title="Projects" subtitle={`${vizardProjects.length} project${vizardProjects.length !== 1 ? "s" : ""}${processingCount > 0 ? ` \u00b7 ${processingCount} processing` : ""}${readyCount > 0 ? ` \u00b7 ${readyCount} to review` : ""}`}>{importUI}</PageHeader>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        {sorted.map((p) => {
          const st = getProjectStatus(p);
          const gameColor = getGameColor(p, gamesDb);
          const clipCount = p.clips ? p.clips.length : 0;

          return (
            <Card
              key={p.id}
              onClick={() => (st === "ready" || st === "done") && onSelect(p)}
              borderColor={st === "done" ? T.greenBorder : st === "error" ? T.redBorder : T.border}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: 20, opacity: st === "processing" ? 0.7 : st === "error" ? 0.5 : 1,
                cursor: st === "ready" || st === "done" ? "pointer" : "default",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1 }}>
                <div style={{
                  width: 46, height: 46, borderRadius: T.radius.md,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, flexShrink: 0,
                  background: st === "done" ? T.greenDim : st === "error" ? T.redDim : `${gameColor}18`,
                }}>
                  {st === "done" ? "\u2705" : st === "error" ? "\u274c" : st === "processing" ? "\u23f3" : "\ud83c\udfac"}
                </div>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: T.text, fontSize: 16, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    {p.game && p.game !== "Unknown" && p.gameTag !== "?" && (
                      <span style={{
                        display: "inline-flex", padding: "2px 6px",
                        background: `${gameColor}18`, border: `1px solid ${gameColor}44`,
                        borderRadius: 4, fontSize: 10, fontWeight: 700, color: gameColor,
                        fontFamily: T.mono,
                      }}>
                        {p.gameTag || p.game}
                      </span>
                    )}
                    <span style={{ color: T.textTertiary, fontSize: 13 }}>
                      {st === "processing" ? (
                        <span>Processing{p.progress ? <span style={{ fontFamily: T.mono, color: T.yellow }}> {p.progress}%</span> : "..."}</span>
                      ) : st === "error" ? (
                        <span style={{ color: T.red }}>{p.error || "Failed"}</span>
                      ) : (
                        <><span style={{ fontFamily: T.mono }}>{clipCount}</span> clip{clipCount !== 1 ? "s" : ""}</>
                      )}
                    </span>
                  </div>
                </div>
              </div>
              <Badge color={st === "done" ? T.green : st === "processing" ? T.yellow : st === "error" ? T.red : T.accent}>
                {st === "done" ? "Done" : st === "processing" ? "Processing" : st === "error" ? "Error" : "Review"}
              </Badge>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ============ CUSTOM DROPDOWN ============
const GameDropdown = ({ value, onChange, projectGame, gamesDb = [] }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const displayName = value || projectGame || "Select Game";
  const activeGame = gamesDb.find((g) => g.name === (value || projectGame));
  const activeColor = activeGame ? activeGame.color : T.accent;

  const allOptions = [
    { name: projectGame || "Project Game", value: "", color: gamesDb.find((g) => g.name === projectGame)?.color || T.accent },
    ...gamesDb.filter((g) => g.name !== projectGame).map((g) => ({ name: g.name, value: g.name, color: g.color })),
    { name: "Off-topic", value: "Just Chatting / Off-topic", color: T.textTertiary, separator: true },
  ];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${open ? T.accentBorder : T.border}`, borderRadius: 6, padding: "8px 12px", color: T.text, fontSize: 12, fontFamily: T.font, cursor: "pointer", whiteSpace: "nowrap", minWidth: 130 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: activeColor, flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</span>
        <span style={{ color: T.textTertiary, fontSize: 10, marginLeft: 4 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, minWidth: 180, background: T.surface, border: `1px solid ${T.borderHover}`, borderRadius: T.radius.md, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", zIndex: 50, overflow: "hidden", maxHeight: 260, overflowY: "auto" }}>
          {allOptions.map((opt, i) => {
            const isSel = opt.value === value;
            return (
              <React.Fragment key={opt.value || "__default"}>
                {opt.separator && <div style={{ height: 1, background: T.border, margin: "4px 0" }} />}
                <button
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", background: isSel ? T.accentDim : "transparent", border: "none", color: isSel ? T.accentLight : T.text, fontSize: 12, fontFamily: T.font, cursor: "pointer", textAlign: "left" }}
                  onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = T.surfaceHover; }}
                  onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: opt.color, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{opt.name}</span>
                  {isSel && <span style={{ color: T.accentLight, fontSize: 13 }}>{"\u2713"}</span>}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============ GENERATION PANEL ============
const GenerationPanel = ({ clip, project, gamesDb = [], anthropicApiKey, styleGuide, onEditClipTitle, onTitleHistory }) => {
  const [userContext, setUserContext] = useState("");
  const [themeOverride, setThemeOverride] = useState(""); // empty = project's game
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState(null); // { titles: [{text, why, visible}], captions: [{text, why, visible}] }
  const [selectedTitle, setSelectedTitle] = useState(null); // index
  const [selectedCaption, setSelectedCaption] = useState(null); // index
  const [appliedTitle, setAppliedTitle] = useState(null);
  const [appliedCaption, setAppliedCaption] = useState(null);
  const [sessionRejections, setSessionRejections] = useState([]); // rejected texts from this session
  const [undoStack, setUndoStack] = useState([]); // [{type, ...data}]

  // Find game context for the active game
  const activeGameName = themeOverride || project.game || "Unknown";
  const activeGame = activeGameName === "Just Chatting / Off-topic" ? null : gamesDb.find((g) => g.name === activeGameName);

  const handleGenerate = async () => {
    if (!anthropicApiKey) { setError("Add your Anthropic API key in Settings first"); return; }
    if (!clip.transcript) { setError("This clip has no transcript"); return; }
    setGenerating(true);
    setError("");
    try {
      const params = {
        transcript: clip.transcript,
        userContext: userContext.trim(),
        gameName: activeGameName,
        gameContextAuto: activeGame?.aiContextAuto || "",
        gameContextUser: activeGame?.aiContextUser || "",
        projectName: project.name || "",
        rejectedSuggestions: sessionRejections,
      };
      const result = await window.clipflow.anthropicGenerate(params);
      if (result.success && result.data) {
        const titles = (result.data.titles || []).map((t) => ({ text: t.title || t.text || "", why: t.why || t.reason || "", visible: true }));
        const captions = (result.data.captions || []).map((c) => ({ text: c.caption || c.text || "", why: c.why || c.reason || "", visible: true }));
        if (suggestions) {
          // Regenerating — fill only empty (rejected) slots
          setSuggestions((prev) => {
            const newTitles = [...prev.titles];
            const newCaptions = [...prev.captions];
            let tIdx = 0, cIdx = 0;
            for (let i = 0; i < newTitles.length; i++) {
              if (!newTitles[i].visible && tIdx < titles.length) { newTitles[i] = titles[tIdx++]; }
            }
            while (newTitles.length < 5 && tIdx < titles.length) { newTitles.push(titles[tIdx++]); }
            for (let i = 0; i < newCaptions.length; i++) {
              if (!newCaptions[i].visible && cIdx < captions.length) { newCaptions[i] = captions[cIdx++]; }
            }
            while (newCaptions.length < 5 && cIdx < captions.length) { newCaptions.push(captions[cIdx++]); }
            return { titles: newTitles, captions: newCaptions };
          });
        } else {
          setSuggestions({ titles, captions });
        }
      } else {
        setError(result.error || "Generation failed");
      }
    } catch (err) {
      setError(err.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleReject = async (type, index) => {
    const item = suggestions[type][index];
    // Log rejection
    try {
      await window.clipflow.anthropicLogHistory({
        type: "reject",
        timestamp: new Date().toISOString(),
        game: activeGameName,
        [`${type === "titles" ? "title" : "caption"}Rejected`]: item.text,
        reasonGiven: item.why,
        userContext: userContext.trim(),
      });
    } catch (_) { /* non-critical */ }
    setSessionRejections((prev) => [...prev, item.text]);
    // Push to undo stack before hiding
    setUndoStack((prev) => [...prev, { type: "reject", category: type, index, item: { ...item } }]);
    setSuggestions((prev) => {
      const updated = [...prev[type]];
      updated[index] = { ...updated[index], visible: false };
      return { ...prev, [type]: updated };
    });
  };

  // Pick title → immediately apply as clip title
  const handlePickTitle = async (index) => {
    const item = suggestions.titles[index];
    if (!item || !item.visible) return;
    const oldTitle = clip.title;
    setSelectedTitle(index);
    setAppliedTitle(item.text);
    // Log pick
    try {
      await window.clipflow.anthropicLogHistory({
        type: "pick",
        timestamp: new Date().toISOString(),
        game: activeGameName,
        titleChosen: item.text,
        captionChosen: "",
        transcriptSummary: (clip.transcript || "").substring(0, 100),
        userContext: userContext.trim(),
      });
    } catch (_) { /* non-critical */ }
    // Immediately apply to the clip
    if (onEditClipTitle) {
      if (onTitleHistory) onTitleHistory({ clipId: clip.id, oldTitle, newTitle: item.text });
      onEditClipTitle(project.id, clip.id, item.text);
    }
    // Push to undo stack
    setUndoStack((prev) => [...prev, { type: "titleChange", clipId: clip.id, oldTitle, newTitle: item.text }]);
  };

  // Pick caption → store locally (captions aren't part of clip metadata)
  const handlePickCaption = async (index) => {
    const item = suggestions.captions[index];
    if (!item || !item.visible) return;
    setSelectedCaption(index);
    setAppliedCaption(item.text);
    // Log pick
    try {
      await window.clipflow.anthropicLogHistory({
        type: "pick",
        timestamp: new Date().toISOString(),
        game: activeGameName,
        titleChosen: "",
        captionChosen: item.text,
        transcriptSummary: (clip.transcript || "").substring(0, 100),
        userContext: userContext.trim(),
      });
    } catch (_) { /* non-critical */ }
  };

  // Unified undo — pops most recent action
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));

    if (last.type === "reject") {
      // Restore rejected suggestion
      setSuggestions((prev) => {
        const updated = [...prev[last.category]];
        updated[last.index] = { ...last.item, visible: true };
        return { ...prev, [last.category]: updated };
      });
      // Remove from session rejections
      setSessionRejections((prev) => {
        const idx = prev.lastIndexOf(last.item.text);
        if (idx >= 0) { const n = [...prev]; n.splice(idx, 1); return n; }
        return prev;
      });
    } else if (last.type === "titleChange") {
      // Revert the title
      if (onEditClipTitle) {
        if (onTitleHistory) onTitleHistory({ clipId: last.clipId, oldTitle: last.newTitle, newTitle: last.oldTitle });
        onEditClipTitle(project.id, last.clipId, last.oldTitle);
      }
      setAppliedTitle(null);
      setSelectedTitle(null);
    }
  };

  const hasRejected = suggestions && (suggestions.titles.some((t) => !t.visible) || suggestions.captions.some((c) => !c.visible));
  const hasApiKey = Boolean(anthropicApiKey);

  const SuggestionItem = ({ item, index, type, selected, onPick, onReject }) => {
    if (!item.visible) return null;
    const isSel = selected === index;
    return (
      <div style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${isSel ? T.greenBorder : T.border}`, background: isSel ? T.greenDim : "rgba(255,255,255,0.02)", marginBottom: 6, transition: "all 0.15s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, color: T.text, fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>{item.text}</div>
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <button onClick={() => onPick(index)} title="Use this" style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${isSel ? T.greenBorder : T.border}`, background: isSel ? T.green : "rgba(255,255,255,0.04)", color: isSel ? "#fff" : T.textTertiary, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2713"}</button>
            <button onClick={() => onReject(type, index)} title="Reject" style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.04)", color: T.textTertiary, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2717"}</button>
          </div>
        </div>
        {item.why && (
          <div style={{ color: T.textTertiary, fontSize: 11, marginTop: 4, lineHeight: 1.4, fontStyle: "italic" }}>{item.why}</div>
        )}
      </div>
    );
  };

  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
      {/* Applied results banner */}
      {(appliedTitle || appliedCaption) && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: T.greenDim, border: `1px solid ${T.greenBorder}`, marginBottom: 12 }}>
          {appliedTitle && <div style={{ color: T.green, fontSize: 13, fontWeight: 600 }}>{"\u2713"} Title applied: {appliedTitle}</div>}
          {appliedCaption && <div style={{ color: T.green, fontSize: 13, fontWeight: 600, marginTop: appliedTitle ? 4 : 0 }}>{"\u2713"} Caption: {appliedCaption}</div>}
        </div>
      )}

      {/* Controls row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={userContext}
          onChange={(e) => setUserContext(e.target.value)}
          placeholder="Additional context (optional)..."
          style={{ flex: 1, minWidth: 180, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 12px", color: T.text, fontSize: 12, fontFamily: T.font, outline: "none" }}
        />
        <GameDropdown value={themeOverride} onChange={setThemeOverride} projectGame={project.game} gamesDb={gamesDb} />
        <button
          onClick={handleGenerate}
          disabled={generating || !hasApiKey}
          style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: hasApiKey ? `linear-gradient(135deg, ${T.accent}, ${T.accentLight})` : T.border, color: hasApiKey ? "#fff" : T.textTertiary, fontSize: 12, fontWeight: 700, cursor: hasApiKey && !generating ? "pointer" : "not-allowed", fontFamily: T.font, whiteSpace: "nowrap", opacity: generating ? 0.6 : 1 }}
        >
          {generating ? "Generating..." : suggestions ? "Regenerate" : "\u2728 Generate"}
        </button>
        {undoStack.length > 0 && (
          <button onClick={handleUndo} style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.04)", color: T.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>{"\u21a9"} Undo</button>
        )}
      </div>

      {!hasApiKey && <div style={{ color: T.yellow, fontSize: 11, marginBottom: 8 }}>Add your Anthropic API key in Settings to use AI generation</div>}
      {error && <div style={{ color: T.red, fontSize: 12, marginBottom: 8 }}>{error}</div>}

      {/* Suggestions display */}
      {suggestions && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* Titles column */}
            <div>
              <div style={{ color: T.accentLight, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Titles</div>
              {suggestions.titles.map((t, i) => (
                <SuggestionItem key={i} item={t} index={i} type="titles" selected={selectedTitle} onPick={handlePickTitle} onReject={handleReject} />
              ))}
              {suggestions.titles.every((t) => !t.visible) && (
                <div style={{ color: T.textTertiary, fontSize: 12, textAlign: "center", padding: 12 }}>All rejected — click Regenerate</div>
              )}
            </div>
            {/* Captions column */}
            <div>
              <div style={{ color: T.accentLight, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Captions</div>
              {suggestions.captions.map((c, i) => (
                <SuggestionItem key={i} item={c} index={i} type="captions" selected={selectedCaption} onPick={handlePickCaption} onReject={handleReject} />
              ))}
              {suggestions.captions.every((c) => !c.visible) && (
                <div style={{ color: T.textTertiary, fontSize: 12, textAlign: "center", padding: 12 }}>All rejected — click Regenerate</div>
              )}
            </div>
          </div>

          {/* Action row */}
          {hasRejected && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button onClick={handleGenerate} disabled={generating} style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${T.accentBorder}`, background: T.accentDim, color: T.accentLight, fontSize: 12, fontWeight: 600, cursor: generating ? "default" : "pointer", fontFamily: T.font, opacity: generating ? 0.6 : 1 }}>
                {generating ? "..." : "Regenerate Empty Slots"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============ CLIP BROWSER ============
export function ClipBrowser({ project, onBack, onUpdateClip, onTranscript, onEditClipTitle, gamesDb, anthropicApiKey, styleGuide }) {
  const [filter, setFilter] = useState("all");
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState("");
  const [titleHistory, setTitleHistory] = useState([]); // [{clipId, oldTitle, newTitle}]
  const [expandedClip, setExpandedClip] = useState(null); // clipId or null

  const clips = project.clips || [];
  const isApproved = (c) => c.status === "approved" || c.status === "ready";
  const filtered = clips.filter((c) => filter === "approved" ? isApproved(c) : filter === "pending" ? c.status === "none" : true);
  const approved = clips.filter(isApproved).length;
  const pending = clips.filter((c) => c.status === "none").length;

  return (
    <div>
      <PageHeader title={project.name} subtitle={`${approved} approved \u00b7 ${pending} pending`} backAction={onBack}>
        <span onClick={() => { navigator.clipboard.writeText(String(project.id)); }} title="Copy project ID" style={{ color: T.textTertiary, fontSize: 11, fontFamily: T.mono, cursor: "pointer", flexShrink: 0, padding: "2px 8px", borderRadius: 4, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}` }}>#{project.id}</span>
        {titleHistory.length > 0 && (
          <button onClick={() => {
            const last = titleHistory[titleHistory.length - 1];
            onEditClipTitle(project.id, last.clipId, last.oldTitle);
            setTitleHistory((h) => h.slice(0, -1));
          }} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.04)", color: T.textSecondary, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>
            {"\u21a9"} Undo rename
          </button>
        )}
      </PageHeader>

      <TabBar tabs={[{ id: "all", label: "All", count: clips.length }, { id: "pending", label: "Pending", count: pending }, { id: "approved", label: "Approved", count: approved }]} active={filter} onChange={setFilter} />

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        {filtered.map((clip) => {
          const ca = isApproved(clip);
          const rej = clip.status === "rejected";
          return (
            <Card key={clip.id} borderColor={ca ? T.greenBorder : T.border} style={{ padding: 20, opacity: rej ? 0.35 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  {editId === clip.id ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setTitleHistory((h) => [...h, { clipId: clip.id, oldTitle: clip.title, newTitle: editText }]); onEditClipTitle(project.id, clip.id, editText); setEditId(null); } if (e.key === "Escape") setEditId(null); }} autoFocus style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.accentBorder}`, borderRadius: T.radius.md, padding: "10px 14px", color: T.text, fontSize: 15, fontWeight: 600, fontFamily: T.font, outline: "none" }} />
                      <button onClick={() => { setTitleHistory((h) => [...h, { clipId: clip.id, oldTitle: clip.title, newTitle: editText }]); onEditClipTitle(project.id, clip.id, editText); setEditId(null); }} style={{ background: T.accent, border: "none", borderRadius: T.radius.md, padding: "10px 18px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Save</button>
                      <button onClick={() => setEditId(null)} style={{ background: "transparent", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "10px 14px", color: T.textTertiary, fontSize: 13, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
                    </div>
                  ) : (
                    <div onClick={() => { setEditId(clip.id); setEditText(clip.title); }} style={{ color: T.text, fontSize: 16, fontWeight: 600, lineHeight: 1.5, cursor: "pointer" }}>{clip.title} <span style={{ color: T.textMuted, fontSize: 13 }}>{"\u270e"}</span></div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => onUpdateClip(project.id, clip.id, ca ? "none" : "approved")} style={{ width: 42, height: 42, borderRadius: T.radius.md, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", border: ca ? `1px solid ${T.greenBorder}` : `1px solid ${T.border}`, cursor: "pointer", background: ca ? T.greenDim : "rgba(255,255,255,0.04)", color: ca ? T.green : T.textTertiary }}>{"\ud83d\udc4d"}</button>
                  <button onClick={() => onUpdateClip(project.id, clip.id, rej ? "none" : "rejected")} style={{ width: 42, height: 42, borderRadius: T.radius.md, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", border: rej ? `1px solid ${T.redBorder}` : `1px solid ${T.border}`, cursor: "pointer", background: rej ? T.redDim : "rgba(255,255,255,0.04)", color: rej ? T.red : T.textTertiary }}>{"\ud83d\udc4e"}</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ color: T.textTertiary, fontSize: 13, fontFamily: T.mono }}>{clip.duration}s</span>
                {clip.viralScore > 0 && <ViralBar score={clip.viralScore} />}
              </div>
              {!rej && (
                <div style={{ display: "flex", gap: 8, paddingTop: 14, borderTop: `1px solid ${T.border}`, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
                  <button onClick={() => onTranscript(clip)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>{"\ud83d\udcdd"} Transcript</button>
                  {clip.transcript && (
                    <button onClick={() => setExpandedClip(expandedClip === clip.id ? null : clip.id)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${expandedClip === clip.id ? T.accentBorder : T.border}`, background: expandedClip === clip.id ? T.accentDim : "rgba(255,255,255,0.03)", color: expandedClip === clip.id ? T.accentLight : T.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>{"\u2728"} AI Titles</button>
                  )}
                  {ca && <Badge color={T.green}>{"\u2713"} Queued</Badge>}
                </div>
              )}
              {expandedClip === clip.id && clip.transcript && (
                <GenerationPanel
                  clip={clip}
                  project={project}
                  gamesDb={gamesDb}
                  anthropicApiKey={anthropicApiKey}
                  styleGuide={styleGuide}
                  onEditClipTitle={onEditClipTitle}
                  onTitleHistory={(entry) => setTitleHistory((h) => [...h, entry])}
                />
              )}
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <Card style={{ padding: 40, textAlign: "center" }}>
            <div style={{ color: T.textTertiary, fontSize: 14 }}>No clips match this filter.</div>
          </Card>
        )}
      </div>
    </div>
  );
}
