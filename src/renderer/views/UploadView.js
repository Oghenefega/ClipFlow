import React, { useState, useEffect, useCallback } from "react";
import posthog from "posthog-js";
import T from "../styles/theme";
import { Card, GamePill, PageHeader, SectionLabel, Badge, Checkbox, Select, formatDuration } from "../components/shared";
import { ProfileDiffModal } from "../components/modals";
import TestChip from "../components/TestChip";

function formatSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function monthLabel(monthKey) {
  if (monthKey === "test") return "Test";
  if (monthKey === "unknown") return "Other";
  const parts = monthKey.split("-");
  if (parts.length !== 2) return monthKey;
  const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function shortName(row) {
  // Build a display name from metadata fields, stripping the tag prefix
  const name = row.current_filename || "";
  // Remove extension and date prefix for compact display
  const noExt = name.replace(/\.(mp4|mkv)$/i, "");
  const m = noExt.match(/^\d{4}-\d{2}-\d{2}\s+(.+)$/);
  return m ? m[1] : noExt;
}

function findGameByTag(tag, gamesDb) {
  return gamesDb.find((g) => g.tag === tag) || null;
}

function findProjectForFile(row, localProjects) {
  const baseName = (row.current_filename || "").replace(/\.(mp4|mkv)$/i, "");
  return localProjects.find((p) => p.name === baseName) || null;
}

// AI pipeline stages in order
const PIPELINE_STEPS = [
  { key: "probing", label: "Analyzing File", icon: "\uD83D\uDD0D" },
  { key: "creating", label: "Creating Project", icon: "\uD83D\uDCC1" },
  { key: "extracting", label: "Extracting Audio", icon: "\uD83C\uDFA7" },
  { key: "transcribing", label: "Transcription (stable-ts)", icon: "\uD83D\uDCDD" },
  { key: "energy", label: "Audio Energy Analysis", icon: "\u26A1" },
  { key: "signals", label: "Signal Extraction", icon: "\uD83C\uDFAF" },
  { key: "frames", label: "Frame Extraction", icon: "\uD83D\uDDBC\uFE0F" },
  { key: "claude", label: "Claude Analysis", icon: "\uD83E\uDDE0" },
  { key: "cutting", label: "Cutting Clips", icon: "\u2702\uFE0F" },
  { key: "saving", label: "Creating Project", icon: "\uD83D\uDCBE" },
];

const STAGE_LABELS = {
  probing: "Analyzing file",
  creating: "Creating project",
  extracting: "Extracting audio",
  transcribing: "Transcribing",
  energy: "Analyzing energy",
  signals: "Extracting signals",
  frames: "Extracting frames",
  claude: "Claude analyzing",
  cutting: "Cutting clips",
  saving: "Saving project",
  complete: "Complete",
  failed: "Failed",
};

const SIGNAL_ROWS = [
  { key: "transcript_density", label: "Transcript density" },
  { key: "reaction_words", label: "Reaction words" },
  { key: "silence_spike", label: "Silence-then-spike" },
  { key: "yamnet", label: "YAMNet (audio events)" },
  { key: "pitch_spike", label: "Pitch spike" },
];

function signalStatusVisuals(status) {
  if (status === "done") return { icon: "✅", color: T.green };
  if (status === "running") return { icon: "⚡", color: T.yellow };
  if (status === "failed") return { icon: "❌", color: T.red };
  return { icon: "⬜", color: T.textTertiary };
}

const PILL_MIN = 200;

export default function RecordingsView({ gamesDb = [], localProjects = [], onProjectCreated, testWatchFolder = "" }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState({});
  const [generating, setGenerating] = useState(null);
  const [progress, setProgress] = useState(null);
  // Per-signal health for the signal-health table during the "signals" stage.
  // Map of signalKey → { status, progress, elapsed_ms, failureReason? }.
  const [signalHealth, setSignalHealth] = useState({});
  const [selected, setSelected] = useState({});
  const [doneFiles, setDoneFiles] = useState({});
  const [profileDiff, setProfileDiff] = useState(null);

  // #60: transient error surface for failed test-mode moves (locked file, etc.)
  const [moveError, setMoveError] = useState(null);
  // #60: Recordings filter — "all" | "main" | "test"
  const [testFilter, setTestFilter] = useState("all");

  // Drag-and-drop + quick-import state
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(null); // { filename, pct }
  const [quickImport, setQuickImport] = useState(null); // { filename, sourcePath, sizeBytes, watchFolder, durationSeconds, splitCount, isTest }
  const [quickImportGame, setQuickImportGame] = useState("");
  const [quickImportStep, setQuickImportStep] = useState(1); // 1=pick game, 2=split proposal, 3=confirm
  const [quickImportSplitSkip, setQuickImportSplitSkip] = useState(false);
  const [splitThreshold, setSplitThreshold] = useState(30);
  const [autoSplitEnabled, setAutoSplitEnabled] = useState(true);

  // Load split settings
  useEffect(() => {
    (async () => {
      if (!window.clipflow?.storeGet) return;
      const [threshold, enabled] = await Promise.all([
        window.clipflow.storeGet("splitThresholdMinutes"),
        window.clipflow.storeGet("autoSplitEnabled"),
      ]);
      if (threshold != null) setSplitThreshold(threshold);
      if (enabled != null) setAutoSplitEnabled(enabled);
    })();
  }, []);

  // Load done files + collapsed state from store (re-read when projects change,
  // e.g. after project deletion clears a doneRecordings entry in main process)
  const projectCount = localProjects.length;
  useEffect(() => {
    (async () => {
      if (window.clipflow?.storeGet) {
        const saved = await window.clipflow.storeGet("doneRecordings");
        if (saved && typeof saved === "object") setDoneFiles(saved);
        const savedCollapsed = await window.clipflow.storeGet("recordingsCollapsed");
        if (savedCollapsed && typeof savedCollapsed === "object") setCollapsed(savedCollapsed);
      }
    })();
  }, [projectCount]);

  // Persist done files to store
  const persistDone = useCallback(async (next) => {
    setDoneFiles(next);
    if (window.clipflow?.storeSet) {
      await window.clipflow.storeSet("doneRecordings", next);
    }
  }, []);

  // Toggle per-recording test mode — physically moves the file between the
  // main watch folder and test watch folder so disk layout always matches the
  // TEST flag. Optimistic UI update, but revert + toast on lock / failure.
  const handleToggleRecordingTest = useCallback(async (fileId, next) => {
    setFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, is_test: next ? 1 : 0 } : f));
    try {
      const moveResult = await window.clipflow?.fileMoveToTestMode?.(fileId, next);
      if (!moveResult || moveResult.error) {
        throw new Error(moveResult?.error || "Move failed");
      }
      // file:moveToTestMode already updated current_path + is_test in SQLite
      // and cascaded to the project's sourceFile + testMode. Sync the row in
      // local state so the card reflects the new disk path.
      setFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, current_path: moveResult.newPath, is_test: next ? 1 : 0 } : f));
      const file = files.find((f) => f.id === fileId);
      if (file) {
        const baseName = (file.current_filename || "").replace(/\.(mp4|mkv)$/i, "");
        const project = localProjects.find((p) => p.name === baseName);
        if (project) onProjectCreated?.(project.id); // refresh project list
      }
    } catch (e) {
      console.error("[RecordingsView] testMode toggle failed:", e.message);
      setFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, is_test: next ? 0 : 1 } : f));
      setMoveError(e.message || "Could not move file");
      setTimeout(() => setMoveError(null), 5000);
    }
  }, [files, localProjects, onProjectCreated]);

  // Load files from SQLite file_metadata table
  useEffect(() => {
    async function loadFiles() {
      if (!window.clipflow?.fileMetadataSearch) { setLoading(false); return; }
      setLoading(true);
      try {
        const rows = await window.clipflow.fileMetadataSearch({ type: "allRenamed" });
        if (Array.isArray(rows)) {
          // Sort ascending by date then renamed_at (oldest first)
          rows.sort((a, b) => {
            const dateComp = (a.date || "").localeCompare(b.date || "");
            if (dateComp !== 0) return dateComp;
            return (a.renamed_at || "").localeCompare(b.renamed_at || "");
          });
          setFiles(rows);
        }
      } catch (e) {
        console.error("Failed to load file metadata:", e);
      }
      setLoading(false);
    }
    loadFiles();
  }, []);

  // Pipeline progress events
  useEffect(() => {
    if (!window.clipflow?.onPipelineProgress) return;
    window.clipflow.onPipelineProgress((data) => setProgress(data));
    return () => { window.clipflow?.removePipelineProgressListener?.(); };
  }, []);

  // Per-signal progress events (Issue #72 Phase 1)
  useEffect(() => {
    if (!window.clipflow?.onSignalProgress) return;
    window.clipflow.onSignalProgress((data) => {
      if (!data || !data.signal) return;
      setSignalHealth((prev) => ({
        ...prev,
        [data.signal]: {
          status: data.status,
          progress: data.progress,
          elapsed_ms: data.elapsed_ms,
          failureReason: data.failureReason,
        },
      }));
    });
    return () => { window.clipflow?.removeSignalProgressListener?.(); };
  }, []);

  const handleGenerate = useCallback(async (file) => {
    if (generating) return;
    const game = findGameByTag(file.tag, gamesDb);
    setGenerating(file.current_path);
    setProgress({ stage: "probing", pct: 0, detail: "Starting..." });
    setSignalHealth({});
    posthog.capture("clipflow_pipeline_started");
    try {
      const result = await window.clipflow.generateClips(file.current_path, {
        name: (file.current_filename || "").replace(/\.(mp4|mkv)$/i, ""),
        game: game?.name || file.tag,
        gameTag: file.tag,
        gameColor: game?.color || "#888",
        fileMetadataId: file.id,
        isTest: file.is_test === 1,
        keywords: [],
      });
      if (result.error) {
        setProgress({ stage: "failed", pct: 0, detail: result.error });
        posthog.capture("clipflow_pipeline_failed");
        setTimeout(() => { setGenerating(null); setProgress(null); setSignalHealth({}); }, 5000);
      } else {
        setProgress({ stage: "complete", pct: 100, detail: `${result.clipCount} clips generated` });
        posthog.capture("clipflow_pipeline_completed", { clip_count: result.clipCount });
        onProjectCreated?.(result.projectId);
        // Refresh file list to pick up status changes
        try {
          const rows = await window.clipflow.fileMetadataSearch({ type: "allRenamed" });
          if (Array.isArray(rows)) {
            rows.sort((a, b) => {
              const dateComp = (a.date || "").localeCompare(b.date || "");
              if (dateComp !== 0) return dateComp;
              return (a.renamed_at || "").localeCompare(b.renamed_at || "");
            });
            setFiles(rows);
          }
        } catch (_) {}
        setTimeout(() => { setGenerating(null); setProgress(null); setSignalHealth({}); }, 3000);

        // Check if play style profile update is needed
        if (result.profileUpdateNeeded && result.gameTag) {
          try {
            const updateResult = await window.clipflow.gameProfilesGenerateUpdate(result.gameTag);
            if (updateResult.success) {
              setProfileDiff({
                gameTag: result.gameTag,
                gameName: updateResult.gameName,
                oldProfile: updateResult.oldProfile,
                newProfile: updateResult.newProfile,
              });
            }
          } catch (err) {
            console.error("Profile update generation failed:", err);
          }
        }
      }
    } catch (e) {
      setProgress({ stage: "failed", pct: 0, detail: e.message });
      setTimeout(() => { setGenerating(null); setProgress(null); setSignalHealth({}); }, 5000);
    }
  }, [generating, gamesDb, onProjectCreated]);

  // --- Selection helpers ---
  const toggle = (id) => setSelected((p) => ({ ...p, [id]: !p[id] }));

  const selectAllInFolder = (monthKey) => {
    const items = grouped[monthKey] || [];
    const allSelected = items.every((f) => selected[f.id]);
    setSelected((p) => {
      const next = { ...p };
      items.forEach((f) => { next[f.id] = !allSelected; });
      return next;
    });
  };

  const selectAll = () => {
    const allSelected = files.length > 0 && files.every((f) => selected[f.id]);
    setSelected((p) => {
      const next = { ...p };
      files.forEach((f) => { next[f.id] = !allSelected; });
      return next;
    });
  };

  const selCount = Object.values(selected).filter(Boolean).length;

  // --- Done helpers ---
  const isDone = (f) => f.status === "done" || !!doneFiles[f.current_filename] || !!findProjectForFile(f, localProjects);

  const markSelectedDone = () => {
    const next = { ...doneFiles };
    files.forEach((f) => {
      if (selected[f.id]) next[f.current_filename] = true;
    });
    persistDone(next);
    setSelected({});
  };

  const unmarkDone = (fileName) => {
    const next = { ...doneFiles };
    delete next[fileName];
    persistDone(next);
  };

  // Reset a file's SQLite status from "done" back to "renamed" so it can be re-generated
  const resetFileDone = async (fileId) => {
    if (window.clipflow?.fileMetadataUpdate) {
      await window.clipflow.fileMetadataUpdate(fileId, { status: "renamed" });
      // Refresh file list from DB
      const rows = await window.clipflow.fileMetadataSearch({ type: "allRenamed" });
      if (Array.isArray(rows)) setFiles(rows);
    }
  };

  // --- Group files by month (from date column), test files get their own group ---
  // #60: filter by main-vs-test before grouping
  const visibleFiles = files.filter((f) => {
    if (testFilter === "test") return f.is_test === 1;
    if (testFilter === "main") return f.is_test !== 1;
    return true;
  });
  const grouped = {};
  visibleFiles.forEach((f) => {
    const monthKey = f.is_test === 1 ? "test" : (f.date ? f.date.slice(0, 7) : "unknown");
    if (!grouped[monthKey]) grouped[monthKey] = [];
    grouped[monthKey].push(f);
  });

  // Sort oldest month first (ascending), "test" at top, "unknown" last
  const folderKeys = Object.keys(grouped).sort((a, b) => {
    if (a === "test") return -1;
    if (b === "test") return 1;
    if (a === "unknown") return 1;
    if (b === "unknown") return -1;
    return a.localeCompare(b);
  });

  const toggleCollapse = (monthKey) => {
    setCollapsed((p) => {
      const next = { ...p, [monthKey]: !p[monthKey] };
      if (window.clipflow?.storeSet) window.clipflow.storeSet("recordingsCollapsed", next);
      return next;
    });
  };

  const totalDone = files.filter((f) => isDone(f)).length;

  // ============ DRAG-AND-DROP IMPORT ============
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const droppedFiles = e.dataTransfer?.files;
    if (!droppedFiles || droppedFiles.length === 0) return;

    if (droppedFiles.length > 1) {
      // Toast-like feedback — brief visual
      return;
    }

    const file = droppedFiles[0];
    if (!file.name.toLowerCase().endsWith(".mp4")) return;
    const filePath = window.clipflow.getPathForFile(file);
    if (!filePath) return;

    // Check if watch folder is configured
    let watchFolder = await window.clipflow?.storeGet("watchFolder");
    if (!watchFolder) {
      // Prompt for watch folder
      const result = await window.clipflow?.pickFolder();
      if (!result) return;
      watchFolder = result;
      await window.clipflow.storeSet("watchFolder", watchFolder);
    }

    // Path-based test default: if the source sits inside the configured test
    // watch folder, the routing defaults to test. The user can still override
    // in the quick-import modal — the physical copy is deferred until confirm
    // so the final isTest choice determines the destination root.
    const isUnderTestFolder = testWatchFolder && filePath.toLowerCase().startsWith(testWatchFolder.toLowerCase());
    const defaultTestMode = !!isUnderTestFolder;

    // Probe duration on the source file (no copy yet)
    let durationSeconds = 0;
    try {
      const probe = await window.clipflow.ffmpegProbe(filePath);
      durationSeconds = probe?.duration || probe?.format?.duration || 0;
    } catch (_) {}

    const thresholdSec = splitThreshold * 60;
    const MIN_TAIL = 120; // Don't split if last segment would be < 2 minutes
    const tailLength = durationSeconds % thresholdSec;
    const splitCount = autoSplitEnabled && durationSeconds > thresholdSec && (tailLength === 0 || tailLength >= MIN_TAIL) ? Math.ceil(durationSeconds / thresholdSec) : 0;

    // Open quick-import modal — copy happens on confirm using final isTest
    setQuickImport({
      filename: file.name,
      sourcePath: filePath,
      sizeBytes: file.size,
      watchFolder,
      durationSeconds,
      splitCount,
      isTest: defaultTestMode,
    });
    setQuickImportGame("");
    setQuickImportStep(1);
    setQuickImportSplitSkip(false);
  };

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); };

  const cancelQuickImport = async () => {
    // No copy has happened yet — modal opens before import. Just close.
    setQuickImport(null);
  };

  const confirmQuickImport = async () => {
    if (!quickImport || !quickImportGame) return;

    const game = gamesDb.find((g) => g.name === quickImportGame);
    if (!game) return;

    // Physical copy happens now, using the user's final isTest choice so the
    // file lands in the correct root (watchFolder vs testWatchFolder).
    setImporting({ filename: quickImport.filename, pct: 0 });
    const progressHandler = (data) => {
      setImporting({ filename: data.filename, pct: data.pct });
    };
    window.clipflow.onImportProgress(progressHandler);

    const importResult = await window.clipflow.importExternalFile(
      quickImport.sourcePath,
      quickImport.watchFolder,
      !!quickImport.isTest
    );

    window.clipflow.removeImportProgressListener();
    setImporting(null);

    if (!importResult || importResult.error) {
      setQuickImport(null);
      return;
    }

    const targetPath = importResult.targetPath;
    const importEntry = importResult.importEntry;
    const copiedFilename = importResult.filename;

    const fileDate = copiedFilename.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const needsSplit = quickImport.splitCount > 0 && !quickImportSplitSkip;

    // Create parent file_metadata using preset 3 (Tag + Date)
    const parentMeta = {
      tag: game.tag,
      date: fileDate,
      dayNumber: null,
      partNumber: needsSplit ? null : null,
      customLabel: null,
      originalFilename: copiedFilename,
    };

    // Check collisions
    const collisions = await window.clipflow.presetFindCollisions(parentMeta, "tag-date");
    if (collisions && collisions.length > 0) {
      for (const existing of collisions) {
        await window.clipflow.presetRetroactiveRename(existing, null);
      }
      const nextPart = await window.clipflow.presetGetNextPartNumber(parentMeta, "tag-date");
      parentMeta.partNumber = nextPart.partNumber;
    }

    if (needsSplit) {
      // Create parent record, split, rename children, then start pipeline for each
      const parentResult = await window.clipflow.fileMetadataCreate({
        originalFilename: copiedFilename,
        currentFilename: copiedFilename,
        originalPath: targetPath,
        currentPath: targetPath,
        tag: game.tag,
        entryType: game.entryType || "game",
        date: fileDate,
        namingPreset: "tag-date",
        durationSeconds: quickImport.durationSeconds,
        fileSizeBytes: importEntry?.sizeBytes || null,
        status: "pending",
        isTest: !!quickImport.isTest,
      });

      if (!parentResult?.id) { setQuickImport(null); return; }

      const thresholdSec = splitThreshold * 60;
      const splitPoints = [];
      for (let i = 0; i < quickImport.splitCount; i++) {
        const start = i * thresholdSec;
        const end = Math.min((i + 1) * thresholdSec, quickImport.durationSeconds);
        splitPoints.push({ startSeconds: start, endSeconds: end, tag: game.tag, entryType: game.entryType || "game", partNumber: i + 1 });
      }

      const splitResult = await window.clipflow.splitExecute(parentResult.id, splitPoints);
      if (splitResult.error) { setQuickImport(null); return; }

      // Rename each child and start pipeline
      const dir = targetPath.substring(0, targetPath.lastIndexOf("\\"));
      for (let i = 0; i < splitResult.results.length; i++) {
        const child = splitResult.results[i];
        const childMeta = { tag: game.tag, date: fileDate, dayNumber: null, partNumber: i + 1, customLabel: null, originalFilename: copiedFilename };
        const fmtResult = await window.clipflow.presetFormatFilename(childMeta, "tag-date");
        if (fmtResult.error) continue;

        const childNewName = fmtResult.filename;
        const childNewPath = `${dir}\\${childNewName}`;
        await window.clipflow.renameFile(child.filePath, childNewPath);
        await window.clipflow.fileMetadataUpdate(child.childId, {
          current_filename: childNewName,
          current_path: childNewPath,
          part_number: i + 1,
          status: "processing",
        });

        // Start pipeline for this child
        window.clipflow.generateClips(childNewPath, {
          name: childNewName.replace(/\.(mp4|mkv)$/i, ""),
          game: game.name,
          gameTag: game.tag,
          gameColor: game.color,
          fileMetadataId: child.childId,
          isTest: !!quickImport.isTest,
          keywords: [],
        });
      }
    } else {
      // Single file — rename then start pipeline
      const fmtResult = await window.clipflow.presetFormatFilename(parentMeta, "tag-date");
      if (fmtResult.error) { setQuickImport(null); return; }

      const newName = fmtResult.filename;
      const dir = targetPath.substring(0, targetPath.lastIndexOf("\\"));
      const newPath = `${dir}\\${newName}`;
      await window.clipflow.renameFile(targetPath, newPath);

      const metaResult = await window.clipflow.fileMetadataCreate({
        originalFilename: copiedFilename,
        currentFilename: newName,
        originalPath: targetPath,
        currentPath: newPath,
        tag: game.tag,
        entryType: game.entryType || "game",
        date: fileDate,
        partNumber: parentMeta.partNumber,
        namingPreset: "tag-date",
        durationSeconds: quickImport.durationSeconds,
        fileSizeBytes: importEntry?.sizeBytes || null,
        status: "processing",
        isTest: !!quickImport.isTest,
      });

      // Start pipeline. Pass is_test so the pipeline creates a test project.
      handleGenerate({ current_path: newPath, current_filename: newName, tag: game.tag, id: metaResult?.id, is_test: quickImport.isTest ? 1 : 0 });
    }

    // Clear suppression and close modal
    if (importEntry) {
      await window.clipflow.importClearSuppression(importEntry.filename, importEntry.sizeBytes);
    }
    setQuickImport(null);

    // Refresh file list
    try {
      const rows = await window.clipflow.fileMetadataSearch({ type: "allRenamed" });
      if (Array.isArray(rows)) {
        rows.sort((a, b) => {
          const dateComp = (a.date || "").localeCompare(b.date || "");
          if (dateComp !== 0) return dateComp;
          return (a.renamed_at || "").localeCompare(b.renamed_at || "");
        });
        setFiles(rows);
      }
    } catch (_) {}
  };

  // Quick-import game options (grouped)
  const getGroupedGameOptions = () => {
    const games = gamesDb.filter((g) => !g.entryType || g.entryType === "game");
    const contentTypes = gamesDb.filter((g) => g.entryType === "content");
    const options = [];
    if (games.length > 0) {
      options.push({ value: "__header_games__", label: "Games", isHeader: true });
      games.forEach((g) => options.push({ value: g.name, label: g.name, tag: g.tag, color: g.color }));
    }
    if (contentTypes.length > 0) {
      options.push({ value: "__header_content__", label: "Content Types", isHeader: true });
      contentTypes.forEach((g) => options.push({ value: g.name, label: g.name, tag: g.tag, color: g.color }));
    }
    if (options.length === 0) {
      gamesDb.forEach((g) => options.push({ value: g.name, label: g.name, tag: g.tag, color: g.color }));
    }
    return options;
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Recordings" subtitle="Generate clips from your recordings" />
        <div style={{ textAlign: "center", padding: 40, color: T.textTertiary }}>
          Loading recordings...
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{ position: "relative" }}
      >
        {dragOver && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 100,
            background: "rgba(139,92,246,0.08)",
            border: "2px dashed rgba(139,92,246,0.5)",
            borderRadius: 12,
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}>
            <div style={{ color: "#a78bfa", fontSize: 16, fontWeight: 700, textAlign: "center" }}>
              Drop recording to generate clips
              <div style={{ color: T.textMuted, fontSize: 12, fontWeight: 500, marginTop: 4 }}>.mp4 files only</div>
            </div>
          </div>
        )}
        <PageHeader title="Recordings" subtitle="Generate clips from your recordings" />
        <Card style={{ padding: 40, textAlign: "center", marginTop: 16 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>{"\uD83C\uDFAC"}</div>
          <div style={{ color: T.textSecondary, fontSize: 15, fontWeight: 600 }}>
            No renamed recordings found
          </div>
          <div style={{ color: T.textTertiary, fontSize: 13, marginTop: 8 }}>
            Rename files in the Rename tab first, then they'll appear here.
          </div>
          <div style={{ color: T.textMuted, fontSize: 12, marginTop: 8 }}>
            Or drag and drop an .mp4 file here to quick-generate clips
          </div>
        </Card>
        {quickImport && renderQuickImportModal()}
      </div>
    );
  }

  // Quick-import modal renderer
  const renderQuickImportModal = () => {
    if (!quickImport) return null;
    const gameOptions = getGroupedGameOptions();
    const needsSplit = quickImport.splitCount > 0 && !quickImportSplitSkip;
    const thresholdSec = splitThreshold * 60;

    return (
      <div
        onClick={cancelQuickImport}
        style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12,
            padding: 24, width: 420, maxHeight: "80vh", overflowY: "auto",
            boxShadow: "0 16px 64px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Quick Import</div>
            <TestChip
              size="md"
              isTest={!!quickImport.isTest}
              onToggle={(next) => setQuickImport((prev) => (prev ? { ...prev, isTest: next } : prev))}
            />
          </div>
          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 20, fontFamily: T.mono }}>{quickImport.filename}</div>

          {/* Step 1: Pick Game */}
          {quickImportStep === 1 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.textSecondary, marginBottom: 8 }}>Select game or content type</div>
              <Select
                value={quickImportGame}
                onChange={(val) => setQuickImportGame(val)}
                options={[{ value: "", label: "Choose..." }, ...gameOptions.filter((o) => !o.isHeader)]}
                style={{ width: "100%", marginBottom: 16 }}
                renderSelected={(o) => (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {o.tag && <GamePill tag={o.tag} color={o.color} size="sm" />}
                    {o.label}
                  </span>
                )}
                renderOption={(o) => o.isHeader ? (
                  <span style={{ color: T.textTertiary, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", pointerEvents: "none" }}>{o.label}</span>
                ) : (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {o.tag && <GamePill tag={o.tag} color={o.color} size="sm" />}
                    {o.label}
                  </span>
                )}
              />
              <button
                onClick={() => {
                  if (!quickImportGame) return;
                  // Skip to step 2 if split needed, else step 3
                  if (quickImport.splitCount > 0 && autoSplitEnabled) {
                    setQuickImportStep(2);
                  } else {
                    setQuickImportStep(3);
                  }
                }}
                disabled={!quickImportGame}
                style={{
                  width: "100%", padding: "10px 16px", borderRadius: 8, border: "none",
                  background: quickImportGame ? `linear-gradient(135deg, ${T.accent}, #a78bfa)` : "rgba(255,255,255,0.06)",
                  color: quickImportGame ? "#fff" : T.textMuted,
                  fontSize: 13, fontWeight: 700, cursor: quickImportGame ? "pointer" : "default",
                  fontFamily: T.font, opacity: quickImportGame ? 1 : 0.5,
                }}
              >
                Next
              </button>
            </>
          )}

          {/* Step 2: Split Proposal */}
          {quickImportStep === 2 && (
            <>
              <div style={{ fontSize: 13, color: T.textSecondary, marginBottom: 12 }}>
                This recording is <strong style={{ color: T.text }}>{formatDuration(quickImport.durationSeconds)}</strong>. For best results, we recommend splitting it into {quickImport.splitCount} parts.
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {/* Split & Generate — primary green */}
                <button
                  onClick={() => { setQuickImportSplitSkip(false); setQuickImportStep(3); }}
                  style={{
                    padding: "12px 16px", borderRadius: 8,
                    background: T.greenDim, border: `1px solid ${T.greenBorder}`,
                    color: T.green, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    fontFamily: T.font, textAlign: "left",
                  }}
                >
                  Split into {quickImport.splitCount} parts for best results
                </button>

                {/* Skip splitting — secondary gray */}
                <button
                  onClick={() => { setQuickImportSplitSkip(true); setQuickImportStep(3); }}
                  style={{
                    padding: "10px 16px", borderRadius: 8,
                    background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`,
                    color: T.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    fontFamily: T.font, textAlign: "left",
                  }}
                >
                  Process as single file
                  <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2 }}>Not recommended for recordings over {splitThreshold} minutes</div>
                </button>
              </div>
            </>
          )}

          {/* Step 3: Confirm & Go */}
          {quickImportStep === 3 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.textSecondary, marginBottom: 8 }}>Preview</div>
              <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                {needsSplit ? (
                  <>
                    <div style={{ color: T.textMuted, fontSize: 11, marginBottom: 6 }}>This will create {quickImport.splitCount} files:</div>
                    {Array.from({ length: quickImport.splitCount }, (_, i) => {
                      const start = i * thresholdSec;
                      const end = Math.min((i + 1) * thresholdSec, quickImport.durationSeconds);
                      const startM = Math.floor(start / 60);
                      const endM = Math.floor(end / 60);
                      const game = gamesDb.find((g) => g.name === quickImportGame);
                      return (
                        <div key={i} style={{ display: "flex", gap: 8, padding: "2px 0", color: T.textSecondary, fontSize: 12, fontFamily: T.mono }}>
                          <span style={{ color: T.accent }}>{game?.tag || "??"}</span>
                          <span>Pt{i + 1}</span>
                          <span style={{ color: T.textMuted }}>({startM}m – {endM}m)</span>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <div style={{ color: T.textSecondary, fontSize: 12, fontFamily: T.mono }}>
                    {gamesDb.find((g) => g.name === quickImportGame)?.tag || "??"} {quickImport.filename.slice(0, 10)}.mp4
                  </div>
                )}
              </div>

              <button
                onClick={confirmQuickImport}
                style={{
                  width: "100%", padding: "12px 16px", borderRadius: 8, border: "none",
                  background: `linear-gradient(135deg, ${T.accent}, #a78bfa)`,
                  color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
                  fontFamily: T.font, boxShadow: "0 2px 12px rgba(139,92,246,0.25)",
                }}
              >
                Generate Clips
              </button>
            </>
          )}

          {/* Cancel link */}
          <button
            onClick={cancelQuickImport}
            style={{
              width: "100%", padding: "8px 16px", borderRadius: 8, border: "none",
              background: "transparent", color: T.textMuted, fontSize: 12,
              cursor: "pointer", fontFamily: T.font, marginTop: 8,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      style={{ position: "relative" }}
    >
      {/* Drop zone overlay */}
      {dragOver && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 100,
          background: "rgba(139,92,246,0.08)",
          border: "2px dashed rgba(139,92,246,0.5)",
          borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{ color: "#a78bfa", fontSize: 16, fontWeight: 700, textAlign: "center" }}>
            Drop recording to generate clips
            <div style={{ color: T.textMuted, fontSize: 12, fontWeight: 500, marginTop: 4 }}>.mp4 files only</div>
          </div>
        </div>
      )}

      {/* Import progress banner */}
      {importing && (
        <div style={{ padding: "10px 16px", borderRadius: 8, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#a78bfa", fontSize: 13, fontWeight: 600 }}>Importing {importing.filename}... {importing.pct}%</span>
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 2, background: T.accent, width: `${importing.pct}%`, transition: "width 0.3s ease" }} />
          </div>
        </div>
      )}

      <PageHeader title="Recordings" subtitle="Generate clips from your recordings" />

      {/* #60: move-failure toast */}
      {moveError && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", marginBottom: 12, color: T.red, fontSize: 12, fontWeight: 600 }}>
          {moveError}
        </div>
      )}

      {/* #60: Main vs Test filter — only surfaces when test files exist or a test folder is configured */}
      {(files.some((f) => f.is_test === 1) || !!testWatchFolder) && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: T.textTertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>Show:</span>
          {[
            { key: "all", label: "All" },
            { key: "main", label: "Main" },
            { key: "test", label: "Test" },
          ].map((opt) => {
            const active = testFilter === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setTestFilter(opt.key)}
                style={{
                  padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font,
                  border: `1px solid ${active ? (opt.key === "test" ? "rgba(250,204,21,0.45)" : T.accentBorder) : T.border}`,
                  background: active ? (opt.key === "test" ? "rgba(250,204,21,0.16)" : "rgba(139,92,246,0.14)") : "transparent",
                  color: active ? (opt.key === "test" ? "#facc15" : T.accentLight) : T.textTertiary,
                  boxShadow: active && opt.key === "test" ? "0 0 6px rgba(250,204,21,0.35)" : "none",
                }}
              >{opt.label}</button>
            );
          })}
          <span style={{ fontSize: 10, color: T.textMuted, marginLeft: 6 }}>({visibleFiles.length} of {files.length})</span>
        </div>
      )}

      {/* Pipeline progress panel — multi-step status */}
      {generating && progress && (
        <Card style={{ padding: "16px 20px", marginBottom: 16, borderColor: progress.stage === "failed" ? T.red : progress.stage === "complete" ? T.green : T.accentBorder }}>
          {/* Video name header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 16 }}>{"\uD83C\uDFAC"}</span>
            <span style={{ color: T.text, fontSize: 13, fontWeight: 700, fontFamily: T.mono, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {generating ? generating.split(/[/\\]/).pop() : ""}
            </span>
            {progress.stage === "complete" && progress.signalSummary === "all" && (
              <span style={{ color: T.green, fontSize: 13, fontWeight: 700 }}>{"\u2705"} 5/5 signals contributed</span>
            )}
            {progress.stage === "complete" && progress.signalSummary === "degraded" && (
              <span style={{ color: T.yellow, fontSize: 13, fontWeight: 700 }} title={(progress.failedSignals || []).map((f) => `${f.signal}: ${f.failureReason}`).join("; ")}>
                {"\u26A0\uFE0F"} {progress.clipCount || 0} clips — {(progress.failedSignals || []).length} of {SIGNAL_ROWS.length} signals failed
              </span>
            )}
            {progress.stage === "complete" && !progress.signalSummary && (
              <span style={{ color: T.green, fontSize: 13, fontWeight: 700 }}>{"\u2705"} Done</span>
            )}
            {progress.stage === "failed" && progress.signalSummary === "strict-fail" && (
              <span style={{ color: T.red, fontSize: 13, fontWeight: 700 }} title={progress.detail}>
                {"\u274C"} Pipeline halted — {progress.failedSignal} failed after {Math.round((progress.failedAfterMs || 0) / 1000)}s
              </span>
            )}
            {progress.stage === "failed" && !progress.signalSummary && (
              <span style={{ color: T.red, fontSize: 13, fontWeight: 700 }}>{"\u274C"} Failed</span>
            )}
          </div>

          {/* Step-by-step status */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PIPELINE_STEPS.map((step) => {
              const currentIdx = PIPELINE_STEPS.findIndex((s) => s.key === progress.stage);
              const stepIdx = PIPELINE_STEPS.findIndex((s) => s.key === step.key);
              const isComplete = progress.stage === "complete" || stepIdx < currentIdx;
              const isRunning = step.key === progress.stage && progress.stage !== "complete" && progress.stage !== "failed";
              const isFailed = progress.stage === "failed" && step.key === progress.stage;
              const isWaiting = stepIdx > currentIdx && progress.stage !== "complete";

              let statusIcon, statusColor;
              if (isComplete) { statusIcon = "\u2705"; statusColor = T.green; }
              else if (isRunning) { statusIcon = "\u26A1"; statusColor = T.yellow; }
              else if (isFailed) { statusIcon = "\u274C"; statusColor = T.red; }
              else { statusIcon = "\u2B1C"; statusColor = T.textTertiary; }

              const showSignalTable = step.key === "signals" && Object.keys(signalHealth).length > 0;

              return (
                <React.Fragment key={step.key}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "5px 8px", borderRadius: 6,
                    background: isRunning ? "rgba(251,191,36,0.06)" : "transparent",
                    opacity: isWaiting ? 0.4 : 1,
                  }}>
                    <span style={{ fontSize: 13, width: 22, textAlign: "center" }}>{statusIcon}</span>
                    <span style={{ fontSize: 14 }}>{step.icon}</span>
                    <span style={{ color: statusColor, fontSize: 12, fontWeight: isRunning ? 700 : 500, flex: 1 }}>
                      {step.label}
                    </span>
                    {isRunning && progress.detail && (
                      <span style={{ color: T.textTertiary, fontSize: 10, fontFamily: T.mono }}>
                        {progress.detail}
                      </span>
                    )}
                    {isFailed && (
                      <span style={{ color: T.red, fontSize: 10 }}>{progress.detail}</span>
                    )}
                  </div>
                  {showSignalTable && (
                    <div style={{
                      marginLeft: 32, marginRight: 8, marginBottom: 4,
                      padding: "6px 10px", borderRadius: 6,
                      background: "rgba(255,255,255,0.02)",
                      border: `1px solid ${T.border}`,
                      display: "flex", flexDirection: "column", gap: 4,
                    }}>
                      {SIGNAL_ROWS.map((row) => {
                        const sh = signalHealth[row.key] || { status: "pending", progress: 0, elapsed_ms: 0 };
                        const v = signalStatusVisuals(sh.status);
                        const pct = Math.round((sh.progress || 0) * 100);
                        const elapsedSec = sh.elapsed_ms ? (sh.elapsed_ms / 1000).toFixed(1) + "s" : "";
                        return (
                          <div key={row.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                            <span style={{ width: 16, textAlign: "center" }}>{v.icon}</span>
                            <span style={{ color: v.color, flex: "0 0 150px", fontWeight: sh.status === "running" ? 700 : 500 }}>
                              {row.label}
                            </span>
                            <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                              <div style={{
                                height: "100%", borderRadius: 2,
                                background: sh.status === "failed" ? T.red : sh.status === "done" ? T.green : T.accent,
                                width: `${sh.status === "failed" ? 100 : pct}%`,
                                transition: "width 0.2s ease",
                              }} />
                            </div>
                            <span style={{ color: T.textTertiary, fontFamily: T.mono, fontSize: 10, minWidth: 60, textAlign: "right" }}>
                              {sh.status === "failed" ? sh.failureReason || "failed" : sh.status === "done" ? `done ${elapsedSec}` : elapsedSec}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Overall progress bar */}
          <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginTop: 12 }}>
            <div style={{
              height: "100%", borderRadius: 2,
              background: progress.stage === "failed" ? T.red : progress.stage === "complete" ? T.green : `linear-gradient(90deg, ${T.accent}, ${T.accentLight})`,
              width: `${progress.pct}%`,
              transition: "width 0.3s ease",
            }} />
          </div>
        </Card>
      )}

      {/* Header row: count + select all */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <SectionLabel style={{ margin: 0 }}>
          {files.length} recording{files.length !== 1 ? "s" : ""}
          {totalDone > 0 ? ` \u00b7 ${totalDone} done` : ""}
        </SectionLabel>
        <button
          onClick={selectAll}
          style={{ background: "none", border: "none", color: T.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font, padding: 0 }}
        >
          {files.length > 0 && files.every((f) => selected[f.id]) ? "Deselect All" : "Select All"}
        </button>
      </div>

      {/* Month groups */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {folderKeys.map((monthKey) => {
          const items = grouped[monthKey];
          const isCollapsed = collapsed[monthKey];
          const folderDoneCount = items.filter((f) => isDone(f)).length;
          const folderSelCount = items.filter((f) => selected[f.id]).length;
          const allFolderSelected = items.length > 0 && items.every((f) => selected[f.id]);

          return (
            <div key={monthKey}>
              {/* Month header */}
              <div
                onClick={() => toggleCollapse(monthKey)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: T.radius.md,
                  background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}`,
                  cursor: "pointer", marginBottom: isCollapsed ? 0 : 10,
                }}
              >
                <span style={{
                  color: T.textTertiary, fontSize: 14, transition: "transform 0.2s",
                  transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                }}>{"\u25BC"}</span>
                <span style={{ fontSize: 18 }}>{"\uD83D\uDCC1"}</span>
                <span style={{ color: T.text, fontSize: 14, fontWeight: 700, flex: 1 }}>
                  {monthLabel(monthKey)}
                </span>
                <span style={{ color: T.textTertiary, fontSize: 12, fontFamily: T.mono }}>
                  {items.length} file{items.length !== 1 ? "s" : ""}
                </span>
                {folderDoneCount > 0 && (
                  <span style={{ color: T.green, fontSize: 11, fontWeight: 700 }}>
                    {folderDoneCount} done
                  </span>
                )}
                {folderSelCount > 0 && (
                  <span style={{ color: T.accent, fontSize: 11, fontWeight: 700 }}>
                    {folderSelCount} selected
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); selectAllInFolder(monthKey); }}
                  style={{
                    background: "none", border: `1px solid ${T.border}`, borderRadius: 6,
                    padding: "4px 10px", color: T.textSecondary, fontSize: 11,
                    fontWeight: 600, cursor: "pointer", fontFamily: T.font,
                  }}
                >
                  {allFolderSelected ? "Deselect" : "Select All"}
                </button>
              </div>

              {/* Grid of file pills */}
              {!isCollapsed && (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(auto-fill, minmax(${PILL_MIN}px, 1fr))`,
                  gap: 6,
                }}>
                  {items.map((f) => {
                    const game = findGameByTag(f.tag, gamesDb);
                    const tagColor = game?.color || T.accent;
                    const project = findProjectForFile(f, localProjects);
                    const clipCount = project?.clipCount || project?.clips?.length || 0;
                    const fileDone = isDone(f);
                    const manualDone = !!doneFiles[f.current_filename] && !project && f.status !== "done";
                    const isSel = !!selected[f.id];
                    const isGenerating = generating === f.current_path;

                    return (
                      <div
                        key={f.id}
                        onClick={() => toggle(f.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "7px 10px", borderRadius: T.radius.md,
                          border: `1px solid ${fileDone ? "rgba(52,211,153,0.25)" : isGenerating ? T.accentBorder : isSel ? T.accentBorder : T.border}`,
                          background: fileDone ? "rgba(52,211,153,0.06)" : isSel ? T.accentDim : T.surface,
                          cursor: "pointer", overflow: "hidden",
                          opacity: fileDone && !isGenerating ? 0.7 : 1,
                        }}
                      >
                        <Checkbox checked={isSel || fileDone} size={16} />

                        {f.tag && (
                          <span style={{
                            display: "inline-flex", padding: "2px 5px",
                            background: `${tagColor}18`, border: `1px solid ${tagColor}44`,
                            borderRadius: 4, fontSize: 9, fontWeight: 700, color: tagColor,
                            fontFamily: T.mono, letterSpacing: "0.5px", flexShrink: 0,
                          }}>
                            {f.tag}
                          </span>
                        )}

                        <span style={{
                          color: T.text, fontSize: 12, fontWeight: 600,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1,
                        }}>
                          {shortName(f)}
                        </span>

                        <span onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
                          <TestChip
                            isTest={f.is_test === 1}
                            onToggle={(next) => handleToggleRecordingTest(f.id, next)}
                          />
                        </span>

                        <span style={{ color: T.textTertiary, fontSize: 10, fontFamily: T.mono, flexShrink: 0 }}>
                          {formatSize(f.file_size_bytes)}
                        </span>

                        {/* Status badges */}
                        {project && (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 3,
                            padding: "1px 5px", borderRadius: 4, fontSize: 8, fontWeight: 700,
                            color: T.green, background: "rgba(52,211,153,0.12)", flexShrink: 0,
                          }}>
                            {"\u2713"} {clipCount}
                          </span>
                        )}

                        {manualDone && (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 3,
                            padding: "1px 5px", borderRadius: 4, fontSize: 8, fontWeight: 700,
                            textTransform: "uppercase", color: T.green,
                            background: "rgba(52,211,153,0.12)", flexShrink: 0,
                          }}>
                            DONE
                            <span
                              onClick={(e) => { e.stopPropagation(); unmarkDone(f.current_filename); }}
                              title="Unmark as done"
                              style={{ cursor: "pointer", color: T.textMuted, fontSize: 10, fontWeight: 700, marginLeft: 2, lineHeight: 1 }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = T.red; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = T.textMuted; }}
                            >{"\u00d7"}</span>
                          </span>
                        )}

                        {f.status === "done" && !project && !doneFiles[f.current_filename] && (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 3,
                            padding: "1px 5px", borderRadius: 4,
                            fontSize: 8, fontWeight: 700, textTransform: "uppercase",
                            color: T.green, background: "rgba(52,211,153,0.12)", flexShrink: 0,
                          }}>
                            DONE
                            <span
                              onClick={(e) => { e.stopPropagation(); resetFileDone(f.id); }}
                              title="Reset — allow re-generation"
                              style={{ cursor: "pointer", color: T.textMuted, fontSize: 10, fontWeight: 700, marginLeft: 2, lineHeight: 1 }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = T.red; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = T.textMuted; }}
                            >{"\u00d7"}</span>
                          </span>
                        )}

                        {isGenerating && (
                          <span style={{
                            padding: "1px 5px", borderRadius: 4, fontSize: 8, fontWeight: 700,
                            color: T.yellow, background: "rgba(251,191,36,0.12)", flexShrink: 0,
                          }}>
                            {progress?.pct || 0}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer actions */}
      <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
        {selCount > 0 && !generating && (
          <>
            <button
              onClick={() => {
                const selectedFiles = files.filter((f) => selected[f.id] && !isDone(f));
                if (selectedFiles.length > 0) handleGenerate(selectedFiles[0]);
              }}
              disabled={!!generating || files.filter((f) => selected[f.id] && !isDone(f)).length === 0}
              style={{
                padding: "10px 18px", borderRadius: T.radius.md, border: "none",
                background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
                color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
                fontFamily: T.font, boxShadow: "0 2px 12px rgba(139,92,246,0.25)",
                opacity: files.filter((f) => selected[f.id] && !isDone(f)).length === 0 ? 0.5 : 1,
              }}
            >
              Generate Clips ({files.filter((f) => selected[f.id] && !isDone(f)).length})
            </button>
            <button
              onClick={markSelectedDone}
              style={{
                padding: "10px 18px", borderRadius: T.radius.md,
                border: `1px solid rgba(52,211,153,0.25)`, background: "rgba(52,211,153,0.08)",
                color: T.green, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: T.font,
              }}
            >
              Mark {selCount} as Done
            </button>
          </>
        )}
      </div>

      {/* Profile Diff Modal — shown when play style update is suggested after pipeline */}
      {profileDiff && (
        <ProfileDiffModal
          gameTag={profileDiff.gameTag}
          gameName={profileDiff.gameName}
          oldProfile={profileDiff.oldProfile}
          newProfile={profileDiff.newProfile}
          onAccept={() => setProfileDiff(null)}
          onDismiss={() => setProfileDiff(null)}
        />
      )}

      {/* Quick-Import Modal */}
      {renderQuickImportModal()}
    </div>
  );
}
