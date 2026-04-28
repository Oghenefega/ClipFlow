// Sentry preload — sets up IPC bridge for renderer → main error reporting
// Wrapped in try/catch so a Sentry failure never kills the entire preload bridge
try { require("@sentry/electron/preload"); } catch (_) {}

const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("clipflow", {
  // File system
  getPathForFile: (file) => webUtils.getPathForFile(file),
  pickFolder: () => ipcRenderer.invoke("dialog:pickFolder"),
  renameFile: (oldPath, newPath) => ipcRenderer.invoke("fs:renameFile", oldPath, newPath),
  fileExists: (path) => ipcRenderer.invoke("fs:exists", path),

  // File watcher
  startWatching: (folder) => ipcRenderer.invoke("watcher:start", folder),
  stopWatching: () => ipcRenderer.invoke("watcher:stop"),
  onFileAdded: (callback) => {
    ipcRenderer.on("watcher:fileAdded", (_, data) => callback(data));
  },
  removeFileListeners: () => {
    ipcRenderer.removeAllListeners("watcher:fileAdded");
    ipcRenderer.removeAllListeners("watcher:fileRemoved");
  },

  // Test file watcher (separate instance, separate events)
  startTestWatching: (folder) => ipcRenderer.invoke("watcher:startTest", folder),
  onTestFileAdded: (callback) => {
    ipcRenderer.on("watcher:testFileAdded", (_, data) => callback(data));
  },
  removeTestFileListeners: () => {
    ipcRenderer.removeAllListeners("watcher:testFileAdded");
    ipcRenderer.removeAllListeners("watcher:testFileRemoved");
  },

  // Shell
  revealInFolder: (filePath) => ipcRenderer.invoke("shell:revealInFolder", filePath),

  // Dialogs
  openFileDialog: (options) => ipcRenderer.invoke("dialog:openFile", options),

  // Persistent store
  storeGet: (key) => ipcRenderer.invoke("store:get", key),
  storeSet: (key, value) => ipcRenderer.invoke("store:set", key, value),
  storeGetAll: () => ipcRenderer.invoke("store:getAll"),

  // ffmpeg
  ffmpegCheck: () => ipcRenderer.invoke("ffmpeg:checkInstalled"),
  ffmpegCheckNvenc: () => ipcRenderer.invoke("ffmpeg:checkNvenc"),
  ffmpegProbe: (filePath) => ipcRenderer.invoke("ffmpeg:probe", filePath),
  ffmpegExtractWaveformPeaks: (filePath, peakCount) => ipcRenderer.invoke("ffmpeg:extractWaveformPeaks", filePath, peakCount),
  waveformExtractCached: (projectId, sourceFilePath, durationSec) => ipcRenderer.invoke("waveform:extractCached", projectId, sourceFilePath, durationSec),
  projectLocateSource: (projectId) => ipcRenderer.invoke("project:locateSource", projectId),

  // Whisper
  whisperCheck: (binaryPath) => ipcRenderer.invoke("whisper:checkInstalled", binaryPath),

  // Projects
  projectLoad: (projectId) => ipcRenderer.invoke("project:load", projectId),
  projectList: () => ipcRenderer.invoke("project:list"),
  projectDelete: (projectId) => ipcRenderer.invoke("project:delete", projectId),
  projectUpdateTestMode: (projectId, testMode) => ipcRenderer.invoke("project:updateTestMode", projectId, testMode),
  fileMoveToTestMode: (fileId, nextIsTest) => ipcRenderer.invoke("file:moveToTestMode", fileId, nextIsTest),
  projectUpdateClip: (projectId, clipId, updates) => ipcRenderer.invoke("project:updateClip", projectId, clipId, updates),

  // Pipeline
  generateClips: (sourceFile, gameData) => ipcRenderer.invoke("pipeline:generateClips", sourceFile, gameData),
  onPipelineProgress: (callback) => {
    ipcRenderer.on("pipeline:progress", (_, data) => callback(data));
  },
  removePipelineProgressListener: () => {
    ipcRenderer.removeAllListeners("pipeline:progress");
  },
  // Per-signal progress events (Issue #72 Phase 1). Payload shape:
  //   { signal, status, progress, elapsed_ms, failureReason? }
  onSignalProgress: (callback) => {
    ipcRenderer.on("pipeline:signalProgress", (_, data) => callback(data));
  },
  removeSignalProgressListener: () => {
    ipcRenderer.removeAllListeners("pipeline:signalProgress");
  },
  // Non-strict ask-degrade modal (Issue #72 Phase 1). Main fires the event with
  // { requestId, failed: [{ signal, failureReason }, ...] }; renderer responds
  // via pipelineDegradeAnswer(requestId, "yes" | "no").
  onPipelineAskDegrade: (callback) => {
    ipcRenderer.on("pipeline:askDegrade", (_, data) => callback(data));
  },
  removePipelineAskDegradeListener: () => {
    ipcRenderer.removeAllListeners("pipeline:askDegrade");
  },
  pipelineDegradeAnswer: (requestId, answer) =>
    ipcRenderer.invoke("pipeline:degradeAnswer", requestId, answer),

  // Anthropic AI
  anthropicGenerate: (params) => ipcRenderer.invoke("anthropic:generate", params),
  anthropicResearchGame: (gameName) => ipcRenderer.invoke("anthropic:researchGame", gameName),
  anthropicLogHistory: (entry) => ipcRenderer.invoke("anthropic:logHistory", entry),

  // Subtitle debug log
  debugLogSubtitle: (entry) => ipcRenderer.invoke("debug:logSubtitle", entry),
  debugGetSubtitleLog: () => ipcRenderer.invoke("debug:getSubtitleLog"),
  debugClearSubtitleLog: () => ipcRenderer.invoke("debug:clearSubtitleLog"),

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

  // Video splitting
  splitExecute: (fileId, splitPoints) => ipcRenderer.invoke("split:execute", fileId, splitPoints),

  // Thumbnail strip (game-switch scrubber)
  generateThumbnails: (filePath) => ipcRenderer.invoke("thumbs:generate", filePath),
  cleanupThumbnails: (filePath) => ipcRenderer.invoke("thumbs:cleanup", filePath),

  // Preview frames (rename tab thumbnails)
  generatePreviewFrames: (filePath) => ipcRenderer.invoke("thumbs:preview", filePath),

  // Import external file (drag-and-drop)
  importExternalFile: (sourcePath, watchFolder, testMode = false) => ipcRenderer.invoke("import:externalFile", sourcePath, watchFolder, testMode),
  importClearSuppression: (filename, sizeBytes) => ipcRenderer.invoke("import:clearSuppression", filename, sizeBytes),
  onImportProgress: (callback) => {
    ipcRenderer.on("import:progress", (_, data) => callback(data));
  },
  removeImportProgressListener: () => {
    ipcRenderer.removeAllListeners("import:progress");
  },

  // File metadata (Rename system)
  fileMetadataCreate: (data) => ipcRenderer.invoke("metadata:create", data),
  fileMetadataUpdate: (fileId, data) => ipcRenderer.invoke("metadata:update", fileId, data),
  fileMetadataSearch: (filters) => ipcRenderer.invoke("metadata:search", filters),
  labelSuggest: (tag, prefix) => ipcRenderer.invoke("labels:suggest", tag, prefix),
  labelRecord: (tag, label) => ipcRenderer.invoke("labels:record", tag, label),
  renameHistoryRecent: (limit) => ipcRenderer.invoke("renameHistory:recent", limit),
  renameHistoryUndo: (historyId) => ipcRenderer.invoke("renameHistory:undo", historyId),

  // Naming presets
  presetFormatFilename: (meta, presetId) => ipcRenderer.invoke("preset:formatFilename", meta, presetId),
  presetFindCollisions: (meta, presetId) => ipcRenderer.invoke("preset:findCollisions", meta, presetId),
  presetGetNextPartNumber: (meta, presetId) => ipcRenderer.invoke("preset:getNextPartNumber", meta, presetId),
  presetValidateLabel: (label) => ipcRenderer.invoke("preset:validateLabel", label),
  presetRetroactiveRename: (existingFile, triggeringHistoryId) => ipcRenderer.invoke("preset:retroactiveRename", existingFile, triggeringHistoryId),

  // Feedback database
  feedbackLog: (entry) => ipcRenderer.invoke("feedback:log", entry),

  // Game profiles
  gameProfilesGet: (gameTag) => ipcRenderer.invoke("gameProfiles:get", gameTag),
  gameProfilesUpdatePlayStyle: (gameTag, playStyle) => ipcRenderer.invoke("gameProfiles:updatePlayStyle", gameTag, playStyle),
  gameProfilesSetThreshold: (gameTag, threshold) => ipcRenderer.invoke("gameProfiles:setThreshold", gameTag, threshold),
  gameProfilesResetCount: (gameTag) => ipcRenderer.invoke("gameProfiles:resetCount", gameTag),
  gameProfilesGenerateUpdate: (gameTag) => ipcRenderer.invoke("gameProfiles:generateUpdate", gameTag),

  // Pipeline logs
  pipelineLogsList: () => ipcRenderer.invoke("pipelineLogs:list"),
  pipelineLogsRead: (logPath) => ipcRenderer.invoke("pipelineLogs:read", logPath),
  pipelineLogsDelete: (logPaths) => ipcRenderer.invoke("pipelineLogs:delete", logPaths),
  pipelineLogsDeleteOld: (days) => ipcRenderer.invoke("pipelineLogs:deleteOld", days),
  pipelineLogsMonthlyCost: () => ipcRenderer.invoke("pipelineLogs:monthlyCost"),

  // Extend a clip (re-cut from source with new end time)
  extendClip: (projectId, clipId, newSourceEndTime) =>
    ipcRenderer.invoke("clip:extend", projectId, clipId, newSourceEndTime),

  // Extend a clip backwards (re-cut from source with earlier start time)
  extendClipLeft: (projectId, clipId, newSourceStartTime) =>
    ipcRenderer.invoke("clip:extendLeft", projectId, clipId, newSourceStartTime),

  // Re-cut a clip to arbitrary boundaries (used by undo)
  recutClip: (projectId, clipId, newStartTime, newEndTime) =>
    ipcRenderer.invoke("clip:recut", projectId, clipId, newStartTime, newEndTime),

  // Concat re-cut: splice multiple segments from source into one clip (mid-section delete)
  concatRecutClip: (projectId, clipId, segments) =>
    ipcRenderer.invoke("clip:concatRecut", projectId, clipId, segments),

  // Re-transcribe a specific clip
  retranscribeClip: (projectId, clipId) =>
    ipcRenderer.invoke("retranscribe:clip", projectId, clipId),
  onRetranscribeProgress: (callback) => {
    ipcRenderer.on("retranscribe:progress", (_, data) => callback(data));
  },
  removeRetranscribeProgressListener: () => {
    ipcRenderer.removeAllListeners("retranscribe:progress");
  },

  // OAuth — connected accounts
  oauthGetAccounts: () => ipcRenderer.invoke("oauth:getAccounts"),
  oauthRemoveAccount: (accountId) => ipcRenderer.invoke("oauth:removeAccount", accountId),
  oauthTiktokConnect: () => ipcRenderer.invoke("oauth:tiktok:connect"),
  oauthInstagramConnect: () => ipcRenderer.invoke("oauth:instagram:connect"),
  oauthFacebookConnect: () => ipcRenderer.invoke("oauth:facebook:connect"),
  oauthYoutubeConnect: () => ipcRenderer.invoke("oauth:youtube:connect"),

  // TikTok publishing
  tiktokPublish: (params) => ipcRenderer.invoke("tiktok:publish", params),
  onTiktokPublishProgress: (callback) => {
    ipcRenderer.on("tiktok:publishProgress", (_, data) => callback(data));
  },
  removeTiktokPublishProgressListener: () => {
    ipcRenderer.removeAllListeners("tiktok:publishProgress");
  },

  // Instagram publishing
  instagramPublish: (params) => ipcRenderer.invoke("instagram:publish", params),
  onInstagramPublishProgress: (callback) => {
    ipcRenderer.on("instagram:publishProgress", (_, data) => callback(data));
  },
  removeInstagramPublishProgressListener: () => {
    ipcRenderer.removeAllListeners("instagram:publishProgress");
  },

  // Facebook publishing
  facebookPublish: (params) => ipcRenderer.invoke("facebook:publish", params),
  onFacebookPublishProgress: (callback) => {
    ipcRenderer.on("facebook:publishProgress", (_, data) => callback(data));
  },
  removeFacebookPublishProgressListener: () => {
    ipcRenderer.removeAllListeners("facebook:publishProgress");
  },

  // YouTube publishing
  youtubePublish: (params) => ipcRenderer.invoke("youtube:publish", params),
  onYoutubePublishProgress: (callback) => {
    ipcRenderer.on("youtube:publishProgress", (_, data) => callback(data));
  },
  removeYoutubePublishProgressListener: () => {
    ipcRenderer.removeAllListeners("youtube:publishProgress");
  },

  // Publish log
  getPublishLogs: (limit) => ipcRenderer.invoke("publishLog:getRecent", limit),

  // Dev dashboard
  devGetProviderInfo: () => ipcRenderer.invoke("dev:getProviderInfo"),
  devSetLLMProvider: (name, config) => ipcRenderer.invoke("dev:setLLMProvider", name, config),
  devSetTranscriptionProvider: (name) => ipcRenderer.invoke("dev:setTranscriptionProvider", name),
  devTestLLMConnection: () => ipcRenderer.invoke("dev:testLLMConnection"),
  devGetStoreKeys: () => ipcRenderer.invoke("dev:getStoreKeys"),
  devSetStoreKey: (key, value) => ipcRenderer.invoke("dev:setStoreKey", key, value),
  devDeleteStoreKey: (key) => ipcRenderer.invoke("dev:deleteStoreKey", key),

  // Platform info
  platform: process.platform,

  // App version
  getAppVersion: () => ipcRenderer.invoke("app:getVersion"),

  // Project Folders
  folderList: () => ipcRenderer.invoke("folder:list"),
  folderCreate: (data) => ipcRenderer.invoke("folder:create", data),
  folderUpdate: (folderId, patch) => ipcRenderer.invoke("folder:update", folderId, patch),
  folderDelete: (folderId) => ipcRenderer.invoke("folder:delete", folderId),
  folderAddProjects: (folderId, projectIds) => ipcRenderer.invoke("folder:addProjects", folderId, projectIds),

  // Logging & Bug Reports
  logsExportReport: (data) => ipcRenderer.invoke("logs:exportReport", data),
});
