import React, { useState } from "react";
import T from "../styles/theme";
import { Card, PageHeader, SectionLabel, GamePill, PulseDot, InfoBanner } from "../components/shared";
import { GameEditModal } from "../components/modals";

// Shared button styles used across all settings sections
const BTN = { padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: T.font };
const btnSecondary = { ...BTN, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary };
const btnSave = { ...BTN, background: T.green, border: "none", color: "#fff", fontWeight: 700 };
const inputStyle = { width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "10px 14px", color: T.text, fontSize: 13, fontFamily: T.mono, outline: "none", boxSizing: "border-box" };
const maskKey = (key) => (!key || key.length < 8) ? (key || "") : key.substring(0, 4) + "••••" + key.substring(key.length - 4);

export default function SettingsView({ mainGame, setMainGame, mainPool, setMainPool, gamesDb, setGamesDb, onEditGame, watchFolder, setWatchFolder, ignoredProcesses, setIgnoredProcesses, platforms, setPlatforms, r2Config, setR2Config, vizardApiKey, setVizardApiKey, onResetUploads }) {
  const [editFolder, setEditFolder] = useState(false);
  const [folderVal, setFolderVal] = useState(watchFolder);
  const [editIgn, setEditIgn] = useState(false);
  const [ignVal, setIgnVal] = useState(ignoredProcesses.join("\n"));
  const [editGD, setEditGD] = useState(null);
  const [showAddMain, setShowAddMain] = useState(false);
  const [selGameLib, setSelGameLib] = useState(null);
  const [editR2, setEditR2] = useState(false);
  const [r2Vals, setR2Vals] = useState(r2Config || {});
  const [editVizard, setEditVizard] = useState(false);
  const [vizVal, setVizVal] = useState(vizardApiKey || "");
  const [resetConfirm, setResetConfirm] = useState(false);

  const browseFolder = async () => {
    if (!window.clipflow?.pickFolder) return;
    const result = await window.clipflow.pickFolder();
    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
      setWatchFolder(result.filePaths[0]);
    }
  };

  const togPlat = (key) => setPlatforms((p) => p.map((x) => (x.key === key ? { ...x, connected: !x.connected } : x)));
  const rmMain = (name) => setMainPool((p) => p.filter((n) => n !== name));
  const delGame = (name) => { setGamesDb((p) => p.filter((g) => g.name !== name)); setMainPool((p) => p.filter((n) => n !== name)); };
  const nonPool = gamesDb.filter((g) => !mainPool.includes(g.name));

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
              <div key={g.name} onClick={() => { setSelGameLib(isSel ? null : g.name); setEditGD(g); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: T.radius.md, border: `1px solid ${isSel ? T.accentBorder : T.border}`, background: isSel ? T.accentGlow : "rgba(255,255,255,0.02)", cursor: "pointer" }}>
                <GamePill tag={g.tag} color={g.color} size="sm" />
                <span style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>{g.name}</span>
                {isSel && <span style={{ color: T.textMuted, fontSize: 11, fontFamily: T.mono }}>#{g.hashtag}</span>}
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

      {/* R2 Configuration */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>Cloudflare R2</div>
          {!editR2 ? (
            <button onClick={() => { setEditR2(true); setR2Vals(r2Config || {}); }} style={btnSecondary}>Edit</button>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setEditR2(false)} style={btnSecondary}>Cancel</button>
              <button onClick={() => { setR2Config(r2Vals); setEditR2(false); }} style={btnSave}>Save</button>
            </div>
          )}
        </div>
        {editR2 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { key: "accountId", label: "Account ID" },
              { key: "accessKeyId", label: "Access Key ID" },
              { key: "secretAccessKey", label: "Secret Access Key" },
              { key: "bucketName", label: "Bucket Name" },
              { key: "publicBaseUrl", label: "Public Base URL" },
            ].map((field) => (
              <div key={field.key}>
                <SectionLabel>{field.label}</SectionLabel>
                <input
                  value={r2Vals[field.key] || ""}
                  onChange={(e) => setR2Vals((p) => ({ ...p, [field.key]: e.target.value }))}
                  type={field.key.toLowerCase().includes("secret") ? "password" : "text"}
                  style={{ ...inputStyle, marginTop: 6 }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: T.textTertiary, fontSize: 12, width: 100 }}>Bucket</span>
              <span style={{ color: T.text, fontSize: 13, fontFamily: T.mono }}>{r2Config?.bucketName || "Not set"}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: T.textTertiary, fontSize: 12, width: 100 }}>Access Key</span>
              <span style={{ color: T.text, fontSize: 13, fontFamily: T.mono }}>{maskKey(r2Config?.accessKeyId)}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: T.textTertiary, fontSize: 12, width: 100 }}>Status</span>
              <PulseDot color={r2Config?.accessKeyId ? T.green : T.red} size={6} />
              <span style={{ color: r2Config?.accessKeyId ? T.green : T.red, fontSize: 12, fontWeight: 600 }}>{r2Config?.accessKeyId ? "Configured" : "Not configured"}</span>
            </div>
          </div>
        )}
      </Card>

      {/* Vizard API */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>Vizard AI</div>
          {!editVizard ? (
            <button onClick={() => { setEditVizard(true); setVizVal(vizardApiKey || ""); }} style={btnSecondary}>Edit</button>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setEditVizard(false)} style={btnSecondary}>Cancel</button>
              <button onClick={() => { setVizardApiKey(vizVal); setEditVizard(false); }} style={btnSave}>Save</button>
            </div>
          )}
        </div>
        {editVizard ? (
          <div>
            <SectionLabel>API Key</SectionLabel>
            <input value={vizVal} onChange={(e) => setVizVal(e.target.value)} type="password" style={{ ...inputStyle, marginTop: 6 }} />
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ color: T.textTertiary, fontSize: 12, width: 100 }}>API Key</span>
            <span style={{ color: T.text, fontSize: 13, fontFamily: T.mono }}>{maskKey(vizardApiKey)}</span>
            <PulseDot color={vizardApiKey ? T.green : T.red} size={6} />
            <span style={{ color: vizardApiKey ? T.green : T.red, fontSize: 12, fontWeight: 600 }}>{vizardApiKey ? "Configured" : "Not set"}</span>
          </div>
        )}
      </Card>

      {/* Ignored Processes */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>Ignored Processes</div>
          {!editIgn ? (
            <button onClick={() => { setEditIgn(true); setIgnVal(ignoredProcesses.join("\n")); }} style={btnSecondary}>Edit</button>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setEditIgn(false)} style={btnSecondary}>Cancel</button>
              <button onClick={() => { setIgnoredProcesses(ignVal.split("\n").map((s) => s.trim()).filter(Boolean)); setEditIgn(false); }} style={btnSave}>Save</button>
            </div>
          )}
        </div>
        <p style={{ color: T.textTertiary, fontSize: 12, margin: editIgn ? "0 0 10px" : 0 }}>Exe processes that won't be suggested as games.</p>
        {editIgn ? (
          <textarea value={ignVal} onChange={(e) => setIgnVal(e.target.value)} rows={5} style={{ ...inputStyle, padding: 12, resize: "vertical" }} />
        ) : (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {ignoredProcesses.map((p) => (
              <span key={p} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`, color: T.textTertiary, fontSize: 12, fontFamily: T.mono }}>{p}</span>
            ))}
          </div>
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

      {/* Downloads — empty until Vizard integration */}
      <Card style={{ padding: 24 }}>
        <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Downloads</div>
        <InfoBanner icon={"\ud83d\udd17"} color={T.accent}>Vizard clip downloads will appear here once API integration is complete.</InfoBanner>
      </Card>

      {editGD && <GameEditModal game={editGD} onSave={(g) => { onEditGame(g); setEditGD(null); }} onClose={() => setEditGD(null)} />}
    </div>
  );
}
