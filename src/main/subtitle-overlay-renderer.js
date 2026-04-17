/**
 * Subtitle Overlay Renderer — Offscreen BrowserWindow Frame Capture
 *
 * Spins up a hidden offscreen Electron BrowserWindow, loads an HTML page that
 * renders subtitles/captions using the same subtitleStyleEngine.js as the editor
 * preview, captures PNG frames at a fixed FPS, and outputs sequentially numbered
 * PNGs for FFmpeg image2 input.
 *
 * This produces pixel-perfect subtitle rendering that matches the editor preview
 * exactly, because the same Chromium engine + same CSS + same style code is used.
 */

const { BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

// Overlay capture FPS — subtitles change at word boundaries (~200-400ms),
// so 10fps is plenty for smooth transitions. Keeps capture fast.
const OVERLAY_FPS = 10;

/**
 * Probe a video file for its resolution using ffprobe.
 * @param {string} filePath
 * @returns {Promise<{width: number, height: number}>}
 */
function probeResolution(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=s=x:p=0",
      filePath,
    ]);
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error("ffprobe failed"));
      const [w, h] = stdout.trim().split("x").map(Number);
      resolve({ width: w || 1080, height: h || 1920 });
    });
    proc.on("error", reject);
  });
}

/**
 * Probe a video file for its actual duration using ffprobe.
 * @param {string} filePath
 * @returns {Promise<number>} duration in seconds
 */
function probeDuration(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "csv=s=x:p=0",
      filePath,
    ]);
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error("ffprobe duration failed"));
      const dur = parseFloat(stdout.trim());
      resolve(isNaN(dur) ? 0 : dur);
    });
    proc.on("error", reject);
  });
}

/**
 * Render subtitle/caption overlay frames for a clip.
 *
 * @param {object} params
 * @param {Array} params.subtitleSegments - Subtitle segments with word-level timing
 * @param {object} params.subtitleStyle - Full subtitle style config from editor stores
 * @param {Array} params.captionSegments - Caption segments [{id, text, startSec, endSec}]
 * @param {object} params.captionStyle - Full caption style config from editor stores
 * @param {number} params.clipStartTime - Clip start time in source video (seconds)
 * @param {number} params.clipEndTime - Clip end time in source video (seconds)
 * @param {string} params.tempDir - Directory for temporary PNG files
 * @param {string} params.sourceFile - Source video path (for resolution probing)
 * @param {function} [params.onProgress] - Progress callback
 * @returns {Promise<{frameDir: string, fps: number, totalFrames: number, width: number, height: number}>}
 */
async function renderOverlayFrames(params) {
  const {
    subtitleSegments = [],
    subtitleStyle = {},
    captionSegments = [],
    captionStyle = {},
    syncOffset = 0,
    clipStartTime = 0,
    clipEndTime = 0,
    timelineDuration: explicitDuration, // NLE mode: explicit timeline duration
    tempDir,
    sourceFile,
    resolutionProbeFile, // separate path for resolution probing (NLE: sourceFile is null but we still need resolution)
    onProgress,
  } = params;

  // Create temp directory for PNGs
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  // Duration priority:
  // 1. Explicit timelineDuration (NLE mode — caller computed from segments)
  // 2. ffprobe of source file (legacy mode — matches real file length)
  // 3. clipEndTime - clipStartTime (fallback)
  let clipDuration = clipEndTime - clipStartTime;
  if (explicitDuration && explicitDuration > 0) {
    console.log(`[OverlayRenderer] Using explicit timeline duration: ${explicitDuration}s`);
    clipDuration = explicitDuration;
  } else if (sourceFile) {
    try {
      const realDuration = await probeDuration(sourceFile);
      if (realDuration > 0) {
        console.log(`[OverlayRenderer] File duration: ${realDuration}s (calculated: ${clipDuration}s)`);
        clipDuration = realDuration;
      }
    } catch (e) {
      console.warn("[OverlayRenderer] Duration probe failed, using calculated:", e.message);
    }
  }
  // +1 ensures a frame exists at the exact clip end time
  const totalFrames = Math.ceil(clipDuration * OVERLAY_FPS) + 1;

  if (totalFrames <= 0) {
    return { frameDir: tempDir, fps: OVERLAY_FPS, totalFrames: 0, width: 1080, height: 1920 };
  }

  // Probe source video resolution so overlay matches exactly
  let width = 1080, height = 1920;
  const probeFile = resolutionProbeFile || sourceFile;
  if (probeFile) {
    try {
      const res = await probeResolution(probeFile);
      width = res.width;
      height = res.height;
      console.log("[OverlayRenderer] Source video resolution:", width, "x", height);
    } catch (e) {
      console.warn("[OverlayRenderer] ffprobe failed, using default 1080x1920:", e.message);
    }
  }

  // Scale factor: style engine is authored for 1080px width
  const scaleFactor = width / 1080;

  // Determine overlay page path — Vite publicDir copies public/subtitle-overlay → build/subtitle-overlay
  const overlayHtmlPath = path.join(__dirname, "../../build/subtitle-overlay/index.html");
  const overlayPreloadPath = path.join(__dirname, "subtitle-overlay-preload.js");
  const fontsPath = path.join(__dirname, "../../src/fonts");

  // Verify paths exist
  if (!fs.existsSync(overlayHtmlPath)) {
    throw new Error(`Overlay HTML not found: ${overlayHtmlPath}`);
  }
  if (!fs.existsSync(overlayPreloadPath)) {
    throw new Error(`Overlay preload not found: ${overlayPreloadPath}`);
  }

  console.log("[OverlayRenderer] Resolution:", width, "x", height, "Scale:", scaleFactor.toFixed(2));
  console.log("[OverlayRenderer] Duration:", clipDuration.toFixed(1), "s, Frames:", totalFrames, "@ FPS:", OVERLAY_FPS);
  console.log("[OverlayRenderer] Subtitles:", subtitleSegments.length, "Captions:", captionSegments.length);

  // Create offscreen BrowserWindow matching source video resolution.
  // Hardened per H1 (#47): contextIsolation on, nodeIntegration off, narrow
  // preload bridge exposing only the deterministic render helpers. Sandbox is
  // intentionally left off — enabling it would require bundling the CJS utils
  // into the overlay build output; tracked as a follow-up issue.
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    transparent: true,
    frame: false,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Explicit sandbox: false — required so the preload can require() the
      // pure-CJS style engine + word finder from the renderer utils folder.
      // Sandboxing the overlay window would require bundling those modules
      // into the overlay build output; tracked as a follow-up.
      sandbox: false,
      preload: overlayPreloadPath,
    },
  });

  // Force exact content size — Windows may constrain the window to screen height
  win.setContentSize(width, height);
  win.webContents.setFrameRate(OVERLAY_FPS);

  // Log renderer console messages for debugging
  win.webContents.on("console-message", (_, level, message) => {
    const prefix = ["[OverlayRenderer:LOG]", "[OverlayRenderer:WARN]", "[OverlayRenderer:ERROR]"][level] || "[OverlayRenderer]";
    console.log(prefix, message);
  });

  try {
    // Load the overlay page
    await win.loadFile(overlayHtmlPath);

    // Update the canvas size in the HTML to match video resolution
    const initResult = await win.webContents.executeJavaScript(`
      try {
        // Resize canvas to match video resolution
        document.documentElement.style.width = '${width}px';
        document.documentElement.style.height = '${height}px';
        document.body.style.width = '${width}px';
        document.body.style.height = '${height}px';
        document.getElementById('canvas').style.width = '${width}px';
        document.getElementById('canvas').style.height = '${height}px';

        window.__SCALE_FACTOR__ = ${scaleFactor};
        window.__FONTS_PATH__ = ${JSON.stringify(fontsPath)};
        window.__OVERLAY_CONFIG__ = ${JSON.stringify({
          subtitleSegments,
          subtitleStyle,
          captionSegments,
          captionStyle,
          syncOffset,
          clipStartTime,
          clipEndTime,
        })};
        if (window.__initOverlay__) window.__initOverlay__();
        "init-ok";
      } catch (e) {
        "init-error: " + e.message + " | " + e.stack;
      }
    `);
    console.log("[OverlayRenderer] Init:", initResult);

    if (initResult && initResult.startsWith("init-error")) {
      throw new Error(initResult);
    }

    // Wait for fonts to load
    await win.webContents.executeJavaScript(`document.fonts.ready.then(() => true)`);
    await new Promise((r) => setTimeout(r, 150));

    // Capture frames at fixed FPS for the full clip duration
    console.log("[OverlayRenderer] Starting frame capture:", totalFrames, "frames");

    for (let i = 0; i < totalFrames; i++) {
      const t = i / OVERLAY_FPS; // time relative to clip start (0-based)

      // Update the overlay to this timestamp (clip-relative, matching editSegments timing)
      await win.webContents.executeJavaScript(`
        try { window.__seekTo__(${t}); "ok"; } catch(e) { "err:" + e.message; }
      `);

      // Small delay for DOM to settle
      await new Promise((r) => setTimeout(r, 20));

      // Capture the frame
      const image = await win.webContents.capturePage();
      const pngBuffer = image.toPNG();

      // Always save every frame (sequential numbering required for FFmpeg image2)
      const pngPath = path.join(tempDir, `frame_${String(i).padStart(5, "0")}.png`);
      fs.writeFileSync(pngPath, pngBuffer);

      if (i === 0) {
        console.log("[OverlayRenderer] First frame:", pngBuffer.length, "bytes, size:", image.getSize().width, "x", image.getSize().height);
      }

      if (onProgress && i % 10 === 0) {
        onProgress({
          stage: "subtitles",
          pct: Math.round(((i + 1) / totalFrames) * 100),
          detail: `Rendering subtitle frame ${i + 1}/${totalFrames}`,
        });
      }
    }

    console.log("[OverlayRenderer] Frame capture complete:", totalFrames, "frames");
    return { frameDir: tempDir, fps: OVERLAY_FPS, totalFrames, width, height };
  } finally {
    win.destroy();
  }
}

/**
 * Clean up temporary overlay frame files.
 * @param {string} tempDir
 */
function cleanupOverlayFrames(tempDir) {
  try {
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      for (const f of files) {
        try { fs.unlinkSync(path.join(tempDir, f)); } catch (_) {}
      }
      try { fs.rmdirSync(tempDir); } catch (_) {}
    }
  } catch (_) {}
}

module.exports = { renderOverlayFrames, cleanupOverlayFrames };
