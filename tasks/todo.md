# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## ACTIVE PLAN — Recordings card (i) info popover ("Spotlight"), session 69

**Design LOCKED** via mockup `mockups/recordings-info-spotlight.html` — Spotlight popover, "Stats"
hero (Duration + Size as two equal-size labelled stats, accent eyebrow on Duration), narrow grid pills.
Verified visually by Fega. (Losing variants kept as scratch: `recordings-info-{menu,contextbar,inline}.html`.)

**Scope — all in the Recordings tab (`src/renderer/views/UploadView.js`):**
1. **Hover-reveal `(i)` button** on each card, to the LEFT of the green ✓. Hidden by default, fades in on
   card hover; the ✓ stays always-visible. (Keeps the row uncrowded — Fega's "hidden feature".)
2. **Tooltip + duration** — the existing hover tooltip (filename + size) gains **duration**:
   `filename` / `size · duration`. Source = `f.duration_seconds` (DB col `duration_seconds`) via the
   existing `formatDuration()`. Fallback for null (older records): show `—` (or lazy ffprobe — TBD at build).
3. **`(i)` click → Spotlight popover** (interactive, closes on outside-click/Esc): filename, Duration +
   Size stat pair, Play, Open in Explorer, TEST chip.
4. **Remove the standalone `TestChip` pill from the card.** TEST is now the popover chip
   (bright yellow = on / grey = off), reusing the existing `handleToggleRecordingTest(f.id, next)`.
5. **Open in Explorer** → `window.clipflow.revealInFolder(f.current_path)` (existing IPC, main.js:717).
6. **Play → CHOSEN: open the raw recording in the REAL editor (Option C).** Investigation (code-explorer
   + verified) shows this is **~S effort, not heavy**: the editor already plays the full SOURCE recording
   (Phase 4) and tolerates a null `clip` everywhere. Autosave no-ops on null clip
   (`useEditorStore.js:668 — if (!clip||!project) return false`, verified), so **zero disk-write /
   project-corruption risk**.

**"Source-preview" editor mode (the Play implementation):**
- New `editorContext` shape `{ sourcePreviewPath, label }` (no projectId/clipId).
- `useEditorStore.initFromContext` — early branch BEFORE the `projectLoad` IPC: synthesize a thin shell
  `{ id:"__source_preview__", sourceFile: path, name: label, clips: [], transcription: null }`, `clip: null`,
  `nleSegments: []`. On `onLoadedMetadata`, `initNleSegments(videoDur)` self-fills a full-span segment →
  timeline + scrub + waveform all light up. (~20 lines.)
- `App.js` — `handleOpenSourcePreview(path,label)` sets that context + `setView("editor")`; `onBack` returns
  to `recordings` when `sourcePreviewPath` is set; pass the handler down to the Recordings view.
- `EditorLayout` — NO changes; save/render/retranscribe/navigator all already guard on `!clip`.
- Watch: waveform cache keys on `project.id` → "__source_preview__" makes one cache folder under
  projectsRoot (fine, or pass a stable per-file id). Topbar shows no clip — fine for a watch-only preview.
- BONUS: this is exactly the path to verify the #64 waveform fix on a real 30-min source.

**File impact:**
- `src/renderer/views/UploadView.js` — card render ((i) add, TestChip remove), popover component + state,
  tooltip duration, action wiring (Play → `handleOpenSourcePreview`, Open → `revealInFolder`, TEST → existing
  `handleToggleRecordingTest`). (primary)
- `src/renderer/editor/stores/useEditorStore.js` — `initFromContext` source-preview branch (~20 lines).
- `src/renderer/App.js` — `handleOpenSourcePreview` + `onBack`/editorContext wiring; thread handler to Recordings view.
- (No main-process change needed; `revealInFolder` already exists.)

**Verification criteria:**
- `(i)` hidden until hover, sits left of ✓, ✓ always visible.
- Tooltip shows duration; popover Duration/Size match and are equal-size.
- TEST chip toggles yellow↔grey, persists (`is_test`), standalone pill gone, done/generate counts unaffected.
- Open in Explorer reveals the file. Play opens the recording in the editor: video plays, timeline + waveform
  render, no clip loaded; Back returns to Recordings; opening/closing the preview creates/modifies NO project on disk.
- `npm run build:renderer` clean + `npm start`, no regression to select / generate / mark-done flows.

**On approval:** file a GitHub issue (like #122/#123), then build.

---

## SHIPPED — Recordings floating action cluster + batch generate (#123, session 68)

Done and pushed (`e9a039d`), issue #123 closed. Option C bottom-right cluster (`✓ Mark Done` + `Clip N
Recordings`, no count pill, no icon); Generate now batches ALL selected recordings sequentially
(`Clipping recording N of M` → `Clipped N of M`, continues past failures, deferred play-style queue);
wording corrected to "Clip Recordings" page-wide. `runOnePipeline` extracted from `handleGenerate`
(quick-import path preserved). Verified visually by Fega; only the real-clip sequential run is left as
an optional bonus regression check. All in `src/renderer/views/UploadView.js`.

### Backlog candidates
- **Larger Recordings redesign** — filters, sort, search, thumbnails, overall layout (V1 beyond the card).
- **Subtitle `words[]`/`text` family** (deferred): #95, #107, #87, #101, #89, #84.
- **#121** (chore) — `originalSegments` "sentence-level" comment clarification; low priority.
- Backlog: #64 (waveform empty), #112/#62 (EPIPE / silent audio), #57 (editor lag), #114/#108/#40.
  Commercial-launch: #20–#23, #50–#56, #73/#74, #85.

---

## Deferred plans

### #85 Chunk B/D — title/caption clip-signal forwarding (was active session 45)
Plan to forward `energyLevel` + `confidence` into the title/caption prompt
(`useAIStore._collectClipParams` → `title-caption-prompt.js buildUserContent` →
`main.js anthropic:generate`). Chunk D (wire full `creatorProfile`) is
**deliberately deferred** — profile is detection-only by design; feeding
`archetype` into wording re-introduces the generic template-y copy session 42
removed. Full body recoverable from `git log -p tasks/todo.md`. Re-introduce when
returning to #85.

### Interactive architecture/flows visualizer
A previous session drafted a single-page HTML architecture visualizer for the
Obsidian vault (`context/architecture/`) using vis-network 9.x. Never approved or
started. Body recoverable from git history. Re-introduce when there's appetite for
a docs-quality artifact.
