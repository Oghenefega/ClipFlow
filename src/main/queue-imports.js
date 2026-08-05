/**
 * Queue imports (#240) — post pre-ClipFlow clips through the queue.
 *
 * Spec: tasks/specs/queue-imports.md. Finished vertical clips made in other
 * tools are copied (never moved) into `ClipFlow Imports\<Game>\` — a SIBLING
 * of the renders root, deliberately outside the per-project renders tree
 * (#206) — and become clips inside a synthetic per-game project
 * (kind: "import"), so every _projectId-coupled path downstream (queue list,
 * auto-fire scheduler, claim, publish, tracker) works unchanged.
 *
 * Fences (do not weaken): import clips are created with source: "import" and
 * a `clip_import_` id prefix, status "approved" from birth (no status
 * transition ever fires), and NEVER enter taste calibration or voice training
 * — see feedback.js handleStatusTransition and title-caption-log.js backfill.
 *
 * IPC handlers live in main.js (thin wrappers, codebase convention); this
 * module holds the logic and takes its deps as arguments so it can also be
 * exercised headlessly with a stub store.
 */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { app } = require("electron");
const ffmpeg = require("./ffmpeg");
const projectsLib = require("./projects");
const logger = require("./logger");
const geminiProvider = require("./ai/providers/gemini");
const titleCaptionPrompt = require("./ai/title-caption-prompt");
const aiPrompt = require("./ai-prompt");
const pipelineLogger = require("./pipeline-logger");

const VIDEO_EXTS = new Set([".mp4", ".mov"]);
const MIME_BY_EXT = { ".mp4": "video/mp4", ".mov": "video/quicktime" };

/** Strip the leading "#N " OpusClip download prefix from a filename base. */
function stripImportPrefix(name) {
  return String(name || "").replace(/^#\d+\s+/, "").trim();
}

/**
 * Content fingerprint: sha1 over (size + first 256KB + last 256KB). Identity
 * that survives renames/moves of the original, at O(512KB) I/O per file —
 * hashing whole 15GB waves would take minutes for no extra safety here.
 */
function fingerprintFile(filePath) {
  const CHUNK = 256 * 1024;
  const stat = fs.statSync(filePath);
  const h = crypto.createHash("sha1");
  h.update(String(stat.size));
  const fd = fs.openSync(filePath, "r");
  try {
    const head = Buffer.alloc(Math.min(CHUNK, stat.size));
    fs.readSync(fd, head, 0, head.length, 0);
    h.update(head);
    if (stat.size > CHUNK) {
      const tail = Buffer.alloc(Math.min(CHUNK, stat.size - CHUNK));
      fs.readSync(fd, tail, 0, tail.length, stat.size - tail.length);
      h.update(tail);
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest("hex");
}

/** `clip_import_` prefix is a fence marker — greppable and cheap to test. */
function generateImportClipId() {
  return `clip_import_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
}

/** Imports root: sibling of the renders root ("ClipFlow Imports"). */
function importsRootFor(outputFolder) {
  return path.join(path.dirname(outputFolder), "ClipFlow Imports");
}

/** Run fn over items with bounded concurrency; results keep input order. */
async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Inspect a dropped/picked selection: gate by extension, memory, and aspect
 * (vertical only — horizontal is Auto-Reframe's arc, #164), probe dimensions
 * and duration, fingerprint, and cut a review-grid thumbnail (cached by
 * fingerprint under userData so re-waves are instant).
 *
 * Returns rows in input order; verdict "ok" rows are importable, everything
 * else carries why it was excluded.
 */
async function inspect({ store, paths }) {
  const outputFolder = String(store.get("outputFolder") || "").trim();
  if (!outputFolder) {
    return { error: 'Set an Output Folder in Settings first — imported clips are archived in a "ClipFlow Imports" folder next to it.' };
  }
  const memory = store.get("importMemory") || {};
  const thumbDir = path.join(app.getPath("userData"), "processing", "import-thumbs");
  fs.mkdirSync(thumbDir, { recursive: true });

  // Dedupe exact path repeats in one selection before any I/O.
  const seenPaths = new Set();
  const ordered = [];
  for (const p of paths || []) {
    if (!p || typeof p !== "string") continue;
    const key = p.toLowerCase();
    if (seenPaths.has(key)) continue;
    seenPaths.add(key);
    ordered.push(p);
  }

  const rows = await mapPool(ordered, 4, async (filePath) => {
    const fileName = path.basename(filePath);
    const ext = path.extname(fileName).toLowerCase();
    const row = {
      path: filePath,
      fileName,
      base: stripImportPrefix(path.basename(fileName, ext)),
      sizeBytes: 0,
      width: 0,
      height: 0,
      duration: 0,
      fingerprint: null,
      thumbPath: null,
      verdict: "ok",
    };
    if (!VIDEO_EXTS.has(ext)) { row.verdict = "unsupported"; return row; }
    if (!fs.existsSync(filePath)) { row.verdict = "missing"; return row; }
    try {
      row.sizeBytes = fs.statSync(filePath).size;
      row.fingerprint = fingerprintFile(filePath);
    } catch (e) {
      row.verdict = "unreadable";
      return row;
    }
    const mem = memory[row.fingerprint];
    if (mem?.status === "imported") { row.verdict = "already-imported"; return row; }
    if (mem?.status === "skipped") { row.verdict = "already-skipped"; return row; }
    try {
      const probe = await ffmpeg.probe(filePath);
      row.width = probe.width || 0;
      row.height = probe.height || 0;
      row.duration = probe.duration || 0;
    } catch (e) {
      row.verdict = "unreadable";
      return row;
    }
    if (!(row.height > row.width)) { row.verdict = "horizontal"; return row; }
    const thumb = path.join(thumbDir, `${row.fingerprint}.jpg`);
    if (fs.existsSync(thumb)) {
      row.thumbPath = thumb;
    } else {
      try {
        await ffmpeg.generateThumbnail(filePath, thumb, Math.min(1, (row.duration || 2) / 2));
        row.thumbPath = thumb;
      } catch (e) { /* grid falls back to the 🎬 glyph */ }
    }
    return row;
  });

  // Same content twice in one wave (different paths): first occurrence wins.
  const fpSeen = new Set();
  for (const r of rows) {
    if (r.verdict !== "ok" || !r.fingerprint) continue;
    if (fpSeen.has(r.fingerprint)) r.verdict = "duplicate-in-batch";
    else fpSeen.add(r.fingerprint);
  }

  return { success: true, rows };
}

// Bumped to cancel an in-flight generate wave (modal closed). In-flight HTTP
// calls finish but their results are discarded and no further rows start.
let genRun = 0;

function cancelGenerate() {
  genRun++;
  return { success: true };
}

/**
 * One Gemini video pass per row: a single title anchored on the creator's old
 * filename + a game identification against the known games list. No
 * transcript exists (imports never enter the pipeline) — the model watches
 * the clip. A failed call degrades to filename-as-title in the grid; it never
 * blocks the batch.
 */
async function generate({ store, rows, voiceContext, sendProgress, getProcessingDir }) {
  const run = ++genRun;
  const apiKey = String(store.get("geminiApiKey") || "").trim();
  if (!apiKey) return { success: true, skipped: "no-key" };

  const gamesDb = store.get("gamesDb") || [];
  const system = titleCaptionPrompt.buildImportSystemPrompt({
    styleGuide: voiceContext?.styleGuide || "",
    voiceExamples: voiceContext?.voiceExamples || [],
    games: gamesDb.map((g) => ({ name: g.name, hashtag: g.hashtag })),
  });

  // One cost logger for the wave — the Gemini spend must reach the monthly
  // total in Settings (same reasoning as the #193 titlegen path).
  let costLogger = null;
  try {
    costLogger = new pipelineLogger.PipelineLogger(getProcessingDir(), `queue imports (${rows.length} clips)`);
    costLogger.info(`#240 import title/game pass — ${rows.length} clips`);
  } catch (e) { /* cost log is best-effort */ }

  const model = geminiProvider.defaultModel;
  const results = {};

  await mapPool(rows, 2, async (row) => {
    if (genRun !== run) return;
    sendProgress({ type: "ai", fingerprint: row.fingerprint, status: "generating" });
    try {
      const content = [
        { type: "text", text: titleCaptionPrompt.buildImportUserContent({ titleAnchor: row.base }) },
        { type: "video", path: row.path, mimeType: MIME_BY_EXT[path.extname(row.path).toLowerCase()] || "video/mp4" },
      ];
      // 4000 not 2000: Gemini 3.x thinks by default and thoughts spend the
      // same output budget (see generateTitlesWithGeminiVideo in main.js).
      const { text, usage } = await geminiProvider.chat({
        model,
        system,
        messages: [{ role: "user", content }],
        maxTokens: 4000,
        timeout: 300000,
      });
      if (costLogger) { try { costLogger.logApiUsage(usage.inputTokens, usage.outputTokens, model); } catch (e) {} }
      if (genRun !== run) return;
      if (!text) throw new Error("Empty response from Gemini");
      const parsed = aiPrompt.extractJSON(text, "object");
      const result = {
        title: String(parsed.title || "").trim(),
        game: String(parsed.game || "unknown").trim() || "unknown",
        confidence: parsed.confidence === "high" ? "high" : "low",
      };
      results[row.fingerprint] = result;
      sendProgress({ type: "ai", fingerprint: row.fingerprint, status: "done", ...result });
    } catch (err) {
      if (genRun !== run) return;
      logger.warn(logger.MODULES.titleGeneration, "Import title pass failed for a clip", { file: row.fileName, error: err.message });
      results[row.fingerprint] = { error: err.message };
      sendProgress({ type: "ai", fingerprint: row.fingerprint, status: "failed", error: err.message });
    }
  });

  if (costLogger) { try { costLogger.finalize(); } catch (e) {} }
  return { success: true, results, cancelled: genRun !== run };
}

/** Stream copy with throttled progress (max ~1 event per 250ms per file). */
function copyWithProgress(sourcePath, targetPath, onProgress) {
  const totalBytes = fs.statSync(sourcePath).size;
  let copiedBytes = 0;
  let lastEmit = 0;
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(sourcePath);
    const writeStream = fs.createWriteStream(targetPath);
    readStream.on("data", (chunk) => {
      copiedBytes += chunk.length;
      const now = Date.now();
      if (now - lastEmit > 250 || copiedBytes === totalBytes) {
        lastEmit = now;
        onProgress(Math.round((copiedBytes / totalBytes) * 100));
      }
    });
    readStream.on("error", (err) => { writeStream.destroy(); reject(err); });
    writeStream.on("error", (err) => { readStream.destroy(); reject(err); });
    writeStream.on("finish", resolve);
    readStream.pipe(writeStream);
  });
}

/**
 * Confirm a reviewed wave: copy each kept file into
 * `ClipFlow Imports\<Game>\` (copy-and-keep — originals are NEVER touched),
 * add a fully-formed import clip to that game's synthetic project (found or
 * created), and remember imported + skipped fingerprints so no file is ever
 * offered twice.
 *
 * items: [{ path, fingerprint, base, duration, title, gameName, gameTag,
 *           gameColor, platformToggles }]
 * skips: [{ fingerprint, file }]
 */
async function confirm({ store, watchFolder, items, skips, sendProgress }) {
  const outputFolder = String(store.get("outputFolder") || "").trim();
  if (!outputFolder) return { error: "Output Folder is not set (Settings)" };
  if (!watchFolder) return { error: "No project library root — set a watch folder first" };
  const importsRoot = importsRootFor(outputFolder);

  const memory = { ...(store.get("importMemory") || {}) };
  const imported = [];
  const failed = [];
  const nowIso = () => new Date().toISOString();

  const { projects: allProjects } = projectsLib.listProjects(watchFolder);

  // Group by game so each synthetic project is loaded and saved once per wave.
  const byGame = new Map();
  for (const item of items || []) {
    const key = String(item.gameTag || "").toLowerCase();
    if (!key) { failed.push({ path: item.path, error: "No game assigned" }); continue; }
    if (!byGame.has(key)) byGame.set(key, []);
    byGame.get(key).push(item);
  }

  for (const [tagLc, group] of byGame) {
    const first = group[0];
    let project = null;
    const existing = allProjects.find((p) => p.kind === "import" && (p.gameTag || "").toLowerCase() === tagLc);
    if (existing) project = projectsLib.loadProject(watchFolder, existing.id);
    if (!project) {
      const created = projectsLib.createProject(watchFolder, {
        name: `Imports — ${first.gameName}`,
        sourceFile: null,
        game: first.gameName,
        gameTag: first.gameTag,
        gameColor: first.gameColor || "#888",
        kind: "import",
      });
      project = created.project;
    }

    const gameDir = path.join(importsRoot, projectsLib.sanitizeFileBase(first.gameName));
    fs.mkdirSync(gameDir, { recursive: true });
    const clipsDir = projectsLib.getClipsDir(watchFolder, project.id);
    fs.mkdirSync(clipsDir, { recursive: true });

    for (const item of group) {
      try {
        const ext = path.extname(item.path).toLowerCase() || ".mp4";
        const title = String(item.title || item.base || "Imported clip").trim() || "Imported clip";
        // Title-derived filename, matching the #188 convention render outputs use.
        const baseName = projectsLib.sanitizeFileBase(title) || "Imported clip";
        const target = projectsLib.uniquePath(gameDir, baseName, ext);
        await copyWithProgress(item.path, target, (pct) =>
          sendProgress({ type: "copy", fingerprint: item.fingerprint, pct })
        );

        const clipId = generateImportClipId();
        let thumbnailPath = null;
        const thumbTarget = path.join(clipsDir, `${clipId}_renderthumb.jpg`);
        try {
          if (item.thumbPath && fs.existsSync(item.thumbPath)) fs.copyFileSync(item.thumbPath, thumbTarget);
          else await ffmpeg.generateThumbnail(target, thumbTarget, Math.min(1, (item.duration || 2) / 2));
          thumbnailPath = thumbTarget;
        } catch (e) { /* thumbless card, not a failed import */ }

        const toggles = item.platformToggles && typeof item.platformToggles === "object" ? item.platformToggles : null;
        const clip = {
          id: clipId,
          title,
          caption: "",
          startTime: 0,
          endTime: item.duration || 0,
          duration: item.duration || 0,
          highlightScore: 0,
          highlightReason: "",
          // Born approved + rendered: the review grid WAS the review, and the
          // file IS the render. source: "import" is the calibration fence
          // (feedback.js) and the no-editing marker everywhere else.
          status: "approved",
          source: "import",
          subtitles: { sub1: [], sub2: [] },
          sfx: [],
          media: [],
          renderStatus: "rendered",
          renderPath: target,
          filePath: null,
          thumbnailPath,
          gameTag: tagLc,
          // Only persist toggles when something is actually off — absence
          // means "all platforms on", the queue's default read.
          ...(toggles && Object.values(toggles).some((v) => v === false) ? { platformToggles: toggles } : {}),
          importedFrom: item.path,
          importedAt: nowIso(),
          createdAt: nowIso(),
        };
        project.clips.push(clip);
        memory[item.fingerprint] = { status: "imported", at: nowIso(), file: path.basename(item.path), targetPath: target };
        imported.push({ clipId, projectId: project.id, title, game: first.gameName });
        sendProgress({ type: "imported", fingerprint: item.fingerprint });
      } catch (err) {
        failed.push({ path: item.path, error: err.message });
        sendProgress({ type: "failed", fingerprint: item.fingerprint, error: err.message });
      }
    }
    projectsLib.saveProject(watchFolder, project);
  }

  for (const s of skips || []) {
    if (!s || !s.fingerprint) continue;
    memory[s.fingerprint] = { status: "skipped", at: nowIso(), file: s.file || "" };
  }

  store.set("importMemory", memory);
  return { success: true, imported, failed, skipped: (skips || []).length };
}

module.exports = {
  inspect,
  generate,
  cancelGenerate,
  confirm,
  // exported for tests
  stripImportPrefix,
  fingerprintFile,
  importsRootFor,
};
