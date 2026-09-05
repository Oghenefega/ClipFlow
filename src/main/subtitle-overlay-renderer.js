/**
 * Subtitle Overlay Renderer — Offscreen BrowserWindow Frame Capture
 *
 * Spins up a hidden offscreen Electron BrowserWindow, loads an HTML page that
 * renders subtitles/captions using the same subtitleStyleEngine.js as the editor
 * preview, and captures PNG frames at a fixed FPS which the caller streams
 * straight into FFmpeg's stdin (image2pipe) — no PNG files on disk.
 *
 * Two speed properties fall out of this design:
 *  - Identical frames are never re-captured: the overlay page reports whether
 *    the picture changed since the last frame (__renderFrame__), and unchanged
 *    frames re-send the cached PNG buffer (silence/static periods skip the
 *    expensive capture + encode entirely).
 *  - FFmpeg encodes concurrently with frame generation instead of waiting for
 *    the full frame set, so total render time is max(capture, encode), not sum.
 *
 * This produces pixel-perfect subtitle rendering that matches the editor preview
 * exactly, because the same Chromium engine + same CSS + same style code is used.
 */

const { BrowserWindow, app } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
// #251: bundled-first FFmpeg resolution (resources/ffmpeg/ → PATH fallback).
const { FFPROBE_BIN } = require("./app-paths");

// Overlay capture FPS — must be high enough that the per-word pop/karaoke ease
// (~0.2s) reads smoothly when composited over 60fps video. 10fps looked like
// stop-motion (#148). 30fps is the smoothness/render-time sweet spot; render.js
// forwards this as the FFmpeg input framerate (output is conformed to source fps).
const OVERLAY_FPS = 30;

/**
 * Probe a video file for its resolution using ffprobe.
 * @param {string} filePath
 * @returns {Promise<{width: number, height: number}>}
 */
function probeResolution(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFPROBE_BIN, [
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
    const proc = spawn(FFPROBE_BIN, [
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
 * Create an overlay capture session: probes duration/resolution, builds the
 * offscreen window, loads the overlay page, and waits for fonts. Returns null
 * when there is nothing to capture (non-positive duration).
 *
 * The caller drives the capture via session.captureFrames() — which streams
 * one PNG buffer per output frame through the writeFrame callback — and MUST
 * call session.destroy() when done (captureFrames does not destroy the window).
 *
 * @param {object} params
 * @param {Array} params.subtitleSegments - Subtitle segments with word-level timing
 * @param {object} params.subtitleStyle - Full subtitle style config from editor stores
 * @param {Array} params.captionSegments - Caption segments [{id, text, startSec, endSec}]
 * @param {object} params.captionStyle - Full caption style config from editor stores
 * @param {number} params.clipStartTime - Clip start time in source video (seconds)
 * @param {number} params.clipEndTime - Clip end time in source video (seconds)
 * @param {string} params.sourceFile - Source video path (for duration probing; null in NLE mode)
 * @param {number} [params.timelineDuration] - NLE mode: explicit timeline duration
 * @param {string} [params.resolutionProbeFile] - Path for resolution probing when sourceFile is null
 * @param {number} [params.targetWidth] - Explicit overlay canvas width; skips source-res probe when paired with targetHeight (#164 reframe)
 * @param {number} [params.targetHeight] - Explicit overlay canvas height
 * @returns {Promise<null | {fps: number, totalFrames: number, width: number, height: number, captureFrames: Function, destroy: Function}>}
 */
async function createOverlaySession(params) {
  const {
    subtitleSegments = [],
    subtitleStyle = {},
    captionSegments = [],
    captionStyle = {},
    syncOffset = 0,
    clipStartTime = 0,
    clipEndTime = 0,
    timelineDuration: explicitDuration, // NLE mode: explicit timeline duration
    sourceFile,
    resolutionProbeFile, // separate path for resolution probing (NLE: sourceFile is null but we still need resolution)
    targetWidth, // #164: explicit override (reframe bakes a fixed 1080x1920 canvas) — skips probeResolution when set with targetHeight
    targetHeight,
  } = params;

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

  if (clipDuration <= 0 || totalFrames <= 0) {
    return null;
  }

  // Probe source video resolution so overlay matches exactly, unless the
  // caller already knows the target canvas (#164 reframe bakes 1080x1920).
  let width = 1080, height = 1920;
  if (targetWidth && targetHeight) {
    width = targetWidth;
    height = targetHeight;
    console.log("[OverlayRenderer] Using target resolution override:", width, "x", height);
  } else {
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
  }

  // Scale factor: style engine is authored for 1080px width
  const scaleFactor = width / 1080;

  // Determine overlay page path — Vite publicDir copies public/subtitle-overlay → build/subtitle-overlay
  const overlayHtmlPath = path.join(__dirname, "../../build/subtitle-overlay/index.html");
  const overlayPreloadPath = path.join(__dirname, "subtitle-overlay-preload.js");
  // Packaged: fonts ship via electron-builder extraResources → resources/fonts.
  // Source: read from the repo's src/fonts. file:// into the asar is unreliable,
  // so the packaged path MUST resolve outside the asar (process.resourcesPath).
  const fontsPath = app.isPackaged
    ? path.join(process.resourcesPath, "fonts")
    : path.join(__dirname, "../../src/fonts");

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
  // #363: the window's own paint rate, NOT the capture rate. Every changed
  // frame now waits for two paints before it is photographed (see
  // __renderFrame__ in overlay-renderer.js), so a higher paint rate keeps that
  // wait short; a static page between frames repaints nothing regardless.
  win.webContents.setFrameRate(60);

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
    // #363: the first capturePage() of a fresh offscreen window comes back
    // empty whatever the page shows — the display has not drawn yet. Take
    // and discard one now so frame 0 is photographed like every other frame.
    await win.webContents.executeJavaScript(`window.__afterPaint__()`);
    await win.webContents.capturePage();
  } catch (err) {
    try { if (!win.isDestroyed()) win.destroy(); } catch (_) {}
    throw err;
  }

  /**
   * Capture loop. Emits exactly totalFrames PNG buffers through writeFrame in
   * frame order — unchanged frames re-send the cached buffer without touching
   * the DOM or the compositor. writeFrame must return a promise that resolves
   * when the sink can accept more data (pipe backpressure).
   *
   * @param {object} opts
   * @param {(buf: Buffer) => Promise<void>} opts.writeFrame
   * @param {function} [opts.onProgress] - ({frame, totalFrames}) every 10 frames
   * @param {function} [opts.shouldCancel] - #140: () => boolean — bail cleanly when true
   * @returns {Promise<{captured: number, skipped: number, canceled: boolean}>}
   */
  // ── #363: photograph only what has been painted ──
  // Seek the page to `t`. Resolves "same" (picture identical to the previous
  // frame, nothing touched) or { state: "changed", empty, major } AFTER the
  // page has painted the new DOM. A page whose paint loop is dead would never
  // resolve, so the handshake is bounded: on timeout the render carries on
  // (with the capture guards below still in force) and says so in the log.
  const PAINT_TIMEOUT_MS = 2000;
  async function seekPainted(t) {
    const exec = win.webContents.executeJavaScript(`
      try { window.__renderFrame__(${t}); } catch(e) { "err:" + e.message; }
    `);
    const result = await Promise.race([
      exec,
      new Promise((r) => setTimeout(() => r("timeout"), PAINT_TIMEOUT_MS)),
    ]);
    if (result === "timeout") {
      console.warn(`[OverlayRenderer] Paint handshake timed out at t=${t.toFixed(3)}s — capturing anyway`);
      return { state: "changed", empty: false, major: true, timedOut: true };
    }
    if (typeof result === "string" && result.startsWith("err:")) {
      throw new Error("Overlay frame render failed: " + result);
    }
    return result; // "same" | { state: "changed", empty, major }
  }

  async function waitOnePaint() {
    await Promise.race([
      win.webContents.executeJavaScript(`window.__afterPaint__()`),
      new Promise((r) => setTimeout(r, PAINT_TIMEOUT_MS)),
    ]);
  }

  // Any opaque pixel at all? Strided scan of the BGRA bitmap — a caption or a
  // word covers thousands of pixels, so sampling one in 64 cannot miss it.
  function hasOpaquePixels(image) {
    const bmp = image.toBitmap();
    for (let i = 3; i < bmp.length; i += 256) {
      if (bmp[i] > 0) return true;
    }
    return false;
  }

  // Photograph the page for a frame the page reported as changed. The capture
  // is rejected as stale and retried after one more paint when it contradicts
  // what the page says is on screen: fully transparent where content is
  // expected, or byte-identical to the previous frame when the line, the
  // caption set or the highlighted word changed (those cannot produce the
  // same pixels). Bounded, so two consecutive lines with identical text cost a
  // few frames, never a hang; a word-only change gets fewer retries because
  // a highlight colour equal to the text colour would otherwise pay on every word.
  // Measured (s241): the offscreen window hands back the previous picture on
  // roughly one changed frame in twenty under load and always on frame 0; one
  // extra paint has been enough every time, so the bounds are headroom.
  const MAX_STALE_RETRIES = 6;
  const MAX_WORD_RETRIES = 3;
  let staleRecaptures = 0;
  async function captureExpected(expect, prevBuf, t) {
    let attempt = 0;
    const maxRetries = expect.major ? MAX_STALE_RETRIES : MAX_WORD_RETRIES;
    for (;;) {
      const image = await win.webContents.capturePage();
      const buf = image.toPNG();
      const blank = !expect.empty && !hasOpaquePixels(image);
      const mustDiffer = expect.major || expect.wordChanged;
      const unchanged = mustDiffer && prevBuf != null && buf.equals(prevBuf);
      const limit = blank ? MAX_STALE_RETRIES : maxRetries;
      if ((!blank && !unchanged) || attempt >= limit) {
        if (blank || unchanged) {
          console.warn(`[OverlayRenderer] Capture still ${blank ? "blank" : "unchanged"} at t=${t.toFixed(3)}s after ${attempt} retries — keeping it`);
        }
        return { image, buf };
      }
      attempt++;
      staleRecaptures++;
      console.log(`[OverlayRenderer] Stale capture at t=${t.toFixed(3)}s (${blank ? "blank where content expected" : expect.major ? "unchanged across a line change" : "unchanged across a word change"}) — waiting one more paint (attempt ${attempt})`);
      await waitOnePaint();
    }
  }

  async function captureFrames({ writeFrame, onProgress, shouldCancel }) {
    console.log("[OverlayRenderer] Starting frame capture:", totalFrames, "frames");
    let lastBuf = null;
    let captured = 0;
    let skipped = 0;

    for (let i = 0; i < totalFrames; i++) {
      // #140: stop capturing as soon as a cancel is requested.
      if (shouldCancel && shouldCancel()) {
        console.log("[OverlayRenderer] Canceled at frame", i, "of", totalFrames);
        return { captured, skipped, canceled: true };
      }
      const t = i / OVERLAY_FPS; // time relative to clip start (0-based)

      const state = await seekPainted(t);

      if (state !== "same" || !lastBuf) {
        // #363: a "same" verdict with no buffer yet can only be frame 0 of a
        // page that starts empty — capture it, expecting nothing on it.
        const expect = state === "same" ? { empty: true, major: false } : state;
        const { image, buf } = await captureExpected(expect, lastBuf, t);
        lastBuf = buf;
        captured++;
        if (captured === 1) {
          console.log("[OverlayRenderer] First frame:", lastBuf.length, "bytes, size:", image.getSize().width, "x", image.getSize().height, expect.empty ? "(expected empty)" : "(expected content)");
        }
      } else {
        skipped++;
      }

      await writeFrame(lastBuf);

      if (onProgress && i % 10 === 0) {
        onProgress({ frame: i + 1, totalFrames });
      }
    }

    console.log(`[OverlayRenderer] Frame capture complete: ${captured} captured, ${skipped} skipped of ${totalFrames}, ${staleRecaptures} stale re-capture(s)`);
    return { captured, skipped, canceled: false, staleRecaptures };
  }

  /**
   * Capture a single frame at an arbitrary timeline time (seconds) — used by
   * renderThumbnail for the WYSIWYG viewer screenshot. Returns a PNG buffer.
   * Same painted-frame handshake and blank guard as captureFrames (#363).
   * @param {number} t
   * @returns {Promise<Buffer>}
   */
  async function captureFrameAt(t) {
    const state = await seekPainted(t);
    const expect = state === "same" ? { empty: true, major: false } : state;
    const { buf } = await captureExpected(expect, null, t);
    return buf;
  }

  return {
    fps: OVERLAY_FPS,
    totalFrames,
    width,
    height,
    captureFrames,
    captureFrameAt,
    destroy() {
      try { if (!win.isDestroyed()) win.destroy(); } catch (_) {}
    },
  };
}

module.exports = { createOverlaySession };
