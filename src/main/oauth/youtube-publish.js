/**
 * YouTube Video Upload via Resumable Upload API.
 *
 * Flow:
 *   1. Initiate resumable upload session (POST with metadata)
 *   2. Upload video binary in chunks (PUT to resumable URI)
 *   3. Return video ID on completion
 *
 * Quota: 100 units per upload (default daily limit: 10,000 units).
 * Chunk size: 256 KB minimum, multiples of 256 KB.
 */
const https = require("https");
const fs = require("fs");
const { URL } = require("url");

const YT_UPLOAD_BASE = "https://www.googleapis.com/upload/youtube/v3/videos";
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
  console.log(`[YouTube Publish] File: ${videoPath} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);

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
  console.log("[YouTube Publish] Resumable upload URI obtained");

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
      console.log(`[YouTube Publish] Uploading chunk ${chunkNum}/${totalChunks} (bytes ${offset}-${end}/${fileSize})`);

      const result = await uploadChunk(uploadUri, buffer, offset, end, fileSize, accessToken);

      // Progress scales from 10% to 90%
      const uploadPct = 10 + Math.round((chunkNum / totalChunks) * 80);
      onProgress({
        stage: "uploading",
        pct: uploadPct,
        detail: `Uploading chunk ${chunkNum}/${totalChunks}...`,
      });

      if (result.done) {
        console.log(`[YouTube Publish] Upload complete! Video ID: ${result.video.id}`);
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

module.exports = {
  publishVideo,
};
