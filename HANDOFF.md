# HANDOFF — Session 244 (2026-09-07)

## Current State

**alpha.28 is cut, published and live on the update feed — but Fega has not installed it yet.**
Three commits this session: the release (`1a5ebe8`), the technical-summary rebuild (`39530c3`),
and two fixes the rebuild uncovered (`af72b55`). Master is clean, 21 test suites / 420 tests green,
renderer builds clean, dev boot clean.

alpha.28 promoted nine issues (#364–#372 — everything from sessions 242/243). The two fixes in
`af72b55` (#374, #375) are **on master but not in any installer** — they need alpha.29 or the next
batch.

The external technical summary at
`~/Documents/Obsidian Vault/The Lab/Businesses/ClipFlow/context/technical-summary.md`
is current as of alpha.28 (914 lines, rebuilt from scratch — the previous one described alpha.4 and
was 210 commits behind). Its companion `tasks/specs/backlog-truth-audit-2026-08-23.md` is now
explicitly marked STALE inside the summary: it verified 110 open issues, there are 137.

## Key Decisions

- **Closed #374 and #375 as `status: untested` rather than waiting for Fega's confirmation.** Both
  are verified end-to-end by me (frame-diff on a real export; read-only check against the real token
  store), but he has confirmed neither. The label is the established convention for exactly this.
- **Did NOT run the live YouTube view refresh.** It would hit the API and write view counts into his
  real library; that first run is his to trigger. The new log line reports how many rows it updated.
- **Left the backlog truth audit un-rerun.** Re-verifying 137 issues is its own session; marking the
  companion stale inside the summary was the honest cheap move.
- **Filed the `npm start` scheduler question as #376 rather than deciding it.** Three options written
  out in the issue. It is a product/safety tradeoff, not a bug.

## Next Steps

1. **Fega installs alpha.28** — relaunch → "Update available" banner → Install. Nothing from
   sessions 242/243 has been seen on his daily driver yet.
2. **#373 — six test suites never run under `npm test`** (jest `testMatch` only matches inside
   `__tests__/`), and four of them ship inside the asar. The 464-line `segmentWords` suite covering
   the subtitle chunker — the file that changed most recently and a known regression area — has
   never executed. Widening the glob is minutes; triaging what the six suites then surface is the
   real work.
3. **#376 — decide the scheduler-from-source question.** Needs Fega, not code.
4. **#377 — four stale comments + three orphaned `trackerEngine` functions** still hardcoding `/6`.
5. **Cut alpha.29** when #374/#375 should reach the daily driver (or batch them further).
6. Remaining from the summary's own "fix first" list, not yet filed as issues: no `-pix_fmt` outside
   reframe (10-bit sources → High-10 H.264 most platforms reject), `probeFps` silently returning 30,
   `createOverlaySession` returning null → a render with no subtitles and no warning.

## Watch Out For

- **`npm start` on the prod profile is a live publisher (#376).** The scheduler moved into the main
  process with #329; the mandated post-change verification ritual boots it, it ticks within 60 s, and
  it will post any overdue scheduled clip to real accounts. It has already happened once (s214, two
  clips at 1:15 AM). `startScheduler` refuses on the **dev** profile only
  (`publish.js:351-354` — override with `CLIPFLOW_ALLOW_DEV_PUBLISH=1`). Verify with
  `CLIPFLOW_PROFILE=dev`, never bare `npm start`.
- **`taskkill //F //IM Corva.exe` kills Fega's daily driver.** `electron.exe` is the safe one — only
  source runs use it. Both were running this session.
- **A subtitle field can be lost by a `.map()` that copies named fields.** `resolveTimelineSubtitles`'s
  resolver branch maps `start/end/text/words` only; anything else on a segment dies there. That is
  what made the first #374 fix a no-op. Filter/read such flags at ingestion.
- **The infrastructure dashboard is behind.** It records the engine runtime at 1.0.0; 1.1.0 with the
  three voter models shipped 2026-09-03. Extends the R1 decision rather than contradicting it, so it
  was left alone — but update it next time that doc is opened.
- Two `[data-theme]` palettes were added since the memory note said "four themes" — there are now
  **eight**. Memory corrected this session.

## Logs/Debugging

- **Dev boot verify:** `rm` the dev log, `CLIPFLOW_PROFILE=dev npx electron .`, then grep
  `C:\Users\IAmAbsolute\AppData\Roaming\clipflow-dev\logs\app.log`. A clean boot ends with
  `Main window revealed (renderer-ready+min-hold)` and, on dev,
  `Scheduler: dev profile — scheduled publishing disabled`. Seeing that scheduler line is the
  positive confirmation that nothing can publish.
- **`scripts/dev/subtitle-disable-probe.js`** (new) — renders the same clip twice through the real
  `renderClip`, once with a stored subtitle segment marked `enabled: false`, and diffs the outputs
  frame by frame. PASS = changed pixels inside the line's window, exactly 0 everywhere else. Run it
  with `CLIPFLOW_PROFILE=dev npx electron scripts/dev/subtitle-disable-probe.js`. Read-only on the
  project and it refuses if the clip is approved or published.
- **Do not threshold brightness to check a burn-in.** Gameplay puts ~3,300 near-white pixels in the
  subtitle band on every frame; a whole line of text is ~1% of that and reads as noise. This produced
  two false FAILs before the metric was replaced with a frame diff.
- **Read-only account check without booting the app:** an Electron script that does
  `app.setPath("userData", <appData>/Corva)` then `tokenStore.init()` + `getAllAccounts()` lists the
  connected accounts with no window and no scheduler. All four store DISPLAY casing
  (`"YouTube"`, `"TikTok"`, `"Facebook"`, `"Instagram"`) — always resolve through
  `accountToPlatformKey`.
- **Live DB is `%APPDATA%\Corva\data\clipflow.db`** (712 KB, schema v9): feedback 644 rows
  (188 approved / 456 rejected), file_metadata 197, title_caption_rounds 174 — and **zero** view
  counts, which is what #375 was about. `data/clipflow.db` in the repo is stale; never measure
  against it.
