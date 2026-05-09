# ClipFlow — Session Handoff
_Last updated: 2026-05-08 — Session 35 — Dev/Daily profile split + local update notifier + DEV badge + CSP avatar fix_

---

## One-line TL;DR

**Daily-driver is now an installed exe; dev runs from source in an isolated `clipflow-dev` profile; daily can pick up new builds via an in-app update banner.** Three issues filed and resolved (#80, #81 closed; #82 filed for follow-up). One known issue surfaced and parked for later (`isDev` hardcoded false in main.js — separate scope).

---

## What just shipped (session 35)

### Stage 1 — Dev/Daily profile split (#80 closed, commit `ca82ac6`)

`CLIPFLOW_PROFILE` env var redirects userData + DB to `clipflow-dev/` when set to `dev`. Sentry require reordered to load AFTER `app.setPath('userData')` because sentry-electron caches the path at module-load (per [getsentry/sentry-electron#796](https://github.com/getsentry/sentry-electron/issues/796)). DB and game-profiles paths now resolve via `app.isPackaged` so the packaged exe doesn't try to read from a repo-relative path that doesn't exist inside the asar. Fixed two pre-existing bugs that surfaced when first attempting to run the packaged build:

- `<repo>/data/clipflow.db` path was unreachable from inside `app.asar` (`__dirname` resolves into the archive, `data/` was never bundled).
- `src/main/render.js` requires `../renderer/editor/models/timeMapping` and `segmentModel` — those renderer source files weren't in `package.json` `build.files`, so the packaged exe crashed at startup with `MODULE_NOT_FOUND`.

One-time data migration: copied `<repo>/data/clipflow.db` (~176 KB) and `game_profiles.json` (~6 KB) → `%APPDATA%\clipflow\data\` so the packaged daily exe inherits feedback votes, file metadata, custom labels, rename history, and game profiles.

`npm run dev:seed` script ([scripts/seed-dev-profile.js](scripts/seed-dev-profile.js)) copies prod userData + repo `data/` → dev profile. Idempotent (refuses overwrite without `--force`). Skips Chromium cache subdirs and locked files.

### Stage 2 — Bare-bones local update notifier (commits `786292f`, `4c08045`, `fbe3097`)

On launch, daily scans hardcoded `C:\Users\IAmAbsolute\Desktop\ClipFlow\dist` for the newest `ClipFlow Setup *.exe`. If its filename version differs from `app.getVersion()`, an accent-tinted banner appears below the title bar with **Install** / **Later** buttons. Install spawns the NSIS installer detached + quits the app. Later hides the banner for the session. No GitHub Releases, no download (the file is already on disk), no auto-install. The banner is gated to prod profile only — dev gets updates via source edits.

DEV watermark added in commit `4c08045`: orange "DEV" pill in the title bar + window title becomes "ClipFlow [DEV]" when running with `CLIPFLOW_PROFILE=dev`. Differentiates the two windows visually so you don't accidentally make changes in daily thinking it's dev.

Version bumped to **0.1.1-alpha** to mark the first build that contains the update notifier itself.

### CSP avatar allowlist (#81 closed, commit `fbf3a68`)

[index.html](index.html) `img-src` directive previously had no HTTPS sources, so all OAuth-provided platform avatars rendered as broken images. Added a specific allowlist for the seven platform CDN domains. Surfaced that Instagram and TikTok additionally use signed expiring URLs that had already elapsed in the token store; reconnecting those two accounts captures fresh URLs. Filed [#82](https://github.com/Oghenefega/ClipFlow/issues/82) for the durable fix (download avatars to disk at OAuth time, serve via `file:`).

---

## Open action item — install 0.1.1-alpha

`dist/ClipFlow Setup 0.1.1-alpha.exe` was built but you haven't installed it yet. Currently your daily is **0.1.0-alpha** which doesn't have the update notifier or DEV-distinction code. To get those features into daily:

1. Close currently-running daily.
2. Run `dist/ClipFlow Setup 0.1.1-alpha.exe`.
3. Click through SmartScreen ("More info → Run anyway").
4. Launch from Start Menu.

Daily window won't have the DEV badge (correct, it's prod). When you make changes tonight, bump `package.json` version, `npm run build`, and the banner will appear in daily on next launch.

---

## How the dev/daily loop works now

1. **Edit code in dev** — `npm run dev`. Window has orange DEV badge, isolated data in `%APPDATA%\clipflow-dev\`. Vite is technically running on localhost:3000 but is currently unused (see "Watch out for" below). To pick up changes you need to Ctrl+Shift+R or close and reopen the dev window.
2. **Bump `package.json` version** when ready to ship a batch of changes to daily.
3. **`npm run build`** — produces a new installer in `dist/`.
4. **Daily picks it up** — banner appears on next launch. Click Install. Daily quits, installer runs, you relaunch.

If you want changes to flow into the *running* dev window without restart, that requires fixing the `isDev` hardcode (separate work, see Watch out for).

---

## Filed for follow-up

### #82 — Cache OAuth avatars to disk so they don't expire (filed)

Instagram and TikTok return signed CDN URLs with built-in expiry (`oe=` for IG, `x-expires=` for TikTok). The CSP fix in #81 unblocks fresh URLs but doesn't address the underlying expiry problem — over time, those URLs return HTTP 403 again and reconnecting is the only way to fix it. Durable fix: download the avatar at OAuth-connect time to `%APPDATA%\<profile>\avatars\<accountId>.<ext>`, store local path in the token store, render via `file:` (already in CSP allowlist). Per-profile path means dev and daily caches stay isolated.

Not blocking anything immediate; reconnecting fixes it for now.

---

## Pre-launch issue list snapshot

Open issues that didn't move this session.

**Product bugs (in-app, can be done as small wins):**
- [#78](https://github.com/Oghenefega/ClipFlow/issues/78) Saved subtitle edits silently lost on clip reopen — **the big one** flagged session 34
- [#77](https://github.com/Oghenefega/ClipFlow/issues/77) Editor transcript panel highlights wrong segment during playback
- [#66](https://github.com/Oghenefega/ClipFlow/issues/66) Editor transcript panel shows full source audio, not clip range (related to #77/#78)
- [#64](https://github.com/Oghenefega/ClipFlow/issues/64) Waveform extraction silently returns empty
- [#62](https://github.com/Oghenefega/ClipFlow/issues/62) Pipeline fails on clips with silent/near-silent audio
- [#57](https://github.com/Oghenefega/ClipFlow/issues/57) Editor lag on 30min+ source — 60fps re-render storm
- [#37](https://github.com/Oghenefega/ClipFlow/issues/37) Subtitle mismatch regression — awaiting repro
- [#32](https://github.com/Oghenefega/ClipFlow/issues/32) Editor position changes revert to template default on clip reopen (closely related to #78)
- [#10](https://github.com/Oghenefega/ClipFlow/issues/10) Timeline waveform doesn't redraw after segment trim

**Product features / improvements:**
- [#82](https://github.com/Oghenefega/ClipFlow/issues/82) Cache OAuth avatars to disk (filed this session)
- [#74](https://github.com/Oghenefega/ClipFlow/issues/74) Hide pipeline internals from end users (UX hardening for launch)
- [#70](https://github.com/Oghenefega/ClipFlow/issues/70) Rename watcher only detects rigid OBS pattern
- [#69](https://github.com/Oghenefega/ClipFlow/issues/69) User-facing trim toggle in editor
- [#26](https://github.com/Oghenefega/ClipFlow/issues/26) Multiple accounts per platform
- [#15](https://github.com/Oghenefega/ClipFlow/issues/15) Learned game/creator-specific subtitle dictionary
- [#14](https://github.com/Oghenefega/ClipFlow/issues/14) Play Style update card inline editing
- [#13](https://github.com/Oghenefega/ClipFlow/issues/13) User-controlled file naming style
- [#9](https://github.com/Oghenefega/ClipFlow/issues/9) AI Pop "learning your style" affirmation
- [#7](https://github.com/Oghenefega/ClipFlow/issues/7) Search function in projects tab
- [#6](https://github.com/Oghenefega/ClipFlow/issues/6) **Publish/Schedule button within the editor** — closes the gap between "edit" and "publish"
- [#5](https://github.com/Oghenefega/ClipFlow/issues/5) Auto-move clips to approved/published tab after editing
- [#4](https://github.com/Oghenefega/ClipFlow/issues/4) Schedule/Published tab in Projects view
- [#1](https://github.com/Oghenefega/ClipFlow/issues/1) Render and queue from Approved folder

**Pre-launch / infra:**
- [#73](https://github.com/Oghenefega/ClipFlow/issues/73) Cold-start UX — branded splash + bundle code-splitting
- [#54](https://github.com/Oghenefega/ClipFlow/issues/54) electron-builder v24 → v26
- [#51](https://github.com/Oghenefega/ClipFlow/issues/51) Windows code-signing certificate
- [#50](https://github.com/Oghenefega/ClipFlow/issues/50) Auto-updater research (effectively superseded for solo use by Stage 2 local notifier)
- [#43](https://github.com/Oghenefega/ClipFlow/issues/43) Sentry pre-launch backlog (7 deferred items)
- [#23](https://github.com/Oghenefega/ClipFlow/issues/23) LemonSqueezy payments + license keys
- [#22](https://github.com/Oghenefega/ClipFlow/issues/22) Move Anthropic API key server-side
- [#21](https://github.com/Oghenefega/ClipFlow/issues/21) OAuth flows server-side proxy
- [#20](https://github.com/Oghenefega/ClipFlow/issues/20) Supabase backend setup
- [#19](https://github.com/Oghenefega/ClipFlow/issues/19) electron-updater + code signing (also effectively superseded for solo use)
- [#56](https://github.com/Oghenefega/ClipFlow/issues/56) Cloudflare AI Gateway hardening
- [#68](https://github.com/Oghenefega/ClipFlow/issues/68) Move `energy_scorer.py` from hardcoded `D:\whisper\` path
- [#63](https://github.com/Oghenefega/ClipFlow/issues/63) Sandbox offscreen subtitle BrowserWindow

---

## Next steps for next session — candidate priorities

The infrastructure work is done. **You said tonight you wanted to actually start posting clips.** That means the next session's natural focus is:

**Highest-impact path:**
1. **Smoke-test publishing end-to-end** — pick one clip, publish to one platform (start with TikTok or YouTube — both have working OAuth and `*:publish` IPC handlers). Whatever breaks becomes the next issue.
2. **#6 — Publish/Schedule button inside the editor.** This closes the loop. Without it, you have to leave the editor → Queue tab → schedule manually. With it, the post-edit flow is one click.

**Other strong candidates:**
- **#78** — saved subtitle edits silently lost on reopen. The big one from session 34. Needs an architectural call (prefer `clip.subtitles.sub1` over `clip.transcription`, OR clear `subtitles.sub1` on retranscribe). Will likely also subsume #66 and #32.
- **The `isDev` hardcode** — fix it so `npm run dev` actually uses Vite's dev server with HMR. Touches `main.js`, the dev script, and CLAUDE.md. ~30-45 min. Pays off every dev session afterward.

---

## Watch out for

- **`isDev = false` is hardcoded in [main.js:325](src/main/main.js).** `npm run dev` starts Vite on localhost:3000 but the Electron window still loads from `build/index.html`, ignoring the dev server. To see source changes in the dev window you currently must `npm run build:renderer` AND fully restart the Electron window (Ctrl+R is not enough — Chromium caches meta-tag CSP from initial document parse). The "fix CSP and reload" loop in this session's avatar work was 30 minutes of confusion because of this. CLAUDE.md was wrong and was corrected mid-session.
- **Meta-tag CSP changes need a full Electron restart**, not just Ctrl+R. Documented above and in CHANGELOG. If a future CSP edit appears not to work, kill the Electron process before retesting.
- **Daily is on 0.1.0-alpha until you install `dist/ClipFlow Setup 0.1.1-alpha.exe`** — the update banner and DEV badge code aren't in your running daily yet. Install it before testing tonight's tweaks.
- **Update banner only checks at app launch.** No background polling. If you build a new installer while daily is running, you'll need to close + reopen daily for the banner to appear.
- **`<repo>/data/clipflow.db` still exists on disk** — kept it for the source-running prod fallback (`npm start`) to work. Pre-existing architectural smell. Eventually all data should be in userData universally; out of scope for this session.
- **OAuth avatar URL expiry** — Instagram and TikTok will go broken-image again in ~weeks. Reconnect those two accounts as a one-off fix; #82 tracks the durable cache fix.
- **The hardcoded `UPDATE_DIST_DIR` in [main.js](src/main/main.js)** points at the current repo location (`C:\Users\IAmAbsolute\Desktop\ClipFlow\dist`). If you ever move the repo, daily won't see new installers. Replace with a Settings field or env var when this becomes friction.

---

## Logs / debugging

- **App log (prod):** `%APPDATA%\clipflow\logs\app.log`
- **App log (dev):** `%APPDATA%\clipflow-dev\logs\app.log`
- **Pipeline logs:** `processing/logs/<videoName>_<ts>.log`
- **Build artifacts:** `build/index-*.js` is ~1.87 MB minified, ~545 KB gzipped (2728 modules). Pre-existing > 500 kB warning still tracked under #73.
- **Sentry:** environment is now tagged `dev` or `prod` per profile so dashboard can filter.

---

## Session model + cost

- **Model:** Sonnet throughout.
- **Commits this session:** 6 on master (`ca82ac6` profile split, `786292f` update notifier, `4c08045` DEV watermark, `fbe3097` banner gating, `fbf3a68` CSP allowlist, plus the wrap-up commit with this HANDOFF + finalized CHANGELOG).
- **Issues closed:** 2 (#80, #81).
- **Issues filed:** 2 (#80 then closed in-session, #82).
- **Tag candidate after this session:** `git tag stable-2026-05-08-session-35` for instant rollback if tonight's tweaks break daily.
