const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const chokidar = require("chokidar");

let mainWindow;
let watcher = null;

const isDev = !app.isPackaged;

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
