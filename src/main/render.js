const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { renderOverlayFrames, cleanupOverlayFrames } = require("./subtitle-overlay-renderer");

/**
 * Render a clip with pixel-perfect subtitle/caption burn-in.
 *
 * Uses an offscreen Electron BrowserWindow to render subtitle/caption overlays
 * as PNG frames using the same CSS engine as the editor preview, then composites
 * them onto the source video with FFmpeg using image2 input.
 *
 * @param {object} clipData - Clip object with subtitles, captions, styles, etc.
 * @param {object} projectData - Project with sourceFile, transcription
 * @param {string} outputPath - Final output MP4 path
 * @param {object} options - { subtitleStyle, captionStyle, captionSegments, onProgress }
 * @returns {Promise<{success, path, duration}>}
 */
function renderClip(clipData, projectData, outputPath, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const { onProgress } = options;
      const srcFile = clipData.filePath || projectData.sourceFile;

      if (!srcFile || !fs.existsSync(srcFile)) {
        return reject(new Error(`Source file not found: ${srcFile}`));
      }

      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const clipDuration = (clipData.endTime || 0) - (clipData.startTime || 0);

      // Build subtitle segments from clip data
      // Editor saves as flat array; pipeline saves as { sub1: [], sub2: [] }
      let subtitleSegments = [];
      if (Array.isArray(clipData.subtitles)) {
        subtitleSegments = clipData.subtitles;
      } else if (clipData.subtitles) {
        if (clipData.subtitles.sub1) subtitleSegments.push(...clipData.subtitles.sub1);
        if (clipData.subtitles.sub2) subtitleSegments.push(...clipData.subtitles.sub2);
      }

      // Caption segments
      const captionSegments = options.captionSegments || clipData.captionSegments || [];

      // Check if we have any overlay content
      const hasOverlay = subtitleSegments.length > 0 || captionSegments.length > 0;

      const tempDir = outputPath.replace(/\.[^.]+$/, "_overlay_tmp");
      let overlayResult = null;

      if (hasOverlay) {
        // Phase 1: Render overlay frames using offscreen BrowserWindow
        if (onProgress) {
          onProgress({ stage: "subtitles", pct: 0, detail: "Rendering subtitle overlay..." });
        }

        overlayResult = await renderOverlayFrames({
          subtitleSegments,
          subtitleStyle: options.subtitleStyle || clipData.subtitleStyle || {},
          captionSegments,
          captionStyle: options.captionStyle || clipData.captionStyle || {},
          clipStartTime: clipData.startTime || 0,
          clipEndTime: clipData.endTime || 0,
          tempDir,
          sourceFile: srcFile,
          onProgress: (p) => {
            if (onProgress) {
              // Subtitle rendering is 0-40% of total progress
              onProgress({ stage: "subtitles", pct: Math.round(p.pct * 0.4), detail: p.detail });
            }
          },
        });
      }

      // Phase 2: FFmpeg render with overlay compositing
      if (onProgress) {
        onProgress({ stage: "rendering", pct: 40, detail: "Starting video render..." });
      }

      const args = ["-y"];

      // Input 0: source video
      args.push("-i", srcFile);

      // Input 1: overlay PNG sequence (if we have subtitles/captions)
      const hasFrames = overlayResult && overlayResult.totalFrames > 0;
      if (hasFrames) {
        const framePattern = path.join(tempDir, "frame_%05d.png").replace(/\\/g, "/");
        args.push(
          "-framerate", String(overlayResult.fps),
          "-i", framePattern
        );
      }

      // Build filter complex
      if (hasFrames) {
        // Overlay the PNG sequence on top of the source video
        // The PNG frames are already rendered at the source video resolution
        args.push(
          "-filter_complex",
          "[1:v]format=rgba[sub];[0:v][sub]overlay=0:0:eof_action=pass[out]",
          "-map", "[out]",
          "-map", "0:a?"
        );
      }

      // Output encoding
      args.push(
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        outputPath
      );

      console.log("[Render] FFmpeg args:", args.join(" "));

      // Spawn FFmpeg
      const proc = spawn("ffmpeg", args);
      let stderr = "";

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
        if (onProgress && clipDuration > 0) {
          const timeMatch = data.toString().match(/time=(\d+):(\d+):(\d+\.?\d*)/);
          if (timeMatch) {
            const h = parseInt(timeMatch[1]);
            const m = parseInt(timeMatch[2]);
            const s = parseFloat(timeMatch[3]);
            const currentSec = h * 3600 + m * 60 + s;
            const pct = Math.min(99, 40 + Math.round((currentSec / clipDuration) * 59));
            onProgress({ stage: "rendering", pct, detail: `${Math.round(currentSec)}s / ${Math.round(clipDuration)}s` });
          }
        }
      });

      proc.on("close", (code) => {
        // Clean up temp overlay files
        cleanupOverlayFrames(tempDir);

        if (code !== 0) {
          console.error("[Render] FFmpeg failed:", stderr.slice(-500));
          return reject(new Error(`ffmpeg render failed (code ${code}): ${stderr.slice(-500)}`));
        }
        resolve({ success: true, path: outputPath, duration: clipDuration });
      });

      proc.on("error", (err) => {
        cleanupOverlayFrames(tempDir);
        reject(new Error(`ffmpeg spawn failed: ${err.message}`));
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Batch render multiple clips from a project.
 */
async function batchRender(clips, projectData, outputDir, options = {}) {
  const results = [];
  const total = clips.length;

  for (let i = 0; i < total; i++) {
    const clip = clips[i];
    const fileName = `${clip.title || `clip_${clip.id}`}.mp4`
      .replace(/[<>:"/\\|?*]/g, "_");
    const outputPath = path.join(outputDir, fileName);

    if (options.onProgress) {
      options.onProgress({
        stage: "rendering",
        pct: Math.round((i / total) * 100),
        detail: `Rendering clip ${i + 1} of ${total}`,
        clipId: clip.id,
      });
    }

    try {
      const result = await renderClip(clip, projectData, outputPath, {
        subtitleStyle: options.subtitleStyle || clip.subtitleStyle,
        captionStyle: options.captionStyle || clip.captionStyle,
        captionSegments: clip.captionSegments || [],
        onProgress: (p) => {
          if (options.onProgress) {
            const overallPct = Math.round(((i + p.pct / 100) / total) * 100);
            options.onProgress({ ...p, pct: overallPct, detail: `Clip ${i + 1}/${total}: ${p.detail}` });
          }
        },
      });
      results.push({ clipId: clip.id, success: true, path: result.path });
    } catch (err) {
      results.push({ clipId: clip.id, success: false, error: err.message });
    }
  }

  return results;
}

module.exports = {
  renderClip,
  batchRender,
};
