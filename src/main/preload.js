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

  // ffmpeg
  ffmpegCheck: () => ipcRenderer.invoke("ffmpeg:checkInstalled"),
  ffmpegProbe: (filePath) => ipcRenderer.invoke("ffmpeg:probe", filePath),
  ffmpegExtractAudio: (videoPath, wavPath) => ipcRenderer.invoke("ffmpeg:extractAudio", videoPath, wavPath),
  ffmpegCutClip: (srcPath, outPath, startTime, endTime) => ipcRenderer.invoke("ffmpeg:cutClip", srcPath, outPath, startTime, endTime),
  ffmpegThumbnail: (videoPath, outPath, time) => ipcRenderer.invoke("ffmpeg:thumbnail", videoPath, outPath, time),
  ffmpegAnalyzeLoudness: (audioPath, segmentDuration) => ipcRenderer.invoke("ffmpeg:analyzeLoudness", audioPath, segmentDuration),
  ffmpegExtractWaveformPeaks: (filePath, peakCount) => ipcRenderer.invoke("ffmpeg:extractWaveformPeaks", filePath, peakCount),

  // Whisper
  whisperCheck: (binaryPath) => ipcRenderer.invoke("whisper:checkInstalled", binaryPath),
  whisperTranscribe: (wavPath, opts) => ipcRenderer.invoke("whisper:transcribe", wavPath, opts),
  onWhisperProgress: (callback) => {
    ipcRenderer.on("whisper:progress", (_, pct) => callback(pct));
  },
  removeWhisperProgressListener: () => {
    ipcRenderer.removeAllListeners("whisper:progress");
  },

  // Projects
  projectCreate: (data) => ipcRenderer.invoke("project:create", data),
  projectLoad: (projectId) => ipcRenderer.invoke("project:load", projectId),
  projectSave: (project) => ipcRenderer.invoke("project:save", project),
  projectList: () => ipcRenderer.invoke("project:list"),
  projectDelete: (projectId) => ipcRenderer.invoke("project:delete", projectId),
  projectUpdateClip: (projectId, clipId, updates) => ipcRenderer.invoke("project:updateClip", projectId, clipId, updates),
  projectAddClip: (projectId, clipData) => ipcRenderer.invoke("project:addClip", projectId, clipData),
  projectDeleteClip: (projectId, clipId, deleteFile) => ipcRenderer.invoke("project:deleteClip", projectId, clipId, deleteFile),

  // Pipeline
  generateClips: (sourceFile, gameData) => ipcRenderer.invoke("pipeline:generateClips", sourceFile, gameData),
  onPipelineProgress: (callback) => {
    ipcRenderer.on("pipeline:progress", (_, data) => callback(data));
  },
  removePipelineProgressListener: () => {
    ipcRenderer.removeAllListeners("pipeline:progress");
  },

  // Anthropic AI
  anthropicGenerate: (params) => ipcRenderer.invoke("anthropic:generate", params),
  anthropicResearchGame: (gameName) => ipcRenderer.invoke("anthropic:researchGame", gameName),
  anthropicLogHistory: (entry) => ipcRenderer.invoke("anthropic:logHistory", entry),

  // Render pipeline
  renderClip: (clipData, projectData, outputPath, options) =>
    ipcRenderer.invoke("render:clip", clipData, projectData, outputPath, options),
  batchRender: (clips, projectData, outputDir, options) =>
    ipcRenderer.invoke("render:batch", clips, projectData, outputDir, options),
  onRenderProgress: (callback) => {
    ipcRenderer.on("render:progress", (_, data) => callback(data));
  },
  removeRenderProgressListener: () => {
    ipcRenderer.removeAllListeners("render:progress");
  },

  // Platform info
  platform: process.platform,
});
