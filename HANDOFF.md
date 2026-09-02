# HANDOFF — Session 230 (2026-09-02)

## Current State

**#354 and #355 built, verified in the dev app, committed, and cut as alpha.21 (feed live,
alpha.20 pruned). Both wait for Fega to try them (`status: untested`).**

- **#354 Queue:** `Schedule` button on every unscheduled row, left of `Post`. It opens the
  date/time picker in a strip directly under the row (`rowSched` state in `QueueView.js`),
  prefilled from `autoSuggestSlot()`, and saves through the existing `scheduleClipOnly`. The
  picker is now ONE function, `renderSchedulePicker(clip, onCancel)`, used by both the row strip
  and the expanded panel. Action column widened 150 → 215px (header + row).
- **#354 rename:** every Queue ACTION says Post (`Post`, `Post now`, `Confirm post`,
  `Posting to N platforms`, `Posting…/Post results/Posted`, tooltips). STATUS nouns deliberately
  unchanged: `Published` badge, `Published Today`, `Published` section, `Publish Log`,
  Settings → Publishing. Fega chose that split.
- **#355 timeline:** a selected subtitle block draws a dot at each top corner
  (`SegmentBlock.js`, props `onMerge`/`canMergePrev`/`canMergeNext`). `TimelinePanelNew.js`
  owns the guard (`subMergeTargets`: the RAW neighbour must be in the mapped/visible list, same
  rule as the left panel's #217 guard) and the action (`handleSubtitleMerge`: activates the
  survivor, calls the store's `mergeSegment`, re-selects the survivor). Dots skipped when the
  block is under 36px wide. Fega rejected a right-click-menu version before this was built.

E2E (`e2e-354-355.js` in this session's scratchpad `bde0ed93…`) passes all 8 steps: row
Schedule → picker under the row without expanding → Save lands in SCHEDULED at the suggested
time (checked on disk too) → Unschedule; first/middle/last block dot rules; right dot merges
"um," + "JP is" → "um, JP is"; left dot merges into the previous; Ctrl+Z restores both. 223
unit tests green. Proof shots: `q-picker.png`, `t-dots.png`.

## Key Decisions

- **On-block control, not a menu, for timeline edits** (lesson in tasks/lessons.md s230).
- **Post = the verb, Published = the state.** Don't sweep the status nouns without an ask.
- **No Schedule/Reschedule on the SCHEDULED row** — not asked for; the old "edit a scheduled
  clip's time" wish (memory `project_queue_reschedule`) is still open.

## Next Steps

1. Fega tries both on the next installer → close #354/#355 (remove `status: untested`).
2. #353 Batch B (project subtitles/sounds/overlays per section) is still the big open item;
   backlog from s228 stands (#350, #297/#299, quick-wins #307/#304/#320/#303, #341/#342).

## Watch Out For

- **Row `Schedule` on a placeholder-named clip ("Clip 3") raises a native `window.confirm`**
  (the #71 warning inside `scheduleClipOnly`). Fine for users; in a CDP run it freezes every
  `Runtime.evaluate` and CDP reports "No dialog is showing". Find it with a user32 EnumWindows
  for class `#32770` and post WM_CLOSE (script in this session's transcript), or avoid
  placeholder titles in the fixture.
- **A text-based "click the nav item named Queue" finder is dangerous inside the editor** — in
  run 1 it matched an editor element and started a real render of the fixture's Clip 2 (which
  then became approved + queued). Reload to the main tab before navigating, or scope the finder
  to the bottom nav.
- The subtitle-overlay window (`build/subtitle-overlay/index.html`) matches an `index.html`
  target filter — `cdp.js`/`shot.js` now exclude `overlay`. Copy those, not older versions.

## Logs/Debugging

- Dev boot (from the REPO root): `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222
  --disable-features=CalculateNativeWinOcclusion --disable-renderer-backgrounding
  --disable-background-timer-throttling`. Kill with `taskkill //F //IM electron.exe` (Corva.exe is
  the daily driver — never by image name).
- Fixture: copy of s227's AR rejected-clip project at `bde0ed93…/scratchpad/fixture`, with
  `clip_…_zawr` flipped to approved (title "Fixture approved clip") so the Queue had a row;
  `clip_…_sfa6` stayed rejected for the editor. Dev `projectsRoot/watchFolder/outputFolder` were
  repointed at it and RESTORED from `dev-settings-orig.json` at wrap. Dev tokens `{"accounts":{}}`
  before and after.
- Timeline zoom in a script: click the `svg.lucide-zoom-in` button (×9 ≈ 7.5×); the slider is a
  Radix component, not an `<input type=range>`.
