# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## Active Plan — #85 backend prompt rewrite (Session 43)

Tracked on GitHub: **[#85 — AI title/caption generation overhaul](https://github.com/Oghenefega/ClipFlow/issues/85)**.
Content foundation landed in session 42 (`caption-frameworks.md` +
`caption-hook-examples.json`). This session does the backend prompt rewrite
only — the part that makes generation actually use the pipeline architecture.

**Goal:** replace the inline title/caption system prompt with a pipeline-based
prompt builder that loads the caption-hook knowledge base, and change the
output from 5+5 with long `why` paragraphs to 3+3 with short `chip` angles.

### Backend rewrite — DONE (this session)
New module `title-caption-prompt.js`, `anthropic:generate` rewired, renderer
`why`→`chip`. First live run on a Rocket League clip surfaced two issues →
polish pass below.

### Polish pass — AI panel (this session, after first run)

First run worked (3+3, sentence case, JSON parsed) but exposed:
- **Chips read formulaic** — 3 of 6 worked-example chips in the JSON use the
  same "Leads with the ___" template, so the model copied it ("Leads with the
  loss of control / the refusal / the specific fault"). My few-shot leak.
- **No visual hierarchy** — TITLES/CAPTIONS render in identical tiny muted
  `SectionLabel` style; user couldn't tell where captions began.
- **Font too small** — `text-xs` (12px) suggestions vs ~16px subtitle words.
- **Chip looks more clickable than Apply/Skip** — bordered pill vs borderless
  text buttons (hierarchy inversion).

Steps:
1. **Chip wording (backend).** Rewrite the 3 repeating chips in
   `caption-hook-examples.json` to vary grammatical shape; add a `chip_variety`
   rule to `batch` + a DO-NOT line in `title-caption-prompt.js`.
2. **Section hierarchy (UI).** Loud section headers (foreground, larger) with a
   one-line descriptor ("Shows in search & the feed" / "Baked onto the video")
   + a divider before Captions.
3. **Card identity (UI).** Titles: hashtag rendered muted. Captions: left
   accent bar + larger text so they read as on-video text.
4. **Fonts (UI).** Titles → `text-sm` (14px), captions → `text-base` (16px).
5. **Chip styling (UI).** Soften chip to a plain muted italic label so it stops
   competing with Apply/Skip.

Files: `caption-hook-examples.json`, `title-caption-prompt.js`,
`RightPanelNew.js`. Not doing: per-card icons, fake video-frame previews.

**Steps (plain language):**

1. **Build a new prompt module** — `src/main/ai/title-caption-prompt.js`.
   Loads `caption-hook-examples.json`. Exports `buildSystemPrompt()` (the
   pipeline prompt: clip-truth gate → 3 pillars → 4 drivers → execution rules
   → payoff integrity → 3-card batch → 6 worked examples → real-world titles
   → anti-patterns) and `buildUserContent()` (per-clip transcript + context).
   New output schema: 3 titles + 3 captions, each `{ title/caption, chip }` —
   no more `why`. Keeps existing wiring for style guide, game context, and
   pick/reject history (main.js still gathers those and passes them in).

2. **Point `anthropic:generate` at the module** — in `main.js` (~2118-2256),
   delete the ~80-line inline system prompt and the inline user-message build;
   call the new module instead. main.js keeps reading styleGuide/history/
   gameContext from `store` and passes them as inputs.

3. **Renderer field rename** — in `RightPanelNew.js` (AIToolsPanel, ~688/715),
   change `t.why`/`c.why` → `t.chip`/`c.chip` so the angle chip renders. The
   batch now naturally shows 3 cards instead of 5 (the `.map` already handles
   any length). Full chip *styling* + batch arrows + per-card buttons stay in
   the later UI session.

**Verify:** `npm run build:renderer` + `npm start`. User clicks Generate on a
real clip. Confirm: 3 titles + 3 captions (not 5), sentence case (no Title
Case), each card shows a short chip, titles end with `#gamehashtag`, captions
carry no hashtags, JSON parses (no "Failed to parse AI response" error). The
blind A/B quality judgment from #85 is the user's iterative call after that.

**File impact:**
| File | Change |
|---|---|
| `src/main/ai/title-caption-prompt.js` | NEW — system + user-content builders |
| `src/main/main.js` | `anthropic:generate` rewritten to call the module |
| `src/renderer/editor/components/RightPanelNew.js` | `why` → `chip` field rename |

**Out of scope this session (later #85 sessions):** `anthropic:rephraseOption`
+ `anthropic:regenerateOption` IPC handlers; forwarding peak-frame / energy /
confidence / `peakMoment` from detection; `clip.aiHistory` persistence +
migration; AI-panel UI overhaul (batch arrows, per-card Rephrase/Regenerate
buttons, chip styling).

---

## Deferred plans

### Interactive architecture/flows visualizer

A previous session drafted a plan for a single-page HTML architecture
visualizer to live in the Obsidian vault (`context/architecture/`) using
vis-network 9.x. Never approved or started. Plan body is recoverable from
git history (`git log -p tasks/todo.md`). Re-introduce when there's
appetite for a docs-quality artifact.
