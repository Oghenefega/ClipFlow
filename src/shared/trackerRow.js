/**
 * Building a Tracker row for a clip that just published — shared by the renderer and
 * the main process.
 *
 * #329: the publish scheduler moved into the main process, so a tracker row can now be
 * born with no renderer alive. This is the one place a publish-born row is shaped, so a
 * row written headlessly during a stream is byte-for-byte the row the Queue would have
 * written — same platform credit rules, same #293 snapshot, same source/repost fences.
 *
 * CJS exports for the main process; the renderer imports named ESM bindings (Vite
 * handles the interop). `src/shared/**` is in package.json `build.files`.
 */

const { getEffectiveCaption, resolveTags, accountToPlatformKey, extractGameTag } = require("./captionResolve");

const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Formats a Date as a LOCAL YYYY-MM-DD string (never toISOString, which shifts to UTC
 * and moves evening timestamps onto the next calendar day).
 */
function localISO(date) {
  const y = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/** The clock time a tracker row records, in the format the Tracker renders. */
function localTimeLabel(date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * The moment the AUDIENCE first got the clip (#315).
 *
 * `publishedAt` is stamped on the first platform that landed and never overwritten, so
 * on a partial failure it can be hours before the run that finally completed. Filing the
 * clip under the completing run instead put a 12:30p post in the 2:30p slot. When
 * nothing had gone out before this run, the stamp IS this run, so the fallback agrees.
 */
function firstSuccessMoment(clip) {
  const stamped = clip.publishedAt ? new Date(clip.publishedAt) : null;
  return stamped && !isNaN(stamped.getTime()) ? stamped : new Date();
}

/**
 * Build the tracker row for a completed publish.
 *
 * @param {object} clip                 the clip as it stands AFTER the run (publishState persisted)
 * @param {object} opts
 * @param {Array}  opts.connectedAccounts  accounts in getAccountsForUI() shape
 * @param {object} opts.captured           platformKey -> { platform, accountId, postId?, url? } from this run
 * @param {object} opts.settings           { captionTemplates, ytDescriptions, gamesDb, streamSchedule, mainGame, mainGameTag }
 * @param {string} opts.date              YYYY-MM-DD (local)
 * @param {string} opts.day               full day name
 * @param {string} opts.time              clock label, VERBATIM (#327 — never snapped to a slot)
 * @param {boolean} opts.isScheduled
 * @returns {object} the row to append to trackerData
 */
function buildTrackerRow(clip, { connectedAccounts, captured = {}, settings = {}, date, day, time, isScheduled }) {
  const gt = (clip.gameTag || extractGameTag(clip.title) || "unknown").toLowerCase();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const accounts = connectedAccounts || [];

  // Record the platforms that actually succeeded — captured this session or persisted on
  // clip.publishState across attempts — NOT the currently-enabled toggles. A retry after
  // toggling the already-posted platforms off must still credit those earlier successes.
  const state = clip.publishState || {};
  let posted = accounts.filter((p) => {
    const k = accountToPlatformKey(p);
    return k && (captured[k] || state[p.key] === "success");
  });
  if (posted.length === 0) {
    const toggles = clip.platformToggles || {};
    posted = accounts.filter((p) => { const k = accountToPlatformKey(p); return k && toggles[k] !== false; });
  }
  const platformResults = posted.map((p) => {
    const k = accountToPlatformKey(p);
    return captured[k] || { platform: k, accountId: p.key };
  });

  // #293: freeze what actually shipped. resolveTags and getEffectiveCaption both
  // recompute from the game's CURRENT lists (ytDescriptions), so reading them back
  // weeks later shows today's values, not this post's — and a clip that used its
  // game's tag list stores nothing of its own to fall back on. This is the one place
  // a tracker entry is born, and it runs the same resolvers the publish call just
  // used, so the record matches the upload. Entries written before this shipped have
  // no snapshot; the Published card labels those as recomputed rather than faking it.
  const published = {
    youtubeTitle: clip.youtubeTitle || clip.title || "",
    description: getEffectiveCaption(clip, "youtube", settings),
    tags: resolveTags(clip, settings.ytDescriptions, settings.gamesDb),
    tagsCustom: Array.isArray(clip.youtubeTags),
  };

  const mainGameTagLc = (settings.mainGameTag || "").toLowerCase();

  return {
    id,
    date,
    day,
    time,
    title: clip.title,
    clipId: clip.id,
    game: gt,
    type: gt === mainGameTagLc ? "main" : "other",
    platforms: posted.map((p) => p.abbr + "-" + p.name).join(", "),
    platformResults,
    mainGameAtTime: settings.mainGame,
    source: clip.source === "import" ? "import" : "clipflow",
    scheduled: !!isScheduled,
    published,
    ...(clip.repostOf ? { repostOf: clip.repostOf } : {}),
  };
}

/**
 * #183: does this clip's title/caption count as voice training data?
 *
 * #240 fence: imported clips still COUNT for the tracker (that's the point) but their
 * titles are another era's copy. #306 extends the fence to reposts: the title already
 * taught the model when the original went out, and the log is UNIQUE(clip_id), so
 * letting a repost through would double-weight that title and conflate two posts'
 * view histories.
 */
function isTrainingEligible(clip) {
  return clip.source !== "import" && !clip.repostOf;
}

module.exports = {
  FULL_DAY_NAMES,
  localISO,
  localTimeLabel,
  firstSuccessMoment,
  buildTrackerRow,
  isTrainingEligible,
};
