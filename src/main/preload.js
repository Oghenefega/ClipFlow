// Sentry preload — sets up IPC bridge for renderer → main error reporting
// Wrapped in try/catch so a Sentry failure never kills the entire preload bridge
try { require("@sentry/electron/preload"); } catch (_) {}

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clipflow", {
  // File system
  pickFolder: () => ipcRenderer.invoke("dialog:pickFolder"),
  readDir: (dir) => ipcRenderer.invoke("fs:readDir", dir),
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
  importExternalFile: (sourcePath, watchFolder) => ipcRenderer.invoke("import:externalFile", sourcePath, watchFolder),
  importClearSuppression: (filename, sizeBytes) => ipcRenderer.invoke("import:clearSuppression", filename, sizeBytes),
  importCancel: (targetPath, filename, sizeBytes) => ipcRenderer.invoke("import:cancel", targetPath, filename, sizeBytes),
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
  fileMetadataGetById: (fileId) => ipcRenderer.invoke("metadata:getById", fileId),
  labelSuggest: (tag, prefix) => ipcRenderer.invoke("labels:suggest", tag, prefix),
  labelRecord: (tag, label) => ipcRenderer.invoke("labels:record", tag, label),
  renameHistoryRecent: (limit) => ipcRenderer.invoke("renameHistory:recent", limit),
  renameHistoryUndo: (historyId) => ipcRenderer.invoke("renameHistory:undo", historyId),

  // Naming presets
  presetGetAll: () => ipcRenderer.invoke("preset:getAll"),
  presetFormatFilename: (meta, presetId) => ipcRenderer.invoke("preset:formatFilename", meta, presetId),
  presetFindCollisions: (meta, presetId) => ipcRenderer.invoke("preset:findCollisions", meta, presetId),
  presetGetNextPartNumber: (meta, presetId) => ipcRenderer.invoke("preset:getNextPartNumber", meta, presetId),
  presetCalculateDayNumber: (gameEntry, recordingDate) => ipcRenderer.invoke("preset:calculateDayNumber", gameEntry, recordingDate),
  presetValidateLabel: (label) => ipcRenderer.invoke("preset:validateLabel", label),
  presetRetroactiveRename: (existingFile, triggeringHistoryId) => ipcRenderer.invoke("preset:retroactiveRename", existingFile, triggeringHistoryId),
  presetExtractDate: (filename, filePath) => ipcRenderer.invoke("preset:extractDate", filename, filePath),

  // Feedback database
  feedbackLog: (entry) => ipcRenderer.invoke("feedback:log", entry),
  feedbackGetApproved: (gameTag, limit) => ipcRenderer.invoke("feedback:getApproved", gameTag, limit),
  feedbackGetCounts: (gameTag) => ipcRenderer.invoke("feedback:getCounts", gameTag),

  // Game profiles
  gameProfilesGetAll: () => ipcRenderer.invoke("gameProfiles:getAll"),
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
  getPublishLogsForClip: (clipId) => ipcRenderer.invoke("publishLog:getForClip", clipId),

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
  folderReorder: (folderIds) => ipcRenderer.invoke("folder:reorder", folderIds),

  // Logging & Bug Reports
  logsGetModules: () => ipcRenderer.invoke("logs:getModules"),
  logsGetSessionLogs: (modules) => ipcRenderer.invoke("logs:getSessionLogs", modules),
  logsExportReport: (data) => ipcRenderer.invoke("logs:exportReport", data),
  logsGetDir: () => ipcRenderer.invoke("logs:getDir"),
});
