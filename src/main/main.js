// Profile redirect MUST happen before Sentry require (#80).
// sentry-electron caches app.getPath("userData") at module-load time
// (getsentry/sentry-electron#796), so any setPath after the require is too late.
const { app } = require("electron");
const path = require("path");
const fs = require("fs");

const CLIPFLOW_PROFILE = process.env.CLIPFLOW_PROFILE === "dev" ? "dev" : "prod";
let userDataMigrationOutcome = null; // set on prod boots, logged once the logger exists
if (CLIPFLOW_PROFILE === "dev") {
  const devUserData = path.join(app.getPath("appData"), "clipflow-dev");
  app.setPath("userData", devUserData);
} else {
  // ClipFlow → Corva rename (#268): productName now resolves userData to
  // %APPDATA%\Corva, so the legacy %APPDATA%\clipflow folder (settings,
  // tracker history, OAuth tokens, DB) is renamed into place on first boot.
  // On failure the app keeps running against the old folder — it must never
  // boot against an empty userData while the real one still exists.
  const { migrateUserData } = require("./user-data-migration");
  const migration = migrateUserData({
    appDataDir: app.getPath("appData"),
    newUserData: app.getPath("userData"),
  });
  if (migration.outcome === "use-old") {
    app.setPath("userData", migration.oldDir);
  }
  userDataMigrationOutcome = migration.outcome;
}

// One running app per profile (#156). MUST come after the profile redirect above:
// the lock is scoped to the userData directory, so requesting it first would make
// dev and prod contend for a single lock and stop `npm run dev` running alongside
// the installed app. As placed, only same-profile launches collide — which is the
// case that actually bit us: the installed exe and a source `npm start` are both
// the prod profile, and each renderer ran its own auto-fire publish scheduler over
// the same project library, posting one clip twice (#182 has the other half).
//
// app.exit(0) halts synchronously — verified — so a losing instance dies on this
// line, before Sentry, the database, the stores, or any migration can touch state
// the winning instance owns. Do not soften this to app.quit(), which is async and
// would let the rest of this file run first.
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

require("dotenv").config();
const Sentry = require("@sentry/electron/main");

Sentry.init({
  dsn: "https://849738274a045a047fd2068789244d13@o4511147466752000.ingest.us.sentry.io/4511147471077376",
  environment: CLIPFLOW_PROFILE,
});

/**
 * #298: an error that reached the top used to be re-thrown, which suppressed
 * Electron's own error dialog AND — since createWindow() is the last thing the
 * bootstrap does — left a live process still holding the single-instance lock
 * taken above. No window, no message, and every later double-click a silent
 * no-op, because each new instance sees the lock and exits. Say what happened,
 * say where the log is, then exit so the lock is released.
 *
 * Requires are lazy on purpose: this can fire while the module graph is still
 * loading, before the bindings further down this file exist.
 */
function fatal(context, err) {
  const detail = err?.stack || err?.message || String(err);
  let logsDir = "";
  try {
    const logger = require("./logger");
    logsDir = logger.getLogsDir();
    logger.error(logger.MODULES.system, `${context} ${detail}`);
  } catch (_) { /* the logger itself may not be up yet */ }
  try { Sentry.captureException(err); } catch (_) {}
  try {
    const lines = [context, "", err?.message || String(err)];
    if (logsDir) lines.push("", "Details are in:", logsDir);
    // Modal and synchronous: it is the only thing the user will ever see, and it
    // holds the process open long enough for Sentry's transport to get out.
    require("electron").dialog.showErrorBox("Corva has to close", lines.join("\n"));
  } catch (_) {}
  app.exit(1);
}

// Suppress EPIPE errors from Sentry/electron-log writing to a closed stdout pipe on quit
process.on("uncaughtException", (err) => {
  // Optional chain: a thrown null/undefined would otherwise crash this very
  // handler — a silent double-fault instead of fatal()'s dialog. fatal() itself
  // is already null-safe.
  if (err?.code === "EPIPE") return;
  fatal("Corva hit an unexpected error.", err);
});

const { BrowserWindow, ipcMain, dialog, shell, Notification } = require("electron");

// #244: Windows toast notifications need an AppUserModelID matching the installed
// shortcut's (electron-builder sets it from build.appId). In dev the toast
// attributes to Electron's default identity — acceptable; branding arrives with
// the installer. #269: packaged-only — a source run claiming this AUMID poisons
// Windows' cached taskbar identity for the installed app ("Electron" icon/name).
if (app.isPackaged) {
  app.setAppUserModelId("com.clipflow.app");
}
const os = require("os");
const chokidar = require("chokidar");
const { createStore } = require("./store-factory");
const appPaths = require("./app-paths");
const depsCheck = require("./deps-check");
const setupRuntime = require("./setup-runtime");
const ffmpeg = require("./ffmpeg");
const whisper = require("./whisper");
const projects = require("./projects");
const assetLibrary = require("./assets");
const reframeDetect = require("./reframe-detect");
const highlights = require("./highlights");
const render = require("./render");
const aiPipeline = require("./ai-pipeline");
const database = require("./database");
const feedbackDb = require("./feedback");
const namingPresets = require("./naming-presets");
const fileMigration = require("./file-migration");
const reconcile = require("./reconcile");
const subtitlePollutionMigration = require("./subtitle-pollution-migration");
const renderCollisionRepair = require("./render-collision-repair");
const gameProfiles = require("./game-profiles");
const gameDetect = require("./game-detect");
const gameArt = require("./game-art");
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
const feedbackReport = require("./feedback-report"); // #248 — NOT the clip-feedback DB (./feedback)
const logger = require("./logger");
if (userDataMigrationOutcome && userDataMigrationOutcome !== "noop") {
  logger.info(logger.MODULES.system, `Corva userData migration (#268): ${userDataMigrationOutcome}`, { userData: app.getPath("userData") });
}
const llmProvider = require("./ai/llm-provider");
const aiPrompt = require("./ai-prompt");
const titleCaptionPrompt = require("./ai/title-caption-prompt");
const titleCaptionLog = require("./title-caption-log");
const queueImports = require("./queue-imports");
const transcriptionProvider = require("./ai/transcription-provider");
// Load provider adapters (self-register on require)
require("./ai/providers/anthropic");
require("./ai/providers/openai-compat");
// Gemini is bound (not just registered): the title/caption handler calls it
// directly for video input (#193) — it never replaces the active llmProvider.
const geminiProvider = require("./ai/providers/gemini");
require("./ai/transcription/stable-ts");
const { uuid } = require("./uuid");
// Cross-tree require: editor/utils/** is bundled via package.json build.files,
// so this is safe in the packaged app (see CLAUDE.md "Cross-tree requires").
const { resolveReframeStyle } = require("../renderer/editor/utils/reframeStyle");

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

// Root of the project library (`.clipflow` tree). Decoupled from watchFolder
// so the watch folder can follow OBS's recording tree without orphaning
// projects. Falls back to watchFolder for stores from before the split.
function libraryRoot() {
  return store.get("projectsRoot") || store.get("watchFolder");
}

const STORE_DEFAULTS = {
  // #251: empty until the user picks a folder (Settings / onboarding). The
  // renderer never starts a watcher on "" (#167 guard in RenameView). Installs
  // that relied on the old Fega-machine default are rescued by a boot
  // migration below.
  watchFolder: "",
  // Project library home (the `.clipflow` tree: projects, clips, waveform
  // caches). Pinned to the watch folder's value on first launch after the
  // split so changing the watch folder never orphans existing projects.
  projectsRoot: "",
  testWatchFolder: "",
  // #261: custom AI-engine install location ("" = <userData>\runtime), so the
  // multi-GB engine + speech model can live off the system drive.
  engineRoot: "",
  // #262: no seeded games — fresh installs start empty and the user adds their
  // own via + Add Game. Installs that persisted the old Fega-library default
  // without ever using it are reset by a boot migration below.
  mainGame: "",
  mainPool: [],
  gamesDb: [],
  ignoredProcesses: ["explorer.exe", "steamwebhelper.exe", "dwm.exe", "ShellExperienceHost.exe", "zen.exe"],
  // #263: game auto-detect stamps for not-yet-renamed files, keyed by absolute
  // path: { game, source: "process"|"ai", confidence?, aiGuess?, at }. game is
  // null when detection ran and found nothing — cached so the AI sniff never
  // re-spends on the same file. Evicted on rename, file removal, and boot sweep.
  detectedGames: {},
  platforms: [],
  // #302: neutral starter schedule — three slots a day, Mon–Sat, all on the
  // main game. Replaces Fega's own eight-slot routine, which every fresh
  // install inherited. Written in the timeSlots+grid shape (App.js
  // DEFAULT_TEMPLATE must stay identical) — the old shape had no slot list,
  // so the renderer had to graft its own on, and the two drifted apart.
  weeklyTemplate: {
    timeSlots: ["12:00 PM","4:00 PM","8:00 PM"],
    grid: {
      Monday: ["main","main","main"],
      Tuesday: ["main","main","main"],
      Wednesday: ["main","main","main"],
      Thursday: ["main","main","main"],
      Friday: ["main","main","main"],
      Saturday: ["main","main","main"],
    },
  },
  trackerData: [],
  // #302: 3 slots x 6 days — derived from the starter schedule above rather
  // than from Fega's personal 48. Editable in the Tracker.
  weeklyTarget: 18,
  weekMeta: {},
  xpLedger: [],
  streakState: { evaluatedThroughMondayISO: null, current: 0, best: 0 },
  // #262: generic templates — no personal hashtags in defaults.
  captionTemplates: {
    tiktok: "{title} #{gametitle} #fyp #gamingontiktok",
    instagram: "{title} #{gametitle} #reels #gamingreels",
    facebook: "{title} #{gametitle} #gaming #fbreels",
  },
  ytDescriptions: {},
  // #286: the user's stream schedule as one line of text. Templates reference it
  // as {schedule} so a schedule change is one edit here instead of eleven
  // template edits. Empty = the variable resolves to nothing.
  streamSchedule: "",
  outputFolder: "",
  // Legacy single "Sound Effects Folder". Superseded by audioFolders (#208);
  // kept so the migration below has something to read, blanked once it runs.
  sfxFolder: "",
  // #208: folders whose audio is linked in place, never copied. Scanned
  // recursively. Shape: [{ path, enabled }].
  audioFolders: [],
  // How loud the Audio panel auditions a track (0–1). Preview only — a placed
  // sound carries its own volume. Defaults low: a commercial music library is
  // mastered loud, and full-blast auditioning is painful.
  audioPreviewVolume: 0.35,
  whisperModel: "large-v3-turbo",
  whisperPythonPath: "",
  // #146: record of the managed AI-engine install (Finish Setup flow).
  // null = never installed via the flow (e.g. Fega's D:\ venv machines).
  // Shape: { variant: "cuda"|"cpu", version, installedAt }
  engineRuntime: null,
  // #251: HuggingFace model cache. Empty = per-user app data (app-paths.js
  // defaultHfHome). Machines with the legacy D:\whisper\hf_cache are pinned
  // to it by a boot migration below so models never re-download.
  hfHome: "",
  // #240 queue imports: content-fingerprint → { status: "imported"|"skipped",
  // at, file, targetPath? }. Main-process-owned only — the renderer never
  // loads or persists this key (keeps it clear of the App.js auto-save loop).
  importMemory: {},
  localProjects: [],
  renameHistory: [],
  anthropicApiKey: "",
  geminiApiKey: "",
  // #249: gateway BASE (no provider segment) — each provider appends its own
  // (/anthropic, /google-ai-studio). Migration below strips the legacy suffix.
  gatewayUrl: "https://gateway.ai.cloudflare.com/v1/58332e30c2b9ef9de6c53d37ee9fd3dc/clipflow-prod",
  // #249 Option A (Fega ratified 2026-08-11): the shared beta gateway token
  // ships preset so a tester's install talks to AI with zero setup. This is a
  // DELIBERATE, revocable, spend-capped inclusion — NOT a leaked secret. Do
  // not "fix" it. Raw provider keys must never ship; Cloudflare injects them
  // server-side. The token value lives OUTSIDE git (resources/beta-token.json
  // packaged, vendor/beta-token.json from source — GitHub push protection
  // rejects committed live tokens).
  //
  // #301: this key holds the USER'S OWN token only, and defaults to "". The
  // bundled token is resolved at call time in llm-provider.resolveGatewayToken
  // — seeding it here copied it into the settings file on first launch, where
  // the file value outranks every later build and the token could never be
  // rotated. Empty here does NOT mean "no gateway": gatewayUrl is the on/off
  // switch, and clearing it is what falls back to raw provider keys.
  gatewayAuthToken: "",
  youtubeClientId: "",
  youtubeClientSecret: "",
  metaAppId: "",
  metaAppSecret: "",
  tiktokClientKey: "",
  tiktokClientSecret: "",
  styleGuide: "",
  titleCaptionHistory: [],
  // #183 — daily view-count refresh stamp. Reads falsy-safe, no migration needed.
  titleCaptionViewsRefreshedAt: 0,
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
  // #190: game-audio track for detection signals (game_energy / game_yamnet).
  // null = off (default). 0-based audio stream index when set, same convention
  // as transcriptionAudioTrack.
  gameAudioTrack: null,
  // #169: user-verified audio track layout from the calibration wizard.
  // null = never calibrated. Shape: { trackCount, tracks: [{ index, label, customName? }], calibratedAt }
  // Labels: voice | game | music | comms | mix | browser | other | empty | unknown
  // customName (#271): optional user-typed name, only on "other" tracks.
  audioSetup: null,
  // Project folders
  projectFolders: [],
  folderSortMode: "created",
  // Reframe layouts (#164)
  reframeLayouts: [],
  reframeLayoutDefaultId: null,
  // #164 B4: "WxH" strings the user answered "Not for this format" to —
  // the editor's first-recording auto-offer never re-shows for these dims.
  reframeOfferDismissed: [],
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
  // #248 feedback bubble — tucked state and edge position persist across
  // launches (locked design: it never nags its way back). bottom is CSS px
  // from the window's bottom edge.
  feedbackBubble: { tucked: false, bottom: 88 },
};

function runStoreMigrations(store) {
  // ── Migration (#251): watchFolder default is no longer Fega's W:\ path ──
  // Installs that relied on the old default (never explicitly saved a value)
  // keep working: if the store has no watchFolder and the old default exists
  // on this machine, persist it. Tester machines have no W:\ → stays "".
  // Must run before the projectsRoot pin below, which reads watchFolder.
  const LEGACY_WATCH_FOLDER = "W:\\YouTube Gaming Recordings Onward\\Vertical Recordings Onwards";
  if (!store.get("watchFolder") && fs.existsSync(LEGACY_WATCH_FOLDER)) {
    store.set("watchFolder", LEGACY_WATCH_FOLDER);
    logger.info(logger.MODULES.system, `Pinned watchFolder to legacy default ${LEGACY_WATCH_FOLDER}`);
  }

  // ── Migration (#251): hfHome default moves off D:\whisper ──
  // Same migrate-at-boot pattern as #249's gatewayUrl: if the legacy cache
  // exists on this machine and no hfHome is set, pin it BEFORE the default
  // changes for everyone else — protects a multi-GB populated model cache
  // from silently re-downloading into the new per-user location.
  const LEGACY_HF_CACHE = "D:\\whisper\\hf_cache";
  if (!store.get("hfHome") && fs.existsSync(LEGACY_HF_CACHE)) {
    store.set("hfHome", LEGACY_HF_CACHE);
    logger.info(logger.MODULES.system, `Pinned hfHome to existing legacy cache ${LEGACY_HF_CACHE}`);
  }

  // ── Migration (#251): whisperPythonPath loses its D:\ code fallback ──
  // Profiles that relied on the old hardcoded guess (unset setting) keep
  // working: pin the legacy venv into the store if it exists on this machine.
  // Tester machines have no D:\whisper → stays unset → clear first-run error.
  const LEGACY_WHISPER_PYTHON = "D:\\whisper\\betterwhisperx-venv\\Scripts\\python.exe";
  if (!store.get("whisperPythonPath") && fs.existsSync(LEGACY_WHISPER_PYTHON)) {
    store.set("whisperPythonPath", LEGACY_WHISPER_PYTHON);
    logger.info(logger.MODULES.system, `Pinned whisperPythonPath to existing legacy venv ${LEGACY_WHISPER_PYTHON}`);
  }

  // ── Migration: pin the project library to the current watch folder ──
  // The `.clipflow` projects tree historically lived under watchFolder. Now
  // that the watch folder can point at OBS's own recording tree, the library
  // location is captured once here and stops following watchFolder changes.
  // Idempotent by condition: only sets when unset (fresh installs stay ""
  // until a watch folder exists, then get pinned on the next launch).
  if (!store.get("projectsRoot") && store.get("watchFolder")) {
    store.set("projectsRoot", store.get("watchFolder"));
    logger.info(logger.MODULES.system, `Pinned projectsRoot to ${store.get("watchFolder")}`);
  }

  // ── Migration (#208): the single Sound Effects Folder became a list ──
  // One folder, top level only, could never index a real sound library. The old
  // path becomes the first watched folder and `sfxFolder` is blanked, so this
  // can't resurrect the folder after the user removes it from the list.
  // Fresh installs read "" and skip.
  const legacySfxFolder = store.get("sfxFolder");
  if (legacySfxFolder) {
    const watched = Array.isArray(store.get("audioFolders")) ? store.get("audioFolders") : [];
    if (!watched.some((f) => f && f.path === legacySfxFolder)) {
      store.set("audioFolders", [...watched, { path: legacySfxFolder, enabled: true }]);
    }
    store.set("sfxFolder", "");
    logger.info(logger.MODULES.system, `Migrated sfxFolder to audioFolders: ${legacySfxFolder}`);
  }
  if (!Array.isArray(store.get("audioFolders"))) store.set("audioFolders", []);

  // ── Migration (#208): Audio panel preview volume ──
  // Existing installs have no value; 0 is a legitimate setting, so this checks
  // the type rather than truthiness or a mute would be reset every launch.
  const previewVol = store.get("audioPreviewVolume");
  if (typeof previewVol !== "number" || previewVol < 0 || previewVol > 1) {
    store.set("audioPreviewVolume", 0.35);
  }

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
  // ── Migration: add audio calibration setup (#169) ──
  if (!store.has("audioSetup")) store.set("audioSetup", null);
  // ── Migration: fix default audio track from game (1) to mic (0) — one-time ──
  // #169: the flag must be set even when no flip happens, otherwise the
  // migration stays armed and silently reverts a deliberate track-2 choice
  // (e.g. from the calibration wizard) on the next launch.
  if (!store.has("_migrated_audioTrack_v2")) {
    if (store.get("transcriptionAudioTrack") === 1) store.set("transcriptionAudioTrack", 0);
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

  // ── Migration (#262): reset the old seeded game library on unused installs ──
  // Pre-#262 defaults persisted Fega's seven games (plus his main-game rotation
  // and #fega caption hashtags) into every fresh install's store. An install
  // still holding exactly that seven-game set with zero renamed days never
  // actually used it — reset to the new empty defaults so the user starts
  // clean. Any real usage (a dayCount > 0, a game added or removed) skips this,
  // so Fega's own machines are untouched.
  // Content-type entries (Just Chatting) are appended to gamesDb by
  // file-migration on every install's first boot, so they're excluded from the
  // seed fingerprint and preserved through the reset (alpha.57 shipped an
  // exact-length check that never fired on the laptop because of the JC entry).
  const LEGACY_SEED_NAMES = ["Arc Raiders", "Rocket League", "Valorant", "Egging On", "Deadline Delivery", "Bionic Bay", "Prince of Persia"];
  const storedGamesDb = store.get("gamesDb");
  if (Array.isArray(storedGamesDb)) {
    const contentEntries = storedGamesDb.filter((g) => g && g.entryType === "content");
    const gameEntries = storedGamesDb.filter((g) => g && g.entryType !== "content");
    if (
      gameEntries.length === LEGACY_SEED_NAMES.length &&
      LEGACY_SEED_NAMES.every((name) => gameEntries.some((g) => g.name === name)) &&
      storedGamesDb.every((g) => g && !g.dayCount)
    ) {
      store.set("gamesDb", contentEntries);
      store.set("mainGame", "");
      store.set("mainPool", []);
      store.set("captionTemplates", STORE_DEFAULTS.captionTemplates);
      store.set("ytDescriptions", {});
      logger.info(logger.MODULES.system, "Reset unused seeded game library to empty defaults (#262)");
    }
  }

  // ── #263: sweep detection stamps for files that left the disk ──
  const detectedGamesSweep = store.get("detectedGames") || {};
  const sweptDetected = {};
  for (const [p, v] of Object.entries(detectedGamesSweep)) {
    if (fs.existsSync(p)) sweptDetected[p] = v;
  }
  if (Object.keys(sweptDetected).length !== Object.keys(detectedGamesSweep).length) {
    store.set("detectedGames", sweptDetected);
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

  // ── Migration: game-audio track signal (#190) ──
  // Default off (null) — game signals only run once the user picks a game
  // track in Settings. Existing installs see zero behavior change.
  if (!store.has("gameAudioTrack")) store.set("gameAudioTrack", null);

  // ── Migration: clip cutting encoder default "auto" (Issue #75 Phase 1) ──
  // "auto" = NVENC if detected, else x264. "gpu" = strict NVENC (errors if
  // unavailable, never silently falls back). "cpu" = libx264.
  if (!store.has("clipCutEncoder")) store.set("clipCutEncoder", "auto");

  // ── Migration: clip cutting parallelism (Issue #75 Phase 2) ──
  // Number of clips cut concurrently. NVENC on RTX 30-series supports ~5
  // simultaneous sessions; default 3 is conservative. Range clamped 1-5.
  if (!store.has("clipCutConcurrency")) store.set("clipCutConcurrency", 3);

  // ── Migration: reframe layouts library (#164) ──
  if (!store.has("reframeLayouts")) store.set("reframeLayouts", []);
  if (!store.has("reframeLayoutDefaultId")) store.set("reframeLayoutDefaultId", null);

  // ── Migration: reframe auto-offer dismissed formats (#164 B4) ──
  // Existing installs predate the key; empty list = no format dismissed yet.
  if (!store.has("reframeOfferDismissed")) store.set("reframeOfferDismissed", []);

  // ── Migration: reframe style controls (#164 Phase B) ──
  // Backfills entries that predate the style field AND re-resolves entries
  // with an old-shape style (drops the removed `seam` field, adds
  // bgZoom/bgPosX/bgPosY) so every layout renders identically after the
  // style schema changes. Idempotent on every boot; fresh installs (empty
  // array) are a no-op.
  const reframeLayoutsForStyleMigration = store.get("reframeLayouts") || [];
  let reframeLayoutsStyleChanged = false;
  const migratedReframeLayouts = reframeLayoutsForStyleMigration.map((entry) => {
    const currentStyle = entry && entry.style;
    const resolved = resolveReframeStyle(currentStyle);
    if (JSON.stringify(resolved) === JSON.stringify(currentStyle)) return entry;
    reframeLayoutsStyleChanged = true;
    return { ...entry, style: resolved };
  });
  if (reframeLayoutsStyleChanged) store.set("reframeLayouts", migratedReframeLayouts);

  // ── Migration (#249): gatewayUrl becomes the gateway BASE ──
  // The Anthropic-specific /anthropic suffix moved into the provider so a
  // second provider (google-ai-studio) can share one gateway URL. Strip the
  // suffix from existing installs; idempotent (a base URL doesn't match),
  // fresh installs get the base default and skip.
  const legacyGatewayUrl = String(store.get("gatewayUrl") || "");
  if (/\/anthropic\/*$/.test(legacyGatewayUrl)) {
    store.set("gatewayUrl", legacyGatewayUrl.replace(/\/+$/, "").replace(/\/anthropic$/, ""));
    logger.info(logger.MODULES.system, "Migrated gatewayUrl to gateway base (stripped /anthropic)");
  }

  // ── Migration (#301): un-pin installs from their copied bundled token ──
  // Pre-fix builds seeded gatewayAuthToken as a store DEFAULT, so first launch
  // persisted the bundled token into the settings file — and from then on the
  // file value beat every future build. Both of Fega's profiles were found
  // holding a token that no longer matched the shipped one, which is the
  // defect in the flesh: matching only the CURRENT bundled value would have
  // left exactly those machines pinned. So this clears the field once,
  // unconditionally, and stashes what was there under a separate key so a
  // token someone pasted by hand is recoverable rather than destroyed.
  // After this runs, a non-empty gatewayAuthToken can only have been typed by
  // the user — the renderer is never handed the bundled one again.
  if (!store.has("_migrated_gatewayToken_v1")) {
    const persistedToken = String(store.get("gatewayAuthToken") || "").trim();
    if (persistedToken) {
      store.set("gatewayAuthTokenPreMigration", persistedToken);
      store.set("gatewayAuthToken", "");
      logger.info(logger.MODULES.system, "Cleared the persisted gateway token (#301) — it now resolves from the build at call time; previous value stashed as gatewayAuthTokenPreMigration");
    }
    store.set("_migrated_gatewayToken_v1", true);
  }
}

let mainWindow;
let watcher = null;
let testWatcher = null;

// #156: someone tried to launch a second copy of this profile and it exited on the
// lock check. Surface the window we already have so the launch isn't a silent no-op
// — from the user's side clicking the icon again should just bring ClipFlow forward.
app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

// Pending imports — suppresses chokidar for drag-and-drop copies
// Entries: { filename: string, sizeBytes: number }
const pendingImports = new Set();

// Thumbnail cache — maps filePath to { thumbDir, thumbnails, duration }
// Cleaned up on app quit
const thumbnailCache = new Map();

const isDev = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: CLIPFLOW_PROFILE === "dev" ? "Corva [DEV]" : "Corva",
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
    // .ico, not .png: Windows draws the taskbar button at 24/20/40px depending
    // on display scaling, and only a multi-size .ico carries those exact rungs.
    // A single big PNG gets bilinear-squashed to those sizes and renders soft.
    icon: path.join(__dirname, "../../build/icon.ico"),
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

  // Scale the whole UI with window width: content is a fixed-max-width centered
  // column, so a maximized 2560px-wide (1440p) window otherwise renders a tiny
  // island of 11-13px text in dead space. ≤1920px wide stays exactly 1.0 (the
  // tuned look); wider zooms proportionally, capped at 1.35. setZoomFactor is
  // page-wide so tabs, editor, and Radix portals all scale consistently.
  const applyWindowZoom = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [w] = mainWindow.getContentSize();
    mainWindow.webContents.setZoomFactor(Math.min(1.35, Math.max(1, w / 1920)));
  };
  mainWindow.on("resize", applyWindowZoom);
  mainWindow.webContents.on("did-finish-load", applyWindowZoom);

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
  // #248: a failed publish pulses the feedback bubble (scheduled publishes
  // fail with nobody watching — the pulse is how the failure gets noticed).
  publishLog.setFailureNotifier((entry) => {
    feedbackReport.recordAppError(
      "publish",
      `${entry.platform || "publish"}: ${entry.error || "failed"}`,
      mainWindow?.webContents
    );
  });
  await tokenStore.init();

  // Initialize shared SQLite database (feedback + file metadata)
  await database.init();

  // Run one-time migrations for rename redesign
  fileMigration.migrateStoreData(store);

  // #183: seed the title/caption training table from the publish log and
  // tracker rows the app has been accumulating all along.
  //
  // Runs every startup rather than behind a "done" flag on purpose. The flag
  // would live in electron-store, which prod-from-source and the packaged exe
  // SHARE, while the table lives in a database they do NOT (see the DB_DIR
  // split in database.js) — so a flag set by one would starve the other's
  // table forever. backfill() only inserts clip ids it doesn't already have,
  // so re-running costs a few dozen indexed lookups.
  try {
    const result = titleCaptionLog.backfill({
      publishLogEntries: publishLog.getRecentLogs(500),
      trackerData: store.get("trackerData") || [],
      titleCaptionHistory: store.get("titleCaptionHistory") || [],
    });
    if (result.inserted > 0) {
      logger.info(logger.MODULES.titleGeneration, "Title/caption backfill seeded rows", result);
    }
  } catch (err) {
    logger.warn(logger.MODULES.titleGeneration, "Title/caption backfill failed", { error: err.message });
  }

  // #183 Phase 4: refresh view counts once a day, in the background, well after
  // the window is up. Never blocks startup and never surfaces an error — with
  // no counts the examples simply fall back to recency ordering.
  const DAY_MS = 24 * 60 * 60 * 1000;
  if (Date.now() - (store.get("titleCaptionViewsRefreshedAt") || 0) > DAY_MS) {
    setTimeout(() => {
      refreshYoutubeViews()
        .then((r) => {
          store.set("titleCaptionViewsRefreshedAt", Date.now());
          if (r.updated > 0) logger.info(logger.MODULES.titleGeneration, "Refreshed YouTube view counts", r);
        })
        .catch((err) => logger.warn(logger.MODULES.titleGeneration, "View refresh failed", { error: err.message }));
    }, 30000);
  }

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

    // #84: one-time repair of polluted clip.subtitles.sub1 (whole-recording spans).
    // Synchronous + fast (file reads only, no probes), gated by its own store flag.
    try {
      const subResult = subtitlePollutionMigration.runSubtitlePollutionMigration(libraryRoot(), store, projects);
      if (subResult.clipsFixed > 0) {
        logger.info(logger.MODULES.system, `Subtitle pollution repair: ${subResult.clipsFixed} clip(s) across ${subResult.repaired} project(s)`);
      }
      if (subResult.errors.length > 0) {
        logger.warn(logger.MODULES.system, `Subtitle pollution repair had ${subResult.errors.length} errors`, { errors: subResult.errors.slice(0, 5) });
      }
    } catch (err) {
      logger.error(logger.MODULES.system, `Subtitle pollution repair failed: ${err.message}`);
    }

    // #181: one-time repair of legacy flat-folder render collisions. Record
    // repair is synchronous (untrusted renderPaths reset before the renderer
    // loads); wrong-game thumbnails regenerate from source in the background.
    try {
      const rcResult = renderCollisionRepair.runRenderCollisionRepair(libraryRoot(), store, projects, ffmpeg, logger);
      if (rcResult.ran) {
        logger.info(logger.MODULES.system, `#181 render collision repair: ${rcResult.rendersReset} render record(s) reset, ${rcResult.thumbsQueued} thumbnail(s) queued for regen`);
        if (rcResult.errors.length > 0) {
          logger.warn(logger.MODULES.system, `#181 repair had ${rcResult.errors.length} errors`, { errors: rcResult.errors.slice(0, 5) });
        }
        rcResult.background.then(({ thumbsFixed }) => {
          logger.info(logger.MODULES.system, `#181 thumbnail regen complete: ${thumbsFixed}/${rcResult.thumbsQueued} regenerated from source`);
        });
      }
    } catch (err) {
      logger.error(logger.MODULES.system, `#181 render collision repair failed: ${err.message}`);
    }
  }

  createWindow();

  // Game-art boot sweep: fetch Steam posters for games that have none yet.
  // Delayed so it never competes with boot I/O; fails soft offline.
  setTimeout(() => {
    gameArt.fetchMissing(store.get("gamesDb") || []).then((changed) => {
      logger.info(logger.MODULES.system, "Game-art boot sweep done", { fetchedNew: changed });
      if (changed) mainWindow?.webContents.send("gameArt:changed");
    }).catch((err) => {
      logger.warn(logger.MODULES.system, "Game-art boot sweep failed", { error: err.message });
    });
  }, 5000);
}).catch((err) => fatal("Corva couldn't finish starting up.", err));

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

// File system: rename file
ipcMain.handle("fs:renameFile", async (_, oldPath, newPath) => {
  try {
    // Ensure target directory exists
    const dir = path.dirname(newPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // #173: fs.renameSync replaces an existing target silently on Windows —
    // refuse instead. Same-path calls (in-place month-folder no-ops) pass.
    if (path.resolve(oldPath).toLowerCase() !== path.resolve(newPath).toLowerCase() && fs.existsSync(newPath)) {
      return { error: `A file named "${path.basename(newPath)}" already exists in the destination` };
    }
    fs.renameSync(oldPath, newPath);
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

// #300: rename a recording whose container isn't MP4. Same contract as
// fs:renameFile — the file ends up at newPath — but the bytes are remuxed into
// a real MP4 first. NOT because Chromium can't open Matroska (measured s192:
// h264+aac MKV previews fine) — because whether a given MKV previews depends on
// the codecs inside, and converting makes the .mp4 name always tell the truth.
// Video is stream-copied; the original is deleted only once the output probes
// as complete.
ipcMain.handle("fs:convertAndRename", async (_, oldPath, newPath) => {
  try {
    const dir = path.dirname(newPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(newPath)) {
      return { error: `A file named "${path.basename(newPath)}" already exists in the destination` };
    }
    const result = await ffmpeg.remuxToMp4(oldPath, newPath);
    logger.info(logger.MODULES.videoProcessing,
      `#300 converted ${path.basename(oldPath)} → ${path.basename(newPath)}${result.audioReencoded ? " (audio re-encoded to AAC)" : ""}`);
    return { success: true, audioReencoded: result.audioReencoded };
  } catch (err) {
    logger.error(logger.MODULES.videoProcessing, `#300 convert failed for ${oldPath}: ${err.message}`);
    return { error: err.message };
  }
});

// File system: check if file exists
ipcMain.handle("fs:exists", async (_, filePath) => {
  return fs.existsSync(filePath);
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

// ─── #263: game auto-detect (tier 1 process watch + tier 2 Gemini frames) ───

/** Persist a detection stamp for a not-yet-renamed file. */
function stampDetectedGame(filePath, entry) {
  const map = store.get("detectedGames") || {};
  map[filePath] = entry;
  store.set("detectedGames", map);
}

function evictDetectedGame(...filePaths) {
  const map = store.get("detectedGames") || {};
  let changed = false;
  for (const p of filePaths) {
    if (p && map[p] !== undefined) { delete map[p]; changed = true; }
  }
  if (changed) store.set("detectedGames", map);
}

// Tier 2 runs one file at a time — a boot rescan can surface several unstamped
// files at once and the calls are cheap but not free. A file is sniffed at most
// once ever: even "unknown" results are stamped (game: null) as a cache.
let gameSniffChain = Promise.resolve();
function queueGameSniff(filePath) {
  gameSniffChain = gameSniffChain.then(async () => {
    if (!fs.existsSync(filePath)) return;
    if ((store.get("detectedGames") || {})[filePath]) return; // stamped while queued
    // #249: gateway BYOK counts as configured — no raw key on tester installs
    if (!geminiProvider.isConfigured()) return;
    const games = (store.get("gamesDb") || []).filter((g) => g.entryType !== "content" && g.name);
    if (games.length === 0) return;
    try {
      const processingDir = store.get("processingDir") || aiPipeline.DEFAULT_PROCESSING_DIR;
      let costLogger = null;
      try {
        costLogger = new pipelineLogger.PipelineLogger(processingDir, `game sniff ${path.basename(filePath)}`);
        costLogger.info(`#263 frame sniff — ${filePath}`);
      } catch (_) { /* cost log is best-effort */ }
      const result = await gameDetect.identifyGameFromFrames({
        filePath,
        games,
        onUsage: (usage) => {
          if (costLogger) { try { costLogger.logApiUsage(usage.inputTokens, usage.outputTokens, geminiProvider.defaultModel); } catch (_) {} }
        },
      });
      if (costLogger) { try { costLogger.finalize(); } catch (_) {} }
      // Pre-fill only on a high-confidence match to a game the user tracks —
      // a wrong default blindly confirmed poisons day counters (#263).
      const match = result.confidence === "high" ? games.find((g) => g.name === result.game) : null;
      stampDetectedGame(filePath, {
        game: match ? match.name : null,
        source: "ai",
        confidence: result.confidence,
        aiGuess: result.game,
        at: new Date().toISOString(),
      });
      logger.info(logger.MODULES.system, "#263 frame sniff result", { file: path.basename(filePath), game: result.game, confidence: result.confidence, prefill: !!match });
      if (match) {
        mainWindow?.webContents.send("gameDetect:result", { path: filePath, game: match.name, source: "ai", confidence: result.confidence });
      }
    } catch (err) {
      // No stamp on failure — a transient error (no key yet, ffmpeg busy)
      // shouldn't permanently mark the file as un-sniffable.
      logger.warn(logger.MODULES.system, "#263 frame sniff failed", { file: path.basename(filePath), error: err.message });
    }
  });
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
  // #263 tier 1: sample the foreground app while OBS is still writing the file.
  // A game must hold the foreground for >50% of samples to claim the recording
  // — merely running in the background (user watching a video) must not win.
  gameDetect.startSampling(filePath);
  try {
    // Size at add-time vs stable size discriminates a LIVE recording (grows
    // while we watch — foreground samples are evidence) from an already
    // finished file (boot rescan, move-in — whatever is foreground NOW says
    // nothing about the recording, so those samples must be discarded).
    let initialSize = -1;
    try { initialSize = fs.statSync(filePath).size; } catch (_) { /* keep -1 — treated as grown */ }

    const stableSize = await waitForStable(filePath);
    if (stableSize === null) return; // file gone or never stabilized

    // pendingImports dedupe (drag-and-drop path owns this filename+size)
    for (const entry of pendingImports) {
      if (entry.filename === name && entry.sizeBytes === stableSize) return;
    }

    // #174/#264: a path already in the library is not a new recording. Old
    // auto-splits left the parent on disk under its raw OBS name, and the
    // boot rescan (ignoreInitial: false) re-added it to Pending on every
    // launch. Windows paths are case-insensitive — compare accordingly.
    try {
      const db = database.getDb();
      if (db) {
        const known = db.exec("SELECT id FROM file_metadata WHERE current_path = ? COLLATE NOCASE", [filePath]);
        if (database.toRows(known).length > 0) return;
      }
    } catch (_) { /* DB not ready — fall through to normal detection */ }

    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return; // vanished between stabilize and stat
    }

    // #263: resolve the file's game — live foreground majority first, then the
    // persisted stamp (survives restarts; boot rescans have no process context).
    const samples = await gameDetect.stopSampling(filePath);
    const wasLiveRecording = stableSize !== initialSize;
    let detectedGame = wasLiveRecording ? gameDetect.majorityGame(samples, store.get("gamesDb") || []) : null;
    if (detectedGame) {
      stampDetectedGame(filePath, { game: detectedGame, source: "process", at: new Date().toISOString() });
      logger.info(logger.MODULES.system, "#263 process watch detected game", { file: name, game: detectedGame, samples: samples.length });
    } else {
      detectedGame = (store.get("detectedGames") || {})[filePath]?.game || null;
    }

    mainWindow?.webContents.send(addEvent, {
      name,
      path: filePath,
      size: stat.size,
      createdAt: stat.birthtime.toISOString(),
      detectedGame,
    });

    // No process evidence and no cached stamp → let the AI judge the footage.
    if (!detectedGame) queueGameSniff(filePath);
  } finally {
    gameDetect.stopSampling(filePath); // no-op when tier 1 already collected
    stabilityChecksInFlight.delete(filePath);
  }
}

/** Create a chokidar watcher on the given folder that emits on raw-recording file add/remove */
function createRecordingFolderWatcher(folderPath, addEvent, removeEvent, ignoredRoots = []) {
  const normIgnored = ignoredRoots.filter(Boolean).map((p) => p.toLowerCase());
  const w = chokidar.watch(folderPath, {
    ignored: (fp) => {
      if (/(^|[\/\\])\./.test(fp)) return true; // dotfiles/dirs (.clipflow)
      const low = fp.toLowerCase();
      return normIgnored.some((r) => low === r || low.startsWith(r + path.sep));
    },
    persistent: true,
    ignoreInitial: false,
    // OBS can bucket recordings into <Game>\<YYYY-MM>\ subfolders, so watch two
    // levels deep. Renamed files never match RAW_RECORDING_PATTERN, so the
    // watcher stays quiet about ClipFlow's own monthly output folders.
    depth: 2,
    // NOTE: no awaitWriteFinish — we run our own stability check in handleWatcherFileAdded
    // so chokidar-version bumps cannot silently regress this behavior.
  });

  w.on("add", (fp) => { handleWatcherFileAdded(fp, addEvent); });

  w.on("unlink", (fp) => {
    stabilityChecksInFlight.delete(fp); // cancel any in-flight check for a deleted file
    gameDetect.stopSampling(fp); // #263: recording deleted mid-write
    evictDetectedGame(fp);
    mainWindow?.webContents.send(removeEvent, {
      name: path.basename(fp),
      path: fp,
    });
  });

  // #153: chokidar failures used to vanish here, so the Rename tab kept showing
  // a green WATCHING badge over a folder the watcher had already given up on.
  w.on("error", (err) => {
    logger.error(logger.MODULES.system, `Watcher error on ${folderPath}: ${err.message}`);
    mainWindow?.webContents.send("watcher:error", { folderPath, message: err.message });
  });

  return w;
}

// Main watcher: start
ipcMain.handle("watcher:start", async (_, folderPath) => {
  if (watcher) { watcher.close(); watcher = null; }
  // #153: the test watcher below has always guarded this; the main one returned
  // { success: true } unconditionally, so a fresh install rendered a green
  // WATCHING badge over a folder that does not exist on the customer's machine.
  if (!folderPath) return { error: "No recordings folder set" };
  if (!fs.existsSync(folderPath)) return { error: "Folder not found" };
  // Test folders must never leak into the main watcher now that it recurses —
  // a raw test file surfacing as a normal recording would rename as non-test.
  watcher = createRecordingFolderWatcher(folderPath, "watcher:fileAdded", "watcher:fileRemoved", [
    store.get("testWatchFolder"),
    path.join(folderPath, "Test"),
    path.join(folderPath, "Test Footage"),
  ]);
  return { success: true };
});

// Main watcher: stop
ipcMain.handle("watcher:stop", async () => {
  if (watcher) { watcher.close(); watcher = null; }
  return { success: true };
});

// #263: windowed processes for the "pick from running apps" list in Settings →
// Edit Game. First real consumer of the ignoredProcesses setting.
ipcMain.handle("processes:list", async () => {
  try {
    const apps = await gameDetect.listRunningApps(store.get("ignoredProcesses") || []);
    return { success: true, apps };
  } catch (err) {
    return { error: err.message };
  }
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

// Shell: open the containing folder in Explorer and select the file
ipcMain.handle("shell:revealInFolder", async (_, filePath) => {
  shell.showItemInFolder(filePath);
});

// Dialog: open file (for CSV import)
ipcMain.handle("dialog:openFile", async (_, options) => {
  const properties = options.properties || ["openFile"];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties,
    filters: options.filters || [{ name: "CSV Files", extensions: ["csv"] }],
  });
  if (result.canceled) return null;
  // Multi-select callers get the full array; single-select keeps the old shape.
  return properties.includes("multiSelections") ? result.filePaths : result.filePaths[0];
});

// ============ ASSET LIBRARY (SFX / music / pictures) ============
function assetsRootOrThrow() {
  const root = libraryRoot();
  if (!root) throw new Error("Set a watch folder first (Settings) — the asset library lives beside your projects");
  return assetLibrary.getAssetsRoot(root);
}

ipcMain.handle("assets:list", async () => {
  try {
    if (!libraryRoot()) return { success: true, assets: [] };
    const root = assetsRootOrThrow();
    const assets = await assetLibrary.listAssets(root, store.get("audioFolders"));
    // Durations decide the Music/SFX lane, and a cold library is over a minute
    // of probing — run it behind the open panel and let the renderer re-fetch
    // as it lands (#208).
    assetLibrary.backfillDurations(root, (p) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("assets:scanProgress", p);
    }).catch((err) => logger.error(logger.MODULES.system, `Asset duration scan failed: ${err.message}`));
    // #212: seed mood tags and Recent once per library, after the list is built so
    // every folder entry exists to be stamped. The panel re-lists as scanning
    // progresses, so the seeded values appear without another trigger.
    runAssetCatchUp(root);
    return { success: true, assets };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// #208: pin a track to Music or SFX by hand when the duration rule gets it wrong.
ipcMain.handle("assets:setType", async (_, assetId, type) => {
  try {
    return { success: true, type: assetLibrary.setAssetType(assetsRootOrThrow(), assetId, type) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// #212: mood tags. The vocabulary is Epidemic Sound's own (assets.js MOODS).
ipcMain.handle("assets:moods", async () => ({ success: true, moods: assetLibrary.MOODS }));

ipcMain.handle("assets:setTags", async (_, assetId, tags) => {
  try {
    return { success: true, tags: assetLibrary.setAssetTags(assetsRootOrThrow(), assetId, tags) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Bulk path — one mood onto a whole selection, because 34 moods over 761 tracks
// is unusable if every tag costs a popover.
ipcMain.handle("assets:addTagToMany", async (_, assetIds, tag) => {
  try {
    return { success: true, changed: assetLibrary.addAssetTagToMany(assetsRootOrThrow(), assetIds, tag) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// #212: stamp a use so the Recent filter has something to sort by. `filePath`
// identifies the track when the id came off a clip (#214).
ipcMain.handle("assets:markUsed", async (_, assetId, filePath) => {
  try {
    return { success: true, lastUsedAt: assetLibrary.markAssetUsed(assetsRootOrThrow(), assetId, null, filePath) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/**
 * One-time catch-up run behind the panel (#212): seed tags from folder names, and
 * seed Recent from clips already saved so the tab isn't empty on first open. Both
 * are non-destructive and guarded by a marker so they run once per library.
 */
function runAssetCatchUp(root) {
  try {
    const flags = store.get("assetCatchUp") || {};
    const next = { ...flags };
    if (!flags.tagsSeeded) {
      const r = assetLibrary.seedTagsFromFolders(root);
      logger.info(logger.MODULES.system, `Seeded mood tags from folder names: ${r.tagged} of ${r.total} tracks`);
      next.tagsSeeded = true;
    }
    if (!flags.lastUsedSeeded) {
      const lib = libraryRoot();
      // listProjects returns { projects: [...] }, not an array — clips are
      // included (minus subtitles/transcription), so `sfx` is there to read.
      const projList = lib ? (projects.listProjects(lib).projects || []) : [];
      const r = assetLibrary.backfillLastUsed(root, projList);
      logger.info(logger.MODULES.system, `Seeded Recent from existing clips: ${r.stamped} tracks matched`);
      next.lastUsedSeeded = true;
    }
    if (next.tagsSeeded !== flags.tagsSeeded || next.lastUsedSeeded !== flags.lastUsedSeeded) {
      store.set("assetCatchUp", next);
    }
  } catch (err) {
    logger.error(logger.MODULES.system, `Asset catch-up failed: ${err.message}`);
  }
}

// #210: remember the level a sound should open at, so a hot master doesn't need
// re-tuning on every clip. null clears it back to the per-kind default.
// #214: `filePath` is how a placement saved on a clip identifies its track — the
// `assetId` it carries predates any index rebuild and may no longer exist.
ipcMain.handle("assets:setDefaultVolume", async (_, assetId, volume, filePath) => {
  try {
    return { success: true, defaultVolume: assetLibrary.setAssetDefaultVolume(assetsRootOrThrow(), assetId, volume, filePath) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// #226: read the remembered level back so the sound popover can show it on
// reopen instead of offering to remember a level that's already saved.
ipcMain.handle("assets:getDefaultVolume", async (_, assetId, filePath) => {
  try {
    return { success: true, defaultVolume: assetLibrary.getAssetDefaultVolume(assetsRootOrThrow(), assetId, filePath) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("assets:import", async (_, filePaths, typeHint) => {
  try {
    const result = await assetLibrary.importAssets(assetsRootOrThrow(), filePaths, typeHint);
    logger.info(logger.MODULES.system, `Asset import: ${result.imported.length} imported, ${result.skipped.length} skipped`);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("assets:delete", async (_, assetId) => {
  try {
    assetLibrary.deleteAsset(assetsRootOrThrow(), assetId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("assets:favorite", async (_, assetId) => {
  try {
    const favorite = assetLibrary.toggleFavorite(assetsRootOrThrow(), assetId);
    return { success: true, favorite };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Waveform shape for a placed sound — the timeline draws it inside the block.
ipcMain.handle("assets:peaks", async (_, filePath) => {
  try {
    if (!filePath) return { success: false, error: "No file path" };
    const result = await assetLibrary.getPeaks(assetsRootOrThrow(), filePath);
    return { success: !result.error, ...result };
  } catch (err) {
    return { success: false, error: err.message, peaks: [] };
  }
});

// ============ DEPENDENCY CHECK (#251) ============
// Cheap preflight the renderer runs at boot (DependencyBanner) and the
// pipeline runs before starting work. Plain-language issues, no jargon.
ipcMain.handle("system:checkDependencies", async () => {
  try { return await depsCheck.checkDependencies(store); }
  catch (err) { return { ok: true, issues: [], error: err.message }; }
});

// ============ AI ENGINE SETUP (#146) ============
// First-run managed runtime download ("Setting up ClipFlow's AI engine").
// Only offered when whisperPythonPath is unset/dangling — getState decides.
ipcMain.handle("setup:getState", async () => {
  try { return { success: true, ...(await setupRuntime.getState(store)) }; }
  catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle("setup:start", async () => {
  try { return await setupRuntime.start(store, mainWindow?.webContents); }
  catch (err) { return { success: false, error: err.message, phase: "unknown" }; }
});

ipcMain.handle("setup:cancel", async () => {
  setupRuntime.cancel();
  return { success: true };
});

// #261: "Install to" picker on the setup screen — engine + model can go on
// any drive. Persists engineRoot; the renderer re-fetches state after.
ipcMain.handle("setup:chooseLocation", async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Choose where to install the AI engine",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return setupRuntime.setLocation(store, result.filePaths[0]);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ============ FFMPEG ============
ipcMain.handle("ffmpeg:checkInstalled", async () => {
  try { return await ffmpeg.checkFfmpeg(); }
  catch (err) { return { installed: false, error: err.message }; }
});

ipcMain.handle("ffmpeg:checkNvenc", async () => {
  try { return { available: await ffmpeg.checkNvenc() }; }
  catch (err) { return { available: false, error: err.message }; }
});

ipcMain.handle("ffmpeg:probe", async (_, filePath) => {
  try { return await ffmpeg.probe(filePath); }
  catch (err) { return { error: err.message }; }
});

// Resolve the user's clipCutEncoder setting once. Throws if the user picked
// "gpu" but NVENC is unavailable — caller surfaces the error to the user.
async function resolveClipCutEncoder() {
  return ffmpeg.resolveEncoder(store.get("clipCutEncoder") || "auto");
}

ipcMain.handle("ffmpeg:extractWaveformPeaks", async (_, filePath, peakCount) => {
  try {
    const audioTrack = store.get("transcriptionAudioTrack") ?? 0;
    return await ffmpeg.extractWaveformPeaks(filePath, peakCount || 400, audioTrack);
  }
  catch (err) { return { error: err.message, peaks: [] }; }
});

// ============ AUDIO TRACK CALIBRATION (#169) ============
// The wizard verifies which audio track is which by ear instead of guessing.
// Samples are extracted to a temp dir and played in the renderer via file://.

const AUDIO_CAL_SAMPLE_DIR = path.join(os.tmpdir(), "clipflow-audiocal");
const AUDIO_CAL_LABELS = ["voice", "game", "music", "comms", "mix", "browser", "other", "empty", "unknown"];

ipcMain.handle("audio:probeTracks", async (_, filePath) => {
  try {
    const info = await ffmpeg.probeAudioTracks(filePath);
    return { success: true, ...info };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle("audio:extractTrackSample", async (_, filePath, trackIndex, offsetFraction) => {
  try {
    const idx = Number.isInteger(trackIndex) && trackIndex >= 0 ? trackIndex : 0;
    const frac = [0.25, 0.5, 0.75].includes(offsetFraction) ? offsetFraction : 0.25;
    const info = await ffmpeg.probeAudioTracks(filePath);
    if (idx >= info.trackCount) return { error: `File has ${info.trackCount} audio tracks — track ${idx + 1} does not exist` };
    const sampleDuration = Math.min(20, Math.max(1, info.duration));
    const sampleStart = Math.max(0, Math.min(info.duration * frac, info.duration - sampleDuration));
    const fileKey = require("crypto").createHash("md5").update(filePath).digest("hex").slice(0, 10);
    const wavPath = path.join(AUDIO_CAL_SAMPLE_DIR, `${fileKey}-t${idx}-${Math.round(frac * 100)}.wav`);
    if (!fs.existsSync(wavPath)) {
      await ffmpeg.extractTrackSample(filePath, wavPath, idx, sampleStart, sampleDuration);
    }
    // #271: waveform peaks for the wizard's per-track lanes. The extracted WAV
    // is mono 16kHz/20s, so this is a sub-second pass; the wav itself is the
    // cache. peaks failure never blocks the sample — the lane just stays blank.
    let peaks = [];
    try { peaks = (await ffmpeg.extractWaveformPeaks(wavPath, 150, 0))?.peaks || []; } catch (_) {}
    return { success: true, samplePath: wavPath, sampleStart, sampleDuration, peaks };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle("audio:saveCalibration", async (_, setup) => {
  try {
    if (!setup || !Number.isInteger(setup.trackCount) || !Array.isArray(setup.tracks)) {
      return { error: "Invalid calibration data" };
    }
    const tracks = setup.tracks
      .filter((t) => Number.isInteger(t?.index) && AUDIO_CAL_LABELS.includes(t?.label))
      .map((t) => {
        const out = { index: t.index, label: t.label };
        // #271: user-typed name for "other" tracks. Optional, additive —
        // old setups without it stay valid, display falls back to label text.
        if (t.label === "other" && typeof t.customName === "string") {
          const name = t.customName.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 24);
          if (name) out.customName = name;
        }
        return out;
      });
    const voice = tracks.find((t) => t.label === "voice");
    if (!voice) return { error: "No track was labeled as your voice" };
    store.set("audioSetup", { trackCount: setup.trackCount, tracks, calibratedAt: new Date().toISOString() });
    store.set("transcriptionAudioTrack", voice.index);
    logger.info(logger.MODULES.system, `[audiocal] calibration saved: ${setup.trackCount} tracks, voice=track ${voice.index + 1}`);
    return { success: true, transcriptionAudioTrack: voice.index };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle("audio:cleanupSamples", async () => {
  try { fs.rmSync(AUDIO_CAL_SAMPLE_DIR, { recursive: true, force: true }); } catch (_) {}
  return { success: true };
});

// Calibration gate state — mirrors the askDegrade pattern. Single-flight so
// concurrent generateClips calls (batch / split children) share one wizard.
// A cancel suppresses re-asks for 60s so backing out of a batch doesn't
// re-prompt on every remaining file.
const pendingCalibrationAsks = new Map();
let calibrationAskInFlight = null;
let calibrationDeclinedAt = 0;

ipcMain.handle("audio:calibrationAnswer", async (_, requestId, completed) => {
  const resolve = pendingCalibrationAsks.get(requestId);
  if (resolve) {
    pendingCalibrationAsks.delete(requestId);
    if (!completed) calibrationDeclinedAt = Date.now();
    resolve({ completed: !!completed });
  }
  return { success: true };
});

/**
 * Gate a pipeline run on audio calibration (#169). Prompts the wizard when the
 * file is multi-track and no saved setup matches its track count. Returns
 * { ok: true } to proceed or { cancelled: true } when the user backed out.
 * Probe failures never block generation — the pipeline surfaces its own error.
 */
async function ensureAudioCalibrated(sourceFile) {
  let info;
  try { info = await ffmpeg.probeAudioTracks(sourceFile); } catch (_) { return { ok: true }; }
  if (info.trackCount <= 1) return { ok: true };
  const setup = store.get("audioSetup");
  if (setup && setup.trackCount === info.trackCount) return { ok: true };
  if (Date.now() - calibrationDeclinedAt < 60000) return { cancelled: true };

  if (!calibrationAskInFlight) {
    calibrationAskInFlight = new Promise((resolve) => {
      const requestId = `audiocal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pendingCalibrationAsks.set(requestId, resolve);
      mainWindow?.webContents.send("audio:calibrationNeeded", {
        requestId, filePath: sourceFile, trackCount: info.trackCount, hasExisting: !!setup,
      });
    }).finally(() => { calibrationAskInFlight = null; });
  }
  const answer = await calibrationAskInFlight;
  if (!answer?.completed) return { cancelled: true };

  // Re-check: the wizard may have calibrated a different file's layout.
  const after = store.get("audioSetup");
  if (after && after.trackCount === info.trackCount) return { ok: true };
  return { cancelled: true };
}

// ============ WAVEFORM CACHE (source-file preview) ============
// Phase 4: the editor reads waveform peaks from the full source recording.
// Extraction over a 30-min file is 1.5–6s the first time, so cache to disk keyed
// by {sourceFile path, mtime, size}. Subsequent opens read JSON instantly.
ipcMain.handle("waveform:extractCached", async (_, projectId, sourceFilePath, durationSec) => {
  const t0 = Date.now();
  logger.info(logger.MODULES.videoProcessing, `[waveform] start projectId=${projectId} file=${sourceFilePath} dur=${durationSec}`);
  try {
    const watchFolder = libraryRoot(); // project library (decoupled from the OBS watch folder)
    if (!watchFolder) {
      logger.warn(logger.MODULES.videoProcessing, `[waveform] failed: watch folder not set`);
      return { error: "Watch folder not set", peaks: [] };
    }
    if (!sourceFilePath || !fs.existsSync(sourceFilePath)) {
      logger.warn(logger.MODULES.videoProcessing, `[waveform] failed: source file not found path=${sourceFilePath}`);
      return { error: "Source file not found", peaks: [] };
    }

    const stat = fs.statSync(sourceFilePath);
    const mtimeMs = Math.floor(stat.mtimeMs);
    const sizeBytes = stat.size;

    // Scale peak count to duration — ~25 peaks/sec, capped at 100000.
    // A 30-min source = ~45000 peaks ≈ 360KB JSON.
    const dur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 60;
    const peakCount = Math.min(100000, Math.max(400, Math.ceil(dur * 25)));

    const cacheDir = path.join(projects.getProjectsRoot(watchFolder), projectId, ".waveforms");
    try {
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    } catch (mkErr) {
      logger.warn(logger.MODULES.videoProcessing, `[waveform] failed: cache dir mkdir error dir=${cacheDir} err=${mkErr.message}`);
      // Fall through — we can still extract, just skip caching.
    }
    const baseName = path.basename(sourceFilePath).replace(/[^\w.-]/g, "_");
    // v2: bucketing fix in extractWaveformPeaks — old caches were computed with
    // truncated buckets (misaligned waveform) and must not be reused.
    // #169: key includes the audio track — recalibrating must not serve peaks
    // extracted from the previously-configured track.
    const audioTrack = store.get("transcriptionAudioTrack") ?? 0;
    const cacheKey = `${baseName}.${mtimeMs}.${sizeBytes}.${peakCount}.t${audioTrack}.v2.json`;
    const cachePath = path.join(cacheDir, cacheKey);

    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
        if (Array.isArray(cached.peaks) && cached.peaks.length > 0) {
          logger.info(logger.MODULES.videoProcessing, `[waveform] cache hit peaks=${cached.peaks.length} ms=${Date.now() - t0}`);
          return { peaks: cached.peaks, cached: true };
        }
      } catch (_) { /* fall through — re-extract on parse failure */ }
    }

    logger.info(logger.MODULES.videoProcessing, `[waveform] extracting peakCount=${peakCount} track=${audioTrack}`);
    const result = await ffmpeg.extractWaveformPeaks(sourceFilePath, peakCount, audioTrack);
    if (result?.peaks?.length > 0) {
      logger.info(logger.MODULES.videoProcessing, `[waveform] extracted peaks=${result.peaks.length} ms=${Date.now() - t0}`);
      try {
        fs.writeFileSync(cachePath, JSON.stringify({ peaks: result.peaks, peakCount, mtimeMs, sizeBytes }), "utf-8");
      } catch (wErr) {
        logger.warn(logger.MODULES.videoProcessing, `[waveform] cache write failed (non-fatal): ${wErr.message}`);
      }
    } else {
      logger.warn(logger.MODULES.videoProcessing, `[waveform] extraction returned empty peaks ms=${Date.now() - t0}${result?.error ? ` err=${result.error}` : ""}`);
    }
    return { peaks: result.peaks || [], cached: false, error: result?.error };
  } catch (err) {
    logger.error(logger.MODULES.videoProcessing, `[waveform] failed: ${err.message} ms=${Date.now() - t0}`);
    return { error: err.message, peaks: [] };
  }
});

// ============ LOCATE SOURCE FILE (Media Offline recovery) ============
// Phase 4: when the OBS recording is moved/renamed after project creation,
// editor shows "Media Offline" and this IPC lets the user point to the new path.
ipcMain.handle("project:locateSource", async (_, projectId) => {
  try {
    const watchFolder = libraryRoot(); // project library (decoupled from the OBS watch folder)
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
        `INSERT INTO file_metadata (id, original_filename, current_filename, original_path, current_path, tag, entry_type, date, day_number, part_number, sub_part, custom_label, naming_preset, duration_seconds, file_size_bytes, status, split_from_id, split_timestamp_start, split_timestamp_end, is_test)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          sp.subPart || null,
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
    // #300: .mkv is accepted — the Rename tab converts it to a real MP4 on rename.
    if (ext !== ".mp4" && ext !== ".mkv") return { error: "Only .mp4 and .mkv files are supported" };

    // Build target path in monthly subfolder. Test imports land under the
    // testWatchFolder (or a "Test" sibling of the main folder if none is set)
    // so they don't pollute the real recording archive.
    const importRoot = testMode
      ? (store.get("testWatchFolder") || path.join(watchFolder, "Test"))
      : watchFolder;
    // Bucket by RECORDING date, not import date (#61). OBS filenames lead with
    // YYYY-MM-DD followed by space or underscore (e.g. "2026-03-23 13-33-07.mp4").
    // Fallbacks: file birthtime (unreliable for copies) → today.
    const filenameDateMatch = filename.match(/^(\d{4})-(\d{2})-(\d{2})[\s_]/);
    let monthFolder;
    if (filenameDateMatch) {
      monthFolder = `${filenameDateMatch[1]}-${filenameDateMatch[2]}`;
    } else {
      let bucketDate;
      try {
        const bt = fs.statSync(sourcePath).birthtime;
        bucketDate = bt && !isNaN(bt) ? bt : new Date();
      } catch { bucketDate = new Date(); }
      monthFolder = `${bucketDate.getFullYear()}-${String(bucketDate.getMonth() + 1).padStart(2, "0")}`;
    }
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

    // #263: imports have no process context — let the AI judge the footage.
    // Fire-and-forget; the result reaches the renderer via gameDetect:result.
    queueGameSniff(targetPath);

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

// ============ QUEUE IMPORTS (#240) ============
// Bulk-import finished pre-ClipFlow clips into the Queue. Logic lives in
// queue-imports.js; these are thin wrappers threading main.js-owned deps.
const queueImportsProgress = (data) => mainWindow?.webContents.send("queueImports:progress", data);

ipcMain.handle("queueImports:inspect", async (_, paths) => {
  try {
    return await queueImports.inspect({ store, paths });
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("queueImports:generate", async (_, rows) => {
  try {
    return await queueImports.generate({
      store,
      rows: rows || [],
      // Reuses the titlegen voice context (style guide + published examples) —
      // reads only; imports never WRITE into voice training (see the fences).
      voiceContext: buildTitleCaptionStoreContext({}),
      sendProgress: queueImportsProgress,
      getProcessingDir: () => store.get("processingDir") || aiPipeline.DEFAULT_PROCESSING_DIR,
    });
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("queueImports:cancelGenerate", async () => {
  try {
    return queueImports.cancelGenerate();
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("queueImports:confirm", async (_, payload) => {
  try {
    return await queueImports.confirm({
      store,
      watchFolder: libraryRoot(),
      items: payload?.items || [],
      skips: payload?.skips || [],
      sendProgress: queueImportsProgress,
    });
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

// ============ Lazy-cut helpers (#76) ============
// Recut/extend/concat handlers no longer re-encode MP4s. They mutate the
// clip's source-absolute boundaries (startTime/endTime) and nleSegments.
// The render path consumes nleSegments at publish time to produce the final
// MP4. This makes editor edits effectively instant (no NVENC encode per drag).

// ============ CONCAT RE-CUT (lazy: replace nleSegments) ============
ipcMain.handle("clip:concatRecut", async (_, projectId, clipId, segments) => {
  try {
    const watchFolder = libraryRoot(); // project library (decoupled from the OBS watch folder)
    if (!watchFolder) return { error: "Watch folder not set" };

    const project = projects.loadProject(watchFolder, projectId);
    if (!project) return { error: "Project not found" };

    const clip = (project.clips || []).find((c) => c.id === clipId);
    if (!clip) return { error: "Clip not found" };

    if (!segments || segments.length === 0) {
      return { error: "No segments provided for concat recut" };
    }

    const logger = require("electron-log/main").scope("editor");
    logger.debug("ConcatRecut (lazy)", { clipId, segmentCount: segments.length });

    const sorted = [...segments].sort((a, b) => a.start - b.start);
    const newSegs = sorted.map((s, i) => ({
      id: `seg-${clip.id}-${Date.now()}-${i}`,
      sourceStart: s.start,
      sourceEnd: s.end,
    }));

    const newDuration = newSegs.reduce((sum, s) => sum + (s.sourceEnd - s.sourceStart), 0);
    const newStart = newSegs[0].sourceStart;
    const newEnd = newSegs[newSegs.length - 1].sourceEnd;

    projects.updateClip(watchFolder, projectId, clipId, {
      startTime: newStart,
      endTime: newEnd,
      duration: newDuration,
      nleSegments: newSegs,
      transcription: null, // splice changed; per-clip transcription is stale
    });

    logger.debug("ConcatRecut success (lazy)", { duration: newDuration, segmentCount: newSegs.length });
    return {
      success: true,
      duration: newDuration,
      newStartTime: newStart,
      newEndTime: newEnd,
      nleSegments: newSegs,
    };
  } catch (err) {
    require("electron-log/main").scope("editor").error("ConcatRecut failed", { error: err.message });
    return { error: err.message };
  }
});

// ============ RE-TRANSCRIBE CLIP (lazy-cut: extract audio from source range) ============
ipcMain.handle("retranscribe:clip", async (_, projectId, clipId) => {
  try {
    const watchFolder = libraryRoot(); // project library (decoupled from the OBS watch folder)
    const project = projects.loadProject(watchFolder, projectId);
    if (!project) return { error: "Project not found" };

    const clip = (project.clips || []).find((c) => c.id === clipId);
    if (!clip) return { error: "Clip not found" };

    const sourceFile = project.sourceFile;
    if (!sourceFile || !fs.existsSync(sourceFile)) {
      return { error: "Source recording not found. Cannot retranscribe clip." };
    }

    const startSec = clip.startTime || 0;
    const endSec = clip.endTime || 0;
    if (!(endSec > startSec)) {
      return { error: `Invalid clip range: ${startSec}-${endSec}` };
    }

    // Step 1: Extract audio range from source (lazy-cut: no clip MP4 to read from)
    const clipsDir = projects.getClipsDir(watchFolder, projectId);
    if (!fs.existsSync(clipsDir)) fs.mkdirSync(clipsDir, { recursive: true });
    const safeId = String(clip.id).replace(/[^a-zA-Z0-9_-]/g, "_");
    const wavPath = path.join(clipsDir, `${safeId}-retranscribe.wav`);
    if (mainWindow) mainWindow.webContents.send("retranscribe:progress", { stage: "extracting", pct: 10 });
    const audioTrack = store.get("transcriptionAudioTrack") ?? 0;
    await ffmpeg.extractAudioRange(sourceFile, wavPath, startSec, endSec, audioTrack);

    // Step 2: Transcribe with whisperx
    if (mainWindow) mainWindow.webContents.send("retranscribe:progress", { stage: "transcribing", pct: 30 });
    const storeOpts = {
      pythonPath: store.get("whisperPythonPath") || "",
      model: store.get("whisperModel") || "large-v3-turbo",
      language: "en",
      batchSize: 16,
      computeType: "float16",
      hfToken: store.get("hfToken") || "",
      hfHome: store.get("hfHome") || appPaths.defaultHfHome(),
      onProgress: (pct) => {
        if (mainWindow) mainWindow.webContents.send("retranscribe:progress", { stage: "transcribing", pct: 30 + Math.floor(pct * 0.6) });
      },
    };
    const transcription = await whisper.transcribe(wavPath, storeOpts);

    // Step 3: Clean up temp wav
    try { fs.unlinkSync(wavPath); } catch (e) { /* ignore */ }

    // Step 4: Save clip-level transcription to project
    // #78: a fresh retranscription is the new source of truth — drop any editor-saved
    // sub1 (which now wins over clip.transcription on reopen) so the redo isn't defeated
    // by stale/polluted edits. Clearing _format makes the new transcription authoritative.
    if (mainWindow) mainWindow.webContents.send("retranscribe:progress", { stage: "saving", pct: 95 });
    const updates = { transcription, subtitles: { sub1: [], sub2: [] } };
    await projects.updateClip(watchFolder, projectId, clipId, updates);

    if (mainWindow) mainWindow.webContents.send("retranscribe:progress", { stage: "done", pct: 100 });
    return { success: true, transcription };
  } catch (err) {
    return { error: err.message };
  }
});

// ============ PROJECTS ============
ipcMain.handle("project:load", async (_, projectId) => {
  try {
    const watchFolder = libraryRoot(); // project library (decoupled from the OBS watch folder)
    const project = projects.loadProject(watchFolder, projectId);
    if (!project) return { error: "Project not found" };
    return { success: true, project };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle("project:updateTestMode", async (_, projectId, testMode) => {
  try {
    const watchFolder = libraryRoot(); // project library (decoupled from the OBS watch folder)
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
      const projList = projects.listProjects(libraryRoot());
      const matching = (projList.projects || []).find((p) => p.name === baseName || p.sourceFile === oldPath);
      if (matching) {
        projects.updateProjectField(libraryRoot(), matching.id, {
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
    const watchFolder = libraryRoot(); // project library (decoupled from the OBS watch folder)
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
          logger.info(logger.MODULES.system, `Reconciliation: reset ${resetCount} orphaned "done" file(s) with no matching project`);
        }
        if (doneChanged) store.set("doneRecordings", doneRecordings);
      }
    } catch (reconcileErr) { logger.warn(logger.MODULES.system, `Reconciliation failed: ${reconcileErr.message}`); }

    return result;
  } catch (err) { return { error: err.message, projects: [] }; }
});

ipcMain.handle("project:delete", async (_, projectId) => {
  try {
    const watchFolder = libraryRoot(); // project library (decoupled from the OBS watch folder)
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
        logger.info(logger.MODULES.system, `Reset file status after project deletion: file=${filename || "?"}, project=${result.projectName || "?"}`);
      }
    } catch (dbErr) { logger.warn(logger.MODULES.system, `Failed to reset file status after project deletion: ${dbErr.message}`); }
    return result;
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle("project:updateClip", async (_, projectId, clipId, updates) => {
  try {
    const watchFolder = libraryRoot(); // project library (decoupled from the OBS watch folder)
    // #239: a status change is a taste decision. Capture the prior status and
    // let the feedback DB react at this single choke point — every surface that
    // approves/rejects a clip funnels through this handler.
    const isStatusChange = Object.prototype.hasOwnProperty.call(updates || {}, "status");
    const before = isStatusChange ? projects.loadProject(watchFolder, projectId) : null;
    const prevStatus = before?.clips?.find((c) => c.id === clipId)?.status;
    const result = projects.updateClip(watchFolder, projectId, clipId, updates);
    if (isStatusChange && before && result?.clip) {
      try {
        feedbackDb.handleStatusTransition(before, prevStatus, result.clip);
      } catch (e) {
        // Non-critical: never block the clip update on a feedback write.
        console.error("[feedback] status transition failed:", e.message);
      }
    }
    return result;
  } catch (err) { return { error: err.message }; }
});

// #156/#182: the auto-fire scheduler must arbitrate through disk, not renderer
// memory, or a stale second instance re-posts a clip that's already out.
ipcMain.handle("project:claimScheduledPublish", async (_, projectId, clipId) => {
  try {
    const watchFolder = libraryRoot(); // project library (decoupled from the OBS watch folder)
    return projects.claimScheduledPublish(watchFolder, projectId, clipId);
  } catch (err) { return { claimed: false, reason: err.message }; }
});

ipcMain.handle("project:duplicateClip", async (_, projectId, clipId, overrides) => {
  try {
    const watchFolder = libraryRoot(); // project library (decoupled from the OBS watch folder)
    return projects.duplicateClip(watchFolder, projectId, clipId, overrides || {});
  } catch (err) { return { error: err.message }; }
});

// #306: Repost — copies a published clip (record + rendered file) into a fresh
// approved, unscheduled clip that the Queue can schedule like any other.
ipcMain.handle("project:repostClip", async (_, projectId, clipId) => {
  try {
    const watchFolder = libraryRoot(); // project library (decoupled from the OBS watch folder)
    return projects.repostClip(watchFolder, projectId, clipId);
  } catch (err) { return { error: err.message }; }
});

// Removes the clip record; deleteFile=true also unlinks the clip's own files
// (rendered MP4 + thumbnail + legacy pre-cut file). The project's source
// recording is never deleted. Default false — editor/rail callers keep
// record-only semantics; the Queue's explicit "delete from disk" opts in.
ipcMain.handle("project:deleteClip", async (_, projectId, clipId, deleteFile) => {
  try {
    const watchFolder = libraryRoot(); // project library (decoupled from the OBS watch folder)
    return projects.deleteClip(watchFolder, projectId, clipId, deleteFile === true);
  } catch (err) { return { error: err.message }; }
});

// Queue-scoped destructive option: delete ONLY the clip's rendered MP4 from
// disk and reset its render state. The clip record — and every hand edit on
// it — always survives. Exists so "remove from queue + delete the rendered
// video" can never destroy project data (session 123 data-loss lesson).
// The thumbnail is kept for list identity.
ipcMain.handle("project:deleteClipRender", async (_, projectId, clipId) => {
  try {
    const watchFolder = libraryRoot(); // project library (decoupled from the OBS watch folder)
    const project = projects.loadProject(watchFolder, projectId);
    if (!project) return { error: "Project not found" };
    const clip = (project.clips || []).find((c) => c.id === clipId);
    if (!clip) return { error: "Clip not found" };
    if (clip.renderPath && fs.existsSync(clip.renderPath)) {
      try { fs.unlinkSync(clip.renderPath); }
      catch (e) { return { error: `Could not delete rendered file: ${e.message}` }; }
    }
    return projects.updateClip(watchFolder, projectId, clipId, { renderPath: null, renderStatus: "pending" });
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle("project:updateReframe", async (_, projectId, reframe) => {
  try {
    const watchFolder = libraryRoot(); // project library (decoupled from the OBS watch folder)
    return projects.updateReframe(watchFolder, projectId, reframe);
  } catch (err) { return { error: err.message }; }
});

// #164 Phase B: auto-detect layout boxes from the project's source video.
// Runs MediaPipe + the gate algorithm in a dedicated hidden window
// (reframe-detect.js); returns a rect proposal, never writes the project.
ipcMain.handle("reframe:detect", async (_, projectId) => {
  try {
    const watchFolder = libraryRoot(); // project library (decoupled from the OBS watch folder)
    const project = projects.loadProject(watchFolder, projectId);
    if (!project) return { error: "Project not found" };
    if (!project.sourceFile || !fs.existsSync(project.sourceFile)) {
      return { error: "Source video not found on disk" };
    }
    const proposal = await reframeDetect.runDetection(project.sourceFile);
    return { success: true, proposal };
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
  // #251: refuse before any work if a dependency is missing — a plain message
  // now beats a confusing failure 40% into a run.
  const deps = await depsCheck.checkDependencies(store);
  if (!deps.ok) {
    return { error: deps.issues.map((i) => `${i.title}. ${i.fix}`).join("\n\n") };
  }

  // #169: multi-track files must have a verified track layout before we
  // transcribe — otherwise subtitles may come from game audio or music.
  const calGate = await ensureAudioCalibrated(sourceFile);
  if (calGate.cancelled) {
    return { error: "Audio track setup was not completed — generation cancelled. Generate again to retry." };
  }

  const watchFolder = libraryRoot(); // pipeline writes projects into the library
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

  const result = await aiPipeline.runAIPipeline({
    sourceFile, gameData, watchFolder, store,
    sendProgress, sendSignalProgress, askDegrade,
    strictMode: store.get("strictMode") !== false,
  });
  // #248: a failed run pulses the feedback bubble and becomes the "last app
  // error" context on the next Problem report. The pre-flight refusals above
  // (deps missing, calibration cancelled) are deliberate non-triggers.
  if (result?.error) {
    feedbackReport.recordAppError("pipeline", result.error, mainWindow?.webContents);
  }
  return result;
});

// ============ FEEDBACK DATABASE ============
ipcMain.handle("feedback:updateReasons", async (_, payload) => {
  try {
    return feedbackDb.updateReasons(payload || {});
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle("feedback:approvalStats", async () => {
  try {
    return feedbackDb.getApprovalStats();
  } catch (err) { return { error: err.message, games: [] }; }
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
    // #175: log plain renames to rename_history so UNDO can actually revert
    // them. Split PARENT records pass noHistory (#264) — undoing one would
    // delete a file_metadata row the children's split_from_id points at and
    // put a raw-named file back in front of the watcher. Game-switch parents
    // pass identical paths (no move happened) — same effect.
    let historyId = null;
    if (!data.noHistory && data.originalPath && data.currentPath && data.originalPath !== data.currentPath) {
      historyId = uuid();
      db.run(
        `INSERT INTO rename_history (id, file_metadata_id, action, previous_filename, previous_path, new_filename, new_path, metadata_snapshot)
         VALUES (?, ?, 'rename', ?, ?, ?, ?, NULL)`,
        [historyId, id, data.originalFilename, data.originalPath, data.currentFilename, data.currentPath]
      );
    }
    database.save();
    // #263: the file has its real name now — its detection stamp is spent.
    evictDetectedGame(data.originalPath, data.currentPath);
    return { success: true, id, historyId };
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
        sql = "SELECT * FROM file_metadata WHERE tag = ? AND date = ? ORDER BY part_number ASC, length(sub_part) ASC, sub_part ASC";
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

// Recordings ↔ disk reconciliation (session 113): flag rows whose file was
// deleted outside the app, adopt renamed files that have no row. Runs every
// time the Recordings tab loads.
ipcMain.handle("metadata:reconcile", async () => {
  try {
    const result = await reconcile.run({
      store,
      roots: [libraryRoot(), store.get("watchFolder")],
      ffmpegProbe: async (fp) => {
        try { return await ffmpeg.probe(fp); } catch (e) { return null; }
      },
    });
    // Day-counter repair changed the store — push the fresh array to the
    // renderer, whose own gamesDb copy would otherwise persist stale counters
    // back on the next rename.
    if (result.repairedGames) {
      mainWindow?.webContents.send("gamesDb:changed", result.repairedGames);
    }
    return result;
  } catch (err) {
    return { missingIds: [], adopted: 0, errors: [err.message] };
  }
});

ipcMain.handle("metadata:removeMissing", async (_, ids) => {
  try { return reconcile.removeMissing(ids); }
  catch (err) { return { error: err.message, removed: 0 }; }
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

  // #175: plain renames undo by moving the file back to its original path
  // and dropping its library row — the watcher then re-detects the restored
  // raw file, so it returns to Pending as a real row. Strict about the file
  // actually being where the record says (no silent partial undo), and never
  // overwrites (#173).
  if (entry.action === "rename") {
    if (!fs.existsSync(entry.new_path)) {
      return { error: `"${entry.new_filename}" is no longer at its renamed location — it may have been moved or deleted` };
    }
    // #300: an MKV that was converted on rename can't go back into its old
    // container — those bytes are gone. Restore the raw OBS name carrying the
    // extension the file actually has now; the watcher re-detects either one.
    const restorePath = path.extname(entry.previous_path).toLowerCase() === path.extname(entry.new_path).toLowerCase()
      ? entry.previous_path
      : entry.previous_path.replace(/\.[^.\\/]+$/, path.extname(entry.new_path));
    if (fs.existsSync(restorePath)) {
      return { error: `A file named "${path.basename(restorePath)}" already exists at the original location — undo would overwrite it` };
    }
    fs.renameSync(entry.new_path, restorePath);
    db.run("DELETE FROM file_metadata WHERE id = ?", [entry.file_metadata_id]);
    db.run("UPDATE rename_history SET undone = 1 WHERE id = ?", [historyId]);
    database.save();
    return { success: true, restoredPath: restorePath };
  }

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

ipcMain.handle("preset:validateLabel", async (_, label) => {
  return namingPresets.validateLabel(label);
});

ipcMain.handle("preset:retroactiveRename", async (_, existingFile, triggeringHistoryId) => {
  try {
    return namingPresets.retroactiveRename(existingFile, triggeringHistoryId);
  } catch (err) { return { executed: false, error: err.message }; }
});

// ============ GAME PROFILES ============
ipcMain.handle("gameProfiles:get", async (_, gameTag) => {
  return gameProfiles.getProfile(gameTag);
});

ipcMain.handle("gameProfiles:updatePlayStyle", async (_, gameTag, playStyle, gameName) => {
  // #246: callers that can precede any pipeline run (Add Game wizard, first-
  // draft accept) pass the display name so a profile created here doesn't
  // get gameName = tag.
  if (gameName) gameProfiles.ensureProfile(gameTag, gameName);
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

// #192: mines kept clips (approved feedback + published rounds) from the DB —
// never raw session transcripts. Works with all project folders deleted.
ipcMain.handle("gameProfiles:generateUpdate", async (_, gameTag) => {
  const creatorName = (store.get("creatorProfile") || {}).name;
  return gameProfiles.generateProfileUpdate(gameTag, { creatorName });
});

// ============ GAME ART (Projects-tab tile posters) ============
ipcMain.handle("gameArt:list", async () => {
  return gameArt.listArt(store.get("gamesDb") || []);
});

ipcMain.handle("gameArt:fetch", async (_, name) => {
  const result = await gameArt.fetchSteamArt(name);
  if (result.ok) mainWindow?.webContents.send("gameArt:changed");
  return result;
});

ipcMain.handle("gameArt:setFile", async (_, name, filePath) => {
  const result = gameArt.setArtFromFile(name, filePath);
  if (result.ok) mainWindow?.webContents.send("gameArt:changed");
  return result;
});

ipcMain.handle("gameArt:clear", async (_, name) => {
  gameArt.clearArt(name);
  mainWindow?.webContents.send("gameArt:changed");
  return { ok: true };
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

// #301: the renderer decides whether AI is available and what Settings shows,
// but must never hold the bundled token — holding it is what let a copy get
// persisted and outrank the build. So it gets the one bit it actually needs:
// whether this build carries a token at all. The value stays in main.
ipcMain.handle("ai:gatewayInfo", () => {
  return { hasBundledToken: Boolean(appPaths.bundledGatewayToken()) };
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

// Build the shared store-derived context (style guide, pick/reject history,
// game knowledge) for the title/caption prompts. Reused by generate + the
// single-card rephrase/regenerate handlers (#85).
function buildTitleCaptionStoreContext(params = {}) {
  const styleGuide = store.get("styleGuide") || "";
  const history = store.get("titleCaptionHistory") || [];

  // #183: the past-PICKS list is gone. It's superseded by voiceExamples, which
  // reads what actually got published (including the hand-written titles a pick
  // list can't see) instead of what was merely clicked. Rejections stay —
  // "don't write like this" is signal the published set doesn't carry.
  const rejects = history.filter((h) => h.type === "reject").slice(-20);

  let styleHistory = "";
  if (rejects.length > 0) {
    styleHistory += "\n\n---\n\n## Rejected by this creator (do not write anything like these):\n";
    rejects.forEach((r, i) => {
      styleHistory += `${i + 1}. ${r.titleRejected ? `Title: "${r.titleRejected}"` : `Caption: "${r.captionRejected}"`}${r.game ? ` [${r.game}]` : ""}\n`;
    });
  }

  let gameContext = "";
  if (params.gameContextAuto) gameContext += `\n\n## Game Knowledge (auto-researched):\n${params.gameContextAuto}`;
  if (params.gameContextUser) gameContext += `\n\n## Creator's Play Style for ${params.gameName}:\n${params.gameContextUser}`;

  // The few-shot voice set — real published copy, best-performing first.
  // Rows store whatever the publish path had to hand, which for backfilled
  // ones is the lowercase tracker tag ("rl"). Resolve to the display name so
  // the prompt reads "[Rocket League]" instead of "[rl]".
  const gamesDb = store.get("gamesDb") || [];
  const resolveGameName = (g) => {
    if (!g) return "";
    const needle = String(g).toLowerCase();
    const hit = gamesDb.find((entry) =>
      (entry.tag || "").toLowerCase() === needle ||
      (entry.hashtag || "").toLowerCase() === needle ||
      (entry.name || "").toLowerCase() === needle
    );
    return hit?.name || g;
  };
  const voiceExamples = titleCaptionLog
    .getVoiceExamples(20)
    .map((e) => ({ ...e, game: resolveGameName(e.game) }));

  // #223: the per-game hashtag lives in gamesDb but never reached the prompt —
  // the model was guessing, and fell back to "#gaming" for games it couldn't
  // infer from context (no research, no publish history).
  const activeGame = gamesDb.find((g) => g.name === params.gameName);
  const gameHashtag = activeGame?.hashtag || "";

  return { styleGuide, styleHistory, gameContext, voiceExamples, gameHashtag };
}

// #183 Phase 1: give the title/caption model actual stills from the clip.
//
// Until now it only ever saw the transcript, which is why suggestions went
// blank on clips where the interesting thing is visual and nobody narrates it.
// Detection has sent frames since #85 (ai-prompt.js buildUserContent) — this
// closes the same gap on the generation side.
//
// Samples across the clip's real cut window (nleSegments if the clip has been
// edited, otherwise start/end) so a trimmed-out middle isn't described back.
// Best-effort throughout: any failure returns [] and generation proceeds on
// the transcript alone, exactly as before.
const FRAME_COUNT = 4;

async function collectClipFrames({ projectId, clipId }) {
  if (!projectId || !clipId) return [];
  try {
    const project = projects.loadProject(libraryRoot(), projectId);
    if (!project?.sourceFile || !fs.existsSync(project.sourceFile)) return [];
    const clip = (project.clips || []).find((c) => c.id === clipId);
    if (!clip) return [];

    // Build the list of source ranges actually present in the clip.
    const segs = Array.isArray(clip.nleSegments) && clip.nleSegments.length > 0
      ? clip.nleSegments
          .map((s) => ({ start: Number(s.sourceStart), end: Number(s.sourceEnd) }))
          .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
      : [{ start: Number(clip.startTime), end: Number(clip.endTime) }];
    const valid = segs.filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start);
    if (valid.length === 0) return [];

    const total = valid.reduce((sum, s) => sum + (s.end - s.start), 0);
    if (total <= 0) return [];

    // Sample at the midpoint of each of FRAME_COUNT equal slices of clip time,
    // then map each back into source time across the segment list.
    const times = [];
    for (let i = 0; i < FRAME_COUNT; i++) {
      let offset = total * ((i + 0.5) / FRAME_COUNT);
      for (const s of valid) {
        const len = s.end - s.start;
        if (offset <= len) { times.push(s.start + offset); break; }
        offset -= len;
      }
    }
    if (times.length === 0) return [];

    const outDir = path.join(app.getPath("userData"), "processing", "frames", "titlecaption", clipId);
    const stills = await ffmpeg.extractClipStills(project.sourceFile, times, outDir);

    return stills.map((s, i) => ({
      base64: fs.readFileSync(s.path).toString("base64"),
      label: `Frame ${i + 1} of ${stills.length}:`,
    }));
  } catch (err) {
    logger.warn(logger.MODULES.titleGeneration, "Clip frame extraction failed", { clipId, error: err.message });
    return [];
  }
}

// #193: give the title/caption model the actual clip — a temp 720p cut of the
// clip range (audio included) sent to Gemini with the SAME voice prompt the
// frames path uses. The input was the gap, not the prompt. Throws on any
// failure; the caller falls back to the frames path, so generation never
// blocks on Gemini being down. The temp cut is deleted success or failure.
async function generateTitlesWithGeminiVideo({ params, systemPrompt }) {
  const { projectId, clipId } = params;
  if (!projectId || !clipId) throw new Error("Missing projectId/clipId");
  const project = projects.loadProject(libraryRoot(), projectId);
  if (!project?.sourceFile || !fs.existsSync(project.sourceFile)) throw new Error("Source video not found");
  const clip = (project.clips || []).find((c) => c.id === clipId);
  if (!clip) throw new Error("Clip not found");

  // Cut window: the union range of the edited segments (nleSegments), else the
  // detected start/end — same source-range logic collectClipFrames samples.
  const segs = Array.isArray(clip.nleSegments) && clip.nleSegments.length > 0
    ? clip.nleSegments.map((s) => ({ start: Number(s.sourceStart), end: Number(s.sourceEnd) }))
    : [{ start: Number(clip.startTime), end: Number(clip.endTime) }];
  const valid = segs.filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start);
  if (valid.length === 0) throw new Error("Clip has no valid cut range");
  const start = Math.min(...valid.map((s) => s.start));
  const end = Math.max(...valid.map((s) => s.end));

  const previewDir = path.join(app.getPath("userData"), "processing", "titlecaption-preview");
  fs.mkdirSync(previewDir, { recursive: true });
  const previewPath = path.join(previewDir, `${clipId}.mp4`);

  try {
    await ffmpeg.cutTitlePreview(project.sourceFile, previewPath, { start, duration: end - start });

    // Same user message as the frames path, minus frames — the video replaces them.
    const baseText = titleCaptionPrompt.buildUserContent({
      transcript: params.transcript,
      gameName: params.gameName,
      projectName: params.projectName,
      userContext: params.userContext,
      energyLevel: params.energyLevel,
      confidence: params.confidence,
      rejectedSuggestions: params.rejectedSuggestions,
    });
    const content = [
      { type: "text", text: baseText },
      {
        type: "text",
        text: "\n## The clip itself is attached as video, with sound.\nWatch it to see what the transcript can't say — what is on screen, what the moment looks and sounds like. Do not describe the video; use it to know what happened.\nPerspective check: the gameplay is recorded from the creator's own point of view (the camera follows THEIR player), and the facecam is their reaction. Before writing, decide WHO made the play — the creator, a teammate, or an opponent (on-screen banners name the scorer; a goal against the creator's own net happened TO them). Never credit the creator with someone else's play; when it happened to them, the hook is the reaction.\nPayoff check: you can SEE how the clip ends — before keeping any line, confirm the footage actually delivers what the line promises. A promise the footage doesn't cash is banned; pick a line the clip can keep.",
      },
      { type: "video", path: previewPath, mimeType: "video/mp4" },
    ];

    const model = geminiProvider.defaultModel;
    // 8000, not the Claude path's 2000: Gemini 3.x thinks by default and the
    // thoughts spend from the same output budget — 2000 can truncate to empty.
    const { text, usage } = await geminiProvider.chat({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content }],
      maxTokens: 8000,
    });
    if (!text) throw new Error("Empty response from Gemini");

    // The Gemini spend is new money — write a cost log entry so the monthly
    // total in Settings stays honest. Best-effort, never fails the generate.
    try {
      const processingDir = store.get("processingDir") || aiPipeline.DEFAULT_PROCESSING_DIR;
      const costLogger = new pipelineLogger.PipelineLogger(processingDir, `titlegen ${params.projectName || projectId}`);
      costLogger.info(`Gemini video title generation (#193) — clip ${clipId}, ${(end - start).toFixed(1)}s preview`);
      costLogger.logApiUsage(usage.inputTokens, usage.outputTokens, model);
      costLogger.finalize();
    } catch (e) {
      logger.warn(logger.MODULES.titleGeneration, "Could not write Gemini cost log", { error: e.message });
    }

    return text;
  } finally {
    try { if (fs.existsSync(previewPath)) fs.unlinkSync(previewPath); } catch (e) { /* non-critical */ }
  }
}

// Generate titles & captions for a clip
ipcMain.handle("anthropic:generate", async (_, params) => {
  try {
    const { styleGuide, styleHistory, gameContext, voiceExamples, gameHashtag } = buildTitleCaptionStoreContext(params);

    // Voice-led prompt (#183 — replaces the #85 pillars/drivers framework).
    // Reasoning in src/main/data/caption-frameworks.md; rules and cold-start
    // examples in src/main/data/caption-hook-examples.json. The examples that
    // matter come from the title_caption_rounds table, not this file.
    const systemPrompt = titleCaptionPrompt.buildSystemPrompt({
      styleGuide,
      gameContext,
      styleHistory,
      voiceExamples,
      gameHashtag,
    });

    // #193: Gemini sees the clip video when it can authenticate (raw key, or
    // gateway BYOK per #249); the frames path is the fallback for
    // no-credentials, cut failure, or API failure.
    let text = null;
    let genSource = "frames";
    if (geminiProvider.isConfigured()) {
      try {
        text = await generateTitlesWithGeminiVideo({ params, systemPrompt });
        genSource = "gemini-video";
      } catch (err) {
        logger.warn(logger.MODULES.titleGeneration, "Gemini video generation failed — falling back to frames", {
          clipId: params.clipId, error: err.message,
        });
      }
    }

    if (!text) {
      const frames = await collectClipFrames({ projectId: params.projectId, clipId: params.clipId });

      const userMessage = titleCaptionPrompt.buildUserContent({
        transcript: params.transcript,
        gameName: params.gameName,
        projectName: params.projectName,
        userContext: params.userContext,
        energyLevel: params.energyLevel,
        confidence: params.confidence,
        rejectedSuggestions: params.rejectedSuggestions,
        frames,
      });

      const provider = llmProvider.getProvider();
      ({ text } = await provider.chat({
        model: provider.defaultModel,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        maxTokens: 2000,
      }));
    }

    if (!text) return { error: "Empty response from LLM provider" };

    // Robust JSON extraction — handles fences, preamble, etc.
    try {
      const parsed = aiPrompt.extractJSON(text, "object");
      // #183: persist what was offered so publish time can compare it against
      // what actually shipped. Best-effort — never fail a generate over it.
      titleCaptionLog.recordGeneration({
        clipId: params.clipId,
        projectId: params.projectId,
        game: params.gameName,
        transcript: params.transcript,
        suggestions: parsed,
        genSource,
      });
      return { success: true, data: parsed };
    } catch (e) {
      return { error: `Failed to parse AI response as JSON: ${e.message}`, raw: text };
    }
  } catch (err) {
    return { error: err.message };
  }
});

// #183: record what actually shipped for a clip. Fired once per clip from the
// Queue when every enabled platform has published — including when the creator
// typed their own title and never touched a suggestion, which is exactly the
// case the old publish log couldn't see.
ipcMain.handle("titleCaptionLog:recordPublish", async (_, params = {}) => {
  try {
    let transcript = params.transcript || "";
    // The renderer's clip list is stripped of transcription (projects.js:172),
    // so read it off disk here rather than shipping it through IPC twice.
    if (!transcript && params.projectId && params.clipId) {
      try {
        const proj = projects.loadProject(libraryRoot(), params.projectId);
        const clip = (proj?.clips || []).find((c) => c.id === params.clipId);
        const segs = clip?.transcription?.segments || [];
        transcript = segs.map((s) => s.text).join(" ").trim();
      } catch (_) { /* transcript is a nice-to-have, not required */ }
    }
    titleCaptionLog.recordPublish({ ...params, transcript });
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

// #183 Phase 4: pull YouTube view counts back onto the training rows so the
// few-shot examples can be ranked by what actually performed rather than by
// how recently it was posted. The video ids were already being stored in
// trackerData.platformResults on every publish — nothing new is collected.
//
// Read-only, own-channel, and throttled to once a day. Returns counts rather
// than throwing so a disconnected account degrades to "no ranking data".
async function refreshYoutubeViews() {
  const pending = titleCaptionLog.getRowsNeedingViews();
  if (pending.length === 0) return { updated: 0, skipped: 0 };

  // clipId → YouTube video id, from the tracker rows written at publish time.
  const videoIdByClip = new Map();
  for (const row of store.get("trackerData") || []) {
    if (!row?.clipId || !Array.isArray(row.platformResults)) continue;
    const yt = row.platformResults.find((p) => p?.platform === "youtube" && p.postId);
    if (yt) videoIdByClip.set(row.clipId, yt.postId);
  }

  const targets = pending
    .map((r) => ({ clipId: r.clip_id, videoId: videoIdByClip.get(r.clip_id) }))
    .filter((t) => t.videoId);
  if (targets.length === 0) return { updated: 0, skipped: pending.length };

  const account = (tokenStore.getAllAccounts() || []).find((a) => a.platform === "youtube");
  if (!account) return { updated: 0, skipped: targets.length, error: "No YouTube account connected" };

  let accessToken = account.accessToken;
  if (account.expiresAt && Date.now() > account.expiresAt) {
    const clientId = store.get("youtubeClientId");
    const clientSecret = store.get("youtubeClientSecret");
    if (!clientId || !clientSecret || !account.refreshToken) {
      return { updated: 0, skipped: targets.length, error: "YouTube token expired — reconnect in Settings" };
    }
    const r = await youtubeOAuth.refreshAccessToken(clientId, clientSecret, account.refreshToken);
    if (r.error || !r.access_token) {
      return { updated: 0, skipped: targets.length, error: "YouTube token refresh failed" };
    }
    tokenStore.updateTokens(account.id, r.access_token, account.refreshToken, Date.now() + (r.expires_in || 3600) * 1000);
    accessToken = r.access_token;
  }

  let updated = 0;
  // videos.list caps `id` at 50 per request.
  for (let i = 0; i < targets.length; i += 50) {
    const batch = targets.slice(i, i + 50);
    const stats = await youtubeOAuth.fetchVideoStats(accessToken, batch.map((t) => t.videoId));
    for (const t of batch) {
      const views = stats[t.videoId];
      if (Number.isFinite(views)) { titleCaptionLog.recordViews(t.clipId, views); updated++; }
    }
  }
  return { updated, skipped: targets.length - updated };
}

ipcMain.handle("titleCaptionLog:refreshViews", async () => {
  try {
    const result = await refreshYoutubeViews();
    store.set("titleCaptionViewsRefreshedAt", Date.now());
    return { success: true, data: result };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("titleCaptionLog:getStats", async () => {
  try {
    return { success: true, data: titleCaptionLog.getStats() };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("titleCaptionLog:getExamples", async (_, limit) => {
  try {
    return { success: true, data: titleCaptionLog.getVoiceExamples(limit || 20) };
  } catch (err) {
    return { error: err.message };
  }
});

// Rephrase or regenerate a SINGLE title/caption card (#85 Chunk A).
// mode: "rephrase" (same hook/meaning, reworded) | "regenerate" (new angle).
// Returns one card object: { title|caption, chip }.
async function handleSingleCard(mode, params) {
  try {
    const kind = params.kind === "caption" ? "caption" : "title";
    const { styleGuide, styleHistory, gameContext, voiceExamples, gameHashtag } = buildTitleCaptionStoreContext(params);

    const systemPrompt = titleCaptionPrompt.buildSingleSystemPrompt({
      mode, kind, styleGuide, gameContext, styleHistory, voiceExamples, gameHashtag,
    });
    const userMessage = titleCaptionPrompt.buildSingleUserContent({
      kind,
      currentText: params.currentText,
      otherOptions: params.otherOptions,
      transcript: params.transcript,
      gameName: params.gameName,
      projectName: params.projectName,
      userContext: params.userContext,
    });

    const provider = llmProvider.getProvider();
    const { text } = await provider.chat({
      model: provider.defaultModel,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 500,
    });

    if (!text) return { error: "Empty response from LLM provider" };
    try {
      const parsed = aiPrompt.extractJSON(text, "object");
      return { success: true, data: parsed };
    } catch (e) {
      return { error: `Failed to parse AI response as JSON: ${e.message}`, raw: text };
    }
  } catch (err) {
    return { error: err.message };
  }
}

ipcMain.handle("anthropic:rephraseOption", async (_, params) => handleSingleCard("rephrase", params));
ipcMain.handle("anthropic:regenerateOption", async (_, params) => handleSingleCard("regenerate", params));

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
  const watchFolder = store.get("watchFolder"); // test-output fallback root only
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
      const fresh = projects.loadProject(libraryRoot(), projectData.id);
      if (fresh?.testMode === true) testMode = true;
    } catch (_) { /* non-critical */ }
  }

  if (testMode) {
    const testRoot = store.get("testWatchFolder") || path.join(watchFolder || "", "Test");
    return path.join(testRoot, "Corva Renders");
  }
  return store.get("outputFolder");
}

// ── Render job queue ──────────────────────────────────────────────────
// Renders are SERIALIZED: render.js tracks exactly one active render (cancel
// handle + offscreen overlay window), so concurrent render:clip invokes must
// never overlap. Jobs run FIFO; each invoke resolves with its own result when
// its job finishes. Every progress event is tagged {clipId, clipTitle,
// waiting, waitingIds} so the renderer can show "Rendering X — N waiting" and
// per-clip button states, and cancel can target the current OR a waiting job.
const renderQueue = []; // waiting jobs
let renderCurrentJob = null; // job whose render is live right now
let renderDraining = false;

function renderQueueSnapshot() {
  return { waiting: renderQueue.length, waitingIds: renderQueue.map((j) => j.clipId) };
}

function sendRenderProgress(p) {
  mainWindow?.webContents.send("render:progress", p);
}

async function drainRenderQueue() {
  if (renderDraining) return;
  renderDraining = true;
  while (renderQueue.length > 0) {
    const job = renderQueue.shift();
    renderCurrentJob = job;
    await job.run();
    renderCurrentJob = null;
  }
  renderDraining = false;
}

// The actual per-clip render work (unchanged logic: render → thumbnail →
// project update), with all progress routed through `emit`.
async function doRenderClip(clipData, projectData, outputPath, options, emit) {
  try {
    const result = await render.renderClip(clipData, projectData, outputPath, {
      subtitleStyle: options?.subtitleStyle || {},
      captionStyle: options?.captionStyle || {},
      captionSegments: options?.captionSegments || [],
      encoder: options?.encoder,
      onProgress: emit,
    });

    // #140: user canceled mid-render — nothing to thumbnail or mark rendered.
    if (result?.canceled) {
      emit({ stage: "canceled" });
      return { canceled: true };
    }

    // Extract thumbnail from rendered clip. #205: it lives in the project's own
    // clips folder, NOT beside the MP4 — the output folder is a folder the user
    // browses, and a jpg per render buried it. Keyed by clip id (like the repair
    // thumbnails) so two same-titled clips can't collide and a retitle never has
    // to move it.
    const watchFolder = libraryRoot(); // project library (decoupled from the OBS watch folder)
    let thumbnailPath = null;
    if (projectData?.id && clipData?.id) {
      try {
        const clipsDir = projects.getClipsDir(watchFolder, projectData.id);
        fs.mkdirSync(clipsDir, { recursive: true });
        thumbnailPath = path.join(clipsDir, `${clipData.id}_renderthumb.jpg`);
        await ffmpeg.generateThumbnail(result.path, thumbnailPath, 1);
      } catch (e) {
        console.warn("[render] Thumbnail extraction failed:", e.message);
        thumbnailPath = null;
      }
    }

    // Update clip renderStatus in project JSON
    if (projectData?.id && clipData?.id) {
      try {
        projects.updateClip(watchFolder, projectData.id, clipData.id, {
          renderStatus: "rendered",
          renderPath: result.path,
          thumbnailPath,
        });
      } catch (e) { /* non-critical */ }
    }

    // Terminal lifecycle event — the app-level floating render pill (App.js)
    // survives editor unmounts, so it needs an explicit done/error/canceled
    // signal rather than inferring completion from the invoke resolving.
    emit({ stage: "done", pct: 100, detail: "Done!" });
    return { ...result, thumbnailPath };
  } catch (err) {
    console.error("[render] Render failed:", err.message, err.stack);
    emit({ stage: "error", detail: err.message });
    return { error: err.message };
  }
}

// Enqueue one render job. Resolves with the job's result when it completes
// (or immediately-ish with {canceled:true} if it's removed while waiting).
// emitWrap lets the batch path remap per-clip pct into overall batch pct.
function enqueueRenderJob(clipData, projectData, outputPath, options, emitWrap) {
  return new Promise((resolve) => {
    const meta = { clipId: clipData?.id ?? null, clipTitle: clipData?.title || "" };
    const baseEmit = (p) => sendRenderProgress({ ...p, ...meta, ...renderQueueSnapshot() });
    const emit = emitWrap ? emitWrap(baseEmit) : baseEmit;
    const job = {
      ...meta,
      canceledWhileWaiting: false,
      run: async () => {
        if (job.canceledWhileWaiting) {
          resolve({ canceled: true });
          return;
        }
        // outputPath may be a resolver function (#181): evaluated at run time,
        // not enqueue time, so a batch of same-named clips sees each prior
        // file on disk and suffixes instead of overwriting.
        const resolvedPath = typeof outputPath === "function" ? outputPath() : outputPath;
        resolve(await doRenderClip(clipData, projectData, resolvedPath, options, emit));
      },
    };
    renderQueue.push(job);
    sendRenderProgress({ stage: "queued", ...meta, ...renderQueueSnapshot() });
    drainRenderQueue();
  });
}

// #181: render outputs are scoped per project. Filenames derive from the clip
// title — which is the default label ("Clip 3") until the user titles it — so
// two projects, or a duplicated clip, can share a name. In the old flat output
// folder they silently overwrote each other's files, and deleteClipRender then
// removed the shared file out from under every other clip pointing at it
// (failed scheduled publish + wrong-game thumbnail, 2026-07-24).
function renderOutputDir(outputFolder, projectData) {
  const dir = projectData?.name
    ? path.join(outputFolder, String(projectData.name).replace(/[<>:"\/\\|?*]/g, "_"))
    : outputFolder;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Collision guard on top of the project subfolder: if the target name is
// taken and it isn't this clip's OWN current renderPath, suffix " (2)"… —
// a clip re-rendering onto its own file still overwrites in place.
function resolveRenderOutputPath(outputFolder, clipData, projectData) {
  const dir = renderOutputDir(outputFolder, projectData);
  // #188: same sanitize + collision helpers the title-change rename uses, so a
  // rendered name and a renamed name can never drift apart.
  const base = projects.sanitizeFileBase(clipData.title || `clip_${clipData.id}`);
  return projects.uniquePath(dir, base, ".mp4", clipData.renderPath);
}

// #189: the shorter dimension a fallback copy is scaled to, and the clip length past
// which Instagram is known to fail at full resolution (measured, not guessed — #185).
const LIGHT_COPY_SHORT_SIDE = 720;
const IG_LONG_CLIP_SEC = 55;

// #187/#189: write a lighter copy of an existing render for Instagram. Two callers —
// the manual "Send IG a 720p copy" button, and instagram:publish itself when Meta
// refuses the full-size file. The copy is temporary and discardLightCopy deletes it
// once the post lands. Renders themselves are never touched.
async function makeLightCopy(videoPath, shortSide = LIGHT_COPY_SHORT_SIDE) {
  try {
    if (!videoPath || !fs.existsSync(videoPath)) {
      return { error: "Rendered file not found — re-render the clip first." };
    }
    const info = await ffmpeg.probe(videoPath);
    const currentShort = Math.min(info.width || 0, info.height || 0);
    if (!currentShort) return { error: "Could not read the video's dimensions." };
    if (currentShort <= shortSide) {
      return { error: `This clip is already ${info.width}x${info.height} — a smaller copy wouldn't help.` };
    }
    const outPath = videoPath.replace(/\.mp4$/i, `.ig${shortSide}.mp4`);
    const encoder = await resolveClipCutEncoder();
    logger.info(logger.MODULES.system, `Making ${shortSide}p copy for Instagram: ${path.basename(videoPath)}`);
    await ffmpeg.transcodeCopy(videoPath, outPath, { shortSide, encoder });
    return { success: true, path: outPath };
  } catch (err) {
    logger.warn(logger.MODULES.system, `makeLightCopy failed: ${err.message}`);
    return { error: err.message };
  }
}

// Deletes only the temp copies made above — the filename pattern is the guard,
// so this can never be pointed at a real render.
function discardLightCopy(target) {
  if (!target || !/\.ig\d+\.mp4$/i.test(target)) return { error: "Not a light copy." };
  try {
    if (fs.existsSync(target)) fs.unlinkSync(target);
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
}

ipcMain.handle("clip:makeLightCopy", async (_, params = {}) => makeLightCopy(params.videoPath, params.shortSide || LIGHT_COPY_SHORT_SIDE));

ipcMain.handle("clip:discardLightCopy", async (_, params = {}) => discardLightCopy(params.path));

ipcMain.handle("render:clip", async (event, clipData, projectData, outputPath, options) => {
  try {
    // Determine output path if not provided
    if (!outputPath) {
      const outputFolder = resolveTestAwareOutputFolder(projectData);
      if (!outputFolder) return { error: "Output folder not configured. Go to Settings." };
      outputPath = () => resolveRenderOutputPath(outputFolder, clipData, projectData); // #181 lazy: resolved when the job runs
    }
    const encoder = await resolveClipCutEncoder();
    return await enqueueRenderJob(clipData, projectData, outputPath, { ...options, encoder });
  } catch (err) {
    console.error("[render:clip] Render failed:", err.message, err.stack);
    sendRenderProgress({ stage: "error", clipId: clipData?.id ?? null, detail: err.message, ...renderQueueSnapshot() });
    return { error: err.message };
  }
});

// Session 124: WYSIWYG viewer screenshot → Shorts thumbnail PNG. Same payload
// shape as render:clip plus the playhead time; runs a one-frame render through
// the real pipeline (reframe + overlay) so the PNG matches the final video.
ipcMain.handle("thumbnail:capture", async (event, clipData, projectData, timelineTime, options) => {
  try {
    const outputFolder = resolveTestAwareOutputFolder(projectData);
    if (!outputFolder) return { error: "Output folder not configured. Go to Settings." };
    // #188: base must match what the title-change rename produces, or a retitle
    // would orphan the PNG instead of moving it.
    const fileName = `${projects.sanitizeFileBase(clipData.title || `clip_${clipData.id}`)}_thumbnail.png`;
    // #181: same per-project scoping as renders. No collision suffix here —
    // recapturing the same clip's screenshot should overwrite its own PNG.
    const outputPath = path.join(renderOutputDir(outputFolder, projectData), fileName);
    return await render.renderThumbnail(clipData, projectData, timelineTime, outputPath, options || {});
  } catch (err) {
    console.error("[thumbnail:capture] failed:", err.message);
    return { error: err.message };
  }
});

// #140: cancel a render. No clipId (legacy) or the current job's clipId →
// abort the live render. A WAITING job's clipId → drop it from the queue and
// resolve its invoke as canceled (never touches the live render).
ipcMain.handle("render:cancel", (_, clipId) => {
  if (clipId == null || renderCurrentJob?.clipId === clipId) {
    return render.cancelActiveRender();
  }
  const idx = renderQueue.findIndex((j) => j.clipId === clipId);
  if (idx >= 0) {
    const [job] = renderQueue.splice(idx, 1);
    job.canceledWhileWaiting = true;
    job.run(); // resolves that invoke with { canceled: true }
    sendRenderProgress({ stage: "canceled", clipId: job.clipId, clipTitle: job.clipTitle, ...renderQueueSnapshot() });
    return { canceled: true };
  }
  return { canceled: false, reason: "no matching render" };
});

// Batch render — each clip is enqueued through the SAME render queue as
// single renders, so "Render All" and editor Queue jobs can never overlap
// (they interleave FIFO). Per-clip thumbnail + renderStatus writes happen in
// doRenderClip; per-clip pct is remapped to overall batch pct for the
// ProjectsView button, keeping its old display semantics.
ipcMain.handle("render:batch", async (event, clips, projectData, outputDir, options) => {
  try {
    if (!outputDir) {
      outputDir = resolveTestAwareOutputFolder(projectData);
      if (!outputDir) return { error: "Output folder not configured. Go to Settings." };
    }

    const encoder = await resolveClipCutEncoder();
    const total = clips.length;
    const results = [];
    for (let i = 0; i < total; i++) {
      const clip = clips[i];
      const outputPath = () => resolveRenderOutputPath(outputDir, clip, projectData); // #181 lazy: same-named clips suffix instead of overwrite
      const emitWrap = (baseEmit) => (p) => {
        if (p.stage === "subtitles" || p.stage === "rendering") {
          const overallPct = Math.round(((i + (p.pct || 0) / 100) / total) * 100);
          baseEmit({ ...p, pct: overallPct, detail: `Clip ${i + 1}/${total}: ${p.detail || ""}` });
        } else {
          // Terminal stages pass through untagged with batch pct — the last
          // clip's "done" is the batch's done.
          baseEmit(p);
        }
      };
      const result = await enqueueRenderJob(clip, projectData, outputPath, {
        subtitleStyle: options?.subtitleStyle || clip.subtitleStyle,
        captionStyle: options?.captionStyle || clip.captionStyle,
        captionSegments: clip.captionSegments || [],
        encoder,
      }, emitWrap);
      if (result?.error) results.push({ clipId: clip.id, success: false, error: result.error });
      else if (result?.canceled) results.push({ clipId: clip.id, success: false, error: "canceled" });
      else results.push({ clipId: clip.id, success: true, path: result.path });
    }

    return { success: true, results };
  } catch (err) {
    sendRenderProgress({ stage: "error", detail: err.message, ...renderQueueSnapshot() });
    return { error: err.message };
  }
});

// ============ OAUTH: Connected Accounts ============

// Get all connected accounts (safe for UI — no tokens)
ipcMain.handle("oauth:getAccounts", async () => {
  return tokenStore.getAccountsForUI();
});

// #244/#163: plain-language message for a dead connection — used by the
// pre-flight check and the publish-time refresh blocks.
const deadTokenError = (platform) =>
  `${platform} connection expired — reconnect the account in Settings, then retry.`;

// #244: generic OS toast. Renderer decides when to notify (scheduler owns the
// aggregation); main just shows it. Clicking focuses the app window.
ipcMain.handle("system:notify", (_, { title, body } = {}) => {
  try {
    if (!Notification.isSupported()) return { ok: false, error: "unsupported" };
    const n = new Notification({ title: String(title || "Corva"), body: String(body || "") });
    n.on("click", () => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    });
    n.show();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// #244 layer 1: pre-flight connection check ahead of scheduled slots.
// For YouTube/TikTok the liveness probe IS the token refresh their publish
// handler would run anyway (access tokens live 1h/24h, so at any scheduled slot
// a refresh is due — a dead refresh token surfaces here instead of at post
// time). Meta/IG long-lived tokens (~60 days) are only refreshed near expiry,
// so their pre-flight is usually a no-op by design; rarer Meta death modes are
// caught loudly at post time by layer 2.
async function preflightAccount(accountId) {
  const account = tokenStore.getAccount(accountId);
  if (!account) return { ok: false, error: "Account not found" };
  const log = require("electron-log/main").scope("preflight");
  try {
    if (account.platform === "YouTube") {
      const clientId = store.get("youtubeClientId");
      const clientSecret = store.get("youtubeClientSecret");
      if (!clientId || !clientSecret || !account.refreshToken) {
        tokenStore.setNeedsReconnect(accountId);
        return { ok: false, needsReconnect: true, error: deadTokenError("YouTube") };
      }
      const r = await youtubeOAuth.refreshAccessToken(clientId, clientSecret, account.refreshToken);
      if (r.error || !r.access_token) {
        log.warn("YouTube pre-flight refresh failed", { accountId, error: r.error });
        if (r.error === "invalid_grant") {
          tokenStore.setNeedsReconnect(accountId);
          return { ok: false, needsReconnect: true, error: deadTokenError("YouTube") };
        }
        return { ok: false, error: `Token refresh failed: ${r.error_description || r.error || "Unknown error"}` };
      }
      tokenStore.updateTokens(accountId, r.access_token, account.refreshToken, Date.now() + (r.expires_in || 3600) * 1000);
      return { ok: true };
    }
    if (account.platform === "TikTok") {
      const clientKey = store.get("tiktokClientKey");
      const clientSecret = store.get("tiktokClientSecret");
      if (!clientKey || !clientSecret || !account.refreshToken) {
        tokenStore.setNeedsReconnect(accountId);
        return { ok: false, needsReconnect: true, error: deadTokenError("TikTok") };
      }
      const r = await tiktokOAuth.refreshAccessToken(clientKey, clientSecret, account.refreshToken);
      if (r.error || !r.access_token) {
        log.warn("TikTok pre-flight refresh failed", { accountId, error: r.error });
        if (r.error === "invalid_grant" || r.error === "invalid_request") {
          tokenStore.setNeedsReconnect(accountId);
          return { ok: false, needsReconnect: true, error: deadTokenError("TikTok") };
        }
        return { ok: false, error: `Token refresh failed: ${r.error_description || r.error || "Unknown error"}` };
      }
      tokenStore.updateTokens(accountId, r.access_token, r.refresh_token || account.refreshToken, Date.now() + (r.expires_in || 86400) * 1000);
      return { ok: true };
    }
    // Meta family: refresh only when inside the pre-flight window of expiry.
    const nearExpiry = account.expiresAt && Date.now() > account.expiresAt - 60 * 60_000;
    if (!nearExpiry) return { ok: true, skipped: true };
    const platformName = account.platform === "Facebook" ? "Facebook" : "Instagram";
    if (account.loginType === "instagram_business_login") {
      const r = await instagramOAuth.refreshLongLivedToken(account.accessToken);
      if (r.error || !r.access_token) {
        log.warn("Instagram pre-flight refresh failed", { accountId, error: r.error });
        tokenStore.setNeedsReconnect(accountId);
        return { ok: false, needsReconnect: true, error: deadTokenError("Instagram") };
      }
      tokenStore.updateTokens(accountId, r.access_token, "", Date.now() + (r.expires_in || 5184000) * 1000);
      return { ok: true };
    }
    const appId = store.get("metaAppId");
    const appSecret = store.get("metaAppSecret");
    if (!appId || !appSecret) return { ok: false, needsReconnect: true, error: deadTokenError(platformName) };
    const r = await metaOAuth.refreshLongLivedToken(appId, appSecret, account.accessToken);
    if (r.error || !r.access_token) {
      log.warn("Meta pre-flight refresh failed", { accountId, error: r.error?.message || r.error });
      tokenStore.setNeedsReconnect(accountId);
      return { ok: false, needsReconnect: true, error: deadTokenError(platformName) };
    }
    tokenStore.updateTokens(accountId, r.access_token, "", Date.now() + (r.expires_in || 5184000) * 1000);
    return { ok: true };
  } catch (err) {
    // Network failure etc. — NOT a dead token; don't flag reconnect.
    log.warn("Pre-flight errored", { accountId, error: err.message });
    return { ok: false, error: err.message };
  }
}

ipcMain.handle("publish:preflight", async (_, { accountIds } = {}) => {
  const results = {};
  for (const accountId of accountIds || []) {
    results[accountId] = await preflightAccount(accountId);
  }
  return { results };
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

// Query TikTok creator info for the per-clip options panel.
// Returns the allowed privacy levels, *_disabled interaction flags,
// max_video_post_duration_sec, and capacity flag the UI needs to render
// guideline-compliant controls before publish.
ipcMain.handle("tiktok:queryCreatorInfo", async (_event, { accountId }) => {
  const log = require("electron-log/main").scope("tiktok");
  try {
    const account = tokenStore.getAccount(accountId);
    if (!account) return { error: "TikTok account not found. Please reconnect in Settings." };

    let accessToken = account.accessToken;
    if (account.expiresAt && Date.now() > account.expiresAt) {
      log.info("Token expired in queryCreatorInfo, refreshing");
      const clientKey = store.get("tiktokClientKey");
      const clientSecret = store.get("tiktokClientSecret");
      if (!clientKey || !clientSecret || !account.refreshToken) {
        return { error: "Cannot refresh TikTok token. Please reconnect in Settings." };
      }
      const r = await tiktokOAuth.refreshAccessToken(clientKey, clientSecret, account.refreshToken);
      if (r.error || !r.access_token) {
        return { error: `Token refresh failed: ${r.error_description || r.error || "Unknown error"}` };
      }
      tokenStore.updateTokens(
        accountId,
        r.access_token,
        r.refresh_token || account.refreshToken,
        Date.now() + (r.expires_in || 86400) * 1000,
      );
      accessToken = r.access_token;
    }

    const info = await tiktokPublish.queryCreatorInfo(accessToken);
    return { success: true, creatorInfo: info };
  } catch (err) {
    log.error("queryCreatorInfo failed", { error: err.message });
    return { error: err.message };
  }
});

ipcMain.handle("tiktok:publish", async (event, { accountId, videoPath, title, caption, clipId, postMode, isTest, tiktokFields, scheduled }) => {
  const logBase = { clipId: clipId || "", clipTitle: title || "", clipCaption: caption || "", platform: "TikTok", accountId, accountName: "", videoPath, ...(scheduled ? { scheduled: true } : {}) };
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
      const clientSecret = store.get("tiktokClientSecret");
      if (!clientKey || !clientSecret || !account.refreshToken) {
        const err = "Cannot refresh TikTok token. Please reconnect in Settings.";
        publishLog.logPublish({ ...logBase, status: "failed", error: err });
        return { error: err };
      }
      const refreshResult = await tiktokOAuth.refreshAccessToken(clientKey, clientSecret, account.refreshToken);
      require("electron-log/main").scope("tiktok").debug("Token refresh result", refreshResult);
      if (refreshResult.error || !refreshResult.access_token) {
        // #163: a dead refresh token means "reconnect", not "Bad Request".
        const dead = refreshResult.error === "invalid_grant" || refreshResult.error === "invalid_request";
        if (dead) tokenStore.setNeedsReconnect(accountId);
        const err = dead
          ? deadTokenError("TikTok")
          : `Token refresh failed: ${refreshResult.error_description || refreshResult.error || "Unknown error"}`;
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

    // Per-clip TikTok options collected via the export panel (guideline-compliant UX).
    // tiktokFields shape: { privacy, disableDuet, disableStitch, disableComment,
    //                        commercialDisclosure, isYourBrand, isBrandedContent }
    // All optional in transit; publishVideo enforces privacy presence for direct_post.
    const t = tiktokFields || {};
    const result = await tiktokPublish.publishVideo(
      accessToken,
      videoPath,
      {
        title: postCaption,
        privacy_level: t.privacy || null,
        disable_duet: t.disableDuet === true,
        disable_stitch: t.disableStitch === true,
        disable_comment: t.disableComment === true,
        brand_content_toggle: t.commercialDisclosure === true && t.isBrandedContent === true,
        brand_organic_toggle: t.commercialDisclosure === true && t.isYourBrand === true,
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
    return { error: translateTiktokPublishError(err.message) };
  }
});

// Translate raw TikTok API error messages into user-facing strings. Handles the
// guideline-mandated A8 (capacity) friendly message plus a few other common
// audit-related errors. Original message is preserved as fallback so unknown
// errors still surface verbatim instead of being masked.
function translateTiktokPublishError(msg) {
  if (!msg || typeof msg !== "string") return "TikTok publish failed.";
  const lower = msg.toLowerCase();
  // A8 — daily/posting capacity reached. TikTok signals this with various
  // codes; match by substring to catch them all.
  if (
    lower.includes("daily_quota_limit_exceeded") ||
    lower.includes("daily_post_limit") ||
    lower.includes("rate_limit_exceeded") ||
    lower.includes("posting_limit") ||
    lower.includes("quota_exceeded")
  ) {
    return "TikTok says this account has reached its posting limit — try again later.";
  }
  // Spam / temp ban — separate from capacity but related friendly framing.
  if (lower.includes("spam_risk") || lower.includes("user_banned_from_posting")) {
    return "TikTok has temporarily blocked this account from posting. Try again later or check your TikTok account status.";
  }
  // Unaudited client (the exact error this whole feature is meant to unblock).
  if (lower.includes("unaudited_client_can_only_post_to_private_accounts")) {
    return "TikTok hasn't audited this app yet — direct posting is locked to private. Submit the Content Posting API audit to unlock public posts.";
  }
  // Video duration / size violations.
  if (lower.includes("video_pull_failed") || lower.includes("invalid_param") && lower.includes("duration")) {
    return "TikTok rejected this video — it may be too long for your account, or in an unsupported format.";
  }
  return msg;
}

// ── Instagram OAuth (via Facebook Login) ──
//
// Despite the name, this authenticates the user via facebook.com — Instagram
// publishing through graph.facebook.com is the only path that supports
// resumable upload (the IG-direct path on graph.instagram.com does not). The
// user's IG must be linked to a Facebook Page they manage.

ipcMain.handle("oauth:instagram:connect", async () => {
  try {
    const appId = store.get("metaAppId");
    const appSecret = store.get("metaAppSecret");

    if (!appId || !appSecret) {
      return { error: "Meta App ID and App Secret must be configured in Settings before connecting Instagram." };
    }

    require("electron-log/main").scope("meta").info("Starting Instagram (via Facebook Login) OAuth flow");
    const accountData = await metaOAuth.startInstagramOAuthFlow(appId, appSecret);

    const accountId = `ig_${accountData.igAccountId}`;
    tokenStore.saveAccount(accountId, accountData);
    require("electron-log/main").scope("meta").info("IG account saved", { accountId, displayName: accountData.displayName });

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
        loginType: "facebook_login",
      },
    };
  } catch (err) {
    require("electron-log/main").scope("meta").error("Instagram OAuth connect failed", { error: err.message });
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
    const accountData = await metaOAuth.startFacebookOAuthFlow(appId, appSecret);

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

ipcMain.handle("instagram:publish", async (event, { accountId, videoPath, title, caption, clipId, isTest, qualityNote, scheduled }) => {
  // #187: qualityNote records when a lighter copy shipped instead of the render,
  // so a post's actual resolution is answerable later without guessing.
  const logBase = { clipId: clipId || "", clipTitle: title || "", clipCaption: caption || "", platform: "Instagram", accountId, accountName: "", videoPath, ...(qualityNote ? { qualityNote } : {}), ...(scheduled ? { scheduled: true } : {}) };
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

    // Infer login type when missing from older saved accounts (loginType wasn't persisted
    // by token-store before today's fix). IG Business Login accounts get the `ig_` prefix
    // on accountId from instagram-oauth.js; the publish handler MUST route their tokens to
    // graph.instagram.com or Meta returns "Cannot parse access token".
    let isIgLogin = account.loginType === "instagram_business_login";
    if (!account.loginType && account.platform === "Instagram" && String(accountId).startsWith("ig_")) {
      isIgLogin = true;
      tokenStore.setLoginType(accountId, "instagram_business_login");
      require("electron-log/main").scope("instagram").info("Backfilled loginType=instagram_business_login", { accountId });
    }
    require("electron-log/main").scope("instagram").info("Starting publish", { title, accountId, loginType: isIgLogin ? "ig_login" : "fb_login" });
    let accessToken = account.accessToken;

    // Check token expiry and refresh if needed
    if (account.expiresAt && Date.now() > account.expiresAt) {
      require("electron-log/main").scope("instagram").info("Token expired, refreshing");

      if (isIgLogin) {
        // Instagram Business Login tokens — refresh via graph.instagram.com
        const refreshResult = await instagramOAuth.refreshLongLivedToken(accessToken);
        if (refreshResult.error || !refreshResult.access_token) {
          // #163/#244: a long-lived token that won't refresh is dead — flag it.
          tokenStore.setNeedsReconnect(accountId);
          const err = deadTokenError("Instagram");
          publishLog.logPublish({ ...logBase, status: "failed", error: err, apiResponse: refreshResult });
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
          // #163/#244: a long-lived token that won't refresh is dead — flag it.
          tokenStore.setNeedsReconnect(accountId);
          const err = deadTokenError("Instagram");
          publishLog.logPublish({ ...logBase, status: "failed", error: err, apiResponse: refreshResult });
          return { error: err };
        }
        tokenStore.updateTokens(accountId, refreshResult.access_token, "", Date.now() + (refreshResult.expires_in || 5184000) * 1000);
        accessToken = refreshResult.access_token;
      }
    }

    const postCaption = caption || title || "";
    const onProgress = (progress) => { mainWindow?.webContents.send("instagram:publishProgress", progress); };
    const attempt = (file, uploadAttempts) => instagramPublish.publishReel(
      accessToken,
      account.igAccountId,
      file,
      { caption: postCaption, useIgGraph: isIgLogin, uploadAttempts },
      onProgress
    );

    // #189: Meta's upload endpoint gives itself ~35s to process a finished upload and
    // cannot clear a long 1080p clip inside it. Resolution is the only input that moves
    // the outcome — bitrate, frame rate, codec, edit lists and chunked upload were all
    // measured against the live API and ruled out (#185). So a long clip spends ONE
    // attempt on full quality rather than three (~1 min of known-failure instead of ~3)
    // and then falls back to a 720p copy on its own. Short clips are untouched: full
    // retry ladder, never downscaled.
    const info = await ffmpeg.probe(videoPath).catch(() => null);
    const sourceShortSide = info ? Math.min(info.width || 0, info.height || 0) : 0;
    const canDownscale = sourceShortSide > LIGHT_COPY_SHORT_SIDE;
    const isLongClip = (info?.duration || 0) > IG_LONG_CLIP_SEC;
    const sourceLabel = info?.width && info?.height ? `${info.width}x${info.height}` : "full quality";

    let result;
    let lightPath = null;
    let downscaled = false;
    try {
      result = await attempt(videoPath, canDownscale && isLongClip ? 1 : undefined);
    } catch (err) {
      // Only a processing-class failure is worth re-attempting smaller. Auth, account and
      // permission errors reject a 720p copy identically, so the encode would be wasted.
      if (!err.processingWall || !canDownscale) throw err;
      require("electron-log/main").scope("instagram").warn("Falling back to a lighter copy", { from: sourceLabel, to: `${LIGHT_COPY_SHORT_SIDE}p`, error: err.message });
      logger.warn(logger.MODULES.system, `Instagram refused ${sourceLabel} — retrying at ${LIGHT_COPY_SHORT_SIDE}p: ${path.basename(videoPath)}`);
      publishLog.logPublish({ ...logBase, status: "failed", error: err.message, qualityNote: `${sourceLabel} — Instagram could not process it` });
      onProgress({ stage: "retrying", pct: 10, detail: `Instagram couldn't process the full-size file — sending a ${LIGHT_COPY_SHORT_SIDE}p copy...` });

      const copy = await makeLightCopy(videoPath, LIGHT_COPY_SHORT_SIDE);
      if (copy.error) throw new Error(`${err.message} (the ${LIGHT_COPY_SHORT_SIDE}p fallback also failed: ${copy.error})`);
      lightPath = copy.path;
      downscaled = true;
      try {
        result = await attempt(lightPath, undefined);
      } catch (err2) {
        // Without this the surfaced message reads as a plain upload failure and hides
        // the fact that the fallback already ran.
        throw new Error(`Instagram refused both the ${sourceLabel} render and a ${LIGHT_COPY_SHORT_SIDE}p copy of it. (${err2.message})`);
      }
    } finally {
      // The copy has served its purpose either way — its bytes are already uploaded on
      // success, and on failure a stray .ig720.mp4 beside the render is just clutter.
      if (lightPath) discardLightCopy(lightPath);
    }

    require("electron-log/main").scope("instagram").info("Publish success", { mediaId: result.mediaId, downscaled });
    publishLog.logPublish({
      ...logBase, status: "success",
      publishId: result.mediaId, postId: result.mediaId,
      ...(downscaled ? { qualityNote: `${LIGHT_COPY_SHORT_SIDE}p copy — sent automatically after ${sourceLabel} was refused` } : {}),
      apiResponse: result,
    });

    return { success: true, mediaId: result.mediaId, status: result.status, downscaled, downscaledTo: downscaled ? `${LIGHT_COPY_SHORT_SIDE}p` : null };
  } catch (err) {
    require("electron-log/main").scope("instagram").error("Publish failed", { error: err.message });
    publishLog.logPublish({ ...logBase, status: "failed", error: err.message });
    return { error: err.message };
  }
});

// ── Facebook Page Publishing ──

ipcMain.handle("facebook:publish", async (event, { accountId, videoPath, title, caption, clipId, isTest, scheduled }) => {
  const logBase = { clipId: clipId || "", clipTitle: title || "", clipCaption: caption || "", platform: "Facebook", accountId, accountName: "", videoPath, ...(scheduled ? { scheduled: true } : {}) };
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

    const result = await facebookPublish.publish(
      account.pageAccessToken,
      account.pageId,
      videoPath,
      { title: title || "", description: caption || title || "" },
      (progress) => {
        mainWindow?.webContents.send("facebook:publishProgress", progress);
      }
    );

    require("electron-log/main").scope("facebook").info("Publish success", { videoId: result.videoId, postId: result.postId, surface: result.surface });
    publishLog.logPublish({
      ...logBase, status: "success",
      publishId: result.videoId, postId: result.postId || result.videoId,
      surface: result.surface,
      apiResponse: result,
    });

    return { success: true, videoId: result.videoId, postId: result.postId || result.videoId, surface: result.surface, url: result.url || null, status: result.status };
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

ipcMain.handle("youtube:publish", async (event, { accountId, videoPath, title, caption, clipId, tags, youtubeTitle, privacyStatus, isTest, scheduled }) => {
  const logBase = { clipId: clipId || "", clipTitle: title || "", clipCaption: caption || "", platform: "YouTube", accountId, accountName: "", videoPath, ...(scheduled ? { scheduled: true } : {}) };
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
        // #163: Google's error_description for a dead refresh token is literally
        // "Bad Request" — say what actually fixes it instead.
        const dead = refreshResult.error === "invalid_grant";
        if (dead) tokenStore.setNeedsReconnect(accountId);
        const err = dead
          ? deadTokenError("YouTube")
          : `Token refresh failed: ${refreshResult.error_description || refreshResult.error || "Unknown error"}`;
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

// ============ LOGGING & BUG REPORTS ============

// Build and export a bug report
ipcMain.handle("logs:exportReport", async (_, { description, modules, severity }) => {
  const report = logger.buildReport(description, modules, severity);

  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save Bug Report",
    defaultPath: path.join(app.getPath("desktop"), `corva-report-${report.reportId}.json`),
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  fs.writeFileSync(result.filePath, JSON.stringify(report, null, 2), "utf-8");
  logger.info(logger.MODULES.system, "Bug report exported", { reportId: report.reportId, path: result.filePath });
  return { success: true, reportId: report.reportId, filePath: result.filePath };
});

// ============ #248 BETA FEEDBACK REPORTER ============
// Context the renderer can't assemble itself. The Sentry event is captured
// renderer-side (breadcrumbs attach there); log tail rides along only when
// the renderer asks for it (Problem reports — the consent line says so).
ipcMain.handle("feedback:context", async (_, opts) => {
  try {
    return feedbackReport.getContext(store, { includeActivity: !!(opts && opts.includeActivity) });
  } catch (err) {
    return { error: err.message };
  }
});

// Point-at-the-problem region snapshot — element rect + margin, never full screen.
ipcMain.handle("feedback:snapshot", async (event, rect) => {
  try {
    const png = await feedbackReport.captureSnapshot(event.sender, rect);
    return png ? { png } : { error: "Nothing to capture" };
  } catch (err) {
    return { error: err.message };
  }
});

// Get app version
ipcMain.handle("app:getVersion", async () => {
  return app.getVersion();
});

// Open an external URL in the OS default browser. Only http/https allowed so a
// compromised renderer can't trigger arbitrary protocols (file://, custom schemes, etc.).
ipcMain.handle("app:openExternal", async (_event, url) => {
  try {
    if (typeof url !== "string") return { error: "url must be a string" };
    if (!/^https?:\/\//i.test(url)) return { error: "Only http(s) URLs allowed" };
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

// ── Auto-update (#250; replaces the #80 Stage-2 local-dist scan, #259) ──
// electron-updater against the generic feed on R2: engine.flowve.app/updates
// (latest.yml + installer + blockmap, uploaded by scripts/publish-update.ps1).
// IPC names kept from Stage 2 so preload + UpdateBanner stayed wired:
//   update:check   → checkForUpdates(); banner shows if the feed is newer.
//   update:install → downloadUpdate() (differential via blockmap, progress
//                    streamed as "update:progress"), then quitAndInstall.
// Unsigned build (#51 deferred): no signature verification on the download —
// integrity comes from the sha512 in latest.yml, transport from HTTPS.
const { autoUpdater } = require("electron-updater");
autoUpdater.autoDownload = false;

autoUpdater.on("download-progress", (p) => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update:progress", {
        percent: p.percent,
        transferredBytes: p.transferred,
        totalBytes: p.total,
      });
    }
  } catch (_) { /* window gone mid-send */ }
});

ipcMain.handle("update:check", async () => {
  try {
    // Source runs (npm start / npm run dev) have no app-update.yml — the
    // updater only means anything on an installed build.
    if (!app.isPackaged) return { available: false };
    const result = await autoUpdater.checkForUpdates();
    const current = app.getVersion();
    if (!result || !result.isUpdateAvailable) return { available: false, current };
    return { available: true, current, newVersion: result.updateInfo.version };
  } catch (err) {
    // Expected offline / feed-not-yet-uploaded case — quiet log, no banner.
    logger.warn(logger.MODULES.system, `update:check failed: ${err.message}`);
    return { available: false, error: err.message };
  }
});

ipcMain.handle("update:install", async () => {
  try {
    if (!app.isPackaged) return { success: false, error: "Updates only work on the installed app" };
    await autoUpdater.downloadUpdate();
    // Silent NSIS install + relaunch — the "Install" click already was consent.
    autoUpdater.quitAndInstall(true, true);
    return { success: true };
  } catch (err) {
    logger.error(logger.MODULES.system, `update:install failed: ${err.message}`);
    return { success: false, error: err.message };
  }
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
    const watchFolder = libraryRoot(); // project library (decoupled from the OBS watch folder)
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


