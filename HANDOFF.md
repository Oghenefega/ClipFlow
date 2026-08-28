# HANDOFF — Session 215 (2026-08-28)

## Current State

**Session 2 of the approved 8-request plan is done and shipped: `0.4.0-alpha.9` is live on the
update feed.** The Queue tab redesign (#325 platform colour identity + text hierarchy, #324
Captions & Descriptions as a game-scoped right-side panel) was mocked, approved, built, verified
and closed `status: untested`. The installer promotes five changes in one hop — the two Queue
issues plus session 214's #330/#327/#326, which had never reached a build.

**Fega has NOT yet installed or tested alpha.9.** Both issues stay `status: untested` until he
confirms.

**Still outstanding from session 214, and Fega still has not responded to it:** the two GTA 6
clips the dev profile auto-published for real at ~1:15 AM on 08-28 are **partially published** —
Facebook/TikTok/Instagram went out, YouTube failed on an expired token. They need a YouTube
reconnect in Settings then Retry from the Queue. Their tracker entries landed in the DEV store,
so the prod Tracker will not show them unless a prod-side retry completes them.

## Key Decisions

1. **Captions option A — TikTok/IG/FB templates stay global.** The panel labels them
   `GLOBAL · ALL GAMES` instead of implying per-game ownership. `#{gametitle}` already varies the
   hashtag per clip, so posts differ per game without turning 3 templates into 12. Option B
   (per-game with fallback) is a storage change + migration overlapping #290/#287/#291 — file it
   as its own issue if a game ever genuinely needs a different TikTok caption. Fega chose A.
2. **Brand colours are tuned for the dark theme, not copied literally.** TikTok's brand black is
   invisible on `#0a0b10`, so its cyan `#25f4ee` carries the identity; Facebook's blue is lifted
   for text while the edge keeps the true `#1877f2`. All four live in
   `src/renderer/styles/platformBrand.js`, shared by QueueView and CaptionsView so they cannot
   drift. **Flagged to Fega as my call, not his** — if the cyan reads wrong beside the real
   TikTok icon, the fallback is their red `#fe2c55`.
3. **The panel's description and tag blocks are height-capped with a fade** — Fega's games carry
   20+ tags, and uncapped they pushed the platform templates below the fold, which is the exact
   scrolling #324 exists to end. Also flagged as my call; the alternative is uncapped + scroll.
4. **Queue tab max width 1120 → 1520** (App.js) to hold the second column. At a 1280-wide window
   the split measures 798 + 372 with no horizontal scrolling — verified, not assumed.

## Next Steps

1. **Fega installs alpha.9 and tests the Queue tab.** Relaunch → "Update available — 0.4.0-alpha.9"
   → Install. Then flip #325/#324 off `status: untested` once he confirms.
2. **Watch for the What's New screen on that first launch.** #330 shipped in alpha.8 but its notes
   entry was still `"unreleased"`, so it had nothing to show. This cut renames it — alpha.9 is
   #330's first real-world proof. If the screen does not appear, that is the bug to chase.
3. **Fega's call on the two half-published GTA clips** (keep or delete), then reconnect YouTube and
   Retry to finish their YouTube legs.
4. **Remaining plan sessions, in order:** #331 (settings), #328 (themes), #329 (publish mode —
   already decided as option (b), main-process scheduler; formally amends "Close = quit").

## Watch Out For

- **`src/main/release-notes.js` has NO `"unreleased"` entry any more** — this cut consumed it. The
  next batch must CREATE one, or the following update ships silent again. (The skill's step 2
  covers renaming an existing entry; it does not remind you to open a new one.)
- **The dev tokens file no longer reads literally `{}`** — the app normalised it to
  `{"accounts":{}}`. That is still empty and still safe. Check for an empty `accounts` map before
  any dev boot, not the literal string, or you will misread a normalised file as a re-seed.
- **Scratch-fixture recipe for anything Queue-adjacent** (cost 3 reboots to find): copying real
  `project.json` files in is NOT enough. QueueView's `approved` filter knocks clips out **by id AND
  by title** against `trackerData`, and `allClips` only keeps `renderStatus === "rendered"`. A
  fixture built from published clips loads (the Published shelf fills) while Unscheduled stays 0.
  Rewrite both `id` and `title`, null `scheduledAt`, keep `status: approved`. Per-platform caption
  blocks also need `platforms[].connected === true`, so a token-less dev profile shows "All
  platforms disabled" — seed 4 stub accounts in dev settings (they grant no tokens, so publishing
  still cannot succeed) and restore the settings file afterwards.
- **QueueView's left column was wrapped, not re-indented.** The grid wrapper opens just before the
  Stats bar and closes at `{/* /left column */}` before `<CaptionsView>`; everything between keeps
  its original indentation on purpose, to keep the diff surgical. Don't "fix" the indentation — it
  would bury the next real diff in that file under 1000 whitespace lines.
- **`scopeGame` resolves through `resolveYtGameKey`**, the same lookup the publish path uses. If
  that resolver is ever changed, the panel and the published description move together — which is
  the point. Don't give the panel its own game lookup.

## Logs/Debugging

- **CDP driver** (reusable, no `ws` dependency — Node 24's global WebSocket):
  `<scratchpad>/cdp.mjs`. Usage: `node cdp.mjs <file-with-js-expr> [--shot out.png] [--w 1280] [--h 860]`.
  It sets `Emulation.setDeviceMetricsOverride` first, so every probe measures at Fega's small-window
  size by default. Probe scripts `p1.js`–`p16.js` beside it; `p12`/`p14` are the scope-swap and
  pin/back tests.
- **Boot line:** `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion`.
  Kill with `taskkill //F //IM electron.exe`, never TaskStop, or CDP attaches to a zombie on 9222.
- **The Browser-pane screenshot tool times out when the pane is not displayed** ("not compositing
  frames"). CDP `Page.captureScreenshot` works regardless — that is what the `--shot` flag uses.
- Proof screenshots from this session: `shot-eo.png` (EO scoped, all four brand blocks),
  `shot-rl.png` (RL scoped, capped tags, platform templates visible without scrolling).
- Dev settings backup from the fixture work: `%APPDATA%\clipflow-dev\clipflow-settings.backup-s215.json`.
  The live file was restored from it — projectsRoot back on `W:\...\Vertical Recordings Onwards`,
  `platforms: []`, the probe's test edit to Rocket League's `ytTitle` reverted.
