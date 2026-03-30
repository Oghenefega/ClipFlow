require("dotenv").config();
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const chokidar = require("chokidar");
const Store = require("electron-store");
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

/** Generate a UUID v4 */
function _uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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

const store = new Store({
  name: "clipflow-settings",
  defaults: {
    watchFolder: "W:\\YouTube Gaming Recordings Onward\\Vertical Recordings Onwards",
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
  },
});

// ── Initialize provider registries with store ──
llmProvider.init(store);
transcriptionProvider.init(store);

// ── Migration: add provider config defaults ──
if (!store.has("llmProvider")) store.set("llmProvider", "anthropic");
if (!store.has("llmProviderConfig")) store.set("llmProviderConfig", {});
if (!store.has("transcriptionProvider")) store.set("transcriptionProvider", "stable-ts");
if (!store.has("devMode")) store.set("devMode", false);

// ── Migration: add video splitting settings ──
if (!store.has("splitThresholdMinutes")) store.set("splitThresholdMinutes", 30);
if (!store.has("autoSplitEnabled")) store.set("autoSplitEnabled", true);
if (!store.has("splitSourceRetention")) store.set("splitSourceRetention", "keep");

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

let mainWindow;
let watcher = null;

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
    },
    icon: path.join(__dirname, "../../public/icon.png"),
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../build/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Initialize electron-log (must happen before BrowserWindow creation)
  logger.initialize();
  // Clean up old-format log files
  logger.rotateLogs(7);
  // Log app startup
  logger.info(logger.MODULES.system, "App started", {
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    logsDir: logger.getLogsDirPath(),
  });
  // Initialize shared SQLite database (feedback + file metadata)
  await database.init();

  // Run one-time migrations for rename redesign
  fileMigration.migrateStoreData(store);
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
  database.close();
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

// File watcher: start watching a folder
// Raw OBS files: YYYY-MM-DD HH-MM-SS[optional -vertical].(mp4|mkv)
// Already-renamed files like "2026-02-06 AR Day25 Pt18.mp4" do NOT match
const RAW_OBS_PATTERN = /^\d{4}-\d{2}-\d{2}[ _]\d{2}-\d{2}-\d{2}(-vertical)?\.(mp4|mkv)$/i;

ipcMain.handle("watcher:start", async (_, folderPath) => {
  if (watcher) watcher.close();

  watcher = chokidar.watch(folderPath, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: false,
    depth: 0, // root folder only — do not recurse into monthly subfolders
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  });

  watcher.on("add", (filePath) => {
    const name = path.basename(filePath);
    // Only pick up raw OBS recordings; skip already-renamed files and non-video files
    if (!RAW_OBS_PATTERN.test(name)) return;
    const stat = fs.statSync(filePath);
    mainWindow?.webContents.send("watcher:fileAdded", {
      name,
      path: filePath,
      size: stat.size,
      createdAt: stat.birthtime.toISOString(),
    });
  });

  watcher.on("unlink", (filePath) => {
    mainWindow?.webContents.send("watcher:fileRemoved", {
      name: path.basename(filePath),
      path: filePath,
    });
  });

  return { success: true };
});

// File watcher: stop
ipcMain.handle("watcher:stop", async () => {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  return { success: true };
});

// Shell: open folder in explorer
ipcMain.handle("shell:openFolder", async (_, folderPath) => {
  shell.openPath(folderPath);
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
  try { return await ffmpeg.extractAudio(videoPath, wavPath); }
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
  try { return await ffmpeg.extractWaveformPeaks(filePath, peakCount || 400); }
  catch (err) { return { error: err.message, peaks: [] }; }
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
        `INSERT INTO file_metadata (id, original_filename, current_filename, original_path, current_path, tag, entry_type, date, day_number, part_number, custom_label, naming_preset, duration_seconds, file_size_bytes, status, split_from_id, split_timestamp_start, split_timestamp_end)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

    // Step 1: Extract audio from clip video
    const wavPath = clipPath.replace(/\.[^.]+$/, "-retranscribe.wav");
    if (mainWindow) mainWindow.webContents.send("retranscribe:progress", { stage: "extracting", pct: 10 });
    await ffmpeg.extractAudio(clipPath, wavPath);

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

ipcMain.handle("project:list", async () => {
  try {
    const watchFolder = store.get("watchFolder");
    return projects.listProjects(watchFolder);
  } catch (err) { return { error: err.message, projects: [] }; }
});

ipcMain.handle("project:delete", async (_, projectId) => {
  try {
    const watchFolder = store.get("watchFolder");
    return projects.deleteProject(watchFolder, projectId);
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
ipcMain.handle("pipeline:generateClips", async (_, sourceFile, gameData) => {
  const watchFolder = store.get("watchFolder");
  const sendProgress = (stage, pct, detail) => {
    mainWindow?.webContents.send("pipeline:progress", { stage, pct, detail });
  };

  return aiPipeline.runAIPipeline({ sourceFile, gameData, watchFolder, store, sendProgress });
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

    const id = _uuid();
    db.run(
      `INSERT INTO file_metadata (id, original_filename, current_filename, original_path, current_path, tag, entry_type, date, day_number, part_number, custom_label, naming_preset, duration_seconds, file_size_bytes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        data.fileSizeBytes || null,
        data.status || "renamed",
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
        [_uuid(), tag, label]
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
ipcMain.handle("store:get", async (_, key) => {
  return store.get(key);
});

ipcMain.handle("store:set", async (_, key, value) => {
  store.set(key, value);
  return { success: true };
});

ipcMain.handle("store:getAll", async () => {
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

## CAPTION
Scroll-stopping hook text BAKED INTO the video as a visible text overlay. The FIRST thing viewers read while scrolling.

Rules for captions:
1. Extremely punchy and short — 1-2 lines max, under 15 words ideal
2. Must create an immediate emotional reaction: curiosity, shock, humor, or relatability
3. Use bold, direct language (e.g. "I lost 12 games in ONE NIGHT" not a paragraph)
4. NEVER include hashtags — those go in the title only
5. Must make someone STOP SCROLLING before they even hear the audio
6. Each caption's "why" must name the specific psychological trigger (curiosity gap, shock value, relatability, FOMO, self-deprecation, etc.)

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
- Do not include hashtags in captions — hashtags go in titles only`;

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

ipcMain.handle("render:clip", async (event, clipData, projectData, outputPath, options) => {
  try {
    // Determine output path if not provided
    if (!outputPath) {
      const outputFolder = store.get("outputFolder");
      if (!outputFolder) return { error: "Output folder not configured. Go to Settings." };
      const fileName = `${clipData.title || `clip_${clipData.id}`}.mp4`.replace(/[<>:"\/\\|?*]/g, "_");
      outputPath = path.join(outputFolder, fileName);
    }

    const result = await render.renderClip(clipData, projectData, outputPath, {
      subtitleStyle: options?.subtitleStyle || {},
      onProgress: (p) => {
        mainWindow?.webContents.send("render:progress", p);
      },
    });

    // Update clip renderStatus in project JSON
    if (projectData?.id && clipData?.id) {
      const watchFolder = store.get("watchFolder");
      try {
        projects.updateClip(watchFolder, projectData.id, clipData.id, {
          renderStatus: "rendered",
          renderPath: result.path,
        });
      } catch (e) { /* non-critical */ }
    }

    return result;
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("render:batch", async (event, clips, projectData, outputDir, options) => {
  try {
    if (!outputDir) {
      outputDir = store.get("outputFolder");
      if (!outputDir) return { error: "Output folder not configured. Go to Settings." };
    }

    const results = await render.batchRender(clips, projectData, outputDir, {
      subtitleStyle: options?.subtitleStyle || {},
      onProgress: (p) => {
        mainWindow?.webContents.send("render:progress", p);
      },
    });

    // Update render status for each successful clip
    const watchFolder = store.get("watchFolder");
    for (const r of results) {
      if (r.success && projectData?.id && r.clipId) {
        try {
          projects.updateClip(watchFolder, projectData.id, r.clipId, {
            renderStatus: "rendered",
            renderPath: r.path,
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

ipcMain.handle("tiktok:publish", async (event, { accountId, videoPath, title, caption, clipId, postMode }) => {
  const logBase = { clipId: clipId || "", clipTitle: title || "", platform: "TikTok", accountId, accountName: "", videoPath };
  try {
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

ipcMain.handle("instagram:publish", async (event, { accountId, videoPath, title, caption, clipId }) => {
  const logBase = { clipId: clipId || "", clipTitle: title || "", platform: "Instagram", accountId, accountName: "", videoPath };
  try {
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

ipcMain.handle("facebook:publish", async (event, { accountId, videoPath, title, caption, clipId }) => {
  const logBase = { clipId: clipId || "", clipTitle: title || "", platform: "Facebook", accountId, accountName: "", videoPath };
  try {
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

ipcMain.handle("youtube:publish", async (event, { accountId, videoPath, title, caption, clipId, tags }) => {
  const logBase = { clipId: clipId || "", clipTitle: title || "", platform: "YouTube", accountId, accountName: "", videoPath };
  try {
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
        title: title || "Untitled",
        description: caption || "",
        tags: tags || [],
        privacyStatus: "public",
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
  return logger.getLogsDirPath();
});

