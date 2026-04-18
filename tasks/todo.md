# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.

---

## ✅ DONE (session 18) — H2 renderer CSP (#48) — last hardening item

**Shipped.** CSP meta tag enforcing on [index.html](../index.html). Crash-screen inline `onclick` refactored to `addEventListener` in [src/index.js](../src/index.js). All three pre-launch hardening items (H1/H2/H3) now complete. See CHANGELOG session 18 entry for final directives and verification notes.

---

## 🔲 PROPOSED — Session 19: three editor bugs / feature (#65, #59, #64)

**Plain-language goal.** Close three items in one session: (1) fix subtitle/caption overlays drifting off the video when the preview panel resizes, (2) add a "Render" button so the editor can export an MP4 without adding it to the upload queue, (3) figure out why waveform extraction sometimes spins forever and surface a visible error when it fails.

**Why this batch.** All three live in the editor surface (PreviewPanel / Topbar / waveform handler). Touching the preview panel once for #65 + #64 amortises the re-verify cost. #59 is a self-contained Topbar change with its own verification loop. Hardening arc closed last session — the whole session can be product-side.

**Order of attack.** #65 first (quickest, contained), then #59 (self-contained feature), then #64 (investigation-heavy, punt if the root cause turns out larger than a log+handle pass).

---

### 🔲 Task A — #65 subtitle/caption anchor drift on panel resize

**Root-cause hypothesis.** The 9:16 canvas at [src/renderer/editor/components/PreviewPanelNew.js:997-1015](../src/renderer/editor/components/PreviewPanelNew.js#L997-L1015) combines `aspectRatio: "9 / 16"` + `height: "100%"` + `maxWidth: "100%"` + `maxHeight: "100%"` in fit mode. When the preview column narrows, `maxWidth: 100%` caps width but the browser's aspect-ratio reconciliation against `height: 100%` can produce a canvas whose measured `getBoundingClientRect()` height exceeds the visible bounds — the overlays anchor at `top: ${yPercent}%` of that inflated height and end up below the rendered video. `scaleFactor = canvasWidth / 1080` from the ResizeObserver stays correct, so text scales but positioning drifts.

Corroboration from code:
- DraggableOverlay at [PreviewPanelNew.js:359-368](../src/renderer/editor/components/PreviewPanelNew.js#L359-L368) anchors children at `top: ${yPercent}%` of the absolute-positioned parent — that parent is the 9:16 canvas. If the canvas's rendered height ≠ its layout box height, anchoring is wrong.
- Video uses `object-contain` inside the canvas, so the video's visible rect is always ≤ the canvas rect. Overlays tracking canvas rect (not video rect) is the structural issue.

**Fix direction.** Switch fit-mode canvas sizing to a form that guarantees the canvas box exactly matches the visible video box. Two options:

1. **Cheap:** Change fit-mode from `{ height: 100%, maxWidth: 100%, maxHeight: 100% }` to a JS-driven `fitSize = min(containerH, containerW * 16/9)` computed from the scroll container's `getBoundingClientRect()` via ResizeObserver. Canvas gets explicit `width` + `height` in px. Aspect-ratio CSS prop removed in fit mode (only used in zoom mode).
2. **Structural (preferred):** Wrap the canvas in a flex parent that enforces fit via `min(100cqh, 100cqw * 16/9)` container queries, OR keep aspect-ratio but drop `height: 100%` in favour of `width: min(100%, calc(100% * 9/16))` so width is the primary constraint when the panel narrows.

Pick after a 5-minute devtools check — measure canvas `getBoundingClientRect()` at narrow vs wide panel widths and confirm which number is lying.

**Files to touch.**
- [src/renderer/editor/components/PreviewPanelNew.js](../src/renderer/editor/components/PreviewPanelNew.js) — canvas sizing (~line 1000-1015), possibly the ResizeObserver at 600-609 if we switch to JS-driven sizing.

**Verification.**
- Drag the Transcript panel's right edge across its full range (narrow → wide) in fit mode — subtitle + caption stay glued to the video frame at every width.
- Switch to manual zoom 25% / 100% / 200% — overlays stay anchored.
- Switch between a 16:9 source and a 9:16 source (if available) — no regression.
- Zoom-slider drag × 10 on 30-min source — standing infrastructure canary (no renderer crash).

**Done means.** #65 acceptance criteria met; can close the issue.

---

### 🔲 Task B — #59 editor Render-without-queue button

**Where it lives.** Topbar at [PreviewPanelNew.js:203-405](../src/renderer/editor/components/PreviewPanelNew.js#L203-L405). The current Queue button triggers `onSendToQueue` → `doQueueAndRender` → `window.clipflow.renderClip(...)`. The rendered file is already written to disk — the "queued" state is renderer-side state attached to the clip by `onClipRendered` refreshing App.js project state.

**The actual coupling.** Need to read `renderClip` IPC + the `onClipRendered` callback to confirm exactly where the "add to queue" side effect fires. Two possibilities:
1. Main process marks the clip `status: "queued"` as part of `renderClip`. → We need a new IPC param `{ addToQueue: boolean }` and a branch in the main handler.
2. Main process just renders; renderer-side `onClipRendered` handler is what flips the clip to queued. → We can pass `addToQueue: false` through the existing callback chain and branch in App.js.

Read [src/main/main.js renderClip handler] and the `onClipRendered` definition in `App.js` (or wherever `Topbar` receives it) before deciding.

**Fix direction.** Split `doQueueAndRender` into a shared `doRender({ addToQueue })` and two call sites:
- Existing "Queue" button: `doRender({ addToQueue: true })` + existing confirmation toast.
- New "Render" button placed immediately left of Queue: `doRender({ addToQueue: false })` + toast "Rendered to [path]" with an "Open folder" action (`window.clipflow.openPath?.(folder)` or equivalent — verify the IPC exists; if not, add it).

Visual: follow [ui-standards.md](../.claude/rules/ui-standards.md) — shadcn Button with secondary/outline variant (Queue is the primary). Icons from lucide-react (`Download` for Render, existing icon for Queue). Green toggle state pattern doesn't apply here — these are actions, not toggles.

**Files to touch.**
- [src/renderer/editor/components/PreviewPanelNew.js](../src/renderer/editor/components/PreviewPanelNew.js) — Topbar: extract `doRender`, add button.
- Possibly [src/main/main.js](../src/main/main.js) — if `renderClip` needs an `addToQueue` param (TBD after reading).
- Possibly [src/main/preload.js](../src/main/preload.js) — if we need `openPath` bridge for the "Open folder" action.
- Possibly a toast utility — check if one already exists; if so, reuse.

**Verification.**
- Open a clip → press new Render button → MP4 written to configured output location; clip does NOT show Queued badge in Projects view.
- Same clip → press Queue button → MP4 written AND clip shows Queued badge in Projects view; Queue tab picks it up.
- Rendering progress UX (existing render progress overlay) fires for both actions identically.
- Toasts read correctly: "Rendered to [path]" vs "Added to queue".
- Regression: zoom-slider drag × 10 on 30-min source — no renderer crash.

**Done means.** #59 acceptance criteria met; can close the issue.

---

### 🔲 Task C — #64 waveform extraction silently empty

**What the issue already lays out.** Diagnostic logging at [src/main/main.js:760](../src/main/main.js#L760) (`waveform:extractCached`) + [src/main/ffmpeg.js:240](../src/main/ffmpeg.js#L240) (`extractWaveformPeaks`), reproduce, read log, fix the surfaced cause.

**Concrete plan.**
1. Add `console.log` entries at the `waveform:extractCached` handler for: input `sourceFilePath`, `fs.existsSync` result, cache hit vs. miss, cache path, and at the extract call — args and result (`peaks.length`, `error`).
2. Add `console.log` at `extractWaveformPeaks` entry + a `stderr` capture on the `execFile` spawn so FFmpeg's own error output appears in main stdout. Currently only `err.message` is caught, which for `execFile` usually omits stderr.
3. Run `npm start` from a terminal so main stdout is visible, open a fresh clip, read the log, identify which branch is hitting. Likely candidates per issue body: ffmpeg binary not on PATH, `-map 0:a:${idx}` selects a non-existent track, cache dir write failure.
4. Fix whatever shows up. If it's the PATH issue, ship an ffmpeg binary-path resolver that falls back to a bundled path. If it's the audio-track selector, fix the fallback logic. If it's cache dir, handle the write error visibly.
5. Surface `{ error, peaks: [] }` responses in the renderer — [PreviewPanelNew.js:858-868](../src/renderer/editor/components/PreviewPanelNew.js#L858-L868) currently only acts on `peaks.length > 0`. Add an error state (visible "Waveform unavailable" or similar) instead of the infinite "Extracting waveform…" spinner.

**Files to touch.**
- [src/main/main.js](../src/main/main.js) — logging in `waveform:extractCached` handler.
- [src/main/ffmpeg.js](../src/main/ffmpeg.js) — logging + stderr capture in `extractWaveformPeaks`.
- [src/renderer/editor/components/PreviewPanelNew.js](../src/renderer/editor/components/PreviewPanelNew.js) — error UI at the waveform call site.
- Possibly a bundled ffmpeg path / electron-builder config if the root cause is missing binary.

**Verification.**
- Open a fresh (not previously cached) clip on a 30-min source → waveform appears within 10s.
- Open a fresh clip on a 3-min source → waveform appears within 5s.
- Main log shows `[waveform]` start / cache hit|extracted / failed lines on every call.
- When extraction fails (simulate by pointing at a file with no audio track), renderer shows a visible error state instead of spinning forever.

**Done means.** #64 acceptance criteria met; can close the issue. If the root cause turns out to be substantially larger than a log+handle pass (e.g. we need to ship a bundled ffmpeg binary), stop after the logging instrumentation + renderer error UI, file a follow-up issue with the full reproduction log, and close this one with a pointer. Do not rabbit-hole into distribution work mid-session.

---

### Shared verification matrix (once, at end of session)

1. Build + launch: `npm run build:renderer && npm start`.
2. Zoom-slider drag × 10 on a 30-min source — no renderer crash (standing infrastructure canary).
3. DevTools console clean under `CLIPFLOW_DEVTOOLS=1 npm start` — zero CSP violations (H2 regression canary).
4. Render a clip with subtitles ON → play output MP4 → subtitles burn in with correct timing and font (H1 regression canary).
5. Click every main tab — no "Something went wrong" screens.

### Out of scope

- [#57](https://github.com/Oghenefega/ClipFlow/issues/57) editor perf / component extraction — separate session.
- [#63](https://github.com/Oghenefega/ClipFlow/issues/63) overlay sandbox — defense-in-depth, not urgent.
- [#61](https://github.com/Oghenefega/ClipFlow/issues/61) / [#62](https://github.com/Oghenefega/ClipFlow/issues/62) — separate session.
- Distribution/code-signing/auto-updater work — pre-beta priority is substrate + product, not launch hardening.

---

## (historical plan below — preserved for reference)

## 🔲 PROPOSED — H2 renderer CSP (#48) — last hardening item

**Plain-language goal.** Close the last pre-launch hardening item. Add a Content Security Policy to the renderer so that even if a supply-chain attack ever injects a `<script>` into our bundle, the browser refuses to execute anything beyond the whitelisted origins. H1 + H3 shipped last session — this is the third wall.

**Why now.** H1 (overlay hardening) and H3 (main-window sandbox) are done. H2 is the last defense-in-depth domino. Vite has shipped (C2, session 13), so the bundler environment we're writing the policy against is stable.

**Why not nonce-based.** The issue body floated nonce-based CSP "now that Vite has shipped." Reality check: nonces only buy strictness over inline `<script>` — and we have zero inline scripts. For inline styles (which we DO have, pervasively via the `T` theme object + the `<style>` block in `index.html`), nonce doesn't help because individual `style=` attributes aren't nonced. We'd still need `'unsafe-inline'` for style-src. Skip nonces this session; revisit post-launch if a full theme.js → CSS extraction happens.

### Facts confirmed by reading code

- **Renderer endpoints** (the ONLY ones that need `connect-src`):
  - Sentry ingest — `https://*.ingest.us.sentry.io` (DSN at [src/index.js:10](src/index.js#L10))
  - PostHog analytics — `https://us.i.posthog.com` ([src/index.js:46](src/index.js#L46))
- **NOT renderer endpoints** (main-process Node HTTP, CSP doesn't cover them):
  - Anthropic API (`api.anthropic.com`) — called from [src/main/ai/providers/anthropic.js:23](src/main/ai/providers/anthropic.js#L23) via Node `https`
  - Cloudflare AI Gateway (`gateway.ai.cloudflare.com`) — same provider, same path
  - → **Dropping these from the connect-src** vs. the issue's starter policy. They do nothing there.
- **Fonts:** [index.html:11](index.html#L11) does `@import url('https://fonts.googleapis.com/css2?...')` inside an inline `<style>`. `fonts.googleapis.com` serves CSS → `style-src`. `fonts.gstatic.com` serves `.woff2` → `font-src`.
- **Local media:** [waveformUtils.js:14-18](src/renderer/editor/utils/waveformUtils.js#L14-L18) does `fetch("file://...")` to read the source video for waveform extraction. Video playback uses `file://` URLs on `<video src>`. Thumbnails + waveform canvases generate `blob:` URLs.
- **No `eval` / `new Function` in our source.** `posthog-js` and `@sentry/electron/renderer` both have `eval`/`new Function` code paths in worst-case branches, BUT we've run this in production for 2+ weeks with no reports of either failing silently. If CSP blocks one during verification, we'd fix it — current guess is it won't bite.
- **No `<script>` tags besides the Vite-emitted bundle reference.** [build/index.html:64](build/index.html#L64) has exactly one `<script type="module" crossorigin src="./assets/index-XXX.js">`. `script-src 'self'` covers it.
- **Tailwind utility classes** compile to CSS classes in the bundled stylesheet — not inline styles. So `style-src 'self'` covers the stylesheet. The pervasive inline `style={...}` in legacy views IS inline style attributes → needs `'unsafe-inline'`. The inline `<style>` block in `index.html` also needs `'unsafe-inline'` (until extracted).

### The policy

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob: file:;
media-src 'self' blob: file:;
connect-src 'self' https://us.i.posthog.com https://*.ingest.us.sentry.io;
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
form-action 'none';
```

Deltas from the issue's starter:
- `connect-src` drops `api.anthropic.com` and `gateway.ai.cloudflare.com` (main-process calls, not renderer).
- `connect-src` adds `us.i.posthog.com` (issue body missed PostHog).
- `connect-src` narrows `*.sentry.io` to `*.ingest.us.sentry.io` (tighter; only ingestion subdomains).
- Adds `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `form-action 'none'` — standard hardening with no functional impact.

### Where to set it

`<meta http-equiv="Content-Security-Policy" content="...">` in [index.html](index.html) (the Vite source at repo root). Vite preserves unknown `<meta>` tags in the built `build/index.html` unchanged.

**NOT via `session.defaultSession.webRequest.onHeadersReceived` in main.js.** That approach is right when loading over HTTP(S), but we load via `file://` and Electron's `loadFile()` — headers don't apply to `file://` responses. The meta tag is the correct vector here.

### What this session does (and doesn't)

**Does:**
1. Add the CSP meta tag to [index.html](index.html) head, above the inline `<style>`.
2. Build with Vite, confirm `build/index.html` picks up the meta tag (expect verbatim).
3. Walk every main tab + the editor with DevTools open, watching for CSP violation errors.
4. Capture and document any violations that surface.
5. Update CHANGELOG + HANDOFF + close #48.

**Doesn't:**
- Self-host Google Fonts. The CDN is whitelisted; self-hosting is its own workstream (eliminates a third-party network dep but needs the font files bundled into `public/fonts/`). Will file follow-up if we want to pursue.
- Extract the inline `<style>` block from `index.html` to a separate CSS file. Not needed when `'unsafe-inline'` is allowed; re-visit when we tighten further.
- Tighten style-src away from `'unsafe-inline'`. Requires refactoring the entire `T` theme object inline-style pattern → CSS — multi-session workstream, not pre-launch.
- Add a CSP to the offscreen subtitle overlay window. Overlay has no network access at all; CSP there would be purely theater. Separate issue if we ever care.

### File impact

**Modified:**
- [index.html](index.html) — add one `<meta http-equiv="Content-Security-Policy" content="...">` tag (6 lines with formatting).

**Auto-regenerated:**
- [build/index.html](build/index.html) — Vite rewrites on build, meta tag preserved.

No changes to `src/main/*`, no changes to any `src/renderer/*`, no deps, no config.

### Verification matrix

1. **Build clean.** `npm run build:renderer` exits 0. No Vite warnings about the meta tag.
2. **App launches.** `CLIPFLOW_DEVTOOLS=1 npm start`. Main window renders. DevTools console opens cleanly.
3. **Zero CSP violations on first paint.** Filter DevTools console to "Refused to" / "violates the following Content Security Policy" — expect none. If any appear, triage and fix before continuing.
4. **Every main tab.** Click each in order: Rename, Recordings, Projects, Editor (open any clip), Queue, Tracker, Settings. DevTools console clean after each. Standing test — no regressions.
5. **PostHog fires.** Switch tabs a few times → DevTools Network tab shows POST to `us.i.posthog.com/e/` with status 200. No CSP block. Switch Analytics toggle in Settings → event still fires (or opt-out respected, whichever state).
6. **Sentry fires.** Open DevTools console, run `throw new Error("H2 CSP smoke test")` inside an event handler (e.g., tab click) → Network tab shows POST to `*.ingest.us.sentry.io` with status 200, and the event appears in Sentry within ~30s.
7. **Fonts render.** Any view should show DM Sans. If CSP blocked fonts, you'd see system-ui fallback (visibly different kerning). Check the sidebar labels + buttons.
8. **Waveform loads.** Open a clip in the editor → timeline shows waveform within ~10s. This exercises `fetch("file://...")` against `connect-src` AND the `media-src file:` rule. If blocked, waveform track stays empty.
9. **Video preview plays.** Click Play in the editor → video plays. Exercises `media-src file:` + `img-src file:` (first-frame poster).
10. **Thumbnail scrubber works.** Multi-game split on a long file → thumbnail strip renders. Exercises `img-src blob:`.
11. **Drop-to-Rename + Drop-to-Recordings.** Standing canaries from H1/H3. Still work.
12. **Zoom-slider drag × 10 on a 30-min source.** Standing canary. Still no crash.
13. **Render a clip with subtitles ON.** The big end-to-end test. Output MP4 plays, subtitles burned in. This exercises main-process Anthropic calls (still outside CSP scope, confirming I'm right about that).
14. **AI title/description generation.** In editor, trigger AI title generation. Still works. Confirms main-process Anthropic path survives — should be untouched.
15. **CSP violation sweep via report-only (optional).** Not doing this session unless step 3 produces ambiguity. `Content-Security-Policy-Report-Only` mode would log all violations without blocking; good for audit but we don't have a reporter endpoint set up.

### Risks + rollback

- **Risk: posthog-js or @sentry/electron/renderer uses `eval` internally on a code path we don't hit in our standing tests.** Mitigation: step 3 catches the obvious case. Residual risk: a code path triggered by a rare user interaction (e.g., session replay, error sourcemap fetch). If that surfaces post-commit, we either add `'unsafe-eval'` to `script-src` (minor weakening) or pin the library version and open an issue.
- **Risk: a third-party dep we don't know about makes a network request to an un-whitelisted origin.** Mitigation: step 3 + the 15-minute tab walk catches this. Residual risk: a dep that only talks home on specific events. If it surfaces, we add the origin or remove the dep.
- **Risk: Electron's own dev-mode CSP warning gets louder** (it fired in session 17 on the overlay window). Mitigation: add the CSP explicitly satisfies the warning. Expect the warning to go away after this lands.
- **Rollback: single commit, trivial revert.** `git revert` of one file → back to no CSP.

### Commit strategy

Single commit. The meta tag is one atomic change. No split between "add tag" and "tighten policy" because the tag ships with the final policy.

### Plan decision points (need Fega's call before I start)

1. **Go or hold?** Go = execute. Hold = pick a different next-session item.
2. **Drop PostHog from connect-src?** If you're planning to remove PostHog before launch anyway (or move it server-side), I'd skip whitelisting it and let CSP pressure the removal. Otherwise keep it.
3. **Report-only first?** Ship in enforcing mode immediately (my recommendation — we've read the code thoroughly) vs. ship `Content-Security-Policy-Report-Only` for a session to collect violations. Report-only is safer but needs a reporter endpoint; without one, we just tail the DevTools console, which we're doing in step 3 anyway. Recommend: enforcing mode.

### Done means

- [ ] `<meta http-equiv="Content-Security-Policy">` present in [index.html](index.html) with the refined policy above.
- [ ] `npm run build:renderer` clean; `build/index.html` contains the meta tag.
- [ ] Every verification matrix item passes.
- [ ] No CSP violations in DevTools console across the tab walk.
- [ ] CHANGELOG + HANDOFF updated.
- [ ] #48 closed with commit SHA.

---

## ✅ DONE — H1 + H3 pre-launch hardening (#47 + #49)

**Plain-language goal.** Close two of the three remaining pre-launch hardening items (H1, H3) in one session. H2 (CSP, #48) stays separate because its failure mode is different.

- **H1 #47** — the hidden BrowserWindow that rasterizes subtitle frames currently runs with `nodeIntegration: true` + `contextIsolation: false`. Any dynamic content that ever gets into that page could `require("fs")` or `require("child_process")`. Fix: flip both flags, add a preload that exposes only what the overlay needs.
- **H3 #49** — the main `BrowserWindow` has no `sandbox: true`, so the renderer runs with the user's full OS permissions. Fix: enable sandbox on the main window.

Bundled because both the issue bodies and the infra dashboard say to — same preload audit, overlapping smoke-test surface, single verification pass.

### Why these two, why together

- **H3 needs H1 done first if we ever want to sandbox the overlay window.** We are NOT sandboxing the overlay this session (see scoping below), but ordering H1 first keeps the option open without a revert.
- Same fragility shape: both touch `BrowserWindow` config. Doing them in one session means one set of smoke tests covers both.
- Both rated "contained today, catastrophic if broken" — low urgency, high insurance value.

### Facts confirmed by reading code

- **Main preload is already sandbox-clean** ([src/main/preload.js](src/main/preload.js:1-284)): one `require("@sentry/electron/preload")`, one `require("electron")` for `contextBridge` + `ipcRenderer` + `webUtils`. Everything else is `ipcRenderer.invoke(...)` wrappers. Zero `require("fs")`, `require("path")`, `require("child_process")`, `require("os")`, `require("child_process")`. **No preload rewrite needed for H3.** Flipping `sandbox: true` should "just work" on the main window.
- **Overlay page uses `require()` in 3 places** ([public/subtitle-overlay/overlay-renderer.js:26](public/subtitle-overlay/overlay-renderer.js:26), [:35](public/subtitle-overlay/overlay-renderer.js:35), [:63](public/subtitle-overlay/overlay-renderer.js:63)): dynamic `require(__STYLE_ENGINE_PATH__)`, dynamic `require(__FIND_ACTIVE_WORD_PATH__)`, and `require("path")` inside `loadFonts()`. All three must go when `nodeIntegration` flips off.
- **Both utility modules are pure CJS with zero deps** ([src/renderer/editor/utils/subtitleStyleEngine.js](src/renderer/editor/utils/subtitleStyleEngine.js) and [src/renderer/editor/utils/findActiveWord.js](src/renderer/editor/utils/findActiveWord.js)): pure functions, `module.exports = {...}`. Safely `require()`-able from a (non-sandboxed) preload with static paths.
- **Overlay BrowserWindow construction** ([src/main/subtitle-overlay-renderer.js:167-180](src/main/subtitle-overlay-renderer.js:167-180)): `webPreferences: { offscreen: true, contextIsolation: false, nodeIntegration: true }`. No existing preload.
- **Main BrowserWindow construction** ([src/main/main.js:296-315](src/main/main.js:296-315)): `webPreferences: { preload, contextIsolation: true, nodeIntegration: false }`. Just needs `sandbox: true` added.
- **`webUtils.getPathForFile`** (preload.js:9) is a renderer-facing Electron API. It IS available in sandboxed preloads (it's on `require("electron")`, not Node). Will verify with the File.path smoke test.

### Scoping decision — overlay window stays NON-sandboxed

Sandboxing the overlay window would require bundling `subtitleStyleEngine.js` + `findActiveWord.js` into the overlay's build output (sandboxed preloads can only `require("electron")`, not arbitrary modules). That's a separate build-step workstream. The H3 issue body flags this explicitly: "add `sandbox: true` **if compatible** — test rasterization output." We take the "not sandbox the overlay" fork and document it.

**Threat model remaining on the overlay after H1:**
- Page loads one local file. No network, no user-authored HTML.
- `contextIsolation: true` isolates page JS from preload.
- `nodeIntegration: false` removes `require` from the page.
- Preload only exposes `styleEngine` + `wordFinder` function objects + fonts dir string. No `fs`, no `child_process`, no IPC beyond that.
- Attack path would require: compromising a local file that already ships in the install → not a remote-exploit surface.

If a future change introduces dynamic content into the overlay (remote font, user-authored template, webview), we'd revisit sandboxing then. Filed as a follow-up issue at end of session.

### What this session does (and doesn't)

**Does:**
1. Create `src/main/subtitle-overlay-preload.js` — new preload for the offscreen window. `require()`s the two CJS utility modules at preload-time, exposes them plus the fonts dir via `contextBridge.exposeInMainWorld("overlayAPI", {...})`.
2. Rewrite [src/main/subtitle-overlay-renderer.js](src/main/subtitle-overlay-renderer.js): add `preload`, flip `contextIsolation: true` + `nodeIntegration: false`, stop injecting `__STYLE_ENGINE_PATH__` / `__FIND_ACTIVE_WORD_PATH__` (no longer needed). Keep `__OVERLAY_CONFIG__` + `__SCALE_FACTOR__` + `__FONTS_PATH__` injection — those are data, not module paths. Actually: drop `__FONTS_PATH__` too since preload can expose it.
3. Rewrite [public/subtitle-overlay/overlay-renderer.js](public/subtitle-overlay/overlay-renderer.js): replace `require(enginePath)` with `window.overlayAPI.styleEngine`, replace `require(finderPath)` with `window.overlayAPI.wordFinder`, replace `require("path")` in `loadFonts()` with manual `${fontsDir}/${file}` string composition (path.join is just separator insertion — we control the input).
4. Add `sandbox: true` to [src/main/main.js:296-315](src/main/main.js:296-315) main window config.
5. Copy `overlay-renderer.js` change to `build/subtitle-overlay/overlay-renderer.js` too, OR confirm Vite's `publicDir: "public"` copies it (it should — that's why `build/subtitle-overlay/` exists today).

**Doesn't:**
- Sandbox the overlay window (scoping decision above — file as follow-up).
- Touch H2 (#48) CSP — separate session.
- Add any new IPC channels.
- Change the rasterization pixel output. Frame comparison is pass/fail criterion.
- Modify `build/`-checked-in files by hand if Vite regenerates them — run `npm run build:renderer` and let Vite do it.

### Files touched

**New:**
- `src/main/subtitle-overlay-preload.js` — new file, ~25 lines.

**Modified:**
- `src/main/subtitle-overlay-renderer.js` — webPreferences flip, drop two injected paths.
- `src/main/main.js` — one-line `sandbox: true` addition.
- `public/subtitle-overlay/overlay-renderer.js` — three `require()` sites replaced with `window.overlayAPI.*`.

### Implementation order (one commit OK, two commits cleaner)

Prefer **two commits** so that if the drop-to-Recordings canary or the subtitle burn-in fails, `git bisect` takes one step to localize:

1. **Commit A — H1 overlay hardening.** New preload + flip flags on overlay + overlay page rewrite. Verify subtitle burn-in still produces bit-identical frames via the render-a-clip smoke.
2. **Commit B — H3 main window sandbox.** One-line `sandbox: true` on main. Verify every `window.clipflow.*` path still works via the IPC smoke matrix.

If Commit A's verification passes cleanly, Commit B is tiny and fast.

### Verification matrix (mandatory before claiming done)

From standing smoke set + H1/H3-specific checks:

1. **Build clean.** `npm run build:renderer` exits 0, no CSP/CSP-prelude warnings in Vite output.
2. **App launches.** `npm start` shows the main window, no crash, no renderer console errors on first paint.
3. **Zoom-slider drag × 10 on a 30-min source.** Standing kept-forever canary (per HANDOFF DO NOT). No renderer crash.
4. **OBS real-record 30s → Stop.** Card appears on Rename tab ~1-2s later. Tests watcher + IPC roundtrip.
5. **Drop-to-Rename.** Drag an `.mp4` from Downloads onto Rename tab. File appears in Pending. Tests `File.path` → `webUtils.getPathForFile` which is the one sandbox-adjacent API we're using.
6. **Drop-to-Recordings with Test toggle both states.** Tests `importExternalFile` IPC round-trip with sandbox on. File lands in correct root per session 16b verification.
7. **Subtitle burn-in pixel check.** Render a clip that has subtitles + captions. Compare first frame, middle frame, last frame of the rasterized overlay against a pre-H1 baseline (capture one now before starting). Must be bit-identical or explain every pixel difference.
8. **Render pipeline end-to-end.** One full render with subtitles ON. Final MP4 plays, subtitles are burned in, timing matches editor preview. Tests the entire overlay pipeline post-H1.
9. **Every IPC feature smoke-tested once.** File pickers, save dialogs, project CRUD, rename, preview frames, thumbnails, publish-log fetch. 2 minutes of clicking.
10. **DevTools console clean.** `CLIPFLOW_DEVTOOLS=1 npm start`, open each major tab, no red errors. Particular watch: any CSP warnings (foreshadowing H2), any "require is not defined" errors (means overlay rewrite missed a call site).

### Risk + rollback

- **Highest risk:** step 7 (subtitle burn-in pixel check). If the overlay rewrite subtly changes scaling, font loading, or word timing, the burn-in is visibly wrong and users notice. Baseline frames captured before the change make regression obvious. Rollback = `git revert` of Commit A, H3 Commit B keeps working independently.
- **Medium risk:** `webUtils.getPathForFile` under sandbox. If it throws, drop-to-Rename breaks. Low probability — this API was designed for sandboxed renderers in Electron 32+.
- **Low risk:** Vite config doesn't need touching. `publicDir: "public"` already copies `subtitle-overlay/` unchanged.

### Open questions (none blocking — answering as I go)

- Whether Vite is in fact copying `public/subtitle-overlay/overlay-renderer.js` to `build/subtitle-overlay/overlay-renderer.js` on every build. If not, we need to edit both locations or add a Vite copy step. Check with `npm run build:renderer` + `diff public/subtitle-overlay/overlay-renderer.js build/subtitle-overlay/overlay-renderer.js`.

### Done means

- [ ] Overlay window: `contextIsolation: true`, `nodeIntegration: false`, preload attached.
- [ ] Zero `require()` in `public/subtitle-overlay/overlay-renderer.js`.
- [ ] Main window: `sandbox: true`.
- [ ] Subtitle burn-in pixel-identical to baseline.
- [ ] Every item in the verification matrix passes.
- [ ] CHANGELOG updated (Changed section: H1 overlay hardening, H3 main sandbox).
- [ ] HANDOFF updated.
- [ ] Follow-up issue filed: "Sandbox the offscreen subtitle BrowserWindow (requires bundling CJS utils into overlay build)."
- [ ] Commits pushed; issues #47 and #49 closed.

---

## ✅ DONE — H5 electron-store v8 → v11 (#52), second half of Split-A

**Plain-language goal.** Bump the library that owns every persistent setting (watch folder, creator profile, naming presets, OAuth tokens, publish log) from v8 to v11. Three majors behind today. The gap matters because v9 tightened atomic write behavior on Windows (the same OS we target), and v11 is the current stable. Paired with H6 (chokidar, closed session 15) as Split-A — both were gated on the Vite migration (closed session 13).

**The structural reason this isn't a one-line bump.** v9 made `electron-store` **ESM-only** (`"type": "module"`). Electron 40's main process is plain CJS. `require("electron-store")` stops working on v9+ and throws `ERR_REQUIRE_ESM`. The fix is `await import("electron-store")` — which means **store construction becomes async**, which in turn means every module that does `new Store({...})` at module-top must defer that to a runtime bootstrap. Four files do this today.

**Why now.** C2 (Vite) shipped session 13. Chokidar (H6) shipped session 15. Split-A is 1-of-2 done; this finishes the pair. Watcher/dep-upgrade muscle memory from session 15 is fresh.

### What this session does (and doesn't)

**Does:** swap `electron-store ^8` for `^11`. Introduce an async store factory. Move the `clipflow-settings` construction + its ~10 inline migrations into the existing `app.whenReady()` bootstrap (ordering: store → migrations → provider init → createWindow). Convert `publish-log.js` and `token-store.js` to lazy-init pattern (each exports an `init()` awaited from main.js's bootstrap). Drop the vestigial `require("electron-store")` in `ai/transcription-provider.js` (JSDoc-only). Single commit.

**Doesn't:** change any stored key name, default value, or migration behavior — file names (`clipflow-settings.json`, `clipflow-tokens.json`, `clipflow-publish-log.json`) and schemas are preserved. No `schema:` validation added. No `migrations:` config adopted. No new stores. No touches to the ~50 `store.get/set` call sites inside IPC handlers — they close over the module-scope binding and work unchanged once the binding is assigned.

### Facts confirmed by reading code

- Four `require("electron-store")` sites: [src/main/main.js:19](src/main/main.js:19), [src/main/publish-log.js:5](src/main/publish-log.js:5), [src/main/token-store.js:6](src/main/token-store.js:6), [src/main/ai/transcription-provider.js:16](src/main/ai/transcription-provider.js:16). The transcription-provider one is **unused as a constructor** — only referenced in a JSDoc type annotation. Safe to delete the require outright.
- `main.js` has **118 `ipcMain.handle(...)` registrations** at module top. All close over the `store` binding defined at line 137. If we switch to `let store` (assigned inside `whenReady`), the closures capture the outer binding. IPC handler BODIES run after the renderer sends a call — the renderer doesn't start before `createWindow()` runs inside `whenReady`, which runs after the store is assigned. Ordering holds; no handler-registration rewrite needed.
- **~10 inline migrations** at [src/main/main.js:209-279](src/main/main.js:209): `deviceId`, `analyticsEnabled`, `llmProvider`, `llmProviderConfig`, `transcriptionProvider`, `devMode`, `splitThresholdMinutes`, `autoSplitEnabled`, `splitSourceRetention`, `transcriptionAudioTrack` (twice), `creatorProfile.momentPriorities`, `onboardingComplete` (auto-complete for existing), whisper path cleanup, placeholder-platform clear, `projectFolders`, `folderSortMode`. Plus `fileMigration.migrateStoreData(store)` at [main.js:378](src/main/main.js:378) (currently inside `whenReady`). None of these change shape — all are additive conditionals. All still work verbatim when moved into the async bootstrap.
- `llmProvider.init(store)` [main.js:218](src/main/main.js:218) and `transcriptionProvider.init(store)` [main.js:219](src/main/main.js:219) run at module-top today. They must move into the async bootstrap after store is assigned.
- Currently `node -v` reports 20.17 on the dev machine, but **Electron 40 bundles Node 20.18** internally. `electron-store@11` requires `node>=20` — satisfied at runtime.
- No use of `store.store` (the mutable-object accessor v11 freezes). No use of `options.schema` or `options.migrations`. No `store.onDidChange` subscriptions that would care about v11's tightened emission semantics.
- Existing stored JSON files in `%APPDATA%\clipflow\` (Fega's real data: `clipflow-settings.json`, `clipflow-tokens.json`, `clipflow-publish-log.json`) have plain string keys matching our defaults. v11's reader loads them unchanged.

### File impact

| File | Action | Why |
|---|---|---|
| `package.json` | Modify | Bump `electron-store: ^8.0.0` → `^11.0.2`. |
| `src/main/store-factory.js` | **Create** | Tiny helper: caches `import("electron-store")` result and exposes `createStore(options)`. Keeps the dynamic-import boilerplate out of every consumer. |
| `src/main/main.js` | Modify | Remove the top-level `const Store = require(...)` and `const store = new Store({...})` (lines 19, 137-207). Remove the top-level migration code (lines 209-279). Declare `let store;` at module scope above handler registrations. Inside `app.whenReady().then(async () => ...)` at line 362, BEFORE existing body: `store = await createStore({ name: "clipflow-settings", defaults: {...} })`, then run migrations, then `llmProvider.init(store)` + `transcriptionProvider.init(store)`, then the existing `fileMigration.migrateStoreData(store)` call, then `await publishLog.init()` and `await tokenStore.init()`, then the existing body continues (createWindow, etc.). No changes to the 118 handler registrations or their bodies. |
| `src/main/publish-log.js` | Modify | Remove `const Store = require(...)` and the top-level `new Store({...})`. Add `let logStore = null` at module scope. Add `async function init() { logStore = await createStore({ name: "clipflow-publish-log", defaults: { entries: [] } }); }`. Export `init` alongside existing exports. Internal functions (`logPublish`, `getRecentLogs`, `getLogsForClip`, `clearLogs`) stay synchronous — they read the resolved `logStore` binding. |
| `src/main/token-store.js` | Modify | Same pattern: remove top-level Store/new, add `let tokenStore = null`, add async `init()`, export it. All exported functions (`saveAccount`, `getAccount`, `getAllAccounts`, `getAccountsForUI`, `removeAccount`, `updateTokens`) stay synchronous — the binding is assigned before they're called. |
| `src/main/ai/transcription-provider.js` | Modify | Delete `const Store = require("electron-store");` at line 16. Unused at runtime (JSDoc-only). No behavioral change. |
| `package-lock.json` | Auto | Updated by `npm install`. Expect transitive dep changes (v11 uses `conf@13` which has its own tree). |

### Steps (in execution order)

1. `npm i electron-store@^11.0.2`. Expect transitive changes; no other bumps in this commit.
2. Create `src/main/store-factory.js`:
   ```js
   let _StoreClass = null;
   async function loadStoreClass() {
     if (!_StoreClass) {
       const m = await import("electron-store");
       _StoreClass = m.default;
     }
     return _StoreClass;
   }
   async function createStore(options) {
     const Store = await loadStoreClass();
     return new Store(options);
   }
   module.exports = { createStore };
   ```
3. Edit `src/main/publish-log.js`: swap `require + new Store` for `let logStore = null` + async `init()`. Export `init`.
4. Edit `src/main/token-store.js`: same pattern.
5. Edit `src/main/ai/transcription-provider.js`: delete line 16.
6. Edit `src/main/main.js`:
   - Remove `const Store = require("electron-store")` (line 19).
   - Replace the top-level `const store = new Store({...})` (137-207) + all migrations (209-279) + `llmProvider.init(store)` (218) + `transcriptionProvider.init(store)` (219) with a single `let store;` declaration. Keep the defaults object captured as a module-scope `const STORE_DEFAULTS = {...}` so the big object literal doesn't clutter the whenReady handler.
   - Extract the migration block into `function runStoreMigrations(store) { ... }` at module top. Pure function; no behavior change.
   - In the existing `app.whenReady().then(async () => {...})` body at line 362, insert BEFORE `logger.initialize()`:
     ```js
     store = await createStore({ name: "clipflow-settings", defaults: STORE_DEFAULTS });
     runStoreMigrations(store);
     llmProvider.init(store);
     transcriptionProvider.init(store);
     await publishLog.init();
     await tokenStore.init();
     ```
     Keep the existing `fileMigration.migrateStoreData(store)` call at its current position (after `database.init()`).
7. `node --check src/main/main.js && node --check src/main/publish-log.js && node --check src/main/token-store.js && node --check src/main/store-factory.js && node --check src/main/ai/transcription-provider.js`. All must pass.
8. **Back up Fega's real data before launching.** Copy `%APPDATA%\clipflow\clipflow-settings.json`, `clipflow-tokens.json`, `clipflow-publish-log.json` to a timestamped backup folder. If anything goes wrong in the launch, restore and revert.
9. `npm run build:renderer && npm start`. Launch should succeed with no `ERR_REQUIRE_ESM` or module-load errors in `%APPDATA%\clipflow\logs\main.log`.
10. Smoke-test matrix (below).
11. Update `CHANGELOG.md` + `HANDOFF.md`. Single commit. Close #52 with the commit SHA.

### Verification (standing matrix + upgrade-specific items)

**Standing matrix (every infra hop — non-negotiable):**
1. **#35 zoom-slider drag repro × 10** on a 30-min source — no crash.
2. **Drop-to-Rename** — drag an `.mp4` from Downloads onto Rename tab → file appears in Pending list.
3. **Drop-to-Upload** — drag onto Recordings tab → import-progress + game-name modal both fire.

**H5-specific:**
4. App launches on Fega's existing store data — no settings loss. Spot-check: Settings tab shows the correct watch folder, games DB is populated, `creatorProfile` has the archetype + description, OAuth-connected platforms still appear connected in the Queue tab, Publish Log still shows historical entries.
5. Fresh-install path still runs all migrations. Test by temporarily renaming `%APPDATA%\clipflow\clipflow-settings.json` → launch → verify defaults populate + `deviceId` is generated + `onboardingComplete` is `false` → quit → restore original file.
6. Write persistence: change the `mainGame` dropdown in Settings → quit app → relaunch → confirm persisted.
7. Token store: a connected platform still publishes successfully (optional — dry-run a publish if Fega has bandwidth).
8. Publish log: after one publish, `publishLog:getRecent` returns the new entry (verifiable via the Queue tab's publish-log UI).
9. Watcher still works post-upgrade (guards against ordering bug in bootstrap): OBS real-record 30s → Stop → Rename card appears ~2s later.

### Risks & mitigations

- **Ordering bug in bootstrap.** If an IPC handler fires before `store` is assigned, it throws on `store.get(...)`. Mitigation: handlers register at module top but are only invoked by the renderer, which doesn't load until `createWindow()` runs inside `whenReady` — after the store is assigned. The async assignment is awaited before `createWindow()` is called. Sanity check in step 10 smoke matrix.
- **A module imports `publishLog` or `tokenStore` and calls an exported function at module-top.** Grep confirms no current caller does this (all uses are inside handler bodies), but this would break if anyone adds such a call in the future. Mitigation: document the `init()` contract in a comment at the top of each module.
- **v11 changed on-disk JSON shape.** Not per the release notes — it's still plain JSON at the same path. Mitigation: the backup in step 8 is the safety net. If v11 refuses to read an existing file, revert the commit, restore the backup, and file a follow-up.
- **Atomic-write semantics differ under a crash mid-write.** The issue body flags this explicitly. Mitigation: can't realistically repro a mid-write crash in a manual session. If Fega sees corruption in the future, that'd be its own investigation.
- **`--legacy-peer-deps` may flare up during install.** v11's peer deps don't clash with ours, but `npm install` may still surface the `react-scripts`-era `--legacy-peer-deps` flag (session 13 removed the need, but it's still a habitual workaround). If install fails cleanly, drop the flag; if it complains, run without and check the actual peer conflict.
- **Rollback.** Single commit. `git revert` + restore backup from step 8. Two-attempt rule applies — if the second fix-and-relaunch attempt fails, stop and re-read everything from scratch instead of guess-patching.

### Plan decision points (need Fega's call before I start)

1. **Go or hold?** Go = execute. Hold = pick #57 (editor perf) or #59 (editor render without queuing) instead.
2. **Extract the store init into its own `src/main/app-store.js` module, or keep it inline in `main.js`?** Recommendation: **keep inline** — migrations reference `logger`, ordering matters with `fileMigration`/`llmProvider`/`transcriptionProvider`/`publishLog`/`tokenStore`, and splitting creates a larger diff with no behavior gain this session. Future session can extract if main.js bloat becomes the target.
3. **Commit strategy.** Single commit, per the pattern used for H6 + H8 + chokidar. No two-commit split — the swap is atomic (can't land the dep bump without the async plumbing).

---

## 🔲 DEFERRED — Editor perf on 30-min sources (#57) — fix direction at #57 comment 4267674430

**Context:** Electron 29 landed cleanly (hop 1, commit `46546de`). During testing, 30-min source playback in the editor showed severe lag: ~2fps feel, stuck waveform, subtitle highlight drift, left-panel auto-scroll broken during playback. Fega's call: fix this before hop 2, because hop 2→4 verification depends on being able to actually test the editor on long sources.

### Root causes (confirmed by reading code)

**RC-1: Subtitle overlay does O(N) filter on every 60fps frame.**
`PreviewPanelNew.js:1080` filters ALL subtitle segments (`currentTime >= startSec && currentTime <= endSec`) every render. PreviewPanelNew re-renders 60 times/sec (from `currentTime` sub at :417). On a 30-min source with 500+ segments → ~30,000 comparisons/second just to find 1-2 active segments.

**RC-2: Active-segment derivation scans all segments per frame in two places.**
- `LeftPanelNew.js:437-442` (TranscriptTab) — `activeWordIdx` scans from end of `allWords` on every render. With 5000+ words, that's 5000 comparisons × 60fps = 300,000 ops/sec.
- `LeftPanelNew.js:653-662` (SubtitlesTab) — `editSegments.find(...)` in an effect that runs every `adjustedTime` change (i.e., every currentTime update = 60fps).

**RC-3: TimelinePanelNew re-renders its entire tree 60×/sec.**
It subscribes to `currentTime` at line 36 AND runs its own rAF setSmoothTime at 60fps (line 112-134). Either one alone causes 60Hz re-renders of the whole panel, including waveform canvas, NLE segment rects, subtitle blocks spanning the full 30min. The "smooth playhead via rAF + local state" pattern was an attempt at decoupling but smoothTime is held in the parent component's state, so every frame still rebuilds the parent tree.

**RC-4: `[DBG ...]` console.log spam in playback hot paths.**
- `PreviewPanelNew.js:789-793` — logs first 10 tick frames per play
- `PreviewPanelNew.js:807, 827, 892, 894, 896, 899` — tick seek, onTimeUpdate, play effect
- `usePlaybackStore.js` — togglePlay, seekTo, mapSourceTime (per earlier read)

Each console.log with DevTools open is ~0.5-1ms in renderer. Thousands of these per play session. Main impact only when DevTools is actually open — but we currently force-open it.

**RC-5: DevTools unconditionally force-opened at `src/main/main.js:324`.**
Known 10-30% renderer perf penalty on heavy pages. Currently opens in production builds too.

**RC-6: Left-panel auto-scroll only fires on pause.**
`LeftPanelNew.js:665-669` — `activeSegRef.current.scrollIntoView({behavior: "smooth"})` fires on `activeSegId` change. Under 60fps re-render pressure, React never commits long enough for smooth-scroll animation to start; pausing releases the pressure and the queued scroll commits. Consequence of RC-2, not an independent bug.

### Fix strategy (phased by risk & impact)

**Phase A — Free wins (zero refactor, minutes):**
- A1. Gate DevTools force-open behind `isDev` at `src/main/main.js:324`.
- A2. Strip all `[DBG ...]` `console.log` calls from playback hot paths: `src/renderer/editor/stores/usePlaybackStore.js` (togglePlay, seekTo, mapSourceTime) and `src/renderer/editor/components/PreviewPanelNew.js` (tick :789-793, :807, onTimeUpdate :827, playEffect :892-899).

**Phase B — Derived discrete-state selectors (core fix, 1-2 hours):**
- B1. In `usePlaybackStore.js`, extend the store with three derived indices that update inside `setCurrentTime`:
  - `activeSubtitleSegId` — id of the edit segment whose `[startSec, endSec]` contains current time, or `null`.
  - `activeTranscriptWordIdx` — index into the flat word list whose `start ≤ currentTime`, or `-1`.
  - (Skip `activeNleSegId` for now — nleSegments are few and not in a 60fps render path.)
  
  Use forward-scan-from-last-index in `setCurrentTime` (O(1) amortized during playback, O(N) on seek — fine). The derived values use Zustand's default `===` equality, so subscribers re-render only when the index changes (5-10×/sec, not 60×/sec). Needs the subtitle word list accessible to the playback store — either pass it via a dependency injection hook or make the playback store read `useSubtitleStore.getState().originalSegments` directly when computing.

- B2. In `PreviewPanelNew.js`, change line 1080's `.filter((seg) => seg.text && currentTime >= seg.startSec && currentTime <= seg.endSec)` to look up by `activeSubtitleSegId` and scope to just that seg's words. Subscribe to `activeSubtitleSegId` instead of (or in addition to) `currentTime` at the top level.

- B3. In `LeftPanelNew.js` TranscriptTab (line 363+), replace the `useMemo(() => {...scan allWords...}, [allWords, adjustedTime])` for `activeWordIdx` with a subscription to `activeTranscriptWordIdx` from the store. Component stops re-rendering at 60fps.

- B4. In `LeftPanelNew.js` SubtitlesTab (line 608+), replace the `editSegments.find(...)` inside the useEffect with a subscription to `activeSubtitleSegId` and drive the `setActiveSegId` call from that.

- B5. In `TimelinePanelNew.js`, remove the top-level `currentTime` subscription at line 36. It's used at:
  - Line 686 (center-on-playhead effect) — only needed when paused or on seek; can read via `getState()` inside the effect or depend on a `seekCounter` that increments per seek.
  - Line 787 (current-time display text) — move to a small child component that subscribes to a 10fps-quantized `displayTime` selector (add `displayTime` to store, update in setCurrentTime every 100ms).
  - Line 547, 1086 — called from event handlers via `getState()` already, so line 36 subscription isn't needed for those.
  - Line 1042 (WaveformTrack `currentTime` prop) — change prop to `smoothTime` or have WaveformTrack subscribe to its own thing.
  - Line 164 `playheadTime = playing ? smoothTime : currentTime` — when paused, can read via `getState()` once on effect.

**Phase C — Extract hot nodes to children (only if A+B insufficient, 1-2 hours):**
- C1. Extract the Playhead DOM node in `TimelinePanelNew` to a dedicated `<TimelinePlayhead />` child that owns its own rAF loop + smoothTime state. Parent TimelinePanelNew drops from 60Hz to segment-change-rate re-renders.
- C2. Extract the SubtitleOverlay in `PreviewPanelNew` to a `<SubtitleOverlay />` child that subscribes to its own `activeSubtitleSegId` + mapped-segment lookup. Parent PreviewPanel drops to change-rate.

Only pursue Phase C if Phase B measurements show parent re-renders still costing >3ms/frame on 30-min sources.

### Files to modify

| File | Phase | Change |
|---|---|---|
| `src/main/main.js` | A1 | Gate `webContents.openDevTools()` at line 324 behind `isDev` |
| `src/renderer/editor/stores/usePlaybackStore.js` | A2, B1 | Strip DBG logs; extend `setCurrentTime` to compute `activeSubtitleSegId`, `activeTranscriptWordIdx`, and `displayTime` (100ms-quantized) |
| `src/renderer/editor/components/PreviewPanelNew.js` | A2, B2, (C2) | Strip DBG logs; replace segs filter with `activeSubtitleSegId` lookup; optionally extract SubtitleOverlay child |
| `src/renderer/editor/components/TimelinePanelNew.js` | B5, (C1) | Drop top-level `currentTime` sub; route remaining uses through `smoothTime` / `getState()` / `displayTime`; optionally extract Playhead child |
| `src/renderer/editor/components/LeftPanelNew.js` | B3, B4 | TranscriptTab: sub to `activeTranscriptWordIdx`. SubtitlesTab: sub to `activeSubtitleSegId` |

No editor store schema changes. No IPC changes. No main-process logic changes beyond A1.

### Verification criteria ("done means...")

All on a 30min+ source recording in the editor:
1. Clip opens in < 3s (currently: slow, multiple seconds).
2. Video plays back smoothly — no visible judder in preview, playhead glides along timeline at 60fps perceived.
3. Subtitle highlight in LeftPanel tracks audio with < 100ms perceived lag.
4. Left-panel auto-scroll fires during playback, not only on pause.
5. Subtitle overlay on preview switches between segments at the exact word boundary (behavior parity with short-source case).
6. Waveform renders within 10s of clip open. If still broken, file sub-issue — separate concern.
7. Short-source (< 2 min) playback has no regression: all existing editor behaviors preserved.
8. #35 zoom-slider-drag repro × 10 on 30-min source — still no crash (hop 1 regression check).
9. `npx react-scripts build && npm start` — no console errors/warnings in production build.

### Risks & rollback

- **Risk:** derived state in setCurrentTime runs on every seek; if the subtitle word list is huge (10,000+ words), even the forward-scan could cost on a long seek. Mitigation: bisect-search on big jumps, forward-scan on forward deltas ≤ 1s.
- **Risk:** `activeSubtitleSegId` in playback store creates a cross-store dependency (playback reads subtitle list). Keep it as a lazy read from `getState()`, not a subscription.
- **Risk:** Phase B changes subscription patterns across 5 files — regression surface is wide. Mitigation: tight verification matrix, commit Phase A and Phase B as separate commits so bisect works.
- **Rollback:** each phase is its own commit; revert in reverse order.

### Estimated time
- Phase A: 15-20 min (trivial edits + build/smoke)
- Phase B: 90-120 min (store extension + 4 component changes + verification pass)
- Phase C: 60-90 min IF needed (judgment call after Phase B)

### Plan decision points (need Fega's call before I start)

1. **Go or wait?** Go = implement Phase A+B now. Wait = stay in Hop 1 wrap mode and do this in a future session.
2. **Commit strategy?** Two commits (A, B) or one? I recommend two — cleaner bisect if B regresses something.
3. **Phase C gate?** Implement only if B measurements show parent re-renders >3ms/frame, or pre-approve to just do it?

---

## ✅ Complete — Video Splitting & Drag-and-Drop (Phase 1)

**Spec:** `video-splitting-spec-v3.md` (Section 13, Phase 1)

### Step 1 — Settings additions ✅
**Files:** `src/main/main.js` (store defaults + migration), `src/renderer/views/SettingsView.js` (UI)
- [x] Add `splitThresholdMinutes: 30`, `autoSplitEnabled: true`, `splitSourceRetention: "keep"` to electron-store defaults
- [x] Add migration block for existing installs (set defaults if keys don't exist)
- [x] Add "Video Splitting" section in SettingsView near Watch Folder — toggle for auto-split, threshold slider (10-120), keep originals toggle, help text
- [x] Verify: app builds, Settings shows new section, values persist across restart

### Step 2 — Schema migration ✅
**Files:** `src/main/database.js`, `src/main/main.js`, `src/main/ai-pipeline.js`, `src/main/naming-presets.js`
- [x] Add columns: `split_from_id TEXT`, `split_timestamp_start REAL`, `split_timestamp_end REAL`, `is_split_source INTEGER DEFAULT 0`, `import_source_path TEXT`
- [x] Add index: `idx_file_split_from` on `split_from_id`
- [x] Update `allRenamed` query to exclude `status = 'split'`
- [x] `byStatus` already accepts any status string — no change needed
- [x] `updateFileStatus` guards against overwriting `"split"` status
- [x] `applyPendingRenames` skips files with `"split"` status
- [x] `isFileInUse` returns false for `"split"` files
- [x] Verify: app builds, migration v3 runs, existing data loads, schema verified

### Step 3 — FFmpeg split module ✅
**Files:** `src/main/ffmpeg.js` (new `splitFile` function)
- [x] Add `splitFile(inputPath, splitPoints, outputDir)` — stream copy, `-avoid_negative_ts make_zero`
- [x] All-or-nothing: if any segment fails, delete partial outputs, throw error
- [x] Post-split probe: run `probe()` on each output, calculate keyframe-adjusted cumulative times
- [x] Return array of `{filePath, actualStartSeconds, actualEndSeconds}`

### Step 4 — `splitFile` IPC endpoint ✅
**Files:** `src/main/main.js` (handler), `src/main/preload.js` (bridge)
- [x] Add `ipcMain.handle("split:execute", ...)` — resolves parent file, calls `ffmpeg.splitFile()`, creates child `file_metadata` records, sets parent `is_split_source=1` + `status="split"`
- [x] Logs split action in `rename_history` with `action = "split"` and child IDs in metadata_snapshot
- [x] Add `splitExecute` to preload bridge

### Step 5 — `importExternalFile` IPC endpoint
**Files:** `src/main/main.js` (handler + `pendingImports` Set), `src/main/preload.js` (bridge)
- [ ] Add `pendingImports = new Set()` in main process scope
- [ ] Add `ipcMain.handle("import:externalFile", ...)` — validates .mp4, adds `{filename, sizeBytes}` to `pendingImports`, copies to `{watchFolder}/{YYYY-MM}/filename.mp4`, removes from set on completion
- [ ] Add `ipcMain.handle("import:cancel", ...)` — deletes copied file, removes from `pendingImports`
- [ ] Emit progress events during copy for large files
- [ ] Add `importExternalFile`, `importCancel` to preload bridge
- [ ] Verify: file copies correctly, progress events fire

### Step 6 — File watcher suppression
**Files:** `src/main/main.js` (watcher `add` handler)
- [ ] In chokidar `watcher.on("add")`, check `pendingImports` before processing — if filename+size matches an entry, skip (the drag-and-drop flow owns this file)
- [ ] Verify: dropping a file doesn't create duplicate entries

### Step 7 — Auto-split integration in Rename tab
**Files:** `src/renderer/views/RenameView.js`
- [ ] On file detection (watcher or drop), probe duration via `clipflow.ffmpegProbe()`
- [ ] If duration > threshold and `autoSplitEnabled`: show split badge on card ("2h 14m — will split into 5 parts")
- [ ] Add "Don't split" per-file toggle
- [ ] On rename confirm: if splitting, call `clipflow.splitExecute()`, show split preview with resulting filenames + time ranges, then show progress ("Splitting... 3 of 5 done")
- [ ] After split: child files appear as new pending cards (or go straight to renamed if auto-split during rename)
- [ ] Verify: long file shows indicator, split produces correct files, short files unaffected

### Step 8 — Drag-and-drop on Rename tab
**Files:** `src/renderer/views/RenameView.js`
- [ ] Add drop zone overlay (dashed border, "Drop recording here") on dragover
- [ ] Validate `.mp4` only — toast for non-mp4
- [ ] Single file only — toast "Drop one file at a time" for multi
- [ ] On drop: call `clipflow.importExternalFile(sourcePath)` → show copy progress → file appears in Pending list
- [ ] If no watch folder configured: show folder picker prompt first
- [ ] Verify: drag .mp4 from Downloads → appears in Pending, drag .mkv → rejected with toast

### Step 9 — Drag-and-drop on Recordings tab + Quick-import modal
**Files:** `src/renderer/views/UploadView.js`, new modal component
- [ ] Add same drop zone overlay as Rename tab
- [ ] On drop: copy file, then show quick-import modal
- [ ] Modal Step 1: game/content dropdown (required)
- [ ] Modal Step 2 (conditional): split proposal — green "Split & Generate" primary, gray "Skip splitting" secondary
- [ ] Modal Step 3: confirm preview — filenames + time ranges, "Generate Clips" button
- [ ] On confirm: create `file_metadata` with preset 3 (Tag+Date), set status `processing`, start pipeline
- [ ] On cancel/dismiss: delete copy, remove from pendingImports
- [ ] Verify: drop → modal → pick game → generate → file appears in grid with processing status

### Step 10 — Rename history logging for splits
**Files:** `src/main/database.js` or split handler in main.js
- [ ] Log split operations with `action = "split"` in `rename_history`
- [ ] Store child file IDs in `metadata_snapshot` JSON
- [ ] No undo button in v1 — informational only
- [ ] Verify: History sub-tab shows split entries

---

## ✅ Complete — Video Splitting Phase 2: Game-Switch Scrubber

**Spec:** `video-splitting-spec-v3.md` (Section 13, Phase 2)

### Step 11 — Thumbnail generation ✅
**Files:** `src/main/ffmpeg.js`
- [x] Add `generateThumbnailStrip(inputPath, fileId)` — FFmpeg `fps=1/30,scale=320:-1`, returns thumbnails array with timestamps
- [x] Add `cleanupThumbnailStrip(thumbDir)` — removes temp directory
- [x] Stores thumbnails in `os.tmpdir()/clipflow-thumbs/{fileId}/`

### Step 12 — `generateThumbnails` / `cleanupThumbnails` IPC endpoints ✅
**Files:** `src/main/main.js`, `src/main/preload.js`
- [x] `ipcMain.handle("thumbs:generate")` with in-memory cache by filePath
- [x] `ipcMain.handle("thumbs:cleanup")` removes from cache and deletes temp dir
- [x] Cleanup all cached thumb dirs on `window-all-closed`
- [x] Bridge: `clipflow.generateThumbnails(filePath)`, `clipflow.cleanupThumbnails(filePath)`

### Step 13 — Scrubber UI component ✅
**Files:** `src/renderer/components/ThumbnailScrubber.js` (new)
- [x] Horizontal scrollable thumbnail strip with time labels every 5/10 min
- [x] Click-to-place split markers (purple vertical lines with dot handles)
- [x] Click existing markers to remove them
- [x] Per-segment game/content dropdown (grouped, reuses shared Select + GamePill)
- [x] 1-minute minimum segment enforcement
- [x] Loading state with animated progress bar
- [x] Segment list with time ranges, durations, and color indicators
- [x] Hover time preview on strip

### Step 14 — Game-switch split integration in Rename tab ✅
**Files:** `src/renderer/views/RenameView.js`
- [x] "Multiple games" button on every pending file card (subtle, toggles scrubber)
- [x] ThumbnailScrubber expands below file card when opened
- [x] `gameSwitchSplitAndRename()` — splits by markers with per-segment tags
- [x] Compound splitting: game-switch → auto-split per long segment
- [x] RENAME button text updates to "SPLIT & RENAME" when markers are placed
- [x] `renameOne` and `renameAll` both handle game-switch splits
- [x] Scrubber cleanup on rename, cancel, hide, and rename-all
- [x] Thumbnail cleanup via IPC on close/rename

---

## 🔲 In Progress — Queue Tab Phase 1: Clip Card Redesign

**Plan doc:** `C:\Users\IAmAbsolute\Desktop\ClipFlow stuff\queue-tab-redesign-plan.md`

### Step 1 — Thumbnail extraction at render time
**Files:** `src/main/main.js` (render:clip handler), `src/main/ffmpeg.js` (new `extractThumbnail` fn), `src/main/projects.js` (updateClip)
- [ ] Add `extractThumbnail(videoPath, outputPath, timeSeconds=1)` to ffmpeg.js — single frame, JPEG, ~320px wide
- [ ] In `render:clip` IPC handler: after successful render, call `extractThumbnail(result.path, thumbPath)` where thumbPath = `{renderDir}/{clipTitle}_thumb.jpg`
- [ ] Pass `thumbnailPath` to `projects.updateClip()` alongside `renderPath` and `renderStatus`
- [ ] Verify: render a clip → `.jpg` appears next to rendered `.mp4`, clip object has `thumbnailPath` set

### Step 2 — Add `dequeued` status + remove-from-queue button
**Files:** `src/renderer/views/QueueView.js`, `src/main/projects.js`
- [ ] Add "X" button on each clip card (visible on hover or always visible)
- [ ] On click: call `window.clipflow.projectUpdateClip(projectId, clipId, { status: "dequeued" })`
- [ ] Update QueueView filter to exclude `status === "dequeued"` (currently only includes `"approved"` / `"ready"`)
- [ ] Verify: X button removes clip from queue, clip doesn't reappear, re-approving in Editor re-queues it

### Step 3 — Clip card redesign (thumbnail + metadata + inline title)
**Files:** `src/renderer/views/QueueView.js`
- [ ] Replace text-only card with new layout: `[Thumbnail 80x45] [Title + metadata] [Status badge] [X button]`
- [ ] Thumbnail: show `clip.thumbnailPath` image if exists, fallback placeholder (film icon) if null
- [ ] Metadata row below title: duration (`endTime - startTime`), game tag badge (colored pill), source project name, render status
- [ ] Inline title editing: double-click title → contentEditable or input field → blur/Enter saves via `projectUpdateClip`
- [ ] Keep existing status badges (Published, Publishing, Failed, Scheduled, Not rendered)
- [ ] Keep left border color coding (main game = accent, other = green)
- [ ] Verify: cards show thumbnails, metadata is accurate, title edits persist

### Step 4 — Drag-to-reorder with @dnd-kit
**Files:** `package.json`, `src/renderer/views/QueueView.js`
- [ ] Install `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`
- [ ] Wrap clip list in `DndContext` + `SortableContext`
- [ ] Each clip card becomes a `useSortable` item with drag handle (grip icon on left)
- [ ] On reorder: persist `queueOrder` (integer) on each clip via `projectUpdateClip`
- [ ] QueueView sorts clips by `queueOrder` (nulls sort to end by `createdAt`)
- [ ] Reorder works across all clips regardless of game type
- [ ] Verify: drag clips up/down, order persists across tab switch and app restart

### Step 5 — Build + verify all changes
- [ ] `npx react-scripts build` succeeds
- [ ] `npm start` — app launches, no console errors
- [ ] Queue tab shows redesigned cards with thumbnails (for rendered clips)
- [ ] Remove from queue works (X button → clip disappears)
- [ ] Inline title edit works (double-click → edit → save)
- [ ] Drag-to-reorder works (grip handle → drag → new order persists)
- [ ] Publish flow still works (select clip → Publish Now → sequential platform publish)
- [ ] No regressions in Editor, Projects, Rename, or Tracker tabs

---

## 🔲 Paused — Remove Legacy Features (OBS Log Parser + Voice Modes)

> Paused — resume after Queue Phase 1.

### Goal
Remove two legacy features that are no longer useful for a commercial product: the OBS log parser (game detection) and the hype/chill voice mode toggle. Both are either dead code or redundant with newer systems.

### Feature 1 — OBS Log Parser Removal

**Status:** Dead code — built but never wired into the UI. Game detection works via filename + manual dropdown.

**What to remove:**
- [ ] `src/main/main.js` lines ~401-442 — `obs:parseLog` IPC handler (reads OBS logs, extracts game .exe names)
- [ ] `src/main/preload.js` line ~28 — `parseOBSLog()` bridge method
- [ ] `src/renderer/views/RenameView.js` line ~313 — "OBS LOG" cyan status badge (decorative, no logic)
- [ ] `src/renderer/views/RenameView.js` line ~297 — subtitle text referencing OBS specifically
- [ ] `.claude/rules/pipeline.md` — OBS log parsing rules (if present)

**What to KEEP:**
- `RAW_RECORDING_PATTERN` regex and chokidar file watcher — this is active file detection, not log parsing
- Manual game dropdown selector — this is the real game assignment UI
- All game detection logic in RenameView (filename-based, not OBS-dependent)

### Feature 2 — Hype/Chill Voice Mode Removal

**Status:** Redundant — archetype + description + momentPriorities already convey tone more precisely.

**What to remove:**
- [ ] `src/renderer/editor/stores/useAIStore.js` — `voiceMode` state (line ~6), setter (line ~17), prompt injection ternary (line ~45), reset (line ~95)
- [ ] `src/renderer/editor/components/RightPanelNew.js` lines ~632-661 — voice mode toggle UI (fire/chill emoji buttons)
- [ ] `src/renderer/views/OnboardingView.js` — `ARCHETYPE_VOICE` mapping (lines ~31-37), voiceMode state (line ~71, ~92), PersonalityStep voice toggle UI (lines ~317-373), voiceMode in finishOnboarding (line ~105)
- [ ] `src/renderer/views/SettingsView.js` lines ~1074-1089 — "Default Title Style" toggle section, voiceMode in default profile (~947, ~973)
- [ ] `src/main/main.js` lines ~159-165 — `voiceMode` in creatorProfile store defaults

**What to KEEP:**
- `userContext` parameter flow in useAIStore.generate() — just drop the voice ternary, keep `aiContext`
- `archetype` field and all archetype logic — this stays
- `description` field — this stays
- `momentPriorities` — this stays
- `getArchetypePersonality()` in ai-prompt.js — not voice-dependent

### Verification
- [ ] Build succeeds (`npx react-scripts build`)
- [ ] App launches (`npm start`)
- [ ] Rename view works — file watcher active, game dropdown functional, no "OBS LOG" badge
- [ ] Editor AI panel — no voice toggle, title generation still works
- [ ] Onboarding wizard — screen 3 still has description textarea, no voice toggle
- [ ] Settings AI Preferences — no "Default Title Style" section, rest intact
- [ ] No console errors or missing references

---

## 🔲 Paused — Split Instagram & Facebook into Independent Login Flows

> Paused while we clean up legacy features. Plan is still valid — resume after this task.

(See git history commit for full plan, or check previous version of this file)

---

## 🔲 Planned — Backend Infrastructure for Commercial Launch

> All items labeled `milestone: commercial-launch` on GitHub. Build order reflects dependencies.

### Phase 1 — Foundation (must come first)
- [ ] **#20 — Supabase backend: auth, database, Edge Functions**

### Phase 2 — Security (move secrets off-device)
- [ ] **#21 — Migrate OAuth flows to server-side proxy**
- [ ] **#22 — Move Anthropic API key server-side, proxy AI calls**

### Phase 3 — Monetization
- [ ] **#23 — LemonSqueezy payments + license key management**

### Phase 4 — Distribution
- [ ] **#19 — Auto-updates with electron-updater + code signing**

### Phase 5 — Observability
- [ ] **#24 — Sentry crash reporting**
- [ ] **#25 — Product analytics (PostHog)**

---

## 🔲 Planned — Editor Autosave (Option A — renderer-crash resilience)

> Context: #35 renderer crashes (`blink::DOMDataStore` 0xC0000005) are pre-existing, 57 Sentry events total, happen in editor AND projects tab, wipe all unsaved edits. Explicit Save button is the only current persistence path. Autosave turns every crash into at most ~500ms of lost work.
>
> **Why this first, before fixing the crash itself:** the crash is a native Chromium bug — repro is racy, fix is uncertain. Autosave is a known-good solution that makes the crash non-destructive, buying time to investigate #35 properly.

### Scope
Silently persist editor state to disk during editing. No UI change (no "Saving…" spinner, no flash — the existing Save button stays exactly as-is for explicit user confirmation). On reopen, `loadClip` already restores everything — zero restore-path changes needed.

### What gets saved (reuses existing `handleSave` payload)
Everything `useEditorStore.handleSave` at `useEditorStore.js:1079` already writes via `window.clipflow.projectUpdateClip`:
- `subtitles.sub1` (source-absolute edit segments) — from `useSubtitleStore.editSegments`
- `captionSegments` + `caption` text — from `useCaptionStore`
- `nleSegments` + `audioSegments` — from `useEditorStore`
- `subtitleStyle` (full per-clip snapshot — 30+ style keys) — from `useSubtitleStore` + `useLayoutStore.subYPercent`
- `captionStyle` (full per-clip snapshot) — from `useCaptionStore` + `useLayoutStore.capYPercent`
- `title` — from `useEditorStore.clipTitle`

Restore is already wired: `useEditorStore.js:137-153` calls `initSegments` + `restoreSavedStyle(clip.subtitleStyle)` + `restoreSavedStyle(clip.captionStyle)` + `setSubYPercent/setCapYPercent` on every `loadClip`.

### Triggers
1. **Debounced state change** — any write to `editSegments`, caption state, layout, style, title, or `nleSegments` → schedule save in 800ms. Coalesces rapid edits (typing, dragging sliders) into one IPC.
2. **Window blur** — flush immediately when focus leaves the window.
3. **`beforeunload`** — flush synchronously on reload/close (best-effort; renderer crashes bypass this, which is exactly why we need #1).
4. **Clip switch** — flush the outgoing clip before `loadClip` swaps to the new one.

### File impact
- `src/renderer/editor/stores/useEditorStore.js`
  - Add module-closure vars `_autosaveTimer`, `_autosaveInFlight` OUTSIDE the store (not in state — avoids infinite subscribe loop when timer is (re)set).
  - Add actions `scheduleAutosave()`, `flushAutosave()`, `_doSilentSave()`.
  - Extract the body of current `handleSave` (lines 1079-1141) into `_doSilentSave()` — pure persistence, no UI side effects. `handleSave` becomes a thin wrapper that calls `_doSilentSave()` — no behavior change for the Save button.
  - Guard in `scheduleAutosave`: `!clip || !project` → bail; `extending` → bail (FFmpeg extend/revert actively rewrites the source file + clip metadata). No `dirty` gate — style setters in RightPanelNew don't reliably call `markDirty`, and 800ms debounce absorbs the noise of saving on non-persistable state changes.
- `src/renderer/editor/components/EditorLayout.js`
  - In the existing `loadClip` effect (around line 536), subscribe to `useSubtitleStore`, `useCaptionStore`, `useLayoutStore`, `useEditorStore` — each listener calls `useEditorStore.getState().scheduleAutosave()`.
  - Return cleanup that unsubscribes + calls `flushAutosave()` before the next clip loads.
  - Top-level effect (once per editor mount): `window.addEventListener('blur', flushAutosave)`. Skip `beforeunload` — it can't synchronously IPC in Electron and renderer crashes bypass it anyway; the 800ms debounce + blur flush are what actually protect us.
- **No main-process changes.** `project:updateClip` IPC at `main.js:1463` is a partial merge (`{...old, ...updates}` in `projects.js:187`) — autosave won't clobber render-status writes.
- **No schema migration.** All fields written are already part of the clip shape.

### Steps
1. Extract `_doSilentSave` from `handleSave` body in `useEditorStore.js` — pure persistence, no UI side effects. Verify `handleSave` still flashes "Saved" exactly as before.
2. Add `scheduleAutosave` (800ms debounce) and `flushAutosave` (cancel timer + await `_doSilentSave` if pending) to `useEditorStore`.
3. Wire `window.blur` + `beforeunload` in `EditorLayout.js` (top-level effect, once per editor mount).
4. Wire per-store subscriptions in the `loadClip` effect. Track only the state keys that affect persistence — skip undo stacks, timer refs, transient UI flags. Unsubscribe + flush on effect cleanup (handles clip switch and editor unmount).
5. Add console log `[autosave] saved clipId=… in XXXms` at debug level so we can confirm in `trim-debug.log` after crashes.
6. Build + `npm start` + manually edit subtitles for 60s without clicking Save → force-kill the renderer via Task Manager → reopen clip → verify edits survived.

### Verification
- [ ] `npx react-scripts build` clean, no console warnings
- [ ] App launches, editor opens a clip
- [ ] Edit a subtitle word → wait 1s → check `trim-debug.log` for `[autosave] saved` line
- [ ] Rapid-fire 10 edits in 2s → see only 1–2 save calls (debounce works)
- [ ] Click away to another window → see immediate `[autosave] saved` (blur flush)
- [ ] Explicit Save button still shows "Saved" flash (regression check)
- [ ] Kill renderer via Task Manager mid-edit → reopen clip → all edits + styling + NLE segments + title restored
- [ ] Switch to another clip → outgoing clip's edits flushed before new clip's `loadClip` runs
- [ ] Sentry: no new error volume from autosave itself (watch for 24h)

### Follow-up (separate issues, not this task)
- Update #35 with fresh breadcrumb pattern + broader scope (projects tab crashes too, not just editor)
- #35 fix is still its own work — autosave mitigates, doesn't resolve

---

## ✅ Completed — Previous Tasks
(See git history for details)
