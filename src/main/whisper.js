const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * Build a cmd /c command string that prepends the binary dir + CUDA dir to PATH.
 * On Windows, DLLs (ggml.dll, ggml-cuda.dll, whisper.dll, cublas, cudart) must be
 * discoverable via PATH. Using cmd /c "set PATH=...&& exe args" ensures the Windows
 * DLL loader sees them.
 */
function buildCommand(binaryPath, args) {
  const binDir = path.dirname(binaryPath);
  // Find CUDA directory — check common locations
  const cudaDirs = [];
  const cudaBase = "C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA";
  if (fs.existsSync(cudaBase)) {
    try {
      const versions = fs.readdirSync(cudaBase).filter((d) => d.startsWith("v")).sort().reverse();
      for (const v of versions) {
        const x64 = path.join(cudaBase, v, "bin", "x64");
        const bin = path.join(cudaBase, v, "bin");
        if (fs.existsSync(x64)) cudaDirs.push(x64);
        if (fs.existsSync(bin)) cudaDirs.push(bin);
      }
    } catch (_) { /* ignore */ }
  }

  const pathDirs = [binDir, ...cudaDirs].join(";");
  const quotedArgs = args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ");

  return `cmd /c "set "PATH=${pathDirs};%PATH%" && "${binaryPath}" ${quotedArgs}"`;
}

/**
 * Check if whisper.cpp binary is available.
 * @param {string} binaryPath - Path to whisper binary (or "whisper" if in PATH)
 * @returns {Promise<{installed: boolean, version?: string, error?: string}>}
 */
function checkWhisper(binaryPath) {
  return new Promise((resolve) => {
    if (!binaryPath || !fs.existsSync(binaryPath)) {
      // Try bare "whisper" in PATH
      exec("whisper-cli --help", { timeout: 10000 }, (err, stdout, stderr) => {
        const output = (stdout || "") + (stderr || "");
        if (err && !output.includes("usage")) {
          return resolve({ installed: false, error: "Binary not found" });
        }
        const vMatch = output.match(/whisper[.\s-]*cpp\s*v?(\S+)/i);
        resolve({ installed: true, version: vMatch ? vMatch[1] : "detected" });
      });
      return;
    }

    const cmd = buildCommand(binaryPath, ["--help"]);
    exec(cmd, { timeout: 10000 }, (err, stdout, stderr) => {
      const output = (stdout || "") + (stderr || "");
      if (err && !output.includes("usage")) {
        return resolve({ installed: false, error: err.message });
      }
      // Check for CUDA
      const hasCuda = output.includes("CUDA devices") || output.includes("ggml_cuda");
      const version = hasCuda ? "CUDA" : "detected";
      resolve({ installed: true, version });
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
    const bin = opts.binaryPath || "whisper-cli";

    // Resolve model path
    let modelPath = opts.modelPath || "";
    if (modelPath && fs.existsSync(modelPath)) {
      const stat = fs.statSync(modelPath);
      if (stat.isDirectory()) {
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
      "--output-json-full",
      "--output-file", outBase,
      "--no-prints",
      "--print-progress",
    ];

    const cmd = buildCommand(bin, args);

    const proc = exec(cmd, {
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
        if (!word || word.startsWith("[")) continue;

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
