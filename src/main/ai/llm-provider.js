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

module.exports = { init, registerProvider, getProvider, getStore, listProviders };
