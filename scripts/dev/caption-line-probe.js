// #366 end-to-end probe: run the REAL renderClip on one wordless section with a
// two-line caption whose SECOND line carries a per-line colour override
// (lineStyles[1] = red). Then count white and red pixels in a frame of the
// output: both present = the export overlay honours line styles; a control run
// without lineStyles must show no red. Read-only on the project; output goes to
// the scratchpad.
// Usage: npx electron scripts/dev/caption-line-probe.js [clipIdSuffix]
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const { app } = require("electron");
const ROOT = path.join(__dirname, "..", "..");
const PROJECT = process.env.RENDER_PROBE_PROJECT || "W:/YouTube Gaming Recordings Onward/Vertical Recordings Onwards/.clipflow/projects/proj_1788550358598_g6q38l/project.json";
const OUT_DIR = process.env.RENDER_PROBE_OUT || path.join(require("os").tmpdir(), "corva-caption-line-probe");
const CLIP = process.argv[2] || "tnuy";
app.on("window-all-closed", () => {});

// Count white-ish and pure-red-ish pixels across the whole frame at time t.
function countPixels(ffmpegBin, file, t) {
  const r = spawnSync(ffmpegBin, [
    "-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1",
    "-vf", "format=rgb24", "-f", "rawvideo", "-",
  ], { maxBuffer: 256 * 1024 * 1024 });
  const buf = r.stdout || Buffer.alloc(0);
  let white = 0, red = 0;
  for (let i = 0; i + 2 < buf.length; i += 3) {
    const R = buf[i], G = buf[i + 1], B = buf[i + 2];
    if (R > 235 && G > 235 && B > 235) white++;
    else if (R > 200 && G < 80 && B < 80) red++;
  }
  return { white, red };
}

app.whenReady().then(async () => {
  const { renderClip } = require(path.join(ROOT, "src/main/render.js"));
  const { FFMPEG_BIN } = require(path.join(ROOT, "src/main/app-paths.js"));
  const project = JSON.parse(fs.readFileSync(PROJECT, "utf8"));
  const saved = project.clips.find((c) => c.id.endsWith(CLIP));
  if (!saved) throw new Error("clip " + CLIP + " not found");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const quiet = console.log;
  console.log = () => {};

  const runs = [
    { name: "line2-red", lineStyles: { 1: { color: "#ff0000" } } },
    { name: "control", lineStyles: undefined },
  ];
  for (const run of runs) {
    const clip = JSON.parse(JSON.stringify(saved));
    clip.nleSegments = [saved.nleSegments[0]];
    clip.subtitles = [];
    const seg = { id: "cap-probe", text: "TOP LINE\nBOTTOM LINE", startSec: 0, endSec: null };
    if (run.lineStyles) seg.lineStyles = run.lineStyles;
    clip.captionSegments = [seg];
    const style = { ...(clip.captionStyle || {}), captionColor: "#ffffff", captionStrokeOn: false, captionGlowOn: false, captionShadowOn: false };
    const out = path.join(OUT_DIR, `${CLIP}-${run.name}.mp4`);
    const t0 = Date.now();
    await renderClip(clip, project, out, {
      subtitleStyle: clip.subtitleStyle || {},
      captionStyle: style,
      captionSegments: clip.captionSegments,
      encoder: "nvenc",
    });
    const p = countPixels(FFMPEG_BIN, out, 1.0);
    quiet(`${run.name}: white=${p.white} red=${p.red}  (${Date.now() - t0} ms)  ${out}`);
  }
  quiet("\nEXPECT: line2-red has thousands of white AND thousands of red; control has red ≈ 0.");
  app.exit(0);
});
