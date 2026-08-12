/**
 * #248 Beta feedback reporter — main-process support.
 *
 * The report itself is captured renderer-side (Sentry.captureFeedback via
 * @sentry/electron/renderer — envelopes ride the IPC bridge into the main
 * process offline transport, so reports queue when the network is down).
 * This module supplies what only the main process knows: the electron-log
 * tail, OS version, the last pipeline/publish failure, and the cropped
 * region snapshot for point-at-the-problem.
 *
 * NOT the clip-feedback database — that's ./feedback.js (approve/reject
 * training data). This is the human bug/idea/feedback channel.
 */
const { app, BrowserWindow } = require("electron");
const os = require("os");
const path = require("path");
const fs = require("fs");
// Same module instance main.js initialized at boot — required long after
// app.setPath('userData'), so the Sentry userData-caching trap doesn't apply.
const Sentry = require("@sentry/electron/main");
const logger = require("./logger");

// Last pipeline/publish failure this session. Context for Problem reports and
// the trigger for the bubble's error pulse (the only self-animation, per the
// locked #248 design).
let lastAppError = null;

function recordAppError(kind, summary, webContents) {
  lastAppError = {
    kind, // "pipeline" | "publish"
    summary: String(summary || "").slice(0, 500),
    at: new Date().toISOString(),
  };
  try {
    if (webContents && !webContents.isDestroyed()) {
      webContents.send("feedback:appError", lastAppError);
    }
  } catch (_) { /* renderer gone — nothing to pulse */ }
}

// Tail of the current electron-log file. Attached to Problem reports only.
function logTail(lines = 200) {
  try {
    const file = path.join(logger.getLogsDir(), "app.log");
    if (!fs.existsSync(file)) return "";
    const text = fs.readFileSync(file, "utf-8");
    const all = text.split("\n");
    return all.slice(Math.max(0, all.length - lines)).join("\n");
  } catch {
    return "";
  }
}

// The breadcrumb trail lives HERE, not in the renderer: the SDK's ScopeToMain
// integration forwards every renderer breadcrumb over IPC and CLEARS the
// renderer scope, and handleScope adds them to main's current scope.
function recentBreadcrumbs(limit = 20) {
  try {
    const iso = Sentry.getIsolationScope?.().getScopeData?.().breadcrumbs || [];
    const cur = Sentry.getCurrentScope?.().getScopeData?.().breadcrumbs || [];
    return [...iso, ...cur]
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .slice(-limit)
      .map((b) => ({
        timestamp: b.timestamp || null,
        category: b.category || "event",
        message: b.message || (b.data ? JSON.stringify(b.data) : ""),
      }));
  } catch {
    return [];
  }
}

// includeActivity gates BOTH the log tail and the breadcrumb trail — they
// ride only on Problem reports (the Idea/Feedback consent line promises
// words + snapshot + version, nothing else).
function getContext(store, { includeActivity } = {}) {
  return {
    appVersion: app.getVersion(),
    osVersion: `${os.platform()} ${os.release()}`,
    electronVersion: process.versions.electron,
    deviceId: store.get("deviceId") || null,
    lastAppError,
    logTail: includeActivity ? logTail(200) : null,
    breadcrumbs: includeActivity ? recentBreadcrumbs(20) : null,
  };
}

/**
 * Cropped region snapshot: element rect + margin, NOT full screen.
 * rect arrives in CSS pixels from getBoundingClientRect(); capturePage wants
 * device-independent pixels — the window zoom factor (applyWindowZoom in
 * main.js scales up to 1.35) sits between the two, so the rect is scaled and
 * clamped to the visible content area.
 */
async function captureSnapshot(webContents, rect, margin = 16) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
  const zoom = webContents.getZoomFactor() || 1;
  const win = BrowserWindow.fromWebContents(webContents);
  if (!win || win.isDestroyed()) return null;
  const [cw, ch] = win.getContentSize();

  const x = Math.max(0, Math.round((rect.x - margin) * zoom));
  const y = Math.max(0, Math.round((rect.y - margin) * zoom));
  const width = Math.min(cw - x, Math.round((rect.width + margin * 2) * zoom));
  const height = Math.min(ch - y, Math.round((rect.height + margin * 2) * zoom));
  if (width <= 0 || height <= 0) return null;

  const image = await webContents.capturePage({ x, y, width, height });
  return image.toPNG().toString("base64");
}

module.exports = { recordAppError, getContext, captureSnapshot, logTail };
