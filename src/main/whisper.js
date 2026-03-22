const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * Check if stable-ts is available via the Python venv.
 * @param {string} pythonPath - Path to python.exe in the venv
 * @returns {Promise<{installed: boolean, version?: string, error?: string}>}
 */
function checkWhisper(pythonPath) {
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
 * @param {string} opts.pythonPath - Path to python.exe in the venv
 * @param {string} [opts.model="large-v3-turbo"] - Whisper model name
 * @param {string} [opts.language="en"] - Language code
 * @param {number} [opts.batchSize=16] - Batch size (kept for CLI compat)
 * @param {string} [opts.computeType="float16"] - Compute type
 * @param {string} [opts.hfToken] - HuggingFace token (kept for CLI compat)
 * @param {function} [opts.onProgress] - Progress callback(percentage)
 * @returns {Promise<{segments: Array, text: string}>}
 */
function transcribe(wavPath, opts = {}) {
  return new Promise((resolve, reject) => {
    const pythonPath = opts.pythonPath;
    if (!pythonPath || !fs.existsSync(pythonPath)) {
      return reject(new Error(`Python not found at: ${pythonPath}`));
    }

    // Resolve transcribe.py path — in tools/ relative to project root
    // From src/main/ we go up two levels to reach project root
    const scriptPath = path.join(__dirname, "..", "..", "tools", "transcribe.py");
    if (!fs.existsSync(scriptPath)) {
      return reject(new Error(`Transcription script not found at: ${scriptPath}`));
    }

    // Build output JSON path
    const outBase = wavPath.replace(/\.wav$/i, "");
    const jsonOutPath = outBase + "-whisperx.json";

    const model = opts.model || "large-v3-turbo";
    const language = opts.language || "en";
    const batchSize = opts.batchSize || 16;
    const computeType = opts.computeType || "float16";

    // Slang/vocabulary hints — seeded into whisper's initial_prompt to improve
    // recognition of informal speech, gaming terms, and proper nouns
    const defaultSlangPrompt = [
      // Common slang & contractions whisper struggles with
      "ain't, gonna, gotta, wanna, y'all, bro, nah, fam, dawg, bruh",
      "tryna, finna, boutta, lowkey, highkey, deadass, bussin, sus, cap, no cap",
      "lit, fire, bet, dope, vibe, salty, clutch, cracked, goated, mid",
      // Gaming terms
      "GG, OP, nerf, buff, AFK, respawn, aggro, ADS, headshot, one-shot",
      "let's go, oh my god, what the, are you kidding me",
      // Fega-specific
      "Fega, Arc Raiders, bioscanner, reagents",
    ].join(", ");
    const initialPrompt = opts.initialPrompt || defaultSlangPrompt;

    // Build command — set HF_HOME so models download to D: drive
    const hfHome = opts.hfHome || "D:\\whisper\\hf_cache";
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
    // Pass vocabulary hints to improve slang/informal speech recognition
    cmd += ` --initial_prompt "${initialPrompt.replace(/"/g, '\\"')}"`;
    cmd += `"`;

    const proc = exec(cmd, {
      timeout: 3600000, // 60 minutes max (large files)
      maxBuffer: 100 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) {
        // Include stderr for debugging
        const errOutput = (stderr || "").slice(-2000);
        return reject(new Error(`Transcription failed: ${err.message}\n${errOutput}`));
      }

      // Read the JSON output file
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

module.exports = {
  checkWhisper,
  transcribe,
};
