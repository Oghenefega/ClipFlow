/**
 * ClipFlow Unified Logger — electron-log v5 wrapper
 *
 * Plain-text rotated log file: %APPDATA%/ClipFlow/logs/app.log
 * Format: [YYYY-MM-DD HH:mm:ss.SSS] [level] (scope) [sess_xxx] message {context}
 * Rotation: 5MB max, keeps 5 archived files (app.1.log → app.5.log)
 *
 * Exports the same API as the old hand-rolled logger so downstream code
 * (main.js IPC handlers, SettingsView bug report) works without changes.
 */

const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const electronLog = require("electron-log/main");

// --- Module taxonomy (unchanged — SettingsView bug report UI depends on these) ---
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

// One session ID per app launch
const sessionId = `sess_${crypto.randomBytes(6).toString("hex")}`;

// Detect dev vs packaged
const isDev = !app.isPackaged;

// Sensitive fields to strip from context objects before logging
const SENSITIVE_KEYS = new Set([
  "apiKey", "token", "accessToken", "refreshToken",
  "secret", "password", "clientSecret", "appSecret",
]);

// --- Configure electron-log file transport ---

function getLogsDir() {
  return path.join(app.getPath("userData"), "logs");
}

// File path: %APPDATA%/ClipFlow/logs/app.log
electronLog.transports.file.resolvePathFn = () => {
  return path.join(getLogsDir(), "app.log");
};

// Force UTF-8 encoding (Windows defaults to UTF-16)
electronLog.transports.file.writeOptions = { encoding: "utf8", flag: "a" };

// 5MB max file size
electronLog.transports.file.maxSize = 5 * 1024 * 1024;

// Rotate through app.1.log → app.5.log
electronLog.transports.file.archiveLogFn = (oldLogFile) => {
  const dir = path.dirname(oldLogFile.path);
  const MAX_ARCHIVES = 5;

  // Shift existing archives: app.4.log → app.5.log, app.3.log → app.4.log, etc.
  for (let i = MAX_ARCHIVES; i >= 1; i--) {
    const src = i === 1
      ? oldLogFile.path
      : path.join(dir, `app.${i - 1}.log`);
    const dst = path.join(dir, `app.${i}.log`);
    try {
      if (fs.existsSync(src)) {
        fs.renameSync(src, dst);
      }
    } catch (e) {
      // Ignore rotation errors — don't crash the app
    }
  }
};

// Log levels: file gets info+ in prod, debug+ in dev. Console gets debug in dev, warn in prod.
electronLog.transports.file.level = isDev ? "debug" : "info";
electronLog.transports.console.level = isDev ? "debug" : "warn";

// Disable scope label padding (electron-log pads to align columns)
electronLog.scope.labelPadding = false;

// Custom format template — {scope} and {text} are built-in variables
// We inject sessionId via a hook that prepends it to the data array
electronLog.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {scope} [" + sessionId + "] {text}";

// Hook: strip sensitive fields and serialize objects to JSON for clean log lines
electronLog.hooks.push((message) => {
  message.data = message.data.map((item) => {
    if (typeof item === "object" && item !== null && !Array.isArray(item)) {
      const safe = { ...item };
      for (const key of Object.keys(safe)) {
        if (SENSITIVE_KEYS.has(key)) {
          safe[key] = "[REDACTED]";
        }
      }
      try { return JSON.stringify(safe); } catch { return String(safe); }
    }
    return item;
  });
  return message;
});

// --- Scoped logger cache ---
const scopeCache = {};
function getScoped(module) {
  const scope = module || "system";
  if (!scopeCache[scope]) {
    scopeCache[scope] = electronLog.scope(scope);
  }
  return scopeCache[scope];
}

// --- Public API (same signatures as old logger.js) ---

/**
 * Initialize electron-log. MUST be called before creating any BrowserWindow.
 * Sets up renderer → main IPC log bridging and error catching.
 */
function initialize() {
  electronLog.initialize();
  // Note: errorHandler.startCatching() was removed — Sentry owns crash capture.
  // electron-log remains the local file-based diagnostic logger.
}

function logMsg(level, module, message, context) {
  const scoped = getScoped(module);
  if (context && typeof context === "object" && Object.keys(context).length > 0) {
    scoped[level](message, context);
  } else {
    scoped[level](message);
  }
}

const logger = {
  debug: (module, message, context) => logMsg("debug", module, message, context),
  info: (module, message, context) => logMsg("info", module, message, context),
  warn: (module, message, context) => logMsg("warn", module, message, context),
  error: (module, message, context) => logMsg("error", module, message, context),
  fatal: (module, message, context) => logMsg("error", module, message, context), // electron-log has no fatal; map to error
};

// --- Log reading (for bug reports + IPC) ---

// Regex to parse our custom format:
// [2026-03-24 10:30:45.123] [info] (system) [sess_abc123] message text {"ctx": 1}
// Note: electron-log renders scope as "(name)" with padding, or empty string if no scope
const LOG_LINE_RE = /^\[([^\]]+)\]\s+\[(\w+)\]\s+(?:\(([^)]*)\))?\s*\[(sess_[a-f0-9]+)\]\s+(.*)$/;

/**
 * Parse a single log line into a structured entry.
 * Returns null if the line doesn't match the expected format.
 */
function parseLine(line) {
  const m = LOG_LINE_RE.exec(line);
  if (!m) return null;

  const entry = {
    timestamp: m[1].trim(),
    level: m[2],
    module: m[3],
    sessionId: m[4],
    message: m[5],
  };

  // Try to extract trailing JSON context from the message
  const jsonIdx = entry.message.indexOf(" {");
  if (jsonIdx >= 0) {
    const jsonPart = entry.message.substring(jsonIdx + 1);
    try {
      entry.context = JSON.parse(jsonPart);
      entry.message = entry.message.substring(0, jsonIdx);
    } catch {
      // Not valid JSON — leave message as-is
    }
  }

  return entry;
}

/**
 * Read log entries for the current session, optionally filtered by modules.
 * @param {string[]} [modules] - Filter to these modules (null = all)
 * @returns {object[]} Parsed log entries
 */
function getSessionLogs(modules) {
  try {
    const logFile = electronLog.transports.file.getFile();
    const filePath = logFile ? logFile.path : path.join(getLogsDir(), "app.log");
    if (!fs.existsSync(filePath)) return [];

    const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
    let entries = lines.map(parseLine).filter(Boolean);

    // Filter to current session
    entries = entries.filter((e) => e.sessionId === sessionId);

    // Filter by modules if specified
    if (modules && modules.length > 0) {
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
 * No-op — electron-log handles its own rotation (5MB max, 5 archives).
 * Old clipflow-YYYY-MM-DD.log files are left in place (they contain real data).
 * Kept for API compatibility with main.js call site.
 * @param {number} [maxDays=7] - ignored
 */
function rotateLogs(maxDays = 7) {
  // No-op — electron-log manages rotation automatically
}

/**
 * Get the logs directory path.
 */
function getLogsDirPath() {
  return getLogsDir();
}

module.exports = {
  MODULES,
  sessionId,
  initialize,
  ...logger,
  getSessionLogs,
  buildReport,
  rotateLogs,
  getLogsDirPath,
  getLogsDir,
};
