# ClipFlow — Session Handoff
_Last updated: 2026-06-11 — Session 80 — **Fixed the stale-publish-failure bug (re-queued clips no longer wear old "Failed" markers), confirmed working by Fega, and cut `0.1.8-alpha.3`. Diagnosed two TikTok publish errors as NON-bugs (old-build chunk math + a TikTok-side transient). Filed + planned the Queue nav-badge overcount (#139) for next session — not implemented.**_

---

## One-line TL;DR
Re-queuing a clip from the editor used to redraw the previous session's red "Failed" markers + PUBLISH RESULTS error on the fresh card, because the saved `publishState` was never cleared. Now the editor's Queue action clears it and the Queue card reconciles live. Shipped on `0.1.8-alpha.3`; Fega confirmed in-app. The two scary-looking TikTok errors he hit this session were not ClipFlow bugs (stale old-build failures + a TikTok `internal_error`). The Queue nav badge showing "10 queued" when only 1 is queued (#139) is real but **deferred to next session** — fully planned in `tasks/todo.md`.

## Current State
Healthy on **0.1.8-alpha.3**, schema **v4** (unchanged, no migrations). Fega reinstalled and **confirmed the stale-marker fix works** (re-queued "Water Treatment" came up clean as "Queued"). 3 commits pushed this session (`1c2897a` fix, `d49a9a5` version bump + installer, `0bff02d` plan for #139). Working tree has ONLY runtime churn (`data/clipflow.db`, `data/game_profiles.json`) + untracked `tasks/mocks/` scratch — never commit those. **Code backlog: 31 open** (was 30; +#139 filed this session; 12 launch-ops parked/hidden).

## What Was Just Built
1. **Stale publish-failure fix** (`1c2897a`, renderer-only, schema unchanged):
   - **`EditorLayout.js` `doRender`:** when adding to queue, now writes `publishState: {}` alongside `status: "approved"`. A re-rendered file has never been published, so it starts with a clean publish slate. (Was: re-queue re-rendered the file but left the old per-platform failure record intact, so the Queue tab re-hydrated it.)
   - **`QueueView.js` hydration effect (~562):** rewrote from hydrate-once to **reconcile**. When a clip's persisted `publishState` is empty/cleared, it now also drops any lingering in-memory `publishStatus[clipId]` (the "Failed" badge + results panel), so the card refreshes **without an app restart** — QueueView is always-mounted (`display:none` tabs), so clearing the DB field alone wasn't enough. **Guarded:** never disturbs a clip whose live `state === "publishing"` (both publish paths set that before their loop).
2. **Installer `0.1.8-alpha.3`** (`d49a9a5`) — promotes the fix to the daily driver.
3. **Filed #139 + planned it** (`0bff02d`) — the Queue nav-badge overcount, deferred. Full root cause + exact one-file patch in the issue body AND in `tasks/todo.md` under a **NEXT SESSION** heading.

## Key Decisions
- **#139 badge fix is PLANNED, not built** — Fega explicitly said "make up the plan but don't implement it in this session." Don't pre-empt; pick it up next session.
- **Two TikTok publish errors this session were NOT ClipFlow bugs** (no code written for either):
  - **"The total chunk count is invalid"** (the two red cards in Fega's first screenshots) = the OLD build's `Math.ceil` chunk math. That was already fixed to `Math.floor` in **0.1.5-alpha** (`4a96a9f`, 2026-05-16 03:21). The failing cards were **stale May-16 attempts** (log_ids `20260516…`) from ~90 min BEFORE that fix. Re-queue/retry on the current build publishes fine (proven: "No Weapons" 161.8 MB → `PUBLISH_COMPLETE` 11:56, "Running" 86 MB at 08:57). `calculateChunking` is at `tiktok-publish.js:29` — floor is correct, leave it.
  - **`internal_error` "Something went wrong. Please try again later."** ("Extraction" at 12:03) = a **TikTok-side transient**. Same request shape published "No Weapons" successfully 11 min earlier. Fix = retry. TikTok rate-limits surface as `spam_risk_*` / `rate_limit_exceeded` (different), so it wasn't that.
- **`publishState: {}` is not a schema change** — existing optional field, empty value; the hydration `isEmpty` branch already handles `{}`. No migration.
- **Clearing publishState on re-queue intentionally discards the clip's prior publish history in the card** — correct, since a re-render is a brand-new file that's never been published.

## Next Steps (prioritized)
0. **#139 — Queue nav badge overcount.** Badge (`totalApproved`, `App.js:451-453`) counts every `approved`/unscheduled clip; the list (`QueueView.js:525-536`) additionally excludes already-published clips via the tracker (`scheduledClipIds`/`scheduledTitles` at `:505-506`). Publishing never flips `status` out of `"approved"`, so published clips inflate the badge (10) vs list (1). **Fix:** add the tracker exclusion to `totalApproved` (exact snippet in #139 / `tasks/todo.md`); add `trackerData` to its deps. Then cut `0.1.8-alpha.4`. Single file, no schema change.
1. **#137** — timeline subtitle split passes timeline time into `splitSegment`'s source-absolute lookup → wrong split point on generated clips.
2. **#138** — AA (ALL CAPS) toggle updates panel `text` but not `words[]`. Fix in `updateSegmentText`.
3. **#135** caption-box corner handles · **#99** caption styling bleeds across clips · **#105** over-trim sliver · **#68→#62** pipeline pair (needs a silent screen-recording from Fega).
4. **TikTok resubmission (non-code, Fega's):** code side fully done. Remaining: portal Org rename → match App Name (ClipFlow), re-shoot Video 2 (reordered panel) + Video 3 (must show the 5d "few minutes" notice during processing), resubmit. He is now successfully publishing clips to TikTok privately (Only-me) — good for audit re-recording.

## Watch Out For
- **`data/clipflow.db` + `data/game_profiles.json` are always dirty (runtime churn) — never commit them.** Stage files explicitly; never `git add -A`/`git add .`. `tasks/mocks/` is untracked scratch — leave it.
- **The QueueView hydration effect now has a live-publish guard** (`if (live && live.state === "publishing") …continue`). If you touch that effect, preserve the guard or you'll clobber an in-flight publish's UI. It also now mutates `hydratedPublishRef` inside the `setPublishStatus` updater — fine (Set ops are idempotent), but be aware.
- **#139 root shape:** `totalApproved` (App.js) and the queue list (QueueView) are **two parallel filters for the "same" set** — they drift. Aligning them is the fix; a single shared "actionable count" is the cleaner long-term option (noted in #139).
- **TikTok `internal_error` is transient (their server) — retry, don't "fix" it.** Only escalate if it fails across several spaced retries.
- **`package.json` line 3 is the single source of truth for the version** (`app.getVersion()` → Settings bottom). Current pre-release format `0.1.8-alpha.N` — bump `.N`, keep `-alpha`.
- **To promote source fixes to the daily driver you MUST cut a new installer** (`clipflow-update-launcher`) AND Fega must run it. `npm start` prod uses `<repo>/data`, so it WON'T show his real clips — he must test on the installed exe.

## Logs / Debugging
- **TikTok publish flow** (`src/main/oauth/tiktok-publish.js`): every publish logs `Initializing direct post upload {fileSize, chunkCount, chunkSize}` immediately before the `Init response`. That pair is the smoking gun for any chunk/init error. `chunkCount` for files >64 MB = `Math.floor(fileSize / 10 MB)`; if you ever see `ceil`-shaped counts, the build is stale.
- **Init error codes seen this session:** `invalid_params` "The total chunk count is invalid" (old ceil math), `internal_error` "Something went wrong" (TikTok transient). The TikTok `log_id` timestamp prefix is **UTC** (~+12h vs the local log line, e.g. `20260516135313` UTC = `2026-05-16 01:53` local).
- **Reading the prod log on Windows:** `%APPDATA%\clipflow\logs\app.log`. From the Bash tool, **single-quote** the PowerShell `-Command` so git-bash doesn't eat `$env:APPDATA`, e.g. `powershell -NoProfile -Command '$p = Join-Path $env:APPDATA "clipflow\logs\app.log"; Get-Content $p -Tail 40'`.
- **Build:** `npm run build` = `vite build` + `electron-builder` → `dist/ClipFlow Setup <v>.exe`. The `>500 kB chunk` Vite warning + electron-builder's "author is missed" / "@electron/rebuild not required" notices are benign — ignore. `npm run build:renderer` alone is the fast JSX/syntax check.
- **No test runner** (jest/vitest absent). Verify pure-function changes with `node -e`.
- **Update notifier** (`main.js` ~2937 `update:check`) scans `dist/` for newest-by-mtime `ClipFlow Setup *.exe`; banner shows when its filename version ≠ running version.
- **Issue hygiene:** reference issues in commits as `(#N)`, NOT `Fix #N` (auto-closes on push before verification). Close via `gh issue close --reason completed --comment …`.
