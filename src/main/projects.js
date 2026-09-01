const path = require("path");
const fs = require("fs");
// Cross-tree require: editor/utils/** is bundled via package.json build.files,
// so this is safe in the packaged app (see CLAUDE.md "Cross-tree requires").
const { resolveReframeStyle } = require("../renderer/editor/utils/reframeStyle");
// #299: project.json is rewritten whole about once a second while editing.
// In-place writes left a truncated file if the process died mid-write, which
// drops the project out of the Projects tab entirely.
const { writeFileAtomicSync } = require("./atomic-write");

/**
 * Get the projects root directory.
 * Projects are stored at {watchFolder}/.clipflow/projects/
 */
function getProjectsRoot(watchFolder) {
  return path.join(watchFolder, ".clipflow", "projects");
}

/**
 * Generate a unique project ID.
 */
function generateProjectId() {
  return `proj_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Strip characters Windows won't accept in a filename.
 * Shared with the render output path builder (main.js) so a file created by a
 * render and a file renamed by a title change can never disagree (#188).
 */
function sanitizeFileBase(name) {
  return String(name).replace(/[<>:"\/\\|?*]/g, "_");
}

/**
 * First free path of the form `<dir>/<base><ext>`, suffixing " (2)", " (3)"…
 * on collision. `ownPath` counts as free, so an asset can keep its own name.
 */
function uniquePath(dir, base, ext, ownPath) {
  let candidate = path.join(dir, `${base}${ext}`);
  let n = 2;
  while (fs.existsSync(candidate) && candidate !== ownPath) {
    candidate = path.join(dir, `${base} (${n})${ext}`);
    n++;
  }
  return candidate;
}

/**
 * Generate a unique clip ID.
 */
function generateClipId() {
  return `clip_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
}

/**
 * Normalize a project record loaded from disk. Handles the legacy
 * tags-contains-"test" convention by migrating it to a dedicated testMode
 * boolean on read. Callers can then trust project.testMode as the routing flag.
 */
function normalizeProject(proj) {
  if (!proj || typeof proj !== "object") return proj;
  const tags = Array.isArray(proj.tags) ? proj.tags : [];
  const legacyTest = tags.includes("test");
  if (typeof proj.testMode !== "boolean") {
    proj.testMode = legacyTest;
  }
  if (legacyTest) {
    proj.tags = tags.filter((t) => t !== "test");
  }
  // Default missing reframe/source-probe fields for pre-#164 projects.
  // Clip-level reframe (#348) must NOT be defaulted here: an absent
  // clip.reframe key means "inherit the project layout" — undefined is
  // meaningful, only project-level reframe normalizes to null.
  if (proj.reframe === undefined) proj.reframe = null;
  if (proj.sourceWidth === undefined) proj.sourceWidth = null;
  if (proj.sourceHeight === undefined) proj.sourceHeight = null;
  if (proj.sourceFps === undefined) proj.sourceFps = null;
  return proj;
}

/**
 * Create a new project.
 * @param {string} watchFolder - Base watch folder path
 * @param {object} data - Project data (sourceFile, name, game, etc.)
 * @returns {{ success: true, project: object }}
 */
function createProject(watchFolder, data) {
  const id = generateProjectId();
  const projectDir = path.join(getProjectsRoot(watchFolder), id);
  fs.mkdirSync(projectDir, { recursive: true });

  // Create clips subdirectory
  const clipsDir = path.join(projectDir, "clips");
  fs.mkdirSync(clipsDir, { recursive: true });

  const rawTags = Array.isArray(data.tags) ? data.tags.filter((t) => t !== "test") : [];
  const testMode = data.testMode === true || (Array.isArray(data.tags) && data.tags.includes("test"));

  const project = {
    id,
    // #240: "import" marks a synthetic per-game container for imported clips —
    // hidden from the Projects tab, but a full citizen of queue/publish paths.
    kind: data.kind ?? null,
    name: data.name || path.basename(data.sourceFile, path.extname(data.sourceFile)),
    sourceFile: data.sourceFile,
    sourceDuration: data.sourceDuration || 0,
    game: data.game || "Unknown",
    gameTag: data.gameTag || "",
    gameColor: data.gameColor || "#888",
    fileMetadataId: data.fileMetadataId || null,
    status: "created", // created → transcribing → analyzing → clipping → ready
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: rawTags,
    testMode,
    transcription: null,
    clips: [],
    // Source probe dimensions + reframe snapshot (#164) — null is a valid "absent" value, so use ?? not ||.
    sourceWidth: data.sourceWidth ?? null,
    sourceHeight: data.sourceHeight ?? null,
    sourceFps: data.sourceFps ?? null,
    reframe: data.reframe ?? null,
  };

  const projectPath = path.join(projectDir, "project.json");
  writeFileAtomicSync(projectPath, JSON.stringify(project, null, 2));

  return { success: true, project };
}

/**
 * Load a project by ID.
 * @param {string} watchFolder
 * @param {string} projectId
 * @returns {object|null}
 */
function loadProject(watchFolder, projectId) {
  const projectPath = path.join(getProjectsRoot(watchFolder), projectId, "project.json");
  if (!fs.existsSync(projectPath)) return null;

  try {
    return normalizeProject(JSON.parse(fs.readFileSync(projectPath, "utf-8")));
  } catch (e) {
    return null;
  }
}

/**
 * Save a project (full overwrite).
 * @param {string} watchFolder
 * @param {object} project - Full project object with id
 * @returns {{ success: true }}
 */
function saveProject(watchFolder, project) {
  const projectDir = path.join(getProjectsRoot(watchFolder), project.id);
  if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

  project.updatedAt = new Date().toISOString();
  const projectPath = path.join(projectDir, "project.json");
  writeFileAtomicSync(projectPath, JSON.stringify(project, null, 2));

  return { success: true };
}

/**
 * List all projects.
 * @param {string} watchFolder
 * @returns {{ projects: Array<object> }}
 */
function listProjects(watchFolder) {
  const root = getProjectsRoot(watchFolder);
  if (!fs.existsSync(root)) return { projects: [] };

  const dirs = fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("proj_"));

  const projects = [];
  for (const dir of dirs) {
    const projectPath = path.join(root, dir.name, "project.json");
    if (!fs.existsSync(projectPath)) continue;

    try {
      const proj = normalizeProject(JSON.parse(fs.readFileSync(projectPath, "utf-8")));
      // Return summary (without the project transcription to keep it lightweight).
      // Clips ARE included — minus their two heavy fields (subtitles, per-clip
      // transcription) — because the Queue tab and the auto-fire scheduler read
      // clips from this list at startup; omitting them left the queue empty (and
      // scheduled publishes unfired) until a project was opened. Entering a
      // project still swaps in the full data via loadProject.
      projects.push({
        id: proj.id,
        kind: proj.kind ?? null,
        name: proj.name,
        sourceFile: proj.sourceFile,
        sourceDuration: proj.sourceDuration,
        game: proj.game,
        gameTag: proj.gameTag,
        gameColor: proj.gameColor,
        status: proj.status,
        createdAt: proj.createdAt,
        updatedAt: proj.updatedAt,
        clipCount: (proj.clips || []).length,
        approvedCount: (proj.clips || []).filter((c) => c.status === "approved").length,
        renderedCount: (proj.clips || []).filter((c) => c.renderStatus === "rendered").length,
        clips: (proj.clips || []).map(({ subtitles, transcription, ...rest }) => rest),
        tags: proj.tags || [],
        testMode: proj.testMode === true,
        // #164: reframe + probe dims are tiny and consumers beyond the editor
        // (Queue, Projects previews) read from this summary — never strip them.
        reframe: proj.reframe ?? null,
        sourceWidth: proj.sourceWidth ?? null,
        sourceHeight: proj.sourceHeight ?? null,
        sourceFps: proj.sourceFps ?? null,
      });
    } catch (e) {
      // Skip corrupted project files
    }
  }

  // Sort by creation date, newest first
  projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { projects };
}

/**
 * Delete a project and all its files.
 * Returns the fileMetadataId so the caller can reset the recording's status.
 * @param {string} watchFolder
 * @param {string} projectId
 * @returns {{ success: true, fileMetadataId?: string }}
 */
function deleteProject(watchFolder, projectId) {
  const projectDir = path.join(getProjectsRoot(watchFolder), projectId);
  if (!fs.existsSync(projectDir)) return { success: true };

  // Read project.json before deleting to get identifiers for status reset
  let fileMetadataId = null;
  let projectName = null;
  try {
    const projectJsonPath = path.join(projectDir, "project.json");
    if (fs.existsSync(projectJsonPath)) {
      const project = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8"));
      fileMetadataId = project.fileMetadataId || null;
      projectName = project.name || null;
    }
  } catch (e) { /* non-critical — proceed with deletion */ }

  // Recursive delete
  fs.rmSync(projectDir, { recursive: true, force: true });
  return { success: true, fileMetadataId, projectName };
}

/**
 * Update a single clip within a project.
 * @param {string} watchFolder
 * @param {string} projectId
 * @param {string} clipId
 * @param {object} updates - Fields to merge into the clip
 * @returns {{ success: true, clip: object }|{ error: string }}
 */
function updateClip(watchFolder, projectId, clipId, updates) {
  const project = loadProject(watchFolder, projectId);
  if (!project) return { error: "Project not found" };

  const clipIndex = project.clips.findIndex((c) => c.id === clipId);
  if (clipIndex === -1) return { error: "Clip not found" };

  const existing = project.clips[clipIndex];
  const merged = { ...existing, ...updates };

  // #188: render filenames are stamped from the title at the moment the render
  // runs, so titling a clip afterwards left the file as "Clip 13.mp4" forever —
  // nothing ever revisited the name. Keep the files following the title.
  // Skipped when the caller is setting renderPath itself (a render finishing),
  // since that path is authoritative and already title-derived.
  const titleChanged =
    typeof updates.title === "string" &&
    updates.title.trim() &&
    updates.title !== existing.title &&
    updates.renderPath === undefined;
  if (titleChanged) {
    const base = sanitizeFileBase(updates.title.trim());
    // Rendered clips only. A detection clip keeps its "Clip N" identity and its
    // `clip_<n>_thumb.jpg` — those are pipeline artifacts for the ~18 candidates
    // per project, not files that ever get shipped, and the detection pass
    // regenerates them under that convention.
    if (base && existing.renderPath) {
      merged.renderPath = renameAssetTo(existing.renderPath, base);
      merged.thumbnailPath = renameThumbnailTo(existing.thumbnailPath, base);
    }
  }

  project.clips[clipIndex] = merged;
  saveProject(watchFolder, project);

  return { success: true, clip: merged };
}

/**
 * Rename a clip's thumbnail to follow its new title while KEEPING the suffix
 * convention the file already uses. Four exist and they aren't interchangeable:
 *   `<clip id>_renderthumb.jpg` — post-render thumb, by id, in the project folder (#205)
 *   `<render name>_thumb.jpg`  — legacy: paired to the video filename, pre-#205
 *   `<clip id>_repairthumb.jpg` — named by id on purpose (render-collision-repair.js)
 *   `<title>_thumbnail_<id tail>.png` — the WYSIWYG screenshot, a separate feature (#347)
 * Anything without a recognised suffix is left alone rather than guessed at.
 */
function renameThumbnailTo(currentPath, newBase) {
  if (!currentPath) return currentPath;
  const ext = path.extname(currentPath);
  const stem = path.basename(currentPath, ext);
  const suffix = ["_renderthumb", "_repairthumb", "_thumbnail", "_thumb"].find((s) => stem.endsWith(s));
  // Id-keyed thumbnails are named that way by design — renaming them to a title
  // would break the convention their writers regenerate them under.
  if (!suffix || suffix === "_repairthumb" || suffix === "_renderthumb") return currentPath;
  return renameAssetTo(currentPath, `${newBase}${suffix}`);
}

/**
 * Rename a clip asset in place to `<newBase><its existing extension>`.
 * Returns the new path, or the original path if the rename couldn't happen —
 * a stale filename is cosmetic, a dangling renderPath breaks publishing.
 */
function renameAssetTo(currentPath, newBase) {
  if (!currentPath) return currentPath;
  let ext;
  try {
    if (!fs.existsSync(currentPath)) return currentPath;
    ext = path.extname(currentPath);
    if (path.basename(currentPath, ext) === newBase) return currentPath;
  } catch (e) {
    return currentPath;
  }
  const target = uniquePath(path.dirname(currentPath), newBase, ext, currentPath);
  try {
    fs.renameSync(currentPath, target);
    return target;
  } catch (e) {
    // EBUSY: Windows locks the file while an upload streams it. EPERM/ENOENT:
    // moved or removed underneath us. Either way, keep pointing at what works.
    console.warn(`[projects] Could not rename ${path.basename(currentPath)}: ${e.message}`);
    return currentPath;
  }
}

/**
 * Atomically claim a clip's scheduled auto-publish (#156, #182).
 *
 * The auto-fire scheduler lives in the renderer and kept its dedup state in
 * memory, so a second app instance — or the same instance after the user
 * published a scheduled clip early — could still believe a clip was due and
 * post it twice. This is the single arbitration point: it re-reads the clip
 * from disk, refuses anything already published or no longer due, and clears
 * scheduledAt inside the same synchronous read-modify-write. loadProject and
 * saveProject are both sync, so no other claim can interleave and exactly one
 * caller wins.
 *
 * @param {string} watchFolder
 * @param {string} projectId
 * @param {string} clipId
 * @returns {{ claimed: true, clip: object }|{ claimed: false, reason: string, scheduledAt?: string|null }}
 *   On refusal, scheduledAt is the value now on disk (absent if the clip is
 *   gone) so the caller can resync its stale in-memory copy.
 */
function claimScheduledPublish(watchFolder, projectId, clipId) {
  const project = loadProject(watchFolder, projectId);
  if (!project) return { claimed: false, reason: "Project not found" };

  const clipIndex = (project.clips || []).findIndex((c) => c.id === clipId);
  if (clipIndex === -1) return { claimed: false, reason: "Clip not found" };

  const clip = project.clips[clipIndex];
  if (clip.publishedAt) {
    return { claimed: false, reason: "Already published", scheduledAt: clip.scheduledAt ?? null };
  }
  if (!clip.scheduledAt) {
    return { claimed: false, reason: "No longer scheduled", scheduledAt: null };
  }
  if (new Date(clip.scheduledAt).getTime() > Date.now()) {
    return { claimed: false, reason: "Not due yet", scheduledAt: clip.scheduledAt };
  }

  project.clips[clipIndex] = { ...clip, scheduledAt: null };
  saveProject(watchFolder, project);

  return { claimed: true, clip: project.clips[clipIndex] };
}

/**
 * Validate a reframe rect: finite numeric x/y/w/h with positive width/height.
 */
function isValidReframeRect(r) {
  return !!r && typeof r === "object"
    && Number.isFinite(r.x) && Number.isFinite(r.y)
    && Number.isFinite(r.w) && Number.isFinite(r.h)
    && r.w > 0 && r.h > 0;
}

/**
 * Validate + whitelist a reframe snapshot into its stored shape.
 * @param {object} reframe - { layoutId, camRect:{x,y,w,h}|null, gameRect:{x,y,w,h}, style }
 * @returns {{ value: object }|{ error: string }}
 */
function sanitizeReframe(reframe) {
  const camOk = reframe && (reframe.camRect === null || isValidReframeRect(reframe.camRect));
  if (!reframe || typeof reframe !== "object" || !camOk || !isValidReframeRect(reframe.gameRect)) {
    return { error: "Invalid reframe: gameRect (and camRect unless null) must have finite numeric x/y/w/h with w,h > 0" };
  }
  return {
    value: {
      layoutId: reframe.layoutId ?? null,
      // #164 B3: null camRect is a real value (game-only layout) — the
      // whitelist must copy it through, never drop the key (session-104 trap).
      camRect: reframe.camRect === null ? null : { x: reframe.camRect.x, y: reframe.camRect.y, w: reframe.camRect.w, h: reframe.camRect.h },
      gameRect: { x: reframe.gameRect.x, y: reframe.gameRect.y, w: reframe.gameRect.w, h: reframe.gameRect.h },
      style: resolveReframeStyle(reframe.style),
    },
  };
}

/**
 * Update a project's Auto-Reframe calibration (#164 Phase A).
 * @param {string} watchFolder
 * @param {string} projectId
 * @param {object|null} reframe - null to clear, or { layoutId, camRect:{x,y,w,h}|null, gameRect:{x,y,w,h}, style } (source pixels; camRect null = game-only layout, #164 B3)
 * @returns {{ success: true, project: object }|{ error: string }}
 */
function updateReframe(watchFolder, projectId, reframe) {
  const project = loadProject(watchFolder, projectId);
  if (!project) return { error: "Project not found" };

  if (reframe === null) {
    project.reframe = null;
  } else {
    const sanitized = sanitizeReframe(reframe);
    if (sanitized.error) return { error: sanitized.error };
    project.reframe = sanitized.value;
  }

  saveProject(watchFolder, project);
  return { success: true, project };
}

/**
 * Set, clear, or detach one clip's layout override (#348).
 * clip.reframe is tri-state: absent = inherit project.reframe, null =
 * explicitly no layout, object = per-clip override.
 * @param {string} watchFolder
 * @param {string} projectId
 * @param {string} clipId
 * @param {object|null|"inherit"} reframe - "inherit" deletes the override
 *   (fall back to the project layout); null / object as in updateReframe.
 * @returns {{ success: true, clip: object }|{ error: string }}
 */
function updateClipReframe(watchFolder, projectId, clipId, reframe) {
  const project = loadProject(watchFolder, projectId);
  if (!project) return { error: "Project not found" };

  const clipIndex = project.clips.findIndex((c) => c.id === clipId);
  if (clipIndex === -1) return { error: "Clip not found" };

  const clip = project.clips[clipIndex];
  if (reframe === "inherit") {
    delete clip.reframe;
  } else if (reframe === null) {
    clip.reframe = null;
  } else {
    const sanitized = sanitizeReframe(reframe);
    if (sanitized.error) return { error: sanitized.error };
    clip.reframe = sanitized.value;
  }

  saveProject(watchFolder, project);
  return { success: true, clip };
}

/**
 * Set the project layout AND strip every clip's override in one save (#348) —
 * the "apply to all clips in this project" action. After this, every clip
 * inherits the new project.reframe.
 * @param {string} watchFolder
 * @param {string} projectId
 * @param {object|null} reframe - null clears the layout everywhere
 * @returns {{ success: true, project: object }|{ error: string }}
 */
function applyReframeToAllClips(watchFolder, projectId, reframe) {
  const project = loadProject(watchFolder, projectId);
  if (!project) return { error: "Project not found" };

  if (reframe === null) {
    project.reframe = null;
  } else {
    const sanitized = sanitizeReframe(reframe);
    if (sanitized.error) return { error: sanitized.error };
    project.reframe = sanitized.value;
  }
  for (const c of project.clips || []) delete c.reframe;

  saveProject(watchFolder, project);
  return { success: true, project };
}

/**
 * Add a clip to a project.
 * @param {string} watchFolder
 * @param {string} projectId
 * @param {object} clipData
 * @returns {{ success: true, clip: object }|{ error: string }}
 */
function addClip(watchFolder, projectId, clipData) {
  const project = loadProject(watchFolder, projectId);
  if (!project) return { error: "Project not found" };

  const clip = {
    id: generateClipId(),
    title: clipData.title || "",
    caption: clipData.caption || "",
    startTime: clipData.startTime || 0,
    endTime: clipData.endTime || 0,
    highlightScore: clipData.highlightScore || 0,
    highlightReason: clipData.highlightReason || "",
    status: "none", // none → approved → rejected
    subtitles: clipData.subtitles || { sub1: [], sub2: [] },
    sfx: [],
    media: [],
    renderStatus: "pending", // pending → rendering → rendered → failed
    renderPath: null,
    filePath: clipData.filePath || null,
    thumbnailPath: clipData.thumbnailPath || null,
    createdAt: new Date().toISOString(),
  };

  project.clips.push(clip);
  saveProject(watchFolder, project);

  return { success: true, clip };
}

/**
 * Duplicate a clip within a project. The copy keeps every editing field
 * (timeline segments, subtitles, captions, styles) but gets a fresh id, a
 * "(copy)" title, un-rendered state, review status "none", and no publish
 * history. `overrides` lets callers reshape the copy — "Create as new clip"
 * passes a single-segment nleSegments plus matching start/end times.
 * @param {string} watchFolder
 * @param {string} projectId
 * @param {string} clipId
 * @param {object} overrides
 * @returns {{ success: true, clip: object }|{ error: string }}
 */
function duplicateClip(watchFolder, projectId, clipId, overrides = {}) {
  const project = loadProject(watchFolder, projectId);
  if (!project) return { error: "Project not found" };

  const idx = project.clips.findIndex((c) => c.id === clipId);
  if (idx === -1) return { error: "Clip not found" };
  const src = project.clips[idx];

  const copy = {
    ...JSON.parse(JSON.stringify(src)),
    ...overrides,
    id: generateClipId(),
    title: `${src.title || "Clip"} (copy)`,
    status: "none",
    renderStatus: "pending",
    renderPath: null,
    publishState: {},
    createdAt: new Date().toISOString(),
  };

  // Sit right after the original so the pair reads together in the clip list.
  project.clips.splice(idx + 1, 0, copy);
  saveProject(watchFolder, project);

  return { success: true, clip: copy };
}

/**
 * #306: Repost a published clip — a fresh clip that reuses the existing render.
 * The title is kept verbatim (a repost is the same post going out again, not a
 * "(copy)"), the copy lands approved + already-rendered so it drops straight into
 * the Queue's unscheduled list, and it carries `repostOf` so the Queue's
 * same-title knockout lets it through and the AI title log never learns from it.
 *
 * The rendered video and thumbnail are COPIED, not shared: deleting either clip
 * with "delete rendered video" would otherwise destroy the other one's files.
 * @param {string} watchFolder
 * @param {string} projectId
 * @param {string} clipId
 * @returns {{ success: true, clip: object }|{ error: string }}
 */
function repostClip(watchFolder, projectId, clipId) {
  const project = loadProject(watchFolder, projectId);
  if (!project) return { error: "Project not found" };

  const idx = project.clips.findIndex((c) => c.id === clipId);
  if (idx === -1) return { error: "Clip not found" };
  const src = project.clips[idx];

  // Reusing the render IS the feature — without the file there is nothing to repost.
  if (!src.renderPath || !fs.existsSync(src.renderPath)) {
    return { error: "This clip's rendered video is missing — re-render it before reposting" };
  }

  const ext = path.extname(src.renderPath);
  const dir = path.dirname(src.renderPath);
  const renderPath = uniquePath(dir, `${path.basename(src.renderPath, ext)} repost`, ext);
  try {
    fs.copyFileSync(src.renderPath, renderPath);
  } catch (err) {
    return { error: `Could not copy the rendered video: ${err.message}` };
  }

  // A missing thumbnail is cosmetic — keep the repost even if the copy fails,
  // but only carry a thumbnail the repost OWNS: falling back to src's path would
  // share one file between two clips, and deleting either would strip the other.
  let thumbnailPath = null;
  if (src.thumbnailPath && fs.existsSync(src.thumbnailPath)) {
    const tExt = path.extname(src.thumbnailPath);
    const tDir = path.dirname(src.thumbnailPath);
    const tDest = uniquePath(tDir, `${path.basename(src.thumbnailPath, tExt)} repost`, tExt);
    try { fs.copyFileSync(src.thumbnailPath, tDest); thumbnailPath = tDest; } catch (e) { /* ignore */ }
  }

  const copy = {
    ...JSON.parse(JSON.stringify(src)),
    id: generateClipId(),
    repostOf: src.id,
    status: "approved",
    renderStatus: "rendered",
    renderPath,
    thumbnailPath,
    publishState: {},
    createdAt: new Date().toISOString(),
  };
  // The original's publish history belongs to the original post only.
  delete copy.scheduledAt;
  delete copy.publishedAt;
  delete copy.queueOrder;
  delete copy.downscaledPosts;

  // Sit right after the original so the pair reads together in the clip list.
  project.clips.splice(idx + 1, 0, copy);
  saveProject(watchFolder, project);

  return { success: true, clip: copy };
}

/**
 * Delete a clip from a project (and optionally its file).
 * @param {string} watchFolder
 * @param {string} projectId
 * @param {string} clipId
 * @param {boolean} deleteFile - Also delete the clip's video file
 * @returns {{ success: true }|{ error: string }}
 */
function deleteClip(watchFolder, projectId, clipId, deleteFile = false) {
  const project = loadProject(watchFolder, projectId);
  if (!project) return { error: "Project not found" };

  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip) return { error: "Clip not found" };

  // Optionally delete the clip's files. renderPath is the rendered vertical
  // output (the file the Queue publishes) — it was missing here, which orphaned
  // the actual MP4 on disk whenever deleteFile ran. The project's sourceFile
  // (the recording) is NEVER touched by clip deletion.
  if (deleteFile && clip.filePath && fs.existsSync(clip.filePath)) {
    try { fs.unlinkSync(clip.filePath); } catch (e) { /* ignore */ }
  }
  if (deleteFile && clip.renderPath && fs.existsSync(clip.renderPath)) {
    try { fs.unlinkSync(clip.renderPath); } catch (e) { /* ignore */ }
  }
  if (deleteFile && clip.thumbnailPath && fs.existsSync(clip.thumbnailPath)) {
    try { fs.unlinkSync(clip.thumbnailPath); } catch (e) { /* ignore */ }
  }

  project.clips = project.clips.filter((c) => c.id !== clipId);
  saveProject(watchFolder, project);

  return { success: true };
}

/**
 * Shallow-merge a patch into a project's top-level fields. Useful for toggles
 * like testMode without round-tripping the whole project object through the
 * renderer. Returns the normalized, merged project.
 */
function updateProjectField(watchFolder, projectId, patch) {
  const project = loadProject(watchFolder, projectId);
  if (!project) return { error: "Project not found" };
  const merged = normalizeProject({ ...project, ...patch });
  saveProject(watchFolder, merged);
  return { success: true, project: merged };
}

/**
 * Get the clips directory for a project.
 */
function getClipsDir(watchFolder, projectId) {
  return path.join(getProjectsRoot(watchFolder), projectId, "clips");
}

module.exports = {
  createProject,
  loadProject,
  saveProject,
  listProjects,
  deleteProject,
  updateClip,
  claimScheduledPublish,
  updateReframe,
  updateClipReframe,
  applyReframeToAllClips,
  addClip,
  duplicateClip,
  repostClip,
  deleteClip,
  updateProjectField,
  getClipsDir,
  getProjectsRoot,
  generateClipId,
  sanitizeFileBase,
  uniquePath,
};
