# ClipFlow — Session Handoff

_Last updated: 2026-07-24 — Session 123 — **Render pipeline speed fix (5min → seconds) + render queue + floating pill; subtitle upgrades (word-split, right-click merge/split, Alt+drag dup, auto-caps); Queue trash. Alpha.7 shipped mid-session; two CRITICAL post-alpha.7 fixes are committed but NOT in any installer — cut alpha.8 early next session.**_

---

## One-line TL;DR

Diagnosed and killed the 5-minute render (FFmpeg was decoding the ENTIRE 30-min recording per clip — input-seek fix, proven 7.8s on real footage), built a FIFO render queue with an app-level floating progress pill, shipped Fega's subtitle asks (multi-word input → real words, right-click merge/split, Alt+drag duplicate, I'm/oh-my-God auto-caps) and a Queue-tab remove/delete control — then Fega's live test exposed the trash option deleting PROJECT clips (real, unrecoverable data loss) and Alt+drag shredding neighbor subtitles in transit. Both fixed, CDP-verified, committed (`aa973d9`) — **but the installed alpha.7 still has the dangerous trash button.**

## Current State

- **Installed daily driver: 0.3.0-alpha.7** (Fega installed + partially tested it).
- **⚠️ CRITICAL: `aa973d9` (Queue trash data-loss fix + Alt+drag drop-resolution) is committed to master but NOT in alpha.7.** Fega has been told not to touch the Queue tab's red trash option on the installed app. **First action next session: cut 0.3.0-alpha.8.**
- Fega-verified on alpha.7: render speed (partially — see #180), render queue ✓, multi-word typing ✓. Failed his test (now fixed on source, unverified): Alt+drag, Queue trash. Not yet exercised: right-click merge/split, auto-caps, floating-pill details, the whole alpha.6 batch (still pending from session 122).
- Session commits: `e963c13` (input-seek + floating pill), `114cded` (5-feature batch), `ce2e24f` (alpha.7 cut), `aa973d9` (post-test fixes), plus wrap.

## What Was Just Built

**Render speed — input seeking** (`render.js`)
- Root cause of 5+min renders: NLE path fed FFmpeg the whole recording with filter-level `trim` — FFmpeg decoded ALL of it (2560×2880 HEVC @60 on CPU, ~1.4× realtime), before AND after the clip. Also explains the 40%/99% progress stalls (no output frames while decoding pre/post-clip regions).
- Fix: one pre-seeked input PER SEGMENT (`-ss <start> -t <dur>` before `-i`), no trim filters, overlay input shifts to index n. Measured: 13.47s cut at min-10 of a 30-min source: **7.8s** (was 5+ min); 3-segment 20s concat: 12.7s, output exactly 20.000s.
- Remaining wall time is the OVERLAY phase (~60s of Fega's 1:15 for a 16s clip) → **#180 filed with the approved 2-part plan** (skip unchanged frames; stream raw frames into FFmpeg via pipe). Fega: "do this fix in the next session."

**Render queue + floating pill** (`main.js`, `App.js`, `preload.js`, `EditorLayout.js`, `EditorView.js`, `ProjectsView.js`)
- Jobs serialize FIFO in main (`renderQueue`/`drainRenderQueue`/`enqueueRenderJob`); every progress event carries `{clipId, clipTitle, waiting, waitingIds}` + explicit terminal stages (done/canceled/error). `render:cancel` takes a clipId — current job aborts, waiting job drops. `render:batch` reroutes through the same queue (`render.batchRender` deleted).
- App.js owns `renderJob` (global listener; per-listener unsubscribe in preload — `removeAllListeners` was removed). Floating pill bottom-right on non-editor tabs: title + % + "N waiting" + cancel. Editor Topbar: pill ONLY when the open clip is current/waiting ("Queued…" state, ✕ = remove from queue); other clips rendering show a passive yellow mini-chip and the buttons stay live. doRender guards per-clip (`renderingClipIds` Set — the old boolean would have blocked queueing clip B while A renders).

**Subtitle upgrades** (`useSubtitleStore.js`, `SegmentRow.js`, `SegmentBlock.js`, `TimelinePanelNew.js`, `resolveSubtitles.js`)
- Multi-word input into a word block → N real word objects, char-weighted timings across the old word's span (was: whole phrase in ONE word slot → text↔words desync, phrase highlighted as one).
- Right-click a word: Split segment before this word / Merge with previous / Merge with next (exposes the existing toolbar `splitSegment`/`mergeSegment` where the words are; merge = Fega's clarified semantics — words stay separate, highlight sequentially).
- Alt+drag duplicate on the timeline (`duplicateSegment` store action; clone floats during drag, collisions resolve ONCE at drop via extracted `resolveSubtitleOverlaps`; single undo reverts clone+move+trims).
- Auto-caps in the shared resolver, gated `!hasEditorSavedSubs`: i/i'm/i'll/i've/i'd → I…, god → God only inside "oh my god"; hand-edited saved subs never rewritten. Unit-tested through the real resolver.

**Queue trash (reworked after data loss)** (`QueueView.js`, `main.js`, `preload.js`, `projects.js`)
- Trash icon on every queue row → popover: "Remove from queue" (dequeue, reversible) / "Remove + delete rendered video" (dequeue + NEW `project:deleteClipRender` IPC: unlink renderPath, reset renderStatus→pending — **clip record NEVER deleted from the Queue tab**).
- `projects.deleteClip(deleteFile=true)` now also unlinks renderPath (was orphaning the rendered MP4); deleteFile plumbed through IPC, default false, no caller passes true.

## Key Decisions

- **Serial render queue (Option A), not parallel** — Fega approved; worker-count knob can come later, the queue abstraction doesn't change.
- **Queue-tab actions scope to queue membership + queue artifacts, never project data** — hard rule born from the data loss (lesson distilled into clipflow-code-review).
- **Alt+drag resolves collisions at DROP, not live** — clone spawns overlapped by construction; live push shredded 1-word tracks (CDP-proven 31→28 segments in one drag; post-fix 31→31 with transit survivors).
- **Auto-caps live in `resolveClipSubtitles`** (single choke point: editor load + projects preview + render), gated off editor-saved subs so user casing is authoritative.

## Next Steps

1. **Cut 0.3.0-alpha.8 FIRST** — gets the data-loss fix onto the daily driver. Don't wait for a batch.
2. **#180 — overlay render speed** (approved plan in the issue): skip unchanged frames, then stream raw frames into FFmpeg. Target: 16s clip ≈ 20-30s total.
3. Fega re-verifies on alpha.8: Alt+drag (float + drop-resolve), Queue trash (both options), right-click merge/split, auto-caps, floating-pill/queue edge cases + the alpha.6 backlog.
4. Ask Fega how many clips were actually lost (test vs real edits) — recovery confirmed impossible; source recordings intact so moments can be re-clipped.

## Watch Out For

- **The installed alpha.7 still deletes project clips via the Queue trash red option.** Warned Fega; alpha.8 is the real fix. Do not let this linger.
- **`renderQueue`/`enqueueRenderJob` in main.js**: `render:cancel` on a WAITING job calls `job.run()` directly (resolves that invoke `{canceled:true}`) — don't "simplify" that into just splicing; the renderer's doRender awaits that promise for its #140 status restore.
- **Progress events are the pill's only truth** — any new render path MUST emit through `enqueueRenderJob` (or at least send the terminal stages) or the pill strands.
- **`resolveSubtitleOverlaps` phantoms**: coordinate-space ambiguity (loop computes timeline coords; the phantom renderer treats them as source-absolute) is PRE-EXISTING and was copied verbatim — flagged, not fixed. Only matters for middle-split drags on NLE-cut clips.
- **EditorLayout Topbar**: `renderingClipIds` is a Set in state — always copy-on-write (`new Set(prev)`), and the doRender guard covers the pre-"queued"-event double-click gap. Don't collapse it back to a boolean.
- **`updateWordInSegment` multi-word split** keeps the parallel text-tokens ↔ words[] indexing invariant — any change must splice BOTH at the same index.
- **Auto-caps must stay gated behind `!hasEditorSavedSubs`** or user edits get rewritten on every load.
- **data/clipflow.db is dirty as always — never stage it.**

## Logs/Debugging

- **CDP full-app drive works well for editor gestures**: `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222`, then the scratchpad `cdp.mjs` driver (eval/click/drag/key via Node's built-in WebSocket, trusted `Input.dispatchMouseEvent` with modifier bitmask Alt=1/Ctrl=2). Nav path used: Projects nav → project row → "Open in Editor" button → `.segment-block` elements. Dev profile shares the real W:\ library — undo (Ctrl+Z) restored the test project both times, verified by segment count + texts.
- Alpha.7 render evidence: main-process `[Render]`/`[OverlayRenderer]` console.log lines do NOT reach the file log (`%APPDATA%\clipflow\logs\app.log`) — timing diagnosis came from benchmarks + file mtimes, not logs. Worth wiring those into the logger during #180.
- 2026-07-23 two-instances incident: installed app relaunched at 19:38 while the source instance ran → two apps shared the prod DB for ~3h (the #156 hazard, no observed damage). Session-ids in app.log distinguish instances.
