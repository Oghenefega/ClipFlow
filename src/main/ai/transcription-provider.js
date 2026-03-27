/**
 * Transcription Provider Interface & Registry
 *
 * Common interface for local speech-to-text providers.
 * The pipeline asks for word-level transcription, the provider delivers it.
 *
 * Interface contract — every provider must implement:
 *   transcribe(wavPath, opts) → { segments: [...], text: string }
 *     where segments[].words[] contains { word, start, end, probability? }
 *
 *   checkSetup(config) → { installed: boolean, version?: string, error?: string }
 *
 *   name → string (for logging)
 */

const Store = require("electron-store");

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
 * Register a transcription provider by name.
 * @param {string} name
 * @param {object} provider - Provider instance implementing the interface
 */
function registerProvider(name, provider) {
  _providers[name] = provider;
}

/**
 * Get the currently active transcription provider.
 * Reads `transcriptionProvider` from electron-store (defaults to "stable-ts").
 * @returns {object} Provider instance
 */
function getTranscriptionProvider() {
  const providerName = _store ? _store.get("transcriptionProvider", "stable-ts") : "stable-ts";
  const provider = _providers[providerName];
  if (!provider) {
    throw new Error(`Transcription provider "${providerName}" not registered. Available: ${Object.keys(_providers).join(", ")}`);
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

module.exports = { init, registerProvider, getTranscriptionProvider, getStore, listProviders };
