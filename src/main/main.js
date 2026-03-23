require("dotenv").config();
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const chokidar = require("chokidar");
const Store = require("electron-store");
const ffmpeg = require("./ffmpeg");
const whisper = require("./whisper");
const projects = require("./projects");
const highlights = require("./highlights");
const render = require("./render");
const aiPipeline = require("./ai-pipeline");
const feedbackDb = require("./feedback");
const gameProfiles = require("./game-profiles");
const pipelineLogger = require("./pipeline-logger");
const tokenStore = require("./token-store");
const tiktokOAuth = require("./oauth/tiktok");
const tiktokPublish = require("./oauth/tiktok-publish");
const publishLog = require("./publish-log");
const logger = require("./logger");

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
  },
});

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

app.whenReady().then(() => {
  // Rotate old log files (keep 7 days)
  logger.rotateLogs(7);
  // Log app startup
  logger.info(logger.MODULES.system, "App started", {
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    logsDir: logger.getLogsDirPath(),
  });
  createWindow();
});

app.on("window-all-closed", () => {
  if (watcher) watcher.close();
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

// OBS log parser: find most recent log and extract game exe
ipcMain.handle("obs:parseLog", async (_, obsLogDir) => {
  try {
    if (!fs.existsSync(obsLogDir)) return { error: "OBS log directory not found" };

    const logFiles = fs
      .readdirSync(obsLogDir)
      .filter((f) => f.endsWith(".txt"))
      .sort()
      .reverse();

    if (logFiles.length === 0) return { error: "No OBS log files found" };

    const logContent = fs.readFileSync(path.join(obsLogDir, logFiles[0]), "utf-8");

    // Extract game capture source exe names
    const exeMatches = logContent.match(/game_capture.*?:\s*(\w+\.exe)/gi) || [];
    const exes = [...new Set(exeMatches.map((m) => {
      const match = m.match(/(\w+\.exe)/i);
      return match ? match[1] : null;
    }).filter(Boolean))];

    // Extract recording start/stop times
    const recordings = [];
    const startMatches = logContent.matchAll(/(\d{2}:\d{2}:\d{2}\.\d+).*Recording Start/g);
    const stopMatches = logContent.matchAll(/(\d{2}:\d{2}:\d{2}\.\d+).*Recording Stop/g);
    const starts = [...startMatches].map((m) => m[1]);
    const stops = [...stopMatches].map((m) => m[1]);

    for (let i = 0; i < starts.length; i++) {
      recordings.push({
        start: starts[i],
        stop: stops[i] || null,
        exe: exes[exes.length - 1] || null, // most recent game exe
      });
    }

    return { logFile: logFiles[0], exes, recordings };
  } catch (err) {
    return { error: err.message };
  }
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

// ============ SCAN WATCH FOLDER: build managedFiles from actual filesystem ============
// Parses renamed files like "2026-03-03 AR Day25 Pt1.mp4" in monthly subfolders
const RENAMED_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\s+(\w+)\s+Day(\d+)\s+Pt(\d+)\.(mp4|mkv)$/i;

ipcMain.handle("fs:scanWatchFolder", async (_, watchFolderPath) => {
  try {
    if (!fs.existsSync(watchFolderPath)) return { error: "Watch folder not found", files: [] };

    const entries = fs.readdirSync(watchFolderPath, { withFileTypes: true });
    const gamesDb = store.get("gamesDb") || [];
    const managed = [];

    // Scan monthly subfolders (e.g., 2026-03, 2026-02)
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Match YYYY-MM folder pattern
      if (!/^\d{4}-\d{2}$/.test(entry.name)) continue;

      const subfolderPath = path.join(watchFolderPath, entry.name);
      let files;
      try {
        files = fs.readdirSync(subfolderPath);
      } catch (e) {
        continue;
      }

      for (const fileName of files) {
        const match = fileName.match(RENAMED_FILE_PATTERN);
        if (!match) continue;

        const [, fileDate, tag, dayStr, partStr] = match;
        const day = parseInt(dayStr, 10);
        const part = parseInt(partStr, 10);

        // Look up game info from gamesDb
        const game = gamesDb.find((g) => g.tag === tag);
        const gameName = game ? game.name : tag;
        const color = game ? game.color : "#888";

        let createdAt;
        try {
          const stat = fs.statSync(path.join(subfolderPath, fileName));
          createdAt = stat.birthtime.toISOString();
        } catch (e) {
          createdAt = `${fileDate}T00:00:00.000Z`;
        }

        managed.push({
          id: `m-${entry.name}-${fileName}`,
          name: fileName,
          tag,
          game: gameName,
          color,
          day,
          part,
          folder: entry.name,
          createdAt,
        });
      }
    }

    return { files: managed };
  } catch (err) {
    return { error: err.message, files: [] };
  }
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

    console.log("[ExtendRight IPC] clip.startTime:", clip.startTime, "clip.endTime:", clip.endTime, "newEndTime:", newEndTime, "sourceFile:", sourceFile);

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

    console.log("[ExtendLeft IPC] clip.startTime:", clip.startTime, "clip.endTime:", clip.endTime, "clip.duration:", clip.duration, "newSourceStartTime:", newSourceStartTime, "newStart:", newStart, "endTime:", endTime, "sourceFile:", sourceFile);

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

    console.log("[Recut IPC] clip.startTime:", clip.startTime, "clip.endTime:", clip.endTime, "newStart:", newStart, "newEnd:", newEnd, "sourceFile:", sourceFile);

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

    console.log("[Recut IPC] Success. duration:", newDuration, "start:", newStart, "end:", newEnd);
    return {
      success: true,
      filePath: finalPath,
      duration: newDuration,
      newStartTime: newStart,
      newEndTime: newEnd,
    };
  } catch (err) {
    console.error("[Recut IPC] Error:", err);
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
    await feedbackDb.init();
    return feedbackDb.logFeedback(entry);
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle("feedback:getApproved", async (_, gameTag, limit) => {
  try {
    await feedbackDb.init();
    return feedbackDb.getApprovedClips(gameTag, limit || 20);
  } catch (err) { return []; }
});

ipcMain.handle("feedback:getCounts", async (_, gameTag) => {
  try {
    await feedbackDb.init();
    return feedbackDb.getFeedbackCounts(gameTag);
  } catch (err) { return { approved: 0, rejected: 0, total: 0 }; }
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
  const apiKey = store.get("anthropicApiKey");
  if (!apiKey) return { error: "Anthropic API key not configured." };

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
    const result = await anthropicRequest(apiKey, {
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    if (result.error) return { error: result.error.message || JSON.stringify(result.error) };

    const newProfile = (result.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (!newProfile) return { error: "Empty response from Claude" };

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

// ============ ANTHROPIC AI API ============
const anthropicRequest = (apiKey, body) => {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Failed to parse Anthropic response: ${data.substring(0, 300)}`)); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
};

// Generate titles & captions for a clip using Sonnet
ipcMain.handle("anthropic:generate", async (_, params) => {
  try {
    const apiKey = store.get("anthropicApiKey");
    if (!apiKey) return { error: "Anthropic API key not configured. Go to Settings." };

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

    const systemPrompt = `You are a YouTube Shorts / TikTok title and caption specialist for a gaming content creator named Fega.

Your job is to generate 5 title options and 5 caption options for a gaming clip based on its transcript.

## IMPORTANT — Title vs Caption Definitions:

**TITLE** = The video's title on the platform (YouTube Shorts, TikTok, Instagram Reels). This is what shows in the feed listing and search results. Titles should:
- Be short, punchy, and optimized for discoverability
- Include ONLY the game's hashtag at the end (e.g. "My Chess Rating is EMBARRASSING #arcraiders") — NO generic hashtags like #gaming, #gamingshorts, #shorts, #fyp, etc. The platform's description template handles all other hashtags.
- Work as standalone text that makes someone want to click/watch

**CAPTION** = Scroll-stopping hook text that is BAKED INTO the video as a visible text overlay. This is the FIRST thing viewers read while scrolling through their feed. Captions must:
- Be extremely punchy and short (1-2 lines max, under 15 words ideal)
- Create an immediate emotional reaction — curiosity, shock, humor, or relatability
- Use bold, direct language. Think "I lost 12 games in ONE NIGHT 💀" not a paragraph
- Never include hashtags (those go in the title)
- Make someone STOP SCROLLING before they even hear the audio

## Rules:
- Generate titles and captions as complementary pairs (title 1 pairs with caption 1, etc.) but the creator may mix and match
- Each title's "why" should explain why it will perform well for search/discovery
- Each caption's "why" MUST explain the specific psychological trigger that makes someone stop scrolling — name the trigger (curiosity gap, shock value, relatability, FOMO, controversy, self-deprecation, etc.)
- Analyze the creator's past picks vs rejections to understand their style preferences — don't just mimic, understand the PATTERNS (tone, perspective, length, humor style)

${styleGuide ? `## Creator's Style Guide:\n${styleGuide}` : ""}${gameContext}${styleHistory}

## Output Format:
Return ONLY valid JSON in this exact structure:
{
  "titles": [
    { "title": "the video title #gamehashtag", "why": "why this title works for discovery" },
    ...5 total
  ],
  "captions": [
    { "caption": "short scroll-stopping hook text", "why": "what psychological trigger makes this stop scrolling" },
    ...5 total
  ]
}`;

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

    const result = await anthropicRequest(apiKey, {
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    // Parse the response — extract JSON from the text content
    if (result.error) return { error: result.error.message || JSON.stringify(result.error) };
    if (!result.content || result.content.length === 0) return { error: "Empty response from Anthropic" };

    const textContent = result.content.find((c) => c.type === "text");
    if (!textContent) return { error: "No text in Anthropic response" };

    // Extract JSON from the response (may have markdown code fences)
    let jsonStr = textContent.text;
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    jsonStr = jsonStr.trim();

    try {
      const parsed = JSON.parse(jsonStr);
      return { success: true, data: parsed };
    } catch (e) {
      return { error: `Failed to parse AI response as JSON: ${e.message}`, raw: textContent.text };
    }
  } catch (err) {
    return { error: err.message };
  }
});

// Research a game using Opus with web search (one-time per game)
ipcMain.handle("anthropic:researchGame", async (_, gameName) => {
  try {
    const apiKey = store.get("anthropicApiKey");
    if (!apiKey) return { error: "Anthropic API key not configured. Go to Settings." };

    const result = await anthropicRequest(apiKey, {
      model: "claude-opus-4-6",
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
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
    });

    if (result.error) return { error: result.error.message || JSON.stringify(result.error) };
    if (!result.content || result.content.length === 0) return { error: "Empty response from Anthropic" };

    // Extract the final text response (may have tool_use blocks before it)
    const textBlocks = result.content.filter((c) => c.type === "text");
    let summary = textBlocks.map((t) => t.text).join("\n\n");

    // Strip any AI preamble that slipped through
    summary = summary.replace(/^(I'll research|Here is|Here's|Let me|Based on my research)[^\n]*\n+/i, "").trim();

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
    const history = store.get("subtitleDebugLog") || [];
    history.push({ ...entry, timestamp: new Date().toISOString() });
    const bounded = history.length > 100 ? history.slice(-100) : history;
    store.set("subtitleDebugLog", bounded);
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

    console.log("[OAuth] Starting TikTok OAuth flow...");
    const accountData = await tiktokOAuth.startOAuthFlow(clientKey, clientSecret);

    // Save to encrypted token store
    const accountId = `tiktok_${accountData.openId}`;
    tokenStore.saveAccount(accountId, accountData);
    console.log(`[OAuth] TikTok account saved: ${accountId} (${accountData.displayName})`);

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
    console.error("[OAuth] TikTok connect failed:", err);
    return { error: err.message };
  }
});

// ── TikTok Content Posting ──

ipcMain.handle("tiktok:publish", async (event, { accountId, videoPath, title, caption, clipId }) => {
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

    console.log(`[TikTok Publish] Starting publish for "${title}" to ${account.displayName} (${accountId})`);
    console.log(`[TikTok Publish] Video: ${videoPath}`);

    let accessToken = account.accessToken;

    // Check if token is expired and refresh if needed
    if (account.expiresAt && Date.now() > account.expiresAt) {
      console.log("[TikTok Publish] Token expired, refreshing...");
      const clientKey = store.get("tiktokClientKey");
      if (!clientKey || !account.refreshToken) {
        const err = "Cannot refresh TikTok token. Please reconnect in Settings.";
        publishLog.logPublish({ ...logBase, status: "failed", error: err });
        return { error: err };
      }
      const refreshResult = await tiktokOAuth.refreshAccessToken(clientKey, account.refreshToken);
      console.log("[TikTok Publish] Refresh result:", JSON.stringify(refreshResult, null, 2));
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
    console.log(`[TikTok Publish] Caption: "${postCaption}"`);

    // Publish with progress events
    const result = await tiktokPublish.publishVideo(
      accessToken,
      videoPath,
      {
        title: postCaption,
        privacy_level: "PUBLIC_TO_EVERYONE", // Sandbox will override to SELF_ONLY
      },
      (progress) => {
        mainWindow?.webContents.send("tiktok:publishProgress", progress);
      }
    );

    console.log(`[TikTok Publish] SUCCESS — publish_id: ${result.publish_id}, post_id: ${result.post_id}, status: ${result.status}`);
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
    console.error("[TikTok Publish] FAILED:", err.message);
    console.error("[TikTok Publish] Stack:", err.stack);
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

