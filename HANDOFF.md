# ClipFlow — Session Handoff
_Last updated: 2026-05-28 — Session 44 — repo hygiene (fixed broken `git add -A`)_

---

## One-line TL;DR

**Short housekeeping session: `git add -A` is fixed.** Deleted the stray `nul` file, gitignored the noise (`.claude/worktrees/`, `tmp/`, `__pycache__/`, `*.bak`, `.claude/launch.json`), and untracked `.claude/settings.local.json` (it auto-churns permission entries every session). One commit pushed (`0c6103a`). No product code touched. **Next session: #85 Chunk B — forward detection context (peak frame, energy, peakMoment) into the title/caption prompt** to kill hallucinations like "lipper kill".

---

## Current State

App is unchanged from session 43 — builds and runs clean (`npm run build:renderer` + `npm start`). The editor AI panel generates 3 titles + 3 captions on the content-first pipeline, with per-card Rephrase/Regenerate working (functional, visually rough by the user's own call — polish deferred). This session was repo hygiene only; no product behaviour changed.

## What Was Just Built

- **`git add -A` unblocked.** Two real blockers removed: the stray `nul` file (Windows reserved device name from an old `> nul` redirect) is deleted, and `.claude/worktrees/` (two embedded git repos from isolated Claude runs) is now gitignored.
- **`.gitignore` pass** — added `.claude/worktrees/`, `.claude/launch.json`, `.claude/settings.local.json`, `tmp/`, `__pycache__/`, `*.bak`, and `nul`.
- **`.claude/settings.local.json` untracked** (`git rm --cached`) — it auto-appends permission entries every session, so it showed dirty constantly. File stays on disk and keeps working; git just ignores it now. Matches Claude Code convention for the `.local` overrides file.

## Key Decisions

| Decision | Why |
|---|---|
| Untrack `settings.local.json` rather than keep committing it | It's the personal/local permission-overrides file — by Claude Code convention it should be gitignored. It churned every session. Untracking kills the recurring "modified" noise; the file still works on disk. |
| No CHANGELOG entry for this session | CHANGELOG tracks product changes ("changes to ClipFlow"). A `.gitignore` + dev-local-settings change is repo hygiene, not product. Next session's real work (Chunk B) gets the changelog entry. |

## Next Steps (prioritized) — carried forward from session 43

1. **Chunk B — context forwarding (THIS is the next session's focus).** Forward from detection → title/caption prompt: the **peak-frame screenshot** (persist per-clip during detection — currently extracted but not saved), **`energy_level`** + **`confidence`** from the detection JSON, and a new 1-line **`peakMoment`** description generated during detection. This is the real anti-hallucination fix. Touches the detection pipeline — give it its own session.
   - Entry points: detection prompt `src/main/ai-prompt.js` (`buildSystemPrompt`/`buildUserContent`); detection pipeline `src/main/ai-pipeline.js`; thread new fields through `useAIStore._collectClipParams` → params → `title-caption-prompt.buildSystemPrompt`/`buildUserContent` (`src/main/ai/title-caption-prompt.js`).
2. **Chunk C — per-clip `aiHistory` (last 10 batches) + batch arrows in the panel.** Needs a schema migration. NOTE: clip data lives in per-project JSON, not electron-store — verify where it lands before writing migration code (the strict electron-store migration rule may not apply).
3. **Chunk D — wire `creatorProfile` into the title/caption prompt** (small). Today only styleGuide/game-context/history feed it; the `creatorProfile` object used by detection isn't passed.
4. **Looks pass on the AI panel** — the "it's ugly" debt. The action row is cramped; the whole panel could be rethought. Pair with [#86](https://github.com/Oghenefega/ClipFlow/issues/86) (icon system) if appetite.

## Watch Out For

- **The AI panel is functional but visually rough** — user explicitly accepted this and deferred polish. Don't treat the current layout as final.
- **Chunk B touches the detection pipeline** — the peak frame is extracted but not persisted today; the main lift is saving it per-clip during detection, then threading it forward. Scope it as its own session.
- **Chunk C migration surface is unclear** — confirm clip-data storage (per-project JSON vs electron-store) before writing the migration.
- **Single-card output trust** — `_runSingleCard` only accepts the result if `result.data[field]` exists (the right `title`/`caption` key). If the model returns the wrong key it surfaces "AI returned no usable result" rather than silently corrupting the card.
- **`git add -A` is now safe** — the `nul` + embedded-worktree blockers are gone and the noise is gitignored. (Resolved this session; previously broken.)

## Logs / Debugging

- **No product code or log paths touched this session** — `.gitignore` + git index only.
- **JSON parse failures** from the model surface as "Failed to parse AI response as JSON" in the AI panel — extraction is `aiPrompt.extractJSON(text, "object")` (`ai-prompt.js:403`). Same path for batch and single-card.
- **Quick prompt sanity-check** (no app needed): `node -e "const t=require('./src/main/ai/title-caption-prompt'); console.log(t.buildSingleSystemPrompt({mode:'rephrase',kind:'title'}).length)"`.
- **Verifying generation** requires the real app — `npm run build:renderer` + `npm start`, open a clip, AI Tools drawer, Generate. The renderer is desktop-first; do NOT verify via the Vite dev server.
- Electron startup log for the running instance is under `%TEMP%\claude\...\tasks\<id>.output`.

## Session model + cost

- **Model:** Opus 4.8.
- **Commits this session:** 1 — `0c6103a` (repo hygiene: fix broken `git add -A`). Pushed to master.
- **Issues:** none filed, none closed.
- **CHANGELOG:** not updated this session (hygiene only — see Key Decisions).
- Run `/cost` for the dollar figure.
