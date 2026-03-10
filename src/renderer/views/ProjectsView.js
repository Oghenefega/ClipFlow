import React, { useState, useEffect, useCallback } from "react";
import T from "../styles/theme";
import { Card, Badge, PageHeader, TabBar, InfoBanner, ViralBar, Checkbox } from "../components/shared";

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

// Pure helper — extract transcript text for a clip from project transcription
const getClipTranscript = (clip, project) => {
  if (!project?.transcription?.segments) return "";
  return project.transcription.segments
    .filter((s) => s.start >= (clip.startTime || 0) && s.end <= (clip.endTime || 0))
    .map((s) => s.text)
    .join(" ")
    .trim();
};

// ============ PROJECT LIST ============
export function ProjectsListView({ localProjects = [], onSelect, onDeleteProjects, mainGame, gamesDb = [] }) {
  const [selected, setSelected] = useState({});
  const [collapsed, setCollapsed] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Load collapsed state from store on mount
  useEffect(() => {
    (async () => {
      if (window.clipflow?.storeGet) {
        const saved = await window.clipflow.storeGet("projectsCollapsed");
        if (saved && typeof saved === "object") setCollapsed(saved);
      }
    })();
  }, []);

  const toggleCollapse = useCallback((tag) => {
    setCollapsed((p) => {
      const next = { ...p, [tag]: !p[tag] };
      if (window.clipflow?.storeSet) window.clipflow.storeSet("projectsCollapsed", next);
      return next;
    });
  }, []);

  if (localProjects.length === 0) {
    return (
      <div>
        <PageHeader title="Projects" subtitle="Review generated clips" />
        <Card style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>{"\ud83c\udfac"}</div>
          <div style={{ color: T.textSecondary, fontSize: 15, fontWeight: 600 }}>No projects yet</div>
          <div style={{ color: T.textTertiary, fontSize: 13, marginTop: 8 }}>Projects will appear here once clips are generated.</div>
        </Card>
      </div>
    );
  }

  // --- Group by gameTag ---
  const grouped = {};
  for (const p of localProjects) {
    const tag = p.gameTag || "?";
    if (!grouped[tag]) grouped[tag] = [];
    grouped[tag].push(p);
  }

  // Sort groups alphabetically
  const groupKeys = Object.keys(grouped).sort((a, b) => {
    if (a === "?") return 1;
    if (b === "?") return -1;
    return a.localeCompare(b);
  });

  // Sort projects within each group: processing first, then by creation date (newest first)
  for (const key of groupKeys) {
    grouped[key].sort((a, b) => {
      const order = { processing: 0, ready: 1, done: 2, error: 3 };
      const sa = order[getProjectStatus(a)] ?? 1;
      const sb = order[getProjectStatus(b)] ?? 1;
      if (sa !== sb) return sa - sb;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  // --- Selection helpers ---
  const toggle = (id) => {
    setSelected((p) => ({ ...p, [id]: !p[id] }));
    setConfirmDelete(false);
  };

  const selectAllInGroup = (tag) => {
    const items = grouped[tag] || [];
    const allSel = items.every((p) => selected[p.id]);
    setSelected((prev) => {
      const next = { ...prev };
      items.forEach((p) => { next[p.id] = !allSel; });
      return next;
    });
    setConfirmDelete(false);
  };

  const selectAll = () => {
    const allSel = localProjects.length > 0 && localProjects.every((p) => selected[p.id]);
    setSelected((prev) => {
      const next = { ...prev };
      localProjects.forEach((p) => { next[p.id] = !allSel; });
      return next;
    });
    setConfirmDelete(false);
  };

  const selCount = Object.values(selected).filter(Boolean).length;
  const processingCount = localProjects.filter((p) => p.status === "processing").length;
  const readyCount = localProjects.filter((p) => getProjectStatus(p) === "ready").length;

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const ids = Object.keys(selected).filter((id) => selected[id]);
    if (ids.length > 0 && onDeleteProjects) {
      onDeleteProjects(ids);
    }
    setSelected({});
    setConfirmDelete(false);
  };

  const handleSingleDelete = (e, projectId) => {
    e.stopPropagation();
    if (onDeleteProjects) onDeleteProjects([projectId]);
  };

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${localProjects.length} project${localProjects.length !== 1 ? "s" : ""}${processingCount > 0 ? ` \u00b7 ${processingCount} processing` : ""}${readyCount > 0 ? ` \u00b7 ${readyCount} to review` : ""}`}
      />

      {/* Header row: select all */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {selCount > 0 && (
            <span style={{ color: T.accent, fontSize: 13, fontWeight: 700 }}>
              {selCount} selected
            </span>
          )}
        </div>
        <button
          onClick={selectAll}
          style={{ background: "none", border: "none", color: T.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font, padding: 0 }}
        >
          {localProjects.length > 0 && localProjects.every((p) => selected[p.id]) ? "Deselect All" : "Select All"}
        </button>
      </div>

      {/* Grouped project list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {groupKeys.map((tag) => {
          const items = grouped[tag];
          const isCollapsed = collapsed[tag];
          const game = gamesDb.find((g) => g.tag === tag);
          const gameColor = game?.color || T.accent;
          const gameName = game?.name || tag;
          const groupSelCount = items.filter((p) => selected[p.id]).length;
          const allGroupSel = items.length > 0 && items.every((p) => selected[p.id]);

          return (
            <div key={tag}>
              {/* Group header */}
              <div
                onClick={() => toggleCollapse(tag)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: T.radius.md,
                  background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}`,
                  cursor: "pointer", marginBottom: isCollapsed ? 0 : 10,
                }}
              >
                <span style={{
                  color: T.textTertiary, fontSize: 14, transition: "transform 0.2s",
                  transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                }}>{"\u25bc"}</span>
                <span style={{
                  display: "inline-flex", padding: "2px 6px",
                  background: `${gameColor}18`, border: `1px solid ${gameColor}44`,
                  borderRadius: 4, fontSize: 10, fontWeight: 700, color: gameColor,
                  fontFamily: T.mono,
                }}>{tag}</span>
                <span style={{ color: T.text, fontSize: 14, fontWeight: 700, flex: 1 }}>
                  {gameName}
                </span>
                <span style={{ color: T.textTertiary, fontSize: 12, fontFamily: T.mono }}>
                  {items.length} project{items.length !== 1 ? "s" : ""}
                </span>
                {groupSelCount > 0 && (
                  <span style={{ color: T.accent, fontSize: 11, fontWeight: 700 }}>
                    {groupSelCount} selected
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); selectAllInGroup(tag); }}
                  style={{
                    background: "none", border: `1px solid ${T.border}`, borderRadius: 6,
                    padding: "4px 10px", color: T.textSecondary, fontSize: 11,
                    fontWeight: 600, cursor: "pointer", fontFamily: T.font,
                  }}
                >
                  {allGroupSel ? "Deselect" : "Select All"}
                </button>
              </div>

              {/* Projects in this group */}
              {!isCollapsed && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {items.map((p) => {
                    const st = getProjectStatus(p);
                    const pColor = getGameColor(p, gamesDb);
                    const clipCount = p.clips ? p.clips.length : 0;
                    const isSel = !!selected[p.id];

                    return (
                      <div
                        key={p.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "14px 16px", borderRadius: T.radius.md,
                          background: isSel ? T.accentDim : T.surface,
                          border: `1px solid ${isSel ? T.accentBorder : st === "done" ? T.greenBorder : st === "error" ? T.redBorder : T.border}`,
                          opacity: st === "processing" ? 0.7 : st === "error" ? 0.5 : 1,
                          cursor: "pointer",
                        }}
                      >
                        {/* Checkbox */}
                        <div onClick={(e) => { e.stopPropagation(); toggle(p.id); }}>
                          <Checkbox checked={isSel} size={18} />
                        </div>

                        {/* Main content — click to open */}
                        <div
                          onClick={() => (st === "ready" || st === "done") && onSelect(p)}
                          style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, overflow: "hidden" }}
                        >
                          <div style={{
                            width: 38, height: 38, borderRadius: T.radius.sm,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 18, flexShrink: 0,
                            background: st === "done" ? T.greenDim : st === "error" ? T.redDim : `${pColor}18`,
                          }}>
                            {st === "done" ? "\u2705" : st === "error" ? "\u274c" : st === "processing" ? "\u23f3" : "\ud83c\udfac"}
                          </div>
                          <div style={{ flex: 1, overflow: "hidden" }}>
                            <div style={{ color: T.text, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {p.name}
                            </div>
                            <div style={{ color: T.textTertiary, fontSize: 12, marginTop: 2 }}>
                              {st === "processing" ? (
                                <span>Processing{p.progress ? <span style={{ fontFamily: T.mono, color: T.yellow }}> {p.progress}%</span> : "..."}</span>
                              ) : st === "error" ? (
                                <span style={{ color: T.red }}>{p.error || "Failed"}</span>
                              ) : (
                                <><span style={{ fontFamily: T.mono }}>{clipCount}</span> clip{clipCount !== 1 ? "s" : ""}</>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Status badge */}
                        <Badge color={st === "done" ? T.green : st === "processing" ? T.yellow : st === "error" ? T.red : T.accent}>
                          {st === "done" ? "Done" : st === "processing" ? "Processing" : st === "error" ? "Error" : "Review"}
                        </Badge>

                        {/* Delete icon */}
                        <span
                          onClick={(e) => handleSingleDelete(e, p.id)}
                          title="Delete project"
                          style={{
                            color: T.textMuted, fontSize: 16, cursor: "pointer", padding: "4px 6px",
                            borderRadius: 4, flexShrink: 0, lineHeight: 1,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = T.red; e.currentTarget.style.background = T.redDim; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = T.textMuted; e.currentTarget.style.background = "transparent"; }}
                        >{"\ud83d\uddd1"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer actions */}
      {selCount > 0 && (
        <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={handleDelete}
            style={{
              padding: "10px 18px", borderRadius: T.radius.md, border: "none",
              background: confirmDelete ? T.red : T.redDim,
              color: confirmDelete ? "#fff" : T.red,
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: T.font,
              border: `1px solid ${confirmDelete ? T.red : "rgba(248,113,113,0.25)"}`,
            }}
          >
            {confirmDelete ? `Confirm Delete ${selCount}?` : `Delete (${selCount})`}
          </button>
          {confirmDelete && (
            <button
              onClick={() => setConfirmDelete(false)}
              style={{
                padding: "10px 18px", borderRadius: T.radius.md,
                border: `1px solid ${T.border}`, background: "transparent",
                color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
              }}
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============ (GenerationPanel + GameDropdown removed — AI generation now lives in EditorView) ============

// ============ CLIP BROWSER ============
export function ClipBrowser({ project, onBack, onUpdateClip, onTranscript, onEditClipTitle, onOpenInEditor, onBatchRender, gamesDb }) {
  const [filter, setFilter] = useState("all");
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState("");
  const [expandedClip, setExpandedClip] = useState(null); // clipId or null
  const [batchRendering, setBatchRendering] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ pct: 0, detail: "" });

  const clips = project.clips || [];
  const isApproved = (c) => c.status === "approved" || c.status === "ready";
  const filtered = clips.filter((c) => filter === "approved" ? isApproved(c) : filter === "pending" ? c.status === "none" : true);
  const approved = clips.filter(isApproved).length;
  const pending = clips.filter((c) => c.status === "none").length;
  const rendered = clips.filter((c) => c.renderStatus === "rendered").length;
  const renderableApproved = clips.filter((c) => isApproved(c) && c.renderStatus !== "rendered").length;

  const handleBatchRender = async () => {
    if (batchRendering || renderableApproved === 0) return;
    setBatchRendering(true);
    setBatchProgress({ pct: 0, detail: "Starting batch render..." });
    const onProgress = (p) => setBatchProgress(p);
    window.clipflow?.onRenderProgress?.(onProgress);
    try {
      const clipsToRender = clips.filter((c) => isApproved(c) && c.renderStatus !== "rendered");
      await window.clipflow.batchRender(clipsToRender, project, null, {});
    } catch (e) { /* handled by result */ }
    window.clipflow?.removeRenderProgressListener?.();
    setBatchRendering(false);
    // Trigger refresh by calling onBack then re-opening (parent handles)
    if (onBatchRender) onBatchRender(project.id);
  };

  return (
    <div>
      <PageHeader title={project.name} subtitle={`${approved} approved · ${pending} pending${rendered > 0 ? ` · ${rendered} rendered` : ""}`} backAction={onBack}>
        {renderableApproved > 0 && (
          <button
            onClick={handleBatchRender}
            disabled={batchRendering}
            style={{
              padding: "6px 14px", borderRadius: 6, border: "none",
              background: batchRendering ? T.yellow : `linear-gradient(135deg, ${T.green}, #2dd4a8)`,
              color: batchRendering ? "#000" : "#fff", fontSize: 12, fontWeight: 700,
              cursor: batchRendering ? "default" : "pointer", fontFamily: T.font,
              whiteSpace: "nowrap",
            }}
          >
            {batchRendering ? `⏳ ${batchProgress.pct}%` : `🚀 Render All (${renderableApproved})`}
          </button>
        )}
        <span onClick={() => { navigator.clipboard.writeText(String(project.id)); }} title="Copy project ID" style={{ color: T.textTertiary, fontSize: 11, fontFamily: T.mono, cursor: "pointer", flexShrink: 0, padding: "2px 8px", borderRadius: 4, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}` }}>#{project.id}</span>
      </PageHeader>

      <TabBar tabs={[{ id: "all", label: "All", count: clips.length }, { id: "pending", label: "Pending", count: pending }, { id: "approved", label: "Approved", count: approved }]} active={filter} onChange={setFilter} />

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        {filtered.map((clip) => {
          const ca = isApproved(clip);
          const rej = clip.status === "rejected";
          const clipDuration = Math.round((clip.endTime || 0) - (clip.startTime || 0));
          const clipTranscript = getClipTranscript(clip, project);
          return (
            <Card key={clip.id} borderColor={ca ? T.greenBorder : T.border} style={{ padding: 20, opacity: rej ? 0.35 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  {editId === clip.id ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { onEditClipTitle(project.id, clip.id, editText); setEditId(null); } if (e.key === "Escape") setEditId(null); }} autoFocus style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.accentBorder}`, borderRadius: T.radius.md, padding: "10px 14px", color: T.text, fontSize: 15, fontWeight: 600, fontFamily: T.font, outline: "none" }} />
                      <button onClick={() => { onEditClipTitle(project.id, clip.id, editText); setEditId(null); }} style={{ background: T.accent, border: "none", borderRadius: T.radius.md, padding: "10px 18px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Save</button>
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
                <span style={{ color: T.textTertiary, fontSize: 13, fontFamily: T.mono }}>{clipDuration}s</span>
                {(clip.highlightScore || 0) > 0 && <ViralBar score={clip.highlightScore} />}
                {clip.highlightReason && (
                  <span style={{ color: T.textTertiary, fontSize: 11, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>{clip.highlightReason}</span>
                )}
              </div>
              {!rej && (
                <div style={{ display: "flex", gap: 8, paddingTop: 14, borderTop: `1px solid ${T.border}`, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
                  {clipTranscript && (
                    <button onClick={() => onTranscript({ ...clip, transcript: clipTranscript })} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>{"\ud83d\udcdd"} Transcript</button>
                  )}
                  {clipTranscript && (
                    <button onClick={() => setExpandedClip(expandedClip === clip.id ? null : clip.id)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${expandedClip === clip.id ? T.accentBorder : T.border}`, background: expandedClip === clip.id ? T.accentDim : "rgba(255,255,255,0.03)", color: expandedClip === clip.id ? T.accentLight : T.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>{"\u2728"} AI Titles</button>
                  )}
                  {onOpenInEditor && (
                    <button onClick={() => onOpenInEditor(project.id, clip.id)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.accentBorder}`, background: T.accentDim, color: T.accentLight, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>{"\ud83c\udfac"} Open in Editor</button>
                  )}
                  {ca && <Badge color={T.green}>{"\u2713"} Queued</Badge>}
                  {clip.renderStatus === "rendered" && <Badge color={T.cyan}>{"✓"} Rendered</Badge>}
                  {clip.renderStatus === "rendering" && <Badge color={T.yellow}>{"⏳"} Rendering</Badge>}
                </div>
              )}
              {expandedClip === clip.id && clipTranscript && (
                <div style={{ marginTop: 14, borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, background: "rgba(139,92,246,0.06)", border: `1px solid ${T.accentBorder}` }}>
                    <span style={{ fontSize: 16 }}>✦</span>
                    <div style={{ flex: 1, color: T.textSecondary, fontSize: 12 }}>
                      AI title & caption generation is available in the <strong style={{ color: T.text }}>Editor</strong>
                    </div>
                    <button
                      onClick={() => onOpenInEditor(project.id, clip.id)}
                      style={{
                        padding: "6px 14px", borderRadius: 6, border: "none",
                        background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
                        color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font,
                        whiteSpace: "nowrap", boxShadow: "0 2px 12px rgba(139,92,246,0.25)",
                      }}
                    >
                      🎬 Open in Editor
                    </button>
                  </div>
                </div>
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
