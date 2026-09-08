# HANDOFF — Session 245 (2026-09-07)

## Current State

**alpha.29 is cut, published to the R2 feed, and waiting on Fega's relaunch.** Two commits: the
Sunday-start week work (`555aa10`) and the release (`0e89fff`). Master clean, 22 suites / 426 jest
tests green plus the 19 standalone calendar-model tests, renderer builds clean, boot verified on the
dev profile.

alpha.29 promotes everything since alpha.28: #379/#378/#380 (this session), plus #374/#375/#376
which had been sitting on master unshipped.

**The week-key migration has not run on Fega's real store yet.** It ships inside alpha.29 and fires
on his first launch of it. It ran cleanly on the dev profile against a copy of his data (11
snapshots, 3 overrides re-keyed), and was dry-run against the real store before any code was
written. A backup sits at `%APPDATA%\Corva\clipflow-settings.backup-2026-09-07-pre-379.json`.

## Key Decisions

- **The tracker week now runs Sun–Sat (#379, Fega's ask).** Treated as a real window move, not a
  column reorder: rendering Sunday first inside a Monday-opened week would have put the week's LAST
  day on the left. Everything week-keyed shifts back a day.
- **`mondayISO` renamed to `weekStartISO`, but `streakState.evaluatedThroughMondayISO` keeps its
  name.** The function is code and lies if it says "monday"; the field is persisted in every store
  and renaming it would buy a second migration for nothing. Its value is shifted, its key is not.
- **The `goal-bonus:<weekKey>` ledger rows migrate with `weekMeta`.** Left behind, the self-heal
  pass in `evaluateRollover` would not find the bonus under the new key and would bank a second
  100 XP for the same week, moving the rank. This is the migration's whole reason for touching the
  ledger.
- **QueueView moved onto the shared `weekStartISO`** rather than keeping its own week-date helper.
  It looked per-week slot overrides up by its own Monday and would have stopped finding them
  silently. Its helper and its Mon–Sat `DAY_NAMES` are deleted — nothing else used them.
- **Rails flank the grid, they do not overlay it.** An absolute overlay on the outer columns would
  have swallowed clicks on Sunday's and Saturday's own slots. They take the padding the grid already
  held, so columns lose ~12px a side rather than a rail's full width.
- **#377's three orphaned `trackerEngine` helpers were updated, not deleted.** They were about to
  become Monday-first math inside a Sunday-first module. Still orphaned; #377 still asks for their
  removal, and now says so.

## Next Steps

1. **Confirm alpha.29 on the daily driver** — relaunch, Install from the banner, then check the
   streak and rank are unchanged and `app.log` carries the `Tracker week moved to Sunday-start`
   line with 11 snapshots / 4 overrides / 1 goal-bonus row.
2. **#378/#379/#380 are all `status: untested`** until Fega confirms. #380 has a specific gap — see
   Watch Out For.
3. **#373 — six test suites never run under `npm test`** (jest `testMatch` only matches inside
   `__tests__/`). `trackerCalendarModel.test.js` is one of them and had to be run by hand this
   session; it would have caught the renamed params for free.
4. **#377 — four stale comments + the three orphaned `trackerEngine` functions.**
5. Remaining from the technical summary's "fix first" list, still unfiled: no `-pix_fmt` outside
   reframe, `probeFps` silently returning 30, `createOverlaySession` returning null → a render with
   no subtitles and no warning.

## Watch Out For

- **#282 drag-to-travel was NOT exercised end-to-end this session.** Holding a dragged clip at the
  calendar edge to flip weeks now happens over a rail button. The rail is a descendant of the div
  carrying `onDragOver` and sits flush against the grid with no overlap (both verified in the DOM),
  so `dragover` still bubbles — but the dev fixture has no scheduled clips, so no real drag was
  performed. First thing to try if Fega reports edge-travel misbehaving.
- **Do not run the week migration twice.** It shifts keys back one day and is guarded ONLY by
  `_migrated_weekStartSunday_v1`. Running it again would land every week on a Saturday. If a store
  ever needs re-migrating, restore the backup first.
- **Template grid key order changed** (Sunday first out of `normalizeTemplate`). A saved preset
  written before this stringifies differently from an equivalent one written after, which is why
  the preset-match check in TrackerView normalizes both sides now. Any NEW stringify-comparison of
  two templates must do the same.
- **`taskkill //F //IM Corva.exe` kills Fega's daily driver.** `electron.exe` is the safe one. Both
  were running this session.
- **Source runs do not auto-publish (#376) — intended, not a bug.** See s244's handoff for the
  override flags.

## Logs/Debugging

- **Boot verify on the dev profile:** `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222
  --disable-backgrounding-occluded-windows`, then `node scripts/dev/cdp.js "<expr>"` and
  `node scripts/dev/cdp-shot.js out.png`. `isDev` is hardcoded false, so this loads the built
  `build/` output — no Vite, which is what makes it a valid verification path.
- **The migration's own log line** is the confirmation it ran:
  `Tracker week moved to Sunday-start (#379): N week snapshot(s), N template override(s), N goal-bonus row(s) re-keyed`.
  Absent on every launch after the first — the flag suppresses it.
- **Reading the week grid via CDP:** the 7-column grid is the last element on the page with
  `display: grid` and 7 children; `getComputedStyle(g).gridTemplateColumns` shows an OFF day
  collapsed to `28px`. The day-toggle buttons are addressable as
  `button[title*="Posting on"], button[title*="Not posting on"]` — query those directly rather than
  scraping leaf text, which also matches the grid's own headers and reads as a jumbled order.
- **Measuring the repost-card overflow:** `row.scrollWidth - row.clientWidth` on the card's header
  row. 0 at every column width down to 109px; 12px before the fix. Below ~99px columns the game tag
  has already ellipsised to its padding and the row overflows again — that is the mechanism working,
  not a regression, and it is far below any real window size.
- **Emulation.setDeviceMetricsOverride survives past the call** and `clearDeviceMetricsOverride`
  did not visibly restore layout — relaunch the app to get a clean native viewport before taking a
  screenshot for Fega.
- **Do not edit a profile's `clipflow-settings.json` while its app is running** — electron-store
  will overwrite it. Kill the electron process, patch, relaunch.
