/**
 * The scheduled-publish scheduler — main process (#329).
 *
 * This file used to be four stubs that nothing required. The real publishing lived in
 * the renderer (QueueView's 60s tick), which meant scheduled clips only went out while
 * the full UI was open and competing with OBS and the game for RAM and GPU — and
 * nothing at all went out with the window closed.
 *
 * Now the tick, the claim and the per-platform orchestration all run here, so publishing
 * survives the renderer being destroyed (streaming mode) and does not depend on Chromium
 * timers, which throttle on hidden windows.
 *
 * TWO RULES THAT MUST NOT BE RELAXED
 *
 * 1. `projects.claimScheduledPublish` is the ONLY place a schedule is claimed. It
 *    re-reads the clip from disk and clears `scheduledAt` inside one synchronous
 *    read-modify-write, so this tick and a user's "Publish now" cannot both win (#156,
 *    #182). Never pre-empt it with an in-memory check.
 * 2. A completed publish MUST write its tracker row. A clip that is live on four
 *    platforms and visible nowhere is the #315 failure mode; s214 showed it happening
 *    for real. `onPublished` is not optional.
 *
 * Dependencies are injected rather than required, because main.js requires this module
 * and everything it needs (store, tokenStore, the publishers) lives there.
 */

const {
  getEffectiveCaption,
  resolveTags,
  accountToPlatformKey,
} = require("../shared/captionResolve");
const {
  FULL_DAY_NAMES,
  localISO,
  localTimeLabel,
  firstSuccessMoment,
  buildTrackerRow,
  isTrainingEligible,
} = require("../shared/trackerRow");

const TICK_MS = 60_000;
const PREFLIGHT_WINDOW_MS = 60 * 60_000;

let deps = null;
let timer = null;
let running = false;
/** clipIds mid-publish in THIS process — a cheap re-entrancy guard, never the dedup. */
const autoFiring = new Set();
/** #244 layer 1: `accountKey|scheduledAt` already pre-flighted — one warning per slot. */
const preflighted = new Set();

const log = (level, msg, extra) => {
  try { deps?.logger?.[level]?.(deps.logger.MODULES.system, msg, extra); } catch (_) { /* logging must never break a publish */ }
};

/** The four settings the shared caption resolvers need, straight out of electron-store. */
function captionSettings() {
  return {
    captionTemplates: deps.store.get("captionTemplates") || {},
    ytDescriptions: deps.store.get("ytDescriptions") || {},
    gamesDb: deps.store.get("gamesDb") || [],
    streamSchedule: deps.store.get("streamSchedule") || "",
    mainGame: deps.store.get("mainGame") || "",
    mainGameTag: (deps.store.get("gamesDb") || []).find((g) => g.name === deps.store.get("mainGame"))?.tag || "",
  };
}

/** Connected accounts in the same shape the Queue's `activePlat` uses. */
function connectedAccounts() {
  try { return deps.tokenStore.getAccountsForUI() || []; } catch (_) { return []; }
}

/**
 * Every clip that is due, across every project, with its project id and testMode
 * attached. Mirrors the Queue's `approved` filter minus the UI-only knockouts —
 * the claim is what actually decides, this is only a pre-filter.
 */
function dueClips(now) {
  const { projects: list } = deps.projects.listProjects(deps.libraryRoot());
  const out = [];
  for (const proj of list || []) {
    const testMode = proj.testMode === true || (Array.isArray(proj.tags) && proj.tags.includes("test"));
    for (const clip of proj.clips || []) {
      if (clip.status !== "approved" && clip.status !== "ready") continue;
      if (!clip.scheduledAt) continue;
      if (new Date(clip.scheduledAt).getTime() > now) continue;
      if (testMode) continue; // #60: test projects never publish
      if (autoFiring.has(clip.id)) continue;
      out.push({
        ...clip,
        _projectId: proj.id,
        gameTag: (clip.gameTag || proj.gameTag || "").toLowerCase(),
      });
    }
  }
  return out.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
}

/**
 * Upload one clip to every platform its toggles leave enabled.
 *
 * Mirrors QueueView's publishClip: per-platform dispatch, `publishState` persisted after
 * EACH platform so a crash mid-run still leaves the clip recoverable, and `publishedAt`
 * stamped on the first real success (the durable "already went out" marker the claim
 * checks) rather than after the loop.
 *
 * @returns {{ allSuccess: boolean, failures: Array, captured: object, clip: object }}
 */
async function publishClip(clip) {
  const accounts = connectedAccounts();
  const toggles = clip.platformToggles || {};
  const enabled = accounts.filter((p) => {
    const key = accountToPlatformKey(p);
    return key && toggles[key] !== false;
  });

  if (!clip.renderPath) {
    return { allSuccess: false, failures: [{ platform: "all platforms", error: "Clip not rendered" }], captured: {}, clip };
  }
  if (enabled.length === 0) {
    return { allSuccess: false, failures: [{ platform: "all platforms", error: "No platforms enabled" }], captured: {}, clip };
  }

  const settings = captionSettings();
  const nextPublishState = { ...(clip.publishState || {}) };
  const nextDownscaled = { ...(clip.downscaledPosts || {}) };
  const captured = {};
  const failures = [];
  let allSuccess = true;
  let anySuccess = false;
  // #315: seeded from the clip so a re-publish NEVER overwrites an existing stamp.
  let publishedStamped = !!clip.publishedAt;
  let live = clip;

  for (const plat of enabled) {
    const platKey = accountToPlatformKey(plat);
    const caption = getEffectiveCaption(clip, platKey, settings);
    const base = { accountId: plat.key, videoPath: clip.renderPath, title: clip.title, caption, clipId: clip.id, isTest: false, scheduled: true };

    try {
      let result;
      if (plat.platform === "TikTok") {
        result = await deps.publishers.tiktok({
          ...base,
          postMode: (deps.store.get("platformOptions") || {}).tiktokPostMode || "direct_post",
          tiktokFields: {
            privacy: clip.tiktokPrivacy || null,
            disableDuet: clip.tiktokDisableDuet === true,
            disableStitch: clip.tiktokDisableStitch === true,
            disableComment: clip.tiktokDisableComment === true,
            commercialDisclosure: clip.tiktokCommercialDisclosure === true,
            isYourBrand: clip.tiktokIsYourBrand === true,
            isBrandedContent: clip.tiktokIsBrandedContent === true,
          },
        });
      } else if (plat.platform === "Instagram" || (plat.platform === "Meta" && plat.igAccountId)) {
        result = await deps.publishers.instagram(base);
      } else if (plat.platform === "Facebook") {
        result = await deps.publishers.facebook(base);
      } else if (plat.platform === "YouTube") {
        result = await deps.publishers.youtube({
          ...base,
          tags: resolveTags(clip, settings.ytDescriptions, settings.gamesDb),
          youtubeTitle: clip.youtubeTitle || clip.title,
          privacyStatus: clip.youtubePrivacy || "public",
        });
      } else {
        const msg = `${plat.platform} publishing isn't supported yet`;
        nextPublishState[plat.key] = { error: msg, at: new Date().toISOString() };
        failures.push({ platform: plat.platform, error: msg });
        allSuccess = false;
        continue;
      }

      if (result?.error) {
        nextPublishState[plat.key] = { error: String(result.error), at: new Date().toISOString() };
        failures.push({ platform: plat.platform, error: String(result.error) });
        allSuccess = false;
      } else {
        nextPublishState[plat.key] = "success";
        if (result?.downscaled) nextDownscaled[plat.key] = result.downscaledTo || "720p";
        anySuccess = true;
        const postId = result?.postId || result?.post_id || result?.mediaId || result?.videoId || null;
        const url = result?.url || (plat.platform === "YouTube" && result?.videoId ? `https://www.youtube.com/watch?v=${result.videoId}` : null);
        captured[platKey] = { platform: platKey, accountId: plat.key, ...(postId ? { postId } : {}), ...(url ? { url } : {}) };
      }
    } catch (err) {
      nextPublishState[plat.key] = { error: err.message || "Failed", at: new Date().toISOString() };
      failures.push({ platform: plat.platform, error: err.message || "Failed" });
      allSuccess = false;
    }

    // Persist this platform's outcome before attempting the next one.
    try {
      const updates = { publishState: { ...nextPublishState } };
      if (anySuccess && !publishedStamped) updates.publishedAt = new Date().toISOString();
      if (Object.keys(nextDownscaled).length) updates.downscaledPosts = { ...nextDownscaled };
      const res = deps.projects.updateClip(deps.libraryRoot(), clip._projectId, clip.id, updates);
      if (updates.publishedAt) publishedStamped = true;
      // Keep a live copy so the tracker row reads the persisted publishState/publishedAt.
      live = { ...live, ...updates };
      if (res?.error) log("warn", `Scheduler: persisting publish state failed: ${res.error}`);
    } catch (err) {
      log("warn", `Scheduler: persisting publish state threw: ${err.message}`);
    }
  }

  return { allSuccess, failures, captured, clip: live };
}

/**
 * A clip finished publishing to every enabled platform. Write the record.
 *
 * Both writes happen HERE rather than in a renderer, which is the whole point of #329:
 * the process that did the upload is the process that files it, so a publish during a
 * stream lands in the Tracker exactly like one done with the window open.
 */
function recordPublished(clip) {
  const settings = captionSettings();
  const when = firstSuccessMoment(clip);
  const row = buildTrackerRow(clip, {
    connectedAccounts: connectedAccounts(),
    captured: clip._captured || {},
    settings,
    date: localISO(when),
    day: FULL_DAY_NAMES[when.getDay()],
    time: localTimeLabel(when),
    // Preserves the existing behaviour exactly: the renderer's auto-fire path also
    // logged these through logPostAtFirstSuccess with isScheduled false, because it
    // passed a null scheduleOpts. The slot is already correct via `publishedAt`.
    isScheduled: false,
  });

  deps.onPublished(row, {
    training: isTrainingEligible(clip)
      ? {
        clipId: clip.id,
        projectId: clip._projectId,
        game: clip.game || row.game,
        title: clip.title || "",
        caption: clip.caption || "",
      }
      : null,
  });
}

/** #244 layer 1: warn about dead connections BEFORE the slot, not at post time. */
async function preflightUpcoming(now) {
  const { projects: list } = deps.projects.listProjects(deps.libraryRoot());
  const accounts = connectedAccounts();
  for (const proj of list || []) {
    const testMode = proj.testMode === true || (Array.isArray(proj.tags) && proj.tags.includes("test"));
    if (testMode) continue;
    for (const clip of proj.clips || []) {
      if (!clip.scheduledAt) continue;
      const t = new Date(clip.scheduledAt).getTime();
      if (t <= now || t - now > PREFLIGHT_WINDOW_MS) continue;

      const toggles = clip.platformToggles || {};
      const toCheck = accounts.filter((a) => {
        const k = accountToPlatformKey(a);
        return k && toggles[k] !== false && !preflighted.has(`${a.key}|${clip.scheduledAt}`);
      });
      if (toCheck.length === 0) continue;
      toCheck.forEach((a) => preflighted.add(`${a.key}|${clip.scheduledAt}`));

      for (const a of toCheck) {
        try {
          const res = await deps.preflightAccount(a.key);
          if (!res?.needsReconnect) continue;
          const at = new Date(clip.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          deps.notify({
            title: `${a.platform} needs reconnecting`,
            body: `Reconnect in Settings before your ${at} post — "${clip.title}" is scheduled.`,
          });
          deps.onAccountsChanged?.();
        } catch (err) {
          log("warn", `Scheduler: pre-flight failed for ${a.key}: ${err.message}`);
        }
      }
    }
  }
}

/** One scheduler pass. Exported so a test can drive it without waiting 60s. */
async function tickOnce() {
  if (!deps || running) return;
  running = true;
  const now = Date.now();
  // Streaming mode has no UI to read a number off, so the footprint goes to app.log.
  deps.onTick?.();
  try {
    for (const clip of dueClips(now)) {
      autoFiring.add(clip.id);
      try {
        // #156/#182: the single arbitration point. Re-reads from disk and clears
        // scheduledAt in one write, so only one caller can ever fire a schedule.
        const claim = deps.projects.claimScheduledPublish(deps.libraryRoot(), clip._projectId, clip.id);
        if (!claim?.claimed) {
          log("info", `Scheduler: skipping "${clip.title}" — ${claim?.reason || "claim unavailable"}`);
          continue;
        }
        log("info", `Scheduler: firing scheduled publish for "${clip.title}" (slot ${clip.scheduledAt})`);

        // Publish the clip the claim just re-read from disk, not the pre-filter copy —
        // a stale renderPath (#188 renames the file) fails every platform at once.
        const target = { ...clip, ...claim.clip, _projectId: clip._projectId };
        const outcome = await publishClip(target);
        deps.onClipChanged?.(clip._projectId, clip.id);

        if (outcome.allSuccess) {
          recordPublished({ ...outcome.clip, _projectId: clip._projectId, _captured: outcome.captured });
        } else {
          const platNames = [...new Set(outcome.failures.map((f) => f.platform))];
          log("error", `Scheduler: "${clip.title}" failed on ${platNames.join(", ")}`);
          deps.notify({
            title: "Scheduled publish failed",
            body: `"${clip.title}" didn't go out on ${platNames.join(", ")}. Open Corva to retry.`,
          });
          deps.onFailure({ clipTitle: clip.title, platforms: platNames, at: Date.now() });
          // A publish-time invalid_grant flags the account — refresh the Settings badge.
          deps.onAccountsChanged?.();
        }
      } catch (err) {
        log("error", `Scheduler: auto-fire threw for ${clip.id}: ${err.message}`);
      } finally {
        autoFiring.delete(clip.id);
      }
    }

    await preflightUpcoming(now);
  } finally {
    running = false;
  }
}

/**
 * Start the 60s tick. Idempotent.
 *
 * The dev-profile refusal is the s214 lesson made structural: a dev build once
 * auto-published to real accounts because its renderer's scheduler was alive. Now that
 * the scheduler runs with no window to notice it, "the dev profile does not auto-post"
 * has to be code, not discipline. A manual Publish now from the dev UI is untouched —
 * that is a deliberate human act.
 */
function startScheduler(injected) {
  deps = injected;
  if (timer) return;
  if (deps.isDevProfile && process.env.CLIPFLOW_ALLOW_DEV_PUBLISH !== "1") {
    log("info", "Scheduler: dev profile — scheduled publishing disabled (set CLIPFLOW_ALLOW_DEV_PUBLISH=1 to override)");
    return;
  }
  timer = setInterval(() => { tickOnce().catch((err) => log("error", `Scheduler tick failed: ${err.message}`)); }, TICK_MS);
  tickOnce().catch((err) => log("error", `Scheduler first tick failed: ${err.message}`));
  log("info", "Scheduler: started (main process, 60s tick)");
}

function stopScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { startScheduler, stopScheduler, tickOnce };
