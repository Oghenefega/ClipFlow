# ClipFlow — Session Handoff
_Last updated: 2026-05-28 — Session 46 — Editor-store audit (Opus 4.8 dynamic workflows) + Tier-1 fixes_
_Amended 2026-05-29 — Session 45 title/caption follow-up appended below the TL;DR (#85 Chunk B shipped, Chunk D deferred). Session 46 body left intact._

---

## One-line TL;DR

**Audited all 6 Zustand editor stores with Opus 4.8 dynamic workflows (parallel subagents + adversarial verify + a fresh-eyes second pass), filed 15 issues, fixed the top 3.** Shipped: #94 (clip-switch data loss), #100 (undo system), #91 (AI rejection mislabel, partial). Three commits pushed to master (`aec5c66`, `a1adf2a`, `44988a0`). **12 audit findings remain as open issues #87–#99/#101 for next sessions.**

---

## ⚠️ Also from Session 45 (#85 title/caption) — interleaved with the audit above

A separate Session 45 thread ran around this audit (Chunk B at 20:11, before the audit; Chunk D defer at 00:11, after it). Two items the audit handoff doesn't cover:

- **#85 Chunk B — SHIPPED, needs live verify** (`6edf9df`). Clip `energyLevel` + detection `confidence` are now forwarded into the **batch** title/caption prompt as a `## Clip Signals` calibration block (e.g. "energy EXPLOSIVE, detection confidence 93%"; omitted entirely for old clips that lack the fields). Build + node-level prompt render verified; **live Generate quality test still pending** (see Verification #4). Touched `useAIStore._collectClipParams`, `title-caption-prompt.buildUserContent` (+ new `formatClipSignals`), `main.js anthropic:generate`. Pure forwarding — no schema change, no migration. Per-card Rephrase/Regenerate unchanged.
- **#85 Chunk D — DEFERRED by decision** (`fdf4038`). "Wire `creatorProfile` into title/caption" is deliberately NOT happening: the profile is detection-only by design; `archetype`/`momentPriorities` don't belong in title wording and re-introduce the generic-copy failure mode session 42 removed. Only `signaturePhrases` would ever be voice-relevant — if revisited, do ONLY that, never a full wire-in. Full reasoning in `tasks/todo.md` + memory `project_chunk_d_deferred.md`.

Note: Session 46's #91 fix also edited `useAIStore.js` (`reject(text, kind)`, `aiRejections` now `{text,kind}` objects) on top of Chunk B — sequential commits, no conflict, both intact.

---

## Current State

App builds clean (`npm run build:renderer`, ~10s) after all three fixes. Changes are surgical and isolated to four files: `EditorLayout.js`, `useSubtitleStore.js`, `useCaptionStore.js`, `useAIStore.js`, `RightPanelNew.js`. **Not yet smoke-tested in the running app** — the fixes are build-verified and logically sound but need the user to confirm behaviour (see Verification below). Nothing in the backend/main process or detection pipeline was touched.

## What Was Just Built

Three Tier-1 fixes from the store audit:

- **#94 — clip switch no longer blanks the outgoing clip** (`aec5c66`). `handleClipSelect` now awaits the save (`handleSave().then(switchToClip)`) before `initFromContext` clears the segment state. Previously the un-awaited save read already-cleared state and persisted empty subtitles/captions onto the clip being left. Mirrors the already-correct `onBackClick`.
- **#100 — undo system repaired** (`a1adf2a`). Added `_pushUndo` to `splitToWords` + `setSegmentMode` (subtitle) and `updateCaptionSegmentTimes` (caption); moved `_pushUndo` below the guards in `mergeSegment` + `updateWordInSegment` + `rippleDeleteSegment`; made `setShowSubs`/`toggleShowSubs`/`setEmojiOn` push undo (they're in `SUB_STYLE_KEYS` so were causing phantom flips).
- **#91 — AI rejection mislabel** (`44988a0`, partial). `reject(text, kind)` logs the correct `titleRejected`/`captionRejected` field; `aiRejections` entries are now `{text, kind}`, capped at 40. **Ripple fix:** the `.includes()` rejected-state checks in `RightPanelNew` were updated for the object shape (they'd have silently broken the "skipped" visual otherwise).

## Key Decisions

| Decision | Why |
|---|---|
| Use dynamic workflows for audit + issue filing, but **single-agent main-thread for the code fixes** | Fixes cluster in 2 files (same-file parallel edits conflict/need merging), and verification (build + npm start) is serial. Workflows shine for many independent same-shape edits across many files — not this. Audit/filing fan-out kept the user's context lean. |
| #91 `showSubs`/`emojiOn`: add `_pushUndo` rather than remove from `SUB_STYLE_KEYS` | Lower-risk — keeps snapshot/save semantics, matches the dominant file convention (every other style setter pushes). |
| #91 shipped **partial** | Logging mislabel + capping are contained to `useAIStore`/`RightPanelNew`. True per-kind generation separation needs a backend prompt-builder change (titles+captions share one combined `anthropicGenerate` call) — deferred and noted on the issue. |
| `aiRejections` string → `{text, kind}` object | Backend `buildUserContent` already accepts `{text}` objects, so no IPC contract break; in-memory only (dies on app close) so no migration. |

## Next Steps (prioritized) — remaining audit findings

Tier-2, by impact. **#97 first** — it's the next real fix but deserves its own clean session.

1. **#97 — cross-clip FFmpeg race.** `commitAudioResize`, `commitLeftExtend`, `_recutAfterDelete`, `_concatRecutAfterDelete`, `revertClipBoundaries` capture `clip`/`project`, await IPC, then `set()` from stale captures. Add a `capturedClip.id === get().clip?.id` guard after each await. Touches 5 actions — test carefully.
2. **#96 / #93 — duration/model consistency.** Redundant/disagreeing `setDuration` after `setNleSegments` (5 sites); empty-delete + `revertClipBoundaries` leave `audioSegments`/`nleSegments` desynced. Decide canonical duration source (prefer letting `setNleSegments` own it) before editing.
3. **#99 — caption style bleed (NEEDS VERIFY first).** Read `applyTemplate` + a real custom template before touching; confirm whether a custom template that omits a field leaks the prior clip's effect.
4. **Quick wins:** #101 (`punctuationRemove` — decide persist vs delete), #88 (`initVideoRef` outside `set()` — chore), #92 (false "Applied" badge — needs `_doSilentSave` to return a checkable result).
5. **Decisions needed before fixing:** #98 (OK to switch all segment IDs to `seg_<ts>_<rand>` string pattern? IDs become strings — check numeric comparisons), #101 (persist `punctuationRemove` or remove dead line?).
6. **Also commented (not fixed):** #32 root cause = overlay setters skip `markDirty` (+ `capWidthPercent` may not be in save payload). #40 = dead code (`clipFileOffset` always 0, dead `reset()`s in caption/AI stores).

## Watch Out For

- **Fixes are NOT user-verified yet** — build-verified only. Run the Verification checklist before closing #94/#100/#91 or apply the `status: untested` label per the issue-filing convention if closing pre-verification.
- **#91 only half-done** — the generation-prompt separation is a backend change; issue stays open.
- **`aiRejections` shape changed to objects** — any future code reading it must use `.text`/`.kind`, not bare strings. Two `.includes()` sites in RightPanelNew were already fixed; line ~801 only checks `.length` (fine).
- **`setSegmentMode` still discards user text edits (#89, NOT fixed)** — the undo fix (#100) added `_pushUndo` to it, but the separate text-preservation bug remains open.
- **Don't auto-fire another workflow without explicit opt-in** ("workflow" keyword / ultracode). The audit + filing runs were ~570K–800K tokens each.

## Verification (do this in the running app)

`npm run build:renderer` + `npm start` (or the installed exe), then:
1. **#94:** edit subtitles on clip A (don't save), switch to clip B via nav, reopen A → subtitles/captions still present.
2. **#100:** "split to words" or toggle 3word/1word → Ctrl+Z undoes it. Merge with nothing selected → redo not wiped. Toggle subtitle visibility → an unrelated undo doesn't flip it.
3. **#91:** Skip a caption suggestion → card dims as "skipped" (object-shape check works).
4. **#85 Chunk B:** open a detection-sourced clip → AI Tools → Generate → still 3+3 sentence-case, parses clean, wording tracks the clip's energy. The signal block is prompt-only (invisible in the UI) — judge it by output quality.

## Logs / Debugging

- **Build:** `npm run build:renderer` (Vite, ~10s). The 1.89 MB chunk-size warning is pre-existing (tracked in #73), unrelated to this session.
- **No backend/main-process or detection code touched** — all changes are renderer Zustand stores + two components.
- **Undo internals** live in `useSubtitleStore._pushUndo` (300ms debounce, no-op during drag, 50-entry cap) → `undo`/`redo` restore `editSegments` + cross-store styling via `_restoreStyling`. Caption/layout changes push through `_pushCrossUndo` → subtitle store's `_pushUndo`.
- **AI rejection log path:** `reject()` → `window.clipflow.anthropicLogHistory({ type:"reject", titleRejected|captionRejected, ... })`. In-memory `aiRejections` feeds `generate()`'s `rejectedSuggestions` → `buildUserContent` in `src/main/ai/title-caption-prompt.js`.
- **Verifying behaviour requires the real app** — desktop-first; do NOT verify via the Vite dev server.
- **Issue tracker:** `gh issue list --repo Oghenefega/ClipFlow --state open` — audit findings grouped under `area: editor`/`area: subtitles`/`area: captions`/`area: ai`.
