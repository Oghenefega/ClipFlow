import React, { useState, useEffect, useRef } from "react";
import T from "../styles/theme";
import { PulseDot, GamePill, Card, SectionLabel, InfoBanner, PageHeader, PrimaryButton, TabBar, Select, MiniSpinbox, Checkbox } from "../components/shared";

export default function RenameView({ gamesDb, mainGameName, pendingRenames, setPendingRenames, renameHistory, setRenameHistory, onAddGame, onGameDayUpdate, managedFiles, setManagedFiles, watchFolder }) {
  const [subTab, setSubTab] = useState("pending");
  const [renaming, setRenaming] = useState(false);
  const [renameDone, setRenameDone] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [manageFolder, setManageFolder] = useState("2026-03");
  const [manageSelected, setManageSelected] = useState(new Set());
  const [batchAction, setBatchAction] = useState(null);
  const [batchValue, setBatchValue] = useState("");

  const isElectron = typeof window !== "undefined" && window.clipflow;

  // File watcher integration
  useEffect(() => {
    if (!isElectron) return;
    window.clipflow.startWatching(watchFolder);
    window.clipflow.onFileAdded((file) => {
      setPendingRenames((prev) => {
        if (prev.find((p) => p.fileName === file.name)) return prev;
        const detected = detectGame(file.name, gamesDb, prev);
        return [...prev, {
          id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fileName: file.name, filePath: file.path,
          game: detected.game, tag: detected.tag, color: detected.color,
          day: detected.day, part: detected.part,
          createdAt: file.createdAt,
        }];
      });
    });
    return () => { window.clipflow.removeFileListeners(); };
  }, [watchFolder, isElectron, gamesDb]);

  // Recalculate pending PART numbers once managedFiles loads from filesystem scan.
  // Days come from stored dayCount so they're correct immediately, but parts need
  // managedFiles to know what parts already exist on disk.
  const managedLoaded = useRef(false);
  useEffect(() => {
    if (managedFiles.length === 0 || managedLoaded.current) return;
    managedLoaded.current = true;

    setPendingRenames((prev) => {
      if (prev.length === 0) return prev;
      const updated = [];
      for (const r of prev) {
        const fileDate = r.fileName.slice(0, 10);
        // Recalculate parts using managedFiles + already-updated pending
        const existingParts = [
          ...managedFiles.filter((f) => f.tag === r.tag && f.name.startsWith(fileDate) && f.day === r.day).map((f) => f.part),
          ...renameHistory.filter((h) => !h.undone && h.tag === r.tag && h.newName.startsWith(fileDate)).map((h) => h.part),
          ...updated.filter((p) => p.tag === r.tag && p.fileName.slice(0, 10) === fileDate && p.day === r.day).map((p) => p.part),
        ];
        const part = existingParts.length > 0 ? Math.max(...existingParts) + 1 : 1;
        updated.push({ ...r, part });
      }
      return updated;
    });
  }, [managedFiles]);

  // Recalculate pending DAY numbers when gamesDb changes (e.g. user edits dayCount in Settings)
  // Also runs on mount to fix stale values from before component was unmounted
  const prevGamesRef = useRef(null);
  useEffect(() => {
    const isFirstMount = !prevGamesRef.current;
    if (!isFirstMount) {
      // Check if any dayCount actually changed
      const changed = gamesDb.some((g) => {
        const prev = prevGamesRef.current.find((p) => p.tag === g.tag);
        return prev && (prev.dayCount !== g.dayCount || prev.lastDayDate !== g.lastDayDate);
      });
      if (!changed) { prevGamesRef.current = gamesDb; return; }
    }
    prevGamesRef.current = gamesDb;

    setPendingRenames((prev) => {
      if (prev.length === 0) return prev;
      const updated = [];
      for (const r of prev) {
        const game = gamesDb.find((g) => g.tag === r.tag);
        if (!game) { updated.push(r); continue; }
        const detected = detectForGame(game, r.fileName, updated.filter((p) => p.tag === r.tag));
        updated.push({ ...r, day: detected.day, part: detected.part });
      }
      return updated;
    });
  }, [gamesDb]);

  // ============ DAY DETECTION — uses stored dayCount/lastDayDate per game ============
  // Each unique calendar date a game is recorded = 1 new day.
  // dayCount and lastDayDate are stored in gamesDb and persisted via electron-store.

  const detectGame = (fileName, games, currentPending) => {
    const game = games.find((g) => g.name === mainGameName) || games[0] || { name: "Unknown", tag: "??", color: "#888", dayCount: 0 };
    return detectForGame(game, fileName, currentPending);
  };

  const detectForGame = (game, fileName, currentPending) => {
    const fileDate = fileName.slice(0, 10);
    const baseDayCount = game.dayCount || 0;
    const baseLastDate = game.lastDayDate || null;

    // Build a date→day mapping using only stored dayCount + file dates (never trust pending day values)
    const dateToDay = {};
    if (baseLastDate) dateToDay[baseLastDate] = baseDayCount;

    // Collect unique dates from pending files for this game + this file
    const allDates = new Set();
    if (baseLastDate) allDates.add(baseLastDate);
    (currentPending || []).forEach((p) => {
      if (p.tag === game.tag) allDates.add(p.fileName.slice(0, 10));
    });
    allDates.add(fileDate);

    // Process dates chronologically, assigning day numbers
    let runningDay = baseDayCount;
    let runningLastDate = baseLastDate;
    for (const d of [...allDates].sort()) {
      if (dateToDay[d] !== undefined) continue; // Already mapped (e.g., baseLastDate)
      if (!runningLastDate || d > runningLastDate) {
        runningDay++;
        dateToDay[d] = runningDay;
        runningLastDate = d;
      } else {
        // Date older than or equal to stored lastDate — use base dayCount
        dateToDay[d] = baseDayCount;
      }
    }

    const day = dateToDay[fileDate] !== undefined ? dateToDay[fileDate] : baseDayCount + 1;

    // Determine part number from all sources
    const existingParts = [
      ...managedFiles.filter((f) => f.tag === game.tag && f.name.startsWith(fileDate) && f.day === day).map((f) => f.part),
      ...renameHistory.filter((h) => !h.undone && h.tag === game.tag && h.newName.startsWith(fileDate)).map((h) => h.part),
      ...(currentPending || []).filter((p) => p.tag === game.tag && p.fileName.slice(0, 10) === fileDate).map((p) => p.part),
    ];
    const part = existingParts.length > 0 ? Math.max(...existingParts) + 1 : 1;

    return { game: game.name, tag: game.tag, color: game.color, day, part };
  };

  const getProposed = (r) => `${r.fileName.slice(0, 10)} ${r.tag} Day${r.day} Pt${r.part}.mp4`;

  // Smart update — when game changes, recompute day and part using stored dayCount
  const updatePending = (id, field, value) => {
    setPendingRenames((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const u = { ...r, [field]: value };
      if (field === "game") {
        const g = gamesDb.find((x) => x.name === value);
        if (g) {
          u.tag = g.tag;
          u.color = g.color;
          // Re-detect day/part for the new game using stored dayCount
          const otherPending = prev.filter((p) => p.id !== id);
          const detected = detectForGame(g, r.fileName, otherPending);
          u.day = detected.day;
          u.part = detected.part;
        }
      }
      return u;
    }));
  };

  const renameOne = async (id) => {
    const r = pendingRenames.find((x) => x.id === id);
    if (!r) return;
    const newName = getProposed(r);

    if (isElectron && r.filePath) {
      const dir = r.filePath.substring(0, r.filePath.lastIndexOf("\\"));
      const monthFolder = r.fileName.slice(0, 7);
      const targetDir = `${dir}\\${monthFolder}`;
      const newPath = `${targetDir}\\${newName}`;
      const result = await window.clipflow.renameFile(r.filePath, newPath);
      if (result.error) { console.error("Rename failed:", result.error); return; }
    }

    setRenameHistory((prev) => [{ id: `h-${Date.now()}`, oldName: r.fileName, newName, game: r.game, tag: r.tag, color: r.color, day: r.day, part: r.part, time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }), undone: false }, ...prev]);
    setPendingRenames((prev) => prev.filter((x) => x.id !== id));

    // Persist the game's dayCount and lastDayDate
    if (onGameDayUpdate) {
      const fileDate = r.fileName.slice(0, 10);
      const game = gamesDb.find((g) => g.tag === r.tag);
      const newDayCount = Math.max(r.day, game?.dayCount || 0);
      const newLastDate = !game?.lastDayDate || fileDate >= game.lastDayDate ? fileDate : game.lastDayDate;
      onGameDayUpdate(r.tag, newDayCount, newLastDate);
    }
  };

  const hideOne = (id) => setPendingRenames((prev) => prev.filter((x) => x.id !== id));

  const renameAll = async () => {
    setRenaming(true);
    const sorted = [...pendingRenames].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const groups = {};
    sorted.forEach((r) => { const key = `${r.tag}-Day${r.day}`; if (!groups[key]) groups[key] = { minPart: r.part, items: [] }; groups[key].items.push(r); if (r.part < groups[key].minPart) groups[key].minPart = r.part; });

    const corrected = [];
    for (const g of Object.values(groups)) {
      for (let idx = 0; idx < g.items.length; idx++) {
        const r = g.items[idx];
        const part = g.items.length > 1 ? g.minPart + idx : r.part;
        const newName = `${r.fileName.slice(0, 10)} ${r.tag} Day${r.day} Pt${part}.mp4`;

        if (isElectron && r.filePath) {
          const dir = r.filePath.substring(0, r.filePath.lastIndexOf("\\"));
          const monthFolder = r.fileName.slice(0, 7);
          const newPath = `${dir}\\${monthFolder}\\${newName}`;
          await window.clipflow.renameFile(r.filePath, newPath);
        }

        corrected.push({ id: `h-${Date.now()}-${r.id}`, oldName: r.fileName, newName, game: r.game, tag: r.tag, color: r.color, day: r.day, part, time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }), undone: false });
      }
    }

    // Persist dayCount/lastDayDate for all affected games
    if (onGameDayUpdate) {
      const gameUpdates = {};
      for (const h of corrected) {
        const fileDate = h.oldName.slice(0, 10);
        if (!gameUpdates[h.tag]) {
          const game = gamesDb.find((g) => g.tag === h.tag);
          gameUpdates[h.tag] = { dayCount: game?.dayCount || 0, lastDayDate: game?.lastDayDate || null };
        }
        if (h.day > gameUpdates[h.tag].dayCount) gameUpdates[h.tag].dayCount = h.day;
        if (!gameUpdates[h.tag].lastDayDate || fileDate >= gameUpdates[h.tag].lastDayDate) gameUpdates[h.tag].lastDayDate = fileDate;
      }
      for (const [tag, update] of Object.entries(gameUpdates)) {
        onGameDayUpdate(tag, update.dayCount, update.lastDayDate);
      }
    }

    setRenameHistory((prev) => [...corrected, ...prev]);
    setPendingRenames([]);
    setRenaming(false);
    setRenameDone(true);
    setTimeout(() => setRenameDone(false), 3000);
  };

  const toggleUndo = (h) => {
    if (!h.undone) {
      setPendingRenames((prev) => [...prev, { id: `r-undo-${h.id}`, fileName: h.oldName, game: h.game, tag: h.tag, color: h.color, day: h.day || 1, part: h.part || 1, detectedExe: "" }]);
    } else {
      setPendingRenames((prev) => prev.filter((r) => r.id !== `r-undo-${h.id}`));
    }
    setRenameHistory((prev) => prev.map((x) => (x.id === h.id ? { ...x, undone: !x.undone } : x)));
  };

  const refresh = () => {
    if (isElectron) {
      setRefreshing(true);
      window.clipflow.stopWatching().then(() => {
        window.clipflow.startWatching(watchFolder);
        setTimeout(() => setRefreshing(false), 1200);
      });
    }
  };

  // Manage tab
  const folders = [...new Set(managedFiles.map((f) => f.folder))].sort().reverse();
  const folderFiles = managedFiles.filter((f) => f.folder === manageFolder).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const toggleMS = (id) => setManageSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAllM = () => setManageSelected((p) => p.size === folderFiles.length ? new Set() : new Set(folderFiles.map((f) => f.id)));

  const applyBatch = () => {
    if (!batchAction || manageSelected.size === 0) return;
    const sf = folderFiles.filter((f) => manageSelected.has(f.id)).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (batchAction === "part") {
      const sp = parseInt(batchValue); if (isNaN(sp)) return;
      setManagedFiles((prev) => { const u = [...prev]; sf.forEach((s, idx) => { const fi = u.findIndex((f) => f.id === s.id); if (fi !== -1) u[fi] = { ...u[fi], part: sp + idx, name: u[fi].name.replace(/Pt\d+/, `Pt${sp + idx}`) }; }); return u; });
    } else if (batchAction === "day") {
      const n = parseInt(batchValue); if (isNaN(n)) return;
      setManagedFiles((prev) => prev.map((f) => manageSelected.has(f.id) ? { ...f, day: n, name: f.name.replace(/Day\d+/, `Day${n}`) } : f));
    } else if (batchAction === "tag") {
      const g = gamesDb.find((x) => x.tag === batchValue || x.name === batchValue);
      if (g) setManagedFiles((prev) => prev.map((f) => manageSelected.has(f.id) ? { ...f, tag: g.tag, game: g.name, color: g.color, name: f.name.replace(/\s\w+\sDay/, ` ${g.tag} Day`) } : f));
    }
    setBatchAction(null); setBatchValue(""); setManageSelected(new Set());
  };

  // Computed stats — Day stat uses stored dayCount from gamesDb
  const mainGameObj = gamesDb.find((g) => g.name === mainGameName) || gamesDb[0];
  const totalRenamed = managedFiles.length + renameHistory.filter((h) => !h.undone).length;
  let mainDayCount = mainGameObj?.dayCount || 0;
  // Also check pending files (they may have a higher day if new date was detected)
  pendingRenames.forEach((p) => {
    if (p.tag === mainGameObj?.tag && p.day > mainDayCount) mainDayCount = p.day;
  });

  return (
    <div>
      <PageHeader title="Rename" subtitle="OBS recordings → structured names">
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={refresh} disabled={refreshing} style={{ padding: "8px 14px", borderRadius: T.radius.md, border: `1px solid ${refreshing ? T.greenBorder : T.border}`, background: refreshing ? T.greenDim : "rgba(255,255,255,0.03)", color: refreshing ? T.green : T.textSecondary, fontSize: 12, fontWeight: 700, cursor: refreshing ? "default" : "pointer", fontFamily: T.font, transition: "all 0.3s ease" }}>{refreshing ? "✓ Refreshed" : "🔄 Refresh"}</button>
          <button onClick={onAddGame} style={{ padding: "8px 14px", borderRadius: T.radius.md, border: `1px solid ${T.accentBorder}`, background: T.accentDim, color: T.accentLight, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>+ Add Game</button>
        </div>
      </PageHeader>

      {/* Watch status */}
      <Card style={{ padding: "16px 20px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PulseDot />
          <span style={{ color: T.green, fontSize: 13, fontWeight: 600 }}>WATCHING</span>
          <span style={{ color: T.textMuted, fontSize: 11, fontFamily: T.mono, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{watchFolder}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <PulseDot color={T.cyan} />
          <span style={{ color: T.cyan, fontSize: 12, fontWeight: 600 }}>OBS LOG</span>
        </div>
      </Card>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
        {[
          { l: "Total", v: String(totalRenamed), c: T.text },
          { l: "Today", v: String(pendingRenames.length), c: T.green },
          { l: "Games", v: String(gamesDb.length), c: T.accent },
          { l: "Day", v: String(mainDayCount), c: T.yellow },
        ].map((s) => (
          <Card key={s.l} style={{ padding: 14, textAlign: "center" }}>
            <div style={{ color: s.c, fontSize: 24, fontWeight: 800, fontFamily: T.mono }}>{s.v}</div>
            <div style={{ color: T.textTertiary, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 4 }}>{s.l}</div>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <TabBar tabs={[{ id: "pending", label: "Pending", count: pendingRenames.length }, { id: "history", label: "History", count: renameHistory.length }, { id: "manage", label: "Manage" }]} active={subTab} onChange={setSubTab} />

      {/* Content */}
      <div style={{ marginTop: 16 }}>
        {/* PENDING TAB */}
        {subTab === "pending" && (
          <>
            {pendingRenames.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pendingRenames.map((r) => (
                  <Card key={r.id} style={{ padding: "18px 20px" }} borderColor={`${r.color}44`}>
                    <div style={{ color: T.textTertiary, fontSize: 12, fontFamily: T.mono, marginBottom: 8 }}>{r.fileName}</div>
                    <div style={{ color: T.yellow, fontSize: 16, fontWeight: 700, fontFamily: T.mono, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: T.textMuted }}>→</span>{getProposed(r)}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Select value={r.game} onChange={(v) => updatePending(r.id, "game", v)}
                          options={gamesDb.map((g) => ({ value: g.name, label: g.name, tag: g.tag, color: g.color }))}
                          renderSelected={(o) => <><GamePill tag={o.tag || r.tag} color={o.color || r.color} size="sm" />{o.label}</>}
                          renderOption={(o) => <><GamePill tag={o.tag} color={o.color} size="sm" />{o.label}</>}
                          style={{ minWidth: 160 }} />
                      </div>
                      <MiniSpinbox label="Day" value={r.day} onChange={(v) => updatePending(r.id, "day", v)} />
                      <MiniSpinbox label="Pt" value={r.part} onChange={(v) => updatePending(r.id, "part", v)} />
                      <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                        <button onClick={() => renameOne(r.id)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: T.greenDim, color: T.green, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>RENAME</button>
                        <button onClick={() => hideOne(r.id)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: T.redDim, color: T.red, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>HIDE</button>
                      </div>
                    </div>
                  </Card>
                ))}
                <PrimaryButton onClick={renameAll} disabled={renaming}>{renaming ? "Renaming..." : `Rename All ${pendingRenames.length} Files`}</PrimaryButton>
              </div>
            ) : (
              <Card style={{ padding: "40px 20px", textAlign: "center" }}>
                {renameDone ? (<><div style={{ fontSize: 32, marginBottom: 8 }}>✅</div><div style={{ color: T.green, fontSize: 16, fontWeight: 700 }}>All files renamed!</div></>) : (<><div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>📁</div><div style={{ color: T.textTertiary, fontSize: 14 }}>No pending files — watching for new recordings...</div></>)}
              </Card>
            )}
          </>
        )}

        {/* HISTORY TAB */}
        {subTab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {renameHistory.length === 0 ? (
              <Card style={{ padding: 40, textAlign: "center" }}><div style={{ color: T.textTertiary }}>No rename history yet</div></Card>
            ) : renameHistory.map((h) => (
              <Card key={h.id} style={{ padding: "14px 18px", opacity: h.undone ? 0.45 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <GamePill tag={h.tag} color={h.color} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.textTertiary, fontSize: 12, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.oldName}</div>
                    <div style={{ color: h.undone ? T.red : T.green, fontSize: 14, fontWeight: 600, fontFamily: T.mono, marginTop: 2, textDecoration: h.undone ? "line-through" : "none" }}>{h.newName}</div>
                  </div>
                  <button onClick={() => toggleUndo(h)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${h.undone ? T.greenBorder : T.yellowBorder}`, background: h.undone ? T.greenDim : T.yellowDim, color: h.undone ? T.green : T.yellow, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>{h.undone ? "REDO" : "UNDO"}</button>
                  <span style={{ color: T.textMuted, fontSize: 11, fontFamily: T.mono, flexShrink: 0 }}>{h.time}</span>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* MANAGE TAB */}
        {subTab === "manage" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <SectionLabel>Subfolder</SectionLabel>
                <Select value={manageFolder} onChange={(v) => { setManageFolder(v); setManageSelected(new Set()); }} options={folders.map((f) => ({ value: f, label: f }))} style={{ padding: "8px 12px", fontSize: 13 }} />
              </div>
              <button onClick={selectAllM} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "rgba(255,255,255,0.03)", color: T.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>{manageSelected.size === folderFiles.length && folderFiles.length > 0 ? "NONE" : "ALL"}</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
              {folderFiles.map((f) => (
                <Card key={f.id} onClick={() => toggleMS(f.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: manageSelected.has(f.id) ? T.accentGlow : T.surface, borderColor: manageSelected.has(f.id) ? T.accentBorder : T.border }}>
                  <Checkbox checked={manageSelected.has(f.id)} />
                  <GamePill tag={f.tag} color={f.color} size="sm" />
                  <div style={{ flex: 1, color: T.text, fontSize: 14, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                  <span style={{ color: T.accent, fontSize: 12, fontFamily: T.mono }}>Day{f.day}</span>
                  <span style={{ color: T.green, fontSize: 12, fontFamily: T.mono }}>Pt{f.part}</span>
                </Card>
              ))}
            </div>

            {manageSelected.size > 0 && (
              <Card style={{ padding: "16px 20px" }}>
                <div style={{ color: T.textSecondary, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{manageSelected.size} file{manageSelected.size > 1 ? "s" : ""} selected</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["part", "day", "tag"].map((a) => (
                    <button key={a} onClick={() => { setBatchAction(a); setBatchValue(""); }} style={{ padding: "10px 18px", borderRadius: 8, border: batchAction === a ? `1px solid ${T.accentBorder}` : `1px solid ${T.border}`, background: batchAction === a ? T.accentDim : "rgba(255,255,255,0.03)", color: batchAction === a ? T.accentLight : T.textSecondary, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font, textTransform: "uppercase" }}>Change {a}</button>
                  ))}
                </div>
                {batchAction && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                    {batchAction === "tag" ? (
                      <Select value={batchValue} onChange={setBatchValue} options={[{ value: "", label: "Select game..." }, ...gamesDb.map((g) => ({ value: g.tag, label: `${g.tag} (${g.name})` }))]} style={{ flex: 1, padding: "10px 14px", fontSize: 13 }} />
                    ) : (
                      <input value={batchValue} onChange={(e) => setBatchValue(e.target.value.replace(/\D/g, ""))} placeholder={batchAction === "part" ? "Starting part #" : `New ${batchAction} #`} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: "10px 14px", color: T.text, fontSize: 14, fontFamily: T.mono, outline: "none" }} />
                    )}
                    <button onClick={applyBatch} disabled={!batchValue} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: batchValue ? T.accent : "rgba(255,255,255,0.04)", color: batchValue ? "#fff" : T.textMuted, fontSize: 13, fontWeight: 700, cursor: batchValue ? "pointer" : "default", fontFamily: T.font }}>Apply</button>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
