/**
 * Facebook Page Publishing via Graph API.
 *
 * Two publish surfaces:
 *   - Reels (`/video_reels`, three-phase resumable upload) — the default for clips
 *     inside Facebook's Reels duration window (3–90s inclusive). This is the surface
 *     with short-form distribution; legacy /videos posts never enter the Reels feed.
 *   - Legacy Page video (`/videos`, multipart upload) — fallback for clips outside
 *     the Reels window. Proven path, kept intact.
 *
 * publish() probes the clip duration with ffprobe and routes between them.
 * Requires a Page access token (obtained during Meta OAuth flow).
 */
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const log = require("electron-log/main").scope("facebook");
const ffmpeg = require("../ffmpeg");

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const RUPLOAD_BASE = `https://rupload.facebook.com/video-upload/${GRAPH_API_VERSION}`;
const VIDEO_HOST = "graph-video.facebook.com";

// Facebook Reels duration window (seconds, inclusive). Outside it → legacy video post.
const REELS_MIN_SEC = 3;
const REELS_MAX_SEC = 90;

// Known Graph API error codes worth a human-readable message instead of a raw API dump.
const FB_ERROR_HINTS = {
  613: "Facebook Reels rate limit reached (30 API-published Reels per page per 24 hours). Try again later.",
  6000: "Facebook could not process the video upload. Try publishing again.",
  190: "Facebook session expired or invalid. Reconnect your Facebook Page in Settings.",
  100: "Facebook rejected a request parameter.",
  200: "Missing Facebook permissions. Reconnect your Facebook Page in Settings.",
};

function fbError(prefix, error) {
  const code = error?.code;
  const hint = FB_ERROR_HINTS[code];
  const detail = `[code=${code ?? "?"}, sub=${error?.error_subcode ?? "?"}, trace=${error?.fbtrace_id ?? "?"}]`;
  const raw = error?.message || "Unknown error";
  return new Error(hint ? `${hint} ${detail} ${raw}` : `${prefix} ${detail}: ${raw}`);
}

// ── HTTP helpers (adapted from instagram-publish.js — same Meta upload infra) ──

function graphPost(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = new URLSearchParams(body).toString();
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
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
          reject(new Error(`Failed to parse Facebook response: ${data.substring(0, 500)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function graphGet(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "GET",
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse Facebook response: ${data.substring(0, 500)}`));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Upload binary data to a URL (for rupload.facebook.com).
 */
function uploadBinary(uploadUrl, fileBuffer, fileSize, accessToken) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(uploadUrl);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        Authorization: `OAuth ${accessToken}`,
        offset: "0",
        file_size: String(fileSize),
        "Content-Type": "application/octet-stream",
        "Content-Length": fileSize,
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          reject(new Error(`Upload response parse error (HTTP ${res.statusCode}): ${data.substring(0, 500)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(fileBuffer);
    req.end();
  });
}

/**
 * Publish a video to the Page's Reels surface via the three-phase video_reels flow.
 *
 * @param {string} pageAccessToken - Page access token (not user token)
 * @param {string} pageId - Facebook Page ID
 * @param {string} videoPath - Local path to video file
 * @param {object} options - { description }
 * @param {function} onProgress - Progress callback: ({ stage, pct, detail })
 * @returns {Promise<object>} - { videoId, postId, status, surface, url }
 */
async function publishReel(pageAccessToken, pageId, videoPath, options = {}, onProgress = () => {}) {
  const { description = "" } = options;

  const fileSize = fs.statSync(videoPath).size;
  log.info("Starting Reels publish", { videoPath, sizeMB: (fileSize / 1024 / 1024).toFixed(1) });

  // Phase 1: start the upload session
  onProgress({ stage: "init", pct: 5, detail: "Starting Facebook Reels upload..." });
  const startResult = await graphPost(`${GRAPH_BASE}/${pageId}/video_reels`, {
    upload_phase: "start",
    access_token: pageAccessToken,
  });
  if (startResult.error) throw fbError("Reels upload start failed", startResult.error);

  const videoId = startResult.video_id;
  if (!videoId) {
    throw new Error(`Reels upload start returned no video_id: ${JSON.stringify(startResult).substring(0, 500)}`);
  }
  // Prefer the upload_url returned by phase 1 verbatim; reconstruct only if absent.
  const uploadUrl = startResult.upload_url || `${RUPLOAD_BASE}/${videoId}`;
  log.info("Reels upload session created", { videoId, uploadUrl });

  // Phase 2: upload the binary
  onProgress({ stage: "uploading", pct: 15, detail: "Uploading video to Facebook..." });
  const fileBuffer = fs.readFileSync(videoPath);
  const uploadResult = await uploadBinary(uploadUrl, fileBuffer, fileSize, pageAccessToken);
  if (!uploadResult.body.success && uploadResult.statusCode !== 200) {
    throw new Error(`Reels upload failed (HTTP ${uploadResult.statusCode}): ${JSON.stringify(uploadResult.body).substring(0, 500)}`);
  }
  log.info("Reels binary upload complete, checking status...");
  onProgress({ stage: "processing", pct: 60, detail: "Processing on Facebook..." });

  // Poll upload status before finishing. Meta's public docs are thin on the status
  // shape for video_reels, so log the raw response (first poll) and parse tolerantly:
  // if the shape is unrecognized, proceed to finish rather than blocking — the binary
  // upload already returned success synchronously.
  const maxAttempts = 60; // 10 minutes (10s intervals), mirrors Instagram polling
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 10000));
    }

    const statusResult = await graphGet(
      `${GRAPH_BASE}/${videoId}?fields=status&access_token=${encodeURIComponent(pageAccessToken)}`
    );
    if (attempt === 0) {
      log.info("Reels status raw response", { raw: JSON.stringify(statusResult).substring(0, 2000) });
    }
    if (statusResult.error) throw fbError("Reels status check failed", statusResult.error);

    const status = statusResult.status || {};
    const videoStatus = status.video_status || null;
    const uploadingStatus = status.uploading_phase?.status || null;
    log.info("Reels poll status", { attempt: `${attempt + 1}/${maxAttempts}`, videoStatus, uploadingStatus });

    if (videoStatus === "error" || uploadingStatus === "error") {
      throw new Error(`Facebook Reels processing failed: ${JSON.stringify(status).substring(0, 500)}`);
    }
    if (uploadingStatus === "complete" || videoStatus === "upload_complete" || videoStatus === "ready") {
      break;
    }
    if (!uploadingStatus && !videoStatus) {
      log.warn("Unrecognized Reels status shape — proceeding to finish", { raw: JSON.stringify(statusResult).substring(0, 500) });
      break;
    }

    const progressPct = 60 + Math.min(20, Math.round((attempt / maxAttempts) * 20));
    onProgress({ stage: "processing", pct: progressPct, detail: `Processing on Facebook (${attempt + 1})...` });
    if (attempt === maxAttempts - 1) {
      throw new Error("Facebook Reels upload processing timed out after 10 minutes");
    }
  }

  // Phase 3: finish and publish
  onProgress({ stage: "publishing", pct: 85, detail: "Publishing Reel..." });
  const finishResult = await graphPost(`${GRAPH_BASE}/${pageId}/video_reels`, {
    video_id: videoId,
    upload_phase: "finish",
    video_state: "PUBLISHED",
    description,
    access_token: pageAccessToken,
  });
  log.info("Reels finish raw response", { raw: JSON.stringify(finishResult).substring(0, 2000) });
  if (finishResult.error) throw fbError("Reels publish failed", finishResult.error);

  const postId = finishResult.post_id || null;
  log.info("Reel published!", { videoId, postId });
  onProgress({ stage: "done", pct: 100, detail: "Reel published to Facebook!" });

  return {
    videoId,
    postId,
    status: "PUBLISHED",
    surface: "reels",
    url: `https://www.facebook.com/reel/${videoId}`,
  };
}

/**
 * Upload a video to a Facebook Page via multipart form-data (legacy /videos endpoint).
 * Fallback path for clips outside the Reels duration window — these land in the
 * page's Videos tab, not the Reels feed.
 *
 * @param {string} pageAccessToken - Page access token (not user token)
 * @param {string} pageId - Facebook Page ID
 * @param {string} videoPath - Local path to video file
 * @param {object} options - { title, description }
 * @param {function} onProgress - Progress callback: ({ stage, pct, detail })
 * @returns {Promise<object>} - { videoId, postId, status, surface, url }
 */
async function publishLegacyVideo(pageAccessToken, pageId, videoPath, options = {}, onProgress = () => {}) {
  const { title = "", description = "" } = options;

  const fileName = path.basename(videoPath);
  const fileSize = fs.statSync(videoPath).size;
  log.info("Starting publish", { videoPath, sizeMB: (fileSize / 1024 / 1024).toFixed(1) });

  onProgress({ stage: "uploading", pct: 10, detail: "Uploading video to Facebook..." });

  // Build multipart form-data
  const boundary = `----ClipFlowBoundary${Date.now()}`;
  const fileBuffer = fs.readFileSync(videoPath);

  // Construct form fields
  const fields = {
    access_token: pageAccessToken,
  };
  if (title) fields.title = title;
  if (description) fields.description = description;

  let formParts = [];
  for (const [key, value] of Object.entries(fields)) {
    formParts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
      `${value}\r\n`
    );
  }

  // File part
  formParts.push(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="source"; filename="${fileName}"\r\n` +
    `Content-Type: video/mp4\r\n\r\n`
  );

  const formHeader = Buffer.from(formParts.join(""));
  const formFooter = Buffer.from(`\r\n--${boundary}--\r\n`);
  const totalLength = formHeader.length + fileBuffer.length + formFooter.length;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: VIDEO_HOST,
      path: `/${GRAPH_API_VERSION}/${pageId}/videos`,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": totalLength,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const result = JSON.parse(data);
          if (result.error) {
            reject(fbError("Facebook upload failed", result.error));
            return;
          }

          log.info("Video uploaded!", { videoId: result.id });
          onProgress({ stage: "done", pct: 100, detail: "Video published to Facebook!" });

          resolve({
            videoId: result.id,
            // Legacy /videos returns only a video ID — no post ID, and no page-post
            // URL we can derive reliably. Leave both null rather than store a 404.
            postId: null,
            status: "PUBLISHED",
            surface: "video",
            url: null,
          });
        } catch (e) {
          reject(new Error(`Failed to parse Facebook response: ${data.substring(0, 500)}`));
        }
      });
    });

    req.on("error", reject);

    // Write multipart body
    req.write(formHeader);
    req.write(fileBuffer);
    req.write(formFooter);
    req.end();

    // Progress approximation (upload starts at 10%, finishes at 90%)
    onProgress({ stage: "uploading", pct: 50, detail: "Uploading..." });
  });
}

/**
 * Publish a video to a Facebook Page, routing by duration:
 * inside the Reels window (3–90s inclusive) → Reels surface; outside it (or if the
 * probe fails) → legacy Page video. The fallback is silent-but-logged by design —
 * a clip that can't be a Reel must never fail the multi-platform publish.
 *
 * @param {string} pageAccessToken - Page access token (not user token)
 * @param {string} pageId - Facebook Page ID
 * @param {string} videoPath - Local path to video file
 * @param {object} options - { title, description }
 * @param {function} onProgress - Progress callback: ({ stage, pct, detail })
 * @returns {Promise<object>} - { videoId, postId, status, surface, url }
 */
async function publish(pageAccessToken, pageId, videoPath, options = {}, onProgress = () => {}) {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  let duration = null;
  try {
    duration = (await ffmpeg.probe(videoPath)).duration;
  } catch (e) {
    log.warn("Duration probe failed — falling back to legacy video post", { error: e.message });
  }

  const useReels = duration !== null && duration >= REELS_MIN_SEC && duration <= REELS_MAX_SEC;
  log.info("Routing Facebook publish", { duration, surface: useReels ? "reels" : "video" });

  if (useReels) {
    return publishReel(pageAccessToken, pageId, videoPath, options, onProgress);
  }
  return publishLegacyVideo(pageAccessToken, pageId, videoPath, options, onProgress);
}

module.exports = {
  publish,
  publishReel,
  publishLegacyVideo,
};
