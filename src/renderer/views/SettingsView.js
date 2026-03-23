import React, { useState, useEffect } from "react";
import T from "../styles/theme";
import { Card, PageHeader, SectionLabel, GamePill, PulseDot } from "../components/shared";
import { GameEditModal } from "../components/modals";

// Shared button styles used across all settings sections
const BTN = { padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: T.font };
const btnSecondary = { ...BTN, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary };
const btnSave = { ...BTN, background: T.green, border: "none", color: "#fff", fontWeight: 700 };
const inputStyle = { width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "10px 14px", color: T.text, fontSize: 13, fontFamily: T.mono, outline: "none", boxSizing: "border-box" };
const maskKey = (key) => (!key || key.length < 8) ? (key || "") : key.substring(0, 4) + "\u2022\u2022\u2022\u2022" + key.substring(key.length - 4);

export default function SettingsView({ mainGame, setMainGame, mainPool, setMainPool, gamesDb, setGamesDb, onEditGame, watchFolder, setWatchFolder, platforms, setPlatforms, anthropicApiKey, setAnthropicApiKey, youtubeClientId, setYoutubeClientId, youtubeClientSecret, setYoutubeClientSecret, metaAppId, setMetaAppId, metaAppSecret, setMetaAppSecret, tiktokClientKey, setTiktokClientKey, tiktokClientSecret, setTiktokClientSecret, styleGuide, setStyleGuide, outputFolder, setOutputFolder, sfxFolder, setSfxFolder, requireHashtagInTitle, setRequireHashtagInTitle }) {
  const [editFolder, setEditFolder] = useState(false);
  const [folderVal, setFolderVal] = useState(watchFolder);
  const [editGD, setEditGD] = useState(null);
  const [showAddMain, setShowAddMain] = useState(false);
  const [selGameLib, setSelGameLib] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  // API Credentials — pill bar
  const [activeApi, setActiveApi] = useState(null); // "anthropic" | "youtube" | "meta" | "tiktok" | null
  // Anthropic
  const [editAnthropic, setEditAnthropic] = useState(false);
  const [anthropicVal, setAnthropicVal] = useState(anthropicApiKey || "");
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showAnthropicKeyEdit, setShowAnthropicKeyEdit] = useState(false);
  // YouTube
  const [editYouTube, setEditYouTube] = useState(false);
  const [ytClientIdVal, setYtClientIdVal] = useState(youtubeClientId || "");
  const [ytClientSecretVal, setYtClientSecretVal] = useState(youtubeClientSecret || "");
  const [showYtId, setShowYtId] = useState(false);
  const [showYtSecret, setShowYtSecret] = useState(false);
  const [showYtIdEdit, setShowYtIdEdit] = useState(false);
  const [showYtSecretEdit, setShowYtSecretEdit] = useState(false);
  // Meta
  const [editMeta, setEditMeta] = useState(false);
  const [metaIdVal, setMetaIdVal] = useState(metaAppId || "");
  const [metaSecretVal, setMetaSecretVal] = useState(metaAppSecret || "");
  const [showMetaId, setShowMetaId] = useState(false);
  const [showMetaSecret, setShowMetaSecret] = useState(false);
  const [showMetaIdEdit, setShowMetaIdEdit] = useState(false);
  const [showMetaSecretEdit, setShowMetaSecretEdit] = useState(false);
  // TikTok
  const [editTiktok, setEditTiktok] = useState(false);
  const [ttClientKeyVal, setTtClientKeyVal] = useState(tiktokClientKey || "");
  const [ttClientSecretVal, setTtClientSecretVal] = useState(tiktokClientSecret || "");
  const [showTtKey, setShowTtKey] = useState(false);
  const [showTtSecret, setShowTtSecret] = useState(false);
  const [showTtKeyEdit, setShowTtKeyEdit] = useState(false);
  const [showTtSecretEdit, setShowTtSecretEdit] = useState(false);
  const [editGuide, setEditGuide] = useState(false);
  const [guideVal, setGuideVal] = useState(styleGuide || "");
  const [ffmpegStatus, setFfmpegStatus] = useState(null); // { installed, version } or null
  const [whisperStatus, setWhisperStatus] = useState(null);
  const [whisperPythonPath, setWhisperPythonPath] = useState("");
  const [whisperModel, setWhisperModel] = useState("large-v3-turbo");

  // Check ffmpeg + whisper on mount
  useEffect(() => {
    (async () => {
      if (window.clipflow?.ffmpegCheck) {
        const r = await window.clipflow.ffmpegCheck();
        setFfmpegStatus(r);
      }
      // Load whisperx paths from store
      if (window.clipflow?.storeGet) {
        const pp = await window.clipflow.storeGet("whisperPythonPath");
        const wm = await window.clipflow.storeGet("whisperModel");
        if (pp) setWhisperPythonPath(pp);
        if (wm) setWhisperModel(wm);
        // Check whisperx with stored python path
        if (window.clipflow?.whisperCheck) {
          const r = await window.clipflow.whisperCheck(pp || undefined);
          setWhisperStatus(r);
        }
      }
    })();
  }, []);

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

  const [connectingPlatform, setConnectingPlatform] = useState(null); // "tiktok" while connecting
  const [disconnectTarget, setDisconnectTarget] = useState(null); // account key to disconnect (confirmation dialog)

  const handleConnectTikTok = async () => {
    if (!tiktokClientKey || !tiktokClientSecret) {
      alert("Configure your TikTok Client Key and Secret in the API Credentials section below first.");
      return;
    }
    setConnectingPlatform("tiktok");
    try {
      const result = await window.clipflow.oauthTiktokConnect();
      if (result.error) {
        alert(`TikTok connection failed: ${result.error}`);
      } else if (result.success && result.account) {
        setPlatforms((prev) => {
          const exists = prev.findIndex((p) => p.key === result.account.key);
          if (exists >= 0) {
            const updated = [...prev];
            updated[exists] = { ...updated[exists], ...result.account };
            return updated;
          }
          return [...prev, result.account];
        });
      }
    } catch (err) {
      alert(`TikTok connection error: ${err.message}`);
    }
    setConnectingPlatform(null);
  };

  const handleDisconnect = async (accountKey) => {
    try {
      const result = await window.clipflow.oauthRemoveAccount(accountKey);
      if (result.success) {
        setPlatforms((prev) => prev.filter((p) => p.key !== accountKey));
      }
    } catch (err) {
      console.error("Disconnect failed:", err);
    }
    setDisconnectTarget(null);
  };

  const rmMain = (name) => setMainPool((p) => p.filter((n) => n !== name));
  const delGame = (name) => { setGamesDb((p) => p.filter((g) => g.name !== name)); setMainPool((p) => p.filter((n) => n !== name)); };
  const nonPool = gamesDb.filter((g) => !mainPool.includes(g.name));

  const anthropicConfigured = Boolean(anthropicApiKey);
  const youtubeConfigured = Boolean(youtubeClientId && youtubeClientSecret);
  const metaConfigured = Boolean(metaAppId && metaAppSecret);
  const tiktokConfigured = Boolean(tiktokClientKey && tiktokClientSecret);

  const apiServices = [
    { id: "anthropic", label: "Anthropic", configured: anthropicConfigured },
    { id: "youtube", label: "YouTube", configured: youtubeConfigured },
    { id: "meta", label: "Meta", configured: metaConfigured },
    { id: "tiktok", label: "TikTok", configured: tiktokConfigured },
  ];

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>Connected Platforms</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={handleConnectTikTok}
              disabled={connectingPlatform === "tiktok"}
              style={{ ...BTN, background: T.accentDim, border: `1px solid ${T.accentBorder}`, color: T.accentLight, fontWeight: 700, opacity: connectingPlatform === "tiktok" ? 0.5 : 1 }}
            >
              {connectingPlatform === "tiktok" ? "Connecting..." : "+ TikTok"}
            </button>
          </div>
        </div>

        {platforms.length === 0 && !connectingPlatform && (
          <div style={{ color: T.textTertiary, fontSize: 13, padding: "12px 0" }}>
            No accounts connected yet. Click a button above to connect your first platform.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {platforms.map((p) => (
            <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: T.radius.md, border: `1px solid ${T.greenBorder}`, background: "rgba(52,211,153,0.04)", position: "relative" }}>
              {p.avatarUrl ? (
                <img src={p.avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: `1px solid ${T.border}` }} />
              ) : (
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.accentDim, border: `1px solid ${T.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: T.accentLight }}>{p.abbr}</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>{p.name || p.displayName}</span>
                <span style={{ color: T.textTertiary, fontSize: 10, fontWeight: 600 }}>{p.platform}</span>
              </div>
              <PulseDot color={T.green} size={7} />
              <button
                onClick={(e) => { e.stopPropagation(); setDisconnectTarget(p.key); }}
                style={{ background: "none", border: "none", color: T.textMuted, fontSize: 12, cursor: "pointer", padding: "0 0 0 4px", lineHeight: 1 }}
                title="Disconnect"
              >{"\u2715"}</button>
            </div>
          ))}
        </div>
      </Card>

      {/* Disconnect Confirmation Dialog */}
      {disconnectTarget && (() => {
        const targetAccount = platforms.find((p) => p.key === disconnectTarget);
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }} onClick={() => setDisconnectTarget(null)}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, padding: 32, maxWidth: 400, width: "90%" }}>
              <div style={{ color: T.text, fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Disconnect Account?</div>
              <p style={{ color: T.textSecondary, fontSize: 13, lineHeight: 1.5, margin: "0 0 24px" }}>
                Are you sure you want to disconnect <strong style={{ color: T.text }}>{targetAccount?.name}</strong> ({targetAccount?.platform})? You'll need to re-authorize to connect again.
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setDisconnectTarget(null)} style={btnSecondary}>Cancel</button>
                <button onClick={() => handleDisconnect(disconnectTarget)} style={{ ...BTN, background: T.red, border: "none", color: "#fff", fontWeight: 700 }}>Disconnect</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Output Folder */}
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Output Folder</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1, fontFamily: T.mono, fontSize: 12, color: outputFolder ? T.text : T.textTertiary }}>
            {outputFolder || "Not set \u2014 rendered clips will be saved here"}
          </span>
          <button onClick={async () => { const f = await window.clipflow?.pickFolder(); if (f) setOutputFolder(f); }}
            style={{ padding: "6px 14px", borderRadius: T.radius.sm, border: `1px solid ${T.border}`, background: T.surfaceHover, color: T.text, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>
            Browse
          </button>
        </div>
      </Card>

      {/* Sound Effects Folder */}
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Sound Effects Folder</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1, fontFamily: T.mono, fontSize: 12, color: sfxFolder ? T.text : T.textTertiary }}>
            {sfxFolder || "Not set \u2014 browse your sound effects folder"}
          </span>
          <button onClick={async () => { const f = await window.clipflow?.pickFolder(); if (f) setSfxFolder(f); }}
            style={{ padding: "6px 14px", borderRadius: T.radius.sm, border: `1px solid ${T.border}`, background: T.surfaceHover, color: T.text, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>
            Browse
          </button>
        </div>
      </Card>

      {/* Queue Settings */}
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Queue Settings</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>Require hashtag in title</div>
            <div style={{ color: T.textTertiary, fontSize: 11, marginTop: 2 }}>When enabled, the Queue button will warn if your clip title is missing a game hashtag</div>
          </div>
          <button
            onClick={() => setRequireHashtagInTitle(!requireHashtagInTitle)}
            style={{
              width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
              background: requireHashtagInTitle ? T.green : "rgba(255,255,255,0.12)",
              position: "relative", transition: "background 0.2s", flexShrink: 0,
            }}
          >
            <div style={{
              width: 16, height: 16, borderRadius: 8, background: "#fff",
              position: "absolute", top: 3,
              left: requireHashtagInTitle ? 21 : 3,
              transition: "left 0.2s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }} />
          </button>
        </div>
      </Card>

      {/* Local Tools Status */}
      <Card style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Local Tools</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <PulseDot color={ffmpegStatus?.installed ? T.green : T.red} />
          <span style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>ffmpeg</span>
          <span style={{ color: ffmpegStatus?.installed ? T.green : T.textTertiary, fontSize: 12, fontFamily: T.mono }}>
            {ffmpegStatus?.installed ? `v${ffmpegStatus.version}` : ffmpegStatus?.error ? "Not found in PATH" : "Checking..."}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PulseDot color={whisperStatus?.installed ? T.green : T.red} />
          <span style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>BetterWhisperX</span>
          <span style={{ color: whisperStatus?.installed ? T.green : T.textTertiary, fontSize: 12, fontFamily: T.mono }}>
            {whisperStatus?.installed ? whisperStatus.version : whisperStatus?.error ? "Not found" : "Checking..."}
          </span>
        </div>
        {(!ffmpegStatus?.installed || !whisperStatus?.installed) && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: `${T.yellow}15`, borderRadius: T.radius.sm, border: `1px solid ${T.yellow}33` }}>
            <span style={{ color: T.yellow, fontSize: 11 }}>
              {!ffmpegStatus?.installed && "ffmpeg must be installed and in PATH. "}
              {!whisperStatus?.installed && "Set Python path below (BetterWhisperX venv)."}
            </span>
          </div>
        )}
      </Card>

      {/* BetterWhisperX Configuration */}
      <Card style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>BetterWhisperX Configuration</div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: T.textSecondary, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Python Path (venv)</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, fontFamily: T.mono, fontSize: 12, color: whisperPythonPath ? T.text : T.textTertiary, padding: "6px 0" }}>
              {whisperPythonPath || "Not set — browse to python.exe in BetterWhisperX venv"}
            </span>
            <button onClick={async () => {
              const f = await window.clipflow?.openFileDialog({ filters: [{ name: "Python", extensions: ["exe"] }] });
              if (f) {
                setWhisperPythonPath(f);
                await window.clipflow?.storeSet("whisperPythonPath", f);
                const r = await window.clipflow?.whisperCheck(f);
                setWhisperStatus(r);
              }
            }} style={{ padding: "5px 12px", borderRadius: T.radius.sm, border: `1px solid ${T.border}`, background: T.surfaceHover, color: T.text, fontSize: 11, cursor: "pointer", fontFamily: T.font }}>
              Browse
            </button>
          </div>
        </div>
        <div>
          <div style={{ color: T.textSecondary, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Model</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["small", "medium", "large-v3", "large-v3-turbo"].map((m) => {
              const isActive = whisperModel === m;
              return (
                <button key={m} onClick={async () => {
                  setWhisperModel(m);
                  await window.clipflow?.storeSet("whisperModel", m);
                }}
                  style={{
                    padding: "5px 14px", borderRadius: T.radius.sm, fontSize: 11, fontWeight: 600, fontFamily: T.mono, cursor: "pointer",
                    border: isActive ? `1px solid ${T.accentBorder}` : `1px solid ${T.border}`,
                    background: isActive ? T.accentDim : "rgba(255,255,255,0.03)",
                    color: isActive ? T.accentLight : T.textSecondary,
                  }}>{m}</button>
              );
            })}
          </div>
          <div style={{ color: T.textTertiary, fontSize: 11, marginTop: 6 }}>RTX 3090: large-v3-turbo recommended (fastest with near-v3 quality). Models download automatically on first use.</div>
        </div>
      </Card>

      {/* API Credentials — Pill Bar */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>API Credentials</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: activeApi ? 16 : 0 }}>
          {apiServices.map((svc) => {
            const isSel = activeApi === svc.id;
            const isEditing = svc.id === "anthropic" ? editAnthropic : svc.id === "youtube" ? editYouTube : svc.id === "meta" ? editMeta : editTiktok;
            return (
              <div key={svc.id} onClick={() => { if (!isEditing) setActiveApi(isSel ? null : svc.id); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: T.radius.md,
                  border: `1px solid ${isSel ? T.accentBorder : T.border}`,
                  background: isSel ? T.accentGlow : "rgba(255,255,255,0.02)",
                  cursor: isEditing ? "default" : "pointer", transition: "all 0.15s",
                }}>
                <PulseDot color={svc.configured ? T.green : T.red} size={6} />
                <span style={{ color: isSel ? T.text : T.textSecondary, fontSize: 13, fontWeight: 600 }}>{svc.label}</span>
              </div>
            );
          })}
        </div>

        {/* Anthropic detail panel */}
        {activeApi === "anthropic" && (
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ color: T.textSecondary, fontSize: 13, fontWeight: 600 }}>Anthropic AI</span>
              {!editAnthropic ? (
                <button onClick={() => { setEditAnthropic(true); setAnthropicVal(anthropicApiKey || ""); }} style={btnSecondary}>Edit</button>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setEditAnthropic(false)} style={btnSecondary}>Cancel</button>
                  <button onClick={() => { setAnthropicApiKey(anthropicVal); setEditAnthropic(false); }} style={btnSave}>Save</button>
                </div>
              )}
            </div>
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
                      <button onClick={() => copyToClipboard(anthropicApiKey, "anthropic-key")} style={{ ...iconBtn, color: copiedField === "anthropic-key" ? T.green : T.textTertiary }}>{copiedField === "anthropic-key" ? "\u2713" : "\ud83d\udccb"}</button>
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

        {/* YouTube detail panel */}
        {activeApi === "youtube" && (
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ color: T.textSecondary, fontSize: 13, fontWeight: 600 }}>YouTube OAuth 2.0</span>
              {!editYouTube ? (
                <button onClick={() => { setEditYouTube(true); setYtClientIdVal(youtubeClientId || ""); setYtClientSecretVal(youtubeClientSecret || ""); }} style={btnSecondary}>Edit</button>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setEditYouTube(false)} style={btnSecondary}>Cancel</button>
                  <button onClick={() => { setYoutubeClientId(ytClientIdVal); setYoutubeClientSecret(ytClientSecretVal); setEditYouTube(false); }} style={btnSave}>Save</button>
                </div>
              )}
            </div>
            {editYouTube ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <SectionLabel>Client ID</SectionLabel>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                    <input value={ytClientIdVal} onChange={(e) => setYtClientIdVal(e.target.value)} type={showYtIdEdit ? "text" : "password"} style={{ ...inputStyle, flex: 1 }} placeholder="Client ID" />
                    <button onClick={() => setShowYtIdEdit(!showYtIdEdit)} style={{ ...iconBtn, color: T.textTertiary }} title={showYtIdEdit ? "Hide" : "Show"}>{showYtIdEdit ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                  </div>
                </div>
                <div>
                  <SectionLabel>Client Secret</SectionLabel>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                    <input value={ytClientSecretVal} onChange={(e) => setYtClientSecretVal(e.target.value)} type={showYtSecretEdit ? "text" : "password"} style={{ ...inputStyle, flex: 1 }} placeholder="Client Secret" />
                    <button onClick={() => setShowYtSecretEdit(!showYtSecretEdit)} style={{ ...iconBtn, color: T.textTertiary }} title={showYtSecretEdit ? "Hide" : "Show"}>{showYtSecretEdit ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                  </div>
                </div>
                <p style={{ color: T.textTertiary, fontSize: 11, margin: 0 }}>OAuth 2.0 credentials for publishing clips to YouTube.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: T.textTertiary, fontSize: 12, width: 100 }}>Client ID</span>
                  <span style={{ color: T.text, fontSize: 13, fontFamily: T.mono, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{!youtubeClientId ? "Not set" : showYtId ? youtubeClientId : maskKey(youtubeClientId)}</span>
                  {youtubeClientId && (
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button onClick={() => setShowYtId(!showYtId)} style={{ ...iconBtn, color: T.textTertiary }} title={showYtId ? "Hide" : "Show"}>{showYtId ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                      <button onClick={() => copyToClipboard(youtubeClientId, "yt-client-id")} style={{ ...iconBtn, color: copiedField === "yt-client-id" ? T.green : T.textTertiary }}>{copiedField === "yt-client-id" ? "\u2713" : "\ud83d\udccb"}</button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: T.textTertiary, fontSize: 12, width: 100 }}>Client Secret</span>
                  <span style={{ color: T.text, fontSize: 13, fontFamily: T.mono, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{!youtubeClientSecret ? "Not set" : showYtSecret ? youtubeClientSecret : maskKey(youtubeClientSecret)}</span>
                  {youtubeClientSecret && (
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button onClick={() => setShowYtSecret(!showYtSecret)} style={{ ...iconBtn, color: T.textTertiary }} title={showYtSecret ? "Hide" : "Show"}>{showYtSecret ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                      <button onClick={() => copyToClipboard(youtubeClientSecret, "yt-client-secret")} style={{ ...iconBtn, color: copiedField === "yt-client-secret" ? T.green : T.textTertiary }}>{copiedField === "yt-client-secret" ? "\u2713" : "\ud83d\udccb"}</button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: T.textTertiary, fontSize: 12, width: 100 }}>Status</span>
                  <PulseDot color={youtubeConfigured ? T.green : T.red} size={6} />
                  <span style={{ color: youtubeConfigured ? T.green : T.red, fontSize: 12, fontWeight: 600 }}>{youtubeConfigured ? "Configured" : "Not set"}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Meta detail panel */}
        {activeApi === "meta" && (
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ color: T.textSecondary, fontSize: 13, fontWeight: 600 }}>Meta (Facebook & Instagram)</span>
              {!editMeta ? (
                <button onClick={() => { setEditMeta(true); setMetaIdVal(metaAppId || ""); setMetaSecretVal(metaAppSecret || ""); }} style={btnSecondary}>Edit</button>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setEditMeta(false)} style={btnSecondary}>Cancel</button>
                  <button onClick={() => { setMetaAppId(metaIdVal); setMetaAppSecret(metaSecretVal); setEditMeta(false); }} style={btnSave}>Save</button>
                </div>
              )}
            </div>
            {editMeta ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <SectionLabel>App ID</SectionLabel>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                    <input value={metaIdVal} onChange={(e) => setMetaIdVal(e.target.value)} type={showMetaIdEdit ? "text" : "password"} style={{ ...inputStyle, flex: 1 }} placeholder="App ID" />
                    <button onClick={() => setShowMetaIdEdit(!showMetaIdEdit)} style={{ ...iconBtn, color: T.textTertiary }} title={showMetaIdEdit ? "Hide" : "Show"}>{showMetaIdEdit ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                  </div>
                </div>
                <div>
                  <SectionLabel>App Secret</SectionLabel>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                    <input value={metaSecretVal} onChange={(e) => setMetaSecretVal(e.target.value)} type={showMetaSecretEdit ? "text" : "password"} style={{ ...inputStyle, flex: 1 }} placeholder="App Secret" />
                    <button onClick={() => setShowMetaSecretEdit(!showMetaSecretEdit)} style={{ ...iconBtn, color: T.textTertiary }} title={showMetaSecretEdit ? "Hide" : "Show"}>{showMetaSecretEdit ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                  </div>
                </div>
                <p style={{ color: T.textTertiary, fontSize: 11, margin: 0 }}>Meta App credentials for publishing to Facebook & Instagram.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: T.textTertiary, fontSize: 12, width: 100 }}>App ID</span>
                  <span style={{ color: T.text, fontSize: 13, fontFamily: T.mono, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{!metaAppId ? "Not set" : showMetaId ? metaAppId : maskKey(metaAppId)}</span>
                  {metaAppId && (
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button onClick={() => setShowMetaId(!showMetaId)} style={{ ...iconBtn, color: T.textTertiary }} title={showMetaId ? "Hide" : "Show"}>{showMetaId ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                      <button onClick={() => copyToClipboard(metaAppId, "meta-app-id")} style={{ ...iconBtn, color: copiedField === "meta-app-id" ? T.green : T.textTertiary }}>{copiedField === "meta-app-id" ? "\u2713" : "\ud83d\udccb"}</button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: T.textTertiary, fontSize: 12, width: 100 }}>App Secret</span>
                  <span style={{ color: T.text, fontSize: 13, fontFamily: T.mono, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{!metaAppSecret ? "Not set" : showMetaSecret ? metaAppSecret : maskKey(metaAppSecret)}</span>
                  {metaAppSecret && (
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button onClick={() => setShowMetaSecret(!showMetaSecret)} style={{ ...iconBtn, color: T.textTertiary }} title={showMetaSecret ? "Hide" : "Show"}>{showMetaSecret ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                      <button onClick={() => copyToClipboard(metaAppSecret, "meta-app-secret")} style={{ ...iconBtn, color: copiedField === "meta-app-secret" ? T.green : T.textTertiary }}>{copiedField === "meta-app-secret" ? "\u2713" : "\ud83d\udccb"}</button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: T.textTertiary, fontSize: 12, width: 100 }}>Status</span>
                  <PulseDot color={metaConfigured ? T.green : T.red} size={6} />
                  <span style={{ color: metaConfigured ? T.green : T.red, fontSize: 12, fontWeight: 600 }}>{metaConfigured ? "Configured" : "Not set"}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TikTok detail panel */}
        {activeApi === "tiktok" && (
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ color: T.textSecondary, fontSize: 13, fontWeight: 600 }}>TikTok Content API</span>
              {!editTiktok ? (
                <button onClick={() => { setEditTiktok(true); setTtClientKeyVal(tiktokClientKey || ""); setTtClientSecretVal(tiktokClientSecret || ""); }} style={btnSecondary}>Edit</button>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setEditTiktok(false)} style={btnSecondary}>Cancel</button>
                  <button onClick={() => { setTiktokClientKey(ttClientKeyVal); setTiktokClientSecret(ttClientSecretVal); setEditTiktok(false); }} style={btnSave}>Save</button>
                </div>
              )}
            </div>
            {editTiktok ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <SectionLabel>Client Key</SectionLabel>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                    <input value={ttClientKeyVal} onChange={(e) => setTtClientKeyVal(e.target.value)} type={showTtKeyEdit ? "text" : "password"} style={{ ...inputStyle, flex: 1 }} placeholder="Client Key" />
                    <button onClick={() => setShowTtKeyEdit(!showTtKeyEdit)} style={{ ...iconBtn, color: T.textTertiary }} title={showTtKeyEdit ? "Hide" : "Show"}>{showTtKeyEdit ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                  </div>
                </div>
                <div>
                  <SectionLabel>Client Secret</SectionLabel>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                    <input value={ttClientSecretVal} onChange={(e) => setTtClientSecretVal(e.target.value)} type={showTtSecretEdit ? "text" : "password"} style={{ ...inputStyle, flex: 1 }} placeholder="Client Secret" />
                    <button onClick={() => setShowTtSecretEdit(!showTtSecretEdit)} style={{ ...iconBtn, color: T.textTertiary }} title={showTtSecretEdit ? "Hide" : "Show"}>{showTtSecretEdit ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                  </div>
                </div>
                <p style={{ color: T.textTertiary, fontSize: 11, margin: 0 }}>TikTok API credentials for publishing clips to TikTok.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: T.textTertiary, fontSize: 12, width: 100 }}>Client Key</span>
                  <span style={{ color: T.text, fontSize: 13, fontFamily: T.mono, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{!tiktokClientKey ? "Not set" : showTtKey ? tiktokClientKey : maskKey(tiktokClientKey)}</span>
                  {tiktokClientKey && (
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button onClick={() => setShowTtKey(!showTtKey)} style={{ ...iconBtn, color: T.textTertiary }} title={showTtKey ? "Hide" : "Show"}>{showTtKey ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                      <button onClick={() => copyToClipboard(tiktokClientKey, "tt-client-key")} style={{ ...iconBtn, color: copiedField === "tt-client-key" ? T.green : T.textTertiary }}>{copiedField === "tt-client-key" ? "\u2713" : "\ud83d\udccb"}</button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: T.textTertiary, fontSize: 12, width: 100 }}>Client Secret</span>
                  <span style={{ color: T.text, fontSize: 13, fontFamily: T.mono, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{!tiktokClientSecret ? "Not set" : showTtSecret ? tiktokClientSecret : maskKey(tiktokClientSecret)}</span>
                  {tiktokClientSecret && (
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button onClick={() => setShowTtSecret(!showTtSecret)} style={{ ...iconBtn, color: T.textTertiary }} title={showTtSecret ? "Hide" : "Show"}>{showTtSecret ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                      <button onClick={() => copyToClipboard(tiktokClientSecret, "tt-client-secret")} style={{ ...iconBtn, color: copiedField === "tt-client-secret" ? T.green : T.textTertiary }}>{copiedField === "tt-client-secret" ? "\u2713" : "\ud83d\udccb"}</button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: T.textTertiary, fontSize: 12, width: 100 }}>Status</span>
                  <PulseDot color={tiktokConfigured ? T.green : T.red} size={6} />
                  <span style={{ color: tiktokConfigured ? T.green : T.red, fontSize: 12, fontWeight: 600 }}>{tiktokConfigured ? "Configured" : "Not set"}</span>
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

      {/* Report an Issue */}
      <ReportIssueSection />

      {/* Subtitle Debug Log */}
      <SubtitleDebugSection />

      {/* Pipeline Logs & Cost Tracking */}
      <PipelineLogsSection />

      {/* Version Footer */}
      <VersionFooter />

      {editGD && <GameEditModal game={editGD} onSave={(g) => { onEditGame(g); setEditGD(null); setSelGameLib(null); }} onClose={() => { setEditGD(null); setSelGameLib(null); }} anthropicApiKey={anthropicApiKey} />}
    </div>
  );
}

// ============ SUBTITLE DEBUG LOG SECTION ============
function SubtitleDebugSection() {
  const [entries, setEntries] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [copied, setCopied] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const log = await window.clipflow?.debugGetSubtitleLog?.() || [];
      setEntries(log.reverse()); // newest first
      setLoading(false);
    })();
  }, []);

  const handleClear = async () => {
    await window.clipflow?.debugClearSubtitleLog?.();
    setEntries([]);
    setExpanded(null);
  };

  const handleCopy = (entry, idx) => {
    const json = JSON.stringify(entry, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      setCopied(idx);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const handleCopyAll = () => {
    const json = JSON.stringify(entries, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      setCopied("all");
      setTimeout(() => setCopied(null), 1500);
    });
  };

  if (loading) return null;
  if (entries.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <h3 style={{ color: T.textPrimary, fontSize: 14, fontWeight: 600, margin: 0 }}>Subtitle Debug Log</h3>
        <span style={{ color: T.textMuted, fontSize: 12 }}>({entries.length} report{entries.length !== 1 ? "s" : ""})</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleCopyAll}
          style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 6, color: copied === "all" ? "#34d399" : T.textSecondary, fontSize: 11, padding: "3px 10px", cursor: "pointer" }}
        >
          {copied === "all" ? "Copied!" : "Copy All"}
        </button>
        <button
          onClick={handleClear}
          style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 6, color: "#f87171", fontSize: 11, padding: "3px 10px", cursor: "pointer" }}
        >
          Clear
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {entries.map((entry, idx) => (
          <div key={idx} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
            <div
              onClick={() => setExpanded(expanded === idx ? null : idx)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer" }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: entry.rating === "good" ? "#34d399" : "#f87171",
                boxShadow: `0 0 6px ${entry.rating === "good" ? "#34d399" : "#f87171"}`,
              }} />
              <span style={{ color: T.textPrimary, fontSize: 12, fontWeight: 500, flex: 1 }}>
                {entry.clipTitle || "Untitled"} — {entry.subtitleSource}
              </span>
              {entry.note && <span style={{ color: "#fbbf24", fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{entry.note}"</span>}
              <span style={{ color: T.textMuted, fontSize: 11 }}>
                {new Date(entry.timestamp).toLocaleDateString()} {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleCopy(entry, idx); }}
                style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 4, color: copied === idx ? "#34d399" : T.textMuted, fontSize: 10, padding: "2px 8px", cursor: "pointer" }}
              >
                {copied === idx ? "Copied!" : "Copy"}
              </button>
            </div>
            {expanded === idx && (
              <pre style={{
                background: "#0a0b10", color: "#a78bfa", fontSize: 11, padding: "10px 14px", margin: 0,
                borderTop: `1px solid ${T.border}`, maxHeight: 300, overflow: "auto",
                fontFamily: "'JetBrains Mono', monospace", whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}>
                {JSON.stringify(entry, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ PIPELINE LOGS SECTION ============
function PipelineLogsSection() {
  const [logs, setLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [logContent, setLogContent] = useState("");
  const [monthlyCost, setMonthlyCost] = useState({ total: 0, videoCount: 0 });
  const [loading, setLoading] = useState(true);
  const [filterGame, setFilterGame] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    if (window.clipflow?.pipelineLogsList) {
      const logList = await window.clipflow.pipelineLogsList();
      setLogs(logList || []);
    }
    if (window.clipflow?.pipelineLogsMonthlyCost) {
      const cost = await window.clipflow.pipelineLogsMonthlyCost();
      setMonthlyCost(cost || { total: 0, videoCount: 0 });
    }
    setLoading(false);
  };

  const handleSelectLog = async (log) => {
    if (selectedLog?.path === log.path) {
      setSelectedLog(null);
      setLogContent("");
      return;
    }
    setSelectedLog(log);
    if (window.clipflow?.pipelineLogsRead) {
      const content = await window.clipflow.pipelineLogsRead(log.path);
      setLogContent(content || "Failed to read log file");
    }
  };

  const handleDeleteOld = async () => {
    if (window.clipflow?.pipelineLogsDeleteOld) {
      await window.clipflow.pipelineLogsDeleteOld(30);
      setSelected(new Set()); setSelectedLog(null); setLogContent("");
      loadData();
    }
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (window.clipflow?.pipelineLogsDelete) {
      await window.clipflow.pipelineLogsDelete([...selected]);
      if (selectedLog && selected.has(selectedLog.path)) { setSelectedLog(null); setLogContent(""); }
      setSelected(new Set());
      loadData();
    }
  };

  const toggleSelect = (logPath, e) => {
    e.stopPropagation();
    setSelected(prev => { const next = new Set(prev); next.has(logPath) ? next.delete(logPath) : next.add(logPath); return next; });
  };

  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => { const next = new Set(prev); next.has(groupKey) ? next.delete(groupKey) : next.add(groupKey); return next; });
  };

  const handleCopy = () => { if (logContent) navigator.clipboard.writeText(logContent); };

  const fmtDate = (iso) => {
    try { return new Date(iso).toLocaleDateString("en-US", { day: "2-digit", month: "2-digit", year: "numeric" }); }
    catch { return ""; }
  };

  const filtered = filterGame
    ? logs.filter((l) => l.videoName?.toLowerCase().includes(filterGame.toLowerCase()))
    : logs;

  // Group logs by video name
  const grouped = {};
  for (const log of filtered) { const key = log.videoName || log.filename; if (!grouped[key]) grouped[key] = []; grouped[key].push(log); }
  const groupKeys = Object.keys(grouped).sort((a, b) => new Date(grouped[b][0]?.date || 0) - new Date(grouped[a][0]?.date || 0));

  // Auto-expand first 3 groups
  useEffect(() => {
    if (groupKeys.length > 0 && expandedGroups.size === 0) setExpandedGroups(new Set(groupKeys.slice(0, 3)));
  }, [logs.length]);

  const selectAllInGroup = (groupKey, e) => {
    e.stopPropagation();
    const gl = grouped[groupKey] || [];
    setSelected(prev => {
      const next = new Set(prev);
      const all = gl.every(l => next.has(l.path));
      gl.forEach(l => all ? next.delete(l.path) : next.add(l.path));
      return next;
    });
  };

  // Styles
  const cbxStyle = (checked) => ({
    width: 16, height: 16, borderRadius: 4, flexShrink: 0, cursor: "pointer",
    border: `1.5px solid ${checked ? T.accent : "rgba(255,255,255,0.2)"}`,
    background: checked ? T.accent : "transparent",
    display: "flex", alignItems: "center", justifyContent: "center",
  });

  return (
    <Card style={{ padding: 24, marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>Pipeline Logs</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: T.accentLight, fontSize: 12, fontWeight: 600, fontFamily: T.mono }}>
            This month: ~${monthlyCost.total.toFixed(2)} across {monthlyCost.videoCount} video{monthlyCost.videoCount !== 1 ? "s" : ""}
          </span>
          {selected.size > 0 && (
            <button onClick={handleDeleteSelected} style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: T.font, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171", fontWeight: 600 }}>
              Delete {selected.size} Selected
            </button>
          )}
          <button onClick={handleDeleteOld} style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: T.font, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textTertiary }}>
            Delete Old (30d)
          </button>
        </div>
      </div>

      {/* Filter */}
      <input
        value={filterGame} onChange={(e) => setFilterGame(e.target.value)}
        placeholder="Filter by video name..."
        style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 10px", color: T.text, fontSize: 12, fontFamily: T.mono, outline: "none", marginBottom: 12, boxSizing: "border-box" }}
      />

      {loading ? (
        <div style={{ color: T.textTertiary, fontSize: 12, textAlign: "center", padding: 20 }}>Loading logs...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: T.textTertiary, fontSize: 12, textAlign: "center", padding: 20 }}>No pipeline logs yet. Logs appear after running Generate Clips.</div>
      ) : (
        <div style={{ display: "flex", gap: 14, maxHeight: 500 }}>
          {/* Left: grouped log list — wider when no log selected */}
          <div style={{ width: selectedLog ? 300 : "100%", maxWidth: selectedLog ? 300 : "none", flexShrink: 0, overflow: "hidden", display: "flex", flexDirection: "column", transition: "width 0.2s" }}>
            <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              {groupKeys.map((groupKey) => {
                const groupLogs = grouped[groupKey];
                const isExpanded = expandedGroups.has(groupKey);
                const successCount = groupLogs.filter(l => l.success).length;
                const failCount = groupLogs.length - successCount;
                const totalCost = groupLogs.reduce((s, l) => s + l.apiCost, 0);
                const allSel = groupLogs.every(l => selected.has(l.path));
                const someSel = groupLogs.some(l => selected.has(l.path));

                return (
                  <div key={groupKey} style={{ borderRadius: 8, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                    {/* Group header */}
                    <div
                      onClick={() => toggleGroup(groupKey)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "pointer",
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      <div onClick={(e) => selectAllInGroup(groupKey, e)} style={cbxStyle(allSel)}>
                        {(allSel || someSel) && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>{allSel ? "\u2713" : "\u2012"}</span>}
                      </div>
                      <span style={{ fontSize: 10, color: T.textTertiary, flexShrink: 0 }}>{isExpanded ? "\u25BC" : "\u25B6"}</span>
                      <span style={{ color: T.text, fontSize: 12, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {groupKey}
                      </span>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                        {successCount > 0 && (
                          <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, fontFamily: T.mono, background: "rgba(52,211,153,0.12)", color: "#34d399" }}>
                            {successCount} passed
                          </span>
                        )}
                        {failCount > 0 && (
                          <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, fontFamily: T.mono, background: "rgba(248,113,113,0.12)", color: "#f87171" }}>
                            {failCount} failed
                          </span>
                        )}
                        {totalCost > 0 && (
                          <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, fontFamily: T.mono, background: "rgba(139,92,246,0.12)", color: T.accentLight }}>
                            ${totalCost.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expanded entries */}
                    {isExpanded && (
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {groupLogs.map((log) => {
                          const isActive = selectedLog?.path === log.path;
                          const isChecked = selected.has(log.path);
                          return (
                            <div
                              key={log.path}
                              onClick={() => handleSelectLog(log)}
                              style={{
                                display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                                cursor: "pointer", borderTop: `1px solid ${T.border}`,
                                background: isActive ? T.accentDim : "transparent",
                                transition: "background 0.15s",
                              }}
                              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                            >
                              <div onClick={(e) => toggleSelect(log.path, e)} style={cbxStyle(isChecked)}>
                                {isChecked && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>{"\u2713"}</span>}
                              </div>
                              <span style={{
                                padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, fontFamily: T.mono, flexShrink: 0, letterSpacing: 0.3,
                                background: log.success ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
                                color: log.success ? "#34d399" : "#f87171",
                              }}>{log.success ? "PASS" : "FAIL"}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ color: T.text, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {log.videoName || log.filename}
                                </div>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
                                  <span style={{ color: T.textTertiary, fontSize: 11 }}>{fmtDate(log.date)}</span>
                                  {log.apiCost > 0 && (
                                    <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, fontFamily: T.mono, background: "rgba(139,92,246,0.12)", color: T.accentLight }}>
                                      ${log.apiCost.toFixed(4)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: log content viewer — only rendered when a log is selected */}
          {selectedLog && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ color: T.textSecondary, fontSize: 13, fontWeight: 600 }}>{selectedLog.videoName}</span>
                <button onClick={handleCopy} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: T.font, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary }}>
                  Copy to Clipboard
                </button>
              </div>
              <pre style={{
                flex: 1, overflowY: "auto", overflowX: "auto",
                padding: 14, borderRadius: 8,
                background: "rgba(0,0,0,0.3)", border: `1px solid ${T.border}`,
                color: T.textSecondary, fontSize: 11, fontFamily: T.mono,
                lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap",
                maxHeight: 420,
              }}>
                {logContent}
              </pre>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ============ REPORT AN ISSUE SECTION ============

const MODULE_LABELS = {
  subtitles: "Subtitles / Captions",
  publishing: "Platform Publishing",
  "title-generation": "Title & Caption Generation",
  "video-processing": "Video Processing / Rendering",
  editor: "Clip Editor",
  pipeline: "Auto Clip Pipeline",
  auth: "Account Connections / OAuth",
};

const SEVERITY_OPTIONS = [
  { value: "crash", label: "App crashed completely", color: "#f87171" },
  { value: "bug", label: "Something didn't work but the app kept running", color: "#fbbf24" },
  { value: "visual", label: "Something looked off visually (layout, text, colors)", color: "#22d3ee" },
];

function ReportIssueSection() {
  const [description, setDescription] = useState("");
  const [selectedModules, setSelectedModules] = useState([]);
  const [severity, setSeverity] = useState("bug");
  const [includeLogs, setIncludeLogs] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState(null); // { success, reportId } or { error }

  const toggleModule = (mod) => {
    setSelectedModules((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]
    );
  };

  const handleExport = async () => {
    if (!description.trim()) return;
    setExporting(true);
    setResult(null);
    try {
      const res = await window.clipflow?.logsExportReport({
        description: description.trim(),
        modules: includeLogs ? selectedModules : [],
        severity,
      });
      if (res?.canceled) {
        setResult(null);
      } else if (res?.success) {
        setResult({ success: true, reportId: res.reportId });
        // Reset form after successful export
        setTimeout(() => {
          setDescription("");
          setSelectedModules([]);
          setSeverity("bug");
          setResult(null);
        }, 4000);
      } else {
        setResult({ error: "Failed to export report" });
      }
    } catch (err) {
      setResult({ error: err.message || "Unexpected error" });
    }
    setExporting(false);
  };

  const cbxStyle = (checked) => ({
    width: 16, height: 16, borderRadius: 4, flexShrink: 0, cursor: "pointer",
    border: `1.5px solid ${checked ? T.accent : "rgba(255,255,255,0.2)"}`,
    background: checked ? T.accent : "transparent",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.15s",
  });

  const radioStyle = (active) => ({
    width: 16, height: 16, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
    border: `2px solid ${active ? T.accent : "rgba(255,255,255,0.2)"}`,
    background: "transparent",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.15s",
  });

  return (
    <Card style={{ padding: 24, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>Report an Issue</div>
        <span style={{ color: T.textMuted, fontSize: 11 }}>
          Reports include app logs to help diagnose problems
        </span>
      </div>

      {/* Description */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ color: T.textSecondary, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
          What happened?
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Describe what you were doing when the issue occurred. The more detail, the faster we can fix it."
          style={{
            ...inputStyle,
            resize: "vertical",
            minHeight: 80,
            lineHeight: 1.5,
            fontSize: 12,
          }}
        />
      </div>

      {/* Module selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ color: T.textSecondary, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>
          What area was affected? <span style={{ fontWeight: 400, color: T.textTertiary }}>(select all that apply)</span>
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(MODULE_LABELS).map(([key, label]) => {
            const isSelected = selectedModules.includes(key);
            return (
              <div
                key={key}
                onClick={() => toggleModule(key)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 12px", borderRadius: 6, cursor: "pointer",
                  background: isSelected ? T.accentDim : "rgba(255,255,255,0.03)",
                  border: `1px solid ${isSelected ? T.accentBorder : T.border}`,
                  transition: "all 0.15s",
                }}
              >
                <div style={cbxStyle(isSelected)}>
                  {isSelected && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>{"\u2713"}</span>}
                </div>
                <span style={{ color: isSelected ? T.text : T.textSecondary, fontSize: 12 }}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Severity */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ color: T.textSecondary, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>
          How bad was it?
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {SEVERITY_OPTIONS.map((opt) => {
            const isActive = severity === opt.value;
            return (
              <div
                key={opt.value}
                onClick={() => setSeverity(opt.value)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", borderRadius: 6, cursor: "pointer",
                  background: isActive ? "rgba(255,255,255,0.04)" : "transparent",
                  border: `1px solid ${isActive ? T.borderHover : "transparent"}`,
                  transition: "all 0.15s",
                }}
              >
                <div style={radioStyle(isActive)}>
                  {isActive && (
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent }} />
                  )}
                </div>
                <span style={{ color: isActive ? T.text : T.textSecondary, fontSize: 12 }}>{opt.label}</span>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: opt.color,
                  boxShadow: `0 0 6px ${opt.color}`,
                  marginLeft: 4,
                }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Include logs checkbox */}
      <div style={{ marginBottom: 20 }}>
        <div
          onClick={() => setIncludeLogs(!includeLogs)}
          style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 0" }}
        >
          <div style={cbxStyle(includeLogs)}>
            {includeLogs && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>{"\u2713"}</span>}
          </div>
          <span style={{ color: T.text, fontSize: 12, fontWeight: 500 }}>
            Include app logs
          </span>
          <span style={{ color: T.textTertiary, fontSize: 11 }}>(recommended — helps diagnose faster)</span>
        </div>
      </div>

      {/* Export button + result */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={handleExport}
          disabled={!description.trim() || exporting}
          style={{
            padding: "8px 20px", borderRadius: 6, fontSize: 13, cursor: description.trim() && !exporting ? "pointer" : "not-allowed",
            fontFamily: T.font, fontWeight: 700, border: "none",
            background: description.trim() && !exporting ? T.accent : "rgba(139,92,246,0.3)",
            color: "#fff",
            opacity: description.trim() && !exporting ? 1 : 0.5,
            transition: "all 0.15s",
          }}
        >
          {exporting ? "Exporting..." : "Export Report"}
        </button>

        {result?.success && (
          <span style={{ color: T.green, fontSize: 12, fontWeight: 600 }}>
            Report saved ({result.reportId})
          </span>
        )}
        {result?.error && (
          <span style={{ color: T.red, fontSize: 12, fontWeight: 600 }}>
            {result.error}
          </span>
        )}
      </div>
    </Card>
  );
}

// ============ VERSION FOOTER ============
function VersionFooter() {
  const [version, setVersion] = useState("");

  useEffect(() => {
    (async () => {
      if (window.clipflow?.getAppVersion) {
        const v = await window.clipflow.getAppVersion();
        setVersion(v);
      }
    })();
  }, []);

  if (!version) return null;

  return (
    <div style={{ textAlign: "center", padding: "16px 0 8px", color: T.textMuted, fontSize: 11, fontFamily: T.mono }}>
      ClipFlow v{version}
    </div>
  );
}
