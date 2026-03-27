/**
 * Whisper/Transcription Facade
 *
 * Thin wrapper that delegates to the active transcription provider
 * from the registry. All existing callers (ai-pipeline.js, main.js)
 * continue importing from this file — zero upstream changes needed.
 *
 * The actual implementation lives in:
 *   src/main/ai/transcription/stable-ts.js (default provider)
 */

const { getTranscriptionProvider } = require("./ai/transcription-provider");

/**
 * Check if the active transcription provider is available.
 * @param {string} pythonPath - Path to python.exe in the venv
 * @returns {Promise<{installed: boolean, version?: string, error?: string}>}
 */
function checkWhisper(pythonPath) {
  return getTranscriptionProvider().checkSetup({ pythonPath });
}

/**
 * Transcribe an audio file using the active transcription provider.
 * Returns word-level timestamps and segment data.
 *
 * @param {string} wavPath - Path to audio file (WAV)
 * @param {object} opts - Provider-specific options
 * @returns {Promise<{segments: Array, text: string}>}
 */
function transcribe(wavPath, opts = {}) {
  return getTranscriptionProvider().transcribe(wavPath, opts);
}

module.exports = {
  checkWhisper,
  transcribe,
};
