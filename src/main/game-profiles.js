const path = require("path");
const fs = require("fs");

const PROFILES_PATH = path.join(__dirname, "..", "..", "data", "game_profiles.json");

/**
 * Load all game profiles from disk.
 * @returns {object} Map of gameTag → profile data
 */
function loadProfiles() {
  if (!fs.existsSync(PROFILES_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(PROFILES_PATH, "utf-8"));
  } catch (e) {
    return {};
  }
}

/**
 * Save all game profiles to disk.
 * @param {object} profiles - Map of gameTag → profile data
 */
function saveProfiles(profiles) {
  const dir = path.dirname(PROFILES_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PROFILES_PATH, JSON.stringify(profiles, null, 2), "utf-8");
}

/**
 * Get a single game's profile.
 * @param {string} gameTag - e.g. "AR", "RL"
 * @returns {object|null}
 */
function getProfile(gameTag) {
  const profiles = loadProfiles();
  return profiles[gameTag] || null;
}

/**
 * Update a game's play style profile text.
 * @param {string} gameTag
 * @param {string} playStyle - New play style text
 */
function updatePlayStyle(gameTag, playStyle) {
  const profiles = loadProfiles();
  if (!profiles[gameTag]) {
    profiles[gameTag] = { gameTag, gameName: gameTag, playStyle: "", sessionCount: 0, updateThreshold: 5, lastUpdated: null };
  }
  profiles[gameTag].playStyle = playStyle;
  profiles[gameTag].lastUpdated = new Date().toISOString();
  saveProfiles(profiles);
}

/**
 * Increment the session count for a game.
 * Returns true if the count has reached the update threshold.
 * @param {string} gameTag
 * @returns {boolean} Whether threshold is reached
 */
function incrementSessionCount(gameTag) {
  const profiles = loadProfiles();
  if (!profiles[gameTag]) return false;
  profiles[gameTag].sessionCount = (profiles[gameTag].sessionCount || 0) + 1;
  saveProfiles(profiles);
  return profiles[gameTag].sessionCount >= (profiles[gameTag].updateThreshold || 5);
}

/**
 * Reset session count for a game (after profile update or dismiss).
 * @param {string} gameTag
 */
function resetSessionCount(gameTag) {
  const profiles = loadProfiles();
  if (!profiles[gameTag]) return;
  profiles[gameTag].sessionCount = 0;
  saveProfiles(profiles);
}

/**
 * Set the update threshold for a game.
 * @param {string} gameTag
 * @param {number} threshold - 3 to 20
 */
function setUpdateThreshold(gameTag, threshold) {
  const profiles = loadProfiles();
  if (!profiles[gameTag]) return;
  profiles[gameTag].updateThreshold = Math.max(3, Math.min(20, threshold));
  saveProfiles(profiles);
}

/**
 * Ensure a game has a profile entry (creates with empty playStyle if missing).
 * @param {string} gameTag
 * @param {string} gameName
 */
function ensureProfile(gameTag, gameName) {
  const profiles = loadProfiles();
  if (!profiles[gameTag]) {
    profiles[gameTag] = {
      gameTag,
      gameName: gameName || gameTag,
      playStyle: "",
      sessionCount: 0,
      updateThreshold: 5,
      lastUpdated: null,
    };
    saveProfiles(profiles);
  }
}

/**
 * Gather recent transcription texts for a game from project JSONs.
 * @param {string} watchFolder - Base watch folder path
 * @param {string} gameTag - Game tag to filter by
 * @param {number} limit - Max number of recent projects to pull transcripts from
 * @returns {Array<{ projectName: string, transcript: string }>}
 */
function getRecentTranscripts(watchFolder, gameTag, limit = 10) {
  const projectsRoot = path.join(watchFolder, ".clipflow", "projects");
  if (!fs.existsSync(projectsRoot)) return [];

  const dirs = fs.readdirSync(projectsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("proj_"));

  const matched = [];
  for (const dir of dirs) {
    const projPath = path.join(projectsRoot, dir.name, "project.json");
    if (!fs.existsSync(projPath)) continue;
    try {
      const proj = JSON.parse(fs.readFileSync(projPath, "utf-8"));
      if (proj.gameTag !== gameTag) continue;
      if (!proj.transcription) continue;
      // Extract plain text from transcription (may be string or object with .text)
      let text = "";
      if (typeof proj.transcription === "string") {
        text = proj.transcription;
      } else if (proj.transcription.text) {
        text = proj.transcription.text;
      } else if (Array.isArray(proj.transcription.segments)) {
        text = proj.transcription.segments.map((s) => s.text || "").join(" ");
      }
      if (!text.trim()) continue;
      matched.push({ projectName: proj.name, createdAt: proj.createdAt, transcript: text.trim() });
    } catch (e) {
      // skip
    }
  }

  // Sort newest first, return limited
  matched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return matched.slice(0, limit);
}

module.exports = {
  loadProfiles,
  saveProfiles,
  getProfile,
  updatePlayStyle,
  incrementSessionCount,
  resetSessionCount,
  setUpdateThreshold,
  ensureProfile,
  getRecentTranscripts,
  PROFILES_PATH,
};
