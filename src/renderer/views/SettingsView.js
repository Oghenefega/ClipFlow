import React, { useState, useEffect } from "react";
import posthog from "posthog-js";
import T from "../styles/theme";
import { Card, PageHeader, SectionLabel, GamePill, PulseDot } from "../components/shared";
import { GameEditModal } from "../components/modals";

// Shared button styles used across all settings sections
const BTN = { padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: T.font };
const btnSecondary = { ...BTN, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary };
const btnSave = { ...BTN, background: T.green, border: "none", color: "#fff", fontWeight: 700 };
const inputStyle = { width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "10px 14px", color: T.text, fontSize: 13, fontFamily: T.mono, outline: "none", boxSizing: "border-box" };
const maskKey = (key) => (!key || key.length < 8) ? (key || "") : key.substring(0, 4) + "\u2022\u2022\u2022\u2022" + key.substring(key.length - 4);

export default function SettingsView({ mainGame, setMainGame, mainPool, setMainPool, gamesDb, setGamesDb, onEditGame, onAddGame, watchFolder, setWatchFolder, testWatchFolder, setTestWatchFolder, platforms, setPlatforms, anthropicApiKey, setAnthropicApiKey, gatewayUrl, setGatewayUrl, gatewayAuthToken, setGatewayAuthToken, youtubeClientId, setYoutubeClientId, youtubeClientSecret, setYoutubeClientSecret, metaAppId, setMetaAppId, metaAppSecret, setMetaAppSecret, instagramAppId, setInstagramAppId, instagramAppSecret, setInstagramAppSecret, tiktokClientKey, setTiktokClientKey, tiktokClientSecret, setTiktokClientSecret, styleGuide, setStyleGuide, outputFolder, setOutputFolder, sfxFolder, setSfxFolder, requireHashtagInTitle, setRequireHashtagInTitle, collapsedGroups, setCollapsedGroups }) {
  const [editFolder, setEditFolder] = useState(false);
  const [folderVal, setFolderVal] = useState(watchFolder);
  const [editTestFolder, setEditTestFolder] = useState(false);
  const [testFolderVal, setTestFolderVal] = useState(testWatchFolder || "");
  const [editGD, setEditGD] = useState(null);
  const [showAddMain, setShowAddMain] = useState(false);
  const [selGameLib, setSelGameLib] = useState(null);
  const [namingPreset, setNamingPreset] = useState("tag-date-day-part");
  const [copiedField, setCopiedField] = useState(null);
  // API Credentials — pill bar
  const [activeApi, setActiveApi] = useState(null); // "anthropic" | "youtube" | "meta" | "tiktok" | null
  // Anthropic
  const [editAnthropic, setEditAnthropic] = useState(false);
  const [anthropicVal, setAnthropicVal] = useState(anthropicApiKey || "");
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showAnthropicKeyEdit, setShowAnthropicKeyEdit] = useState(false);
  // Gateway
  const [gatewayUrlVal, setGatewayUrlVal] = useState(gatewayUrl || "");
  const [gatewayTokenVal, setGatewayTokenVal] = useState(gatewayAuthToken || "");
  const [showGatewayToken, setShowGatewayToken] = useState(false);
  const [showGatewayTokenEdit, setShowGatewayTokenEdit] = useState(false);
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
  // Instagram
  const [editInstagram, setEditInstagram] = useState(false);
  const [igAppIdVal, setIgAppIdVal] = useState(instagramAppId || "");
  const [igAppSecretVal, setIgAppSecretVal] = useState(instagramAppSecret || "");
  const [showIgId, setShowIgId] = useState(false);
  const [showIgSecret, setShowIgSecret] = useState(false);
  const [showIgIdEdit, setShowIgIdEdit] = useState(false);
  const [showIgSecretEdit, setShowIgSecretEdit] = useState(false);
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
  // Video splitting settings
  const [autoSplitEnabled, setAutoSplitEnabled] = useState(true);
  const [splitThreshold, setSplitThreshold] = useState(30);
  const [splitSourceRetention, setSplitSourceRetention] = useState("keep");

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
        const np = await window.clipflow.storeGet("namingPreset");
        if (np) setNamingPreset(np);
        // Load video splitting settings
        const ase = await window.clipflow.storeGet("autoSplitEnabled");
        if (ase !== undefined && ase !== null) setAutoSplitEnabled(ase);
        const stm = await window.clipflow.storeGet("splitThresholdMinutes");
        if (stm !== undefined && stm !== null) setSplitThreshold(stm);
        const ssr = await window.clipflow.storeGet("splitSourceRetention");
        if (ssr) setSplitSourceRetention(ssr);
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

  const browseTestFolder = async () => {
    if (!window.clipflow?.pickFolder) return;
    const result = await window.clipflow.pickFolder();
    if (result) {
      setTestWatchFolder(result);
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

  const handleConnectInstagram = async () => {
    if (!instagramAppId || !instagramAppSecret) {
      alert("Configure your Instagram App ID and App Secret in the API Credentials section below first.");
      return;
    }
    setConnectingPlatform("instagram");
    try {
      const result = await window.clipflow.oauthInstagramConnect();
      if (result.error) {
        alert(`Instagram connection failed: ${result.error}`);
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
      alert(`Instagram connection error: ${err.message}`);
    }
    setConnectingPlatform(null);
  };

  const handleConnectFacebook = async () => {
    if (!metaAppId || !metaAppSecret) {
      alert("Configure your Meta App ID and App Secret in the API Credentials section below first.");
      return;
    }
    setConnectingPlatform("facebook");
    try {
      const result = await window.clipflow.oauthFacebookConnect();
      if (result.error) {
        alert(`Facebook connection failed: ${result.error}`);
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
      alert(`Facebook connection error: ${err.message}`);
    }
    setConnectingPlatform(null);
  };

  const handleConnectYouTube = async () => {
    if (!youtubeClientId || !youtubeClientSecret) {
      alert("Configure your YouTube Client ID and Client Secret in the API Credentials section below first.");
      return;
    }
    setConnectingPlatform("youtube");
    try {
      const result = await window.clipflow.oauthYoutubeConnect();
      if (result.error) {
        alert(`YouTube connection failed: ${result.error}`);
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
      alert(`YouTube connection error: ${err.message}`);
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
  const instagramConfigured = Boolean(instagramAppId && instagramAppSecret);
  const tiktokConfigured = Boolean(tiktokClientKey && tiktokClientSecret);

  const apiServices = [
    { id: "anthropic", label: "Anthropic", configured: anthropicConfigured },
    { id: "youtube", label: "YouTube", configured: youtubeConfigured },
    { id: "instagram", label: "Instagram", configured: instagramConfigured },
    { id: "meta", label: "Facebook Pages", configured: metaConfigured },
    { id: "tiktok", label: "TikTok", configured: tiktokConfigured },
  ];

  // ── Collapsible group state (lifted to App.js for session persistence) ──
  const toggleGroup = (key) => setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  const GroupHeader = ({ groupKey, label, description }) => (
    <div
      onClick={() => toggleGroup(groupKey)}
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        cursor: "pointer", userSelect: "none",
        padding: "10px 0", marginBottom: collapsedGroups[groupKey] ? 8 : 12, marginTop: 20,
        borderBottom: `1px solid ${T.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: T.textTertiary, fontSize: 10, transition: "transform 0.15s", display: "inline-block", transform: collapsedGroups[groupKey] ? "rotate(-90deg)" : "rotate(0deg)" }}>{"\u25BC"}</span>
        <span style={{ color: T.textSecondary, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>{label}</span>
        {description && <span style={{ color: T.textMuted, fontSize: 11 }}>{description}</span>}
      </div>
      <span style={{ color: T.textMuted, fontSize: 10 }}>{collapsedGroups[groupKey] ? "Show" : "Hide"}</span>
    </div>
  );

  return (
    <div>
      <PageHeader title="Settings" />

      {/* ════════════════════════════════════════ */}
      {/* GROUP 1: FILES & FOLDERS                */}
      {/* ════════════════════════════════════════ */}
      <GroupHeader groupKey="files" label="Files & Folders" />
      {!collapsedGroups.files && <>

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

      {/* Test Folder (dev-mode second watcher) */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>Test Folder</div>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.yellow, background: "rgba(250,204,21,0.12)", border: "1px solid rgba(250,204,21,0.25)", borderRadius: 4, padding: "1px 6px" }}>DEV</span>
          </div>
          {!editTestFolder ? (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={browseTestFolder} style={{ ...BTN, background: T.accentDim, border: `1px solid ${T.accentBorder}`, color: T.accentLight, fontWeight: 700 }}>Browse</button>
              {testWatchFolder && (
                <button onClick={() => { setEditTestFolder(true); setTestFolderVal(testWatchFolder); }} style={btnSecondary}>Edit</button>
              )}
              {testWatchFolder && (
                <button onClick={() => setTestWatchFolder("")} style={{ ...BTN, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444", fontWeight: 700 }}>Clear</button>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setEditTestFolder(false)} style={btnSecondary}>Cancel</button>
              <button onClick={() => { setTestWatchFolder(testFolderVal); setEditTestFolder(false); }} style={btnSave}>Save</button>
            </div>
          )}
        </div>
        {editTestFolder ? (
          <input value={testFolderVal} onChange={(e) => setTestFolderVal(e.target.value)} style={{ ...inputStyle, border: `1px solid ${T.accentBorder}`, padding: "12px 16px" }} />
        ) : (
          <p style={{ color: T.textTertiary, fontSize: 13, fontFamily: T.mono, margin: 0 }}>{testWatchFolder || "Not set \u2014 files here go through the full pipeline tagged as test"}</p>
        )}
      </Card>

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

      {/* Video Splitting */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>Video Splitting</div>
          <button
            onClick={() => {
              const next = !autoSplitEnabled;
              setAutoSplitEnabled(next);
              window.clipflow?.storeSet("autoSplitEnabled", next);
            }}
            style={{
              ...BTN,
              background: autoSplitEnabled ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${autoSplitEnabled ? "rgba(34,197,94,0.4)" : T.border}`,
              color: autoSplitEnabled ? T.green : T.textTertiary,
              fontWeight: 700,
            }}
          >
            {autoSplitEnabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        <p style={{ color: T.textTertiary, fontSize: 12, margin: "0 0 16px 0", lineHeight: 1.5 }}>
          ClipFlow works best with recordings under 30 minutes. Longer recordings will be split into parts during rename.
        </p>

        {/* Threshold */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: T.textSecondary, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
            Split threshold: <span style={{ color: T.text, fontFamily: T.mono }}>{splitThreshold} min</span>
          </div>
          <input
            type="range"
            min={10}
            max={120}
            step={5}
            value={splitThreshold}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              setSplitThreshold(val);
              window.clipflow?.storeSet("splitThresholdMinutes", val);
            }}
            style={{ width: "100%", accentColor: T.accent }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.textTertiary, marginTop: 2 }}>
            <span>10 min</span>
            <span>120 min</span>
          </div>
        </div>

        {/* Keep originals */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: T.textSecondary, fontSize: 12, fontWeight: 600 }}>Keep original files after splitting</div>
          <button
            onClick={() => {
              const next = splitSourceRetention === "keep" ? "delete" : "keep";
              setSplitSourceRetention(next);
              window.clipflow?.storeSet("splitSourceRetention", next);
            }}
            style={{
              ...BTN,
              background: splitSourceRetention === "keep" ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${splitSourceRetention === "keep" ? "rgba(34,197,94,0.4)" : T.border}`,
              color: splitSourceRetention === "keep" ? T.green : T.textTertiary,
              fontWeight: 700,
              fontSize: 11,
            }}
          >
            {splitSourceRetention === "keep" ? "Keep" : "Delete"}
          </button>
        </div>
      </Card>

      </>}

      {/* ════════════════════════════════════════ */}
      {/* GROUP 2: CONTENT LIBRARY                */}
      {/* ════════════════════════════════════════ */}
      <GroupHeader groupKey="content" label="Content Library" />
      {!collapsedGroups.content && <>

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

      {/* Game Library — Games + Content Types */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        {/* Games section */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>Games</div>
          <button onClick={() => onAddGame("game")} style={{ background: T.accentDim, border: `1px solid ${T.accentBorder}`, borderRadius: 6, padding: "4px 10px", color: T.accentLight, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>+ Add Game</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {gamesDb.filter((g) => g.entryType !== "content").map((g) => {
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

        {/* Divider */}
        <div style={{ borderTop: `1px solid ${T.border}`, marginBottom: 16 }} />

        {/* Content Types section */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>Content Types</div>
          <button onClick={() => onAddGame("content")} style={{ background: T.accentDim, border: `1px solid ${T.accentBorder}`, borderRadius: 6, padding: "4px 10px", color: T.accentLight, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>+ Add Content Type</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {gamesDb.filter((g) => g.entryType === "content").map((g) => {
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
          {gamesDb.filter((g) => g.entryType === "content").length === 0 && (
            <div style={{ color: T.textTertiary, fontSize: 12, fontStyle: "italic" }}>No content types added yet</div>
          )}
        </div>
      </Card>

      {/* Naming Preset */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Default Naming Preset</div>
        <div style={{ color: T.textTertiary, fontSize: 12, marginBottom: 14 }}>Controls how renamed files are named. Can be overridden per-file in the Rename tab.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { id: "tag-date-day-part", label: "Tag + Date + Day + Part", example: "AR 2026-03-15 Day30 Pt1" },
            { id: "tag-day-part", label: "Tag + Day + Part", example: "AR Day30 Pt1" },
            { id: "tag-date", label: "Tag + Date", example: "AR 2026-03-15" },
            { id: "tag-label", label: "Tag + Custom Label", example: "AR ranked-grind" },
            { id: "tag-date-label", label: "Tag + Date + Label", example: "AR 2026-03-15 ranked-grind" },
            { id: "original-tag", label: "Tag + Original", example: "AR 2026-03-15 14-30-22" },
          ].map((p) => {
            const isSel = namingPreset === p.id;
            return (
              <div
                key={p.id}
                onClick={() => {
                  setNamingPreset(p.id);
                  if (window.clipflow?.storeSet) window.clipflow.storeSet("namingPreset", p.id);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                  borderRadius: T.radius.md, cursor: "pointer",
                  border: `1px solid ${isSel ? T.accentBorder : T.border}`,
                  background: isSel ? T.accentGlow : "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ width: 16, height: 16, borderRadius: 8, border: `2px solid ${isSel ? T.accent : T.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {isSel && <div style={{ width: 8, height: 8, borderRadius: 4, background: T.accent }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: isSel ? T.text : T.textSecondary, fontSize: 13, fontWeight: 600 }}>{p.label}</div>
                </div>
                <div style={{ color: T.textTertiary, fontSize: 11, fontFamily: T.mono }}>{p.example}.mp4</div>
              </div>
            );
          })}
        </div>
      </Card>

      </>}

      {/* ════════════════════════════════════════ */}
      {/* GROUP 3: AI & STYLE                     */}
      {/* ════════════════════════════════════════ */}
      <GroupHeader groupKey="aiStyle" label="AI & Style" />
      {!collapsedGroups.aiStyle && <>

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

      {/* AI Preferences (Creator Profile) */}
      <AIPreferencesSection />

      </>}

      {/* ════════════════════════════════════════ */}
      {/* GROUP 4: PUBLISHING                     */}
      {/* ════════════════════════════════════════ */}
      <GroupHeader groupKey="publishing" label="Publishing" />
      {!collapsedGroups.publishing && <>

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
            <button
              onClick={handleConnectInstagram}
              disabled={connectingPlatform === "instagram"}
              style={{ ...BTN, background: T.accentDim, border: `1px solid ${T.accentBorder}`, color: T.accentLight, fontWeight: 700, opacity: connectingPlatform === "instagram" ? 0.5 : 1 }}
            >
              {connectingPlatform === "instagram" ? "Connecting..." : "+ Instagram"}
            </button>
            <button
              onClick={handleConnectFacebook}
              disabled={connectingPlatform === "facebook"}
              style={{ ...BTN, background: T.accentDim, border: `1px solid ${T.accentBorder}`, color: T.accentLight, fontWeight: 700, opacity: connectingPlatform === "facebook" ? 0.5 : 1 }}
            >
              {connectingPlatform === "facebook" ? "Connecting..." : "+ Facebook Page"}
            </button>
            <button
              onClick={handleConnectYouTube}
              disabled={connectingPlatform === "youtube"}
              style={{ ...BTN, background: T.accentDim, border: `1px solid ${T.accentBorder}`, color: T.accentLight, fontWeight: 700, opacity: connectingPlatform === "youtube" ? 0.5 : 1 }}
            >
              {connectingPlatform === "youtube" ? "Connecting..." : "+ YouTube"}
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

      </>}

      {/* ════════════════════════════════════════ */}
      {/* GROUP 5: TOOLS & CREDENTIALS            */}
      {/* ════════════════════════════════════════ */}
      <GroupHeader groupKey="tools" label="Tools & Credentials" />
      {!collapsedGroups.tools && <>

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
                <button onClick={() => { setEditAnthropic(true); setAnthropicVal(anthropicApiKey || ""); setGatewayUrlVal(gatewayUrl || ""); setGatewayTokenVal(gatewayAuthToken || ""); }} style={btnSecondary}>Edit</button>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setEditAnthropic(false)} style={btnSecondary}>Cancel</button>
                  <button onClick={() => { setAnthropicApiKey(anthropicVal); setGatewayUrl(gatewayUrlVal.replace(/\/+$/, "")); setGatewayAuthToken(gatewayTokenVal); setEditAnthropic(false); }} style={btnSave}>Save</button>
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
                <SectionLabel style={{ marginTop: 16 }}>Gateway URL</SectionLabel>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                  <input value={gatewayUrlVal} onChange={(e) => setGatewayUrlVal(e.target.value)} type="text" style={{ ...inputStyle, flex: 1 }} placeholder="https://gateway.ai.cloudflare.com/v1/.../anthropic" />
                </div>
                <p style={{ color: T.textTertiary, fontSize: 11, margin: "8px 0 0" }}>Cloudflare AI Gateway base URL. Leave default unless you have a custom gateway.</p>
                <SectionLabel style={{ marginTop: 16 }}>Gateway Auth Token</SectionLabel>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                  <input value={gatewayTokenVal} onChange={(e) => setGatewayTokenVal(e.target.value)} type={showGatewayTokenEdit ? "text" : "password"} style={{ ...inputStyle, flex: 1 }} placeholder="cf-aig token (leave empty to call Anthropic directly)" />
                  <button onClick={() => setShowGatewayTokenEdit(!showGatewayTokenEdit)} style={{ ...iconBtn, color: T.textTertiary }} title={showGatewayTokenEdit ? "Hide" : "Show"}>{showGatewayTokenEdit ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                </div>
                <p style={{ color: T.textTertiary, fontSize: 11, margin: "8px 0 0" }}>If set, all API calls route through the gateway. Clear to call Anthropic directly.</p>
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
                  <span style={{ color: T.textTertiary, fontSize: 12, width: 80 }}>Gateway</span>
                  <span style={{ color: T.text, fontSize: 13, fontFamily: T.mono, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {!gatewayAuthToken ? "Direct (no gateway)" : showGatewayToken ? gatewayAuthToken : maskKey(gatewayAuthToken)}
                  </span>
                  {gatewayAuthToken && (
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button onClick={() => setShowGatewayToken(!showGatewayToken)} style={{ ...iconBtn, color: T.textTertiary }} title={showGatewayToken ? "Hide" : "Show"}>{showGatewayToken ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                      <button onClick={() => copyToClipboard(gatewayAuthToken, "gw-token")} style={{ ...iconBtn, color: copiedField === "gw-token" ? T.green : T.textTertiary }}>{copiedField === "gw-token" ? "\u2713" : "\ud83d\udccb"}</button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: T.textTertiary, fontSize: 12, width: 80 }}>Status</span>
                  <PulseDot color={anthropicConfigured ? T.green : T.red} size={6} />
                  <span style={{ color: anthropicConfigured ? T.green : T.red, fontSize: 12, fontWeight: 600 }}>{anthropicConfigured ? "Configured" : "Not set"}</span>
                  {gatewayAuthToken && (<>
                    <span style={{ color: T.textTertiary, fontSize: 12, margin: "0 4px" }}>&middot;</span>
                    <span style={{ color: T.green, fontSize: 12, fontWeight: 600 }}>Gateway active</span>
                  </>)}
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
              <span style={{ color: T.textSecondary, fontSize: 13, fontWeight: 600 }}>Facebook Pages</span>
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
                <p style={{ color: T.textTertiary, fontSize: 11, margin: 0 }}>Facebook app credentials for publishing to Facebook Pages.</p>
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

        {/* Instagram detail panel */}
        {activeApi === "instagram" && (
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ color: T.textSecondary, fontSize: 13, fontWeight: 600 }}>Instagram</span>
              {!editInstagram ? (
                <button onClick={() => { setEditInstagram(true); setIgAppIdVal(instagramAppId || ""); setIgAppSecretVal(instagramAppSecret || ""); }} style={btnSecondary}>Edit</button>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setEditInstagram(false)} style={btnSecondary}>Cancel</button>
                  <button onClick={() => { setInstagramAppId(igAppIdVal); setInstagramAppSecret(igAppSecretVal); setEditInstagram(false); }} style={btnSave}>Save</button>
                </div>
              )}
            </div>
            {editInstagram ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <SectionLabel>App ID</SectionLabel>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                    <input value={igAppIdVal} onChange={(e) => setIgAppIdVal(e.target.value)} type={showIgIdEdit ? "text" : "password"} style={{ ...inputStyle, flex: 1 }} placeholder="Instagram App ID" />
                    <button onClick={() => setShowIgIdEdit(!showIgIdEdit)} style={{ ...iconBtn, color: T.textTertiary }} title={showIgIdEdit ? "Hide" : "Show"}>{showIgIdEdit ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                  </div>
                </div>
                <div>
                  <SectionLabel>App Secret</SectionLabel>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                    <input value={igAppSecretVal} onChange={(e) => setIgAppSecretVal(e.target.value)} type={showIgSecretEdit ? "text" : "password"} style={{ ...inputStyle, flex: 1 }} placeholder="Instagram App Secret" />
                    <button onClick={() => setShowIgSecretEdit(!showIgSecretEdit)} style={{ ...iconBtn, color: T.textTertiary }} title={showIgSecretEdit ? "Hide" : "Show"}>{showIgSecretEdit ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                  </div>
                </div>
                <p style={{ color: T.textTertiary, fontSize: 11, margin: 0 }}>Instagram app credentials for direct Instagram publishing (Business/Creator accounts).</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: T.textTertiary, fontSize: 12, width: 100 }}>App ID</span>
                  <span style={{ color: T.text, fontSize: 13, fontFamily: T.mono, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{!instagramAppId ? "Not set" : showIgId ? instagramAppId : maskKey(instagramAppId)}</span>
                  {instagramAppId && (
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button onClick={() => setShowIgId(!showIgId)} style={{ ...iconBtn, color: T.textTertiary }} title={showIgId ? "Hide" : "Show"}>{showIgId ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                      <button onClick={() => copyToClipboard(instagramAppId, "ig-app-id")} style={{ ...iconBtn, color: copiedField === "ig-app-id" ? T.green : T.textTertiary }}>{copiedField === "ig-app-id" ? "\u2713" : "\ud83d\udccb"}</button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: T.textTertiary, fontSize: 12, width: 100 }}>App Secret</span>
                  <span style={{ color: T.text, fontSize: 13, fontFamily: T.mono, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{!instagramAppSecret ? "Not set" : showIgSecret ? instagramAppSecret : maskKey(instagramAppSecret)}</span>
                  {instagramAppSecret && (
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button onClick={() => setShowIgSecret(!showIgSecret)} style={{ ...iconBtn, color: T.textTertiary }} title={showIgSecret ? "Hide" : "Show"}>{showIgSecret ? "\ud83d\udc41" : "\ud83d\udc41\u200d\ud83d\udde8"}</button>
                      <button onClick={() => copyToClipboard(instagramAppSecret, "ig-app-secret")} style={{ ...iconBtn, color: copiedField === "ig-app-secret" ? T.green : T.textTertiary }}>{copiedField === "ig-app-secret" ? "\u2713" : "\ud83d\udccb"}</button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: T.textTertiary, fontSize: 12, width: 100 }}>Status</span>
                  <PulseDot color={instagramConfigured ? T.green : T.red} size={6} />
                  <span style={{ color: instagramConfigured ? T.green : T.red, fontSize: 12, fontWeight: 600 }}>{instagramConfigured ? "Configured" : "Not set"}</span>
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

      </>}

      {/* ════════════════════════════════════════ */}
      {/* GROUP 6: DIAGNOSTICS                    */}
      {/* ════════════════════════════════════════ */}
      <GroupHeader groupKey="diagnostics" label="Diagnostics" />
      {!collapsedGroups.diagnostics && <>

      {/* Analytics Opt-Out */}
      <AnalyticsToggle />

      {/* Pipeline Logs & Cost Tracking */}
      <PipelineLogsSection />

      {/* Report an Issue */}
      <ReportIssueSection />

      {/* Subtitle Debug Log */}
      <SubtitleDebugSection />

      </>}

      {/* Dev Dashboard — hidden behind version click counter */}
      <DevDashboard />

      {editGD && <GameEditModal game={editGD} gamesDb={gamesDb} onSave={(g) => { onEditGame(g); setEditGD(null); setSelGameLib(null); }} onClose={() => { setEditGD(null); setSelGameLib(null); }} anthropicApiKey={anthropicApiKey} />}
    </div>
  );
}

// ============ ANALYTICS TOGGLE ============
function AnalyticsToggle() {
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      if (window.clipflow?.storeGet) {
        const val = await window.clipflow.storeGet("analyticsEnabled");
        if (val !== undefined && val !== null) setEnabled(val);
      }
      setLoaded(true);
    })();
  }, []);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    await window.clipflow.storeSet("analyticsEnabled", next);
    if (next) {
      posthog.opt_in_capturing();
    } else {
      posthog.opt_out_capturing();
    }
  };

  if (!loaded) return null;

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Send anonymous usage data</div>
          <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 2 }}>Helps improve ClipFlow. No filenames, usernames, or personal data is collected.</div>
        </div>
        <button
          onClick={toggle}
          style={{
            width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
            background: enabled ? T.green : "rgba(255,255,255,0.1)",
            position: "relative", transition: "background 0.2s ease", flexShrink: 0, marginLeft: 16,
          }}
        >
          <div style={{
            width: 18, height: 18, borderRadius: 9, background: "#fff",
            position: "absolute", top: 3,
            left: enabled ? 23 : 3,
            transition: "left 0.2s ease",
          }} />
        </button>
      </div>
    </Card>
  );
}

// ============ AI PREFERENCES SECTION ============
const ARCHETYPES_SETTINGS = [
  { id: "hype", label: "Hype", color: "#f97316" },
  { id: "competitive", label: "Competitive", color: "#3b82f6" },
  { id: "chill", label: "Chill", color: "#34d399" },
  { id: "variety", label: "Variety", color: T.accent },
];

const MOMENT_TYPES_SETTINGS = {
  funny: "Funny moments",
  clutch: "Clutch plays",
  emotional: "Emotional reactions",
  fails: "Fails & bloopers",
  skillful: "Skillful plays",
  educational: "Educational moments",
};

const ARCHETYPE_MOMENT_DEFAULTS = {
  hype: ["funny", "emotional", "fails", "clutch", "skillful", "educational"],
  competitive: ["clutch", "skillful", "emotional", "funny", "fails", "educational"],
  chill: ["educational", "funny", "emotional", "skillful", "clutch", "fails"],
  variety: ["funny", "clutch", "emotional", "fails", "skillful", "educational"],
};

function AIPreferencesSection() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    (async () => {
      if (window.clipflow?.storeGet) {
        const p = await window.clipflow.storeGet("creatorProfile");
        setProfile(p || { archetype: "variety", description: "", signaturePhrases: [], momentPriorities: ["funny", "clutch", "emotional", "fails", "skillful", "educational"] });
      }
      setLoading(false);
    })();
  }, []);

  const save = (updated) => {
    setProfile(updated);
    if (window.clipflow?.storeSet) window.clipflow.storeSet("creatorProfile", updated);
  };

  const moveMoment = (index, dir) => {
    if (!profile) return;
    const mp = [...profile.momentPriorities];
    const target = index + dir;
    if (target < 0 || target >= mp.length) return;
    [mp[index], mp[target]] = [mp[target], mp[index]];
    save({ ...profile, momentPriorities: mp });
  };

  const resetToDefaults = () => {
    const defaults = {
      archetype: "variety",
      description: "",
      signaturePhrases: [],
      momentPriorities: ["funny", "clutch", "emotional", "fails", "skillful", "educational"],
    };
    save(defaults);
    setShowResetConfirm(false);
  };

  const resetMomentsToArchetype = () => {
    if (!profile) return;
    const order = ARCHETYPE_MOMENT_DEFAULTS[profile.archetype] || ARCHETYPE_MOMENT_DEFAULTS.variety;
    save({ ...profile, momentPriorities: [...order] });
  };

  if (loading || !profile) return null;

  const arrowBtn = (disabled) => ({
    background: "none", border: "none", padding: "1px 5px",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.15 : 0.5,
    fontSize: 14, color: T.text, lineHeight: 1,
  });

  return (
    <Card style={{ padding: 24, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>AI Preferences</div>
      </div>

      {/* Archetype selector */}
      <div style={{ marginBottom: 20 }}>
        <SectionLabel>Content Vibe</SectionLabel>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {ARCHETYPES_SETTINGS.map((a) => {
            const sel = profile.archetype === a.id;
            return (
              <button
                key={a.id}
                onClick={() => save({ ...profile, archetype: a.id })}
                style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", fontFamily: T.font, transition: "all 0.15s",
                  background: sel ? `${a.color}18` : "rgba(255,255,255,0.04)",
                  color: sel ? a.color : T.textTertiary,
                  border: sel ? `1px solid ${a.color}44` : `1px solid ${T.border}`,
                }}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Moment priorities */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <SectionLabel>Moment Priorities</SectionLabel>
          <button onClick={resetMomentsToArchetype} style={{ ...BTN, fontSize: 10, padding: "3px 8px", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textTertiary }}>
            Reset to default
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {(profile.momentPriorities || []).map((id, i) => {
            const label = MOMENT_TYPES_SETTINGS[id] || id;
            return (
              <div key={id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px", borderRadius: 8,
                background: T.surface, border: `1px solid ${T.border}`,
              }}>
                <span style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                  background: i === 0 ? T.accentDim : "rgba(255,255,255,0.04)",
                  border: `1px solid ${i === 0 ? T.accentBorder : T.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: i === 0 ? T.accent : T.textTertiary, fontFamily: T.mono,
                }}>
                  {i + 1}
                </span>
                <span style={{ flex: 1, fontSize: 13, color: T.text }}>{label}</span>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <button style={arrowBtn(i === 0)} onClick={() => moveMoment(i, -1)} disabled={i === 0}>&#9650;</button>
                  <button style={arrowBtn(i === profile.momentPriorities.length - 1)} onClick={() => moveMoment(i, 1)} disabled={i === profile.momentPriorities.length - 1}>&#9660;</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Description */}
      <div style={{ marginBottom: 20 }}>
        <SectionLabel>Style Description</SectionLabel>
        <textarea
          value={profile.description || ""}
          onChange={(e) => save({ ...profile, description: e.target.value })}
          placeholder="e.g., I play shooters terribly on purpose and scream a lot, or I do chill commentary and explain what is going on"
          rows={3}
          style={{ ...inputStyle, resize: "vertical", minHeight: 72, lineHeight: 1.5, marginTop: 8 }}
        />
      </div>

      {/* Reset */}
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {!showResetConfirm ? (
          <button onClick={() => setShowResetConfirm(true)} style={{ ...BTN, fontSize: 11, background: T.redDim, border: `1px solid ${T.redBorder}`, color: T.red }}>
            Reset AI preferences
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: T.textSecondary }}>Reset all AI preferences to defaults? Clip history will not be affected.</span>
            <button onClick={resetToDefaults} style={{ ...BTN, fontSize: 11, background: T.red, border: "none", color: "#fff", fontWeight: 700 }}>Confirm</button>
            <button onClick={() => setShowResetConfirm(false)} style={{ ...BTN, fontSize: 11, ...btnSecondary }}>Cancel</button>
          </div>
        )}
        <button
          onClick={async () => {
            if (window.clipflow?.storeSet) {
              await window.clipflow.storeSet("onboardingComplete", false);
              window.location.reload();
            }
          }}
          style={{ ...BTN, fontSize: 11, ...btnSecondary }}
        >
          Re-run onboarding
        </button>
      </div>
    </Card>
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
        <div style={{ display: "flex", gap: 14 }}>
          {/* Left: grouped log list — wider when no log selected */}
          <div style={{ width: selectedLog ? 300 : "100%", maxWidth: selectedLog ? 300 : "none", flexShrink: 0, maxHeight: 500, overflowY: "auto" }}>
              {groupKeys.map((groupKey) => {
                const groupLogs = grouped[groupKey];
                const isExpanded = expandedGroups.has(groupKey);
                const successCount = groupLogs.filter(l => l.success).length;
                const failCount = groupLogs.length - successCount;
                const totalCost = groupLogs.reduce((s, l) => s + l.apiCost, 0);
                const allSel = groupLogs.every(l => selected.has(l.path));
                const someSel = groupLogs.some(l => selected.has(l.path));

                return (
                  <div key={groupKey} style={{ borderRadius: 8, border: `1px solid ${T.border}`, overflow: "hidden", marginBottom: 6 }}>
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

// ============ DEV DASHBOARD ============
function DevDashboard() {
  const [devMode, setDevMode] = useState(false);
  const [version, setVersion] = useState("");
  const [clickCount, setClickCount] = useState(0);
  const [showUnlockHint, setShowUnlockHint] = useState(false);
  // Provider state
  const [providerInfo, setProviderInfo] = useState(null);
  const [llmProvider, setLlmProvider] = useState("anthropic");
  const [llmConfig, setLlmConfig] = useState({ baseUrl: "", apiKey: "", model: "" });
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  // Store viewer
  const [storeKeys, setStoreKeys] = useState(null);
  const [expandedKey, setExpandedKey] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  // Active tab
  const [activeTab, setActiveTab] = useState("providers");
  // Pipeline logs
  const [pipelineLogs, setPipelineLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [logContent, setLogContent] = useState("");

  useEffect(() => {
    (async () => {
      const v = await window.clipflow?.getAppVersion?.();
      if (v) setVersion(v);
      const dm = await window.clipflow?.storeGet?.("devMode");
      if (dm) setDevMode(true);
    })();
  }, []);

  const handleVersionClick = async () => {
    const next = clickCount + 1;
    setClickCount(next);
    if (next >= 7 && !devMode) {
      setDevMode(true);
      await window.clipflow?.storeSet?.("devMode", true);
      setClickCount(0);
    } else if (next >= 3 && next < 7 && !devMode) {
      setShowUnlockHint(true);
      setTimeout(() => setShowUnlockHint(false), 2000);
    }
  };

  const loadProviderInfo = async () => {
    const info = await window.clipflow?.devGetProviderInfo?.();
    if (info) {
      setProviderInfo(info);
      setLlmProvider(info.llm.active);
      setLlmConfig(info.llm.config || { baseUrl: "", apiKey: "", model: "" });
    }
  };

  const loadStoreKeys = async () => {
    const keys = await window.clipflow?.devGetStoreKeys?.();
    if (keys) setStoreKeys(keys);
  };

  const loadPipelineLogs = async () => {
    const logs = await window.clipflow?.pipelineLogsList?.();
    if (logs) setPipelineLogs(logs);
  };

  useEffect(() => {
    if (devMode) {
      loadProviderInfo();
    }
  }, [devMode]);

  useEffect(() => {
    if (devMode && activeTab === "store") loadStoreKeys();
    if (devMode && activeTab === "logs") loadPipelineLogs();
  }, [devMode, activeTab]);

  const handleSaveLLMProvider = async () => {
    await window.clipflow?.devSetLLMProvider?.(llmProvider, llmProvider === "openai-compat" ? llmConfig : {});
    await loadProviderInfo();
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await window.clipflow?.devTestLLMConnection?.();
    setTestResult(result);
    setTesting(false);
  };

  const handleSaveStoreKey = async (key) => {
    try {
      const parsed = JSON.parse(editValue);
      await window.clipflow?.devSetStoreKey?.(key, parsed);
    } catch {
      await window.clipflow?.devSetStoreKey?.(key, editValue);
    }
    setEditingKey(null);
    await loadStoreKeys();
  };

  const handleDeleteStoreKey = async (key) => {
    await window.clipflow?.devDeleteStoreKey?.(key);
    await loadStoreKeys();
  };

  const handleViewLog = async (logPath) => {
    const content = await window.clipflow?.pipelineLogsRead?.(logPath);
    setLogContent(content || "");
    setSelectedLog(logPath);
  };

  const tabStyle = (tab) => ({
    padding: "6px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: T.font, fontWeight: 600,
    background: activeTab === tab ? "rgba(139,92,246,0.15)" : "transparent",
    color: activeTab === tab ? T.accentLight : T.textTertiary,
    border: activeTab === tab ? `1px solid ${T.accentBorder}` : "1px solid transparent",
    transition: "all 0.15s",
  });

  const filteredKeys = storeKeys ? Object.entries(storeKeys).filter(([k]) =>
    !storeFilter || k.toLowerCase().includes(storeFilter.toLowerCase())
  ).sort(([a], [b]) => a.localeCompare(b)) : [];

  return (
    <>
      {/* Version Footer — click 7 times to unlock dev mode */}
      {version && (
        <div
          onClick={handleVersionClick}
          style={{
            textAlign: "center", padding: "16px 0 8px", color: T.textMuted, fontSize: 11, fontFamily: T.mono,
            cursor: "default", userSelect: "none", position: "relative",
          }}
        >
          ClipFlow v{version}
          {showUnlockHint && (
            <span style={{ color: T.accentLight, fontSize: 10, marginLeft: 8, opacity: 0.6 }}>
              {7 - clickCount} more...
            </span>
          )}
        </div>
      )}

      {/* Dev Dashboard */}
      {devMode && (
        <Card style={{ padding: 24, marginBottom: 16, borderColor: T.accentBorder }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.accentLight }}>Dev Dashboard</span>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                background: "rgba(139,92,246,0.15)", color: T.accentLight, textTransform: "uppercase", letterSpacing: "0.5px",
              }}>DEV</span>
            </div>
            <button
              onClick={async () => { setDevMode(false); await window.clipflow?.storeSet?.("devMode", false); }}
              style={{ background: "none", border: "none", color: T.textMuted, fontSize: 11, cursor: "pointer", fontFamily: T.font }}
            >
              Hide
            </button>
          </div>

          {/* Tab bar */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            <button onClick={() => setActiveTab("providers")} style={tabStyle("providers")}>Providers</button>
            <button onClick={() => setActiveTab("store")} style={tabStyle("store")}>Store</button>
            <button onClick={() => setActiveTab("logs")} style={tabStyle("logs")}>Pipeline Logs</button>
          </div>

          {/* ── Providers Tab ── */}
          {activeTab === "providers" && providerInfo && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* LLM Provider */}
              <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: 16 }}>
                <div style={{ color: T.textSecondary, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>LLM Provider</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  {providerInfo.llm.available.map((p) => (
                    <button
                      key={p}
                      onClick={() => setLlmProvider(p)}
                      style={{
                        padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.mono,
                        background: llmProvider === p ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.04)",
                        color: llmProvider === p ? T.accentLight : T.textTertiary,
                        border: llmProvider === p ? `1px solid ${T.accentBorder}` : `1px solid ${T.border}`,
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                {/* OpenAI-compat config fields */}
                {llmProvider === "openai-compat" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                    <input
                      value={llmConfig.baseUrl || ""}
                      onChange={(e) => setLlmConfig({ ...llmConfig, baseUrl: e.target.value })}
                      placeholder="Base URL (e.g. https://api.openai.com/v1)"
                      style={{ ...inputStyle, fontSize: 11, padding: "8px 12px" }}
                    />
                    <input
                      value={llmConfig.apiKey || ""}
                      onChange={(e) => setLlmConfig({ ...llmConfig, apiKey: e.target.value })}
                      placeholder="API Key"
                      type="password"
                      style={{ ...inputStyle, fontSize: 11, padding: "8px 12px" }}
                    />
                    <input
                      value={llmConfig.model || ""}
                      onChange={(e) => setLlmConfig({ ...llmConfig, model: e.target.value })}
                      placeholder="Model ID (e.g. gpt-4o, deepseek-chat)"
                      style={{ ...inputStyle, fontSize: 11, padding: "8px 12px" }}
                    />
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={handleSaveLLMProvider} style={{ ...BTN, background: T.green, border: "none", color: "#fff", fontWeight: 700, fontSize: 11 }}>Save</button>
                  <button onClick={handleTestConnection} disabled={testing} style={{ ...BTN, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary, fontSize: 11 }}>
                    {testing ? "Testing..." : "Test Connection"}
                  </button>
                  {testResult && (
                    <span style={{ fontSize: 11, fontFamily: T.mono, color: testResult.success ? T.green : T.red }}>
                      {testResult.success ? `OK — ${testResult.latency}ms (${testResult.provider}/${testResult.model})` : testResult.error}
                    </span>
                  )}
                </div>

                {/* Current status */}
                <div style={{ marginTop: 10, fontSize: 11, color: T.textMuted, fontFamily: T.mono }}>
                  Active: {providerInfo.llm.active} / Model: {providerInfo.llm.defaultModel}
                </div>
              </div>

              {/* Transcription Provider */}
              <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: 16 }}>
                <div style={{ color: T.textSecondary, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Transcription Provider</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {providerInfo.transcription.available.map((p) => (
                    <button
                      key={p}
                      onClick={async () => { await window.clipflow?.devSetTranscriptionProvider?.(p); await loadProviderInfo(); }}
                      style={{
                        padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.mono,
                        background: providerInfo.transcription.active === p ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.04)",
                        color: providerInfo.transcription.active === p ? T.green : T.textTertiary,
                        border: providerInfo.transcription.active === p ? `1px solid ${T.greenBorder}` : `1px solid ${T.border}`,
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: T.textMuted, fontFamily: T.mono }}>
                  Active: {providerInfo.transcription.active} (local)
                </div>
              </div>
            </div>
          )}

          {/* ── Store Tab ── */}
          {activeTab === "store" && storeKeys && (
            <div>
              <input
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                placeholder="Filter keys..."
                style={{ ...inputStyle, fontSize: 11, padding: "8px 12px", marginBottom: 12 }}
              />
              <div style={{ maxHeight: 400, overflow: "auto", borderRadius: 6, border: `1px solid ${T.border}` }}>
                {filteredKeys.map(([key, info]) => (
                  <div key={key} style={{
                    borderBottom: `1px solid ${T.border}`, padding: "8px 12px",
                    background: expandedKey === key ? "rgba(255,255,255,0.03)" : "transparent",
                  }}>
                    <div
                      onClick={() => setExpandedKey(expandedKey === key ? null : key)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: T.text, fontSize: 11, fontFamily: T.mono, fontWeight: 600 }}>{key}</span>
                        <span style={{
                          fontSize: 9, padding: "1px 5px", borderRadius: 3, fontFamily: T.mono,
                          background: "rgba(255,255,255,0.06)", color: T.textMuted,
                        }}>{info.type}</span>
                      </div>
                      <span style={{ color: T.textMuted, fontSize: 10, fontFamily: T.mono, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {info.preview}
                      </span>
                    </div>
                    {expandedKey === key && (
                      <div style={{ marginTop: 8 }}>
                        {editingKey === key ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <textarea
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              rows={4}
                              style={{ ...inputStyle, fontSize: 10, fontFamily: T.mono, padding: "8px", resize: "vertical" }}
                            />
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => handleSaveStoreKey(key)} style={{ ...BTN, background: T.green, border: "none", color: "#fff", fontWeight: 700, fontSize: 10 }}>Save</button>
                              <button onClick={() => setEditingKey(null)} style={{ ...BTN, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary, fontSize: 10 }}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <pre style={{
                              fontSize: 10, fontFamily: T.mono, color: T.textTertiary,
                              background: "rgba(0,0,0,0.2)", borderRadius: 4, padding: 8, margin: "4px 0",
                              maxHeight: 200, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
                            }}>
                              {typeof info.value === "string" ? info.value : JSON.stringify(info.value, null, 2)}
                            </pre>
                            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                              <button
                                onClick={() => { setEditingKey(key); setEditValue(typeof info.value === "string" ? info.value : JSON.stringify(info.value, null, 2)); }}
                                style={{ ...BTN, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary, fontSize: 10 }}
                              >Edit</button>
                              <button
                                onClick={() => handleDeleteStoreKey(key)}
                                style={{ ...BTN, background: T.redDim, border: `1px solid ${T.redBorder}`, color: T.red, fontSize: 10 }}
                              >Delete</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, color: T.textMuted, fontSize: 10, fontFamily: T.mono }}>
                {filteredKeys.length} keys {storeFilter && `(filtered from ${Object.keys(storeKeys).length})`}
              </div>
            </div>
          )}

          {/* ── Pipeline Logs Tab ── */}
          {activeTab === "logs" && (
            <div>
              {selectedLog ? (
                <div>
                  <button
                    onClick={() => { setSelectedLog(null); setLogContent(""); }}
                    style={{ ...BTN, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary, fontSize: 11, marginBottom: 8 }}
                  >Back</button>
                  <pre style={{
                    fontSize: 10, fontFamily: T.mono, color: T.textTertiary,
                    background: "rgba(0,0,0,0.2)", borderRadius: 6, padding: 12,
                    maxHeight: 400, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
                    border: `1px solid ${T.border}`,
                  }}>{logContent}</pre>
                </div>
              ) : (
                <div style={{ maxHeight: 300, overflow: "auto" }}>
                  {pipelineLogs.length === 0 ? (
                    <div style={{ color: T.textMuted, fontSize: 12, textAlign: "center", padding: 24 }}>No pipeline logs yet</div>
                  ) : (
                    pipelineLogs.map((log, i) => (
                      <div
                        key={i}
                        onClick={() => handleViewLog(log.path)}
                        style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px",
                          borderBottom: `1px solid ${T.border}`, cursor: "pointer",
                          background: "transparent", transition: "background 0.1s",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ color: T.text, fontSize: 11, fontWeight: 600 }}>{log.videoName || log.filename}</span>
                          <span style={{ color: T.textMuted, fontSize: 10, fontFamily: T.mono }}>
                            {new Date(log.date).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ color: log.success ? T.green : T.red, fontSize: 10, fontWeight: 700 }}>
                            {log.success ? "OK" : "FAIL"}
                          </span>
                          {log.apiCost > 0 && (
                            <span style={{ color: T.textTertiary, fontSize: 10, fontFamily: T.mono }}>
                              ${log.apiCost.toFixed(4)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
