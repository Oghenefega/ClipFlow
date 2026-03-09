import React, { useState, useEffect } from "react";
import T from "../styles/theme";
import { Card, PageHeader, PrimaryButton, Checkbox, SectionLabel } from "../components/shared";

const RENAMED_PATTERN = /^\d{4}-\d{2}-\d{2}\s+\S+\s+Day\d+\s+Pt\d+\.(mp4|mkv)$/i;

const formatSize = (bytes) => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const monthLabel = (folder) => {
  if (folder === "root") return "Root Folder";
  const parts = folder.split("-");
  if (parts.length !== 2) return folder;
  const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
};

// Pure helpers — extract game info from renamed filenames
const getGameFromName = (name) => { const m = name.match(/^\d{4}-\d{2}-\d{2}\s+(\S+)\s+Day/); return m ? m[1] : ""; };
const getGameColor = (tag, gamesDb) => { const g = gamesDb.find((x) => x.tag === tag); return g ? g.color : T.accent; };
const shortName = (name) => { const m = name.match(/^\d{4}-\d{2}-\d{2}\s+(.+)\.(mp4|mkv)$/i); return m ? m[1] : name; };

export default function UploadView({ watchFolder, gamesDb = [], onCreateProject, uploadedFiles = {}, setUploadedFiles }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState({});
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({});
  const [uploadStatus, setUploadStatus] = useState({}); // per-index: uploading | uploaded | vizard-creating | vizard-done | error
  const [errors, setErrors] = useState({});
  const [collapsed, setCollapsed] = useState({});

  // Scan watch folder for renamed files
  useEffect(() => {
    const scan = async () => {
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
            } catch (e) { /* skip */ }
          }
        }
        // Sort oldest first
        all.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        setFiles(all);
      } catch (e) { console.error("Failed to scan watch folder:", e); }
      setLoading(false);
    };
    scan();
  }, [watchFolder]);

  // Listen for R2 upload progress events
  useEffect(() => {
    if (!window.clipflow?.onUploadProgress) return;
    const handler = (data) => {
      setProgress((p) => ({ ...p, [data.fileName]: data.progress }));
    };
    window.clipflow.onUploadProgress(handler);
    return () => {
      if (window.clipflow?.removeUploadProgressListener) {
        window.clipflow.removeUploadProgressListener();
      }
    };
  }, []);

  const isFileDone = (i) => {
    const status = uploadStatus[i];
    return status === "uploaded" || status === "vizard-done" || status === "vizard-creating";
  };

  const toggle = (i) => {
    if (isFileDone(i) || uploadedFiles[files[i]?.name]) return;
    setSelected((p) => ({ ...p, [i]: !p[i] }));
  };

  const selCount = Object.keys(selected).filter((k) => selected[k] && !isFileDone(parseInt(k)) && !uploadedFiles[files[parseInt(k)]?.name]).length;

  const upload = async () => {
    if (selCount === 0 || uploading) return;
    setUploading(true);

    const toUpload = Object.keys(selected)
      .filter((k) => selected[k] && !isFileDone(parseInt(k)) && !uploadedFiles[files[parseInt(k)]?.name])
      .map((k) => parseInt(k));

    for (const idx of toUpload) {
      const file = files[idx];
      if (!file) continue;

      // Phase 1: Upload to R2
      setUploadStatus((p) => ({ ...p, [idx]: "uploading" }));
      setProgress((p) => ({ ...p, [file.name]: 0 }));

      const result = await window.clipflow.r2Upload(file.path, file.name);

      if (result.error) {
        setUploadStatus((p) => ({ ...p, [idx]: "error" }));
        setErrors((p) => ({ ...p, [idx]: result.error }));
        continue;
      }

      // Mark as uploaded in persistent store
      if (setUploadedFiles) {
        setUploadedFiles((prev) => {
          const next = { ...prev, [file.name]: { uploadedAt: Date.now(), url: result.url } };
          if (window.clipflow?.storeSet) window.clipflow.storeSet("uploadedFiles", next);
          return next;
        });
      }
      setUploadStatus((p) => ({ ...p, [idx]: "uploaded" }));

      // Phase 2: Create Vizard project
      setUploadStatus((p) => ({ ...p, [idx]: "vizard-creating" }));
      const projectName = file.name.replace(/\.(mp4|mkv)$/i, "");
      const vizResult = await window.clipflow.vizardCreateProject(result.url, projectName);

      if (vizResult.error || (vizResult.code && vizResult.code !== 200 && vizResult.code !== 1000)) {
        // R2 upload succeeded, just Vizard failed
        setUploadStatus((p) => ({ ...p, [idx]: "uploaded" }));
        setErrors((p) => ({ ...p, [idx]: `Vizard: ${vizResult.error || vizResult.msg || "Unknown error"}` }));
      } else {
        setUploadStatus((p) => ({ ...p, [idx]: "vizard-done" }));
        // Save the project to App state
        if (onCreateProject && vizResult.data) {
          const tag = getGameFromName(file.name);
          const game = gamesDb.find((g) => g.tag === tag);
          onCreateProject({
            id: String(vizResult.data.projectId || vizResult.data.id || Date.now()),
            name: projectName,
            fileName: file.name,
            videoUrl: result.url,
            status: "processing",
            progress: 0,
            clips: [],
            createdAt: new Date().toISOString(),
            game: game?.name || tag || "Unknown",
            gameTag: tag,
            gameColor: game?.color || T.accent,
          });
        }
      }
    }

    setUploading(false);
  };


  // Mark selected files as uploaded without actually uploading (for files already processed externally)
  const markAsUploaded = () => {
    const toMark = Object.keys(selected)
      .filter((k) => selected[k] && !isFileDone(parseInt(k)) && !uploadedFiles[files[parseInt(k)]?.name])
      .map((k) => parseInt(k));
    if (toMark.length === 0) return;
    setUploadedFiles((prev) => {
      const next = { ...prev };
      toMark.forEach((idx) => {
        const file = files[idx];
        if (file) next[file.name] = { uploadedAt: Date.now(), url: null, manual: true };
      });
      if (window.clipflow?.storeSet) window.clipflow.storeSet("uploadedFiles", next);
      return next;
    });
    setSelected({});
  };

  // Unmark a manually-marked file (only works for manual entries, not real uploads)
  const unmarkFile = (i) => {
    const f = files[i];
    if (!f || !uploadedFiles[f.name] || !uploadedFiles[f.name].manual) return;
    setUploadedFiles((prev) => {
      const next = { ...prev };
      delete next[f.name];
      if (window.clipflow?.storeSet) window.clipflow.storeSet("uploadedFiles", next);
      return next;
    });
  };

  const grouped = {};
  files.forEach((f, i) => { if (!grouped[f.folder]) grouped[f.folder] = []; grouped[f.folder].push({ file: f, index: i }); });

  // Sort folder keys: oldest month first (ascending), root at the end
  const folderKeys = Object.keys(grouped).sort((a, b) => {
    if (a === "root") return 1;
    if (b === "root") return -1;
    return a.localeCompare(b);
  });

  const toggleCollapse = (folder) => setCollapsed((p) => ({ ...p, [folder]: !p[folder] }));
  const selectAllInFolder = (folder) => {
    const items = grouped[folder];
    const selectable = items.filter((item) => !isFileDone(item.index) && !uploadedFiles[item.file.name]);
    const allSel = selectable.length > 0 && selectable.every((item) => selected[item.index]);
    const u = {};
    selectable.forEach((item) => { u[item.index] = !allSel; });
    setSelected((p) => ({ ...p, ...u }));
  };

  const PILL_W = 200;

  // Count stats
  const totalUploaded = files.filter((f) => uploadedFiles[f.name]).length;

  return (
    <div>
      <PageHeader title="Upload & Clip" subtitle={"Renamed recordings \u2192 R2 \u2192 Vizard AI"} />

      <div style={{ marginTop: 16 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: T.textTertiary }}>Scanning watch folder...</div>
        ) : files.length === 0 ? (
          <Card style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{"\ud83d\udcc2"}</div>
            <div style={{ color: T.textSecondary, fontSize: 15, fontWeight: 600 }}>No renamed files found</div>
            <div style={{ color: T.textTertiary, fontSize: 13, marginTop: 8 }}>Rename files in the Rename tab first, then they'll appear here for upload.</div>
          </Card>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <SectionLabel>{files.length} renamed file{files.length !== 1 ? "s" : ""}{totalUploaded > 0 ? ` \u00b7 ${totalUploaded} uploaded` : ""}</SectionLabel>
              <button onClick={() => { const u = {}; files.forEach((f, i) => { if (!isFileDone(i) && !uploadedFiles[f.name]) u[i] = true; }); setSelected((p) => ({ ...p, ...u })); }} style={{ background: "none", border: "none", color: T.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font, padding: 0 }}>Select All</button>
            </div>

            {folderKeys.map((folder) => {
              const items = grouped[folder];
              const isCollapsed = collapsed[folder];
              const folderSelCount = items.filter((item) => selected[item.index]).length;
              const folderUploadedCount = items.filter((item) => uploadedFiles[item.file.name]).length;

              return (
                <div key={folder} style={{ marginBottom: 16 }}>
                  {/* Folder header */}
                  <div
                    onClick={() => toggleCollapse(folder)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: T.radius.md, background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}`, cursor: "pointer", marginBottom: isCollapsed ? 0 : 10 }}
                  >
                    <span style={{ color: T.textTertiary, fontSize: 14, transition: "transform 0.2s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>{"\u25bc"}</span>
                    <span style={{ fontSize: 18 }}>{"\ud83d\udcc1"}</span>
                    <span style={{ color: T.text, fontSize: 14, fontWeight: 700, flex: 1 }}>{monthLabel(folder)}</span>
                    <span style={{ color: T.textTertiary, fontSize: 12, fontFamily: T.mono }}>{items.length} file{items.length !== 1 ? "s" : ""}</span>
                    {folderUploadedCount > 0 && <span style={{ color: T.green, fontSize: 11, fontWeight: 700 }}>{folderUploadedCount} uploaded</span>}
                    {folderSelCount > 0 && <span style={{ color: T.accent, fontSize: 11, fontWeight: 700 }}>{folderSelCount} selected</span>}
                    <button onClick={(e) => { e.stopPropagation(); selectAllInFolder(folder); }} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 10px", color: T.textSecondary, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>
                      {items.filter((item) => !isFileDone(item.index) && !uploadedFiles[item.file.name]).length > 0 && items.filter((item) => !isFileDone(item.index) && !uploadedFiles[item.file.name]).every((item) => selected[item.index]) ? "Deselect" : "Select All"}
                    </button>
                  </div>

                  {/* Files as uniform-width horizontal pills */}
                  {!isCollapsed && (
                    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${PILL_W}px, 1fr))`, gap: 6 }}>
                      {items.map(({ file: f, index: i }) => {
                        const status = uploadStatus[i];
                        const isSel = selected[i];
                        const tag = getGameFromName(f.name);
                        const tagColor = getGameColor(tag, gamesDb);
                        const wasUploaded = uploadedFiles[f.name];
                        const isDone = isFileDone(i) || !!wasUploaded;
                        const isUp = status === "uploading";
                        const isError = status === "error";
                        const prog = progress[f.name] || 0;

                        return (
                          <div
                            key={i}
                            onClick={() => toggle(i)}
                            title={isError ? errors[i] : undefined}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "7px 10px",
                              borderRadius: T.radius.md,
                              border: `1px solid ${isDone ? T.greenBorder : isError ? T.redBorder : isSel ? T.accentBorder : T.border}`,
                              background: isDone ? "rgba(52,211,153,0.06)" : isError ? "rgba(248,113,113,0.06)" : isSel ? T.accentDim : T.surface,
                              cursor: isDone ? "default" : "pointer",
                              overflow: "hidden",
                              position: "relative",
                            }}
                          >
                            {/* Progress bar background */}
                            {isUp && (
                              <div style={{
                                position: "absolute", left: 0, top: 0, bottom: 0,
                                width: `${prog}%`,
                                background: "rgba(139,92,246,0.12)",
                                transition: "width 0.3s",
                                zIndex: 0,
                              }} />
                            )}
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, overflow: "hidden", zIndex: 1 }}>
                              <Checkbox checked={!!isSel || isDone} size={16} />
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
                              <span style={{ color: T.text, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{shortName(f.name)}</span>
                              <span style={{ color: T.textTertiary, fontSize: 10, fontFamily: T.mono, flexShrink: 0 }}>{formatSize(f.size)}</span>
                              {isUp && (
                                <span style={{ color: T.accentLight, fontSize: 10, fontWeight: 700, fontFamily: T.mono, flexShrink: 0 }}>{prog}%</span>
                              )}
                              {status === "vizard-creating" && (
                                <span style={{ padding: "1px 5px", borderRadius: 4, fontSize: 8, fontWeight: 700, color: T.yellow, background: T.yellowDim, flexShrink: 0 }}>VIZARD</span>
                              )}
                              {isDone && !isUp && status !== "vizard-creating" && (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 5px", borderRadius: 4, fontSize: 8, fontWeight: 700, textTransform: "uppercase", color: T.green, background: T.greenDim, flexShrink: 0 }}>
                                  {wasUploaded?.manual ? "MANUAL" : "\u2713"}
                                  {wasUploaded?.manual && (
                                    <span
                                      onClick={(e) => { e.stopPropagation(); unmarkFile(i); }}
                                      title="Unmark as uploaded"
                                      style={{ cursor: "pointer", color: T.textMuted, fontSize: 10, fontWeight: 700, marginLeft: 2, lineHeight: 1 }}
                                      onMouseEnter={(e) => { e.currentTarget.style.color = T.red; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.color = T.textMuted; }}
                                    >{"\u00d7"}</span>
                                  )}
                                </span>
                              )}
                              {isError && (
                                <span style={{ padding: "1px 5px", borderRadius: 4, fontSize: 8, fontWeight: 700, color: T.red, background: T.redDim, flexShrink: 0 }}>ERR</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
              <PrimaryButton onClick={upload} disabled={selCount === 0 || uploading}>
                {uploading ? "Uploading..." : selCount > 0 ? `Upload ${selCount} File${selCount > 1 ? "s" : ""} to R2` : "Select Files"}
              </PrimaryButton>
              {selCount > 0 && !uploading && (
                <button onClick={markAsUploaded} style={{
                  padding: "10px 18px", borderRadius: T.radius.md,
                  border: `1px solid ${T.greenBorder}`, background: "rgba(52,211,153,0.08)",
                  color: T.green, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: T.font,
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(52,211,153,0.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(52,211,153,0.08)"; }}
                >
                  Mark {selCount} as Uploaded
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
