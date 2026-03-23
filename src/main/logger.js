/**
 * ClipFlow Unified Logger
 *
 * Structured JSON logging to local files + console.
 * Log files: %APPDATA%/ClipFlow/logs/clipflow-YYYY-MM-DD.log
 * Each line is a JSON object with: timestamp, level, module, sessionId, message, context
 */

const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// --- Module taxonomy ---
const MODULES = {
  system: "system",
  subtitles: "subtitles",
  publishing: "publishing",
  titleGeneration: "title-generation",
  auth: "auth",
  videoProcessing: "video-processing",
  editor: "editor",
  pipeline: "pipeline",
};

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 };

// One session ID per app launch
const sessionId = `sess_${crypto.randomBytes(6).toString("hex")}`;

// Minimum level to write (debug in dev, info in prod)
const isDev = !app.isPackaged;
const minLevel = isDev ? LEVELS.debug : LEVELS.info;

function getLogsDir() {
  return path.join(app.getPath("userData"), "logs");
}

function getLogFilePath(date) {
  const d = date || new Date();
  const dateStr = d.toISOString().split("T")[0]; // YYYY-MM-DD
  return path.join(getLogsDir(), `clipflow-${dateStr}.log`);
}

function ensureLogsDir() {
  const dir = getLogsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Write a structured log entry.
 * @param {"debug"|"info"|"warn"|"error"|"fatal"} level
 * @param {string} module - One of MODULES values
 * @param {string} message - Human-readable description
 * @param {object} [context] - Optional extra data (video ID, platform, etc.)
 */
function log(level, module, message, context) {
  const numLevel = LEVELS[level] ?? LEVELS.info;
  if (numLevel < minLevel) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    module: module || MODULES.system,
    sessionId,
    message,
  };

  // Only include context if it has data
  if (context && Object.keys(context).length > 0) {
    // Strip sensitive fields
    const safe = { ...context };
    delete safe.apiKey;
    delete safe.token;
    delete safe.accessToken;
    delete safe.refreshToken;
    delete safe.secret;
    delete safe.password;
    entry.context = safe;
  }

  // Console output (colored by level)
  const prefix = `[${level.toUpperCase()}][${module}]`;
  if (level === "error" || level === "fatal") {
    console.error(prefix, message, context || "");
  } else if (level === "warn") {
    console.warn(prefix, message, context || "");
  } else {
    console.log(prefix, message, context || "");
  }

  // Write to file (append, one JSON object per line)
  try {
    ensureLogsDir();
    const filePath = getLogFilePath();
    fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf-8");
  } catch (err) {
    // Fallback: don't crash the app if logging fails
    console.error("[LOGGER] Failed to write log file:", err.message);
  }
}

// --- Convenience methods ---
const logger = {
  debug: (module, message, context) => log("debug", module, message, context),
  info: (module, message, context) => log("info", module, message, context),
  warn: (module, message, context) => log("warn", module, message, context),
  error: (module, message, context) => log("error", module, message, context),
  fatal: (module, message, context) => log("fatal", module, message, context),
};

// --- Log reading (for bug reports + IPC) ---

/**
 * Read log entries for the current session, optionally filtered by modules.
 * @param {string[]} [modules] - Filter to these modules (null = all)
 * @returns {object[]} Parsed log entries
 */
function getSessionLogs(modules) {
  try {
    const filePath = getLogFilePath();
    if (!fs.existsSync(filePath)) return [];

    const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
    let entries = lines.map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);

    // Filter to current session
    entries = entries.filter((e) => e.sessionId === sessionId);

    // Filter by modules if specified
    if (modules && modules.length > 0) {
      // Always include system logs
      const filterSet = new Set([...modules, "system"]);
      entries = entries.filter((e) => filterSet.has(e.module));
    }

    return entries;
  } catch {
    return [];
  }
}

/**
 * Build an export report payload.
 * @param {string} description - User's description of the issue
 * @param {string[]} modules - Selected module filters
 * @param {string} severity - "crash" | "bug" | "visual"
 * @returns {object} Complete report payload
 */
function buildReport(description, modules, severity) {
  const logs = {};
  const sessionEntries = getSessionLogs(modules);

  // Group entries by module
  for (const entry of sessionEntries) {
    if (!logs[entry.module]) logs[entry.module] = [];
    logs[entry.module].push(entry);
  }

  return {
    reportId: `rpt_${crypto.randomBytes(6).toString("hex")}`,
    appVersion: app.getVersion(),
    platform: process.platform,
    osVersion: require("os").release(),
    electronVersion: process.versions.electron,
    sessionId,
    submittedAt: new Date().toISOString(),
    description,
    modules: modules || [],
    severity: severity || "bug",
    logs,
  };
}

/**
 * Clean up log files older than maxDays.
 * @param {number} [maxDays=7]
 */
function rotateLogs(maxDays = 7) {
  try {
    const dir = getLogsDir();
    if (!fs.existsSync(dir)) return;

    const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(dir).filter((f) => f.startsWith("clipflow-") && f.endsWith(".log"));

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        console.log(`[LOGGER] Rotated old log: ${file}`);
      }
    }
  } catch (err) {
    console.error("[LOGGER] Log rotation failed:", err.message);
  }
}

/**
 * Get the logs directory path (for Claude Code / dev access).
 */
function getLogsDirPath() {
  return getLogsDir();
}

module.exports = {
  MODULES,
  sessionId,
  ...logger,
  getSessionLogs,
  buildReport,
  rotateLogs,
  getLogsDirPath,
  getLogsDir,
};
