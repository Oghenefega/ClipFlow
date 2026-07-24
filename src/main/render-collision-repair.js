/**
 * #181 one-time repair: legacy render/thumbnail records that point into the old
 * FLAT output folder, where filenames collided across projects ("Clip 3.mp4"
 * claimed by an Egging On clip AND a Rocket League clip). Whoever rendered last
 * owned the bytes, so for any flat-folder file claimed by more than one clip —
 * or already missing — the record cannot be trusted:
 *
 *   - renderPath shared or dangling  → renderPath null, renderStatus "pending"
 *     (a stale "rendered" record could re-publish ANOTHER project's video)
 *   - thumbnailPath shared           → regenerate from the clip's own source
 *     recording into the project's clips dir (guaranteed right content);
 *     record is nulled first so the UI never shows a wrong-game frame while
 *     regeneration runs in the background
 *
 * Uniquely-claimed flat files are left alone, as are all files on disk and all
 * publish/tracker history. Runs once, gated by a store flag; fresh installs
 * no-op. New renders are collision-free (per-project subfolders), so this
 * class of damage cannot recur.
 */
const fs = require("fs");
const path = require("path");

const FLAG = "renderCollisionRepairDone";

function isDirectChildOf(filePath, folder) {
  if (!filePath || !folder) return false;
  try {
    return path.resolve(path.dirname(filePath)).toLowerCase() === path.resolve(folder).toLowerCase();
  } catch (_) {
    return false;
  }
}

/**
 * @returns {{ ran: boolean, rendersReset: number, thumbsQueued: number, errors: string[], background: Promise<{thumbsFixed:number}> }}
 */
function runRenderCollisionRepair(libRoot, store, projects, ffmpeg, logger) {
  const noop = { ran: false, rendersReset: 0, thumbsQueued: 0, errors: [], background: Promise.resolve({ thumbsFixed: 0 }) };
  if (store.get(FLAG)) return noop;

  const outputFolder = store.get("outputFolder");
  const projectsRoot = path.join(libRoot || "", ".clipflow", "projects");
  if (!outputFolder || !libRoot || !fs.existsSync(projectsRoot)) {
    store.set(FLAG, true); // fresh install / nothing to repair
    return noop;
  }

  const projectIds = fs.readdirSync(projectsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("proj_"))
    .map((d) => d.name);

  // Pass 1: count claimants per flat-folder basename (case-insensitive).
  const renderClaims = {};
  const thumbClaims = {};
  const loaded = [];
  for (const id of projectIds) {
    const project = projects.loadProject(libRoot, id);
    if (!project) continue;
    loaded.push(project);
    for (const clip of project.clips || []) {
      if (isDirectChildOf(clip.renderPath, outputFolder)) {
        const key = path.basename(clip.renderPath).toLowerCase();
        renderClaims[key] = (renderClaims[key] || 0) + 1;
      }
      if (isDirectChildOf(clip.thumbnailPath, outputFolder)) {
        const key = path.basename(clip.thumbnailPath).toLowerCase();
        thumbClaims[key] = (thumbClaims[key] || 0) + 1;
      }
    }
  }

  // Pass 2: synchronous record repair (fast, file I/O only). Thumbnails are
  // nulled now and regenerated in the background below — safety first, looks second.
  let rendersReset = 0;
  const regenQueue = [];
  const errors = [];
  for (const project of loaded) {
    for (const clip of project.clips || []) {
      const updates = {};
      if (isDirectChildOf(clip.renderPath, outputFolder)) {
        const shared = renderClaims[path.basename(clip.renderPath).toLowerCase()] > 1;
        if (shared || !fs.existsSync(clip.renderPath)) {
          updates.renderPath = null;
          updates.renderStatus = "pending";
          rendersReset++;
        }
      }
      if (isDirectChildOf(clip.thumbnailPath, outputFolder)
          && thumbClaims[path.basename(clip.thumbnailPath).toLowerCase()] > 1) {
        updates.thumbnailPath = null;
        regenQueue.push({ projectId: project.id, clipId: clip.id, sourceFile: project.sourceFile, startTime: clip.startTime });
      }
      if (Object.keys(updates).length > 0) {
        const res = projects.updateClip(libRoot, project.id, clip.id, updates);
        if (res?.error) errors.push(`${project.id}/${clip.id}: ${res.error}`);
      }
    }
  }

  store.set(FLAG, true);

  // Background: regenerate nulled thumbnails from each clip's own source
  // recording — the one origin that cannot carry another project's content.
  const background = (async () => {
    let thumbsFixed = 0;
    for (const job of regenQueue) {
      try {
        if (!job.sourceFile || !fs.existsSync(job.sourceFile)) throw new Error("source recording not found");
        const outDir = projects.getClipsDir(libRoot, job.projectId);
        const outPath = path.join(outDir, `${job.clipId}_repairthumb.jpg`); // clip ids already start with "clip_"
        await ffmpeg.generateThumbnail(job.sourceFile, outPath, (job.startTime || 0) + 1);
        const res = projects.updateClip(libRoot, job.projectId, job.clipId, { thumbnailPath: outPath });
        if (res?.error) throw new Error(res.error);
        thumbsFixed++;
      } catch (e) {
        // Thumbnail stays null — honest placeholder; a future render also heals it.
        logger.warn(logger.MODULES.system, `#181 thumb regen failed for ${job.projectId}/${job.clipId}: ${e.message}`);
      }
    }
    return { thumbsFixed };
  })();

  return { ran: true, rendersReset, thumbsQueued: regenQueue.length, errors, background };
}

module.exports = { runRenderCollisionRepair };
