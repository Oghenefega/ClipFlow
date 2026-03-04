import React, { useState, useEffect } from "react";
import T from "../styles/theme";
import { Card, PageHeader, PrimaryButton, Checkbox, SectionLabel, InfoBanner, Badge } from "../components/shared";

// Pattern for renamed files: YYYY-MM-DD TAG DayN PtM.mp4
const RENAMED_PATTERN = /^\d{4}-\d{2}-\d{2}\s+\S+\s+Day\d+\s+Pt\d+\.(mp4|mkv)$/i;

const formatSize = (bytes) => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

// Month label from folder name like "2026-03"
const monthLabel = (folder) => {
  if (folder === "root") return "Root Folder";
  const parts = folder.split("-");
  if (parts.length !== 2) return folder;
  const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
};

export default function UploadView({ watchFolder, gamesDb = [] }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState({});
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({});
  const [done, setDone] = useState({});
  const [uploadedFiles, setUploadedFiles] = useState({});
  const [collapsed, setCollapsed] = useState({});

  // Load previously uploaded files from electron-store
  useEffect(() => {
    const loadUploaded = async () => {
      if (!window.clipflow?.storeGet) return;
      try {
        const saved = await window.clipflow.storeGet("uploadedFiles");
        if (saved && typeof saved === "object") setUploadedFiles(saved);
      } catch (e) { /* ignore */ }
    };
    loadUploaded();
  }, []);

  // Scan the watch folder for renamed files
  useEffect(() => {
    const scan = async () => {
      if (!window.clipflow || !watchFolder) { setLoading(false); return; }
      setLoading(true);
      try {
        const rootFiles = await window.clipflow.readDir(watchFolder);
        let all = [];

        if (!rootFiles.error) {
          // Get renamed files from root
          const rootRenamed = rootFiles
            .filter((f) => !f.isDirectory && RENAMED_PATTERN.test(f.name))
            .map((f) => ({ ...f, folder: "root" }));
          all = [...all, ...rootRenamed];

          // Also scan monthly subfolders
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
            } catch (e) { /* skip unreadable subfolder */ }
          }
        }

        // Sort by creation date descending (newest first)
        all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setFiles(all);
      } catch (e) {
        console.error("Failed to scan watch folder:", e);
      }
      setLoading(false);
    };
    scan();
  }, [watchFolder]);

  const toggle = (i) => { if (done[i]) return; setSelected((p) => ({ ...p, [i]: !p[i] })); };
  const selCount = Object.keys(selected).filter((k) => selected[k] && !done[k]).length;

  const upload = () => {
    if (selCount === 0) return;
    setUploading(true);
    Object.keys(selected).filter((k) => selected[k] && !done[k]).forEach((idx) => {
      const i = parseInt(idx);
      let p = 0;
      const iv = setInterval(() => {
        p += Math.random() * 12 + 4;
        if (p >= 100) {
          clearInterval(iv);
          setDone((pr) => ({ ...pr, [i]: true }));
          // Mark file as uploaded in persistent store
          const fileName = files[i]?.name;
          if (fileName) {
            setUploadedFiles((prev) => {
              const next = { ...prev, [fileName]: Date.now() };
              if (window.clipflow?.storeSet) window.clipflow.storeSet("uploadedFiles", next);
              return next;
            });
          }
          p = 100;
        }
        setProgress((pr) => ({ ...pr, [i]: Math.min(p, 100) }));
      }, 350 + i * 150);
    });
  };

  const batchDone = Object.keys(selected).filter((k) => selected[k]).length > 0 && Object.keys(selected).filter((k) => selected[k]).every((k) => done[k]);
  useEffect(() => { if (batchDone) setUploading(false); }, [batchDone]);

  // Extract game tag from filename
  const getGameFromName = (name) => {
    const m = name.match(/^\d{4}-\d{2}-\d{2}\s+(\S+)\s+Day/);
    return m ? m[1] : "";
  };

  // Get game color from gamesDb by tag
  const getGameColor = (tag) => {
    const game = gamesDb.find((g) => g.tag === tag);
    return game ? game.color : T.accent;
  };

  // Group files by folder
  const grouped = {};
  files.forEach((f, i) => {
    if (!grouped[f.folder]) grouped[f.folder] = [];
    grouped[f.folder].push({ file: f, index: i });
  });

  // Sort folder keys: newest month first, root last
  const folderKeys = Object.keys(grouped).sort((a, b) => {
    if (a === "root") return 1;
    if (b === "root") return -1;
    return b.localeCompare(a);
  });

  const toggleCollapse = (folder) => setCollapsed((p) => ({ ...p, [folder]: !p[folder] }));

  const selectAllInFolder = (folder) => {
    const indices = grouped[folder];
    const allSel = indices.every((item) => selected[item.index]);
    const u = {};
    indices.forEach((item) => { if (!done[item.index]) u[item.index] = !allSel; });
    setSelected((p) => ({ ...p, ...u }));
  };

  return (
    <div>
      <PageHeader title="Upload & Clip" subtitle="Renamed recordings → R2 → Vizard AI" />

      <InfoBanner icon="🚧" color={T.yellow}>R2 upload integration coming soon. Upload button is a placeholder.</InfoBanner>

      <div style={{ marginTop: 16 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: T.textTertiary }}>Scanning watch folder...</div>
        ) : files.length === 0 ? (
          <Card style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
            <div style={{ color: T.textSecondary, fontSize: 15, fontWeight: 600 }}>No renamed files found</div>
            <div style={{ color: T.textTertiary, fontSize: 13, marginTop: 8 }}>Rename files in the Rename tab first, then they'll appear here for upload.</div>
          </Card>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <SectionLabel>{files.length} renamed file{files.length !== 1 ? "s" : ""}</SectionLabel>
              <button onClick={() => { const u = {}; files.forEach((_, i) => { if (!done[i]) u[i] = true; }); setSelected((p) => ({ ...p, ...u })); }} style={{ background: "none", border: "none", color: T.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font, padding: 0 }}>Select All</button>
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
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      borderRadius: T.radius.md,
                      background: "rgba(255,255,255,0.02)",
                      border: `1px solid ${T.border}`,
                      cursor: "pointer",
                      marginBottom: isCollapsed ? 0 : 8,
                    }}
                  >
                    <span style={{ color: T.textTertiary, fontSize: 14, transition: "transform 0.2s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</span>
                    <span style={{ fontSize: 18 }}>📁</span>
                    <span style={{ color: T.text, fontSize: 14, fontWeight: 700, flex: 1 }}>{monthLabel(folder)}</span>
                    <span style={{ color: T.textTertiary, fontSize: 12, fontFamily: T.mono }}>{items.length} file{items.length !== 1 ? "s" : ""}</span>
                    {folderUploadedCount > 0 && (
                      <span style={{ color: T.green, fontSize: 11, fontWeight: 700 }}>
                        {folderUploadedCount} uploaded
                      </span>
                    )}
                    {folderSelCount > 0 && (
                      <span style={{ color: T.accent, fontSize: 11, fontWeight: 700 }}>
                        {folderSelCount} selected
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); selectAllInFolder(folder); }}
                      style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 10px", color: T.textSecondary, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}
                    >
                      {items.every((item) => selected[item.index]) ? "Deselect" : "Select All"}
                    </button>
                  </div>

                  {/* Files in folder */}
                  {!isCollapsed && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {items.map(({ file: f, index: i }) => {
                        const isDone = done[i];
                        const isSel = selected[i];
                        const isUp = uploading && isSel && !isDone;
                        const tag = getGameFromName(f.name);
                        const tagColor = getGameColor(tag);
                        const wasUploaded = uploadedFiles[f.name];
                        return (
                          <Card
                            key={i}
                            onClick={() => toggle(i)}
                            borderColor={isDone ? T.greenBorder : isSel ? T.accentBorder : T.border}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 16,
                              padding: "14px 18px",
                              cursor: isDone ? "default" : "pointer",
                              background: isDone ? "rgba(52,211,153,0.03)" : isSel ? T.accentGlow : T.surface,
                            }}
                          >
                            {isDone ? (
                              <div style={{ width: 24, height: 24, borderRadius: "50%", background: T.greenDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke={T.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              </div>
                            ) : <Checkbox checked={!!isSel} />}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ color: T.text, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                                {wasUploaded && (
                                  <span style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    padding: "2px 8px",
                                    borderRadius: 5,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.4px",
                                    color: T.green,
                                    background: T.greenDim,
                                    flexShrink: 0,
                                  }}>
                                    Uploaded
                                  </span>
                                )}
                              </div>
                              <div style={{ color: T.textTertiary, fontSize: 12, marginTop: 3 }}>
                                <span style={{ fontFamily: T.mono }}>{formatSize(f.size)}</span>
                                {tag && (
                                  <>
                                    {" · "}
                                    <span style={{
                                      display: "inline-flex",
                                      padding: "1px 6px",
                                      background: `${tagColor}18`,
                                      border: `1px solid ${tagColor}44`,
                                      borderRadius: 4,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      color: tagColor,
                                      fontFamily: T.mono,
                                      letterSpacing: "0.5px",
                                    }}>
                                      {tag}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            {isUp && (
                              <div style={{ width: 100 }}>
                                <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                                  <div style={{ width: `${progress[i] || 0}%`, height: "100%", background: T.accent, borderRadius: 2, transition: "width 0.3s" }} />
                                </div>
                                <div style={{ color: T.textTertiary, fontSize: 11, textAlign: "right", marginTop: 4, fontFamily: T.mono }}>{Math.round(progress[i] || 0)}%</div>
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ marginTop: 16 }}>
              <PrimaryButton onClick={upload} disabled={selCount === 0}>
                {selCount > 0 ? `Upload ${selCount} File${selCount > 1 ? "s" : ""}` : Object.values(done).some(Boolean) ? "All selected uploaded ✅" : "Select Files"}
              </PrimaryButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
