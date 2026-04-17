# ClipFlow — Session Handoff
_Last updated: 2026-04-17 (session 17) — "H1 overlay hardening + H3 main-window sandbox"_

---

## TL;DR

Two of the three remaining pre-launch hardening items shipped. H1 ([#47](https://github.com/Oghenefega/ClipFlow/issues/47), commit **9b3a911**) locks down the offscreen subtitle BrowserWindow — `contextIsolation: true`, `nodeIntegration: false`, dedicated preload exposing only the two deterministic render helpers. H3 ([#49](https://github.com/Oghenefega/ClipFlow/issues/49), commit **d2e24c7**) adds `sandbox: true` to the main BrowserWindow. Only H2 ([#48](https://github.com/Oghenefega/ClipFlow/issues/48), renderer CSP) remains in the hardening arc.

One regression was caught and fixed during the session before commit: the first H1 build didn't explicitly set `sandbox: false` on the overlay window, and Electron ≥20's default of `sandbox: true` stripped `require("path")` from the preload, which crashed silently and made `window.overlayAPI` unavailable — subtitle burn-in produced an all-transparent overlay. Root cause found in the first render test's main-process stdout (`Unable to load preload script: ... Error: module not found: path`). Fix: explicit `sandbox: false` on the overlay window + move `loadFonts()` from module-top into `__initOverlay__` so it runs after the main process injects `__FONTS_PATH__`. Saved as memory `feedback_electron_sandbox_default.md`.

**H1 is closed.** Overlay window has `nodeIntegration: false`, `contextIsolation: true`, `sandbox: false`, and a dedicated preload ([src/main/subtitle-overlay-preload.js](src/main/subtitle-overlay-preload.js)) bridging the two shared CJS utilities via `contextBridge`. Overlay page ([public/subtitle-overlay/overlay-renderer.js](public/subtitle-overlay/overlay-renderer.js)) has zero `require()` calls. Fega verified burn-in on a real clip with 55 subtitle segments — output matches editor preview.

**H3 is closed.** Main window has `sandbox: true`. Main preload was already sandbox-clean — `webUtils.getPathForFile` and `@sentry/electron/preload` are the only non-`ipcRenderer.invoke` APIs, both sandbox-compatible. Fega verified via drop-to-Rename (exercises `webUtils.getPathForFile`) + full main-tab click-through.

**[#63](https://github.com/Oghenefega/ClipFlow/issues/63) filed this session** — tracks flipping the overlay window to `sandbox: true` (requires bundling the shared CJS utils into the overlay build output). Not blocking anything; defense-in-depth parity item.

Current HEAD: **d2e24c7**. Hardening arc is now H2-only.

## 🎯 Next session — pick one (no blocker forces it)

1. **[#48](https://github.com/Oghenefega/ClipFlow/issues/48) H2 — renderer CSP.** Last item in the pre-launch hardening punch list. Nonce-based policy now that Vite has shipped. Needs full enumeration of every `connect-src` endpoint (Anthropic, CF AI Gateway, Sentry, any others) and a walk-every-view verification pass with DevTools open watching for CSP violations. Good standalone session.
2. **[#59](https://github.com/Oghenefega/ClipFlow/issues/59) editor render button without queuing.** Fega surfaced this mid-session 17 — wants a Render button on the editor page that bypasses the queue pipeline. Dedicated small session.
3. **[#62](https://github.com/Oghenefega/ClipFlow/issues/62) pipeline tolerance for silent audio.** Two-part fix spanning [D:\whisper\energy_scorer.py](D:\whisper\energy_scorer.py) and [src/main/ai-pipeline.js](src/main/ai-pipeline.js) `runEnergyScorer`. Required to make the drop-test path usable on silent screen-only recordings. Quick win for testability.
4. **[#61](https://github.com/Oghenefega/ClipFlow/issues/61) recording-date folder bucket + house-cleaning migration.** Parse `YYYY-MM-DD` from OBS filename prefix, plus one-shot migration walking both watch folders to re-bucket misfiled months. The migration is the bigger piece.
5. **[#57](https://github.com/Oghenefega/ClipFlow/issues/57) editor perf on long source.** Proper fix direction is component extraction (`<TimelinePlayhead />` + `<SegmentRow />` memo'd child) per [#57 comment 4267674430](https://github.com/Oghenefega/ClipFlow/issues/57#issuecomment-4267674430). Do **NOT** retry the store-derivation approach.
6. **[#63](https://github.com/Oghenefega/ClipFlow/issues/63) sandbox the overlay window.** Follow-up to H1. Not urgent — overlay is already two-of-three hardened.

If unsure: **#59** is the clean one. Fega asked for it in this session and it's a small self-contained UI change. **#48** is the last hardening domino but needs a committed session window for the verification pass.

## 🚫 DO NOT touch next session (preserved)

- **Do NOT retry the [#57](https://github.com/Oghenefega/ClipFlow/issues/57) store-derivation approach** in any form. Rejected — session 11 broke it twice.
- **Do NOT skip the zoom-slider drag × 10 on a 30-minute source.** Standing go/no-go for any Electron / build-tool / dependency infrastructure change.
- Do NOT touch [#50](https://github.com/Oghenefega/ClipFlow/issues/50), [#56](https://github.com/Oghenefega/ClipFlow/issues/56), or [#51](https://github.com/Oghenefega/ClipFlow/issues/51). All deferred per pre-beta priority framing.
- **chokidar 5.x is off-limits** until Electron bumps its bundled Node to ≥ 20.19.
- **Do NOT re-introduce top-level `new Store(...)` calls.** electron-store is ESM-only now.
- **Do NOT flip `nodeIntegration: true → false` on any BrowserWindow without explicitly deciding `sandbox: true` vs `sandbox: false`.** Electron ≥20 defaults unset sandbox to `true` when `nodeIntegration` is off, which strips `require("path")` and most Node built-ins from the preload. If the preload needs Node APIs beyond `require("electron")`, set `sandbox: false` explicitly. New memory: [feedback_electron_sandbox_default.md](~/.claude/projects/C--Users-IAmAbsolute-Desktop-ClipFlow/memory/feedback_electron_sandbox_default.md).

## 📋 Infrastructure / hardening board state after this session

| Item | Issue | Status |
|---|---|---|
| **C1 Electron upgrade arc** | [#45](https://github.com/Oghenefega/ClipFlow/issues/45) | ✅ closed session 12 |
| **C2 Vite migration** | [#46](https://github.com/Oghenefega/ClipFlow/issues/46) | ✅ closed session 13 |
| **H5 electron-store 8→11** | [#52](https://github.com/Oghenefega/ClipFlow/issues/52) | ✅ closed session 16 |
| **H6 chokidar 3→4** | [#53](https://github.com/Oghenefega/ClipFlow/issues/53) | ✅ closed session 15 |
| **H1 offscreen subtitle harden** | [#47](https://github.com/Oghenefega/ClipFlow/issues/47) | ✅ **closed session 17** |
| **H3 main-window sandbox** | [#49](https://github.com/Oghenefega/ClipFlow/issues/49) | ✅ **closed session 17** |
| **H2 renderer CSP** | [#48](https://github.com/Oghenefega/ClipFlow/issues/48) | 🔲 ready — last hardening item |
| **#63 overlay-window sandbox** | [#63](https://github.com/Oghenefega/ClipFlow/issues/63) | 🔲 **filed this session** (defense-in-depth follow-up) |
| **#57 editor perf on long source** | [#57](https://github.com/Oghenefega/ClipFlow/issues/57) | 🔲 UNRESOLVED — proper fix direction documented, deferred |
| **#59 editor render without queuing** | [#59](https://github.com/Oghenefega/ClipFlow/issues/59) | 🔲 Fega asked mid-session; dedicated session |
| **#61 monthly folder = recording date** | [#61](https://github.com/Oghenefega/ClipFlow/issues/61) | 🔲 ready |
| **#62 pipeline silent-audio tolerance** | [#62](https://github.com/Oghenefega/ClipFlow/issues/62) | 🔲 ready |

## ✅ What was built this session

### Commits

- **9b3a911** — H1 overlay hardening (#47). New `src/main/subtitle-overlay-preload.js` exposing `styleEngine` + `wordFinder` via `contextBridge`. Overlay page drops all three `require()` calls (dynamic module loading + `require("path")` in fonts). Overlay window flipped to `contextIsolation: true` + `nodeIntegration: false` + explicit `sandbox: false`. `__STYLE_ENGINE_PATH__` / `__FIND_ACTIVE_WORD_PATH__` window injections removed. `loadFonts()` deferred into `__initOverlay__`.
- **d2e24c7** — H3 main-window sandbox (#49). One-line `sandbox: true` addition on [src/main/main.js:309-320](src/main/main.js#L309-L320).

### Files touched

- [src/main/subtitle-overlay-preload.js](src/main/subtitle-overlay-preload.js) — **NEW**. 51 lines.
- [src/main/subtitle-overlay-renderer.js](src/main/subtitle-overlay-renderer.js) — webPreferences flipped, path injections removed, preload wired.
- [public/subtitle-overlay/overlay-renderer.js](public/subtitle-overlay/overlay-renderer.js) — three `require()` calls removed; `loadFonts()` deferred into `__initOverlay__`.
- [src/main/main.js](src/main/main.js) — `sandbox: true` on main window.
- [tasks/todo.md](tasks/todo.md) — H1+H3 plan added, H5 plan marked done.
- [CHANGELOG.md](CHANGELOG.md), [HANDOFF.md](HANDOFF.md).

## 🔑 Key decisions this session

1. **Explicit `sandbox: false` on the overlay window.** First H1 build didn't set this and Electron's implicit default broke the preload. The explicit flag makes intent visible and documents that the overlay is *intentionally* one layer behind the main window.
2. **Overlay window stays non-sandboxed this session.** Making it compatible requires bundling the two shared CJS utils into the overlay build output — a Vite-adjacent build-step change, different workstream. Filed as [#63](https://github.com/Oghenefega/ClipFlow/issues/63) to keep the main H1 commit focused.
3. **Two commits instead of one.** H1 and H3 are independent enough that a future `git bisect` benefits from splitting them. If H1's subtitle regression had been caught post-commit instead of pre-commit, bisecting between a combined commit and the prior HEAD would have been more painful.
4. **Did NOT handle [#59](https://github.com/Oghenefega/ClipFlow/issues/59) mid-session.** Fega raised it during verification; kept it out of scope to avoid scope creep. Acknowledged in the changelog notes, listed as a next-session pick.

## ⚠️ Watch out for

- **Electron security warnings in the overlay window's console are expected noise** until H2 (#48) ships a CSP. They're dev-mode-only (won't appear in packaged builds) and have no runtime effect. First seen in session 17 overlay captures; ignore unless they change form after H2.
- **`loadFonts()` is now fire-and-forget inside `__initOverlay__`.** The main process still awaits `document.fonts.ready` via `executeJavaScript` before capturing frames, so the async handoff is intact. If anyone ever removes the `document.fonts.ready` await from [src/main/subtitle-overlay-renderer.js](src/main/subtitle-overlay-renderer.js), font loading will race with frame capture and the first ~1 second of frames will render in the browser fallback font. Keep the await.
- **`window.overlayAPI` is plain `contextBridge` output — DOM objects can't pass through it.** The current surface (inputs: JSON-serializable segments + styles + timestamps; outputs: CSS objects + shadow strings + punctuation-stripped strings) is all plain data. Future additions that return DOM nodes, event emitters, or non-cloneable values will fail silently at the bridge boundary — test any new function with actual overlay render, not just unit tests.
- **Overlay window cannot be sandboxed with the current preload design.** `sandbox: true` on [src/main/subtitle-overlay-renderer.js](src/main/subtitle-overlay-renderer.js) will crash the preload. Flip only after [#63](https://github.com/Oghenefega/ClipFlow/issues/63) lands.

## 🪵 Logs / Debugging

- **Main-process stdout is the best place to catch overlay preload failures.** The subtitle-overlay-renderer pipes `console-message` events from the offscreen window back to the main process stdout with the `[OverlayRenderer:*]` prefix. Electron itself prints preload load failures (`Unable to load preload script: ... Error: <reason>`) to the same stream. **The silent failure mode is: preload crashes → `contextBridge.exposeInMainWorld` never runs → page scripts see `undefined` for `window.overlayAPI`.** Grep the main-process stdout for `"Unable to load preload"` after any overlay-side change.
- **Per-video pipeline logs:** `C:\Users\IAmAbsolute\Desktop\ClipFlow\processing\logs\<VideoName>_<timestamp>.log`. One file per pipeline run; `[START]`, `[DONE]`, `[FAIL]` on each step. Overlay rasterization isn't itself a step here — it runs inside the render:clip IPC handler, not the AI pipeline. Overlay failures appear in the renderer's Render Progress IPC, not these logs.
- **Electron main logs:** `C:\Users\IAmAbsolute\AppData\Roaming\clipflow\logs\app.log` — startup, database init, watcher events, is_test reconciliation. Does NOT contain overlay rasterization output (that goes to main-process stdout, which in turn only appears when you run `npm start` from a terminal).
- **Renderer DevTools in production builds:** `CLIPFLOW_DEVTOOLS=1 npm start`. With H3 in place, the sandbox does NOT affect DevTools — attach works identically.

## 🔄 Build & verify

```bash
npm install                          # only if dep versions changed
npm run build:renderer               # Vite build (~11s, 2728 modules, 1.85MB minified)
npm start                            # Launch Electron (prod mode)
CLIPFLOW_DEVTOOLS=1 npm start        # Launch with DevTools attached
```

Main-process changes (anything under `src/main/`) require a full Electron quit + relaunch. Overlay preload changes also require a full relaunch — Vite HMR doesn't reach the offscreen window.

**Standing verification matrix — extended with H1/H3-specific checks:**
1. OBS real-record for 30s → Stop → card appears on Rename tab ~1-2s later.
2. Zoom-slider drag × 10 on a 30-min source — no renderer crash (kept-forever canary).
3. Drop-to-Rename (drag `.mp4` from outside the archive) → file appears in Pending → renames correctly. **Now also validates `webUtils.getPathForFile` under sandbox.**
4. Drop-to-Recordings (main + test) — file lands in correct root per session 16b.
5. **Render a clip with subtitles ON** → play output MP4 → subtitles burn in, correct font (Latina Essential), correct timing, word-by-word highlight matches editor preview. **H1 regression canary — don't skip this after any change to the overlay code path.**
6. Click every main tab — no "Something went wrong" screens.
7. DevTools console clean (`CLIPFLOW_DEVTOOLS=1 npm start`) — no red errors. Known noise: Electron's own CSP dev warning until H2 ships.
