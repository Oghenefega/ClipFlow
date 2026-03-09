const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clipflow", {
  // File system
  pickFolder: () => ipcRenderer.invoke("dialog:pickFolder"),
  readDir: (dir) => ipcRenderer.invoke("fs:readDir", dir),
  scanWatchFolder: (folder) => ipcRenderer.invoke("fs:scanWatchFolder", folder),
  renameFile: (oldPath, newPath) => ipcRenderer.invoke("fs:renameFile", oldPath, newPath),
  fileExists: (path) => ipcRenderer.invoke("fs:exists", path),
  readFile: (path) => ipcRenderer.invoke("fs:readFile", path),
  writeFile: (path, content) => ipcRenderer.invoke("fs:writeFile", path, content),

  // File watcher
  startWatching: (folder) => ipcRenderer.invoke("watcher:start", folder),
  stopWatching: () => ipcRenderer.invoke("watcher:stop"),
  onFileAdded: (callback) => {
    ipcRenderer.on("watcher:fileAdded", (_, data) => callback(data));
  },
  onFileRemoved: (callback) => {
    ipcRenderer.on("watcher:fileRemoved", (_, data) => callback(data));
  },
  removeFileListeners: () => {
    ipcRenderer.removeAllListeners("watcher:fileAdded");
    ipcRenderer.removeAllListeners("watcher:fileRemoved");
  },

  // OBS
  parseOBSLog: (logDir) => ipcRenderer.invoke("obs:parseLog", logDir),

  // Shell
  openFolder: (path) => ipcRenderer.invoke("shell:openFolder", path),

  // Dialogs
  saveFileDialog: (options) => ipcRenderer.invoke("dialog:saveFile", options),
  openFileDialog: (options) => ipcRenderer.invoke("dialog:openFile", options),

  // Persistent store
  storeGet: (key) => ipcRenderer.invoke("store:get", key),
  storeSet: (key, value) => ipcRenderer.invoke("store:set", key, value),
  storeGetAll: () => ipcRenderer.invoke("store:getAll"),

  // R2 Upload
  r2Upload: (filePath, fileName) => ipcRenderer.invoke("r2:upload", filePath, fileName),
  onUploadProgress: (callback) => {
    ipcRenderer.on("r2:uploadProgress", (_, data) => callback(data));
  },
  removeUploadProgressListener: () => {
    ipcRenderer.removeAllListeners("r2:uploadProgress");
  },

  // Vizard AI
  vizardCreateProject: (videoUrl, projectName) => ipcRenderer.invoke("vizard:createProject", videoUrl, projectName),
  vizardQueryProject: (projectId) => ipcRenderer.invoke("vizard:queryProject", projectId),
  vizardGetSocialAccounts: () => ipcRenderer.invoke("vizard:getSocialAccounts"),
  vizardPublishClip: (options) => ipcRenderer.invoke("vizard:publishClip", options),
  vizardGenerateCaption: (options) => ipcRenderer.invoke("vizard:generateCaption", options),

  // Anthropic AI
  anthropicGenerate: (params) => ipcRenderer.invoke("anthropic:generate", params),
  anthropicResearchGame: (gameName) => ipcRenderer.invoke("anthropic:researchGame", gameName),
  anthropicLogHistory: (entry) => ipcRenderer.invoke("anthropic:logHistory", entry),

  // Downloads
  downloadClip: (url, savePath) => ipcRenderer.invoke("download:clip", url, savePath),
  onDownloadProgress: (callback) => {
    ipcRenderer.on("download:progress", (_, data) => callback(data));
    return () => ipcRenderer.removeAllListeners("download:progress");
  },

  // Platform info
  platform: process.platform,
});
