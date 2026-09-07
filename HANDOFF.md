# HANDOFF — Session 244 (2026-09-07)

## Current State

**alpha.28 is cut, published, and installed on Fega's daily driver.** Five commits this session:
the release (`1a5ebe8`), the technical-summary rebuild (`39530c3`), two fixes the rebuild uncovered
(`af72b55`), the session-close distillation (`ed47700`), and the #376 scheduler decision.
Master is clean, 22 test suites / 426 tests green, renderer builds clean, boot verified.

alpha.28 promoted nine issues (#364–#372 — everything from sessions 242/243). Three fixes since
then — #374, #375, #376 — are **on master but not in any installer**. None is urgent for Fega: the
first two are correctness fixes he can't easily see, and #376 only affects source runs, not his
installed app.

The external technical summary at
`~/Documents/Obsidian Vault/The Lab/Businesses/ClipFlow/context/technical-summary.md`
is current as of alpha.28 (914 lines, rebuilt from scratch — the previous one described alpha.4 and
was 210 commits behind). Its companion `tasks/specs/backlog-truth-audit-2026-08-23.md` is now
explicitly marked STALE inside the summary: it verified 110 open issues, there are 137.

## Key Decisions

- **#376 decided by Fega: only the installed app auto-publishes.** "I don't want this to ever fire
  randomly so I don't want the prod or npm start to be able to publish clips." Implemented as a
  second refusal in `startScheduler` beside the dev one. The accepted tradeoff: running prod from
  source will not post scheduled clips.
- **The missing-flag case fails toward NOT publishing** (`deps.isPackaged !== true`, not
  `=== false`). A future call site that forgets to inject the flag goes silent-and-loud (clips don't
  post, the log says why) rather than silently re-arming a source run — the bug itself.
- **Closed #374 and #375 as `status: untested`.** Both verified end-to-end by me (frame-diff on a
  real export; read-only check against the real token store), neither confirmed by Fega.
- **Did NOT run the live YouTube view refresh.** It would hit the API and write view counts into his
  real library; that first run is his to trigger. The new log line reports how many rows it updated.
- **Left the backlog truth audit un-rerun.** Re-verifying 137 issues is its own session; marking the
  companion stale inside the summary was the honest cheap move.

## Next Steps

1. **#373 — six test suites never run under `npm test`** (jest `testMatch` only matches inside
   `__tests__/`), and four of them ship inside the asar. The 464-line `segmentWords` suite covering
   the subtitle chunker — the file that changed most recently and a known regression area — has
   never executed. Widening the glob is minutes; triaging what the six suites then surface is the
   real work.
2. **#377 — four stale comments + three orphaned `trackerEngine` functions** still hardcoding `/6`.
3. **Cut alpha.29** when #374/#375/#376 should reach the daily driver, or keep batching.
4. Remaining from the summary's own "fix first" list, not yet filed as issues: no `-pix_fmt` outside
   reframe (10-bit sources → High-10 H.264 most platforms reject), `probeFps` silently returning 30,
   `createOverlaySession` returning null → a render with no subtitles and no warning.

## Watch Out For

- **Source runs no longer auto-publish (#376) — this is intended, not a bug.** `npm start` and
  `npm run dev` both refuse; only the installed app fires scheduled clips. If someone reports
  "scheduled posts stopped working", first ask whether they are running from source. Overrides for a
  deliberate test: `CLIPFLOW_ALLOW_SOURCE_PUBLISH=1`, `CLIPFLOW_ALLOW_DEV_PUBLISH=1` (independent —
  `npm run dev` is both a dev profile AND a source run, so it needs both).
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

- **Boot verify:** `rm` the dev log, `CLIPFLOW_PROFILE=dev npx electron .`, then grep
  `C:\Users\IAmAbsolute\AppData\Roaming\clipflow-dev\logs\app.log`. A clean boot ends with
  `Main window revealed (renderer-ready+min-hold)`. The `Scheduler:` line always states which
  refusal fired — that line is the positive confirmation that nothing can publish. To exercise the
  SOURCE guard specifically (rather than the dev one, which returns first), boot with
  `CLIPFLOW_ALLOW_DEV_PUBLISH=1 CLIPFLOW_PROFILE=dev` and expect
  `Scheduler: running from source — scheduled publishing disabled`.
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
