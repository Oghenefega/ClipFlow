/**
 * Facebook Page Video Publishing via Graph API.
 *
 * Uses direct multipart file upload to graph-video.facebook.com.
 * Requires a Page access token (obtained during Meta OAuth flow).
 */
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const GRAPH_API_VERSION = "v21.0";
const VIDEO_HOST = "graph-video.facebook.com";

/**
 * Upload a video to a Facebook Page via multipart form-data.
 *
 * @param {string} pageAccessToken - Page access token (not user token)
 * @param {string} pageId - Facebook Page ID
 * @param {string} videoPath - Local path to video file
 * @param {object} options - { title, description }
 * @param {function} onProgress - Progress callback: ({ stage, pct, detail })
 * @returns {Promise<object>} - { videoId, status }
 */
async function publishVideo(pageAccessToken, pageId, videoPath, options = {}, onProgress = () => {}) {
  const { title = "", description = "" } = options;

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  const fileName = path.basename(videoPath);
  const fileSize = fs.statSync(videoPath).size;
  console.log(`[Facebook Publish] File: ${videoPath} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);

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
            reject(new Error(`Facebook upload failed: ${result.error.message}`));
            return;
          }

          console.log(`[Facebook Publish] Video uploaded! ID: ${result.id}`);
          onProgress({ stage: "done", pct: 100, detail: "Video published to Facebook!" });

          resolve({
            videoId: result.id,
            status: "PUBLISHED",
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

module.exports = {
  publishVideo,
};
