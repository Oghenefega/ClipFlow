const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");

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
 * @returns {Promise<{success: true, path: string}>}
 */
function extractAudio(videoPath, wavPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(wavPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const args = [
      "-i", videoPath,
      "-vn",                  // no video
      "-acodec", "pcm_s16le", // 16-bit PCM
      "-ar", "16000",         // 16kHz sample rate (Whisper optimal)
      "-ac", "1",             // mono
      "-y",                   // overwrite
      wavPath,
    ];
    execFile("ffmpeg", args, { timeout: 600000 }, (err) => {
      if (err) return reject(new Error(`Audio extraction failed: ${err.message}`));
      resolve({ success: true, path: wavPath });
    });
  });
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
    const args = [
      "-ss", String(startTime),
      "-i", srcPath,
      "-t", String(duration),
      "-c", "copy",           // stream copy (fast, no re-encode)
      "-avoid_negative_ts", "make_zero",
      "-y",
      outPath,
    ];
    execFile("ffmpeg", args, { timeout: 120000 }, (err) => {
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

module.exports = {
  checkFfmpeg,
  probe,
  extractAudio,
  cutClip,
  generateThumbnail,
  analyzeLoudness,
};
