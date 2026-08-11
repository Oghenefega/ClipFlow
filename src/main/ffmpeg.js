const { execFile, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const logger = require("./logger");
// #251: bundled-first binary resolution — resources/ffmpeg/ in the packaged
// app, vendor/ffmpeg/ from source, bare name (PATH) as fallback.
const { FFMPEG_BIN, FFPROBE_BIN } = require("./app-paths");

/**
 * Check if ffmpeg/ffprobe are available in PATH.
 * Returns { installed, version } or { installed: false, error }.
 */
function checkFfmpeg() {
  return new Promise((resolve) => {
    execFile(FFMPEG_BIN, ["-version"], { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve({ installed: false, error: err.message });
      const match = stdout.match(/ffmpeg version (\S+)/);
      resolve({ installed: true, version: match ? match[1] : "unknown" });
    });
  });
}

// NVENC capability cache. The encoder list doesn't change at runtime, so we
// only run `ffmpeg -encoders` once and reuse the result for the whole session.
let _nvencCache = null;

/**
 * Detect whether the installed ffmpeg supports NVENC (NVIDIA hardware H.264
 * encoder). Result cached for the process lifetime.
 * @returns {Promise<boolean>}
 */
function checkNvenc() {
  if (_nvencCache !== null) return Promise.resolve(_nvencCache);
  return new Promise((resolve) => {
    execFile(FFMPEG_BIN, ["-hide_banner", "-encoders"], { timeout: 8000 }, (err, stdout) => {
      if (err) { _nvencCache = false; return resolve(false); }
      _nvencCache = /\bh264_nvenc\b/.test(stdout || "");
      resolve(_nvencCache);
    });
  });
}

/**
 * Resolve the user's clipCutEncoder preference to a concrete encoder name.
 * Setting values: "auto" | "gpu" | "cpu".
 * - "cpu": always libx264.
 * - "gpu": NVENC required — throws a clear, user-facing error if unavailable.
 *   Never silently falls back to libx264 (#75 design constraint: user picks
 *   GPU = clips are made on GPU, full stop).
 * - "auto": NVENC if detected, libx264 otherwise.
 * @param {"auto"|"gpu"|"cpu"} setting
 * @returns {Promise<"nvenc"|"x264">}
 */
async function resolveEncoder(setting) {
  if (setting === "cpu") return "x264";
  const hasNvenc = await checkNvenc();
  if (setting === "gpu") {
    if (!hasNvenc) {
      throw new Error(
        "Clip cutting is set to GPU (NVENC) but NVENC was not detected. " +
        "Switch to CPU or Auto in Settings → Pipeline Quality, or install an " +
        "NVIDIA driver + an ffmpeg build with --enable-nvenc."
      );
    }
    return "nvenc";
  }
  // "auto" — fall through
  return hasNvenc ? "nvenc" : "x264";
}

/**
 * Build the ffmpeg encoder argument array for the given encoder choice.
 * @param {"nvenc"|"x264"} encoder
 * @returns {string[]}
 */
function buildEncoderArgs(encoder) {
  if (encoder === "nvenc") {
    // RTX-class NVENC at visually-lossless settings for social clips.
    // p4 = balanced preset, cq=19 ≈ crf=18 in software, capped maxrate so a
    // motion-heavy GOP can't balloon. spatial+temporal AQ improve fine detail.
    // Ceiling lowered 25M → 10M: measured on the busiest frame of a 1080p60
    // clip (source peaking at 25.9 Mbps), 10M scored 0.9947 SSIM against the
    // 25M render while cutting the file 43% — and every platform recompresses
    // far below this anyway. Quality target (cq 19) is unchanged, so only the
    // few genuinely motion-saturated moments are touched.
    return [
      "-c:v", "h264_nvenc",
      "-preset", "p4",
      "-tune", "hq",
      "-rc", "vbr",
      "-cq", "19",
      "-b:v", "0",
      "-maxrate", "10M",
      "-bufsize", "20M",
      "-spatial_aq", "1",
      "-temporal_aq", "1",
    ];
  }
  // x264 — the software fallback. Same 10M ceiling as the NVENC path so a CPU
  // render doesn't silently produce a file twice the size of a GPU one; crf 18
  // still drives quality, the cap only binds on motion-saturated stretches.
  return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-maxrate", "10M", "-bufsize", "20M"];
}

/**
 * Write a lower-resolution copy of an already-rendered clip (#187).
 *
 * Only ever called from the manual "Send IG a 720p copy" button. Instagram's
 * upload endpoint cannot process a 1080p clip over ~55s inside its own ~35s
 * processing window, and resolution is the only input that changes the outcome —
 * bitrate (18 → 1.8 Mbps), frame rate, codec, edit lists and chunked upload were
 * all measured against the live API and ruled out (#185).
 *
 * Caps the SHORTER dimension so it stays aspect-agnostic: portrait 1080x1920
 * becomes 720x1280, and a landscape or 8:9 source scales correctly rather than
 * being squashed into a hardcoded 9:16 box.
 *
 * @param {string} videoPath
 * @param {string} outPath
 * @param {object} [opts] - { shortSide = 720, encoder = "x264" }
 * @returns {Promise<{success: true, path: string}>}
 */
function transcodeCopy(videoPath, outPath, opts = {}) {
  const { shortSide = 720, encoder = "x264" } = opts;
  return new Promise((resolve, reject) => {
    const scale = `scale='if(gt(iw,ih),-2,${shortSide})':'if(gt(iw,ih),${shortSide},-2)'`;
    const args = [
      "-y",
      "-i", videoPath,
      "-vf", scale,
      ...buildEncoderArgs(encoder),
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outPath,
    ];
    const proc = spawn(FFMPEG_BIN, args);
    let stderrTail = "";
    proc.stderr.on("data", (d) => { stderrTail = (stderrTail + d.toString()).slice(-2000); });
    proc.on("error", (e) => reject(new Error(`ffmpeg failed to start: ${e.message}`)));
    proc.on("close", (code) => {
      if (code === 0 && fs.existsSync(outPath)) return resolve({ success: true, path: outPath });
      reject(new Error(`Transcode failed (exit ${code}): ${stderrTail.slice(-300)}`));
    });
  });
}

/**
 * Cut a small 720p preview of a clip range for AI title generation (#193).
 *
 * Gemini watches this instead of stills, so it needs sound: audio maps 0:a:0 —
 * the OBS full mix, the same first-stream audio the clip render assembles
 * ([0:a] in render.js) — so the model hears what a viewer would hear. Bitrate
 * is capped low (2M): the model samples ~1fps server-side, visual fidelity
 * beyond "readable gameplay" is wasted upload.
 *
 * @param {string} videoPath - Source recording
 * @param {string} outPath
 * @param {object} opts - { start, duration, shortSide = 720 }
 * @returns {Promise<{success: true, path: string}>}
 */
function cutTitlePreview(videoPath, outPath, opts = {}) {
  const { start = 0, duration = 30, shortSide = 720 } = opts;
  return new Promise((resolve, reject) => {
    const scale = `scale='if(gt(iw,ih),-2,${shortSide})':'if(gt(iw,ih),${shortSide},-2)'`;
    const args = [
      "-y",
      "-ss", start.toFixed(3),
      "-i", videoPath,
      "-t", Math.max(0.5, duration).toFixed(3),
      "-map", "0:v:0",
      "-map", "0:a:0?",
      "-vf", scale,
      "-r", "30",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
      "-maxrate", "2M", "-bufsize", "4M",
      "-c:a", "aac", "-b:a", "128k", "-ac", "2",
      "-movflags", "+faststart",
      outPath,
    ];
    const proc = spawn(FFMPEG_BIN, args);
    let stderrTail = "";
    proc.stderr.on("data", (d) => { stderrTail = (stderrTail + d.toString()).slice(-2000); });
    proc.on("error", (e) => reject(new Error(`ffmpeg failed to start: ${e.message}`)));
    proc.on("close", (code) => {
      if (code === 0 && fs.existsSync(outPath)) return resolve({ success: true, path: outPath });
      reject(new Error(`Title preview cut failed (exit ${code}): ${stderrTail.slice(-300)}`));
    });
  });
}

/**
 * Probe a media file for duration, codecs, resolution, etc.
 * Returns { duration, width, height, videoCodec, audioCodec, fps, size }.
 */
function probe(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath,
    ];
    execFile(FFPROBE_BIN, args, { timeout: 15000 }, (err, stdout) => {
      if (err) return reject(new Error(`ffprobe failed: ${err.message}`));
      try {
        const data = JSON.parse(stdout);
        const videoStream = (data.streams || []).find((s) => s.codec_type === "video");
        const audioStream = (data.streams || []).find((s) => s.codec_type === "audio");
        const duration = parseFloat(data.format?.duration || "0");
        const size = parseInt(data.format?.size || "0", 10);

        let fps = 0;
        if (videoStream?.r_frame_rate) {
          const parts = videoStream.r_frame_rate.split("/");
          fps = parts.length === 2 ? parseInt(parts[0]) / parseInt(parts[1]) : parseFloat(parts[0]);
        }

        resolve({
          duration,
          width: videoStream ? parseInt(videoStream.width) : 0,
          height: videoStream ? parseInt(videoStream.height) : 0,
          videoCodec: videoStream?.codec_name || null,
          audioCodec: audioStream?.codec_name || null,
          fps: Math.round(fps * 100) / 100,
          size,
        });
      } catch (e) {
        reject(new Error(`Failed to parse ffprobe output: ${e.message}`));
      }
    });
  });
}

/**
 * Probe only the audio streams of a media file (#169 audio calibration).
 * Returns { trackCount, duration, tracks: [{ index, codec, channels }] }
 * where `index` is the 0-based AUDIO stream index (matches `-map 0:a:N`),
 * not the container-wide stream index.
 */
function probeAudioTracks(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-select_streams", "a",
      "-show_streams",
      filePath,
    ];
    execFile(FFPROBE_BIN, args, { timeout: 30000 }, (err, stdout) => {
      if (err) return reject(new Error(`ffprobe failed: ${err.message}`));
      try {
        const data = JSON.parse(stdout);
        const streams = data.streams || [];
        resolve({
          trackCount: streams.length,
          duration: parseFloat(data.format?.duration || "0"),
          tracks: streams.map((s, i) => ({
            index: i,
            codec: s.codec_name || null,
            channels: s.channels || 0,
          })),
        });
      } catch (e) {
        reject(new Error(`Failed to parse ffprobe output: ${e.message}`));
      }
    });
  });
}

/**
 * Extract a short sample of ONE specific audio track for the calibration
 * wizard (#169). Unlike extractAudioRange there is deliberately NO fallback
 * to track 0 — the wizard must play exactly the requested track or fail,
 * otherwise the user would label the wrong audio.
 */
function extractTrackSample(videoPath, wavPath, trackIndex, startSec, durSec) {
  const dir = path.dirname(wavPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  return new Promise((resolve, reject) => {
    const args = [
      "-ss", String(startSec),
      "-i", videoPath,
      "-t", String(durSec),
      "-map", `0:a:${trackIndex}`,
      "-vn",
      "-acodec", "pcm_s16le",
      "-ar", "16000",
      "-ac", "1",
      "-y",
      wavPath,
    ];
    execFile(FFMPEG_BIN, args, { timeout: 120000 }, (err) => {
      if (err) return reject(new Error(`Track sample extraction failed (track ${trackIndex}): ${err.message}`));
      resolve({ success: true, path: wavPath });
    });
  });
}

/**
 * Extract audio from a video file as WAV (16kHz mono — optimal for Whisper).
 * @param {string} videoPath - Source video
 * @param {string} wavPath - Output WAV path
 * @param {number} [audioTrackIndex=0] - 0-based audio stream index (0 = track 1, 1 = track 2, etc.)
 * @param {object} [opts] - { fallbackToFirst = true } — #190 game-track extraction
 *   passes false: silently analyzing the mic as "game audio" would be worse
 *   than skipping the game signals entirely.
 * @returns {Promise<{success: true, path: string}>}
 */
function extractAudio(videoPath, wavPath, audioTrackIndex = 0, { fallbackToFirst = true } = {}) {
  const dir = path.dirname(wavPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const trackIdx = Number.isFinite(audioTrackIndex) && audioTrackIndex >= 0 ? audioTrackIndex : 0;

  const run = (idx) => new Promise((resolve, reject) => {
    const args = [
      "-i", videoPath,
      "-map", `0:a:${idx}`,  // select specific audio track
      "-vn",                  // no video
      "-acodec", "pcm_s16le", // 16-bit PCM
      "-ar", "16000",         // 16kHz sample rate (Whisper optimal)
      "-ac", "1",             // mono
      "-y",                   // overwrite
      wavPath,
    ];
    execFile(FFMPEG_BIN, args, { timeout: 600000 }, (err) => {
      if (err) return reject(new Error(`Audio extraction failed (track ${idx}): ${err.message}`));
      resolve({ success: true, path: wavPath });
    });
  });

  // Try configured track first; if it fails (e.g. clip has fewer tracks), fall back to track 0
  if (trackIdx > 0) {
    return fallbackToFirst ? run(trackIdx).catch(() => run(0)) : run(trackIdx);
  }
  return run(0);
}

/**
 * Extract a time range of audio from a source video as WAV (16kHz mono).
 * Used by lazy-cut retranscription (#76): rather than extracting audio from a
 * pre-cut clip MP4, slice directly from the source. Same WAV format as
 * extractAudio() — fully interchangeable for the Whisper pipeline.
 * @param {string} videoPath - Source video
 * @param {string} wavPath - Output WAV path
 * @param {number} startSec - Start time in seconds (source-absolute)
 * @param {number} endSec - End time in seconds (source-absolute)
 * @param {number} [audioTrackIndex=0] - 0-based audio stream index
 * @returns {Promise<{success: true, path: string}>}
 */
function extractAudioRange(videoPath, wavPath, startSec, endSec, audioTrackIndex = 0) {
  const dir = path.dirname(wavPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const trackIdx = Number.isFinite(audioTrackIndex) && audioTrackIndex >= 0 ? audioTrackIndex : 0;
  const duration = endSec - startSec;
  if (!(duration > 0)) {
    return Promise.reject(new Error(`extractAudioRange: invalid range ${startSec}-${endSec}`));
  }

  const run = (idx) => new Promise((resolve, reject) => {
    // -ss before -i = fast (input) seek; close enough for audio-only since
    // we re-encode to PCM (no keyframe artifacts to worry about).
    const args = [
      "-ss", String(startSec),
      "-i", videoPath,
      "-t", String(duration),
      "-map", `0:a:${idx}`,
      "-vn",
      "-acodec", "pcm_s16le",
      "-ar", "16000",
      "-ac", "1",
      "-y",
      wavPath,
    ];
    execFile(FFMPEG_BIN, args, { timeout: 600000 }, (err) => {
      if (err) return reject(new Error(`Audio range extraction failed (track ${idx}): ${err.message}`));
      resolve({ success: true, path: wavPath });
    });
  });

  if (trackIdx > 0) {
    return run(trackIdx).catch(() => run(0));
  }
  return run(0);
}

/**
 * Generate a thumbnail from a video at a specific time.
 * @param {string} videoPath - Source video
 * @param {string} outPath - Output image path (JPG)
 * @param {number} time - Time in seconds to capture
 * @returns {Promise<{success: true, path: string}>}
 */
function generateThumbnail(videoPath, outPath, time) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const args = [
      "-ss", String(time),
      "-i", videoPath,
      "-vframes", "1",
      "-q:v", "3",            // good quality JPEG
      "-y",
      outPath,
    ];
    execFile(FFMPEG_BIN, args, { timeout: 30000 }, (err) => {
      if (err) return reject(new Error(`Thumbnail generation failed: ${err.message}`));
      resolve({ success: true, path: outPath });
    });
  });
}

/**
 * Extract downscaled stills from a video at given timestamps (#183 Phase 1).
 *
 * Feeds the title/caption model actual pictures of the clip instead of the
 * transcript alone. Long edge is capped at 640px — enough to read the scene,
 * small enough that four of them don't dominate the request. Source frames are
 * up to 2560x2880 (see the creator's 8:9 canvas), so skipping the downscale
 * would be roughly a 20x token cost for no extra usable detail.
 *
 * Existing files are reused, so regenerate/rephrase on the same clip costs
 * nothing. A single failed timestamp is skipped rather than failing the batch —
 * frames are an enhancement, never a hard requirement for generation.
 *
 * @param {string} videoPath
 * @param {number[]} times - Timestamps in seconds
 * @param {string} outDir - Cache directory
 * @param {number} [maxEdge=640]
 * @returns {Promise<Array<{path: string, time: number}>>}
 */
async function extractClipStills(videoPath, times, outDir, maxEdge = 640) {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const out = [];

  for (const time of times) {
    const outPath = path.join(outDir, `still_${Math.round(time * 100)}.jpg`);
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
      out.push({ path: outPath, time });
      continue;
    }
    try {
      await new Promise((resolve, reject) => {
        const args = [
          "-ss", String(time),
          "-i", videoPath,
          "-vframes", "1",
          // Downscale the long edge only; -1 keeps aspect and rounds to even.
          "-vf", `scale='if(gt(iw,ih),${maxEdge},-2)':'if(gt(iw,ih),-2,${maxEdge})'`,
          "-q:v", "4",
          "-y",
          outPath,
        ];
        execFile(FFMPEG_BIN, args, { timeout: 30000 }, (err) => (err ? reject(err) : resolve()));
      });
      if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) out.push({ path: outPath, time });
    } catch (_) { /* skip this timestamp — a partial frame set is still useful */ }
  }

  return out;
}

/**
 * Analyze audio loudness across a file, returning per-segment energy levels.
 * Used for highlight detection.
 * @param {string} audioPath - WAV or video file
 * @param {number} segmentDuration - Duration of each analysis segment in seconds (default 1)
 * @returns {Promise<{segments: Array<{start: number, end: number, loudness: number}>}>}
 */
function analyzeLoudness(audioPath, segmentDuration = 1) {
  return new Promise((resolve, reject) => {
    // Use volumedetect for overall, and astats for per-segment RMS
    const args = [
      "-i", audioPath,
      "-af", `asegment=timestamps=0,astats=metadata=1:reset=${segmentDuration}`,
      "-f", "null",
      "-",
    ];
    execFile(FFMPEG_BIN, args, { timeout: 600000, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      // ffmpeg outputs stats to stderr
      const output = stderr || "";
      const segments = [];
      let currentTime = 0;

      // Parse RMS level from astats output lines
      const rmsMatches = output.matchAll(/lavfi\.astats\.Overall\.RMS_level=(-?\d+\.?\d*)/g);
      for (const match of rmsMatches) {
        const rms = parseFloat(match[1]);
        segments.push({
          start: currentTime,
          end: currentTime + segmentDuration,
          loudness: rms, // negative dB value, higher = louder
        });
        currentTime += segmentDuration;
      }

      // If astats parsing fails, fall back to simpler approach
      if (segments.length === 0) {
        // Use volumedetect as fallback for mean volume
        const meanMatch = output.match(/mean_volume:\s*(-?\d+\.?\d*)/);
        const maxMatch = output.match(/max_volume:\s*(-?\d+\.?\d*)/);
        resolve({
          segments: [],
          meanVolume: meanMatch ? parseFloat(meanMatch[1]) : -30,
          maxVolume: maxMatch ? parseFloat(maxMatch[1]) : -10,
          fallback: true,
        });
        return;
      }

      resolve({ segments, fallback: false });
    });
  });
}

/**
 * Extract waveform peaks from a video/audio file using FFmpeg.
 * Runs entirely in the main process — no renderer memory issues.
 * Returns an array of normalized amplitude values (0–1).
 * @param {string} filePath - Source video or audio file
 * @param {number} peakCount - Number of peaks to extract (default 400)
 * @returns {Promise<{peaks: number[]}>}
 */
function extractWaveformPeaks(filePath, peakCount = 400, audioTrackIndex = 0) {
  const trackIdx = Number.isFinite(audioTrackIndex) && audioTrackIndex >= 0 ? audioTrackIndex : 0;

  const runExtract = (idx) => new Promise((resolve, reject) => {
    // Use FFmpeg to downsample audio and output raw PCM to stdout
    // Then parse the samples to compute peaks
    const args = [
      "-i", filePath,
      "-map", `0:a:${idx}`,      // select specific audio track (must match transcription track)
      "-vn",                    // no video
      "-ac", "1",               // mono
      // Fixed envelope rate — do NOT scale to peakCount. stdout bytes = rate ×
      // duration, so a peakCount-scaled rate piped ~250MB for a 30-min source and
      // blew execFile's maxBuffer (#64). 1000 Hz ≈ 3.4MB at 30min, ~250 samples/
      // peak; the bucketing below derives all counts from the received byte length.
      "-ar", "1000",
      "-f", "s16le",            // raw 16-bit signed little-endian PCM
      "-acodec", "pcm_s16le",
      "pipe:1",                 // output to stdout
    ];

    require("child_process").execFile(FFMPEG_BIN, args, {
      timeout: 60000,
      maxBuffer: 128 * 1024 * 1024, // bounded payload (#64) keeps us far under this; cap high as insurance
      encoding: "buffer",
    }, (err, stdout, stderr) => {
      if (err) {
        // Capture ffmpeg's own stderr — execFile's default err.message only carries
        // exit code. ffmpeg prints the real reason (no such track, bad codec, file
        // unreadable) to stderr. Log the tail so #64-style silent failures surface.
        const stderrTail = stderr
          ? Buffer.isBuffer(stderr) ? stderr.toString("utf-8").slice(-800) : String(stderr).slice(-800)
          : "";
        logger.error(logger.MODULES.videoProcessing,
          `[waveform] ffmpeg exit (track ${idx}): code=${err.code ?? "?"} msg=${err.message}`,
          stderrTail ? { stderrTail } : undefined);
        return reject(new Error(`Waveform extraction failed (track ${idx}): ${err.code ?? err.message}`));
      }
      if (!stdout || stdout.length < 2) return resolve({ peaks: [] });

      // Parse 16-bit samples. Bucket boundaries must be computed proportionally
      // per index — an integer samplesPerPeak (floor once, reuse) silently drops
      // the fractional remainder on EVERY peak, so peaks stop spanning the full
      // audio and the renderer (which assumes they do) draws the waveform
      // progressively earlier the deeper into the source you go (~7s off at
      // 266s in, measured). The tail of the recording was dropped entirely.
      const sampleCount = Math.floor(stdout.length / 2);
      const peaks = [];

      for (let i = 0; i < peakCount; i++) {
        const start = Math.floor((i * sampleCount) / peakCount);
        if (start >= sampleCount) break;
        const end = Math.min(sampleCount, Math.max(start + 1, Math.floor(((i + 1) * sampleCount) / peakCount)));
        let max = 0;
        for (let j = start; j < end; j++) {
          const sample = Math.abs(stdout.readInt16LE(j * 2));
          if (sample > max) max = sample;
        }
        peaks.push(max / 32768); // normalize to 0–1
      }

      resolve({ peaks });
    });
  });

  // Try configured track first; fall back to track 0 if it fails. If both fail,
  // surface the error to the caller instead of swallowing it — the renderer needs
  // a visible error state rather than an infinite spinner (#64).
  if (trackIdx > 0) {
    return runExtract(trackIdx).catch((firstErr) =>
      runExtract(0).catch(() => ({ peaks: [], error: firstErr.message }))
    );
  }
  return runExtract(0).catch((err) => ({ peaks: [], error: err.message }));
}

/**
 * Split a video file into segments using stream copy (no re-encode).
 * All-or-nothing: if any segment fails, partial outputs are deleted.
 * @param {string} inputPath - Source video file
 * @param {Array<{startSeconds: number, endSeconds: number, outputFilename: string}>} splitPoints
 * @param {string} outputDir - Directory for output files
 * @returns {Promise<Array<{filePath: string, actualStartSeconds: number, actualEndSeconds: number}>>}
 */
async function splitFile(inputPath, splitPoints, outputDir) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const completedFiles = [];

  try {
    let cumulativeActualEnd = 0;

    for (let i = 0; i < splitPoints.length; i++) {
      const { startSeconds, endSeconds, outputFilename } = splitPoints[i];
      const outPath = path.join(outputDir, outputFilename);

      await new Promise((resolve, reject) => {
        const args = [
          "-ss", String(startSeconds),
          "-to", String(endSeconds),
          "-i", inputPath,
          "-c", "copy",
          "-avoid_negative_ts", "make_zero",
          "-y",
          outPath,
        ];
        execFile(FFMPEG_BIN, args, { timeout: 300000 }, (err) => {
          if (err) return reject(new Error(`Split segment ${i + 1} failed: ${err.message}`));
          resolve();
        });
      });

      // Probe the output to get actual keyframe-snapped duration
      const probeResult = await probe(outPath);
      const actualDuration = probeResult.duration;
      const actualStart = cumulativeActualEnd;
      const actualEnd = actualStart + actualDuration;
      cumulativeActualEnd = actualEnd;

      completedFiles.push({
        filePath: outPath,
        actualStartSeconds: Math.round(actualStart * 100) / 100,
        actualEndSeconds: Math.round(actualEnd * 100) / 100,
      });
    }

    return completedFiles;
  } catch (err) {
    // All-or-nothing: delete any partial outputs on failure
    for (const { filePath } of completedFiles) {
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
    }
    throw err;
  }
}

/**
 * Generate a thumbnail strip for the game-switch scrubber.
 * One frame every 30 seconds at 320px wide — stored in a temp directory.
 * @param {string} inputPath - Source video file
 * @param {string} fileId - Unique ID for cache directory naming
 * @returns {Promise<{thumbDir: string, thumbnails: Array<{path: string, timestampSeconds: number}>, duration: number}>}
 */
async function generateThumbnailStrip(inputPath, fileId) {
  const thumbDir = path.join(os.tmpdir(), "clipflow-thumbs", fileId);
  if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

  // Probe to get duration
  const probeResult = await probe(inputPath);
  const duration = probeResult.duration;

  // Generate thumbnails: one every 30 seconds
  await new Promise((resolve, reject) => {
    const args = [
      "-i", inputPath,
      "-vf", "fps=1/30,scale=320:-1",
      "-q:v", "5",
      "-y",
      path.join(thumbDir, "thumb_%04d.jpg"),
    ];
    // Generous timeout — large files can take 30-60s
    execFile(FFMPEG_BIN, args, { timeout: 120000 }, (err) => {
      if (err) return reject(new Error(`Thumbnail strip generation failed: ${err.message}`));
      resolve();
    });
  });

  // Read generated thumbnails and map to timestamps
  const files = fs.readdirSync(thumbDir)
    .filter(f => f.startsWith("thumb_") && f.endsWith(".jpg"))
    .sort();

  const thumbnails = files.map((filename, i) => ({
    path: path.join(thumbDir, filename),
    timestampSeconds: i * 30,
  }));

  return { thumbDir, thumbnails, duration };
}

/**
 * Clean up thumbnail strip temp directory.
 * @param {string} thumbDir - The temp directory to delete
 */
/**
 * Generate preview frames for a video, scaled by duration.
 * <10min: 1 frame (50%), 10-20min: 2 (30%,70%), 20-40min: 3 (25%,50%,75%), 40+min: 4 (20%,40%,60%,80%).
 * @param {string} inputPath - Video file path
 * @param {string} fileId - Unique ID for cache directory
 * @param {number} durationSeconds - Video duration in seconds
 * @returns {Promise<{thumbDir: string, frames: Array<{path: string, timestampSeconds: number}>}>}
 */
async function generatePreviewFrames(inputPath, fileId, durationSeconds) {
  const thumbDir = path.join(os.tmpdir(), "clipflow-preview", fileId);
  if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

  // Determine frame count and positions based on duration
  let positions;
  if (durationSeconds < 600) {        // < 10 min
    positions = [0.5];
  } else if (durationSeconds < 1200) { // 10-20 min
    positions = [0.3, 0.7];
  } else if (durationSeconds < 2400) { // 20-40 min
    positions = [0.25, 0.5, 0.75];
  } else {                             // 40+ min
    positions = [0.2, 0.4, 0.6, 0.8];
  }

  const frames = [];
  for (let i = 0; i < positions.length; i++) {
    const time = Math.floor(durationSeconds * positions[i]);
    const outPath = path.join(thumbDir, `preview_${i}.jpg`);
    await new Promise((resolve, reject) => {
      const args = [
        "-ss", String(time),
        "-i", inputPath,
        "-vframes", "1",
        "-vf", "scale=240:-1",
        "-q:v", "4",
        "-y",
        outPath,
      ];
      execFile(FFMPEG_BIN, args, { timeout: 30000 }, (err) => {
        if (err) return reject(new Error(`Preview frame extraction failed at ${time}s: ${err.message}`));
        resolve();
      });
    });
    frames.push({ path: outPath, timestampSeconds: time });
  }

  return { thumbDir, frames };
}

function cleanupThumbnailStrip(thumbDir) {
  try {
    if (fs.existsSync(thumbDir)) {
      fs.rmSync(thumbDir, { recursive: true, force: true });
    }
  } catch (_) {
    // Best-effort cleanup — ignore errors
  }
}

module.exports = {
  checkFfmpeg,
  checkNvenc,
  resolveEncoder,
  buildEncoderArgs,
  transcodeCopy,
  cutTitlePreview,
  probe,
  probeAudioTracks,
  extractTrackSample,
  extractAudio,
  extractAudioRange,
  generateThumbnail,
  extractClipStills,
  analyzeLoudness,
  extractWaveformPeaks,
  splitFile,
  generateThumbnailStrip,
  cleanupThumbnailStrip,
  generatePreviewFrames,
};
