/**
 * OpenAI-Compatible LLM Provider
 *
 * Single adapter that works for OpenAI, DeepSeek, Mistral, xAI/Grok,
 * Gemini, Cohere, Perplexity, Together AI, Fireworks, Groq, Cerebras,
 * SambaNova, NVIDIA NIM, OpenRouter, and any other provider exposing
 * a /v1/chat/completions endpoint.
 *
 * Configured via electron-store:
 *   llmProviderConfig: { baseUrl, apiKey, model }
 *
 * Handles:
 * - system as role:"system" message (first in array)
 * - Authorization: Bearer header
 * - Image content conversion (Anthropic format → OpenAI format)
 * - Tool format translation (Anthropic → OpenAI function calling)
 * - 120s timeout
 */

const https = require("https");
const { URL } = require("url");
const { registerProvider, getStore } = require("../llm-provider");

const DEFAULT_TIMEOUT = 120000;

/**
 * Convert Anthropic-format messages to OpenAI-format messages.
 *
 * Key differences:
 * - System prompt becomes a {role: "system"} message
 * - Image blocks: Anthropic uses {type:"image", source:{type:"base64", data, media_type}}
 *   → OpenAI uses {type:"image_url", image_url:{url:"data:media_type;base64,data"}}
 *
 * @param {string|Array} system - System prompt
 * @param {Array} messages - Anthropic-format messages
 * @returns {Array} OpenAI-format messages
 */
function convertMessages(system, messages) {
  const result = [];

  // System prompt → first message
  if (system) {
    if (typeof system === "string") {
      result.push({ role: "system", content: system });
    } else if (Array.isArray(system)) {
      // Anthropic supports system as content blocks array
      const text = system
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n\n");
      result.push({ role: "system", content: text });
    }
  }

  // Convert each message
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      result.push({ role: msg.role, content: msg.content });
    } else if (Array.isArray(msg.content)) {
      // Convert content blocks
      const convertedContent = msg.content.map((block) => {
        if (block.type === "text") {
          return { type: "text", text: block.text };
        }
        if (block.type === "image") {
          // Anthropic base64 image → OpenAI data URL
          const mediaType = block.source?.media_type || "image/jpeg";
          const data = block.source?.data || "";
          return {
            type: "image_url",
            image_url: { url: `data:${mediaType};base64,${data}` },
          };
        }
        // Pass through unknown block types as text fallback
        return { type: "text", text: block.text || JSON.stringify(block) };
      });
      result.push({ role: msg.role, content: convertedContent });
    } else {
      result.push({ role: msg.role, content: msg.content });
    }
  }

  return result;
}

/**
 * Convert Anthropic-format tools to OpenAI function calling format.
 *
 * Note: Anthropic's built-in tools (web_search, etc.) don't have a direct
 * OpenAI equivalent. These are skipped with a warning.
 *
 * @param {Array} tools - Anthropic-format tool definitions
 * @returns {Array} OpenAI-format tool definitions
 */
function convertTools(tools) {
  if (!tools || tools.length === 0) return undefined;

  const converted = [];
  for (const tool of tools) {
    // Skip Anthropic built-in tools (web_search, etc.) — no OpenAI equivalent
    if (tool.type && tool.type !== "function" && !tool.input_schema) {
      continue;
    }

    if (tool.input_schema) {
      // Anthropic custom tool → OpenAI function
      converted.push({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description || "",
          parameters: tool.input_schema,
        },
      });
    }
  }

  return converted.length > 0 ? converted : undefined;
}

/**
 * Make an HTTPS request to an OpenAI-compatible endpoint.
 *
 * @param {string} baseUrl - Base URL (e.g. "https://api.openai.com/v1")
 * @param {string} apiKey - Bearer token
 * @param {object} body - Request body
 * @param {number} timeout
 * @returns {Promise<object>} Parsed response
 */
function openaiRequest(baseUrl, apiKey, body, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(`${baseUrl.replace(/\/+$/, "")}/chat/completions`);

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const transport = url.protocol === "https:" ? https : require("http");
    const req = transport.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const result = JSON.parse(data);
          if (result.error) {
            return reject(new Error(`OpenAI-compat API error: ${result.error.message || JSON.stringify(result.error)}`));
          }
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse OpenAI-compat response: ${data.substring(0, 300)}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error(`OpenAI-compat API request timed out after ${timeout / 1000}s`));
    });
    req.write(payload);
    req.end();
  });
}

// ── Provider Implementation ──

const provider = {
  name: "openai-compat",
  defaultModel: "gpt-4o",

  /**
   * Send a chat request to an OpenAI-compatible endpoint.
   *
   * @param {object} params
   * @param {string} [params.model] - Model ID (falls back to config or "gpt-4o")
   * @param {string|Array} params.system - System prompt
   * @param {Array} params.messages - Anthropic-format messages (auto-converted)
   * @param {number} params.maxTokens - Max output tokens
   * @param {Array} [params.tools] - Anthropic-format tools (auto-converted)
   * @param {number} [params.timeout=120000] - Request timeout in ms
   * @returns {Promise<{ text: string, toolCalls: Array|null, usage: { inputTokens: number, outputTokens: number } }>}
   */
  async chat({ model, system, messages, maxTokens, tools, timeout }) {
    const store = getStore();
    const config = store ? store.get("llmProviderConfig", {}) : {};

    const baseUrl = config.baseUrl;
    const apiKey = config.apiKey;
    const configModel = config.model;

    if (!baseUrl) throw new Error("OpenAI-compatible provider: baseUrl not configured in llmProviderConfig.");
    if (!apiKey) throw new Error("OpenAI-compatible provider: apiKey not configured in llmProviderConfig.");

    // Use explicit model, then config model, then default
    const resolvedModel = model || configModel || this.defaultModel;

    const body = {
      model: resolvedModel,
      max_tokens: maxTokens,
      messages: convertMessages(system, messages),
    };

    const convertedTools = convertTools(tools);
    if (convertedTools) {
      body.tools = convertedTools;
    }

    const result = await openaiRequest(baseUrl, apiKey, body, timeout || DEFAULT_TIMEOUT);

    // Extract from OpenAI response format
    const choice = result.choices && result.choices[0];
    const text = choice?.message?.content || "";
    const toolCalls = choice?.message?.tool_calls || null;
    const usage = result.usage || {};

    return {
      text,
      toolCalls,
      usage: {
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
      },
    };
  },
};

// Self-register
registerProvider("openai-compat", provider);

module.exports = provider;
