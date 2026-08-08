/**
 * Google Gemini Native LLM Provider (#193)
 *
 * Exists for ONE capability the OpenAI-compat shim cannot reach: native video
 * input (with audio) for title/caption generation. Everything text-only should
 * keep using the anthropic provider or the compat shim.
 *
 * Accepts the same Anthropic-style content blocks the rest of the app builds,
 * plus one extra block type:
 *   { type: "video", path: "<local file>", mimeType: "video/mp4" }
 *
 * Video delivery follows Google's size rule: inline base64 when the whole
 * request stays under the 20MB limit, the resumable Files API above it
 * (upload → poll until ACTIVE → reference by fileUri, best-effort delete
 * after the call).
 *
 * Key: `geminiApiKey` in electron-store (Settings → API Credentials → Gemini).
 * #249: when a Cloudflare gateway token is set, the key is optional — calls
 * route through the AI Gateway and Cloudflare injects the key server-side.
 */

const fs = require("fs");
const path = require("path");
const { registerProvider, getStore } = require("../llm-provider");
const log = require("electron-log");

const API_BASE = "https://generativelanguage.googleapis.com";
const DEFAULT_MODEL = "gemini-3.6-flash";
const DEFAULT_TIMEOUT = 180000; // 3 min — server-side video tokenization is slower than text
// Inline ceiling on the raw file: 14MB of video ≈ 18.7MB as base64, leaving
// headroom for the prompt inside Google's 20MB request limit.
const INLINE_LIMIT_BYTES = 14 * 1024 * 1024;
const FILE_POLL_INTERVAL_MS = 2000;
const FILE_POLL_TIMEOUT_MS = 90000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, options, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout || DEFAULT_TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const body = await res.text();
    let json = null;
    try { json = JSON.parse(body); } catch (_) { /* non-JSON error body */ }
    if (!res.ok) {
      // Cloudflare gateway errors come back as arrays, not objects with .error
      if (Array.isArray(json) && json[0]?.code) {
        throw new Error(`Gateway error (HTTP ${res.status}): ${json[0].message || JSON.stringify(json)}`);
      }
      const msg = json?.error?.message || body.substring(0, 300);
      throw new Error(`Gemini API error (HTTP ${res.status}): ${msg}`);
    }
    return json;
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`Gemini API request timed out after ${(timeout || DEFAULT_TIMEOUT) / 1000}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * #249: resolve where Gemini calls go and how they authenticate.
 * Gateway URL configured → route through the Cloudflare AI Gateway; with a
 * gateway token Cloudflare injects the provider key server-side (BYOK) and no
 * Google key leaves the machine. No gateway → direct to Google with the raw
 * key. Legacy installs stored the Anthropic-specific gateway URL — strip the
 * trailing /anthropic to recover the base.
 */
function resolveRouting(apiKey) {
  const store = getStore();
  const gatewayUrl = store ? String(store.get("gatewayUrl") || "").trim() : "";
  const authToken = store ? String(store.get("gatewayAuthToken") || "").trim() : "";
  if (gatewayUrl) {
    try {
      const base = gatewayUrl.replace(/\/+$/, "").replace(/\/anthropic$/, "");
      new URL(base); // validate before committing to the route
      return {
        base: `${base}/google-ai-studio`,
        authHeaders: authToken
          ? { "cf-aig-authorization": `Bearer ${authToken}` }
          : { "x-goog-api-key": apiKey },
        mode: authToken ? "Gateway (BYOK)" : "Gateway (passthrough)",
        byok: Boolean(authToken),
      };
    } catch (e) {
      log.warn("[gemini] Invalid gateway URL, falling back to direct:", gatewayUrl);
    }
  }
  return { base: API_BASE, authHeaders: { "x-goog-api-key": apiKey }, mode: "Direct", byok: false };
}

/**
 * #249: whether a Gemini call can authenticate — a raw key in Settings OR a
 * gateway token (Cloudflare supplies the key). Feature gates use this instead
 * of checking geminiApiKey directly.
 */
function isConfigured() {
  const store = getStore();
  if (!store) return false;
  if (String(store.get("geminiApiKey") || "").trim()) return true;
  return Boolean(
    String(store.get("gatewayUrl") || "").trim() &&
    String(store.get("gatewayAuthToken") || "").trim()
  );
}

/**
 * Upload a local file via the resumable Files API and wait until it is ACTIVE.
 * Timeouts are tuned for titlegen clips by default; the #235 full-recording
 * watch passes much longer ones (a ~140MB proxy uploads and processes in
 * minutes, not seconds).
 * @param {object} [opts]
 * @param {number} [opts.uploadTimeoutMs] - Byte upload timeout (default 3 min)
 * @param {number} [opts.pollTimeoutMs] - PROCESSING→ACTIVE poll timeout (default 90s)
 * @returns {Promise<{ uri: string, name: string, mimeType: string }>}
 */
async function uploadFile(apiKey, filePath, mimeType, opts = {}) {
  const uploadTimeoutMs = opts.uploadTimeoutMs || DEFAULT_TIMEOUT;
  const pollTimeoutMs = opts.pollTimeoutMs || FILE_POLL_TIMEOUT_MS;
  const routing = resolveRouting(apiKey);
  const bytes = fs.readFileSync(filePath);

  // 1. Start a resumable session — the upload URL comes back in a header.
  const startController = new AbortController();
  const startTimer = setTimeout(() => startController.abort(), DEFAULT_TIMEOUT);
  let uploadUrl;
  try {
    const startRes = await fetch(`${routing.base}/upload/v1beta/files`, {
      method: "POST",
      signal: startController.signal,
      headers: {
        ...routing.authHeaders,
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(bytes.length),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: path.basename(filePath) } }),
    });
    if (!startRes.ok) {
      throw new Error(`Files API start failed (HTTP ${startRes.status}): ${(await startRes.text()).substring(0, 300)}`);
    }
    uploadUrl = startRes.headers.get("x-goog-upload-url");
    if (!uploadUrl) throw new Error("Files API start returned no upload URL");
  } finally {
    clearTimeout(startTimer);
  }

  // 2. Upload the bytes and finalize in one shot. Goes to the Google-issued
  // uploadUrl directly, NOT the gateway (#249) — that URL carries its own
  // authorization and needs no key.
  const upController = new AbortController();
  const upTimer = setTimeout(() => upController.abort(), uploadTimeoutMs);
  let fileInfo;
  try {
    const upRes = await fetch(uploadUrl, {
      method: "POST",
      signal: upController.signal,
      headers: {
        "Content-Length": String(bytes.length),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: bytes,
    });
    if (!upRes.ok) {
      throw new Error(`Files API upload failed (HTTP ${upRes.status}): ${(await upRes.text()).substring(0, 300)}`);
    }
    fileInfo = (await upRes.json()).file;
  } finally {
    clearTimeout(upTimer);
  }
  if (!fileInfo?.name) throw new Error("Files API upload returned no file name");

  // 3. Poll until processed — video stays in PROCESSING for a few seconds.
  const deadline = Date.now() + pollTimeoutMs;
  let state = fileInfo.state;
  while (state === "PROCESSING") {
    if (Date.now() > deadline) throw new Error("Files API processing timed out");
    await sleep(FILE_POLL_INTERVAL_MS);
    const info = await fetchJson(`${routing.base}/v1beta/${fileInfo.name}`, {
      headers: { ...routing.authHeaders },
    });
    state = info.state;
    fileInfo = info;
  }
  if (state !== "ACTIVE") throw new Error(`Files API file ended in state ${state}`);

  return { uri: fileInfo.uri, name: fileInfo.name, mimeType: fileInfo.mimeType || mimeType };
}

/** Best-effort remote cleanup — uploaded files expire in 48h anyway. */
async function deleteFile(apiKey, name) {
  const routing = resolveRouting(apiKey);
  try {
    await fetch(`${routing.base}/v1beta/${name}`, {
      method: "DELETE",
      headers: { ...routing.authHeaders },
    });
  } catch (e) {
    log.warn(`[gemini] Could not delete uploaded file ${name}: ${e.message}`);
  }
}

/**
 * Translate Anthropic-style content (string or block array) into Gemini parts.
 * Returns { parts, uploadedFile } — uploadedFile is set when a video went
 * through the Files API and should be deleted after the call.
 */
async function buildParts(apiKey, content) {
  if (typeof content === "string") return { parts: [{ text: content }], uploadedFile: null };

  const parts = [];
  let uploadedFile = null;
  for (const block of content) {
    if (!block) continue;
    if (block.type === "text") {
      if (block.text) parts.push({ text: block.text });
    } else if (block.type === "image" && block.source?.data) {
      parts.push({ inlineData: { mimeType: block.source.media_type || "image/jpeg", data: block.source.data } });
    } else if (block.type === "video_ref" && block.uri) {
      // #235: video already uploaded by the caller (gemini-watch.js owns the
      // upload + cleanup) — reference it, never re-upload or delete it here.
      parts.push({ fileData: { mimeType: block.mimeType || "video/mp4", fileUri: block.uri } });
    } else if (block.type === "video" && block.path) {
      const mimeType = block.mimeType || "video/mp4";
      const size = fs.statSync(block.path).size;
      if (size <= INLINE_LIMIT_BYTES) {
        log.info(`[gemini] Video inline (${(size / 1024 / 1024).toFixed(1)}MB)`);
        parts.push({ inlineData: { mimeType, data: fs.readFileSync(block.path).toString("base64") } });
      } else {
        log.info(`[gemini] Video via Files API (${(size / 1024 / 1024).toFixed(1)}MB)`);
        uploadedFile = await uploadFile(apiKey, block.path, mimeType);
        parts.push({ fileData: { mimeType: uploadedFile.mimeType, fileUri: uploadedFile.uri } });
      }
    }
  }
  return { parts, uploadedFile };
}

// ── Provider Implementation ──

const provider = {
  name: "gemini",
  defaultModel: DEFAULT_MODEL,

  /**
   * Send a chat request to the Gemini generateContent API.
   * Same contract as the other providers:
   * @returns {Promise<{ text: string, toolCalls: null, usage: { inputTokens: number, outputTokens: number } }>}
   */
  async chat({ model, system, messages, maxTokens, timeout }) {
    const store = getStore();
    const apiKey = store ? String(store.get("geminiApiKey") || "").trim() : "";
    const routing = resolveRouting(apiKey);
    // BYOK: Gemini key not required when gateway handles auth via Provider Keys
    if (!apiKey && !routing.byok) throw new Error("Gemini API key not configured. Go to Settings.");

    const contents = [];
    let uploadedFile = null;
    for (const msg of messages || []) {
      const { parts, uploadedFile: up } = await buildParts(apiKey, msg.content);
      if (up) uploadedFile = up;
      contents.push({ role: msg.role === "assistant" ? "model" : "user", parts });
    }

    const body = {
      contents,
      // responseMimeType hard-enforces the JSON-only output contract the
      // shared prompt asks for — no fences, no preamble.
      generationConfig: { maxOutputTokens: maxTokens || 2048, responseMimeType: "application/json" },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };

    const useModel = model || DEFAULT_MODEL;
    log.info(`[gemini] ${routing.mode} → ${routing.base}/v1beta/models/${useModel}:generateContent`);
    try {
      const doGenerate = () => fetchJson(
        `${routing.base}/v1beta/models/${useModel}:generateContent`,
        {
          method: "POST",
          headers: { ...routing.authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        timeout || DEFAULT_TIMEOUT
      );
      // One retry on overload (503/429): observed on day-6 gemini-3.6-flash —
      // a video request 503'd while text served fine seconds later. A single
      // 3s-spaced retry rescues the video path; anything worse still falls
      // back to frames at the caller.
      let result;
      try {
        result = await doGenerate();
      } catch (e) {
        if (!/HTTP (503|429)/.test(e.message)) throw e;
        log.warn(`[gemini] ${e.message.substring(0, 120)} — retrying once in 3s`);
        await sleep(3000);
        result = await doGenerate();
      }

      if (result.promptFeedback?.blockReason) {
        throw new Error(`Gemini blocked the request: ${result.promptFeedback.blockReason}`);
      }
      const candidate = result.candidates?.[0];
      const text = (candidate?.content?.parts || [])
        .filter((p) => typeof p.text === "string")
        .map((p) => p.text)
        .join("\n");
      const usage = result.usageMetadata || {};

      return {
        text,
        toolCalls: null,
        usage: {
          inputTokens: usage.promptTokenCount || 0,
          // Thinking tokens bill as output — count them or the cost log lies.
          outputTokens: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0),
        },
      };
    } finally {
      if (uploadedFile) await deleteFile(apiKey, uploadedFile.name);
    }
  },
};

// Self-register
registerProvider("gemini", provider);

module.exports = provider;
// Files API helpers for callers that manage their own upload lifecycle (#235)
module.exports.uploadFile = uploadFile;
module.exports.deleteFile = deleteFile;
// #249: "can Gemini authenticate?" — raw key or gateway BYOK. For feature gates.
module.exports.isConfigured = isConfigured;
