const path = require("path");
const fs = require("fs");

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

  const project = {
    id,
    name: data.name || path.basename(data.sourceFile, path.extname(data.sourceFile)),
    sourceFile: data.sourceFile,
    sourceDuration: data.sourceDuration || 0,
    game: data.game || "Unknown",
    gameTag: data.gameTag || "",
    gameColor: data.gameColor || "#888",
    status: "created", // created → transcribing → analyzing → clipping → ready
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    transcription: null,
    clips: [],
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
    return JSON.parse(fs.readFileSync(projectPath, "utf-8"));
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
      const proj = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
      // Return summary (without full transcription to keep it lightweight)
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
 * @param {string} watchFolder
 * @param {string} projectId
 * @returns {{ success: true }}
 */
function deleteProject(watchFolder, projectId) {
  const projectDir = path.join(getProjectsRoot(watchFolder), projectId);
  if (!fs.existsSync(projectDir)) return { success: true };

  // Recursive delete
  fs.rmSync(projectDir, { recursive: true, force: true });
  return { success: true };
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
  addClip,
  deleteClip,
  getClipsDir,
  getProjectsRoot,
  generateClipId,
};
