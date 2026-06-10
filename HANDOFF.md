# ClipFlow — Session Handoff
_Last updated: 2026-06-10 — Session 79 — **Shipped the APPROVED TikTok audit Round 2 UI fixes, then did a Queue-card quality pass Fega asked for, plus a publish-status polish. Cut three installers ending on `0.1.8-alpha.2`.** The TikTok resubmission's code side is now DONE; what's left for the audit is Fega's non-code steps (portal Org rename, re-shoot Video 2/3, resubmit) recorded against this build._

---

## One-line TL;DR
Coded the parked TikTok Round-2 plan (A9 notice visible during processing + Music-Usage-above-Commercial-Disclosure reorder; A8 capacity message turned out already-built in `main.js`, no code). Then, after Fega installed it and flagged the card, did a Queue-tab legibility/affordance pass (wider, brighter labels, caption-as-field, uppercase tag, LOCKED alignment) and a publish-status "Processing…" fix. Version walked `0.1.7-alpha → 0.1.8-alpha → 0.1.9-alpha → (renamed) 0.1.8-alpha.1 → 0.1.8-alpha.2`. No schema change (still v4).

## Current State
Healthy on **0.1.8-alpha.2**, schema **v4** (unchanged, no migrations). Installed daily driver: Fega should be on `0.1.8-alpha.2` after the last install (confirm Settings → bottom). 6 commits pushed this session (`815433a` TikTok fixes, `aa3f860` 0.1.8 bump, `29a83a1` Queue polish, `ad72a18` 0.1.9 bump, `c42547c` re-version to 0.1.8-alpha.1, `762fc09` publish-status fix + 0.1.8-alpha.2) plus this wrap. Working tree has ONLY runtime churn (`data/clipflow.db`, `data/game_profiles.json`) + an untracked `tasks/mocks/` scratch dir — never commit those. **Code backlog: 30 open** (unchanged this session; 12 launch-ops parked/hidden).

## What Was Just Built
1. **TikTok audit Round 2 UI fixes** (`815433a`, all renderer-only in `QueueView.js`):
   - **A9 / Point 5d (the denial blocker):** the "may take a few minutes" notice was gated on the TikTok row reaching `"done"` (only after the poll completes) so it was invisible during the "Processing on TikTok…" window the reviewer watches. Now triggers on status `publishing` OR `done` (a `tiktokAccepted` flag) and renders as a prominent `InfoBanner` (was a tiny grey italic line).
   - **Panel reorder (Point 1→5):** Music Usage Confirmation now renders ABOVE Commercial Disclosure.
   - **A8 capacity = NO CODE.** `translateTiktokPublishError` (`main.js:2510`) already maps TikTok's over-limit/rate-limit error family → "reached its posting limit — try again later," and the publish path already surfaces it. The Round-2 plan's "A8 unbuilt" assumption was stale.
2. **Queue-card quality pass** (`29a83a1`, renderer-only) after Fega's feedback on the live card:
   - **Width:** Queue tab `maxWidth 860 → 1120` (Queue only — `App.js:556`); other tabs untouched.
   - **Legibility:** card + TikTok-panel labels bumped 10→11–13px and from `textTertiary` (0.32) to a new **`labelStrong` (0.68)** theme token; bigger title/meta.
   - **Caption:** now a bordered, tinted, obviously-editable field with an "✎ Edit" affordance + CAPTION/DESCRIPTION label, **moved above** the TikTok options (was faint borderless text buried at the bottom). "Reset to template" unchanged (shows once a custom caption exists).
   - **Tag:** renders UPPERCASE in Queue (display-only `.toUpperCase()` at the 4 badge sites) to match Rename/Recordings.
   - **(LOCKED):** lock icon + "LOCKED" now share the toggle label's midline (was top-aligned/floating). Rebuilt `TiktokInteractionToggle`.
3. **Publish-status "Processing…" fix** (`762fc09`): the per-platform status echoed raw upload progress ("Uploading chunk 1/8 … 8/8") before "Processing on TikTok…". Now shows a clean static **"Processing…"** the whole publishing window (`QueueView.js` ~1666). Applies to ALL platforms, not just TikTok (Fega was told; he was OK / can ask for TikTok-only). `publishProgress` IPC subscription retained but no longer drives the label.

## Key Decisions
- **Version = `0.1.8-alpha.2`, NOT `0.1.9`.** Fega wanted the Queue polish treated as a patch on the 0.1.8-alpha audit build, not a new minor. He said "0.1.8.1"; that's not valid semver (4 numeric parts) and would break electron-builder + drop the `-alpha` track, so we used **`0.1.8-alpha.1`** (then `.2`) — the valid-semver equivalent. The stray `0.1.9-alpha` installer was deleted from `dist/`; the superseded `0.1.8-alpha.1` installer was LEFT (lower version, older mtime → notifier ignores it; harmless).
- **A8 left as-is.** The daily-cap code `spam_risk_too_many_posts` currently hits the spam-framed branch ("temporarily blocked… try again later") rather than the capacity branch — both are compliant ("try again later"), so not re-litigated. If you want the cleaner capacity wording, add `too_many_posts` to the capacity substring list at `main.js:2515`.
- **Caption move is asymmetric:** for TikTok the caption sits above the options panel; for YouTube it stays after Title/Privacy (so YT keeps title-first). Done by ordering the caption body before the `pk === "tiktok"` block.
- **Width change scoped to Queue only** (Fega's call) — the global 860px wrapper still applies to every other tab.

## Next Steps (prioritized)
0. **Awaiting Fega's in-app confirm on `0.1.8-alpha.2`** — the Queue card (legibility, LOCKED alignment, caption-as-field, uppercase tag) and the "Processing…" status during a real publish. If good, the TikTok resubmission **code side is fully done**; remaining work is **Fega's non-code steps**: rename portal Org → match App Name (ClipFlow), re-shoot **Video 2** (reordered panel) + **Video 3** (must show the 5d "few minutes" notice during processing), resubmit. Tracked in `Wick/tiktok-reapply-checklist.html`. Spec: `tasks/specs/tiktok-content-posting-audit.md` (ROUND 2 section).
1. **#137** — timeline subtitle split passes timeline time into `splitSegment`'s source-absolute lookup → wrong split point on generated clips. (Warm from session 77.)
2. **#138** — AA (ALL CAPS) toggle updates panel `text` but not `words[]`. Fix in `updateSegmentText`.
3. **#135** caption-box corner handles · **#99** caption styling bleeds across clips · **#105** over-trim sliver · **#68→#62** pipeline pair (needs a silent screen-recording from Fega).

## Watch Out For
- **`data/clipflow.db` + `data/game_profiles.json` are always dirty (runtime churn) — never commit them.** Stage files explicitly; never `git add -A`/`git add .`. `tasks/mocks/` is also untracked scratch — leave it or delete it, don't commit.
- **`package.json` line 3 is the single source of truth for the app version.** Renderer reads it via `app.getVersion()` (Settings → bottom). Current pre-release format is `0.1.8-alpha.N` — bump the `.N` for further patches, keep `-alpha`.
- **To promote source fixes to Fega's daily driver you MUST cut a new installer** (`npm run build` → `dist/`) AND he must run it — `npm start` from source is a backup only. Use the `clipflow-update-launcher` skill. Note: `npm start` prod uses `<repo>/data` for the DB, so it WON'T show Fega's real clips — he must test on the installed exe.
- **`labelStrong` (0.68) is a new theme token** in `theme.js` — use it for section labels going forward instead of `textTertiary` (0.32) for anything readable.
- **`publishProgress` state is now set-but-not-displayed** (the label is static "Processing…"). Left intentionally as IPC infra for a possible future progress bar — not dead in the "delete me" sense.
- (Carried) segment time-ownership is half-open `[startSec, endSec)`; `words[]` must always cover `text` (#138 is the open AA variant).

## Logs / Debugging
- **Build:** `npm run build` = `vite build` + `electron-builder`. Renderer ~10–12s; full installer a few minutes. The `>500 kB chunk` Vite warning + electron-builder's "author is missed" / "@electron/rebuild not required" notices are benign — ignore.
- **`npm run build:renderer`** alone is the fast compile check (catches JSX/syntax) without packaging — used it this session to validate the Queue edits before cutting installers.
- **No test runner** (jest/vitest absent). Verify pure-function changes with `node -e`.
- **Renderer changes need a rebuild before `npm start`** — `npm start` loads from `build/`.
- **Prod log:** `%APPDATA%\clipflow\logs\app.log` (electron-log). TikTok publish logs scope to `tiktok`; init/poll errors carry the TikTok error code + `log_id`, then get run through `translateTiktokPublishError` before reaching the renderer as `{ error }`.
- **TikTok publish flow** (`src/main/oauth/tiktok-publish.js`): `publishVideo` → creator_info → init → `uploadVideoChunks` (emits "Uploading chunk X/Y" — now hidden in UI) → `pollPublishStatus` (10s interval, 30 max ≈ 5 min) → done. Over-limit surfaces as an init throw (`spam_risk_*` / `rate_limit_exceeded`) or a poll `FAILED` `fail_reason`.
- **Update notifier** (`main.js` ~2937 `update:check`) scans `dist/` for newest-by-mtime `ClipFlow Setup *.exe`; banner shows when its filename version ≠ running version.
- **Issue hygiene:** reference issues in commits as `(#N)`, NOT `Fix #N` (auto-closes on push before verification). Close via `gh issue close --reason completed --comment …`.
