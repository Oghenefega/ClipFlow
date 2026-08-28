/**
 * Caption / tag / platform resolution — shared by the renderer and the main process.
 *
 * #329 moved the scheduled-publish loop into the main process, which meant the main
 * process suddenly needed to build a publish payload on its own. These functions used
 * to live inside QueueView.js, so a main-side scheduler would have had to duplicate
 * them — and a duplicated resolver is a resolver that drifts, which would show up as a
 * tracker snapshot (#293) disagreeing with the caption that actually went out.
 *
 * CJS `module.exports` so the main process can require() it; the renderer imports named
 * ESM bindings and Vite handles the interop. Same arrangement as the editor's
 * resolveSubtitles / wordRepair / subtitleStyleEngine.
 *
 * IMPORTANT: `src/shared/**` is listed in package.json `build.files`. Anything added
 * here ships; anything added OUTSIDE here that main requires does not, and the packaged
 * exe crashes at startup. Verify with `npx asar list`, not the globs.
 *
 * Everything here is pure — no electron, no fs, no React. Settings arrive as a plain
 * object so the renderer can pass its mirrored state and main can pass store values.
 */

/** Legacy fallback: pull "#rocketleague" out of a clip title. */
const extractGameTag = (t) => {
  const m = (t || "").match(/#(\w+)/);
  return m ? m[1].toLowerCase() : null;
};

/**
 * #285: the per-game YouTube lookup, in one place. ytDescriptions is keyed by
 * display name ("Rocket League") while clips carry the short tag ("RL") or a
 * hashtag slug ("rocketleague"), so descriptions and tags MUST resolve through
 * the same match or they drift apart on the same clip.
 */
function resolveYtGameKey(clip, ytDescriptions, gamesDb) {
  const gameTag = (clip.gameTag || extractGameTag(clip.title) || "").toLowerCase();
  const game = (gamesDb || []).find((g) =>
    (g.tag || "").toLowerCase() === gameTag ||
    (g.hashtag || "").toLowerCase() === gameTag
  );
  let key = null;
  if (game?.name && ytDescriptions?.[game.name]) {
    key = game.name;
  } else {
    // Permissive fallback for legacy entries: match a key whose spaces-stripped lowercase form == gameTag.
    key = Object.keys(ytDescriptions || {}).find((k) =>
      k.toLowerCase().replace(/\s+/g, "") === gameTag
    ) || null;
  }
  return { gameTag, game, key };
}

/**
 * #285: YouTube tags for a clip — the per-game list saved beside the description.
 * No tags set (or no matching game) publishes exactly as it did before: an empty list.
 * #291: a per-clip list (edited on the queue card) wins outright, the same way
 * captionOverrides beats the template. An empty array is a real answer — the user
 * stripped the tags off this one clip — so only a missing/non-array value falls
 * through to the game.
 */
function resolveTags(clip, ytDescriptions, gamesDb) {
  if (Array.isArray(clip.youtubeTags)) return clip.youtubeTags;
  const { key } = resolveYtGameKey(clip, ytDescriptions, gamesDb);
  const tags = key ? ytDescriptions?.[key]?.tags : null;
  return Array.isArray(tags) ? tags : [];
}

/** Resolve caption for a platform using template + clip data, respecting overrides */
function resolveCaption(platformKey, clip, captionTemplates, ytDescriptions, gamesDb, streamSchedule = "") {
  // Prefer clip.gameTag (first-class field, lowercased); fall back to title hashtag for legacy clips.
  const gameTag = (clip.gameTag || extractGameTag(clip.title) || "").toLowerCase();
  // YouTube description comes from ytDescriptions per-game system.
  // ytDescriptions is keyed by game display name ("Arc Raiders"). Projects store
  // clip.gameTag as the short abbreviation from gamesDb (e.g. "RL", "AR") OR sometimes
  // as a hashtag slug ("rocketleague") via title extraction. Resolve via gamesDb by
  // matching either form to find the display name.
  if (platformKey === "youtube") {
    const { game, key } = resolveYtGameKey(clip, ytDescriptions, gamesDb);
    if (key && ytDescriptions[key]?.desc) {
      // Prefer the gamesDb hashtag for {gametitle} substitution so saved templates
      // still render "#rocketleague" even when clip.gameTag is the short form ("RL").
      const hashtagForSub = (game?.hashtag || gameTag || "").toLowerCase();
      return ytDescriptions[key].desc
        .replace(/\{title\}/g, clip.title || "")
        .replace(/#\{gametitle\}/g, hashtagForSub ? `#${hashtagForSub}` : "")
        // #286: one Settings field feeds every template — a schedule change is
        // one edit, not one per game. Unset resolves to "" so a template can
        // never publish a raw {schedule}.
        .replace(/\{schedule\}/g, streamSchedule || "");
    }
    return clip.title || "";
  }
  // TikTok / Instagram / Facebook — use captionTemplates
  const template = captionTemplates?.[platformKey];
  if (!template) return clip.title || "";
  return template
    .replace(/\{title\}/g, clip.title || "")
    .replace(/#\{gametitle\}/g, gameTag ? `#${gameTag}` : "")
    .replace(/\{schedule\}/g, streamSchedule || "");
}

/**
 * The caption a clip will actually publish with on one platform: a per-clip
 * override if the user typed one, otherwise the resolved template.
 *
 * `settings` is { captionTemplates, ytDescriptions, gamesDb, streamSchedule } — the
 * renderer passes its mirrored React state, main passes the same four store keys.
 */
function getEffectiveCaption(clip, platformKey, settings = {}) {
  if (clip.captionOverrides?.[platformKey] != null) return clip.captionOverrides[platformKey];
  return resolveCaption(
    platformKey,
    clip,
    settings.captionTemplates,
    settings.ytDescriptions,
    settings.gamesDb,
    settings.streamSchedule || ""
  );
}

/** Map a connected account to its platform key. */
function accountToPlatformKey(account) {
  const p = (account?.platform || "").toLowerCase();
  if (p === "tiktok") return "tiktok";
  if (p === "instagram") return "instagram";
  if (p === "facebook") return "facebook";
  if (p === "youtube") return "youtube";
  if (p === "meta" && account.igAccountId) return "instagram";
  return null;
}

/**
 * Which platform keys are enabled for a clip, given the connected accounts.
 * A missing toggle means enabled — only an explicit `false` turns a platform off.
 */
function getEnabledPlatforms(clip, connectedAccounts) {
  const toggles = clip.platformToggles || {};
  return (connectedAccounts || [])
    .map((p) => accountToPlatformKey(p))
    .filter((k) => k && toggles[k] !== false)
    .filter((v, i, a) => a.indexOf(v) === i); // dedupe
}

module.exports = {
  extractGameTag,
  resolveYtGameKey,
  resolveTags,
  resolveCaption,
  getEffectiveCaption,
  accountToPlatformKey,
  getEnabledPlatforms,
};
