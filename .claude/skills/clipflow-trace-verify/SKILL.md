---
name: clipflow-trace-verify
description: Use BEFORE describing, tracing, explaining, or diagnosing how any existing ClipFlow code behaves. Triggers on "how does X work", "trace the wire/flow", "why is this bug happening", "what does this function/component do", "where does X get set", or before proposing any fix that depends on understanding existing code. This skill prevents confidently narrating code that is wrong or dead.
---

# ClipFlow Trace & Verify — Don't Narrate Code You Haven't Proven

This exists because of a real failure: I traced the #103 audio-trim "wire," wrote a confident, fully-cited plan to fix `commitAudioResize` — a function with **zero callers (dead code)** — while the live path (`TimelinePanelNew.js` per-segment `WaveformTrack` + `trimNleSegmentLeft/Right`) already did what the user wanted. Only the user's own domain knowledge caught it. A `file:line` citation proves code **exists**, NOT that it **runs**.

Run this BEFORE making any claim about how existing code behaves. No exceptions. "Read first" is not enough — I can read the wrong (dead) code and still ship fiction.

## The Three Checks (run them — don't aspire to them)

### 1. Grep callers BEFORE building any claim or plan on a function
- [ ] For every function/handler my explanation depends on, `Grep` for its callers across the codebase.
- [ ] **Zero callers = dead code = it does NOT run = STOP. Do not reason on it.** Say so out loud: "X has no callers, it's dead — the live path must be elsewhere."
- [ ] This single grep would have killed the wrong #103 plan in five seconds.

### 2. Trace TOP-DOWN from the mount point, never bottom-up from a plausible handler
- [ ] Start from what the editor actually mounts/renders (e.g. `EditorLayout` → `TimelinePanelNew` → the component → the handler).
- [ ] Follow the wire DOWN to the handler that really fires. Confirm the component is the one actually rendered (two similarly-named files/handlers are common — `RightPanelNew` vs `RightZone`, `commitAudioResize` vs `trimNleSegment*`).
- [ ] NEVER start from a function that merely has the right-sounding name and reason upward. That grabs the wrong twin every time.

### 3. Attach a LIVENESS proof to every behavioral claim, and tag verified-vs-assumed
- [ ] Each claim about behavior states HOW I know it runs: "it RUNS because Y mounts/calls it (`file:line`)" — not just "it lives at `file:line`."
- [ ] If I have NOT proven the path is reachable, I label the claim **[ASSUMED]** explicitly. Never present an assumption as fact.
- [ ] Goal: a hollow claim is catchable by the user *reading my message* (no liveness proof present), not by the user's domain expertise.

## Output Contract

When I explain how code works or propose a fix based on existing code, the message must contain, for each load-bearing claim:
- The live path: mount/caller → handler, with `file:line`.
- A verified/assumed tag where there's any doubt.
- If I found dead code that looks relevant, I flag it as dead (zero callers) rather than reasoning on it.

## The Trust Principle

The safeguard is never "trust me more." It is making every how-it-works claim **falsifiable by inspection** — liveness proof + verified/assumed tag in the response itself — so the backstop is the structure of my answer, not the user's memory of how ClipFlow works.

User's one-line trigger to pop this failure mid-conversation: **"did you grep the callers?"**

## Hard Rule

If the user pushes back from domain knowledge ("I'm positive I've seen that", "that's not how it works"), treat it as a likely-correct signal and re-verify from scratch — grep callers, re-trace top-down. Do not defend the original trace. It should never have to get to a pushback, but when it does, the pushback wins until proven otherwise.

## Distilled Lessons (process — diagnosis discipline)

- **Prove a seeded fixture actually loaded — through the app's own API — before concluding anything from the UI.** A fixture that silently failed to load is indistinguishable from a feature that doesn't render, and the worse case is a stale-but-plausible fallback (cached `localProjects`) that invites a confident wrong call in either direction. Assert `projectList()` returns your project and the clip carries your field, THEN look at the screen. (Session 130: a `\1` in a JS string ate the path separators; separately `renderStatus: "done"` vs the app's `"rendered"` filter left the queue empty.)
- **Diagnose root cause BEFORE writing any fix.** Trace the data flow in code, find the EXACT line where behavior diverges from expectation, fix THAT. If the architecture is wrong, rebuild it — never stack workarounds on a broken foundation.
- **For multi-layer bugs (FFmpeg → file → IPC → store → renderer), trace the ENTIRE pipeline end-to-end before touching anything.** Identify ALL mismatches first, then fix from the foundation up — not symptom by symptom. (Chains of 8+ symptom-patches are how things end up "severely broken.")
- **When a fix doesn't work or creates a new bug, STOP patching — the diagnosis is wrong.** Don't tweak the same property/value a 2nd or 3rd time. Re-read from scratch and re-diagnose. (After 2 failed attempts: full re-read, find where the mental model is wrong, propose a new approach.)
- **Verify which component is ACTUALLY rendering before editing or explaining it.** Trace the import/mount chain from the entry point (`EditorLayout`) — two parallel implementations are common (`RightPanelNew` vs `RightZone`, `BrandDrawer` vs inline `BrandKitPanel`). grep the import in the layout file, not just anywhere.
- **Re-read files the user sends** (via `@` or "read this") with the Read tool EVERY time — never assume contents are unchanged from a prior read, even with the same filename.
- **Don't invent or guess identifiers** (API model IDs, field names, store keys) — grep the codebase for the proven existing value first.
- **A Grep/ripgrep miss in gitignored build output is a FALSE NEGATIVE, not proof of absence.** ripgrep skips `.gitignore`d files, and `build/` is gitignored — so grepping `build/` for a marker returns empty even when the code is present. ClipFlow's prod runtime and the export window both load from `build/`, so "is the build current?" is a real verification — but answer it by READING the `build/` file directly (or `git check-ignore` first), never by trusting a grep miss. (#120 near-miss, session 64: I almost reported the export still broken because the fix-marker grep skipped the gitignored `build/` copy that actually had the fix.)
- **Don't trust a spec's claim that an external API returns a field — verify it against the real response, the existing code comments, and the official API docs before building a gate on it.** A gate keyed on a field that doesn't exist is dead code that gives false (audit/compliance) confidence. Session 78: the TikTok audit spec asserted `creator_info` returns a `can_post`/capacity flag for a pre-flight check (A8), but the existing code comment AND TikTok's documented `creator_info` response have no such field — TikTok signals "too many posts" as a publish-time error instead, so the check belongs there, not pre-flight.
- **For playback/state/timing bugs, never present an UNREPRODUCED diagnosis as the answer.** A plausible, fully-cited hypothesis still only proves the code CAN run, not that it's the path the gesture hit. Either reproduce it (or add a one-line log and have the user repro once), or tag the root cause UNCONFIRMED and fix the *class* robustly. If the trace cleanly maps the happy path, that's a signal the bug needs a real repro, not a tidier story. And when the user's described numbers/positions have two meanings after an edit (session 88: "past 20s" = old mid-clip vs the new post-ripple-delete end), surface both and ask — don't silently pick the one that confirms your hypothesis, or bend the user's words to fit it.
- **A config value + one probed file proves "processing this file WOULD do Z" — never "Z is happening."** Before any present/past-tense claim about pipeline output (subtitles, waveforms, renders), verify all three: the setting, which inputs actually flowed through (projects' `sourceFile` paths under `<watchFolder>\.clipflow\projects`), and a probe of at least one actually-processed input. Where behavior varies per file (audio track layout, music present or not), probe more than one processed file before generalizing. (Session 112: "your subtitles are being blended" was claimed from the setting + a file ClipFlow had never seen; verification showed the claim wrong as stated — and accidentally true for a different, older reason.)
- **A claim about third-party/framework behavior that is load-bearing for the USER'S DECISION must be probed, not recalled.** Tradeoffs, "we can't because…", and recommendations-against never meet a build step or test, so a wrong one survives unchallenged and can kill a correct fix. Write the 20-line throwaway probe that reproduces the actual contended situation; type definitions frequently don't answer scoping questions. Probe the *mechanism* you're leaning on too, not just the headline claim. If a probe truly isn't worth it, say "unverified" out loud rather than asserting. (Session 126: "a single-instance lock would block running a source build alongside the installed app" was stated as fact and used as the reason to leave #156 open — the lock is scoped to the userData dir, so only same-profile launches collide and `npm run dev` is unaffected. The overstated downside nearly cost the fix; a two-instance probe settled it in minutes, and a second probe confirmed `app.exit(0)` halts synchronously, which is why the guard is safe at all.)
- **Ground truth for "what does this clip show" must come from the SAME range the code under test consumes.** A clip has two ranges: the detected `startTime`/`endTime` and the edited `nleSegments` union — the title/preview/render paths use the segments. Session 133: verification stills were sampled from the 40s detected range while the feature correctly cut the 8s edit; the model was nearly judged against footage it never saw. Before grading any output against clip content, print the exact range the feature computed (the cost log's "8.0s preview" was the tell) and sample ground truth from THAT.
- **A "tune this value" request is a claim about a value that EXISTS — check that it does before tuning it.** Session 137: Fega asked for a way to reduce Audio-panel preview volume. `togglePlay` never set `volume` at all, so every audition ran at 1.0 while a placed song sat at 0.4 — the preview was louder than the thing it previewed. Reading the code first turned "lower it a bit" into "it was never assigned", a different and better fix. Same shape as #188 the session before: the reported symptom named a value, the bug was a missing assignment. Grep for the property being set before proposing a new default, threshold or multiplier.

- **An assertion inside a question is still an assertion (session 139).** "Nothing else in the app uses a gradient fill on a button" went into an AskUserQuestion option description; `PrimaryButton` — the component that button used to BE — is `linear-gradient(135deg, T.accent, T.accentLight)`. Fega chose on the strength of a false claim. The no-narration-from-memory rule covers option text, plan bullets and question framing, not just answers. Before writing "nothing else does X" / "this is the only Y" / "that was never there", grep for X — it costs one line, and it is exactly the class of claim the user cannot check.
