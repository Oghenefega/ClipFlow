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

/**
 * Batch-transcribe N clips in a single Python process. The model is loaded
 * once and reused across all items (#75 Phase 3) — eliminates ~5-8s of fixed
 * per-clip overhead (Python startup + CUDA init + model load) × N. Per-clip
 * results are written to the `output` paths provided in `items`; failures
 * leave that path missing and the caller is expected to flag them.
 *
 * Falls back to per-clip transcribe() if the active provider doesn't
 * implement transcribeBatch — preserves correctness on non-stable-ts setups.
 *
 * @param {Array<{audio: string, output: string}>} items
 * @param {object} opts
 * @returns {Promise<{ completed: number, total: number }>}
 */
async function transcribeBatch(items, opts = {}) {
  const provider = getTranscriptionProvider();
  if (typeof provider.transcribeBatch === "function") {
    return provider.transcribeBatch(items, opts);
  }
  // Fallback: sequential per-clip transcribe via the standard interface.
  const fs = require("fs");
  let completed = 0;
  for (const item of items) {
    try {
      const result = await provider.transcribe(item.audio, opts);
      fs.writeFileSync(item.output, JSON.stringify(result), "utf-8");
      completed++;
    } catch (_) { /* missing output signals failure */ }
  }
  return { completed, total: items.length };
}

module.exports = {
  checkWhisper,
  transcribe,
  transcribeBatch,
};
