/**
 * Gemini full-recording watch (#235) — CLI over the PROD module.
 *
 * Since pipeline integration (session 149) this is a thin wrapper around
 * src/main/gemini-watch.js — the transcode / Files-API upload / long poll /
 * generateContent code it runs is exactly what ships in the app, so watches
 * produced here are valid inputs for integration ablation cells.
 *
 * Spike-only behaviors kept: proxy cached in _tmp/proxy/ (masters take
 * minutes to transcode; cells re-run), events written to gemini/ where
 * harness.js --gemini reads them.
 *
 * Usage:
 *   node gemini-watch.js "<videoName>" [--force-transcode] [--master <path>]
 *
 * --master: explicit master path for recordings outside the watch tree
 * (pre-July months live in Vertical Recordings Onwards\ — archived, never
 * re-added to the watch tree).
 */

const path = require("path");
const fs = require("fs");

// ── Electron stub (must precede any src/main require) ──
const USER_DATA = path.join(process.env.APPDATA, "clipflow");
const Module = require("module");
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") {
    return { app: { isPackaged: false, getPath: () => USER_DATA } };
  }
  if (request === "electron-log") {
    return { info: console.log, warn: console.warn, error: console.error };
  }
  return origLoad.apply(this, arguments);
};

const REPO = path.join(__dirname, "..", "..", "..");
const geminiWatch = require(path.join(REPO, "src", "main", "gemini-watch"));
const llmProvider = require(path.join(REPO, "src", "main", "ai", "llm-provider"));

const SETTINGS_PATH = path.join(USER_DATA, "clipflow-settings.json");
const PROXY_DIR = path.join(__dirname, "_tmp", "proxy");
const OUT_DIR = path.join(__dirname, "gemini");

const argv = process.argv.slice(2);
const videoName = argv.find((a) => !a.startsWith("--"));
if (!videoName) {
  console.error('Usage: node gemini-watch.js "<videoName>" [--force-transcode]');
  process.exit(1);
}
const forceTranscode = argv.includes("--force-transcode");
const masterOverride = argv.includes("--master") ? argv[argv.indexOf("--master") + 1] : null;

function findMaster(watchFolder, vid) {
  const stack = [watchFolder];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (entry.name === `${vid}.mp4` || entry.name === `${vid}.mkv`) return p;
    }
  }
  return null;
}

(async () => {
  const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
  const store = { get: (k, def) => (settings[k] !== undefined ? settings[k] : def) };
  llmProvider.init(store); // gemini.chat reads the API key via getStore()

  const master = masterOverride || findMaster(settings.watchFolder, videoName);
  if (!master || !fs.existsSync(master)) { console.error(`Master for "${videoName}" not found${masterOverride ? ` at ${masterOverride}` : ` under ${settings.watchFolder}`}`); process.exit(1); }
  console.log(`Master: ${master} (${(fs.statSync(master).size / 1024 / 1024 / 1024).toFixed(2)}GB)`);

  const proxyPath = path.join(PROXY_DIR, `${videoName}.proxy.mp4`);
  if (forceTranscode) { try { fs.unlinkSync(proxyPath); } catch (_) { /* no cache */ } }

  const { events, usage, cost, outPath } = await geminiWatch.watchRecording({
    sourceFile: master,
    videoName,
    processingDir: path.join(USER_DATA, "processing"), // unused with explicit paths below
    store,
    logger: { info: console.log, warn: console.warn },
    proxyPath,
    outPath: path.join(OUT_DIR, `${videoName}.visual_events.json`),
    keepProxy: true,
  });

  console.log(`\n${events.length} visual moments | in ${usage.inputTokens} tok, out ${usage.outputTokens} tok, $${cost.toFixed(3)}`);
  const mm = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  for (const e of events) {
    console.log(`  ${mm(e.t_start_s)} → ${mm(e.t_end_s)}  (${e.score.toFixed(2)}) ${e.label} — ${e.what}`);
  }
  console.log(`\nsaved ${path.relative(REPO, outPath)}`);
})().catch((e) => {
  console.error("GEMINI-WATCH FAILED:", e.message);
  process.exit(1);
});
