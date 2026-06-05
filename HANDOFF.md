# ClipFlow — Session Handoff
_Last updated: 2026-06-05 — Session 57 — Fixed the live Sentry `toFixed` editor crash (Number()-coerce subtitle timestamps at the shared choke point), cut + built the **0.1.6-alpha** installer, and filed #112 / #113 / evidence on #64. Started from a Sentry triage ("broken codes" emails)._

---

## One-line TL;DR

The editor crashed (`TypeError: x.toFixed is not a function` in `initSegments`) on clips whose subtitle `startSec` was persisted as a **string** ("5.2") instead of a number — `"5.2" + offset` string-concatenates, then a debug `.toFixed()` throws. Fixed by wrapping segment + word timestamps in `Number()` at the single `primaryRaw` choke point all five subtitle sources pass through (`useSubtitleStore.js`). Verified with a synthetic repro + build, shipped in `0.1.6-alpha`. The trim/preview thing Fega hit afterward is a **separate, pre-existing** bug (preview plays deleted footage) — filed #113, not fixed.

## Current State

Renderer builds clean (`npm run build:renderer`, ~9s, only the pre-existing #73 chunk-size warning). **Installer built:** `dist\ClipFlow Setup 0.1.6-alpha.exe` (112.6 MB, 2026-06-05). Fega has NOT yet run it — his daily installed app is still on `0.1.5-alpha` until he double-clicks the new installer (data in `%APPDATA%\clipflow` is preserved). Commits this session: `7db536d` (toFixed fix + changelog), `23d2fc1` (version bump). Working tree otherwise clean except the usual runtime churn (`data/clipflow.db`, `data/game_profiles.json` — NOT committed). The source-run dev app I launched for verification was **killed** before packaging (electron-builder locks the electron binary).

## What Was Built / Done (session 57)

- **Fix `toFixed` crash — commit `7db536d`:** In `initSegments` ([useSubtitleStore.js:457](src/renderer/editor/stores/useSubtitleStore.js:457)), the shared `primaryRaw` map now coerces `start`/`end` (segments) and `start`/`end` (words) with `Number(...)`. This is the single point all five source branches (editor-saved, clip.transcription, pipeline sub1, legacy array, project.transcription) converge through, so one change protects every one. `Number("5.2") === 5.2`; `Number(5.2)` is an identity no-op for healthy clips. **Self-healing:** the next Save rewrites clean numeric timestamps to disk. Builds on the session-55 fix (which switched the editor-saved branch from display-string `start`/`end` to numeric `startSec`/`endSec`); this hardens the case where `startSec` *itself* is a string.
- **Released `0.1.6-alpha`** — commit `23d2fc1` bumped `package.json`; `npm run build` produced the installer. Bundles sessions 55–57 of unreleased work.
- **Regression discipline:** before writing the fix, ran a read-only multi-agent trace (writers / consumers / on-disk data / fix-location / adversarial critic). Findings: no current writer produces strings (so the bad data is legacy), no string `startSec` in the 3 sampled `project.json` files (self-healed since the June 2–5 crashes), and the consumer agent's two "HIGH-risk" flags were both **false** (PreviewOverlays key is dead code; render.js path is out of scope). Critic verdict: `safe-with-mitigations`, all folded in.
- **Filed #112** — EPIPE "broken pipe" crashes (fatal, unhandled) from FFmpeg/Whisper child-process stdio. ~199 lifetime events, dormant since 2026-05-16. Hypothesis: unhandled `'error'` on a child stdio stream when a render/transcribe is cancelled or the child dies. Fix direction: add `'error'` handlers / use `spawn` streaming.
- **Filed #113** — Projects preview plays deleted footage after a clip trim (preview video reads stale `clip.startTime`/`endTime`, never `nleSegments`; the async recut `_concatRecutAfterDelete` that would refresh them didn't run). **Exports are unaffected** (render.js honors nleSegments). Fega chose: track for later, fold the full fix into #110.
- **Added concrete evidence to #64** (waveform) — the real cause is `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` (ffmpeg stdout exceeds Node's exec `maxBuffer`), triggered on a 72170 Hz mono PCM stream. Likely same child-stdio family as #112.

## Key Decisions

- **Fix at `primaryRaw`, NOT the per-branch edited-subs normalization.** The adversarial critic showed a per-branch fix leaves 4 of 5 source branches exposed. `primaryRaw` is the convergence point — coercing there is fewer lines AND complete.
- **No data migration.** The save round-trip self-heals each polluted clip on first open+save; a batch migration is unwarranted (and the migration code already filters non-numeric `startSec`).
- **Did NOT harden the debug logs (lines 574/576) with try/catch.** Once `primaryRaw` is numeric, `.toFixed` can't throw; a try/catch would only mask future pollution.
- **#113 is a stopgap-vs-#110 decision.** Preview-honors-trim is really the job of the planned #110 preview/editor unification; options 1/2 in the issue are stopgaps if a quick win is wanted sooner. Fega deferred.

## Next Steps (prioritized)

1. **Fega installs `0.1.6-alpha`** (double-click `dist\ClipFlow Setup 0.1.6-alpha.exe`) to get the crash fix into the daily app, then kick the tires. The `toFixed` Sentry issues should stop recurring once he's on this build.
2. **#110 Step 1 + 2** — the still-planned full shared subtitle resolver (`tasks/todo.md` has the file:line plan). Now also the natural home for #113's full fix (preview honoring `nleSegments`).
3. **#113** — if a quick win is wanted before #110, option 1 (derive preview play-bounds + subtitle origin from `nleSegments[0].sourceStart`) covers leading/trailing trims; needs careful coordinate handling.
4. **#112 / #64** — child-process stdio robustness (shared root: unhandled stream errors / maxBuffer). Could be knocked out together.
5. Backlog: #108 (dead audioSegments), #40 (Phase 4 hygiene), #57 (re-render storm).

## Watch Out For

- **`0.1.6-alpha` is built but NOT installed.** Don't tell Fega the fix is "in his app" until he runs the installer. The daily driver is the installed exe, not `npm start`.
- **Coordinate domains remain the recurring footgun.** `editSegments` `startSec`/`endSec`/`words[].start` = SOURCE-absolute; preview `currentTime` = clip-relative; caption `captionSegments` = TIMELINE time. Editor-saved `sub1` carries BOTH a display-STRING `start`/`end` AND numeric `startSec`/`endSec` — always read the numeric ones (and now they're `Number()`-coerced at `primaryRaw`).
- **`clip.startTime`/`endTime` go stale after a trim** — only `_concatRecutAfterDelete` (audio ripple-delete path, async FFmpeg) refreshes them. Anything reading them for a trimmed clip may be wrong (this is the #113 root cause). Before "fixing" by always persisting them on save (#113 option 2), AUDIT other readers — render fallback, extend-coverage re-derivation, thumbnails may assume they mean ORIGINAL recorded bounds.
- **Packaging locks the electron binary** — kill any `npm start` / `npm run dev` ClipFlow electron (path-filtered, NOT the unrelated `D:\OpenDesign` electron processes also running on this machine) before `npm run build`, or electron-builder fails on EBUSY.
- **Don't commit `data/clipflow.db` / `data/game_profiles.json`** (runtime churn). Stage source files explicitly.

## Logs / Debugging

- **Build:** `npm run build:renderer` (~9s) for renderer only; `npm run build` for the full installer → `dist\ClipFlow Setup <ver>.exe`. Renderer loads from `build/` (`isDev=false`).
- **Synthetic crash repro (this session):** a tiny standalone node script replicating the exact expressions (`{start: s.startSec} → s.start + offset → .toFixed`) proved a string `startSec` crashes the OLD code and passes the NEW. Faithful to the failing line without needing a polluted clip. (Temp file, deleted after.) Reuse this pattern to prove data-shape fixes without a live repro.
- **Sentry query:** `curl -H "Authorization: Bearer $(cat C:\Users\IAmAbsolute\.claude\sentry_token.txt)" "https://sentry.io/api/0/projects/flowve/clipflow/issues/?query=is:unresolved&sort=freq&limit=15"`. Latest event: `.../issues/<id>/events/latest/`. Breadcrumbs include the `[initSegments] source=…` line — that tells you which of the 5 sources a crashing clip resolved from (all 3 toFixed events were `source=clip-subtitles-edited`).
- **Running-app log (npm start):** main-process logs go to the terminal; renderer `console.log` (e.g. `[initSegments] …`) goes to DevTools (`CLIPFLOW_DEVTOOLS=1 npm start`). The waveform `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` (#64) is visible in the main-process terminal log.
- **Preview subtitle path:** `ProjectsView.js` → `resolvePreviewSegments(clip, project, {subtitle})` → `buildPreviewSegments` → `SubtitleOverlay` → `findActiveWord`. The preview `<video>` uses `clip.startTime`/`endTime` only (ignores `nleSegments`) — see #113.
- **Clip data on disk:** `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\.clipflow\projects\<projectId>\project.json`. Each clip: `subtitles.sub1` (+ `_format:"source-absolute"` if editor-saved), `transcription`, `nleSegments`, `captionSegments`, styles. Sampled 3 projects this session — all `startSec` values numeric (self-healed).
