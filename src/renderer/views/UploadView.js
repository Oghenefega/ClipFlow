import React, { useState, useEffect, useCallback } from "react";
import T from "../styles/theme";
import { Card, GamePill, PageHeader, SectionLabel, Badge, Checkbox } from "../components/shared";

const RENAMED_PATTERN = /^\d{4}-\d{2}-\d{2}\s+\S+\s+Day\d+\s+Pt\d+\.(mp4|mkv)$/i;

function formatSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function monthLabel(folder) {
  if (folder === "root") return "Root Folder";
  const parts = folder.split("-");
  if (parts.length !== 2) return folder;
  const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function extractTag(name) {
  const m = name.match(/^\d{4}-\d{2}-\d{2}\s+(\S+)\s+Day/);
  return m ? m[1] : "";
}

function shortName(name) {
  const m = name.match(/^\d{4}-\d{2}-\d{2}\s+(.+)\.(mp4|mkv)$/i);
  return m ? m[1] : name;
}

function findGameByTag(tag, gamesDb) {
  return gamesDb.find((g) => g.tag === tag) || null;
}

function findProjectForFile(name, localProjects) {
  const baseName = name.replace(/\.(mp4|mkv)$/i, "");
  return localProjects.find((p) => p.name === baseName) || null;
}

const STAGE_LABELS = {
  probing: "Analyzing file",
  creating: "Creating project",
  extracting: "Extracting audio",
  transcribing: "Transcribing",
  analyzing: "Analyzing energy",
  detecting: "Detecting highlights",
  cutting: "Cutting clips",
  saving: "Saving project",
  complete: "Complete",
  failed: "Failed",
};

const PILL_MIN = 200;

export default function RecordingsView({ watchFolder, gamesDb = [], localProjects = [], onProjectCreated }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState({});
  const [generating, setGenerating] = useState(null);
  const [progress, setProgress] = useState(null);
  const [selected, setSelected] = useState({});
  const [doneFiles, setDoneFiles] = useState({});

  // Load done files + collapsed state from store on mount
  useEffect(() => {
    (async () => {
      if (window.clipflow?.storeGet) {
        const saved = await window.clipflow.storeGet("doneRecordings");
        if (saved && typeof saved === "object") setDoneFiles(saved);
        const savedCollapsed = await window.clipflow.storeGet("recordingsCollapsed");
        if (savedCollapsed && typeof savedCollapsed === "object") setCollapsed(savedCollapsed);
      }
    })();
  }, []);

  // Persist done files to store
  const persistDone = useCallback(async (next) => {
    setDoneFiles(next);
    if (window.clipflow?.storeSet) {
      await window.clipflow.storeSet("doneRecordings", next);
    }
  }, []);

  // Scan watch folder
  useEffect(() => {
    async function scan() {
      if (!window.clipflow || !watchFolder) { setLoading(false); return; }
      setLoading(true);
      try {
        const rootFiles = await window.clipflow.readDir(watchFolder);
        let all = [];
        if (!rootFiles.error) {
          const rootRenamed = rootFiles
            .filter((f) => !f.isDirectory && RENAMED_PATTERN.test(f.name))
            .map((f) => ({ ...f, folder: "root" }));
          all = [...all, ...rootRenamed];

          const subfolders = rootFiles.filter((f) => f.isDirectory && /^\d{4}-\d{2}$/.test(f.name));
          for (const sub of subfolders) {
            try {
              const subFiles = await window.clipflow.readDir(sub.path);
              if (!subFiles.error) {
                const subRenamed = subFiles
                  .filter((f) => !f.isDirectory && RENAMED_PATTERN.test(f.name))
                  .map((f) => ({ ...f, folder: sub.name }));
                all = [...all, ...subRenamed];
              }
            } catch (_) { /* skip */ }
          }
        }
        // Sort ascending by name (oldest first — filenames start with date)
        all.sort((a, b) => a.name.localeCompare(b.name));
        setFiles(all);
      } catch (e) {
        console.error("Failed to scan watch folder:", e);
      }
      setLoading(false);
    }
    scan();
  }, [watchFolder]);

  // Pipeline progress events
  useEffect(() => {
    if (!window.clipflow?.onPipelineProgress) return;
    window.clipflow.onPipelineProgress((data) => setProgress(data));
    return () => { window.clipflow?.removePipelineProgressListener?.(); };
  }, []);

  const handleGenerate = useCallback(async (file) => {
    if (generating) return;
    const tag = extractTag(file.name);
    const game = findGameByTag(tag, gamesDb);
    setGenerating(file.path);
    setProgress({ stage: "probing", pct: 0, detail: "Starting..." });
    try {
      const result = await window.clipflow.generateClips(file.path, {
        name: file.name.replace(/\.(mp4|mkv)$/i, ""),
        game: game?.name || tag,
        gameTag: tag,
        gameColor: game?.color || "#888",
        keywords: [],
      });
      if (result.error) {
        setProgress({ stage: "failed", pct: 0, detail: result.error });
        setTimeout(() => { setGenerating(null); setProgress(null); }, 5000);
      } else {
        setProgress({ stage: "complete", pct: 100, detail: `${result.clipCount} clips generated` });
        onProjectCreated?.(result.projectId);
        setTimeout(() => { setGenerating(null); setProgress(null); }, 3000);
      }
    } catch (e) {
      setProgress({ stage: "failed", pct: 0, detail: e.message });
      setTimeout(() => { setGenerating(null); setProgress(null); }, 5000);
    }
  }, [generating, gamesDb, onProjectCreated]);

  // --- Selection helpers ---
  const toggle = (path) => setSelected((p) => ({ ...p, [path]: !p[path] }));

  const selectAllInFolder = (folder) => {
    const items = grouped[folder] || [];
    const allSelected = items.every((f) => selected[f.path]);
    setSelected((p) => {
      const next = { ...p };
      items.forEach((f) => { next[f.path] = !allSelected; });
      return next;
    });
  };

  const selectAll = () => {
    const allSelected = files.length > 0 && files.every((f) => selected[f.path]);
    setSelected((p) => {
      const next = { ...p };
      files.forEach((f) => { next[f.path] = !allSelected; });
      return next;
    });
  };

  const selCount = Object.values(selected).filter(Boolean).length;

  // --- Done helpers ---
  const isDone = (f) => !!doneFiles[f.name] || !!findProjectForFile(f.name, localProjects);

  const markSelectedDone = () => {
    const next = { ...doneFiles };
    files.forEach((f) => {
      if (selected[f.path]) next[f.name] = true;
    });
    persistDone(next);
    setSelected({});
  };

  const unmarkDone = (fileName) => {
    const next = { ...doneFiles };
    delete next[fileName];
    persistDone(next);
  };

  // --- Group files by folder ---
  const grouped = {};
  files.forEach((f) => {
    if (!grouped[f.folder]) grouped[f.folder] = [];
    grouped[f.folder].push(f);
  });

  // Sort oldest month first (ascending), root last
  const folderKeys = Object.keys(grouped).sort((a, b) => {
    if (a === "root") return 1;
    if (b === "root") return -1;
    return a.localeCompare(b);
  });

  const toggleCollapse = (folder) => {
    setCollapsed((p) => {
      const next = { ...p, [folder]: !p[folder] };
      if (window.clipflow?.storeSet) window.clipflow.storeSet("recordingsCollapsed", next);
      return next;
    });
  };

  const totalDone = files.filter((f) => isDone(f)).length;

  if (loading) {
    return (
      <div>
        <PageHeader title="Recordings" subtitle="Generate clips from your recordings" />
        <div style={{ textAlign: "center", padding: 40, color: T.textTertiary }}>
          Scanning watch folder...
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div>
        <PageHeader title="Recordings" subtitle="Generate clips from your recordings" />
        <Card style={{ padding: 40, textAlign: "center", marginTop: 16 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>{"\uD83C\uDFAC"}</div>
          <div style={{ color: T.textSecondary, fontSize: 15, fontWeight: 600 }}>
            No renamed recordings found
          </div>
          <div style={{ color: T.textTertiary, fontSize: 13, marginTop: 8 }}>
            Rename files in the Rename tab first, then they'll appear here.
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Recordings" subtitle="Generate clips from your recordings" />

      {/* Pipeline progress overlay */}
      {generating && progress && (
        <Card style={{ padding: "16px 20px", marginBottom: 16, borderColor: progress.stage === "failed" ? T.red : progress.stage === "complete" ? T.green : T.accentBorder }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span style={{ fontSize: 18 }}>
              {progress.stage === "complete" ? "\u2705" : progress.stage === "failed" ? "\u274C" : "\u2699\uFE0F"}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ color: T.text, fontSize: 13, fontWeight: 700 }}>
                {STAGE_LABELS[progress.stage] || progress.stage}
              </div>
              <div style={{ color: T.textTertiary, fontSize: 11 }}>{progress.detail}</div>
            </div>
            <span style={{ color: T.accentLight, fontSize: 13, fontWeight: 700, fontFamily: T.mono }}>
              {progress.pct}%
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 2,
              background: progress.stage === "failed" ? T.red : progress.stage === "complete" ? T.green : `linear-gradient(90deg, ${T.accent}, ${T.accentLight})`,
              width: `${progress.pct}%`,
              transition: "width 0.3s ease",
            }} />
          </div>
        </Card>
      )}

      {/* Header row: count + select all */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <SectionLabel style={{ margin: 0 }}>
          {files.length} recording{files.length !== 1 ? "s" : ""}
          {totalDone > 0 ? ` \u00b7 ${totalDone} done` : ""}
        </SectionLabel>
        <button
          onClick={selectAll}
          style={{ background: "none", border: "none", color: T.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font, padding: 0 }}
        >
          {files.length > 0 && files.every((f) => selected[f.path]) ? "Deselect All" : "Select All"}
        </button>
      </div>

      {/* Folder groups */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {folderKeys.map((folder) => {
          const items = grouped[folder];
          const isCollapsed = collapsed[folder];
          const folderDoneCount = items.filter((f) => isDone(f)).length;
          const folderSelCount = items.filter((f) => selected[f.path]).length;
          const allFolderSelected = items.length > 0 && items.every((f) => selected[f.path]);

          return (
            <div key={folder}>
              {/* Folder header */}
              <div
                onClick={() => toggleCollapse(folder)}
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
                }}>{"\u25BC"}</span>
                <span style={{ fontSize: 18 }}>{"\uD83D\uDCC1"}</span>
                <span style={{ color: T.text, fontSize: 14, fontWeight: 700, flex: 1 }}>
                  {monthLabel(folder)}
                </span>
                <span style={{ color: T.textTertiary, fontSize: 12, fontFamily: T.mono }}>
                  {items.length} file{items.length !== 1 ? "s" : ""}
                </span>
                {folderDoneCount > 0 && (
                  <span style={{ color: T.green, fontSize: 11, fontWeight: 700 }}>
                    {folderDoneCount} done
                  </span>
                )}
                {folderSelCount > 0 && (
                  <span style={{ color: T.accent, fontSize: 11, fontWeight: 700 }}>
                    {folderSelCount} selected
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); selectAllInFolder(folder); }}
                  style={{
                    background: "none", border: `1px solid ${T.border}`, borderRadius: 6,
                    padding: "4px 10px", color: T.textSecondary, fontSize: 11,
                    fontWeight: 600, cursor: "pointer", fontFamily: T.font,
                  }}
                >
                  {allFolderSelected ? "Deselect" : "Select All"}
                </button>
              </div>

              {/* Grid of file pills */}
              {!isCollapsed && (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(auto-fill, minmax(${PILL_MIN}px, 1fr))`,
                  gap: 6,
                }}>
                  {items.map((f) => {
                    const tag = extractTag(f.name);
                    const game = findGameByTag(tag, gamesDb);
                    const tagColor = game?.color || T.accent;
                    const project = findProjectForFile(f.name, localProjects);
                    const clipCount = project?.clipCount || project?.clips?.length || 0;
                    const fileDone = isDone(f);
                    const manualDone = !!doneFiles[f.name] && !project;
                    const isSel = !!selected[f.path];
                    const isGenerating = generating === f.path;

                    return (
                      <div
                        key={f.path}
                        onClick={() => toggle(f.path)}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "7px 10px", borderRadius: T.radius.md,
                          border: `1px solid ${fileDone ? "rgba(52,211,153,0.25)" : isGenerating ? T.accentBorder : isSel ? T.accentBorder : T.border}`,
                          background: fileDone ? "rgba(52,211,153,0.06)" : isSel ? T.accentDim : T.surface,
                          cursor: "pointer", overflow: "hidden",
                          opacity: fileDone && !isGenerating ? 0.7 : 1,
                        }}
                      >
                        <Checkbox checked={isSel || fileDone} size={16} />

                        {tag && (
                          <span style={{
                            display: "inline-flex", padding: "2px 5px",
                            background: `${tagColor}18`, border: `1px solid ${tagColor}44`,
                            borderRadius: 4, fontSize: 9, fontWeight: 700, color: tagColor,
                            fontFamily: T.mono, letterSpacing: "0.5px", flexShrink: 0,
                          }}>
                            {tag}
                          </span>
                        )}

                        <span style={{
                          color: T.text, fontSize: 12, fontWeight: 600,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1,
                        }}>
                          {shortName(f.name)}
                        </span>

                        <span style={{ color: T.textTertiary, fontSize: 10, fontFamily: T.mono, flexShrink: 0 }}>
                          {formatSize(f.size)}
                        </span>

                        {/* Status badges */}
                        {project && (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 3,
                            padding: "1px 5px", borderRadius: 4, fontSize: 8, fontWeight: 700,
                            color: T.green, background: "rgba(52,211,153,0.12)", flexShrink: 0,
                          }}>
                            {"\u2713"} {clipCount}
                          </span>
                        )}

                        {manualDone && (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 3,
                            padding: "1px 5px", borderRadius: 4, fontSize: 8, fontWeight: 700,
                            textTransform: "uppercase", color: T.green,
                            background: "rgba(52,211,153,0.12)", flexShrink: 0,
                          }}>
                            DONE
                            <span
                              onClick={(e) => { e.stopPropagation(); unmarkDone(f.name); }}
                              title="Unmark as done"
                              style={{ cursor: "pointer", color: T.textMuted, fontSize: 10, fontWeight: 700, marginLeft: 2, lineHeight: 1 }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = T.red; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = T.textMuted; }}
                            >{"\u00d7"}</span>
                          </span>
                        )}

                        {isGenerating && (
                          <span style={{
                            padding: "1px 5px", borderRadius: 4, fontSize: 8, fontWeight: 700,
                            color: T.yellow, background: "rgba(251,191,36,0.12)", flexShrink: 0,
                          }}>
                            {progress?.pct || 0}%
                          </span>
                        )}
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
      <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
        {selCount > 0 && !generating && (
          <>
            <button
              onClick={() => {
                const selectedFiles = files.filter((f) => selected[f.path] && !isDone(f));
                if (selectedFiles.length > 0) handleGenerate(selectedFiles[0]);
              }}
              disabled={!!generating || files.filter((f) => selected[f.path] && !isDone(f)).length === 0}
              style={{
                padding: "10px 18px", borderRadius: T.radius.md, border: "none",
                background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
                color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
                fontFamily: T.font, boxShadow: "0 2px 12px rgba(139,92,246,0.25)",
                opacity: files.filter((f) => selected[f.path] && !isDone(f)).length === 0 ? 0.5 : 1,
              }}
            >
              Generate Clips ({files.filter((f) => selected[f.path] && !isDone(f)).length})
            </button>
            <button
              onClick={markSelectedDone}
              style={{
                padding: "10px 18px", borderRadius: T.radius.md,
                border: `1px solid rgba(52,211,153,0.25)`, background: "rgba(52,211,153,0.08)",
                color: T.green, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: T.font,
              }}
            >
              Mark {selCount} as Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
