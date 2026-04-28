# ClipFlow — Session Handoff
_Last updated: 2026-04-28 — Session 32 — Issue #76 lazy-cut pivot shipped. Next session: dead code audit across the codebase._

---

## One-line TL;DR

**Pipeline 506s → 397s (1.27×).** Lazy-cut architecture totally replaced the eager-cut model — the AI pipeline no longer materializes per-clip MP4s, the editor's recut handlers mutate `nleSegments` instead of re-encoding (instant edits), and the final MP4 is only ever produced at publish time on approved clips. Issue [#76](https://github.com/Oghenefega/ClipFlow/issues/76) closed alongside [#75](https://github.com/Oghenefega/ClipFlow/issues/75), [#41](https://github.com/Oghenefega/ClipFlow/issues/41), [#42](https://github.com/Oghenefega/ClipFlow/issues/42). Combined with session 31's optimization halves, the AI pipeline is now **810s → 397s (2.04×)** on the reference recording. Next session is a dead-code sweep — we agreed to do it in three reviewable passes after several feature-heavy sessions piled up potential leftovers.

---

## What just shipped (session 32)

### Issue #76 — lazy-cut architecture pivot

Source video + `nleSegments` is now the canonical clip representation. The cut work moved from AI-pipeline time to publish/render time and is paid only on clips the user approves.

**Files:** [src/main/ai-pipeline.js](src/main/ai-pipeline.js), [src/main/ffmpeg.js](src/main/ffmpeg.js), [src/main/main.js](src/main/main.js), [src/main/preload.js](src/main/preload.js), [src/main/render.js](src/main/render.js), [src/renderer/editor/stores/useEditorStore.js](src/renderer/editor/stores/useEditorStore.js), [src/renderer/views/ProjectsView.js](src/renderer/views/ProjectsView.js), [src/renderer/views/SettingsView.js](src/renderer/views/SettingsView.js).

- **Stage 7 (AI pipeline)** stops calling `cutClip`/`concatCutClip`. Each clip is persisted as `{ startTime, endTime, nleSegments: [{ id, sourceStart, sourceEnd }], filePath: null }` plus a thumbnail. Stage 7 went from **124.9s → 4.7s**.
- **Stage 7b retranscription** extracts audio directly from source ranges via the new `ffmpeg.extractAudioRange(sourceFile, wavPath, startSec, endSec, audioTrackIndex)` helper. The session-31 batched single-Python retranscription is preserved; only the audio-extract step changed. 18/18 successful retranscriptions on the reference run.
- **Recut IPC handlers** (`clip:extend`, `clip:extendLeft`, `clip:concatRecut`, `clip:recut`) mutate `nleSegments` + `startTime`/`endTime` and return them to the renderer. No ffmpeg call. Trim/extend/splice are effectively instant.
- **`render.js`** locks down precedence: `nleSegments + sourceFile` → legacy `clip.filePath` (only when source offline) → throw with clear error. No more silent fallback that could render the wrong range.
- **`render.js` consumes `clipCutEncoder` setting at publish time** — was hardcoded `libx264 -preset medium -crf 18`. The user's GPU pick from #75 is now honored at render time.
- **Editor renderer** (`useEditorStore`) syncs `nleSegments` from handler responses and pushes to `usePlaybackStore` so timeline/preview/playback stay coherent after edits.
- **`ProjectsView.ClipVideoPlayer`** plays source-with-seek for new clips (no clip MP4 on disk). `loadedmetadata` seeks to `clip.startTime`, the rAF loop reports clip-relative `currentTime`, playback pauses + snaps back at `clip.endTime`.
- **Settings UI labels** updated — "Render encoder" / "Parallel audio extracts" — same store keys, same semantics, different invocation point.
- **Removed dead code:** `ffmpeg.cutClip`, `ffmpeg.concatCutClip`, `ffmpeg:cutClip` IPC + preload bridge, `cutClipFast` helper in ai-pipeline.js, the now-unused `clipCutEncoder` resolution at AI pipeline Stage 0.

**Measured (reference 30-min RL recording, 18 clips this run vs 15 in session 31):**
- Pipeline total: **506.2s → 397.5s** (1.27×, 108s saved per source).
- Stage 7 (Clip Metadata, formerly Clip Cutting): **124.9s → 4.7s** (26.5×).
- Stage 7b retranscription: 80.7s on 15 clips → 92.7s on 18 clips (per-clip 5.4s → 5.15s — slightly faster).

User-confirmed in-app: editor opens session-31-era clips, plays correctly, trim/extend/splice all instant, render produces correct final MP4.

### Bug surfaced (filed for follow-up)

- **[#77](https://github.com/Oghenefega/ClipFlow/issues/77) — editor transcript panel highlights wrong segment during playback.** The subtitle overlay on the preview is correct; the left-panel transcript list highlights a different segment. Surfaced during the lazy-cut visual check on a session-31 legacy project. May be pre-existing or related to the playback-time mapping rewiring done in this session. Worth investigating in a follow-up.

---

## Why next session is a dead code audit

The user raised it at end of session: "we've had a ton of sessions lately, changing things… I wonder if we're just leaving legacy code that is now dead to pile up." Agreed and held off until the lazy-cut commit was checkpointed cleanly.

### Plan for the audit (three reviewable passes)

**Pass 1 — orphaned IPC handlers + preload bridges.**
- IPC handlers in [src/main/main.js](src/main/main.js) and [src/main/preload.js](src/main/preload.js) without renderer callers, vice versa.
- Preload methods exposed via `window.clipflow.*` that no renderer file reads.
- Cross-reference: grep all `ipcMain.handle("xxx:yyy", ...)` patterns vs `ipcRenderer.invoke("xxx:yyy", ...)` patterns. List orphans, user approves what to delete.

**Pass 2 — orphaned Zustand actions + state fields + legacy migration paths.**
- The 6 stores in `src/renderer/editor/stores/` — actions that aren't called, state fields that aren't read.
- Specifically check the `audioSegments` → `nleSegments` migration in `useEditorStore.initFromContext` — is the legacy field still being written somewhere, or can the migration code be deleted?
- `transcription` field handling — multiple paths set it; check what's actually consumed.

**Pass 3 — dead helpers, exports, stale TODOs.**
- Module exports with no importers.
- `// TODO`, `// FIXME`, `// removed`, `// deprecated` comments — many likely reference resolved issues.
- Unused constants, dead config keys.
- Files in `tasks/` (e.g. `subtitle-timing-rebuild-spec.md`, `nle-architecture-plan.md`, `cost-estimate.md`) — likely outdated planning docs that can be archived or deleted now that the work shipped.

### After the audit — tech summary refresh

The canonical technical summary lives at:
`C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\technical-summary.md`

Refresh it AFTER the cleanup so it documents the actual current state, not "current state + dead code we haven't deleted yet." Single file, no version number — overwrite per project rule. Definitely needs an update; pre-lazy-cut summary likely still references `clip.filePath` as load-bearing and the old eager-cut Stage 7.

---

## Other open candidates if not the audit immediately

- **[#77](https://github.com/Oghenefega/ClipFlow/issues/77)** — transcript panel highlight desync. Standalone bug, modest scope.
- **[#74](https://github.com/Oghenefega/ClipFlow/issues/74)** — Hide pipeline internals from end users (pre-launch UX). Smaller scope, must land before any external user runs the pipeline.
- **[#73](https://github.com/Oghenefega/ClipFlow/issues/73)** — Cold-start UX (branded splash + bundle code-splitting). Independent of pipeline.
- **[#70](https://github.com/Oghenefega/ClipFlow/issues/70)** — Rename watcher rigidity.

---

## Logs / debugging

- **App log:** `%APPDATA%\clipflow\logs\app.log` — main process events, IPC errors, store mutations. Look here for `[Render] Using NLE path...` (lazy-cut hit) vs `[Render] Falling back to legacy clip MP4...` (legacy path).
- **Pipeline logs:** `processing/logs/<videoName>_<ts>.log` — per-pipeline-run stdout/stderr from every step. Session 32 added a new line: `Lazy-cut: skipping MP4 materialization for N clips (final cuts happen at publish time)`. The `[DONE] Clip Cutting` line is gone, replaced by `[DONE] Clip Metadata (4.7s) — N clip ranges prepared (lazy-cut)`.
- **Latest reference log:** [processing/logs/RL_2026-10-15_Day9_Pt1_1777373571340.log](processing/logs/RL_2026-10-15_Day9_Pt1_1777373571340.log) — full session-32 in-app verification. Pipeline total 397.5s, all 6 signals green, 18/18 clips retranscribed.
- **Editor recut paths:** `electron-log` with scope `editor` — look for `ExtendRight (lazy)`, `ExtendLeft (lazy)`, `ConcatRecut (lazy)`, `Recut (lazy)`. Each logs the old + new boundaries. None should report any ffmpeg call or temp file creation.

---

## Watch out for

- **Don't write `clip.filePath` from any new code path.** It's tolerated as a legacy read-fallback (only used when `project.sourceFile` is offline) but every new clip has `filePath: null` and that's the invariant. Recut handlers explicitly preserve a legacy clip's existing filePath without overwriting it; the renderer dropped its `filePath: result.filePath` assignments.
- **Don't strip the `nleSegments`-precedence check in `render.js`.** The throw on missing segments is deliberate — silent fallback to source-only without segments would render the wrong range. The exact failure mode this prevents: a clip with empty `nleSegments` array would render the entire source recording end-to-end if the fallback chain wasn't tightened.
- **The `clipCutEncoder` setting now governs publish-time render encoding.** Don't undo the `buildEncoderArgs(encoder)` wiring in render.js — without it, lazy-cut would have silently removed the NVENC acceleration that #75 added.
- **`ProjectsView.ClipVideoPlayer` is now stateful around clip-relative time.** Don't change `currentTime` semantics without checking the rAF loop's bound-and-snap-back logic at `clipEnd - 0.05`. Subtitle/caption overlays receive clip-relative time; if you reintroduce a path where they get source-absolute time, the karaoke timing will desync (see #77 for a related symptom in a different panel).
- **Issue #77 may have a similar root cause to a regression class** — left-panel transcript highlights might be reading source-absolute `currentTime` when they should be reading the editor store's mapped timeline time. Worth tracing first if the next session picks it up.

---

## Session model + cost

- **Model:** Opus 4.7 throughout — architectural rewrite + verification.
- **Files committed this session:** 9 source files + CHANGELOG.md + tasks/todo.md (commit `cca1920`).
- **Issues closed:** [#76](https://github.com/Oghenefega/ClipFlow/issues/76), [#75](https://github.com/Oghenefega/ClipFlow/issues/75), [#41](https://github.com/Oghenefega/ClipFlow/issues/41), [#42](https://github.com/Oghenefega/ClipFlow/issues/42).
- **Issues filed:** [#77](https://github.com/Oghenefega/ClipFlow/issues/77) — transcript panel highlight desync.
