const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { renderOverlayFrames, cleanupOverlayFrames } = require("./subtitle-overlay-renderer");
const { getTimelineDuration, visibleSubtitleSegments } = require("../renderer/editor/models/timeMapping");
const { segmentDuration } = require("../renderer/editor/models/segmentModel");
const { resolveClipSubtitles } = require("../renderer/editor/utils/resolveSubtitles");
const { resolveReframeStyle, bgBoxblurRadius, bgSourceWindow } = require("../renderer/editor/utils/reframeStyle");

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
 * Validate a single reframe crop rect — all four fields must be finite
 * numbers and w/h must be positive (#164).
 * @param {object} rect - {x, y, w, h}
 * @returns {boolean}
 */
function isValidReframeRect(rect) {
  return !!rect
    && Number.isFinite(rect.x) && Number.isFinite(rect.y)
    && Number.isFinite(rect.w) && Number.isFinite(rect.h)
    && rect.w > 0 && rect.h > 0;
}

/**
 * Reframe is "active" only when both crop rects are present and valid;
 * anything else (null, partial, corrupt) is treated as no reframe (#164).
 * @param {object|null|undefined} reframe - { camRect, gameRect }
 * @returns {boolean}
 */
function isReframeActive(reframe) {
  return !!reframe && isValidReframeRect(reframe.camRect) && isValidReframeRect(reframe.gameRect);
}

/**
 * Round a crop rect to integer pixels and clamp it inside the source frame
 * so a stale/miscalibrated layout can't hand FFmpeg an out-of-range crop
 * (#164). Falls back to rounding only when source dimensions are unknown.
 */
function clampReframeRect(rect, maxW, maxH) {
  const w = Math.max(2, Math.min(Math.round(rect.w), maxW));
  const h = Math.max(2, Math.min(Math.round(rect.h), maxH));
  const x = Math.max(0, Math.min(Math.round(rect.x), maxW - w));
  const y = Math.max(0, Math.min(Math.round(rect.y), maxH - h));
  return { x, y, w, h };
}

/**
 * Compute clamped integer crop rects + vertical band heights for the
 * reframe composite (#164). Returns null when reframe is inactive.
 * @param {object|null|undefined} reframe - { camRect, gameRect } in source pixels
 * @param {number} sourceWidth - probed source width (clamp bound; Infinity if unknown)
 * @param {number} sourceHeight - probed source height
 * @returns {{cam: object, game: object, camBand: number, gameBand: number}|null}
 */
function computeReframeGeometry(reframe, sourceWidth, sourceHeight) {
  if (!isReframeActive(reframe)) return null;

  const maxW = sourceWidth > 0 ? sourceWidth : Infinity;
  const maxH = sourceHeight > 0 ? sourceHeight : Infinity;
  const cam = clampReframeRect(reframe.camRect, maxW, maxH);
  const game = clampReframeRect(reframe.gameRect, maxW, maxH);

  // Even-round so scale=1080:<band> keeps aspect ratio + a valid yuv420p height.
  // Bands overflowing 1920 combined is a calibration-UI bug, not a render error
  // — overlay clips the overflow naturally, so it isn't guarded here.
  const camBand = 2 * Math.round((1080 * cam.h / cam.w) / 2);
  const gameBand = 2 * Math.round((1080 * game.h / game.w) / 2);

  return { cam, game, camBand, gameBand };
}

/**
 * Build FFmpeg filter_complex for NLE segment assembly.
 *
 * Trims each NLE segment from the source file and concatenates them. When
 * reframe is active, bakes the vertical composite (webcam band on top, game
 * band below, blurred game fill underneath) before the overlay step (#164).
 * If overlay frames exist, composites the PNG sequence on top.
 *
 * @param {Array} nleSegments - [{id, sourceStart, sourceEnd}, ...]
 * @param {boolean} hasFrames - Whether overlay PNG frames exist
 * @param {object|null} [reframe] - { camRect, gameRect } in source pixels, or null (#164)
 * @param {number} [sourceWidth] - Probed source width, for reframe crop clamping
 * @param {number} [sourceHeight] - Probed source height, for reframe crop clamping
 * @returns {{ filterComplex: string, mapArgs: string[] }}
 */
function buildNleFilterComplex(nleSegments, hasFrames, reframe, sourceWidth, sourceHeight) {
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

  // #164: reframe branch. Inactive reframe is a no-op — videoLabel stays
  // base_v and the filter string is byte-identical to pre-#164 output.
  let videoLabel = "base_v";
  const geo = computeReframeGeometry(reframe, sourceWidth, sourceHeight);
  if (geo) {
    const { cam, game, camBand, gameBand } = geo;
    const style = resolveReframeStyle(reframe && reframe.style);

    // #164 polish: the game band's bottom edge alpha-fades into the bg instead
    // of a hard seam. floor(gameBand/4)*2 caps featherH at gameBand/2,
    // so gameBand-featherH can never go negative; the even height also keeps the
    // 4:2:0 crop legal. Skipped when the bands already fill the whole 1920 frame
    // (nothing below to fade into). seamPx derives from the user's seamSize 0-25
    // slider (percent of 1920) instead of a fixed constant; seamSize=10 reproduces
    // the pre-style-controls 192px feather exactly.
    const seamPx = 2 * Math.round((1920 * style.seamSize / 100) / 2);
    const featherH = camBand + gameBand <= 1920 - 4
      ? Math.min(seamPx, Math.floor(gameBand / 4) * 2)
      : 0;

    filters.push(`[base_v]split=3[rf_cam_in][rf_game_in][rf_bg_in]`);
    filters.push(`[rf_cam_in]crop=${cam.w}:${cam.h}:${cam.x}:${cam.y},scale=1080:${camBand}[rf_cam]`);
    filters.push(`[rf_game_in]crop=${game.w}:${game.h}:${game.x}:${game.y},scale=1080:${gameBand}[rf_game]`);
    // Stronger blur + an optional limited-range darken lut so the bg reads as a soft
    // backdrop behind the sharp bands (mirrors style.darken in the preview
    // compositor): luma scales toward 16, chroma toward neutral 128 — the
    // legal-range equivalent of compositing black at style.darken% alpha.
    // format=yuv420p guards the 8-bit lut constants against 10-bit sources.
    // boxblur/lutyuv stages are dropped entirely at blur=0/darken=0 — boxblur
    // rejects a 0 radius, and an identity lutyuv is just wasted decode cost.
    const win = bgSourceWindow(game, style);
    const boxblurRadius = bgBoxblurRadius(style.blur);
    const darkenK = +((1 - style.darken / 100).toFixed(4));
    let bgChain = `crop=${win.w}:${win.h}:${win.x}:${win.y},scale=270:480,`;
    if (boxblurRadius >= 1) bgChain += `boxblur=${boxblurRadius}:2,`;
    bgChain += `scale=1080:1920,format=yuv420p,setsar=1`;
    if (style.darken > 0) bgChain += `,lutyuv=y=16+(val-16)*${darkenK}:u=128+(val-128)*${darkenK}:v=128+(val-128)*${darkenK}`;
    filters.push(`[rf_bg_in]${bgChain}[rf_bg]`);
    filters.push(`[rf_bg][rf_cam]overlay=0:0[rf_t1]`);
    if (featherH >= 8) {
      // geq only runs on the 1080×featherH strip, so per-frame cost is negligible.
      filters.push(`[rf_game]split[rf_g_top_in][rf_g_btm_in]`);
      filters.push(`[rf_g_top_in]crop=1080:${gameBand - featherH}:0:0[rf_g_top]`);
      filters.push(`[rf_g_btm_in]crop=1080:${featherH}:0:${gameBand - featherH},format=yuva444p,geq=lum=lum(X\\,Y):cb=cb(X\\,Y):cr=cr(X\\,Y):a=255*(1-Y/${featherH})[rf_g_btm]`);
      filters.push(`[rf_t1][rf_g_top]overlay=0:${camBand}[rf_t1b]`);
      filters.push(`[rf_t1b][rf_g_btm]overlay=0:${camBand + gameBand - featherH}[rf_t2]`);
    } else {
      filters.push(`[rf_t1][rf_game]overlay=0:${camBand}[rf_t2]`);
    }
    filters.push(`[rf_t2]format=yuv420p[base_out]`);
    videoLabel = "base_out";
  }

  if (hasFrames) {
    // Composite overlay PNG sequence on top of assembled video
    filters.push("[1:v]format=rgba[sub]");
    filters.push(`[${videoLabel}][sub]overlay=0:0:eof_action=pass[out]`);
    return {
      filterComplex: filters.join(";"),
      mapArgs: ["-map", "[out]", "-map", "[base_a]"],
    };
  }

  return {
    filterComplex: filters.join(";"),
    mapArgs: ["-map", `[${videoLabel}]`, "-map", "[base_a]"],
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
// #140: handle to the currently-active single-clip render so a render:cancel IPC
// can halt whichever phase is live (offscreen overlay frame loop or the FFmpeg
// encode). Shape: { canceled, proc, tempDir, outputPath }. null when idle.
let active = null;

/**
 * Cancel the in-progress single-clip render, if any. Sets the cancel flag (read by
 * the overlay frame loop via shouldCancel) and, if FFmpeg is already encoding, kills
 * the process. The render promise then resolves { canceled: true } instead of
 * rejecting — a user cancel is never a "failed" render.
 */
function cancelActiveRender() {
  if (!active) return { canceled: false, reason: "no active render" };
  active.canceled = true;
  if (active.proc) {
    try { active.proc.kill("SIGTERM"); } catch (_) {}
  }
  return { canceled: true };
}

function renderClip(clipData, projectData, outputPath, options = {}) {
  return new Promise(async (resolve, reject) => {
    // #140: register this render so an external render:cancel can halt it.
    active = { canceled: false, proc: null, tempDir: null, outputPath };
    try {
      const { onProgress } = options;
      const nleSegments = clipData.nleSegments || [];
      const sourceFile = projectData.sourceFile;
      const sourceOk = sourceFile && fs.existsSync(sourceFile);
      const useNle = nleSegments.length > 0 && sourceOk;
      const reframeActive = isReframeActive(projectData.reframe); // #164

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
      // EditorLayout pre-maps subtitles to timeline time for single-clip render
      // (passes subtitles as a plain array). For render-from-disk (batch/queue),
      // run the SAME resolver the editor (initSegments) + Projects preview use —
      // resolveClipSubtitles — so the source-priority chain AND the word-repair
      // stack (token-merge → validate → timestamp-clean) are applied identically.
      // #8: render.js previously re-derived raw segments here and skipped that
      // repair, burning whisper subword-splits/dupes into never-opened clips.
      let subtitleSegments = [];
      let subsAreSourceAbsolute = false;
      if (Array.isArray(clipData.subtitles)) {
        // EditorLayout already resolved + mapped these to timeline time.
        subtitleSegments = clipData.subtitles;
      } else {
        // resolveClipSubtitles returns SOURCE-ABSOLUTE, repaired segments
        // {start,end,text,words}. Map start/end → startSec/endSec so the
        // visibleSubtitleSegments NLE mapping (and the overlay) can consume them.
        const resolved = resolveClipSubtitles(clipData, projectData, { includeExtras: false });
        if (resolved.segments.length > 0) {
          subtitleSegments = resolved.segments.map((s) => ({
            startSec: s.start,
            endSec: s.end,
            text: s.text,
            words: s.words,
          }));
          subsAreSourceAbsolute = true;
          console.log(`[Render] Subtitle source: resolveClipSubtitles (${resolved.source}),`, subtitleSegments.length, "segments");
        }
      }

      // Convert source-absolute resolver output to the overlay's clip-relative
      // (0-based) time domain.
      if (useNle && subsAreSourceAbsolute && subtitleSegments.length > 0) {
        // NLE path: map through the segment list (handles trims/reorders).
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
      } else if (!useNle && subsAreSourceAbsolute && subtitleSegments.length > 0) {
        // Legacy fallback renders the pre-cut clip MP4, which starts at 0 — shift
        // source-absolute timestamps back to clip-relative by subtracting the origin.
        const origin = clipData.startTime || 0;
        subtitleSegments = subtitleSegments.map((seg) => ({
          ...seg,
          startSec: (seg.startSec || 0) - origin,
          endSec: (seg.endSec || 0) - origin,
          words: (seg.words || []).map((w) => ({
            ...w,
            start: (w.start ?? 0) - origin,
            end: (w.end ?? 0) - origin,
          })),
        }));
        console.log("[Render] Shifted", subtitleSegments.length, "subtitles to clip-relative time (legacy path)");
      }

      // Caption segments
      const captionSegments = options.captionSegments || clipData.captionSegments || [];

      // Check if we have any overlay content
      const hasOverlay = subtitleSegments.length > 0 || captionSegments.length > 0;

      const tempDir = outputPath.replace(/\.[^.]+$/, "_overlay_tmp");
      if (active) active.tempDir = tempDir;
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
          // #164: reframe bakes a fixed 1080x1920 canvas — target it directly
          // so overlay=0:0 lines up; skips the source-resolution probe.
          ...(reframeActive ? { targetWidth: 1080, targetHeight: 1920 } : {}),
          onProgress: (p) => {
            if (onProgress) {
              onProgress({ stage: "subtitles", pct: Math.round(p.pct * 0.4), detail: p.detail });
            }
          },
          // #140: let the overlay frame loop bail when a cancel is requested.
          shouldCancel: () => active && active.canceled,
        });
      }

      // #140: cancel landed during the overlay phase — no FFmpeg process exists yet.
      // Clean up partial frames and resolve as canceled (never a "failed" render).
      if (active && active.canceled) {
        cleanupOverlayFrames(tempDir);
        active = null;
        return resolve({ canceled: true });
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
        // NLE mode: trim/concat segments from source + overlay (+ reframe #164)
        const { filterComplex, mapArgs } = buildNleFilterComplex(nleSegments, hasFrames, projectData.reframe, projectData.sourceWidth, projectData.sourceHeight);
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
      if (active) active.proc = proc;
      // #140: race — a cancel may have landed between the overlay bail-check above
      // and this spawn, before active.proc was set. Kill immediately if so.
      if (active && active.canceled) {
        try { proc.kill("SIGTERM"); } catch (_) {}
      }
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

        // #140: user canceled — the kill fired this close with a non-zero/null code.
        // Resolve as canceled (not "failed") and delete any partial output file.
        if (active && active.canceled) {
          active = null;
          try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (_) {}
          return resolve({ canceled: true });
        }
        active = null;

        if (code !== 0) {
          console.error("[Render] FFmpeg failed:", stderr.slice(-500));
          return reject(new Error(`ffmpeg render failed (code ${code}): ${stderr.slice(-500)}`));
        }
        resolve({ success: true, path: outputPath, duration: timelineDuration });
      });

      proc.on("error", (err) => {
        cleanupOverlayFrames(tempDir);
        if (active && active.canceled) {
          active = null;
          return resolve({ canceled: true });
        }
        active = null;
        reject(new Error(`ffmpeg spawn failed: ${err.message}`));
      });
    } catch (err) {
      active = null;
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
  cancelActiveRender,
  buildNleFilterComplex, // #164: exported as a seam for the render-args verification harness
};
