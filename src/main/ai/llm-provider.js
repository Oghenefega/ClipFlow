/**
 * LLM Provider Interface & Registry
 *
 * Common interface for all LLM providers. The pipeline asks for a result,
 * the provider delivers it. Swapping providers is a config change.
 *
 * Interface contract — every provider must implement:
 *   chat({ model, system, messages, maxTokens, tools?, timeout? })
 *     → { text, toolCalls?, usage: { inputTokens, outputTokens } }
 *
 *   name → string (for logging)
 *   defaultModel → string (fallback model when none specified)
 */

let _store = null;
const _providers = {};

/**
 * Initialize the registry with the electron-store instance.
 * Called once from main.js at startup.
 * @param {import("electron-store")} store
 */
function init(store) {
  _store = store;
}

/**
 * Register a provider by name.
 * @param {string} name - Provider identifier (e.g. "anthropic", "openai-compat")
 * @param {object} provider - Provider instance implementing the chat() interface
 */
function registerProvider(name, provider) {
  _providers[name] = provider;
}

/**
 * Get the currently active LLM provider.
 * Reads `llmProvider` from electron-store (defaults to "anthropic").
 * @returns {object} Provider instance
 * @throws {Error} If provider not found in registry
 */
function getProvider() {
  const providerName = _store ? _store.get("llmProvider", "anthropic") : "anthropic";
  const provider = _providers[providerName];
  if (!provider) {
    throw new Error(`LLM provider "${providerName}" not registered. Available: ${Object.keys(_providers).join(", ")}`);
  }
  return provider;
}

/**
 * Get the electron-store instance (for providers to read their config).
 * @returns {import("electron-store")|null}
 */
function getStore() {
  return _store;
}

/**
 * List all registered provider names.
 * @returns {string[]}
 */
function listProviders() {
  return Object.keys(_providers);
}

/**
 * #249 Option A: usage label for Cloudflare AI Gateway logs. Every routed
 * call carries the install's PostHog deviceId as cf-aig-metadata so usage is
 * attributable per install without per-tester tokens. Shared here so both
 * providers label identically.
 * @returns {string|null} JSON string for the cf-aig-metadata header, or null
 */
function gatewayMetadataHeader() {
  const id = _store ? String(_store.get("deviceId") || "").trim() : "";
  return id ? JSON.stringify({ deviceId: id }) : null;
}

/**
 * #301: the gateway token this call should use, resolved at CALL TIME.
 * A token the user pasted in Settings wins; otherwise the token baked into
 * this build is read fresh from disk and never persisted. That ordering is
 * the whole fix — as a store default the bundled token was copied into the
 * settings file on first launch, where the file value outranks every later
 * build, so the token could never be rotated.
 * @returns {string} the token to send, or "" when neither exists
 */
function resolveGatewayToken() {
  const own = _store ? String(_store.get("gatewayAuthToken") || "").trim() : "";
  if (own) return own;
  return require("../app-paths").bundledGatewayToken();
}

// #301: what a gateway rejection means, in words a user can act on. The raw
// `Gateway error (HTTP 401)` surfaced to testers said nothing about the token
// being revoked or the beta allowance being spent.
const GATEWAY_ERROR_MESSAGES = {
  401: "Corva's built-in AI access was rejected. Update Corva to the latest version, or add your own API key in Settings → API Credentials.",
  402: "The shared AI allowance for this beta has run out. Add your own API key in Settings → API Credentials to keep generating.",
  429: "Too many AI requests at once. Wait a minute and try again.",
};

/**
 * #301: plain-language message for a Cloudflare AI Gateway error response.
 * Unmapped statuses keep the raw detail — better a technical string than a
 * wrong reassurance.
 * @param {number} status - HTTP status from the gateway
 * @param {*} payload - parsed gateway body (CF returns an array of errors)
 * @returns {string}
 */
function gatewayErrorMessage(status, payload) {
  // A rejected token means different things depending on whose it is: telling
  // someone to update Corva is wrong advice when the token they pasted
  // themselves is the one being refused.
  if (status === 401 && _store && String(_store.get("gatewayAuthToken") || "").trim()) {
    return "The gateway token in Settings → API Credentials was rejected. Check it, or clear that field to fall back to the token built into Corva.";
  }
  const plain = GATEWAY_ERROR_MESSAGES[status];
  if (plain) return plain;
  const detail = (Array.isArray(payload) && payload[0] && payload[0].message) || JSON.stringify(payload);
  return `AI gateway error (HTTP ${status}): ${detail}`;
}

module.exports = { init, registerProvider, getProvider, getStore, listProviders, gatewayMetadataHeader, resolveGatewayToken, gatewayErrorMessage };
