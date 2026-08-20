/**
 * Game auto-detection (#263) — figures out which game a raw recording is so
 * the Rename tab can pre-fill game/day/part. Files are NEVER auto-renamed.
 *
 * Tier 1 (process watch): while a recording is still being written, sample the
 * FOREGROUND process every ~30s. A game only claims the file if its exe held
 * the foreground for >50% of samples — a game merely running in the background
 * (user watching a video mid-session) must not win.
 *
 * Tier 2 (frame sniff): for files with no process evidence (drag-drop imports,
 * boot rescans), extract a few stills and ask Gemini which known game it is.
 *
 * IPC handlers and store stamping live in main.js (codebase convention); this
 * module holds the logic and takes its deps as arguments.
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { execFile } = require("child_process");
const ffmpeg = require("./ffmpeg");
const geminiProvider = require("./ai/providers/gemini");
const aiPrompt = require("./ai-prompt");
const logger = require("./logger");

const SAMPLE_INTERVAL_MS = 30000;

// Windows shell/system processes that are never a game and never worth showing
// in the "pick from running apps" list (user-configurable noise lives in the
// ignoredProcesses store key).
const SYSTEM_NOISE = new Set([
  "explorer", "applicationframehost", "textinputhost", "systemsettings",
  "taskmgr", "searchhost", "startmenuexperiencehost", "shellexperiencehost",
  "lockapp", "dwm", "electron", "corva", "clipflow", "powershell", "obs64", "obs32",
]);

/** Strip .exe and lowercase — the one normal form for process-name comparison. */
function normExe(name) {
  return String(name || "").toLowerCase().replace(/\.exe$/, "");
}

// PowerShell: resolve the foreground window's process name. $procId, not $pid —
// $PID is a reserved automatic variable in PowerShell.
const FG_SCRIPT =
  "Add-Type -Namespace CorvaDetect -Name FG -MemberDefinition " +
  "'[DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); " +
  "[DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint procId);'; " +
  "$h = [CorvaDetect.FG]::GetForegroundWindow(); $procId = [uint32]0; " +
  "[CorvaDetect.FG]::GetWindowThreadProcessId($h, [ref]$procId) | Out-Null; " +
  "if ($procId -ne 0) { (Get-Process -Id $procId -ErrorAction SilentlyContinue).Name }";

function runPowershell(script, timeoutMs) {
  // -EncodedCommand (UTF-16LE base64): the scripts embed double quotes, which
  // Node's Windows arg escaping + PowerShell's CLI parser mangle unreliably.
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      { timeout: timeoutMs, windowsHide: true },
      (err, stdout) => resolve(err ? null : String(stdout || "").trim())
    );
  });
}

// Memoized for a few seconds: a boot rescan fires dozens of add events at once
// and each starts a sampler — they must share one PowerShell spawn, not race
// dozens.
let fgCache = { at: 0, promise: null };
function getForegroundProcess() {
  const now = Date.now();
  if (fgCache.promise && now - fgCache.at < 5000) return fgCache.promise;
  fgCache = { at: now, promise: runPowershell(FG_SCRIPT, 10000).then((out) => (out ? normExe(out) : null)) };
  return fgCache.promise;
}

// ─── Tier 1: foreground sampler per in-flight recording ─────────────────────

const samplers = new Map(); // filePath -> { samples: string[], timer, pending }

function startSampling(filePath) {
  if (samplers.has(filePath)) return;
  const s = { samples: [], timer: null, pending: null };
  samplers.set(filePath, s);
  const tick = () => {
    s.pending = getForegroundProcess().then((name) => { if (name) s.samples.push(name); });
  };
  tick();
  s.timer = setInterval(tick, SAMPLE_INTERVAL_MS);
}

/**
 * Stop the sampler for a file and return what it saw. Safe to call twice.
 * Awaits the in-flight sample: a short file stabilizes in ~3s while a cold
 * PowerShell spawn can take longer — without the await the only sample a
 * quick recording ever gets would be silently discarded.
 */
async function stopSampling(filePath) {
  const s = samplers.get(filePath);
  if (!s) return [];
  clearInterval(s.timer);
  samplers.delete(filePath);
  try { await s.pending; } catch (_) { /* a failed sample is just a missing sample */ }
  return s.samples;
}

/**
 * The >50% rule: a game wins only if its exe held the foreground for a
 * majority of valid samples. Returns the game's name or null.
 */
function majorityGame(samples, gamesDb) {
  const valid = (samples || []).filter(Boolean);
  if (valid.length === 0) return null;
  let best = null;
  for (const g of gamesDb || []) {
    const exes = (g.exe || []).map(normExe).filter(Boolean);
    if (exes.length === 0) continue;
    const count = valid.filter((n) => exes.includes(n)).length;
    if (count * 2 > valid.length && (!best || count > best.count)) best = { name: g.name, count };
  }
  return best ? best.name : null;
}

// ─── "Pick from running apps" (Settings → Edit Game) ────────────────────────

const LIST_SCRIPT =
  "Get-Process | Where-Object { $_.MainWindowTitle } | " +
  "Select-Object Name, MainWindowTitle | ConvertTo-Json -Compress";

/** Windowed processes the user could plausibly link a game to. */
async function listRunningApps(ignoredProcesses) {
  const out = await runPowershell(LIST_SCRIPT, 15000);
  if (!out) return [];
  let rows;
  try {
    const parsed = JSON.parse(out);
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
  const ignored = new Set((ignoredProcesses || []).map(normExe));
  const seen = new Set();
  const apps = [];
  for (const r of rows) {
    const norm = normExe(r?.Name);
    if (!norm || seen.has(norm) || ignored.has(norm) || SYSTEM_NOISE.has(norm)) continue;
    seen.add(norm);
    apps.push({ exe: `${norm}.exe`, title: String(r.MainWindowTitle || "").slice(0, 80) });
  }
  return apps.sort((a, b) => a.exe.localeCompare(b.exe));
}

// ─── Tier 2: Gemini frame sniff ─────────────────────────────────────────────

// Mirrors the §5 "THE GAME" contract from title-caption-prompt.js
// buildImportSystemPrompt — same "unknown is always safer" rule, game-only.
function buildSniffSystem(games) {
  const gameRows = games.map((g) => `- ${g.name}`).join("\n");
  return `You identify which video game appears in still frames taken from a screen recording.

Games this creator already tracks:

${gameRows}

- If the frames match one of these, return its name EXACTLY as written above.
- If it is clearly some other game, return that game's common name.
- If the frames are not gameplay (a video being watched, a browser, a desktop) or you cannot tell, return "unknown". Never guess a candidate on a hunch — a wrong game poisons the file's name and day counter; "unknown" is always safer.
- confidence is "high" only when the on-screen evidence is unambiguous (HUD, menus, characters, a visible game title). Otherwise "low".

Return ONLY valid JSON, no fences, no surrounding text:
{"game": "<exact candidate name, or the game's common name, or unknown>", "confidence": "high | low"}`;
}

/**
 * Extract a few stills and ask Gemini which known game they show.
 * Caller owns the isConfigured() / non-empty-games gates and result caching.
 * Returns { game, confidence } (game may be "unknown") — throws on failure.
 */
async function identifyGameFromFrames({ filePath, games, onUsage }) {
  const { duration } = await ffmpeg.probe(filePath);
  const times = [0.2, 0.5, 0.8].map((f) => Math.max(0.5, duration * f));
  const outDir = path.join(
    os.tmpdir(),
    "clipflow-gamesniff",
    crypto.createHash("md5").update(filePath).digest("hex")
  );
  try {
    const stills = await ffmpeg.extractClipStills(filePath, times, outDir, 640);
    if (stills.length === 0) throw new Error("No frames could be extracted");
    const content = stills.map((s) => ({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: fs.readFileSync(s.path).toString("base64") },
    }));
    content.push({ type: "text", text: "Which game is shown in these frames?" });
    // 2000 not 500: Gemini 3.x thinks by default and thoughts spend the same
    // output budget (see generateTitlesWithGeminiVideo in main.js).
    const { text, usage } = await geminiProvider.chat({
      model: geminiProvider.defaultModel,
      system: buildSniffSystem(games),
      messages: [{ role: "user", content }],
      maxTokens: 2000,
      timeout: 120000,
    });
    if (onUsage && usage) onUsage(usage);
    if (!text) throw new Error("Empty response from Gemini");
    const parsed = aiPrompt.extractJSON(text, "object");
    return {
      game: String(parsed.game || "unknown").trim() || "unknown",
      confidence: parsed.confidence === "high" ? "high" : "low",
    };
  } finally {
    try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (_) { /* tmp cleanup is best-effort */ }
  }
}

module.exports = {
  startSampling,
  stopSampling,
  majorityGame,
  listRunningApps,
  identifyGameFromFrames,
  normExe,
};
