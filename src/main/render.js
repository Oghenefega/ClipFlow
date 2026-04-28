const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { renderOverlayFrames, cleanupOverlayFrames } = require("./subtitle-overlay-renderer");
const { getTimelineDuration, visibleSubtitleSegments } = require("../renderer/editor/models/timeMapping");
const { segmentDuration } = require("../renderer/editor/models/segmentModel");

/**
 * Probe a video file for its FPS using ffprobe.
 * @param {string} filePath
 * @returns {Promise<number>} fps (defaults to 30 if probe fails)
 */
function probeFps(filePath) {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=r_frame_rate",
      "-of", "csv=s=x:p=0",
      filePath,
    ]);
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) return resolve(30);
      const parts = stdout.trim().split("/");
      const fps = parts.length === 2
        ? parseInt(parts[0]) / parseInt(parts[1])
        : parseFloat(parts[0]);
      resolve(isNaN(fps) || fps <= 0 ? 30 : Math.round(fps * 100) / 100);
    });
    proc.on("error", () => resolve(30));
  });
}

/**
 * Build FFmpeg filter_complex for NLE segment assembly.
 *
 * Trims each NLE segment from the source file and concatenates them.
 * If overlay frames exist, composites the PNG sequence on top.
 *
 * @param {Array} nleSegments - [{id, sourceStart, sourceEnd}, ...]
 * @param {boolean} hasFrames - Whether overlay PNG frames exist
 * @returns {{ filterComplex: string, mapArgs: string[] }}
 */
function buildNleFilterComplex(nleSegments, hasFrames) {
  const n = nleSegments.length;
  const filters = [];

  if (n === 1) {
    // Single segment: simple trim, no concat needed
    const seg = nleSegments[0];
    filters.push(`[0:v]trim=start=${seg.sourceStart}:end=${seg.sourceEnd},setpts=PTS-STARTPTS[base_v]`);
    filters.push(`[0:a]atrim=start=${seg.sourceStart}:end=${seg.sourceEnd},asetpts=PTS-STARTPTS[base_a]`);
  } else {
    // Multi-segment: trim each + concat
    for (let i = 0; i < n; i++) {
      const seg = nleSegments[i];
      filters.push(`[0:v]trim=start=${seg.sourceStart}:end=${seg.sourceEnd},setpts=PTS-STARTPTS[v${i}]`);
      filters.push(`[0:a]atrim=start=${seg.sourceStart}:end=${seg.sourceEnd},asetpts=PTS-STARTPTS[a${i}]`);
    }
    const concatInputs = Array.from({ length: n }, (_, i) => `[v${i}][a${i}]`).join("");
    filters.push(`${concatInputs}concat=n=${n}:v=1:a=1[base_v][base_a]`);
  }

  if (hasFrames) {
    // Composite overlay PNG sequence on top of assembled video
    filters.push("[1:v]format=rgba[sub]");
    filters.push("[base_v][sub]overlay=0:0:eof_action=pass[out]");
    return {
      filterComplex: filters.join(";"),
      mapArgs: ["-map", "[out]", "-map", "[base_a]"],
    };
  }

  return {
    filterComplex: filters.join(";"),
    mapArgs: ["-map", "[base_v]", "-map", "[base_a]"],
  };
}

/**
 * Render a clip with pixel-perfect subtitle/caption burn-in.
 *
 * NLE-aware: assembles the final video from source file + NLE segments using
 * FFmpeg trim/concat, then composites subtitle overlay frames on top.
 *
 * Lazy-cut (#76): nleSegments + sourceFile is the canonical render input.
 * Legacy fallback to clipData.filePath only kicks in when sourceFile is gone
 * AND a pre-cut clip MP4 exists on disk (session-31-era projects). Anything
 * else throws — we don't want to silently render the wrong range.
 *
 * @param {object} clipData - Clip object with nleSegments, subtitles, captions, styles
 * @param {object} projectData - Project with sourceFile, sourceDuration
 * @param {string} outputPath - Final output MP4 path
 * @param {object} options - { subtitleStyle, captionStyle, captionSegments, onProgress }
 * @returns {Promise<{success, path, duration}>}
 */
function renderClip(clipData, projectData, outputPath, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const { onProgress } = options;
      const nleSegments = clipData.nleSegments || [];
      const sourceFile = projectData.sourceFile;
      const sourceOk = sourceFile && fs.existsSync(sourceFile);
      const useNle = nleSegments.length > 0 && sourceOk;

      // Resolve source: prefer NLE (source + segments). Only fall back to a
      // legacy clip MP4 if the source has gone offline. If neither path is
      // viable, fail loudly — never silently produce a wrong-range render.
      let srcFile;
      if (useNle) {
        srcFile = sourceFile;
        console.log("[Render] Using NLE path (source + nleSegments)");
      } else if (clipData.filePath && fs.existsSync(clipData.filePath)) {
        srcFile = clipData.filePath;
        console.log(`[Render] Falling back to legacy clip MP4 (source ${sourceOk ? "ok" : "offline"}, no nleSegments=${nleSegments.length === 0})`);
      } else {
        return reject(new Error(
          `Cannot render clip: no nleSegments and no legacy clip file. ` +
          `sourceFile=${sourceFile || "(none)"} exists=${sourceOk}, ` +
          `clip.filePath=${clipData.filePath || "(none)"}, nleSegments=${nleSegments.length}`
        ));
      }

      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      // Timeline duration from NLE segments, or fall back to clip boundary math
      const timelineDuration = useNle
        ? getTimelineDuration(nleSegments)
        : ((clipData.endTime || 0) - (clipData.startTime || 0));

      // Probe source FPS for output — preserves 60fps recordings
      const sourceFps = await probeFps(srcFile);
      console.log("[Render] Source FPS:", sourceFps);

      // ── Subtitle segments ──
      // EditorLayout pre-maps subtitles to timeline time for single-clip render.
      // For batch render (from disk), subtitles may still be source-absolute —
      // detect via _format marker and map here as a safety net.
      let subtitleSegments = [];
      if (Array.isArray(clipData.subtitles)) {
        subtitleSegments = clipData.subtitles;
      } else if (clipData.subtitles) {
        if (clipData.subtitles.sub1) subtitleSegments.push(...clipData.subtitles.sub1);
        if (clipData.subtitles.sub2) subtitleSegments.push(...clipData.subtitles.sub2);
      }

      // If subtitles are source-absolute and we have NLE segments, map to timeline time.
      // EditorLayout already does this for single-clip render, but batch render needs it too.
      const isSourceAbsolute = clipData.subtitles?._format === "source-absolute";
      if (useNle && isSourceAbsolute && subtitleSegments.length > 0) {
        const mapped = visibleSubtitleSegments(subtitleSegments, nleSegments);
        subtitleSegments = mapped.map((seg) => ({
          ...seg,
          startSec: seg.timelineStartSec,
          endSec: seg.timelineEndSec,
          words: (seg.words || []).map((w) => ({
            ...w,
            start: w.timelineStart !== undefined ? w.timelineStart : w.start,
            end: w.timelineEnd !== undefined ? w.timelineEnd : w.end,
          })),
        }));
        console.log("[Render] Mapped", mapped.length, "subtitles from source-absolute to timeline time");
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
          syncOffset: clipData.syncOffset || 0,
          // NLE mode: subtitles are already in timeline time (0-based),
          // so clipStartTime=0 and duration drives frame count
          clipStartTime: useNle ? 0 : (clipData.startTime || 0),
          clipEndTime: useNle ? timelineDuration : (clipData.endTime || 0),
          timelineDuration: useNle ? timelineDuration : 0, // explicit duration for NLE (skips file probe)
          tempDir,
          sourceFile: useNle ? null : srcFile, // NLE: skip duration probe (uses timelineDuration)
          resolutionProbeFile: srcFile, // always pass source for resolution probing
          onProgress: (p) => {
            if (onProgress) {
              onProgress({ stage: "subtitles", pct: Math.round(p.pct * 0.4), detail: p.detail });
            }
          },
        });
      }

      // Phase 2: FFmpeg render
      if (onProgress) {
        onProgress({ stage: "rendering", pct: 40, detail: "Starting video render..." });
      }

      const args = ["-y"];

      // Input 0: source file (full recording for NLE, pre-cut clip for fallback)
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

      // Build filter_complex
      if (useNle) {
        // NLE mode: trim/concat segments from source + overlay
        const { filterComplex, mapArgs } = buildNleFilterComplex(nleSegments, hasFrames);
        args.push("-filter_complex", filterComplex);
        args.push(...mapArgs);
      } else if (hasFrames) {
        // Fallback: simple overlay on pre-cut clip (legacy behavior)
        args.push(
          "-filter_complex",
          "[1:v]format=rgba[sub];[0:v][sub]overlay=0:0:eof_action=pass[out]",
          "-map", "[out]",
          "-map", "0:a?"
        );
      }

      // Output encoding — force source FPS to prevent 60fps→25fps drops.
      // Encoder selection comes from clipCutEncoder setting (auto/gpu/cpu),
      // resolved by the caller. Lazy-cut (#76) moved this from AI-pipeline-time
      // to publish-time, so the user's GPU pick is honored here.
      const renderEncoder = options.encoder === "nvenc" ? "nvenc" : "x264";
      args.push(
        "-r", String(Math.round(sourceFps)),
        ...require("./ffmpeg").buildEncoderArgs(renderEncoder),
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        outputPath
      );
      console.log(`[Render] Encoder: ${renderEncoder === "nvenc" ? "NVENC" : "x264"}`);

      console.log("[Render] FFmpeg args:", args.join(" "));

      // Spawn FFmpeg
      const proc = spawn("ffmpeg", args);
      let stderr = "";

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
        if (onProgress && timelineDuration > 0) {
          const timeMatch = data.toString().match(/time=(\d+):(\d+):(\d+\.?\d*)/);
          if (timeMatch) {
            const h = parseInt(timeMatch[1]);
            const m = parseInt(timeMatch[2]);
            const s = parseFloat(timeMatch[3]);
            const currentSec = h * 3600 + m * 60 + s;
            const pct = Math.min(99, 40 + Math.round((currentSec / timelineDuration) * 59));
            onProgress({ stage: "rendering", pct, detail: `${Math.round(currentSec)}s / ${Math.round(timelineDuration)}s` });
          }
        }
      });

      proc.on("close", (code) => {
        cleanupOverlayFrames(tempDir);

        if (code !== 0) {
          console.error("[Render] FFmpeg failed:", stderr.slice(-500));
          return reject(new Error(`ffmpeg render failed (code ${code}): ${stderr.slice(-500)}`));
        }
        resolve({ success: true, path: outputPath, duration: timelineDuration });
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
        encoder: options.encoder,
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
