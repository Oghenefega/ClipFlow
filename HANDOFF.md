# HANDOFF — Session 264 (2026-09-17)

## Current State

Master is clean at this wrap's commit. The #438 double-post fix is committed (`5c06b1f`) but is
**not in an installer**. The installed app, and alpha.7 on the feed, still have the bug. 539 tests.
#438 is closed with `status: untested`. What's New now has an `unreleased` entry for it.

## Key Decisions

- **One in-flight registry in main (`publish.js`) for every uploader.** The scheduler claims as
  `"scheduler"`, and the Queue's Post/Retry claim through `publish:begin`/`publish:end` keyed by
  webContents id. Whoever comes second is refused. It lives in main because the renderer's copy of
  a clip is stale by construction: the claim clears `scheduledAt` before the window has even loaded.
- **The Queue learns about background posts two ways:** a live `publish:clipPublishing` start/stop
  event, and a `publish:inFlight` pull on mount. The pull is the reboot case, where the boot tick
  started before the window existed and the event went to nobody.
- **Background state is its own `bgPublishing` Set, not seeded into `publishStatus`** (a small
  departure from the plan). `publishStatus` holds per-platform detail of the window's own runs.
  The existing "Publishing..." pill is reused instead of a new "Posting now…" label.
- **The repost confirm Fega approved was dropped.** A completed publish lands a tracker row and the
  card leaves the Queue within a second, so there is no Post button left to press. My question had
  wrongly implied there was (see lessons).
- **#440 was filed, not done:** posting is implemented three times (main, Post, Retry). #438 makes
  them share one claim, and collapsing them is a separate refactor.

## Next Steps

1. **Ask Fega how alpha.7 went**, carried over from s263: caption Apply (#437), Generate-then-switch
   (#436), "This section" drag (#435), Ctrl+click word chips (#434), AA on "Cryo" (#433). Clear
   `status: untested` as he confirms.
2. **#438 reaches him only through an installer.** Batch rule applies (~10 changes, or he asks).
   After that, the check is the next scheduled clip that goes out while Corva is open: the card
   reads Publishing..., has no Post button, and then leaves the Queue.
3. **#439 is a good next pick:** Post with no platform to post to does nothing visible, and every
   tester with no accounts hits it. Small, and it's in the same file.
4. #440 when there's appetite. Carry-overs: ask about #425 on the Asuna clip, #419, #418, #416, #265.
5. The 2026-09-16 duplicates are still live (YouTube `dCA-wPdGWfM`, FB `1126032163418918`,
   IG `18028794797855518`, second TikTok). Fega has the IDs; deleting them is his call.

## Watch Out For

- **The real scheduler-to-window wire was only grep-checked.** Jest covers `tickOnce` →
  `onPublishingChanged`, and the live tests emulated the main→renderer send on the same channel.
  Running a real `tickOnce` in dev pops an OS "publish failed" toast, so it was skipped. The first
  true end-to-end is the next scheduled post on the installed build.
- **Retry goes through the same wrapper but was not clicked** in the live test.
- **`did-start-loading` releases a window's claims on ANY page load.** The only reloads today are
  the crash screen's Reload (`AppErrorBoundary.js:35`) and `SettingsView.js:2461`, and both kill the
  renderer's posting loop anyway. If an iframe, webview or in-app navigation is ever added, revisit.
- **QueueView's hydration effect (:736-774) erases any in-memory failure whose `publishState` is
  empty** after every render (#439). Anything new that sets `publishStatus` without persisting will
  vanish the same way.
- **Dev profile restored byte-identical from `dev-settings.backup.json`**, tokens `{"accounts":{}}`,
  `Corva.exe` never touched. The fixture (`fx438/`, plus a dead `fx438proj` folder) is left in the
  scratchpad, which is disposable.
- `publish.js`/`main.js` are LF in the working copy (autocrlf warns). That's pre-existing, the same
  as the untouched `App.js`. Git's index is LF for all of them and the diff was content-only.

## Logs / Debugging

- New app.log lines: `Queue publish refused — clip is already being posted {clipId}` (info),
  `Released publish claims held by a window that went away {clipIds}` (warn), and
  `Scheduler: skipping "<title>" — already being posted from the Queue` (info).
- **Spotting a double post:** `clipflow-publish-log.json` has two `success` rows per platform for one
  `clipId`. In `app.log`, count the `Scheduler: firing` lines for that clip — a chain without one
  came from the Queue.
- Scratchpad drivers (`…/4370c7ea…/scratchpad`):
  - `fx-setup.js` (`--restore`): builds the fixture and repoints the dev profile.
  - `drv.js`: evaluates in the renderer (port 9222) or main (9229).
  - `mprelude.js` + `mrun.sh`: main-process eval that asserts it got the live module instance.
  - `rows.js`: Queue row pill and buttons.
  - `t3click.js`: the incident, driven through the real Post button.
  - `t3raw.js`: raw mutation capture.
  - `shot.js`, and `mutate.js` (mutation test of `publish.js`).
