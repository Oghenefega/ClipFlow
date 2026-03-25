/**
 * TikTok Content Posting API — Direct Post (video.publish scope).
 *
 * Flow:
 *   1. Query creator info (privacy levels, max duration)
 *   2. Initialize upload (get upload_url + publish_id)
 *   3. Upload video in chunks (PUT with Content-Range)
 *   4. Poll publish status until PUBLISH_COMPLETE or FAILED
 *
 * Sandbox apps: all posts are forced to SELF_ONLY (private).
 */
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const log = require("electron-log/main").scope("tiktok");

const TIKTOK_API_BASE = "https://open.tiktokapis.com";
const MAX_SINGLE_CHUNK = 64 * 1024 * 1024; // 64 MB — TikTok max single chunk
const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB for multi-chunk uploads (files > 64MB)

// ── HTTP helpers ──

function apiPost(endpoint, body, accessToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, TIKTOK_API_BASE);
    const payload = JSON.stringify(body);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "Content-Length": Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse TikTok response: ${data.substring(0, 500)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function putChunk(uploadUrl, buffer, start, end, totalSize) {
  return new Promise((resolve, reject) => {
    const url = new URL(uploadUrl);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": buffer.length,
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        // 201 = final chunk accepted, 206 = intermediate chunk accepted
        if (res.statusCode === 201 || res.statusCode === 206) {
          resolve({ statusCode: res.statusCode, body: data });
        } else {
          reject(new Error(`Chunk upload failed (HTTP ${res.statusCode}): ${data.substring(0, 500)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(buffer);
    req.end();
  });
}

// ── API methods ──

/**
 * Query creator info — returns allowed privacy levels, max duration, etc.
 */
async function queryCreatorInfo(accessToken) {
  log.info("Querying creator info...");
  const result = await apiPost("/v2/post/publish/creator_info/query/", {}, accessToken);
  log.debug("Creator info response", { result });
  if (result.error?.code && result.error.code !== "ok") {
    throw new Error(`Creator info query failed: ${result.error.message || result.error.code}`);
  }
  return result.data;
}

/**
 * Initialize a direct post upload (video.publish scope).
 * @param {string} accessToken
 * @param {object} postInfo - { title, privacy_level, disable_duet, disable_stitch, disable_comment }
 * @param {number} fileSize - video file size in bytes
 * @returns {{ publish_id: string, upload_url: string }}
 */
async function initializeUpload(accessToken, postInfo, fileSize) {
  let chunkCount, chunkSize;
  if (fileSize <= MAX_SINGLE_CHUNK) {
    chunkCount = 1;
    chunkSize = fileSize;
  } else {
    chunkSize = CHUNK_SIZE;
    chunkCount = Math.ceil(fileSize / CHUNK_SIZE);
  }
  log.info("Initializing direct post upload", { fileSize, chunkCount, chunkSize });

  const body = {
    post_info: {
      title: postInfo.title || "",
      privacy_level: postInfo.privacy_level || "PUBLIC_TO_EVERYONE",
      disable_duet: postInfo.disable_duet || false,
      disable_stitch: postInfo.disable_stitch || false,
      disable_comment: postInfo.disable_comment || false,
    },
    source_info: {
      source: "FILE_UPLOAD",
      video_size: fileSize,
      chunk_size: chunkSize,
      total_chunk_count: chunkCount,
    },
  };

  const result = await apiPost("/v2/post/publish/video/init/", body, accessToken);
  log.debug("Init response", { result });

  if (result.error?.code && result.error.code !== "ok") {
    throw new Error(`Upload init failed: ${result.error.message || result.error.code}`);
  }

  return {
    publish_id: result.data.publish_id,
    upload_url: result.data.upload_url,
  };
}

/**
 * Initialize an inbox upload (video.upload scope).
 * Posts go to the user's TikTok drafts/inbox — they finalize in the TikTok app.
 * No post_info needed; no creator_info query required.
 * @param {string} accessToken
 * @param {number} fileSize
 * @returns {{ publish_id: string, upload_url: string }}
 */
async function initializeInboxUpload(accessToken, fileSize) {
  let chunkCount, chunkSize;
  if (fileSize <= MAX_SINGLE_CHUNK) {
    chunkCount = 1;
    chunkSize = fileSize;
  } else {
    chunkSize = CHUNK_SIZE;
    chunkCount = Math.ceil(fileSize / CHUNK_SIZE);
  }
  log.info("Initializing inbox upload", { fileSize, chunkCount, chunkSize });

  const body = {
    source_info: {
      source: "FILE_UPLOAD",
      video_size: fileSize,
      chunk_size: chunkSize,
      total_chunk_count: chunkCount,
    },
  };

  const result = await apiPost("/v2/post/publish/inbox/video/init/", body, accessToken);
  log.debug("Inbox init response", { result });

  if (result.error?.code && result.error.code !== "ok") {
    throw new Error(`Inbox upload init failed: ${result.error.message || result.error.code}`);
  }

  return {
    publish_id: result.data.publish_id,
    upload_url: result.data.upload_url,
  };
}

/**
 * Upload a video file in chunks to TikTok's upload URL.
 * @param {string} uploadUrl - from initializeUpload
 * @param {string} filePath - local path to the video file
 * @param {number} fileSize - total file size
 * @param {function} onProgress - callback({ pct, detail })
 */
/**
 * Upload entire file in a single PUT (for files <= CHUNK_SIZE).
 */
function putEntireFile(uploadUrl, buffer, totalSize) {
  return new Promise((resolve, reject) => {
    const url = new URL(uploadUrl);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": totalSize,
        "Content-Range": `bytes 0-${totalSize - 1}/${totalSize}`,
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        log.info("Single upload response", { statusCode: res.statusCode });
        if (res.statusCode === 201 || res.statusCode === 200) {
          resolve({ statusCode: res.statusCode, body: data });
        } else {
          reject(new Error(`Single upload failed (HTTP ${res.statusCode}): ${data.substring(0, 500)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(buffer);
    req.end();
  });
}

async function uploadVideoChunks(uploadUrl, filePath, fileSize, onProgress) {
  if (fileSize <= MAX_SINGLE_CHUNK) {
    // Single upload — read entire file and PUT
    log.info("Single-chunk upload", { fileSize, filePath });
    const buffer = fs.readFileSync(filePath);
    if (onProgress) onProgress({ pct: 50, detail: "Uploading video..." });
    await putEntireFile(uploadUrl, buffer, fileSize);
    if (onProgress) onProgress({ pct: 100, detail: "Upload complete" });
    log.info("Single upload complete");
    return;
  }

  log.info("Chunked upload starting", { chunkCount, filePath });
  const fd = fs.openSync(filePath, "r");
  try {
    for (let i = 0; i < chunkCount; i++) {
      const start = i * CHUNK_SIZE;
      const bytesToRead = Math.min(CHUNK_SIZE, fileSize - start);
      const end = start + bytesToRead - 1;
      const buffer = Buffer.alloc(bytesToRead);
      fs.readSync(fd, buffer, 0, bytesToRead, start);

      log.info("Uploading chunk", { chunk: `${i + 1}/${chunkCount}`, bytes: `${start}-${end}/${fileSize}` });
      await putChunk(uploadUrl, buffer, start, end, fileSize);

      const pct = Math.round(((i + 1) / chunkCount) * 100);
      if (onProgress) onProgress({ pct, detail: `Uploading chunk ${i + 1}/${chunkCount}` });
    }
  } finally {
    fs.closeSync(fd);
  }

  log.info("All chunks uploaded successfully");
}

/**
 * Poll publish status until terminal state.
 * @param {string} accessToken
 * @param {string} publishId
 * @param {number} maxAttempts - max poll attempts (default 30 = ~5 minutes at 10s intervals)
 * @returns {{ status: string, post_id?: number }}
 */
async function pollPublishStatus(accessToken, publishId, maxAttempts = 30) {
  log.info("Polling publish status", { publishId });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Wait 10 seconds between polls
    if (attempt > 0) await new Promise((r) => setTimeout(r, 10000));

    const result = await apiPost("/v2/post/publish/status/fetch/", { publish_id: publishId }, accessToken);
    const status = result.data?.status;
    log.debug("Poll response", { attempt: attempt + 1, result });

    if (status === "PUBLISH_COMPLETE") {
      const postId = result.data?.publicaly_available_post_id?.[0];
      return { status: "PUBLISH_COMPLETE", post_id: postId };
    }

    if (status === "FAILED") {
      const reason = result.data?.fail_reason || "unknown";
      throw new Error(`TikTok publish failed: ${reason}`);
    }

    // Still processing — continue polling
  }

  throw new Error("TikTok publish timed out — video may still be processing");
}

/**
 * Full publish flow.
 *
 * @param {string} accessToken - OAuth access token
 * @param {string} videoPath - local path to the rendered MP4
 * @param {object} options - { title, caption, privacy_level, mode: "direct_post"|"inbox" }
 * @param {function} onProgress - callback({ stage, pct, detail })
 * @returns {{ status: string, publish_id: string, post_id?: number }}
 *
 * mode "direct_post" (default): requires video.publish scope — posts go live immediately.
 * mode "inbox": requires video.upload scope — posts go to the user's TikTok drafts/inbox.
 */
async function publishVideo(accessToken, videoPath, options = {}, onProgress) {
  const mode = options.mode === "inbox" ? "inbox" : "direct_post";
  const progress = (stage, pct, detail) => {
    if (onProgress) onProgress({ stage, pct, detail });
  };

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }
  const fileSize = fs.statSync(videoPath).size;
  if (fileSize === 0) {
    throw new Error("Video file is empty");
  }
  log.info("Starting publish", { mode, videoPath, sizeMB: (fileSize / 1024 / 1024).toFixed(1) });

  let publish_id, upload_url;

  if (mode === "inbox") {
    // Inbox flow — no creator_info query needed, no post_info
    progress("init", 10, "Initializing upload...");
    ({ publish_id, upload_url } = await initializeInboxUpload(accessToken, fileSize));
  } else {
    // Direct post flow — query creator info for allowed privacy levels
    progress("creator_info", 5, "Checking creator permissions...");
    const creatorInfo = await queryCreatorInfo(accessToken);
    const allowedPrivacy = creatorInfo.privacy_level_options || ["PUBLIC_TO_EVERYONE"];

    // Use requested privacy level if allowed, otherwise fall back to first allowed
    const requested = options.privacy_level || "PUBLIC_TO_EVERYONE";
    const privacyLevel = allowedPrivacy.includes(requested) ? requested : allowedPrivacy[0];

    const disableDuet = creatorInfo.duet_disabled || false;
    const disableStitch = creatorInfo.stitch_disabled || false;
    const disableComment = creatorInfo.comment_disabled || false;

    log.info("Privacy level", { privacyLevel, allowedPrivacy });

    progress("init", 10, "Initializing upload...");
    ({ publish_id, upload_url } = await initializeUpload(accessToken, {
      title: options.title || options.caption || "",
      privacy_level: privacyLevel,
      disable_duet: disableDuet,
      disable_stitch: disableStitch,
      disable_comment: disableComment,
    }, fileSize));
  }

  // Upload (same for both modes)
  progress("uploading", 15, "Uploading video...");
  await uploadVideoChunks(upload_url, videoPath, fileSize, (p) => {
    const scaledPct = 15 + Math.round(p.pct * 0.65);
    progress("uploading", scaledPct, p.detail);
  });

  // Poll status (same endpoint for both modes)
  progress("processing", 85, mode === "inbox" ? "Sending to inbox..." : "Processing on TikTok...");
  const result = await pollPublishStatus(accessToken, publish_id);

  progress("done", 100, mode === "inbox" ? "Sent to inbox!" : "Published!");
  log.info("Publish complete", { mode, postId: result.post_id || "pending" });

  return {
    status: result.status,
    publish_id,
    post_id: result.post_id,
  };
}

module.exports = {
  queryCreatorInfo,
  publishVideo,
};
