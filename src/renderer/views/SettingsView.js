import React, { useState, useEffect, useCallback } from "react";
import T from "../styles/theme";
import { Card, PageHeader, SectionLabel, GamePill, PulseDot, InfoBanner, hasHashtag } from "../components/shared";
import { GameEditModal } from "../components/modals";

// Shared button styles used across all settings sections
const BTN = { padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: T.font };
const btnSecondary = { ...BTN, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary };
const btnSave = { ...BTN, background: T.green, border: "none", color: "#fff", fontWeight: 700 };
const inputStyle = { width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "10px 14px", color: T.text, fontSize: 13, fontFamily: T.mono, outline: "none", boxSizing: "border-box" };
const maskKey = (key) => (!key || key.length < 8) ? (key || "") : key.substring(0, 4) + "\u2022\u2022\u2022\u2022" + key.substring(key.length - 4);

// ============ DOWNLOADS SECTION ============
function DownloadsSection({ downloadPath, setDownloadPath, vizardProjects, downloadedClips, setDownloadedClips, onRefreshProject }) {
  const [downloading, setDownloading] = useState({}); // { clipId: progress% }
  const [errors, setErrors] = useState({}); // { clipId: errorMsg }
  const [bulkActive, setBulkActive] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

  // Collect all approved clips that have a videoUrl AND a hashtag in the title
  const approvedClips = [];
  (vizardProjects || []).forEach((p) => {
    if (!p.clips) return;
    p.clips.forEach((c) => {
      if ((c.status === "approved" || c.status === "ready") && c.videoUrl && hasHashtag(c.title)) {
        approvedClips.push({ ...c, projectName: p.name, projectId: p.id, projectCreated: p.createdAt || p.created || "" });
      }
    });
  });

  // Listen for download progress
  useEffect(() => {
    if (!window.clipflow?.onDownloadProgress) return;
    const cleanup = window.clipflow.onDownloadProgress((data) => {
      if (data && data.clipId !== undefined && data.progress !== undefined) {
        setDownloading((prev) => ({ ...prev, [data.clipId]: data.progress }));
      }
    });
    return () => { if (typeof cleanup === "function") cleanup(); };
  }, []);

  const isDownloaded = (clipId) => {
    if (!downloadedClips) return false;
    if (downloadedClips instanceof Set) return downloadedClips.has(clipId);
    if (Array.isArray(downloadedClips)) return downloadedClips.includes(clipId);
    return false;
  };

  const markDownloaded = (clipId) => {
    if (!setDownloadedClips) return;
    setDownloadedClips((prev) => {
      if (Array.isArray(prev)) return [...prev, clipId];
      if (prev instanceof Set) return new Set([...prev, clipId]);
      return [clipId];
    });
  };

  // pickFolder returns a string path or null (not a dialog result object)
  const browseDownloadPath = async () => {
    if (!window.clipflow?.pickFolder) return;
    const result = await window.clipflow.pickFolder();
    if (result) {
      setDownloadPath(result);
    }
  };

  const sanitizeFilename = (title) => {
    return (title || "clip").replace(/[<>:"/\\|?*]/g, "_").substring(0, 120);
  };

  const extractProjectDate = (clip) => {
    if (clip.projectCreated) {
      const d = new Date(clip.projectCreated);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split("T")[0];
      }
    }
    return new Date().toISOString().split("T")[0];
  };

  const downloadOne = useCallback(async (clip) => {
    if (!downloadPath || !clip.videoUrl) return false;

    const date = extractProjectDate(clip);
    const fileName = `${sanitizeFilename(clip.title)}_${date}.mp4`;
    const sep = downloadPath.includes("/") ? "/" : "\\";
    const savePath = `${downloadPath}${sep}${fileName}`;

    setDownloading((prev) => ({ ...prev, [clip.id]: 0 }));
    setErrors((prev) => { const n = { ...prev }; delete n[clip.id]; return n; });

    try {
      // Set up progress listener specific to this clip
      let progressUnsub = null;
      if (window.clipflow?.onDownloadProgress) {
        progressUnsub = window.clipflow.onDownloadProgress((data) => {
          if (data.url === clip.videoUrl) {
            setDownloading((prev) => ({ ...prev, [clip.id]: data.progress }));
          }
        });
      }

      const result = await window.clipflow.downloadClip(clip.videoUrl, savePath);

      if (typeof progressUnsub === "function") progressUnsub();

      if (result && result.success) {
        markDownloaded(clip.id);
        setDownloading((prev) => { const n = { ...prev }; delete n[clip.id]; return n; });
        return true;
      }

      setErrors((prev) => ({ ...prev, [clip.id]: result?.error || "Download failed" }));
      setDownloading((prev) => { const n = { ...prev }; delete n[clip.id]; return n; });
      return false;
    } catch (e) {
      setErrors((prev) => ({ ...prev, [clip.id]: e.message || "Download failed" }));
      setDownloading((prev) => { const n = { ...prev }; delete n[clip.id]; return n; });
      return false;
    }
  }, [downloadPath, downloadedClips]);

  const pendingClips = approvedClips.filter((c) => !isDownloaded(c.id) && !errors[c.id]);
  const downloadedCount = approvedClips.filter((c) => isDownloaded(c.id)).length;
  const errorClips = approvedClips.filter((c) => errors[c.id]);

  const downloadAll = useCallback(async () => {
    const toDownload = approvedClips.filter((c) => !isDownloaded(c.id) && !downloading[c.id]);
    if (!downloadPath || toDownload.length === 0) return;

    setBulkActive(true);
    setBulkProgress({ done: 0, total: toDownload.length });

    // If URLs might be expired (7+ days old), refresh project data first
    if (onRefreshProject) {
      const projectIds = [...new Set(toDownload.map((c) => c.projectId))];
      for (const pid of projectIds) {
        await onRefreshProject(pid);
      }
    }

    let completed = 0;
    for (const clip of toDownload) {
      if (isDownloaded(clip.id)) {
        completed++;
        setBulkProgress({ done: completed, total: toDownload.length });
        continue;
      }
      const success = await downloadOne(clip);
      if (success) completed++;
      setBulkProgress({ done: completed, total: toDownload.length });
    }

    setBulkActive(false);
  }, [downloadPath, approvedClips, downloadedClips, downloading, downloadOne, onRefreshProject]);

  const retryFailed = useCallback(async () => {
    const failed = approvedClips.filter((c) => errors[c.id]);
    if (failed.length === 0) return;
    setBulkActive(true);
    setBulkProgress({ done: 0, total: failed.length });

    let completed = 0;
    for (const clip of failed) {
      const success = await downloadOne(clip);
      if (success) completed++;
      setBulkProgress({ done: completed, total: failed.length });
    }
    setBulkActive(false);
  }, [approvedClips, errors, downloadOne]);

  function getDownloadButtonContent() {
    if (bulkActive) {
      return `Downloading... (${bulkProgress.done}/${bulkProgress.total})`;
    }
    if (pendingClips.length === 0 && errorClips.length === 0 && downloadedCount > 0) {
      return "\u2705 All Downloaded";
    }
    if (pendingClips.length > 0) {
      return `Download ${pendingClips.length} Clip${pendingClips.length !== 1 ? "s" : ""}`;
    }
    return null;
  }

  const buttonContent = getDownloadButtonContent();
  const allDone = pendingClips.length === 0 && errorClips.length === 0 && downloadedCount > 0;

  return (
    <Card style={{ padding: 24 }}>
      <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Downloads</div>

      {/* Download Path */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <span style={{ color: T.textTertiary, fontSize: 12, flexShrink: 0 }}>Save to</span>
        <div style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "8px 12px", color: downloadPath ? T.text : T.textMuted, fontSize: 12, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {downloadPath || "No folder selected"}
        </div>
        <button onClick={browseDownloadPath} style={{ ...BTN, background: T.accentDim, border: `1px solid ${T.accentBorder}`, color: T.accentLight, fontWeight: 700, flexShrink: 0 }}>Browse</button>
        {downloadPath && (
          <button onClick={() => { if (window.clipflow?.openFolder) window.clipflow.openFolder(downloadPath); }} style={{ ...BTN, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary, flexShrink: 0 }} title="Open folder">{"\ud83d\udcc2"}</button>
        )}
      </div>

      {/* Download button */}
      {downloadPath && buttonContent && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={allDone ? undefined : downloadAll}
            disabled={bulkActive || allDone}
            style={{
              ...BTN,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 700,
              background: allDone ? T.greenDim : T.accentDim,
              border: `1px solid ${allDone ? T.greenBorder : T.accentBorder}`,
              color: allDone ? T.green : T.accentLight,
              opacity: bulkActive ? 0.7 : 1,
              cursor: bulkActive || allDone ? "default" : "pointer",
            }}
          >
            {buttonContent}
          </button>
        </div>
      )}

      {/* Retry failed button */}
      {!bulkActive && errorClips.length > 0 && downloadPath && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={retryFailed}
            style={{ ...BTN, padding: "8px 16px", background: T.redDim, border: `1px solid ${T.redBorder}`, color: T.red, fontWeight: 700 }}
          >
            Retry {errorClips.length} Failed
          </button>
        </div>
      )}

      {/* Clip List */}
      {!downloadPath ? (
        <InfoBanner icon={"\ud83d\udcc1"} color={T.yellow}>Select a download folder above to start downloading approved clips.</InfoBanner>
      ) : approvedClips.length === 0 ? (
        <InfoBanner icon={"\ud83c\udfac"} color={T.accent}>No approved clips with hashtags to download. Approve clips in the Projects tab first.</InfoBanner>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {approvedClips.map((clip) => {
            const isActive = downloading[clip.id] !== undefined;
            const isDone = isDownloaded(clip.id);
            const hasError = errors[clip.id];
            const progress = downloading[clip.id] || 0;

            let statusColor = T.textMuted;
            let statusText = "Pending";
            let statusIcon = "";

            if (isDone) {
              statusColor = T.green;
              statusText = "Downloaded";
              statusIcon = "\u2705";
            } else if (isActive) {
              statusColor = T.accent;
              statusText = `Downloading... ${progress}%`;
              statusIcon = "\u23f3";
            } else if (hasError) {
              statusColor = T.red;
              statusText = "Failed";
              statusIcon = "\u26a0";
            }

            return (
              <div key={clip.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: T.radius.md, border: `1px solid ${isDone ? T.greenBorder : hasError ? T.redBorder : T.border}`, position: "relative", overflow: "hidden" }}>
                {/* Progress bar background */}
                {isActive && (
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${progress}%`, background: `${T.accent}12`, transition: "width 0.3s ease", pointerEvents: "none" }} />
                )}
                <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
                  <div style={{ color: T.text, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clip.title}</div>
                </div>
                <div style={{ flexShrink: 0, position: "relative" }}>
                  <span style={{ color: statusColor, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {statusIcon} {statusText}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Summary */}
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            <span style={{ color: T.textTertiary, fontSize: 11 }}>{approvedClips.length} clip{approvedClips.length !== 1 ? "s" : ""}</span>
            {downloadedCount > 0 && <span style={{ color: T.green, fontSize: 11 }}>{downloadedCount} downloaded</span>}
            {pendingClips.length > 0 && <span style={{ color: T.textSecondary, fontSize: 11 }}>{pendingClips.length} pending</span>}
            {errorClips.length > 0 && <span style={{ color: T.red, fontSize: 11 }}>{errorClips.length} failed</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function SettingsView({ mainGame, setMainGame, mainPool, setMainPool, gamesDb, setGamesDb, onEditGame, watchFolder, setWatchFolder, platforms, setPlatforms, r2Config, setR2Config, vizardApiKey, setVizardApiKey, downloadPath, setDownloadPath, vizardProjects, onResetUploads, downloadedClips, setDownloadedClips, onRefreshProject, anthropicApiKey, setAnthropicApiKey, styleGuide, setStyleGuide }) {
  const [editFolder, setEditFolder] = useState(false);
  const [folderVal, setFolderVal] = useState(watchFolder);
  const [editGD, setEditGD] = useState(null);
  const [showAddMain, setShowAddMain] = useState(false);
  const [selGameLib, setSelGameLib] = useState(null);
  const [editR2, setEditR2] = useState(false);
  const [r2Vals, setR2Vals] = useState(r2Config || {});
  const [editVizard, setEditVizard] = useState(false);
  const [vizVal, setVizVal] = useState(vizardApiKey || "");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [showR2Secret, setShowR2Secret] = useState(false);
  const [showVizardKey, setShowVizardKey] = useState(false);
  const [showR2SecretEdit, setShowR2SecretEdit] = useState(false);
  const [showVizardKeyEdit, setShowVizardKeyEdit] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const [showR2, setShowR2] = useState(false);
  const [showVizard, setShowVizard] = useState(false);
  const [showAnthropic, setShowAnthropic] = useState(false);
  const [editAnthropic, setEditAnthropic] = useState(false);
  const [anthropicVal, setAnthropicVal] = useState(anthropicApiKey || "");
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showAnthropicKeyEdit, setShowAnthropicKeyEdit] = useState(false);
  const [editGuide, setEditGuide] = useState(false);
  const [guideVal, setGuideVal] = useState(styleGuide || "");

  const copyToClipboard = (value, fieldName) => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const iconBtn = { background: "none", border: "none", cursor: "pointer", padding: "2px 4px", fontSize: 14, lineHeight: 1, opacity: 0.6, transition: "opacity 0.15s" };

  const browseFolder = async () => {
    if (!window.clipflow?.pickFolder) return;
    const result = await window.clipflow.pickFolder();
    if (result) {
      setWatchFolder(result);
    }
  };

  const togPlat = (key) => setPlatforms((p) => p.map((x) => (x.key === key ? { ...x, connected: !x.connected } : x)));
  const rmMain = (name) => setMainPool((p) => p.filter((n) => n !== name));
  const delGame = (name) => { setGamesDb((p) => p.filter((g) => g.name !== name)); setMainPool((p) => p.filter((n) => n !== name)); };
  const nonPool = gamesDb.filter((g) => !mainPool.includes(g.name));

  const r2Configured = Boolean(r2Config?.accessKeyId);
  const vizardConfigured = Boolean(vizardApiKey);
  const anthropicConfigured = Boolean(anthropicApiKey);

  const collapsibleHeaderStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
    userSelect: "none",
  };

  return (
    <div>
      <PageHeader title="Settings" />

      {/* Watch Folder */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>Watch Folder</div>
          {!editFolder ? (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={browseFolder} style={{ ...BTN, background: T.accentDim, border: `1px solid ${T.accentBorder}`, color: T.accentLight, fontWeight: 700 }}>Browse</button>
              <button onClick={() => { setEditFolder(true); setFolderVal(watchFolder); }} style={btnSecondary}>Edit</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setEditFolder(false)} style={btnSecondary}>Cancel</button>
              <button onClick={() => { setWatchFolder(folderVal); setEditFolder(false); }} style={btnSave}>Save</button>
            </div>
          )}
        </div>
        {editFolder ? (
          <input value={folderVal} onChange={(e) => setFolderVal(e.target.value)} style={{ ...inputStyle, border: `1px solid ${T.accentBorder}`, padding: "12px 16px" }} />
        ) : (
          <p style={{ color: T.textTertiary, fontSize: 13, fontFamily: T.mono, margin: 0 }}>{watchFolder}</p>
        )}
      </Card>

      {/* Main Game Pool */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>Main Game</div>
          <button onClick={() => setShowAddMain(!showAddMain)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.accentBorder}`, background: T.accentDim, color: T.accentLight, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>+ Add</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {mainPool.map((name) => {
            const g = gamesDb.find((x) => x.name === name);
            if (!g) return null;
            return (
              <div key={name} onClick={() => setMainGame(name)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: T.radius.md, border: `1px solid ${mainGame === name ? T.accentBorder : T.border}`, background: mainGame === name ? T.accentDim : "transparent", cursor: "pointer" }}>
                <GamePill tag={g.tag} color={g.color} size="sm" />
                <span style={{ color: mainGame === name ? T.accentLight : T.textSecondary, fontSize: 13, fontWeight: mainGame === name ? 700 : 500 }}>{name}</span>
                <button onClick={(e) => { e.stopPropagation(); rmMain(name); }} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 12, cursor: "pointer", padding: "0 0 0 4px", lineHeight: 1 }}>{"\u2715"}</button>
              </div>
            );
          })}
        </div>
        {showAddMain && nonPool.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
            {nonPool.map((g) => (
              <button key={g.name} onClick={() => { setMainPool((p) => [...p, g.name]); setShowAddMain(false); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.02)", cursor: "pointer", color: T.textSecondary, fontSize: 12, fontFamily: T.font }}>
                <GamePill tag={g.tag} color={g.color} size="sm" />{g.name}
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Game Library */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Game Library</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {gamesDb.map((g) => {
            const isSel = selGameLib === g.name;
            return (
              <div key={g.name} onClick={() => { setSelGameLib(isSel ? null : g.name); setEditGD(g); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: T.radius.md, border: `1px solid ${isSel ? T.accentBorder : T.border}`, background: isSel ? T.accentGlow : "rgba(255,255,255,0.02)", cursor: "pointer", opacity: g.active === false ? 0.5 : 1 }}>
                <GamePill tag={g.tag} color={g.color} size="sm" />
                <span style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>{g.name}</span>
                {g.active === false && <span style={{ color: T.textMuted, fontSize: 10, fontWeight: 600, fontStyle: "italic" }}>inactive</span>}
                <button onClick={(e) => { e.stopPropagation(); delGame(g.name); }} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 11, cursor: "pointer", padding: "0 0 0 2px" }}>{"\u2715"}</button>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Connected Platforms */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Connected Platforms</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {platforms.map((p) => (
            <div key={p.key} onClick={() => togPlat(p.key)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: T.radius.md, border: `1px solid ${p.connected ? T.greenBorder : T.redBorder}`, background: p.connected ? "rgba(52,211,153,0.04)" : "rgba(248,113,113,0.04)", cursor: "pointer" }}>
              <span style={{ color: p.connected ? T.text : T.textMuted, fontSize: 13, fontWeight: 600 }}>{p.abbr} — {p.name}</span>
              <PulseDot color={p.connected ? T.green : T.red} size={6} />
            </div>
          ))}
        </div>
      </Card>

      {/* R2 Configuration — Collapsible */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div
          onClick={() => { if (!editR2) setShowR2(!showR2); }}
          style={collapsibleHeaderStyle}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>Cloudflare R2</div>
            <span style={{ color: T.textTertiary, fontSize: 14, transition: "transform 0.2s", display: "inline-block", transform: showR2 ? "rotate(90deg)" : "none" }}>{"\u25b8"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!showR2 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <PulseDot color={r2Configured ? T.green : T.red} size={6} />
                <span style={{ color: r2Configured ? T.green : T.red, fontSize: 12, fontWeight: 600 }}>
                  {r2Configured ? "Configured" : "Not configured"}
                </span>
              </div>
            )}
            {showR2 && !editR2 && (
              <button onClick={(e) => { e.stopPropagation(); setEditR2(true); setR2Vals(r2Config || {}); }} style={btnSecondary}>Edit</button>
            )}
            {editR2 && (
              <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setEditR2(false)} style={btnSecondary}>Cancel</button>
                <button onClick={() => { setR2Config(r2Vals); setEditR2(false); }} style={btnSave}>Save</button>
              </div>
            )}
          </div>
        </div>
        {(showR2 || editR2) && (
          <div style={{ marginTop: 14 }}>
            {editR2 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { key: "accountId", label: "Account ID" },
                  { key: "accessKeyId", label: "Access Key ID" },
                  { key: "secretAccessKey", label: "Secret Access Key", secret: true },
                  { key: "bucketName", label: "Bucket Name" },
                  { key: "publicBaseUrl", label: "Public Base URL" },
                ].map((field) => (
                  <div key={field.key}>
                    <SectionLabel>{field.label}</SectionLabel>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                      <input
                        value={r2Vals[field.key] || ""}
                        onChange={(e) => setR2Vals((p) => ({ ...p, [field.key]: e.target.value }))}
                        type={field.secret && !showR2SecretEdit ? "password" : "text"}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      {field.secret && (
                        <button onClick={() => setShowR2SecretEdit(!showR2SecretEdit)} style={{ ...iconBtn, color: T.textTertiary }} title={showR2SecretEdit ? "Hide" : "Show"}>{showR2SecretEdit ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { label: "Account ID", value: r2Config?.accountId },
                  { label: "Access Key", value: r2Config?.accessKeyId },
                  { label: "Secret Key", value: r2Config?.secretAccessKey, secret: true },
                  { label: "Bucket", value: r2Config?.bucketName },
                  { label: "Base URL", value: r2Config?.publicBaseUrl },
                ].map((row) => (
                  <div key={row.label} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: T.textTertiary, fontSize: 12, width: 80, flexShrink: 0 }}>{row.label}</span>
                    <span style={{ color: T.text, fontSize: 13, fontFamily: T.mono, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {!row.value ? "Not set" : row.secret ? (showR2Secret ? row.value : maskKey(row.value)) : row.value}
                    </span>
                    {row.value && (
                      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                        {row.secret && (
                          <button onClick={() => setShowR2Secret(!showR2Secret)} style={{ ...iconBtn, color: T.textTertiary }} title={showR2Secret ? "Hide" : "Show"}>{showR2Secret ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                        )}
                        <button onClick={() => copyToClipboard(row.value, `r2-${row.label}`)} style={{ ...iconBtn, color: copiedField === `r2-${row.label}` ? T.green : T.textTertiary }}>
                          {copiedField === `r2-${row.label}` ? "\u2713" : "\ud83d\udccb"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  <span style={{ color: T.textTertiary, fontSize: 12, width: 80 }}>Status</span>
                  <PulseDot color={r2Configured ? T.green : T.red} size={6} />
                  <span style={{ color: r2Configured ? T.green : T.red, fontSize: 12, fontWeight: 600 }}>{r2Configured ? "Configured" : "Not configured"}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Vizard API — Collapsible */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div
          onClick={() => { if (!editVizard) setShowVizard(!showVizard); }}
          style={collapsibleHeaderStyle}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>Vizard AI</div>
            <span style={{ color: T.textTertiary, fontSize: 14, transition: "transform 0.2s", display: "inline-block", transform: showVizard ? "rotate(90deg)" : "none" }}>{"\u25b8"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!showVizard && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <PulseDot color={vizardConfigured ? T.green : T.red} size={6} />
                <span style={{ color: vizardConfigured ? T.green : T.red, fontSize: 12, fontWeight: 600 }}>
                  {vizardConfigured ? "Configured" : "Not set"}
                </span>
              </div>
            )}
            {showVizard && !editVizard && (
              <button onClick={(e) => { e.stopPropagation(); setEditVizard(true); setVizVal(vizardApiKey || ""); setShowVizard(true); }} style={btnSecondary}>Edit</button>
            )}
            {editVizard && (
              <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setEditVizard(false)} style={btnSecondary}>Cancel</button>
                <button onClick={() => { setVizardApiKey(vizVal); setEditVizard(false); }} style={btnSave}>Save</button>
              </div>
            )}
          </div>
        </div>
        {(showVizard || editVizard) && (
          <div style={{ marginTop: 14 }}>
            {editVizard ? (
              <div>
                <SectionLabel>API Key</SectionLabel>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                  <input value={vizVal} onChange={(e) => setVizVal(e.target.value)} type={showVizardKeyEdit ? "text" : "password"} style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={() => setShowVizardKeyEdit(!showVizardKeyEdit)} style={{ ...iconBtn, color: T.textTertiary }} title={showVizardKeyEdit ? "Hide" : "Show"}>{showVizardKeyEdit ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: T.textTertiary, fontSize: 12, width: 80 }}>API Key</span>
                  <span style={{ color: T.text, fontSize: 13, fontFamily: T.mono, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {!vizardApiKey ? "Not set" : showVizardKey ? vizardApiKey : maskKey(vizardApiKey)}
                  </span>
                  {vizardApiKey && (
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button onClick={() => setShowVizardKey(!showVizardKey)} style={{ ...iconBtn, color: T.textTertiary }} title={showVizardKey ? "Hide" : "Show"}>{showVizardKey ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                      <button onClick={() => copyToClipboard(vizardApiKey, "vizard-key")} style={{ ...iconBtn, color: copiedField === "vizard-key" ? T.green : T.textTertiary }}>
                        {copiedField === "vizard-key" ? "\u2713" : "\ud83d\udccb"}
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: T.textTertiary, fontSize: 12, width: 80 }}>Status</span>
                  <PulseDot color={vizardConfigured ? T.green : T.red} size={6} />
                  <span style={{ color: vizardConfigured ? T.green : T.red, fontSize: 12, fontWeight: 600 }}>{vizardConfigured ? "Configured" : "Not set"}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Anthropic API — Collapsible */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div
          onClick={() => { if (!editAnthropic) setShowAnthropic(!showAnthropic); }}
          style={collapsibleHeaderStyle}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>Anthropic AI</div>
            <span style={{ color: T.textTertiary, fontSize: 14, transition: "transform 0.2s", display: "inline-block", transform: showAnthropic ? "rotate(90deg)" : "none" }}>{"\u25b8"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!showAnthropic && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <PulseDot color={anthropicConfigured ? T.green : T.red} size={6} />
                <span style={{ color: anthropicConfigured ? T.green : T.red, fontSize: 12, fontWeight: 600 }}>
                  {anthropicConfigured ? "Configured" : "Not set"}
                </span>
              </div>
            )}
            {showAnthropic && !editAnthropic && (
              <button onClick={(e) => { e.stopPropagation(); setEditAnthropic(true); setAnthropicVal(anthropicApiKey || ""); setShowAnthropic(true); }} style={btnSecondary}>Edit</button>
            )}
            {editAnthropic && (
              <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setEditAnthropic(false)} style={btnSecondary}>Cancel</button>
                <button onClick={() => { setAnthropicApiKey(anthropicVal); setEditAnthropic(false); }} style={btnSave}>Save</button>
              </div>
            )}
          </div>
        </div>
        {(showAnthropic || editAnthropic) && (
          <div style={{ marginTop: 14 }}>
            {editAnthropic ? (
              <div>
                <SectionLabel>API Key</SectionLabel>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                  <input value={anthropicVal} onChange={(e) => setAnthropicVal(e.target.value)} type={showAnthropicKeyEdit ? "text" : "password"} style={{ ...inputStyle, flex: 1 }} placeholder="sk-ant-..." />
                  <button onClick={() => setShowAnthropicKeyEdit(!showAnthropicKeyEdit)} style={{ ...iconBtn, color: T.textTertiary }} title={showAnthropicKeyEdit ? "Hide" : "Show"}>{showAnthropicKeyEdit ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                </div>
                <p style={{ color: T.textTertiary, fontSize: 11, margin: "8px 0 0" }}>Used for AI title/caption generation (Sonnet) and game research (Opus).</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: T.textTertiary, fontSize: 12, width: 80 }}>API Key</span>
                  <span style={{ color: T.text, fontSize: 13, fontFamily: T.mono, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {!anthropicApiKey ? "Not set" : showAnthropicKey ? anthropicApiKey : maskKey(anthropicApiKey)}
                  </span>
                  {anthropicApiKey && (
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button onClick={() => setShowAnthropicKey(!showAnthropicKey)} style={{ ...iconBtn, color: T.textTertiary }} title={showAnthropicKey ? "Hide" : "Show"}>{showAnthropicKey ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                      <button onClick={() => copyToClipboard(anthropicApiKey, "anthropic-key")} style={{ ...iconBtn, color: copiedField === "anthropic-key" ? T.green : T.textTertiary }}>
                        {copiedField === "anthropic-key" ? "\u2713" : "\ud83d\udccb"}
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: T.textTertiary, fontSize: 12, width: 80 }}>Status</span>
                  <PulseDot color={anthropicConfigured ? T.green : T.red} size={6} />
                  <span style={{ color: anthropicConfigured ? T.green : T.red, fontSize: 12, fontWeight: 600 }}>{anthropicConfigured ? "Configured" : "Not set"}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Title & Caption Style Guide */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>Title & Caption Style Guide</div>
          {!editGuide ? (
            <button onClick={() => { setEditGuide(true); setGuideVal(styleGuide || ""); }} style={btnSecondary}>Edit</button>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setEditGuide(false)} style={btnSecondary}>Cancel</button>
              <button onClick={() => { setStyleGuide(guideVal); setEditGuide(false); }} style={btnSave}>Save</button>
            </div>
          )}
        </div>
        {editGuide ? (
          <textarea
            value={guideVal}
            onChange={(e) => setGuideVal(e.target.value)}
            rows={8}
            placeholder="Paste your YouTube titling best practices, rules, and preferences here. This will be included in every AI generation call as context."
            style={{ ...inputStyle, resize: "vertical", minHeight: 120, lineHeight: 1.5 }}
          />
        ) : styleGuide ? (
          <p style={{ color: T.textTertiary, fontSize: 12, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: 120, overflow: "auto" }}>{styleGuide}</p>
        ) : (
          <p style={{ color: T.textMuted, fontSize: 12, margin: 0, fontStyle: "italic" }}>No style guide set. Click Edit to paste your titling rules and preferences.</p>
        )}
      </Card>

      {/* Upload History / Reset */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>Upload History</div>
          {!resetConfirm ? (
            <button onClick={() => setResetConfirm(true)} style={{ ...BTN, background: T.redDim, border: `1px solid ${T.redBorder}`, color: T.red, fontWeight: 700 }}>Reset Uploads</button>
          ) : (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ color: T.red, fontSize: 12 }}>Are you sure?</span>
              <button onClick={() => setResetConfirm(false)} style={btnSecondary}>No</button>
              <button onClick={() => { if (onResetUploads) onResetUploads(); setResetConfirm(false); }} style={{ ...BTN, background: T.red, border: "none", color: "#fff", fontWeight: 700 }}>Yes, Reset</button>
            </div>
          )}
        </div>
        <p style={{ color: T.textTertiary, fontSize: 12, margin: 0 }}>Clear the record of which files have been uploaded. This will not delete files from R2.</p>
      </Card>

      {/* Downloads */}
      <DownloadsSection
        downloadPath={downloadPath}
        setDownloadPath={setDownloadPath}
        vizardProjects={vizardProjects}
        downloadedClips={downloadedClips}
        setDownloadedClips={setDownloadedClips}
        onRefreshProject={onRefreshProject}
      />

      {editGD && <GameEditModal game={editGD} onSave={(g) => { onEditGame(g); setEditGD(null); setSelGameLib(null); }} onClose={() => { setEditGD(null); setSelGameLib(null); }} anthropicApiKey={anthropicApiKey} />}
    </div>
  );
}
