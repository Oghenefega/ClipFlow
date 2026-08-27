const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
// #251: bundled-first FFmpeg resolution (resources/ffmpeg/ → PATH fallback).
const { FFMPEG_BIN, FFPROBE_BIN } = require("./app-paths");
const { createOverlaySession } = require("./subtitle-overlay-renderer");
const { getTimelineDuration, visibleSubtitleSegments, timelineToSource } = require("../renderer/editor/models/timeMapping");
const { resolvePlacements } = require("../renderer/editor/models/audioPlacements");
const { resolveMediaPlacements, DEFAULT_VIDEO_VOLUME } = require("../renderer/editor/models/mediaPlacements");
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
    const proc = spawn(FFPROBE_BIN, [
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
 * Probe a video file for its frame width (#310). Overlay sizes are percentages
 * of the OUTPUT frame, and without reframe the output IS the source frame — a
 * project saved before source dimensions were recorded would otherwise have to
 * guess. Only called on that path, so no existing render's args change.
 * @param {string} filePath
 * @returns {Promise<number>} width in px, or 0 if the probe fails
 */
function probeWidth(filePath) {
  return new Promise((resolve) => {
    const proc = spawn(FFPROBE_BIN, [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width",
      "-of", "csv=p=0",
      filePath,
    ]);
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.on("close", (code) => {
      const w = parseInt(stdout.trim(), 10);
      resolve(code !== 0 || isNaN(w) || w <= 0 ? 0 : w);
    });
    proc.on("error", () => resolve(0));
  });
}

/**
 * How long is this video file, in seconds (#318)?
 *
 * A video overlay's trim window is clamped to its own length by the model — but
 * only when the length is KNOWN. A placement whose duration was never probed
 * (`durationSec: null`) escapes every clamp, and the export is where that stops
 * being harmless: `trim` past EOF freezes the picture on the last frame while
 * the audio runs out early, so the file plays nothing like the popover claims.
 * The file on disk is the authority here, same reasoning as probeHasAudio.
 * @param {string} filePath
 * @returns {Promise<number>} seconds, or 0 when the probe can't say
 */
function probeDurationSec(filePath) {
  return new Promise((resolve) => {
    const proc = spawn(FFPROBE_BIN, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      filePath,
    ]);
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.on("close", (code) => {
      const d = parseFloat(stdout.trim());
      resolve(code !== 0 || isNaN(d) || d <= 0 ? 0 : d);
    });
    proc.on("error", () => resolve(0));
  });
}

/**
 * Does this file carry an audio stream (#311)? A video overlay's sound is mixed
 * in by referencing [N:a], and FFmpeg fails the whole render if that stream
 * doesn't exist — so a silent reaction clip has to be spotted BEFORE the graph
 * is built rather than blowing up the export. Probed at render time, not stored
 * on the placement: the file on disk is the authority, and it can be replaced.
 * Rides on ffmpeg.js's probeAudioTracks (which carries a 30s timeout, so a
 * stuck probe can't hang the render) instead of a second hand-rolled ffprobe.
 * @param {string} filePath
 * @returns {Promise<boolean|null>} true/false when the probe answered; null when
 *   the probe itself failed — the caller logs those differently, but both keep
 *   the file out of the mix (referencing a stream that may not exist fails the
 *   whole render).
 */
function probeHasAudio(filePath) {
  return require("./ffmpeg").probeAudioTracks(filePath)
    .then((info) => info.trackCount > 0)
    .catch(() => null);
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
 * Reframe is "active" when gameRect is valid and camRect is either valid or
 * exactly null — null camRect is a game-only layout (#164 B3). Anything else
 * (no reframe, missing key, corrupt rect) is treated as no reframe (#164).
 * @param {object|null|undefined} reframe - { camRect|null, gameRect }
 * @returns {boolean}
 */
function isReframeActive(reframe) {
  return !!reframe
    && (reframe.camRect === null || isValidReframeRect(reframe.camRect))
    && isValidReframeRect(reframe.gameRect);
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
 * reframe composite (#164). Returns null when reframe is inactive. A null
 * camRect (game-only layout, #164 B3) yields cam:null / camBand:0.
 * @param {object|null|undefined} reframe - { camRect|null, gameRect } in source pixels
 * @param {number} sourceWidth - probed source width (clamp bound; Infinity if unknown)
 * @param {number} sourceHeight - probed source height
 * @returns {{cam: object|null, game: object, camBand: number, gameBand: number}|null}
 */
function computeReframeGeometry(reframe, sourceWidth, sourceHeight) {
  if (!isReframeActive(reframe)) return null;

  const maxW = sourceWidth > 0 ? sourceWidth : Infinity;
  const maxH = sourceHeight > 0 ? sourceHeight : Infinity;
  const cam = reframe.camRect === null ? null : clampReframeRect(reframe.camRect, maxW, maxH);
  const game = clampReframeRect(reframe.gameRect, maxW, maxH);

  // Even-round so scale=1080:<band> keeps aspect ratio + a valid yuv420p height.
  // Bands overflowing 1920 combined is a calibration-UI bug, not a render error
  // — overlay clips the overflow naturally, so it isn't guarded here.
  const camBand = cam ? 2 * Math.round((1080 * cam.h / cam.w) / 2) : 0;
  const gameBand = 2 * Math.round((1080 * game.h / game.w) / 2);

  return { cam, game, camBand, gameBand };
}

/**
 * Build FFmpeg filter_complex for NLE segment assembly.
 *
 * Inputs are pre-seeked per segment (`-ss <start> -t <dur>` BEFORE each `-i`,
 * see renderClip): input i already contains exactly segment i's range, so no
 * trim filters are needed — just PTS normalization + concat. This is the fix
 * for whole-recording decode: filter-level trim forced FFmpeg to decode the
 * ENTIRE source (a 13s clip from a 30-min 2560×2880 HEVC recording decoded
 * all 30 minutes on CPU — multi-minute renders + the 40%/99% progress stalls).
 * Input-level seeking jumps straight to each segment's keyframe and decodes
 * only the clip itself.
 *
 * When reframe is active, bakes the vertical composite (webcam band on top,
 * game band below, blurred game fill underneath) before the overlay step (#164).
 * Null camRect = game-only layout (#164 B3): the game band centers vertically
 * (letterboxed over the bg), or fills the frame outright when it spans 1920.
 * If overlay frames exist, composites the PNG sequence on top — the overlay
 * input is input index n (after the n segment inputs).
 *
 * @param {Array} nleSegments - [{id, sourceStart, sourceEnd}, ...]
 * @param {boolean} hasFrames - Whether overlay PNG frames exist
 * @param {object|null} [reframe] - { camRect|null, gameRect } in source pixels, or null (#164)
 * @param {number} [sourceWidth] - Probed source width, for reframe crop clamping
 * @param {number} [sourceHeight] - Probed source height, for reframe crop clamping
 * @param {object} [opts] - { audio: false } builds a video-only graph (single-segment
 *   only — used by renderThumbnail, whose PNG output can't accept audio streams).
 *   { audioAssets } (#202) mixes sound/song inputs into the base audio:
 *   audioAssets = [{ inputIndex, kind, volume, delaySec, trimStart, trimEnd,
 *   durationSec, fadeIn, fadeOut }] — each carries its own file window and
 *   timeline delay, so songs no longer depend on the clip's duration.
 *   With no audioAssets the audio graph is byte-identical to the pre-#202 output.
 *   { sourceMuted: true } (#296) silences the clip's OWN audio while leaving the
 *   picture and the mixed-in sounds alone. Omitted/false is byte-identical too.
 *   { mediaAssets } (#310) composites image/GIF/video overlays under the subtitles:
 *   mediaAssets = [{ inputIndex, mediaType, tlStart, tlEnd, xPct, yPct, wPct,
 *   opacity }], already sorted so the last one drawn is on top. { outputWidth }
 *   is the output frame width used to resolve wPct when reframe is inactive.
 *   With no mediaAssets the video graph is byte-identical to the pre-#310 output.
 *   A mediaType "video" entry (#311) also carries { trimStart, trimEnd } — the
 *   window of the file that plays — plus { volume, muted, hasAudio }: unless it
 *   is muted or silent, its audio is appended to the audioAssets mix below, so
 *   a clip with no video overlays keeps the pre-#311 audio graph exactly.
 * @returns {{ filterComplex: string, mapArgs: string[] }}
 */
function buildNleFilterComplex(nleSegments, hasFrames, reframe, sourceWidth, sourceHeight, opts = {}) {
  const withAudio = opts.audio !== false;
  const n = nleSegments.length;
  const filters = [];

  if (n === 1) {
    // Single segment: input 0 is already the trimmed range — normalize PTS only
    filters.push(`[0:v]setpts=PTS-STARTPTS[base_v]`);
    if (withAudio) filters.push(`[0:a]asetpts=PTS-STARTPTS[base_a]`);
  } else {
    // Multi-segment: each input is one pre-seeked segment — normalize + concat
    for (let i = 0; i < n; i++) {
      filters.push(`[${i}:v]setpts=PTS-STARTPTS[v${i}]`);
      filters.push(`[${i}:a]asetpts=PTS-STARTPTS[a${i}]`);
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

    if (!cam && gameBand >= 1916) {
      // #164 B3 fully-zoomed: no cam and the game band covers the whole 1920
      // frame — one crop+scale, no bg/feather stages (nothing behind the band
      // is visible). Within ±4px of 1920 the forced scale absorbs rounding
      // slop from near-9:16 rects; taller bands instead crop to the centered
      // 1920 window (scaling those down would visibly distort).
      const fill = gameBand <= 1924
        ? "scale=1080:1920"
        : `scale=1080:${gameBand},crop=1080:1920:0:${(gameBand - 1920) / 2}`;
      filters.push(`[base_v]crop=${game.w}:${game.h}:${game.x}:${game.y},${fill},format=yuv420p,setsar=1[base_out]`);
      videoLabel = "base_out";
    } else {
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
    // #164 B3: with no cam the game band centers vertically in the frame.
    // camBand is 0 there, so cam layouts keep the exact pre-B3 filter text
    // (gameY === camBand) — parity by construction.
    const gameY = cam ? camBand : (1920 - gameBand) / 2;

    if (cam) {
      filters.push(`[base_v]split=3[rf_cam_in][rf_game_in][rf_bg_in]`);
      filters.push(`[rf_cam_in]crop=${cam.w}:${cam.h}:${cam.x}:${cam.y},scale=1080:${camBand}[rf_cam]`);
    } else {
      filters.push(`[base_v]split=2[rf_game_in][rf_bg_in]`);
    }
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
    // With no cam the game band composites straight onto the bg.
    let below = "rf_bg";
    if (cam) {
      filters.push(`[rf_bg][rf_cam]overlay=0:0[rf_t1]`);
      below = "rf_t1";
    }
    if (featherH >= 8) {
      // geq only runs on the 1080×featherH strip, so per-frame cost is negligible.
      filters.push(`[rf_game]split[rf_g_top_in][rf_g_btm_in]`);
      filters.push(`[rf_g_top_in]crop=1080:${gameBand - featherH}:0:0[rf_g_top]`);
      filters.push(`[rf_g_btm_in]crop=1080:${featherH}:0:${gameBand - featherH},format=yuva444p,geq=lum=lum(X\\,Y):cb=cb(X\\,Y):cr=cr(X\\,Y):a=255*(1-Y/${featherH})[rf_g_btm]`);
      filters.push(`[${below}][rf_g_top]overlay=0:${gameY}[rf_t1b]`);
      filters.push(`[rf_t1b][rf_g_btm]overlay=0:${gameY + gameBand - featherH}[rf_t2]`);
    } else {
      filters.push(`[${below}][rf_game]overlay=0:${gameY}[rf_t2]`);
    }
    filters.push(`[rf_t2]format=yuv420p[base_out]`);
    videoLabel = "base_out";
    }
  }

  // #310: composite image/GIF overlays onto the picture, UNDER the subtitle
  // layer (which chains off videoLabel below) and in trackIndex order — the
  // caller hands them already sorted, so the last one drawn sits on top.
  //
  // Position and size are percentages of the OUTPUT frame. Width resolves to
  // pixels here (scale can't reference the main input), but x/y stay as
  // expressions in terms of main_w/main_h and overlay_w/overlay_h, so the
  // overlay's own pixel height never has to be probed: xPct/yPct address its
  // CENTRE at any aspect ratio.
  //
  // A still loops forever (-loop 1) and a GIF loops per its own loop count
  // (-ignore_loop 0 — most loop forever); `enable` is what decides when either
  // is actually on screen. NOTE: overlay (shortest=0) does NOT end with the
  // main input — a secondary stream that still runs extends the output with
  // the main's last frame repeated, so the export's length is bounded in
  // renderClip instead: per-input -t caps plus an output -t at the timeline's
  // length. eof_action=repeat: a GIF whose file
  // says "don't loop" freezes on its last frame when its stream ends — exactly
  // what the preview's <img> does — instead of vanishing mid-block. With no
  // mediaAssets this whole block is skipped and the video graph text is
  // unchanged.
  const mediaAssets = opts.mediaAssets || [];
  if (mediaAssets.length > 0) {
    // Reframe always bakes 1080x1920; otherwise the output IS the source frame.
    const outW = geo ? 1080 : (opts.outputWidth > 0 ? opts.outputWidth : 1080);
    mediaAssets.forEach((m, i) => {
      const tlStart = Math.max(0, m.tlStart || 0);
      const tlEnd = Math.max(tlStart, m.tlEnd || 0);
      const wpx = Math.max(2, 2 * Math.round((outW * (m.wPct || 40) / 100) / 2));
      let chain = "";
      // A GIF's animation should start when its block does, not at second 0.
      if (m.mediaType === "gif" && tlStart > 0) {
        chain += `setpts=PTS-STARTPTS+${+tlStart.toFixed(3)}/TB,`;
      }
      // #311: a video plays a WINDOW of its file at a moment on the timeline.
      // trim cuts the window out, setpts then rebases it to that moment —
      // mandatory in that order, because trim keeps the source timestamps.
      if (m.mediaType === "video") {
        const vs = Math.max(0, m.trimStart || 0);
        const ve = Math.max(vs, m.trimEnd != null ? m.trimEnd : vs);
        if (ve > vs) chain += `trim=${+vs.toFixed(3)}:${+ve.toFixed(3)},`;
        chain += `setpts=PTS-STARTPTS+${+tlStart.toFixed(3)}/TB,`;
      }
      chain += `format=rgba,scale=${wpx}:-1`;
      const opacity = Math.max(0, Math.min(1, m.opacity == null ? 1 : m.opacity));
      if (opacity < 1) chain += `,colorchannelmixer=aa=${+opacity.toFixed(3)}`;
      filters.push(`[${m.inputIndex}:v]${chain}[movl${i}]`);
      const x = `(main_w*${+(m.xPct == null ? 50 : m.xPct).toFixed(3)}/100)-(overlay_w/2)`;
      const y = `(main_h*${+(m.yPct == null ? 50 : m.yPct).toFixed(3)}/100)-(overlay_h/2)`;
      filters.push(
        `[${videoLabel}][movl${i}]overlay=x='${x}':y='${y}':` +
        `enable='between(t,${+tlStart.toFixed(3)},${+tlEnd.toFixed(3)})':eof_action=repeat[movid${i}]`
      );
      videoLabel = `movid${i}`;
    });
  }

  // #202: mix sound/song placements into the base audio. One chain shape for
  // both kinds: normalize to a common rate/layout (amix requires it), cut out
  // the file window that plays, rebase its timestamps, fade (songs), level,
  // then delay to its timeline position. duration=first keeps the output
  // exactly as long as the base track; normalize=0 stops amix from ducking
  // everything by 1/N. When no assets are given this whole block is skipped and
  // the audio graph text is unchanged.
  // #296: the Audio lane's mute. volume=0 rather than dropping the stream —
  // it stays the right length, so the amix below (duration=first) still ends
  // where the picture does, and a clip with no sounds still gets a valid,
  // silent audio track instead of none at all.
  let baseAudio = "base_a";
  if (withAudio && opts.sourceMuted) {
    filters.push(`[base_a]volume=0[base_am]`);
    baseAudio = "base_am";
  }
  // #311: a video overlay's own sound joins that same mix, as one more entry —
  // it needs exactly what an SFX needs (a file window, a level, a delay to its
  // timeline position), so it reuses the chain below rather than growing a
  // second one. Its input is the media input already handed out above, so no
  // index moves. `hasAudio: false` (probed by the caller) drops a silent file
  // before it can reference a stream that isn't there. A muted overlay is left
  // out entirely rather than mixed at volume 0 — nothing else depends on its
  // length, so there's no reason to pay for decoding it.
  const videoAudioAssets = withAudio
    ? mediaAssets
        .filter((m) => m.mediaType === "video" && m.muted !== true && m.hasAudio !== false)
        .map((m) => ({
          inputIndex: m.inputIndex,
          trimStart: m.trimStart,
          trimEnd: m.trimEnd,
          volume: m.volume == null ? DEFAULT_VIDEO_VOLUME : m.volume,
          delaySec: m.tlStart,
        }))
    : [];
  let audioLabel = baseAudio;
  const audioAssets = withAudio
    ? [...(opts.audioAssets || []), ...videoAudioAssets]
    : [];
  if (audioAssets.length > 0) {
    const mixinLabels = [];
    audioAssets.forEach((a, i) => {
      let chain = "aformat=sample_rates=48000:channel_layouts=stereo";
      const trimStart = Math.max(0, a.trimStart || 0);
      const trimEnd = a.trimEnd != null ? a.trimEnd : (a.durationSec || 0);
      const len = Math.max(0, trimEnd - trimStart);
      if (len > 0) {
        // asetpts is MANDATORY after atrim: atrim keeps the source timestamps,
        // so adelay would otherwise stack on top and the sound would land late.
        chain += `,atrim=${+trimStart.toFixed(3)}:${+trimEnd.toFixed(3)},asetpts=PTS-STARTPTS`;
      }
      // Fades apply to BOTH kinds (#209) — only the old gate was music-specific.
      // Clamped to what actually plays: a saved fade outlives the trim that
      // shortened its block, and an over-long fade-in ramps through the whole
      // sound without ever reaching full level.
      const fadeIn = Math.min(Math.max(0, a.fadeIn || 0), len);
      const fadeOut = Math.min(Math.max(0, a.fadeOut || 0), len);
      if (fadeIn > 0) chain += `,afade=t=in:st=0:d=${+fadeIn.toFixed(3)}`;
      if (fadeOut > 0) chain += `,afade=t=out:st=${+(len - fadeOut).toFixed(3)}:d=${+fadeOut.toFixed(3)}`;
      chain += `,volume=${Math.max(0, Math.min(1, a.volume ?? 1))}`;
      const delayMs = Math.round((a.delaySec || 0) * 1000);
      if (delayMs > 0) chain += `,adelay=${delayMs}:all=1`;
      filters.push(`[${a.inputIndex}:a]${chain}[mixin${i}]`);
      mixinLabels.push(`[mixin${i}]`);
    });
    filters.push(`[${baseAudio}]aformat=sample_rates=48000:channel_layouts=stereo[base_af]`);
    filters.push(`[base_af]${mixinLabels.join("")}amix=inputs=${audioAssets.length + 1}:duration=first:normalize=0[mix_a]`);
    audioLabel = "mix_a";
  }

  const audioMap = withAudio ? ["-map", `[${audioLabel}]`] : [];
  if (hasFrames) {
    // Composite overlay PNG stream on top of assembled video.
    // Overlay is input n — it comes after the n per-segment source inputs.
    filters.push(`[${n}:v]format=rgba[sub]`);
    filters.push(`[${videoLabel}][sub]overlay=0:0:eof_action=pass[out]`);
    return {
      filterComplex: filters.join(";"),
      mapArgs: ["-map", "[out]", ...audioMap],
    };
  }

  return {
    filterComplex: filters.join(";"),
    mapArgs: ["-map", `[${videoLabel}]`, ...audioMap],
  };
}

/**
 * Resolve a clip's subtitles into timeline-time (0-based) segments for the
 * overlay renderer. EditorLayout passes an already-mapped array; render-from-
 * disk paths (batch/queue) run the SAME resolver the editor (initSegments) +
 * Projects preview use — resolveClipSubtitles — so the source-priority chain
 * AND the word-repair stack (token-merge → validate → timestamp-clean) are
 * applied identically. #8: render.js previously re-derived raw segments and
 * skipped that repair, burning whisper subword-splits/dupes into never-opened
 * clips. Shared by renderClip and renderThumbnail so both paint identical text.
 *
 * @returns {Array} timeline-time subtitle segments
 */
function resolveTimelineSubtitles(clipData, projectData, useNle, nleSegments) {
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
  return subtitleSegments;
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
// encode). Shape: { canceled, proc, outputPath }. null when idle.
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
    active = { canceled: false, proc: null, outputPath };
    // Hoisted so the catch block can destroy the offscreen window on failure.
    let overlaySession = null;
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

      // ── Subtitle segments ── (shared with renderThumbnail)
      const subtitleSegments = resolveTimelineSubtitles(clipData, projectData, useNle, nleSegments);

      // Caption segments
      const captionSegments = options.captionSegments || clipData.captionSegments || [];

      // ── #202: sound/song placements ── resolve each to a timeline delay
      // through the SAME helper the editor and the preview use, so what he
      // heard in the preview is what gets encoded. A sound whose footage moment
      // was trimmed away is skipped (songs clamp forward instead — see
      // models/audioPlacements.js). A missing sound file fails the render
      // loudly — never a silently different-sounding export.
      // #296: a disabled sound, or one on a switched-off lane, never reaches
      // the graph. Filtered BEFORE the missing-file check below on purpose: a
      // sound the user has already switched off must not fail their render.
      const lanes = clipData.laneEnabled || {};
      const allPlacements = Array.isArray(clipData.sfx) ? clipData.sfx : [];
      const sfxPlacements = allPlacements.filter(
        (p) => p.enabled !== false && lanes[p.kind] !== false
      );
      if (sfxPlacements.length !== allPlacements.length) {
        console.log(`[Render] ${allPlacements.length - sfxPlacements.length} sound(s) disabled — excluded from the render`);
      }
      let activeAudioAssets = [];
      if (sfxPlacements.length > 0 && useNle) {
        for (const p of sfxPlacements) {
          if (!p.path || !fs.existsSync(p.path)) {
            return reject(new Error(
              `Sound "${p.name || p.assetId}" is missing on disk (${p.path || "no path"}) — ` +
              `remove it from the clip or restore the file, then render again.`
            ));
          }
        }
        activeAudioAssets = resolvePlacements(sfxPlacements, nleSegments)
          .map((p) => ({ ...p, delaySec: p.tlStart }));
        console.log(`[Render] Audio assets: ${activeAudioAssets.length} of ${sfxPlacements.length} placements active`);
      } else if (sfxPlacements.length > 0) {
        console.warn("[Render] Clip has sound placements but is rendering via the legacy (no-NLE) path — sounds skipped");
      }

      // ── #310: image/GIF overlays ── same discipline as the sounds above:
      // switched-off overlays (and a switched-off Media lane) are filtered out
      // FIRST, so an overlay the user already turned off can never fail their
      // render; anything still in play whose file is gone fails loudly rather
      // than exporting a silently different picture.
      const allMedia = Array.isArray(clipData.media) ? clipData.media : [];
      const mediaPlacements = lanes.media === false
        ? []
        : allMedia.filter((p) => p.enabled !== false);
      if (mediaPlacements.length !== allMedia.length) {
        console.log(`[Render] ${allMedia.length - mediaPlacements.length} overlay(s) disabled — excluded from the render`);
      }
      let activeMediaAssets = [];
      let mediaOutputWidth = 0;
      if (mediaPlacements.length > 0 && useNle) {
        for (const p of mediaPlacements) {
          if (!p.path || !fs.existsSync(p.path)) {
            return reject(new Error(
              `Overlay "${p.name || p.assetId}" is missing on disk (${p.path || "no path"}) — ` +
              `remove it from the clip or restore the file, then render again.`
            ));
          }
        }
        activeMediaAssets = resolveMediaPlacements(mediaPlacements, nleSegments);
        // Overlay sizes are percentages of the output frame. Reframe bakes
        // 1080x1920; otherwise the output is the source frame, so fall back to
        // a probe when the project never recorded its dimensions.
        if (!reframeActive && activeMediaAssets.length > 0) {
          mediaOutputWidth = projectData.sourceWidth > 0
            ? projectData.sourceWidth
            : await probeWidth(srcFile);
        }
        // #318: a video overlay whose duration was never probed carries no file
        // length, so the model had nothing to clamp its trim window to and it can
        // run past the end of its own file. Ask the file, once, and re-clamp both
        // the window and the on-screen span together — leaving tlEnd long is what
        // turns into a frozen last frame (eof_action=repeat) over silence.
        for (let i = 0; i < activeMediaAssets.length; i++) {
          const m = activeMediaAssets[i];
          if (m.mediaType !== "video" || m.durationSec > 0) continue;
          const fileLen = await probeDurationSec(m.path);
          if (fileLen <= 0) {
            console.warn(`[Render] Overlay "${m.name || m.assetId}" duration probe FAILED — trim window left as saved`);
            continue;
          }
          const vs = Math.max(0, m.trimStart || 0);
          if (vs >= fileLen) {
            console.warn(`[Render] Overlay "${m.name || m.assetId}" starts past the end of its own file (${vs.toFixed(2)}s of ${fileLen.toFixed(2)}s) — skipped`);
            activeMediaAssets[i] = null;
            continue;
          }
          const ve = Math.min(m.trimEnd != null ? m.trimEnd : fileLen, fileLen);
          if (ve < (m.trimEnd ?? Infinity)) {
            console.log(`[Render] Overlay "${m.name || m.assetId}" clamped to its file: ${(m.trimEnd - ve).toFixed(2)}s trimmed off the end`);
          }
          activeMediaAssets[i] = { ...m, durationSec: fileLen, trimStart: vs, trimEnd: ve, tlEnd: m.tlStart + (ve - vs) };
        }
        activeMediaAssets = activeMediaAssets.filter(Boolean);

        // #311: a video overlay's sound only joins the mix if the file has one.
        // Probed here, once per unmuted video, so a silent reaction clip is a
        // silent overlay rather than a failed export.
        for (let i = 0; i < activeMediaAssets.length; i++) {
          const m = activeMediaAssets[i];
          if (m.mediaType !== "video" || m.muted === true) continue;
          const hasAudio = await probeHasAudio(m.path);
          activeMediaAssets[i] = { ...m, hasAudio: hasAudio === true };
          if (hasAudio === false) console.log(`[Render] Overlay "${m.name || m.assetId}" has no audio track — mixing skipped`);
          else if (hasAudio === null) console.warn(`[Render] Overlay "${m.name || m.assetId}" audio probe FAILED — mixing skipped (the file may still have sound)`);
        }
        console.log(`[Render] Overlays: ${activeMediaAssets.length} of ${mediaPlacements.length} placements active`);
      } else if (mediaPlacements.length > 0) {
        console.warn("[Render] Clip has overlays but is rendering via the legacy (no-NLE) path — overlays skipped");
      }

      // Check if we have any overlay content
      const hasOverlay = subtitleSegments.length > 0 || captionSegments.length > 0;

      if (hasOverlay) {
        // Phase 1: prepare the offscreen overlay window (probes, page load,
        // fonts). Frame capture itself runs concurrently with the FFmpeg
        // encode below — frames stream into FFmpeg's stdin as they're
        // captured, and identical frames re-send the cached PNG.
        if (onProgress) {
          onProgress({ stage: "subtitles", pct: 0, detail: "Preparing subtitle overlay..." });
        }

        overlaySession = await createOverlaySession({
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
          sourceFile: useNle ? null : srcFile, // NLE: skip duration probe (uses timelineDuration)
          resolutionProbeFile: srcFile, // always pass source for resolution probing
          // #164: reframe bakes a fixed 1080x1920 canvas — target it directly
          // so overlay=0:0 lines up; skips the source-resolution probe.
          ...(reframeActive ? { targetWidth: 1080, targetHeight: 1920 } : {}),
        });
      }

      // #140: cancel landed during overlay prep — no FFmpeg process exists yet.
      if (active && active.canceled) {
        if (overlaySession) overlaySession.destroy();
        active = null;
        return resolve({ canceled: true });
      }

      // Phase 2: FFmpeg render (overlay frames stream in concurrently)
      if (onProgress) {
        onProgress({ stage: "rendering", pct: 0, detail: "Starting video render..." });
      }

      // Unified monotonic progress: frame capture and FFmpeg encode both track
      // the same timeline position (pipe backpressure keeps them in lockstep),
      // so report whichever is further along and never go backwards.
      let lastPct = 0;
      const reportPct = (pct, detail) => {
        if (!onProgress) return;
        const clamped = Math.max(0, Math.min(99, pct));
        if (clamped > lastPct) {
          lastPct = clamped;
          onProgress({ stage: "rendering", pct: clamped, detail });
        }
      };

      const args = ["-y"];

      // NLE: one pre-seeked input PER SEGMENT (-ss/-t before -i) so FFmpeg
      // decodes only each segment's range instead of the whole recording.
      // Input-level -ss is frame-accurate when re-encoding (decoder discards
      // frames between the keyframe and the seek point). Fallback keeps the
      // single full-file input (pre-cut clip MP4s are already clip-length).
      if (useNle) {
        for (const seg of nleSegments) {
          args.push(
            "-ss", String(seg.sourceStart),
            "-t", String(Math.max(0.04, seg.sourceEnd - seg.sourceStart)),
            "-i", srcFile
          );
        }
      } else {
        args.push("-i", srcFile);
      }

      // Overlay PNG stream input (if we have subtitles/captions) — PNGs are
      // piped into stdin (image2pipe) as they're captured, no files on disk.
      // Index n in NLE mode (after the n segment inputs), index 1 in fallback.
      const hasFrames = !!overlaySession; // null when there's nothing to capture
      if (hasFrames) {
        args.push(
          "-f", "image2pipe",
          "-framerate", String(overlaySession.fps),
          "-c:v", "png",
          // Frames arrive in bursts (skipped frames are near-instant, captured
          // ones ~100ms) — a deeper input queue avoids demux stalls.
          "-thread_queue_size", "512",
          "-i", "pipe:0"
        );
      }

      // #202: one input per active sound placement, AFTER the overlay pipe so
      // the pipe keeps its established index n. Asset input i = n + pipe + i.
      if (activeAudioAssets.length > 0) {
        const baseIdx = nleSegments.length + (hasFrames ? 1 : 0);
        activeAudioAssets = activeAudioAssets.map((a, i) => {
          args.push("-i", a.path);
          return { ...a, inputIndex: baseIdx + i };
        });
      }

      // #310: one input per active overlay, AFTER the sound inputs so every
      // index already handed out stays put. A still loops (-loop 1) and a GIF
      // loops (-ignore_loop 0); `enable` in the filter decides when each shows.
      // #311: a video gets NEITHER — it's a real clip that plays once, trimmed
      // in the filter graph. Its input carries the audio the mix picks up too,
      // so it never adds an input of its own.
      if (activeMediaAssets.length > 0) {
        const baseIdx = nleSegments.length + (hasFrames ? 1 : 0) + activeAudioAssets.length;
        // The -t caps are LOAD-BEARING, not a nicety: `-loop 1` (a still) and
        // `-ignore_loop 0` (a GIF that loops forever) both make an input that
        // never ends, and overlay's eof_action=repeat (62ee3ee) then keeps the
        // render going forever once the picture has finished — a hang, not a
        // slow export. A still's cap is the timeline's own length; a GIF's
        // stream is then setpts-shifted to its block, so its cap must be
        // shortened by tlStart or the shifted tail outlives the picture
        // (measured: a GIF at 4s on an 8s clip exported 11.9s). A GIF that
        // plays ONCE still ends early and still freezes on its last frame,
        // which is what repeat is for. The output-level -t below is the
        // backstop for every shape.
        activeMediaAssets = activeMediaAssets.map((m, i) => {
          if (m.mediaType === "video") {
            // #311: a real clip that plays once. Seek the INPUT to the trim
            // window (frame-accurate when re-encoding, like the segment inputs
            // above) so a window deep into a long reaction file doesn't decode
            // everything before it — picture AND sound. The graph then sees a
            // pre-cut file, so the window it's handed is rebased to 0:length.
            const vs = Math.max(0, m.trimStart || 0);
            const ve = Math.max(vs, m.trimEnd != null ? m.trimEnd : vs);
            const win = +(ve - vs).toFixed(3);
            if (win > 0) {
              if (vs > 0) args.push("-ss", String(+vs.toFixed(3)));
              args.push("-t", String(win), "-i", m.path);
              return { ...m, inputIndex: baseIdx + i, trimStart: 0, trimEnd: win };
            }
            args.push("-i", m.path);
          } else if (m.mediaType === "gif") {
            args.push("-ignore_loop", "0", "-t",
              String(Math.max(0.04, timelineDuration - Math.max(0, m.tlStart || 0))), "-i", m.path);
          } else {
            args.push("-loop", "1", "-t", String(Math.max(0.04, timelineDuration)), "-i", m.path);
          }
          return { ...m, inputIndex: baseIdx + i };
        });
      }

      // Build filter_complex
      if (useNle) {
        // NLE mode: trim/concat segments from source + overlay (+ reframe #164)
        const { filterComplex, mapArgs } = buildNleFilterComplex(
          nleSegments, hasFrames, projectData.reframe, projectData.sourceWidth, projectData.sourceHeight,
          {
            audioAssets: activeAudioAssets,
            sourceMuted: clipData.sourceAudioMuted === true,
            mediaAssets: activeMediaAssets,
            outputWidth: mediaOutputWidth,
          }
        );
        args.push("-filter_complex", filterComplex);
        args.push(...mapArgs);
      } else if (hasFrames) {
        // Fallback: simple overlay on pre-cut clip (legacy behavior). #296: this
        // path maps the source audio straight through, so a muted Audio lane is
        // not honoured here — same limitation the sound placements already have.
        if (clipData.sourceAudioMuted) {
          console.warn("[Render] Audio lane is muted but this clip is rendering via the legacy (no-NLE) path — source audio kept");
        }
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
        // 128k, not 192k: Meta documents 128 kbps AAC as the Reels audio spec and
        // lists too-high audio bitrate as a publish-failure cause (#185). Every
        // other target (YouTube, TikTok) re-encodes audio well below this anyway.
        "-b:a", "128k",
        "-movflags", "+faststart",
        // #311 review: the export is exactly the timeline, whatever the inputs
        // do. overlay (shortest=0) does NOT stop at the main input's end — it
        // repeats the main's last frame while any secondary stream still runs
        // (measured: a video overlay window past the clip's end exported a 30s
        // file from an 8s timeline). The input caps above bound each input;
        // this bounds the OUTPUT, so no overlay shape can overrun the clip.
        ...(useNle ? ["-t", String(timelineDuration)] : []),
        outputPath
      );
      console.log(`[Render] Encoder: ${renderEncoder === "nvenc" ? "NVENC" : "x264"}`);

      console.log("[Render] FFmpeg args:", args.join(" "));

      // Spawn FFmpeg
      const proc = spawn(FFMPEG_BIN, args);
      if (active) active.proc = proc;
      // #140: race — a cancel may have landed between the overlay bail-check above
      // and this spawn, before active.proc was set. Kill immediately if so.
      if (active && active.canceled) {
        try { proc.kill("SIGTERM"); } catch (_) {}
      }
      let stderr = "";
      let overlayError = null;

      // Stream overlay frames into FFmpeg's stdin concurrently with the encode.
      if (hasFrames) {
        // EPIPE surfaces through write callbacks below; the stream-level error
        // event must have a listener or Node crashes the process.
        proc.stdin.on("error", () => {});

        const writeFrame = (buf) =>
          new Promise((res, rej) => {
            if (!proc.stdin.writable) return rej(new Error("ffmpeg stdin closed"));
            const ok = proc.stdin.write(buf, (err) => { if (err) rej(err); });
            if (ok) res();
            else proc.stdin.once("drain", res); // backpressure: wait for FFmpeg to drain the pipe
          });

        const session = overlaySession;
        (async () => {
          try {
            const result = await session.captureFrames({
              writeFrame,
              // #140: also bail if this render's close handler already ran
              // (active cleared) — e.g. FFmpeg died mid-capture.
              shouldCancel: () => !active || active.canceled,
              onProgress: ({ frame, totalFrames }) =>
                reportPct(
                  Math.round((frame / totalFrames) * 98),
                  `Rendering subtitle frame ${frame}/${totalFrames}`
                ),
            });
            console.log(`[Render] Overlay frames: ${result.captured} captured, ${result.skipped} skipped (identical)${result.canceled ? ", canceled" : ""}`);
          } catch (err) {
            overlayError = err;
            console.error("[Render] Overlay capture failed:", err.message);
            try { proc.kill("SIGTERM"); } catch (_) {}
          } finally {
            // EOF tells FFmpeg the overlay stream is done (eof_action=pass
            // keeps the video going if it ends a hair early).
            try { proc.stdin.end(); } catch (_) {}
            session.destroy();
          }
        })();
      }

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
        if (timelineDuration > 0) {
          const timeMatch = data.toString().match(/time=(\d+):(\d+):(\d+\.?\d*)/);
          if (timeMatch) {
            const h = parseInt(timeMatch[1]);
            const m = parseInt(timeMatch[2]);
            const s = parseFloat(timeMatch[3]);
            const currentSec = h * 3600 + m * 60 + s;
            reportPct(
              Math.round((currentSec / timelineDuration) * 99),
              `${Math.round(currentSec)}s / ${Math.round(timelineDuration)}s`
            );
          }
        }
      });

      proc.on("close", (code) => {
        if (overlaySession) overlaySession.destroy();

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
          const overlayMsg = overlayError ? ` (overlay capture error: ${overlayError.message})` : "";
          return reject(new Error(`ffmpeg render failed (code ${code})${overlayMsg}: ${stderr.slice(-500)}`));
        }
        resolve({ success: true, path: outputPath, duration: timelineDuration });
      });

      proc.on("error", (err) => {
        if (overlaySession) overlaySession.destroy();
        if (active && active.canceled) {
          active = null;
          return resolve({ canceled: true });
        }
        active = null;
        reject(new Error(`ffmpeg spawn failed: ${err.message}`));
      });
    } catch (err) {
      if (overlaySession) overlaySession.destroy();
      active = null;
      reject(err);
    }
  });
}

// batchRender was removed: render:batch (main.js) now enqueues each clip
// through the shared render job queue, so batch and single renders serialize
// through one path instead of two competing loops.

/**
 * Capture a single WYSIWYG frame of a clip as a PNG (session 124: Shorts
 * thumbnails). Runs the exact render pipeline for one moment in time — same
 * reframe composite, same overlay engine — so the PNG is pixel-identical to
 * that frame of the final render.
 *
 * @param {object} clipData - Same shape renderClip receives (editor payload)
 * @param {object} projectData - Project with sourceFile, reframe, source dims
 * @param {number} timelineTime - Playhead position on the editor timeline (s)
 * @param {string} outputPath - Destination .png path
 * @param {object} options - { subtitleStyle, captionStyle, captionSegments }
 * @returns {Promise<{success: true, path: string}>}
 */
async function renderThumbnail(clipData, projectData, timelineTime, outputPath, options = {}) {
  const nleSegments = clipData.nleSegments || [];
  const sourceFile = projectData.sourceFile;
  const sourceOk = sourceFile && fs.existsSync(sourceFile);
  const useNle = nleSegments.length > 0 && sourceOk;
  const reframeActive = isReframeActive(projectData.reframe);

  let srcFile;
  if (useNle) srcFile = sourceFile;
  else if (clipData.filePath && fs.existsSync(clipData.filePath)) srcFile = clipData.filePath;
  else throw new Error("Cannot capture: source recording not found");

  const timelineDuration = useNle
    ? getTimelineDuration(nleSegments)
    : ((clipData.endTime || 0) - (clipData.startTime || 0));
  // Clamp inside the clip so the seek always lands on a decodable frame
  const t = Math.max(0, Math.min(timelineTime || 0, Math.max(0, timelineDuration - 0.05)));
  let sourceTime;
  if (useNle) {
    const mapped = timelineToSource(t, nleSegments);
    sourceTime = mapped && mapped.found ? mapped.sourceTime : (nleSegments[0].sourceStart + t);
  } else {
    sourceTime = (clipData.startTime || 0) + t;
  }

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const subtitleSegments = resolveTimelineSubtitles(clipData, projectData, useNle, nleSegments);
  const captionSegments = options.captionSegments || clipData.captionSegments || [];
  const hasOverlay = subtitleSegments.length > 0 || captionSegments.length > 0;

  // One overlay frame at the playhead, written to a temp PNG beside the output
  let overlayPng = null;
  let session = null;
  try {
    if (hasOverlay) {
      session = await createOverlaySession({
        subtitleSegments,
        subtitleStyle: options.subtitleStyle || clipData.subtitleStyle || {},
        captionSegments,
        captionStyle: options.captionStyle || clipData.captionStyle || {},
        syncOffset: clipData.syncOffset || 0,
        clipStartTime: useNle ? 0 : (clipData.startTime || 0),
        clipEndTime: useNle ? timelineDuration : (clipData.endTime || 0),
        timelineDuration: useNle ? timelineDuration : 0,
        sourceFile: useNle ? null : srcFile,
        resolutionProbeFile: srcFile,
        ...(reframeActive ? { targetWidth: 1080, targetHeight: 1920 } : {}),
      });
      if (session) {
        const buf = await session.captureFrameAt(t);
        overlayPng = outputPath + ".overlay_tmp.png";
        fs.writeFileSync(overlayPng, buf);
      }
    }

    // Single pre-seeked input through the SAME filter graph as a real render
    // (reframe composite included), video-only, one frame out.
    const args = ["-y", "-ss", String(sourceTime), "-i", srcFile];
    if (overlayPng) args.push("-i", overlayPng.replace(/\\/g, "/"));

    // #310: this graph knows only ONE instant, so the overlays are pre-filtered
    // to the ones actually on screen at it and their enable window is rebased
    // to that frame. Without this the thumbnail would silently lose them.
    // A missing file is skipped rather than fatal — a thumbnail is worth less
    // than the export, and refusing to grab one helps nobody.
    const thumbLanes = clipData.laneEnabled || {};
    let thumbMedia = thumbLanes.media === false || !useNle
      ? []
      : resolveMediaPlacements(
          (Array.isArray(clipData.media) ? clipData.media : []).filter((p) => p.enabled !== false),
          nleSegments
        ).filter((m) => t >= m.tlStart && t < m.tlEnd && m.path && fs.existsSync(m.path));
    // #318: an unprobed video carries no file length for the model to clamp its
    // window to, and a `-ss` past EOF gives FFmpeg a zero-frame input — the
    // overlay silently vanishes from the thumbnail, or the spawn stalls into the
    // 60s kill. Ask the file, then drop only the overlays this instant genuinely
    // lands past (the export clamps their span the same way).
    for (let i = 0; i < thumbMedia.length; i++) {
      const m = thumbMedia[i];
      if (m.mediaType !== "video" || m.durationSec > 0) continue;
      const fileLen = await probeDurationSec(m.path);
      if (fileLen > 0) thumbMedia[i] = { ...m, durationSec: fileLen };
    }
    thumbMedia = thumbMedia.filter((m) => {
      if (m.mediaType !== "video" || !(m.durationSec > 0)) return true;
      const into = Math.max(0, m.trimStart || 0) + (t - m.tlStart);
      if (into < m.durationSec) return true;
      console.warn(`[Thumbnail] Overlay "${m.name || m.assetId}" is past the end of its own file at this frame — skipped`);
      return false;
    });
    const mediaAssets = thumbMedia.map((m, i) => {
      // A GIF is seeked to the frame this instant lands on, wrapping through
      // its loop; a video (#311) to the same instant inside its trim window,
      // which doesn't wrap — it plays once. A still has only the one frame.
      if (m.mediaType === "gif") {
        const into = m.durationSec > 0 ? (t - m.tlStart) % m.durationSec : 0;
        args.push("-ss", String(+into.toFixed(3)), "-i", m.path);
      } else if (m.mediaType === "video") {
        const into = Math.max(0, m.trimStart || 0) + (t - m.tlStart);
        args.push("-ss", String(+into.toFixed(3)), "-i", m.path);
      } else {
        args.push("-i", m.path);
      }
      // Flattened to a still: this graph knows one instant, so the trim window
      // and the sound are meaningless here — the seek above already picked the
      // frame, and a thumbnail is video-only.
      return {
        ...m, mediaType: "image", tlStart: 0, tlEnd: 1e6,
        trimStart: 0, trimEnd: 0,
        inputIndex: 1 + (overlayPng ? 1 : 0) + i,
      };
    });
    const thumbOutputWidth = reframeActive || mediaAssets.length === 0
      ? 0
      : (projectData.sourceWidth > 0 ? projectData.sourceWidth : await probeWidth(srcFile));

    const { filterComplex, mapArgs } = buildNleFilterComplex(
      [{ id: "thumb", sourceStart: sourceTime, sourceEnd: sourceTime + 1 }],
      !!overlayPng,
      projectData.reframe,
      projectData.sourceWidth,
      projectData.sourceHeight,
      { audio: false, mediaAssets, outputWidth: thumbOutputWidth }
    );
    args.push("-filter_complex", filterComplex, ...mapArgs, "-frames:v", "1", outputPath);
    console.log("[Thumbnail] FFmpeg args:", args.join(" "));

    await new Promise((resolve, reject) => {
      const proc = spawn(FFMPEG_BIN, args);
      let stderr = "";
      const timer = setTimeout(() => { try { proc.kill("SIGTERM"); } catch (_) {} }, 60000);
      proc.stderr.on("data", (d) => (stderr += d.toString()));
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(`thumbnail ffmpeg failed (code ${code}): ${stderr.slice(-400)}`));
        resolve();
      });
      proc.on("error", (err) => { clearTimeout(timer); reject(new Error(`ffmpeg spawn failed: ${err.message}`)); });
    });

    return { success: true, path: outputPath };
  } finally {
    if (session) session.destroy();
    if (overlayPng) { try { fs.unlinkSync(overlayPng); } catch (_) {} }
  }
}

module.exports = {
  renderClip,
  renderThumbnail,
  cancelActiveRender,
  buildNleFilterComplex, // #164: exported as a seam for the render-args verification harness
};
