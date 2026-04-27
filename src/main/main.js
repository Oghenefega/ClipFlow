require("dotenv").config();
const Sentry = require("@sentry/electron/main");

Sentry.init({
  dsn: "https://849738274a045a047fd2068789244d13@o4511147466752000.ingest.us.sentry.io/4511147471077376",
});

// Suppress EPIPE errors from Sentry/electron-log writing to a closed stdout pipe on quit
process.on("uncaughtException", (err) => {
  if (err.code === "EPIPE") return;
  // Re-throw non-EPIPE errors so Sentry still captures them
  throw err;
});

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const chokidar = require("chokidar");
const { createStore } = require("./store-factory");
const ffmpeg = require("./ffmpeg");
const whisper = require("./whisper");
const projects = require("./projects");
const highlights = require("./highlights");
const render = require("./render");
const aiPipeline = require("./ai-pipeline");
const database = require("./database");
const feedbackDb = require("./feedback");
const namingPresets = require("./naming-presets");
const fileMigration = require("./file-migration");
const gameProfiles = require("./game-profiles");
const pipelineLogger = require("./pipeline-logger");
const tokenStore = require("./token-store");
const tiktokOAuth = require("./oauth/tiktok");
const tiktokPublish = require("./oauth/tiktok-publish");
const metaOAuth = require("./oauth/meta");
const instagramOAuth = require("./oauth/instagram-oauth");
const instagramPublish = require("./oauth/instagram-publish");
const facebookPublish = require("./oauth/facebook-publish");
const youtubeOAuth = require("./oauth/youtube");
const youtubePublish = require("./oauth/youtube-publish");
const publishLog = require("./publish-log");
const logger = require("./logger");
const llmProvider = require("./ai/llm-provider");
const aiPrompt = require("./ai-prompt");
const transcriptionProvider = require("./ai/transcription-provider");
// Load provider adapters (self-register on require)
require("./ai/providers/anthropic");
require("./ai/providers/openai-compat");
require("./ai/transcription/stable-ts");
const { uuid } = require("./uuid");

/**
 * Generate a clip title from its transcript segments.
 * Picks the most energetic/emotional phrase, or falls back to the first sentence.
 * @param {Array} clipSubtitles - Subtitle segments for the clip
 * @param {object} highlight - Highlight data { score, reason }
 * @returns {string} Generated title
 */
function generateClipTitle(clipSubtitles, highlight) {
  if (!clipSubtitles || clipSubtitles.length === 0) return "";

  // Collect all text and score each segment for emotional intensity
  const hypeIndicators = [
    "oh my god", "omg", "what the", "no way", "how did", "let's go",
    "are you kidding", "holy", "insane", "crazy", "clutch", "wait what",
    "i can't", "oh no", "dude", "bro", "bruh", "literally", "actually",
    "did you see", "that was", "killed", "destroyed", "nice", "sick",
  ];

  let bestSeg = null;
  let bestScore = -1;

  for (const seg of clipSubtitles) {
    const text = (seg.text || "").trim();
    if (!text || text.length < 5) continue;

    let score = 0;
    const lower = text.toLowerCase();

    // Score hype words
    for (const hw of hypeIndicators) {
      if (lower.includes(hw)) score += 10;
    }

    // Score exclamation marks and question marks (emotional punctuation)
    score += (text.match(/!/g) || []).length * 5;
    score += (text.match(/\?/g) || []).length * 3;

    // Score ALL CAPS words
    score += (text.match(/\b[A-Z]{2,}\b/g) || []).length * 4;

    // Prefer medium-length phrases (not too short, not too long)
    const wordCount = text.split(/\s+/).length;
    if (wordCount >= 3 && wordCount <= 10) score += 5;

    if (score > bestScore) {
      bestScore = score;
      bestSeg = seg;
    }
  }

  // Fall back to the first segment with meaningful text
  if (!bestSeg) {
    bestSeg = clipSubtitles.find((s) => (s.text || "").trim().length >= 5) || clipSubtitles[0];
  }

  let title = (bestSeg.text || "").trim();

  // Clean up: remove leading/trailing punctuation fragments, cap length
  title = title.replace(/^[,.\s]+|[,.\s]+$/g, "");

  // If too long, take the first sentence or phrase
  if (title.length > 60) {
    const sentenceEnd = title.search(/[.!?]/);
    if (sentenceEnd > 10 && sentenceEnd < 60) {
      title = title.substring(0, sentenceEnd + 1);
    } else {
      // Take first ~8 words
      title = title.split(/\s+/).slice(0, 8).join(" ");
    }
  }

  // Title case
  title = title.replace(/\b\w/g, (c) => c.toUpperCase());

  return title;
}

// electron-store v11 is ESM-only. `store` is constructed asynchronously inside
// the app.whenReady() bootstrap below. IPC handler registrations at module-top
// close over this binding; their bodies only fire after the renderer loads,
// which is after whenReady completes and `store` is assigned.
let store;

const STORE_DEFAULTS = {
  watchFolder: "W:\\YouTube Gaming Recordings Onward\\Vertical Recordings Onwards",
  testWatchFolder: "",
  mainGame: "Arc Raiders",
  mainPool: ["Arc Raiders", "Rocket League", "Valorant"],
  gamesDb: [
    { name: "Arc Raiders", tag: "AR", exe: ["ArcRaiders.exe"], color: "#ff6b35", dayCount: 0, hashtag: "arcraiders" },
    { name: "Rocket League", tag: "RL", exe: ["RocketLeague.exe"], color: "#00b4d8", dayCount: 0, hashtag: "rocketleague" },
    { name: "Valorant", tag: "Val", exe: ["VALORANT-Win64-Shipping.exe"], color: "#ff4655", dayCount: 0, hashtag: "valorant" },
    { name: "Egging On", tag: "EO", exe: ["EggingOn.exe"], color: "#ffd23f", dayCount: 0, hashtag: "eggingon" },
    { name: "Deadline Delivery", tag: "DD", exe: ["DeadlineDelivery.exe"], color: "#fca311", dayCount: 0, hashtag: "deadlinedelivery" },
    { name: "Bionic Bay", tag: "BB", exe: ["BionicBay.exe"], color: "#06d6a0", dayCount: 0, hashtag: "bionicbay" },
    { name: "Prince of Persia", tag: "PoP", exe: ["PrinceOfPersia.exe"], color: "#9b5de5", dayCount: 0, hashtag: "princeofpersia" },
  ],
  ignoredProcesses: ["explorer.exe", "steamwebhelper.exe", "dwm.exe", "ShellExperienceHost.exe", "zen.exe"],
  platforms: [],
  weeklyTemplate: {
    Monday: ["main","main","main","main","main","main","main","main"],
    Tuesday: ["main","other","main","other","main","other","main","main"],
    Wednesday: ["main","other","other","main","other","other","other","main"],
    Thursday: ["main","other","other","main","other","other","main","main"],
    Friday: ["main","other","other","main","other","other","other","main"],
    Saturday: ["main","other","main","other","main","other","main","main"],
  },
  trackerData: [],
  captionTemplates: {
    tiktok: "{title} #{gametitle} #fyp #gamingontiktok #fega #fegagaming",
    instagram: "{title} #{gametitle} #reels #gamingreels #fega #fegagaming",
    facebook: "{title} #{gametitle} #gaming #fbreels #fega #fegagaming",
  },
  ytDescriptions: {},
  outputFolder: "",
  sfxFolder: "",
  whisperModel: "large-v3-turbo",
  whisperPythonPath: "",
  localProjects: [],
  renameHistory: [],
  anthropicApiKey: "",
  gatewayUrl: "https://gateway.ai.cloudflare.com/v1/58332e30c2b9ef9de6c53d37ee9fd3dc/clipflow-prod/anthropic",
  gatewayAuthToken: "",
  youtubeClientId: "",
  youtubeClientSecret: "",
  metaAppId: "",
  metaAppSecret: "",
  tiktokClientKey: "",
  tiktokClientSecret: "",
  styleGuide: "",
  titleCaptionHistory: [],
  creatorProfile: {
    archetype: "variety",
    description: "",
    signaturePhrases: [],
    momentPriorities: ["funny", "clutch", "emotional", "fails", "skillful", "educational"],
  },
  onboardingComplete: false,
  // Video splitting
  splitThresholdMinutes: 30,
  autoSplitEnabled: true,
  splitSourceRetention: "keep",
  // Audio track selection for transcription (0-indexed: 0 = track 1, 1 = track 2, etc.)
  transcriptionAudioTrack: 0,
  // Project folders
  projectFolders: [],
  folderSortMode: "created",
  // Analytics
  deviceId: "",
  analyticsEnabled: true,
  // Pipeline quality — strict mode aborts the pipeline if any Lever 1 signal fails.
  // Default ON: no silent degradation. User can turn off in Settings.
  strictMode: true,
  // YAMNet silence skip — pre-filter frames below 0.002 RMS (true silence /
  // below room tone) to skip wasted inference. Default ON. User can turn off
  // in Settings to force YAMNet to run on every frame regardless of volume.
  yamnetSilenceSkip: true,
};

function runStoreMigrations(store) {
  // ── Migration: analytics deviceId (generate once, persist forever) ──
  if (!store.get("deviceId")) {
    store.set("deviceId", uuid());
  }
  if (store.get("analyticsEnabled") === undefined) {
    store.set("analyticsEnabled", true);
  }

  // ── Migration: add provider config defaults ──
  if (!store.has("llmProvider")) store.set("llmProvider", "anthropic");
  if (!store.has("llmProviderConfig")) store.set("llmProviderConfig", {});
  if (!store.has("transcriptionProvider")) store.set("transcriptionProvider", "stable-ts");
  if (!store.has("devMode")) store.set("devMode", false);

  // ── Migration: add video splitting settings ──
  if (!store.has("splitThresholdMinutes")) store.set("splitThresholdMinutes", 30);
  if (!store.has("autoSplitEnabled")) store.set("autoSplitEnabled", true);
  if (!store.has("splitSourceRetention")) store.set("splitSourceRetention", "keep");

  // ── Migration: add transcription audio track setting ──
  if (!store.has("transcriptionAudioTrack")) store.set("transcriptionAudioTrack", 0);
  // ── Migration: fix default audio track from game (1) to mic (0) — one-time ──
  if (!store.has("_migrated_audioTrack_v2") && store.get("transcriptionAudioTrack") === 1) {
    store.set("transcriptionAudioTrack", 0);
    store.set("_migrated_audioTrack_v2", true);
  }

  // ── Migration: expand momentPriorities from 4 to 6 items ──
  // Adds "skillful" and "educational" for users who set up before this update.
  const existingProfile = store.get("creatorProfile");
  if (existingProfile && existingProfile.momentPriorities) {
    const mp = existingProfile.momentPriorities;
    let changed = false;
    if (!mp.includes("skillful")) { mp.push("skillful"); changed = true; }
    if (!mp.includes("educational")) { mp.push("educational"); changed = true; }
    if (changed) {
      store.set("creatorProfile.momentPriorities", mp);
      logger.info(logger.MODULES.system, "Migrated momentPriorities: added skillful + educational");
    }
  }

  // ── Migration: auto-complete onboarding for existing users with configured profiles ──
  // If the user already has a non-empty description (e.g. Fega's migrated profile),
  // they've effectively already configured their profile — skip onboarding.
  if (!store.get("onboardingComplete") && existingProfile && existingProfile.description) {
    store.set("onboardingComplete", true);
    logger.info(logger.MODULES.system, "Auto-completed onboarding for existing configured profile");
  }

  // ── Migration: remove stale whisper.cpp store keys ──
  if (store.has("whisperBinaryPath")) store.delete("whisperBinaryPath");
  if (store.has("whisperModelPath")) store.delete("whisperModelPath");

  // ── Migration: clear hardcoded placeholder platforms ──
  // Old defaults had Fega's personal account names. New system uses OAuth-connected accounts.
  const currentPlatforms = store.get("platforms");
  if (Array.isArray(currentPlatforms) && currentPlatforms.length > 0) {
    const isPlaceholder = currentPlatforms.some((p) => p.name === "Fega" || p.name === "fega" || p.name === "thatguyfega" || p.name === "fegagaming" || p.name === "ThatGuy" || p.name === "Fega Gaming");
    if (isPlaceholder) {
      store.set("platforms", []);
      logger.info(logger.MODULES.system, "Cleared hardcoded placeholder platforms (migration)");
    }
  }

  // ── Migration: add project folders ──
  if (!store.has("projectFolders")) store.set("projectFolders", []);
  if (!store.has("folderSortMode")) store.set("folderSortMode", "created");

  // ── Migration: strict mode default ON (Issue #72 Phase 1) ──
  // Existing installs that never had this key get the safe default. If the user
  // has explicitly toggled it (true or false), `store.has` is true so we leave
  // their choice alone.
  if (!store.has("strictMode")) store.set("strictMode", true);

  // ── Migration: yamnet silence-skip default ON (Issue #72 Phase 3) ──
  // Existing installs get the safe default; user choice is preserved if set.
  if (!store.has("yamnetSilenceSkip")) store.set("yamnetSilenceSkip", true);
}

let mainWindow;
let watcher = null;
let testWatcher = null;

// Pending imports — suppresses chokidar for drag-and-drop copies
// Entries: { filename: string, sizeBytes: number }
const pendingImports = new Set();

// Thumbnail cache — maps filePath to { thumbDir, thumbnails, duration }
// Cleaned up on app quit
const thumbnailCache = new Map();

const isDev = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 700,
    backgroundColor: "#0a0b10",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0a0b10",
      symbolColor: "#edeef2",
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // H3 (#49): sandbox: true is the OS-level defense-in-depth wall.
      // contextIsolation stops the page reaching preload globals; CSP (H2, #48)
      // stops attacker code loading in the first place; sandbox is what prevents
      // exfiltration of user files if both above ever fail. The preload uses
      // only electron APIs (contextBridge, ipcRenderer, webUtils) and Sentry's
      // sandbox-aware preload entry — no raw Node modules.
      sandbox: true,
    },
    icon: path.join(__dirname, "../../public/icon.png"),
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../build/index.html"));
    if (process.env.CLIPFLOW_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  }

  // Dev-only: force DevTools + forward renderer console to disk log for debugging.
  // Production renderer crashes are tracked via Sentry instead.
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
    const debugLogPath = path.join(app.getPath("userData"), "trim-debug.log");
    try { fs.writeFileSync(debugLogPath, `=== Session ${new Date().toISOString()} ===\n`); } catch (e) {}
    mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
      const levels = ["LOG", "WARN", "ERROR", "INFO"];
      const tag = levels[level] || `L${level}`;
      try {
        fs.appendFileSync(debugLogPath, `[${tag}] ${message}  (${sourceId}:${line})\n`);
      } catch (e) {}
    });
    mainWindow.webContents.on("render-process-gone", (_e, details) => {
      try { fs.appendFileSync(debugLogPath, `[RENDER-GONE] ${JSON.stringify(details)}\n`); } catch (e) {}
    });
    console.log("[DEBUG] trim-debug.log →", debugLogPath);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Detect renderer process crash — log to main process and attempt reload
  mainWindow.webContents.on("render-process-gone", (event, details) => {
    logger.error(logger.MODULES.system, `Renderer process gone: ${details.reason} (exit code: ${details.exitCode})`);
    // Attempt to reload unless it was intentional
    if (details.reason !== "clean-exit" && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reload();
    }
  });
  mainWindow.webContents.on("unresponsive", () => {
    logger.error(logger.MODULES.system, "Renderer became unresponsive");
  });
  mainWindow.webContents.on("responsive", () => {
    logger.info(logger.MODULES.system, "Renderer became responsive again");
  });
}

app.whenReady().then(async () => {
  // Initialize electron-log (must happen before BrowserWindow creation)
  logger.initialize();
  // Log app startup
  logger.info(logger.MODULES.system, "App started", {
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    logsDir: logger.getLogsDir(),
  });

  // ── Bootstrap electron-store (v11 is ESM-only, requires async import) ──
  // Order: settings store → migrations → provider registries → sub-stores.
  // All IPC handlers registered at module-top close over these bindings;
  // handler bodies only fire after createWindow() renders the UI, which
  // happens below after this block completes.
  store = await createStore({ name: "clipflow-settings", defaults: STORE_DEFAULTS });
  runStoreMigrations(store);
  llmProvider.init(store);
  transcriptionProvider.init(store);
  await publishLog.init();
  await tokenStore.init();

  // Initialize shared SQLite database (feedback + file metadata)
  await database.init();

  // Run one-time migrations for rename redesign
  fileMigration.migrateStoreData(store);

  // #60: reconcile is_test flag against physical location on every startup.
  // Invariant: a file inside testWatchFolder has is_test=1; a file outside
  // has is_test=0. Idempotent — safe to run every launch; catches legacy rows
  // from before the is_test column and Explorer-made moves outside the app.
  //
  // We filter in JS instead of SQL LIKE because Windows paths contain
  // backslashes which conflict with SQL LIKE's ESCAPE semantics and make
  // pattern matching a pain to get right. File_metadata stays small (hundreds
  // of rows), so an in-memory scan is fine.
  try {
    const testRoot = store.get("testWatchFolder");
    const db = database.getDb();
    if (testRoot && db) {
      const prefix = (testRoot.endsWith("\\") || testRoot.endsWith("/") ? testRoot : testRoot + "\\").toLowerCase();
      const allRows = database.toRows(db.exec("SELECT id, current_path, is_test FROM file_metadata"));
      const toFlag = [];   // rows whose path is under testRoot but is_test != 1
      const toUnflag = []; // rows with is_test = 1 but path is outside testRoot (or missing)
      for (const row of allRows) {
        const p = (row.current_path || "").toLowerCase();
        const underTest = p && p.startsWith(prefix);
        if (underTest && row.is_test !== 1) toFlag.push(row.id);
        else if (!underTest && row.is_test === 1) toUnflag.push(row.id);
      }
      for (const id of toFlag) {
        db.run("UPDATE file_metadata SET is_test = 1, updated_at = datetime('now') WHERE id = ?", [id]);
      }
      for (const id of toUnflag) {
        db.run("UPDATE file_metadata SET is_test = 0, updated_at = datetime('now') WHERE id = ?", [id]);
      }
      if (toFlag.length > 0 || toUnflag.length > 0) {
        database.save();
        logger.info(logger.MODULES.system, `is_test reconciliation: +${toFlag.length} flagged, -${toUnflag.length} unflagged (testRoot=${testRoot})`);
      }
    }
  } catch (err) {
    logger.warn(logger.MODULES.system, `is_test reconciliation failed: ${err.message}`);
  }

  // Backfill missing file_size_bytes on existing rows. Older rename code paths
  // didn't record size, so the Recordings tab showed "0 B" for those clips.
  // Idempotent — only touches rows where size is NULL/0 and the file still
  // exists on disk.
  try {
    const db = database.getDb();
    if (db) {
      const rows = database.toRows(db.exec(
        "SELECT id, current_path FROM file_metadata WHERE (file_size_bytes IS NULL OR file_size_bytes = 0) AND current_path IS NOT NULL"
      ));
      let backfilled = 0;
      for (const row of rows) {
        try {
          const size = fs.statSync(row.current_path).size;
          if (size > 0) {
            db.run("UPDATE file_metadata SET file_size_bytes = ?, updated_at = datetime('now') WHERE id = ?", [size, row.id]);
            backfilled++;
          }
        } catch (_) { /* file missing on disk — skip */ }
      }
      if (backfilled > 0) {
        database.save();
        logger.info(logger.MODULES.system, `file_size_bytes backfill: ${backfilled} row(s) updated`);
      }
    }
  } catch (err) {
    logger.warn(logger.MODULES.system, `file_size_bytes backfill failed: ${err.message}`);
  }

  const watchFolder = store.get("watchFolder");
  if (watchFolder) {
    // Run file migration in background (non-blocking) — probes can be slow
    fileMigration.runFileMigration(watchFolder, store, async (filePath) => {
      try { return await ffmpeg.probe(filePath); } catch (e) { return null; }
    }).then((result) => {
      if (result.migrated > 0) {
        logger.info(logger.MODULES.system, `File migration: ${result.migrated} files migrated, ${result.skipped} skipped`);
      }
      if (result.errors.length > 0) {
        logger.warn(logger.MODULES.system, `File migration had ${result.errors.length} errors`, { errors: result.errors.slice(0, 5) });
      }
    }).catch((err) => {
      logger.error(logger.MODULES.system, `File migration failed: ${err.message}`);
    });
  }

  createWindow();
});

app.on("window-all-closed", () => {
  if (watcher) watcher.close();
  if (testWatcher) testWatcher.close();
  database.close();
  // Clean up cached thumbnail directories
  for (const [, cached] of thumbnailCache) {
    ffmpeg.cleanupThumbnailStrip(cached.thumbDir);
  }
  thumbnailCache.clear();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ============ IPC HANDLERS ============

// File system: pick folder
ipcMain.handle("dialog:pickFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// File system: read directory
ipcMain.handle("fs:readDir", async (_, dirPath) => {
  try {
    const files = fs.readdirSync(dirPath);
    return files.map((name) => {
      const fullPath = path.join(dirPath, name);
      const stat = fs.statSync(fullPath);
      return {
        name,
        path: fullPath,
        isDirectory: stat.isDirectory(),
        size: stat.size,
        createdAt: stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString(),
      };
    });
  } catch (err) {
    return { error: err.message };
  }
});

// File system: rename file
ipcMain.handle("fs:renameFile", async (_, oldPath, newPath) => {
  try {
    // Ensure target directory exists
    const dir = path.dirname(newPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.renameSync(oldPath, newPath);
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

// File system: check if file exists
ipcMain.handle("fs:exists", async (_, filePath) => {
  return fs.existsSync(filePath);
});

// File system: read file as text (for OBS logs, CSVs)
ipcMain.handle("fs:readFile", async (_, filePath) => {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    return { error: err.message };
  }
});

// File system: write file
ipcMain.handle("fs:writeFile", async (_, filePath, content) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

// File watcher: recording folder detection (watches the folder OBS writes .mp4/.mkv into)
// Raw recording filenames: YYYY-MM-DD HH-MM-SS[optional -vertical].(mp4|mkv)
// Already-renamed files like "2026-02-06 AR Day25 Pt18.mp4" do NOT match
const RAW_RECORDING_PATTERN = /^\d{4}-\d{2}-\d{2}[ _]\d{2}-\d{2}-\d{2}(-vertical)?\.(mp4|mkv)$/i;

// Prevents starting a second stability check while the first is still running for the same file.
const stabilityChecksInFlight = new Set();

/**
 * Poll a file's size until it stops changing (or we time out / it disappears).
 * Equivalent in spirit to chokidar's awaitWriteFinish, but owned by us — so
 * upgrading chokidar can never silently regress write-stability detection.
 *
 * @param {string} filePath
 * @param {object} [opts]
 * @param {number} [opts.intervalMs=1000]          Poll period
 * @param {number} [opts.requiredStableChecks=2]   Consecutive equal reads before "stable"
 * @param {number} [opts.maxWaitMs=1800000]        30-min ceiling; raw recordings can be very large
 * @returns {Promise<number|null>} stable size in bytes, or null if file vanished / never stabilized
 */
async function waitForStable(filePath, opts = {}) {
  const intervalMs = opts.intervalMs ?? 1000;
  const requiredStableChecks = opts.requiredStableChecks ?? 2;
  const maxWaitMs = opts.maxWaitMs ?? 30 * 60 * 1000;
  const started = Date.now();
  let lastSize = -1;
  let stableCount = 0;
  while (Date.now() - started < maxWaitMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    let size;
    try {
      size = fs.statSync(filePath).size;
    } catch {
      return null; // deleted or inaccessible mid-check
    }
    if (size > 0 && size === lastSize) {
      stableCount += 1;
      if (stableCount >= requiredStableChecks) return size;
    } else {
      stableCount = 0;
      lastSize = size;
    }
  }
  return null; // never stabilized within maxWaitMs
}

/**
 * Shared file detection handler for both main and test watchers.
 * Waits for the file to finish writing before notifying the renderer.
 * @param {string} filePath - Full path to the detected file
 * @param {string} addEvent - IPC event name to send on file add
 */
async function handleWatcherFileAdded(filePath, addEvent) {
  const name = path.basename(filePath);
  // Only pick up raw recordings; skip already-renamed files and non-video files
  if (!RAW_RECORDING_PATTERN.test(name)) return;

  // Dedup: chokidar can fire `add` more than once for the same path in edge cases
  if (stabilityChecksInFlight.has(filePath)) return;
  stabilityChecksInFlight.add(filePath);
  try {
    const stableSize = await waitForStable(filePath);
    if (stableSize === null) return; // file gone or never stabilized

    // pendingImports dedupe (drag-and-drop path owns this filename+size)
    for (const entry of pendingImports) {
      if (entry.filename === name && entry.sizeBytes === stableSize) return;
    }

    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return; // vanished between stabilize and stat
    }
    mainWindow?.webContents.send(addEvent, {
      name,
      path: filePath,
      size: stat.size,
      createdAt: stat.birthtime.toISOString(),
    });
  } finally {
    stabilityChecksInFlight.delete(filePath);
  }
}

/** Create a chokidar watcher on the given folder that emits on raw-recording file add/remove */
function createRecordingFolderWatcher(folderPath, addEvent, removeEvent) {
  const w = chokidar.watch(folderPath, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: false,
    depth: 0, // root folder only — do not recurse into monthly subfolders
    // NOTE: no awaitWriteFinish — we run our own stability check in handleWatcherFileAdded
    // so chokidar-version bumps cannot silently regress this behavior.
  });

  w.on("add", (fp) => { handleWatcherFileAdded(fp, addEvent); });

  w.on("unlink", (fp) => {
    stabilityChecksInFlight.delete(fp); // cancel any in-flight check for a deleted file
    mainWindow?.webContents.send(removeEvent, {
      name: path.basename(fp),
      path: fp,
    });
  });

  return w;
}

// Main watcher: start
ipcMain.handle("watcher:start", async (_, folderPath) => {
  if (watcher) watcher.close();
  watcher = createRecordingFolderWatcher(folderPath, "watcher:fileAdded", "watcher:fileRemoved");
  return { success: true };
});

// Main watcher: stop
ipcMain.handle("watcher:stop", async () => {
  if (watcher) { watcher.close(); watcher = null; }
  return { success: true };
});

// Test watcher: start (separate instance, separate IPC events)
ipcMain.handle("watcher:startTest", async (_, folderPath) => {
  if (!folderPath || !fs.existsSync(folderPath)) return { success: true };
  // Prevent watching the same folder as the main watcher
  const mainFolder = store.get("watchFolder");
  if (folderPath === mainFolder) return { error: "Test folder cannot be the same as the main watch folder" };
  if (testWatcher) testWatcher.close();
  testWatcher = createRecordingFolderWatcher(folderPath, "watcher:testFileAdded", "watcher:testFileRemoved");
  return { success: true };
});

// Test watcher: stop
ipcMain.handle("watcher:stopTest", async () => {
  if (testWatcher) { testWatcher.close(); testWatcher = null; }
  return { success: true };
});

// Shell: open folder in explorer
ipcMain.handle("shell:openFolder", async (_, folderPath) => {
  shell.openPath(folderPath);
});

// Shell: open the containing folder in Explorer and select the file
ipcMain.handle("shell:revealInFolder", async (_, filePath) => {
  shell.showItemInFolder(filePath);
});

// Dialog: save file (for CSV export)
ipcMain.handle("dialog:saveFile", async (_, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: options.defaultPath || "export.csv",
    filters: options.filters || [{ name: "CSV Files", extensions: ["csv"] }],
  });
  if (result.canceled) return null;
  return result.filePath;
});

// Dialog: open file (for CSV import)
ipcMain.handle("dialog:openFile", async (_, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: options.filters || [{ name: "CSV Files", extensions: ["csv"] }],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// ============ FFMPEG ============
ipcMain.handle("ffmpeg:checkInstalled", async () => {
  try { return await ffmpeg.checkFfmpeg(); }
  catch (err) { return { installed: false, error: err.message }; }
});

ipcMain.handle("ffmpeg:probe", async (_, filePath) => {
  try { return await ffmpeg.probe(filePath); }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle("ffmpeg:extractAudio", async (_, videoPath, wavPath) => {
  try {
    const audioTrack = store.get("transcriptionAudioTrack") ?? 0;
    return await ffmpeg.extractAudio(videoPath, wavPath, audioTrack);
  }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle("ffmpeg:cutClip", async (_, srcPath, outPath, startTime, endTime) => {
  try { return await ffmpeg.cutClip(srcPath, outPath, startTime, endTime); }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle("ffmpeg:thumbnail", async (_, videoPath, outPath, time) => {
  try { return await ffmpeg.generateThumbnail(videoPath, outPath, time); }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle("ffmpeg:analyzeLoudness", async (_, audioPath, segmentDuration) => {
  try { return await ffmpeg.analyzeLoudness(audioPath, segmentDuration); }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle("ffmpeg:extractWaveformPeaks", async (_, filePath, peakCount) => {
  try {
    const audioTrack = store.get("transcriptionAudioTrack") ?? 0;
    return await ffmpeg.extractWaveformPeaks(filePath, peakCount || 400, audioTrack);
  }
  catch (err) { return { error: err.message, peaks: [] }; }
});

// ============ WAVEFORM CACHE (source-file preview) ============
// Phase 4: the editor reads waveform peaks from the full source recording.
// Extraction over a 30-min file is 1.5–6s the first time, so cache to disk keyed
// by {sourceFile path, mtime, size}. Subsequent opens read JSON instantly.
ipcMain.handle("waveform:extractCached", async (_, projectId, sourceFilePath, durationSec) => {
  const t0 = Date.now();
  console.log(`[waveform] start projectId=${projectId} file=${sourceFilePath} dur=${durationSec}`);
  try {
    const watchFolder = store.get("watchFolder");
    if (!watchFolder) {
      console.warn(`[waveform] failed: watch folder not set`);
      return { error: "Watch folder not set", peaks: [] };
    }
    if (!sourceFilePath || !fs.existsSync(sourceFilePath)) {
      console.warn(`[waveform] failed: source file not found path=${sourceFilePath}`);
      return { error: "Source file not found", peaks: [] };
    }

    const stat = fs.statSync(sourceFilePath);
    const mtimeMs = Math.floor(stat.mtimeMs);
    const sizeBytes = stat.size;

    // Scale peak count to duration — ~4 peaks/sec, capped at 8000.
    // A 30-min source = ~7200 peaks ≈ 40KB JSON.
    const dur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 60;
    const peakCount = Math.min(8000, Math.max(400, Math.ceil(dur * 4)));

    const cacheDir = path.join(projects.getProjectsRoot(watchFolder), projectId, ".waveforms");
    try {
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    } catch (mkErr) {
      console.warn(`[waveform] failed: cache dir mkdir error dir=${cacheDir} err=${mkErr.message}`);
      // Fall through — we can still extract, just skip caching.
    }
    const baseName = path.basename(sourceFilePath).replace(/[^\w.-]/g, "_");
    const cacheKey = `${baseName}.${mtimeMs}.${sizeBytes}.${peakCount}.json`;
    const cachePath = path.join(cacheDir, cacheKey);

    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
        if (Array.isArray(cached.peaks) && cached.peaks.length > 0) {
          console.log(`[waveform] cache hit peaks=${cached.peaks.length} ms=${Date.now() - t0}`);
          return { peaks: cached.peaks, cached: true };
        }
      } catch (_) { /* fall through — re-extract on parse failure */ }
    }

    const audioTrack = store.get("transcriptionAudioTrack") ?? 0;
    console.log(`[waveform] extracting peakCount=${peakCount} track=${audioTrack}`);
    const result = await ffmpeg.extractWaveformPeaks(sourceFilePath, peakCount, audioTrack);
    if (result?.peaks?.length > 0) {
      console.log(`[waveform] extracted peaks=${result.peaks.length} ms=${Date.now() - t0}`);
      try {
        fs.writeFileSync(cachePath, JSON.stringify({ peaks: result.peaks, peakCount, mtimeMs, sizeBytes }), "utf-8");
      } catch (wErr) {
        console.warn(`[waveform] cache write failed (non-fatal): ${wErr.message}`);
      }
    } else {
      console.warn(`[waveform] extraction returned empty peaks ms=${Date.now() - t0}${result?.error ? ` err=${result.error}` : ""}`);
    }
    return { peaks: result.peaks || [], cached: false, error: result?.error };
  } catch (err) {
    console.error(`[waveform] failed: ${err.message} ms=${Date.now() - t0}`);
    return { error: err.message, peaks: [] };
  }
});

// ============ LOCATE SOURCE FILE (Media Offline recovery) ============
// Phase 4: when the OBS recording is moved/renamed after project creation,
// editor shows "Media Offline" and this IPC lets the user point to the new path.
ipcMain.handle("project:locateSource", async (_, projectId) => {
  try {
    const watchFolder = store.get("watchFolder");
    if (!watchFolder) return { error: "Watch folder not set" };

    const project = projects.loadProject(watchFolder, projectId);
    if (!project) return { error: "Project not found" };

    const result = await dialog.showOpenDialog({
      title: "Locate source recording",
      properties: ["openFile"],
      filters: [{ name: "Video files", extensions: ["mp4", "mkv", "mov", "webm", "avi"] }],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };

    const newPath = result.filePaths[0];
    project.sourceFile = newPath;
    projects.saveProject(watchFolder, project);
    return { success: true, sourceFile: newPath };
  } catch (err) {
    return { error: err.message };
  }
});

// ============ VIDEO SPLITTING ============
ipcMain.handle("split:execute", async (_, fileId, splitPoints) => {
  try {
    const db = database.getDb();
    if (!db) return { error: "Database not initialized" };

    // Resolve parent file
    const result = db.exec("SELECT * FROM file_metadata WHERE id = ?", [fileId]);
    const rows = database.toRows(result);
    if (rows.length === 0) return { error: "File not found" };
    const parentFile = rows[0];

    const outputDir = path.dirname(parentFile.current_path);

    // Build split points with output filenames
    const ffmpegSplitPoints = splitPoints.map((sp, i) => ({
      startSeconds: sp.startSeconds,
      endSeconds: sp.endSeconds,
      outputFilename: `_split_${i}_${Date.now()}.mp4`, // temp name, renamed after metadata creation
    }));

    // Execute FFmpeg splits (all-or-nothing)
    const results = await ffmpeg.splitFile(parentFile.current_path, ffmpegSplitPoints, outputDir);

    // Create file_metadata records for each child
    const childIds = [];
    for (let i = 0; i < results.length; i++) {
      const sp = splitPoints[i];
      const r = results[i];
      const childId = `fm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Format the child filename using the preset engine
      const childTag = sp.tag || parentFile.tag;
      const childFilename = sp.filename || path.basename(r.filePath);
      const childPath = r.filePath;

      db.run(
        `INSERT INTO file_metadata (id, original_filename, current_filename, original_path, current_path, tag, entry_type, date, day_number, part_number, custom_label, naming_preset, duration_seconds, file_size_bytes, status, split_from_id, split_timestamp_start, split_timestamp_end, is_test)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          childId,
          parentFile.original_filename,
          childFilename,
          parentFile.original_path,
          childPath,
          childTag,
          sp.entryType || parentFile.entry_type,
          parentFile.date,
          parentFile.day_number,
          sp.partNumber || null,
          parentFile.custom_label,
          parentFile.naming_preset,
          r.actualEndSeconds - r.actualStartSeconds,
          null, // file_size_bytes — could probe but not critical
          "renamed",
          fileId,
          r.actualStartSeconds,
          r.actualEndSeconds,
          parentFile.is_test || 0,
        ]
      );
      childIds.push(childId);
    }

    // Mark parent as split source
    db.run(
      "UPDATE file_metadata SET is_split_source = 1, status = 'split', updated_at = datetime('now') WHERE id = ?",
      [fileId]
    );
    database.save();

    // Log split in rename_history
    const historyId = `rh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    db.run(
      `INSERT INTO rename_history (id, file_metadata_id, action, previous_filename, previous_path, new_filename, new_path, metadata_snapshot)
       VALUES (?, ?, 'split', ?, ?, ?, ?, ?)`,
      [
        historyId,
        fileId,
        parentFile.current_filename,
        parentFile.current_path,
        parentFile.current_filename,
        parentFile.current_path,
        JSON.stringify({ childIds, splitPoints: results }),
      ]
    );
    database.save();

    return {
      success: true,
      childIds,
      results: results.map((r, i) => ({
        ...r,
        childId: childIds[i],
      })),
    };
  } catch (err) {
    return { error: err.message };
  }
});

// ============ THUMBNAIL STRIP (Game-Switch Scrubber) ============
ipcMain.handle("thumbs:generate", async (_, filePath) => {
  try {
    logger.info("(thumbs)", `Generating thumbnails for: ${filePath}`);

    // Validate file exists
    if (!fs.existsSync(filePath)) {
      logger.error("(thumbs)", `File not found: ${filePath}`);
      return { error: `File not found: ${filePath}` };
    }

    // Return cached result if available
    if (thumbnailCache.has(filePath)) {
      logger.info("(thumbs)", "Returning cached thumbnails");
      return thumbnailCache.get(filePath);
    }

    // Generate a stable fileId from the file path
    const fileId = require("crypto").createHash("md5").update(filePath).digest("hex");
    const result = await ffmpeg.generateThumbnailStrip(filePath, fileId);
    logger.info("(thumbs)", `Generated ${result.thumbnails.length} thumbnails (${result.duration}s)`);
    thumbnailCache.set(filePath, result);
    return result;
  } catch (err) {
    logger.error("(thumbs)", `Thumbnail generation failed: ${err.message}`);
    return { error: err.message };
  }
});

ipcMain.handle("thumbs:cleanup", async (_, filePath) => {
  try {
    const cached = thumbnailCache.get(filePath);
    if (cached) {
      ffmpeg.cleanupThumbnailStrip(cached.thumbDir);
      thumbnailCache.delete(filePath);
    }
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

// ============ PREVIEW FRAMES (Rename Tab Thumbnails) ============
const previewCache = new Map();
let previewInFlight = 0;
const PREVIEW_MAX_CONCURRENT = 2;
const previewQueue = [];

function processPreviewQueue() {
  while (previewInFlight < PREVIEW_MAX_CONCURRENT && previewQueue.length > 0) {
    const { filePath, resolve } = previewQueue.shift();
    previewInFlight++;
    runPreviewGeneration(filePath)
      .then(resolve)
      .finally(() => { previewInFlight--; processPreviewQueue(); });
  }
}

async function runPreviewGeneration(filePath) {
  // Return cached result if available
  if (previewCache.has(filePath)) {
    return previewCache.get(filePath);
  }

  if (!fs.existsSync(filePath)) {
    return { error: `File not found: ${filePath}` };
  }

  const fileId = require("crypto").createHash("md5").update(filePath).digest("hex");
  const probeResult = await ffmpeg.probe(filePath);
  const duration = probeResult.duration;

  const result = await ffmpeg.generatePreviewFrames(filePath, fileId, duration);
  logger.info("(preview)", `Generated ${result.frames.length} preview frames for ${path.basename(filePath)} (${Math.round(duration)}s)`);

  const cached = { frames: result.frames, thumbDir: result.thumbDir, duration };
  previewCache.set(filePath, cached);
  return cached;
}

ipcMain.handle("thumbs:preview", async (_, filePath) => {
  try {
    // Return cached immediately
    if (previewCache.has(filePath)) {
      return previewCache.get(filePath);
    }

    // Queue with concurrency limit
    return new Promise((resolve) => {
      previewQueue.push({ filePath, resolve });
      processPreviewQueue();
    });
  } catch (err) {
    logger.error("(preview)", `Preview generation failed: ${err.message}`);
    return { error: err.message };
  }
});

// ============ IMPORT EXTERNAL FILE (Drag-and-Drop) ============
ipcMain.handle("import:externalFile", async (event, sourcePath, watchFolder, testMode = false) => {
  try {
    if (!sourcePath || !watchFolder) return { error: "Missing sourcePath or watchFolder" };

    const filename = path.basename(sourcePath);
    const ext = path.extname(filename).toLowerCase();
    if (ext !== ".mp4") return { error: "Only .mp4 files are supported" };

    // Build target path in monthly subfolder. Test imports land under the
    // testWatchFolder (or a "Test" sibling of the main folder if none is set)
    // so they don't pollute the real recording archive.
    const importRoot = testMode
      ? (store.get("testWatchFolder") || path.join(watchFolder, "Test"))
      : watchFolder;
    const now = new Date();
    const monthFolder = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const targetDir = path.join(importRoot, monthFolder);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, filename);

    // Get source file size for pendingImports suppression
    const srcStat = fs.statSync(sourcePath);
    const importEntry = { filename, sizeBytes: srcStat.size };
    pendingImports.add(importEntry);

    // Copy with progress events
    const totalBytes = srcStat.size;
    let copiedBytes = 0;

    await new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(sourcePath);
      const writeStream = fs.createWriteStream(targetPath);

      readStream.on("data", (chunk) => {
        copiedBytes += chunk.length;
        mainWindow?.webContents.send("import:progress", {
          filename,
          copiedBytes,
          totalBytes,
          pct: Math.round((copiedBytes / totalBytes) * 100),
        });
      });

      readStream.on("error", (err) => {
        writeStream.destroy();
        reject(err);
      });

      writeStream.on("error", (err) => {
        readStream.destroy();
        reject(err);
      });

      writeStream.on("finish", resolve);
      readStream.pipe(writeStream);
    });

    return { success: true, targetPath, filename, testMode: !!testMode, importEntry: { filename, sizeBytes: srcStat.size } };
  } catch (err) {
    return { error: err.message };
  }
});

// Remove a file from pendingImports (after rename completes or on cancel)
ipcMain.handle("import:clearSuppression", async (_, filename, sizeBytes) => {
  for (const entry of pendingImports) {
    if (entry.filename === filename && entry.sizeBytes === sizeBytes) {
      pendingImports.delete(entry);
      return { success: true };
    }
  }
  return { success: true }; // Already cleared
});

// Cancel an import — delete the copied file and clear suppression
ipcMain.handle("import:cancel", async (_, targetPath, filename, sizeBytes) => {
  try {
    // Clear suppression
    for (const entry of pendingImports) {
      if (entry.filename === filename && entry.sizeBytes === sizeBytes) {
        pendingImports.delete(entry);
        break;
      }
    }
    // Delete the copied file
    if (targetPath && fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

// ============ WHISPER (BetterWhisperX) ============
ipcMain.handle("whisper:checkInstalled", async (_, pythonPath) => {
  try {
    const pp = pythonPath || store.get("whisperPythonPath") || "";
    return await whisper.checkWhisper(pp);
  }
  catch (err) { return { installed: false, error: err.message }; }
});

ipcMain.handle("whisper:transcribe", async (_, wavPath, opts) => {
  try {
    const storeOpts = {
      pythonPath: store.get("whisperPythonPath") || opts?.pythonPath || "",
      model: store.get("whisperModel") || opts?.model || "large-v3-turbo",
      language: opts?.language || "en",
      batchSize: opts?.batchSize || 16,
      computeType: opts?.computeType || "float16",
      hfToken: store.get("hfToken") || opts?.hfToken || "",
      hfHome: store.get("hfHome") || "D:\\whisper\\hf_cache",
    };

    // Send progress events to renderer
    if (mainWindow) {
      storeOpts.onProgress = (pct) => {
        mainWindow.webContents.send("whisper:progress", pct);
      };
    }

    return await whisper.transcribe(wavPath, storeOpts);
  } catch (err) {
    return { error: err.message };
  }
});

// ============ EXTEND CLIP (re-cut from source with new boundaries) ============
ipcMain.handle("clip:extend", async (_, projectId, clipId, newSourceEndTime) => {
  try {
    const watchFolder = store.get("watchFolder");
    if (!watchFolder) return { error: "Watch folder not set" };

    const project = projects.loadProject(watchFolder, projectId);
    if (!project) return { error: "Project not found" };

    const clip = (project.clips || []).find((c) => c.id === clipId);
    if (!clip) return { error: "Clip not found" };

    const sourceFile = project.sourceFile;
    if (!sourceFile || !fs.existsSync(sourceFile)) {
      return { error: "Source recording not found. Cannot extend clip." };
    }

    const startTime = clip.startTime || 0;
    const newEndTime = Math.min(newSourceEndTime, project.sourceDuration || newSourceEndTime);

    require("electron-log/main").scope("editor").debug("ExtendRight", { startTime: clip.startTime, endTime: clip.endTime, newEndTime, sourceFile });

    if (newEndTime <= startTime) {
      return { error: `Invalid extend range: newEndTime=${newEndTime} <= startTime=${startTime}` };
    }

    // Re-cut from source with new boundaries
    // Use a temp path first, then replace the original clip file
    const clipDir = path.dirname(clip.filePath);
    const ext = path.extname(clip.filePath);
    const baseName = path.basename(clip.filePath, ext);
    const tempPath = path.join(clipDir, `${baseName}_extended${ext}`);

    await ffmpeg.cutClip(sourceFile, tempPath, startTime, newEndTime);

    // Replace old clip file with new one
    const finalPath = clip.filePath;
    if (fs.existsSync(finalPath)) {
      fs.unlinkSync(finalPath);
    }
    fs.renameSync(tempPath, finalPath);

    // Update clip metadata in project JSON
    const newDuration = newEndTime - startTime;
    projects.updateClip(watchFolder, projectId, clipId, {
      endTime: newEndTime,
      duration: newDuration,
    });

    return {
      success: true,
      filePath: finalPath,
      duration: newDuration,
      newEndTime,
    };
  } catch (err) {
    return { error: err.message };
  }
});

// ============ EXTEND CLIP LEFT (backwards) ============
ipcMain.handle("clip:extendLeft", async (_, projectId, clipId, newSourceStartTime) => {
  try {
    const watchFolder = store.get("watchFolder");
    if (!watchFolder) return { error: "Watch folder not set" };

    const project = projects.loadProject(watchFolder, projectId);
    if (!project) return { error: "Project not found" };

    const clip = (project.clips || []).find((c) => c.id === clipId);
    if (!clip) return { error: "Clip not found" };

    const sourceFile = project.sourceFile;
    if (!sourceFile || !fs.existsSync(sourceFile)) {
      return { error: "Source recording not found. Cannot extend clip." };
    }

    const endTime = clip.endTime || 0;
    const newStart = Math.max(0, newSourceStartTime);

    require("electron-log/main").scope("editor").debug("ExtendLeft", { startTime: clip.startTime, endTime: clip.endTime, duration: clip.duration, newSourceStartTime, newStart, endTime, sourceFile });

    if (newStart >= endTime) {
      return { error: `Invalid extend range: newStart=${newStart} >= endTime=${endTime}` };
    }

    // Re-cut from source with new boundaries
    const clipDir = path.dirname(clip.filePath);
    const ext = path.extname(clip.filePath);
    const baseName = path.basename(clip.filePath, ext);
    const tempPath = path.join(clipDir, `${baseName}_extended_left${ext}`);

    await ffmpeg.cutClip(sourceFile, tempPath, newStart, endTime);

    // Replace old clip file with new one
    const finalPath = clip.filePath;
    if (fs.existsSync(finalPath)) {
      fs.unlinkSync(finalPath);
    }
    fs.renameSync(tempPath, finalPath);

    // Update clip metadata in project JSON
    const newDuration = endTime - newStart;
    const delta = (clip.startTime || 0) - newStart; // how much we extended backwards
    projects.updateClip(watchFolder, projectId, clipId, {
      startTime: newStart,
      duration: newDuration,
    });

    return {
      success: true,
      filePath: finalPath,
      duration: newDuration,
      newStartTime: newStart,
      delta, // seconds shifted backwards — all existing timestamps need += delta
    };
  } catch (err) {
    return { error: err.message };
  }
});

// ============ CONCAT RE-CUT (splice out deleted sections) ============
ipcMain.handle("clip:concatRecut", async (_, projectId, clipId, segments) => {
  try {
    const watchFolder = store.get("watchFolder");
    if (!watchFolder) return { error: "Watch folder not set" };

    const project = projects.loadProject(watchFolder, projectId);
    if (!project) return { error: "Project not found" };

    const clip = (project.clips || []).find((c) => c.id === clipId);
    if (!clip) return { error: "Clip not found" };

    const sourceFile = project.sourceFile;
    if (!sourceFile || !fs.existsSync(sourceFile)) {
      return { error: "Source recording not found. Cannot concat recut." };
    }

    if (!segments || segments.length === 0) {
      return { error: "No segments provided for concat recut" };
    }

    const logger = require("electron-log/main").scope("editor");
    logger.debug("ConcatRecut", { clipId, segments });

    const clipDir = path.dirname(clip.filePath);
    const ext = path.extname(clip.filePath);
    const baseName = path.basename(clip.filePath, ext);
    const tempPath = path.join(clipDir, `${baseName}_concat${ext}`);

    await ffmpeg.concatCutClip(sourceFile, tempPath, segments);

    const finalPath = clip.filePath;
    if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
    fs.renameSync(tempPath, finalPath);

    const newDuration = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
    const newStart = segments[0].start;
    const newEnd = segments[segments.length - 1].end;

    projects.updateClip(watchFolder, projectId, clipId, {
      startTime: newStart,
      endTime: newEnd,
      duration: newDuration,
      transcription: null,
    });

    logger.debug("ConcatRecut success", { duration: newDuration, segmentCount: segments.length });
    return {
      success: true,
      filePath: finalPath,
      duration: newDuration,
      newStartTime: newStart,
      newEndTime: newEnd,
    };
  } catch (err) {
    require("electron-log/main").scope("editor").error("ConcatRecut failed", { error: err.message });
    return { error: err.message };
  }
});

// ============ RE-CUT CLIP (arbitrary boundaries — used by undo) ============
ipcMain.handle("clip:recut", async (_, projectId, clipId, newStartTime, newEndTime) => {
  try {
    const watchFolder = store.get("watchFolder");
    if (!watchFolder) return { error: "Watch folder not set" };

    const project = projects.loadProject(watchFolder, projectId);
    if (!project) return { error: "Project not found" };

    const clip = (project.clips || []).find((c) => c.id === clipId);
    if (!clip) return { error: "Clip not found" };

    const sourceFile = project.sourceFile;
    if (!sourceFile || !fs.existsSync(sourceFile)) {
      return { error: "Source recording not found. Cannot recut clip." };
    }

    const newStart = Math.max(0, newStartTime);
    const newEnd = Math.min(newEndTime, project.sourceDuration || newEndTime);

    require("electron-log/main").scope("editor").debug("Recut", { startTime: clip.startTime, endTime: clip.endTime, newStart, newEnd, sourceFile });

    if (newStart >= newEnd) {
      return { error: `Invalid recut range: newStart=${newStart} >= newEnd=${newEnd}` };
    }

    const clipDir = path.dirname(clip.filePath);
    const ext = path.extname(clip.filePath);
    const baseName = path.basename(clip.filePath, ext);
    const tempPath = path.join(clipDir, `${baseName}_recut${ext}`);

    await ffmpeg.cutClip(sourceFile, tempPath, newStart, newEnd);

    const finalPath = clip.filePath;
    if (fs.existsSync(finalPath)) {
      fs.unlinkSync(finalPath);
    }
    fs.renameSync(tempPath, finalPath);

    const newDuration = newEnd - newStart;
    projects.updateClip(watchFolder, projectId, clipId, {
      startTime: newStart,
      endTime: newEnd,
      duration: newDuration,
      transcription: null, // Clear stale transcription — no longer matches recut video
    });

    require("electron-log/main").scope("editor").debug("Recut success", { duration: newDuration, start: newStart, end: newEnd });
    return {
      success: true,
      filePath: finalPath,
      duration: newDuration,
      newStartTime: newStart,
      newEndTime: newEnd,
    };
  } catch (err) {
    require("electron-log/main").scope("editor").error("Recut failed", { error: err.message });
    return { error: err.message };
  }
});

// ============ RE-TRANSCRIBE CLIP ============
ipcMain.handle("retranscribe:clip", async (_, projectId, clipId) => {
  try {
    const watchFolder = store.get("watchFolder");
    const project = projects.loadProject(watchFolder, projectId);
    if (!project) return { error: "Project not found" };

    const clip = (project.clips || []).find((c) => c.id === clipId);
    if (!clip) return { error: "Clip not found" };

    // The clip has its own video file — transcribe it directly
    const clipPath = clip.filePath;
    if (!clipPath || !fs.existsSync(clipPath)) {
      return { error: `Clip file not found: ${clipPath}` };
    }

    // Step 1: Extract audio from clip video (use configured mic track)
    const wavPath = clipPath.replace(/\.[^.]+$/, "-retranscribe.wav");
    if (mainWindow) mainWindow.webContents.send("retranscribe:progress", { stage: "extracting", pct: 10 });
    const audioTrack = store.get("transcriptionAudioTrack") ?? 0;
    await ffmpeg.extractAudio(clipPath, wavPath, audioTrack);

    // Step 2: Transcribe with whisperx
    if (mainWindow) mainWindow.webContents.send("retranscribe:progress", { stage: "transcribing", pct: 30 });
    const storeOpts = {
      pythonPath: store.get("whisperPythonPath") || "",
      model: store.get("whisperModel") || "large-v3-turbo",
      language: "en",
      batchSize: 16,
      computeType: "float16",
      hfToken: store.get("hfToken") || "",
      hfHome: store.get("hfHome") || "D:\\whisper\\hf_cache",
      onProgress: (pct) => {
        if (mainWindow) mainWindow.webContents.send("retranscribe:progress", { stage: "transcribing", pct: 30 + Math.floor(pct * 0.6) });
      },
    };
    const transcription = await whisper.transcribe(wavPath, storeOpts);

    // Step 3: Clean up temp wav
    try { fs.unlinkSync(wavPath); } catch (e) { /* ignore */ }

    // Step 4: Save clip-level transcription to project
    if (mainWindow) mainWindow.webContents.send("retranscribe:progress", { stage: "saving", pct: 95 });
    const updates = { transcription };
    await projects.updateClip(watchFolder, projectId, clipId, updates);

    if (mainWindow) mainWindow.webContents.send("retranscribe:progress", { stage: "done", pct: 100 });
    return { success: true, transcription };
  } catch (err) {
    return { error: err.message };
  }
});

// ============ PROJECTS ============
ipcMain.handle("project:create", async (_, data) => {
  try {
    const watchFolder = store.get("watchFolder");
    return projects.createProject(watchFolder, data);
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle("project:load", async (_, projectId) => {
  try {
    const watchFolder = store.get("watchFolder");
    const project = projects.loadProject(watchFolder, projectId);
    if (!project) return { error: "Project not found" };
    return { success: true, project };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle("project:save", async (_, project) => {
  try {
    const watchFolder = store.get("watchFolder");
    return projects.saveProject(watchFolder, project);
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle("project:updateTestMode", async (_, projectId, testMode) => {
  try {
    const watchFolder = store.get("watchFolder");
    return projects.updateProjectField(watchFolder, projectId, { testMode: testMode === true });
  } catch (err) { return { error: err.message }; }
});

// #60: Move a recording's physical file between the main watch folder and the
// test watch folder, then update file_metadata.current_path + is_test in one
// pass. On lock/permission errors, return { error, locked: true } so the
// renderer can revert its optimistic toggle.
ipcMain.handle("file:moveToTestMode", async (_, fileId, nextIsTest) => {
  try {
    const db = database.getDb();
    if (!db) return { error: "Database not initialized" };

    const rows = database.toRows(db.exec("SELECT * FROM file_metadata WHERE id = ?", [fileId]));
    if (rows.length === 0) return { error: "File not found" };
    const row = rows[0];

    const oldPath = row.current_path;
    if (!oldPath || !fs.existsSync(oldPath)) {
      return { error: "Source file missing on disk — cannot move" };
    }

    const watchFolder = store.get("watchFolder") || "";
    const testWatchFolder = store.get("testWatchFolder") || (watchFolder ? path.join(watchFolder, "Test") : "");
    if (nextIsTest && !testWatchFolder) {
      return { error: "Test watch folder not configured. Set it in Settings first." };
    }
    if (!nextIsTest && !watchFolder) {
      return { error: "Main watch folder not configured. Set it in Settings first." };
    }

    // Target monthly subfolder uses row.date (YYYY-MM-DD) or falls back to
    // parsing the filename. This matches the existing monthly-folder layout.
    const dateStr = row.date || (row.current_filename || "").match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";
    const monthFolder = dateStr ? dateStr.slice(0, 7) : "";
    const rootDir = nextIsTest ? testWatchFolder : watchFolder;
    const targetDir = monthFolder ? path.join(rootDir, monthFolder) : rootDir;
    const newPath = path.join(targetDir, row.current_filename);

    if (newPath === oldPath) {
      // Already where it needs to be — just reconcile the flag.
      db.run("UPDATE file_metadata SET is_test = ?, updated_at = datetime('now') WHERE id = ?", [nextIsTest ? 1 : 0, fileId]);
      database.save();
      return { success: true, newPath, moved: false };
    }

    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    // Try rename first (fast, atomic on same volume). Fall back to copy+unlink
    // for cross-volume moves (testWatchFolder often lives on a different drive).
    try {
      fs.renameSync(oldPath, newPath);
    } catch (err) {
      if (err.code === "EXDEV") {
        fs.copyFileSync(oldPath, newPath);
        try { fs.unlinkSync(oldPath); }
        catch (unlinkErr) {
          // Copy succeeded but source couldn't be removed — clean up the
          // duplicate so we don't leave the file in two places.
          try { fs.unlinkSync(newPath); } catch (_) {}
          return { error: `File is in use and cannot be moved: ${unlinkErr.message}`, locked: true };
        }
      } else if (err.code === "EBUSY" || err.code === "EPERM" || err.code === "EACCES") {
        return { error: "File is in use (editor or render open?) — close it and try again.", locked: true };
      } else {
        return { error: err.message };
      }
    }

    // Update file_metadata row with the new path + flag.
    db.run(
      "UPDATE file_metadata SET current_path = ?, is_test = ?, updated_at = datetime('now') WHERE id = ?",
      [newPath, nextIsTest ? 1 : 0, fileId]
    );

    // If a project points at this source file, update its sourceFile too so
    // the editor / render pipeline resolves the right path next open.
    try {
      const baseName = (row.current_filename || "").replace(/\.(mp4|mkv)$/i, "");
      const projList = projects.listProjects(watchFolder);
      const matching = (projList.projects || []).find((p) => p.name === baseName || p.sourceFile === oldPath);
      if (matching) {
        projects.updateProjectField(watchFolder, matching.id, {
          sourceFile: newPath,
          testMode: !!nextIsTest,
        });
      }
    } catch (e) { /* non-critical — project reference will be repaired on next open */ }

    database.save();
    return { success: true, newPath, moved: true };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("project:list", async () => {
  try {
    const watchFolder = store.get("watchFolder");
    const result = projects.listProjects(watchFolder);

    // Reconciliation: reset orphaned "done" files whose projects no longer exist.
    // This catches files stuck from deletions that happened before the cleanup fix.
    try {
      const db = database.getDb();
      if (db && result.projects) {
        const projectNames = new Set(result.projects.map(p => p.name));
        const doneRows = database.toRows(db.exec("SELECT id, current_filename FROM file_metadata WHERE status = 'done'"));
        let resetCount = 0;
        const doneRecordings = store.get("doneRecordings") || {};
        let doneChanged = false;
        for (const row of doneRows) {
          const baseName = row.current_filename.replace(/\.(mp4|mkv)$/i, "");
          if (!projectNames.has(baseName)) {
            db.run("UPDATE file_metadata SET status = 'renamed', updated_at = datetime('now') WHERE id = ?", [row.id]);
            resetCount++;
            // Also clear any stale doneRecordings entry
            if (doneRecordings[row.current_filename]) {
              delete doneRecordings[row.current_filename];
              doneChanged = true;
            }
          }
        }
        if (resetCount > 0) {
          database.save();
          log.info(`Reconciliation: reset ${resetCount} orphaned "done" file(s) with no matching project`);
        }
        if (doneChanged) store.set("doneRecordings", doneRecordings);
      }
    } catch (reconcileErr) { log.warn("Reconciliation failed:", reconcileErr.message); }

    return result;
  } catch (err) { return { error: err.message, projects: [] }; }
});

ipcMain.handle("project:delete", async (_, projectId) => {
  try {
    const watchFolder = store.get("watchFolder");
    const result = projects.deleteProject(watchFolder, projectId);
    // Reset recording file status so it can be re-generated
    // Two paths: (A) via fileMetadataId if stored, (B) via project name as fallback
    try {
      const db = database.getDb();
      let filename = null;

      // Path A: look up by fileMetadataId
      if (result.fileMetadataId && db) {
        const rows = database.toRows(db.exec("SELECT current_filename, status FROM file_metadata WHERE id = ?", [result.fileMetadataId]));
        if (rows.length > 0) {
          filename = rows[0].current_filename;
          if (rows[0].status === "done") {
            db.run("UPDATE file_metadata SET status = 'renamed', updated_at = datetime('now') WHERE id = ?", [result.fileMetadataId]);
            database.save();
          }
        }
      }

      // Path B: fallback — find file by project name (name = filename without extension)
      if (!filename && result.projectName && db) {
        for (const ext of [".mp4", ".mkv"]) {
          const candidate = result.projectName + ext;
          const rows = database.toRows(db.exec("SELECT id, current_filename, status FROM file_metadata WHERE current_filename = ?", [candidate]));
          if (rows.length > 0) {
            filename = rows[0].current_filename;
            if (rows[0].status === "done") {
              db.run("UPDATE file_metadata SET status = 'renamed', updated_at = datetime('now') WHERE id = ?", [rows[0].id]);
              database.save();
            }
            break;
          }
        }
      }

      // Clear doneRecordings entry in electron-store (isDone condition 2)
      if (filename) {
        const doneRecordings = store.get("doneRecordings") || {};
        if (doneRecordings[filename]) {
          delete doneRecordings[filename];
          store.set("doneRecordings", doneRecordings);
        }
        result.clearedFilename = filename;
      }

      // Last resort: clear any doneRecordings key matching the project name
      if (!filename && result.projectName) {
        const doneRecordings = store.get("doneRecordings") || {};
        let cleared = false;
        for (const key of Object.keys(doneRecordings)) {
          const baseName = key.replace(/\.(mp4|mkv)$/i, "");
          if (baseName === result.projectName) {
            delete doneRecordings[key];
            result.clearedFilename = key;
            cleared = true;
          }
        }
        if (cleared) store.set("doneRecordings", doneRecordings);
      }

      if (filename || result.projectName) {
        log.info(`Reset file status after project deletion: file=${filename || "?"}, project=${result.projectName || "?"}`);
      }
    } catch (dbErr) { log.warn("Failed to reset file status after project deletion:", dbErr.message); }
    return result;
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle("project:updateClip", async (_, projectId, clipId, updates) => {
  try {
    const watchFolder = store.get("watchFolder");
    return projects.updateClip(watchFolder, projectId, clipId, updates);
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle("project:addClip", async (_, projectId, clipData) => {
  try {
    const watchFolder = store.get("watchFolder");
    return projects.addClip(watchFolder, projectId, clipData);
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle("project:deleteClip", async (_, projectId, clipId, deleteFile) => {
  try {
    const watchFolder = store.get("watchFolder");
    return projects.deleteClip(watchFolder, projectId, clipId, deleteFile);
  } catch (err) { return { error: err.message }; }
});

// ============ PIPELINE: Generate Clips (AI Pipeline) ============
// Orchestrates: transcribe → energy analysis → frame extraction → Claude API → cut clips → project
// Pending ask-degrade requests — keyed by requestId, value = the resolver of
// the promise that ai-pipeline.js is awaiting at the Stage 4.5 gate.
const pendingDegradeAsks = new Map();

ipcMain.handle("pipeline:degradeAnswer", async (_, requestId, answer) => {
  const resolver = pendingDegradeAsks.get(requestId);
  if (resolver) {
    pendingDegradeAsks.delete(requestId);
    resolver(answer === "yes" || answer === true);
  }
  return { ok: true };
});

ipcMain.handle("pipeline:generateClips", async (_, sourceFile, gameData) => {
  const watchFolder = store.get("watchFolder");
  const sendProgress = (stage, pct, detail, extra) => {
    mainWindow?.webContents.send("pipeline:progress", { stage, pct, detail, ...(extra || {}) });
  };
  const sendSignalProgress = (signal, payload) => {
    mainWindow?.webContents.send("pipeline:signalProgress", { signal, ...payload });
  };
  const askDegrade = ({ failed }) => new Promise((resolve) => {
    const requestId = `degrade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pendingDegradeAsks.set(requestId, resolve);
    mainWindow?.webContents.send("pipeline:askDegrade", { requestId, failed });
  });

  return aiPipeline.runAIPipeline({
    sourceFile, gameData, watchFolder, store,
    sendProgress, sendSignalProgress, askDegrade,
    strictMode: store.get("strictMode") !== false,
  });
});

// ============ FEEDBACK DATABASE ============
ipcMain.handle("feedback:log", async (_, entry) => {
  try {
    return feedbackDb.logFeedback(entry);
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle("feedback:getApproved", async (_, gameTag, limit) => {
  try {
    return feedbackDb.getApprovedClips(gameTag, limit || 20);
  } catch (err) { return []; }
});

ipcMain.handle("feedback:getCounts", async (_, gameTag) => {
  try {
    return feedbackDb.getFeedbackCounts(gameTag);
  } catch (err) { return { approved: 0, rejected: 0, total: 0 }; }
});

// ============ FILE METADATA (Rename System) ============
ipcMain.handle("metadata:create", async (_, data) => {
  try {
    const db = database.getDb();
    if (!db) return { error: "Database not initialized" };

    // Stat the file on disk if caller didn't supply size — covers the rename
    // path which doesn't thread size through the renderer.
    let fileSizeBytes = data.fileSizeBytes || null;
    if (!fileSizeBytes && data.currentPath) {
      try { fileSizeBytes = fs.statSync(data.currentPath).size; } catch (_) { /* file missing — leave null */ }
    }

    const id = uuid();
    db.run(
      `INSERT INTO file_metadata (id, original_filename, current_filename, original_path, current_path, tag, entry_type, date, day_number, part_number, custom_label, naming_preset, duration_seconds, file_size_bytes, status, is_test)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.originalFilename,
        data.currentFilename,
        data.originalPath,
        data.currentPath,
        data.tag,
        data.entryType || "game",
        data.date || null,
        data.dayNumber != null ? data.dayNumber : null,
        data.partNumber != null ? data.partNumber : null,
        data.customLabel || null,
        data.namingPreset,
        data.durationSeconds || null,
        fileSizeBytes,
        data.status || "renamed",
        data.isTest ? 1 : 0,
      ]
    );
    database.save();
    return { success: true, id };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle("metadata:update", async (_, fileId, data) => {
  try {
    const db = database.getDb();
    if (!db) return { error: "Database not initialized" };

    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(data)) {
      // Map camelCase to snake_case column names
      const col = key.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
      fields.push(`${col} = ?`);
      values.push(value);
    }
    fields.push("updated_at = datetime('now')");
    values.push(fileId);

    db.run(`UPDATE file_metadata SET ${fields.join(", ")} WHERE id = ?`, values);
    database.save();
    return { success: true };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle("metadata:search", async (_, filters) => {
  try {
    const db = database.getDb();
    if (!db) return [];

    let sql, params;

    switch (filters.type) {
      case "byTag":
        sql = "SELECT * FROM file_metadata WHERE tag = ? ORDER BY renamed_at DESC";
        params = [filters.tag];
        break;
      case "byStatus":
        sql = "SELECT * FROM file_metadata WHERE status = ? ORDER BY renamed_at DESC";
        params = [filters.status];
        break;
      case "byTagDate":
        sql = "SELECT * FROM file_metadata WHERE tag = ? AND date = ? ORDER BY part_number ASC";
        params = [filters.tag, filters.date];
        break;
      case "byTagLabel":
        sql = "SELECT * FROM file_metadata WHERE tag = ? AND custom_label = ? ORDER BY part_number ASC";
        params = [filters.tag, filters.label];
        break;
      case "byDateRange":
        sql = "SELECT * FROM file_metadata WHERE date >= ? AND date <= ? ORDER BY date DESC, renamed_at DESC";
        params = [filters.startDate, filters.endDate];
        break;
      case "allRenamed":
        sql = "SELECT * FROM file_metadata WHERE status != 'pending' AND status != 'split' ORDER BY date DESC, renamed_at DESC";
        params = [];
        break;
      default:
        return [];
    }

    if (filters.limit) {
      sql += " LIMIT ?";
      params.push(filters.limit);
    }

    const result = db.exec(sql, params);
    return database.toRows(result);
  } catch (err) { return []; }
});

ipcMain.handle("metadata:getById", async (_, fileId) => {
  try {
    const db = database.getDb();
    if (!db) return null;

    const result = db.exec("SELECT * FROM file_metadata WHERE id = ?", [fileId]);
    const rows = database.toRows(result);
    return rows.length > 0 ? rows[0] : null;
  } catch (err) { return null; }
});

ipcMain.handle("labels:suggest", async (_, tag, prefix) => {
  try {
    const db = database.getDb();
    if (!db) return [];

    let sql, params;
    if (prefix) {
      sql = "SELECT label, use_count FROM custom_labels WHERE tag = ? AND label LIKE ? ORDER BY use_count DESC LIMIT 20";
      params = [tag, prefix + "%"];
    } else {
      sql = "SELECT label, use_count FROM custom_labels WHERE tag = ? ORDER BY use_count DESC LIMIT 20";
      params = [tag];
    }

    const result = db.exec(sql, params);
    return database.toRows(result);
  } catch (err) { return []; }
});

ipcMain.handle("labels:record", async (_, tag, label) => {
  try {
    const db = database.getDb();
    if (!db) return { error: "Database not initialized" };

    // Upsert: increment count if exists, insert if new
    const existing = db.exec(
      "SELECT id FROM custom_labels WHERE tag = ? AND label = ?",
      [tag, label]
    );
    const rows = database.toRows(existing);

    if (rows.length > 0) {
      db.run(
        "UPDATE custom_labels SET use_count = use_count + 1, last_used_at = datetime('now') WHERE tag = ? AND label = ?",
        [tag, label]
      );
    } else {
      db.run(
        "INSERT INTO custom_labels (id, tag, label) VALUES (?, ?, ?)",
        [uuid(), tag, label]
      );
    }

    database.save();
    return { success: true };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle("renameHistory:recent", async (_, limit) => {
  try {
    const db = database.getDb();
    if (!db) return [];

    const result = db.exec(
      "SELECT * FROM rename_history WHERE undone = 0 ORDER BY created_at DESC LIMIT ?",
      [limit || 50]
    );
    return database.toRows(result);
  } catch (err) { return []; }
});

ipcMain.handle("renameHistory:undo", async (_, historyId) => {
  try {
    return _undoRenameHistory(historyId);
  } catch (err) { return { error: err.message }; }
});

/** Undo a rename history entry and cascade to triggered entries */
function _undoRenameHistory(historyId) {
  const db = database.getDb();
  if (!db) return { error: "Database not initialized" };

  const result = db.exec("SELECT * FROM rename_history WHERE id = ?", [historyId]);
  const entries = database.toRows(result);
  if (entries.length === 0) return { error: "History entry not found" };

  const entry = entries[0];
  if (entry.undone) return { error: "Already undone" };

  // Restore metadata from snapshot
  const snapshot = entry.metadata_snapshot ? JSON.parse(entry.metadata_snapshot) : null;
  if (snapshot) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(snapshot)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
    fields.push("updated_at = datetime('now')");
    values.push(entry.file_metadata_id);
    db.run(`UPDATE file_metadata SET ${fields.join(", ")} WHERE id = ?`, values);
  }

  // Rename physical file back
  if (fs.existsSync(entry.new_path)) {
    fs.renameSync(entry.new_path, entry.previous_path);
  }

  // Mark as undone
  db.run("UPDATE rename_history SET undone = 1 WHERE id = ?", [historyId]);

  // Cascade: undo any retroactive renames triggered by this one
  const triggered = db.exec(
    "SELECT id FROM rename_history WHERE triggered_by = ? AND undone = 0",
    [historyId]
  );
  const triggeredRows = database.toRows(triggered);
  for (const row of triggeredRows) {
    _undoRenameHistory(row.id);
  }

  database.save();
  return { success: true };
}

// ============ NAMING PRESETS (Renderer-accessible) ============
ipcMain.handle("preset:getAll", async () => {
  return namingPresets.PRESETS;
});

ipcMain.handle("preset:formatFilename", async (_, meta, presetId) => {
  try {
    return { filename: namingPresets.formatFilename(meta, presetId) };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle("preset:findCollisions", async (_, meta, presetId) => {
  try {
    return namingPresets.findCollisions(meta, presetId);
  } catch (err) { return []; }
});

ipcMain.handle("preset:getNextPartNumber", async (_, meta, presetId) => {
  try {
    return { partNumber: namingPresets.getNextPartNumber(meta, presetId) };
  } catch (err) { return { partNumber: 1 }; }
});

ipcMain.handle("preset:calculateDayNumber", async (_, gameEntry, recordingDate) => {
  try {
    return namingPresets.calculateDayNumber(gameEntry, recordingDate);
  } catch (err) { return { dayNumber: 1, newDayCount: 1, newLastDayDate: recordingDate }; }
});

ipcMain.handle("preset:validateLabel", async (_, label) => {
  return namingPresets.validateLabel(label);
});

ipcMain.handle("preset:retroactiveRename", async (_, existingFile, triggeringHistoryId) => {
  try {
    return namingPresets.retroactiveRename(existingFile, triggeringHistoryId);
  } catch (err) { return { executed: false, error: err.message }; }
});

ipcMain.handle("preset:extractDate", async (_, filename, filePath) => {
  return namingPresets.extractDateFromFilename(filename, filePath);
});

// ============ GAME PROFILES ============
ipcMain.handle("gameProfiles:getAll", async () => {
  return gameProfiles.loadProfiles();
});

ipcMain.handle("gameProfiles:get", async (_, gameTag) => {
  return gameProfiles.getProfile(gameTag);
});

ipcMain.handle("gameProfiles:updatePlayStyle", async (_, gameTag, playStyle) => {
  gameProfiles.updatePlayStyle(gameTag, playStyle);
  return { success: true };
});

ipcMain.handle("gameProfiles:setThreshold", async (_, gameTag, threshold) => {
  gameProfiles.setUpdateThreshold(gameTag, threshold);
  return { success: true };
});

ipcMain.handle("gameProfiles:resetCount", async (_, gameTag) => {
  gameProfiles.resetSessionCount(gameTag);
  return { success: true };
});

ipcMain.handle("gameProfiles:generateUpdate", async (_, gameTag) => {
  const profile = gameProfiles.getProfile(gameTag);
  if (!profile) return { error: `No profile found for ${gameTag}` };

  const watchFolder = store.get("watchFolder");
  if (!watchFolder) return { error: "Watch folder not set." };

  const transcripts = gameProfiles.getRecentTranscripts(watchFolder, gameTag, 10);
  if (transcripts.length === 0) return { error: "No recent transcripts found for this game." };

  const transcriptBlock = transcripts.map((t, i) =>
    `--- Session ${i + 1}: ${t.projectName} ---\n${t.transcript}`
  ).join("\n\n");

  const systemPrompt = `You are analyzing a gaming content creator's recent gameplay sessions to update their play style profile. The creator's name is Fega.

Your task: Based on the recent transcripts below, write an updated play style profile for this game. The profile should describe HOW Fega plays this specific game — his patterns, humor style, recurring phrases, emotional reactions, and content style.

Rules:
- Write in third person ("Fega does X", not "You do X")
- Focus on patterns that repeat across sessions
- Include specific phrases or catchphrases you notice
- Note gameplay style (aggressive, cautious, chaotic, etc.)
- Note content style (comedic, competitive, educational, etc.)
- Keep it concise but thorough — 150-300 words
- If the current profile is good and the transcripts don't reveal anything new, return the current profile unchanged
- Output ONLY the profile text, no headers or explanations`;

  const userMessage = `Game: ${profile.gameName} (${gameTag})

CURRENT PLAY STYLE PROFILE:
${profile.playStyle || "(empty — no profile yet)"}

RECENT SESSION TRANSCRIPTS (${transcripts.length} sessions):
${transcriptBlock}

Write the updated play style profile:`;

  try {
    const provider = llmProvider.getProvider();
    const { text } = await provider.chat({
      model: provider.defaultModel,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 1000,
    });

    const newProfile = (text || "").trim();
    if (!newProfile) return { error: "Empty response from LLM provider" };

    return { success: true, oldProfile: profile.playStyle || "", newProfile, gameName: profile.gameName };
  } catch (err) {
    return { error: err.message || "Failed to generate profile update" };
  }
});

// ============ PIPELINE LOGS ============
ipcMain.handle("pipelineLogs:list", async () => {
  const processingDir = store.get("processingDir") || aiPipeline.DEFAULT_PROCESSING_DIR;
  return pipelineLogger.listLogs(processingDir);
});

ipcMain.handle("pipelineLogs:read", async (_, logPath) => {
  return pipelineLogger.readLog(logPath);
});

ipcMain.handle("pipelineLogs:deleteOld", async (_, days) => {
  const processingDir = store.get("processingDir") || aiPipeline.DEFAULT_PROCESSING_DIR;
  return pipelineLogger.deleteOldLogs(processingDir, days || 30);
});

ipcMain.handle("pipelineLogs:delete", async (_, logPaths) => {
  return pipelineLogger.deleteLogs(logPaths);
});

ipcMain.handle("pipelineLogs:monthlyCost", async () => {
  const processingDir = store.get("processingDir") || aiPipeline.DEFAULT_PROCESSING_DIR;
  return pipelineLogger.getMonthlyCost(processingDir);
});

// ============ ELECTRON-STORE: persistent settings ============
ipcMain.handle("store:get", (_, key) => {
  return store.get(key);
});

ipcMain.handle("store:set", (_, key, value) => {
  store.set(key, value);
  return { success: true };
});

ipcMain.handle("store:getAll", () => {
  return store.store;
});

// ============ DEV DASHBOARD ============

ipcMain.handle("dev:getProviderInfo", async () => {
  return {
    llm: {
      active: store.get("llmProvider", "anthropic"),
      available: llmProvider.listProviders(),
      config: store.get("llmProviderConfig", {}),
      defaultModel: llmProvider.getProvider().defaultModel,
    },
    transcription: {
      active: store.get("transcriptionProvider", "stable-ts"),
      available: transcriptionProvider.listProviders(),
    },
  };
});

ipcMain.handle("dev:setLLMProvider", async (_, providerName, config) => {
  store.set("llmProvider", providerName);
  if (config) store.set("llmProviderConfig", config);
  return { success: true };
});

ipcMain.handle("dev:setTranscriptionProvider", async (_, providerName) => {
  store.set("transcriptionProvider", providerName);
  return { success: true };
});

ipcMain.handle("dev:testLLMConnection", async () => {
  try {
    const provider = llmProvider.getProvider();
    const start = Date.now();
    const { text, usage } = await provider.chat({
      model: provider.defaultModel,
      system: "Respond with exactly: OK",
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 10,
      timeout: 15000,
    });
    const latency = Date.now() - start;
    return { success: true, provider: provider.name, model: provider.defaultModel, latency, text: (text || "").trim(), usage };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("dev:getStoreKeys", async () => {
  const all = store.store;
  // Return key names + value types + truncated previews (don't dump full values for large objects)
  const keys = {};
  for (const [k, v] of Object.entries(all)) {
    const type = Array.isArray(v) ? "array" : typeof v;
    let preview;
    if (type === "string") preview = v.length > 80 ? v.substring(0, 80) + "..." : v;
    else if (type === "array") preview = `[${v.length} items]`;
    else if (type === "object" && v !== null) preview = `{${Object.keys(v).length} keys}`;
    else preview = String(v);
    keys[k] = { type, preview, value: v };
  }
  return keys;
});

ipcMain.handle("dev:setStoreKey", async (_, key, value) => {
  store.set(key, value);
  return { success: true };
});

ipcMain.handle("dev:deleteStoreKey", async (_, key) => {
  store.delete(key);
  return { success: true };
});

// ============ LLM AI API (provider-abstracted) ============

// Generate titles & captions for a clip
ipcMain.handle("anthropic:generate", async (_, params) => {
  try {
    const styleGuide = store.get("styleGuide") || "";
    const history = store.get("titleCaptionHistory") || [];

    // Build style history context: last 20 picks and 20 rejections
    const picks = history.filter((h) => h.type === "pick").slice(-20);
    const rejects = history.filter((h) => h.type === "reject").slice(-20);

    let styleHistory = "";
    if (picks.length > 0) {
      styleHistory += "\n\n## Creator's Past Picks (titles & captions they chose):\n";
      picks.forEach((p, i) => {
        styleHistory += `${i + 1}. Title: "${p.titleChosen}" | Caption: "${p.captionChosen}"${p.game ? ` [${p.game}]` : ""}\n`;
      });
    }
    if (rejects.length > 0) {
      styleHistory += "\n\n## Creator's Past Rejections (titles & captions they passed on):\n";
      rejects.forEach((r, i) => {
        styleHistory += `${i + 1}. ${r.titleRejected ? `Title: "${r.titleRejected}"` : `Caption: "${r.captionRejected}"`}${r.game ? ` [${r.game}]` : ""}\n`;
      });
    }

    // Build game context
    let gameContext = "";
    if (params.gameContextAuto) gameContext += `\n\n## Game Knowledge (auto-researched):\n${params.gameContextAuto}`;
    if (params.gameContextUser) gameContext += `\n\n## Creator's Play Style for ${params.gameName}:\n${params.gameContextUser}`;

    const systemPrompt = `# TASK

You are a title and caption specialist for short-form gaming content (YouTube Shorts, TikTok, Instagram Reels). You generate 5 title options and 5 caption options for a gaming clip based on its transcript.

---

# DEFINITIONS

## TITLE
The video's title on the platform. Shows in feed listings and search results.

Rules for titles:
1. Be short, punchy, and optimized for discoverability (3-10 words before the hashtag)
2. Include ONLY the game's hashtag at the end (e.g. "My Chess Rating is EMBARRASSING #arcraiders")
3. Do NOT include generic hashtags like #gaming, #gamingshorts, #shorts, #fyp — the platform description template handles those
4. Must work as standalone text that makes someone want to click/watch
5. Capitalize the first letter of each major word
6. Do not start more than one title with the same word across the 5 suggestions
7. Do not use "POV:" in more than one title
8. NEVER use emojis in titles — plain text only

## CAPTION
Scroll-stopping hook text BAKED INTO the video as a visible text overlay. The FIRST thing viewers read while scrolling.

Rules for captions:
1. Extremely punchy and short — 1-2 lines max, under 15 words ideal
2. Must create an immediate emotional reaction: curiosity, shock, humor, or relatability
3. Use bold, direct language (e.g. "I lost 12 games in ONE NIGHT" not a paragraph)
4. NEVER include hashtags — those go in the title only
5. Must make someone STOP SCROLLING before they even hear the audio
6. Each caption's "why" must name the specific psychological trigger (curiosity gap, shock value, relatability, FOMO, self-deprecation, etc.)
7. NEVER use emojis in captions — plain text only, no Unicode emoji characters

---

# RULES

1. Generate titles and captions as complementary pairs (title 1 pairs with caption 1) but the creator may mix and match
2. Each title's "why" explains why it performs well for search/discovery
3. Each caption's "why" names the specific psychological trigger that stops scrolling
4. If past picks and rejections are provided, analyze the PATTERNS (tone, perspective, length, humor style) — don't just mimic, understand the creator's preferences
5. All 5 suggestions must be meaningfully different from each other — vary structure, angle, and tone
6. Do not repeat a pattern the creator has previously rejected

${styleGuide ? `---\n\n# CREATOR'S STYLE GUIDE\n\n${styleGuide}` : ""}${gameContext}${styleHistory}

---

# OUTPUT FORMAT

Return ONLY valid JSON. Your entire response must be parseable by JSON.parse() with zero modifications.

Schema:
{
  "titles": [
    { "title": "<string, 3-10 words + #gamehashtag>", "why": "<string, 1 sentence explaining discovery value>" },
    { "title": "<string, 3-10 words + #gamehashtag>", "why": "<string, 1 sentence explaining discovery value>" },
    { "title": "<string, 3-10 words + #gamehashtag>", "why": "<string, 1 sentence explaining discovery value>" },
    { "title": "<string, 3-10 words + #gamehashtag>", "why": "<string, 1 sentence explaining discovery value>" },
    { "title": "<string, 3-10 words + #gamehashtag>", "why": "<string, 1 sentence explaining discovery value>" }
  ],
  "captions": [
    { "caption": "<string, under 15 words, no hashtags>", "why": "<string, name the psychological trigger>" },
    { "caption": "<string, under 15 words, no hashtags>", "why": "<string, name the psychological trigger>" },
    { "caption": "<string, under 15 words, no hashtags>", "why": "<string, name the psychological trigger>" },
    { "caption": "<string, under 15 words, no hashtags>", "why": "<string, name the psychological trigger>" },
    { "caption": "<string, under 15 words, no hashtags>", "why": "<string, name the psychological trigger>" }
  ]
}

## DO NOT:
- Do not wrap the JSON in markdown code fences
- Do not add any text before or after the JSON object
- Do not use placeholder values like "..." or "etc"
- Do not return fewer than 5 titles or fewer than 5 captions
- Do not include hashtags in captions — hashtags go in titles only
- Do not use emojis anywhere — no 🔥, 💀, 😭, etc. Plain text only`;

    let userMessage = `## Clip Transcript:\n${params.transcript || "(no transcript available)"}`;
    if (params.projectName) userMessage += `\n\n## Project/Game: ${params.projectName}`;
    if (params.userContext) userMessage += `\n\n## Additional Context from Creator:\n${params.userContext}`;
    if (params.rejectedSuggestions && params.rejectedSuggestions.length > 0) {
      userMessage += `\n\n## Previously Rejected Suggestions (avoid similar patterns):\n`;
      params.rejectedSuggestions.forEach((r) => {
        // Handle both string format (from sessionRejections) and object format
        const text = typeof r === "string" ? r : (r.text || r.title || r.caption || "");
        userMessage += `- "${text}"\n`;
      });
    }

    const provider = llmProvider.getProvider();
    const { text } = await provider.chat({
      model: provider.defaultModel,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 2000,
    });

    if (!text) return { error: "Empty response from LLM provider" };

    // Robust JSON extraction — handles fences, preamble, etc.
    try {
      const parsed = aiPrompt.extractJSON(text, "object");
      return { success: true, data: parsed };
    } catch (e) {
      return { error: `Failed to parse AI response as JSON: ${e.message}`, raw: text };
    }
  } catch (err) {
    return { error: err.message };
  }
});

// Research a game using Opus with web search (one-time per game)
ipcMain.handle("anthropic:researchGame", async (_, gameName) => {
  try {
    const provider = llmProvider.getProvider();
    const { text } = await provider.chat({
      model: "claude-opus-4-6",
      system: `You are a gaming research assistant. Your ONLY job is to describe what it's like to PLAY a specific game — the gameplay experience, not corporate info.

RULES:
- Focus ONLY on: what the gameplay is like, how people play it, game modes, player count, the vibe/energy of playing
- Include: funny situations that happen, chaotic moments, what makes it entertaining to watch
- Do NOT include: developer names, publishers, release dates, corporate history, platform availability, system requirements, review scores
- Do NOT include any preamble like "I'll research..." or "Here is the context for..."
- Start directly with the game description
- Keep it to 3-5 sentences max — concise and punchy
- Write as plain description text, no bullet points or headers`,
      messages: [{
        role: "user",
        content: `Describe the gameplay experience of "${gameName}". What is it like to play? How do people play it? What makes it fun, chaotic, or entertaining to watch?`,
      }],
      maxTokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    });

    if (!text) return { error: "Empty response from LLM provider" };

    // Strip any AI preamble that slipped through
    let summary = text.replace(/^(I'll research|Here is|Here's|Let me|Based on my research)[^\n]*\n+/i, "").trim();

    if (!summary) return { error: "No text summary in research response" };
    return { success: true, data: summary };
  } catch (err) {
    return { error: err.message };
  }
});

// Log a pick or rejection to the title/caption history
ipcMain.handle("anthropic:logHistory", async (_, entry) => {
  try {
    const history = store.get("titleCaptionHistory") || [];
    history.push({ ...entry, timestamp: new Date().toISOString() });
    // Keep history bounded to last 200 entries to prevent unbounded growth
    const bounded = history.length > 200 ? history.slice(-200) : history;
    store.set("titleCaptionHistory", bounded);
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

// ============ SUBTITLE DEBUG LOG ============
ipcMain.handle("debug:logSubtitle", async (_, entry) => {
  try {
    // Write to electron-store for SettingsView debug viewer
    const history = store.get("subtitleDebugLog") || [];
    history.push({ ...entry, timestamp: new Date().toISOString() });
    const bounded = history.length > 100 ? history.slice(-100) : history;
    store.set("subtitleDebugLog", bounded);
    // Also write to unified app.log for file-based debugging
    require("electron-log/main").scope("subtitles").info("Subtitle event", entry);
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("debug:getSubtitleLog", async () => {
  try {
    return store.get("subtitleDebugLog") || [];
  } catch (err) {
    return [];
  }
});

ipcMain.handle("debug:clearSubtitleLog", async () => {
  try {
    store.set("subtitleDebugLog", []);
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

// ============ RENDER PIPELINE ============
let activeRenderProc = null;

/**
 * Resolve the correct output folder for a render, honoring per-project test
 * mode. Re-reads the project from disk when projectData is missing the flag
 * (e.g. editor-originated render whose store never loaded it) so a stale
 * in-memory record can't leak test output into real folders.
 */
function resolveTestAwareOutputFolder(projectData) {
  const watchFolder = store.get("watchFolder");
  let testMode = projectData?.testMode === true;
  // Legacy fallback: older projects may still carry tags:["test"] if an upgrade
  // path hasn't been hit yet. Treat that as authoritative too.
  if (!testMode && Array.isArray(projectData?.tags) && projectData.tags.includes("test")) {
    testMode = true;
  }
  // Defense in depth: if projectData didn't include testMode at all, re-load
  // from disk so the render can't be tricked by a stale renderer-side object.
  if (!testMode && projectData?.id && typeof projectData.testMode === "undefined") {
    try {
      const fresh = projects.loadProject(watchFolder, projectData.id);
      if (fresh?.testMode === true) testMode = true;
    } catch (_) { /* non-critical */ }
  }

  if (testMode) {
    const testRoot = store.get("testWatchFolder") || path.join(watchFolder || "", "Test");
    return path.join(testRoot, "ClipFlow Renders");
  }
  return store.get("outputFolder");
}

ipcMain.handle("render:clip", async (event, clipData, projectData, outputPath, options) => {
  try {
    // Determine output path if not provided
    if (!outputPath) {
      const outputFolder = resolveTestAwareOutputFolder(projectData);
      if (!outputFolder) return { error: "Output folder not configured. Go to Settings." };
      const fileName = `${clipData.title || `clip_${clipData.id}`}.mp4`.replace(/[<>:"\/\\|?*]/g, "_");
      outputPath = path.join(outputFolder, fileName);
    }

    const result = await render.renderClip(clipData, projectData, outputPath, {
      subtitleStyle: options?.subtitleStyle || {},
      captionStyle: options?.captionStyle || {},
      captionSegments: options?.captionSegments || [],
      onProgress: (p) => {
        mainWindow?.webContents.send("render:progress", p);
      },
    });

    // Extract thumbnail from rendered clip
    let thumbnailPath = null;
    try {
      const thumbName = path.basename(result.path, ".mp4") + "_thumb.jpg";
      thumbnailPath = path.join(path.dirname(result.path), thumbName);
      await ffmpeg.generateThumbnail(result.path, thumbnailPath, 1);
    } catch (e) {
      console.warn("[render:clip] Thumbnail extraction failed:", e.message);
      thumbnailPath = null;
    }

    // Update clip renderStatus in project JSON
    if (projectData?.id && clipData?.id) {
      const watchFolder = store.get("watchFolder");
      try {
        projects.updateClip(watchFolder, projectData.id, clipData.id, {
          renderStatus: "rendered",
          renderPath: result.path,
          thumbnailPath,
        });
      } catch (e) { /* non-critical */ }
    }

    return { ...result, thumbnailPath };
  } catch (err) {
    console.error("[render:clip] Render failed:", err.message, err.stack);
    return { error: err.message };
  }
});

ipcMain.handle("render:batch", async (event, clips, projectData, outputDir, options) => {
  try {
    if (!outputDir) {
      outputDir = resolveTestAwareOutputFolder(projectData);
      if (!outputDir) return { error: "Output folder not configured. Go to Settings." };
    }

    const results = await render.batchRender(clips, projectData, outputDir, {
      subtitleStyle: options?.subtitleStyle || {},
      onProgress: (p) => {
        mainWindow?.webContents.send("render:progress", p);
      },
    });

    // Update render status + extract thumbnails for each successful clip
    const watchFolder = store.get("watchFolder");
    for (const r of results) {
      if (r.success && projectData?.id && r.clipId) {
        let thumbnailPath = null;
        try {
          const thumbName = path.basename(r.path, ".mp4") + "_thumb.jpg";
          thumbnailPath = path.join(path.dirname(r.path), thumbName);
          await ffmpeg.generateThumbnail(r.path, thumbnailPath, 1);
        } catch (e) {
          console.warn("[render:batch] Thumbnail extraction failed:", e.message);
          thumbnailPath = null;
        }
        try {
          projects.updateClip(watchFolder, projectData.id, r.clipId, {
            renderStatus: "rendered",
            renderPath: r.path,
            thumbnailPath,
          });
        } catch (e) { /* non-critical */ }
      }
    }

    return { success: true, results };
  } catch (err) {
    return { error: err.message };
  }
});

// ============ OAUTH: Connected Accounts ============

// Get all connected accounts (safe for UI — no tokens)
ipcMain.handle("oauth:getAccounts", async () => {
  return tokenStore.getAccountsForUI();
});

// Remove a connected account
ipcMain.handle("oauth:removeAccount", async (_, accountId) => {
  try {
    tokenStore.removeAccount(accountId);
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

// TikTok OAuth: start the connect flow
ipcMain.handle("oauth:tiktok:connect", async () => {
  try {
    const clientKey = store.get("tiktokClientKey");
    const clientSecret = store.get("tiktokClientSecret");

    if (!clientKey || !clientSecret) {
      return { error: "TikTok Client Key and Secret must be configured in Settings before connecting." };
    }

    require("electron-log/main").scope("tiktok").info("Starting TikTok OAuth flow");
    const accountData = await tiktokOAuth.startOAuthFlow(clientKey, clientSecret);

    // Save to encrypted token store
    const accountId = `tiktok_${accountData.openId}`;
    tokenStore.saveAccount(accountId, accountData);
    require("electron-log/main").scope("tiktok").info("Account saved", { accountId, displayName: accountData.displayName });

    // Return the UI-safe account data
    return {
      success: true,
      account: {
        key: accountId,
        platform: "TikTok",
        abbr: "TT",
        name: accountData.displayName,
        displayName: accountData.displayName,
        avatarUrl: accountData.avatarUrl,
        connected: true,
        openId: accountData.openId,
      },
    };
  } catch (err) {
    require("electron-log/main").scope("tiktok").error("OAuth connect failed", { error: err.message });
    return { error: err.message };
  }
});

// ── TikTok Content Posting ──

ipcMain.handle("tiktok:publish", async (event, { accountId, videoPath, title, caption, clipId, postMode, isTest }) => {
  const logBase = { clipId: clipId || "", clipTitle: title || "", platform: "TikTok", accountId, accountName: "", videoPath };
  try {
    if (isTest) {
      const err = "Test clip \u2014 publishing skipped. Untoggle TEST on the clip to go live.";
      publishLog.logPublish({ ...logBase, status: "skipped", error: err });
      return { error: err, testBlocked: true };
    }
    // Get the stored account tokens
    const account = tokenStore.getAccount(accountId);
    if (!account) {
      const err = "TikTok account not found. Please reconnect in Settings.";
      publishLog.logPublish({ ...logBase, status: "failed", error: err });
      return { error: err };
    }
    logBase.accountName = account.displayName || accountId;

    require("electron-log/main").scope("tiktok").info("Starting publish", { title, accountId, displayName: account.displayName, videoPath });

    let accessToken = account.accessToken;

    // Check if token is expired and refresh if needed
    if (account.expiresAt && Date.now() > account.expiresAt) {
      require("electron-log/main").scope("tiktok").info("Token expired, refreshing");
      const clientKey = store.get("tiktokClientKey");
      if (!clientKey || !account.refreshToken) {
        const err = "Cannot refresh TikTok token. Please reconnect in Settings.";
        publishLog.logPublish({ ...logBase, status: "failed", error: err });
        return { error: err };
      }
      const refreshResult = await tiktokOAuth.refreshAccessToken(clientKey, account.refreshToken);
      require("electron-log/main").scope("tiktok").debug("Token refresh result", refreshResult);
      if (refreshResult.error || !refreshResult.access_token) {
        const err = `Token refresh failed: ${refreshResult.error_description || refreshResult.error || "Unknown error"}`;
        publishLog.logPublish({ ...logBase, status: "failed", error: err, apiResponse: refreshResult });
        return { error: err };
      }
      tokenStore.updateTokens(
        accountId,
        refreshResult.access_token,
        refreshResult.refresh_token || account.refreshToken,
        Date.now() + (refreshResult.expires_in || 86400) * 1000,
      );
      accessToken = refreshResult.access_token;
    }

    // Build the caption
    const postCaption = caption || title || "";
    require("electron-log/main").scope("tiktok").debug("Caption", { caption: postCaption });

    // Publish with progress events
    const result = await tiktokPublish.publishVideo(
      accessToken,
      videoPath,
      {
        title: postCaption,
        privacy_level: "PUBLIC_TO_EVERYONE",
        mode: postMode || "direct_post",
      },
      (progress) => {
        mainWindow?.webContents.send("tiktok:publishProgress", progress);
      }
    );

    require("electron-log/main").scope("tiktok").info("Publish success", { publish_id: result.publish_id, post_id: result.post_id, status: result.status });
    publishLog.logPublish({
      ...logBase, status: "success",
      publishId: result.publish_id, postId: result.post_id,
      apiResponse: { status: result.status, publish_id: result.publish_id, post_id: result.post_id },
    });

    return {
      success: true,
      publish_id: result.publish_id,
      post_id: result.post_id,
      status: result.status,
    };
  } catch (err) {
    require("electron-log/main").scope("tiktok").error("Publish failed", { error: err.message });
    publishLog.logPublish({ ...logBase, status: "failed", error: err.message });
    return { error: err.message };
  }
});

// ── Instagram Business Login OAuth ──

ipcMain.handle("oauth:instagram:connect", async () => {
  try {
    const appId = store.get("instagramAppId");
    const appSecret = store.get("instagramAppSecret");

    if (!appId || !appSecret) {
      return { error: "Instagram App ID and App Secret must be configured in Settings before connecting." };
    }

    require("electron-log/main").scope("instagram-oauth").info("Starting Instagram Business Login flow");
    const accountData = await instagramOAuth.startOAuthFlow(appId, appSecret);

    const accountId = `ig_${accountData.openId}`;
    tokenStore.saveAccount(accountId, accountData);
    require("electron-log/main").scope("instagram-oauth").info("Account saved", { accountId, displayName: accountData.displayName });

    return {
      success: true,
      account: {
        key: accountId,
        platform: "Instagram",
        abbr: "IG",
        name: accountData.displayName,
        displayName: accountData.displayName,
        avatarUrl: accountData.avatarUrl,
        connected: true,
        openId: accountData.openId,
        igAccountId: accountData.igAccountId,
        loginType: "instagram_business_login",
      },
    };
  } catch (err) {
    require("electron-log/main").scope("instagram-oauth").error("OAuth connect failed", { error: err.message });
    return { error: err.message };
  }
});

// ── Facebook Page OAuth ──

ipcMain.handle("oauth:facebook:connect", async () => {
  try {
    const appId = store.get("metaAppId");
    const appSecret = store.get("metaAppSecret");

    if (!appId || !appSecret) {
      return { error: "Meta App ID and App Secret must be configured in Settings before connecting." };
    }

    require("electron-log/main").scope("meta").info("Starting Facebook Page OAuth flow");
    const accountData = await metaOAuth.startOAuthFlow(appId, appSecret);

    const accountId = `fb_${accountData.pageId}`;
    tokenStore.saveAccount(accountId, accountData);
    require("electron-log/main").scope("meta").info("Account saved", { accountId, displayName: accountData.displayName });

    return {
      success: true,
      account: {
        key: accountId,
        platform: "Facebook",
        abbr: "FB",
        name: accountData.displayName,
        displayName: accountData.displayName,
        avatarUrl: accountData.avatarUrl,
        connected: true,
        openId: accountData.openId,
        pageId: accountData.pageId,
        pageName: accountData.pageName,
        loginType: "facebook_login",
      },
    };
  } catch (err) {
    require("electron-log/main").scope("meta").error("OAuth connect failed", { error: err.message });
    return { error: err.message };
  }
});


// ── Instagram Content Publishing ──

ipcMain.handle("instagram:publish", async (event, { accountId, videoPath, title, caption, clipId, isTest }) => {
  const logBase = { clipId: clipId || "", clipTitle: title || "", platform: "Instagram", accountId, accountName: "", videoPath };
  try {
    if (isTest) {
      const err = "Test clip \u2014 publishing skipped. Untoggle TEST on the clip to go live.";
      publishLog.logPublish({ ...logBase, status: "skipped", error: err });
      return { error: err, testBlocked: true };
    }
    const account = tokenStore.getAccount(accountId);
    if (!account) {
      const err = "Instagram account not found. Please reconnect in Settings.";
      publishLog.logPublish({ ...logBase, status: "failed", error: err });
      return { error: err };
    }
    logBase.accountName = account.displayName || accountId;

    if (!account.igAccountId) {
      const err = "No Instagram account ID found. Please reconnect your Instagram account.";
      publishLog.logPublish({ ...logBase, status: "failed", error: err });
      return { error: err };
    }

    const isIgLogin = account.loginType === "instagram_business_login";
    require("electron-log/main").scope("instagram").info("Starting publish", { title, accountId, loginType: isIgLogin ? "ig_login" : "fb_login" });
    let accessToken = account.accessToken;

    // Check token expiry and refresh if needed
    if (account.expiresAt && Date.now() > account.expiresAt) {
      require("electron-log/main").scope("instagram").info("Token expired, refreshing");

      if (isIgLogin) {
        // Instagram Business Login tokens — refresh via graph.instagram.com
        const refreshResult = await instagramOAuth.refreshLongLivedToken(accessToken);
        if (refreshResult.error || !refreshResult.access_token) {
          const err = `Token refresh failed: ${refreshResult.error?.message || "Unknown error"}. Please reconnect your Instagram account.`;
          publishLog.logPublish({ ...logBase, status: "failed", error: err });
          return { error: err };
        }
        tokenStore.updateTokens(accountId, refreshResult.access_token, "", Date.now() + (refreshResult.expires_in || 5184000) * 1000);
        accessToken = refreshResult.access_token;
      } else {
        // Facebook Login tokens — refresh via graph.facebook.com
        const appId = store.get("metaAppId");
        const appSecret = store.get("metaAppSecret");
        if (!appId || !appSecret) {
          const err = "Cannot refresh token — Meta App ID/Secret missing. Please reconnect in Settings.";
          publishLog.logPublish({ ...logBase, status: "failed", error: err });
          return { error: err };
        }
        const refreshResult = await metaOAuth.refreshLongLivedToken(appId, appSecret, accessToken);
        if (refreshResult.error || !refreshResult.access_token) {
          const err = `Token refresh failed: ${refreshResult.error?.message || "Unknown error"}`;
          publishLog.logPublish({ ...logBase, status: "failed", error: err });
          return { error: err };
        }
        tokenStore.updateTokens(accountId, refreshResult.access_token, "", Date.now() + (refreshResult.expires_in || 5184000) * 1000);
        accessToken = refreshResult.access_token;
      }
    }

    const postCaption = caption || title || "";
    const result = await instagramPublish.publishReel(
      accessToken,
      account.igAccountId,
      videoPath,
      { caption: postCaption, useIgGraph: isIgLogin },
      (progress) => {
        mainWindow?.webContents.send("instagram:publishProgress", progress);
      }
    );

    require("electron-log/main").scope("instagram").info("Publish success", { mediaId: result.mediaId });
    publishLog.logPublish({
      ...logBase, status: "success",
      publishId: result.mediaId, postId: result.mediaId,
      apiResponse: result,
    });

    return { success: true, mediaId: result.mediaId, status: result.status };
  } catch (err) {
    require("electron-log/main").scope("instagram").error("Publish failed", { error: err.message });
    publishLog.logPublish({ ...logBase, status: "failed", error: err.message });
    return { error: err.message };
  }
});

// ── Facebook Page Publishing ──

ipcMain.handle("facebook:publish", async (event, { accountId, videoPath, title, caption, clipId, isTest }) => {
  const logBase = { clipId: clipId || "", clipTitle: title || "", platform: "Facebook", accountId, accountName: "", videoPath };
  try {
    if (isTest) {
      const err = "Test clip \u2014 publishing skipped. Untoggle TEST on the clip to go live.";
      publishLog.logPublish({ ...logBase, status: "skipped", error: err });
      return { error: err, testBlocked: true };
    }
    const account = tokenStore.getAccount(accountId);
    if (!account) {
      const err = "Facebook account not found. Please reconnect in Settings.";
      publishLog.logPublish({ ...logBase, status: "failed", error: err });
      return { error: err };
    }
    logBase.accountName = account.displayName || accountId;

    if (!account.pageId || !account.pageAccessToken) {
      const err = "No Facebook Page found. Please reconnect your Facebook Page.";
      publishLog.logPublish({ ...logBase, status: "failed", error: err });
      return { error: err };
    }

    require("electron-log/main").scope("facebook").info("Starting publish", { title, accountId, pageName: account.pageName });

    const result = await facebookPublish.publishVideo(
      account.pageAccessToken,
      account.pageId,
      videoPath,
      { title: title || "", description: caption || title || "" },
      (progress) => {
        mainWindow?.webContents.send("facebook:publishProgress", progress);
      }
    );

    require("electron-log/main").scope("facebook").info("Publish success", { videoId: result.videoId });
    publishLog.logPublish({
      ...logBase, status: "success",
      publishId: result.videoId, postId: result.videoId,
      apiResponse: result,
    });

    return { success: true, videoId: result.videoId, status: result.status };
  } catch (err) {
    require("electron-log/main").scope("facebook").error("Publish failed", { error: err.message });
    publishLog.logPublish({ ...logBase, status: "failed", error: err.message });
    return { error: err.message };
  }
});

// ── YouTube OAuth ──

ipcMain.handle("oauth:youtube:connect", async () => {
  try {
    const clientId = store.get("youtubeClientId");
    const clientSecret = store.get("youtubeClientSecret");

    if (!clientId || !clientSecret) {
      return { error: "YouTube Client ID and Client Secret must be configured in Settings before connecting." };
    }

    require("electron-log/main").scope("youtube").info("Starting YouTube OAuth flow");
    const accountData = await youtubeOAuth.startOAuthFlow(clientId, clientSecret);

    const accountId = `youtube_${accountData.channelId}`;
    tokenStore.saveAccount(accountId, accountData);
    require("electron-log/main").scope("youtube").info("Account saved", { accountId, displayName: accountData.displayName });

    return {
      success: true,
      account: {
        key: accountId,
        platform: "YouTube",
        abbr: "YT",
        name: accountData.displayName,
        displayName: accountData.displayName,
        avatarUrl: accountData.avatarUrl,
        connected: true,
        openId: accountData.channelId,
        channelId: accountData.channelId,
      },
    };
  } catch (err) {
    require("electron-log/main").scope("youtube").error("OAuth connect failed", { error: err.message });
    return { error: err.message };
  }
});

// ── YouTube Publishing ──

ipcMain.handle("youtube:publish", async (event, { accountId, videoPath, title, caption, clipId, tags, youtubeTitle, privacyStatus, isTest }) => {
  const logBase = { clipId: clipId || "", clipTitle: title || "", platform: "YouTube", accountId, accountName: "", videoPath };
  try {
    if (isTest) {
      const err = "Test clip \u2014 publishing skipped. Untoggle TEST on the clip to go live.";
      publishLog.logPublish({ ...logBase, status: "skipped", error: err });
      return { error: err, testBlocked: true };
    }
    const account = tokenStore.getAccount(accountId);
    if (!account) {
      const err = "YouTube account not found. Please reconnect in Settings.";
      publishLog.logPublish({ ...logBase, status: "failed", error: err });
      return { error: err };
    }
    logBase.accountName = account.displayName || accountId;

    require("electron-log/main").scope("youtube").info("Starting publish", { title, accountId, displayName: account.displayName });
    let accessToken = account.accessToken;

    // Check token expiry and refresh if needed (YouTube access tokens last ~1 hour)
    if (account.expiresAt && Date.now() > account.expiresAt) {
      require("electron-log/main").scope("youtube").info("Token expired, refreshing");
      const clientId = store.get("youtubeClientId");
      const clientSecret = store.get("youtubeClientSecret");
      if (!clientId || !clientSecret || !account.refreshToken) {
        const err = "Cannot refresh YouTube token. Please reconnect in Settings.";
        publishLog.logPublish({ ...logBase, status: "failed", error: err });
        return { error: err };
      }
      const refreshResult = await youtubeOAuth.refreshAccessToken(clientId, clientSecret, account.refreshToken);
      if (refreshResult.error || !refreshResult.access_token) {
        const err = `Token refresh failed: ${refreshResult.error_description || refreshResult.error || "Unknown error"}`;
        publishLog.logPublish({ ...logBase, status: "failed", error: err, apiResponse: refreshResult });
        return { error: err };
      }
      tokenStore.updateTokens(
        accountId,
        refreshResult.access_token,
        account.refreshToken, // YouTube doesn't return new refresh token on refresh
        Date.now() + (refreshResult.expires_in || 3600) * 1000,
      );
      accessToken = refreshResult.access_token;
    }

    const result = await youtubePublish.publishVideo(
      accessToken,
      videoPath,
      {
        title: youtubeTitle || title || "Untitled",
        description: caption || "",
        tags: tags || [],
        privacyStatus: privacyStatus || "public",
        categoryId: "20", // Gaming
      },
      (progress) => {
        mainWindow?.webContents.send("youtube:publishProgress", progress);
      }
    );

    require("electron-log/main").scope("youtube").info("Publish success", { videoId: result.videoId });
    publishLog.logPublish({
      ...logBase, status: "success",
      publishId: result.videoId, postId: result.videoId,
      apiResponse: result,
    });

    return { success: true, videoId: result.videoId, status: result.status };
  } catch (err) {
    require("electron-log/main").scope("youtube").error("Publish failed", { error: err.message });
    publishLog.logPublish({ ...logBase, status: "failed", error: err.message });
    return { error: err.message };
  }
});

// ── Publish log queries ──
ipcMain.handle("publishLog:getRecent", async (_, limit) => {
  return publishLog.getRecentLogs(limit || 50);
});

ipcMain.handle("publishLog:getForClip", async (_, clipId) => {
  return publishLog.getLogsForClip(clipId);
});

// ============ LOGGING & BUG REPORTS ============

// Get available log modules (for the report UI dropdown)
ipcMain.handle("logs:getModules", async () => {
  return Object.values(logger.MODULES);
});

// Get session logs, optionally filtered by modules
ipcMain.handle("logs:getSessionLogs", async (_, modules) => {
  return logger.getSessionLogs(modules);
});

// Build and export a bug report
ipcMain.handle("logs:exportReport", async (_, { description, modules, severity }) => {
  const report = logger.buildReport(description, modules, severity);

  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save Bug Report",
    defaultPath: path.join(app.getPath("desktop"), `clipflow-report-${report.reportId}.json`),
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  fs.writeFileSync(result.filePath, JSON.stringify(report, null, 2), "utf-8");
  logger.info(logger.MODULES.system, "Bug report exported", { reportId: report.reportId, path: result.filePath });
  return { success: true, reportId: report.reportId, filePath: result.filePath };
});

// Get app version
ipcMain.handle("app:getVersion", async () => {
  return app.getVersion();
});

// Get logs directory path (for dev / Claude Code access)
ipcMain.handle("logs:getDir", async () => {
  return logger.getLogsDir();
});

// ── Project Folders ──

function reconcileFolders(folders, existingProjectIds) {
  return folders.map((folder) => ({
    ...folder,
    projectIds: folder.projectIds.filter((id) => existingProjectIds.includes(id)),
  }));
}

ipcMain.handle("folder:list", async () => {
  try {
    const folders = store.get("projectFolders") || [];
    const watchFolder = store.get("watchFolder");
    const result = projects.listProjects(watchFolder);
    const existingIds = (result.projects || []).map((p) => p.id);
    const reconciled = reconcileFolders(folders, existingIds);
    // Persist if reconciliation pruned any stale IDs
    if (JSON.stringify(reconciled) !== JSON.stringify(folders)) {
      store.set("projectFolders", reconciled);
    }
    return { folders: reconciled };
  } catch (err) {
    return { folders: store.get("projectFolders") || [] };
  }
});

ipcMain.handle("folder:create", async (_, { name, color }) => {
  try {
    const folders = store.get("projectFolders") || [];
    const folder = {
      id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: name || "New Folder",
      color: color || "#3b82f6",
      createdAt: new Date().toISOString(),
      projectIds: [],
    };
    folders.push(folder);
    store.set("projectFolders", folders);
    return { success: true, folder };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("folder:update", async (_, folderId, patch) => {
  try {
    const folders = store.get("projectFolders") || [];
    const idx = folders.findIndex((f) => f.id === folderId);
    if (idx === -1) return { success: false, error: "Folder not found" };
    if (patch.name !== undefined) folders[idx].name = patch.name;
    if (patch.color !== undefined) folders[idx].color = patch.color;
    store.set("projectFolders", folders);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("folder:delete", async (_, folderId) => {
  try {
    const folders = store.get("projectFolders") || [];
    const idx = folders.findIndex((f) => f.id === folderId);
    if (idx === -1) return { success: false, error: "Folder not found" };
    const freedProjectIds = folders[idx].projectIds || [];
    folders.splice(idx, 1);
    store.set("projectFolders", folders);
    return { success: true, freedProjectIds };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("folder:addProjects", async (_, folderId, projectIds) => {
  try {
    const folders = store.get("projectFolders") || [];
    const movedFrom = [];
    // Remove each project from its current folder
    for (const pid of projectIds) {
      let fromFolder = null;
      for (const f of folders) {
        const pidIdx = f.projectIds.indexOf(pid);
        if (pidIdx !== -1) {
          fromFolder = f.name;
          f.projectIds.splice(pidIdx, 1);
          break;
        }
      }
      movedFrom.push({ projectId: pid, folderName: fromFolder });
    }
    // Add to target folder (or leave unassigned if folderId is null)
    if (folderId !== null) {
      const target = folders.find((f) => f.id === folderId);
      if (!target) return { success: false, error: "Target folder not found" };
      for (const pid of projectIds) {
        if (!target.projectIds.includes(pid)) target.projectIds.push(pid);
      }
    }
    store.set("projectFolders", folders);
    return { success: true, movedFrom };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("folder:reorder", async (_, folderIds) => {
  try {
    const folders = store.get("projectFolders") || [];
    const reordered = folderIds
      .map((id) => folders.find((f) => f.id === id))
      .filter(Boolean);
    store.set("projectFolders", reordered);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

