# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.

---

## Active: Issue #76 — Lazy-cut architecture pivot

**Goal:** Replace the eager-cut pipeline with lazy-cut. Source video is the single source of truth; clips are `{startTime, endTime, nleSegments}` ranges. Final MP4s only get cut at publish/render time. The "former system" (eager `cutClip` at AI-pipeline time, `clip.filePath` lifecycle, recut handlers that re-encode MP4s on every edit) is removed entirely. Legacy projects still open and play (compat read path on `clip.filePath`), but no new code path writes one.

**Why this is smaller than #76 implies:** the codebase already did half the work in Phase 4 of #42. `render.js` consumes `nleSegments` through `buildNleFilterComplex`. Preview already plays the source video. Playback store maps timeline↔source. Signal extraction and thumbnails are already source-direct. The remaining work is concentrated in 3 places: Stage 7/7b of the AI pipeline, the 4 recut IPC handlers, and dead-code removal.

---

### Step 1 — Replace Stage 7 of the AI pipeline (stop cutting MP4s)

**What it does:** the AI pipeline stops calling `ffmpeg.cutClip`/`ffmpeg.concatCutClip` entirely. For each clip Claude returns, write the clip object with `nleSegments: [{ id, sourceStart, sourceEnd }]` (single segment matching `[startTime, endTime]`). No `filePath`. Thumbnail generation stays — already source-direct, line 690.

**Why:** this is the headline win. ~125s of blocking compute and 15 wasted MP4 writes per pipeline run vanish. Pipeline log gains a single "Skipping cut step (lazy-cut mode)" line.

**Files:**
- `src/main/ai-pipeline.js` — rewrite Stage 7 (lines 650-751). Remove the concurrency-pool cut loop. Keep thumbnail generation. Keep the index-aligned slot pattern just for clip metadata + thumbnails.
- `src/main/projects.js` — remove `filePath` from the schema doc comment if present; project JSON shape gains a "no `filePath` on new clips" invariant.

**Verify:** run pipeline on the reference RL recording. Pipeline log shows no "Cutting clip" lines. `processing/clips/<videoName>/` directory contains only thumbnails (no MP4s). Project JSON has `clips[].nleSegments` populated, `clips[].filePath` absent or null.

---

### Step 2 — Rewrite Stage 7b retranscription (extract audio from source ranges)

**What it does:** retranscription extracts each clip's audio directly from the source via `ffmpeg -ss start -t dur -i source -vn audio.wav` instead of from a cut MP4. The batched single-Python-process retranscription from session 31 stays — only the audio-extraction step changes.

**Why:** Stage 7b is the only remaining consumer of `clip.filePath` in the pipeline. After this, `cutClip` has no callers in the AI path.

**Files:**
- `src/main/ffmpeg.js` — add `extractAudioRange(sourceFile, outputWav, startSec, endSec, audioTrack)`. Same WAV format as today's `extractAudio`, just sliced from source.
- `src/main/ai-pipeline.js` — Stage 7b (lines 753-846). Replace `ffmpeg.extractAudio(t.clip.filePath, ...)` (line 787) with `ffmpeg.extractAudioRange(sourceFile, t.clipWav, t.clip.startTime, t.clip.endTime, ...)`. Replace the WAV path derivation at line 770 (was `clip.filePath.replace(...)`) with a temp path under `processing/clips/<video>/`.

**Verify:** pipeline run produces 15/15 successful retranscriptions (matching session 31). Spot-check word timestamps on one clip — should match what Stage 7b produced before. Reference: lessons.md "never source-slice word timestamps" rule. We're NOT slicing — we're re-transcribing per clip on source-extracted audio. Same rule, same outcome.

---

### Step 3 — Convert the 4 recut IPC handlers from "re-encode" to "update nleSegments"

**What it does:** when the user trims, extends, or splices a clip in the editor, today's handlers re-encode the clip MP4 on disk. After this step, they just update `clip.nleSegments` and `clip.startTime`/`clip.endTime` in memory + project JSON. No ffmpeg call. No disk write beyond the project JSON.

**Why:** trim/extend become INSTANT (was ~1-3s of NVENC encode per edit). And there's no MP4 to re-encode anyway — the clip never existed as a file.

**Files:**
- `src/main/main.js`:
  - `clip:extend` handler (line 1245): drop the cutClip call; update `clip.endTime` and the last `nleSegment.sourceEnd`. Return updated clip.
  - `clip:extendLeft` handler (line 1306): same shape, update `clip.startTime` and first `nleSegment.sourceStart`.
  - `clip:concatRecut` handler (line 1368): drop the concatCutClip call; replace `clip.nleSegments` with the new segments array (already in source-absolute coordinates).
  - `clip:recut` handler (line 1429): drop the cutClip call; update `clip.startTime`/`endTime` and rewrite `nleSegments` to a single segment.
- `src/main/main.js` `retranscribe:clip` handler (line 1491-1502): replace `clip.filePath` audio source with `extractAudioRange(sourceFile, ..., clip.startTime, clip.endTime)`. Same fix as Stage 7b.
- Renderer side: any editor code that awaits a returned `clip.filePath` from these handlers needs to be checked. Likely none post-Phase-4 — preview re-renders from updated `nleSegments` via Zustand. To verify with a grep before editing.

**Verify:** open a clip from a fresh lazy-cut pipeline run. Drag the right trim handle out by 2s — playback boundary moves immediately, no encode delay. Drag left trim. Splice out a middle section (concatRecut). Render the result via the publish flow → final MP4 reflects all edits.

---

### Step 4 — Lock down the render path (publish-time cut, no silent fallback)

**What it does:** `render.js` already does the right thing for clips with `nleSegments`. But the fallback at line 103-105 (`clipData.filePath || projectData.sourceFile`) silently eats missing nleSegments. Lock that down: if the clip has no `nleSegments` AND no legacy `filePath`, throw a clear error. New clips will always have `nleSegments`; legacy clips will have `filePath` — anything else is a bug.

**Why:** prevents the failure mode where a clip silently renders against the wrong source range and the user gets a bad MP4.

**Files:**
- `src/main/render.js` — tighten the source-resolution branch at line 99-105. Explicit precedence: nleSegments → legacy filePath → throw. Log which path was used.

**Verify:** queue a lazy-cut clip → final MP4 lands correctly. Try rendering a clip with nleSegments stripped (manual test) → fails loudly with a clear message instead of producing a wrong-range MP4.

---

### Step 5 — Settings copy + dead-code removal

**What it does:** the existing `clipCutEncoder` and `clipCutConcurrency` settings still apply — but their context shifts from "AI pipeline cut step" to "publish-time render step". Update the Settings UI labels and captions so they read correctly. Then delete `cutClip` and `concatCutClip` from `src/main/ffmpeg.js` and any orphaned helpers (per issue #42 acceptance criteria).

**Why:** issue #42 explicitly calls this out — once `cutClip` has no callers, delete it. Settings labels currently say "Clip cutting encoder / Parallel cuts" referring to the old eager-cut path; they should say something like "Render encoder / Parallel renders" since they now govern publish-time behavior.

**Files:**
- `src/renderer/views/SettingsView.js` — update label + caption text on the two Pipeline Quality rows. Keep the electron-store keys (no migration needed; same semantics, different invocation point).
- `src/main/ffmpeg.js` — remove `cutClip`, `concatCutClip`, and any helpers used only by them. Grep for callers first to be sure none remain.
- `src/main/projects.js` `deleteClip()` (line 268) — keeps the `if (clip.filePath && fs.existsSync(...))` guard for legacy file cleanup. Don't remove this; it's the legacy-project safety net.
- `src/renderer/views/ProjectsView.js:121` — clip thumbnail src reads `clip.filePath` for legacy preview. Switch to reading `clip.thumbnailPath` (already populated for new clips) with `clip.filePath` as the legacy fallback.

**Verify:** grep `cutClip` across `src/` returns zero hits except the deletion line in git diff. Grep `clip.filePath` returns only legacy-fallback read paths (PreviewPanelNew, ProjectsView, projects.deleteClip, retranscribe:clip's existence check). Settings UI reads "Render encoder / Parallel renders" with updated captions. Build clean.

---

### Step 6 — Backwards-compat sanity pass

**What it does:** open a session-31-era project (one with `clip.filePath` on disk) and confirm everything still works without modification. Preview falls back to the cut MP4. Edit operations should also work — but on a legacy clip, edits should populate `nleSegments` from `[startTime, endTime]` if missing, then proceed as lazy-cut from that point on.

**Why:** the user has existing projects from session 31 that must keep opening. They don't need to be migrated proactively — they just shouldn't crash.

**Files:**
- `src/renderer/editor/stores/useEditorStore.js` `initFromContext()` (around line 99) — if loaded clip has no `nleSegments` and has `startTime`/`endTime`, synthesize a single segment. (Likely already there from Phase 4 migration; verify with a grep.)
- No new code if Phase 4's migration already handles this; just verify in-app.

**Verify:** open the latest session-31 project from `~/Documents/ClipFlow Projects/`. Each clip plays. Trim handles work. Render produces a correct MP4.

---

### Step 7 — End-to-end pipeline verification on the reference recording

**What it does:** run the full AI pipeline on `RL_2026-10-15_Day9_Pt1.mp4` (the session 31 reference). Compare against session 31's 506s baseline.

**Why:** this is the acceptance criterion for #76. Target: ≤400s pipeline total (down from 506s). 15/15 clips ship. No clip MP4s on disk.

**Verify:**
- Pipeline total ≤400s.
- `processing/logs/RL_..._<ts>.log` shows no "Cutting clip" lines, no "(NVENC)" or "(x264)" markers from Stage 7.
- `processing/clips/RL_..._<ts>/` contains only thumbnails (15 JPEGs), no MP4s.
- Project JSON: every clip has `nleSegments`, no `filePath` (or null).
- Open the project, edit a clip (trim + splice), publish → final MP4 lands correctly with the edits.

---

## Risks called out by issue #76 — confirmed status after exploration

- **Editor playback range constraint:** ALREADY HANDLED. PreviewPanelNew + usePlaybackStore use `timelineToSource`/`sourceToTimeline` mapping. Continuous playback over multi-segment clips works today. No new playlist controller needed.
- **Multi-segment splice playback:** ALREADY HANDLED. Same as above.
- **Recut handlers re-cut MP4s:** CONFIRMED — Step 3 fixes this.
- **Render path coupling:** PARTIALLY HANDLED. `render.js` consumes nleSegments end-to-end already; the silent-fallback risk is fixed in Step 4.

## Out of scope (deferred follow-ups)

- Skip-refine fast path for retranscription (#76 bonus section). Worth a separate issue post-lazy-cut.
- Proactive migration UI to delete orphaned clip MP4s from legacy projects (#42 mentions optional).
- Opportunistic file cleanup at delete-clip time stays as-is (already null-guarded).

## Sequencing & approval gates

Steps 1+2 must land together (Stage 7 stops writing files; Stage 7b can no longer read them). Step 3 lands together with Steps 1+2 because the editor's recut paths break otherwise. Step 4 is a one-line tightening. Step 5 is mechanical cleanup. Steps 6 + 7 are verification.

**Approval gate at end of Step 5** — once all code changes are in, before running the full pipeline benchmark, I'll stop for a build + visual check on the editor with one clip.

**Estimate:** one focused session. Steps 1-3 are the work (~2-3h with verification). Steps 4-7 are ~1h combined.

---

## Resolved (prior sessions)

### Issue #72 — RESOLVED (2026-04-27, end of session 30)

- **Phase 1 — silent-degradation kill:** SHIPPED (session 28)
- **Phase 2 — scene_change:** DROPPED (session 29)
- **Phase 3 — yamnet:** SHIPPED (session 29) — 626s → 130s
- **Phase 4 — pitch_spike:** SHIPPED (session 30) — 280s → 4.9s via pYIN→YIN swap

### Issue #75 — RESOLVED (2026-04-27, end of session 31)

- Phase 1 NVENC + Phase 2 parallel cuts + Phase 3 batched retranscription. Pipeline 810s → 506s. Architectural half delegated to #76 (this issue).
