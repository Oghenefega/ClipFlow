# HANDOFF — Session 211 (2026-08-27)

## Current State

**Boot splash shipped and #73 closed.** `bc2184a` — launch now shows the Corva mark (frameless,
transparent, pulsing, click-through) while the main window loads hidden; reveal fires on the new
`app:renderer-ready` IPC (App.js `loaded` flip, i.e. data hydrated → numbers real at first
paint) with a 15s failsafe. Verified over 3 instrumented dev boots (reveal via renderer-ready
every time, ~2s after renderer load). `status: untested` — Fega sees it on the **next installer
cut** (alpha.7, cut in s210, is itself still unverified by him).

**#322 filed** — game-scoped media for the editor's Media tab, decisions locked with Fega
(folder-level game assignment in Settings + per-item override; panel auto-scopes to the clip's
game + universal; "pinning" IS the game attachment, no separate pin-to-top). Spec with full code
map is on the issue. Not started.

## Key Decisions

1. **#73 phases 2/3 (code-splitting, font deferral) deliberately DROPPED, not parked** — they
   conflict with the standing desktop-app rule (no lazy-loading; in-app "Loading…" flashes) and
   the splash now hides the load they aimed to shorten. The remaining pre-splash gap (~2-3s of
   Electron boot + main.js module graph, before whenReady) is different machinery — unchased,
   untracked, per Fega's call. Reopen only if he raises it from daily use.
2. **Reveal condition = hydration committed, not first paint** — the effect on `loaded` in
   App.js fires after every boot setState has committed, which is the whole point (his complaint
   was wrong numbers, not the blank window).
3. **Logo continuity (correction, memory updated):** the mark made under ClipFlow IS the Corva
   mark. Splash uses `build/icon.png` (1024px). `public/icon.svg` is an older *different design*
   (purple tile + bolt), apparently unreferenced — flagged to Fega, left alone.

## Next Steps

1. **Build #322** — Fega has a paste-ready session prompt; spec is on the issue.
2. **s210 batch review still pending** (Fable@xhigh, commit-by-hash: `2564b06`, `686f828`,
   `df0f5ed`, `a0cb39b`, `735c7aa`, `6a0214d`) — carried from the s210 handoff. This session's
   splash commit `bc2184a` joins that queue.
3. **Next installer cut = alpha.8** picks up the splash; Fega then verifies alpha.7's six items
   plus the splash in one pass.

## Watch Out For

- **Reveal diagnostics:** the log line `Main window revealed (renderer-ready|fallback-timer)`
  (system module). `fallback-timer` in a log = hydration hung or the signal never arrived —
  that's a bug report, not cosmetics.
- **`document.visibilityState` is NOT a probe for window visibility** — Electron paints
  initially-hidden windows (`paintWhenInitiallyHidden`), so a hidden window reports "visible".
  Use the reveal log line instead.
- **CDP screenshots of the splash look washed out** — capture composites the transparent page
  with no backdrop, and anything inside the 240ms fade-in is at partial opacity. Probe
  `document.images[0].naturalWidth` (1024 = loaded) instead of judging the pixels.
- **Overlays/banners still pop in after reveal by design** — EngineSetup/Onboarding gate on
  their own async state; update + dependency banners are network-bound. Reveal must never wait
  on network.
- Second-instance during boot is deliberately ignored while the splash is up (the guard in the
  `second-instance` handler) — don't "fix" it into force-showing a half-hydrated window.
- Dev-profile logs: `app.log` is the live file; `main.log` is stale (last wrote Aug 24).

## Logs/Debugging

- **`verify-splash.js`** (session scratchpad): spawns dev electron with CDP 9222, records the
  boot timeline (splash up → renderer up → splash closed), probes the logo element, screenshots
  both windows, kills electron. Needs `ws` from repo node_modules — run with repo as cwd.
- Measured boot (dev, warm): spawn → splash ~4.5s (mostly npx + Electron + module graph),
  renderer target ~0.2s later, reveal ~2s after that. "App started" → reveal = 1.6s in app.log.
