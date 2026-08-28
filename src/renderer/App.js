import React, { useState, useEffect, useCallback, useRef } from "react";
import posthog from "posthog-js";
import * as Sentry from "@sentry/electron/renderer";
import T from "./styles/theme";
import Sidebar from "./components/Sidebar";
import FeedbackBubble from "./components/FeedbackBubble";
import UpdateBanner from "./components/UpdateBanner";
import WhatsNewModal from "./components/WhatsNewModal";
import DependencyBanner from "./components/DependencyBanner";
import EngineSetupView from "./components/EngineSetupView";
import PublishFailureBanner from "./components/PublishFailureBanner";
import { AddGameModal, TranscriptModal } from "./components/modals";
import { normalizeHexColor } from "./components/shared";
import AudioCalibrationModal from "./components/AudioCalibrationModal";
import RenameView from "./views/RenameView";
import RecordingsView from "./views/UploadView";
import { ProjectsListView, ClipBrowser } from "./views/ProjectsView";
import QueueView from "./views/QueueView";
import CaptionsView from "./views/CaptionsView";
import TrackerView from "./views/TrackerView";
import SettingsView from "./views/SettingsView";
import EditorView from "./editor/EditorView";
import OnboardingView from "./views/OnboardingView";
import { evaluateRollover, localISO } from "./utils/trackerEngine";
import { buildStarterYtDescription } from "./utils/ytDescriptionTemplate";
import clipflowMark from "./assets/brand/clipflow-mark.png";

// ============ FALLBACK DEFAULTS (used if electron-store has no data yet) ============
// #262: no seeded games — every user builds their own library via + Add Game.
const INITIAL_IGNORED = ["explorer.exe", "steamwebhelper.exe", "dwm.exe", "ShellExperienceHost.exe", "zen.exe"];
const PUBLISH_ORDER_INIT = [];
// #302: a neutral starter schedule — three slots a day, Monday to Saturday,
// every slot on the main game. It replaces Fega's own routine (eight slots
// 12:30–9:30 PM with his main/variety rotation), which every new install used
// to inherit. Both the grid and DEFAULT_WEEKLY_TARGET below are editable in
// the Tracker; the target is just 3 x 6 so the number matches what's on screen.
const DEFAULT_TIME_SLOTS = ["12:00 PM","4:00 PM","8:00 PM"];
const DEFAULT_TEMPLATE = {
  timeSlots: [...DEFAULT_TIME_SLOTS],
  grid: {
    Monday: ["main","main","main"],
    Tuesday: ["main","main","main"],
    Wednesday: ["main","main","main"],
    Thursday: ["main","main","main"],
    Friday: ["main","main","main"],
    Saturday: ["main","main","main"],
  },
};
const DEFAULT_WEEKLY_TARGET = DEFAULT_TIME_SLOTS.length * 6;

// #302: the eight slots the pre-timeSlots format was built against. Stores
// written before timeSlots existed (Fega's prod profile is one) hold day
// arrays of eight with no slot list — converting those with the new 3-slot
// default would hide five columns of their schedule, so legacy data keeps the
// slots it was authored with. Fresh installs never reach this path.
const LEGACY_TIME_SLOTS = ["12:30 PM","1:30 PM","2:30 PM","3:30 PM","4:30 PM","7:30 PM","8:30 PM","9:30 PM"];

// Migrate old template format (no timeSlots key) to new format
const migrateTemplate = (tmpl) => {
  if (!tmpl) return JSON.parse(JSON.stringify(DEFAULT_TEMPLATE));
  if (tmpl.timeSlots && tmpl.grid) return tmpl;
  // Old format: { Monday: [...], Tuesday: [...], ... }
  return { timeSlots: [...LEGACY_TIME_SLOTS], grid: { ...tmpl } };
};

// No more mock data — file metadata stored in SQLite, renameHistory is persisted

// ============ PERSIST HELPER ============
const persist = (key, value) => {
  if (window.clipflow?.storeSet) window.clipflow.storeSet(key, value);
};

// #175 aftermath: the pre-alpha.2 fake undo left History entries claiming
// renames were undone when the files were never touched, plus "renames" of
// ghost rows whose files never existed on disk. One pass at load reconciles
// legacy undone entries (no historyId — DB-backed entries are authoritative)
// against the watch tree: file still at its renamed name → the rename stands,
// un-mark; gone under both names → ghost, drop; back at its raw name →
// genuinely undone, keep.
const reconcileRenameHistory = async (entries, watchFolder, testWatchFolder) => {
  if (!watchFolder || !window.clipflow?.fileExists) return entries;
  const onDisk = async (name, isTest) => {
    if (!name) return false;
    const root = isTest ? (testWatchFolder || `${watchFolder}\\Test`) : watchFolder;
    const month = (name.match(/\d{4}-\d{2}-\d{2}/) || [])[0]?.slice(0, 7);
    const candidates = month ? [`${root}\\${month}\\${name}`, `${root}\\${name}`] : [`${root}\\${name}`];
    for (const p of candidates) {
      if (await window.clipflow.fileExists(p)) return true;
    }
    return false;
  };
  const out = [];
  for (const h of entries) {
    if (!h.undone || h.historyId) { out.push(h); continue; }
    if (await onDisk(h.newName, h.isTest)) out.push({ ...h, undone: false });
    else if (await onDisk(h.oldName, h.isTest)) out.push(h);
  }
  return out;
};

export default function App() {
  // Navigation
  const [view, setView] = useState("rename");
  const [selProj, setSelProj] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Project folders
  const [projectFolders, setProjectFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState(null);

  // Core data
  const [mainGame, setMainGame] = useState("");
  const [mainPool, setMainPool] = useState([]);
  const [gamesDb, setGamesDb] = useState([]);
  // Short game tag ("AR", "RL") — clip.gameTag stores the lowercased short tag, so
  // consumers comparing against clips must use tag, not hashtag (#tracker-main-count).
  const mainGameTag = (gamesDb.find((g) => g.name === mainGame)?.tag) || "";

  // Game art for the Projects-tab tiles: map name → { path, v }. Main process
  // pushes gameArt:changed after its boot sweep or any Settings-side art edit.
  const [gameArt, setGameArt] = useState({});
  useEffect(() => {
    const refresh = () => window.clipflow?.gameArtList?.().then((m) => setGameArt(m || {}));
    refresh();
    window.clipflow?.onGameArtChanged?.(refresh);
  }, []);

  // Rename state — renameHistory from electron-store
  const [pendingRenames, setPendingRenames] = useState([]);
  const [renameHistory, setRenameHistory] = useState([]);

  // Local projects
  const [localProjects, setLocalProjects] = useState([]);

  // Transcript modal
  const [transcript, setTranscript] = useState(null);

  // Editor context — which project/clip to open
  const [editorContext, setEditorContext] = useState(null); // { projectId, clipId }
  const [returnClipId, setReturnClipId] = useState(null); // clip to scroll to when returning from the editor

  // Add Game modal — null or "game" or "content"
  const [showAddGame, setShowAddGame] = useState(null);
  const [newGameExe, setNewGameExe] = useState(null);

  // Pipeline ask-degrade modal (Issue #72 Phase 1).
  // Mounted at App level so the user can switch tabs while waiting to decide.
  // Shape: { requestId, failed: [{ signal, failureReason }, ...] } or null.
  const [degradeAsk, setDegradeAsk] = useState(null);

  useEffect(() => {
    if (!window.clipflow?.onPipelineAskDegrade) return;
    window.clipflow.onPipelineAskDegrade((data) => setDegradeAsk(data));
    return () => { window.clipflow?.removePipelineAskDegradeListener?.(); };
  }, []);

  const respondDegrade = useCallback(async (answer) => {
    const id = degradeAsk?.requestId;
    setDegradeAsk(null);
    if (id && window.clipflow?.pipelineDegradeAnswer) {
      try { await window.clipflow.pipelineDegradeAnswer(id, answer ? "yes" : "no"); } catch (_) {}
    }
  }, [degradeAsk]);

  // Audio track calibration wizard (#169) — main fires the event when a
  // multi-track file hits the pipeline without a matching saved setup.
  // Mounted at App level (same reason as the degrade modal).
  // Shape: { requestId, filePath, trackCount, hasExisting } or null.
  const [audioCalAsk, setAudioCalAsk] = useState(null);

  useEffect(() => {
    if (!window.clipflow?.onAudioCalibrationNeeded) return;
    window.clipflow.onAudioCalibrationNeeded((data) => setAudioCalAsk(data));
    return () => { window.clipflow?.removeAudioCalibrationListener?.(); };
  }, []);

  // Global render job — single source of truth for the render progress pill.
  // Renders run in the main process and outlive the editor (which fully
  // unmounts on tab switch), so progress state must live here. Renders queue
  // FIFO in main.js; every event carries {clipId, clipTitle, waiting,
  // waitingIds} plus explicit terminal stages (done/canceled/error).
  // Shape: null | { clipId, clipTitle, pct, detail, waiting, waitingIds,
  //                 canceling, done, error }
  const [renderJob, setRenderJob] = useState(null);

  useEffect(() => {
    const unsub = window.clipflow?.onRenderProgress?.((p) => {
      if (!p) return;
      setRenderJob((j) => {
        const q = {
          waiting: p.waiting ?? j?.waiting ?? 0,
          waitingIds: p.waitingIds ?? j?.waitingIds ?? [],
        };
        if (p.stage === "queued") {
          // New job waiting — keep whatever is currently rendering on the pill
          return { ...(j || { clipId: null, clipTitle: p.clipTitle || "", pct: 0, detail: "Waiting…", canceling: false }), ...q };
        }
        if (p.stage === "done" || p.stage === "canceled" || p.stage === "error") {
          // A WAITING job was canceled (not the one on the pill): just update counts
          if (p.stage === "canceled" && j && p.clipId != null && j.clipId !== p.clipId) {
            return { ...j, ...q };
          }
          if (q.waiting > 0) {
            // More jobs behind — next job's progress overwrites momentarily
            return { ...(j || {}), ...q, pct: 100, detail: p.stage === "error" ? (p.detail || "Render failed") : p.stage === "canceled" ? "Canceled" : "Done!", canceling: false };
          }
          if (p.stage === "canceled") return null;
          return { ...(j || {}), ...q, pct: 100, done: true, canceling: false, error: p.stage === "error", detail: p.stage === "error" ? (p.detail || "Render failed") : "Done!" };
        }
        // Live progress — this clip is the current render
        return {
          clipId: p.clipId ?? j?.clipId ?? null,
          clipTitle: p.clipTitle ?? j?.clipTitle ?? "",
          pct: p.pct || 0,
          detail: p.detail || "Rendering...",
          ...q,
          canceling: j?.canceling && j?.clipId === (p.clipId ?? j?.clipId) ? j.canceling : false,
        };
      });
    });
    return () => { unsub?.(); };
  }, []);

  // Let the final "Done!" / "Render failed" linger briefly, then clear the pill
  useEffect(() => {
    if (!renderJob?.done || renderJob.waiting > 0) return;
    const t = setTimeout(() => setRenderJob(null), renderJob.error ? 4000 : 1500);
    return () => clearTimeout(t);
  }, [renderJob]);

  // Cancel a specific clip's render (current job aborts, waiting job is
  // dropped); no clipId = cancel whatever is currently rendering.
  const cancelRenderJob = useCallback((clipId) => {
    setRenderJob((j) => (j && (clipId == null || j.clipId === clipId) ? { ...j, canceling: true } : j));
    try { window.clipflow?.cancelRender?.(clipId); } catch (_) {}
  }, []);

  const respondAudioCal = useCallback(async (setup) => {
    const id = audioCalAsk?.requestId;
    setAudioCalAsk(null);
    if (!id) return;
    try {
      if (setup) {
        // Save FIRST — main re-checks the store after the answer resolves.
        const saved = await window.clipflow.audioSaveCalibration(setup);
        await window.clipflow.audioCalibrationAnswer(id, !!saved?.success);
      } else {
        await window.clipflow.audioCalibrationAnswer(id, false);
      }
    } catch (_) {
      try { await window.clipflow.audioCalibrationAnswer(id, false); } catch (_) {}
    }
  }, [audioCalAsk]);

  // Settings
  const [ignoredProcesses, setIgnoredProcesses] = useState(INITIAL_IGNORED);
  // #167: no hardcoded folder — pre-settings-load state must be empty or the
  // Rename watcher races the async load and scans a folder the user never chose.
  const [watchFolder, setWatchFolder] = useState("");
  const [testWatchFolder, setTestWatchFolder] = useState("");
  const [platforms, setPlatforms] = useState(PUBLISH_ORDER_INIT);
  const [outputFolder, setOutputFolder] = useState("");
  // #208 — folders whose audio is linked in place: [{ path, enabled }]
  const [audioFolders, setAudioFolders] = useState([]);
  // #309 — folders whose images/GIFs/videos feed the Media tab, same shape
  const [mediaFolders, setMediaFolders] = useState([]);

  // Settings section collapse state — persists across tab switches, resets on app launch
  const [settingsCollapsed, setSettingsCollapsed] = useState({
    files: true, content: true, aiStyle: true, publishing: true, tools: true, diagnostics: true,
  });

  // Queue / Tracker
  const [weeklyTemplate, setWeeklyTemplate] = useState(JSON.parse(JSON.stringify(DEFAULT_TEMPLATE)));
  const [trackerData, setTrackerData] = useState([]);
  const [weeklyTarget, setWeeklyTarget] = useState(DEFAULT_WEEKLY_TARGET);
  const [weekMeta, setWeekMeta] = useState({});
  const [xpLedger, setXpLedger] = useState([]);
  const [streakState, setStreakState] = useState({ evaluatedThroughMondayISO: null, current: 0, best: 0 });
  const [weekTemplateOverrides, setWeekTemplateOverrides] = useState({}); // { "2026-03-02": template }
  const [savedTemplates, setSavedTemplates] = useState([]); // [{ name, template }]
  const [mainGameHistory, setMainGameHistory] = useState([]); // [{ date, from, to }]

  // AI Title & Caption Generator
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  // #246: transient app-level toast (background research completion etc.) —
  // string message, auto-dismissed; not persisted.
  const [toast, setToast] = useState(null);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [gatewayUrl, setGatewayUrl] = useState("");
  // #301: the user's OWN gateway token only — empty on every install that
  // hasn't pasted one. The bundled token stays in the main process.
  const [gatewayAuthToken, setGatewayAuthToken] = useState("");
  const [hasBundledGatewayToken, setHasBundledGatewayToken] = useState(false);
  // #262 follow-up: AI is available with a raw key OR the bundled gateway
  // (#249) — gateway-only installs must never be gated on a personal key.
  const aiReady = !!(anthropicApiKey || (gatewayUrl && (gatewayAuthToken || hasBundledGatewayToken)));
  const [styleGuide, setStyleGuide] = useState("");

  // YouTube OAuth 2.0
  const [youtubeClientId, setYoutubeClientId] = useState("");
  const [youtubeClientSecret, setYoutubeClientSecret] = useState("");

  // Meta (Facebook Pages)
  const [metaAppId, setMetaAppId] = useState("");
  const [metaAppSecret, setMetaAppSecret] = useState("");
  // Instagram (separate app — Instagram Business Login)
  const [instagramAppId, setInstagramAppId] = useState("");
  const [instagramAppSecret, setInstagramAppSecret] = useState("");

  // TikTok
  const [tiktokClientKey, setTiktokClientKey] = useState("");
  const [tiktokClientSecret, setTiktokClientSecret] = useState("");

  // Onboarding
  const [onboardingComplete, setOnboardingComplete] = useState(null); // null = loading, true/false = resolved
  // #146 AI engine setup — needed: whisperPythonPath unset/dangling (main
  // decides); open: the overlay is showing (it can be hidden mid-download and
  // reopened from the DependencyBanner's Finish Setup button).
  const [engineSetupNeeded, setEngineSetupNeeded] = useState(false);
  const [engineSetupOpen, setEngineSetupOpen] = useState(false);
  // Boot probe: main answers "needed" only when whisperPythonPath is unset or
  // dangling AFTER the #251 boot migrations ran — so machines with a pinned
  // D:\ venv never see the setup screen.
  useEffect(() => {
    window.clipflow?.setupGetState?.().then((r) => {
      if (r?.success && r.needed) {
        setEngineSetupNeeded(true);
        setEngineSetupOpen(true);
      }
    }).catch(() => {});
    // A download finished while the overlay was hidden still clears the
    // banner (needed → key flip → DependencyBanner remounts and re-checks).
    const unsub = window.clipflow?.onSetupProgress?.((d) => {
      if (d.phase === "done") setEngineSetupNeeded(false);
    });
    return unsub;
  }, []);

  // Queue settings
  const [requireHashtagInTitle, setRequireHashtagInTitle] = useState(true);

  // Captions
  const [platformOptions, setPlatformOptions] = useState({ tiktokPostMode: "direct_post" });
  // #302: identical to STORE_DEFAULTS.captionTemplates in main.js. This seed is
  // normally overwritten from the store on load, but the loader's early return
  // and its catch both still flip hasLoaded — so on a settings-read failure
  // whatever sits here gets persisted as the user's own templates.
  const [captionTemplates, setCaptionTemplates] = useState({
    tiktok: "{title} #{gametitle} #fyp #gamingontiktok",
    instagram: "{title} #{gametitle} #reels #gamingreels",
    facebook: "{title} #{gametitle} #gaming #fbreels",
  });
  const [ytDescriptions, setYtDescriptions] = useState({});
  // #286: one stream-schedule string, referenced by templates as {schedule}.
  const [streamSchedule, setStreamSchedule] = useState("");

  // #244: scheduled-publish failures raised by QueueView's scheduler. Persist
  // until dismissed — the whole point is reaching the user who wasn't looking.
  const [publishAlerts, setPublishAlerts] = useState([]);
  // Incrementing signal: banner "Review" → Queue tab with the Failed filter on.
  const [queueFocusFailed, setQueueFocusFailed] = useState(0);

  // Re-fetch OAuth accounts and merge into platforms. Used at startup and by
  // QueueView's pre-flight when it flags a dead connection (#244) so the
  // Settings badge appears without an app restart.
  const refreshOauthAccounts = async () => {
    if (!window.clipflow?.oauthGetAccounts) return;
    try {
      const oauthAccounts = await window.clipflow.oauthGetAccounts();
      if (oauthAccounts && oauthAccounts.length > 0) {
        setPlatforms((prev) => {
          // Merge: keep existing manual entries, add/update OAuth accounts
          const merged = [...prev];
          for (const acct of oauthAccounts) {
            const idx = merged.findIndex((p) => p.key === acct.key);
            if (idx >= 0) {
              merged[idx] = { ...merged[idx], ...acct };
            } else {
              merged.push(acct);
            }
          }
          return merged;
        });
      }
    } catch (e) {
      console.error("Failed to load OAuth accounts:", e);
    }
  };

  // ============ LOAD FROM ELECTRON-STORE ON STARTUP ============
  useEffect(() => {
    const load = async () => {
      if (!window.clipflow?.storeGetAll) { setLoaded(true); return; }
      try {
        const all = await window.clipflow.storeGetAll();
        if (all.watchFolder) setWatchFolder(all.watchFolder);
        if (all.testWatchFolder !== undefined) setTestWatchFolder(all.testWatchFolder || "");
        if (all.mainGame) setMainGame(all.mainGame);
        if (all.mainPool) setMainPool(all.mainPool);
        // #242 heal: the pre-fix hue wheel stored hsl() color strings, which
        // break every `${color}NN` hex-alpha tint (GamePill etc.). Normalize
        // to 6-digit hex on every load.
        const storedGames = all.gamesDb
          ? all.gamesDb.map((g) => (g.color ? { ...g, color: normalizeHexColor(g.color) } : g))
          : null;
        if (storedGames) setGamesDb(storedGames);
        if (all.ignoredProcesses) setIgnoredProcesses(all.ignoredProcesses);
        // Load platforms: merge stored manual platforms with OAuth-connected accounts
        if (all.platforms) setPlatforms(all.platforms);
        await refreshOauthAccounts();
        if (all.weeklyTemplate) setWeeklyTemplate(migrateTemplate(all.weeklyTemplate));
        if (all.trackerData) setTrackerData(all.trackerData);
        if (all.weeklyTarget !== undefined) setWeeklyTarget(all.weeklyTarget);
        if (all.weekMeta) setWeekMeta(all.weekMeta);
        if (all.xpLedger) setXpLedger(all.xpLedger);
        if (all.streakState) setStreakState(all.streakState);
        if (all.weekTemplateOverrides) {
          // Migrate each override
          const migrated = {};
          for (const [k, v] of Object.entries(all.weekTemplateOverrides)) migrated[k] = migrateTemplate(v);
          setWeekTemplateOverrides(migrated);
        }
        if (all.savedTemplates) setSavedTemplates(all.savedTemplates.map((p) => ({ ...p, template: migrateTemplate(p.template) })));
        if (all.mainGameHistory) setMainGameHistory(all.mainGameHistory);
        if (all.captionTemplates) setCaptionTemplates(all.captionTemplates);
        if (all.platformOptions) setPlatformOptions((p) => ({ ...p, ...all.platformOptions }));
        // Load projects from disk (file-based), fall back to store
        if (window.clipflow?.projectList) {
          const projResult = await window.clipflow.projectList();
          if (projResult?.projects?.length > 0) {
            setLocalProjects(projResult.projects);
          } else if (all.localProjects) {
            setLocalProjects(all.localProjects);
          }
        } else if (all.localProjects) {
          setLocalProjects(all.localProjects);
        }
        // Load project folders
        if (window.clipflow?.folderList) {
          const folderResult = await window.clipflow.folderList();
          if (folderResult?.folders) setProjectFolders(folderResult.folders);
        }
        if (all.outputFolder) setOutputFolder(all.outputFolder);
        if (Array.isArray(all.audioFolders)) setAudioFolders(all.audioFolders);
        if (Array.isArray(all.mediaFolders)) setMediaFolders(all.mediaFolders);
        if (all.renameHistory) {
          const reconciled = await reconcileRenameHistory(all.renameHistory, all.watchFolder, all.testWatchFolder);
          // Persist immediately when the pass corrected anything — the auto-save
          // effect only fires on later changes, and the cleanup should stick.
          if (reconciled.length !== all.renameHistory.length || reconciled.some((h, i) => h !== all.renameHistory[i])) {
            persist("renameHistory", reconciled);
          }
          setRenameHistory(reconciled);
        }
        if (all.anthropicApiKey) setAnthropicApiKey(all.anthropicApiKey);
        if (all.geminiApiKey) setGeminiApiKey(all.geminiApiKey);
        if (all.gatewayUrl) setGatewayUrl(all.gatewayUrl);
        if (all.gatewayAuthToken) setGatewayAuthToken(all.gatewayAuthToken);
        if (all.youtubeClientId) setYoutubeClientId(all.youtubeClientId);
        if (all.youtubeClientSecret) setYoutubeClientSecret(all.youtubeClientSecret);
        if (all.metaAppId) setMetaAppId(all.metaAppId);
        if (all.metaAppSecret) setMetaAppSecret(all.metaAppSecret);
        if (all.instagramAppId) setInstagramAppId(all.instagramAppId);
        if (all.instagramAppSecret) setInstagramAppSecret(all.instagramAppSecret);
        if (all.tiktokClientKey) setTiktokClientKey(all.tiktokClientKey);
        if (all.tiktokClientSecret) setTiktokClientSecret(all.tiktokClientSecret);
        if (all.styleGuide) setStyleGuide(all.styleGuide);
        if (all.requireHashtagInTitle !== undefined) setRequireHashtagInTitle(all.requireHashtagInTitle);
        if (typeof all.streamSchedule === "string") setStreamSchedule(all.streamSchedule);
        // Onboarding flag
        setOnboardingComplete(!!all.onboardingComplete);
        // #262: no baked-in defaults — the store is the only source of descriptions
        if (all.ytDescriptions && Object.keys(all.ytDescriptions).length > 0) {
          setYtDescriptions(all.ytDescriptions);
        }

        // dayCount migration: initialize from SQLite file_metadata for games with dayCount 0
        if (window.clipflow.fileMetadataSearch) {
          const games = storedGames || [];
          const needsMigration = games.filter((g) => !g.dayCount || g.dayCount === 0);
          if (needsMigration.length > 0) {
            const allFiles = await window.clipflow.fileMetadataSearch({ type: "allRenamed" });
            if (Array.isArray(allFiles) && allFiles.length > 0) {
              const migrated = games.map((g) => {
                if (g.dayCount && g.dayCount > 0) return g;
                const gameFiles = allFiles.filter((f) => f.tag === g.tag);
                if (gameFiles.length === 0) return g;
                const uniqueDates = new Set(gameFiles.map((f) => f.date).filter(Boolean));
                const sortedDates = [...uniqueDates].sort();
                const dayCount = sortedDates.length;
                const lastDayDate = sortedDates[sortedDates.length - 1];
                return { ...g, dayCount, lastDayDate };
              });
              setGamesDb(migrated);
            }
          }
        }
      } catch (e) {
        console.error("Failed to load settings:", e);
      }
      setLoaded(true);
    };
    load();
  }, []);

  // #73: reveal signal. Main holds the window hidden behind the splash until
  // the hydration above has COMMITTED — an effect on `loaded` (not a call
  // inside load()) so every setState batch lands before the window shows and
  // first paint has real numbers, not seeded defaults.
  useEffect(() => {
    if (loaded) window.clipflow?.appReady?.();
  }, [loaded]);

  // #301: does this build carry a gateway token? One boolean, asked once —
  // it decides whether AI counts as available and what Settings shows, with
  // the token itself staying in the main process where it can't be persisted.
  useEffect(() => {
    const p = window.clipflow?.getGatewayInfo?.();
    if (!p) return;
    p.then((info) => setHasBundledGatewayToken(Boolean(info?.hasBundledToken))).catch(() => {});
  }, []);

  // ============ AUTO-SAVE TO ELECTRON-STORE ============
  const hasLoaded = useRef(false);
  useEffect(() => {
    if (!loaded) return;
    if (!hasLoaded.current) { hasLoaded.current = true; return; }
    persist("watchFolder", watchFolder);
  }, [watchFolder, loaded]);
  useEffect(() => {
    if (!loaded) return;
    if (!hasLoaded.current) return;
    persist("testWatchFolder", testWatchFolder);
  }, [testWatchFolder, loaded]);
  useEffect(() => { if (!hasLoaded.current) return; persist("mainGame", mainGame); }, [mainGame]);
  useEffect(() => { if (!hasLoaded.current) return; persist("mainPool", mainPool); }, [mainPool]);
  useEffect(() => { if (!hasLoaded.current) return; persist("gamesDb", gamesDb); }, [gamesDb]);
  // Day-counter repair (#170) happens in the main process during reconcile —
  // sync it into renderer state, or the next rename would compute from (and
  // persist back) the stale counter this component loaded at boot.
  useEffect(() => {
    if (!window.clipflow?.onGamesDbChanged) return;
    window.clipflow.onGamesDbChanged((games) => {
      if (Array.isArray(games) && games.length > 0) setGamesDb(games);
    });
    return () => { window.clipflow?.removeGamesDbChangedListener?.(); };
  }, []);
  useEffect(() => { if (!hasLoaded.current) return; persist("ignoredProcesses", ignoredProcesses); }, [ignoredProcesses]);
  useEffect(() => { if (!hasLoaded.current) return; persist("platforms", platforms); }, [platforms]);
  useEffect(() => { if (!hasLoaded.current) return; persist("weeklyTemplate", weeklyTemplate); }, [weeklyTemplate]);
  useEffect(() => { if (!hasLoaded.current) return; persist("trackerData", trackerData); }, [trackerData]);
  useEffect(() => { if (!hasLoaded.current) return; persist("weeklyTarget", weeklyTarget); }, [weeklyTarget]);
  useEffect(() => { if (!hasLoaded.current) return; persist("weekMeta", weekMeta); }, [weekMeta]);
  useEffect(() => { if (!hasLoaded.current) return; persist("xpLedger", xpLedger); }, [xpLedger]);
  useEffect(() => { if (!hasLoaded.current) return; persist("streakState", streakState); }, [streakState]);
  useEffect(() => { if (!hasLoaded.current) return; persist("weekTemplateOverrides", weekTemplateOverrides); }, [weekTemplateOverrides]);
  useEffect(() => { if (!hasLoaded.current) return; persist("savedTemplates", savedTemplates); }, [savedTemplates]);
  useEffect(() => { if (!hasLoaded.current) return; persist("mainGameHistory", mainGameHistory); }, [mainGameHistory]);
  useEffect(() => { if (!hasLoaded.current) return; persist("captionTemplates", captionTemplates); }, [captionTemplates]);
  useEffect(() => { if (!hasLoaded.current) return; persist("platformOptions", platformOptions); }, [platformOptions]);
  useEffect(() => { if (!hasLoaded.current) return; persist("ytDescriptions", ytDescriptions); }, [ytDescriptions]);
  useEffect(() => { if (!hasLoaded.current) return; persist("localProjects", localProjects); }, [localProjects]);
  useEffect(() => { if (!hasLoaded.current) return; persist("outputFolder", outputFolder); }, [outputFolder]);
  useEffect(() => { if (!hasLoaded.current) return; persist("audioFolders", audioFolders); }, [audioFolders]);
  useEffect(() => { if (!hasLoaded.current) return; persist("mediaFolders", mediaFolders); }, [mediaFolders]);
  useEffect(() => { if (!hasLoaded.current) return; persist("renameHistory", renameHistory); }, [renameHistory]);
  useEffect(() => { if (!hasLoaded.current) return; persist("anthropicApiKey", anthropicApiKey); }, [anthropicApiKey]);
  useEffect(() => { if (!hasLoaded.current) return; persist("geminiApiKey", geminiApiKey); }, [geminiApiKey]);
  useEffect(() => { if (!hasLoaded.current) return; persist("gatewayUrl", gatewayUrl); }, [gatewayUrl]);
  useEffect(() => { if (!hasLoaded.current) return; persist("gatewayAuthToken", gatewayAuthToken); }, [gatewayAuthToken]);
  useEffect(() => { if (!hasLoaded.current) return; persist("youtubeClientId", youtubeClientId); }, [youtubeClientId]);
  useEffect(() => { if (!hasLoaded.current) return; persist("youtubeClientSecret", youtubeClientSecret); }, [youtubeClientSecret]);
  useEffect(() => { if (!hasLoaded.current) return; persist("metaAppId", metaAppId); }, [metaAppId]);
  useEffect(() => { if (!hasLoaded.current) return; persist("metaAppSecret", metaAppSecret); }, [metaAppSecret]);
  useEffect(() => { if (!hasLoaded.current) return; persist("instagramAppId", instagramAppId); }, [instagramAppId]);
  useEffect(() => { if (!hasLoaded.current) return; persist("instagramAppSecret", instagramAppSecret); }, [instagramAppSecret]);
  useEffect(() => { if (!hasLoaded.current) return; persist("tiktokClientKey", tiktokClientKey); }, [tiktokClientKey]);
  useEffect(() => { if (!hasLoaded.current) return; persist("tiktokClientSecret", tiktokClientSecret); }, [tiktokClientSecret]);
  useEffect(() => { if (!hasLoaded.current) return; persist("styleGuide", styleGuide); }, [styleGuide]);
  useEffect(() => { if (!hasLoaded.current) return; persist("requireHashtagInTitle", requireHashtagInTitle); }, [requireHashtagInTitle]);
  useEffect(() => { if (!hasLoaded.current) return; persist("streamSchedule", streamSchedule); }, [streamSchedule]);

  // XP ledger append with idempotency — nothing is ever double-banked or removed (rank only climbs).
  const awardXp = useCallback((key, amount, reason, dateISO) => {
    setXpLedger((prev) => (prev.some((e) => e.key === key) ? prev : [...prev, { key, amount, reason, dateISO }]));
  }, []);

  // Lazy week rollover: evaluate completed weeks (goal bonus, streak, frozen recaps) on
  // launch and whenever tracker data changes. evaluateRollover is pure and returns
  // changed:false once stable, so this effect terminates.
  useEffect(() => {
    if (!loaded) return;
    const res = evaluateRollover({ trackerData, weekMeta, xpLedger, streakState, weeklyTarget, mainGame, today: new Date() });
    if (!res.changed) return;
    setWeekMeta(res.weekMeta);
    setStreakState(res.streakState);
    if (res.ledgerAppends.length > 0) {
      setXpLedger((prev) => {
        const have = new Set(prev.map((e) => e.key));
        const fresh = res.ledgerAppends.filter((e) => !have.has(e.key));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
    }
  }, [loaded, trackerData, weekMeta, xpLedger, streakState, weeklyTarget, mainGame]);

  // ============ MAIN GAME SWITCH LOGGING ============
  const prevMainGame = useRef(null);
  useEffect(() => {
    if (!loaded) return;
    if (prevMainGame.current === null) { prevMainGame.current = mainGame; return; }
    if (mainGame !== prevMainGame.current) {
      setMainGameHistory((prev) => [...prev, {
        date: localISO(new Date()),
        from: prevMainGame.current,
        to: mainGame,
      }]);
      prevMainGame.current = mainGame;
    }
  }, [mainGame, loaded]);

  // #246: toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // ============ HANDLERS ============
  const handleNewGame = (gd) => {
    setGamesDb((p) => [...p, { ...gd, entryType: gd.entryType || showAddGame || "game", dayCount: gd.entryType === "content" || showAddGame === "content" ? 0 : 1 }]);
    // #262: starter YouTube description — generic; the user makes it theirs in
    // the Captions tab (no baked-in channel links or personal hashtags).
    // #284: shared with CaptionsView's Regenerate button — one generator only.
    const gameName = gd.name;
    const hashtag = gd.hashtag || gameName.toLowerCase().replace(/\s+/g, "");
    const ytDesc = buildStarterYtDescription(gameName, hashtag);
    setYtDescriptions((p) => ({ ...p, [gameName]: { desc: ytDesc } }));
    setNewGameExe(null);
    setShowAddGame(false);
    const entryType = gd.entryType || showAddGame || "game";
    // #246: play-style write-through — game_profiles.json is the store the
    // detection pipeline reads; aiContextUser (already in the gamesDb entry
    // via the payload) is the one editor titles read. Write both, always.
    if (entryType === "game" && (gd.aiContextUser || "").trim()) {
      window.clipflow.gameProfilesUpdatePlayStyle?.(gd.tag, gd.aiContextUser.trim(), gd.name)?.catch?.(() => {});
    }
    // #246: auto-research in the background. No AI path at all → silent skip
    // (the Edit modal's hint already points at Settings). Content types
    // excluded on purpose (JC rule — content, not a game).
    if (entryType === "game" && aiReady) {
      window.clipflow.anthropicResearchGame(gd.name).then((result) => {
        if (result?.success && result.data) {
          setGamesDb((prev) => prev.map((g) => (g.name === gd.name ? { ...g, aiContextAuto: result.data, aiResearchedAt: new Date().toISOString() } : g)));
          setToast(`${gd.name} researched — clip detection now knows this game`);
        } else if (result?.error) {
          console.warn(`Background game research failed for ${gd.name}:`, result.error);
        }
      }).catch((err) => console.warn(`Background game research failed for ${gd.name}:`, err?.message || err));
    }
    // Grab the game's Steam poster in the background (Projects-tab tile art);
    // gameArt:changed refreshes the map when it lands. Not-found fails soft.
    if (entryType === "game") {
      window.clipflow.gameArtFetch?.(gd.name)?.catch?.(() => {});
    }
  };
  const handleEditGame = (u) => setGamesDb((p) => p.map((g) => (g.name === u.name ? u : g)));

  // #246: gamesDb side of the play-style write-through for saves that happen
  // inside ProfileDiffModal (which only writes game_profiles.json itself).
  const handlePlayStyleSaved = useCallback((gameTag, text) => {
    setGamesDb((prev) => prev.map((g) => (g.tag === gameTag ? { ...g, aiContextUser: text } : g)));
  }, []);

  // Called by RenameView after a file is renamed — persists dayCount + lastDayDate per game
  const handleGameDayUpdate = useCallback((tag, dayCount, lastDayDate) => {
    setGamesDb((prev) => prev.map((g) =>
      g.tag === tag ? { ...g, dayCount, lastDayDate } : g
    ));
  }, []);

  const handleUpdateClip = useCallback((projectId, clipId, status) => {
    const updateClips = (p) => ({
      ...p,
      clips: (p.clips || []).map((c) => (c.id === clipId ? { ...c, status } : c)),
    });
    setLocalProjects((prev) => prev.map((p) => p.id !== projectId ? p : updateClips(p)));
    // Also update selProj so ClipBrowser re-renders immediately
    setSelProj((prev) => prev && prev.id === projectId ? updateClips(prev) : prev);
    // Persist to project JSON on disk
    window.clipflow?.projectUpdateClip?.(projectId, clipId, { status }).catch(() => {});
  }, []);

  const handleEditClipTitle = useCallback((projectId, clipId, title) => {
    const updateClips = (p) => ({
      ...p,
      clips: (p.clips || []).map((c) => (c.id === clipId ? { ...c, title } : c)),
    });
    setLocalProjects((prev) => prev.map((p) => p.id !== projectId ? p : updateClips(p)));
    setSelProj((prev) => prev && prev.id === projectId ? updateClips(prev) : prev);
    // Persist to project JSON on disk
    window.clipflow?.projectUpdateClip?.(projectId, clipId, { title }).catch(() => {});
  }, []);

  // Generic clip-field updater (#197 retag, #198 rejection reasons) — same
  // optimistic local update + disk persist pattern as status/title above.
  const handleUpdateClipFields = useCallback((projectId, clipId, fields) => {
    const updateClips = (p) => ({
      ...p,
      clips: (p.clips || []).map((c) => (c.id === clipId ? { ...c, ...fields } : c)),
    });
    setLocalProjects((prev) => prev.map((p) => p.id !== projectId ? p : updateClips(p)));
    setSelProj((prev) => prev && prev.id === projectId ? updateClips(prev) : prev);
    window.clipflow?.projectUpdateClip?.(projectId, clipId, fields).catch(() => {});
  }, []);

  // #306: Repost — the main process copies the published clip and its rendered
  // file into a fresh approved, unscheduled clip. Reload the project list so the
  // new card appears in the Queue; the caller navigates there as the confirmation.
  const handleRepostClip = useCallback(async (projectId, clipId) => {
    const res = await window.clipflow?.projectRepostClip?.(projectId, clipId);
    if (!res || res.error) return res || { error: "Repost is unavailable" };
    const list = await window.clipflow?.projectList?.();
    if (list?.projects) setLocalProjects(list.projects);
    return res;
  }, []);

  // `from` is where Back should land (#204). Omitted = the project's clip list,
  // which is right for every caller inside Projects.
  const handleOpenInEditor = useCallback((projectId, clipId, from) => {
    setEditorContext({ projectId, clipId, from });
    setView("editor");
  }, []);

  // #204: opened from a Queue row — Back returns to the Queue, not a project
  // list the user never navigated into.
  const handleOpenQueueClipInEditor = useCallback((projectId, clipId) => {
    handleOpenInEditor(projectId, clipId, "queue");
  }, [handleOpenInEditor]);

  // #218: opened from a Tracker week-log card — Back returns to the Tracker.
  const handleOpenTrackerClipInEditor = useCallback((projectId, clipId) => {
    handleOpenInEditor(projectId, clipId, "tracker");
  }, [handleOpenInEditor]);

  // #125: open a raw recording in the editor (watch-only source-preview, no project/clip)
  const handleOpenSourcePreview = useCallback((path, label) => {
    setEditorContext({ sourcePreviewPath: path, label });
    setView("editor");
  }, []);

  // Refresh folder list from store (call after any folder mutation or project deletion)
  const refreshFolders = useCallback(async () => {
    const result = await window.clipflow.folderList();
    if (result?.folders) setProjectFolders(result.folders);
  }, []);

  // Delete projects by IDs
  const handleDeleteProjects = useCallback(async (projectIds) => {
    // #152: failures used to be swallowed and the row disappeared anyway, so a
    // project still sitting on disk looked deleted until the next reload.
    const deleted = [], failed = [];
    for (const id of projectIds) {
      try {
        const res = await window.clipflow.projectDelete(id);
        (res?.error ? failed : deleted).push(id);
      } catch (_) { failed.push(id); }
    }
    setLocalProjects((prev) => prev.filter((p) => !deleted.includes(p.id)));
    if (failed.length > 0) {
      setToast(`Couldn't delete ${failed.length} project${failed.length !== 1 ? "s" : ""} — the files may be open in another program.`);
    }
    // If currently viewing a deleted project's clips, go back to list
    if (selProj && deleted.includes(selProj.id)) {
      setSelProj(null);
      setView("projects");
    }
    // Reconcile folder references for deleted projects
    refreshFolders();
  }, [selProj, refreshFolders]);

  // Load full project data (with transcription + clips) when entering ClipBrowser
  const handleSelectProject = useCallback(async (project) => {
    let loaded = project; // fallback to summary
    try {
      const full = await window.clipflow.projectLoad(project.id);
      if (full && !full.error && full.project) {
        loaded = full.project;
        setLocalProjects((prev) => prev.map((p) => (p.id === project.id ? full.project : p)));
      }
    } catch (e) { /* use summary data as fallback */ }
    setSelProj(loaded);
    setView("clips");
  }, []);

  // Build allClips for QueueView — derived from localProjects (rendered clips)
  const allClips = React.useMemo(() => {
    const result = {};
    for (const proj of localProjects) {
      const rendered = (proj.clips || []).filter((c) => c.renderStatus === "rendered");
      if (rendered.length > 0) result[proj.id] = rendered;
    }
    return result;
  }, [localProjects]);

  // Scheduled clips for the Tracker Calendar's read-only future preview. scheduledAt is a local
  // ISO string "YYYY-MM-DDTHH:MM:00", so date/time slice without any UTC conversion.
  const scheduledClips = React.useMemo(() => {
    const to12h = (hhmm) => {
      const [h, m] = hhmm.split(":").map(Number);
      const ap = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
    };
    // clipId/projectId/paths ride along so the Tracker's week log can show the frame
    // and offer "open in editor" / "show in Explorer" on a not-yet-published clip (#218).
    return Object.entries(allClips).flatMap(([projectId, clips]) =>
      clips.filter((c) => c.scheduledAt).map((c) => ({
        date: c.scheduledAt.slice(0, 10),
        time: to12h(c.scheduledAt.slice(11, 16)),
        title: c.title,
        // Lowercased to match gamesDb hashtags, same as QueueView's logPost does at publish.
        game: (c.gameTag || "").toLowerCase() || null,
        clipId: c.id,
        projectId,
        thumbnailPath: c.thumbnailPath || null,
        renderPath: c.renderPath || null,
        repostOf: c.repostOf || null, // #306: badge a scheduled repost in the calendar
      }))
    );
  }, [allClips]);

  // #315: clips stuck between "scheduled" and "posted".
  //
  // A scheduled publish that only partly worked leaves the clip in a gap: the
  // scheduler's claim cleared `scheduledAt` (so the yellow card left the calendar)
  // while QueueView only writes a tracker entry on FULL success (so no posted card
  // took its place). It is live on the platforms that worked and invisible on the
  // Tracker until someone retries — which is exactly when the user goes looking.
  //
  // Derived, never written: no tracker entry is created here, so nothing counts
  // toward the week, the pace ring, the streak or XP until the retry completes and
  // logPost runs for real. The slot is the moment the audience first got it
  // (`publishedAt`), falling back to the earliest recorded failure when nothing
  // went out at all — both are already persisted on the clip.
  const needsRetryClips = React.useMemo(() => {
    const tracked = new Set(trackerData.map((t) => t.clipId).filter(Boolean));
    return Object.entries(allClips).flatMap(([projectId, clips]) =>
      clips.flatMap((c) => {
        if (c.scheduledAt || tracked.has(c.id)) return [];
        const states = Object.values(c.publishState || {});
        const failed = states.filter((v) => v && typeof v === "object" && v.error);
        if (failed.length === 0) return [];
        const at = c.publishedAt || failed.map((v) => v.at).filter(Boolean).sort()[0];
        if (!at) return [];
        const when = new Date(at);
        if (isNaN(when.getTime())) return [];
        return [{
          date: localISO(when),
          time: when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
          title: c.title,
          game: (c.gameTag || "").toLowerCase() || null,
          clipId: c.id,
          projectId,
          postedCount: states.filter((v) => v === "success").length,
          failedCount: failed.length,
          repostOf: c.repostOf || null,
        }];
      })
    );
  }, [allClips, trackerData]);

  // clipId → what the Tracker needs to identify a POSTED clip (#218). Tracker entries
  // store title + clipId at publish time (QueueView logPost); the frame and the file
  // path live on the clip, so they're resolved live and simply absent once a project
  // is deleted or its drive is offline.
  const trackerClipIndex = React.useMemo(() => {
    const m = new Map();
    for (const [projectId, clips] of Object.entries(allClips)) {
      for (const c of clips) {
        m.set(c.id, { projectId, thumbnailPath: c.thumbnailPath || null, renderPath: c.renderPath || null });
      }
    }
    return m;
  }, [allClips]);

  // Queue badge count: show unscheduled count (needs attention) — Phase 5 badge distinction.
  // Mirror QueueView's list filter (QueueView.js:505-535): exclude clips already
  // published/scheduled (tracked in trackerData by clipId or title) so the badge matches
  // the list (#139). Publishing never flips status out of "approved", so without this the
  // badge keeps counting already-published clips and inflates past the list count.
  const totalApproved = React.useMemo(() => {
    const trackedIds = new Set(trackerData.map((t) => t.clipId).filter(Boolean));
    const trackedTitles = new Set(trackerData.map((t) => t.title).filter(Boolean));
    return Object.values(allClips).flat().filter((c) =>
      (c.status === "approved" || c.status === "ready")
      && !c.scheduledAt
      && !trackedIds.has(c.id)
      // #240: imports dedupe by id only — mirrors QueueView's list filter
      // (OpusClip-era titles repeat; title-matching would hide siblings).
      // #306: reposts are exempt from the title knockout for the same reason
      // QueueView exempts them — a repost deliberately repeats its title.
      && (c.source === "import" || c.repostOf || !trackedTitles.has(c.title))
    ).length;
  }, [allClips, trackerData]);

  // #248: the Sentry breadcrumb makes tab changes visible on feedback reports
  // and crashes — same trail the PostHog capture feeds, one line richer.
  const nav = (id) => { setView(id); setSelProj(null); try { posthog.capture("clipflow_tab_changed", { tab_name: id }); Sentry.addBreadcrumb({ category: "ui.tab", message: `Tab → ${id}`, level: "info" }); } catch (_) {} };

  // Bumped by RenameView after a rename batch — RecordingsView reloads its
  // SQLite-backed list on change (it otherwise only loads on mount).
  const [recordingsRefreshKey, setRecordingsRefreshKey] = useState(0);

  const navItems = [
    { id: "rename", icon: "\u270f\ufe0f", label: "Rename" },
    { id: "recordings", icon: "\u2b06\ufe0f", label: "Recordings" },
    { id: "projects", icon: "\ud83d\udcc1", label: "Projects" },
    { id: "editor", icon: "\ud83c\udfac", label: "Editor" },
    { id: "queue", icon: "\ud83d\udccb", label: "Queue", badge: totalApproved },
    { id: "tracker", icon: "\ud83d\udcca", label: "Tracker" },
    { id: "settings", icon: "\u2699\ufe0f", label: "Settings" },
  ];

  // ClipBrowser is rendered conditionally because it's per-project — entering a
  // different project mounts a fresh tree, which is the right behavior. Every
  // other persistent tab is always-mounted in its own scroll container below
  // to preserve scrollTop across tab switches (#33).
  const renderClipBrowser = () => {
    if (view !== "clips" || !selProj) return null;
    const fromList = localProjects.find((p) => p.id === selProj.id);
    const proj = (selProj.clips?.length > 0) ? selProj : (fromList?.clips?.length > 0 ? fromList : selProj);
    if (!proj) return null;
    return (
      <ClipBrowser
        project={proj}
        trackerData={trackerData}
        onBack={() => { setSelProj(null); setView("projects"); }}
        onUpdateClip={handleUpdateClip}
        onUpdateClipFields={handleUpdateClipFields}
        onTranscript={setTranscript}
        onEditClipTitle={handleEditClipTitle}
        onOpenInEditor={handleOpenInEditor}
        gamesDb={gamesDb}
        onBatchRender={async (projectId) => {
          try {
            const full = await window.clipflow.projectLoad(projectId);
            if (full?.project) setSelProj(full.project);
          } catch (e) { /* ignore */ }
        }}
        onDeleteClip={async (projectId, clipId) => {
          try {
            const r = await window.clipflow.projectDeleteClip(projectId, clipId);
            if (r?.error) { console.error("Delete clip failed:", r.error); return; }
            const full = await window.clipflow.projectLoad(projectId);
            if (full?.project) {
              setLocalProjects((prev) => prev.map((p) => p.id === projectId ? full.project : p));
              setSelProj((prev) => prev && prev.id === projectId ? full.project : prev);
            }
          } catch (e) { console.error("Delete clip failed:", e); }
        }}
        gamesDb={gamesDb}
        scrollToClipId={returnClipId}
      />
    );
  };

  // Helper: per-tab scroll container style. flex:1 + display:block when active,
  // collapsed when inactive. display:none preserves scrollTop in Chromium.
  const tabPaneStyle = (active) => ({
    flex: active ? 1 : "0 0 0",
    overflow: "auto",
    scrollbarGutter: "stable",
    display: active ? "block" : "none",
  });
  const showProjectsList = view === "projects" || (view === "clips" && !selProj);
  const showClipBrowser = view === "clips" && !!selProj;

  return (
    <div style={{ background: T.bg, height: "100vh", overflow: "hidden", color: T.text, fontFamily: T.font, display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}>
      {/* Draggable title bar with logo */}
      <div className="titlebar-drag" style={{ height: 36, flexShrink: 0, background: "rgba(10,11,16,0.8)", borderRadius: "8px 8px 0 0", display: "flex", alignItems: "center", paddingLeft: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}>
          <img src={clipflowMark} alt="" width={20} height={20} style={{ display: "block" }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: T.textSecondary, letterSpacing: "-0.2px" }}>Corva</span>
          {window.clipflow?.profile === "dev" && (
            <span style={{ fontSize: 9, fontWeight: 800, color: "#ff9500", background: "rgba(255,149,0,0.15)", border: "1px solid rgba(255,149,0,0.5)", padding: "1px 5px", borderRadius: 3, letterSpacing: "0.5px", marginLeft: 4 }}>DEV</span>
          )}
        </div>
      </div>
      <UpdateBanner />
      {/* #330: full-screen overlay on the first launch after an update — renders
          null on every other boot, so mounting it unconditionally is free */}
      <WhatsNewModal />
      {/* key: remount (→ re-check) when engine setup finishes, so the whisper
          issue clears from the banner without a manual "Check again" */}
      <DependencyBanner
        key={engineSetupNeeded ? "deps-engine-pending" : "deps-engine-ok"}
        onFinishSetup={() => setEngineSetupOpen(true)}
      />
      <PublishFailureBanner
        alerts={publishAlerts}
        onReview={() => { setQueueFocusFailed((n) => n + 1); nav("queue"); setPublishAlerts([]); }}
        onDismiss={() => setPublishAlerts([])}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: "0 0 8px 8px" }}>
        {/* Each persistent tab is always-mounted with its OWN scroll container so
            scrollTop is preserved per-tab across switches (#33). display:none keeps
            scrollTop in Chromium. Editor is the only conditional non-clip view —
            it's heavy and per-clip. ClipBrowser is per-project and resets each entry. */}
        <div style={tabPaneStyle(view === "rename")}>
          <div style={{ padding: "32px 40px", maxWidth: 860, margin: "0 auto" }}>
            <RenameView
              gamesDb={gamesDb}
              mainGameName={mainGame}
              pendingRenames={pendingRenames}
              setPendingRenames={setPendingRenames}
              renameHistory={renameHistory}
              setRenameHistory={setRenameHistory}
              onAddGame={(entryType) => setShowAddGame(typeof entryType === "string" ? entryType : "game")}
              onGameDayUpdate={handleGameDayUpdate}
              watchFolder={watchFolder}
              testWatchFolder={testWatchFolder}
              onFilesRenamed={() => setRecordingsRefreshKey((k) => k + 1)}
              onNavigate={nav}
            />
          </div>
        </div>
        <div style={tabPaneStyle(view === "recordings")}>
          <div style={{ padding: "32px 40px", margin: "0 auto" }}>
            <RecordingsView
              gamesDb={gamesDb}
              localProjects={localProjects}
              testWatchFolder={testWatchFolder}
              refreshKey={recordingsRefreshKey}
              isActive={view === "recordings"}
              onPlayStyleSaved={handlePlayStyleSaved}
              onOpenSourcePreview={handleOpenSourcePreview}
              onProjectCreated={(projectId) => {
                window.clipflow?.projectList().then((result) => {
                  if (result?.projects) setLocalProjects(result.projects);
                });
              }}
            />
          </div>
        </div>
        <div style={tabPaneStyle(view === "queue")}>
          <div style={{ padding: "32px 40px", maxWidth: 1120, margin: "0 auto" }}>
            <QueueView
              allClips={allClips}
              localProjects={localProjects}
              setLocalProjects={setLocalProjects}
              onRepostClip={handleRepostClip}
              mainGame={mainGame}
              mainGameTag={mainGameTag}
              platforms={platforms}
              trackerData={trackerData}
              setTrackerData={setTrackerData}
              weeklyTemplate={weeklyTemplate}
              weekTemplateOverrides={weekTemplateOverrides}
              ytDescriptions={ytDescriptions}
              setYtDescriptions={setYtDescriptions}
              captionTemplates={captionTemplates}
              setCaptionTemplates={setCaptionTemplates}
              streamSchedule={streamSchedule}
              platformOptions={platformOptions}
              setPlatformOptions={setPlatformOptions}
              gamesDb={gamesDb}
              awardXp={awardXp}
              onOpenInEditor={handleOpenQueueClipInEditor}
              onCreateGame={handleNewGame}
              onScheduledPublishFailure={(alert) => setPublishAlerts((prev) => [...prev, alert])}
              refreshOauthAccounts={refreshOauthAccounts}
              focusFailedSignal={queueFocusFailed}
            />
          </div>
        </div>
        <div style={tabPaneStyle(view === "tracker")}>
          <div style={{ padding: "32px 40px", maxWidth: 960, margin: "0 auto" }}>
            <TrackerView
              mainGame={mainGame}
              setMainGame={setMainGame}
              mainGameTag={mainGameTag}
              trackerData={trackerData}
              setTrackerData={setTrackerData}
              weeklyTemplate={weeklyTemplate}
              setWeeklyTemplate={setWeeklyTemplate}
              weekTemplateOverrides={weekTemplateOverrides}
              setWeekTemplateOverrides={setWeekTemplateOverrides}
              savedTemplates={savedTemplates}
              setSavedTemplates={setSavedTemplates}
              gamesDb={gamesDb}
              weeklyTarget={weeklyTarget}
              setWeeklyTarget={setWeeklyTarget}
              weekMeta={weekMeta}
              setWeekMeta={setWeekMeta}
              xpLedger={xpLedger}
              awardXp={awardXp}
              streakState={streakState}
              scheduledClips={scheduledClips}
              needsRetryClips={needsRetryClips}
              gameArt={gameArt}
              clipIndex={trackerClipIndex}
              onOpenInEditor={handleOpenTrackerClipInEditor}
              onOpenQueue={() => setView("queue")}
              // #282: dragging a scheduled clip onto another slot rewrites its
              // scheduledAt through the same optimistic-then-persist path every other
              // clip field uses, so the Queue's scheduler picks up the new time.
              onRescheduleClip={(projectId, clipId, scheduledAt) => handleUpdateClipFields(projectId, clipId, { scheduledAt })}
              onRepostClip={handleRepostClip}
            />
          </div>
        </div>
        <div style={tabPaneStyle(view === "settings")}>
          <div style={{ padding: "32px 40px", maxWidth: 860, margin: "0 auto" }}>
            <SettingsView
              mainGame={mainGame}
              setMainGame={setMainGame}
              mainPool={mainPool}
              setMainPool={setMainPool}
              gamesDb={gamesDb}
              setGamesDb={setGamesDb}
              onEditGame={handleEditGame}
              onAddGame={(entryType) => setShowAddGame(typeof entryType === "string" ? entryType : "game")}
              watchFolder={watchFolder}
              setWatchFolder={setWatchFolder}
              testWatchFolder={testWatchFolder}
              setTestWatchFolder={setTestWatchFolder}
              platforms={platforms}
              setPlatforms={setPlatforms}
              outputFolder={outputFolder}
              setOutputFolder={setOutputFolder}
              audioFolders={audioFolders}
              setAudioFolders={setAudioFolders}
              mediaFolders={mediaFolders}
              setMediaFolders={setMediaFolders}
              anthropicApiKey={anthropicApiKey}
              setAnthropicApiKey={setAnthropicApiKey}
              geminiApiKey={geminiApiKey}
              setGeminiApiKey={setGeminiApiKey}
              gatewayUrl={gatewayUrl}
              setGatewayUrl={setGatewayUrl}
              gatewayAuthToken={gatewayAuthToken}
              setGatewayAuthToken={setGatewayAuthToken}
              hasBundledGatewayToken={hasBundledGatewayToken}
              youtubeClientId={youtubeClientId}
              setYoutubeClientId={setYoutubeClientId}
              youtubeClientSecret={youtubeClientSecret}
              setYoutubeClientSecret={setYoutubeClientSecret}
              metaAppId={metaAppId}
              setMetaAppId={setMetaAppId}
              metaAppSecret={metaAppSecret}
              setMetaAppSecret={setMetaAppSecret}
              instagramAppId={instagramAppId}
              setInstagramAppId={setInstagramAppId}
              instagramAppSecret={instagramAppSecret}
              setInstagramAppSecret={setInstagramAppSecret}
              tiktokClientKey={tiktokClientKey}
              setTiktokClientKey={setTiktokClientKey}
              tiktokClientSecret={tiktokClientSecret}
              setTiktokClientSecret={setTiktokClientSecret}
              styleGuide={styleGuide}
              setStyleGuide={setStyleGuide}
              requireHashtagInTitle={requireHashtagInTitle}
              setRequireHashtagInTitle={setRequireHashtagInTitle}
              streamSchedule={streamSchedule}
              setStreamSchedule={setStreamSchedule}
              collapsedGroups={settingsCollapsed}
              setCollapsedGroups={setSettingsCollapsed}
              isActive={view === "settings"}
            />
          </div>
        </div>
        <div style={tabPaneStyle(showProjectsList)}>
          <div style={{ padding: "32px 40px", maxWidth: 860, margin: "0 auto" }}>
            <ProjectsListView
              // #240: synthetic per-game import containers are queue plumbing,
              // not review targets — 300 imported clips must not flood this tab.
              localProjects={localProjects.filter((p) => p.kind !== "import")}
              setLocalProjects={setLocalProjects}
              projectFolders={projectFolders}
              activeFolder={activeFolder}
              onSelectFolder={setActiveFolder}
              onFoldersChanged={refreshFolders}
              onSelect={handleSelectProject}
              onDeleteProjects={handleDeleteProjects}
              mainGame={mainGame}
              gamesDb={gamesDb}
              gameArt={gameArt}
              trackerData={trackerData}
            />
          </div>
        </div>
        {/* ClipBrowser — per-project; conditional render so each project is fresh */}
        {showClipBrowser && (
          <div style={{ flex: 1, overflow: "auto", scrollbarGutter: "stable" }}>
            <div style={{ padding: "32px 40px", maxWidth: 860, margin: "0 auto" }}>
              {renderClipBrowser()}
            </div>
          </div>
        )}
        {/* Editor — full-pane sibling, only mounted when active */}
        {view === "editor" && (
          <div style={{ flex: 1, overflow: "hidden", height: "100%" }}>
            <EditorView gamesDb={gamesDb} editorContext={editorContext} localProjects={localProjects} styleGuide={styleGuide} requireHashtagInTitle={requireHashtagInTitle} renderJob={renderJob} onCancelRenderJob={cancelRenderJob} onBack={async () => {
              if (editorContext?.projectId) {
                try {
                  const full = await window.clipflow.projectLoad(editorContext.projectId);
                  if (full?.project) {
                    setLocalProjects((prev) => prev.map((p) => p.id === editorContext.projectId ? full.project : p));
                    setSelProj((prev) => prev && prev.id === editorContext.projectId ? full.project : prev);
                  }
                } catch (e) { console.error("Failed to refresh project after editor:", e); }
              }
              // #125: source-preview opened from Recordings → return there, not Clips.
              // #204: a Queue row sets from:"queue" for the same reason.
              const backTo = editorContext?.sourcePreviewPath ? "recordings" : (editorContext?.from || "clips");
              setReturnClipId(editorContext?.clipId || null); // land the clip list on this clip
              setEditorContext(null); setView(backTo);
            }} onClipRendered={async (projectId) => {
              try {
                const full = await window.clipflow.projectLoad(projectId);
                if (full?.project) {
                  setLocalProjects((prev) => prev.map((p) => p.id === projectId ? full.project : p));
                  setSelProj((prev) => prev && prev.id === projectId ? full.project : prev);
                }
              } catch (e) { console.error("Failed to refresh project after render:", e); }
            }} />
          </div>
        )}
        <Sidebar
          navItems={navItems}
          activeView={view === "clips" ? "projects" : view}
          onNavigate={nav}
        />
      </div>
      {/* Floating render pill — a render runs in the main process and outlives
          the editor, so outside the editor this is the only progress/cancel
          surface. Inside the editor the topbar pill covers it. */}
      {renderJob && view !== "editor" && (
        <div style={{ position: "fixed", bottom: 20, right: 24, zIndex: 950, display: "flex", alignItems: "center", gap: 10, padding: "9px 12px 9px 14px", borderRadius: 10, background: renderJob.error ? "linear-gradient(135deg, #7f1d1d, #b91c1c)" : "linear-gradient(135deg, #854d0e, #ca8a04, #eab308)", boxShadow: "0 8px 24px rgba(0,0,0,0.45)", fontFamily: T.font, color: "#fff" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 150 }}>
            <span style={{ fontSize: 12, fontWeight: 700, maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {renderJob.error ? "Render failed" : renderJob.canceling ? "Canceling…" : renderJob.done ? "Rendered!" : `Rendering${renderJob.clipTitle ? ` “${renderJob.clipTitle}”` : ""} ${renderJob.pct || 0}%`}
            </span>
            {!renderJob.done && !renderJob.canceling && (
              <div style={{ width: "100%", height: 4, background: "rgba(0,0,0,0.3)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${renderJob.pct || 0}%`, background: "#fff", borderRadius: 999, transition: "width 0.3s" }} />
              </div>
            )}
            <span style={{ fontSize: 10, opacity: 0.85, maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {renderJob.waiting > 0 ? `${renderJob.detail || ""} · ${renderJob.waiting} waiting` : (renderJob.detail || "")}
            </span>
          </div>
          {!renderJob.done && (
            <button onClick={() => cancelRenderJob(renderJob.clipId)} disabled={renderJob.canceling} title="Cancel current render" style={{ background: "rgba(0,0,0,0.25)", border: "none", color: "#fff", width: 22, height: 22, borderRadius: 6, cursor: renderJob.canceling ? "default" : "pointer", fontSize: 12, lineHeight: 1, opacity: renderJob.canceling ? 0.5 : 1 }}>✕</button>
          )}
        </div>
      )}
      {onboardingComplete === false && (
        <OnboardingView onComplete={(profile) => {
          setOnboardingComplete(true);
        }} />
      )}
      {/* #146: engine setup waits its turn behind onboarding, then overlays
          everything until finished or explicitly deferred ("Set up later"). */}
      {onboardingComplete !== false && engineSetupOpen && (
        <EngineSetupView onClose={(completed) => {
          setEngineSetupOpen(false);
          if (completed) setEngineSetupNeeded(false);
        }} />
      )}
      <TranscriptModal clip={transcript} onClose={() => setTranscript(null)} />
      {(newGameExe || showAddGame) && (
        <AddGameModal
          exe={newGameExe}
          entryType={showAddGame || "game"}
          onConfirm={handleNewGame}
          onDismiss={() => { setNewGameExe(null); setShowAddGame(null); }}
          onIgnore={newGameExe ? (exe) => { setIgnoredProcesses((p) => [...p, exe]); setNewGameExe(null); } : null}
          aiReady={aiReady}
        />
      )}
      {/* #248: beta feedback reporter — overlays every tab, right edge */}
      <FeedbackBubble view={view} />
      {/* #246: transient toast — sits above the render pill when both show */}
      {toast && (
        <div style={{ position: "fixed", bottom: renderJob && view !== "editor" ? 92 : 20, right: 24, zIndex: 951, display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, background: T.surface, border: `1px solid ${T.greenBorder}`, boxShadow: "0 8px 24px rgba(0,0,0,0.45)", color: T.text, fontSize: 12.5, fontWeight: 600, fontFamily: T.font }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: T.green, boxShadow: `0 0 6px ${T.green}`, flexShrink: 0 }} />
          {toast}
        </div>
      )}
      {audioCalAsk && (
        <AudioCalibrationModal
          filePath={audioCalAsk.filePath}
          trackCount={audioCalAsk.trackCount}
          hasExisting={audioCalAsk.hasExisting}
          onComplete={(setup) => respondAudioCal(setup)}
          onCancel={() => respondAudioCal(null)}
        />
      )}
      {degradeAsk && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius?.md || 10, padding: 24, maxWidth: 520, width: "90%", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ color: T.text, fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
              ⚠️ Signal extraction failed
            </div>
            <div style={{ color: T.textSecondary, fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
              {degradeAsk.failed.length} of 5 signal{degradeAsk.failed.length === 1 ? "" : "s"} failed during extraction. Generating clips now will rely on the surviving signals only — quality may degrade.
            </div>
            <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 12px", marginBottom: 16, fontSize: 12, fontFamily: T.mono, color: T.textTertiary, maxHeight: 140, overflowY: "auto" }}>
              {degradeAsk.failed.map((f, i) => (
                <div key={i} style={{ padding: "2px 0" }}>
                  <span style={{ color: T.red }}>❌</span>{" "}
                  <span style={{ color: T.text }}>{f.signal}</span>
                  <span style={{ color: T.textTertiary }}> &mdash; {f.failureReason}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => respondDegrade(false)}
                style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}
              >
                Cancel pipeline
              </button>
              <button
                onClick={() => respondDegrade(true)}
                style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid rgba(250,204,21,0.4)`, background: "rgba(250,204,21,0.16)", color: "#facc15", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: T.font }}
              >
                Generate clips anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
