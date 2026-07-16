/**
 * Reframe Detection Preload — isolated bridge for the hidden detection window (#164 Phase B).
 *
 * Runs with contextIsolation: true, sandbox: false (needs fs for the vendored
 * MediaPipe assets — asar-aware reads). The page gets exactly four things:
 * the job (source video path), byte access to the four vendored assets,
 * and the two report channels. No general fs, no child_process, no os.
 *
 * Paired with src/main/reframe-detect.js (window lifecycle + IPC) and
 * public/detect-page.js (the detection algorithm).
 */

const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");

// Vendored assets live next to detect.html: public/mediapipe → build/mediapipe.
// In the packaged app that's inside app.asar — Electron's fs handles it.
const ASSETS_DIR = path.join(__dirname, "..", "..", "build", "mediapipe");

contextBridge.exposeInMainWorld("reframeDetectAPI", {
  getJob: () => ipcRenderer.invoke("reframe-detect:get-job"),
  // basename() pins reads inside the assets dir no matter what the page asks for
  readAsset: (name) => fs.readFileSync(path.join(ASSETS_DIR, path.basename(name))),
  reportResult: (proposal) => ipcRenderer.send("reframe-detect:result", proposal),
  reportError: (message) => ipcRenderer.send("reframe-detect:error", message),
});
