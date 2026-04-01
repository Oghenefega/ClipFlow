# Council Transcript — Claude Code Config Merge Decision
**Date:** 2026-04-01
**Topic:** Should ClipFlow merge behavioral directives from fakegurus-claude-md?

---

## The Question (Framed)

**Core Decision:** Should we merge behavioral directives from the fakegurus-claude-md repo into ClipFlow's existing Claude Code configuration, and if so, which of these 10 items and where should they live?

**Context:** ClipFlow is a commercial Electron desktop app for gaming content creators, built by a solo developer (Fega). The Claude Code config is already mature: root CLAUDE.md with project rules, global CLAUDE.md with session discipline, 4 custom skills, 4 rules files, 9 commands, 12 memory files, and HANDOFF.md session continuity.

**The 10 proposed additions:**
1. Edit Safety Protocol — Re-read before every edit, verify after, max 3 edits without verification
2. Context Decay Awareness — Re-read files after 10+ messages, 500 LOC chunked reads, 50K truncation awareness
3. Phased Execution — Max 5 files per phase, verify between
4. Dead Code Cleanup (Step 0) — Files >300 LOC, clean first in separate commit
5. Failure Recovery Protocol — After 2 failed attempts, stop and re-read everything
6. Verification Gate Upgrade — FORBIDDEN from reporting done until full checklist passes
7. context-log.md — Write state before compaction
8. Rename Safety Checklist — Search 6 categories when renaming
9. One-Word Mode — "yes"/"do it" = just execute
10. Senior Dev Override — Authorize structural improvements beyond what was asked

**Stakes:** Too few rules = avoidable bugs that cost money. Too many = ignored rules + token waste + prompt cache instability.

---

## Advisor Responses

### The Contrarian

Three of these ten items are solving problems that don't exist in this config yet. The rest are either redundant, dangerous, or theater.

**Redundant and deletable immediately:** Item 6 (Verification Gate Upgrade) duplicates the existing global rule almost word-for-word. Adding it again doesn't reinforce behavior — it creates two competing sources of truth that drift over time.

**The fatal flaw in items 3 and 4:** Phased Execution (max 5 files per phase) and Dead Code Cleanup (Step 0) directly conflict with ClipFlow's "Plan Before Code → wait for approval" rule. If Claude is independently deciding when to trigger a cleanup phase or capping its own scope, it's making architectural decisions without Fega. Solo dev shipping fast + autonomous scope management = invisible regressions in a 50+ file codebase with a subtitle segmentation system that already has a recurring regression documented in memory.

**Items worth serious consideration: exactly two.** Context Decay Awareness is legitimate. The 10-message re-read rule addresses real LLM behavior that the current config ignores entirely. Rename Safety Checklist is legitimate. Six-category search before renaming is directly applicable to an IPC bridge system where a missed reference silently breaks the preload API.

Everything else — One-Word Mode, Senior Dev Override, Edit Safety Protocol, Failure Recovery — adds token weight to rules Fega either already has, doesn't need, or will never audit to verify compliance.

Merge two items. Delete the rest.

### The First Principles Thinker

The real question isn't "which of these 10 rules should we add." It's: what failure modes is ClipFlow actually experiencing?

Most of these proposals solve hypothetical problems. You don't add fire suppression to rooms that haven't caught fire. So strip it back: what has Claude actually gotten wrong in this codebase? Context decay causing stale edits? Regressions after refactors? Wrong assumptions about file state?

If you don't have a concrete failure log, you're cargo-culting someone else's pain points into your system.

The rules that survive first-principles scrutiny are the ones solving provable, recurring problems:

**Keep:** Failure Recovery Protocol (#5) — Two failed attempts is a real signal. Stopping to re-read is correct behavior, not overhead.

**Keep conditionally:** Verification Gate Upgrade (#6) — But only if Claude is currently declaring "done" prematurely. If your existing Verification rule already catches this, it's redundant.

**Discard everything else.** Rules #1, #2, #3 are process overhead that assumes Claude is forgetting things mid-task. Rules #4, #8, #9, #10 are either stylistic preferences or edge-case optimizations. None address a stated failure mode specific to ClipFlow.

The actual constraint: every rule added to CLAUDE.md competes with every other rule for attention weight. A 600-word config with 8 sharp rules outperforms a 1,200-word config with 16 fuzzy ones.

**Bottom line:** Add #5. Audit #6 against your current Verification rule. Reject the rest unless you can name a specific ClipFlow incident each one would have prevented.

### The Expansionist

The upside everyone is missing: this isn't a rules question, it's a leverage question.

Fega is a solo dev building a commercial product. Every hour Claude wastes on avoidable mistakes is an hour Fega doesn't get back. The real ROI of these protocols isn't error prevention — it's compounding velocity. A Claude that re-reads before editing and verifies after doesn't just make fewer mistakes; it makes Fega faster because he stops being the error-catcher.

**One-Word Mode (#9)** is pure upside. Removing the friction of "yes proceed" conversations compounds across every single session.

**Senior Dev Override (#10)** is the most undervalued item on the list. When Claude spots a structural improvement mid-task, blocking it is leaving money on the floor. This should be explicitly authorized with a lightweight confirmation ask.

**Context Decay Awareness (#2)** has asymmetric upside. The codebase is already 50+ files. As ClipFlow grows, context decay gets worse, not better. Installing this now is cheaper than retrofitting after a bad refactor.

Dead Code Cleanup (#4) and Rename Safety Checklist (#8) are niche — they belong as on-demand skill invocations, not permanent config.

### The Outsider

Reading this cold, the first thing I notice: you're asking whether to add rules to fix Claude's behavior, but you haven't shown evidence that Claude is actually breaking in the specific ways these rules address.

"Edit Safety Protocol" - re-read before every edit. Is Claude currently corrupting files because it forgot what was in them? If yes, add it. If not, you're paying token costs to solve a problem you don't have.

"Context Decay Awareness" - the 10-message re-read rule. Same question. Is context decay actually causing bugs?

"Dead Code Cleanup Step 0" - this one confuses me. You're a solo dev shipping fast, and you want to force a mandatory cleanup commit before every feature? That's a workflow preference dressed up as safety protocol.

"One-Word Mode" is the most interesting item because it solves a real, observable friction.

"Senior Dev Override" concerns me most. You're authorizing Claude to make structural improvements beyond what was asked. That's how you get a PR where the button color was fixed and three files were silently reorganized.

Before merging anything, I'd want to see your "lessons learned" file — that's where your actual problems live, not a generic repo from someone else's context.

### The Executor

Merge exactly 4. Failure Recovery Protocol (#5) — paste verbatim, one sentence. Verification Gate Upgrade (#6) — strengthen existing rule, don't add new section. Context Decay Awareness (#2) — one rule: re-read any file not touched in 10+ messages. context-log.md (#7) — rename to tasks/context-log.md.

Skip the other 6. Edit Safety is redundant with Verification. Phased Execution slows a solo dev. Dead Code Cleanup is a one-time audit. Rename Safety too niche. One-Word Mode doesn't affect output quality. Senior Dev Override is a vibe, not a directive.

Total additions: approximately 6 lines across 2 files. That's Monday morning.

---

## Peer Reviews

### Anonymization Map
- Response A = Contrarian
- Response B = First Principles Thinker
- Response C = Expansionist
- Response D = Outsider
- Response E = Executor

### Review 1
**Strongest: E (Executor)** — Only response that answers operationally with specific placement. Also makes the right structural call on #6: strengthen existing rule, don't duplicate.

**Biggest blind spot: C (Expansionist)** — Argues for Senior Dev Override without acknowledging that silent structural reorganizations are high-risk for a solo commercial product.

**All missed:** tasks/lessons.md is the authoritative signal. None said "read it first, then decide."

### Review 2
**Strongest: D (Outsider)** — Anchors decision in evidence rather than hypotheticals. Correctly flags Senior Dev Override as silent-reorganization risk.

**Biggest blind spot: E (Executor)** — Confident action plan with zero justification for why those 4 specifically.

**All missed:** tasks/lessons.md already captures failure history — the answer exists on disk.

### Review 3
**Strongest: D (Outsider)** — Asks the right prior question before recommending anything.

**Biggest blind spot: A (Contrarian)** — Confidently recommends 2 items with no grounding in observed problems.

**All missed:** Cost of removal, not just addition. Should existing rules be pruned? A bloated config isn't fixed by selective additions.

### Review 4
**Strongest: B (First Principles)** — Reframes the decision correctly. Config density has diminishing returns.

**Biggest blind spot: E (Executor)** — Recommends context-log.md without explaining how it differs from HANDOFF.md.

**All missed:** The global CLAUDE.md already has a lessons.md capture rule. That file is the actual failure-tracking mechanism.

### Review 5
**Strongest: B (First Principles)** — Asks the right prior question.

**Biggest blind spot: C (Expansionist)** — Senior Dev Override directly conflicts with Plan Before Code gate.

**All missed:** None checked tasks/lessons.md. The data exists, council worked from theory.

---

## Post-Council Validation: lessons.md Cross-Reference

After the council, we read the full 56KB tasks/lessons.md (50+ documented failures). Here's how the proposals map to real incidents:

| # | Proposal | lessons.md Evidence | Verdict |
|---|----------|-------------------|---------|
| 1 | Edit Safety Protocol | No direct match — no documented cases of Claude corrupting files from stale reads | Skip |
| 2 | Context Decay Awareness | Indirect: "Always verify which component is ACTUALLY rendering" (stale mental model caused wasted work) | **Merge** |
| 3 | Phased Execution | CONTRADICTED: "Batch related fixes, don't iterate one at a time" | Skip |
| 4 | Dead Code Cleanup | Mild: Two parallel implementations existed for the same component | Skip (task, not rule) |
| 5 | Failure Recovery Protocol | STRONG: "When a fix doesn't work, change approach entirely", "Diagnose root cause BEFORE writing code — never guess-patch", CSS pattern-matching lesson (wasted entire afternoon) | **Merge** |
| 6 | Verification Gate | Already exists: Global Rule 4 + "Build and verify before declaring done" + "Always run the app after building" | Skip (redundant) |
| 7 | context-log.md | No documented need. HANDOFF.md already serves this purpose. | Skip (duplicate) |
| 8 | Rename Safety | DIRECT: "After renaming a variable, grep for ALL references" | **Add to skill** |
| 9 | One-Word Mode | Not failure-driven. Friction reduction. | **Merge** (low cost) |
| 10 | Senior Dev Override | CONTRADICTED: "Never remove working features without explicit approval" | Skip (dangerous) |

---

## Chairman's Final Verdict

**Merge 3 items. Upgrade 1 skill. Skip 6.**

**Merge:**
- #5 Failure Recovery → Global CLAUDE.md Rule 1 (one sentence)
- #2 Context Decay → Global CLAUDE.md Rule 5 (one line)
- #9 One-Word Mode → Project CLAUDE.md (new section)

**Upgrade:**
- #8 Rename Safety → Add to clipflow-code-review skill checklist

**Skip:** #1, #3, #4, #6, #7, #10

**Total impact:** ~8 lines across 3 files. Minimal token cost, maximum evidence-backed value.
