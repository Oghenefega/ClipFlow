// Now Playing Tracker — pure logic engine (XP, rank, streak, pace, weekly rollover)
// No React, no imports, no Date.now() side effects — every function takes dates as arguments.

export const XP_PER_CLIP = 10;
export const XP_GOAL_BONUS = 100;
export const XP_PER_RUNG = 320;
export const TIERS = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
export const SUBS = ["III", "II", "I"]; // entry sub-tier first; 15 rungs total, Bronze III → Diamond I

/**
 * Sums the `amount` field across an XP ledger. Tolerates undefined/empty input.
 */
export function ledgerTotal(xpLedger) {
  if (!xpLedger || !xpLedger.length) return 0;
  return xpLedger.reduce((sum, entry) => sum + (entry.amount || 0), 0);
}

/**
 * Resolves an XP total to a rank: tier + sub-tier, progress fraction, and XP to next rung.
 */
export function rankForXp(xp) {
  const rawRung = Math.floor(xp / XP_PER_RUNG);
  const rungIndex = Math.min(rawRung, 14);
  const top = rawRung >= 14;

  const tier = TIERS[Math.floor(rungIndex / 3)];
  const sub = SUBS[rungIndex % 3];
  const name = `${tier} ${sub}`;

  const rungStartXp = rungIndex * XP_PER_RUNG;
  const frac = top ? 1 : (xp - rungStartXp) / XP_PER_RUNG;
  const toNextXp = top ? 0 : rungStartXp + XP_PER_RUNG - xp;

  const nextRungIndex = Math.min(rungIndex + 1, 14);
  const nextTier = TIERS[Math.floor(nextRungIndex / 3)];
  const nextSub = SUBS[nextRungIndex % 3];
  const nextName = top ? name : `${nextTier} ${nextSub}`;

  return { name, tier, sub, top, frac, toNextXp, nextName, rungIndex };
}

/**
 * Formats a Date as a LOCAL YYYY-MM-DD string (never toISOString, which shifts to UTC
 * and moves evening timestamps onto the next calendar day).
 */
export function localISO(date) {
  const y = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/**
 * Returns the ISO date (YYYY-MM-DD) of the Sunday that starts the week containing `date`.
 *
 * #379: the week ran Mon–Sun until 2026-09-07 and this was `mondayISO`. It is THE key —
 * weekMeta, weekTemplateOverrides and the `goal-bonus:` ledger rows are all filed under
 * it — so the rename is deliberate: a helper still called "monday" while returning a
 * Sunday is how a whole week's XP gets banked against the wrong key. Stores written
 * before the change are shifted once by the migration in main.js.
 */
export function weekStartISO(date) {
  const d = new Date(date);
  const sun = new Date(d);
  sun.setDate(d.getDate() - d.getDay()); // getDay(): Sunday is already 0
  const y = sun.getFullYear();
  const mm = String(sun.getMonth() + 1).padStart(2, "0");
  const dd = String(sun.getDate()).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/**
 * Adds `n` days to an ISO date string, returning a new ISO date string.
 */
export function addDaysISO(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Filters tracker entries whose `date` falls within the Sun–Sat week starting at `weekStartIso`.
 */
export function weekEntries(trackerData, weekStartIso) {
  if (!trackerData || !trackerData.length) return [];
  const lastIso = addDaysISO(weekStartIso, 6);
  return trackerData.filter((entry) => entry.date >= weekStartIso && entry.date <= lastIso);
}

/**
 * Whole active days elapsed in the week as of `date`. Sun=0, Mon=1 ... Sat=6.
 * Superseded by paceForTemplate (trackerTemplate.js), which prorates over the
 * template's OWN active days; kept in step with #379 rather than left lying with
 * Monday-first math in a module whose week now starts on Sunday.
 */
export function daysElapsedInWeek(date) {
  return date.getDay();
}

/**
 * Active days remaining after `date` within the current week. Sun=6 ... Sat=0.
 */
export function activeDaysLeft(date) {
  return 6 - date.getDay();
}

/**
 * Computes pace status (green/yellow/red) against a weekly target as of `date`.
 */
export function paceInfo({ posted, target, date }) {
  const elapsed = daysElapsedInWeek(date);
  const expected = target > 0 ? (target * elapsed) / 6 : 0;
  const expectedRounded = Math.round(expected);
  const diff = posted - expectedRounded;

  let status;
  if (posted >= expected) status = "green";
  else if (posted >= expected * 0.85) status = "yellow";
  else status = "red";

  return { expected, expectedRounded, diff, status, daysLeft: activeDaysLeft(date) };
}

/**
 * Summarizes a set of tracker entries: clip count, per-platform post counts, platforms used.
 */
export function computeRecap(entries) {
  const perPlatform = { tiktok: 0, youtube: 0, instagram: 0, facebook: 0 };
  for (const entry of entries || []) {
    if (!entry.platformResults) continue;
    for (const row of entry.platformResults) {
      if (Object.prototype.hasOwnProperty.call(perPlatform, row.platform)) {
        perPlatform[row.platform]++;
      }
    }
  }
  const platformsUsed = Object.values(perPlatform).filter((count) => count > 0).length;
  return { clips: (entries || []).length, perPlatform, platformsUsed };
}

/**
 * Lazy weekly rollover: evaluates completed weeks since the last evaluation, banks goal-bonus XP,
 * self-heals previously-missed weeks that now qualify, and recomputes the streak. Pure — never
 * mutates inputs.
 */
export function evaluateRollover({ trackerData, weekMeta, xpLedger, streakState, weeklyTarget, mainGame, today }) {
  const todayWeekStart = weekStartISO(today);
  const meta = { ...weekMeta };
  const streak = { ...streakState };
  const ledgerAppends = [];

  const originalMetaJSON = JSON.stringify(weekMeta);

  // `evaluatedThroughMondayISO` holds a Sunday since #379. The FIELD keeps its name
  // on purpose — it is persisted in every existing store, and renaming a settings key
  // buys a second migration for nothing. Its value is shifted by the same migration.
  if (streak.evaluatedThroughMondayISO === null || streak.evaluatedThroughMondayISO === undefined) {
    streak.evaluatedThroughMondayISO = addDaysISO(todayWeekStart, -7);
  }

  if (!meta[todayWeekStart]) {
    meta[todayWeekStart] = { target: weeklyTarget, nowPlaying: mainGame };
  } else if (meta[todayWeekStart].nowPlaying !== mainGame) {
    // Keep the current (unfrozen) week's snapshot in step with mainGame so a switch
    // made from Settings — not just the tracker banner — is reflected. Past weeks
    // are frozen and never touched.
    meta[todayWeekStart] = { ...meta[todayWeekStart], nowPlaying: mainGame };
  }

  const hasBonus = (weekKey) => {
    const key = `goal-bonus:${weekKey}`;
    return xpLedger.some((e) => e.key === key) || ledgerAppends.some((e) => e.key === key);
  };

  let cursor = addDaysISO(streak.evaluatedThroughMondayISO, 7);
  while (cursor < todayWeekStart) {
    const w = cursor;
    const snapshot = meta[w] ? { ...meta[w] } : { target: weeklyTarget, nowPlaying: mainGame };
    const count = weekEntries(trackerData, w).length;
    const hit = count >= snapshot.target;

    if (hit && !hasBonus(w)) {
      ledgerAppends.push({ key: `goal-bonus:${w}`, amount: XP_GOAL_BONUS, reason: "goal-bonus", dateISO: w });
    }

    snapshot.outcome = hit ? "hit" : "missed";
    snapshot.recap = computeRecap(weekEntries(trackerData, w));
    meta[w] = snapshot;

    streak.evaluatedThroughMondayISO = w;
    cursor = addDaysISO(w, 7);
  }

  // Self-heal pass: upgrade previously-missed weeks that now qualify; never downgrade hit→missed.
  for (const weekKey of Object.keys(meta)) {
    if (weekKey >= todayWeekStart) continue;
    const snapshot = meta[weekKey];
    if (!snapshot || !snapshot.outcome) continue;

    const count = weekEntries(trackerData, weekKey).length;

    if (snapshot.outcome === "missed") {
      if (count >= snapshot.target) {
        const updated = { ...snapshot, outcome: "hit", recap: computeRecap(weekEntries(trackerData, weekKey)) };
        if (!hasBonus(weekKey)) {
          ledgerAppends.push({ key: `goal-bonus:${weekKey}`, amount: XP_GOAL_BONUS, reason: "goal-bonus", dateISO: weekKey });
        }
        meta[weekKey] = updated;
      } else {
        const refreshed = computeRecap(weekEntries(trackerData, weekKey));
        if (JSON.stringify(refreshed) !== JSON.stringify(snapshot.recap)) {
          meta[weekKey] = { ...snapshot, recap: refreshed };
        }
      }
    } else if (snapshot.outcome === "hit") {
      const refreshed = computeRecap(weekEntries(trackerData, weekKey));
      if (JSON.stringify(refreshed) !== JSON.stringify(snapshot.recap)) {
        meta[weekKey] = { ...snapshot, recap: refreshed };
      }
    }
  }

  // Recompute streak from outcome history.
  const evaluatedWeeks = Object.keys(meta)
    .filter((k) => meta[k] && meta[k].outcome)
    .sort();

  let current = 0;
  for (let i = evaluatedWeeks.length - 1; i >= 0; i--) {
    const weekKey = evaluatedWeeks[i];
    if (meta[weekKey].outcome !== "hit") break;
    if (i < evaluatedWeeks.length - 1) {
      const nextWeekKey = evaluatedWeeks[i + 1];
      if (addDaysISO(weekKey, 7) !== nextWeekKey) break;
    }
    current++;
  }

  let best = streakState.best || 0;
  let run = 0;
  let prevKey = null;
  for (const weekKey of evaluatedWeeks) {
    const consecutive = prevKey === null || addDaysISO(prevKey, 7) === weekKey;
    if (meta[weekKey].outcome === "hit" && consecutive) {
      run++;
    } else if (meta[weekKey].outcome === "hit") {
      run = 1;
    } else {
      run = 0;
    }
    if (run > best) best = run;
    prevKey = weekKey;
  }

  streak.current = current;
  streak.best = best;

  const streakChanged =
    streak.evaluatedThroughMondayISO !== streakState.evaluatedThroughMondayISO ||
    streak.current !== (streakState.current || 0) ||
    streak.best !== (streakState.best || 0);

  const metaChanged = JSON.stringify(meta) !== originalMetaJSON;

  const changed = ledgerAppends.length > 0 || streakChanged || metaChanged;

  return { changed, weekMeta: meta, streakState: streak, ledgerAppends };
}
