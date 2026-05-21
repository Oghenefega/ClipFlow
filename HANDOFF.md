# ClipFlow — Session Handoff
_Last updated: 2026-05-21 — Session 42 — #85 caption/title architecture (content foundation)_

---

## One-line TL;DR

**Content foundation for [#85](https://github.com/Oghenefega/ClipFlow/issues/85) is done and committed (`17e6d14`).** Extracted the hook *science* from the NotebookLM research notebook, designed a content-first generation architecture, and wrote the two data files that unblock the rest of #85. Mid-session the design pivoted hard: **the hook-archetype taxonomy was dropped** — it turned out archetype-first generation is itself the cause of generic AI copy. Next session does the backend prompt rewrite.

---

## What was built

Two new files in `src/main/data/` (committed, not yet wired to anything — no runtime behaviour change):

- **`caption-frameworks.md`** — the architecture document. The generation pipeline, the failure model, the 4 drivers, the 3 pillars, execution rules, anti-patterns. Human-readable source of truth.
- **`caption-hook-examples.json`** — the machine-readable knowledge base the future prompt builder loads: 3 pillars, 4 drivers, execution rules, payoff-integrity rules, batch logic, **6 worked pipeline examples**, 11 real viral gaming titles annotated with drivers, anti-patterns.

Also:
- **#85 issue body rewritten** — Content foundation marked done, new **Architecture** section added, Backend / UI / Verification / File-impact updated to drop archetype language. A [comment](https://github.com/Oghenefega/ClipFlow/issues/85#issuecomment-4512915441) records why archetypes were dropped.
- **`CHANGELOG.md`** — session 42 entry added.
- **`tasks/lessons.md`** — lesson logged: captions must not spoil the payoff; the constructed two-beat ("I said hi, he said no") is an AI tell.

---

## The architecture (settled this session)

Generation is a **content-first pipeline**, not an archetype menu:

```
CLIP TRUTH  →  3 PILLARS  →  DRIVER  →  EXECUTION  →  3 cards
 (the gate)    (skeleton)    (engine)    (finish)
```

- **Clip Truth** (gate) — find the genuine hook *in* the footage; discard any hook the clip can't pay off; never invent detail. This is the anti-hallucination gate.
- **3 Pillars** (skeleton) — every hook defines Character/Target, Concept/Transformation, Stakes (George Blackman's model).
- **4 Drivers** (engine) — Alertness (stops the scroll), Friction + Utility (earn the click), Resonance (prevents the swipe). A clip fires one or two.
- **Execution** (finish) — sentence case, length, one-idea, specificity, readability. Caption opens the loop (footage closes it), one natural thought, no spoiler, no two-beat.
- **3-card batch** — each card a genuinely different *angle*, with a short generated plain-language **chip** (e.g. "Leads with the stakes"). No `hook_archetype` enum.

Full reasoning in `src/main/data/caption-frameworks.md`. The hook science came from 5 deep extraction queries against the NotebookLM notebook (root drivers, decision logic, hook anatomy, the failure model, the packaging system).

---

## Key decisions (this session)

| Decision | Detail |
|---|---|
| **Archetypes dropped** | The hook-archetype taxonomy is NOT a build layer. Archetype-first generation = the documented "cargo-cult sameness" failure mode. Archetypes survive only as informal vocabulary. |
| Architecture | Content-first pipeline: Clip Truth → 3 Pillars → 4 Drivers → Execution. |
| 4 drivers | Alertness / Friction / Utility / Resonance — mapped to the timeline of a view. Validated against all sources (Creator Hooks' curiosity/fear/desire was found incomplete). |
| Chip | Per-card chip = short **generated plain-language angle** label, NOT an enum. |
| Caption rules | Caption opens the loop, footage closes it — **never spoil the outcome**. **No constructed two-beat** — one natural thought. |
| JSON schema | `caption-hook-examples.json` v2: pillars / drivers / execution / payoff_integrity / batch / worked_examples / real_world_titles / anti_patterns. |
| Worked examples | 6, each teaching the full pipeline (clip truth → pillars → drivers → title + caption + chip + why). Model-assisted, not harvested real captions. |

**Supersedes session 41:** session 41's decision table had "one hook archetype per card" and a "`hook_archetype` enum tag chip" — both **dead**. The casing rule (sentence case + 1-3 ALL-CAPS), hashtags, the Rephrase/Regenerate buttons, the 10-batch history, and context-forwarding decisions all **still stand**.

---

## Next steps

**#85 — Backend prompt rewrite (the bottleneck is now cleared).** In rough order:

1. Extract the inline prompt from `src/main/main.js:2146-2222` into a new `src/main/ai/title-caption-prompt.js` (pure refactor first, no behaviour change).
2. Rebuild the prompt around the pipeline — load `caption-hook-examples.json`, inject pillars/drivers/execution/worked_examples, output 3 titles + 3 captions each with an angle chip.
3. New IPC handlers: `anthropic:rephraseOption` (same angle + meaning, new phrasing) and `anthropic:regenerateOption` (new angle).
4. Forward extra context from detection → title/caption: peak-frame screenshot, `energy_level`, `confidence`, a new 1-line `peakMoment`. Touches `ai-pipeline.js` — may want its own session (changes the detection pipeline).
5. Persist `clip.aiHistory` (last 10 batches) + schema migration.
6. UI: batch arrows, per-card Rephrase/Regenerate, angle chip, 3+3 layout.

Likely 2-3 focused sessions. Verification = the blind A/B test in #85.

---

## Watch out for

- **NotebookLM auth expires fast.** Re-logged-in 3× this session. The `notebooklm-autologin` skill exists but lives in the **Obsidian vault's** `.claude/skills/` (`C:\Users\IAmAbsolute\Documents\Obsidian Vault\.claude\skills\notebooklm-autologin\SKILL.md`) — it never became global, so it does NOT appear in the skill menu. To use it: read that SKILL.md and follow its sentinel-file procedure manually (`notebooklm login` backgrounded, stdin tied to a wait-for-`/tmp/nlm_login_done.txt` loop, `touch` the sentinel once the user confirms browser login). Or the user can move it to `~/.claude/skills/` to make it real.
- **NotebookLM CLI crashes printing emojis** on the Windows console (cp1252). Always query with `--json`, redirect to a file, and extract the `answer` field with Python (utf-8). Don't print answers to the terminal.
- **The 6 worked-example captions are not individually user-validated.** The user approved the *architecture* and the caption *rules* — but each example caption may still need tuning when the prompt is actually built and A/B tested.
- **#85 checklist item 2 was only partially met** — "collect 20-30 real in-the-wild captions/titles." We have 11 real viral *titles* (in `real_world_titles`) and **zero real captions**. The 22+ caption examples are model-assisted. If the A/B test still shows generic output, harvesting real captions is the lever to pull — don't do it pre-emptively.
- **Creator Hooks** (creatorhooks.com/past-creator-hooks-newsletters/) is a strong *additional* reference — ~200 newsletters reverse-engineering viral title formulas. Long-form / Title Case, so use as structural reference only. Readable directly via WebFetch; deliberately NOT added to the notebook (would skew it toward long-form).
- **Schema migration** for `clip.aiHistory` — clip data lives in per-project JSON, not electron-store, so the strict electron-store migration rule may not apply. Verify where it lands before writing migration code.
- **Stray untracked junk** still in the repo (`nul`, `tmp/`, `tools/signals/__pycache__/`, `data/feedback.db.bak`, `.claude/worktrees/`, `.claude/launch.json`). Not committed. A `.gitignore` pass would help some session. `nul` is a stray Windows redirect artifact.

---

## Logs / debugging

- **No code or log lines touched this session** — only the two data files, CHANGELOG, lessons.md, and the #85 issue.
- **NotebookLM notebook:** `https://notebooklm.google.com/notebook/e5f80795-fd42-4e9d-8359-564ba83d7bbf` (37 sources). Query it via the `notebooklm` CLI.
- **NotebookLM query artifacts** from this session (`q*.json`, `sq*.json`, `*_answer.md`) are in Windows temp (`%TEMP%`) — ephemeral, will be cleaned by the OS. The notebook itself is the durable source.
- **Where the title/caption code lives**, for the backend rewrite:
  - IPC handler: `src/main/main.js:2118-2256` (`anthropic:generate`)
  - Inline system prompt to extract: `src/main/main.js:2146-2222`
  - History storage today: `store.get("titleCaptionHistory")` in electron-store, bounded 200 (`anthropic:logHistory`, `main.js:2295`)
  - Renderer entry: `useAIStore.generate()` → `window.clipflow.anthropicGenerate` (`src/renderer/editor/stores/useAIStore.js:25-64`)
  - In-memory per-clip cache: `useAIStore._perClipCache` (`useAIStore.js:19,114-137`)
  - Provider layer: `src/main/ai/providers/anthropic.js` — set `temperature` here if ever needed (currently unset → API default 1.0)
  - JSON extraction: `aiPrompt.extractJSON(text, "object")` (`ai-prompt.js:403`) — malformed model output surfaces as "Failed to parse AI response as JSON" in the editor AI panel.

---

## Session model + cost

- **Model:** Opus 4.7 — appropriate (multi-thread architecture design, iterative shaping with the user).
- **Commits this session:** 1 — `17e6d14` (`#85: caption/title architecture — content foundation`, 4 files, pushed to master).
- **Issues:** #85 updated (body rewritten + decision comment). None filed, none closed.
- **CHANGELOG:** session 42 entry added under `[Unreleased]`.
- Run `/cost` for the dollar figure.
