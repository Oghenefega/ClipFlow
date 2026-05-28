# ClipFlow — Session Handoff
_Last updated: 2026-05-22 — Session 43 — #85 backend prompt rewrite + panel polish + Chunk A (rephrase/regenerate)_

---

## One-line TL;DR

**#85 is now live in the app, not just on paper.** Generation runs on the content-first pipeline, the AI panel was made readable, and each title/caption card can be individually **rephrased** (same hook, reworded) or **regenerated** (new angle). Two commits pushed (`f133237`, `b5c9ae1`). Next session: **Chunk B — forward detection context (peak frame, energy, peakMoment) into the title/caption prompt** to kill hallucinations like "lipper kill".

---

## Current State

App builds and runs clean (`npm run build:renderer` + `npm start`). The editor AI panel generates 3 titles + 3 captions on the new pipeline, with per-card Rephrase/Regenerate working. Functional; the panel is visually rough by the user's own call ("it's ugly") — polish deferred on purpose.

## What Was Just Built

- **`src/main/ai/title-caption-prompt.js`** (NEW) — the prompt builder. `buildSystemPrompt`/`buildUserContent` (the 3+3 batch) and `buildSingleSystemPrompt`/`buildSingleUserContent` (single-card rephrase/regenerate, lean ~5.5k vs ~14k chars). Loads `caption-hook-examples.json`.
- **`anthropic:generate` rewired** (`main.js` ~2150) — inline 80-line prompt gone; calls the module. Shared `buildTitleCaptionStoreContext(params)` helper added (styleGuide + pick/reject history + game context) and reused by all three handlers.
- **`anthropic:rephraseOption` / `anthropic:regenerateOption`** (`main.js`, just after `anthropic:generate`) — single-card handlers via shared `handleSingleCard(mode, params)`. `maxTokens: 500`.
- **Preload bridges** — `anthropicRephraseOption`, `anthropicRegenerateOption` (`preload.js` ~102).
- **`useAIStore.js`** — `_collectClipParams(gamesDb)` factored out of `generate()`; new `busyCards` state (keyed `"title:0"`); `rephrase`/`regenerate` actions via `_runSingleCard(mode, apiKey, gamesDb, kind, idx)` — replaces only that slot, clears a stale "Applied" mark, surfaces errors.
- **`RightPanelNew.js` AIToolsPanel** — output is 3+3 with short angle **chips** (was 5+5 with `why` paragraphs). New helpers: `AISectionHeader` (loud section headers + descriptors), `ChipLabel` (muted italic, not a pill), `renderTitleWithHashtag` (muted hashtag), `CardActions` (per-card PenLine + RefreshCw buttons, spinner while busy). Titles 14px / captions 16px + left accent bar.
- **`caption-hook-examples.json`** — fixed the few-shot chip leak (3 chips were all "Leads with the ___"); added `batch.chip_variety` rule.
- **Issue [#86](https://github.com/Oghenefega/ClipFlow/issues/86) filed** — adopt a distinctive icon system (move off generic lucide). Not urgent; brand polish.

## Key Decisions

| Decision | Why |
|---|---|
| Dropped the blind A/B test from #85's verification | Required keeping the old prompt behind a flag; user chose to just regression-check the documented failure modes instead. |
| Single-card prompts omit worked-examples + real-world-titles | Those teach batch-level angle variety; a single card doesn't need them. Keeps rephrase/regenerate genuinely cheaper. |
| Per-card Rephrase = `PenLine`, Regenerate = `RefreshCw` | Pencil = "reword", circular arrow = "regenerate" (matches the batch Regenerate button's meaning at a different scope). Avoided a row of near-identical arrow glyphs (rejected `Repeat2`/`Shuffle`). |
| Native `title` tooltips on the card icons, not Radix | Radix tooltips showed stale text when sliding directly between the two icons. Native `title` is always correct; restyle in the looks pass. |
| Chip is a muted-italic label, not a bordered pill | The pill looked more clickable than the actual Apply/Skip buttons (hierarchy inversion). |

## Next Steps (prioritized)

1. **Chunk B — context forwarding (next session).** Forward from detection → title/caption prompt: the **peak-frame screenshot** (persist per-clip during detection — currently extracted but not saved), **`energy_level`** + **`confidence`** from the detection JSON, and a new 1-line **`peakMoment`** description generated during detection. This is the real anti-hallucination fix. Touches the detection pipeline — give it its own session.
   - Entry points: detection prompt `src/main/ai-prompt.js` (`buildSystemPrompt`/`buildUserContent`); detection pipeline `src/main/ai-pipeline.js`; thread new fields through `useAIStore._collectClipParams` → params → `title-caption-prompt.buildSystemPrompt`/`buildUserContent`.
2. **Chunk C — per-clip `aiHistory` (last 10 batches) + batch arrows in the panel.** Needs a schema migration. NOTE: clip data lives in per-project JSON, not electron-store — verify where it lands before writing migration code (the strict electron-store migration rule may not apply).
3. **Chunk D — wire `creatorProfile` into the title/caption prompt** (small). Today only styleGuide/game-context/history feed it; the `creatorProfile` object used by detection isn't passed.
4. **Looks pass on the AI panel** — the "it's ugly" debt. The action row is cramped; the whole panel could be rethought. Pair with #86 (icon system) if appetite.

## Watch Out For

- **The AI panel is functional but visually rough** — user explicitly accepted this and deferred polish. Don't treat the current layout as final.
- **Chunk C migration surface is unclear** — confirm clip-data storage (per-project JSON vs electron-store) before writing the migration.
- **`git add -A` is broken in this repo** — a stray `nul` file (Windows redirect artifact) and an embedded git repo at `.claude/worktrees/` make `-A` fail. Always `git add <explicit paths>`. Stray junk still uncommitted: `nul`, `tmp/`, `data/feedback.db.bak`, `tools/signals/__pycache__/`, `.claude/worktrees/`, `.claude/launch.json`. A `.gitignore` pass would help a future session.
- **Single-card output trust** — `_runSingleCard` only accepts the result if `result.data[field]` exists (the right `title`/`caption` key). If the model returns the wrong key it surfaces "AI returned no usable result" rather than silently corrupting the card.
- **The 6 worked-example captions still aren't individually user-validated** (carried over from session 42) — architecture + rules approved, individual examples may need tuning if output quality slips.

## Logs / Debugging

- **No log lines or error handlers touched this session** beyond the new IPC handlers' `try/catch` (each returns `{ error }` on failure, surfaced in the panel's red error bar).
- **JSON parse failures** from the model surface as "Failed to parse AI response as JSON" in the AI panel — extraction is `aiPrompt.extractJSON(text, "object")` (`ai-prompt.js:403`). Same path for batch and single-card.
- **Quick prompt sanity-check** (no app needed): `node -e "const t=require('./src/main/ai/title-caption-prompt'); console.log(t.buildSingleSystemPrompt({mode:'rephrase',kind:'title'}).length)"`.
- **Verifying generation** requires the real app — `npm run build:renderer` + `npm start`, open a clip, AI Tools drawer, Generate. The renderer is desktop-first; do NOT verify via the Vite dev server.
- Electron startup log for the running instance is under `%TEMP%\claude\...\tasks\<id>.output`.

## Session model + cost

- **Model:** Opus 4.8.
- **Commits this session:** 2 — `f133237` (prompt rewrite + panel polish), `b5c9ae1` (Chunk A rephrase/regenerate). Both pushed to master.
- **Issues:** #86 filed (icon system). None closed.
- **CHANGELOG:** session 43 entry updated (covers all three: prompt rewrite, polish, Chunk A).
- Run `/cost` for the dollar figure.
