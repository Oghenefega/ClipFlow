/**
 * subtitle-pollution-migration.js — One-time repair of #84 subtitle pollution.
 *
 * Before the #78/#84 fix, the editor save path wrote the ENTIRE `editSegments`
 * array to `clip.subtitles.sub1` — including the source-wide "extra" segments that
 * useSubtitleStore.initSegments merges in for extend-coverage. Result: many clips
 * on disk have `sub1` (with `_format: "source-absolute"`) spanning the whole source
 * recording instead of just the clip's range.
 *
 * This migration repairs those clips by filtering `sub1` down to the segments that
 * fall within the clip's current nleSegments source ranges (falling back to
 * [startTime, endTime] when a clip has no nleSegments) — the same predicate the
 * fixed save path now applies. In-range edits are preserved; only the out-of-range
 * pollution is dropped.
 *
 * Idempotent and gated by the `subtitlePollutionRepairComplete` store flag so it
 * runs once. Only pipeline-born sub1 (no `_format`) is left untouched.
 */
const log = require("electron-log/main").scope("sub-pollution-migration");

/** Source ranges a clip's subtitles are allowed to occupy. */
function clipRanges(clip) {
  if (Array.isArray(clip.nleSegments) && clip.nleSegments.length > 0) {
    return clip.nleSegments
      .filter((n) => n && typeof n.sourceStart === "number" && typeof n.sourceEnd === "number")
      .map((n) => ({ start: n.sourceStart, end: n.sourceEnd }));
  }
  const start = clip.startTime || 0;
  const end = clip.endTime || 0;
  return end > start ? [{ start, end }] : [];
}

/**
 * Run the one-time subtitle pollution repair across all projects.
 * @param {string} watchFolder
 * @param {object} store - electron-store instance
 * @param {object} projects - the projects module (listProjects/loadProject/saveProject)
 * @returns {{ repaired: number, clipsFixed: number, skipped: number, errors: string[] }}
 */
function runSubtitlePollutionMigration(watchFolder, store, projects) {
  if (store.get("subtitlePollutionRepairComplete")) {
    return { repaired: 0, clipsFixed: 0, skipped: 0, errors: [] };
  }
  if (!watchFolder) {
    return { repaired: 0, clipsFixed: 0, skipped: 0, errors: ["No watch folder"] };
  }

  log.info("Starting subtitle pollution repair...");
  let repaired = 0;   // projects rewritten
  let clipsFixed = 0; // clips whose sub1 was trimmed
  let skipped = 0;
  const errors = [];

  let summaries;
  try {
    summaries = projects.listProjects(watchFolder).projects || [];
  } catch (e) {
    return { repaired: 0, clipsFixed: 0, skipped: 0, errors: [`listProjects failed: ${e.message}`] };
  }

  for (const summary of summaries) {
    let project;
    try {
      project = projects.loadProject(watchFolder, summary.id);
    } catch (e) {
      errors.push(`load ${summary.id}: ${e.message}`);
      continue;
    }
    if (!project || !Array.isArray(project.clips)) { skipped++; continue; }

    let projectChanged = false;
    for (const clip of project.clips) {
      const subs = clip.subtitles;
      // Only editor-saved, source-absolute sub1 can be polluted.
      if (!subs || Array.isArray(subs) || subs._format !== "source-absolute") continue;
      const sub1 = subs.sub1;
      if (!Array.isArray(sub1) || sub1.length === 0) continue;

      const ranges = clipRanges(clip);
      if (ranges.length === 0) continue; // can't determine range — leave as-is

      const filtered = sub1.filter((s) => {
        if (typeof s.startSec !== "number" || typeof s.endSec !== "number") return true; // keep what we can't evaluate
        return ranges.some((r) => s.startSec < r.end && s.endSec > r.start);
      });

      if (filtered.length < sub1.length) {
        subs.sub1 = filtered;
        clipsFixed++;
        projectChanged = true;
        log.info(`Repaired clip ${clip.id}: ${sub1.length} → ${filtered.length} segments`);
      }
    }

    if (projectChanged) {
      try {
        projects.saveProject(watchFolder, project);
        repaired++;
      } catch (e) {
        errors.push(`save ${summary.id}: ${e.message}`);
      }
    } else {
      skipped++;
    }
  }

  store.set("subtitlePollutionRepairComplete", true);
  log.info(`Subtitle pollution repair complete: ${repaired} projects, ${clipsFixed} clips fixed, ${skipped} skipped, ${errors.length} errors`);
  return { repaired, clipsFixed, skipped, errors };
}

module.exports = { runSubtitlePollutionMigration };
