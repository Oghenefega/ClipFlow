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
 * Upload a local file via the resumable Files API and wait until it is ACTIVE.
 * @returns {Promise<{ uri: string, name: string, mimeType: string }>}
 */
async function uploadFile(apiKey, filePath, mimeType) {
  const bytes = fs.readFileSync(filePath);

  // 1. Start a resumable session — the upload URL comes back in a header.
  const startController = new AbortController();
  const startTimer = setTimeout(() => startController.abort(), DEFAULT_TIMEOUT);
  let uploadUrl;
  try {
    const startRes = await fetch(`${API_BASE}/upload/v1beta/files`, {
      method: "POST",
      signal: startController.signal,
      headers: {
        "x-goog-api-key": apiKey,
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

  // 2. Upload the bytes and finalize in one shot.
  const upController = new AbortController();
  const upTimer = setTimeout(() => upController.abort(), DEFAULT_TIMEOUT);
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
  const deadline = Date.now() + FILE_POLL_TIMEOUT_MS;
  let state = fileInfo.state;
  while (state === "PROCESSING") {
    if (Date.now() > deadline) throw new Error("Files API processing timed out");
    await sleep(FILE_POLL_INTERVAL_MS);
    const info = await fetchJson(`${API_BASE}/v1beta/${fileInfo.name}`, {
      headers: { "x-goog-api-key": apiKey },
    });
    state = info.state;
    fileInfo = info;
  }
  if (state !== "ACTIVE") throw new Error(`Files API file ended in state ${state}`);

  return { uri: fileInfo.uri, name: fileInfo.name, mimeType: fileInfo.mimeType || mimeType };
}

/** Best-effort remote cleanup — uploaded files expire in 48h anyway. */
async function deleteFile(apiKey, name) {
  try {
    await fetch(`${API_BASE}/v1beta/${name}`, {
      method: "DELETE",
      headers: { "x-goog-api-key": apiKey },
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
    if (!apiKey) throw new Error("Gemini API key not configured. Go to Settings.");

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
    try {
      const result = await fetchJson(
        `${API_BASE}/v1beta/models/${useModel}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        timeout || DEFAULT_TIMEOUT
      );

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
