/**
 * stable-ts Transcription Provider
 *
 * Wraps the existing stable-ts/Whisper transcription logic into the
 * common transcription provider interface. Uses Python subprocess via
 * tools/transcribe.py.
 *
 * Config read from electron-store:
 *   whisperPythonPath - Path to python.exe in the venv
 *   whisperModel      - Whisper model name (default: "large-v3-turbo")
 *   hfHome            - HuggingFace cache directory
 */

const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { registerProvider, getStore } = require("../transcription-provider");

/**
 * Check if stable-ts is available via the Python venv.
 * @param {object} config
 * @param {string} config.pythonPath - Path to python.exe in the venv
 * @returns {Promise<{installed: boolean, version?: string, error?: string}>}
 */
function checkSetup(config = {}) {
  const store = getStore();
  const pythonPath = config.pythonPath || (store ? store.get("whisperPythonPath") : null);

  return new Promise((resolve) => {
    if (!pythonPath || !fs.existsSync(pythonPath)) {
      return resolve({ installed: false, error: "Python path not found" });
    }

    const cmd = `"${pythonPath}" -c "import stable_whisper; import torch; print('CUDA:' + str(torch.cuda.is_available())); print('torch:' + torch.__version__); print('stable_ts:' + stable_whisper.__version__)"`;
    exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        return resolve({ installed: false, error: `stable-ts not importable: ${err.message}` });
      }
      const output = stdout.toString();
      const hasCuda = output.includes("CUDA:True");
      const torchMatch = output.match(/torch:(.+)/);
      const torchVer = torchMatch ? torchMatch[1].trim() : "";
      const stMatch = output.match(/stable_ts:(.+)/);
      const stVer = stMatch ? stMatch[1].trim() : "";
      const version = hasCuda
        ? `stable-ts ${stVer} (CUDA) — torch ${torchVer}`
        : `stable-ts ${stVer} (CPU) — torch ${torchVer}`;
      resolve({ installed: true, version });
    });
  });
}

/**
 * Transcribe an audio file using stable-ts via tools/transcribe.py.
 * Returns word-level timestamps and segment data.
 *
 * @param {string} wavPath - Path to audio file (WAV)
 * @param {object} opts
 * @param {string} [opts.pythonPath] - Override python path (else reads from store)
 * @param {string} [opts.model] - Whisper model name
 * @param {string} [opts.language="en"] - Language code
 * @param {number} [opts.batchSize=16] - Batch size
 * @param {string} [opts.computeType="float16"] - Compute type
 * @param {string} [opts.hfToken] - HuggingFace token
 * @param {string} [opts.initialPrompt] - Vocabulary hints
 * @param {string} [opts.hfHome] - HuggingFace cache dir
 * @param {function} [opts.onProgress] - Progress callback(percentage)
 * @returns {Promise<{segments: Array, text: string}>}
 */
function transcribe(wavPath, opts = {}) {
  const store = getStore();

  return new Promise((resolve, reject) => {
    const pythonPath = opts.pythonPath || (store ? store.get("whisperPythonPath") : null);
    if (!pythonPath || !fs.existsSync(pythonPath)) {
      return reject(new Error(`Python not found at: ${pythonPath}`));
    }

    // Resolve transcribe.py path — in tools/ relative to project root
    // From src/main/ai/transcription/ we go up four levels to reach project root
    const scriptPath = path.join(__dirname, "..", "..", "..", "..", "tools", "transcribe.py");
    if (!fs.existsSync(scriptPath)) {
      return reject(new Error(`Transcription script not found at: ${scriptPath}`));
    }

    // Build output JSON path
    const outBase = wavPath.replace(/\.wav$/i, "");
    const jsonOutPath = outBase + "-whisperx.json";

    const model = opts.model || (store ? store.get("whisperModel") : null) || "large-v3-turbo";
    const language = opts.language || "en";
    const batchSize = opts.batchSize || 16;
    const computeType = opts.computeType || "float16";

    // Slang/vocabulary hints + game-specific terms
    const defaultSlangPrompt = [
      "ain't, gonna, gotta, wanna, y'all, bro, nah, fam, dawg, bruh",
      "tryna, finna, boutta, lowkey, highkey, deadass, bussin, sus, cap, no cap",
      "lit, fire, bet, dope, vibe, salty, clutch, cracked, goated, mid",
      "GG, OP, nerf, buff, AFK, respawn, aggro, ADS, headshot, one-shot",
      "let's go, oh my god, what the, are you kidding me",
      "Fega",
    ].join(", ") + (opts.gameVocab || "");
    const initialPrompt = opts.initialPrompt || defaultSlangPrompt;

    // Build command
    const hfHome = opts.hfHome || (store ? store.get("hfHome") : null) || "D:\\whisper\\hf_cache";
    let cmd = `cmd /c "set "HF_HOME=${hfHome}" && "${pythonPath}" "${scriptPath}"`;
    cmd += ` --audio "${wavPath}"`;
    cmd += ` --output "${jsonOutPath}"`;
    cmd += ` --model ${model}`;
    cmd += ` --language ${language}`;
    cmd += ` --batch_size ${batchSize}`;
    cmd += ` --compute_type ${computeType}`;
    if (opts.hfToken) {
      cmd += ` --hf_token ${opts.hfToken}`;
    }
    cmd += ` --initial_prompt "${initialPrompt.replace(/"/g, '\\"')}"`;
    cmd += `"`;

    const proc = exec(cmd, {
      timeout: 3600000, // 60 minutes max
      maxBuffer: 100 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) {
        const errOutput = (stderr || "").slice(-2000);
        return reject(new Error(`Transcription failed: ${err.message}\n${errOutput}`));
      }

      try {
        if (!fs.existsSync(jsonOutPath)) {
          return reject(new Error(`Transcription output file not found: ${jsonOutPath}`));
        }

        const raw = JSON.parse(fs.readFileSync(jsonOutPath, "utf-8"));

        // Clean up the JSON file
        try { fs.unlinkSync(jsonOutPath); } catch (e) { /* ignore */ }

        // raw is already in our format: { segments: [...], text: "..." }
        resolve(raw);
      } catch (e) {
        reject(new Error(`Failed to parse transcription output: ${e.message}`));
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
 * Batch-transcribe N clips with a single Python process. Loads the whisper
 * model ONCE and reuses it across all items, eliminating ~5-8s of fixed
 * per-clip overhead (Python+CUDA+model-load) (#75 Phase 3).
 *
 * @param {Array<{audio: string, output: string}>} items - Per-clip work units.
 *   Each `audio` is a WAV path; each `output` is where the result JSON will
 *   be written. Items with missing audio files are skipped by the Python
 *   side; the caller detects missing output files and flags failures.
 * @param {object} opts - Same shape as transcribe() opts (pythonPath, model,
 *   language, computeType, hfToken, hfHome, gameVocab, initialPrompt,
 *   onProgress).
 * @returns {Promise<{ completed: number, total: number }>}
 */
function transcribeBatch(items, opts = {}) {
  const store = getStore();
  return new Promise((resolve, reject) => {
    if (!Array.isArray(items) || items.length === 0) {
      return resolve({ completed: 0, total: 0 });
    }
    const pythonPath = opts.pythonPath || (store ? store.get("whisperPythonPath") : null);
    if (!pythonPath || !fs.existsSync(pythonPath)) {
      return reject(new Error(`Python not found at: ${pythonPath}`));
    }

    const scriptPath = path.join(__dirname, "..", "..", "..", "..", "tools", "transcribe.py");
    if (!fs.existsSync(scriptPath)) {
      return reject(new Error(`Transcription script not found at: ${scriptPath}`));
    }

    // Write batch manifest next to the first item's output JSON so it sits
    // beside the work — easier to debug. Cleaned up after the run.
    const firstOut = items[0].output || items[0].audio;
    const manifestPath = firstOut.replace(/\.[^.]+$/, "") + ".batch-manifest.json";
    fs.writeFileSync(manifestPath, JSON.stringify(items), "utf-8");

    const model = opts.model || (store ? store.get("whisperModel") : null) || "large-v3-turbo";
    const language = opts.language || "en";
    const computeType = opts.computeType || "float16";

    const defaultSlangPrompt = [
      "ain't, gonna, gotta, wanna, y'all, bro, nah, fam, dawg, bruh",
      "tryna, finna, boutta, lowkey, highkey, deadass, bussin, sus, cap, no cap",
      "lit, fire, bet, dope, vibe, salty, clutch, cracked, goated, mid",
      "GG, OP, nerf, buff, AFK, respawn, aggro, ADS, headshot, one-shot",
      "let's go, oh my god, what the, are you kidding me",
      "Fega",
    ].join(", ") + (opts.gameVocab || "");
    const initialPrompt = opts.initialPrompt || defaultSlangPrompt;

    const hfHome = opts.hfHome || (store ? store.get("hfHome") : null) || "D:\\whisper\\hf_cache";
    let cmd = `cmd /c "set "HF_HOME=${hfHome}" && "${pythonPath}" "${scriptPath}"`;
    cmd += ` --batch "${manifestPath}"`;
    cmd += ` --model ${model}`;
    cmd += ` --language ${language}`;
    cmd += ` --compute_type ${computeType}`;
    if (opts.hfToken) cmd += ` --hf_token ${opts.hfToken}`;
    cmd += ` --initial_prompt "${initialPrompt.replace(/"/g, '\\"')}"`;
    cmd += `"`;

    const proc = exec(cmd, {
      timeout: 3600000, // 60 minutes max for the whole batch
      maxBuffer: 100 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      try { fs.unlinkSync(manifestPath); } catch (_) {}
      if (err) {
        const errOutput = (stderr || "").slice(-2000);
        return reject(new Error(`Batch transcription failed: ${err.message}\n${errOutput}`));
      }
      // Count outputs that actually got written. The Python side writes each
      // item's JSON immediately on completion, so even if a later item fails
      // the earlier successful clips are intact on disk.
      let completed = 0;
      for (const item of items) {
        if (item.output && fs.existsSync(item.output)) completed++;
      }
      resolve({ completed, total: items.length });
    });

    if (opts.onProgress && proc.stderr) {
      proc.stderr.on("data", (data) => {
        const str = data.toString();
        const pctMatch = str.match(/(\d+)%/);
        if (pctMatch) opts.onProgress(parseInt(pctMatch[1], 10));
      });
    }
  });
}

// ── Provider Implementation ──

const provider = {
  name: "stable-ts",
  checkSetup,
  transcribe,
  transcribeBatch,
};

// Self-register
registerProvider("stable-ts", provider);

module.exports = provider;
