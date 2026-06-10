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

- **Diagnose root cause BEFORE writing any fix.** Trace the data flow in code, find the EXACT line where behavior diverges from expectation, fix THAT. If the architecture is wrong, rebuild it — never stack workarounds on a broken foundation.
- **For multi-layer bugs (FFmpeg → file → IPC → store → renderer), trace the ENTIRE pipeline end-to-end before touching anything.** Identify ALL mismatches first, then fix from the foundation up — not symptom by symptom. (Chains of 8+ symptom-patches are how things end up "severely broken.")
- **When a fix doesn't work or creates a new bug, STOP patching — the diagnosis is wrong.** Don't tweak the same property/value a 2nd or 3rd time. Re-read from scratch and re-diagnose. (After 2 failed attempts: full re-read, find where the mental model is wrong, propose a new approach.)
- **Verify which component is ACTUALLY rendering before editing or explaining it.** Trace the import/mount chain from the entry point (`EditorLayout`) — two parallel implementations are common (`RightPanelNew` vs `RightZone`, `BrandDrawer` vs inline `BrandKitPanel`). grep the import in the layout file, not just anywhere.
- **Re-read files the user sends** (via `@` or "read this") with the Read tool EVERY time — never assume contents are unchanged from a prior read, even with the same filename.
- **Don't invent or guess identifiers** (API model IDs, field names, store keys) — grep the codebase for the proven existing value first.
- **A Grep/ripgrep miss in gitignored build output is a FALSE NEGATIVE, not proof of absence.** ripgrep skips `.gitignore`d files, and `build/` is gitignored — so grepping `build/` for a marker returns empty even when the code is present. ClipFlow's prod runtime and the export window both load from `build/`, so "is the build current?" is a real verification — but answer it by READING the `build/` file directly (or `git check-ignore` first), never by trusting a grep miss. (#120 near-miss, session 64: I almost reported the export still broken because the fix-marker grep skipped the gitignored `build/` copy that actually had the fix.)
- **Don't trust a spec's claim that an external API returns a field — verify it against the real response, the existing code comments, and the official API docs before building a gate on it.** A gate keyed on a field that doesn't exist is dead code that gives false (audit/compliance) confidence. Session 78: the TikTok audit spec asserted `creator_info` returns a `can_post`/capacity flag for a pre-flight check (A8), but the existing code comment AND TikTok's documented `creator_info` response have no such field — TikTok signals "too many posts" as a publish-time error instead, so the check belongs there, not pre-flight.
