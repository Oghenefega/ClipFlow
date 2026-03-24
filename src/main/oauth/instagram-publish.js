/**
 * Instagram Content Publishing API — Reels via Resumable Upload.
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

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

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
 * @param {string} accessToken - User access token with instagram_content_publish scope
 * @param {string} igUserId - Instagram Business Account ID
 * @param {string} videoPath - Local path to video file
 * @param {object} options - { caption }
 * @param {function} onProgress - Progress callback: ({ stage, pct, detail })
 * @returns {Promise<object>} - { mediaId, status }
 */
async function publishReel(accessToken, igUserId, videoPath, options = {}, onProgress = () => {}) {
  const { caption = "" } = options;

  // Validate file exists
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }
  const fileSize = fs.statSync(videoPath).size;
  console.log(`[Instagram Publish] File: ${videoPath} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);

  // Step 1: Create media container with resumable upload
  onProgress({ stage: "init", pct: 5, detail: "Creating media container..." });

  const containerBody = {
    media_type: "REELS",
    upload_type: "resumable",
  };
  if (caption) containerBody.caption = caption;

  const containerResult = await graphPost(
    `${GRAPH_BASE}/${igUserId}/media`,
    containerBody,
    accessToken
  );

  if (containerResult.error) {
    throw new Error(`Container creation failed: ${containerResult.error.message}`);
  }

  const containerId = containerResult.id;
  const uploadUri = containerResult.uri;
  console.log(`[Instagram Publish] Container: ${containerId}`);
  console.log(`[Instagram Publish] Upload URI: ${uploadUri}`);

  if (!uploadUri) {
    throw new Error("No upload URI returned. Check permissions and account type.");
  }

  // Step 2: Upload video binary
  onProgress({ stage: "uploading", pct: 15, detail: "Uploading video..." });

  const fileBuffer = fs.readFileSync(videoPath);
  const uploadResult = await uploadBinary(uploadUri, fileBuffer, fileSize, accessToken);

  if (!uploadResult.body.success && uploadResult.statusCode !== 200) {
    throw new Error(`Upload failed (HTTP ${uploadResult.statusCode}): ${JSON.stringify(uploadResult.body)}`);
  }

  console.log("[Instagram Publish] Upload complete, polling status...");
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
    console.log(`[Instagram Publish] Poll ${attempt + 1}/${maxAttempts}: ${statusCode}`);

    if (statusCode === "FINISHED") {
      onProgress({ stage: "publishing", pct: 85, detail: "Publishing Reel..." });

      // Step 4: Publish the container
      const publishResult = await graphPost(
        `${GRAPH_BASE}/${igUserId}/media_publish`,
        { creation_id: containerId },
        accessToken
      );

      if (publishResult.error) {
        throw new Error(`Publish failed: ${publishResult.error.message}`);
      }

      console.log(`[Instagram Publish] Published! Media ID: ${publishResult.id}`);
      onProgress({ stage: "done", pct: 100, detail: "Reel published!" });

      return {
        mediaId: publishResult.id,
        containerId,
        status: "PUBLISHED",
      };
    }

    if (statusCode === "ERROR") {
      const errDetail = statusResult.status || "Unknown processing error";
      throw new Error(`Instagram processing failed: ${errDetail}`);
    }

    // Still processing — update progress (60-85% range)
    const progressPct = 60 + Math.min(25, Math.round((attempt / maxAttempts) * 25));
    onProgress({ stage: "processing", pct: progressPct, detail: `Processing on Instagram (${attempt + 1})...` });
  }

  throw new Error("Instagram processing timed out after 10 minutes");
}

module.exports = {
  publishReel,
};
