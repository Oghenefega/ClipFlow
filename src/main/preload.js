// Sentry preload — sets up IPC bridge for renderer → main error reporting
// Wrapped in try/catch so a Sentry failure never kills the entire preload bridge
try { require("@sentry/electron/preload"); } catch (_) {}

const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("clipflow", {
  // Profile (#80) — "dev" or "prod"
  profile: process.env.CLIPFLOW_PROFILE === "dev" ? "dev" : "prod",

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

  // Auto-update (#250 — electron-updater against the R2 feed)
  checkForUpdate: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdateProgress: (callback) => {
    ipcRenderer.on("update:progress", (_, data) => callback(data));
  },
  removeUpdateProgressListeners: () => {
    ipcRenderer.removeAllListeners("update:progress");
  },

  // Dialogs
  openFileDialog: (options) => ipcRenderer.invoke("dialog:openFile", options),

  // Asset library (SFX / music / pictures)
  assetsList: () => ipcRenderer.invoke("assets:list"),
  assetsImport: (filePaths, typeHint) => ipcRenderer.invoke("assets:import", filePaths, typeHint),
  assetsDelete: (assetId) => ipcRenderer.invoke("assets:delete", assetId),
  assetsFavorite: (assetId) => ipcRenderer.invoke("assets:favorite", assetId),
  assetsSetType: (assetId, type) => ipcRenderer.invoke("assets:setType", assetId, type),
  // #210: per-sound default volume; null clears it. #214: pass filePath when the
  // id came off a clip — path is the identity that survives an index rebuild.
  assetsSetDefaultVolume: (assetId, volume, filePath) => ipcRenderer.invoke("assets:setDefaultVolume", assetId, volume, filePath),
  assetsGetDefaultVolume: (assetId, filePath) => ipcRenderer.invoke("assets:getDefaultVolume", assetId, filePath),
  // #212: mood tags + "recently used"
  assetsMoods: () => ipcRenderer.invoke("assets:moods"),
  assetsSetTags: (assetId, tags) => ipcRenderer.invoke("assets:setTags", assetId, tags),
  assetsAddTagToMany: (assetIds, tag) => ipcRenderer.invoke("assets:addTagToMany", assetIds, tag),
  assetsMarkUsed: (assetId, filePath) => ipcRenderer.invoke("assets:markUsed", assetId, filePath),
  assetsPeaks: (filePath) => ipcRenderer.invoke("assets:peaks", filePath),
  // Background duration scan of watched audio folders (#208)
  onAssetsScanProgress: (callback) => {
    ipcRenderer.on("assets:scanProgress", (_, data) => callback(data));
  },
  removeAssetsScanListeners: () => {
    ipcRenderer.removeAllListeners("assets:scanProgress");
  },

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

  // Audio track calibration (#169)
  audioProbeTracks: (filePath) => ipcRenderer.invoke("audio:probeTracks", filePath),
  audioExtractTrackSample: (filePath, trackIndex, offsetFraction) =>
    ipcRenderer.invoke("audio:extractTrackSample", filePath, trackIndex, offsetFraction),
  audioSaveCalibration: (setup) => ipcRenderer.invoke("audio:saveCalibration", setup),
  audioCleanupSamples: () => ipcRenderer.invoke("audio:cleanupSamples"),
  audioCalibrationAnswer: (requestId, completed) =>
    ipcRenderer.invoke("audio:calibrationAnswer", requestId, completed),
  onAudioCalibrationNeeded: (callback) => {
    ipcRenderer.on("audio:calibrationNeeded", (_, data) => callback(data));
  },
  removeAudioCalibrationListener: () => {
    ipcRenderer.removeAllListeners("audio:calibrationNeeded");
  },

  // Whisper
  whisperCheck: (binaryPath) => ipcRenderer.invoke("whisper:checkInstalled", binaryPath),

  // First-run dependency check (#251)
  checkDependencies: () => ipcRenderer.invoke("system:checkDependencies"),

  // AI engine setup (#146) — first-run managed runtime download
  setupGetState: () => ipcRenderer.invoke("setup:getState"),
  setupStart: () => ipcRenderer.invoke("setup:start"),
  setupCancel: () => ipcRenderer.invoke("setup:cancel"),
  setupChooseLocation: () => ipcRenderer.invoke("setup:chooseLocation"),
  // Returns an unsubscribe fn (same pattern as onRenderProgress) — the setup
  // screen mounts/unmounts while the download keeps running in main.
  onSetupProgress: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("setup:progress", handler);
    return () => ipcRenderer.removeListener("setup:progress", handler);
  },

  // Projects
  projectLoad: (projectId) => ipcRenderer.invoke("project:load", projectId),
  projectList: () => ipcRenderer.invoke("project:list"),
  projectDelete: (projectId) => ipcRenderer.invoke("project:delete", projectId),
  projectUpdateTestMode: (projectId, testMode) => ipcRenderer.invoke("project:updateTestMode", projectId, testMode),
  fileMoveToTestMode: (fileId, nextIsTest) => ipcRenderer.invoke("file:moveToTestMode", fileId, nextIsTest),
  projectUpdateClip: (projectId, clipId, updates) => ipcRenderer.invoke("project:updateClip", projectId, clipId, updates),
  projectClaimScheduledPublish: (projectId, clipId) => ipcRenderer.invoke("project:claimScheduledPublish", projectId, clipId),
  projectDuplicateClip: (projectId, clipId, overrides) => ipcRenderer.invoke("project:duplicateClip", projectId, clipId, overrides),
  projectDeleteClip: (projectId, clipId, deleteFile) => ipcRenderer.invoke("project:deleteClip", projectId, clipId, deleteFile),
  projectDeleteClipRender: (projectId, clipId) => ipcRenderer.invoke("project:deleteClipRender", projectId, clipId),
  projectUpdateReframe: (projectId, reframe) => ipcRenderer.invoke("project:updateReframe", projectId, reframe),
  reframeDetect: (projectId) => ipcRenderer.invoke("reframe:detect", projectId),

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
  anthropicRephraseOption: (params) => ipcRenderer.invoke("anthropic:rephraseOption", params),
  anthropicRegenerateOption: (params) => ipcRenderer.invoke("anthropic:regenerateOption", params),
  anthropicResearchGame: (gameName) => ipcRenderer.invoke("anthropic:researchGame", gameName),
  anthropicLogHistory: (entry) => ipcRenderer.invoke("anthropic:logHistory", entry),

  // Title/caption training data (#183)
  titleCaptionRecordPublish: (params) => ipcRenderer.invoke("titleCaptionLog:recordPublish", params),
  titleCaptionGetStats: () => ipcRenderer.invoke("titleCaptionLog:getStats"),
  titleCaptionGetExamples: (limit) => ipcRenderer.invoke("titleCaptionLog:getExamples", limit),
  titleCaptionRefreshViews: () => ipcRenderer.invoke("titleCaptionLog:refreshViews"),

  // Subtitle debug log
  debugLogSubtitle: (entry) => ipcRenderer.invoke("debug:logSubtitle", entry),
  debugGetSubtitleLog: () => ipcRenderer.invoke("debug:getSubtitleLog"),
  debugClearSubtitleLog: () => ipcRenderer.invoke("debug:clearSubtitleLog"),

  // Render pipeline
  renderClip: (clipData, projectData, outputPath, options) =>
    ipcRenderer.invoke("render:clip", clipData, projectData, outputPath, options),
  thumbnailCapture: (clipData, projectData, timelineTime, options) =>
    ipcRenderer.invoke("thumbnail:capture", clipData, projectData, timelineTime, options),
  batchRender: (clips, projectData, outputDir, options) =>
    ipcRenderer.invoke("render:batch", clips, projectData, outputDir, options),
  // clipId targets a specific job: the current render is aborted, a WAITING
  // job is dropped from the queue. Omit clipId to cancel the current render.
  cancelRender: (clipId) => ipcRenderer.invoke("render:cancel", clipId),
  // Returns an unsubscribe fn that removes ONLY this listener — App.js keeps a
  // persistent global listener (floating render pill), so removeAllListeners
  // would silently kill it.
  onRenderProgress: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("render:progress", handler);
    return () => ipcRenderer.removeListener("render:progress", handler);
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

  // Queue imports (#240) — bulk-import finished pre-ClipFlow clips into the Queue
  queueImportsInspect: (paths) => ipcRenderer.invoke("queueImports:inspect", paths),
  queueImportsGenerate: (rows) => ipcRenderer.invoke("queueImports:generate", rows),
  queueImportsCancelGenerate: () => ipcRenderer.invoke("queueImports:cancelGenerate"),
  queueImportsConfirm: (payload) => ipcRenderer.invoke("queueImports:confirm", payload),
  // Returns an unsubscribe fn — the review modal mounts/unmounts per wave.
  onQueueImportsProgress: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("queueImports:progress", handler);
    return () => ipcRenderer.removeListener("queueImports:progress", handler);
  },

  // File metadata (Rename system)
  fileMetadataCreate: (data) => ipcRenderer.invoke("metadata:create", data),
  fileMetadataUpdate: (fileId, data) => ipcRenderer.invoke("metadata:update", fileId, data),
  fileMetadataSearch: (filters) => ipcRenderer.invoke("metadata:search", filters),
  metadataReconcile: () => ipcRenderer.invoke("metadata:reconcile"),
  metadataRemoveMissing: (ids) => ipcRenderer.invoke("metadata:removeMissing", ids),
  onGamesDbChanged: (callback) => {
    ipcRenderer.on("gamesDb:changed", (_, games) => callback(games));
  },
  removeGamesDbChangedListener: () => {
    ipcRenderer.removeAllListeners("gamesDb:changed");
  },
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
  feedbackUpdateReasons: (payload) => ipcRenderer.invoke("feedback:updateReasons", payload),
  feedbackApprovalStats: () => ipcRenderer.invoke("feedback:approvalStats"),

  // Game profiles
  gameProfilesGet: (gameTag) => ipcRenderer.invoke("gameProfiles:get", gameTag),
  gameProfilesUpdatePlayStyle: (gameTag, playStyle, gameName) => ipcRenderer.invoke("gameProfiles:updatePlayStyle", gameTag, playStyle, gameName),
  gameProfilesSetThreshold: (gameTag, threshold) => ipcRenderer.invoke("gameProfiles:setThreshold", gameTag, threshold),
  gameProfilesResetCount: (gameTag) => ipcRenderer.invoke("gameProfiles:resetCount", gameTag),
  gameProfilesGenerateUpdate: (gameTag) => ipcRenderer.invoke("gameProfiles:generateUpdate", gameTag),
  gameArtList: () => ipcRenderer.invoke("gameArt:list"),
  gameArtFetch: (name) => ipcRenderer.invoke("gameArt:fetch", name),
  gameArtSetFile: (name, filePath) => ipcRenderer.invoke("gameArt:setFile", name, filePath),
  gameArtClear: (name) => ipcRenderer.invoke("gameArt:clear", name),
  onGameArtChanged: (callback) => {
    ipcRenderer.on("gameArt:changed", () => callback());
  },

  // Pipeline logs
  pipelineLogsList: () => ipcRenderer.invoke("pipelineLogs:list"),
  pipelineLogsRead: (logPath) => ipcRenderer.invoke("pipelineLogs:read", logPath),
  pipelineLogsDelete: (logPaths) => ipcRenderer.invoke("pipelineLogs:delete", logPaths),
  pipelineLogsDeleteOld: (days) => ipcRenderer.invoke("pipelineLogs:deleteOld", days),
  pipelineLogsMonthlyCost: () => ipcRenderer.invoke("pipelineLogs:monthlyCost"),

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

  // #244: OS toast + pre-flight connection check for scheduled publishes
  systemNotify: (params) => ipcRenderer.invoke("system:notify", params),
  publishPreflight: (params) => ipcRenderer.invoke("publish:preflight", params),

  // OAuth — connected accounts
  oauthGetAccounts: () => ipcRenderer.invoke("oauth:getAccounts"),
  oauthRemoveAccount: (accountId) => ipcRenderer.invoke("oauth:removeAccount", accountId),
  oauthTiktokConnect: () => ipcRenderer.invoke("oauth:tiktok:connect"),
  oauthInstagramConnect: () => ipcRenderer.invoke("oauth:instagram:connect"),
  oauthFacebookConnect: () => ipcRenderer.invoke("oauth:facebook:connect"),
  oauthYoutubeConnect: () => ipcRenderer.invoke("oauth:youtube:connect"),

  // TikTok publishing
  tiktokPublish: (params) => ipcRenderer.invoke("tiktok:publish", params),
  tiktokQueryCreatorInfo: (params) => ipcRenderer.invoke("tiktok:queryCreatorInfo", params),
  onTiktokPublishProgress: (callback) => {
    ipcRenderer.on("tiktok:publishProgress", (_, data) => callback(data));
  },
  removeTiktokPublishProgressListener: () => {
    ipcRenderer.removeAllListeners("tiktok:publishProgress");
  },

  // Instagram publishing
  instagramPublish: (params) => ipcRenderer.invoke("instagram:publish", params),
  // #187: manual Instagram 720p fallback — button-triggered only.
  makeLightCopy: (params) => ipcRenderer.invoke("clip:makeLightCopy", params),
  discardLightCopy: (params) => ipcRenderer.invoke("clip:discardLightCopy", params),
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
  openExternal: (url) => ipcRenderer.invoke("app:openExternal", url),

  // Project Folders
  folderList: () => ipcRenderer.invoke("folder:list"),
  folderCreate: (data) => ipcRenderer.invoke("folder:create", data),
  folderUpdate: (folderId, patch) => ipcRenderer.invoke("folder:update", folderId, patch),
  folderDelete: (folderId) => ipcRenderer.invoke("folder:delete", folderId),
  folderAddProjects: (folderId, projectIds) => ipcRenderer.invoke("folder:addProjects", folderId, projectIds),

  // Logging & Bug Reports
  logsExportReport: (data) => ipcRenderer.invoke("logs:exportReport", data),

  // #248 Beta feedback reporter (bubble). Distinct from the clip-feedback DB
  // channels above (feedback:updateReasons / feedback:approvalStats).
  feedbackReportContext: (opts) => ipcRenderer.invoke("feedback:context", opts),
  feedbackReportSnapshot: (rect) => ipcRenderer.invoke("feedback:snapshot", rect),
  // Returns an unsubscribe fn — the bubble is mounted once at the app root,
  // but StrictMode double-mounts effects; removeAllListeners would kill the
  // surviving listener.
  onFeedbackAppError: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("feedback:appError", handler);
    return () => ipcRenderer.removeListener("feedback:appError", handler);
  },
});
