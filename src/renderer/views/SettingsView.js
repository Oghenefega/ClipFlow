import React, { useState } from "react";
import T from "../styles/theme";
import { Card, PageHeader, SectionLabel, GamePill, PulseDot, ColorPicker } from "../components/shared";
import { GameEditModal } from "../components/modals";

export default function SettingsView({ mainGame, setMainGame, mainPool, setMainPool, gamesDb, setGamesDb, onEditGame, watchFolder, setWatchFolder, ignoredProcesses, setIgnoredProcesses, platforms, setPlatforms }) {
  const [editFolder, setEditFolder] = useState(false);
  const [folderVal, setFolderVal] = useState(watchFolder);
  const [editIgn, setEditIgn] = useState(false);
  const [ignVal, setIgnVal] = useState(ignoredProcesses.join("\n"));
  const [editGD, setEditGD] = useState(null);
  const [showAddMain, setShowAddMain] = useState(false);
  const [dlS, setDlS] = useState(false);
  const [dlD, setDlD] = useState(false);

  const dlC = [
    { id: 1, title: "The Shoot First Strategy #arcraiders" },
    { id: 2, title: "I Lost 12 Games of Chess... #arcraiders" },
  ];

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
            <button onClick={() => { setEditFolder(true); setFolderVal(watchFolder); }} style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>Edit</button>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setEditFolder(false)} style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
              <button onClick={() => { setWatchFolder(folderVal); setEditFolder(false); }} style={{ padding: "6px 12px", borderRadius: 6, background: T.green, border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Save</button>
            </div>
          )}
        </div>
        {editFolder ? (
          <input value={folderVal} onChange={(e) => setFolderVal(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.accentBorder}`, borderRadius: T.radius.md, padding: "12px 16px", color: T.text, fontSize: 13, fontFamily: T.mono, outline: "none", boxSizing: "border-box" }} />
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
                <button onClick={(e) => { e.stopPropagation(); rmMain(name); }} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 12, cursor: "pointer", padding: "0 0 0 4px", lineHeight: 1 }}>✕</button>
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
          {gamesDb.map((g) => (
            <div key={g.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: T.radius.md, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.02)" }}>
              <GamePill tag={g.tag} color={g.color} size="sm" />
              <span onClick={() => setEditGD(g)} style={{ color: T.text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{g.name}</span>
              <span style={{ color: T.textMuted, fontSize: 11, fontFamily: T.mono }}>#{g.hashtag}</span>
              <span onClick={() => setEditGD(g)} style={{ color: T.textTertiary, fontSize: 12, cursor: "pointer" }}>✎</span>
              <button onClick={() => delGame(g.name)} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 11, cursor: "pointer", padding: "0 0 0 2px" }}>✕</button>
            </div>
          ))}
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

      {/* Ignored Processes */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700 }}>Ignored Processes</div>
          {!editIgn ? (
            <button onClick={() => { setEditIgn(true); setIgnVal(ignoredProcesses.join("\n")); }} style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>Edit</button>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setEditIgn(false)} style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textSecondary, fontSize: 12, cursor: "pointer", fontFamily: T.font }}>Cancel</button>
              <button onClick={() => { setIgnoredProcesses(ignVal.split("\n").map((s) => s.trim()).filter(Boolean)); setEditIgn(false); }} style={{ padding: "6px 12px", borderRadius: 6, background: T.green, border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>Save</button>
            </div>
          )}
        </div>
        <p style={{ color: T.textTertiary, fontSize: 12, margin: editIgn ? "0 0 10px" : 0 }}>Exe processes that won't be suggested as games.</p>
        {editIgn ? (
          <textarea value={ignVal} onChange={(e) => setIgnVal(e.target.value)} rows={5} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12, color: T.text, fontSize: 13, fontFamily: T.mono, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
        ) : (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {ignoredProcesses.map((p) => (
              <span key={p} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`, color: T.textTertiary, fontSize: 12, fontFamily: T.mono }}>{p}</span>
            ))}
          </div>
        )}
      </Card>

      {/* Downloads */}
      <Card style={{ padding: 24 }}>
        <div style={{ color: T.textSecondary, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Downloads</div>
        <p style={{ color: T.textTertiary, fontSize: 13, fontFamily: T.mono, marginBottom: 12 }}>W:\...\Downloaded Clips\Vizard Clips</p>
        {dlC.map((c) => (
          <div key={c.id} style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ color: T.text, fontSize: 14 }}>{c.title}</div>
          </div>
        ))}
        <div style={{ marginTop: 12 }}>
          <button onClick={() => { setDlS(true); setTimeout(() => setDlD(true), 2000); }} disabled={dlS} style={{ padding: "12px 24px", borderRadius: T.radius.md, border: "none", background: dlD ? T.greenDim : dlS ? "rgba(255,255,255,0.04)" : T.accent, color: dlD ? T.green : dlS ? T.textMuted : "#fff", fontSize: 14, fontWeight: 700, cursor: dlS ? "default" : "pointer", fontFamily: T.font }}>
            {dlD ? "✅ Downloaded" : dlS ? "Downloading..." : `Download ${dlC.length} Clips`}
          </button>
        </div>
      </Card>

      {editGD && <GameEditModal game={editGD} onSave={(g) => { onEditGame(g); setEditGD(null); }} onClose={() => setEditGD(null)} />}
    </div>
  );
}
