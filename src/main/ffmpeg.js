const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

/**
 * Check if ffmpeg/ffprobe are available in PATH.
 * Returns { installed, version } or { installed: false, error }.
 */
function checkFfmpeg() {
  return new Promise((resolve) => {
    execFile("ffmpeg", ["-version"], { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve({ installed: false, error: err.message });
      const match = stdout.match(/ffmpeg version (\S+)/);
      resolve({ installed: true, version: match ? match[1] : "unknown" });
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
    execFile("ffprobe", args, { timeout: 15000 }, (err, stdout) => {
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
 * Extract audio from a video file as WAV (16kHz mono — optimal for Whisper).
 * @param {string} videoPath - Source video
 * @param {string} wavPath - Output WAV path
 * @param {number} [audioTrackIndex=0] - 0-based audio stream index (0 = track 1, 1 = track 2, etc.)
 * @returns {Promise<{success: true, path: string}>}
 */
function extractAudio(videoPath, wavPath, audioTrackIndex = 0) {
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
    execFile("ffmpeg", args, { timeout: 600000 }, (err) => {
      if (err) return reject(new Error(`Audio extraction failed (track ${idx}): ${err.message}`));
      resolve({ success: true, path: wavPath });
    });
  });

  // Try configured track first; if it fails (e.g. clip has fewer tracks), fall back to track 0
  if (trackIdx > 0) {
    return run(trackIdx).catch(() => run(0));
  }
  return run(0);
}

/**
 * Cut a clip from a source video.
 * @param {string} srcPath - Source video
 * @param {string} outPath - Output clip path
 * @param {number} startTime - Start time in seconds
 * @param {number} endTime - End time in seconds
 * @returns {Promise<{success: true, path: string, duration: number}>}
 */
function cutClip(srcPath, outPath, startTime, endTime) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const duration = endTime - startTime;
    // Re-encode for frame-accurate cuts. Stream copy (-c copy) seeks to
    // the nearest keyframe which can be 2-10s before startTime, causing
    // subtitle timestamps to be ahead of the actual audio.
    const args = [
      "-ss", String(startTime),
      "-i", srcPath,
      "-t", String(duration),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
      "-c:a", "aac", "-b:a", "192k",
      "-avoid_negative_ts", "make_zero",
      "-y",
      outPath,
    ];
    // Allow longer timeout for re-encoding (10 minutes)
    execFile("ffmpeg", args, { timeout: 600000 }, (err) => {
      if (err) return reject(new Error(`Clip cut failed: ${err.message}`));
      resolve({ success: true, path: outPath, duration });
    });
  });
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
    execFile("ffmpeg", args, { timeout: 30000 }, (err) => {
      if (err) return reject(new Error(`Thumbnail generation failed: ${err.message}`));
      resolve({ success: true, path: outPath });
    });
  });
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
    execFile("ffmpeg", args, { timeout: 600000, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
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
function extractWaveformPeaks(filePath, peakCount = 400) {
  return new Promise((resolve, reject) => {
    // Use FFmpeg to downsample audio and output raw PCM to stdout
    // Then parse the samples to compute peaks
    const args = [
      "-i", filePath,
      "-vn",                    // no video
      "-ac", "1",               // mono
      "-ar", String(peakCount * 10), // sample rate: ~peakCount*10 samples
      "-f", "s16le",            // raw 16-bit signed little-endian PCM
      "-acodec", "pcm_s16le",
      "pipe:1",                 // output to stdout
    ];

    const child = require("child_process").execFile("ffmpeg", args, {
      timeout: 60000,
      maxBuffer: 50 * 1024 * 1024,
      encoding: "buffer",
    }, (err, stdout) => {
      if (err) return reject(new Error(`Waveform extraction failed: ${err.message}`));
      if (!stdout || stdout.length < 2) return resolve({ peaks: [] });

      // Parse 16-bit samples
      const sampleCount = Math.floor(stdout.length / 2);
      const samplesPerPeak = Math.max(1, Math.floor(sampleCount / peakCount));
      const peaks = [];

      for (let i = 0; i < peakCount && i * samplesPerPeak < sampleCount; i++) {
        let max = 0;
        const start = i * samplesPerPeak;
        const end = Math.min(start + samplesPerPeak, sampleCount);
        for (let j = start; j < end; j++) {
          const sample = Math.abs(stdout.readInt16LE(j * 2));
          if (sample > max) max = sample;
        }
        peaks.push(max / 32768); // normalize to 0–1
      }

      resolve({ peaks });
    });
  });
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
        execFile("ffmpeg", args, { timeout: 300000 }, (err) => {
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
    execFile("ffmpeg", args, { timeout: 120000 }, (err) => {
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
      execFile("ffmpeg", args, { timeout: 30000 }, (err) => {
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
  probe,
  extractAudio,
  cutClip,
  generateThumbnail,
  analyzeLoudness,
  extractWaveformPeaks,
  splitFile,
  generateThumbnailStrip,
  cleanupThumbnailStrip,
  generatePreviewFrames,
};
