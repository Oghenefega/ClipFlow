# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.

---

# Session 24 Plan — Issue #71

**Goal:** Stop Claude from narrating clips. Stage 6 returns timestamps + confidence only. Default title = `"Clip N"`. Game tag becomes a first-class field. Publish guardrail prevents accidental "Clip 3" social posts.

**Issue:** https://github.com/Oghenefega/ClipFlow/issues/71
**Direction 1 is locked. No design left, just execute.**

---

## What this plan changes vs. the issue body

Two corrections from verifying the code:

1. **Issue says** `RightPanelNew.js:688/715` renders `clip.why` blocks → **wrong.** Those blocks render `t.why` / `c.why` from the AI Titles & Captions feature (a separate downstream call, different schema). **Do NOT touch them.**
2. **Issue missed** the real `clip.why` consumer: `ProjectsView.js:625-643` renders `clip.highlightReason` and `clip.peakQuote`. These are the actual hallucinated-narration display sites. They get removed.

One additional fix the issue didn't surface but the code requires:

3. **Hashtag gating:** `QueueView.js:157` filters approved clips by `hasHashtag(c.title)` when `requireHashtagInTitle=true` (default). `EditorLayout.js:415` blocks clip render with the same rule. With default titles becoming `"Clip N"` (no `#`), zero clips reach the queue and nothing renders. Fix: relax the gate to accept either a hashtag in title OR a populated `clip.gameTag`. Old clips keep working via title hashtag; new clips pass via `gameTag`.

---

## Steps (plain language first, file-level detail under each)

### 1. Rewrite the Stage 6 prompt (kill the narration request)

Replace the schema block in `src/main/ai-prompt.js` so Claude is told to return only `clip_number`, `start`, `end`, `energy_level`, `has_frame`, `confidence`. Drop `title`, `why`, `peak_quote` from both the schema definition AND the `## Constraints` / `## DO NOT` sections that reference them.

- File: [src/main/ai-prompt.js:117-155](src/main/ai-prompt.js#L117) — `# OUTPUT FORMAT` section
- Also drop `peak_quote` from the few-shot formatters: [ai-prompt.js:229](src/main/ai-prompt.js#L229), [:255](src/main/ai-prompt.js#L255), [:268](src/main/ai-prompt.js#L268). Keep `Title` in few-shot — that's user-approved real data, not Claude narration.
- Tighten clip count `10-25` → `10-20` at [ai-prompt.js:44](src/main/ai-prompt.js#L44) and [:136](src/main/ai-prompt.js#L136).

### 2. Bump `max_tokens` and update the pipeline write path

In `ai-pipeline.js`, raise the LLM ceiling and rewrite the clip-record builder so `title` becomes `"Clip N"`, `gameTag` is populated as a first-class field, and `highlightReason` / `peakQuote` are no longer set from Claude.

- File: [src/main/ai-pipeline.js:351](src/main/ai-pipeline.js#L351) — `maxTokens: 4096` → `maxTokens: 8192`.
- File: [src/main/ai-pipeline.js:617-643](src/main/ai-pipeline.js#L617) — the `project.clips.push({...})` block. Change:
  - `title: clip.title || ""` → `` title: `Clip ${i + 1}` ``
  - `caption: clip.title || ""` → `caption: ""`
  - Add `gameTag: gameData.gameTag || ""`
  - Drop `highlightReason: clip.why || ""` (set to `""` for backward shape; UI will stop reading it)
  - Drop `peakQuote: clip.peak_quote || ""` (set to `""`)
- Validation: if Claude's response is missing the expected fields, the pipeline should still succeed. The new schema only references `start`, `end`, `confidence`, `energy_level`, `has_frame`. All already handled.

### 3. Promote `gameTag` to first-class on every clip in the queue

`QueueView` builds its clip list by merging clips with `_projectId`. Add `gameTag` to that merge so renderers can read `clip.gameTag` directly without parsing the title.

- File: [src/renderer/views/QueueView.js:156-159](src/renderer/views/QueueView.js#L156) — the `Object.entries(allClips).flatMap(...)` block. Look up the project's `gameTag` from `localProjects` and attach to each clip (`{ ...c, _projectId, gameTag: c.gameTag || projectMap[projectId]?.gameTag || "" }`).

### 4. Replace `extractGameTag(clip.title)` everywhere with `clip.gameTag`

Six call sites in QueueView use the parser. Switch each to `clip.gameTag`. Keep `extractGameTag` exported for now (don't delete) — old projects without a `gameTag` field will fall back to it via a `clip.gameTag || extractGameTag(clip.title)` pattern. Once we're confident no legacy clips exist, we can remove the helper.

- File: [src/renderer/views/QueueView.js:105](src/renderer/views/QueueView.js#L105), [:175](src/renderer/views/QueueView.js#L175), [:463](src/renderer/views/QueueView.js#L463), [:610](src/renderer/views/QueueView.js#L610), [:617](src/renderer/views/QueueView.js#L617), [:787-788](src/renderer/views/QueueView.js#L787), [:1135-1136](src/renderer/views/QueueView.js#L1135) — replace `extractGameTag(clip.title)` with `(clip.gameTag || extractGameTag(clip.title))`.
- The `#{gametitle}` template substitution in `resolveCaption` ([QueueView.js:115,124](src/renderer/views/QueueView.js#L115)) keeps using the same resolved tag — no change to the substitution itself, just to the source.

### 5. Render the game tag as a separate UI badge

Queue and Projects list views need a visible game-tag chip next to the clip title. Already have `GamePill` in [shared.js:24](src/renderer/components/shared.js#L24) — reuse it. Place it inline-left of the title in:

- File: [src/renderer/views/QueueView.js:715](src/renderer/views/QueueView.js#L715), [:823](src/renderer/views/QueueView.js#L823), [:883](src/renderer/views/QueueView.js#L883), [:1159](src/renderer/views/QueueView.js#L1159), [:1185](src/renderer/views/QueueView.js#L1185) — title render sites in the queue.
- File: [src/renderer/views/ProjectsView.js:553](src/renderer/views/ProjectsView.js#L553) — clip-card title render in Projects list. Need to thread project's `gameTag` + `gameColor` through to the clip render.
- File: [src/renderer/components/modals.js:377](src/renderer/components/modals.js#L377) — clip detail modal title. Same treatment if the modal has access to the project.

The badge format: `<GamePill tag={clip.gameTag.toUpperCase()} color={projectGameColor} size="sm" />`. Theme colors from `gamesDb` already keyed by tag.

### 6. Fix the hashtag gating (NEW — not in issue body)

The default-title `"Clip N"` has no `#`, so `requireHashtagInTitle=true` would silently empty the queue. Relax the gate to accept either a title hashtag OR a `gameTag` field.

- File: [src/renderer/views/QueueView.js:157](src/renderer/views/QueueView.js#L157) — change `hasHashtag(c.title)` → `(hasHashtag(c.title) || !!c.gameTag)`.
- File: [src/renderer/editor/components/EditorLayout.js:415](src/renderer/editor/components/EditorLayout.js#L415) — same fix in the render-block guard. Pull `gameTag` from the editor clip context.

### 7. Remove the hallucinated-narration display sites

Drop the `clip.highlightReason` and `clip.peakQuote` render blocks in ProjectsView.js. No replacement.

- File: [src/renderer/views/ProjectsView.js:625-633](src/renderer/views/ProjectsView.js#L625) — delete the `clip.highlightReason` block.
- File: [src/renderer/views/ProjectsView.js:637-644](src/renderer/views/ProjectsView.js#L637) — delete the `clip.peakQuote` block.
- **Do NOT touch** `RightPanelNew.js:688/715` — those are AI Titles & Captions feature output, different schema.

### 8. Stop writing dead fields to the feedback DB

When clips get approved, ProjectsView writes `claudeReason` and `peakQuote` into the feedback DB. With those values now empty strings, the writes become no-ops. Clean up to avoid storing junk.

- File: [src/renderer/views/ProjectsView.js:430-431](src/renderer/views/ProjectsView.js#L430) — remove `claudeReason: clip.highlightReason || ""` and `peakQuote: clip.peakQuote || ""` from the approve payload. Verify `feedback.js` tolerates missing keys.
- File: [src/main/ai-prompt.js:226-230](src/main/ai-prompt.js#L226) and [:251-256](src/main/ai-prompt.js#L251) — drop the `Why it worked:` and `Peak quote:` lines from real-clips few-shot rendering. Old feedback rows have these fields; reading them still works, but we shouldn't surface them to the model. Title + energy + timestamp is the calibration signal that actually matters.

### 9. Publish guardrail — placeholder warning

Before any publish or schedule action, check if `clip.title` matches `/^Clip \d+$/`. If yes, show a confirmation toast/modal: *"This clip still has a placeholder name. Run AI Titles and Captions first?"* with a "Publish anyway" escape. Manual renames bypass silently.

- File: [src/renderer/views/QueueView.js:373-379](src/renderer/views/QueueView.js#L373) — immediate-publish call sites (TikTok / Instagram / Facebook / YouTube). Add the regex check before each.
- File: [src/renderer/views/QueueView.js:523-541](src/renderer/views/QueueView.js#L523) — scheduled-publish call sites. Same guardrail.
- Best implementation: extract a single `confirmPlaceholderTitle(clip)` helper that returns `Promise<boolean>` and gate both flows on it. Cancellation = abort publish.

### 10. Soft DB migration for legacy clips

Old project.json files have Claude-written titles, populated `highlightReason`, populated `peakQuote`. Don't rewrite history. New clips just don't populate them. Existing UI changes already silently no-op when those fields are empty.

No code changes here — just verify by opening an existing project after the rebuild and confirming it still loads. Game-tag badge will fall back to `extractGameTag(title)` for old clips, or be absent if neither field is set (acceptable).

### 11. Build + smoke-test

- `npm run build:renderer` → no errors
- `npm start` → app launches
- Drop the reference RL recording: `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\Test Footage\2026-10\RL 2026-10-15 Day9 Pt1.mp4`
- Pipeline runs to completion. No "LLM returned invalid JSON" crash. Project loads in Projects with clips titled `"Clip 1"`, `"Clip 2"`, ..., each with an `[RL]` badge.
- Open editor on a clip → title editable, no `clip.why` block visible (it never existed there to begin with — sanity).
- Rename a clip to `"sick play #RL"` → goes to queue (passes hashtag gate).
- Try to publish a clip still named `"Clip 3"` → guardrail fires.
- Open an existing pre-fix project → still renders, old titles intact.

---

## Acceptance criteria (mirror of issue, ticked at session end)

- [ ] Stage 6 prompt updated to minimal schema. No `title`, `why`, `peak_quote`.
- [ ] Pipeline assigns `"Clip N"` as default title for every new clip.
- [ ] `clip.gameTag` exists as first-class field on every new clip object.
- [ ] All `extractGameTag(clip.title)` callers prefer `clip.gameTag` with title-parse fallback.
- [ ] Queue + Projects list render a game-tag chip next to `clip.title`.
- [ ] ProjectsView no longer renders `highlightReason` or `peakQuote` blocks.
- [ ] Feedback DB writes drop `claudeReason` and `peakQuote`. Few-shot prompt drops them too.
- [ ] Hashtag gate relaxed to accept either title hashtag OR `clip.gameTag`.
- [ ] Publish/schedule shows placeholder-title warning when `clip.title` matches `/^Clip \d+$/`. User-renamed clips bypass silently.
- [ ] `max_tokens` = 8192. Clip cap = 20.
- [ ] Reference RL recording produces valid JSON every time.
- [ ] Existing projects still open and render with old titles intact.

---

## Files touched (estimated)

- `src/main/ai-prompt.js` (schema + few-shot)
- `src/main/ai-pipeline.js` (max_tokens, clip-record write)
- `src/renderer/views/QueueView.js` (gameTag plumbing, badge render, hashtag gate, publish guardrail)
- `src/renderer/views/ProjectsView.js` (badge render, drop highlightReason/peakQuote display + feedback writes)
- `src/renderer/editor/components/EditorLayout.js` (hashtag gate fix only)
- `src/renderer/components/modals.js` (badge render in clip detail modal)
- Possibly `src/renderer/components/shared.js` (no removal — leave `extractGameTag` for legacy fallback)

**Not touching:** `RightPanelNew.js` (issue is wrong about it), `feedback.js` (handles missing keys gracefully — verify only), `database.js`, `projects.js`.

---

## Risks / watch out for

- **Game-color in badge:** `clip.gameTag` is just the tag string. Color comes from `gamesDb` lookup. Verify both QueueView and ProjectsView already have `gamesDb` in scope before badge work — they do (see [App.js:474-581](src/renderer/App.js#L474)).
- **AI Titles flow assumption:** Direction 1 says AI Titles overwrites the placeholder. Verify the AI Titles call site already does `setClipTitle(suggestion)` somewhere in `RightPanelNew` or its store. If it only suggests without overwriting, that's a separate fix — but per issue, that's "follow-up not in scope here."
- **The `caption` field** at ai-pipeline.js:620 was `clip.title || ""`. New behavior: `""`. Consumers of `clip.caption` need a quick scan — likely fine but verify.
- **`extractGameTag` regex is case-insensitive lowercase output.** `clip.gameTag` is whatever `gameData.gameTag` was at pipeline time (typically uppercase like `RL`). The comparison sites at [QueueView.js:175,617,787](src/renderer/views/QueueView.js#L175) compare against `mainGameTag`. Lowercase both sides at the comparison, OR keep one canonical case. Pick one and apply consistently — likely lowercase via `.toLowerCase()` at compare time, since `mainGameTag` source is unclear.
- **No electron-store schema changes** in this issue — `requireHashtagInTitle` already exists. So [pipeline.md migration rule](.claude/rules/pipeline.md) does not apply here. (The strict-mode toggle migration is #72's problem, not #71's.)
