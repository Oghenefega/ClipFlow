# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## Active Plan — #85 Chunk B: forward clip signals into title/caption prompt (Session 45)

Tracked on GitHub: **[#85 — AI title/caption generation overhaul](https://github.com/Oghenefega/ClipFlow/issues/85)**.

**Goal:** ground title/caption generation in what detection already knows about
the clip, so output stops inventing visual detail (e.g. "lipper kill"). The
title/caption call today sees only the transcript text.

### Decisions (user, this session)
- **Skip `peakMoment`-in-detection.** Detection was deliberately stripped to
  pick-moments-only (`ai-prompt.js:152` forbids prose). Don't reverse that.
- **Text signals only — NO peak-frame image.** Forward `energy_level` +
  `confidence` as text; no vision input, no `ai-pipeline.js` frame work, no
  multimodal message. (User accepted this is weaker vs visual hallucinations.)
- **Batch Generate only.** Single-card Rephrase/Regenerate stay unchanged
  (cheap, anchored to existing text).

Net effect: `energyLevel` and `confidence` already exist on every clip
(`ai-pipeline.js:710-711`) and round-trip into the editor untouched
(`useEditorStore` loads the full clip object). This is pure forwarding — no
schema change, no migration, no detection change.

### Steps (plain language)

1. **Read the two fields renderer-side** — `useAIStore._collectClipParams`
   (`src/renderer/editor/stores/useAIStore.js:30`). It already pulls `project`
   from `useEditorStore`; also pull `clip` and add `energyLevel`
   (`clip.energyLevel`) + `confidence` (`clip.confidence`) to the returned
   params object. Single-card path reuses this fn but the prompt won't render
   the new fields, so no behaviour change there.

2. **Render the signals in the user message** — `title-caption-prompt.js`
   `buildUserContent` (`src/main/ai/title-caption-prompt.js:242`). Accept
   `energyLevel` + `confidence`; when present, append a `## Clip signals` line
   (energy level + confidence as a %). One short system-prompt note that these
   are detection's read of the clip's intensity — calibrate tone, don't invent.

3. **Pass them through the handler** — `main.js anthropic:generate`
   (`src/main/main.js:2164`). Add `energyLevel: params.energyLevel` +
   `confidence: params.confidence` to the `buildUserContent({...})` call.

### Verify
`npm run build:renderer` + `npm start`. Open a clip, click Generate. Confirm
output still parses (3+3, sentence case) and the energy/confidence now shows in
the prompt path. A clip missing the fields (old project) must degrade
gracefully — no `## Clip signals` line, no crash. Quality A/B is the user's call.

### File impact
| File | Change |
|---|---|
| `src/renderer/editor/stores/useAIStore.js` | `_collectClipParams` forwards `energyLevel` + `confidence` |
| `src/main/ai/title-caption-prompt.js` | `buildUserContent` renders a `## Clip signals` line; system note |
| `src/main/main.js` | `anthropic:generate` passes the two fields into `buildUserContent` |

### Out of scope (later #85 work)
Peak-frame vision input (declined this session); `peakMoment` generation;
`clip.aiHistory` persistence + batch arrows (Chunk C); wire `creatorProfile`
into the prompt (Chunk D); AI-panel looks pass.

---

## Deferred plans

### Interactive architecture/flows visualizer

A previous session drafted a plan for a single-page HTML architecture
visualizer to live in the Obsidian vault (`context/architecture/`) using
vis-network 9.x. Never approved or started. Plan body is recoverable from
git history (`git log -p tasks/todo.md`). Re-introduce when there's
appetite for a docs-quality artifact.
