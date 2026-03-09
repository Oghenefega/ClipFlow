import React, { useState, useEffect, useCallback } from "react";
import T from "../styles/theme";
import { Card, GamePill, PageHeader, SectionLabel, Badge } from "../components/shared";

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

function extractDate(name) {
  const m = name.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
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

export default function RecordingsView({ watchFolder, gamesDb = [], localProjects = [], onProjectCreated }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState({});
  const [generating, setGenerating] = useState(null); // file path currently generating
  const [progress, setProgress] = useState(null); // { stage, pct, detail }

  useEffect(() => {
    async function scan() {
      if (!window.clipflow || !watchFolder) {
        setLoading(false);
        return;
      }
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
            } catch (_) { /* skip unreadable subfolder */ }
          }
        }
        all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setFiles(all);
      } catch (e) {
        console.error("Failed to scan watch folder:", e);
      }
      setLoading(false);
    }
    scan();
  }, [watchFolder]);

  // Listen for pipeline progress events
  useEffect(() => {
    if (!window.clipflow?.onPipelineProgress) return;
    window.clipflow.onPipelineProgress((data) => {
      setProgress(data);
    });
    return () => {
      window.clipflow?.removePipelineProgressListener?.();
    };
  }, []);

  const handleGenerate = useCallback(async (file) => {
    if (generating) return; // already generating

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
        keywords: [], // TODO: per-game keywords from settings
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

  // Group files by folder
  const grouped = {};
  files.forEach((f) => {
    if (!grouped[f.folder]) grouped[f.folder] = [];
    grouped[f.folder].push(f);
  });

  const folderKeys = Object.keys(grouped).sort((a, b) => {
    if (a === "root") return 1;
    if (b === "root") return -1;
    return b.localeCompare(a);
  });

  function toggleCollapse(folder) {
    setCollapsed((prev) => ({ ...prev, [folder]: !prev[folder] }));
  }

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
          {/* Progress bar */}
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

      <SectionLabel style={{ marginBottom: 16 }}>
        {files.length} recording{files.length !== 1 ? "s" : ""}
      </SectionLabel>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
        {folderKeys.map((folder) => {
          const items = grouped[folder];
          const isCollapsed = collapsed[folder];
          const projectCount = items.filter((f) => findProjectForFile(f.name, localProjects)).length;

          return (
            <div key={folder}>
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
                {projectCount > 0 && (
                  <span style={{ color: T.green, fontSize: 11, fontWeight: 700 }}>
                    {projectCount} clipped
                  </span>
                )}
              </div>

              {!isCollapsed && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {items.map((f) => {
                    const tag = extractTag(f.name);
                    const game = findGameByTag(tag, gamesDb);
                    const project = findProjectForFile(f.name, localProjects);
                    const clipCount = project?.clipCount || project?.clips?.length || 0;
                    const dateStr = extractDate(f.name);
                    const isGenerating = generating === f.path;

                    return (
                      <Card key={f.path} style={{ padding: "12px 16px", borderColor: isGenerating ? T.accentBorder : undefined }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{
                            color: T.text, fontSize: 13, fontWeight: 600,
                            fontFamily: T.mono, flex: 1,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {f.name}
                          </span>

                          {tag && (
                            <GamePill tag={tag} color={game?.color || T.accent} size="sm" />
                          )}

                          <span style={{
                            color: T.textTertiary, fontSize: 11, fontFamily: T.mono, flexShrink: 0,
                          }}>
                            {dateStr}
                          </span>

                          <span style={{
                            color: T.textTertiary, fontSize: 11, fontFamily: T.mono, flexShrink: 0,
                          }}>
                            {formatSize(f.size)}
                          </span>

                          {project ? (
                            <Badge color={T.green}>
                              {"\u2713"} {clipCount} clip{clipCount !== 1 ? "s" : ""}
                            </Badge>
                          ) : (
                            <button
                              onClick={() => handleGenerate(f)}
                              disabled={!!generating}
                              style={{
                                padding: "6px 14px", borderRadius: T.radius.sm, border: "none",
                                background: generating
                                  ? "rgba(255,255,255,0.04)"
                                  : `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
                                color: generating ? T.textMuted : "#fff",
                                fontSize: 12, fontWeight: 700, fontFamily: T.font,
                                cursor: generating ? "default" : "pointer",
                                whiteSpace: "nowrap", flexShrink: 0,
                                boxShadow: generating ? "none" : "0 2px 12px rgba(139,92,246,0.25)",
                                opacity: generating && !isGenerating ? 0.5 : 1,
                              }}
                            >
                              {isGenerating ? "Generating..." : "Generate Clips"}
                            </button>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
