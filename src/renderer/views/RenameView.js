import React, { useState, useEffect, useRef, useCallback } from "react";
import T from "../styles/theme";
import { PulseDot, GamePill, Card, SectionLabel, InfoBanner, PageHeader, PrimaryButton, TabBar, Select, MiniSpinbox, Checkbox } from "../components/shared";

// ── Preset metadata (mirrored from naming-presets.js for UI rendering) ──
const PRESET_LIST = [
  { id: "tag-date-day-part", label: "Tag + Date + Day + Part", example: "AR 2026-03-15 Day30 Pt1" },
  { id: "tag-day-part", label: "Tag + Day + Part", example: "AR Day30 Pt1" },
  { id: "tag-date", label: "Tag + Date", example: "AR 2026-03-15" },
  { id: "tag-label", label: "Tag + Custom Label", example: "AR ranked-grind" },
  { id: "tag-date-label", label: "Tag + Date + Custom Label", example: "AR 2026-03-15 ranked-grind" },
  { id: "original-tag", label: "Tag + Original", example: "AR 2026-03-15 14-30-22" },
];

const PRESETS_USING_DAY = new Set(["tag-date-day-part", "tag-day-part"]);
const PRESETS_USING_LABEL = new Set(["tag-label", "tag-date-label"]);
const PRESETS_ALWAYS_PARTS = new Set(["tag-date-day-part", "tag-day-part"]);

export default function RenameView({ gamesDb, mainGameName, pendingRenames, setPendingRenames, renameHistory, setRenameHistory, onAddGame, onGameDayUpdate, watchFolder }) {
  const [subTab, setSubTab] = useState("pending");
  const [renaming, setRenaming] = useState(false);
  const [renameDone, setRenameDone] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [manageFolder, setManageFolder] = useState("2026-03");
  const [manageSelected, setManageSelected] = useState(new Set());
  const [batchAction, setBatchAction] = useState(null);
  const [batchValue, setBatchValue] = useState("");
  const [retroNotification, setRetroNotification] = useState(null);

  // Global default preset from Settings (loaded from electron-store)
  const [defaultPreset, setDefaultPreset] = useState("tag-date-day-part");

  // Label autocomplete state
  const [labelSuggestions, setLabelSuggestions] = useState([]);
  const [activeLabelFileId, setActiveLabelFileId] = useState(null);

  // History from SQLite
  const [dbHistory, setDbHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Manage from SQLite
  const [dbManagedFiles, setDbManagedFiles] = useState([]);

  const isElectron = typeof window !== "undefined" && window.clipflow;

  // Load default preset from electron-store on mount
  useEffect(() => {
    if (!isElectron) return;
    window.clipflow.storeGet("namingPreset").then((v) => {
      if (v) setDefaultPreset(v);
    });
  }, [isElectron]);

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
          preset: defaultPreset,
          customLabel: "",
          createdAt: file.createdAt,
        }];
      });
    });
    return () => { window.clipflow.removeFileListeners(); };
  }, [watchFolder, isElectron, gamesDb, defaultPreset]);

  // Load history from SQLite when History tab is opened
  useEffect(() => {
    if (subTab !== "history" || !isElectron) return;
    loadDbHistory();
  }, [subTab, isElectron]);

  const loadDbHistory = async () => {
    if (!isElectron) return;
    setHistoryLoading(true);
    try {
      const rows = await window.clipflow.renameHistoryRecent(100);
      setDbHistory(rows || []);
    } catch (e) { console.error("Failed to load rename history:", e); }
    setHistoryLoading(false);
  };

  // Load managed files from SQLite on mount + when Manage tab is opened
  useEffect(() => {
    if (!isElectron) return;
    loadDbManagedFiles();
  }, [isElectron]);

  useEffect(() => {
    if (subTab !== "manage" || !isElectron) return;
    loadDbManagedFiles();
  }, [subTab]);

  const loadDbManagedFiles = async () => {
    if (!isElectron) return;
    try {
      const rows = await window.clipflow.fileMetadataSearch({ type: "byStatus", status: "renamed" });
      setDbManagedFiles(rows || []);
    } catch (e) { console.error("Failed to load managed files:", e); }
  };

  // Recalculate pending PART numbers once dbManagedFiles loads from SQLite.
  const managedLoaded = useRef(false);
  useEffect(() => {
    if (dbManagedFiles.length === 0 || managedLoaded.current) return;
    managedLoaded.current = true;

    setPendingRenames((prev) => {
      if (prev.length === 0) return prev;
      const updated = [];
      for (const r of prev) {
        const fileDate = r.fileName.slice(0, 10);
        const existingParts = [
          ...dbManagedFiles.filter((f) => f.tag === r.tag && f.date === fileDate && f.day_number === r.day).map((f) => f.part_number).filter(Boolean),
          ...renameHistory.filter((h) => !h.undone && h.tag === r.tag && h.newName?.startsWith(fileDate)).map((h) => h.part),
          ...updated.filter((p) => p.tag === r.tag && p.fileName.slice(0, 10) === fileDate && p.day === r.day).map((p) => p.part),
        ];
        const part = existingParts.length > 0 ? Math.max(...existingParts) + 1 : 1;
        updated.push({ ...r, part });
      }
      return updated;
    });
  }, [dbManagedFiles]);

  // Recalculate pending DAY numbers when gamesDb changes
  const prevGamesRef = useRef(null);
  useEffect(() => {
    const isFirstMount = !prevGamesRef.current;
    if (!isFirstMount) {
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

  // ============ DAY DETECTION ============
  const detectGame = (fileName, games, currentPending) => {
    const game = games.find((g) => g.name === mainGameName) || games[0] || { name: "Unknown", tag: "??", color: "#888", dayCount: 0 };
    return detectForGame(game, fileName, currentPending);
  };

  const detectForGame = (game, fileName, currentPending) => {
    const fileDate = fileName.slice(0, 10);
    const baseDayCount = game.dayCount || 0;
    const baseLastDate = game.lastDayDate || null;

    const dateToDay = {};
    if (baseLastDate) dateToDay[baseLastDate] = baseDayCount;

    const allDates = new Set();
    if (baseLastDate) allDates.add(baseLastDate);
    (currentPending || []).forEach((p) => {
      if (p.tag === game.tag) allDates.add(p.fileName.slice(0, 10));
    });
    allDates.add(fileDate);

    let runningDay = baseDayCount;
    let runningLastDate = baseLastDate;
    for (const d of [...allDates].sort()) {
      if (dateToDay[d] !== undefined) continue;
      if (!runningLastDate || d > runningLastDate) {
        runningDay++;
        dateToDay[d] = runningDay;
        runningLastDate = d;
      } else {
        dateToDay[d] = baseDayCount;
      }
    }

    const day = dateToDay[fileDate] !== undefined ? dateToDay[fileDate] : baseDayCount + 1;

    const existingParts = [
      ...dbManagedFiles.filter((f) => f.tag === game.tag && f.date === fileDate && f.day_number === day).map((f) => f.part_number).filter(Boolean),
      ...renameHistory.filter((h) => !h.undone && h.tag === game.tag && h.newName?.startsWith(fileDate)).map((h) => h.part),
      ...(currentPending || []).filter((p) => p.tag === game.tag && p.fileName.slice(0, 10) === fileDate).map((p) => p.part),
    ];
    const part = existingParts.length > 0 ? Math.max(...existingParts) + 1 : 1;

    return { game: game.name, tag: game.tag, color: game.color, day, part };
  };

  // ============ LIVE FILENAME PREVIEW (preset-aware) ============
  const getProposed = (r) => {
    const preset = r.preset || defaultPreset;
    const parts = [r.tag];

    // Date (from OBS filename)
    const usesDate = ["tag-date-day-part", "tag-date", "tag-date-label"].includes(preset);
    if (usesDate) parts.push(r.fileName.slice(0, 10));

    // Original filename
    if (preset === "original-tag") {
      parts.push(r.fileName.replace(/\.[^.]+$/, ""));
    }

    // Day number
    if (PRESETS_USING_DAY.has(preset)) {
      parts.push(`Day${r.day}`);
    }

    // Custom label
    if (PRESETS_USING_LABEL.has(preset) && r.customLabel) {
      parts.push(r.customLabel);
    }

    // Part number
    if (PRESETS_ALWAYS_PARTS.has(preset)) {
      parts.push(`Pt${r.part}`);
    }
    // For conditional-part presets, parts are added via collision detection at rename time
    // Preview doesn't show parts unless they already exist (collision will add them)

    return parts.join(" ") + ".mp4";
  };

  // Smart update — when game changes, recompute day and part
  const updatePending = (id, field, value) => {
    setPendingRenames((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const u = { ...r, [field]: value };
      if (field === "game") {
        const g = gamesDb.find((x) => x.name === value);
        if (g) {
          u.tag = g.tag;
          u.color = g.color;
          const otherPending = prev.filter((p) => p.id !== id);
          const detected = detectForGame(g, r.fileName, otherPending);
          u.day = detected.day;
          u.part = detected.part;
        }
      }
      return u;
    }));
  };

  // ============ LABEL AUTOCOMPLETE ============
  const fetchLabelSuggestions = useCallback(async (tag, prefix) => {
    if (!isElectron) return;
    try {
      const suggestions = await window.clipflow.labelSuggest(tag, prefix || "");
      setLabelSuggestions(suggestions || []);
    } catch (e) { setLabelSuggestions([]); }
  }, [isElectron]);

  const updateLabel = (id, value) => {
    setPendingRenames((prev) => prev.map((r) => r.id === id ? { ...r, customLabel: value } : r));
    const r = pendingRenames.find((x) => x.id === id);
    if (r) {
      setActiveLabelFileId(id);
      fetchLabelSuggestions(r.tag, value);
    }
  };

  const selectLabelSuggestion = (id, label) => {
    setPendingRenames((prev) => prev.map((r) => r.id === id ? { ...r, customLabel: label } : r));
    setLabelSuggestions([]);
    setActiveLabelFileId(null);
  };

  // ============ RENAME HANDLERS (DB-backed) ============
  const renameOne = async (id) => {
    const r = pendingRenames.find((x) => x.id === id);
    if (!r) return;

    const preset = r.preset || defaultPreset;
    const fileDate = r.fileName.slice(0, 10);

    // Validate label if preset uses labels
    if (PRESETS_USING_LABEL.has(preset)) {
      if (!r.customLabel || r.customLabel.trim().length === 0) {
        console.error("Label is required for this preset"); return;
      }
      if (isElectron) {
        const validation = await window.clipflow.presetValidateLabel(r.customLabel);
        if (!validation.valid) { console.error("Invalid label:", validation.error); return; }
      }
    }

    // Build metadata for the preset engine
    const meta = {
      tag: r.tag,
      date: fileDate,
      dayNumber: r.day,
      partNumber: PRESETS_ALWAYS_PARTS.has(preset) ? r.part : null,
      customLabel: r.customLabel || null,
      originalFilename: r.fileName,
    };

    let newName;
    let collisionResult = null;
    let retroHistoryId = null;

    if (isElectron) {
      // Check for collisions on conditional-part presets
      if (!PRESETS_ALWAYS_PARTS.has(preset)) {
        const collisions = await window.clipflow.presetFindCollisions(meta, preset);
        if (collisions && collisions.length > 0) {
          // Collision detected — trigger retroactive Pt1 on existing file(s)
          for (const existing of collisions) {
            const retroResult = await window.clipflow.presetRetroactiveRename(existing, null);
            if (retroResult.historyId) retroHistoryId = retroResult.historyId;
          }
          // Get next part number (will be Pt2+ since Pt1 was assigned retroactively)
          const nextPart = await window.clipflow.presetGetNextPartNumber(meta, preset);
          meta.partNumber = nextPart.partNumber;

          // Show notification
          const collisionMsg = getRetroNotificationMessage(preset, r.tag, r.customLabel);
          setRetroNotification(collisionMsg);
          setTimeout(() => setRetroNotification(null), 6000);
        }
      }

      // Format filename via preset engine
      const result = await window.clipflow.presetFormatFilename(meta, preset);
      if (result.error) { console.error("Format failed:", result.error); return; }
      newName = result.filename;
    } else {
      newName = getProposed(r);
    }

    // Perform filesystem rename
    if (isElectron && r.filePath) {
      const dir = r.filePath.substring(0, r.filePath.lastIndexOf("\\"));
      const monthFolder = r.fileName.slice(0, 7);
      const targetDir = `${dir}\\${monthFolder}`;
      const newPath = `${targetDir}\\${newName}`;
      const result = await window.clipflow.renameFile(r.filePath, newPath);
      if (result.error) { console.error("Rename failed:", result.error); return; }

      // Get file size for metadata
      let fileSizeBytes = null;
      try {
        // File size populated by main process during metadata:create if available
      } catch (e) {}

      // Create file_metadata record in SQLite
      const game = gamesDb.find((g) => g.tag === r.tag);
      const metadataResult = await window.clipflow.fileMetadataCreate({
        originalFilename: r.fileName,
        currentFilename: newName,
        originalPath: r.filePath,
        currentPath: newPath,
        tag: r.tag,
        entryType: game?.entryType || "game",
        date: fileDate,
        dayNumber: PRESETS_USING_DAY.has(preset) ? r.day : null,
        partNumber: meta.partNumber,
        customLabel: r.customLabel || null,
        namingPreset: preset,
        fileSizeBytes,
        status: "renamed",
      });

      // Log to rename_history
      if (metadataResult?.id) {
        // Record label usage if applicable
        if (PRESETS_USING_LABEL.has(preset) && r.customLabel) {
          await window.clipflow.labelRecord(r.tag, r.customLabel);
        }
      }
    }

    // Add to local renameHistory (for backward compat with electron-store persistence)
    setRenameHistory((prev) => [{
      id: `h-${Date.now()}`, oldName: r.fileName, newName, game: r.game,
      tag: r.tag, color: r.color, day: r.day, part: meta.partNumber || r.part,
      time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      undone: false,
    }, ...prev]);

    setPendingRenames((prev) => prev.filter((x) => x.id !== id));

    // Persist the game's dayCount and lastDayDate
    if (onGameDayUpdate) {
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

    const corrected = [];
    for (const r of sorted) {
      const preset = r.preset || defaultPreset;
      const fileDate = r.fileName.slice(0, 10);

      // Skip files with missing required labels
      if (PRESETS_USING_LABEL.has(preset) && (!r.customLabel || r.customLabel.trim().length === 0)) {
        continue;
      }

      const meta = {
        tag: r.tag,
        date: fileDate,
        dayNumber: r.day,
        partNumber: PRESETS_ALWAYS_PARTS.has(preset) ? r.part : null,
        customLabel: r.customLabel || null,
        originalFilename: r.fileName,
      };

      let newName;

      if (isElectron) {
        // Check collisions for conditional-part presets
        if (!PRESETS_ALWAYS_PARTS.has(preset)) {
          const collisions = await window.clipflow.presetFindCollisions(meta, preset);
          if (collisions && collisions.length > 0) {
            for (const existing of collisions) {
              await window.clipflow.presetRetroactiveRename(existing, null);
            }
            const nextPart = await window.clipflow.presetGetNextPartNumber(meta, preset);
            meta.partNumber = nextPart.partNumber;
          }
        }

        const result = await window.clipflow.presetFormatFilename(meta, preset);
        if (result.error) { console.error("Format failed for", r.fileName, result.error); continue; }
        newName = result.filename;
      } else {
        newName = getProposed(r);
      }

      if (isElectron && r.filePath) {
        const dir = r.filePath.substring(0, r.filePath.lastIndexOf("\\"));
        const monthFolder = r.fileName.slice(0, 7);
        const newPath = `${dir}\\${monthFolder}\\${newName}`;
        await window.clipflow.renameFile(r.filePath, newPath);

        const game = gamesDb.find((g) => g.tag === r.tag);
        await window.clipflow.fileMetadataCreate({
          originalFilename: r.fileName,
          currentFilename: newName,
          originalPath: r.filePath,
          currentPath: newPath,
          tag: r.tag,
          entryType: game?.entryType || "game",
          date: fileDate,
          dayNumber: PRESETS_USING_DAY.has(preset) ? r.day : null,
          partNumber: meta.partNumber,
          customLabel: r.customLabel || null,
          namingPreset: preset,
          status: "renamed",
        });

        if (PRESETS_USING_LABEL.has(preset) && r.customLabel) {
          await window.clipflow.labelRecord(r.tag, r.customLabel);
        }
      }

      corrected.push({
        id: `h-${Date.now()}-${r.id}`, oldName: r.fileName, newName,
        game: r.game, tag: r.tag, color: r.color, day: r.day,
        part: meta.partNumber || r.part,
        time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        undone: false,
      });
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

  // ============ UNDO (hybrid: local + SQLite) ============
  const toggleUndo = (h) => {
    if (!h.undone) {
      setPendingRenames((prev) => [...prev, {
        id: `r-undo-${h.id}`, fileName: h.oldName, game: h.game, tag: h.tag,
        color: h.color, day: h.day || 1, part: h.part || 1,
        preset: defaultPreset, customLabel: "", detectedExe: "",
      }]);
    } else {
      setPendingRenames((prev) => prev.filter((r) => r.id !== `r-undo-${h.id}`));
    }
    setRenameHistory((prev) => prev.map((x) => (x.id === h.id ? { ...x, undone: !x.undone } : x)));
  };

  // SQLite history undo
  const undoDbHistory = async (historyId) => {
    if (!isElectron) return;
    const result = await window.clipflow.renameHistoryUndo(historyId);
    if (result.success) {
      loadDbHistory(); // Refresh
    } else {
      console.error("Undo failed:", result.error);
    }
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

  // ============ RETROACTIVE NOTIFICATION MESSAGES ============
  const getRetroNotificationMessage = (preset, tag, label) => {
    if (preset === "tag-label") {
      return `You already have a file named ${tag} ${label || ""}. Your earlier file has been updated to Pt1.`;
    }
    return `This is your second ${tag} session today. Your earlier file has been updated to Pt1.`;
  };

  // ============ GROUPED DROPDOWN OPTIONS ============
  const getGroupedGameOptions = () => {
    const games = gamesDb.filter((g) => !g.entryType || g.entryType === "game");
    const contentTypes = gamesDb.filter((g) => g.entryType === "content");

    const options = [];

    // Games header
    if (games.length > 0) {
      options.push({ value: "__header_games__", label: "Games", isHeader: true });
      games.forEach((g) => options.push({ value: g.name, label: g.name, tag: g.tag, color: g.color }));
    }

    // Content Types header
    if (contentTypes.length > 0) {
      options.push({ value: "__header_content__", label: "Content Types", isHeader: true });
      contentTypes.forEach((g) => options.push({ value: g.name, label: g.name, tag: g.tag, color: g.color }));
    }

    // If no entryType set yet (pre-migration), show all as flat list
    if (games.length === 0 && contentTypes.length === 0) {
      gamesDb.forEach((g) => options.push({ value: g.name, label: g.name, tag: g.tag, color: g.color }));
    }

    return options;
  };

  // Manage tab — group by month from date column
  const folders = [...new Set(dbManagedFiles.map((f) => f.date ? f.date.slice(0, 7) : "unknown"))].sort().reverse();
  const folderFiles = dbManagedFiles.filter((f) => (f.date ? f.date.slice(0, 7) : "unknown") === manageFolder).sort((a, b) => (a.renamed_at || "").localeCompare(b.renamed_at || ""));
  const toggleMS = (id) => setManageSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAllM = () => setManageSelected((p) => p.size === folderFiles.length ? new Set() : new Set(folderFiles.map((f) => f.id)));

  const applyBatch = async () => {
    if (!batchAction || manageSelected.size === 0) return;
    const sf = folderFiles.filter((f) => manageSelected.has(f.id)).sort((a, b) => (a.renamed_at || "").localeCompare(b.renamed_at || ""));
    if (batchAction === "part") {
      const sp = parseInt(batchValue); if (isNaN(sp)) return;
      for (let idx = 0; idx < sf.length; idx++) {
        await window.clipflow.fileMetadataUpdate(sf[idx].id, { part_number: sp + idx });
      }
    } else if (batchAction === "day") {
      const n = parseInt(batchValue); if (isNaN(n)) return;
      for (const f of sf) {
        await window.clipflow.fileMetadataUpdate(f.id, { day_number: n });
      }
    } else if (batchAction === "tag") {
      const g = gamesDb.find((x) => x.tag === batchValue || x.name === batchValue);
      if (g) {
        for (const f of sf) {
          await window.clipflow.fileMetadataUpdate(f.id, { tag: g.tag, entry_type: g.entryType || "game" });
        }
      }
    }
    setBatchAction(null); setBatchValue(""); setManageSelected(new Set());
    loadDbManagedFiles(); // Refresh from SQLite
  };

  // Computed stats
  const mainGameObj = gamesDb.find((g) => g.name === mainGameName) || gamesDb[0];
  const totalRenamed = dbManagedFiles.length + renameHistory.filter((h) => !h.undone).length;
  let mainDayCount = mainGameObj?.dayCount || 0;
  pendingRenames.forEach((p) => {
    if (p.tag === mainGameObj?.tag && p.day > mainDayCount) mainDayCount = p.day;
  });

  const gameOptions = getGroupedGameOptions();

  return (
    <div>
      <PageHeader title="Rename" subtitle="Recordings → structured names">
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={refresh} disabled={refreshing} style={{ padding: "8px 14px", borderRadius: T.radius.md, border: `1px solid ${refreshing ? T.greenBorder : T.border}`, background: refreshing ? T.greenDim : "rgba(255,255,255,0.03)", color: refreshing ? T.green : T.textSecondary, fontSize: 12, fontWeight: 700, cursor: refreshing ? "default" : "pointer", fontFamily: T.font, transition: "all 0.3s ease" }}>{refreshing ? "✓ Refreshed" : "🔄 Refresh"}</button>
          <button onClick={onAddGame} style={{ padding: "8px 14px", borderRadius: T.radius.md, border: `1px solid ${T.accentBorder}`, background: T.accentDim, color: T.accentLight, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>+ Add Game</button>
        </div>
      </PageHeader>

      {/* Watch status */}
      <Card style={{ padding: "16px 20px", marginBottom: 16, display: "flex", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PulseDot />
          <span style={{ color: T.green, fontSize: 13, fontWeight: 600 }}>WATCHING</span>
          <span style={{ color: T.textMuted, fontSize: 11, fontFamily: T.mono, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{watchFolder}</span>
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

      {/* Retroactive part notification */}
      {retroNotification && (
        <div style={{ margin: "12px 0", padding: "12px 16px", borderRadius: T.radius.md, background: T.yellowDim, border: `1px solid ${T.yellowBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <span style={{ color: T.yellow, fontSize: 13, fontWeight: 600 }}>{retroNotification}</span>
          <button onClick={() => setRetroNotification(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: T.textMuted, fontSize: 16, cursor: "pointer", padding: "2px 6px" }}>×</button>
        </div>
      )}

      {/* Content */}
      <div style={{ marginTop: 16 }}>
        {/* PENDING TAB */}
        {subTab === "pending" && (
          <>
            {pendingRenames.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pendingRenames.map((r) => {
                  const preset = r.preset || defaultPreset;
                  const showDay = PRESETS_USING_DAY.has(preset);
                  const showLabel = PRESETS_USING_LABEL.has(preset);
                  const showPart = PRESETS_ALWAYS_PARTS.has(preset);

                  return (
                    <Card key={r.id} style={{ padding: "18px 20px" }} borderColor={`${r.color}44`}>
                      {/* Original filename */}
                      <div style={{ color: T.textTertiary, fontSize: 12, fontFamily: T.mono, marginBottom: 8 }}>{r.fileName}</div>

                      {/* Live filename preview */}
                      <div style={{ color: T.yellow, fontSize: 16, fontWeight: 700, fontFamily: T.mono, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: T.textMuted }}>→</span>{getProposed(r)}
                      </div>

                      {/* Controls row */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        {/* Game dropdown (grouped) */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <GroupedSelect
                            value={r.game}
                            onChange={(v) => updatePending(r.id, "game", v)}
                            options={gameOptions}
                            renderSelected={(o) => <><GamePill tag={o.tag || r.tag} color={o.color || r.color} size="sm" />{o.label}</>}
                            renderOption={(o) => <><GamePill tag={o.tag} color={o.color} size="sm" />{o.label}</>}
                            style={{ minWidth: 160 }}
                          />
                        </div>

                        {/* Preset selector */}
                        <Select
                          value={preset}
                          onChange={(v) => updatePending(r.id, "preset", v)}
                          options={PRESET_LIST.map((p) => ({ value: p.id, label: p.label }))}
                          style={{ minWidth: 140, fontSize: 11 }}
                        />

                        {/* Day spinbox (presets 1-2) */}
                        {showDay && <MiniSpinbox label="Day" value={r.day} onChange={(v) => updatePending(r.id, "day", v)} />}

                        {/* Part spinbox (presets 1-2) */}
                        {showPart && <MiniSpinbox label="Pt" value={r.part} onChange={(v) => updatePending(r.id, "part", v)} />}

                        {/* Custom label input (presets 4-5) */}
                        {showLabel && (
                          <div style={{ position: "relative", flex: "1 1 160px", minWidth: 140 }}>
                            <input
                              value={r.customLabel || ""}
                              onChange={(e) => updateLabel(r.id, e.target.value)}
                              onFocus={() => { setActiveLabelFileId(r.id); fetchLabelSuggestions(r.tag, r.customLabel || ""); }}
                              onBlur={() => setTimeout(() => setActiveLabelFileId(null), 200)}
                              placeholder="custom-label"
                              style={{
                                width: "100%", background: "rgba(255,255,255,0.04)",
                                border: `1px solid ${r.customLabel && /[\\/:*?"<>|]/.test(r.customLabel) ? T.red : T.border}`,
                                borderRadius: T.radius.md, padding: "8px 12px",
                                color: T.text, fontSize: 13, fontFamily: T.mono, outline: "none",
                              }}
                            />
                            {r.customLabel && /[\\/:*?"<>|]/.test(r.customLabel) && (
                              <div style={{ color: T.red, fontSize: 11, marginTop: 4 }}>Labels can't contain special characters</div>
                            )}
                            {/* Autocomplete dropdown */}
                            {activeLabelFileId === r.id && labelSuggestions.length > 0 && (
                              <div style={{
                                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                                background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md,
                                boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 999, padding: 4,
                                maxHeight: 180, overflowY: "auto",
                              }}>
                                {labelSuggestions.map((s) => (
                                  <div
                                    key={s.label}
                                    onMouseDown={() => selectLabelSuggestion(r.id, s.label)}
                                    style={{
                                      padding: "8px 12px", borderRadius: 6, cursor: "pointer",
                                      color: T.text, fontSize: 13, fontFamily: T.mono,
                                      display: "flex", justifyContent: "space-between", alignItems: "center",
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                                  >
                                    <span>{s.label}</span>
                                    <span style={{ color: T.textMuted, fontSize: 11 }}>×{s.use_count}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Action buttons */}
                        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                          <button onClick={() => renameOne(r.id)} disabled={showLabel && (!r.customLabel || /[\\/:*?"<>|]/.test(r.customLabel))} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: T.greenDim, color: T.green, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font, opacity: showLabel && (!r.customLabel || /[\\/:*?"<>|]/.test(r.customLabel)) ? 0.4 : 1 }}>RENAME</button>
                          <button onClick={() => hideOne(r.id)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: T.redDim, color: T.red, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>HIDE</button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
                <PrimaryButton onClick={renameAll} disabled={renaming}>{renaming ? "Renaming..." : `Rename All ${pendingRenames.length} Files`}</PrimaryButton>
              </div>
            ) : (
              <Card style={{ padding: "40px 20px", textAlign: "center" }}>
                {renameDone ? (<><div style={{ fontSize: 32, marginBottom: 8 }}>✅</div><div style={{ color: T.green, fontSize: 16, fontWeight: 700 }}>All files renamed!</div></>) : (<><div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>📁</div><div style={{ color: T.textTertiary, fontSize: 14 }}>No pending files — watching for new recordings...</div></>)}
              </Card>
            )}
          </>
        )}

        {/* HISTORY TAB — reads from both local state (current session) and SQLite (past sessions) */}
        {subTab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Current session history (from local state) */}
            {renameHistory.length === 0 && dbHistory.length === 0 ? (
              <Card style={{ padding: 40, textAlign: "center" }}><div style={{ color: T.textTertiary }}>No rename history yet</div></Card>
            ) : (
              <>
                {/* Local history entries (current session) */}
                {renameHistory.map((h) => (
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

                {/* SQLite history entries (past sessions) */}
                {dbHistory.length > 0 && renameHistory.length > 0 && (
                  <div style={{ color: T.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", padding: "12px 0 4px", borderTop: `1px solid ${T.border}`, marginTop: 4 }}>Previous Sessions</div>
                )}
                {dbHistory.map((h) => {
                  const game = gamesDb.find((g) => g.tag === h.tag) || gamesDb.find((g) => {
                    // Try to match by looking at filenames
                    return h.new_filename?.includes(g.tag);
                  });
                  return (
                    <Card key={h.id} style={{ padding: "14px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {game && <GamePill tag={game.tag} color={game.color} size="sm" />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: T.textTertiary, fontSize: 12, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.previous_filename}</div>
                          <div style={{ color: T.green, fontSize: 14, fontWeight: 600, fontFamily: T.mono, marginTop: 2 }}>{h.new_filename}</div>
                        </div>
                        {h.action === "retroactive_part" && (
                          <span style={{ padding: "3px 8px", borderRadius: 6, background: T.yellowDim, color: T.yellow, fontSize: 10, fontWeight: 700 }}>RETRO</span>
                        )}
                        <button onClick={() => undoDbHistory(h.id)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${T.yellowBorder}`, background: T.yellowDim, color: T.yellow, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>UNDO</button>
                        <span style={{ color: T.textMuted, fontSize: 11, fontFamily: T.mono, flexShrink: 0 }}>{h.created_at ? new Date(h.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}</span>
                      </div>
                    </Card>
                  );
                })}
              </>
            )}
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
              {folderFiles.map((f) => {
                const game = gamesDb.find((g) => g.tag === f.tag);
                return (
                  <Card key={f.id} onClick={() => toggleMS(f.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: manageSelected.has(f.id) ? T.accentGlow : T.surface, borderColor: manageSelected.has(f.id) ? T.accentBorder : T.border }}>
                    <Checkbox checked={manageSelected.has(f.id)} />
                    <GamePill tag={f.tag} color={game?.color || "#888"} size="sm" />
                    <div style={{ flex: 1, color: T.text, fontSize: 14, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.current_filename}</div>
                    {f.day_number != null && <span style={{ color: T.accent, fontSize: 12, fontFamily: T.mono }}>Day{f.day_number}</span>}
                    {f.part_number != null && <span style={{ color: T.green, fontSize: 12, fontFamily: T.mono }}>Pt{f.part_number}</span>}
                  </Card>
                );
              })}
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

// ── GroupedSelect: Select with section headers ──
function GroupedSelect({ value, onChange, options, style: x, renderOption, renderSelected }) {
  const [open, setOpen] = useState(false);
  const [hovIdx, setHovIdx] = useState(-1);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.value === value && !o.isHeader);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", ...x }}>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: T.surface, border: `1px solid ${open ? T.accentBorder : T.border}`, borderRadius: T.radius.md, padding: "8px 12px", color: T.text, fontSize: 13, fontFamily: T.font, cursor: "pointer", outline: "none", textAlign: "left" }}>
        <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
          {renderSelected && selected ? renderSelected(selected) : (selected?.label || value)}
        </span>
        <span style={{ color: T.textMuted, fontSize: 10, transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "none" }}>{"\u25BC"}</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, minWidth: "100%", maxHeight: 300, overflowY: "auto", overflowX: "hidden", background: T.surface, border: `1px solid ${T.borderHover || T.border}`, borderRadius: T.radius.md, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 999, padding: 4 }}>
          {options.map((o, i) => {
            if (o.isHeader) {
              return (
                <div key={o.value} style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", borderTop: i > 0 ? `1px solid ${T.border}` : "none", marginTop: i > 0 ? 4 : 0 }}>
                  {o.label}
                </div>
              );
            }
            return (
              <div key={o.value} onMouseEnter={() => setHovIdx(i)} onMouseLeave={() => setHovIdx(-1)} onClick={() => { onChange(o.value); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, cursor: "pointer", background: o.value === value ? "rgba(139,92,246,0.12)" : hovIdx === i ? "rgba(255,255,255,0.06)" : "transparent", color: o.value === value ? T.accentLight : T.text, fontSize: 13, fontFamily: T.font, fontWeight: o.value === value ? 600 : 400, transition: "background 0.1s" }}>
                {renderOption ? renderOption(o) : o.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
