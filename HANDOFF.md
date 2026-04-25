# ClipFlow — Session Handoff
_Last updated: 2026-04-24 — Session 23: Lever 1 Step 8 validation + pipeline architecture decisions. Full engineering plans live in GitHub issues, not here._

---

## One-line TL;DR

Step 8 real-recording validation ran — Lever 1 failed on a real 30-min recording (3 of 5 Python signals timed out, one crash from LLM output overflow, one ignored naming-watcher limitation surfaced). Three issues filed with full engineering detail. **The issues are the source of truth; this HANDOFF is just a pointer.**

---

## What actually happened this session

1. Ran `npm start`, dropped a real RL recording through the pipeline. First attempt crashed at Stage 6 (LLM returned invalid JSON — 4096 output-token ceiling hit). Second attempt succeeded but took 18 minutes and silently failed 3 of 5 signals.
2. Diagnosed both failures from the pipeline logs in `processing/logs/`.
3. Filed three GitHub issues as carriers of full engineering context:
   - **[#70](https://github.com/Oghenefega/ClipFlow/issues/70)** — Rename watcher only detects rigid OBS filename pattern. Non-Fega creators can't use ClipFlow today.
   - **[#71](https://github.com/Oghenefega/ClipFlow/issues/71)** — LLM pipeline crashes + Claude hallucinates narration. **Direction 1 locked** (stop asking Claude to narrate). Full schema rewrite and downstream impact captured.
   - **[#72](https://github.com/Oghenefega/ClipFlow/issues/72)** — Lever 1 signals timeout on real recordings. **Path A locked** (no retreat, pioneer if needed). 4-phase plan with per-signal optimization options, heartbeat protocol spec, and pioneer gates.

All three issues are **commercial-launch blockers**.

---

## Where to start next session

**Read the three issues first. Do not skim.** They carry the full engineering detail — schemas, file paths, acceptance criteria, phased plans, pioneer gates, heartbeat protocol. HANDOFF is intentionally thin because the depth belongs in issues, not here.

1. **Read [#72](https://github.com/Oghenefega/ClipFlow/issues/72) end to end** — it has a "Next-session kickoff checklist" section at the bottom. Follow it.
2. **Read [#71](https://github.com/Oghenefega/ClipFlow/issues/71)** — Direction 1 is locked (stop asking Claude to narrate). Schema rewrite + "Clip N" placeholder title + publish guardrail. Ready to implement.
3. **Read [#70](https://github.com/Oghenefega/ClipFlow/issues/70)** — adjacent blocker, not the focus of last session but still commercial-launch.

### Recommended order

**#71 first** — it's smaller, self-contained, and the fixes (8192 bump + 20-cap + schema rewrite + guardrail) are mostly surgical. Good warmup that also stops the bleeding on Stage 6 crashes.

**#72 Phase 1 second** — UX + heartbeat infrastructure. Must land before Phases 2-4 because the optimization work uses the heartbeat/progress UI to validate itself. See issue body for file list and acceptance.

**#72 Phases 2-4 after that** — scene_change → yamnet → pitch_spike, cheapest-first per founder direction.

**#70 is orthogonal** — can be picked up anytime a fresh session wants a smaller-scoped piece of work.

---

## Locked decisions (issue bodies are source of truth)

### From #71
- Direction 1: Stop asking Claude to narrate. New Stage 6 schema = timestamps + confidence + energy_level + has_frame + clip_number. No title, why, or peak_quote.
- Default title = `"Clip N"`. Pure number, no timestamp, no game tag in the stored string.
- Game tag becomes a first-class field (`clip.gameTag`) and renders as a separate UI chip.
- Publish guardrail: warn via toast only when `clip.title` matches `/^Clip \d+$/`. Any manual rename bypasses silently.
- Bump `max_tokens` 4096 → 8192. Cap clips 10–20 during alpha.
- Soft DB migration — old fields readable, new clips don't populate them.

### From #72
- Path A: no retreat. Pioneer if off-the-shelf tools can't hit budget.
- Strict mode toggle in Settings. **On by default.** Off enables best-effort mode with non-strict modal.
- Optimization order: scene_change (cheapest) → yamnet → pitch_spike (biggest rewrite).
- Pioneer gate per signal: if stacked library-level optimizations don't hit target after one focused session, we go custom.
- Heartbeat protocol v1: Python emits `PROGRESS <float>` to stderr every ~5s. Node parses line-by-line, stall-timer kills at 30s silence post-grace. See issue body for full spec.

---

## Open questions for next session

None blocking. All decisions made. Implementation-ready.

---

## Files to read first next session

1. **[#72](https://github.com/Oghenefega/ClipFlow/issues/72)** — full plan, ALL detail preserved.
2. **[#71](https://github.com/Oghenefega/ClipFlow/issues/71)** — narration fix + downstream impact.
3. **[#70](https://github.com/Oghenefega/ClipFlow/issues/70)** — watcher rigidity.
4. **`src/main/signals.js`** — the file being rewritten in #72 Phase 1.
5. **`src/main/ai-pipeline.js`** — Stage 6 call site for #71.
6. **`processing/logs/RL_2026-10-15_Day9_Pt1_1777047494519.log`** — reference failure log.

---

## Watch Out For

- **Do not start #72 Phase 2-4 before Phase 1.** The heartbeat/progress infrastructure is what validates each optimization's impact.
- **Electron-store schema migration is a HARD RULE.** `.claude/rules/pipeline.md`. The `strictMode: true` key in #72 Phase 1 needs a migration in `src/main/main.js` written BEFORE the data-shape change.
- **Reference recording** for regression testing: `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\Test Footage\2026-10\RL 2026-10-15 Day9 Pt1.mp4`. Every phase's acceptance is measured against this file.
- **`extractGameTag(clip.title)`** is a hidden coupling — 4 call sites in QueueView parse the game tag out of the title string. #71 kills this. Search for `extractGameTag` before touching anything that writes titles.
- **Publish flows use `clip.title` as default post title.** #71 adds a guardrail but verify it fires on all four platforms (TikTok, Instagram, Facebook, YouTube) before shipping.

---

## Logs / Debugging

- **Electron log file:** `%APPDATA%\clipflow\logs\app.log`
- **Pipeline logs:** `processing/logs/<videoName>.log` (PipelineLogger)
- **Signal JSONs:** `processing/signals/<videoName>.{yamnet,pitch_spike,scene_change,event_timeline}.json`
- **is_test mode** — enable via `gameData.isTest = true`. Writes the per-signal wall-clock table to the pipeline log.

---

## Session Model + Cost

- **Model used:** Opus 4.7. Founder wanted depth, Opus delivered it.
- **Context discipline:** this session went DEEP on architecture, not code. No source files were modified. Implementation is next session.
- **Next session can be Sonnet** for #71 (surgical). Should probably be Opus for #72 Phase 1 (infrastructure rewrite is not trivial).
