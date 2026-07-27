const path = require("path");
const fs = require("fs");
const { app } = require("electron");

// Same path rule as database.js (#80): packaged or dev profile uses userData,
// source-running prod keeps the legacy repo path.
const DATA_DIR =
  app.isPackaged || process.env.CLIPFLOW_PROFILE === "dev"
    ? path.join(app.getPath("userData"), "data")
    : path.join(__dirname, "..", "..", "data");
const PROFILES_PATH = path.join(DATA_DIR, "game_profiles.json");

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

// ── Playstyle update from kept clips (#192) ──
// The updater mines what the creator KEPT — approved feedback rows and
// published title/caption rounds from the DB — never raw session transcripts.
// Raw transcripts carry chat banter and one-off asides that polluted profiles
// (the church-play incident); they also coupled learning to project folders
// the creator wants to be free to delete.

const MIN_KEPT_DATAPOINTS = 5;

/** Collapse whitespace and truncate at a word boundary. */
function excerpt(text, max = 300) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.lastIndexOf(" ", max);
  return (cut > 0 ? clean.slice(0, cut) : clean.slice(0, max)) + "…";
}

/**
 * Build the playstyle-update prompt from kept-clip data. Pure — exported for
 * unit tests and callable without Electron.
 *
 * @param {object} opts
 * @param {string} opts.gameName
 * @param {string} opts.currentPlayStyle
 * @param {Array} opts.approvedClips - feedback rows (transcript_segment, title, user_note)
 * @param {Array} opts.publishedRounds - title_caption_rounds rows (transcript, final_title)
 * @param {string} [opts.creatorName]
 * @returns {{ system: string, user: string }}
 */
function buildPlaystylePrompt({ gameName, currentPlayStyle, approvedClips, publishedRounds, creatorName }) {
  const name = creatorName || "the creator";

  const approvedEntries = (approvedClips || [])
    .filter((c) => (c.transcript_segment || "").trim() || (c.title || "").trim())
    .map((c, i) => {
      const snippet = excerpt(c.transcript_segment);
      const lines = [snippet ? `${i + 1}. "${snippet}"` : `${i + 1}. (no transcript)`];
      if (c.title) lines.push(`   Clip title: ${c.title}`);
      if ((c.user_note || "").trim()) lines.push(`   Creator's note: ${c.user_note.trim()}`);
      return lines.join("\n");
    });

  const publishedEntries = (publishedRounds || []).map((r, i) => {
    const lines = [`${i + 1}. Published title: "${r.final_title}"`];
    if ((r.transcript || "").trim()) lines.push(`   What was said: "${excerpt(r.transcript)}"`);
    return lines.join("\n");
  });

  const system = `You are analyzing a gaming content creator's KEPT clips — moments they approved and published — to update their play style profile for one game. The creator's name is ${name}.

Your task: describe what makes ${name}'s kept moments work in this game — the types of moments they keep, their reaction style, and recurring phrases that appear across kept clips.

Rules:
- A pattern must appear in at least 2 kept clips to be stated. Never build a claim on a single clip.
- One-off conversational asides are noise by definition — never include them, no matter how distinctive they sound.
- Write in third person ("${name} does X", not "You do X")
- Note gameplay style (aggressive, cautious, chaotic, etc.) and content style (comedic, competitive, educational, etc.) where the kept clips support it
- Keep it concise but thorough — 150-300 words. If merging new patterns with the current profile would exceed that, consolidate and cut the weakest lines — never just append
- If the current profile is good and the kept clips don't reveal anything new, return the current profile unchanged
- Output ONLY the profile text, no headers or explanations`;

  const user = `Game: ${gameName}

CURRENT PLAY STYLE PROFILE:
${currentPlayStyle || "(empty — no profile yet)"}

APPROVED CLIP SNIPPETS (${approvedEntries.length} clips this creator kept):
${approvedEntries.join("\n") || "(none)"}

PUBLISHED CLIPS (${publishedEntries.length} clips that shipped to platforms):
${publishedEntries.join("\n") || "(none)"}

Write the updated play style profile:`;

  return { system, user };
}

/**
 * Generate an updated play style profile from kept clips in the DB (#192).
 * DB-only — works with all project folders deleted. Returns the same result
 * shape the diff card consumes: { success, oldProfile, newProfile, gameName }.
 *
 * @param {string} gameTag
 * @param {object} [opts]
 * @param {string} [opts.creatorName]
 * @returns {Promise<object>}
 */
async function generateProfileUpdate(gameTag, { creatorName } = {}) {
  const feedback = require("./feedback");
  const titleCaptionLog = require("./title-caption-log");
  const llmProvider = require("./ai/llm-provider");

  const profile = getProfile(gameTag);
  if (!profile) return { error: `No profile found for ${gameTag}` };

  const approvedClips = feedback.getApprovedClips(gameTag, 30);
  const publishedRounds = titleCaptionLog.getPublishedRounds(gameTag, profile.gameName, 30);

  // Thin-data guard: a sparse game never gets a hallucinated profile.
  const keptCount = approvedClips.length + publishedRounds.length;
  if (keptCount < MIN_KEPT_DATAPOINTS) {
    return {
      success: false,
      skipped: "thin-data",
      note: `Only ${keptCount} kept clip${keptCount === 1 ? "" : "s"} recorded for ${profile.gameName} — need at least ${MIN_KEPT_DATAPOINTS} before the playstyle profile can update. Profile left unchanged.`,
      oldProfile: profile.playStyle || "",
      newProfile: profile.playStyle || "",
      gameName: profile.gameName,
    };
  }

  const { system, user } = buildPlaystylePrompt({
    gameName: profile.gameName,
    currentPlayStyle: profile.playStyle || "",
    approvedClips,
    publishedRounds,
    creatorName,
  });

  try {
    const provider = llmProvider.getProvider();
    const { text } = await provider.chat({
      model: provider.defaultModel,
      system,
      messages: [{ role: "user", content: user }],
      maxTokens: 1000,
    });

    const newProfile = (text || "").trim();
    if (!newProfile) return { error: "Empty response from LLM provider" };

    return { success: true, oldProfile: profile.playStyle || "", newProfile, gameName: profile.gameName };
  } catch (err) {
    return { error: err.message || "Failed to generate profile update" };
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
  buildPlaystylePrompt,
  generateProfileUpdate,
  PROFILES_PATH,
};
