# HANDOFF — Session 196 (2026-08-25)

## Current State

**Planning-only session — zero app code changed.** Two new features filed, explored,
designed, and approved: **#305** (cut a single-word subtitle at the playhead into two
copies of the word) and **#306** (Repost a published clip from the Tracker, optional
tweak step, bangers included). The full build specs live as comments on the issues —
the build session needs nothing from this conversation. Everything from s195 still
stands: batches 1–4 built + reviewed, **the installer covering them is still uncut**.

## Key Decisions

1. **Model split for this batch:** Fable planned (this session) → **Opus@high builds
   #305 + #306 as one batch in its own session** (commit per feature) → Fable@xhigh
   reviews commit-by-hash right after. Per the 2026-08-24 workflow memory.
2. **#306 repost = a fresh clip copy that reuses the render** (file copied on disk),
   NOT re-arming the original id — the Queue's trackerData knockout (QueueView.js:763-768)
   and the `UNIQUE(clip_id)` title-training table make id-reuse unworkable.
3. **Reposts never teach** the AI title/caption data (extends #240's imports fence).
   The optional tweak step is the existing Queue card panel — no new editing UI.
4. **Drag-and-drop from the Tracker consciously deferred** (cross-tab drag infeasible;
   visible Repost buttons on the Tracker popover + Published shelf carry the capability).
5. **#305 mechanism:** 1-word branch inside `splitSegment` + a `splitCopy` flag on the
   duplicated word objects so `setSegmentMode`'s whisperx dedup can't eat one half.

## Next Steps

1. **Opus@high build session:** build #305 + #306 from the specs on the issues.
2. **Fable@xhigh review session** on those commits, right after they land.
3. **Cut the installer** covering batches 1–4 (clipflow-update-launcher) — carried from
   s195; decide whether to fold the #305/#306 batch in first.
4. Fega's batch-4 eyeball checks (Rename watcher states, delete dialog, completion
   headline) — carried from s195.

## Watch Out For

- **#305's landmine is the segment-mode dedup** (`useSubtitleStore.js:1258-1267`):
  verification MUST include the 1-word → 3-word → 1-word round trip proving neither
  word copy vanishes.
- **#306: the title-based queue knockout will silently eat a same-titled repost** unless
  the `c.repostOf` exemption at QueueView.js:768 ships with it — it's in the spec, don't
  let it get simplified away.
- **Never run a real publish while verifying #306** — dev profile only; the publish path
  itself is unchanged and its repost passthrough is verified by review, not execution.
- `duplicateClip` cannot be reused for repost (its hard-coded resets land AFTER the
  overrides spread) — the spec calls for a sibling `repostClip()`, not an option flag.
- Standing s190–s195 items unchanged (see f97bbb0's HANDOFF): prod hasn't run the #301
  migration; `gatewayAuthTokenPreMigration` kept until the installer reaches the laptop;
  completion headline still never eyeballed on screen.

## Logs / Debugging

- No app runs this session — nothing new in logs.
- Exploration evidence (file:line citations for every claim in the specs) is embedded in
  the issue comments on #305/#306; the approved plan file is at
  `C:\Users\IAmAbsolute\.claude\plans\declarative-squishing-swing.md`.
- CHANGELOG.md deliberately untouched: no product change to record this session.
