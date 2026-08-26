# ClipFlow — Lessons Learned

> After ANY correction from the user, add the pattern here.
> This file is the RAW CAPTURE LOG (intake), not the enforcement layer. It does not change behavior on its own — I never read it mid-work. The `session-end` command distills NEW entries into the place that actually fires (a domain skill, the code-review checklist, or rarely CLAUDE.md/memory). lessons.md feeds; skills enforce.
> <!-- DISTILLED-THROUGH: 2026-08-25 (s199) — Session 199: 'folder names are internal lingo, not UI labels' -> memory feedback_hide_mechanism_not_labels (third instance). Session 198: 'declared-mirror filters update every copy in the same commit' -> clipflow-code-review — Session 198: 'declared-mirror filters update every copy in the same commit' -> clipflow-code-review. Session 197: 'cleanup glob matched the original' — too niche, stays here only. FULL BACKLOG distilled into skills on 2026-06-02 (editor-patterns, ffmpeg-media, electron-ipc, ui-debug, code-review, trace-verify). Session 57: "jargon-free verification steps for the user" → clipflow-code-review + memory feedback_plan_clarity. Session 58: "test checklists need the action + observable, not just the clip/screen type" → clipflow-code-review + memory feedback_plan_clarity. Session 183 (2026-08-22): "placement of a new element in an existing screen is a plan-level decision, offer the alternative" -> memory feedback_ui_density_aesthetic. Marker advanced to 2026-08-22 (s183). Session 185 (2026-08-22): 'a keystroke must survive eventToKey() before it enters the registry' -> clipflow-editor-patterns. Marker advanced to 2026-08-22 (s185). New lessons added BELOW this line are awaiting distillation; advance this marker after each session-end pass. Sessions 175/177/178 distilled 2026-08-20 (s178): 'taskbar identity authority chain before cache clears' (s175), 'read the component end-to-end before mocking a redesign' (s177), 'field-survival traces must find whitelist rebuilders, E2E the reopen loop' (s178) -> all clipflow-trace-verify. Marker advanced to 2026-08-20 (s178). Session 173 (2026-08-18): 'migration fingerprints test against a real-boot-produced store' -> clipflow-code-review. Marker advanced to 2026-08-18 (s173). Session 166 (2026-08-13): 'wc -l before any full-file Write' -> clipflow-code-review + memory project_todo_md_is_archive. Marker advanced to 2026-08-13 (s166). Session 167 (2026-08-13): 'status colors verify against real data distribution, worst-case card in the mock' -> clipflow-code-review. Marker advanced to 2026-08-13 (s167). Session 156 (2026-08-06): "decision requests must be jargon-free, not just verification steps" -> clipflow-code-review. Marker advanced to 2026-08-06 (s156). Session 133: ground-truth-range mismatch → clipflow-trace-verify; Gemini API quirks left here only. Marker advanced to 2026-07-27 (s133). Session 137 (2026-07-29): "a backup expires when the user touches the file it shadows" and "a memory that forbids a command names its substitute for a reason (asar extract-file)" -> clipflow-code-review; "a 'tune this value' request is a claim the value exists — grep for the assignment first" -> clipflow-trace-verify. Marker advanced to 2026-07-29 (s137). Session 139 (2026-07-30): "verify the loop, not one pass on fresh data" -> clipflow-code-review; "a scan-time id is not an identity, resolve path-first" -> clipflow-electron-ipc; "JS-measured pixel widths must be out of flow inside a content-sized Radix viewport" -> clipflow-ui-debug; "an assertion inside a question is still an assertion" -> clipflow-trace-verify. Marker advanced to 2026-07-30 (s139). Session 140 (2026-07-30): "textContent lies about a field being edited" and "a synthetic .click() has not rendered when the next statement runs" -> clipflow-trace-verify. Marker advanced to 2026-07-30 (s140). Session 141 (2026-07-30): "a brand-new feature that is the only thing looking dead = suspect the harness (occluded-window rAF)" and "assert on the thing, not an unprinted proxy selector" -> clipflow-trace-verify; "CLIPFLOW_PROFILE=dev does not sandbox projectsRoot" -> clipflow-code-review + memory project_cdp_verification_gotchas. Marker advanced to 2026-07-30 (s141). A handful of niche/no-skill-home lessons (Vizard API shapes, TikTok PKCE hex, caption-spoiler/AI-tell copy guidance, CLAUDE.md-editing meta, session-wrap behaviors) intentionally remain here only. Session 61: subtitle words[]/text invariant (#116/#117 family) → clipflow-editor-patterns (Karaoke). Session 62: no new lessons.md entries; the one process insight — "Fix/Fixes/Closes #N in a commit auto-closes the issue on push, BEFORE user verification (so add resolution notes via `gh issue comment`, not `gh issue close --comment`)" — went to memory feedback_fix_keyword_autocloses (process/workflow, no skill home). Session 63: subtitle VISUAL symptom had two causes (a real no-space markup bug + the word-pop scale animation masking it, #120) → routed "for a visual symptom, check the animation/transform layer, not just markup" to clipflow-ui-debug (Distilled Lessons). Marker advanced to 2026-06-07. Session 64: a Grep/ripgrep miss in gitignored `build/` output is a false negative (ripgrep skips .gitignored files; `build/` is gitignored) — caught while verifying #120's export fix → clipflow-trace-verify (Distilled Lessons); no other new lessons this session. Session 66: custom-tooltip convention (~0.5s show-delay + default-below placement, rendered fixed outside the card; #122) → clipflow-ui-debug (Distilled Lessons). Marker advanced to 2026-06-08. Session 67: tooltip show-delay corrected ~500ms → ~1.5s (Fega: too eager on a casual hover) → updated the value in clipflow-ui-debug; no new skill home needed. Session 68: a count+noun label must name the counted unit (input), not the produced unit — "Generate N Clips" (N=recordings, each → several clips) misread as 3 output clips → clipflow-code-review (Distilled Lessons). Marker stays 2026-06-08. Session 70: built #125 ((i) info popover + Play-in-editor source-preview) and fixed #126 (Recordings sorted by part number, not rename-click time); new lesson "don't build small UI glyphs from a system FONT — draw as SVG (font fallback differs across mockup/preview/app)" → clipflow-ui-debug (Distilled Lessons). Marker stays 2026-06-08. Session 71: shipped #57 Phase D1 (extracted TimelinePlayhead to stop the timeline's 60fps re-render storm); 4-lens adversarial review clean, Fega-verified; the one side-note (scrub frame-skip on long sources) was correctly diagnosed pre-existing and filed as #128. No user corrections → no new lessons.md entries. Marker stays 2026-06-08. Session 72: shipped #57 Phase D2 (SegmentRow React.memo extraction) and CLOSED the #57 epic (D3 was conditional, not needed). A user-requested "fresh eyes" pass ran a 27-agent find→verify workflow that cleanly separated D2-introduced bugs (zero) from pre-existing ones (4 found, filed #129–#132), then fixed the two safe pre-existing ones (#129 ALL-CAPS uncased-text gate, #130 stale long-segment warning). No user corrections → no new lessons.md entries. Marker stays 2026-06-08. Session 73: parked 12 launch/ops issues under a new `track: launch-ops` label and rewired the start-session ritual to hide them by default; ran an 11-agent backlog triage (menu saved to tasks/backlog-triage.md) and swept the code backlog 46→41 (closed 5 verified-resolved with status: untested, rescoped 3, corrected 2 the triage got wrong). New lesson — keep consequential/outward actions individually reviewable, never bundle many issue-closes or `rm -rf` into one opaque command, stage comment bodies via `--body-file` — routed to `.claude/docs/issue-filing.md` (Command style). Marker advanced to 2026-06-09. Session 75: verified session-74's #92/#124 (correct, no change) and fixed the REAL complaints behind #32/#106 — editor panel-width persistence (#133) and zoom step/left-wall-snap (#134); 10-agent adversarial fresh-eyes review found zero confirmed bugs. New lesson — "fix the user's reported symptom, not the literal (often rescoped) ticket text; for visual/interactive fixes a build-pass isn't enough, keep status: untested until he sees it in the running app" → routed to clipflow-code-review (Distilled Lessons) + memory feedback_fix_user_symptom_not_ticket. Marker stays 2026-06-09. Session 76: reworked preview zoom into an open floating-layer canvas (#134, closed); confirmed & closed #133/#124 (untested removed); filed #135 (caption corner-handles). New lesson — open-canvas zoom's 4 implementation traps (rAF-after-setState reads the STALE pre-commit rect → anchor cancels to 0; per-step center pull must be proportional to the zoom delta or tiny steps snap; CSS `transform: scale()` blurs text → physically resize the canvas; apply coupled size+transform atomically in `useLayoutEffect` or get jitter) → routed to clipflow-editor-patterns (Zoom section, which also REPLACED the stale scroll-model rules). The meta-lesson (feel features need build→test loops; switch interaction model, not a parameter, after 2 failed feel-tweaks) intentionally stays in lessons.md. Marker stays 2026-06-09. Session 77: cleared the karaoke/subtitle fragile zone (9 issues closed one-per-commit: #136 word-delete words/text desync, #89 mode-switch edit loss, #131 srcWordIdx highlight/seek, #132 mid-playback click freeze, #95 split dup/drop, #87 tight-gap overlap, #90 stale clip-load playhead, #88 set() hygiene, #107 resolved-by-#131/#95; filed #137 timeline-split time-space + #138 AA-toggle words[] casing). New lesson — subtitle segments own time as a half-open interval [start,end); the shared adjacent boundary must go to the segment STARTING there, not ending there → routed to clipflow-editor-patterns (Karaoke section), which also gained the #132 clickTime mechanism. Marker stays 2026-06-09. Session 78: cut the 0.1.7-alpha installer (Stage-1 promotion of session-77's karaoke/subtitle fixes to the daily driver) and added the clipflow-update-launcher skill to codify the bump→build→commit loop; then traced + parked the approved TikTok audit Round 2 plan (tasks/todo.md ACTIVE PLAN). One reusable insight promoted: the TikTok spec asserted creator_info returns a `can_post` capacity flag that doesn't exist (code comment + TikTok docs agree) — "don't trust a spec's claim that an external API returns a field; verify against the real response/docs before gating on it (dead-code/false-confidence risk)" → routed to clipflow-trace-verify (Distilled Lessons). No user corrections. Marker stays 2026-06-09. Session 79: shipped the TikTok audit Round-2 UI fixes (A9 processing notice made visible during the publish window + Music Usage reordered above Commercial Disclosure; A8 capacity message found already-built in main.js, no code), then a Queue-card quality pass after Fega flagged it (legibility/width/contrast, caption-as-editable-field moved up, uppercase tag, LOCKED alignment) and a publish-status "Processing…" fix. One new lessons.md entry (Queue-card legibility + affordance bar) → distilled into clipflow-ui-debug (Distilled Lessons), along with the hide-pipeline-internals publish-status rule. Marker advanced to 2026-06-10. Session 81: shipped two Queue fixes (#139 badge overcount → App.js tracker-exclusion; list-hides-untagged-clips → removed the redundant hashtag gate from QueueView's list filter) and planned+filed #140 (cancel an in-progress render — two-phase: overlay-frame window 0-40% then FFmpeg 40-99%). One new lesson — "don't cut an installer per fix; batch ~10 changes or wait for an explicit ask" → distilled into clipflow-update-launcher ("When NOT to cut one") + memory feedback_batch_versions. No code-pattern lessons this session. Marker advanced to 2026-06-11. Session 82: built #140 (cancel an in-progress render) from the approved session-81 plan — module-level active-render handle + cancelActiveRender() that bails the overlay frame loop (destroys the offscreen window) or kills FFmpeg, resolves {canceled:true} (never "failed"), and deletes partial frames + any partial .mp4. No user corrections; the one Fega question ("are half-baked files left on disk?") confirmed the design already cleans both phases. No new lessons.md entries. Marker stays 2026-06-11. Session 83: shipped four fixes one-per-commit (#141 waveform resolution 4→25 peaks/sec + maxPeak loop-guard + slice-denominator; #137 timeline-split timeline→source mapping; #138 updateSegmentText words[] spelling re-sync for AA/ALL-CAPS; #99 styling baseline-reset on clip open + effectOrder/highlightMode made persistent style). Zero user corrections. Two reinforcements of EXISTING discipline (no new skill line needed): (a) #138 — when the user says "I tested it and it worked," still re-verify the issue is real; both can be true (worked on manual/mode-switched segments while silently failing the export path) — covered by clipflow-trace-verify + feedback_fix_user_symptom_not_ticket; (b) #99 — when an issue says "NEEDS VERIFICATION before fixing," audit the REAL user data (live clipflow-settings.json templates) to confirm the bug-as-filed can even fire; here it couldn't (templates complete) yet the trace exposed a real adjacent bleed vector (effectOrder/highlightMode covered by neither template nor per-clip save) — same family as session-78's "verify a spec's claimed API field against the real response." One new behavioral preference (Fable-5 sessions: plan/review in main session, delegate implementation to Sonnet/Haiku subagents — Claude only, no codex) → routed to memory feedback_fable_delegation mid-session, not a skill. Marker stays 2026-06-11 (no skill/CLAUDE.md promotions). Session 84: fixed the installed app's clip-generation pipeline, which had NEVER worked packaged (all prior success was source runs), across two asar-packaging bugs — #142 (processingDir defaulted inside the read-only asar → mkdir threw before any logging → moved to userData) and #143 (bundled Python scripts tools/transcribe.py + tools/signals/* resolved inside the asar AND weren't in build.files → shipped via extraResources + resolve from process.resourcesPath when app.isPackaged). Cut alpha.6 then alpha.7 (two reinstall cycles for one bug CLASS — the lesson). New lesson "asar packaging bugs come in FAMILIES — sweep ALL __dirname-relative main-process paths at once before shipping the fix" → routed to clipflow-electron-ipc. Also DIAGNOSED #144 (fresh never-saved clips show empty editSegments; setSegmentMode chunks from empty editSegments instead of originalSegments on first open; latent — #89/#110 both predate alpha.5) but did NOT fix it (session wrap, fix ready in HANDOFF). Marker advanced to 2026-06-18. Session 85: shipped #144 (setSegmentMode falls back to originalSegments on a fresh clip; verified the fix lands in the right function — setSegmentMode("3word") always fires on open via applyTemplate because BUILTIN_TEMPLATE carries segmentMode) + cut alpha.8, then ran a 26-agent packaged/fresh-clip/portability audit (15 confirmed, deduped to 9; full plan in tasks/todo.md ACTIVE PLAN). Two code-pattern lessons promoted: (a) the asar bug "family" is WIDER than __dirname script paths — also cross-tree require()s missing from build.files (overlay preload → editor/utils, NOT added when editor/models was), fonts loaded by file:// from src/fonts, and bare external-binary spawns (ffmpeg/ffprobe/python) bundled nowhere; verify against the real artifact with `npx asar list`, not build.files globs → extended clipflow-electron-ipc. (b) Environment gotcha: a formatter/tool on Fega's machine silently stripped scripts+build+devDependencies from package.json mid-session (99→51 lines, breaks all builds) → memory project_package_json_strip. No user corrections this session. Marker stays 2026-06-18. Session 86: shipped Bucket A packaged-app fixes (#1 build.files += editor/utils, #2 fonts via extraResources, #8 render routes through shared resolveClipSubtitles — 3 ESM utils → CJS, #9 window icon) → alpha.9, then fixed a Recordings-sort regression Fega hit during testing (resetFileDone reloaded the list without re-applying compareRecordings → whole list flipped newest-first) → alpha.9.1. One new code-pattern lesson — "a list-reload path must re-apply the canonical sort; the DB ORDER BY isn't the UI order, and every setX(rows)-from-reload must satisfy that invariant" → clipflow-code-review (No Regressions). The #8 CJS-conversion insight was already homed (CLAUDE.md cross-tree-requires note + asar lesson). Marker stays 2026-06-18. Session 87: fixed the AI title/caption "wrong clip" bug (Fega: generated titles/captions for a loadout clip referenced betrayal/exit moments from elsewhere in the 30-min source) — root cause `_collectClipParams` joined RAW `editSegments` (source-wide by design via resolveClipSubtitles includeExtras, for outward extends) instead of the clip-window-clipped `getTimelineMappedSegments()`, so the AI saw the whole recording; one-line fix, cut alpha.10. No user correction (diagnosis approved as-presented). New code-pattern lesson — "raw editSegments is source-wide; never read it as the clip's content — clip via getTimelineMappedSegments/visibleSubtitleSegments" → distilled into [[clipflow-editor-patterns]] (Transcript vs Edit Subtitles section). Marker stays 2026-06-18. Session 88: fixed two editor bugs (ripple-delete subtitle scramble + mid-clip playhead reset on play, cut alpha.11). My first root cause for the playhead bug (togglePlay end-of-timeline replay snap) was wrong — Fega corrected from experience ("it was mid-clip"); re-traced to a video↔playhead desync and fixed the class. New lesson — "don't present an UNREPRODUCED playback/state diagnosis as fact: reproduce it or tag UNCONFIRMED and fix the class; when the user's post-edit numbers have two meanings, surface both instead of picking the confirming one" → clipflow-trace-verify (Distilled Lessons). Marker advanced to 2026-06-19. Session 89: design-only session (Projects-tab redesign mockup `tasks/mocks/projects-tab-redesign.html`, no app code changed); new lesson — clip/review cards: keep the thumbnail to footage only (rating/status off the video), read-only metadata in the content area (score by title, status chips in meta), clickable actions (approve/reject, Open in Editor) adjacent to the clip not in a far-right column, and size the vertical preview to be watchable (taller cards + whitespace beside a short transcript are acceptable) → clipflow-ui-debug + memory feedback_ui_density_aesthetic. Marker stays 2026-06-19. Session 90: implemented the session-89 "Review Rail" Projects-tab card into ProjectsView.js — no user corrections, no distillable code/behavior lesson. One niche TOOLING note (large CRLF + emoji-escape JSX edits fail the Edit-tool match → use a Node patch script with newline-detection + ASCII-only anchors) added below; stays in lessons.md (no skill home). Marker advanced to 2026-06-20. Session 91: verified+closed the full alpha.11 backlog (#140/#138/#137/#99 + Bucket-A export) and fixed the choppy exported subtitle animation (#148 — overlay capture 10→30fps + the eased per-word pop recreated as a time-driven f(t) since the offscreen DOM is rebuilt each frame), cut alpha.12. No code-pattern lesson. One behavioral lesson (I asserted Fega was on the source build from an indirect cue; he was on his installed daily build — reaching him means cutting an installer, not "close and reopen") → routed to new memory feedback_test_on_daily_build (loads each session); raw entry kept below. Marker advanced to 2026-06-22. Sessions 92–93: wraps recorded no new lessons.md entries. Sessions 94–95: built Now Playing Tracker Phase 1 (Wick spec, commits bc973cb + 921f41f) via 3 Sonnet subagent chunks + main-session review; no user corrections on the build itself. One promoted lesson — user-facing calendar dates must be LOCAL/EST, never `toISOString()` UTC (evening work dated tomorrow; #160) → clipflow-code-review (Distilled Lessons) + memory user_timezone_est. Marker advanced to 2026-07-05. Session 96: Fega verified Tracker Phase 1 in the dev build (6/7 checks pass; real-publish check pending) and all 7 findings were fixed in-session; no new lessons.md entries — the feedback was app design, and the one durable preference (recap watermark = ClipFlow, never the spec's "Flowve") went to memory project_recap_watermark_clipflow. Marker stays 2026-07-05. Session 100: publish-day debugging arc (YT invalid_grant → #163; tracker retry undercount; frozen goal ring; tag-vs-hashtag main-count; queue empty at launch) → two lines promoted to clipflow-code-review ("mount-only effects see pre-load state" → React/Zustand section; "summary IPC must carry every field its consumers read" → No Regressions); identifier-vocabulary note stays in lessons.md. Marker advanced to 2026-07-14. Session 101: no user corrections (Variant-B hue + "Weekly Rundown" naming were design picks in a normal mockup iteration, not fixes of mistakes); the one durable preference — ALL text DM Sans, JetBrains Mono/mono fonts banned app-wide (dotted zero) — was routed mid-session to memory feedback_dm_sans_only and now has an enforcement line in clipflow-ui-debug (Distilled Lessons). Marker advanced to 2026-07-15. Session 104: shipped #164 Phase A polish + user-tunable reframe style controls (0.1.9-alpha.3). Fega's one correction (item 5: he meant the game footage feathering into the bg, not a shadow under it — resolved pre-build because the assumption was stated explicitly, then BOTH became a user setting) stays here only. Promoted: "persistence writers that whitelist fields silently drop new ones — grep the save path's object-literal rebuilds before assuming a new field persists" → clipflow-electron-ipc (Distilled Lessons); CDP/harness tooling gotchas (TaskStop orphans electron.exe → stale bundle on port 9222, kill via taskkill; headless render harnesses need a window-all-closed guard or FFmpeg dies with exit 0 and no output) → memory project_cdp_verification_gotchas. Marker stays 2026-07-15. Session 105: shipped #164 polish rounds 2+3 (0.1.9-alpha.4/.5, Fega-confirmed). Promoted: "a capability the user asked for gets a VISIBLE dedicated control; gestures are accelerators only" + "don't add a secondary save button the primary commit action can absorb" → .claude/rules/ui-standards.md. Process reversal "no Sonnet/Haiku implementation subagents — Fable implements directly" → memory feedback_fable_delegation (updated mid-session). CDP editor-DOM traps (top-bar Save name-collision clicks, below-fold hit-testing needs scrollIntoView, timeline-zoom is a 5th [role=slider]) → memory project_cdp_verification_gotchas. Marker advanced to 2026-07-16. Session 107: shipped #164 B1 (detection engine in-app, gate-verified dev + packaged); no user corrections, no new lessons.md entries — the refinement-rule iteration (sharpness-scored steps so feather ramps can't win) was normal engineering and is documented in the spike README + HANDOFF, not a lesson. Marker stays 2026-07-16. Session 108: shipped #164 B2 (Detect layout button, CDP UI-drive verified: success + apply-upsert + mid-run-kill error path); no user corrections, no new lessons.md entries. The two CDP UI-drive tooling traps (always-mounted tab panes require offsetParent!==null scoping; project cards need the pointer-cursor ancestor clicked, not the text div) → memory project_cdp_verification_gotchas. Marker stays 2026-07-16. Session 109: shipped #164 B3 (game-only layouts + no-cam presets; parity harness + CDP drive + two real renders); no user corrections, no new lessons.md entries — the code-side trap ({...null} === {} on camRect copies) is a variant of the session-104 whitelist lesson already enforced in clipflow-electron-ipc and is now called out at all four fixed sites + HANDOFF Watch Out For. Four CDP tooling traps (screenshot-first when DOM probes contradict UI state; #166 boxes-invisible-until-resize workaround via panel-divider arrow keys; right-rail drawer tabs need position-based selection; Electron CDP lacks Browser.setWindowBounds) → memory project_cdp_verification_gotchas. Session 110: shipped #164 B4 (first-recording auto-offer banner; 17-case node matrix + full CDP drive incl. relaunch persistence; Phase B COMPLETE); no user corrections, no new lessons.md entries — the one design point worth keeping (banner evaluation latches once per project open so later condition flips like layout-removal can't resurface it, and element dims are readyState-guarded against stale-src reads) is documented in the code comments + todo.md B4 results. Marker stays 2026-07-16. Session 111: fixed #166 (preview size tracking starved at mount — the filed "ref null → observer never attached" hypothesis was grep-refuted as architecturally impossible before fixing; hardened the class by sync-measuring at mount instead of guessing the starvation variant) and cut 0.2.0-alpha.1 promoting Phase B to the daily driver. No user corrections, no new lessons.md entries — the reusable insight ("a mount-only ResizeObserver effect must not depend on the observer's INITIAL delivery for first paint; measure synchronously at attach") lives in the code comments at both fixed sites, and the diagnosis discipline that caught the wrong hypothesis is already codified in clipflow-trace-verify. The stale #166 divider-nudge CDP workaround was retired from memory project_cdp_verification_gotchas. LATE ADDENDUM (post-wrap fresh-test arc): one new lessons.md entry added BELOW this marker ("fresh profile promised empty, booted onto real data — enumerate where ALL state lives before promising isolation" + the printf/Write-tool escaping addendum), awaiting distillation; candidate homes: clipflow-trace-verify (isolation claims need state-inventory) or clipflow-electron-ipc (profile/userData boundaries). Marker stays 2026-07-16. Session 112: session-111's fresh-profile/state-inventory lesson → clipflow-electron-ipc (Distilled Lessons: profile isolation covers only userData; watchFolder-derived trees are shared; sandbox preseed via Write tool + JSON validation). Session 112's own lesson ("present-tense pipeline claims need setting + processed-inputs + processed-file probe, not setting + one unprocessed file") → clipflow-trace-verify (Distilled Lessons). Marker advanced to 2026-07-18. Session 113: self-caught two-writer hazard (main-side gamesDb repair would be clobbered by App.js whole-array persist; fix = broadcast <key>:changed event) → clipflow-electron-ipc (Distilled Lessons). Marker stays 2026-07-18. Session 115: session-name style (plain like commit subjects, no clever titles) → memory feedback_session_name (was routed in-session; raw entry below). Session 116 (Rename tab redesign mock + plan, #172): no user corrections, no new lessons.md entries — the design decisions (session ledger, Set Game re-grouping, hover-scrub + peek) live in the mock, tasks/todo.md plan, and #172. Marker advanced to 2026-07-20. Session 117 (#172 build + #175 fix): setState-updater ref read (shift-click anchor always equaled the clicked row) -> clipflow-code-review (React/Zustand Correctness); trusted-input CDP reproduction rule (synthetic dispatchEvent fakes AND masks bugs) -> memory project_cdp_verification_gotchas (trap 15). Session 117b: "existing behavior, keep it" shipped the known-broken fake undo into the redesign -> memory feedback_surface_weird_existing_behavior. Marker advanced to 2026-07-21. Session 119 (ALAC silent-editor diagnosis + FLAC migration; zero app code changed): no user corrections, no new lessons.md entries. The one code-pattern insight — the editor preview is Chromium playing the RAW source recording, so a Chromium-undecodable audio codec (OBS ALAC) mutes the editor silently while every FFmpeg path (whisper/waveform/render) keeps working; ffprobe the actual source file FIRST on any "no sound in editor" symptom — → clipflow-ffmpeg-media (Distilled Lessons) + memory project_obs_recording_layout (recording-format note) + #178 filed for the product-level ingest guard. Marker stays 2026-07-21. Session 120 (Projects list launch-pad redesign + 3 Rename fixes, cut 0.3.0-alpha.4): no user corrections — Fega's inputs (Rich rows, portal the dropdown, retire folders, leave folder data) were design decisions, not fixes of mistakes; the large ProjectsView CRLF/special-char swap reused the session-90 Node-patch-script + ASCII-anchor technique already homed in lessons.md, and left inert folder code tracked in #179. Marker stays 2026-07-21. Session 121 (3 more Rename dropdown fixes — format-picker clipping via portal, removed the AI-slop left-edge accent bar, and fixed the alpha.4 regression where middle-mouse/wheel scroll inside the portaled menu closed it; cut 0.3.0-alpha.5): no user corrections, all three worked first try (Fega: "all three work now"). No new lessons.md entries — the scroll-close guard (exclude scrolls whose e.target is inside the menu) + its rationale live in the code comment at all three RenameView.js dropdowns, and the no-left-edge-colour-bars rule is already homed in feedback_ui_density_aesthetic + .claude/rules/ui-standards. Marker stays 2026-07-21. Session 122 (preview sharpness stepped-downscale fix; Queue polish: portaled shared Select + game-hue rows + video-level Published Today; clip management: duplicate/create-as-new/delete + editable Play Style diff + context-menu viewport flip + scroll restore; cut 0.3.0-alpha.6): one correction arc ("pill" meant the whole ROW; game hue on rows only, settings areas stay neutral) — Fega explicitly vetoed promoting it to a rule, so nothing distilled; the stepped-downscale rationale lives in the drawVideoHQ comment (PreviewPanelNew.js) and the portal-menu pattern in shared.js's comment. Marker stays 2026-07-21. Session 123 (render input-seek speed fix + render queue + floating pill; subtitle word-split/merge/Alt+drag-dup/auto-caps; Queue trash → data loss + rework): the destructive-scope lesson ("Queue 'delete clip' destroyed project clips because 'clip' meant different things") → clipflow-code-review (Distilled Lessons: consequences in screen terms, least-destructive default, explicit edits-will-be-lost line). The Alt+drag repro insight (clone spawns overlapped → resolve collisions at DROP, not live) lives in the resolveSubtitleOverlaps comment (TimelinePanelNew.js). Marker advanced to 2026-07-24. Session 124 (render speed frame-skip/streaming; 4 pre-alpha.8 upgrades; alpha.8 editor-crash hotfix -> alpha.9): the onScreenshot scope crash lesson -> clipflow-code-review (Distilled Lessons: confirm enclosing component in multi-component files; editor-touching changes need a CDP clip-open drive, build+boot are blind to editor mount). Marker stays 2026-07-24. Session 125 (FB Reels publishing + #181 render-collision prevention+repair, alpha.10→.12): version-sizing lesson ("size by what the USER gets, not implementation novelty — 'works now' = alpha tick") -> clipflow-update-launcher (Version bump policy) + memory feedback_version_semantics (refined in-session). Marker stays 2026-07-24. Session 126 (duplicate-publish fix #156/#182 + single-instance lock, alpha.13→.14): "a framework/third-party claim that is load-bearing for the USER'S DECISION must be probed, not recalled — tradeoffs and 'we can't because…' never meet a build step, so a wrong one survives and can kill a correct fix; probe the mechanism you lean on too, or say 'unverified' out loud" → clipflow-trace-verify (Distilled Lessons). Also refined memory project_package_json_strip: the mystery package.json stripping from session 85 was identified as `asar extract-file` run with the repo as CWD (it writes the extracted file into the working directory, overwriting the real package.json with the stripped packaged copy) — never extract with the repo as CWD; grep the asar bytes directly instead. Marker stays 2026-07-24. Session 127 (#183 AI title/caption rebuild + 0.4.0-alpha.1): self-caught lesson "an electron-store done-flag cannot guard per-DATABASE work — settings are shared by source-prod and the packaged exe, the DB is not; make it idempotent and run every boot" -> clipflow-electron-ipc (Distilled Lessons). The prompt-overconstraint finding (14k-char rules-heavy prompt CAUSED the slop it prevented) and Fega's measured title voice (3-7 word fragments, cuts the second clause) -> memories project_ai_prompt_overconstraint + project_fega_title_voice; full reasoning in src/main/data/caption-frameworks.md. No user corrections. Marker advanced to 2026-07-24. Session 128 (#184 section reorder + 0.5.0-alpha.1): 'a derived list must be emitted in the CONSUMER's order, not the source's — when a feature makes a previously-guaranteed ordering violable, sort explicitly and grep for consumers that INDEX or accumulate across the list, not just those reading fields off it' -> clipflow-editor-patterns (Timeline Rules), together with the two other order assumptions the feature exposed (index-neighbour clamps; straddling-subtitle inverted range). No user corrections. Marker advanced to 2026-07-25. Session 130: (a) a classification flag stamped at the catch-all instead of its origin — an OAuth error would have triggered a pointless 720p re-encode and reported itself as a clip-length problem -> clipflow-code-review (Distilled Lessons); (b) a silently-unloaded fixture is indistinguishable from a non-rendering feature, assert it via the app's own API first -> clipflow-trace-verify (Distilled Lessons); (c) computer-use input blocked by a foreground PowerToys helper, pivot to CDP -> memory project_cdp_verification_gotchas. Marker advanced to 2026-07-26. Session 131 (learning-loop overhaul, #191/#192/#197/#198): two corrections on the #198 mock — (a) place new controls in existing dead space before growing the card (chips moved under the transcript) -> .claude/rules/ui-standards.md (Adding to existing cards); (b) option lists ending in 'e.t.c' are a brief, not a spec — expand, sharpen phrasing ('Didn't land' -> Not funny / Nothing happens), present the delta -> memory feedback_expand_sketched_options. Marker advanced to 2026-07-27. Session 134: no new lessons.md entries (no user corrections); CDP trusted-input traps (buttons bitmask, reload-wedge, mouseover-hover, stale rects) routed to memory project_cdp_verification_gotchas. Marker advanced to 2026-07-28. Session 135: no user corrections (Fega verified all six sound changes); three self-caught items promoted — click-bubbling kills a new timeline block's selection -> clipflow-editor-patterns; waveform extractor is 1000Hz so audio fixtures must stay under 500Hz, atrim needs asetpts before adelay, and -v error hides volumedetect -> clipflow-ffmpeg-media. Marker advanced to 2026-07-29. Session 142 (2026-07-31): 'a probe's own assumptions are part of the trace (canvas click seeks; grep the shortcut registry before destructive keys)' -> clipflow-trace-verify; CDP occlusion flags, autosave-800ms-no-memory-only-session, rejected-clips-only test rule -> memory (cdp gotchas 28-30 + feedback_test_on_rejected_clips). Marker advanced to 2026-07-31 (s142). Session 143 (2026-08-01): "a probe's second gesture must be scoped to what the first touched (first-match un-reject hit a REAL rejection); snapshot-before-touch + byte-restore is the mandatory harness for app-writes to shared real data; assert DOM text, not CSS-uppercased rendering" -> clipflow-trace-verify + memory project_cdp_verification_gotchas (traps 31-33). Marker advanced to 2026-08-01 (s143). Session 145+146 (2026-08-04): session-name formula ignored 2nd+3rd time despite two memory reinforcements — enforcement moved INTO the wrap ritual as step 6 of .claude/commands/session-end.md (template-locked suggestion); memory feedback_session_name stays as the format source. Sessions 144-146 had no other corrections (eyeball verdicts are program data, not corrections). Marker advanced to 2026-08-04 (s146). Session 147 (2026-08-04): "rejection-feedback eras v1/v2/v3 — never say no-way-to-know-why" -> memory feedback_rejection_feedback_eras + spec/HANDOFF corrected in-session; "game tags expand from gamesDb only" -> memory project_game_tag_names; name-formula 4th offense (autonomous run, outside ritual) -> scope-widened clause in memory feedback_session_name. Marker advanced to 2026-08-04 (s147). Session 148 (2026-08-04): no user corrections this session — nothing to distill. Marker advanced to 2026-08-04 (s148). Session 150 (2026-08-05): "a claimed side-effect on another feature is a claim about THAT feature's requirements — read its spec/issue before selling it as a benefit (#240 imports fence)" -> clipflow-trace-verify (Distilled Lessons). Marker advanced to 2026-08-05 (s150). Session 151 (2026-08-05): no user corrections — cell approvals + eyeball verdicts are program data, nothing to distill. Marker advanced to 2026-08-05 (s151). Session 152 (2026-08-05): no user corrections — #241 cell verdicts + #183 greenlit guidance are program data/instructions, not corrections; one self-caught factual slip (HANDOFF briefly claimed v3 chips weren't in an installer; alpha.38 carries them) was fixed in-session and is covered by existing trace-verify discipline, no new rule. Marker advanced to 2026-08-05 (s152). Session 158 (2026-08-08/10): no user corrections — bug report + gap-3 decision are program input, nothing to distill. Marker advanced to 2026-08-10 (s158). Session 174 (2026-08-19): no user corrections; self-caught "single-slash taskkill in Git Bash is path-mangled and kills nothing — a 'relaunch' then silently measures the OLD instance (exit-0 lock bounce is the tell); verify process death before any relaunch-based assertion" -> memory project_cdp_verification_gotchas (trap 45). Marker advanced to 2026-08-19 (s174). Session 175 (2026-08-19): "Windows identity bugs: check the authority chain (.lnk AUMID + exe ProductName) before clearing caches" -> clipflow-update-launcher gotchas. Marker advanced to 2026-08-19 (s175). Session 187 (2026-08-24): no user corrections; self-caught "a patch script's escape was eaten and the corrupted regex shipped through build, grep and review — scan changed files for control characters after any script-driven source edit" -> memory feedback_bash_backslash_collapse + clipflow-code-review (Distilled Lessons). Marker advanced to 2026-08-24 (s187). Session 193 (2026-08-24): review-caught, not a correction — "a commit's side claim ('dropped .mkv works too') must map to a verification step actually performed; a renderer gate is only half a path — trace the gesture through the IPC handler it calls" -> clipflow-code-review (Liveness). Marker advanced to 2026-08-24 (s193). Session 195 (2026-08-25): review-caught, no user corrections — "last writer of a UI-read state object must carry every field new consumers read (post-invoke setProgress clobbered the pipeline's complete event)" + "a parameter-SHAPE change is rename-class, grep secondary call sites (context menu passed an id into the object-taking handleSingleDelete)" -> both clipflow-code-review. Marker advanced to 2026-08-25 (s195). Session 196 (2026-08-25): planning-only session (#305/#306 specs), no user corrections — design decisions (optional tweak step, bangers repost too) are program input; nothing to distill. Marker stays 2026-08-25 (s196). -->
> <!-- NEXT-UNDISTILLED-BELOW -->
> #### ↓↓↓ New lessons go below this line ↓↓↓

## A declared-mirror filter was updated on one side only (2026-08-25, session 198, review-caught)
**What happened:** batch 5 (#306) exempted reposts from the Queue's same-title knockout in QueueView's list filter but not in App.js's `totalApproved` badge count — a block whose own comment states it "mirrors QueueView's list filter... so the badge matches the list (#139)". The desync #139 fixed was recreated by the very next change to the filter. Caught in the s198 fresh-eyes review, fixed in 3220776.
**Rule:** when changing any filter/threshold/knockout, grep for declared mirrors of it ("mirror", "same as", "matches the list", the anchoring issue number in comments) and update every copy in the same commit. Routed -> [[clipflow-code-review]] (Distilled Lessons).

## A cleanup glob matched the original it was meant to spare (2026-08-25, session 197, self-caught)
**What happened:** tearing down the #306 fixture, a script deleted every file whose name contained `" repost"` — intending the generated `… repost.mp4` copies. The ORIGINAL fixture render was named `Fixture repost clip.mp4`, so it matched too and was deleted. Zero real impact (scratchpad fixture, restored in one command), but the same shape in product code is data loss: `repostClip` names its copies by appending a suffix, and any future "clean up the copies" pass written as a substring test would eat the source whose title happens to contain the suffix word.
**Rules:** (a) select generated files by the exact suffix immediately before the extension (or by a recorded path list), never by `substring in name`; (b) a teardown script that deletes should print what it will delete and be diffed against an expected count before it runs. Too niche to promote — stays here.

## A patch script's escape was eaten and the corrupted regex shipped through build, grep and review (2026-08-24, session 187, self-caught)
**What happened:** fixing #297, the friendly save-error mapper was written into `useEditorStore.js` by a node patch script whose replacement text was a template literal. The intended word-boundary escape lost a level somewhere between the model output and the file, and the template literal turned the survivor into a literal 0x08 backspace byte — so `/[BS](EPERM|EACCES|...)[BS]/` compiled cleanly, minified cleanly, shipped in the bundle, and matched nothing. The pill kept showing raw errno text while the source, the bundle and a hand-run copy of the same regex all looked correct. Six diagnostic rounds (bundle-hash checks, hard reloads, in-page regex evals, a temporary runtime marker) before a control-character scan found it; the same trap had already turned an intended newline escape into a real newline earlier in the session (harmless there — valid JS, ugly formatting).
**Rules:** (a) after any script-driven source edit, scan changed files for control characters (char code under 32, excluding tab/CR/LF) BEFORE building — no normal review tool renders them; (b) prefer replacement text with no backslashes at all, or write the payload to a plain file and have the script read it as the replacement string; (c) when a change is provably in the loaded bundle but provably not taking effect, suspect the bytes, not the runtime. Routed -> memory [[feedback_bash_backslash_collapse]] + [[clipflow-code-review]] (Distilled Lessons).

## A "relaunch" that bounced off the single-instance lock measured the OLD app — kill commands must be verified, not trusted (2026-08-19, session 174, self-caught)
**What happened:** verifying #264, `taskkill /IM electron.exe /F 2>/dev/null` in Git Bash was MSYS-path-mangled (`/IM` → `D:/Git/IM`, "Invalid argument") and killed nothing — the suppressed stderr hid the miss. The next `npx electron` bounced off the single-instance lock (background task exit 0, reads as a detach), CDP still answered on 9222 from the ORIGINAL session, and in-session state (`lastRenamedGame`) leaked into what looked like a fresh-boot test — three probe rounds chasing a phantom "Day3" bug in brand-new code. The chase did surface a REAL pre-existing bug (#267, fixed same session), but the verification claim ("no ghost after relaunch") was briefly built on a relaunch that never happened.
**Rules:** (a) `taskkill //IM electron.exe //F` (double slash) and NEVER suppress its output; (b) gate every relaunch-based assertion on `tasklist | grep -ci electron` returning 0 first; (c) a fast exit-0 from a fresh `npx electron` launch is the lock-bounce tell, not a detach. Routed → memory [[project_cdp_verification_gotchas]] (trap 45); no skill change needed (trace-verify's "suspect the harness" family already covers the mindset).
> Review at session start. Ruthlessly iterate until mistake rate drops to zero.

## Beta-readiness assessment built from stale draft notes — the work had already shipped (2026-08-14, session 168)
**Correction:** asked "what's left for beta," I presented FFmpeg bundling / hfHome / energy_scorer as open blockers, sourced from `tasks/mocks/bb*.md` (session-85 audit drafts left uncommitted in the tree). Fega: "I thought in the latest updates I just packaged ffmpeg into the installer? Are you using updated info or outdated info?" He was right — #251 (alpha.44, 2026-08-11) had shipped all of it, plus #249's zero-setup gateway token. Compounding factor: issues #145/#147 were still open on the tracker despite being superseded, so even a tracker glance would have half-confirmed the stale story.
**Rules:** (a) A status/roadmap assessment is a present-tense claim about the codebase — verify every "still missing" item against `git log --grep`, the live code, and issue state before presenting; stray planning files (mocks/, drafts, old audit notes) are historical artifacts, never status sources. (b) When code shows an open issue's "done means" is met, close it in the same pass (superseded-by note + commit SHA) so the tracker can't corroborate stale narratives again.

## Session-name suggestion ignored the established formula while the same message's HANDOFF used it (2026-08-01, session 143)
**Correction:** suggested "Seven-fix batch + alpha.37: hashtags, time wheel, sticky rejects" — Fega: "cmon this name is not following the formula." The formula (memory [[feedback_session_name]], refined twice: 2026-07-20 plain-words, 2026-07-27 anchors-first, no date) is `S<N> · alpha.<X> — <plain summary>`, and the HANDOFF header written seconds earlier used it correctly.
**Rule:** the suggestion line is emitted in the exact template — copy the HANDOFF header's anchor prefix verbatim. Routed → memory [[feedback_session_name]] (reinforcement line added); no skill home needed.

## A probe's restore gesture hit a DIFFERENT card than its damage gesture — first-match targeting is order-fragile (2026-08-01, session 143)
**What happened (self-caught via snapshot diff, no user correction):** verifying #230 in the dev app, the driver clicked "the first button titled 'Reject clip'" (landed on an undecided clip — intended) and later "the first button titled 'Remove rejection'" (landed on a *different, earlier* card — one of Fega's REAL rejections in `2026-01-23 AR Day16 Pt3`, because already-rejected cards sit earlier in the All-tab list). The dev profile shares the real `projectsRoot` (gotcha 27), so real review state was changed on disk. The pre-test snapshot of `project.json` caught it in the post-test field-diff and the file was restored byte-identical. Two sibling miscalibrations in the same arc: an invisible "Pending" tab button in a hidden mounted view got clicked while the report said success (gotcha 6 relearned — visibility-scope EVERY query), and text assertions counted "REJECTED"/"WHY?" (the rendered look) while the DOM says "Rejected"/"Why?" under `textTransform: uppercase` — structural counters (button titles) passed alongside, exposing the text counters as wrong rather than the feature.
**Rules:** (a) a probe's second/restoring gesture must be scoped to the element its first gesture touched — assert exactly-one-match before any restoring click; (b) snapshot-before-touch + field-diff-after + byte-identical-restore is the mandatory harness for any test that writes through the app to shared real data; (c) assert DOM text, never the CSS-transformed rendering. Routed → [[clipflow-trace-verify]] (Distilled Lessons) + [[project_cdp_verification_gotchas]] traps 31–33.

## Mount-only effects see PRE-LOAD state; global surfaces must not depend on lazy per-entity loads (2026-07-14, session 100)
**Two stacked patterns behind Fega's "the weekly goal did not change" + "queue doesn't load until I open a project":** (1) TrackerView's count-up animation ran once on mount with `[]` deps — but App renders every tab pane at launch, BEFORE the async electron-store load finishes, so `animPosted`/`animPct`/`animXp` froze at 0 forever (the ring literally never showed a nonzero number since it shipped). Fix: real deps, animate from the last-shown value. (2) `listProjects` summaries deliberately omitted `clips`, but the Queue tab AND the once-a-minute auto-publish scheduler read clips from that startup list — both were silently empty (and scheduled posts unfired) until entering a project swapped in its full data. Fix: include clips in the summary, strip only the measured-heavy fields (subtitles, per-clip transcription ≈85% of payload). Bonus find, same session: main-vs-variety compared clip.gameTag ("rl") to the game's *hashtag* ("rocketleague") — two vocabularies that can never match, so every auto-post ever logged was "Variety"; the identifier-vocabulary mismatch was invisible because both sides *looked* like "the game tag".
**Rules:** (a) An effect with `[]` deps that captures loaded data freezes at empty — in ClipFlow, mount time is always before data time. (b) When a summary/list IPC feeds more consumers than the screen it was built for, include every field those consumers read — verify by measuring what's actually heavy, not by guessing. (c) When comparing identifiers, confirm both sides come from the SAME vocabulary (tag vs hashtag vs name) — grep how each is produced. Routed (a)+(b) → [[clipflow-code-review]]; (c) is covered by the existing "don't invent/guess identifiers" line in [[feedback_no_code_narration]]-adjacent discipline, raw entry stays here.

## User-facing calendar dates must be LOCAL (EST) — `toISOString()` dates evening work as tomorrow (2026-07-05, sessions 94–95)
**What happened (caught in main-session review of subagent output, then confirmed as a standing preference by Fega):** The new TrackerView computed its week key via `toISOString()` (UTC) while the rollover engine keyed `weekMeta` by the local Monday — an evening-only mismatch that would make the view miss its own week snapshot. Tracing the class found it was a pre-existing app-wide habit: QueueView's `logPost` immediate-publish dates, the scheduling dropdown's iso keys (`getWeekDates`/`getUpcomingDates`), and `mainGameHistory` all stamped the UTC calendar date — 4–5 hours ahead of Fega's EST, so anything after ~8 PM was dated *tomorrow*, and Sunday-evening publishes landed in *next week's* goal. Fega, on being told: "I always want the time of stuff to be EST. That's where I live in. Not utc (whatever that is)."
**Why it happened:** `toISOString().split("T")[0]` is the reflexive one-liner for "today's date," and it silently answers in UTC. Labels were built with local formatting next to UTC keys, so the UI looked right while the stored date was wrong — invisible except in the evening.
**Rule:** Any user-facing calendar DATE written to state must come from the local clock (`localISO()` in `src/renderer/utils/trackerEngine.js`). Full ISO timestamps stored as instants are fine (display localizes them); the trap is extracting a *date* from one. Sweep `toISOString().split` before shipping any date-touching feature. Routed to [[clipflow-code-review]] (Distilled Lessons) + memory [[user-timezone-est]]. Fixed across TrackerView/QueueView/App.js + engine; scheduling-key variant was #160 (closed `status: untested`).

## Tooling: large JSX edits to ProjectsView.js (CRLF + emoji escapes) — use a Node patch script, not a big Edit match (2026-06-20, session 90)
**What happened (my own tooling friction, not a user correction):** rebuilding `ClipRow` in `src/renderer/views/ProjectsView.js`, a ~200-line `Edit` old_string match failed repeatedly. Two causes stacked: the file is **CRLF**, so any anchor carrying `\n` misses; and the energy pills store emoji as literal `\uXXXX` escape TEXT (`"🔥"`), which the Edit matcher can't reconcile against a literal emoji char (astral-plane surrogate pairs). Splitting into smaller ASCII-only Edits fixed the easy blocks; the metadata/transcript blocks were finished with a Node script.
**Rule:** For a large/multi-block edit to a Windows-CRLF source file (especially one with `\uXXXX` escapes or other special chars), don't fight the Edit tool — write a **Node patch script** that (a) detects the newline via `const nl = s.includes('\r\n') ? '\r\n' : '\n'` and uses it for joins + any multiline anchor, and (b) locates regions with **ASCII-only `indexOf` anchors + slice**, never matching the special-char lines themselves. Single-line ASCII edits are still fine via Edit. Niche tooling tip — stays in lessons.md (no skill home).

## Clip/review cards: thumbnail is for footage only; clickable actions go near the clip; preview must be watchable (2026-06-19, session 89)
**Corrections (design iteration on the Projects-tab redesign mockup — `tasks/mocks/projects-tab-redesign.html`):** Across rounds Fega rejected three moves I made. (1) I parked a "verdict column" on the FAR RIGHT holding score + status + approve/reject + Open in Editor — "the approve and disapprove are all the way to the right which makes the user drag their mouse all the way to the right of their screen just to click it… those are bad changes." (2) To make that column fit I shrank the clip preview to ~116px wide — "the size of the preview is sooooo small. The clips have to be much bigger… to get any sense of what is going on in the clip." (3) I moved the score + 'Rendered' status as overlays ONTO the video thumbnail — "having the rating and 'rendered' tag on the video isn't sensible."
**Why wrong:** (1) Primary/clickable actions belong where the eye+cursor already are (with the clip/content), not at the far screen edge — on a wide desktop window the reach cost is real; the ergonomic twin of session-79's "use the width but don't strand content." (2) On a review surface the preview's JOB is to be watchable; vertical 9:16 clips must be large enough to read the action even though that makes taller cards — Fega explicitly accepted "it's fine to have empty room if the transcript is small." (3) A thumbnail should show the footage; rating/status are app metadata and belong in the content area (score by the title, status as chips in the meta line) — which is also where the current app already puts them, so it matched his mental model.
**Rule:** For clip/review cards — keep the thumbnail to FOOTAGE only (plus at most a duration pill); put read-only metadata (score, status) in the content area where the current app has it; place CLICKABLE actions (approve/reject, open) ADJACENT to the clip/content, never in a far-right column; size the preview to be genuinely watchable rather than trading preview size for layout tidiness. Whitespace next to a short transcript beside a big vertical preview is an acceptable trade-off, not a defect to design away. Routed to [[clipflow-ui-debug]] (Distilled Lessons) + [[feedback_ui_density_aesthetic]].

## Raw `editSegments` is SOURCE-WIDE — never read it as "the clip's content" (2026-06-19, session 87)
**Bug (Fega found it; not introduced this session):** generating AI titles/captions for a clip that was only about a bad loadout produced titles/captions about a betrayal and a panicked exit — moments from *other* parts of the same 30-minute recording. Root cause: `_collectClipParams` (useAIStore.js) built the AI transcript as `editSegments.map(s=>s.text).join(" ")` — joining ALL of `editSegments`. But `editSegments` is source-wide by design: `resolveClipSubtitles(..., {includeExtras:true})` merges the whole `project.transcription` (every non-overlapping segment of the source) into it so outward extends have words pre-loaded. Every UI consumer (Transcript panel, preview, timeline, export renderer) clips that back to the clip's cut window via `visibleSubtitleSegments`; `_collectClipParams` was the lone path that skipped it, so the AI received the entire recording's transcript. The #144 fix (fresh clips now populate `editSegments`) is what *exposed* it — before, a fresh clip had empty `editSegments` and the AI got an empty transcript instead of the wrong one.
**Why it happened:** the clipping is enforced per-consumer (at each read edge), not baked into `editSegments` itself, so a new consumer that reads raw `editSegments` silently inherits the whole source. The function's own comment even claimed it "reflects trims/edits on the timeline" — true for text edits, false for scope.
**Fix:** read from `getTimelineMappedSegments()` (runs `editSegments` through the same `visibleSubtitleSegments` clipping) instead of raw `editSegments`. One line; covers Generate/Rephrase/Regenerate (shared helper). Cut alpha.10.
**Rule:** Raw `editSegments`/`originalSegments` are source-wide, NOT clip-scoped. Any code that needs the clip's ACTUAL content (AI input, export text, a transcript join, a word count) MUST clip to the window via `getTimelineMappedSegments()` (or `visibleSubtitleSegments` directly) — never join/map raw `editSegments`. Routed to [[clipflow-editor-patterns]] (Transcript vs Edit Subtitles section).

## A list-reload path MUST re-apply the canonical display sort — the DB's ORDER BY is not the UI's order (2026-06-18, session 86)
**Bug (Fega found it on alpha.9, NOT introduced this session):** the Recordings list flipped to newest-first after he reset a "done" recording to regenerate it. `resetFileDone` (UploadView.js) reloaded rows from the DB and called `setFiles(rows)` WITHOUT `rows.sort(compareRecordings)`. The query is `ORDER BY date DESC`, so the unsorted reload dumped raw newest-first order into state, flipping the whole list until restart. Three sibling load paths (initial / refresh / import) applied the sort; this fourth one was missed — even though the comparator's own comment claimed it was the "single source of truth for all three load paths" (should have been four).
**Why it happened:** the display sort is enforced per-load-path, not at the render/group layer, so every NEW path that writes the full list into state must remember to sort, and one drifted. Diagnosed empirically: queried the actual installed DB and proved `compareRecordings` produces the correct ascending order on the real data, so the cause had to be a path bypassing it — not the comparator, and not my session-86 changes (which never touched this screen).
**Rule:** When a list's order/filter is enforced at load time (not at render), it's an invariant EVERY path writing the full list into state must satisfy. When adding/reviewing any `setX(rows)` from a DB/IPC reload, grep all sibling setters and confirm each applies the same sort/filter. Prefer a single shared loader, or sort at the display/group layer, so a new path can't silently drift. Routed to [[clipflow-code-review]] (No Regressions). (Also this session, no correction: the #8 render-path fix required converting 3 ESM utils — resolveSubtitles/cleanWordTimestamps/wordRepair — to CJS so the main process can `require()` them; already homed in the CLAUDE.md cross-tree-requires note + the asar lesson.)

## asar packaging bugs come in FAMILIES — sweep every install-relative path before shipping the fix (2026-06-18, session 84)
**What happened:** Diagnosed #142 (packaged app couldn't generate clips — the pipeline's `processingDir` defaulted to `__dirname/../../processing`, which in the packaged app resolves INSIDE the read-only `app.asar`, so the first `mkdirSync` threw before any logging existed → blank "1 failed", no log anywhere). Fixed it (→ `app.getPath("userData")/processing`), cut alpha.6, Fega reinstalled — and hit the NEXT instance immediately: #143, the bundled Python scripts (`tools/transcribe.py`, `tools/signals/*`) ALSO resolved inside the asar (and weren't even in `build.files`), so transcription failed. Two reinstall cycles for what was really one bug CLASS.
**Why it happened:** I fixed the first asar-path instance I found and shipped, instead of grepping the whole main process for the same class of failure first. Every `path.join(__dirname, …)` that an EXTERNAL process must read (python/FFmpeg) or that gets WRITTEN to fails identically in a packed app — they're one family, not separate bugs. (This is the packaging-specific instance of the existing "trace the ENTIRE pipeline before patching / fix-then-break chain" lessons.)
**Rule:** When a packaging bug traces to a path resolving inside the asar, treat it as a CLASS, not a one-off: grep ALL `__dirname`-relative paths in `src/main` and triage each — (a) WRITTEN-to (scratch/output/logs) → move under `app.getPath("userData")`; (b) read by an EXTERNAL process (python/ffmpeg scripts, models, binaries) → ship via `extraResources`/`asarUnpack` and resolve from `process.resourcesPath` when `app.isPackaged` (else repo-relative from source); (c) read by Electron itself (`loadFile`, preload) → fine inside the asar. Fix the whole family in ONE installer. Distilled into [[clipflow-electron-ipc]].

## Don't cut a new installer/version after every minor fix — batch ~10 changes (2026-06-11, session 81)
**Correction:** After I shipped two small Queue fixes back-to-back (badge overcount → 0.1.8-alpha.4, then list-hides-untagged-clips → 0.1.8-alpha.5), Fega said: "don't create a new app version until we've made like 10 upgrades to the app. That way we're not wasting time updating after every minor update."
**Why it happened:** the `clipflow-update-launcher` skill + the per-fix "promote to daily driver" habit made me default to bump→build→installer after each individual fix. Each installer is a ~2-min build + a reinstall on Fega's side — wasteful when fixes are small and arrive in clusters.
**Rule:** Default = DON'T bump the version or cut an installer per fix. Keep fixing + committing/pushing source, and only cut a new installer when a batch of ~10 changes has accumulated OR Fega explicitly asks ("update the launcher / cut a build / ship it"). Cutting an installer is now an explicit, batched action — not the automatic tail of every fix. The `clipflow-update-launcher` skill still describes HOW to cut one; this changes WHEN. Verification of individual fixes waits for the batched installer (or Fega says when he wants one sooner). Pending distillation → memory [[feedback_batch_versions]] + clipflow-update-launcher skill "when" guidance.

## Queue tab's clip card / TikTok panel fails the legibility + affordance bar (2026-06-10, session 79)
**Correction (after the TikTok Round-2 reorder shipped):** Fega installed 0.1.8-alpha, confirmed the reorder worked, then listed five quality problems in the same card: (1) text too small + huge dead space on a fullscreen window — "I can barely read anything"; (2) `(LOCKED)` floats above the toggle label instead of aligning with it; (3) the caption doesn't read as a caption — faint text blending into the background, "feels like a statement rather than a text bubble or box," buried at the BOTTOM under the whole TikTok panel, and the discoverable "Reset to template" affordance is effectively invisible; (4) the game tag renders lowercase ("rl") in Queue while Rename/Recordings show it uppercase ("RL") for the premium look — inconsistent; (5) the grey labels ("Posting as", "Privacy", "Interactions", "By posting…") are barely visible.
**Why it happened:** the card was built with `fontSize: 10` + `T.textTertiary` (0.32 alpha) as the default label style and `T.textSecondary` (0.55) fontSize 11 for the caption — too small AND too low-contrast on the near-black bg. Every view is pinned to `maxWidth: 860, margin: 0 auto` in App.js, so a fullscreen window wastes most of its width. The tag is lowercased ONCE at the data layer for case-insensitive comparison and never re-cased for display. The caption is editable (click → edit → Reset) but has zero visual affordance (no field box), so the edit/reset path is never discovered. None of these were caused by the reorder — they're pre-existing Queue-tab debt Fega only scrutinized once he was staring at the panel for the audit.
**Rule:** When building or touching any view, hold it to the legibility bar, not just "it renders": body/label text ≥ 11–12px; never use `textTertiary` (0.32) for text the user must READ — reserve it for truly incidental hints, use `textSecondary` (0.55)+ or `text` for real labels. An editable value must LOOK editable (field box / border / explicit affordance), and its reset/cancel actions must be reachable without first discovering the edit mode. Re-case identifiers for DISPLAY (`.toUpperCase()`) at the render site even when stored lowercase for logic — keep casing consistent with how the same identifier appears on other tabs. Use the available window width — don't pin content to a narrow centered column on a desktop app. Mock aesthetic-sensitive UI in HTML and get Fega's eyes on it before writing React ([[feedback_ui_density_aesthetic]], [[feedback_open_mockups_in_browser]]). Pending distillation into [[clipflow-ui-debug]].

## Subtitle segments own time as a half-open interval [start, end) (2026-06-09, session 77)
**Emergent bug (Fega found it verifying the session-77 batch, not a correction of my work):** Adjacent subtitle segments share a boundary timestamp — segment A's `endSec` equals segment B's `startSec`. Clicking B's row seeks to `B.startSec`, and with no word explicitly selected, the Edit Subtitles auto-track `find()` (`adjustedTime <= s.endSec`) and `getActiveWordInSeg` (bail on `> seg.endSec`) both treated that instant as belonging to A — the segment *ending* there, which sorts first in the array. Result: clicking a row put the active bar + a highlighted word on the row ABOVE the one clicked, with both rows' boundary words lit at once, in 1-word and 3-word mode.
**Why it's wrong:** an inclusive `<= endSec` gives a boundary timestamp to TWO segments; `find()` returns the earlier one. A timestamp must belong to exactly one segment — the one that *starts* at or before it and *ends* strictly after it.
**Rule:** segment time-ownership is a half-open interval `[startSec, endSec)`. Active-segment tracking uses `>= startSec && < endSec`; the word-active guard bails on `>= endSec`. Pre-existing boundary bug in the twice-reverted karaoke zone. Distilled into [[clipflow-editor-patterns]] (Karaoke section), alongside the #132 clickTime mechanism.

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

## Session 76 — open-canvas zoom: three implementation traps + iterating on "feel" (2026-06-09)
- **What happened:** #134 (preview zoom) took five build→test loops with Fega. Each of my first implementations was *correct in code* but wrong in feel, and each wrongness had a concrete, reusable cause. The fix that landed: rework zoom/pan from "enlarge the video inside a scroll box" to "video floats on an open canvas like a Photoshop layer" — zoom physically resizes the canvas, pan is a CSS translate, free movement in all directions, Fit recenters.
- **The four technical traps (all reusable):**
  1. **Stale rect from rAF-after-setState.** Capturing post-zoom layout in a `requestAnimationFrame` scheduled in the same tick as a React `setState` reads the *pre-commit* rect, so the cursor-anchor nudge `(rect.left + f*rect.width) - cursorX` cancels to ~0 and the content grows from its top-left corner regardless of cursor. Fix: do post-layout reads in a `useLayoutEffect` keyed on the state (runs after commit, before paint).
  2. **Non-proportional per-step easing snaps.** A center-pull applied as a FIXED fraction per wheel notch makes a tiny 2% zoom yank as hard as a huge one → cross-screen jump (the "164→162 leaps to the other edge"). Any per-step bias toward a target must be proportional to the zoom delta (cap it ≤1 so zoom-OUT doesn't drift away).
  3. **CSS `transform: scale()` blurs text.** Scaling an element with transform rasterizes then stretches the bitmap → captions/subtitles go blurry when zoomed. For crisp text, physically resize (width/height in px) so fonts re-rasterize at the new size; reserve transform for translate/pan only.
  4. **Displaced-frame jitter.** Imperatively applying a transform computed for the NEW size while the DOM is still the OLD size paints one displaced frame that the next commit corrects → reads as jitter every notch. Apply the size change and its dependent transform together in a single pre-paint commit (`useLayoutEffect`); don't pre-apply the transform in the event handler.
- **The meta-lesson:** "Feel" features (zoom, pan, motion) can't be nailed from the ticket — they need fast build→test→adjust loops, and when the user says "almost there / not quite," the answer is usually a different *interaction model*, not a parameter tweak. After two failed feel-tweaks I re-read the whole layout from scratch (per the failure-recovery rule) and switched models (scroll → transform → physical-resize+translate) instead of guess-patching a parameter a third time. Each sub-behavior (cursor anchor, center drift, crispness, smoothness, free pan) is a separately checkable item — verify them individually, not as one "is the zoom good?"
- **Rule:** For interactive feel features, reach for the standard model (zoom-to-cursor, floating-layer pan with a keep-visible clamp + recenter) rather than bespoke scroll hacks; when zooming visual content that contains text, physically resize don't CSS-scale; and apply coupled size+transform changes atomically in `useLayoutEffect` (before paint), never split across an event handler and a later commit.

## Session 88 — confidently blamed the wrong cause for the mid-clip playhead reset (2026-06-19)
- **What happened:** Two bugs reported after a ripple delete: (1) subtitles mashed, (2) playhead jumps to start on play. For #2 I traced it to the `togglePlay` end-of-timeline replay snap (`currentTime >= duration - 0.1 → seekTo(0)`), reasoning that the ripple delete shrank the 30s timeline to ~20s so "past 20s" was the new end. Plausible, internally consistent, fully cited — and **wrong**. Fega corrected from experience: "it was mid-clip, so it was jumping to the start mid clip." The end-snap mathematically cannot fire mid-clip. Re-traced from scratch: the real cause is a video↔playhead desync — the rAF loop treats `<video>.currentTime` as source-of-truth and overwrites the store playhead from it on the first frame of play (`PreviewPanelNew.js:888`), and nothing pushes the playhead INTO the video except an explicit `seekTo`; `onLoadedMetadata` even force-parks the element at the first segment without syncing the store. Fixed the class (re-seek to playhead on play + ignore frames while `video.seeking`) rather than one trigger, because clean-state traces wouldn't reproduce the exact desync.
- **Why it happened:** I let a plausible, well-cited hypothesis stand in as THE root cause without reproducing the symptom. Static citations prove code EXISTS and CAN run, not that it's the path the user's gesture actually hit. The end-snap theory required reinterpreting Fega's "past 20 seconds" to mean "at the new end" — I bent the user's words to fit the theory instead of testing the theory against his words.
- **Rule:** For playback/state/timing bugs, do NOT present an unreproduced diagnosis as the answer. Either (a) reproduce it (or add a one-line log and have Fega repro once), or (b) explicitly tag the root cause as UNCONFIRMED and fix the *class* of bug robustly. When the user's described numbers/positions have two possible meanings after an edit (here "20s" = old mid-clip vs new end), surface both and ask — don't silently pick the one that confirms your hypothesis. And when the trace cleanly maps the happy path, that's evidence the bug needs a real repro, not a tidier story.

## Session 91 — asserted Fega was testing on the source build; he was on the installed daily build (2026-06-22)
- **What happened:** After Fega OK'd the Review Rail card, I inferred he must be running the app from source (the card shipped source-only in session 90, not in the installed alpha.11). When he asked whether a plain close+reopen was really enough, I doubled down with a source-vs-installed explanation telling him he was "running the test version, not your everyday Start-Menu ClipFlow." He corrected: "for the past couple tests, I've been doing it on my daily build." My elaborate distinction was friction ("what are you on about🙄"), and my confident claim about his environment was wrong.
- **Why:** I built a clever inference (card-only-in-source ⇒ he's on source) and presented it as fact about his setup instead of just asking. Fega tests on his installed daily build by default — that's the daily-driver path in CLAUDE.md — so a source-only change is invisible to him until an installer is cut. (There's still an unexplained wrinkle — alpha.11 shouldn't contain the new card — but the fix is to cut a fresh installer from master, which moots it; chasing the wrinkle would have been more of the same friction.)
- **Rule:** Don't infer and assert which build the user is testing on from indirect evidence. Assume Fega is on his installed daily build unless he says otherwise; when a code change needs to reach him, the answer is almost always "cut a new installer," not "close and reopen." If my model of his environment conflicts with what he reports, his report wins — confirm directly in one line, don't construct a source-vs-installed lecture.

## Session 97 — Partial assertions let a dead-wrong stat ship (fresh-eyes review catch)
- **What went wrong:** `monthStats` read `row.mondayIso` (wrong case, `mondayISO` is correct), so "weeks hit" rendered "0 of 0" always. The unit test called monthStats but only asserted clips/bestDay/streak — not hits/done — so 16/16 passed over a broken feature. Also: pre-tracking history weeks rendered as "Missed", and Sunday posts were dropped from week scores.
- **Why:** wrote the test alongside the code with the same mental model; asserted the fields I was thinking about, not every field the function returns. Property-name casing between module boundaries (mondayISO vs mondayIso) is exactly the kind of bug builds can't catch.
- **Rule:** when a pure function returns a result object, the test must assert EVERY field at least once, especially fields fed by a different data source than the ones already asserted. And before "done": walk each rendered number in the UI back to its producer and confirm the property names match at the boundary (grep the exact key). A "fresh eyes" reread of the full diff after the build is not optional — it found 4 real bugs a clean build + green tests missed.

## Session 103 — Versioned a flagship feature as an alpha-counter tick (2026-07-15)
- **What went wrong:** Cut the installer carrying ALL of Auto-Reframe Phase A (the biggest pipeline feature since the editor) plus the waveform fix as `0.1.8-alpha.17` — a mechanical +1 of the alpha counter, same increment used for a batch of small UI fixes. Fega: "This installer is too large for you to call it 0.1.8 alpha 17… At the very least it should be 0.1.9."
- **Why:** I followed the update-launcher skill's "bump the counter" default literally and never asked whether the CONTENT of the release matched the SIZE of the increment. Version numbers are a communication channel about magnitude, not just a uniqueness counter.
- **Rule:** Before cutting an installer, weigh what it carries: small fixes/UI batch → alpha counter tick; a substantial feature or new subsystem → minor bump (0.1.8 → 0.1.9) with the alpha counter reset (`-alpha.1`); a completed flagship epic or launch-milestone shift → Fega delegated this judgment to me ("I'll leave it in your hand to know when we should bump a main number up") — so make the call, state it in one line in the changelog entry, and don't ask permission each time.

## Session 103b — Baked the epic's EXAMPLE resolution into feature gates (2026-07-15)
- **What went wrong:** #164 Phase A gated the Layout tab and layout auto-attach on `sourceWidth > sourceHeight` ("horizontal recordings"), taking the epic's "record one normal 1920x1080 canvas" literally. Fega's actual main OBS canvas is 2560×2880 (8:9, taller than wide) — the gate hid the entire feature from the exact user it was built for. He also rejected feature-hiding outright: "Hiding features doesn't make sense imo."
- **Why:** I treated an illustrative number in the epic as the requirement. The real requirement was "any non-vertical source gets reformatted"; 1920×1080 was one example of it. Never encoded-checked the assumption against his actual rig (one OBS screenshot would have caught it in planning).
- **Rule:** When an issue/epic names concrete numbers (resolutions, sizes, counts), ask whether they're REQUIREMENTS or EXAMPLES before building conditionals on them — and check the user's real-world values early (his OBS settings, his files) rather than assuming the common case. Gate features by what they can't do ("source already 9:16 → nothing to reframe"), never by an allowlist of expected inputs. And default to features being VISIBLE with an explanatory state instead of hidden — Fega's explicit stance.

## Session 104 — reframe.style silently dropped by a whitelisting save path; two verification-harness traps (2026-07-15)
- **What happened:** (1) Adding `reframe.style` would have silently evaporated on save — `projects.updateReframe` rebuilds the stored reframe from an explicit field list, so the new field needed adding there; caught during spec-writing by reading the persist path, not by a failure. (2) `TaskStop` on a bash-wrapped `npx electron` kills only the wrapper on Windows — the orphaned electron.exe keeps port 9222, the next launch can't bind, and CDP silently connects to the STALE bundle (one full verify run "failed" against old code). (3) A headless render harness without `app.on("window-all-closed", () => {})` quits when the offscreen overlay window closes — FFmpeg never runs/dies orphaned, the harness exits 0, and no output file exists (success-shaped failure).
- **Fega's one correction:** item 5 of the polish batch — "gradient border" meant the game footage going see-through into the bg (like his OBS canvas), not a shadow cast under the clip. Cheap to fix because the assumption was stated explicitly pre-build; both looks later became a user setting, mooting the choice permanently.
- **Rules:** grep a shape's save path for object-literal rebuilds before assuming a new field persists (→ clipflow-electron-ipc); kill dev Electron with `taskkill //F //IM electron.exe`, never TaskStop, and confirm the CDP target runs the fresh bundle before trusting assertions; every headless Electron harness gets the window-all-closed guard (→ memory project_cdp_verification_gotchas).

## Session 105 — Sonnet delegation reversed; machine-verified mechanics ≠ usable UX (2026-07-16)
- **What went wrong (process):** Ran the session-83 division of labor — Fable specs, two sequential Sonnet subagents implement — on a 4-item polish batch. Wall-clock was long (two ~10-min agent runs plus review/patch round-trips) and Fega killed the policy: "let's not use sonnet to do work. that took so long for the little I asked. can you use fable instead… so it's good and fast."
- **What went wrong (product):** Two of the four shipped items missed his bar despite a 22/22 CDP pass and a real-render check. (1) Naming a layout required clicking "Save layout" to reveal a hidden name row — he called it "so badly done"; saving is redundant with Apply in his mental model ("if I am within a layout I would already click apply"). (2) Background panning existed ONLY as drag-on-the-240px-Result-thumbnail with a one-line hint — he reports he cannot pan at all. The mechanics were verified; the affordance failed the human. CDP proves handlers fire, not that a user will find or trust the gesture.
- **Rules:**
  - Implementation happens in the main Fable session now — no Sonnet/Haiku implementation subagents (memory feedback_fable_delegation updated; subagents stay OK for read-only research).
  - A control the user explicitly asked for ("pan up/down/left/right") gets a VISIBLE dedicated control (sliders/buttons), not only a gesture on a secondary surface. Gestures are accelerators, never the sole path.
  - Don't bolt a new action button onto a flow when an existing commit action can absorb it — if every save follows an apply, the apply should save. Watch for "two buttons where the user thinks one thing" seams before shipping, not after.

## Session 111 — "Fresh profile" promised empty, booted onto real data (profile isolation is only half the state)

**What went wrong:** I built a fresh-install sandbox (parked `clipflow-dev`, launched the installed exe with `CLIPFLOW_PROFILE=dev`) and told Fega it would "open completely empty — no projects, no recordings, no history." It booted showing 104 of his real recordings, 8 real projects, and his real queue (badge 6). He caught it immediately ("I thought it was going to load up empty").

**Why:** I verified how the profile switch isolates userData (main.js:8) but never asked where ALL app state lives. Two chunks live OUTSIDE userData, keyed off the `watchFolder` setting: the recordings corpus (the folder itself) and the entire projects tree (`<watchFolder>\.clipflow\projects`). And STORE_DEFAULTS hardcodes Fega's real folder as the default watchFolder (#167) — so the "isolated" profile ingested the real disk on first boot (file migration imported 104 files into its DB; Projects listed straight off the shared tree). Isolation held for settings/DB only. No real files were mutated — verified from the sandbox's own log (file migration writes only its own DB; pollution repair "0 clips fixed") — but any user ACTION in that state would have hit real data.

**Rule:** Before promising any environment is isolated/empty/fresh, enumerate every class of state (settings store, DB, on-disk trees derived from settings, caches) and check each against the isolation boundary — "separate userData" is not "separate everything." For ClipFlow specifically: anything under the watch folder (recordings, `.clipflow\projects`) is SHARED by every profile pointing at it; a sealed sandbox needs its own watch folder preseeded into `clipflow-settings.json` BEFORE first boot — and JSON-validate the preseed (a hand-printf'd file with bad `\` escapes fails JSON.parse and silently falls back to defaults = the real folder again).

**Addendum (same session, second occurrence of the same class):** the .cmd launcher rewrite via bash `printf` mangled `\n`/`\e` in Windows paths exactly like the JSON preseed had — caught by `cat` immediately, rewritten with the Write tool. Hard rule: never emit Windows paths through bash printf/echo escapes; hand-authored config/launcher files get written with the Write tool (literal bytes) and then read back/validated before use.

## Session 112 — Present-tense harm claimed from a config value + one file probe (2026-07-18)

**What went wrong:** Told Fega "ClipFlow is currently reading Track 1 (the mix), so your subtitles are being generated from voice + game audio blended." Only the setting (`transcriptionAudioTrack=0`) and the NEW recording's layout were verified — no check of what ClipFlow had actually processed. He challenged it: "Did you verify or are you just guessing based off what this new footage shows?" Follow-up verification showed the claim was wrong as stated (no new-setup file has ever been processed — the watch folder still points at the old vertical tree) and accidentally right for a different reason (old-setup Track 1 was ALSO a mix; the isolated mic was Track 2 all along, and on at least one processed source, background-music lyrics transcribe into Track 1).

**Why:** A config value describes future behavior on hypothetical input; "is happening" requires evidence that matching input actually flowed through. I bridged the gap with the file that happened to be in front of me — new-setup footage that ClipFlow had never seen.

**Rule:** Setting X + file Y proves "processing Y WOULD do Z" — never "Z is happening." Before any present/past-tense claim about pipeline output, verify all three: the setting, what inputs were actually processed (projects' sourceFile paths), and a probe of at least one actually-processed input. Where behavior depends on per-file variation (audio layout, music present or not), verify more than one processed file before generalizing.

## Session 113 — Two writers on gamesDb: a main-side repair the renderer would have un-repaired (2026-07-18)

**What almost went wrong (self-caught in review, not a user correction):** The day-counter repair (#170) wrote fixed `dayCount`/`lastDayDate` values into the store from the main process during reconcile. But App.js loads `gamesDb` into React state once at boot and persists the entire array back on every change — so the renderer's stale pre-repair copy would have overwritten the repair on Fega's very next rename (proposing Day10 again).

**Rule:** Store keys owned by renderer state (loaded at boot + whole-value persisted on change) effectively have two writers. A main-process write to one of them MUST be pushed to the renderer via an IPC event (`gamesDb:changed` → setGamesDb) or it is silently reverted. Routed to clipflow-electron-ipc (Distilled Lessons).

## 2026-07-20 (session 115) — Session names: plain, not clever
- **What went wrong:** Suggested "One folder to rule them all — recording tree unified, date-first naming restored" as a session name; Fega: "what kind of name is that fam?"
- **Why:** Went for a joke/movie-reference title instead of a functional label.
- **Rule:** Session names read like commit subjects — a few plain words about the work ("Unified recordings + naming fix"). No puns, references, or subtitle constructions.

## Session 117 — Ref read inside a setState updater saw the post-handler value (self-caught via trusted-input CDP, not a user correction)

**What went wrong:** Shift-click range select silently degraded to plain toggle. `toggleRow` read the range anchor (`lastClickedRef.current`) INSIDE the `setSelectedIds` updater, and assigned the ref on the line after the `setState` call. React 18 runs updater functions when it processes the update — after the handler body finishes — so the updater always saw the ref already overwritten with the just-clicked row (`anchor === id` → range branch never taken). A synthetic-DOM test caught the symptom; a trusted-input CDP replay (`Input.dispatchMouseEvent` with the Shift modifier) confirmed it was a real-user bug, not a test artifact.

**Rule:** Never read a mutable ref (or any value you mutate later in the same handler) inside a setState updater — capture it into a local const at the top of the handler and close over that. And when a UI behavior test fails, reproduce it with trusted CDP input events before touching the code: synthetic `dispatchEvent` clicks pass through React differently enough (no mousedown, untrusted) that they can both mask real bugs and fake phantom ones.

## Session 117b — "Existing behavior, keep it" shipped a known-broken behavior into a redesign (2026-07-21)

**What went wrong:** The #172 plan documented that undo-created pending rows "have no filePath (no thumb/probe/explorer) — existing behavior, keep it." That existing behavior WAS the bug: session-history UNDO had never renamed anything back (cosmetic strikethrough + ghost row). Fega hit it within hours of installing alpha.1 — "it acted like it undid initially but it never actually undid" — plus its downstream symptom, blank unhoverable thumbnails on the ghost rows.

**Why:** During planning I treated "pre-existing" as "acceptable" and carried the quirk forward without asking what the feature was FOR. A redesign that makes a surface more prominent (History/undo got more visible next to multi-select) also promotes its dormant bugs into daily-path bugs.

**Rule:** When a plan preserves a pre-existing behavior that is visibly weird (ghost rows, cosmetic toggles, no-op buttons), don't file it under "keep as-is" silently — ask one plain question in the plan ("undo today doesn't actually rename the file back — fine, or fix while I'm in here?"). Fega decides scope; the plan's job is to surface the weirdness, not inherit it.

## Session 118 — "The fix didn't work" because the fix was installed after the test (2026-07-21)

**What went wrong:** Fega reported the alpha.2 undo fix "didn't work" — screenshots showed a dead, grayed-out History tab. Diagnosis: his two undo test rounds (11:08 PM and 12:04 AM) both ran on pre-fix builds; the alpha.2 installer was only built at 12:27 AM and installed after. Nothing told him that (a) every entry already in History predates the fix and can never grow an UNDO button, and (b) the fix only applies to renames made after installing. Worse, the old fake undo left lying data behind — renames crossed out as UNDONE that actually stand on disk, plus Pt7–Pt12 entries for renames that never happened — and the new build displays that stale state as-is, which reads exactly like "the fix is fake too."

**Why:** A fix that depends on records created at action time (rename_history rows) has a data horizon: everything from before the fix is permanently outside it. I verified the new path end-to-end on a sandbox but never asked what the OLD data would look like through the new UI on Fega's machine — and at session end I said "fixed and shipped" without adding "your earlier test ran on the old build; here is the one test that exercises the new code."

**Rule:** When a user reports a shipped fix "doesn't work," FIRST compare the fix's install time against the user's test timestamps (exe mtime vs. UI/DB timestamps) before any code-level diagnosis. And when shipping a fix with a data horizon: (1) state the horizon in the verification ask ("old entries won't change — test with a NEW rename"), and (2) plan for what pre-fix data looks like in the new UI; stale lying state left visible reads as "still broken."


## Session 123 — Queue "delete clip" destroyed project clips because "clip" meant different things (2026-07-24)

**What went wrong:** The Queue tab's new trash popover offered "Delete clip + rendered file," implemented as full clip-record deletion from the project (plus files). Fega meant something queue-scoped: take the entry out of the publish queue and optionally delete the rendered MP4 — never remove the clip (and its edits) from the Projects tab. He tested it and permanently lost a batch of clip records; project JSONs have no backups, unlinkSync bypasses the recycle bin, and the DB doesn't mirror clips.

**Why:** I mapped his words onto the nearest existing primitive (`projects.deleteClip`, my noun "record") instead of onto the surface he was standing on — actions on a Queue row scope to queue membership and queue artifacts. The approved plan even said "removes the record," but "record" is implementer vocabulary; the plan never said the user-visible consequence: "the clip disappears from the Projects tab too and its edits are gone."

**Rule:** For any destructive option: (1) the plan must state consequences as what disappears from WHICH SCREENS, in app-user words, not internal nouns; (2) when a destruction request is ambiguous, implement the LEAST destructive reading that satisfies the stated goal and ask about the rest; (3) an option that deletes something the user edited by hand (clips, subtitles, profiles) needs an explicit "your edits on X will be lost" line in both the plan and the confirm UI.

## Session 124 — Shipped alpha.8 with an editor-wide crash: defined the handler in Topbar, referenced it in EditorLayout (2026-07-24)

**What went wrong:** The viewer-screenshot handler (`onScreenshot`, `buildRenderPayload`, the toast) was added to `Topbar` — but `<PreviewPanelNew onScreenshot={onScreenshot} />` sits in `EditorLayout`, a *different component in the same file*. JavaScript compiles fine (identifiers resolve at runtime), the Vite build passed, my boot smoke test passed (the Editor is the ONE view that only mounts when a clip opens), and the installer shipped. Every attempt to open any clip in the editor crashed with `ReferenceError: onScreenshot is not defined` on Fega's daily driver.

**Why:** I anchored my insertion by proximity to related code (`doRender`, `lastRender`) without checking which function I was inside — EditorLayout.js holds five components. Then every verification layer had the same blind spot: Vite doesn't lint undefined identifiers, `node --check` can't parse JSX, and the boot smoke only proves the always-mounted panes render.

**Rule:** (1) Before inserting into a large multi-component file, confirm the enclosing function (`grep -n "^function \|^export default function" file`) — nearest-similar-code is not proof of same scope. (2) A boot smoke does NOT cover the Editor; after ANY editor-touching change, drive an actual clip open (CDP: launch with `--remote-debugging-port=9222`, click `.pl-open` → "Open in Editor", assert no "Editor Crash" text — script pattern in session 124). (3) When a state+handler pair must serve a distant component, don't thread it across components ad hoc — extract the pure part to a util module and let the consuming component own its state.

## Session 125 — Sized a version bump by implementation novelty instead of user-facing contents (2026-07-24)

**What went wrong:** The Facebook Reels change (one endpoint swap + fallback router, 3 files, ~300 lines, no new UI) was labeled "a new publishing subsystem" to justify a minor bump (0.3.0-alpha.9 → 0.3.1-alpha.1). Fega flagged it: the sizing judgment was asserted, not exercised. User-facing, this is a bug fix — Facebook posts were landing on the wrong surface and now land on the right one.

**Why:** The bump policy ("substantial feature or new subsystem → minor") was pattern-matched to the mechanism (a new three-phase upload flow feels like a subsystem) instead of to what the installer carries for the user. Novel internals are invisible to the user; the visible change is "Facebook posting works correctly now + links in the tracker." That's a fix, and fixes tick the alpha counter.

**Rule:** Size version bumps by what the USER gets, not by how new the code underneath is. Ask: "would Fega describe this installer as a new capability, or as 'X works now'?" — 'works now' = alpha tick, no matter how much plumbing changed. When the sizing call is genuinely borderline, say so in one line in the changelog instead of inflating the label to match the bump.

## Session 126 — Asserted a framework tradeoff from recall; it was wrong and nearly killed a correct fix (2026-07-24)

**What went wrong:** Explaining why the single-instance lock (#156) hadn't been added, I told Fega it "would block running a source build alongside the installed app" — stated flatly, as a known constraint, and used as the reason to leave the issue open. It's wrong. Electron's lock is scoped to the **userData directory**, so it only excludes same-profile launches: `npm run dev` (dev profile) runs beside the installed prod app untouched. The only blocked pair is two prod instances — which is precisely the pair that caused the duplicate-publish incident. I only found this out because he asked "what is the single instance lock?" and I probed it before answering.

**Why:** The claim came from a plausible mental model of "one lock per app" and was never tested, because it sat in a *recommendation* rather than in code — no build step or test would ever have contradicted it. The existing discipline (`feedback_no_code_narration`, `clipflow-trace-verify`) is framed around reading *project* code before describing it; third-party framework semantics fell through that gap. The cost was concrete: the overstated downside was my stated reason not to fix #156, so a correct fix was almost declined on bad information.

**Rule:** When a claim about third-party/framework behavior is load-bearing for the user's DECISION (a tradeoff, a "we can't because…", a recommendation against), verify it before stating it — a 20-line throwaway probe beats reasoning from the API name. Type definitions often don't answer scoping questions (Electron's `.d.ts` never says what the lock is keyed to); prefer an experiment that reproduces the actual contended situation. Same rule for the *mechanism* you rely on, not just the headline: `app.exit(0)` halting synchronous execution was the reason the fix is safe, so it got its own probe too. If a probe genuinely isn't worth it, mark the claim as unverified out loud instead of asserting it.

## Session 127 — An electron-store "done" flag can't guard per-database work (2026-07-24)

**What happened (self-caught before shipping, no user correction):** The #183 title/caption backfill was written as `if (!store.get("titleCaptionBackfillDone")) { backfill(); store.set(...) }` — the reflexive one-time-migration shape. It's wrong here. `clipflow-settings` lives in userData, which prod-from-source and the packaged exe **share**; the SQLite DB does not (`DB_DIR` splits `<repo>/data` vs `userData/data`). Running `npm start` once would set the flag in the shared settings, and the packaged app's table — a different file — would then be starved forever. Caught while reasoning about how to verify the migration without touching Fega's running daily driver.

**Why it nearly shipped:** "one-time work behind a store flag" is a pattern already used correctly elsewhere in `main.js` (`fileMigrationComplete`, `subtitlePollutionRepairComplete`), so it pattern-matched. Those guard work on data that lives in the SAME store as the flag. The mismatch only appears when the flag and the thing it guards have different sharing boundaries — which nothing in the code makes visible at the call site.

**Rule:** Before guarding one-time work with a persisted flag, check that the flag and the guarded STATE share a storage boundary. If they don't, either query the guarded store for its own completion, or make the operation idempotent and run it unconditionally. Prefer idempotent-always for cheap operations — it removes the class instead of getting the guard right. Routed to [[clipflow-electron-ipc]] (Distilled Lessons).

**Second, non-code observation from the same session:** the AI title/caption prompt had grown to 14,207 chars of stacked rules and that was itself the cause of the generic output it was written to prevent. Routed to memory [[project_ai_prompt_overconstraint]] + [[project_fega_title_voice]]; the full reasoning lives in `src/main/data/caption-frameworks.md` §4.

## Session 128 — A derived list must be emitted in the CONSUMER's order, not the source's (2026-07-25)

**What happened (self-caught during verification, no user correction):** With section reordering (#184) working — footage moved, subtitles followed, render correct — the Transcript panel's word highlight sat on the *last* word of the clip while the playhead was mid-clip. Cause: `visibleSubtitleSegments` walks the input subtitle array and emits in that order, i.e. **recording order**. That matched playback order for the entire life of the app until a section could move. Consumers that treat the mapped list as a flat sequence — the karaoke global word index, the Edit-subtitles rows, the Transcript paragraphs — then track the wrong word. Fixed by sorting the output on `timelineStartSec` (provably a no-op while sections stay in recording order).

**Why it nearly shipped:** every targeted check passed. The unit tests asserted per-segment *values* (`timelineStartSec` of segment X), never the *sequence*. The preview overlay was correct because it `find()`s by time range, which is order-independent. Only a surface that walks the list positionally could show it, and only in the running app — the bug lived in an invariant nobody had written down, because nothing had ever violated it.

**Rule:** When a feature makes a previously-guaranteed ordering violable, the derived/mapped structures built from it need an explicit sort in the consumer's coordinate space — don't rely on the input's incidental order. And when a change breaks an ordering assumption, grep for consumers that index or accumulate across the list (`[i]`, running counters, flat global indexes), not just those that read fields off it. Routed to [[clipflow-editor-patterns]] (Timeline Rules).

**Corollary on verification:** 91 green unit tests and a correct render did not surface this; driving the real UI did. For anything touching a shared mapping layer, the CDP clip-open drive is not optional garnish — it is the only check that exercises the consumers.

## Session 129 — Version numbers are Fega's progress model, not a per-release size label (2026-07-25)

**What happened (direct user correction):** Two consecutive installers were cut as minor bumps — `0.4.0-alpha.1` for the AI title/caption rebuild (#183) and `0.5.0-alpha.1` for the timeline section reorder (#184) — inside two days. Fega, seeing the update banner offer 0.5.0: "We're meant to stay on v3 until a very huge change worthy of going to v4 is made. Now you made the reorder video and have created a whole v5. That's insane and I'm not doing that." Both numbers retracted; the two builds recut as a single `0.3.0-alpha.15`, retracted exes deleted from `dist/`.

**Why it happened:** the session-103 rule explicitly delegated bump sizing to me ("I'll leave it in your hand to know when we should bump a main number up") and the session-125 refinement gave a test — "new capability" vs "X works now" — that both features passed cleanly. The rule was applied correctly and still produced a bad outcome, because it optimized the wrong thing: it sized each release *in isolation* against its own contents, with nothing tracking the *rate* at which the minor number was being spent. Two legitimately-new capabilities in two days meant two bumps, and no single decision looked wrong from inside itself.

**Rule:** Tick the alpha counter, always — no ceiling, no matter how large the feature. The minor number never moves without Fega saying so; if a build feels milestone-sized, propose it in chat and wait. Generally: when a delegated judgment call has no rate limit and each instance is defensible on its own, the aggregate can still be the failure — check the trajectory, not just the current decision. Routed to [[clipflow-update-launcher]] (Version bump policy) + memory [[feedback_version_semantics]].

## Session 129 — I proposed a fix for a cause I had not measured (2026-07-25)

**What happened:** Instagram rejected a 122.9 MB clip. I read the code, saw the whole file being pushed in one request, noted it was the largest upload ever attempted, and proposed chunked/resumable upload plus retry — a coherent, well-reasoned fix for a cause I had assumed. The plan included a "prove it first" step only because the user's standing rule demands one. That step killed the hypothesis in two experiments: the same clip re-encoded to 13.5 MB still failed, and a 109.5 MB clip uploaded fine. Size was irrelevant. Chunking, tested later, turned out to change nothing at all — the pieces upload in under a second each and the final one hits the same wall. The real cause is an undocumented ~33-35s processing timeout on Meta's side that scales with resolution × duration.

**Why it happened:** the evidence I had (one big file, one failure) was equally consistent with a dozen causes, and I picked the one the code made most visible. Reading the code showed me a *plausible* weakness — single-shot upload — and I let "this is suboptimal" slide into "this is the bug." They are different claims and only the second one needed evidence.

**Second correction, from Fega:** when I said the practical ceiling was Instagram's, he pushed back — "I've seen content creators post 4K long videos on Instagram." He was right, and it was the most productive question of the session: it forced the chunked test I had skipped, and led to finding the `video_url` route (hand Instagram a link, let it fetch asynchronously) that every third-party scheduler uses and that has no timeout at all. I had been treating the API path ClipFlow happens to use as if it were the API's limit.

**Rule:** a proposed fix names a cause; a cause needs an experiment that would have come out differently if I were wrong. Before proposing, ask "what single test separates my explanation from the next most likely one?" and run that first — especially when the fix is expensive and the evidence is one data point. And when a user says "but I've seen X work", that is data about the world contradicting my model, not a layman's confusion — chase it. Filed as #185/#186.

## Session 129 — A filename convention is not one convention until you've checked (2026-07-25)

**What happened (caught by a Fega question, after shipping):** #188 made render files follow the clip title, and I had the rename move the thumbnail alongside the video — naming it `<title>_thumbnail.jpg`. That string came from `main.js:3013`, the only thumbnail-naming site I had read. Three exist: `<render name>_thumb.jpg` (`main.js:2899`, paired to the video filename), `<clip id>_repairthumb.jpg` (`render-collision-repair.js:110`, keyed by id so the repair pass can regenerate it), and `<title>_thumbnail.png` (the WYSIWYG screenshot — a different feature entirely). My rename flattened all three into the third. It shipped in alpha.17 and needed a correction in alpha.18. A second flaw surfaced in the same breath: titling a never-rendered *detection* candidate renamed its `clip_<n>_thumb.jpg`, churning pipeline artifacts for clips that never ship.

**Why it happened:** I grepped for the thing I was about to write (`_thumbnail.png`), found one site, and treated it as *the* convention. The correct search is for the whole *class* — every place that constructs a name for that kind of file — because a rename doesn't just add a name, it asserts that all existing names should have been this one. Neither flaw was caught by 18 passing assertions, because my tests encoded the same wrong assumption as the code. And the backfill would have applied it to 41 real files at once.

**What actually caught it:** running the backfill in dry-run mode first and *reading the output* — `clip_006_thumb.jpg -> Clip 6 (copy)_thumbnail.jpg` is obviously wrong on sight in a way it never was in the code. Then Fega asking "what are the 260 you left alone?", which forced me to characterise the skipped set and exposed that I was touching detection artifacts at all.

**Rule:** before writing code that renames, moves, or derives a filename, grep for every construction site of that file type — not the one you're copying from. If more than one convention exists, preserve each file's own rather than imposing a winner. Any bulk mutation gets a dry run whose output you read line by line before `--apply`, and an undo log. And when the user asks a clarifying question about scope, treat it as a scope *audit*, not a request for a number.

## Session 130 — I stamped a classification at the catch-all site, not at its origin (2026-07-26)

**What happened (self-caught during verification, no user correction):** #189 makes Instagram fall back to a 720p copy automatically, gated on a `processingWall` flag so that only failures a smaller file could actually fix trigger a re-encode. I set that flag at the "all upload attempts exhausted" throw — which reads naturally, because that *is* where the fallback decision gets made. But every failure that exhausts the retry loop passes through it, including OAuth errors. An expired Instagram token would have triggered a pointless 720p transcode plus a second doomed upload, and been reported to Fega as "long clips at 1080p are the usual cause" — a video problem, for a login problem.

**What caught it:** running the live-API test with a bogus token and *reading the log output* rather than just noting that 9 assertions went green. The output had `Upload failed on every attempt { error: 'Container creation failed [type=OAuthException, code=190...]' }` sitting directly under a tag whose entire meaning is "a smaller file fixes this." The assertions themselves were happy — they encoded the same wrong assumption the code did, which is the same failure mode as session 129's thumbnail conventions.

**Rule:** when a flag gates an expensive or destructive action, set it at the **origin** of the specific condition and let the summary site *inherit* it — never stamp it at a shared catch/exhaustion point. A catch-all's failure taxonomy is always wider than the case you're designing for; ask "what else reaches this line?" before attaching meaning to it. The same applies to user-facing error text written at a catch-all: the message was confidently naming a cause it hadn't established. Routed to [[clipflow-code-review]] (Distilled Lessons).

## Session 130 — A fixture that silently didn't load looks exactly like a feature that doesn't render (2026-07-26)

**What happened:** To verify the new 720p badge without touching Fega's live project files (his daily driver was open — external writes are unsafe), I built an isolated sandbox: a synthetic project in the scratchpad plus a fake connected Instagram account in the dev profile. It failed to load twice, silently, for two unrelated boring reasons. First, the Windows path written into `clipflow-settings.json` lost its separators because `\1` inside a JS string literal ate them — `...\12402b58...` became `...T02b58...` — so `projectsRoot` pointed at nothing and the app fell back to its cached `localProjects` list, showing *real* clips that looked entirely plausible. Second, after fixing the path, the clip fixture used `renderStatus: "done"` where `App.js:622` filters on `"rendered"`, so the queue was simply empty.

**Why it matters:** both states are indistinguishable from "my feature doesn't render." The first is worse than the second — a UI full of stale-but-believable data invites a confident wrong conclusion in either direction. I could have "verified" the badge was broken, or (with different luck) that some unrelated clip proved it worked.

**Rule:** after seeding any fixture, assert it loaded **through the app's own API** — `projectList()` returns my project, the clip carries my field — before drawing a single conclusion from the UI. Never infer fixture liveness from the UI you're using the fixture to test. Routed to [[clipflow-trace-verify]] (Distilled Lessons).

## Session 130 — Computer-use input can be blocked by a foreground helper; CDP is the way through (2026-07-26)

**What happened:** Verifying the badge in the running app via computer-use died after one screenshot — a Windows snap-layout flyout opened on hover, and from then on every click and keypress returned "Powertoys.mousewithoutbordershelper is not in the allowed applications and is currently in front." Screenshots still worked; input did not. Three consecutive calls blocked.

**Rule:** don't grind on it. Relaunch the dev app with `--remote-debugging-port=9222` and drive it via CDP instead — programmatic `.click()`, DOM/computed-style probes and `Page.captureScreenshot` need no foreground grant and aren't hit-tested by the window manager. That pivot verified the badge (element count, computed colors, per-row placement) and the Publish Log lines in minutes. Routed to memory [[project_cdp_verification_gotchas]].

## 2026-07-27 — Mockup corrections (session 131, #198 chips)
- **Use existing free space before adding height.** Chip row went under the reject button (left column), growing every card vertically while the right column under the transcript sat empty. Fega circled the empty area. Rule: when adding UI to an existing card/row, first look for dead space in the CURRENT footprint; only grow the container when nothing fits.
- **Example options from Fega are a starting point, not a spec.** He listed rejection reasons ("similar clip already, not funny, bad cut, uninteresting e.t.c") and expected me to expand and sharpen them; I shipped the list nearly verbatim including vague phrasing ("Didn't land" — didn't land *what*?). Rule: when he sketches options with "e.t.c", treat it as a brief — add the missing cases, replace weak wording with concrete phrasing, and say what I changed and why.

## 2026-07-27 (session 132) — Never let detection return empty for Fega
**What went wrong:** #200 removed the 10-clip floor ("no minimum, quality gates the count"). Technically correct — the model then agreed with Fega's own "boring content" rejection note and returned 0 clips — but it starved his workflow: he reviews and rejects as TRAINING; an empty project gives him nothing to grade and reads as a broken app. Two installers (alpha.22, alpha.23) shipped before this landed.
**Why:** I optimized for the model being "right" about content quality instead of for Fega's actual loop, where he is the precision filter and volume of pickable material is the product. His first complaint was duplicates, not volume — I over-rotated to zero-tolerance.
**Rule:** Detection must ALWAYS hand Fega material to review — a floor of picks (or every distinct moment a short recording can hold), weak ones marked low-confidence. "Return nothing" is never an acceptable outcome for a real recording, no matter how confident the taste model is. Precision belongs to Fega's clicks, not the prompt.

## 2026-07-27 (session 133) — Ground truth sampled from the wrong clip range (self-caught)
**What happened:** Verifying #193 (Gemini watches the clip), I extracted ground-truth stills across the clip's DETECTED range (19-59s) and judged the model's titles against them. The gemini cost log said "8.0s preview" — the clip had been edited (`nleSegments` 35.4-43.4s) and the feature, correctly, cut only that. My first quality verdict compared the model against 32 seconds of footage it never received.
**Rule:** ground truth must be sampled from the exact range the code under test computed — print the feature's own range first, then extract. Routed to [[clipflow-trace-verify]] (Distilled Lessons).
**Left here only (niche, no skill home):** Gemini 3.x thinks by default and thinking tokens spend from `maxOutputTokens` (2000 truncates to empty; use 8000 and count `thoughtsTokenCount` as output for cost); goal-replay footage follows the SCORER's car, so vision models misattribute opponent goals to the POV player; free-tier AI Studio keys use the new "AQ." prefix and work with `x-goog-api-key`.

## 2026-07-27 (session 133) — Session names must be findable, not catchy
**Correction:** "Titles watch the clip" rejected — Fega locates sessions by WHEN changes were made. Names must carry anchors: session number and the alpha version the changes shipped in (e.g. "S133 · alpha.25 — Gemini video titles"); date explicitly dropped ("forget the date"). The version is the strongest anchor: Settings shows the installed version, which points straight back to the session that cut it. Routed to memory [[feedback_session_name]].

## 2026-07-29 (session 135) — Self-caught: a selection that never stuck, and a fixture that couldn't be seen
**No user corrections this session** (Fega verified all six sound changes on alpha.28 and closed out clean). Three self-caught items, all promoted:
- **Click bubbling ate the selection.** The new SoundBlock stopped `pointerdown` but not `click`; the timeline scroll container's `onClick` deselects everything and fires AFTER the pointerup that set the selection. Deceptive symptom: trim handles still appeared on hover, so the block LOOKED interactive while Delete and selected-styling silently did nothing. Only caught by driving the built app and asserting `getComputedStyle(el).boxShadow` — a screenshot alone had already fooled me into reading hover as selection. Rule → [[clipflow-editor-patterns]] (Misc Editor Rules): a new timeline block stops `click` too.
- **My test tone was inaudible to the waveform extractor.** `extractWaveformPeaks` resamples to 1000 Hz, so the 880 Hz sine I generated as a fixture came back as all-zero peaks — indistinguishable from "my waveform code is broken." Rule → [[clipflow-ffmpeg-media]]: fixtures under 500 Hz; real sounds always carry low-frequency content.
- **`-v error` hid `volumedetect`'s own output**, making a spectral check look like it returned nothing. Rule → [[clipflow-ffmpeg-media]], together with the `atrim` → `asetpts` rebase requirement (without it `adelay` stacks on the source PTS and the sound lands late by its trim offset).

## 2026-07-29 (session 136) — Inferring Fega's folders from open Explorer windows
**Correction:** I told Fega his sound-effects library was `F:\Youtube\Sound FX\Effects` and built a whole recommendation (with measured file counts and sizes) on it. It's a dead legacy duplicate. The live one is `V:\AutoSync\Audio\Sound FX\Effects`, and his curated music — the part that mattered most — sits at `V:\AutoSync\Audio\Sound FX\SoundTracks`, which I never looked at at all.
**Why:** I picked the path out of a `Shell.Application` listing of his OPEN EXPLORER WINDOWS while verifying "Show in folder", then treated it as authoritative because the folder existed and contained plausible files. An open window is evidence someone looked at a folder once — not evidence it's the one in use. Measuring it precisely (133 files, 0.08 GB) made a guess *look* like a finding.
**Rule:** paths that drive a recommendation come from a setting, a config file, or Fega — never from ambient signals (open windows, recent files, a folder that merely exists). If no such source exists, ASK before measuring; a confidently-quoted number against the wrong folder is worse than an open question. Same failure family as the session-133 wrong-range sampling: verify what the target IS before characterising it.
**Also self-caught this session:** `getComputedStyle` returns pre-transition values while the Electron window is backgrounded — a hover-revealed element read `opacity: 0` for seconds after its inline style was correctly `1`, and I nearly debugged working code. A `Page.captureScreenshot` forces a paint and the next probe is truthful. Routed to memory [[project_cdp_verification_gotchas]] (gotchas 24-25, with the React-fiber trick for reading Zustand store state without exposing it on `window`).

## 2026-07-29 (session 137) — Two self-caught cleanups run on autopilot
**No user corrections this session,** but two destructive actions were taken without checking whether the state was still mine to overwrite. Same root cause both times: a step that was correct earlier in the session was repeated later, after the world had changed underneath it.

- **Restored a backup over Fega's live scan.** All session I had been backing up `.clipflow/assets/assets.json` before a test run and restoring it after — correct, because the dev app and the real library share one index. Then Fega installed alpha.29, added his audio folder and scanned 760 tracks into that same file. My next cleanup restored the 2-entry backup on top of it, costing him the scan (~80s re-read) and any favorites set in between. **Rule:** a backup's validity expires the moment the user touches the thing it shadows. Before restoring, re-read the file and confirm it still matches what the backup was taken against — if it has grown or changed shape, the user owns it now, and the right move is to leave it and say so.
- **Re-committed the `asar extract-file` mistake that already has a memory note.** [[project_package_json_strip]] says plainly: never run `asar extract-file` with the repo as CWD, grep the asar instead. I ran `npx asar extract-file … package.json` from the repo root to check a version, and it wrote the stripped packaged copy over the real one — `scripts`, `devDependencies` and the whole `build` config gone. Caught only because the harness surfaced the file as modified. Recovered with `git checkout -- package.json` + re-applying the version bump; the installer was unaffected (built before the corruption). **Rule:** when a memory names a command as forbidden, the substitute it names is not optional. To read anything out of an asar, `npx asar list` or grep the archive — never extract.

**Also worth keeping:** the fix Fega asked for ("preview is too loud") was not a tuning problem — `togglePlay` never set `volume` at all, so previews ran at 1.0 while placed music sat at 0.4. Reading the code first turned "lower it a bit" into "it was never set", which is a different and better fix. Same shape as the #188 root cause last session: the reported symptom named a value, the bug was a missing assignment.

## 2026-07-29 (session 138) — The same backslash ate two commands
**No user corrections yet this session.** One self-caught mistake, made twice inside ten minutes.

- **Backslash escaping through bash → JS string silently produced garbage Windows paths, twice.** Verifying the new Audio-panel refresh button meant writing a folder path into the dev profile via CDP. I wrote `'C:\\Users\\...'` inside a bash double-quoted argument; bash collapsed one level and the JS string literal collapsed the rest, so the store received `C:UsersIAMABS~1AppData...` with every separator gone. The symptom was indistinguishable from a real bug — the refresh button reported "Nothing new" for a file that was definitely on disk, and I nearly went looking for the fault in `listAssets`. The second instance was worse: the same pattern in the `REAL` constant I was using to *restore* Fega's setting wrote `V:AutoSyncAudio`, which emptied the dev library (761 → 0 tracks) until I noticed `finalCount: 0` in my own output.
  **Why it kept happening:** I predicted the collapse depth by counting backslashes in my head instead of reading back what actually landed. The first occurrence was caught only because I printed `testDirWritten`; the second because I printed `restoredTo`. Neither was caught by reasoning.
  **Rule:** never hand-escape Windows path separators through a shell → JS boundary. Use forward slashes (`path.resolve` normalizes them) or build the separator with `String.fromCharCode(92)`, which no escaping layer can touch. And when a CDP call writes a path into a setting, **echo the value back and assert on it** — ideally with `charCodeAt` — before drawing any conclusion from the app's behaviour. This is the same family as session 130's `\1` eating path separators in a JS string, and the trace-verify lesson that a seeded fixture must be proven loaded *through the app's own API* before the UI is allowed to mean anything.
  **Second-order rule:** a restore path deserves more care than a test path, not less. When mutating a real user setting to test something, capture the original by *reading it* and write that captured value back verbatim — never retype it as a literal.

**Session-138 close-out — verification that passes and a user who still hits problems.** Every one of the eight features was asserted over CDP (values persisted, positions seeked, counts matched) and Fega still reported issues on the installed build within minutes. The gap is not "I didn't verify" — it's *what* is verifiable by assertion. Volume persisting, a seek landing at 1:47, 274 tracks tagged: all provable. Row density, whether `100 Thieves Hype Tracks` → *Euphoric* is a sensible reading, how a cold folder feels while waveforms trickle in, a scrubber that flashes on a 0.2s one-shot: none provable, all noticed in five seconds of real use. **Rule:** when a change is aesthetic or feel-driven, a green CDP run licenses "the mechanism works", never "this is good". Say which of the two I've established, and name the parts I couldn't assert as the likely complaint sites — in the handoff and to Fega — instead of presenting a uniform wall of ticks. The mock got approval for the *layout*; it could not approve the density of a real 761-track list.

**Session 139 — the bugs that a green CDP run could have caught, and didn't.** Session 138 asserted all eight Audio-panel features over CDP and passed; Fega then hit three bugs in minutes. Unlike the s138 close-out's aesthetic gap, **all three were assertable** — the verification simply never performed the shapes that expose them. (a) The waveform ratchet needed the pointer to enter a row *twice*; every check hovered once, and one pass is stable. (b) "Remember X%" needed a placement **read back off a clip saved in an earlier session**; the check placed a sound and used it immediately, so its `assetId` was always fresh and never dangling — the exact reference class that breaks was the one class never tested. (c) The row action buttons were off-screen the whole time, and nothing ever asked *where* an element was, only that it existed.
  **Why:** the checks proved "the mechanism works on data I just created, once." Real use is a loop over data that outlived a restart.
  **Rule:** for any interactive change, verify with (1) the gesture **repeated** — hover/toggle/open-close 5+ times and assert the measurement is *unchanged*, not merely present; (2) data **loaded from disk that a previous session wrote**, never only records created seconds ago in the same run; (3) **position asserted, not just existence** — `getBoundingClientRect().right <= container.right` for anything that can be pushed out of view. An element that exists off-screen passes every `querySelector` test ever written.

**Session 139 — a scan-time id is not an identity.** `generateAssetId()` mints `asset_${Date.now()}_${rand}` at absorb time, so every rebuild of `assets.json` re-mints all 761 ids while the file paths stay put — and `assetId` copied onto a clip's placement then points at nothing. `backfillLastUsed` already knew this and matched path-first; `setAssetDefaultVolume` and `markAssetUsed` didn't, so one silently returned null and the other threw "Asset not found" at Fega on every attempt.
  **Rule:** when a reference is written into a *document the user keeps* (a clip, a project, a queue entry), it must be keyed on something derived from the referent (a path, a content hash) — not a value generated by the scan that happened to be running that day. If the id is already random and already stored, resolve **path first, id second** at every read site, and keep the fallback list in ONE resolver so the next call site inherits it. Grep every `.find(a => a.id === ...)` when a stale-reference bug appears; the one you fixed is rarely the only one.

**Session 139 — measure-then-set-width is a ratchet inside a content-sized box.** `drawPeaks` sets `canvas.style.width` from `wrap.clientWidth`, which is correct in a container whose width is imposed from outside — and a feedback loop inside Radix's ScrollArea, whose viewport wraps children in `min-width:100%; display:table`. A table box is sized by its CONTENT, so the painted px width became a floor on the row width; the ~130px of buttons only the hovered row renders widened the shared box, every other row measured wider, repainted wider, and widened it again (~138px per hover pass, unbounded).
  **Rule:** any element whose pixel size is written by JS from a measurement must be `position: absolute` inside a `relative` parent (out of flow, so it cannot feed its own measurement) — the Scrubber in the same file already did this, and the row waveform copying it was the whole fix. And in a Radix ScrollArea, if rows must be clamped to the panel rather than sized by content, flip that injected wrapper with `[&_[data-radix-scroll-area-viewport]>div]:!block` on that ScrollArea only.

**Session 139 — an assertion inside a question is still an assertion.** Offering Fega button treatments, I wrote "nothing else in the app uses a gradient fill on a button" into an option description. `PrimaryButton` — the exact component that button used to BE — is `linear-gradient(135deg, T.accent, T.accentLight)`. He picked flat partly on the strength of a false claim, and I only caught it afterwards while reading `shared.js` for the sizing.
  **Rule:** the no-narration-from-memory rule ([[feedback_no_code_narration]]) covers option text, plan bullets and question framing, not just answers — anywhere a claim can steer a decision. Before writing "nothing else does X" / "this is the only Y", grep for X. One-line cost, and it's the kind of claim the user cannot check.

**Session 140 — `textContent` lies about a field that is being edited.** Verifying the new subtitle action row over CDP, I read a row as `"what takes"` when the source said `"what it takes"`, and reported to Fega that a word had been deleted. Nothing had been deleted: clicking a word opens `InlineWordEditor`, so that word is an `<input>` at that moment, and `textContent` never includes an input's *value*. I then "restored" it with four Ctrl+Z presses that were all no-ops against an empty undo stack — which should itself have been the tell that nothing had changed.
  **Why:** I treated a DOM projection as the state, and the projection is lossy exactly where the UI is interactive. The disk was intact the entire time and said so on the first check.
  **Rule:** when a DOM read disagrees with the source of truth, suspect the read before announcing data loss — check for `input`/`textarea`/`contenteditable` inside the node and read `.value`, and confirm against the file on disk *before* saying anything to Fega. A no-op undo is evidence there was nothing to undo, not evidence that undo is broken.

**Session 140 — a synthetic `.click()` has not rendered when the next line runs.** Two CDP checks reported the action row as absent (`btn undefined`, then `rowsShowingActions: []` on all six passes) because the click and the assertion sat in the same synchronous block; React had not flushed. The first one threw mid-script and left the app in a half-driven state that fed straight into the false data-loss reading above.
  **Rule:** every CDP verification that drives React must `await` a tick between the gesture and the measurement (`await new Promise(r => setTimeout(r, 300))`), and loop bodies must await per iteration — a whole loop in one tick measures the pre-gesture DOM every pass and reports a confident, uniform, wrong result. Pair with the s139 rule: repeat the gesture, and assert position, not existence.

## Session 141 — editor keyboard layer (#220)

- **rAF is dead in an occluded Electron window.** The rewind loop measured as
  completely broken for three probe rounds — frozen playhead, zero frames
  scheduled, no errors — while `document.visibilityState` was `"hidden"`. What
  made it convincing was the asymmetry: video playback, seeks, store writes and
  DOM updates all kept working, so only the new code looked broken. Rule: before
  any CDP verification of an animation/rAF feature, `Page.bringToFront` and
  confirm rAF actually ticks; if a brand-new feature is the *only* thing that
  looks dead, suspect the harness before the code.
- **`CLIPFLOW_PROFILE=dev` does not sandbox project data.** Dev and prod share
  `projectsRoot`, so a destructive test wrote a real 27.3s clip down to 5s.
  Rule: check `projectsRoot` on both profiles and record the pre-state before any
  destructive verification; restore via the app's own undo + Save and confirm on
  disk.
- **Assert on the thing, not on a proxy for it.** Two probes reported false
  results because the selector was wrong, not the feature — a "subtitle row"
  count that was really the timeline's two timecode readouts, and a split test
  asserting on video-section count when the split had (correctly) hit a subtitle.
  Rule: before concluding from a DOM count, print what it actually matched.

## 2026-07-31 (session 141) — Session name: had the style, dropped the anchors

- **What went wrong:** Suggested "Editor keyboard layer + Add Game crash" at wrap. Plain wording
  was right, but the session number and the shipped alpha version were both missing — the two
  anchors that make a name *findable*.
- **Why:** I recalled the s115 "plain, not clever" correction and stopped there, never re-reading
  the memory that also carries the s133/s127 refinement adding the anchors and the exact format.
  Half-remembering a multi-part convention is the same failure as narrating code from memory.
- **Rule:** Session names are `S<N> · alpha.<X> — <plain summary>` (no date); `S<N> · <summary>`
  when no installer was cut. Re-read `feedback_session_name` at wrap rather than recalling it —
  it has been corrected three times, so memory of it is reliably stale.

## Session 142 (2026-07-31) — split-gap fix + status ladder verification

- **Read the shortcut registry BEFORE dispatching destructive keys.** I sent `S`
  believing it was "split" (it's "End to playhead" — a trim; split is `U`) and
  cut a real 14.7s clip to 0.6s. The registry line was one grep away
  (`shortcuts/registry.js`), and session 141's lessons had already warned about
  S. Rule: before ANY synthetic keypress in the editor, grep `registry.js` for
  the binding and read its `hint`.
- **The editor autosaves ~800ms after every edit — there is no "memory-only"
  editing session.** I killed the app assuming unsaved edits would vanish; the
  next launch showed them persisted (dev shares projectsRoot → real JSON).
  Rule: treat every CDP editor edit as already-on-disk, capture the pre-test
  `nleSegments` values FIRST (they are the restore recipe), and prefer a
  sacrificial duplicate clip when one can be created.
- **A probe's own assumptions are part of the trace.** Clicking a section canvas
  SEEKS to the click point (select+seek in one gesture), so my cuts landed at
  ~9.9s, my 0–6s sampler never crossed them, and I built a whole false "stale
  playback store" theory on top. The debug tap showed both stores in perfect
  sync. Rule: when a probe contradicts code you just wrote, re-derive the
  probe's own coordinates (where IS the cut?) before theorizing about the code.
- **`--disable-features=CalculateNativeWinOcclusion` beats window-fronting for
  rAF-dependent CDP verification.** user32 ShowWindow/SetForegroundWindow did
  NOT flip `visibilityState` back to visible; relaunching Electron with the
  occlusion feature disabled (+ `--disable-renderer-backgrounding
  --disable-background-timer-throttling`) made rAF fire regardless of
  occlusion. Use it for any dev-profile verification run that needs the
  playback/animation loops alive.
- **Fega's standing rule (2026-07-31): every in-app test runs on a REJECTED
  clip, never an approved one.** Approved clips are real work product; rejected
  clips are the sacrificial pool. Check `status` before opening a clip for any
  verification; if no rejected clip exists, borrow one from another project or
  ask — never fall back to approved.

## Session 145 (2026-08-03) — Session-name formula ignored AGAIN (2nd offense)

**What went wrong:** Suggested "Detection science: measured, specced, routed to Wick" as the session name — free-form, no S-number anchor. The formula ("S<N> · alpha.<X> — <summary>"; no installer: "S<N> · <summary>") is recorded in memory feedback_session_name WITH an s143 reinforcement for this exact failure, and was still ignored.

**Why:** The name was composed from the session's content, then emitted without checking it against the template. The memory was recalled (used for "suggest a name at wrap") but only its trigger, not its format constraint.

**Rule:** A name suggestion that does not START with "S<number> ·" is invalid — check the first two characters before emitting. Copy the anchor prefix from HANDOFF's header line verbatim. Offer 2-3 alternatives, all in-template.

**s146 addendum (3rd offense, self-caught at distillation):** "Frames ship + Gemini's first watch" — free-form again, suggested mid-session before the wrap ritual. Memory reinforcement alone has now failed three times; routed to a new step 6 in `.claude/commands/session-end.md` so the template check fires INSIDE the wrap ritual where names are emitted.

**s147 addendum (4th offense):** "Gemini learns whose plays matter (#235 D3)" — free-form again, suggested at the end of an autonomous run (no wrap ritual invoked, so the session-end step never fired). Rule stands: ANY name suggestion, wrap ritual or not, starts with "S<number> · ".

## Session 147 (2026-08-04) — "No way to know why you rejected" is false; version naming collided with Fega's

**What went wrong:** Sessions kept telling Fega "there's no way to know why you rejected clips" / "rejections carry no reasons yet". Fega corrected: rejection feedback has THREE eras — v1 = no reasons existed (pre-chips), v2 = the six reason chips + note CURRENTLY INSTALLED (duplicate, bad cut, not funny, nothing happens, needs context, wrong content), v3 = the four sharper #232 chips (setup talk, chat banter, flat delivery, too similar) built but NOT yet installed. He has been tagging with v2 for months: 109 of 288 total rejections are tagged; the RL few-shot window is 38/50 tagged (76%), EO 20/45, DD 7/9. Repo docs called his v3 "chips v2" (v2-of-the-chip-system), which collided with his numbering and produced nonsense claims like "0 of 50 rows carry v2 chips".

**Why:** Internal shorthand ("chips v2") was named from the code's perspective, not the user's, and "mostly untagged" (true of ALL-history: 140/200 RL rejections predate chips) got flattened into "no reasons exist" (false for the recent windows the prompt actually reads).

**Rule:** Use Fega's era numbering in all chat/docs: v1 = untagged era, v2 = installed six chips, v3 = #232 four new chips (not yet shipped). Never say "no way to know why" — say which era a row belongs to. When claiming data coverage, state the window numbers from the live DB, not the all-history ratio.

## Session 147 (2026-08-04) — Invented game-name expansions instead of reading gamesDb

**What went wrong:** Chat messages expanded the game tags from imagination: "EO" became "Eggy Out" (real: **Egging On**), "DD" became "Devil's Delivery" (real: **Deadline Delivery**), "MC" became "Minecraft" (real: **Meccha Chameleon**). Fega corrected two; the third was caught on checking.

**Why:** The tags looked guessable and the canonical mapping was never loaded, even though it sits in `%APPDATA%\clipflow\clipflow-settings.json` → `gamesDb` (tag + name) — one read away.

**Rule:** Never expand a game tag from memory. Use the bare tag, or read `gamesDb` first. Full mapping as of 2026-08-04: AR=Arc Raiders, RL=Rocket League, Val=Valorant, EO=Egging On, DD=Deadline Delivery, PoP=Prince of Persia, SCoG=Slackers: Carts of Glory, Pico=Pico Park, JC=Just Chatting, MC=Meccha Chameleon.
Marker advanced to 2026-08-05 (s149) — no user corrections this session; the self-caught trade-framing error (crediting gemini for picks both variants find) is recorded in tasks/specs/detection-input-science.md + #235, not lesson-routed.

## Session 150 (2026-08-05) — Sold a cross-feature side effect as a benefit without reading the other feature's spec

**What went wrong:** The #239 fix proposal advertised "any future surface (like the #240 bulk imports) is covered automatically" — imported clips getting taste-calibration rows framed as a plus. Fega had to correct it: the OpusClip-era imports are post-only and must NEVER teach detection. The greenlit spec (`tasks/specs/queue-imports.md`) already said exactly that, in a section literally titled "Fences": "Imports NEVER enter taste calibration... enforce it explicitly."

**Why:** The implication was reasoned from the choke-point design's mechanics, not from #240's intent — and the spec that recorded that intent was sitting in the repo, one read away, referenced by the very commit at HEAD.

**Rule:** Before claiming a change will "automatically cover/benefit" another feature, read that feature's spec or issue first — greenlit specs may fence exactly that interaction. A side effect on someone else's feature is a claim about THEIR requirements, not your mechanism.

Marker advanced to 2026-08-05 (s154) — no user corrections this session; the four CDP harness traps found (stale localProjects fallback masking fixtures, collapsed Settings group unmounts the Games grid, Select trigger is a button inside the root div, queue row re-click collapses it) were routed to memory project_cdp_verification_gotchas (traps 34-37), not lesson-routed.

## Session 156 (2026-08-06) — Program jargon leaked into the sign-off ask ("what are the cell results, I'm confused")

The wrap summary asked Fega to "sign off (or veto) the gc245 cell" and led with a recall/rej-hit table. The detailed findings were translated to plain language, but the DECISION REQUEST itself still ran on detection-program shorthand — "cell", "sign-off", metric names — and Fega had to ask what a cell even was before he could answer. The s57/s58 jargon-free rule was applied to verification steps but not to the ask.

Rule: any sentence that requests a decision from Fega must survive the "app-user words only" test on its own — name the thing plainly ("the safety test I run before shipping a detection change"), say what yes/no means in consequences ("okay to include in the next installer?"), and keep program vocabulary (cell/ablation/recall/baseline) inside the linked issue, not the chat ask.

## Session 161 (2026-08-11) — Session-name structure never captured; Fega has to re-teach it "almost every new session"

**What went wrong:** At wrap, the suggested session name was "#248 feedback pill — design lock" — free-form, not his format. Fega called it out: he has reminded me about naming repeatedly, and the memory that was supposed to prevent this (`feedback_session_name`) only said "proactively suggest a session name," never the actual structure, so every session reinvented one.

**Why:** The original correction was saved as a behavior ("suggest a name") without capturing the SPEC of what he wants. A memory that stores the trigger but not the format guarantees the same correction recurs. The structure was discoverable the whole time — his session list is full of examples (`S150 · #239 feedback leak fixed — every approval teaches now`).

**Rule:** Session names use his exact structure: `S<n> · <outcome headline>` (spaced middle dot; outcome-phrased like a changelog headline; lead with `alpha.NN —` when an installer was cut; include the issue #). More generally: when saving a correction about a recurring artifact (names, titles, messages, file layouts), the memory must contain the *format specification with examples*, not just "do the thing" — if the memory doesn't let a cold session reproduce the artifact exactly, it isn't captured yet.

Marker advanced to 2026-08-12 (s162) — no user corrections this session; the two self-caught build findings (Sentry ScopeToMain clears renderer breadcrumbs; feedback events drop breadcrumbs server-side) are recorded in code comments, tasks/todo.md and HANDOFF.md, not lesson-routed.

## Session 164 (2026-08-12) — "Nothing is running" claimed while a 15-hour background poll was still alive

**What went wrong:** Asked "what is running and why", the answer checked OS processes (tasklist, netstat) and declared everything finished — while the harness's own Background tasks panel showed a Bash poll from the previous day still running (the round-3 Sentry wait, whose condition could never come true because round-3 landed as a different issue id than the one being watched). Fega had to screenshot the panel to correct it.

**Why:** Two waits were armed during #248 verification; one was superseded by a rewritten script and mentally filed as "replaced", but only its sibling was ever TaskStop-ped. The "what is running" check then looked at the OS layer only — harness background tasks are not separate visible processes, so tasklist can never disprove one.

**Rule:** Any claim about background/running state must check BOTH layers: OS processes AND the harness task registry (TaskList / the Background tasks panel). And an until-loop watcher must watch a condition that is guaranteed reachable (watch the QUERY that finds new items, not one hardcoded id) — plus every armed watcher gets explicitly stopped or confirmed-finished at session wrap, as part of the wrap checklist.

Marker advanced to 2026-08-12 (s163+s164 pass) — s163 had no user corrections; its three CDP harness traps (per-profile safeStorage seeding, hidden-pane text matches, collapsed Settings groups unmount cards) went to memory project_cdp_verification_gotchas (traps 38-40). The s164 lesson ("nothing is running" claimed while a harness poll was alive) was routed to clipflow-code-review as a wrap-checklist rule: check OS + harness task registry, watch reachable conditions, stop every armed watcher at wrap.

## Session 166 — Write-overwrote a 3,724-line file after reading 40 lines (self-caught)

**What happened:** Session-start ritual reads `head -40 tasks/todo.md`. Later I
"replaced" the file with the new session plan via a full-file Write — deleting
3,700 lines of session archive (plans/verification records back to session 120)
that lived below the head. Caught it post-push only because the commit diffstat
showed 3,668 deletions; restored from git history and amended.

**Why:** The file's own header says it "holds only the active session's working
plan" — I trusted the header over the actual file size. head -40 told me what
the file STARTS with, not what it IS.

**Rule:** Before ANY full-file Write to a file I didn't create this session:
`wc -l` it first. If it's bigger than what I've read, read the rest or Edit the
specific section instead. A commit diffstat with deletions I can't name = stop
and `git show --stat` before pushing. (Global CLAUDE.md §7 already warned:
"never assume a single read captured the complete file.")

## Session 167 — Vivid status colors shipped against a flattering mock, real library was 90% red

**What went wrong:** The glass-orb redesign made every status color more
saturated, including rejected-red, and the mockups + CDP verification all used
balanced clip mixes (4-5 red of 18). Fega installed alpha.49 and his actual
library — old wrapped projects keeping 2-5 of 15-20 clips — rendered as a wall
of vivid glowing red. "Big yikes... doesn't make it look like ClipFlow actually
works." The concern had even been filed pre-ship (#254) but as a "later"
question instead of a pre-ship check.

**Why:** Vibrancy amplifies whatever the data distribution says. I designed and
verified against invented mock data with a flattering status mix, never against
the real distribution — which for ClipFlow is rejection-heavy BY DESIGN
(never-empty detection, Fega is the precision filter). The dev-profile CDP pass
checked behavior (tooltip shows/clears), not gestalt (what does a screenful of
real cards FEEL like).

**Rule:** Before shipping any change that recolors/amplifies a status
indicator, sample the REAL data distribution first (prod DB counts per status)
and put the worst-case card in the mock — the one where the "bad" status
dominates. If the worst case looks like product failure, the design isn't done.
A status color that's honest per-item can still lie at volume.

## Session 173 — Migration condition modeled the target store from memory, not from a real one (#262)

**What went wrong:** The #262 heal migration required gamesDb to be EXACTLY the
seven legacy seed games. Shipped in alpha.57, it never fired on the laptop —
the actual target — because every install's first boot appends the built-in
"Just Chatting" content-type entry to the same gamesDb array, making it 8
entries. My offline test verified the condition against a synthetic 7-entry
store I invented, and my fresh-profile boot even SHOWED me JC being seeded into
gamesDb — I confirmed it was harmless but never connected it to the length===7
assumption.

**Why:** I proved the condition against three stores (prod, dev, synthetic
laptop) but the synthetic one was built from the OLD DEFAULTS as written in
code, not from what a first boot actually persists. The one store shape that
mattered — "old defaults + one boot of file-migration" — existed nowhere in my
test set, even though my own fresh-boot test had just demonstrated the JC
append.

**Rule:** A migration that fingerprints a store must be tested against a store
PRODUCED BY THE REAL BOOT SEQUENCE it targets, not against a hand-built
replica of the defaults. Cheapest honest test: boot the OLD code on a blank
profile, then run the NEW code on the result. And when a verification run
surfaces an unexplained entry (JC appearing in a "fresh" store), reconcile it
against every exact-match condition in the diff before shipping.

## Session 175 (2026-08-19) — Explorer restart is not the fix for Windows app-identity mixups

**What went wrong:** After the Corva rename, the installed app's taskbar showed the Electron atom icon + name "Electron". First fix attempt (restart Explorer to clear the icon cache) failed — Fega: "nope, not fixed." Root cause was structural, not cache: dev boot-verifies run node_modules electron.exe claiming the production AppUserModelID (`com.clipflow.app`), and NO shortcut on the system carried that AUMID property (electron-builder's NSIS shortcut doesn't stamp it), so Windows resolved identity by fallback heuristics.

**Why it happened:** I treated the symptom as stale cache because that's the common story, without first checking whether the identity had an authoritative source (a shortcut carrying the AUMID) at all. A cache refresh can only help when the correct mapping exists somewhere.

**Rule:** For Windows taskbar identity/icon bugs, check the authority chain BEFORE clearing caches: (1) does any Start Menu .lnk carry the window's AppUserModelID (read the .lnk bytes for the AUMID string)? (2) does the exe's VersionInfo say the right ProductName? Only when both are correct is cache-clearing the fix. Deterministic repair = stamp `System.AppUserModel.ID` onto a shortcut (scratchpad stamp-aumid.ps1 pattern, per-user Start Menu needs no elevation). Prevention = never let source runs claim the packaged AUMID (#269: guard `setAppUserModelId` with `app.isPackaged`).

## Session 177 — Mocked a redesign without reading the component (2026-08-20)

**What went wrong:** The #271 wizard mock v1 replaced the modal's video with a bare "Listen" strip. Fega's feedback ("right now I see only like an audio track but it should be a video shown") flagged the gap — the real modal ALREADY plays a muted video next to each track sample (AudioCalibrationModal.js:139). The mock was built from an explore agent's report, which answered the questions I asked (labels, persistence, progress dots) but never described the full layout.

**Why it happened:** Agent reports are scoped to the questions asked; a redesign mock needs the component's complete current anatomy, not just the parts under discussion. I mocked a UI I hadn't read.

**Rule:** Before mocking a redesign of an EXISTING component, read the component file yourself end-to-end — agents answer questions, they don't inventory layouts. The mock must start from everything the current UI shows, then change it.

## Session 178 (2026-08-20) — A spread-trail proves nothing past a whitelist site (#270)

**What went wrong:** Before building per-word styles I traced the whole word pipeline (`mergeWordTokens`, `validateWords`, `cleanWordTimestamps`, `visibleWords`, split/merge) and confirmed every hop spreads `{...w}` — so I declared styles would survive save→reopen. They didn't: `resolveSubtitles.js` `primaryRaw` rebuilds each word with an explicit whitelist ({word,start,end,probability}) and stripped `style` on every clip open. Worse, the first buggy reopen AUTOSAVED the stripped words back to disk, destroying the saved style — only the E2E reopen test caught it.

**Why it happened:** I grepped for spreads and found them, which reads as proof. A whitelist rebuild doesn't match a `\.\.\.w` search — absence of evidence in the positive search pattern.

**Rule:** A field-survival claim must enumerate every site that REBUILDS the object (whitelist maps, normalizers, `{word: w.word, ...}` literals), not just the sites that spread it — grep the object's property names as literals (`word:`, `start:`) to find rebuilders. And persistence E2E must always run the full save→close→reopen loop; first-save proof is not persistence proof, especially when autosave can propagate a stripped copy back to disk.

## Session 179 (2026-08-20) — "Fits on the reporter's screen" is not "fits" (#279)

**What went wrong:** Fega asked for the Tracker's week log to be visible without scrolling. I compacted the top blocks, verified zero-scroll at HIS window size (1575×1368, measured from his screenshot), and shipped. My proof screenshot was taken at the dev window's default 1280×860 — where the log was still cut off — and Fega pointed at that screenshot: "I don't want that to be the case." Round 2 needed a structural change (banner folded into the cards row, header rows merged, legend into the log header), not more padding trims.

**Why it happened:** I anchored the acceptance test to the one viewport I had evidence for and treated "fits there" as done. A layout requirement phrased as "X must be visible without scrolling" is a requirement about the SMALLEST reasonable window, not the reporter's current one — and my own proof screenshot contradicted the claim, which I didn't notice because I was checking the numbers, not looking at the picture.

**Rule:** For any "must fit without scrolling / without cutting off" ask, verify at BOTH the reporter's size AND the app's default/small window (1280×860 here), and look at the proof screenshot as the user would before sending it — if the screenshot itself shows the defect, the fix isn't done. When padding trims can't close the gap, the answer is removing a ROW (merge blocks side-by-side, fold a legend into a header), not shaving every margin by 2px.

## Session 179 (2026-08-20) — A verification probe can lie for an hour: innerText is the RENDERED text

**What went wrong:** After moving the Tracker's Switch-game button, every CDP probe said the game picker no longer opened — synthetic click, trusted Input.dispatchMouseEvent, React-props instrumentation all "confirmed" it. Forty minutes of diagnosis later, the fiber showed the popover mounted at a perfect position. The probe checked `innerText.includes('What are you playing')` — but the heading has `textTransform: uppercase`, and `innerText` returns the TRANSFORMED text ("WHAT ARE YOU PLAYING"). Same class earlier in the session: `innerText` inserts newlines between inline children, so `/6 posted this week/` failed against "6\nposted this week".

**Why it happened:** I trusted the probe's negative without first validating the probe on a known-positive state. Each follow-up probe also toggled the button (open→closed→open), so observations were taken in alternating states, which made the "evidence" look consistent with a real bug.

**Rule:** Before diagnosing the app from a failing probe, prove the probe can detect the positive case (or read state from the React fiber / element refs, not text). Match text case-insensitively and whitespace-tolerantly (`/what are you playing/i`, `\s+`), never exact strings against `innerText`. For toggle controls, reset to a known state before each probe — one click per probe flips parity. If two different mechanisms "fail" identically, suspect the ASSERTION before the mechanism.

## Session 183 (2026-08-22) — Where a new control GOES is Fega's call, not a detail I settle in passing (#291)

**What went wrong:** Fega reported the queue's YouTube card had nowhere to add tags. My plan placed the Tags row between Privacy and Description, justified to myself as "matches the order in his screenshot". He came back with two corrections in one line: put it UNDER the description, and add a copy button in both tag editors. Both were cheap to build and neither was in the plan.

**Why it happened:** I treated placement as an implementation detail because the feature itself was approved-in-spirit, and I treated "copy" as out of scope because he hadn't asked for it. But placement inside an existing card is a taste decision on a screen he uses daily, and the plan is the cheap moment to settle it — after the build it costs a round trip.

**Rule:** When adding an element to an EXISTING screen, the plan must name the exact position AND offer the alternative in one line ("under the description, or between Privacy and Description — say which"). Don't bury the placement in prose as though it were settled. Same for adjacent affordances the surrounding UI already has (the description had Copy, so tags should have been proposed with one): if a sibling element has an action, propose the new element with it rather than waiting to be asked.

## Session 185 (2026-08-22) — An approved plan named a keystroke the key layer cannot produce (#296)

**What went wrong:** The #296 plan, written and approved last session, specified `shift+d` for
the lane toggle. I built it, and in testing Shift+D fired the ELEMENT toggle instead. `eventToKey()`
(shortcuts/registry.js) deliberately drops Shift when it is the only modifier on a printable
character — that is what makes `?` work as a binding — so `shift+d` canonicalises to plain `d`
and can never match. The binding was unreachable by construction. Switched to `alt+d`.

**Why it happened:** The plan's own findings section had READ registry.js (it correctly noted `m`
was taken by Trim-start and that `d`/`shift+d` were "unbound"). "Unbound" was checked against the
SHORTCUTS list; nobody checked the key against the canonicaliser that has to produce it. A key
being free is a different question from a key being expressible.

**Rule:** Before a keystroke enters a plan or the registry, run it through `eventToKey()`'s rules
in your head: Shift is only recorded alongside Ctrl/Alt or on a non-printable key (`shift+delete`
is fine, `shift+d` is not). For a modified letter, use `alt+` or `ctrl+`. Same class of check as
any other "the mechanism must be able to produce this" — free ≠ reachable.

**Also this session (rule already existed, and it fired correctly):** `enabled` was silently
dropped on clip reopen because `resolveClipSubtitles` REBUILDS every segment field-by-field
(`{start, end, text, words}`) at four separate hops. The s178 rule ("enumerate every site that
REBUILDS the object, and E2E the full save->close->reopen loop") is exactly what caught it —
the save->reload->reopen test showed the flag gone. Keep running that loop for any new
per-object field.

## Session 193 (2026-08-24) — A commit's side claim shipped unexercised, third review in a row (batch 3 review)

**What happened:** Batch 3's commit said "dropped `.mkv` files are accepted on the drag-and-drop
path too." The renderer's drop gate and all its UI copy were widened — but every dropped file
passes through the `import:externalFile` IPC handler, which still refused anything but `.mp4`.
Dropping an MKV showed "Import failed: Only .mp4 files are supported" directly under UI saying
MKV is fine. The claim was never true end-to-end; the live verification list covered the
watcher path, not the drop.

**Why it happened:** The side claim rode along with the verified main fix. A renderer gate is
only half a path — nobody traced the gesture through the main-process handler it invokes. This
is the third consecutive batch review (s188, s190, s193) to catch a gap of this class: something
stated as working that no verification step ever touched.

**Rule:** Every claim in the commit message and changelog — especially side claims ("X works
too", "also handled") — must map to a verification step actually performed. For any renderer
gate/UI-copy change advertising new input, trace the gesture through the IPC handler it calls
before claiming it works. Not a Fega correction — caught in review before it reached him.

## Session 194 (2026-08-25) — Renaming a mechanism is not hiding it (#74)

**What happened:** #74 asked to hide the pipeline internals behind branded copy, and the issue
itself supplied a placeholder table — one branded label per internal label. I expanded and
sharpened that table, offered two voices, and presented it for approval. Fega rejected both:
"the playful lines still read too closely to what is being done. There doesn't also need to be
a 1 for 1 line for what is going on in the backend."

**Why it happened:** I treated the leak as a *vocabulary* problem when it was a *structure*
problem. Ten rows that light up in sequence still publish the stage count, the stage order and
where each boundary falls, no matter what the rows are called — "Feeling the room" sitting in
slot five between transcription and frame extraction tells a competitor as much as
"Audio Energy Analysis" does. The issue's own placeholder table framed it as a relabel and I
inherited that frame instead of questioning it. The right shape was to break the mapping: 3-5
lines drawn per run from a pool of 50, rotating on real progress, so nothing on screen
corresponds to anything in the backend.

**Rule:** When the task is to hide a mechanism, ask whether the *shape* of the UI still mirrors
the mechanism — count, order, timing, boundaries — not just whether the words do. Renaming
leaks structure; a per-item relabel is the tell. If a design has one visible element per
internal step, the mapping is the leak, and no wording fixes it.

**Also this session (same issue, second correction):** I proposed gating the technical labels
behind the existing `devMode` toggle, because the issue suggested it and the 7-click unlock
already existed. Fega: "That 'dev mode' was for me when I was still learning and setting up the
app." The toggle being *available* is not a reason to make it the permanent home for internals.
**Rule:** before extending an existing flag, establish what it is *for* and whether it is still
load-bearing — a leftover from an earlier phase should be left to die, not built on. Dropping
it also made the change smaller: with nothing to re-expose, `ai-pipeline.js` needed no edits at
all, because the renderer simply stopped rendering `detail`.

## Session 194 (2026-08-25) — A failed encode truncated a source file to zero bytes

**What happened:** A patch script did `io.open(path, "w", encoding="utf-8").write(s)`. The
string held an unpaired surrogate (from a `"🎬"` escape I had retyped), so `write`
raised `UnicodeEncodeError` — but `open(..., "w")` had already truncated the file. `UploadView.js`
went to **0 bytes**, 1865 lines gone. Recovered with `git checkout --` only because the file's
last commit was clean; had the file held uncommitted work it would have been lost outright.

**Why it happened:** Text-mode `open` truncates at open time and encodes at write time, so any
encode error lands *after* the destruction. Every earlier failure in the same script had been an
assertion — which fires before the write and is therefore harmless — and I had generalised
"asserts protect me" into "the script is safe to re-run".

**Rule:** Never write a source file through text-mode `open` in a patch script. Encode first,
sanity-check the length, then write bytes:
`blob = s.encode("utf-8"); assert len(blob) > orig_len * 0.5; open(p, "wb").write(blob)`.
Keep the asserts, but treat them as protecting *correctness*, not the file — only encode-then-
write protects the file.

**Related, same root cause (extends the s187 backslash rule):** literal `\uXXXX` escapes that
already exist in a source file cannot be retyped through a Bash heredoc — the tool eats one
backslash, Python then decodes the escape into a real (sometimes unpaired-surrogate) character,
and the anchor no longer matches the file. Don't retype them: slice the existing region out of
the file and splice it back verbatim (`header = old_card[hs:he]`), or build the backslash with
`chr(92)`. For anything longer than a few lines, write the patch script to a file with the Write
tool and run it — large heredocs also fail outright on quote balancing.

## Session 202 — a caveat in the wrap-up is user-facing copy too

Reported #310 done with the honest caveat "jest is not installed in this repo, so the tests
can't run — I ran them through a shim instead." Fega: "what is jest? and why do we need it
installed?" Every noun in that sentence was a tool name he has no reason to know.

**Why it happened:** the jargon-free rule was filed in my head under *verification steps* and
*decision requests* — the parts addressed TO him. A caveat felt like a disclosure about my own
work, so it got written in my own vocabulary.

**Rule:** anything that reaches chat is user-facing, caveats and limitations included. Name the
tool in plain terms on first mention ("jest is a test runner — a program that executes the
project's automated checks and prints pass/fail"), say what it costs him (nothing: dev-only,
never in the installer), and say what's lost without it. Don't drop a bare tool name and move on.

## Session 199 — folder names are internal lingo, not UI labels

Media panel mock surfaced watched-folder names ("Cutouts", "vids to gifs") as group headers.
Fega: "'Cutouts' should be called Images. No need for extra lingo." Copied AudioPanel's
folder-grouping without asking whether folder names mean anything to the user.
Rule: user-facing grouping is by content category (Images/GIFs/Videos); source folder names
live only in Settings. Same principle as "hide the mechanism, not the labels."
