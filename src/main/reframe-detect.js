/**
 * Reframe layout detection — hidden-window runner (#164 Phase B, B1).
 *
 * runDetection(sourceFile) spawns a dedicated hidden BrowserWindow that loads
 * build/detect.html (page-scoped CSP — the main window's CSP is untouched),
 * samples 8 frames from the source video, runs MediaPipe face detection +
 * the gate-proven layout algorithm (public/detect-page.js), and resolves with
 * the proposal JSON. The window is torn down after every run, success or not.
 *
 * Mirrors the subtitle-overlay offscreen pattern (subtitle-overlay-renderer.js):
 * hidden window + dedicated narrow preload + loadFile of a static page.
 * One run at a time — detection is user-triggered and takes seconds, so a
 * second concurrent request is a caller bug, not a queueing need.
 */

const { BrowserWindow, ipcMain } = require("electron");
const path = require("path");

const DETECT_TIMEOUT_MS = 240000;

let activeRun = null; // { win, sourceFile, resolve, reject, timer }

function isDetectSender(event) {
  return activeRun && !activeRun.win.isDestroyed() && event.sender === activeRun.win.webContents;
}

ipcMain.handle("reframe-detect:get-job", (event) => {
  if (!isDetectSender(event)) return null;
  return { sourceFile: activeRun.sourceFile };
});

ipcMain.on("reframe-detect:result", (event, proposal) => {
  if (!isDetectSender(event)) return;
  finish(null, proposal);
});

ipcMain.on("reframe-detect:error", (event, message) => {
  if (!isDetectSender(event)) return;
  finish(new Error("Detection failed: " + message));
});

function finish(err, proposal) {
  const run = activeRun;
  if (!run) return;
  activeRun = null; // clear first so the window's 'closed' handler no-ops
  clearTimeout(run.timer);
  if (!run.win.isDestroyed()) run.win.destroy();
  if (err) run.reject(err);
  else run.resolve(proposal);
}

/**
 * @param {string} sourceFile absolute path to the source video
 * @returns {Promise<object>} proposal — { world, camRect, gameRect, confidence, faceBox, frame, ... }
 */
function runDetection(sourceFile) {
  if (activeRun) return Promise.reject(new Error("Detection already running"));
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      width: 640,
      height: 480,
      skipTaskbar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        // sandbox off so the preload can fs-read the vendored MediaPipe
        // assets (same tradeoff as the subtitle overlay window)
        sandbox: false,
        preload: path.join(__dirname, "reframe-detect-preload.js"),
      },
    });
    activeRun = {
      win,
      sourceFile,
      resolve,
      reject,
      timer: setTimeout(() => finish(new Error("Detection timed out")), DETECT_TIMEOUT_MS),
    };
    win.webContents.on("console-message", (event) => {
      console.log("[ReframeDetect]", event.message);
    });
    win.webContents.on("render-process-gone", (_e, details) => {
      finish(new Error("Detection renderer crashed: " + (details && details.reason)));
    });
    win.on("closed", () => {
      finish(new Error("Detection window closed"));
    });
    win.loadFile(path.join(__dirname, "../../build/detect.html")).catch((e) => finish(e));
  });
}

module.exports = { runDetection };
