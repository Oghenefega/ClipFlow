# ClipFlow — Session Handoff
_Last updated: 2026-04-02 — "Pixel-Perfect Burn-In"_

## Current State
App builds and launches. Rendered clips now have pixel-perfect subtitle and caption burn-in matching the editor preview exactly. Feature is user-tested and confirmed working.

## What Was Built

### Pixel-Perfect Subtitle/Caption Burn-In
- Offscreen Electron BrowserWindow renders subtitles/captions using the same `subtitleStyleEngine.js` and CSS as the editor preview
- PNG frames captured at 10fps, composited onto source video via FFmpeg `image2` input
- All styling effects preserved: multi-ring strokes, glow, karaoke word highlighting, custom fonts (Latina Essential), caption positioning
- Frame count derived from ffprobe'd actual file duration (not calculated math) to prevent early cutoff

### New Files
- `src/main/subtitle-overlay-renderer.js` — offscreen BrowserWindow lifecycle, ffprobe resolution/duration probing, PNG frame capture
- `public/subtitle-overlay/index.html` — transparent HTML page for overlay rendering
- `public/subtitle-overlay/overlay-renderer.js` — DOM-based renderer with `findActiveWord`, `buildCharChunks`, `renderSubtitle`, `renderCaption`

### Modified Files
- `src/main/render.js` — replaced ASS subtitle generation with overlay compositing pipeline (`eof_action=pass`)
- `src/renderer/editor/components/EditorLayout.js` — `doQueueAndRender` passes full subtitle/caption style and segments via IPC
- `src/main/main.js` — IPC handler forwards captionStyle/captionSegments to render function

## Key Decisions
- ASS subtitles rejected — can't replicate CSS text-shadow, multi-ring strokes, glow, karaoke effects
- Offscreen BrowserWindow chosen because it reuses the exact same Chromium rendering engine
- Works fully offline (Chromium is bundled with Electron)
- 10fps overlay capture — subtitles change at word boundaries (~200-400ms), so 10fps is sufficient
- `eof_action=pass` instead of `shortest=1` — video continues naturally when overlay frames end
- ffprobe real duration instead of `endTime - startTime` math — prevents overlay/video length mismatch
- Subtitle `findActiveWord` uses `<=` end boundary (inclusive) to prevent early disappearance

## Bugs Fixed Along the Way
- `Identifier 'canvas' has already been declared` — executeJavaScript init block conflicted with overlay-renderer.js variable
- `An object could not be cloned` — FontFaceSet from `document.fonts.ready` isn't structured-cloneable; changed to `.then(() => true)`
- `log is not defined` — main.js used `log.error()` but variable is `logger`
- Subtitle timing mismatch — `__seekTo__` passed absolute source video time but segments use clip-relative (0-based) timing
- Last 0.5s cutoff — `shortest=1` terminated output when overlay ran out; switched to `eof_action=pass`
- Subtitle/caption early disappearance — frame count from calculated duration was shorter than actual file; now uses ffprobe

## Next Steps
1. **Test with multiple clips** — verify burn-in works across different durations, resolutions, and styling configurations
2. **Performance optimization** — 10fps capture on long clips (2+ min) may be slow; consider caching or parallelization later
3. **Sentry backlog** — 7 deferred items before launch
4. **Security hardening** — safeStorage encryption for credentials

## Watch Out For
- `subtitleStyleEngine.js` uses `module.exports` (CommonJS) — overlay-renderer.js loads it via `require()` with injected path
- Overlay HTML must be in `public/subtitle-overlay/` so CRA copies it to `build/`
- `enableLargerThanScreen: true` + `setContentSize()` needed for 1920px-tall offscreen windows on Windows
- CSP warning in terminal is expected and harmless — disappears when app is packaged
- Overlay renderer creates `_overlay_tmp/` directory next to output; cleaned up after render

## Logs / Debugging
- `[OverlayRenderer]` prefix in console logs — shows resolution, duration, frame count, file duration vs calculated
- `[Render]` prefix shows FFmpeg args including filter_complex
- electron-log writes to `%APPDATA%/ClipFlow/logs/app.log`
