# ClipFlow — Session Handoff
_Last updated: 2026-06-19 — Session 87 — **Fega confirmed alpha.9.1 (editor subtitles + Recordings sort) → closed #144. Then hit a new bug: AI titles/captions described moments from elsewhere in the source recording, not the open clip. Root-caused to a transcript-scope defect, fixed in one line, and cut 0.1.8-alpha.10 to promote it (also carries the still-unverified #140/#137/#138/#99).**_

---

## One-line TL;DR
AI title/caption generation now reads ONLY the clip's cut window instead of the whole 30-min recording. Install **0.1.8-alpha.10**. Next session: confirm Fega's verification (AI scope fix + the 4 bonus fixes + the still-pending export-font check), then close out what passed.

## Current State
On **0.1.8-alpha.10** in git (`e6e01e8`, installer `dist/ClipFlow Setup 0.1.8-alpha.10.exe`, 121MB, built 16:22). All work committed + pushed. No schema change, no migrations. **#144 CLOSED** (Fega confirmed editor subtitles on fresh clips + Recordings order, both on alpha.9.1). **Awaiting Fega's verification** of: (1) the AI scope fix on Clip 5, (2) the 4 bonus fixes riding along, (3) the still-pending export-with-subtitles-in-Latina-Essential check from Bucket A. Working tree: usual runtime churn (`data/clipflow.db`, `data/game_profiles.json`) + untracked `tasks/mocks/` (session-86 scratch).

## What Was Just Built (this session)
1. **AI title/caption transcript scope fix** (`1b24714`) — the headline. `_collectClipParams` (`src/renderer/editor/stores/useAIStore.js:30`) built the AI transcript by joining ALL of `editSegments`, but `editSegments` is **source-wide by design** (`resolveClipSubtitles(..., {includeExtras:true})` merges the whole `project.transcription` in so outward extends have words pre-loaded). So the AI received the entire 30-min recording's transcript → titles/captions referenced moments from *other* clips. Now reads from `getTimelineMappedSegments()` (the same `visibleSubtitleSegments` window-clipping the Transcript panel, preview, and render path use). One line; covers Generate/Rephrase/Regenerate (shared helper). Renderer compiled clean.
2. **Cut 0.1.8-alpha.10** (`e6e01e8`) — bump + CHANGELOG + full `npm run build`. Promotes the AI fix to the installed app and carries the still-unverified fixes already baked into alpha.9.1: cancel-render (#140), timeline split (#137), ALL-CAPS (#138), caption style-bleed (#99).
3. **#144 closed** — Fega confirmed on alpha.9.1; commented with the confirmation.
4. **Lesson distilled** — "raw `editSegments` is source-wide; never read it as the clip's content — clip via `getTimelineMappedSegments`/`visibleSubtitleSegments`" → `clipflow-editor-patterns` (Transcript vs Edit Subtitles section).

## Key Decisions
- **Reused `getTimelineMappedSegments()` rather than hand-rolling a window filter.** It runs `editSegments` through the exact `visibleSubtitleSegments` clipping every other consumer uses, so the AI transcript can never diverge from what the user sees / what gets rendered. Verified the only unclipped fallback (`nleSegments` empty) can't fire for a real generated clip (`useEditorStore.js:167-169` always builds a segment spanning the clip range).
- **One fix point covers all three AI actions** — Generate, Rephrase, Regenerate all flow through `_collectClipParams`.
- **No GitHub issue filed** — it was an inline fix in the same commit; per `.claude/docs/issue-filing.md` ("don't file for inline fixes handled in the same commit"), the CHANGELOG + commit is the paper trail.
- **Cut an installer now (not batched)** — Fega explicitly asked, and it lets him verify the AI fix + exercise the 4 pending fixes in one reinstall instead of waiting for ~10 to pile up.
- **Bug was latent, not a session-86 regression** — it predates everything; the #144 fix (fresh clips now populate `editSegments`) is what newly exposed it on fresh clips (before, the AI got an empty transcript instead of the wrong one).

## Next Steps (prioritized)
1. **Fega installs alpha.10 + verifies** (plain steps were given in chat):
   - **PRIMARY:** Open **Clip 5** (AR Day 16 Part 3) → AI Tools → **Generate** → titles/captions should be about the **loadout/gun mods ONLY**, zero references to the betrayal/exit/other moments. On pass: note the AI-scope bug resolved.
   - **BONUS (skippable):** #140 cancel a render (✕ on the gold % pill), #138 ALL-CAPS actually uppercases preview+export, #137 timeline split lands where clicked, #99 custom caption style doesn't bleed to another clip. Close each that passes (remove `status: untested`).
   - **Still-pending Bucket A:** export a clip → open the `.mp4` → subtitles present AND in Latina Essential. On pass: Bucket A fully resolved.
2. **If AI titles STILL reference other clips** after alpha.10 → the fix didn't take or there's a second source; re-check that `getTimelineMappedSegments()` returns clipped segments at Generate time (nleSegments populated) and that the install actually updated (Settings shows v0.1.8-alpha.10).
3. **Future audits** (untouched coverage gaps, from session 86): publish/OAuth flows (the big works-on-dev-only risk), packaged smoke-test of `tools/signals/*`, electron-store migration on UPGRADE of a real installed profile, fresh-clip divergence beyond subtitles (captions/titles/thumbnails).

## Watch Out For
- **Install alpha.10, not 9.1/9/8.** The in-app notifier picks newest by mtime → alpha.10 surfaces correctly. Settings → bottom must read **v0.1.8-alpha.10** to confirm the install took.
- **Raw `editSegments` is source-wide — do NOT read it as the clip's content.** Any new code needing the clip's actual transcript/words (AI input, export text, transcript joins) must clip via `getTimelineMappedSegments()`/`visibleSubtitleSegments`. This is the trap that caused this session's bug; now in `clipflow-editor-patterns`.
- **The 3 shared utils are still CJS** (`resolveSubtitles`, `cleanWordTimestamps`, `wordRepair` use `module.exports`) — don't re-add ESM `export`/`import`; the main-process `require()` in render.js depends on it.
- **`package.json` silent-strip gotcha** ([[project_package_json_strip]]) — if builds break for no reason, check it has its `scripts`/`build`/`devDependencies` blocks (it's now 105 lines, legitimately grown from the alpha.9 build.files/extraResources additions — NOT the old "99 lines" check) and `git checkout HEAD -- package.json`.
- **`data/clipflow.db` + `data/game_profiles.json` always dirty — never commit.** Stage files explicitly; never `git add -A`. `tasks/mocks/` is untracked scratch.

## Logs / Debugging
- **AI title/caption path (for re-tracing if the fix is questioned):** Generate button `RightPanelNew.js:734` → `useAIStore.generate` (`:52`) → `_collectClipParams` (`:30`) → transcript now from `getTimelineMappedSegments()`. Backend: preload `anthropicGenerate` → `main.js:2017` `anthropic:generate` → `title-caption-prompt.js buildUserContent` (`:259`) — backend only uses the `transcript` it's handed; no source injection there.
- **Window-clipping is the single source of truth:** `visibleSubtitleSegments` (`src/renderer/editor/models/timeMapping.js:220`) drops segments outside the kept NLE range and maps the rest to timeline time. `editSegments` (source-wide) → `getTimelineMappedSegments` (`useSubtitleStore.js:322`) → clipped. The Transcript panel uses the same via `getTimelineMappedOriginalSegments` (`:330`).
- **Pipeline logs:** `%APPDATA%\clipflow\processing\logs\<name>_<ts>.log` (per-video). **App log:** `%APPDATA%\clipflow\logs\app.log` (lifecycle/db/preview/waveform; NOT the AI pipeline). Bash tool is Git Bash — resolve `%APPDATA%` via `node -e "console.log(process.env.APPDATA)"`.
- **asar verification** (if a packaged-app issue resurfaces): `npx asar list dist/win-unpacked/resources/app.asar` (prints Windows BACKSLASH paths — grep `editor\utils`, not `editor/utils`).
