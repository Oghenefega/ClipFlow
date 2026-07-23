const path = require("path");
const fs = require("fs");
// Cross-tree require: editor/utils/** is bundled via package.json build.files,
// so this is safe in the packaged app (see CLAUDE.md "Cross-tree requires").
const { resolveReframeStyle } = require("../renderer/editor/utils/reframeStyle");

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
  fs.writeFileSync(projectPath, JSON.stringify(project, null, 2), "utf-8");

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
  fs.writeFileSync(projectPath, JSON.stringify(project, null, 2), "utf-8");

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

  project.clips[clipIndex] = { ...project.clips[clipIndex], ...updates };
  saveProject(watchFolder, project);

  return { success: true, clip: project.clips[clipIndex] };
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
    const camOk = reframe && (reframe.camRect === null || isValidReframeRect(reframe.camRect));
    if (!reframe || typeof reframe !== "object" || !camOk || !isValidReframeRect(reframe.gameRect)) {
      return { error: "Invalid reframe: gameRect (and camRect unless null) must have finite numeric x/y/w/h with w,h > 0" };
    }
    project.reframe = {
      layoutId: reframe.layoutId ?? null,
      // #164 B3: null camRect is a real value (game-only layout) — the
      // whitelist must copy it through, never drop the key (session-104 trap).
      camRect: reframe.camRect === null ? null : { x: reframe.camRect.x, y: reframe.camRect.y, w: reframe.camRect.w, h: reframe.camRect.h },
      gameRect: { x: reframe.gameRect.x, y: reframe.gameRect.y, w: reframe.gameRect.w, h: reframe.gameRect.h },
      style: resolveReframeStyle(reframe.style),
    };
  }

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

  // Optionally delete the clip file
  if (deleteFile && clip.filePath && fs.existsSync(clip.filePath)) {
    try { fs.unlinkSync(clip.filePath); } catch (e) { /* ignore */ }
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
  updateReframe,
  addClip,
  duplicateClip,
  deleteClip,
  updateProjectField,
  getClipsDir,
  getProjectsRoot,
  generateClipId,
};
