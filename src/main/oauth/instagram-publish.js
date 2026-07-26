/**
 * Instagram Content Publishing API — Reels via Resumable Upload.
 *
 * Supports two token types:
 *   - Instagram Business Login tokens (graph.instagram.com)
 *   - Facebook Login tokens (graph.facebook.com)
 *
 * Flow:
 *   1. Create media container with upload_type=resumable
 *   2. Upload video binary to rupload.facebook.com
 *   3. Poll container status until FINISHED
 *   4. Publish the container
 *
 * Rate limit: 25 posts per 24 hours per Instagram account.
 */
const https = require("https");
const fs = require("fs");
const { URL } = require("url");
const log = require("electron-log/main").scope("instagram");

const GRAPH_API_VERSION = "v21.0";
const FB_GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const IG_GRAPH_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`;

/**
 * Get the correct Graph API base URL based on token/login type.
 * Instagram Business Login tokens use graph.instagram.com.
 * Facebook Login tokens use graph.facebook.com.
 */
function getGraphBase(options) {
  return options?.useIgGraph ? IG_GRAPH_BASE : FB_GRAPH_BASE;
}

// ── HTTP helpers ──

function graphPost(url, body, accessToken) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = typeof body === "string" ? body : new URLSearchParams(body).toString();
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(payload),
        Authorization: `Bearer ${accessToken}`,
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse Instagram response: ${data.substring(0, 500)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function graphGet(url, accessToken) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse Instagram response: ${data.substring(0, 500)}`));
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
 * Publish a video as an Instagram Reel via resumable upload.
 *
 * @param {string} accessToken - User access token
 * @param {string} igUserId - Instagram Business Account ID
 * @param {string} videoPath - Local path to video file
 * @param {object} options - { caption, useIgGraph, uploadAttempts } — useIgGraph=true for
 *   IG Business Login tokens; uploadAttempts trims the retry ladder (#189: long clips get
 *   one shot at full quality before the caller falls back to a 720p copy).
 * @param {function} onProgress - Progress callback: ({ stage, pct, detail })
 * @returns {Promise<object>} - { mediaId, status }
 */
async function publishReel(accessToken, igUserId, videoPath, options = {}, onProgress = () => {}) {
  const { caption = "", useIgGraph = false, uploadAttempts } = options;
  const GRAPH_BASE = getGraphBase({ useIgGraph });

  // Validate file exists
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }
  const fileSize = fs.statSync(videoPath).size;
  log.info("Starting publish", { videoPath, sizeMB: (fileSize / 1024 / 1024).toFixed(1) });

  // The upload step is retried as a unit (#185). Meta's rupload endpoint gives itself
  // ~33-35s to process a completed upload and returns ProcessingFailedError when it
  // runs out, so the same bytes can fail once and succeed the next time — measured
  // both outcomes on byte-identical files. Its `retriable: false` flag is not reliable.
  // A failed container can't be reused (the server resets its offset to 0), so each
  // attempt creates a fresh one. Chunked upload does NOT avoid this: the pieces are
  // accepted in <1s each and the final piece hits the same 34s wall.
  const UPLOAD_ATTEMPTS = uploadAttempts || 3;
  const RETRY_DELAYS_MS = [20000, 60000];
  let containerId;
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
    try {
      containerId = await createContainerAndUpload();
      break;
    } catch (err) {
      if (attempt === UPLOAD_ATTEMPTS) {
        log.error("Upload failed on every attempt", { attempts: UPLOAD_ATTEMPTS, error: err.message });
        // #189: the tag is INHERITED from the underlying failure, never stamped on every
        // exhaustion — an expired token exhausts this loop too, and re-encoding at 720p
        // for an OAuth error is pure waste. Same reason the summary wording below is
        // reserved for real processing failures: "long clips at 1080p are the usual
        // cause" is actively misleading when the actual cause was a bad token.
        if (!err.processingWall) throw err;
        throw taggedProcessingError(
          `Instagram could not process this clip after ${UPLOAD_ATTEMPTS} attempt${UPLOAD_ATTEMPTS === 1 ? "" : "s"}. ` +
            `Long clips at 1080p are the usual cause — Instagram's upload processing times out on them. ` +
            `A shorter cut usually goes through. (${err.message})`
        );
      }
      const waitMs = RETRY_DELAYS_MS[attempt - 1];
      log.warn("Upload attempt failed — retrying", { attempt, of: UPLOAD_ATTEMPTS, waitSec: waitMs / 1000, error: err.message });
      onProgress({
        stage: "retrying",
        pct: 10,
        detail: `Instagram rejected the upload — retrying in ${waitMs / 1000}s (${attempt + 1}/${UPLOAD_ATTEMPTS})...`,
      });
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  return pollAndPublish(containerId);

  // Steps 1-2: create the container and push the bytes. Returns the container id.
  async function createContainerAndUpload() {
    onProgress({ stage: "init", pct: 5, detail: "Creating media container..." });

    const containerBody = {
      media_type: "REELS",
      upload_type: "resumable",
    };
    if (caption) containerBody.caption = caption;

    // For Instagram Business Login (graph.instagram.com), the `/me/media` endpoint
    // resolves to whichever IG user the access token represents — no stored ID lookup.
    // The OAuth `user_id` field captured at connect time is *not* always the same
    // identifier the Content Publishing API expects, so we route through `/me` instead.
    // For Facebook Login (graph.facebook.com), keep the explicit IG account ID — that
    // flow uses the FB-Page-linked IG Business Account ID, which is reliable.
    const containerPath = useIgGraph ? `${GRAPH_BASE}/me/media` : `${GRAPH_BASE}/${igUserId}/media`;
    log.info("Container request", { url: containerPath, igUserId, useIgGraph });
    const containerResult = await graphPost(
      containerPath,
      containerBody,
      accessToken
    );
    log.info("Container response", { result: containerResult });

    if (containerResult.error) {
      const errType = containerResult.error.type || "?";
      const errCode = containerResult.error.code || "?";
      const errSub = containerResult.error.error_subcode || "?";
      const traceId = containerResult.error.fbtrace_id || "?";
      throw new Error(`Container creation failed [type=${errType}, code=${errCode}, sub=${errSub}, trace=${traceId}]: ${containerResult.error.message}`);
    }

    const containerId = containerResult.id;
    const uploadUri = containerResult.uri;
    log.info("Container created", { containerId });
    log.debug("Upload URI obtained", { uploadUri });

    if (!uploadUri) {
      throw new Error("No upload URI returned. Check permissions and account type.");
    }

    // Step 2: Upload video binary
    onProgress({ stage: "uploading", pct: 15, detail: "Uploading video..." });

    const fileBuffer = fs.readFileSync(videoPath);
    const uploadResult = await uploadBinary(uploadUri, fileBuffer, fileSize, accessToken);

    if (!uploadResult.body.success && uploadResult.statusCode !== 200) {
      // This is where the ~35s wall lands: rupload accepts the bytes, runs out of its own
      // processing budget, and answers ProcessingFailedError. The one failure a smaller
      // file actually fixes (#189).
      throw taggedProcessingError(`Upload failed (HTTP ${uploadResult.statusCode}): ${JSON.stringify(uploadResult.body)}`);
    }

    log.info("Upload complete, polling status...");
    return containerId;
  }

  // Steps 3-4: wait for Instagram to finish processing, then publish.
  async function pollAndPublish(containerId) {
    onProgress({ stage: "processing", pct: 60, detail: "Processing on Instagram..." });

    // Step 3: Poll container status until FINISHED
    const maxAttempts = 60; // 10 minutes (10s intervals)
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 10000));
      }

      const statusResult = await graphGet(
        `${GRAPH_BASE}/${containerId}?fields=id,status_code,status`,
        accessToken
      );

      const statusCode = statusResult.status_code;
      log.info("Poll status", { attempt: `${attempt + 1}/${maxAttempts}`, statusCode });

      if (statusCode === "FINISHED") {
        onProgress({ stage: "publishing", pct: 85, detail: "Publishing Reel..." });

        // Step 4: Publish the container — route via /me for IG Business Login (same
        // reasoning as Step 1: avoids stored-IG-user-id mismatch).
        const publishPath = useIgGraph ? `${GRAPH_BASE}/me/media_publish` : `${GRAPH_BASE}/${igUserId}/media_publish`;
        const publishResult = await graphPost(
          publishPath,
          { creation_id: containerId },
          accessToken
        );

        if (publishResult.error) {
          throw new Error(`Publish failed: ${publishResult.error.message}`);
        }

        log.info("Published!", { mediaId: publishResult.id });
        onProgress({ stage: "done", pct: 100, detail: "Reel published!" });

        return {
          mediaId: publishResult.id,
          containerId,
          status: "PUBLISHED",
        };
      }

      if (statusCode === "ERROR") {
        const errDetail = statusResult.status || "Unknown processing error";
        throw taggedProcessingError(`Instagram processing failed: ${errDetail}`);
      }

      // Still processing — update progress (60-85% range)
      const progressPct = 60 + Math.min(25, Math.round((attempt / maxAttempts) * 25));
      onProgress({ stage: "processing", pct: progressPct, detail: `Processing on Instagram (${attempt + 1})...` });
    }

    throw taggedProcessingError("Instagram processing timed out after 10 minutes");
  }
}

/**
 * Mark an error as "Meta failed to process these bytes" (#189).
 *
 * Only these failures are worth re-attempting with a smaller file. Auth, account,
 * permission and missing-file errors are deliberately left untagged — a 720p copy
 * fails them identically and the encode is wasted.
 */
function taggedProcessingError(message) {
  const err = new Error(message);
  err.processingWall = true;
  return err;
}

module.exports = {
  publishReel,
};
