/**
 * YouTube Video Upload via Resumable Upload API.
 *
 * Flow:
 *   1. Initiate resumable upload session (POST with metadata)
 *   2. Upload video binary in chunks (PUT to resumable URI)
 *   3. Return video ID on completion
 *
 * Quota: since 2026-06-01 uploads have their own bucket, 100 videos.insert
 * calls a day for the whole Google project, shared by every user (#453).
 * Chunk size: 256 KB minimum, multiples of 256 KB.
 *
 * #450: after the upload, setThumbnailFromFrame() sends one frame of the same
 * file as the custom thumbnail (thumbnails.set, 50 quota units, covered by the
 * youtube.upload scope). Proven to stick on Shorts for a Partner Program
 * channel on 2026-09-20 — before YouTube's July 2026 rollout the call answered
 * 200 and was silently ignored for Shorts.
 */
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { URL } = require("url");
const log = require("electron-log/main").scope("youtube");
const ffmpeg = require("../ffmpeg");

const YT_UPLOAD_BASE = "https://www.googleapis.com/upload/youtube/v3/videos";
const YT_THUMBNAIL_BASE = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set";
const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB chunks

// ── HTTP helpers ──

/**
 * Initiate a resumable upload session.
 * Returns the upload URI from the Location header.
 */
function initiateUpload(accessToken, metadata, fileSize) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${YT_UPLOAD_BASE}?uploadType=resumable&part=snippet,status`);
    const payload = JSON.stringify(metadata);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "Content-Length": Buffer.byteLength(payload),
        "X-Upload-Content-Length": String(fileSize),
        "X-Upload-Content-Type": "video/*",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200 && res.headers.location) {
          resolve(res.headers.location);
        } else {
          try {
            const err = JSON.parse(data);
            reject(new Error(`Upload init failed: ${err.error?.message || data.substring(0, 500)}`));
          } catch {
            reject(new Error(`Upload init failed (HTTP ${res.statusCode}): ${data.substring(0, 500)}`));
          }
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Upload a chunk of the video to the resumable URI.
 */
function uploadChunk(uploadUri, buffer, start, end, totalSize, accessToken) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(uploadUri);
    const chunkLength = end - start + 1;
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Length": chunkLength,
        "Content-Type": "video/*",
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          // Upload complete — final response contains the video resource
          try {
            resolve({ done: true, video: JSON.parse(data) });
          } catch {
            resolve({ done: true, video: { id: "unknown" } });
          }
        } else if (res.statusCode === 308) {
          // Chunk accepted, more to upload
          const range = res.headers.range;
          const bytesReceived = range ? parseInt(range.split("-")[1], 10) + 1 : end + 1;
          resolve({ done: false, bytesReceived });
        } else {
          try {
            const err = JSON.parse(data);
            reject(new Error(`Chunk upload failed (HTTP ${res.statusCode}): ${err.error?.message || data.substring(0, 300)}`));
          } catch {
            reject(new Error(`Chunk upload failed (HTTP ${res.statusCode}): ${data.substring(0, 300)}`));
          }
        }
      });
    });

    req.on("error", reject);
    req.write(buffer);
    req.end();
  });
}

/**
 * Upload a video to YouTube.
 *
 * @param {string} accessToken - OAuth access token with youtube.upload scope
 * @param {string} videoPath - Local path to video file
 * @param {object} options - { title, description, tags, privacyStatus, categoryId }
 * @param {function} onProgress - Progress callback: ({ stage, pct, detail })
 * @returns {Promise<object>} - { videoId, status }
 */
async function publishVideo(accessToken, videoPath, options = {}, onProgress = () => {}) {
  const {
    title = "Untitled",
    description = "",
    tags = [],
    privacyStatus = "public",
    categoryId = "20", // Gaming
  } = options;

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  const fileSize = fs.statSync(videoPath).size;
  log.info("Starting publish", { videoPath, sizeMB: (fileSize / 1024 / 1024).toFixed(1) });

  // Step 1: Initiate resumable upload
  onProgress({ stage: "init", pct: 5, detail: "Initializing YouTube upload..." });

  const metadata = {
    snippet: {
      title: title.substring(0, 100), // YouTube max 100 chars
      description,
      tags,
      categoryId,
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: false,
    },
  };

  const uploadUri = await initiateUpload(accessToken, metadata, fileSize);
  log.info("Resumable upload URI obtained");

  // Step 2: Upload in chunks
  onProgress({ stage: "uploading", pct: 10, detail: "Uploading video..." });

  const fd = fs.openSync(videoPath, "r");
  let offset = 0;
  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
  let chunkNum = 0;

  try {
    while (offset < fileSize) {
      chunkNum++;
      const remaining = fileSize - offset;
      const currentChunkSize = Math.min(CHUNK_SIZE, remaining);
      const buffer = Buffer.alloc(currentChunkSize);
      fs.readSync(fd, buffer, 0, currentChunkSize, offset);

      const end = offset + currentChunkSize - 1;
      log.info("Uploading chunk", { chunk: `${chunkNum}/${totalChunks}`, bytes: `${offset}-${end}/${fileSize}` });

      const result = await uploadChunk(uploadUri, buffer, offset, end, fileSize, accessToken);

      // Progress scales from 10% to 90%
      const uploadPct = 10 + Math.round((chunkNum / totalChunks) * 80);
      onProgress({
        stage: "uploading",
        pct: uploadPct,
        detail: `Uploading chunk ${chunkNum}/${totalChunks}...`,
      });

      if (result.done) {
        log.info("Upload complete!", { videoId: result.video.id });
        onProgress({ stage: "done", pct: 100, detail: "Video uploaded to YouTube!" });

        return {
          videoId: result.video.id,
          status: result.video.status?.uploadStatus || "uploaded",
        };
      }

      offset = result.bytesReceived;
    }
  } finally {
    fs.closeSync(fd);
  }

  throw new Error("Upload completed but no final response received");
}

/**
 * POST a JPEG as a video's custom thumbnail (thumbnails.set, simple media upload).
 */
function uploadThumbnail(accessToken, videoId, image) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${YT_THUMBNAIL_BASE}?videoId=${encodeURIComponent(videoId)}&uploadType=media`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "image/jpeg",
        "Content-Length": image.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) return resolve();
        try {
          const err = JSON.parse(data);
          reject(new Error(`Thumbnail upload failed (HTTP ${res.statusCode}): ${err.error?.message || data.substring(0, 300)}`));
        } catch {
          reject(new Error(`Thumbnail upload failed (HTTP ${res.statusCode}): ${data.substring(0, 300)}`));
        }
      });
    });

    // The video is already live when this runs — a stalled request must not
    // hold the whole publish open behind it.
    req.setTimeout(30000, () => req.destroy(new Error("Thumbnail upload timed out")));
    req.on("error", reject);
    req.write(image);
    req.end();
  });
}

/**
 * #450: make one frame of the uploaded video its custom thumbnail.
 *
 * The frame comes from the exact file that was uploaded, so the picture always
 * matches the post. `time` is the creator's pick in seconds; unset means the
 * first frame.
 *
 * Never throws. The video is already live by the time this runs, and every
 * caller of publishYouTube reads a thrown error as "the post failed" — so the
 * outcome is only ever reported.
 *
 * @param {string} accessToken
 * @param {string} videoId
 * @param {string} videoPath - The file that was just uploaded
 * @param {number} [time] - Seconds into the video
 * @returns {Promise<{status: "set"|"failed", time: number, error?: string}>}
 */
async function setThumbnailFromFrame(accessToken, videoId, videoPath, time) {
  const framePath = path.join(os.tmpdir(), `clipflow-ytthumb-${Date.now()}.jpg`);
  let t = Number.isFinite(time) && time > 0 ? time : 0;
  try {
    // A seek at or past the end decodes nothing — keep the pick inside the clip
    // (a re-trimmed render can be shorter than it was when the frame was chosen).
    const { duration } = await ffmpeg.probe(videoPath);
    if (duration > 0) t = Math.min(t, Math.max(0, duration - 0.1));
    await ffmpeg.generateThumbnail(videoPath, framePath, t);
    await uploadThumbnail(accessToken, videoId, fs.readFileSync(framePath));
    log.info("Thumbnail set", { videoId, time: t });
    return { status: "set", time: t };
  } catch (err) {
    log.warn("Thumbnail not set", { videoId, time: t, error: err.message });
    return { status: "failed", time: t, error: err.message };
  } finally {
    try { fs.rmSync(framePath, { force: true }); } catch { /* temp dir — the OS sweeps it */ }
  }
}

module.exports = {
  publishVideo,
  setThumbnailFromFrame,
};
