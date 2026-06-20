# ClipFlow — Session Handoff
_Last updated: 2026-06-19 — Session 89 — **Design-only session. Prototyped a premium redesign of the Projects tab clip cards; Fega picked the "Review Rail" direction and approved it after 3 rounds of feedback. No app code changed. Implementation is next session's job.**_

---

## One-line TL;DR
The Projects tab redesign is **designed and approved as a mockup** (`tasks/mocks/projects-tab-redesign.html`, "Review Rail" direction). Next session: build it into `ProjectsView.js` and fix the in-card transcript to read like the editor (no `[00:00]` stamps). Full build plan is the top ACTIVE PLAN in `tasks/todo.md`.

## Current State
On **0.1.8-alpha.11** (unchanged this session — `eb8cb22` was the session-88 wrap; nothing newer in git except this wrap). **No app code touched.** The only new artifact is the mockup HTML under `tasks/mocks/`. Working tree otherwise: the usual always-dirty `data/clipflow.db` + `data/game_profiles.json` (never commit), plus other untracked scratch in `tasks/mocks/` from prior sessions (bb*.md, queue-card-redesign.html, diag_sort.js — left as-is).

## What Was Just Built (this session)
- **Projects-tab redesign mockup** (`tasks/mocks/projects-tab-redesign.html`) — one self-contained HTML file, real `theme.js` tokens + DM Sans + realistic ARC Raiders clip data, two directions behind a top toggle. Iterated live with Fega (opened in his browser via `Start-Process` each round).
- **Direction chosen: "Review Rail"** (he rejected the Shorts-style grid). Final locked card, after his corrections:
  - LEFT: big watchable 9:16 preview (hover-to-play; only a duration pill on the video), with **✓/✗ approve/reject directly under the preview**.
  - RIGHT: title + **score top-right** (colored by threshold), one calm metadata line (game · energy · confidence · time · **status chips**), the **flowing transcript** (no timestamps), and **Open in Editor** as the main button.
- **Lessons captured + distilled** — new clip/review-card rules (thumbnail = footage only; clickable actions near the clip not far-right; preview must be watchable) → `clipflow-ui-debug` (Distilled Lessons) + memory `feedback_ui_density_aesthetic` + new memory `project_projects_tab_redesign`.

## Key Decisions
- **"Review Rail" over a Shorts grid.** Fega: the rail "feels more natural." The grid (video-first, transcript-on-hover) was the other prototyped option; shelved.
- **Thumbnail shows footage only.** Score + 'Rendered' as overlays on the video were rejected ("not sensible"). Score moved to top-right by the title; status to chips in the metadata line — matching where the current app already puts them.
- **Clickable actions go next to the clip, never far-right.** An earlier "verdict column" on the far right was rejected for mouse-reach cost. ✓/✗ now sit under the preview; Open in Editor stays in the content area.
- **Big preview is non-negotiable; whitespace is fine.** Fega: the preview must be large enough to actually watch the vertical clip, and "it's fine to have empty room if the transcript is small. don't shrink it." So taller cards are an accepted trade-off.
- **No code yet, on purpose.** We hit ~200k tokens and Fega chose to stop at the approved design and build next session.

## Next Steps (prioritized)
1. **Build the Review Rail into the real app** — `ProjectsView.js` `ClipRow`, using the existing **inline-`T`-theme** style (Projects is an "existing view," not the shadcn/Tailwind editor). Full step list is the top ACTIVE PLAN in `tasks/todo.md`. Verify in the running app (`build` + `npm start`), get Fega's eyes before declaring done.
2. **Transcript fix (part of the build):** replace the card's `transcriptSegs.map(... fmtTimestamp ...)` block (`ProjectsView.js` ~752–782) with the segment texts **joined into flowing prose**, mirroring the editor's `TranscriptTab` (`LeftPanelNew.js:338`). Drop the per-line `[mm:ss]` stamps.
3. **Still-pending carry-over verifications** (unchanged from session 88, all riding alpha.11): #140 cancel-render, #138 ALL-CAPS, #137 timeline split, #99 caption style-bleed, Bucket-A export-with-subtitles. Close each that passes (remove `status: untested`).

## Watch Out For
- **`ProjectsView.js` uses inline `T`-theme styles, NOT Tailwind/shadcn.** The mockup is plain CSS for visual approval only — translate it to the `T` token + inline-style idiom of the existing view, don't import the editor's component system.
- **Transcript data shape:** the card builds segments via `getClipTranscriptSegments(clip, project)` (`ProjectsView.js:65`) which filters `project.transcription.segments` to the clip's `[startTime, endTime]` window and returns `{start, end, text}`. For the flowing-prose fix, just join the `text` fields (trimmed) — the timestamps were the whole problem.
- **Mock realism caveat:** the mockup's video frames are CSS-gradient placeholders; the real cards keep the existing `ClipVideoPlayer`. Don't copy the faux-frame CSS into the app.
- **`data/clipflow.db` + `data/game_profiles.json` are always dirty — never commit.** Stage explicitly; never `git add -A`.
- **`package.json` silent-strip gotcha** ([[project_package_json_strip]]) — if a future build breaks for no reason, check it still has its `scripts`/`build`/`devDependencies` blocks and `git checkout HEAD -- package.json`.

## Logs / Debugging
- **No runtime debugging this session** (design only — nothing built or run).
- **Viewing the mockup:** `Start-Process 'C:\Users\IAmAbsolute\Desktop\ClipFlow\tasks\mocks\projects-tab-redesign.html'` (opens in Fega's default browser). It defaults to the chosen "Review Rail" view; the top toggle switches to the rejected "Shorts gallery" for reference.
- **Relevant source for the build:** card render `ProjectsView.js` `ClipRow` (~620–811); transcript getter `getClipTranscriptSegments` (`:65`) + `fmtTimestamp` (`:85`); editor's flowing transcript `LeftPanelNew.js` `TranscriptTab` (`:210`, render `:338`); theme tokens `src/renderer/styles/theme.js`.
- **App log** (when building/running next session): `%APPDATA%\clipflow\logs\app.log`. Bash tool is Git Bash — resolve `%APPDATA%` via `node -e "console.log(process.env.APPDATA)"`.
