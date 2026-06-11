# ClipFlow — Session Handoff
_Last updated: 2026-06-11 — Session 81 — **Shipped two Queue fixes on `0.1.8-alpha.5` (badge overcount + list no longer hides hashtag-less clips, both #139) — AWAITING Fega's in-app verification. Planned + filed #140 (cancel an in-progress render) — NOT built, next session. New standing rule: stop cutting an installer per fix — batch ~10 changes.**_

---

## One-line TL;DR
Two related Queue fixes landed this session, both folded into installer **0.1.8-alpha.5** (Fega has NOT reinstalled yet, so both are `status: untested`): (1) the Queue nav badge stopped counting already-published clips, and (2) the Queue list stopped silently hiding clips with no `#hashtag` in the title — the hashtag gate now lives only in the editor's override-able warning. Removing that list filter also made the badge and list the *identical* filter, killing the off-by-one edge case for good. Then Fega asked for a way to cancel a render mid-progress — I traced it (it's a TWO-phase render), wrote a full plan to `tasks/todo.md`, filed **#140**, and STOPPED for approval; he said build it next session. Final standing instruction: **don't cut a new installer after every minor fix — batch ~10 changes or wait for an explicit ask.**

## Current State
Healthy on **0.1.8-alpha.5**, schema unchanged (no migrations this session). `0.1.8-alpha.4` (badge fix only) was cut then superseded by `.5` before Fega installed either — so **the daily-driver install is still on whatever he last ran; he has NOT reinstalled `.5` yet.** Both Queue fixes await his in-app look. 3 commits pushed (`47a9d15`, `c4c503b`, `1e4e2bb`). Working tree at wrap has only the session-end docs (HANDOFF, lessons marker, todo, the update-launcher skill) to commit + the usual runtime churn (`data/clipflow.db`, `data/game_profiles.json`) and untracked `tasks/mocks/` — never commit those. **Code backlog: 33 open** (was 32; +#140 filed this session; 12 launch-ops still parked/hidden).

## What Was Just Built
1. **#139 — Queue nav badge overcount fix** (`47a9d15`, renderer-only, no schema):
   - **`App.js` `totalApproved` (~451):** now builds `trackedIds`/`trackedTitles` Sets from `trackerData` and excludes them — the same publish-tracker exclusion the Queue list already used. Added `trackerData` to the `useMemo` deps. Badge no longer counts already-published clips (was 10 vs list's 1).
2. **#139 follow-up — Queue list stops hiding hashtag-less clips** (`1e4e2bb`, renderer-only, no schema) — the REAL root problem Fega flagged while verifying #1:
   - **`QueueView.js` list filter (~532):** deleted the `&& (!requireHashtagInTitle || hasHashtag(c.title) || !!c.gameTag)` condition. A rendered/approved/unpublished/unscheduled clip now ALWAYS shows in the list. The hashtag gate belongs only to the editor's override-able send-to-queue warning (`EditorLayout.onSendToQueue:418`); the list was wrongly re-applying it and hiding clips Fega had deliberately pushed past that warning.
   - Removed the now-orphaned `hasHashtag` import (`QueueView.js:4`) + `requireHashtagInTitle` prop (`QueueView.js` params + the pass-through at `App.js:586`). The Settings toggle + Editor warning that use `requireHashtagInTitle` are untouched.
   - **Bonus:** with the list's hashtag filter gone, `totalApproved` (badge) and `unscheduledClips` (`QueueView.js:1181`) are now the IDENTICAL filter — the #139 off-by-one edge case is eliminated, not just narrowed.
3. **Installer `0.1.8-alpha.5`** (`1e4e2bb`) — carries both fixes. (`.4` was cut for fix #1 alone, then superseded.)
4. **#140 — Cancel an in-progress render: PLANNED + FILED, NOT built.** Full plan in `tasks/todo.md` ("NEXT — Cancel/Stop an in-progress clip render") and issue #140.

## Key Decisions
- **The list must NEVER hide a queued clip** (Fega, explicit): the editor's hashtag popup is the ONE gate, and it's override-able. A title `#hashtag` is a *different thing* from a clip's game / "Just Chatting" tag — don't conflate them. The old list filter did both; it's gone.
- **#140 cancel is a TWO-phase problem, not "kill FFmpeg."** Traced: the progress bar maps **0–40% → subtitle/caption overlay-frame render** (offscreen `BrowserWindow`, `subtitle-overlay-renderer.js renderOverlayFrames`, frame loop `:246`) and **40–99% → FFmpeg** (`render.js:314` spawn). The 34% in Fega's screenshot is the overlay phase — **no FFmpeg process exists yet.** Cancel must halt whichever phase is live and resolve as `{canceled:true}`, never a red "Failed." Neither `win` nor `proc` is currently reachable from outside (both local; no `render:cancel` IPC). Plan adds module-level handles + `cancelActiveRender()` + a `render:cancel` IPC + preload bridge + a ✕ in the progress pill. 5 files, no schema change.
- **NEW STANDING RULE — stop cutting an installer per fix.** Fega: "don't create a new app version until we've made like 10 upgrades… we're not wasting time updating after every minor update." Default after a fix is now `build:renderer` + commit/push source, then STOP — no bump, no installer — until ~10 changes accumulate OR he explicitly asks. Captured in `tasks/lessons.md`, memory `feedback_batch_versions`, and the `clipflow-update-launcher` skill ("When NOT to cut one"). **`.5` was the last per-fix build.**

## Next Steps (prioritized)
0. **Verify the two shipped Queue fixes** once Fega reinstalls `0.1.8-alpha.5` (Settings bottom should read v0.1.8-alpha.5):
   - Badge on the Queue button == count of clips actually in the "waiting to publish" list.
   - A no-hashtag clip pushed past the editor warning now SHOWS in the Queue list.
   - On confirmation, **close #139** (remove `status: untested`).
1. **Build #140 — cancel an in-progress render.** Full plan + file impact + verification in `tasks/todo.md`. Do NOT cut an installer for it alone (batching rule) — push source, let it ride the next batch.
2. **#137** — timeline subtitle split passes timeline time into `splitSegment`'s source-absolute lookup → wrong split point on generated clips.
3. **#138** — AA (ALL CAPS) toggle updates panel `text` but not `words[]`. Fix in `updateSegmentText`.
4. **#135** caption-box corner handles · **#99** caption styling bleeds across clips · **#105** over-trim sliver · **#68→#62** pipeline pair (needs a silent screen-recording from Fega).
5. **TikTok resubmission (non-code, Fega's):** portal Org rename → match App Name (ClipFlow), re-shoot Video 2 + Video 3, resubmit. Code side done; he's publishing privately (Only-me) fine.

## Watch Out For
- **`data/clipflow.db` + `data/game_profiles.json` are always dirty (runtime churn) — never commit them.** Stage files explicitly; never `git add -A`/`.`. `tasks/mocks/` is untracked scratch — leave it.
- **DON'T cut an installer per fix anymore** (see Key Decisions). Keep fixing + pushing source; only build an installer at ~10 changes or on Fega's explicit ask.
- **#140 cancel — the 34% is the OVERLAY phase, not FFmpeg.** If anyone implements this as "kill the ffmpeg proc," it won't cancel an early render (no proc yet). Must handle the offscreen `BrowserWindow` frame loop too, and destroy that window or it leaks. A user cancel must NOT set `renderStatus:"failed"` — leave the clip unrendered, resolve `{canceled:true}`, delete any partial `.mp4`. Guard `cancelActiveRender()` to no-op on the phase-boundary race.
- **`requireHashtagInTitle` is still LIVE** in the Editor (`EditorLayout.onSendToQueue` warning) and Settings (the toggle). Only its QueueView usage was removed. Don't assume the whole setting is dead.
- **`package.json` line 3 is the single source of truth for the version.** Current `0.1.8-alpha.5`. Bump `.N`, keep `-alpha`.

## Logs / Debugging
- **Render pipeline** (`src/main/render.js`): `renderClip` logs `[Render] Encoder: …` and `[Render] FFmpeg args: …` right before the FFmpeg spawn (`:314`). Progress is `onProgress({stage, pct, detail})` → `"render:progress"` IPC → `EditorLayout` `renderPct`. **pct 0–40 = overlay frames (`subtitle-overlay-renderer.js`), 40–99 = FFmpeg.** A render that never passes ~40% is stuck in the offscreen-window overlay stage, not FFmpeg.
- **Reading the prod log on Windows:** `%APPDATA%\clipflow\logs\app.log`. From Bash, single-quote the PowerShell `-Command`: `powershell -NoProfile -Command '$p = Join-Path $env:APPDATA "clipflow\logs\app.log"; Get-Content $p -Tail 40'`.
- **Build:** `npm run build` = `vite build` + `electron-builder` → `dist/ClipFlow Setup <v>.exe`. The `>500 kB chunk` Vite warning + electron-builder's "author is missed" / "@electron/rebuild not required" notices are benign — ignore. `npm run build:renderer` alone is the fast JSX/syntax check (now the DEFAULT after a fix — see batching rule).
- **No test runner** (jest/vitest absent). Verify pure-function changes with `node -e`.
- **Issue hygiene:** reference issues in commits as `(#N)`, NOT `Fix #N` (auto-closes on push before verification). Close via `gh issue close --reason completed --comment …`. Apply/remove `status: untested` on verification.
