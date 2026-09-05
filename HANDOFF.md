# HANDOFF — Session 238 (2026-09-04)

## Current State

Second autonomous pass ("you're in charge"), then **alpha.24 cut at the end of the session on
Fega's word** (b74ebff): installer + blockmap + `alpha.yml` published to
`engine.flowve.app/updates/`, alpha.23 pruned from the feed, packaged version verified from the
asar. It carries session 237's seven fixes plus the four below; the What's New entry for
0.4.0-alpha.24 lists the user-visible ones. **Installed on the desktop the same evening** (Fega:
"settings says alpha.24"; `lastSeenVersion` stamped). **The #288 migration fired on that boot**:
`app.log` `Corva userData migration (#268): migrated`, stray shell parked as
`Corva.stray-2026-09-04T23-54-02-001Z`, `%APPDATA%\clipflow` gone — desktop data, DB and logs now
live under `%APPDATA%\Corva`. #288 closed on that proof. The #287 backfill was the expected
no-op on the desktop (flag set, 16 keys untouched). **Laptop not yet updated.**

| # | What | Commit | Verified how |
|---|---|---|---|
| #287 | One-shot starter YouTube description for library entries that never got one (the migration-injected Just Chatting, #262-reset survivors); Captions "Other games" lists every entry, *no description / + Add* rows open onto "Create one from the template"; Del asks first | fa03012 | dev profile with the JC key stripped: log line, key + flag written; Del cancel/accept, Add, Create, persisted; 5 jest tests |
| #162 | Undo/redo snapshots carry `segmentMode` so the dropdown follows the segments | 74b302c | dev editor on a rejected fixture clip: label + list flip together on undo, redo, undo |
| #150 | `fs:renameFile` translates EBUSY/EPERM/EACCES into "File is in use … close it and try again." + `locked: true` (part 2, the banner, had already shipped) | 5c94b3e | dev profile, file held under `FileShare.None` → friendly error; free file renamed |
| #155 | `publishFacebook` refreshes an expired user token, re-fetches `/me/accounts`, publishes with the fresh Page token; failure → `needsReconnect` + the shared "connection expired" message | c6730a1 | logic only — no Facebook tokens on any profile |

**Board hygiene:** the 24 issues the 2026-08-23 audit called "already fixed, never closed" were
re-verified against master @ 1e78b15 by three helper agents (spot-checked), then each got a
comment with the fixing commit + current `file:line` citations and `status: untested`. **Nothing
was closed.** #282/#281 already had the label and were not touched. Surfaced on the way: #176
was fixed under #267, #154 under #228, #159 by 28c8a46 as a side effect, #156's standing comment
is stale (lock landed 25 min later in 8d77c6e), #240's code is done but its own close gate (the
6-step OpusClip run) was never executed.

**#332 root-caused, no code change:** the ~120 MB GPU process in streaming mode is Chromium's.
Bare Electron with zero windows keeps it at ~90 MB indefinitely; killing it by pid respawns it in
2 s. Findings on #332, the #329 measurement table amended by comment. Left open for Fega to close.

jest 240 green (235 + 5), renderer builds, dev profile restored (settings from the pristine
backup: watchFolder/projectsRoot back on W:, tokens `{}`), no electron left running.

## Key Decisions

- **#287 backfill is one-shot and general**: every gamesDb entry without a key gets the starter,
  once, behind `ytDescriptionsBackfilled`. Not restricted to content entries and deliberately
  NOT idempotent-by-condition — after it runs, a missing key means the user pressed Del, and the
  Add path is how it comes back. It runs after both `runStoreMigrations` (the #262 reset) and
  `migrateStoreData` (the JC injection), so both injection paths are covered. On this desktop it
  is a no-op (11 keys / 11 entries); on the laptop and fresh installs JC gets its starter.
- **The starter template lives in `src/shared/` (CJS)** now, like `captionResolve`; the renderer
  file under `src/renderer/utils/` is gone (two importers repointed). `src/shared/**` is already
  in `build.files`.
- **#155 re-derives the Page token** rather than only refreshing the user token: the stored
  `expiresAt` is the user token's 60-day life and the Page token is derived from it. `updateTokens`
  grew an optional `{ pageAccessToken }`; `fetchPages` is exported from `meta.js`.
- **#157 (dead Transcript Download button) was NOT wired** — the issue says Fega picks .txt vs
  .srt first. #105 (over-trim auto-remove, Option A already approved in s83) was left for a
  session with more room; it is the best next "clear fix" candidate.
- **#332 options rejected**: `--disable-gpu`/`--in-process-gpu` (launch-time, process-global),
  kill-on-demand (respawns; counts toward Chromium's GPU-crash budget; Sentry would log it),
  `app.relaunch()` headless (design change, needs a plan).

## Next Steps

1. **Desktop is on alpha.24 and migrated — measure everything under `%APPDATA%\Corva` from now
   on** (`Corva\data\clipflow.db`, `Corva\logs\app.log`, `Corva\clipflow-settings.json`). The
   `clipflow-dev` profile is unchanged. `Corva.stray-2026-09-04T23-54-02-001Z` is the parked
   harness shell (a `logs/main.log` and Chromium caches) — safe to delete by hand whenever.
2. Laptop: update to alpha.24 → its `app.log` should show the #288 `migrated` line AND
   `#287 starter YouTube description added for 1 library entry that had none: Just Chatting`.
   Then the s236 checks (engine 1.1.0 + models + `median4`, the #362 full-pass time).
3. The ten other alpha.24 fixes stay `status: untested` until Fega meets them in use
   (#289 #303 #304 #307 #323 #361 #287 #162 #150 #155).
4. Next autonomous candidates, in order: #105 (Option A approved), #127 (serif `i` glyph → SVG),
   #114 (preview vs editor line-break divergence — segmentation, tread carefully), chores #179 /
   #149 / #121. Needs Fega first: #157 format, #165 zoom cap, #254 / #342 / #340 / #277.

## Watch Out For

- **`scripts/dev/` is new**: `cdp.js "<expr>"` evaluates in the main window over CDP 9222
  (Node 24, no deps), `cdp-shot.js out.png` screenshots it, `hunks.js <file> '#N'` prints the
  hunks of a shared file that mention an issue for `git apply --cached`. They used to be retyped
  every session from a lost scratchpad.
- Bash-tool quoting bit twice (see memory `feedback_bash_backslash_collapse`, s238 note): an
  apostrophe inside `node -e '…'`, and a heredoc followed by `'$(cygpath …)'` on the same
  command. Payloads with apostrophes go through the Write tool. `main.js`, `main.js`-adjacent
  files are CRLF in the working tree — node patch scripts must detect the EOL before anchoring.
- The Edit tool needs a Read-tool read of the file first; `sed`/`cat` reads do not count.
- The What's New modal ("Got it") is up on every dev boot now; synthetic CDP clicks pass through
  it, but dismiss it before a screenshot.
- `git commit` after `git rm` — do not re-`git add` the deleted path (pathspec error aborts the
  chain; the deletion is already staged).

## Logs/Debugging

- #287: `(system) #287 starter YouTube description added for N library entries that had none: …`
  — only when N > 0; the flag is set silently otherwise. Store keys: `ytDescriptions`,
  `ytDescriptionsBackfilled`. Module `src/main/yt-description-backfill.js`, tests
  `src/main/__tests__/ytDescriptionBackfill.test.js`.
- #150: `fs:renameFile` → `{ error: "File is in use (still recording, or open in a player or the
  editor?) — close it and try again.", locked: true }`. Lock a file for testing with
  `[System.IO.File]::Open(path, 'Open', 'Read', 'None')` in a background PowerShell.
- #155: `(facebook) Token expired, refreshing` then either `Starting publish` or a publish-log
  `failed` row with `apiResponse` = the refresh or `/me/accounts` reply.
- #162: nothing logged; the proof is the dropdown label after Ctrl+Z.
- Dev boot with CDP: `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222
  --disable-features=CalculateNativeWinOcclusion` (background), wait for
  `curl -s 127.0.0.1:9222/json | grep index.html`, then `node scripts/dev/cdp.js "<expr>"`.
  Editor fixture that is safe to mutate: copy
  `W:\…\Vertical Recordings Onwards\.clipflow\projects\proj_1785192672631_n1tazq` (3 clips, all
  rejected, 1 MB; source mp4 stays on W:) into `<scratch>/projects/.clipflow/projects/` and point
  dev `projectsRoot` there. Restore the settings backup after the kill.
- jest: `npx jest` (240).
