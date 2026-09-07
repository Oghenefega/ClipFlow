// #374 end-to-end probe: prove a DISABLED subtitle line does not reach the
// exported video on the disk-render path (the one Render All from Projects and
// render:batch use — i.e. NOT the editor's own Render button, which was the
// only path that ever filtered).
//
// It renders the REAL renderClip twice on the same clip:
//   run A (control) — clip untouched
//   run B (disabled) — one subtitle segment marked { enabled: false }
// then samples bright pixels in the subtitle band at that line's timeline time
// in both outputs, plus a second line that stays enabled in both as a control.
//
// PASS means: the target line's pixels collapse in run B while the control
// line's pixels stay put. Before the fix both runs are identical.
//
// Read-only on the project (the clip is deep-copied); output goes to a temp dir.
// Usage: npx electron scripts/dev/subtitle-disable-probe.js [projectSuffix] [clipIndex]
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");
const { app } = require("electron");

const ROOT = path.join(__dirname, "..", "..");
const PROJECTS_DIR = process.env.PROBE_PROJECTS_DIR
  || "W:/YouTube Gaming Recordings Onward/Vertical Recordings Onwards/.clipflow/projects";
// Default fixture: 0 approved, 0 published (per the fixture-selection rule).
const SUFFIX = process.argv[2] || "7j7ios";
const CLIP_INDEX = parseInt(process.argv[3] || "0", 10);
const OUT_DIR = path.join(os.tmpdir(), "corva-subtitle-disable-probe");

app.on("window-all-closed", () => {});

// Compare the SAME timestamp across the two renders rather than thresholding
// brightness. A first attempt counted near-white pixels in the subtitle band and
// was useless: gameplay puts ~3,200 bright pixels in that band on every frame,
// so removing a line moved the count by ~1%. Two renders of the same clip are
// deterministic, so a direct frame difference isolates exactly what the disable
// changed and needs no assumption about where text sits or how it is styled.
function grayFrame(ffmpegBin, file, t) {
  const r = spawnSync(ffmpegBin, [
    "-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1",
    "-vf", "format=gray,scale=270:480", "-f", "rawvideo", "-",
  ], { maxBuffer: 64 * 1024 * 1024 });
  return r.stdout || Buffer.alloc(0);
}

// Pixels that meaningfully changed between the two renders at time t.
function changedPixels(ffmpegBin, fileA, fileB, t) {
  const a = grayFrame(ffmpegBin, fileA, t);
  const b = grayFrame(ffmpegBin, fileB, t);
  if (!a.length || a.length !== b.length) return -1;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 40) n++;
  return n;
}

app.whenReady().then(async () => {
  const { renderClip } = require(path.join(ROOT, "src/main/render.js"));
  const { FFMPEG_BIN } = require(path.join(ROOT, "src/main/app-paths.js"));
  const { resolveClipSubtitles } = require(path.join(ROOT, "src/renderer/editor/utils/resolveSubtitles.js"));
  const { visibleSubtitleSegments } = require(path.join(ROOT, "src/renderer/editor/models/timeMapping.js"));

  const dir = fs.readdirSync(PROJECTS_DIR).find((d) => d.endsWith(SUFFIX));
  if (!dir) throw new Error("no project dir ending in " + SUFFIX);
  const projectPath = path.join(PROJECTS_DIR, dir, "project.json");
  const project = JSON.parse(fs.readFileSync(projectPath, "utf8"));
  const saved = project.clips[CLIP_INDEX];
  if (!saved) throw new Error("no clip at index " + CLIP_INDEX);
  if (saved.status === "approved" || saved.publishedAt) throw new Error("refusing: clip is approved/published");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Resolve exactly as the render does, then map to timeline time so we know
  // WHERE in the output each line lands.
  const resolved = resolveClipSubtitles(saved, project, { includeExtras: false });
  const asSegs = resolved.segments.map((s) => ({ startSec: s.start, endSec: s.end, text: s.text, words: s.words }));
  const mapped = visibleSubtitleSegments(asSegs, saved.nleSegments || []);
  const usable = mapped.filter((m) => (m.text || "").trim().length >= 8 && (m.timelineEndSec - m.timelineStartSec) > 0.35);
  if (usable.length < 2) throw new Error("need >=2 usable subtitle lines, got " + usable.length);

  const tMid = (t) => (t.timelineStartSec + t.timelineEndSec) / 2;
  console.log(`project ${dir}  clip ${saved.id} (status=${saved.status})`);

  async function run(label, disableStartSec) {
    const clip = JSON.parse(JSON.stringify(saved));
    let marked = 0;
    if (disableStartSec !== null) {
      for (const key of ["sub1", "sub2"]) {
        for (const seg of clip.subtitles?.[key] || []) {
          if (Math.abs((seg.startSec ?? -1) - disableStartSec) < 0.02) { seg.enabled = false; marked++; }
        }
      }
      if (!marked) throw new Error("could not find the target segment to disable");
    }
    const out = path.join(OUT_DIR, `${label}.mp4`);
    await renderClip(clip, project, out, {
      subtitleStyle: clip.subtitleStyle || {},
      captionStyle: clip.captionStyle || {},
      captionSegments: [], // subtitles only — a caption would pollute the band
      encoder: "nvenc",
    });
    return { out, marked };
  }

  // Target a line comfortably inside the timeline so there are sample points
  // on both sides of it. mapped entries keep the ORIGINAL source-absolute
  // startSec (only the timeline* fields are added), and that is what sub1
  // stores too — so it is the key that finds the stored segment to disable.
  const target = usable[Math.floor(usable.length / 2)];
  console.log(`  target line @${tMid(target).toFixed(2)}s  "${target.text.slice(0, 46)}"`);

  const a = await run("A-control", null);
  const b = await run("B-disabled", target.startSec);
  console.log(`  marked ${b.marked} stored segment(s) disabled`);

  // Inside the disabled line's window the renders must differ; everywhere else
  // they must be identical, which is what proves nothing ELSE was disturbed.
  const inside = [target.timelineStartSec + 0.1, tMid(target), target.timelineEndSec - 0.1];
  const others = usable.filter((m) => m !== target).map(tMid);
  const outside = [
    ...others.slice(0, 3),
    ...others.slice(-3),
    Math.max(0.2, target.timelineStartSec - 1.0),
    target.timelineEndSec + 1.0,
  ];

  console.log("\n  changed pixels vs the control render");
  const insideCounts = inside.map((t) => {
    const n = changedPixels(FFMPEG_BIN, a.out, b.out, t);
    console.log(`    inside  @${t.toFixed(2).padStart(6)}s : ${n}`);
    return n;
  });
  const outsideCounts = outside.map((t) => {
    const n = changedPixels(FFMPEG_BIN, a.out, b.out, t);
    console.log(`    outside @${t.toFixed(2).padStart(6)}s : ${n}`);
    return n;
  });

  const removed = insideCounts.every((n) => n > 200);
  const untouched = outsideCounts.every((n) => n === 0);
  console.log(`\n  disabled line gone from the export : ${removed ? "PASS" : "FAIL"}`);
  console.log(`  every other frame byte-identical   : ${untouched ? "PASS" : "FAIL"}`);
  console.log(`\n  ${removed && untouched ? "PASS — #374 fixed on the disk-render path" : "FAIL"}`);
  console.log(`  outputs: ${OUT_DIR}`);
  app.exit(removed && untouched ? 0 : 1);
}).catch((e) => { console.error("PROBE ERROR:", e.message); app.exit(1); });
