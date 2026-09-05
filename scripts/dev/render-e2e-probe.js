// #363 end-to-end probe: run the REAL renderClip (render.js — FFmpeg + offscreen
// overlay window) on the first section of Fega's "Bang almost clutched the
// IMPOSSIBLE" clip: 4.86 s of wordless celebration under the title card
// "Bang vs NRG / WTFLIP!!!" — the exact shape that lost its card today.
// Read-only on the project; output goes to the scratchpad.
// Usage: npx electron scripts/dev/render-e2e-probe.js [runs] [clipIdSuffix] [card|full]
//   card = the clip's first section with no words (title card only), full = the saved clip
//   RENDER_PROBE_NOCAP=1 strips every caption entry (subtitles-only clip: the silent
//   gaps between lines must capture as empty, without stale retries)
// Before the fix 3 of 8 card renders had no card at all; after, 0 of 20+.
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const { app } = require("electron");

const ROOT = path.join(__dirname, "..", "..");
// project.json to read the clip from (read-only); override with RENDER_PROBE_PROJECT
const PROJECT = process.env.RENDER_PROBE_PROJECT || "W:/YouTube Gaming Recordings Onward/Vertical Recordings Onwards/.clipflow/projects/proj_1788550358598_g6q38l/project.json";
const OUT_DIR = process.env.RENDER_PROBE_OUT || path.join(require("os").tmpdir(), "corva-render-probe");
const RUNS = parseInt(process.argv[2] || "5", 10);
const CLIP = process.argv[3] || "tnuy";
const MODE = process.argv[4] || "card"; // card = first section, no words | full = the whole saved clip

app.on("window-all-closed", () => {});

// Count near-white pixels in the middle band of the frame at time t — the
// title card is large white/yellow text with a black stroke; the footage
// under it (Fega's room, then the crowd) has almost none.
function whitePixels(ffmpegBin, file, t) {
  const r = spawnSync(ffmpegBin, [
    "-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1",
    "-vf", "crop=iw:ih*0.2:0:ih*0.4,format=gray", "-f", "rawvideo", "-",
  ], { maxBuffer: 64 * 1024 * 1024 });
  const buf = r.stdout || Buffer.alloc(0);
  let n = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] > 235) n++;
  return n;
}

app.whenReady().then(async () => {
  const { renderClip } = require(path.join(ROOT, "src/main/render.js"));
  const { FFMPEG_BIN } = require(path.join(ROOT, "src/main/app-paths.js"));
  const project = JSON.parse(fs.readFileSync(PROJECT, "utf8"));
  const saved = project.clips.find((c) => c.id.endsWith(CLIP));
  if (!saved) throw new Error("clip " + CLIP + " not found");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const quiet = console.log;
  console.log = (...a) => {
    const s = String(a[0]);
    if (s.startsWith("[OverlayRenderer] Frame capture complete") || s.startsWith("[OverlayRenderer] Stale") || s.startsWith("[OverlayRenderer] Paint")) quiet(...a);
  };

  const results = [];
  for (let i = 0; i < RUNS; i++) {
    const clip = JSON.parse(JSON.stringify(saved));
    if (process.env.RENDER_PROBE_NOCAP) clip.captionSegments = [];
    if (MODE === "card") {
      clip.nleSegments = [saved.nleSegments[0]]; // 745.01–749.87: celebration under the card
      clip.subtitles = []; // no words at all under the card — the real clip has none until 11.4 s
    }
    const out = path.join(OUT_DIR, `${CLIP}-${MODE}-run${i + 1}.mp4`);
    const t0 = Date.now();
    await renderClip(clip, project, out, {
      subtitleStyle: clip.subtitleStyle || {},
      captionStyle: clip.captionStyle || {},
      captionSegments: clip.captionSegments || [], // [] after NOCAP: no caption overlay at all
      encoder: "nvenc",
    });
    const w0 = whitePixels(FFMPEG_BIN, out, 0.0);
    const w1 = whitePixels(FFMPEG_BIN, out, 0.5);
    const w2 = whitePixels(FFMPEG_BIN, out, 2.5);
    const w4 = whitePixels(FFMPEG_BIN, out, 4.5);
    results.push({ w0, w1, w2, w4 });
    quiet(`run ${i + 1}/${RUNS}: white px in card band @0.0s=${w0} @0.5s=${w1} @2.5s=${w2} @4.5s=${w4}  (${Date.now() - t0} ms)`);
  }
  quiet("\nSUMMARY (card present = thousands of white px; missing = near zero):");
  results.forEach((r, i) => quiet(`  run ${i + 1}: ${r.w0 < 500 ? "MISSING at 0.0s" : "present at 0.0s"}, ${r.w2 < 500 ? "MISSING at 2.5s" : "present at 2.5s"}`));
  app.exit(0);
});
