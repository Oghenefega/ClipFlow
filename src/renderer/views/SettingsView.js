import React, { useState } from "react";
import T from "../styles/theme";
import { Card, PageHeader, SectionLabel, GamePill, PulseDot } from "../components/shared";
import { GameEditModal } from "../components/modals";

// Shared button styles used across all settings sections
const BTN = { padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: T.font };
const btnSecondary = { ...BTN, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary };
const btnSave = { ...BTN, background: T.green, border: "none", color: "#fff", fontWeight: 700 };
const inputStyle = { width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "10px 14px", color: T.text, fontSize: 13, fontFamily: T.mono, outline: "none", boxSizing: "border-box" };
const maskKey = (key) => (!key || key.length < 8) ? (key || "") : key.substring(0, 4) + "\u2022\u2022\u2022\u2022" + key.substring(key.length - 4);

export default function SettingsView({ mainGame, setMainGame, mainPool, setMainPool, gamesDb, setGamesDb, onEditGame, watchFolder, setWatchFolder, platforms, setPlatforms, anthropicApiKey, setAnthropicApiKey, styleGuide, setStyleGuide, outputFolder, setOutputFolder, sfxFolder, setSfxFolder }) {
  const [editFolder, setEditFolder] = useState(false);
  const [folderVal, setFolderVal] = useState(watchFolder);
  const [editGD, setEditGD] = useState(null);
  const [showAddMain, setShowAddMain] = useState(false);
  const [selGameLib, setSelGameLib] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
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

      {/* Output Folder */}
      <SectionLabel>Output Folder</SectionLabel>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16 }}>
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
      <SectionLabel>Sound Effects Folder</SectionLabel>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16 }}>
          <span style={{ flex: 1, fontFamily: T.mono, fontSize: 12, color: sfxFolder ? T.text : T.textTertiary }}>
            {sfxFolder || "Not set \u2014 browse your sound effects folder"}
          </span>
          <button onClick={async () => { const f = await window.clipflow?.pickFolder(); if (f) setSfxFolder(f); }}
            style={{ padding: "6px 14px", borderRadius: T.radius.sm, border: `1px solid ${T.border}`, background: T.surfaceHover, color: T.text, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>
            Browse
          </button>
        </div>
      </Card>

      {/* Whisper Configuration */}
      <SectionLabel>Whisper Configuration</SectionLabel>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ color: T.textSecondary, fontSize: 12, padding: 16 }}>
          Whisper model configuration &mdash; coming in Phase 2
        </div>
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

      {editGD && <GameEditModal game={editGD} onSave={(g) => { onEditGame(g); setEditGD(null); setSelGameLib(null); }} onClose={() => { setEditGD(null); setSelGameLib(null); }} anthropicApiKey={anthropicApiKey} />}
    </div>
  );
}
