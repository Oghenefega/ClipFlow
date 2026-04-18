# ClipFlow — Session Handoff
_Last updated: 2026-04-17 (session 18) — "H2 renderer CSP — pre-launch hardening arc closed"_

---

## TL;DR

**H2 shipped.** Renderer Content-Security-Policy enforcing on [index.html](index.html). Last item in the pre-launch hardening arc — **H1 (#47), H2 (#48), H3 (#49), H5 (#52), H6 (#53) are all closed.** The `C1`/`C2` substrate upgrades (Electron, Vite) shipped earlier. Security posture baseline: main window sandboxed + contextIsolated, overlay window contextIsolated with a narrow preload bridge, renderer locked to a deny-by-default CSP that only whitelists PostHog, Sentry, Google Fonts, and local `file:` media.

Final CSP directives (meta tag, enforcing):

```
default-src 'self';
script-src 'self' https://us-assets.i.posthog.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob: file:;
media-src 'self' blob: file:;
connect-src 'self' file: https://us.i.posthog.com https://us-assets.i.posthog.com https://*.ingest.us.sentry.io;
object-src 'none'; base-uri 'self'; form-action 'none';
```

**One CSP violation was caught during verification and fixed in the same commit arc** — the DOM-level crash screen at [src/index.js:23-27](src/index.js#L23-L27) used inline `onclick="window.location.reload()"`, which `script-src 'self'` blocks (no `'unsafe-inline'`). Refactored to `addEventListener` with an `id`. That's the kind of genuine fix CSP is supposed to catch — a latent inline-script vector gone.

**`'unsafe-inline'` on style-src stays** because the existing views render the `T` theme object via React inline `style={{...}}` attributes pervasively. Migrating to a nonce-per-render or CSS-in-JS-with-extraction pipeline is a multi-session refactor, not a hardening blocker. Tailwind in the editor is unaffected.

**Three observations filed during H2 verification (deliberately out of scope):**
- [#64](https://github.com/Oghenefega/ClipFlow/issues/64) — Waveform extraction stuck on "Extracting waveform…" for >10s. **Not CSP.** Proven via `fetch("file://…")` returning OK 2707 chars. Real flow is IPC → FFmpeg subprocess ([src/main/ffmpeg.js:240](src/main/ffmpeg.js#L240)); `waveformUtils.js` in renderer is dead code.
- [#65](https://github.com/Oghenefega/ClipFlow/issues/65) — Subtitles + captions anchor to wrong vertical position when the preview panel shrinks.
- [#57 comment 4273583749](https://github.com/Oghenefega/ClipFlow/issues/57#issuecomment-4273583749) — zoom-slider drag still lags on long sources (observation added under existing editor-perf issue).

Current HEAD will be session 18's wrap commit after this file is written. Pre-launch hardening arc is **closed**; next session can move to product work.

## 🎯 Next session — pick one (no blocker forces it)

1. **[#59](https://github.com/Oghenefega/ClipFlow/issues/59) editor render button without queuing.** Fega surfaced this in session 17 and mentioned again. Small self-contained UI change; good single-session task.
2. **[#64](https://github.com/Oghenefega/ClipFlow/issues/64) waveform extraction stuck.** Filed this session. Dead-code investigation + IPC-path debug. Blocks clean editor UX on fresh clip opens. Medium difficulty.
3. **[#65](https://github.com/Oghenefega/ClipFlow/issues/65) subtitle/caption anchor drift on panel resize.** Filed this session. Layout bug, probably a single-file fix in the editor preview panel. Quick win.
4. **[#62](https://github.com/Oghenefega/ClipFlow/issues/62) pipeline tolerance for silent audio.** Two-part fix spanning [D:\whisper\energy_scorer.py](D:\whisper\energy_scorer.py) and [src/main/ai-pipeline.js](src/main/ai-pipeline.js) `runEnergyScorer`. Required to make the drop-test path usable on silent screen-only recordings.
5. **[#61](https://github.com/Oghenefega/ClipFlow/issues/61) recording-date folder bucket + house-cleaning migration.** Parse `YYYY-MM-DD` from OBS filename prefix, plus one-shot migration walking both watch folders to re-bucket misfiled months. The migration is the bigger piece.
6. **[#57](https://github.com/Oghenefega/ClipFlow/issues/57) editor perf on long source.** Proper fix direction is component extraction (`<TimelinePlayhead />` + `<SegmentRow />` memo'd child) per [#57 comment 4267674430](https://github.com/Oghenefega/ClipFlow/issues/57#issuecomment-4267674430). Do **NOT** retry the store-derivation approach.
7. **[#63](https://github.com/Oghenefega/ClipFlow/issues/63) sandbox the overlay window.** Follow-up to H1. Not urgent — defense-in-depth parity only.

If unsure: **#65** is the quickest, **#59** is the cleanest feature, **#64** is the highest-value bug.

## 🚫 DO NOT touch next session (preserved)

- **Do NOT retry the [#57](https://github.com/Oghenefega/ClipFlow/issues/57) store-derivation approach** in any form. Rejected — session 11 broke it twice.
- **Do NOT skip the zoom-slider drag × 10 on a 30-minute source.** Standing go/no-go for any Electron / build-tool / dependency infrastructure change.
- Do NOT touch [#50](https://github.com/Oghenefega/ClipFlow/issues/50), [#56](https://github.com/Oghenefega/ClipFlow/issues/56), or [#51](https://github.com/Oghenefega/ClipFlow/issues/51). All deferred per pre-beta priority framing.
- **chokidar 5.x is off-limits** until Electron bumps its bundled Node to ≥ 20.19.
- **Do NOT re-introduce top-level `new Store(...)` calls.** electron-store is ESM-only now.
- **Do NOT flip `nodeIntegration: true → false` on any BrowserWindow without explicitly deciding `sandbox: true` vs `sandbox: false`.** Electron ≥20 defaults unset sandbox to `true` when `nodeIntegration` is off, which strips `require("path")` and most Node built-ins from the preload. If the preload needs Node APIs beyond `require("electron")`, set `sandbox: false` explicitly. Memory: [feedback_electron_sandbox_default.md](~/.claude/projects/C--Users-IAmAbsolute-Desktop-ClipFlow/memory/feedback_electron_sandbox_default.md).
- **Do NOT add inline `onclick=`, `onerror=`, or `<script>` blocks to any renderer HTML.** `script-src 'self'` blocks them. Use `addEventListener` with an `id`. Same goes for any `new Function(...)` / `eval(...)` — `'unsafe-eval'` is not on the policy.
- **Do NOT loosen CSP without auditing the full payload chain.** If a new third-party SDK (analytics, support chat, feature flag) needs a domain, whitelist it narrowly (exact subdomain, not `*`) and only on the directives it actually needs. The PostHog assets CDN took both `script-src` and `connect-src` — verify empirically, don't assume.
- **Do NOT rely on `frame-ancestors` in the meta-tag CSP.** Meta-delivered CSP cannot carry `frame-ancestors` per spec. If we ever need to restrict embedding, move the whole policy to an HTTP response header (would require serving the renderer from an HTTP origin instead of `file:`, which is its own migration).

## 📋 Infrastructure / hardening board state after this session

| Item | Issue | Status |
|---|---|---|
| **C1 Electron upgrade arc** | [#45](https://github.com/Oghenefega/ClipFlow/issues/45) | ✅ closed session 12 |
| **C2 Vite migration** | [#46](https://github.com/Oghenefega/ClipFlow/issues/46) | ✅ closed session 13 |
| **H5 electron-store 8→11** | [#52](https://github.com/Oghenefega/ClipFlow/issues/52) | ✅ closed session 16 |
| **H6 chokidar 3→4** | [#53](https://github.com/Oghenefega/ClipFlow/issues/53) | ✅ closed session 15 |
| **H1 offscreen subtitle harden** | [#47](https://github.com/Oghenefega/ClipFlow/issues/47) | ✅ closed session 17 |
| **H3 main-window sandbox** | [#49](https://github.com/Oghenefega/ClipFlow/issues/49) | ✅ closed session 17 |
| **H2 renderer CSP** | [#48](https://github.com/Oghenefega/ClipFlow/issues/48) | ✅ **closed session 18 — hardening arc complete** |
| **#63 overlay-window sandbox** | [#63](https://github.com/Oghenefega/ClipFlow/issues/63) | 🔲 defense-in-depth follow-up; not blocking |
| **#64 waveform extraction stuck** | [#64](https://github.com/Oghenefega/ClipFlow/issues/64) | 🔲 **filed this session** |
| **#65 subtitle/caption anchor drift** | [#65](https://github.com/Oghenefega/ClipFlow/issues/65) | 🔲 **filed this session** |
| **#57 editor perf on long source** | [#57](https://github.com/Oghenefega/ClipFlow/issues/57) | 🔲 UNRESOLVED — proper fix direction documented, deferred |
| **#59 editor render without queuing** | [#59](https://github.com/Oghenefega/ClipFlow/issues/59) | 🔲 Fega asked mid-session 17; dedicated session |
| **#61 monthly folder = recording date** | [#61](https://github.com/Oghenefega/ClipFlow/issues/61) | 🔲 ready |
| **#62 pipeline silent-audio tolerance** | [#62](https://github.com/Oghenefega/ClipFlow/issues/62) | 🔲 ready |

## ✅ What was built this session

### Commits

- **[to be recorded below]** — H2 renderer CSP (#48). CSP meta tag added to [index.html](index.html). Crash-screen inline `onclick` refactored to `addEventListener` in [src/index.js](src/index.js) to comply with `script-src 'self'`.

### Files touched

- [index.html](index.html) — CSP meta tag added in `<head>`. Nine directives, deny-by-default baseline with narrow whitelists.
- [src/index.js](src/index.js) — crash-screen reload button switched from inline `onclick` to `addEventListener`; added `id="clipflow-crash-reload"` to locate the button after `innerHTML` assignment.
- [tasks/todo.md](tasks/todo.md) — H2 plan marked DONE; hardening arc checklist updated.
- [CHANGELOG.md](CHANGELOG.md), [HANDOFF.md](HANDOFF.md).

## 🔑 Key decisions this session

1. **Enforcing mode, not Report-Only.** User explicitly chose enforcing. Report-Only would have shipped logs-without-teeth; we have no Sentry-side CSP-report ingestion wired up anyway.
2. **PostHog whitelisted now, moved server-side later.** Industry-standard path is client-SDK first, proxy later. Adding the whitelist unblocks H2 today; the proxy migration is scoped into [#22](https://github.com/Oghenefega/ClipFlow/issues/22) and [#25](https://github.com/Oghenefega/ClipFlow/issues/25) rather than its own issue so the decision travels with the server-side rebuild.
3. **`'unsafe-inline'` on `style-src` accepted.** Migrating the `T` theme object's inline `style={...}` attributes to a nonce-per-render pipeline is a multi-session refactor. The residual XSS surface is the same as any React app using inline styles — low and well-understood. Flagged as future work but not blocked on it.
4. **CSP iterated live, not speculatively.** Three policy revisions during verification (drop `frame-ancestors`, add PostHog assets CDN to both script-src and connect-src, add `file:` to connect-src). Each revision was driven by an observed DevTools CSP violation, not a guess. This is the correct way to write CSP — deny-by-default, then open exactly what the app actually does.
5. **Three observation issues filed instead of in-session fixes.** When waveform/caption/zoom issues surfaced during verification, filed them as separate issues (#64, #65, #57 comment) rather than rabbit-holing. User explicitly said "let's stay focused" — kept H2 verification moving, filed everything for the next session.

## ⚠️ Watch out for

- **CSP violations are now the canary for latent XSS vectors.** If DevTools starts logging CSP violations after a renderer change, don't just append to the policy — read the source first. The crash-screen inline `onclick` caught in H2 verification is exactly the kind of thing CSP is meant to block; refactoring was the right move. Whitelist only for legitimate third-party origins that the app genuinely depends on.
- **The `'unsafe-inline'` carve-out on `style-src` is the last soft spot in the renderer policy.** If a new view is added, prefer Tailwind classes over inline `style={...}` where practical. This doesn't fix the existing gap but prevents widening it.
- **Electron security warnings in the overlay window's console may still appear** because the overlay page itself has no CSP (only [index.html](index.html) does). This is fine — the overlay's attack surface is the preload bridge, already locked down in H1. Don't "fix" this by adding a CSP to the overlay without reading H1's watch-outs first.
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
7. DevTools console clean (`CLIPFLOW_DEVTOOLS=1 npm start`) — no red errors. **After H2: zero CSP violations. DevTools Issues tab should show "No Issues" (0 badge).** If a violation appears, it's a real signal — investigate the source before patching the policy.
