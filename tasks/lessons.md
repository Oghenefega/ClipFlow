# ClipFlow — Lessons Learned

> After ANY correction from the user, add the pattern here.
> This file is the RAW CAPTURE LOG (intake), not the enforcement layer. It does not change behavior on its own — I never read it mid-work. The `session-end` command distills NEW entries into the place that actually fires (a domain skill, the code-review checklist, or rarely CLAUDE.md/memory). lessons.md feeds; skills enforce.
> <!-- DISTILLED-THROUGH: 2026-06-06 — FULL BACKLOG distilled into skills on 2026-06-02 (editor-patterns, ffmpeg-media, electron-ipc, ui-debug, code-review, trace-verify). Session 57: "jargon-free verification steps for the user" → clipflow-code-review + memory feedback_plan_clarity. Session 58: "test checklists need the action + observable, not just the clip/screen type" → clipflow-code-review + memory feedback_plan_clarity. New lessons added BELOW this line are awaiting distillation; advance this marker after each session-end pass. A handful of niche/no-skill-home lessons (Vizard API shapes, TikTok PKCE hex, caption-spoiler/AI-tell copy guidance, CLAUDE.md-editing meta, session-wrap behaviors) intentionally remain here only. Session 61: subtitle words[]/text invariant (#116/#117 family) → clipflow-editor-patterns (Karaoke). Session 62: no new lessons.md entries; the one process insight — "Fix/Fixes/Closes #N in a commit auto-closes the issue on push, BEFORE user verification (so add resolution notes via `gh issue comment`, not `gh issue close --comment`)" — went to memory feedback_fix_keyword_autocloses (process/workflow, no skill home). Session 63: subtitle VISUAL symptom had two causes (a real no-space markup bug + the word-pop scale animation masking it, #120) → routed "for a visual symptom, check the animation/transform layer, not just markup" to clipflow-ui-debug (Distilled Lessons). Marker advanced to 2026-06-07. Session 64: a Grep/ripgrep miss in gitignored `build/` output is a false negative (ripgrep skips .gitignored files; `build/` is gitignored) — caught while verifying #120's export fix → clipflow-trace-verify (Distilled Lessons); no other new lessons this session. Session 66: custom-tooltip convention (~0.5s show-delay + default-below placement, rendered fixed outside the card; #122) → clipflow-ui-debug (Distilled Lessons). Marker advanced to 2026-06-08. Session 67: tooltip show-delay corrected ~500ms → ~1.5s (Fega: too eager on a casual hover) → updated the value in clipflow-ui-debug; no new skill home needed. Session 68: a count+noun label must name the counted unit (input), not the produced unit — "Generate N Clips" (N=recordings, each → several clips) misread as 3 output clips → clipflow-code-review (Distilled Lessons). Marker stays 2026-06-08. Session 70: built #125 ((i) info popover + Play-in-editor source-preview) and fixed #126 (Recordings sorted by part number, not rename-click time); new lesson "don't build small UI glyphs from a system FONT — draw as SVG (font fallback differs across mockup/preview/app)" → clipflow-ui-debug (Distilled Lessons). Marker stays 2026-06-08. Session 71: shipped #57 Phase D1 (extracted TimelinePlayhead to stop the timeline's 60fps re-render storm); 4-lens adversarial review clean, Fega-verified; the one side-note (scrub frame-skip on long sources) was correctly diagnosed pre-existing and filed as #128. No user corrections → no new lessons.md entries. Marker stays 2026-06-08. Session 72: shipped #57 Phase D2 (SegmentRow React.memo extraction) and CLOSED the #57 epic (D3 was conditional, not needed). A user-requested "fresh eyes" pass ran a 27-agent find→verify workflow that cleanly separated D2-introduced bugs (zero) from pre-existing ones (4 found, filed #129–#132), then fixed the two safe pre-existing ones (#129 ALL-CAPS uncased-text gate, #130 stale long-segment warning). No user corrections → no new lessons.md entries. Marker stays 2026-06-08. Session 73: parked 12 launch/ops issues under a new `track: launch-ops` label and rewired the start-session ritual to hide them by default; ran an 11-agent backlog triage (menu saved to tasks/backlog-triage.md) and swept the code backlog 46→41 (closed 5 verified-resolved with status: untested, rescoped 3, corrected 2 the triage got wrong). New lesson — keep consequential/outward actions individually reviewable, never bundle many issue-closes or `rm -rf` into one opaque command, stage comment bodies via `--body-file` — routed to `.claude/docs/issue-filing.md` (Command style). Marker advanced to 2026-06-09. -->
> <!-- NEXT-UNDISTILLED-BELOW -->
> #### ↓↓↓ New lessons go below this line ↓↓↓
> Review at session start. Ruthlessly iterate until mistake rate drops to zero.

## Don't build small UI glyphs from a system FONT — draw them as SVG (2026-06-08, session 70)
**What happened:** For the Recordings card info affordance (#125/#126) Fega wanted a serif-italic "i". I styled it with `fontFamily: "Georgia, serif"; fontStyle: italic`. It looked great in the Claude Code preview (a serif was available) but fell back to a plain sans italic in Fega's own browser — "that's not what you put, at all." Several mockup rounds were burned chasing the look because each environment rendered the font differently; Fega eventually called it: "we're losing the plot."
**Why it's wrong:** A UI glyph built from a system font is at the mercy of font availability + the browser/Electron fallback chain. The mockup, the Claude preview, and the packaged app can all render it differently, so "looks right in the mockup" proves nothing about the app. Georgia is a Windows core font so the Electron app likely renders it, but "likely" ≠ "identical everywhere."
**Rule:** For any small UI glyph/icon that must look identical everywhere (browser mock, Claude preview, packaged app), draw it as an **SVG vector**, not a font character. Reserve `font-family` for actual body/label TEXT, where the app's bundled fonts (DM Sans, JetBrains Mono) are loaded — never lean on an unbundled system font for an icon-like glyph. Verify glyph designs in the TARGET (the Electron app), not just a browser mock. And timebox micro-polish: if a tiny element takes >2 mockup rounds, ship a reasonable default and move on.

## A label's count must name what it counts (the input), not the produced unit (2026-06-08, session 68)
**Correction:** Built the Recordings batch button as "Generate N Clips" (per the session-67 spec). Fega: "the wording is wrong, generate 3 'clips' makes it seem like only 3 verticals are going to be generated from the 3 selected videos." N is the number of selected *recordings*; each recording produces several clips, so "Generate 3 Clips" reads as "3 output clips total." The same misread was repeated in the live progress ("Generating clip N of M" — M counted recordings) and the summary.
**Why it was wrong:** A count+noun label silently asserts the noun IS the unit counted. Here the counted unit (recordings = input) differed from the noun (clips = output), so the number lied. I implemented the session-67 spec verbatim without sanity-checking that the number matched its noun.
**Rule:** When a label shows a count, the noun must name exactly what the number counts. If the action turns N inputs into a different output unit, count the inputs and name them ("Clip N Recordings") or drop the count entirely. Re-read every count+noun string this way before shipping. Routed to [[clipflow-code-review]] (Distilled Lessons). Final wording shipped: "Clip N Recordings" (#123).

## Tooltip show-delay: Fega wants ~1.5s, not the native ~500ms (2026-06-08, session 67)
**Correction:** Shipped the #122 tooltip with the ~500ms delay that session 66 had distilled as "correct." Fega: "the tooltip we created for the recordings tab triggers too fast. Can we make it about 1.5 seconds?"
**Why the prior value was wrong:** Session 66 ported the *native* `title` convention (~500ms) and treated it as the target. Fega actually wanted a more deliberate delay so the tooltip only appears on an intentional hover, not a casual mouse pass. A platform default is not automatically Fega's preferred feel.
**Rule:** ClipFlow custom hover tooltips use a ~1.5s show-delay. More broadly, timing/feel values are Fega's call — don't treat a platform default as "the right number"; tune to his preference (and confirm if unsure). Value corrected in [[clipflow-ui-debug]] (was ~500ms). Already-distilled, no new skill home.

## Custom tooltips need a ~0.5s show-delay and default BELOW placement — match platform convention (2026-06-08, session 66)
**Mistake:** Built the #122 custom recording-card tooltip to appear instantly and ABOVE the card. Fega: "tooltip is great but it shows up instantaneously, would've thought it'd take about 0.5 seconds… and it shows up above the hovered clip, normally it's meant to be below. having it above feels weird."
**Why I was wrong:** I replaced the native `title` attribute (which gives a ~0.5s delay and OS-standard below-placement for free) with a custom div that fired on `mouseEnter` with zero delay, positioned above. Dropping the native tooltip silently dropped its conventions too — and those conventions are load-bearing UX expectations, not incidental polish.
**Rule:** A custom tooltip must reproduce what the native one gave for free: a ~500ms hover delay before showing (cancelled on leave via a cleared timer), and default placement BELOW the anchor (flip above only when there's no room). When replacing any native control, port its behavioural defaults, not just its look. Routed to [[clipflow-ui-debug]].

## A Grep miss in gitignored build/ output is a false negative — read the build file to verify artifacts (2026-06-07, session 64)
**Near-miss (self-caught, NOT a user correction):** Verifying #120's export fix, I grepped `createTextNode\(suffix\)` across `**/overlay-renderer.js`; it matched only `public/`, not `build/`. I concluded the build was STALE and the burned-in render "would still be broken" — one step from telling Fega the export was still bad. It wasn't: the Grep tool (ripgrep) respects `.gitignore`, `build/` is gitignored, so ripgrep silently skipped it. Reading `build/subtitle-overlay/overlay-renderer.js` directly showed the fix present at the same lines (identical mtime to `public/` — `vite build` had copied it).
**Why it matters:** ClipFlow's prod runtime (isDev=false) loads from `build/`, and the offscreen export window loads `build/subtitle-overlay/`. "Is the build current?" is a recurring check, and grepping `build/` for a marker will ALWAYS come back empty (gitignored) — reading as "absent" when it's really "not searched." A false "stale build" claim would have sent Fega chasing a non-bug.
**Rule:** To verify a build artifact, READ the `build/` file directly (or `git check-ignore` it first) — never treat a Grep/ripgrep miss over gitignored output as proof of absence. Distilled into [[clipflow-trace-verify]].

## Subtitle ops must keep words[] in sync with text — the render reads words[], not text (2026-06-06, session 61)
**Pattern (emergent bug family, not a user correction):** Two bugs this session shared one root cause. The viewer AND the burned-in exporter render captions word-by-word from `segment.words[]`; `segment.text` is only a fallback used when `words` is empty (`PreviewOverlays.js` word branch at :150 vs text fallback at :241). Manually-created segments carried `text` but `words:[]`, so (a) standalone they rendered via the text fallback with NO karaoke highlight, and (b) merging one into a worded segment produced a *partial* `words[]` that silently dropped the manual word while the panel/timeline (which read `text`) still showed it — looked fine in the editor list, missing in the viewer and the exported video. #116 fixed create/merge by synthesizing even-split words (`_wordsFromText`). #117 (deferred) is the SAME family via resize: `updateSegmentTimes` filters words outside the trimmed bounds but leaves `text`, dropping the outer word irreversibly.
**Rule:** Any op that sets a segment's text or changes its time range MUST keep `words[]` covering `text` (or leave it empty). A *partial* `words[]` is the failure mode. Distilled into [[clipflow-editor-patterns]] (Karaoke section).

## Test/regression checklists for Fega need the ACTION + observable, not just the clip/screen type (2026-06-05, session 58)
**Mistake:** After shipping #110 Step 1+2 I handed Fega a regression checklist that listed clip TYPES — "1. A fresh clip you've never edited, 2. An edited clip, 3. An extended clip, 4. A re-transcribed clip, 5. An old clip." He replied: "I'm kind of confused as to what you want me to do… you're mentioning different types of clips but you're not telling me exactly what to do with them. Am I editing them? Am I editing the subtitles? Am I playing around?"
**Why I was wrong:** I named the test FIXTURES (which clip) but omitted the PROCEDURE (what to do to it) and the OBSERVABLE (what good vs bad looks like). "An edited clip" is a noun, not an instruction. This is the action-level twin of the session-57 jargon lesson: last time the words were too technical; this time the words were plain English but there was no verb and no pass/fail tell.
**Rule:** Every item in a hands-on test/regression list I give Fega must be a full instruction: **starting state + explicit action (verb + what to click) + what to look at + the ✅good / ❌flag-it tell.** Lead with the ONE item that actually proves the fix and say so; mark edge cases "skip if you don't have one." Never list clip/screen/state categories without the action and the observable. Extends [[feedback_plan_clarity]] and the session-57 lesson below.

## Verification steps I ask Fega to DO must be jargon-free and split from what I do (2026-06-05)
**Mistake:** Session 57. After fixing the Sentry `toFixed` crash I gave Fega a 5-step "verification plan" written for a coder: "open the clip that's currently crashing," "confirm the panel inits," "confirm `[initSegments]` logs a numeric `startSec`," "smoke-test a re-transcribed clip." He pushed back: "you telling me to confirm the panel 'inits' (which I don't know the meaning of since I've told you multiple times I'm not a coder)... I don't know what you're asking of me." He also couldn't help reproduce the bug ("I don't know what made the sentry error happen") — and my plan leaned on him to find the crashing clip, which the data agent had already shown probably no longer exists (self-healed).
**Why I was wrong:** I collapsed "what *I* verify (automated, technical)" and "what *Fega* does (eyeball check, plain words)" into one list, and used internal terms (`startSec`, "inits", "re-transcribed") as if they were common English. Fega is the sole tester but he is **not a coder** — anything I hand him to act on has to read like instructions for a normal app user.
**Rule:** When a task needs Fega to verify something, split it explicitly into two sections: **"I'll do this (you don't watch)"** — build, automated repro/tests, log checks — and **"What I need from you (~N min, no tech)"** — described purely in user terms ("open a couple clips, do the subtitles still show up and match the audio? screenshot anything that looks off"). Never ask him to read logs, confirm internal field values, or find a specific broken clip by its symptom. Prefer proving the fix myself with a synthetic reproduction so his check is a bonus regression pass, not the correctness gate. Any code term that slips in gets a plain-English gloss inline. Extends [[feedback_plan_clarity]].

## Negative constraints in CLAUDE.md are load-bearing — don't drop them as "bloat" (2026-04-25)
**Mistake:** During a CLAUDE.md consolidation, proposed dropping a "Do NOT consult this for: [list]" enumeration on the Infrastructure Dashboard rule, framing it as redundant with the positive inclusion list. User pushed back: "I've heard people say Claude works well knowing what NOT to do, as well as what to do." User was right.
**Why I was wrong:** A positive list narrows the inclusion set, but the negative list explicitly names the **borderline failure modes** — categories that pattern-match toward the positive list but shouldn't (e.g., "UI redesigns" and "AI prompt changes" both feel system-level, but neither is infra). Without the negative list, those edge cases get pulled in wrongly. The negative list is the error-correction layer.
**Rule:** Treat negative constraints as load-bearing unless I can prove a specific entry is fully covered by the positive list. The default move on a "Do NOT" list is **keep**, not trim. If trimming, name each entry being removed and justify why the positive list already excludes it.
**Anchored on:** Anthropic's prompting guidance recommending explicit negative constraints; the user's preference for explicit guardrails over inferred ones.

## "It works" ≠ "ship it and move on" — audit every fix before pivoting (2026-04-16)
**Mistake:** User confirmed B1 worked ("It freaking works!") and I immediately pivoted to B4 with a fresh plan. Did not re-read the code I just shipped, did not review logs from the successful run, did not look for dead code left behind by earlier attempts, did not check whether the fix path covered all quality paths or just the happy case the user happened to test. User called it out as sloppy — "are you sure you're working like the most intelligent coder that ever existed."
**What I missed by skipping the audit:** The take-2 merge in `useSubtitleStore.initSegments` bypassed the entire cleanup pipeline (mega-segment filter, duplicate-segment dedup, consecutive-word dedup, mergeWordTokens, validateWords, cleanWordTimestamps) for the source-wide extras. The test clip happened not to trigger whisperx artifacts in its extended range, so the bug was latent — the user would have seen inconsistent quality between clip-range and extend-range subs on a different file and filed it as a "new" bug, forcing another round of debugging with no memory of the original fix.
**Also missed:** `[setSegmentMode] Deduped 3 overlapping words` was firing twice per init in the logs. Not B1-related, but a clear smell (`initSegments` calls `setSegmentMode("3word")` → template replay calls it again). Would have been invisible without reading logs of the successful run.

**Rule — "Done means audited":** When the user confirms a fix works, BEFORE proposing the next task, always run this checklist:

1. **Re-read the diff of what shipped.** Not a summary — the actual code. What did I add? What did I leave stale?
2. **Re-read logs from the successful run.** Look for: unexpected double-fires, new warnings, things that worked but shouldn't have, things that should have logged but didn't.
3. **Trace edge cases the test didn't hit.** What quality paths did the primary test bypass? What inputs could produce the same symptom via a different code path?
4. **Grep for scaffolding left behind** from earlier attempts (variables, flags, temp fields, unused imports introduced mid-debug).
5. **Name the actual root cause in plain English.** If I can't explain in one sentence why the fix worked, I don't understand it yet.
6. **Flag separate issues found during audit.** File as GitHub issues (per autonomous-filing rule) — don't fix inline unless trivial, don't silently carry them.

Produce the audit as a visible report to the user BEFORE proposing the next task. The report proves I understand what shipped, what's still dirty, and why things now work — not just that the symptom cleared.

**Why this matters:** Symptom-clearing without understanding creates three compounding failures: (a) latent bugs ship as "fixed," (b) the next regression has no paper trail, (c) accumulated unknown cleanup debt makes future edits increasingly risky. A fix that "works" on one test case but is sloppy internally is worse than a broken fix — it hides.

## Fix-then-break chain: Understand the full pipeline BEFORE patching (2026-04-07)
**Mistake:** Attempted to fix subtitle misalignment after trim by patching individual symptoms (save format, stale detection, dedup, waveform audio track) without understanding the full architecture. Each fix revealed a deeper issue, leading to a chain of 8+ patches that left things "severely broken." The root cause (video file not matching editor timeline after mid-section deletes) wasn't identified until late in the session.
**Rule:** When a bug involves data flowing through multiple layers (FFmpeg → file → IPC → store → renderer), trace the ENTIRE pipeline end-to-end BEFORE writing any fix. Draw the data flow on paper: what does the file contain? What does the store expect? What does the renderer display? Identify ALL mismatches first, then fix from the foundation up — not symptom by symptom.

## Video file must match editor timeline model
**Mistake:** The editor's ripple-delete shifted audio segments and subtitles as if deleted content was removed, but the actual video file still contained the deleted audio (recut only trimmed outer bounds). This fundamental mismatch caused waveform, subtitle, and transcription alignment to break in ways that no amount of offset tracking or dedup could fix.
**Rule:** Any edit operation that changes the editor's timeline model (delete, ripple, insert) MUST produce a video file that matches. If the file can't be rebuilt immediately (too slow), at minimum track the mapping between editor timeline and file timeline explicitly, and ensure ALL consumers (waveform, subtitles, playback, render) use the correct coordinate system.

## Subtitle Segmentation Rules Keep Regressing (RECURRING)
**Mistake:** Subtitle segmentation fix was applied but later regressed — same issues reappeared across sessions. Two rules violated: (1) segments crossing sentence boundaries ("for sure. I"), (2) words grouped together despite long pauses between them ("guy baby" when 2s gap exists).
**Rule:** TWO non-negotiable segmentation rules: (A) Never group tail of one sentence with start of next — split at sentence-ending punctuation. (B) Never group words separated by significant pauses (2s+) — each word after a gap gets its own segment. Any fix to segmentation MUST include guards/tests for both rules to prevent future regression.

## Don't recommend deleting user data without explicit ask
**Mistake:** Research summary recommended "auto-delete pipeline logs after 30 days on startup." Then when user asked about it, claimed "I never added auto-deletion" — contradicting what was written in the plan. Pipeline logs contain API cost data and performance history that has long-term value for a commercial product.
**Rule:** Never recommend or implement auto-deletion of user data. If retention limits are needed, always ask the user first. And don't contradict your own written plan — if something was stated, own it.

## Windows File Locking (EBUSY)
**Mistake:** Tried to delete/replace a video file while Electron's `<video>` element had it open. On Windows, this causes `EBUSY: resource busy or locked`.
**Rule:** Before any IPC call that replaces a clip file on disk, ALWAYS unload the video element first (`removeAttribute("src")` + `.load()`), wait ~100ms for the OS to release the handle, then proceed.

## Always Add Diagnostic Logging
**Mistake:** Spent multiple rounds guessing at the root cause of left-extend failure. No error messages were visible to the user — errors were only logged to `console.error`.
**Rule:** For ANY IPC call that can fail, log the error visibly (at minimum `console.error` with full context values). During development of new features, add `console.log` at key decision points so failures can be traced. Don't remove diagnostic logs — they're cheap and invaluable for future debugging.

## React Declarative vs Imperative Video Control
**Mistake:** Tried to imperatively set `videoRef.current.src = ...` from a Zustand store while React was declaratively managing the same `<video>` element's `src` prop via `useMemo`. React overwrote the imperative change on re-render.
**Rule:** Use a `videoVersion` counter in the store. Increment it on clip re-cuts. Include it in the `videoSrc` memo dependency array with a `?v=N` cache buster. Add a `useEffect` that calls `.load()` when `videoSrc` changes (React `setAttribute` doesn't auto-load video).

---

## Vizard API

### Source video filtering — don't trust field-based heuristics
- **Mistake:** Used `!v.clipEditorUrl && !v.viralScore` to identify source videos. Failed because source videos CAN have both clipEditorUrl and viralScore from the Vizard API.
- **Fix:** Use **duration-based** detection. The source video (original upload, 10-60 min) is always drastically longer than AI clips (15-90s). Filter: longest video > 3 min AND > 3x second-longest = source.
- **Rule:** When filtering Vizard data, never assume a field is absent. Always use relative comparison (duration ratio) over absolute field checks.

### Vizard API response shape
- **Mistake:** Initially tried to access `result.data.videos` — the API returns data at the TOP level: `{ code: 2000, videos: [...], projectName, projectId }`.
- **Rule:** Always use `result.videos`, `result.projectId`, etc. directly. No `.data` nesting.

### videoId is THE unique identifier
- **Mistake:** Earlier code used auto-generated IDs for clips, causing deduplication bugs.
- **Rule:** Always use `v.videoId` from the API as the clip's primary identifier. Cast to string with `String(v.videoId)`.

---

## UI / UX

### Small visual indicators need glow, not just size
- **Mistake:** Used 5x5px dots for tracker source indicators. User said "barely visible."
- **Fix:** 7-8px dots with `boxShadow` glow effect matching the dot color (e.g., `0 0 6px 2px ${color}88`).
- **Rule:** Any indicator dot < 8px needs a glow/shadow to be visible on dark backgrounds. Always pair color with matching boxShadow.

### Long dropdowns are bad UX — split into logical groups
- **Mistake:** Time picker had a single dropdown with 288 options (every 5-min slot across 24 hours).
- **Fix:** Split into two compact dropdowns: Hour (8AM-12AM, 17 options) + Minute (00-55, 12 options).
- **Rule:** If a dropdown has > 20 options, consider splitting into multiple related dropdowns.

### Scrollbar overflow ruins polish
- **Mistake:** Scrollbars bled past rounded corners in multiple views.
- **Fix:** `overflow: hidden` on outer container + `overflow-y: auto` on inner scrollable div. Also `scrollbar-gutter: stable` and scrollbar-corner styling.
- **Rule:** Any container with `borderRadius` + scroll content needs the inner/outer overflow pattern.

### Badge placement — show detail in detail view, not list view
- **Mistake:** Showed project IDs on the main project list cards.
- **Fix:** Moved to ClipBrowser header (shown after selecting a project).
- **Rule:** Technical identifiers (IDs, hashes) belong in detail/expanded views, not list summaries.

---

### Always pass explicit data fields, never let AI infer from names
- **Mistake:** AI title generation didn't receive the game's `hashtag` field. It saw game name "Egging On" and inferred `#eo` (the tag code) instead of `#eggingon` (the actual hashtag).
- **Fix:** Pass `gameHashtag` explicitly from the store to the IPC handler, and inject the exact hashtag into the system prompt.
- **Rule:** When an AI prompt needs a specific value (hashtag, tag, ID), pass it as an explicit parameter. Never rely on the AI to derive it from a name or context.

### Always verify data shapes before writing filters
- **Mistake:** Queue filter used `trackerData.map(t => t.clipId)` but tracker entries had no `clipId` field — filter matched nothing.
- **Rule:** Before filtering on a field, verify it exists in the data creation code, not just the reading code.

### replace_all only matches EXACT text — verify ALL render sites
- **Mistake:** Used `replace_all` to add folder props to `<ProjectsListView>` in App.js. It matched 2 of 3 render sites because the third had different formatting. The missing props caused `onFoldersChanged` to be `undefined`, silently breaking folder creation.
- **Rule:** After any `replace_all` edit, grep for the component name and verify ALL instances were updated. Different indentation/formatting = different match.

### React synthetic stopPropagation doesn't stop native events reaching window listeners
- **Mistake:** Used `onMouseDown={(e) => e.stopPropagation()}` in React to prevent a `window.addEventListener("mousedown")` handler from firing. React's synthetic stopPropagation only stops other React handlers — the native event still reaches window.
- **Fix:** Use `data-menu` attribute on menu containers. In the window handler, check `e.target.closest("[data-menu]")` and skip closing if inside a menu.
- **Rule:** Never rely on React synthetic `stopPropagation` to block native DOM listeners on `window`/`document`. Use `data-*` attributes + `closest()` checks instead.

### overflow: hidden clips absolutely-positioned submenus
- **Mistake:** Context menu had `overflow: hidden` which clipped the color picker submenu positioned at `left: 100%` (outside the menu bounds).
- **Rule:** Don't use `overflow: hidden` on containers that have children with `position: absolute` extending beyond bounds. Use `overflow: visible` or render the submenu outside the parent.

---

## Data / Persistence

### Always add migration paths for schema changes
- **Pattern:** When changing how data is structured (e.g., adding source video filtering), also add a migration step in the data loading code to fix already-persisted data.
- **Rule:** Every schema/filter change needs TWO fixes: (1) fix the mapping function for new data, (2) add migration in the `storeGetAll` loader for existing data.

---

## Process

### NEVER pattern-match fixes — actually diagnose from the screenshot
- **Mistake:** User sent screenshots showing timecode inputs stretching way past their text content. Instead of analyzing the screenshot and recognizing the inputs were filling the FULL container width (a layout issue), I pattern-matched "too wide" → "reduce padding" and kept tweaking `px-2` → `px-1` → `px-0.5` across MULTIPLE rounds. The real cause was `flex-1` forcing inputs to stretch. This wasted the user's entire afternoon on a 5-second fix.
- **Root cause:** Laziness. Did not actually look at the screenshot carefully. Did not ask "what CSS property causes an element to fill its container?" — which immediately points to `flex-1`, not padding.
- **Rule:** When the user sends a screenshot of a UI bug:
  1. LOOK AT THE SCREENSHOT. Actually analyze what's wrong visually — don't skim it.
  2. Ask: "What CSS property could cause THIS specific visual behavior?" — not "what's the most common fix for this category of problem?"
  3. If a fix doesn't work on the first try, the diagnosis is WRONG. Stop tweaking the same property. Re-examine the screenshot and re-diagnose from scratch.
  4. Never submit a fix without mentally simulating whether it actually addresses what the screenshot shows.
- **This is non-negotiable.** Lazy debugging that wastes the user's time is unacceptable. One round max for trivial CSS issues.

### Build and verify before declaring done
- **Rule:** Always run `npx react-scripts build` after changes. Never mark a task complete without a successful build.
- **Rule:** If a fix involves filtering/mapping data, trace through the logic with the actual problematic data to verify correctness.

### Always run the app after building
- **Mistake:** Built successfully but didn't launch the app to visually verify changes. User had to ask.
- **Rule:** After EVERY build or code change, run `npm start` to launch the Electron app. Do not wait to be asked. Visual verification is mandatory before committing.

### Moving hooks but not their dependencies causes TDZ crashes
- **Mistake:** Added `useEffect` and `useCallback` that referenced `clipDuration` in their dependency arrays, but `clipDuration` was declared 700 lines later. JavaScript's Temporal Dead Zone (TDZ) makes `const` variables inaccessible before their declaration — `ReferenceError` at runtime, blank screen.
- **Rule:** When adding hooks that reference derived `const` values, ALWAYS check that those values are declared ABOVE the hook in the component body. Move declarations up if needed. `const` is NOT hoisted like `var`.

### When a fix doesn't work, change the approach entirely
- **Mistake:** Tried to tweak the field-based source video heuristic when it failed.
- **Rule:** If a heuristic fails once, the underlying assumption is wrong. Don't patch it — rethink the approach from scratch (which led to the duration-based solution).

---

## Windows / Native Binaries

### Node.js execFile doesn't propagate PATH to Windows DLL loader
- **Mistake:** Used `execFile` with `cwd` and `env.PATH` to run whisper-cli.exe. DLLs (ggml.dll, ggml-cuda.dll, cublas64, cudart64) were not found despite being in the directory.
- **Root cause:** On Windows, `execFile`/`spawn` set the child process PATH, but the Windows DLL loader resolves DLLs using the *parent* process PATH at load time, not the child's env. Setting `cwd` doesn't help either — Windows stopped using cwd for DLL search by default.
- **Fix:** Use `exec()` with `cmd /c "set "PATH=dirs;%PATH%" && "binary" args"`. The `set PATH` inside cmd.exe updates the shell environment BEFORE the exe loads, so the DLL loader sees it.
- **Rule:** When spawning native binaries with co-located DLLs on Windows from Node.js, ALWAYS use the `cmd /c set PATH=...&&` wrapper pattern. Never rely on `execFile` env or cwd for DLL resolution.

### CUDA toolkit DLLs live in bin/x64, not bin
- **Mistake:** Assumed cublas64, cudart64 were in `CUDA\v13.2\bin\`.
- **Reality:** They're in `CUDA\v13.2\bin\x64\`. The `bin\` folder only has compiler tools (nvcc, ptxas).
- **Rule:** When auto-discovering CUDA runtime DLLs, check BOTH `bin\` and `bin\x64\` subdirectories.

### whisper.cpp JSON timestamps are STRINGS, not numbers
- **Mistake:** `parseWhisperOutput()` used `seg.timestamps?.from || seg.offsets?.from || 0`. The `timestamps.from` field is a **string** like `"00:00:00,720"`, which is truthy — so the numeric `offsets.from` (720) was never reached. Then `"00:00:00,720" / 1000 = NaN`, which serializes as `null` in JSON.
- **Root cause:** whisper.cpp `--output-json-full` has TWO timestamp formats per segment/token: `timestamps` (human-readable strings `"HH:MM:SS,mmm"`) and `offsets` (integer milliseconds). The JS `||` operator short-circuits on truthy strings.
- **Fix:** Always use `offsets` (numeric) FIRST. Created `toMs()` helper that handles both formats. Use `toMs(seg.offsets?.from) || toMs(seg.timestamps?.from)`.
- **Rule:** When parsing external JSON with multiple representations of the same data, always prefer the typed/numeric field over string fields. Never use `||` chaining when the first value could be a truthy non-numeric type.

---

## UI / State Persistence

### View-local state resets on tab switch — persist it
- **Mistake:** `collapsed` folder state in RecordingsView was `useState({})` — lost every time the user navigated away and returned.
- **Fix:** Load from `storeGet("recordingsCollapsed")` on mount, persist to `storeSet` on every toggle.
- **Rule:** Any user-interactive UI state (collapsed sections, scroll positions, sort preferences) that should survive tab switches MUST be persisted via `storeGet/storeSet`. If it's annoying to lose, persist it.

---

## IPC / Data Unwrapping

### Always unwrap IPC response wrappers before storing in state
- **Mistake:** `handleSelectProject` stored the raw IPC result `{ success: true, project: {...} }` into `localProjects` instead of unwrapping to `full.project`. This meant the stored entry had `id = undefined` and no `clips` array. `localProjects.find(p => p.id === selProj.id)` always failed, so ClipBrowser showed 0 clips even though clips existed on disk.
- **Fix:** Use `full.project` when storing into `localProjects` and `setSelProj`. The IPC handler wraps the response — always unwrap before using the data.
- **Rule:** Every `ipcRenderer.invoke()` call returns a wrapper object. ALWAYS check the actual response shape and extract the payload (e.g., `result.project`, `result.data`) before putting it into React state. Never store IPC wrappers directly.

### After renaming a variable, grep for ALL references
- **Mistake:** Renamed `fullProj` to `proj` in the variable declaration but left `project={fullProj}` in the JSX, causing an undefined reference and a blank screen crash.
- **Rule:** After renaming any variable, search the ENTIRE block for all references to the old name. Use find-and-replace or grep, don't rely on visual scanning.

### Refs don't trigger re-renders — use store subscriptions for render-critical state
- **Mistake:** `EditorView` used `useRef(false)` for `initialized` and `useEditorStore.getState().clip` (one-time read) in a guard check. After `useEffect` set `initialized.current = true` and `initFromContext` populated the store, the component never re-rendered because refs and `getState()` don't trigger React updates. Editor opened blank.
- **Fix:** Subscribe to `clip` via `useEditorStore((s) => s.clip)` so the component re-renders when the store updates.
- **Rule:** If a component's render output depends on store data, ALWAYS subscribe with a selector hook. Never use `getState()` in render-path guards — it's a one-time snapshot, not a subscription. Refs are for side-effect tracking, not render control.

### NEVER use generic/fake/placeholder waveforms
- **Mistake:** Drew a fake sine-wave pattern in the audio track when real waveform data wasn't available. User called the timeline "absolutely broken" — the fake waveform served no purpose and was misleading.
- **Fix:** If no real waveform peaks exist, show "Extracting waveform..." text instead. Extract real peaks via FFmpeg in the main process (`ffmpegExtractWaveformPeaks` IPC) when video loads.
- **Rule:** NEVER fall back to a generated/fake/generic waveform. EVER. Only render actual audio data from the real video file. If data isn't ready, show a loading state or empty track.

### Timeline ruler must align with track content — account for label column offset
- **Mistake:** Ruler ticks started at x=0 but track content started at x=LABEL_W (72px). The ruler was visually misaligned from the tracks.
- **Fix:** Add LABEL_W offset to all ruler tick positions, playhead position, and scrub calculations. Use `contentWidth = timelineWidth - LABEL_W` for the actual content area.
- **Rule:** When a timeline has fixed-width labels on the left, ALL position calculations (ruler ticks, playhead, scrub-to-time) must account for the label offset. Introduce a `contentWidth` variable early and use it consistently.

### Subtitle segments must never overlap — push neighbors instead
- **Mistake:** Dragging a subtitle segment edge could overlap adjacent segments, creating invalid state.
- **Fix:** Resize handler now finds neighbors in sorted order. If a resize would overlap a neighbor, it pushes that neighbor's boundary (shrinking it) instead. If the neighbor can't shrink below minimum duration (0.1s), the resize is clamped.
- **Rule:** Timeline segments on the same track must enforce non-overlap constraints during resize. Always sort segments and check neighbors.

### Video duration must come from the video element, not clip metadata
- **Mistake:** Used `clip?.duration` which was undefined (clips store `startTime`/`endTime` but not `duration`). Timeline showed 00:00.0 for total duration, ruler had no ticks, everything was broken.
- **Fix:** Added `duration` to `usePlaybackStore`, set it from the video element's `loadedmetadata` event. Timeline subscribes to `usePlaybackStore.duration` instead of `clip?.duration`.
- **Rule:** For playback-critical values (duration, currentTime), always source from the actual HTML5 video element events, not from clip metadata which may be incomplete or structured differently.

### Never load full video files into the renderer process
- **Mistake:** `extractWaveformPeaks` used `fetch(filePath)` + `arrayBuffer()` + `decodeAudioData()` in the renderer to extract waveform peaks. Gaming recordings are multi-GB — loading the full file into renderer memory caused an instant OOM crash (DevTools showed "disconnected from page").
- **Fix:** Removed renderer-side waveform extraction entirely. Real waveform extraction must happen in the main process via FFmpeg (which can stream/seek without loading the whole file).
- **Rule:** NEVER load large files (video, audio) into the renderer process. Use the main process + FFmpeg for any media processing. The renderer's memory budget is ~512MB-1GB — a single large video file exceeds that.

### Never nest Radix Popover trigger inside Tooltip trigger (or vice versa)
- **Mistake:** Wrapped a `PopoverTrigger` around a `TooltipProvider > Tooltip > TooltipTrigger > Button`. The popover never opened because the tooltip swallowed the click events.
- **Fix:** Use a plain `<button>` as the `PopoverTrigger` child. If both tooltip and popover are needed on the same element, choose one — don't nest them.
- **Rule:** Radix primitives that manage focus/clicks (Popover, Dialog, Tooltip) conflict when nested on the same trigger element. Only one can own the trigger.

### When two UI controls are the same feature, merge them
- **Mistake:** Had separate "Sentence/Paragraph" toggle AND a "Segment mode" popover (Sentence/3-Word/1-Word). They controlled the same concept — how subtitles are chunked. Two controls for one feature is confusing.
- **Fix:** Merged into a single dropdown that shows the current mode label and opens a menu with all options.
- **Rule:** Before adding a new toolbar control, check if an existing control already covers the same behavior. Merge rather than duplicate.

### shadcn Slider only renders one thumb by default
- **Mistake:** Passed `value={[start, end]}` to the shadcn Slider expecting two thumbs. Only one thumb rendered because the component hard-codes a single `<SliderPrimitive.Thumb>`.
- **Fix:** Modified slider.tsx to dynamically render N thumbs based on the `value` array length.
- **Rule:** When using shadcn components with features beyond their defaults (multi-thumb, etc.), always check the component source — they are minimal wrappers and may not expose all Radix capabilities.

### CUDA version must match between torch and ctranslate2
- **Mistake:** torch was installed with cu118 (CUDA 11.8) but ctranslate2 4.7.1 requires cublas64_12.dll (CUDA 12). Transcription crashed with `cublas64_12.dll not found`.
- **Root cause:** `torch.version.cuda` returned `11.8` — torch ships its own CUDA DLLs (cublas64_11.dll in torch/lib/), and ctranslate2 needs the matching version.
- **Fix:** Installed torch 2.7.1+cu126 (CUDA 12.6) which ships cublas64_12.dll. System CUDA version (13.2) is irrelevant — torch bundles its own.
- **Rule:** When using ctranslate2 + torch together, verify `torch.version.cuda` matches ctranslate2's CUDA requirement. Always check the actual DLL files in the venv's `torch/lib/` directory.

### whisperx.align() silently drops segments — always merge with raw
- **Mistake:** Used `aligned.get("segments", result.get("segments", []))` which only falls back if alignment returns nothing at all. In reality, whisperx.align() (wav2vec2) drops individual segments it can't align — the rest come through fine, so the fallback never triggers.
- **Fix:** Merge aligned segments with raw transcription by text matching. For each raw segment, use the aligned version if available, otherwise keep the raw version. Log warnings for dropped segments.
- **Rule:** whisperx alignment is lossy. ALWAYS merge aligned output with raw transcription segments to prevent silent data loss. Never trust alignment output as complete.

### Whisper word tokens need text-guided merging — use segment text as ground truth
- **Mistake (round 1):** Used whisper's raw word-level tokens directly. Whisper tokenizes at subword level: "I'm" becomes ["I", "'m"]. In 1-word segment mode, these appeared as separate segments.
- **Mistake (round 2):** Added `mergeWordTokens()` with apostrophe-only heuristic. This only caught contractions but missed ALL other subword splits: "raiders" → ["ra","iders"], "Bioscanner" → ["bios","c","anner"], "Reagents" → ["reag","ents"], "Sentinel" → ["sent","inel"].
- **Fix:** Use the segment's `.text` field (which has correct whole words from whisper's sentence-level output) as ground truth. Split `.text` into real words, then consume tokens greedily to match each real word by concatenation.
- **Rule:** Whisper segments have TWO word sources: `.text` (correct sentence) and `.words` (subword tokens with timestamps). ALWAYS use `.text` to guide token merging. The approach: split text into words, then for each word, consume tokens until the concatenation matches. This handles contractions, compound words, and any subword splitting pattern.

### Transcript and Edit Subtitles are independent views — don't couple their data
- **Mistake:** TranscriptTab read from `editSegments` (which changes with segment mode). Switching Edit Subtitles to "1 Word" mode also broke the transcript into 1-word fragments, destroying readability.
- **Fix:** TranscriptTab reads from `originalSegments` (sentence-level, never modified by segment mode). Only text edits carry over (they update both).
- **Rule:** The Transcript is a reading view — it always shows well-formatted paragraphs from the original sentence segments. Edit Subtitles controls how subtitles are *displayed/chunked* on screen. These are separate concerns with separate data sources.

### Don't add redundant visual indicators
- **Mistake:** Added green highlight for the active word in Edit Subtitles when purple highlight already served the same purpose in the Transcript tab.
- **Fix:** Use the same purple (`bg-primary/20 text-primary`) for active word across both tabs.
- **Rule:** Before adding a new visual indicator color, check if an existing indicator already communicates the same information. One consistent color for one concept.

### Slider range should be local to the context, not global
- **Mistake:** Time adjustment slider ranged from 0 to full video duration. For a 30-second video with a 0.5s subtitle segment, the slider was nearly useless — the segment occupied < 2% of the track.
- **Fix:** Slider range is now ±5s around the segment, clamped to neighbor segment boundaries (no overlap allowed).
- **Rule:** Range sliders must be scoped to the relevant context. For segment timing, use neighboring boundaries as limits, not the full duration.

### Text must be readable — minimum sizes on dark backgrounds
- **Mistake:** Used `text-[10px]` and `text-[9px]` for timecodes and labels. User said they could barely read things on screen.
- **Fix:** Bumped to `text-xs` (12px) minimum for timecodes, `text-sm` (14px) for segment body text.
- **Rule:** Minimum readable text on a dark background: 12px for labels/metadata, 14px for body content. Never go below 11px for anything a user needs to read.

### Left panel default width must be generous — don't squish content
- **Mistake:** Left panel `defaultSize={25}` (25% of horizontal space). On initial load, the transcript/edit subtitles text was squished into a narrow column, forcing heavy line wrapping and making it hard to read.
- **Fix:** Increase `defaultSize` to ~35% so the left panel starts at a comfortable reading width. The preview panel has a 9:16 video that doesn't need as much horizontal room.
- **Rule:** Text-heavy panels (transcript, subtitles) need enough default width to display at least ~8-10 words per line. A narrow default forces the user to manually resize every time they open the editor.

### NEVER use fallbacks that produce substandard results — fail visibly instead
- **Pattern:** Adding "fallback" code paths that output placeholder/degraded content when the real implementation fails or isn't ready. Examples: fake sine-wave waveforms when FFmpeg extraction fails, even-distribution word timestamps when alignment data is bad, placeholder text when API calls fail.
- **Why it's bad:** Fallbacks MASK the real problem. The user sees something that looks "working" but is actually wrong/unusable. Then debugging becomes harder because the fallback triggers silently. The user wastes time trying to fix something that shouldn't have been shown at all.
- **Rule:** NEVER write fallback code that produces fake/degraded output. If real data isn't available, show NOTHING — an empty state, a loading spinner, or an error message. The user would rather see "No data" than see wrong data that looks real. If a feature can't produce the correct result, it should fail visibly so the root cause gets fixed immediately.
- **Concrete examples of what NOT to do:**
  - Fake waveforms when real audio data isn't available
  - Even-distribution word timestamps when alignment fails (just show segment-level, no word highlighting)
  - Placeholder images when thumbnail generation fails
  - Default/random values when a computation returns null

---

### Lesson: Always verify which component is ACTUALLY rendering

**Mistake:** Modified `BrandDrawer.js` and assumed it was being used, but `EditorLayout.js` imports `RightPanelNew.js` (not `RightZone.js`), which has its own inline `BrandKitPanel`. My changes never appeared in the app.

**Why it happened:** Trusted the `RightZone.js` import path without tracing the ACTUAL import chain from `EditorLayout.js`. Two parallel implementations existed.

**Rule:** Before modifying any component, trace the import chain from the entry point (`EditorLayout.js`) to verify the component is actually mounted. `grep` for the import in the layout file, not just in any file.

---

## Effect Presets Must Be Panel-Scoped

### Applying an effect preset should only change the target panel's store
- **Mistake:** applyEffectPreset() always modified BOTH subtitle and caption stores, so clicking a preset in the Text (caption) panel also changed subtitles.
- **Why:** The function was designed without considering that it would be called from two independent panels.
- **Rule:** Any shared utility that modifies stores must accept a target/scope parameter. Never assume 'apply to everything' is the right default.

## Per-Word Effects for Karaoke Highlight

### Text-shadow must be per-word, not per-container, when karaoke highlighting is active
- **Mistake:** Glow was applied at the parent div level, so the active (highlighted) word had its color changed but kept the same glow color as non-active words.
- **Rule:** When words can have independent visual states (karaoke), all text-shadow effects must be per-span, not per-container. The active word's glow should match highlightColor.

## Never Dual-Purpose Store State for UI Visibility

### Store state must not control both feature logic AND UI visibility
- **Mistake:** `punctOn` in the subtitle store controlled both "show the punctuation dropdown" AND "strip punctuation in the preview." Closing the dropdown toggled the store value, re-enabling all punctuation marks in the preview.
- **Why:** Reused a store boolean for dropdown open/close instead of using local component state.
- **Rule:** UI visibility (dropdown open, panel expanded) must ALWAYS use local `useState`. Store state must ONLY control feature behavior (what gets stripped, what gets shown). If a single boolean serves two purposes, it WILL break one of them.

## Preload Script is Fatal — Never Add Unguarded Requires

### Any uncaught error in preload.js kills the entire IPC bridge
- **Mistake:** Added `require("@sentry/electron/preload")` at the top of preload.js without a try/catch. The module failed to resolve, which crashed the preload script entirely. Since `contextBridge.exposeInMainWorld("clipflow", ...)` never ran, `window.clipflow` was `undefined` in the renderer — the app loaded as an empty shell with zero data.
- **Why:** Assumed the npm-installed module would resolve cleanly in Electron's preload context. Did not verify with DevTools after the change. Multiple `npm start` launches showed "no errors" in the terminal but the preload failure only surfaces in the renderer's DevTools console.
- **Rule:** NEVER add a bare `require()` to preload.js. Always wrap third-party requires in try/catch. The preload script is the single point of failure for the entire renderer — if it dies, the app is a shell. After ANY preload.js change, open DevTools and check for red errors before declaring success.

## Timeline Split Operations

### Always handle null/undefined endSec in time comparisons
- **Mistake:** `splitCaptionAtPlayhead` compared `time < s.endSec - 0.05` but endSec was null for legacy full-duration captions. `null - 0.05 = NaN`, so the find() never matched.
- **Rule:** Any time comparison involving endSec MUST resolve null to Infinity (or actual duration). Never assume endSec is always a number.

### Split operations must use playhead time, not just word boundaries
- **Mistake:** `splitSegment()` required `activeSegId` and split at word boundaries. Users pressing S expected split at playhead position regardless of selection.
- **Rule:** Split functions must accept a time parameter and auto-find the segment containing that time. Don't require the user to first select a segment before splitting.

### Merged/simplified track views must not break interactions
- **Mistake:** When zoomed out, subtitle track merged all segments into one bar with `onResize={() => {}}` — an empty handler that made resize impossible.
- **Rule:** Never replace interactive segments with non-functional merged views. Always render actual segments. If they're too small to see, that's a zoom UX issue, not a reason to remove functionality.

### Karaoke display must be word-driven, not segment-boundary-driven
- **Mistake 1:** `currentSeg` was found by segment boundaries (`adjustedTime >= startSec && adjustedTime <= endSec`). Gap-closing logic extends segment endSec, which delays the transition to the next 3-word group. Result: old words stay on screen while new ones are already being spoken.
- **Mistake 2:** `currentWordIdx` used exact [start,end] matching which returned -1 during inter-word gaps, skipping highlights.
- **Root cause:** The segment-boundary approach inherently causes timing drift because segment boundaries are artificial (created by 3-word chunking + gap-closing), not aligned with actual speech.
- **Fix:** Build a flat global word index across ALL segments. Find the active word globally by "most recent word that started." Then derive the containing segment from the word, not the other way around.
- **Rule:** For karaoke/word-level features, always drive the display from WORD timestamps, never from segment boundaries. Segments are containers for editing convenience, not display timing.
- **Research (Netflix/Aegisub/W3C):** For speech content, words should appear AT speech time (within ~100ms). No pre-advance needed. Gap-closing at segment level is fine but must not affect word-level display timing.

### Split boundary buffers must be minimal
- **Mistake:** Split used 0.01s and 0.05s buffers for finding the containing segment. A segment [10.0, 10.1] would reject splits at 10.005s because `10.005 < 10.01`.
- **Rule:** Use 0.001s (1ms) buffer maximum. The buffer exists only to prevent splitting at the exact boundary (which would create zero-duration segments).

### Local selectedSegId must sync after split
- **Mistake:** After `splitSegment()`, the store's `activeSegId` was updated to the new segment, but the timeline's local `selectedSegId` remained stale. The timeline showed the old (now-nonexistent) segment as selected.
- **Rule:** After any store mutation that creates/changes segment IDs, immediately sync the timeline's local selection state to match the store.

### Segment filter must use overlap, not containment
- **Mistake:** `initSegments` filter used `s.end <= clipEnd` (containment). If `clipEnd` was 0 or undefined (fallback: `clip.endTime || 0`), ALL segments were filtered out.
- **Rule:** Use overlap check (`s.start < clipEnd && s.end > clipStart`) for segment filtering. Never allow clipEnd to be 0 — fall back to Infinity.

### Right-click on timeline must not move playhead
- **Mistake:** Right-click events could propagate to the scroll container's `onPointerDown` handler, which triggered seeking despite the button check, due to event ordering.
- **Rule:** All track rows must `stopPropagation()` on `onPointerDown` for right-click (button === 2) AND on `onContextMenu` to prevent seek events from reaching the scroll container.

### Audio track must use multi-segment array, not single start/end
- **Mistake:** Audio track stored as single `audioStartSec`/`audioEndSec` local state. "Splitting" only trimmed the end — no second segment was created.
- **Rule:** Any track that supports splitting MUST use an array of segments (like captionSegments). A split always creates TWO segments from one. Never use single start/end for splittable tracks.

### setCaptionText must auto-create segment when captionSegments is empty
- **Mistake:** `setCaptionText()` only set `captionText` (legacy field) when `captionSegments` was empty. But the preview renders from `captionSegments`, not `captionText`. User types caption → nothing appears.
- **Rule:** When a store's render path uses an array (captionSegments), any setter that modifies the underlying data MUST ensure the array is populated. Auto-create a segment if the array is empty and text is non-empty.

### Preview scroll zoom should not require Ctrl key
- **Mistake:** `onWheel` handler required `e.ctrlKey || e.metaKey` for zoom. The user expected middle mouse scroll to zoom without modifier keys, which is standard behavior in video editors.
- **Rule:** In the preview panel, mouse wheel always zooms (no modifier needed). This matches Vizard/CapCut behavior.

### Preview zoom must center content when zoom ≤ 100%
- **Mistake:** Scroll container used `justifyContent: "flex-start"` for all zoom levels except fit mode. At zoom < 100%, content stuck to the top-left corner.
- **Rule:** Use `justifyContent: "center"` and `alignItems: "center"` when zoom ≤ 100% (content fits in viewport). Only use `flex-start` when content overflows (zoom > 100%).

### Timeline zoom must anchor to playhead position
- **Mistake:** Changing zoom level scaled the timeline width without adjusting scroll position. The playhead jumped to a different visual position after zoom.
- **Rule:** On zoom change, calculate the playhead's offset from the viewport edge before zoom, then adjust scrollLeft after zoom so the playhead stays at the same viewport offset.

### Never remove working features without explicit approval
- **Mistake:** Removed the merged subtitle bar (shouldMerge/MERGE_THRESHOLD) during refactoring. User wanted it back — "the subtitle track is meant to morph into one line."
- **Rule:** Never remove existing working features during a fix. If code looks unused, ASK before removing. If removing something, document what was removed and why in the commit message.

---

## Meta: Debugging Approach That Works

### Diagnose root cause BEFORE writing code — never guess-patch
- **What failed before:** Multiple rounds of surface-level "fixes" — adjusting buffers from 0.05 to 0.01, adding fallbacks that masked the real issue, patching symptoms instead of causes. Burned 10+ hours of debugging time.
- **What worked this time:** Read the actual code, traced the data flow, identified the exact root cause for each issue, then wrote a targeted fix. Examples:
  - Audio split: didn't try to "fix" the single-segment trim — identified the architecture was wrong (single var vs array) and rebuilt it.
  - Caption display: traced `setCaptionText` → `captionSegments` empty → preview renders from segments → nothing shows. One root cause, one fix.
  - Preview zoom: read the actual CSS flex properties, saw `flex-start` vs `center`, fixed the condition.
- **Rule:** For every bug: (1) trace the actual data flow in code, (2) identify the EXACT line where behavior diverges from expectation, (3) fix THAT line. If the architecture is wrong, rebuild the architecture — don't add workarounds on top of a broken foundation.

### Batch related fixes, don't iterate one at a time
- **What failed before:** Fixing one issue per round, rebuilding each time, losing context between rounds.
- **What worked this time:** Read all affected files up front, identified all 7 root causes in parallel, implemented all fixes in one pass, built once, verified once.
- **Rule:** When given multiple bug reports, read ALL relevant files first, diagnose ALL root causes, then implement ALL fixes before building. One build, one verification pass.

### setCaptionText must target the ACTIVE caption, not always segs[0]
- **Mistake:** `setCaptionText()` always updated `captionSegments[0]`. After splitting a caption into 2 parts, editing the right panel always changed the first part's text regardless of which part was selected on the timeline.
- **Rule:** Any multi-segment store must track which segment is "active" (`activeCaptionId`). Text editing operations must target the active segment, not hardcode index 0.

### Audio segments must live in a Zustand store, not local React state
- **Mistake:** Audio segments stored as `useState` in TimelinePanelNew. This made them invisible to: (1) the playback system (can't skip gaps), (2) the undo system (can't revert), (3) save/load (not persisted), (4) other components.
- **Rule:** Any state that affects multiple concerns (playback, undo, persistence) MUST be in a Zustand store. Local state is only for truly component-local UI state (hover, drag, dropdown open).

### Deleting audio must cascade to overlapping subtitles
- **Mistake:** Deleting an audio segment only removed the visual audio block. The subtitles in that time range remained, creating orphaned subtitles.
- **Rule:** Track operations that remove time ranges must cascade: audio delete → also delete subtitle segments within that range.

### Scores must show context (X/Y format, not raw numbers)
- **Mistake:** Displayed raw highlight scores (28, 27, 26) with no indication of max. Users can't tell if 28 is good or bad.
- **Rule:** Always display scores in a contextual format like X.X/10 or X/100. Never show a raw number without its scale.

### Clip thumbnails must match video aspect ratio
- **Mistake:** Used 16:9 `aspect-video` containers for 9:16 vertical gaming clips, causing zoomed-in center crops.
- **Rule:** Always match thumbnail container aspect ratio to the actual video content. For vertical clips: `aspect-ratio: 9/16` with `object-contain`.

### Auto-generate titles from transcript — never leave clips untitled
- **Mistake:** Clips were created with empty `title: ""`, making the Projects view show blank titles everywhere.
- **Rule:** Every clip must get an auto-generated title from its transcript during the pipeline. Pick the most energetic/emotional phrase. User can always override later.

### Dropdowns/lists must have native scrolling for large lists
- **Mistake:** Used shadcn ScrollArea for clip dropdown, which didn't support mouse wheel scrolling. 16 clips couldn't be reached.
- **Rule:** For any list that can exceed viewport height, use native `overflow-y: auto` with a `max-height`. Always test with the actual data volume (not just 3-4 items).

### Native Node.js modules fail with Electron — use WASM alternatives
- **Mistake:** Tried to use `better-sqlite3` (native C++ addon) for the feedback database. `electron-rebuild` / `node-gyp` failed on Windows.
- **Rule:** For Electron apps, avoid native Node.js modules when a pure JS/WASM alternative exists. Use `sql.js` (WebAssembly SQLite) instead of `better-sqlite3`. sql.js requires async init but works cross-platform with zero native compilation.

### Don't use Node.js `path` module in renderer code
- **Mistake:** Used `path.basename()` in UploadView.js JSX — `path` is not available in the renderer process.
- **Rule:** In renderer code, use string methods like `str.split(/[/\\]/).pop()` for path operations. Only use `path` in main process code.

### Collapsed panels must actually release space, not just hide content
- **Mistake:** Timeline collapse set `maxHeight: 0` on the timeline but it was still inside a `ResizablePanelGroup` that reserved its percentage. The visual space was still occupied.
- **Rule:** When a panel should "collapse" (like a dropdown closing), it must be conditionally rendered or removed from the layout flow entirely — not just visually hidden within a flex/resizable container that still allocates space.

### Audio segment bounds are the effective clip trim points
- **Mistake:** Trimming audio segments (dragging edge shorter) didn't stop video playback at the trimmed endpoint. Video continued playing past the last audio segment.
- **Rule:** In `onTimeUpdate`, treat the last audio segment's `endSec` as the absolute playback boundary. When `currentTime >= lastSegEnd`, immediately pause and clamp to that time. This is the trim enforcement mechanism.

### Destructive operations must only commit on mouse-up, not during drag
- **Mistake:** `_trimToAudioBounds()` was called inside `resizeAudioSegment()`, which fires on every mouse-move frame. Dragging audio left trimmed subs/captions immediately, so dragging back right couldn't restore them.
- **Rule:** Any operation that permanently modifies OTHER tracks (subtitle/caption auto-trim) must only run on mouse-up (`commitAudioResize`), not during the continuous drag. The drag should only update the segment being dragged. Commit side-effects on release.

### Never slice word timestamps from a long source transcription — re-transcribe per clip
- **Mistake:** Sliced subtitle word timestamps from the full 30+ minute source transcription, offsetting them to clip-relative time. WhisperX produces unreliable word alignment on long recordings — some segments get accurate timestamps, others get interpolated garbage (every word ~0.7s evenly spaced). This caused: subtitles too slow, then skipping ahead; words appearing before they're spoken; segments grouping words across long pauses.
- **Diagnostic:** User's debug reports showed the pattern clearly — clips from the same project had wildly different subtitle quality. Good clips had short segments with accurate word times. Bad clips had 25-30 second mega-segments with uniformly distributed timestamps.
- **Root cause:** WhisperX alignment (wav2vec2) degrades on long audio files. The alignment model works segment-by-segment, and when the underlying Whisper model produces long segments, alignment becomes unreliable.
- **Fix:** After cutting clip video files, re-transcribe each clip individually with WhisperX. Short audio (15-60s) produces dramatically better word-level alignment. The full source transcription is still used for highlight detection (Claude API), where segment-level timing is sufficient.
- **Rule:** For word-level features (karaoke subtitles), always transcribe the SHORT clip audio, never slice from a long source. Segment-level features (highlight detection) can use source-level transcription.

### Whisper initial_prompt seeds vocabulary for slang recognition
- **Issue:** Whisper/whisperx doesn't recognize common slang like "ain't", "gonna", "tryna" in fast gaming speech.
- **Solution:** Pass `initial_prompt` to `model.transcribe()` with a list of slang terms, gaming vocabulary, and proper nouns. This seeds the decoder's vocabulary without requiring model fine-tuning.
- **Rule:** When transcription quality issues are vocabulary-related (not timing-related), use `initial_prompt` to hint the model. Keep the prompt concise (Whisper has a token limit for initial context).

### Multi-word editing in 1-word mode should auto-split into segments
- **Pattern:** When the user types "way I just" into a single-word segment (in 1-word mode), the text has 3 words. Auto-split the segment into 3 segments, evenly dividing the original segment's time range.
- **Rule:** Always check `segmentMode` before deciding whether to split. In 3-word mode, multi-word input is valid as-is. In 1-word mode, it should create separate segments.

### NEVER mark tasks as done until user confirms
- **Mistake:** Marked 6 tasks as "completed" after building successfully, but multiple had bugs: zoom glitched when playhead was centered, create subtitle didn't persist across segment mode switch, word highlighting was off-by-one, inline editor box too small.
- **Rule:** After implementing, mark tasks as "awaiting verification" at most. Only mark DONE when the user explicitly confirms ("looks good", "works well", etc.). If user says "not fully fixed" or "I don't like it", mark it back as in_progress. If user doesn't mention it after a couple sessions, proactively ask "Did X work well for you?"
- **Pattern:** Build → Launch → Tell user what changed → WAIT for confirmation → Only then mark done.

### Segment mode switch must preserve user-created segments
- **Issue:** Switching from 1-word to 3-word mode (or vice versa) rebuilds segments from `originalSegments`, which doesn't include manually created segments.
- **Rule:** When user creates/edits segments manually, those changes must survive segment mode switches. Either update `originalSegments` when segments are created/edited, or merge manual segments into the rebuilt set.

### Word highlight off-by-one in Edit Subtitles panel
- **Issue:** Clicking a word highlights the PREVIOUS word instead of the clicked one. The `getActiveWordInSeg` function uses playback time which lags behind the click-to-seek.
- **Rule:** When user clicks a word, the visual highlight must immediately show on THAT word, not rely on playback time catching up. Use the explicitly selected word info, not just the playback-derived active word.

### DEL key should only ripple-delete on audio tracks, not subtitle/caption
- **Mistake:** Made DEL = ripple delete and Ctrl+DEL = gap delete for ALL tracks. User doesn't want ripple delete on subtitle/caption tracks — ripple only makes sense for audio.
- **Rule:** DEL on subtitle/caption = regular delete (leave gap). DEL on audio = ripple delete. Ripple delete is only meaningful when it shifts subsequent audio segments to close gaps.

### Always check existing codebase for API model IDs before guessing
- **Mistake:** Used `claude-sonnet-4-5-20250514` for the Claude API model ID — a non-existent ID. The spec said "claude-sonnet-4-5" but the actual working model ID already in `main.js` was `claude-sonnet-4-20250514`.
- **Rule:** Before adding any API model ID, grep the codebase for existing usage. The correct IDs are already proven to work in `main.js` (anthropic:generate and anthropic:researchGame handlers). Never guess or invent model IDs.

### WhisperX initial_prompt goes in load_model, not transcribe
- **Mistake:** Passed `initial_prompt` as a kwarg to `FasterWhisperPipeline.transcribe()`, which doesn't accept it. Caused transcription to crash entirely.
- **Rule:** BetterWhisperX/whisperx passes `initial_prompt` through the `asr_options` dict in `whisperx.load_model()`, which creates `TranscriptionOptions`. The `transcribe()` method only accepts: `audio, batch_size, num_workers, language, task, chunk_size, print_progress, combined_progress, verbose`. Always check the actual API signature before passing kwargs — `inspect.signature()` is your friend.

### Project preview should show styled subtitles, not raw text overlay
- **Mistake:** User asked for subtitle/caption on project preview thumbnails. I added raw text as a simple overlay on the static thumbnail. User wanted the actual video playback preview to render subtitles with real styling (font, color, position, preset template) so they can judge the finished product before entering the editor.
- **Rule:** "Show subtitles on preview" means render them with the same styling engine as the editor's PreviewPanel, not just dump text on top of a thumbnail. Think about what the user is trying to accomplish — in this case, previewing the finished product.

### Undo must fully revert clip extensions — no weak workarounds
- **Mistake:** Proposed using audio segment bounds as a workaround for undo because "undo can't un-re-cut the video file." User strongly rejected this as lazy.
- **Rule:** Undo of a clip extension MUST re-cut the video back to original boundaries via IPC, reload the video, and restore all metadata (duration, timestamps, subtitles, captions). Store clip boundary metadata (startTime, endTime, duration, filePath) in every undo snapshot. On undo, detect if boundaries changed and trigger a full re-cut. This is a basic feature in any video editor — never propose workarounds for something this fundamental.

### 3-word subtitle grouping must be smart, not dumb
- **Mistake:** Grouped every 3 consecutive words blindly. This put sentence endings with sentence starts (e.g. "for sure. I") and grouped words across 7-second pauses (e.g. "oh my, that" where "that" is spoken 7s later).
- **Rule:** 3-word chunking must follow a hierarchy: (1) Never group end of sentence with start of next — split at .!? (2) Split at pauses > 0.7s (3) Forward-look: if adding word N makes 3 but word N+1 is >1s away, flush current chunk and let word N start next group (4) Max 3 words. Allow 1-2 word segments when rules require it.

### Never remove debug logs during active development without asking first
- **Mistake:** Ran autoresearch to remove all console.logs treating them as "dead weight." The app is still under active development — things are still breaking, and those logs (ExtendRight, ExtendLeft, Recut, initSegments, etc.) were actively used to diagnose whether features work correctly.
- **Rule:** Before removing ANY console.log, ask: "Is this app still in active development? Are these logs being used to debug current issues?" If yes — do not touch them. console.log cleanup is only appropriate for a stable, shipped, production app where the feature is confirmed working. ClipFlow is not there yet.

### ClipFlow is an Electron desktop app — never optimize for web metrics
- **Mistake:** Ran autoresearch to reduce JS bundle size via React.lazy + code splitting. Achieved 64% bundle reduction (188 kB → 67 kB) but this metric is meaningless for a desktop app. All JS files are on local disk — there is no network. The "optimization" added "Loading..." flashes when navigating to views, making UX worse with zero real benefit.
- **Rule:** ClipFlow is an Electron + React DESKTOP app. Bundle size, network payload, CDN caching — none of these web metrics apply. Before suggesting any optimization, ask: "does this matter when files are on local disk?" Valid optimization targets for ClipFlow: IPC call speed, FFmpeg pipeline efficiency, render performance, memory usage, startup time. Never again propose bundle splitting, lazy loading, or network-oriented optimizations.

### No fallback — fix the foundation, don't patch around it
- **Mistake:** Proposed fallback logic that silently chose between old and new code paths. User couldn't tell what was working and what wasn't.
- **Rule:** When rebuilding a system (e.g. per-clip transcription replacing source-sliced subtitles), commit fully to the new approach. If it breaks, debug logs will show why. Fallbacks hide problems and make debugging impossible.

## TikTok PKCE Uses Hex, Not Base64URL
**Mistake:** Used RFC 7636 standard base64url encoding for PKCE code_challenge. TikTok rejected it with "Code verifier or code challenge is invalid" across 3 attempts.
**Root Cause:** TikTok's OAuth v2 API deviates from RFC 7636 — it expects `code_challenge = hex(sha256(code_verifier))` (64-char hex string), NOT `base64url(sha256(code_verifier))`.
**Rule:** When integrating third-party OAuth, always check platform-specific PKCE docs. Don't assume RFC compliance. For TikTok specifically: `.digest("hex")` not `.digest("base64url")`.

### Object.entries() coerces keys to strings — breaks numeric ID comparisons
- **Mistake:** Used `Object.entries(originals)` to iterate an object keyed by segment IDs (`Date.now()` numbers). `Object.entries()` coerces all keys to strings. Then `"1711296000000" === 1711296000000` is `false`, so all ID lookups and `updateSegmentTimes()` calls silently failed — no errors, just nothing happening.
- **Rule:** When segment IDs are numbers, NEVER use `Object.entries()` or `Object.keys()` to iterate and compare against them. Instead iterate the source array directly (`store.editSegments.forEach(seg => originals[seg.id])`) which preserves native types. Or always normalize IDs to one type.

### React Rules of Hooks — never return before hooks
- **Mistake:** Added `if (segDur < 0.01) return null` at the top of SegmentBlock, before `useCallback` hooks. React error #310 crashed the app — hooks must be called in the same order every render.
- **Rule:** All hooks (`useState`, `useCallback`, `useRef`, etc.) must come BEFORE any conditional `return`. Place early-exit `return null` AFTER all hook declarations, right before the JSX return.

### Use getState() in captured event handlers, not closure values
- **Mistake:** Drag/resize handlers captured `editSegments` and `updateSegmentTimes` from the component closure. During a drag operation (pointerdown → pointermove × N → pointerup), the closure values became stale — intermediate updates weren't visible to subsequent pointermove callbacks.
- **Rule:** For long-lived event handlers (drag, resize) that need fresh store state on every call, use `useSubtitleStore.getState()` inside the handler body instead of subscribing via selectors. Selectors are for render; `getState()` is for imperative event handlers.

### Don't patch around problems — find the real root cause
- **Mistake:** Attempted multiple patches for drag/resize overlap: direction-based logic, minimum size blocking, shrink-to-0.001. Each fix introduced new edge cases. User had to say "stop eating my tokens — find out what the problem really is."
- **Rule:** When a fix creates new bugs, STOP patching. Re-read the problem statement, trace the actual data flow, identify the single root cause (stale closures + string coercion in this case), and fix that. One correct fix > five patches.

### Always re-read files when the user sends them — never assume unchanged
- **Mistake:** User sent an updated spec file (v3 with Section 14 amendments). I assumed it was the same file I'd already read and gave feedback saying two issues were still unresolved — when they'd actually been addressed in the updated file.
- **Rule:** When the user sends a file with `@` or asks you to read it, ALWAYS re-read it with the Read tool. Never assume file contents are unchanged from a previous read, even if the filename is the same.

### Comma-bearing words should END segments, never START them (Subtitle Segmentation Rule)
- **Observation:** User noticed "some, you guessed" as a segment where "some," (with trailing comma) starts the segment. This looks wrong — the comma signals a pause/breath that belongs at the END of the previous thought, not the beginning of the next one. The viewer reads a pause before the sentence continues, which feels unnatural.
- **Rule:** A word with trailing soft punctuation (comma, semicolon) is a **natural phrase-ender**. It should be the LAST word in its segment, never the first word of the next segment. After adding a comma-bearing word to a chunk, flush immediately. This is a soft break within partitions (unlike sentence enders which create hard walls). Implementation: add a comma-flush rule to `chunkPartition()` in `segmentWords.js` — after pushing a word that ends with `,` or `;` to the chunk, flush the chunk. This ensures commas always terminate segments.
- **Example:** "gonna be playing some, you guessed it" → current: ["gonna be playing", "some, you guessed", "it..."] → correct: ["gonna be", "playing some,", "you guessed it"]

### Common phrases should be kept together (Subtitle Segmentation — Future Rule)
- **Observation:** User noticed "as always" split across segments. This is a phrase the user says often and should always be grouped as a unit.
- **Rule (for future implementation):** Certain common multi-word phrases should be treated as atomic units that never split across segments. Examples: "as always", "of course", "by the way", "at least", "right now", "let's go". Could be implemented as a phrase dictionary checked during chunking — if upcoming words form a known phrase, group them together even if it means a shorter previous segment. Similar to the repeated-phrase detection but for common English phrases rather than repetition.

### Never penalize silence in Whisper flags (Gaming Audio)
- **Observation:** Added `no_speech_threshold=0.6` to Whisper which would skip transcribing audio chunks with >60% silence. User correctly pointed out that gaming content regularly has long silences (boss fights, stealth, exploration) followed by loud reactions — this flag would drop those moments entirely, losing the celebration shout after a quiet boss fight.
- **Rule:** Never add Whisper flags that penalize silence. Gaming audio has legitimate long silences. Only use flags that target repetition/hallucination specifically (`condition_on_previous_text=False`, `compression_ratio_threshold`, `log_prob_threshold`).

### Never replace established visual defaults — new visual styles must be opt-in
- **Observation:** Replaced the user's instant karaoke highlight with a progressive gradient sweep as the default. User hated it — it fundamentally changed how their subtitles look without consent.
- **Rule:** New visual behaviors must be additive options (template/setting), never replacements for the existing default. The user's current look is their brand. Always preserve it as the default and offer alternatives as opt-in choices.

### Don't keep fallbacks to deprecated systems
- **Observation:** When moving to NLE architecture, I advised keeping legacy code paths (concatCutClip, audioSegments ops) as "fallbacks in case NLE breaks." User pushed back — this is the anti-pattern of silent degradation.
- **Why it's wrong:** Fallbacks to abandoned systems rot because nobody maintains them, mask bugs in the new system (so the new system never gets properly fixed), and create "which path am I on?" confusion during debugging. Git history is the backup — deleted code can always be restored.
- **Rule:** When committing to a new architecture, delete the old code aggressively. If the new system breaks, fix the new system. Never retreat to a degraded path. Only caution to apply is "is this actually dead?" (grep for callers) — not "should we keep it just in case?"

## End-of-session: suggest a session name (2026-04-14)
**Mistake:** At session wrap, I gave the handoff + commit but didn't propose a session title for the user to rename "start new coding session" to. User had to ask.
**Rule:** End-of-session process must include proposing a short descriptive session name (one line + 2–3 alternatives) alongside HANDOFF/CHANGELOG/commit. Do it unprompted.

## Ask "anything else?" BEFORE the wrap actions, not after (2026-05-11)
**Mistake:** User said "close out this session" and I immediately wrote HANDOFF, committed, pushed, then asked "anything else before this session sleeps?" That order is backwards — at that point the paperwork is already done and the question is rhetorical. User correctly called it out.
**Why it's wrong:** "Close out this session" is a goal, not a green-lit batch of irreversible actions. There may be a small thing the user wants tweaked in HANDOFF, or a tag they want cut, or a cleanup commit they want bundled — all easier BEFORE the wrap commit lands and gets pushed.
**Rule:** When the user signals session-end ("close out", "wrap up", "let's end the session"), do this order:
1. State what's about to happen — "I'm going to write HANDOFF, commit, push, suggest a name. Anything to add or fix first?"
2. **Wait for the user's reply.** Even a one-word "go" counts.
3. Then execute the wrap.
Same principle applies to any other multi-step irreversible close-out (commit + push at task-end). Surface the plan, then execute. Don't bundle the "are we done?" question into the same message as the work.

## Don't assume burned-in text is a ClipFlow subtitle (2026-05-14)
**Mistake:** While debugging missing subtitles on a published clip, I extracted frames and saw a green-bar text overlay ("RETURNING TO SPERANZA"). I concluded the render had burned in *one* subtitle. The user corrected me: that was in-game HUD text. The rendered file actually had **zero** ClipFlow subtitles.
**Why it's wrong:** Gaming footage is full of HUD/UI text that can superficially resemble a caption style. Visual frame inspection alone can't distinguish ClipFlow's burned-in overlay from the game's own text.
**Rule:** When verifying whether subtitles were burned in, don't rely on "I see text in the frame." Cross-check against the clip's actual subtitle data (segment text + timestamps) — does the on-screen text match a known subtitle segment at that timestamp? If it doesn't match, it's not ours. Better still, verify against a clip with distinctive subtitle text, or confirm the styling matches the clip's subtitleStyle exactly.

## Captions must not spoil, and the two-beat structure is an AI tell (2026-05-21)
**Mistake:** While designing #85's caption architecture, I wrote a worked-example caption "I waved hello. He answered with bullets." Two problems the user flagged: (1) it spoils the outcome — the punchline ("he shot me") is in the caption, so there's nothing left to watch for; (2) the constructed two-beat "setup, then payoff" antithesis ("I said hi, he said no", "I thought I was him. I found out") now reads as AI trying to sound punchy — it doesn't sound like a real person.
**Why it's wrong:** The caption's job under the Friction driver is to OPEN the loop; the footage closes it. A caption that contains the payoff kills the reason to watch. And the two-beat antithesis is a stale TikTok-caption cliché that AI overuses — the notebook's Q5 examples were full of it, but the research is a step behind current creator taste.
**Rule:** For ClipFlow caption generation: (a) the caption opens the loop, the footage delivers the payoff — never put the punchline/outcome in the caption; (b) write the caption as ONE natural thought, the way the creator would actually say it out loud — no constructed "setup, then payoff" two-beat. Applies to titles too, captions especially. When research patterns conflict with the user's current-creator taste, the user's call wins.

## Never narrate how the code works without reading it first (2026-06-02)
**Mistake (recurring, finally named):** User reports that I "constantly" describe how things work — telling a confident narrative about data flow, what a function does, what a component renders, how a feature behaves — WITHOUT having actually opened the relevant files in this session. The explanation sounds plausible and authoritative but is inferred from the file name, past context, or general patterns, not from the current code. This is distinct from the existing "read before editing" lessons: those fire when I'm about to WRITE code. This one fires when I'm TALKING — answering "how does X work?", explaining a bug, or summarizing behavior. No edit is involved, so the read-before-edit guard never trips, and a fabricated narrative ships as fact.
**Why it's wrong:** A plausible-but-unverified explanation is worse than "I don't know yet" — the user can't tell the difference between a fact I read and a story I generated, so they act on fiction. It wastes their time chasing my hallucinated model of the code, and it erodes trust in everything else I say. Memory entries and prior-session context are point-in-time and may be stale; file names lie; "I'm pretty sure it does X" is not knowledge.
**Rule (user chose "read first, ALWAYS"):** Before stating how any code behaves — data flow, what a function/store/component does, what renders where, why a bug happens — I MUST open the actual file(s) with Read/Grep in THIS session first. No explanation from memory, inference, file names, or past context. Answer with `file:line` citations so the user can verify. If I have not read it and the user is waiting, I say "I haven't read this yet — let me look" and then look, rather than producing a narrative. A guess presented as fact is the failure; the only acceptable unread answer is an explicit "I don't know, reading now." This applies to conversation, not just edits.

**REINFORCED 2026-06-02 — "read first" is NOT enough; I read the WRONG (dead) code and shipped a confident, fully-cited plan to fix a function with zero callers.** When the user asked me to "trace the wire" for the #103 audio-trim issue, I traced `commitAudioResize` / `audioSegments` / flat `recut`, wrote a whole "point the trim at the gap-preserving handler" plan with `file:line` links — and it was BS. The live timeline (`TimelinePanelNew.js:1026`) renders one `WaveformTrack` per segment with its OWN per-segment `trimNleSegmentLeft/Right` handles that already behave exactly as the user wanted; `commitAudioResize` is **dead code with zero callers**. The #103 issue (and last session's #102/#97 patches) point at code that doesn't run. Only the user's own domain knowledge ("I'm positive I've seen that divider") stopped me — that backstop must never be load-bearing.
- **Why "read first" failed:** I read all day and still produced fiction, because I read code that EXISTS but does not RUN. A `file:line` citation proves existence, NOT execution. Citations made the BS look *more* authoritative, not less. (I also already had lesson "Always verify which component is ACTUALLY rendering" at the time and violated it anyway — a "be careful" lesson is worthless; it needs a mechanical check.)
- **THE THREE CHECKS WITH TEETH (run these, don't aspire to them):**
  1. **Grep for callers before building anything on a function.** Before any claim/plan rests on function `F`, grep `F`'s callers. **Zero callers = dead = does not run = do NOT reason on it.** This one grep would have killed the wrong #103 plan in seconds.
  2. **Trace top-down from the mount point, never bottom-up from a plausible handler.** Start from what the editor actually mounts (`EditorLayout`→`TimelinePanelNew`) and follow the wire DOWN to the handler that really fires. Bottom-up reasoning from a similarly-named function grabs the wrong twin every time.
  3. **Every behavioral claim ships with a LIVENESS proof, tagged verified-vs-assumed.** Not "it lives at file:line" but "it RUNS because Y mounts/calls it." If I can't show the path is reachable, I label the claim "assumed" out loud. This is what protects the user on code they DON'T know — a hollow claim is visible by the absence of a liveness proof in my message, catchable by inspection, not by their memory.
- **The trust principle:** the safeguard is never "trust me more." It's making every how-it-works claim falsifiable by inspection — liveness proof + verified/assumed tag in the response itself — so the backstop is the structure of my answer, not the user's expertise. User's cheap trigger to pop this failure: "did you grep the callers?"

## Session 60 — #98 "fix" didn't fix the user's symptom (diagnosis scoped to the wrong layer)
- **What went wrong:** Implemented #98 exactly as filed (segment-ID collision from `Date.now()`), verified the ID logic, shipped it. But Fega's ACTUAL symptom — split "this guy", the "guy" half vanishes on back-out to preview AND on editor reopen; a newly-created subtitle also doesn't persist — still reproduces on a SINGLE split. A single split can't trigger an ID collision (needs two same-ms mints), so the ID fix was necessary-but-insufficient: the vanishing lives in the SAVE/RELOAD (persistence) layer, not ID minting.
- **Why:** Trusted the GitHub issue's stated root cause + the handoff's framing instead of reproducing the user's symptom against the data-flow first. The issue title ("IDs collide") described ONE real bug; the user's symptom is a DIFFERENT bug (words-less / manually-split segments not surviving save→reload). Conflated them.
- **Rule:** Before implementing a filed bug, reproduce the USER'S described symptom against the actual pipeline and confirm the filed root cause actually produces THAT symptom. A clean, well-cited fix for the wrong layer is still the wrong fix. When the symptom needs only ONE action but the filed cause needs a race/collision, the filed cause is probably not the (whole) story.

## Session 63 — a subtitle VISUAL symptom had two causes; I fixed the markup one but Fega was seeing the animation (2026-06-07)
- **What happened:** Fega reported the viewer showed "andreconnecting" (no space) on a 3-word sub. I read both renderers, found a real markup bug (the inter-word space was a trailing char inside a `display:inline-block` word span → browsers collapse trailing whitespace there → genuinely ZERO layout space), fixed it in preview + export, shipped. Fega then pointed out the missing space he was *seeing* was actually the **word-pop/scale animation**: the highlighted word scales up from center-bottom and grows sideways over the gap, kissing the neighbor. My markup fix was correct but invisible in his setup (pop always on), so he reasonably asked "may not be necessary."
- **Why:** I found ONE real cause (markup) and stopped, without checking the transform/animation layer that was DOMINATING the visible symptom. Two independent causes coexisted; I diagnosed the one visible in static markup and missed the one driving the actual pixels. (We kept the fix — it's a correct baseline for pop-off + exported videos — but the diagnosis was incomplete.)
- **Rule:** When diagnosing a subtitle/caption VISUAL symptom (overlap, spacing, position, clipping), account for the animation/transform layer (scale pops, grow animations, transform-origin) — not just markup/CSS/data. A `transform: scale()` changes pixels without changing layout, so it can erase apparent spacing independent of the markup. Before claiming a single root cause, ask "which layer is the user actually seeing — layout, or a transform on top of it?" and, where possible, reproduce with the animation toggled off to separate the two.

## Session 65 — two-line Recordings cards fixed truncation but killed the sleek density Fega wanted (2026-06-07)
- **What happened:** To fix filenames truncating to "AR Da…", I restructured each Recordings card from a compact single-line pill into a two-line card (name on line 1; size/TEST/status on line 2) and widened to ~4 columns. Built, launched, asked Fega to look. Reaction: "This looks horrible. EWWW… doesn't have the sleek nice look the former had. So much empty space between the pills." Reverted the file immediately (git checkout) and rebuilt.
- **Why it's wrong:** I treated "names truncate" purely as a layout problem and optimized for readability, trading away the property Fega valued MOST — compact density. Two stacked lines + vertical centering left dead space under every card; wider/fewer columns made the grid airy. The session-64 plan even recorded that Fega picked "two-line" over "declutter one line" — but a plan approved in the ABSTRACT is not approval of the RENDERED result. I shipped a large structural change to an aesthetic-sensitive surface on the strength of a verbal plan-pick, with no cheap preview first.
- **Rule:** On aesthetic-sensitive UI (cards/lists/pills) for Fega: (a) density is a first-class requirement — prefer the SMALLEST change that solves the problem (drop a redundant element, nudge width) over a structural restructure; (b) a verbal/abstract plan-pick is provisional — get eyes on the rendered result (or a mock/screenshot) BEFORE investing in a full build when the change alters the overall "feel"; (c) when the user praises a "former look," treat preserving that look as the binding constraint and solve the new problem inside it. Cheap trigger Fega can use: "does this still feel sleek?"

## Session 73 — bundled 5 issue-closes + file-writes + `rm -rf` into one opaque command; got denied (2026-06-09)
- **What happened:** After Fega approved "shrink the backlog," I tried to comment-on, label, and close 5 GitHub issues in a SINGLE Bash command — a multi-line heredoc writing 5 temp files, a loop, and a trailing `rm -rf "$d"`. Fega denied the permission. Redone the right way: write each comment via the editor (visible), then one short `comment → label → close` per issue, closing them one at a time. Worked cleanly (5 closed, 41 left).
- **Why it's wrong:** (1) Consequential, hard-to-reverse state changes (closing issues on a commercial repo) buried inside one giant blob are not reviewable — the user can't approve #112's close without also approving four others sight-unseen. (2) `rm -rf` in a shared command is independently worth declining and adds nothing (OS temp files are harmless). (3) It ignored that the user had JUST signaled caution; the reviewable path was obviously better.
- **Rule:** Make consequential/outward-facing actions individually reviewable — one issue (or one resource) per command, so each can be approved or denied on its own. Never bundle many state-changing operations behind one opaque script, and never include `rm -rf` (or other destructive cleanup) in a command whose main job is something else. Stage human-readable content (comments, bodies) via the editor with `--body-file` rather than shell heredocs/escaping. Default to the smallest, clearest command that does one thing.

## Session 75 — closed #32/#106 against the literal ticket text, not what Fega was actually describing (2026-06-09)
- **What happened:** Session 74 "fixed" #32 (restored caption *width* persistence) and #106 (silenced a passive-listener console warning) exactly as the tickets were written, marked them untested, and moved on. Fega tested and reported #32 "NOT FIXED" and #106 still wrong — because what he means by "#32" is the **editor side-panel widths** reverting on reopen, and by "#106" the **zoom feel** (±10% step too coarse + preview snapping to the left wall past 100%). Both literal fixes were *correct for their scope* but addressed neither thing he was seeing. This session diagnosed and fixed the real behaviour (autoSaveId + drawer localStorage for #133; ±2% step + margin:auto centering for #134), kept #32/#106 closed for their literal scope, and cross-linked them.
- **Why:** #32 had already been *rescoped twice* (Y-position → caption-width over sessions 73), so the ticket text had drifted far from Fega's original mental model of "the panels don't stay where I drag them." Trusting the current ticket title over the user's own words let the fix target a tractable-but-wrong symptom. Same family as sessions 60/63 (fixed the wrong layer).
- **Rule:** Before closing a bug — especially a rescoped one — restate the symptom in the USER'S words and confirm the fix makes THAT observable thing change. If the ticket title and the user's description diverge, the user's description wins; either fix what they mean or split it into a new issue and say so. A ticket number is a label for a user-visible problem, not for whatever narrow root-cause the last triage happened to write down. And do not declare a UI fix "done" on a build-pass alone when the symptom is visual/interactive — it stays `untested` until the user sees it in the running app.
