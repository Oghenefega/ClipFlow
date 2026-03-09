const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * Check if whisper.cpp binary is available.
 * @param {string} binaryPath - Path to whisper binary (or "whisper" if in PATH)
 * @returns {Promise<{installed: boolean, version?: string, error?: string}>}
 */
function checkWhisper(binaryPath) {
  const bin = binaryPath || "whisper";
  return new Promise((resolve) => {
    execFile(bin, ["--help"], { timeout: 5000 }, (err, stdout, stderr) => {
      const output = (stdout || "") + (stderr || "");
      if (err && !output.includes("usage")) {
        return resolve({ installed: false, error: err.message });
      }
      // whisper.cpp prints version info in help output
      const vMatch = output.match(/whisper\.cpp\s+v?(\S+)/i);
      resolve({ installed: true, version: vMatch ? vMatch[1] : "detected" });
    });
  });
}

/**
 * Transcribe an audio file using whisper.cpp.
 * Returns word-level timestamps and segment data.
 *
 * @param {string} wavPath - Path to 16kHz mono WAV file
 * @param {object} opts
 * @param {string} opts.binaryPath - Path to whisper binary
 * @param {string} opts.modelPath - Path to ggml model file
 * @param {string} opts.model - Model name (e.g. "large-v3") — used if modelPath is a directory
 * @param {string} [opts.language="en"] - Language code
 * @param {number} [opts.threads=8] - CPU threads
 * @param {boolean} [opts.useGpu=true] - Use CUDA GPU acceleration
 * @param {function} [opts.onProgress] - Progress callback(percentage)
 * @returns {Promise<{segments: Array, text: string}>}
 */
function transcribe(wavPath, opts = {}) {
  return new Promise((resolve, reject) => {
    const bin = opts.binaryPath || "whisper";

    // Resolve model path
    let modelPath = opts.modelPath || "";
    if (modelPath && fs.existsSync(modelPath)) {
      const stat = fs.statSync(modelPath);
      if (stat.isDirectory()) {
        // Look for model file in directory
        const modelName = opts.model || "large-v3";
        const candidates = [
          `ggml-${modelName}.bin`,
          `ggml-model-whisper-${modelName}.bin`,
        ];
        for (const c of candidates) {
          const p = path.join(modelPath, c);
          if (fs.existsSync(p)) { modelPath = p; break; }
        }
      }
    }

    if (!modelPath || !fs.existsSync(modelPath)) {
      return reject(new Error(`Whisper model not found at: ${modelPath}`));
    }

    // Build output JSON path (whisper.cpp creates <basename>.json)
    const outBase = wavPath.replace(/\.wav$/i, "");
    const jsonOutPath = outBase + ".json";

    const args = [
      "-m", modelPath,
      "-f", wavPath,
      "-l", opts.language || "en",
      "-t", String(opts.threads || 8),
      "--output-json-full",   // full JSON with word-level timestamps
      "--output-file", outBase,
      "--no-prints",          // suppress progress to stdout (cleaner parsing)
      "--print-progress",     // but do print percentage for progress tracking
    ];

    // GPU flag
    if (opts.useGpu !== false) {
      // whisper.cpp CUDA builds use GPU by default, no extra flag needed
      // But some builds accept --gpu flag
    }

    const proc = execFile(bin, args, {
      timeout: 1800000, // 30 minutes max
      maxBuffer: 100 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`Whisper transcription failed: ${err.message}`));

      // Read the JSON output file
      try {
        if (!fs.existsSync(jsonOutPath)) {
          return reject(new Error(`Whisper output file not found: ${jsonOutPath}`));
        }

        const raw = JSON.parse(fs.readFileSync(jsonOutPath, "utf-8"));
        const result = parseWhisperOutput(raw);

        // Clean up the JSON file
        try { fs.unlinkSync(jsonOutPath); } catch (e) { /* ignore */ }

        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse Whisper output: ${e.message}`));
      }
    });

    // Track progress from stderr
    if (opts.onProgress && proc.stderr) {
      proc.stderr.on("data", (data) => {
        const str = data.toString();
        const pctMatch = str.match(/(\d+)%/);
        if (pctMatch) {
          opts.onProgress(parseInt(pctMatch[1], 10));
        }
      });
    }
  });
}

/**
 * Parse whisper.cpp JSON output into our standard format.
 * @param {object} raw - Raw whisper.cpp JSON
 * @returns {{ segments: Array<{start, end, text, words}>, text: string }}
 */
function parseWhisperOutput(raw) {
  const transcription = raw.transcription || raw.result || [];
  const segments = [];
  let fullText = "";

  for (const seg of transcription) {
    const startMs = seg.timestamps?.from || seg.offsets?.from || 0;
    const endMs = seg.timestamps?.to || seg.offsets?.to || 0;
    const text = (seg.text || "").trim();

    if (!text) continue;

    const words = [];
    if (seg.tokens) {
      for (const token of seg.tokens) {
        const word = (token.text || "").trim();
        if (!word || word.startsWith("[")) continue; // skip special tokens like [BLANK_AUDIO]

        words.push({
          word,
          start: (token.timestamps?.from || token.offsets?.from || startMs) / 1000,
          end: (token.timestamps?.to || token.offsets?.to || endMs) / 1000,
          probability: token.p ?? token.probability ?? 1.0,
        });
      }
    }

    segments.push({
      start: startMs / 1000,
      end: endMs / 1000,
      text,
      words,
    });

    fullText += (fullText ? " " : "") + text;
  }

  return { segments, text: fullText };
}

module.exports = {
  checkWhisper,
  transcribe,
  parseWhisperOutput,
};
