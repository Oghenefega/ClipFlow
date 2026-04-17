/**
 * Persistent publish log — records every publish attempt with full details.
 * Stored in electron-store so the user can review what happened.
 *
 * init() must be awaited during main-process bootstrap before any exported
 * function is called. Callers today are all IPC handler bodies that fire
 * after the renderer is loaded, which is after bootstrap finishes.
 */
const { createStore } = require("./store-factory");

let logStore = null;

async function init() {
  logStore = await createStore({
    name: "clipflow-publish-log",
    defaults: { entries: [] },
  });
}

const MAX_ENTRIES = 500; // Keep last 500 entries

/**
 * Log a publish attempt.
 * @param {object} entry
 * @param {string} entry.clipId
 * @param {string} entry.clipTitle
 * @param {string} entry.platform - "TikTok", "YouTube", etc.
 * @param {string} entry.accountId - e.g. "tiktok_xxx"
 * @param {string} entry.accountName - display name
 * @param {string} entry.videoPath
 * @param {string} entry.status - "started" | "uploading" | "processing" | "success" | "failed"
 * @param {string} [entry.error] - error message if failed
 * @param {object} [entry.apiResponse] - raw API response data
 * @param {string} [entry.publishId] - TikTok publish_id
 * @param {string|number} [entry.postId] - TikTok post_id
 */
function logPublish(entry) {
  const entries = logStore.get("entries") || [];
  entries.push({
    ...entry,
    timestamp: new Date().toISOString(),
  });
  // Trim to max
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  logStore.set("entries", entries);
}

/**
 * Get recent publish log entries.
 * @param {number} limit - max entries to return (default 50)
 */
function getRecentLogs(limit = 50) {
  const entries = logStore.get("entries") || [];
  return entries.slice(-limit).reverse(); // Newest first
}

/**
 * Get logs for a specific clip.
 */
function getLogsForClip(clipId) {
  const entries = logStore.get("entries") || [];
  return entries.filter((e) => e.clipId === clipId).reverse();
}

/**
 * Clear all logs.
 */
function clearLogs() {
  logStore.set("entries", []);
}

module.exports = { init, logPublish, getRecentLogs, getLogsForClip, clearLogs };
