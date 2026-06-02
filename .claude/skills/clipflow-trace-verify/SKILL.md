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
