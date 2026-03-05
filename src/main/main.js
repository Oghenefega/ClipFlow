const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const chokidar = require("chokidar");
const Store = require("electron-store");
const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");

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
    platforms: [
      { key: "youtube1", platform: "YouTube", abbr: "YT", name: "Fega", connected: true, vizardAccountId: "dml6YXJkLTEtMTc0NTMz" },
      { key: "instagram", platform: "Instagram", abbr: "IG", name: "fegagaming", connected: true, vizardAccountId: "dml6YXJkLTQtMTc0NTM2LTE4OTUw" },
      { key: "facebook", platform: "Facebook", abbr: "FB", name: "Fega Gaming", connected: true, vizardAccountId: "dml6YXJkLTMtMTc0NTM1LTE4OTQ5" },
      { key: "tiktok1", platform: "TikTok", abbr: "TT", name: "fega", connected: true, vizardAccountId: "dml6YXJkLTItMTc0NTM4" },
      { key: "youtube2", platform: "YouTube", abbr: "YT", name: "ThatGuy", connected: true, vizardAccountId: "dml6YXJkLTEtMTc0NTM0" },
      { key: "tiktok2", platform: "TikTok", abbr: "TT", name: "thatguyfega", connected: true, vizardAccountId: "dml6YXJkLTItMTc0NTM3" },
    ],
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
    r2Config: {
      accountId: "7ab477fd14aaed32f78f97a6021ab7cd",
      accessKeyId: "13371b76c6ddfbe1a5136868f77cdc98",
      secretAccessKey: "ea5ee330a6e884b94f60280bea10d527e61909d8e2da1b57a123767774b5b67b",
      bucketName: "clipflow-recordings",
      publicBaseUrl: "https://pub-94cc07e4ab044421b3884d6c817e45e0.r2.dev",
    },
    vizardApiKey: "f0e33b267b1b4fca9b5082966654fbaf",
    vizardProjects: [],
    uploadedFiles: {},
    renameHistory: [],
  },
});

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

app.whenReady().then(createWindow);

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

// ============ R2 UPLOAD (Cloudflare R2 via S3 SDK) ============
ipcMain.handle("r2:upload", async (event, filePath, fileName) => {
  try {
    const r2Config = store.get("r2Config");
    if (!r2Config || !r2Config.accessKeyId) {
      return { error: "R2 credentials not configured. Go to Settings." };
    }

    const client = new S3Client({
      region: "auto",
      endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
      },
    });

    const fileSize = fs.statSync(filePath).size;
    const fileStream = fs.createReadStream(filePath);

    const upload = new Upload({
      client,
      params: {
        Bucket: r2Config.bucketName,
        Key: fileName,
        Body: fileStream,
        ContentType: fileName.endsWith(".mkv") ? "video/x-matroska" : "video/mp4",
      },
      queueSize: 4,
      partSize: 1024 * 1024 * 10, // 10MB parts
    });

    upload.on("httpUploadProgress", (progress) => {
      const pct = Math.round(((progress.loaded || 0) / fileSize) * 100);
      mainWindow?.webContents.send("r2:uploadProgress", { fileName, progress: pct });
    });

    await upload.done();

    const publicUrl = `${r2Config.publicBaseUrl}/${encodeURIComponent(fileName)}`;
    return { success: true, url: publicUrl, fileName };
  } catch (err) {
    return { error: err.message, fileName };
  }
});

// ============ VIZARD AI API ============
const vizardRequest = (method, apiPath, apiKey, body) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "elb-api.vizard.ai",
      path: `/hvizard-server-front/open-api/v1${apiPath}`,
      method,
      headers: {
        "VIZARDAI_API_KEY": apiKey,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse Vizard response: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

ipcMain.handle("vizard:createProject", async (_, videoUrl, projectName) => {
  try {
    const apiKey = store.get("vizardApiKey");
    if (!apiKey) return { error: "Vizard API key not configured. Go to Settings." };

    const result = await vizardRequest("POST", "/project/create", apiKey, {
      videoUrl,
      videoType: 1,
      ext: "mp4",
      lang: "en",
      preferLength: [1, 2],
      ratioOfClip: 1,
      subtitleSwitch: 1,
      headlineSwitch: 1,
      projectName: projectName || "ClipFlow Upload",
    });

    return result;
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("vizard:queryProject", async (_, projectId) => {
  try {
    const apiKey = store.get("vizardApiKey");
    if (!apiKey) return { error: "Vizard API key not configured." };

    const result = await vizardRequest("GET", `/project/query/${projectId}`, apiKey);
    return result;
  } catch (err) {
    return { error: err.message };
  }
});

// Vizard: get social accounts connected to the Vizard account
ipcMain.handle("vizard:getSocialAccounts", async () => {
  try {
    const apiKey = store.get("vizardApiKey");
    if (!apiKey) return { error: "Vizard API key not configured." };

    const result = await vizardRequest("GET", "/project/social-accounts", apiKey);
    return result;
  } catch (err) {
    return { error: err.message };
  }
});

// Vizard: publish a single clip to one social account
ipcMain.handle("vizard:publishClip", async (_, options) => {
  try {
    const apiKey = store.get("vizardApiKey");
    if (!apiKey) return { error: "Vizard API key not configured." };

    const body = {
      finalVideoId: options.finalVideoId,
      socialAccountId: options.socialAccountId,
    };
    if (options.publishTime) body.publishTime = options.publishTime;
    if (options.post !== undefined) body.post = options.post;
    if (options.title) body.title = options.title;

    const result = await vizardRequest("POST", "/project/publish-video", apiKey, body);
    return result;
  } catch (err) {
    return { error: err.message };
  }
});

// Vizard: generate AI caption for a clip
ipcMain.handle("vizard:generateCaption", async (_, options) => {
  try {
    const apiKey = store.get("vizardApiKey");
    if (!apiKey) return { error: "Vizard API key not configured." };

    const result = await vizardRequest("POST", "/project/generate-ai-social-caption", apiKey, {
      finalVideoId: options.finalVideoId,
      platform: options.platform || "TikTok",
      tone: options.tone || "interesting",
    });
    return result;
  } catch (err) {
    return { error: err.message };
  }
});
