/**
 * Anthropic Native LLM Provider
 *
 * Consolidates callClaudeApi (ai-pipeline.js) and anthropicRequest (main.js)
 * into a single implementation behind the common LLM interface.
 *
 * Handles:
 * - system as top-level param (not a message)
 * - x-api-key + anthropic-version headers
 * - Content block arrays for multimodal (base64 images)
 * - Tool use (web_search for game research)
 * - 120s timeout on all calls
 * - Token usage extraction
 */

const https = require("https");
const { registerProvider, getStore } = require("../llm-provider");
const log = require("electron-log");

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT = 120000; // 120 seconds
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DIRECT_HOST = "api.anthropic.com";
const DIRECT_PATH = "/v1/messages";

/**
 * Make a raw HTTPS request to the Anthropic Messages API.
 *
 * @param {string} apiKey
 * @param {object} body - Full request body (model, system, messages, max_tokens, etc.)
 * @param {object} [opts]
 * @param {number} [opts.timeout=120000]
 * @param {object} [opts.gateway] - Cloudflare AI Gateway config
 * @param {string} opts.gateway.url - Gateway base URL (e.g. https://gateway.ai.cloudflare.com/v1/.../anthropic)
 * @param {string} opts.gateway.authToken - cf-aig-authorization bearer token
 * @returns {Promise<object>} Raw API response
 */
function anthropicRequest(apiKey, body, opts = {}) {
  const { timeout = DEFAULT_TIMEOUT, gateway } = opts;

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);

    let hostname = DIRECT_HOST;
    let path = DIRECT_PATH;
    let port;

    if (gateway && gateway.url && gateway.authToken) {
      try {
        const parsed = new URL(gateway.url.replace(/\/+$/, ""));
        hostname = parsed.hostname;
        port = parsed.port || undefined;
        path = parsed.pathname + DIRECT_PATH;
      } catch (e) {
        log.warn("[anthropic] Invalid gateway URL, falling back to direct:", gateway.url);
      }
    }

    const headers = {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    };

    // Cloudflare AI Gateway auth header
    // Docs: https://developers.cloudflare.com/ai-gateway/configuration/authentication/
    if (gateway && gateway.authToken) {
      headers["cf-aig-authorization"] = `Bearer ${gateway.authToken}`;
    }

    const options = { hostname, path, method: "POST", headers };
    if (port) options.port = port;

    log.info(`[anthropic] ${hostname === DIRECT_HOST ? "Direct" : "Gateway"} → ${hostname}${path}`);

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const result = JSON.parse(data);
          if (result.error) {
            return reject(new Error(`Anthropic API error: ${result.error.message || JSON.stringify(result.error)}`));
          }
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse Anthropic response: ${data.substring(0, 300)}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error(`Anthropic API request timed out after ${timeout / 1000}s`));
    });
    req.write(payload);
    req.end();
  });
}

/**
 * Extract text from Anthropic content blocks.
 * Handles responses with mixed content types (text, tool_use, etc.)
 *
 * @param {Array} content - Anthropic response content array
 * @returns {string} Concatenated text from all text blocks
 */
function extractText(content) {
  if (!content || content.length === 0) return "";
  return content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n\n");
}

/**
 * Extract tool calls from Anthropic content blocks.
 *
 * @param {Array} content - Anthropic response content array
 * @returns {Array|null} Tool use blocks, or null if none
 */
function extractToolCalls(content) {
  if (!content || content.length === 0) return null;
  const toolUseBlocks = content.filter((c) => c.type === "tool_use");
  return toolUseBlocks.length > 0 ? toolUseBlocks : null;
}

// ── Provider Implementation ──

const provider = {
  name: "anthropic",
  defaultModel: DEFAULT_MODEL,

  /**
   * Send a chat request to the Anthropic Messages API.
   *
   * @param {object} params
   * @param {string} [params.model] - Model ID (defaults to claude-sonnet-4-6)
   * @param {string|Array} params.system - System prompt (string or content blocks)
   * @param {Array} params.messages - Messages array [{role, content}]
   * @param {number} params.maxTokens - Max output tokens
   * @param {Array} [params.tools] - Tool definitions (passed through as-is)
   * @param {number} [params.timeout=120000] - Request timeout in ms
   * @returns {Promise<{ text: string, toolCalls: Array|null, usage: { inputTokens: number, outputTokens: number } }>}
   */
  async chat({ model, system, messages, maxTokens, tools, timeout }) {
    const store = getStore();
    const apiKey = store ? store.get("anthropicApiKey") : null;
    if (!apiKey) {
      throw new Error("Anthropic API key not configured. Go to Settings.");
    }

    const body = {
      model: model || DEFAULT_MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    };

    // Pass tools through if provided (e.g. web_search for game research)
    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    // Build gateway config if token is set
    const gatewayAuthToken = store ? store.get("gatewayAuthToken", "") : "";
    const gatewayUrl = store ? store.get("gatewayUrl", "") : "";
    const gateway = gatewayAuthToken ? { url: gatewayUrl, authToken: gatewayAuthToken } : undefined;

    const result = await anthropicRequest(apiKey, body, { timeout: timeout || DEFAULT_TIMEOUT, gateway });

    const text = extractText(result.content);
    const toolCalls = extractToolCalls(result.content);
    const usage = result.usage || {};

    return {
      text,
      toolCalls,
      usage: {
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
      },
    };
  },
};

// Self-register
registerProvider("anthropic", provider);

module.exports = provider;
