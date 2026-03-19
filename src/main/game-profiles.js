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

module.exports = {
  loadProfiles,
  saveProfiles,
  getProfile,
  updatePlayStyle,
  incrementSessionCount,
  resetSessionCount,
  setUpdateThreshold,
  ensureProfile,
  PROFILES_PATH,
};
