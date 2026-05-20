# ClipFlow — Session Handoff
_Last updated: 2026-05-17 — Session 41 — AI title/caption overhaul: diagnosis + planning_

---

## One-line TL;DR

**Planning + research-kickoff session — no code changed.** Diagnosed why the AI title/caption suggestions read generic, locked all the design decisions, filed it as multi-part issue [#85](https://github.com/Oghenefega/ClipFlow/issues/85), and kicked off the content-foundation research (a NotebookLM notebook of gaming-shorts hook sources is now built). Next session does the framework extraction.

---

## What was built

Nothing in code. This was diagnosis, decision-making, and research kickoff. Artifacts produced:

- **Issue [#85](https://github.com/Oghenefega/ClipFlow/issues/85)** — "AI title/caption generation overhaul" — multi-part checklist (Content foundation / Backend / UI / deferred), file-impact table, verification plan. Labels: `type: improvement`, `area: ai`, `area: editor`, `milestone: commercial-launch`.
- **NotebookLM research notebook** — built in a separate session from a research prompt drafted here. Stocked with sources on top gaming/streaming creators + YouTube-algorithm / hook-psychology authorities. URL pinned as a [comment on #85](https://github.com/Oghenefega/ClipFlow/issues/85#issuecomment-4503088943): `https://notebooklm.google.com/notebook/e5f80795-fd42-4e9d-8359-564ba83d7bbf`
- `tasks/todo.md` reset — cleared the stale TikTok-audit plan (shipped in session 39), now points at #85.

---

## The diagnosis (why the output is generic)

The title/caption system prompt lives inline at **`src/main/main.js:2146-2222`**. Confirmed failure modes:

1. **Zero few-shot examples** of good captions — prompt says "be punchy" without showing punchy.
2. **Forced Title Case** rule ("capitalize the first letter of each major word", line 2162) — the #1 tell of AI-written shorts copy.
3. **The `"why"` field corrupts generation** — model writes captions that justify themselves rather than land. Visible in the sampled output: title 5's `why` praises its own use of the weak word "yikes."
4. **Creator profile unused** — `creatorProfile` (archetype/momentPriorities/signaturePhrases) feeds the *detection* prompt (`ai-prompt.js`) but not this one.
5. **Transcript-only input** — no peak frame, no energy level, no confidence, no peak-moment description. Direct cause of the "lipper kill" hallucination in sampled output.
6. **Flat history dump** — past picks listed verbatim, no pattern extraction.
7. **Single-shot 5+5** — produces a menu of syntactic variations, not real angle variety.
8. **Temperature is NOT a problem** — the call sets no `temperature`, inherits Anthropic's API default of 1.0 (already max-creative). Confirmed in `src/main/ai/providers/anthropic.js` — `body` only sends model/max_tokens/system/messages/tools.

Model in use: `claude-sonnet-4-6`. `maxTokens` for this call: 2000.

---

## Key decisions (all locked this session)

| # | Decision |
|---|----------|
| Batch size | First generation = **3 titles + 3 captions** (down from 5+5). **One hook archetype per card.** |
| Caps rule | **Sentence case**, not Title Case. Proper nouns / `I` / acronyms (POV) capitalize normally. **1-3 ALL-CAPS words** allowed for emphasis. |
| Hashtags | **Keep** `#gamehashtag` on titles. Function over vibes — not optimizing for "feels less templatey." |
| `"why"` field | **Replace** the wordy paragraph with a single `hook_archetype` enum tag (a chip on each card). |
| Per-card buttons | **2 buttons: Rephrase + Regenerate.** Rephrase = same hook + same meaning, different phrasing (cheaper call). Regenerate = entirely different angle. (Rejected the earlier punchier/deeper/different-angle 3-button idea.) |
| History | **Persist to disk per clip**, last **10 batches**. Each API call (Generate, Rephrase, Regenerate) = one new batch. Batch arrows at top of panel navigate them. Survives app restart. |
| Context forwarding | Pass peak frame screenshot + energy_level + confidence + a new 1-line `peakMoment` description from detection into the title/caption call. |
| Prompt extraction | Move the inline prompt out of `main.js` into `src/main/ai/title-caption-prompt.js` (pure refactor). |
| Vetoes | **Deferred.** Build the playbook first; revisit only if output quality still needs it. |
| Voice swatch | **Deferred.** Too much workflow complexity for unproven value. |
| Model-agnostic goal | Prompt must rely on structure + examples + explicit rules, not Claude-specific tricks — any model should produce equivalent quality. |

---

## Next steps

**Issue #85 — Content foundation, remaining:**
1. **Query the NotebookLM notebook** (URL above) to extract the hook-archetype taxonomy and exemplar library.
2. Write `src/main/data/caption-frameworks.md` (human-readable reference) + `src/main/data/caption-hook-examples.json` (machine-readable few-shot data the prompt loads).

These two are the bottleneck — the prompt rewrite and all UI work are blocked until they exist. Recommend the next session starts here, with the notebook as its input.

**After the foundation exists** — work the Backend + UI checklists on #85 in order. Likely 1-2 focused sessions. The context-forwarding piece (peak frame from detection) touches `ai-pipeline.js` and may want its own session since it changes the detection pipeline.

---

## Watch out for

- **`tasks/todo.md` is intentionally near-empty now.** Feature/bug work is tracked as GitHub issues per the user's explicit preference this session. Don't re-bloat todo.md with detailed plans — that's what #85's checklist is for.
- **Schema migration required** for the new `clip.aiHistory` field. Per `.claude/rules/pipeline.md` — but note clip data lives in per-project JSON, not electron-store, so (like the TikTok fields in session 39) the strict electron-store migration rule may not apply. Verify where `clip.aiHistory` will actually live before writing migration code.
- **The "lipper kill" hallucination** in sampled output is a real signal, not noise — it's the model inventing gaming jargon to fill a context gap. Forwarding the peak frame is the fix; don't dismiss it.
- **Don't add per-card history UI.** History is batch-level only (arrows at the top). Each Rephrase/Regenerate creates a whole new batch — keeps the data model simple.
- **Stray untracked files** in the repo (`nul`, `tmp/`, `tools/signals/__pycache__/`, `data/feedback.db.bak`, `.claude/worktrees/`) — junk/dev artifacts, not committed. Worth a `.gitignore` pass some session, but out of scope here.

---

## Logs / debugging

- **No log lines added or changed this session** — no code touched.
- **Where the title/caption code lives**, for the next session:
  - IPC handler: `src/main/main.js:2118-2256` (`anthropic:generate`)
  - Inline system prompt to be extracted: `src/main/main.js:2146-2222`
  - History storage: `store.get("titleCaptionHistory")` in electron-store, bounded to 200 entries (`anthropic:logHistory` handler, `main.js:2295`)
  - Renderer entry point: `useAIStore.generate()` → `window.clipflow.anthropicGenerate` (`src/renderer/editor/stores/useAIStore.js:25-64`)
  - Existing in-memory per-clip cache: `useAIStore._perClipCache` (`useAIStore.js:19,114-137`) — this is what makes suggestions survive clip-switching *within* a session today; #85 extends it to survive app restart.
  - Provider layer: `src/main/ai/providers/anthropic.js` — confirm here if you ever need to set `temperature` explicitly (currently unset → API default 1.0).
- **If a future build of the new prompt produces no output:** the JSON extraction path is `aiPrompt.extractJSON(text, "object")` (`ai-prompt.js:403`). It strips markdown fences and finds `{`/`}` boundaries. Malformed model output surfaces as `"Failed to parse AI response as JSON"` in the editor AI panel.

---

## Session model + cost

- **Model:** Opus 4.7 — appropriate for this session (diagnosis + multi-thread design decisions).
- **Commits this session:** 1 pending — HANDOFF + todo.md reset. No code.
- **Issues filed:** 1 ([#85](https://github.com/Oghenefega/ClipFlow/issues/85)).
- **Issues closed:** 0.
- **CHANGELOG:** no entry — zero code changes this session. The `[Unreleased]` section still holds session 40's brand-glyph work.
