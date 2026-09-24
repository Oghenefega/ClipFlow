> **Status after session 276:** all dev-tooling hunks (#1-22) applied in 59970bf. App hunks applied in 351f090, with two changed after live tests: A3 (`web_search_20260209`) was REJECTED (about 2 min per call, past the 120 s timeout, about 10x the tokens), and A1's lead-in guard and scrubber were KEPT (Opus 4.6 still writes "Based on my research…"). A6 replays came back neutral, not the improvement predicted. A5 was fixed in 9c74bf1 (#464). Still open: A7 (structured outputs, if detection moves to Sonnet 5), A8, A9, dev-tooling #23-26, and the vendored autoresearch flags.

# Prompt audit: Corva (ClipFlow repo), 2026-09-23

## Assumptions

- **Scope:** everything in the repo that reaches a Claude model as text. That splits into two surfaces with different targets:
  1. **App surface.** The prompts Corva itself sends to Claude: clip detection, the title/caption fallback, game research, and the connection test. Plus the request code and cost tracking around them.
  2. **Dev-tooling surface.** The instructions Claude Code reads in this repo: `CLAUDE.md`, `.claude/rules`, `.claude/commands`, `.claude/docs`, `.claude/skills`.
- **Target model, app surface:** `claude-sonnet-4-6` (detection and the title fallback, `anthropic.js:22`) and `claude-opus-4-6` (game research, `main.js:4730`). No migration is documented in the repo, so the audit judges against the models the code actually calls today.
- **Target model, dev surface:** Claude Opus 5.5 / Claude Fable 5.1, the models that run Claude Code sessions here.
- **Non-Anthropic providers recorded:** Gemini (`providers/gemini.js`) is the *primary* path for titles/captions and runs game sniffing, full-watch, and imports. `providers/openai-compat.js` is a dev-switchable alternative. The detection prompt was deliberately rewritten to be model-agnostic (commit `4eec903`, 2026-03-30, "Redesign AI prompts for model-agnostic reliability"). Gemini-only prompts (`game-detect.js:158` `buildSniffSystem`, `gemini-watch.js` `WATCH_PROMPT`, `main.js:4336` `GEMINI_VIDEO_NOTE`) are **out of scope**: this audit's reasoning is about Claude model behavior and doesn't carry over to Gemini. Nothing here proposes switching any Gemini path to Claude.
- **Measurement exists for detection.** The replay-and-score harness (`tasks/spikes/replay-score/harness.js`) is the eval. By the locked rule in `tasks/specs/detection-input-science.md`, any detection change ships only on pooled replay numbers.

## Inventory

| Surface | Where | Model |
|---|---|---|
| Detection system prompt | `src/main/ai-prompt.js:36-182`, plus few-shot `298-427` and `data/archetype-examples.json` | Sonnet 4.6 |
| Detection user content | `ai-prompt.js:541-603` | Sonnet 4.6 |
| Detection request + JSON parse | `ai-pipeline.js:428-460`, `ai-prompt.js:614-643` (`extractJSON`) | Sonnet 4.6 |
| Title/caption prompts (batch, single-card, import) | `src/main/ai/title-caption-prompt.js`, `data/caption-hook-examples.json` | Gemini first; **Sonnet 4.6 fallback** (`main.js:4489-4502`) |
| Game research | `main.js:4726-4760` (system prompt + `web_search` tool) | Opus 4.6 |
| Connection test | `main.js:4151-4167` | active default |
| Provider request builder | `ai/providers/anthropic.js` (no thinking config, no caching, no sampling params, no prefill) | all |
| Cost accounting | `ai/cost-tracker.js`, `ai/ai-call-log.js` | all |
| Dev-tooling instructions | `CLAUDE.md`, `.claude/**` (about 6k lines, about 3.5k of them the vendored `autoresearch` skills) | Opus 5.5 / Fable 5.1 |

## Summary

**App surface.** 9 findings: Group 1 (dated prompt text): 4. Group 4 (request config): 5. **5 have proposed hunks**, verified: the patch applies cleanly, the detection tests pass 79/79 on the patched copy, and the edited files parse. None has been run against the live model yet.

The highest-impact findings:

1. **The game-research "no preamble" rule fights the code, not the model** (`main.js:4737-4738`, `4751-4752`). With web search on, Claude always writes a line before it searches. The provider then glues *every* text block together with blank lines (`anthropic.js:142-145`), so that line becomes part of the saved note. The answer also arrives split into cited pieces mid-sentence, so the same gluing puts paragraph breaks in the middle of sentences. The prohibition and the regex scrubber are both patches for this. The fix is to keep only the text after the last search result. Every new game's `aiContextAuto`, which detection reads, comes from this call.
2. **Cold-start detection examples teach the wrong clip length** (`ai-prompt.js:315-317, 421-427`). All 20 static examples run 50-75 s at confidence 0.80-0.95. They are shown with invented timestamps and a Title Case "Title" field the output schema forbids. The boundary rules ask for 7-90 s and praise 7-20 s reactions, but examples beat rules, so a fresh install gets long clips. Fega's own runs never see this path (Tier 3, 20+ approved clips). The laptop and every new customer do.
3. **The detection and title JSON scaffolding stays for now.** The "Return ONLY valid JSON / no code fences" text plus `extractJSON` is exactly the pattern structured outputs replace. But this skill's docs don't list Sonnet 4.6 as supporting structured outputs (Sonnet 5 is listed), and the same text serves Gemini and openai-compat. So it's flagged, not changed. It becomes a real replacement if detection moves to Sonnet 5.

**Also reviewed and kept on purpose.** These match a grep but are tuned, measured, and recent on the same model, so they stay:
- The clip-count constraint with its "do not settle at 14-15 out of habit" line (`ai-prompt.js:150`, #200/#238, verified by replay).
- The rejected-section fences, "NOT words to avoid" and "must never push you toward returning fewer" (`413-415`, #381/#200).
- The title/caption voice rules and their end-of-prompt DO NOT recap (#183/#419, measured on published rows one week ago). A single closing recap is a known good pattern.
- The 7-90 s bound, which appears five times but consistently (working redundancy).
- The one-line role statements.

**Checked, nothing found:** no assistant prefill, no `budget_tokens` or sampling parameters, no forced `tool_choice`, no "think step by step", no model-version workaround comments in prompt text. No model call has an output fully determined by its inputs: every call site does judgment work, and parsing and validation already live in code.

---

## App surface: findings

| # | Location | Evidence | Pattern | Why obsolete for the target | Conf. | Action |
|---|---|---|---|---|---|---|
| A1 | `main.js:4737-4738`, `4751-4752`; `anthropic.js:140-146` | `Do NOT include any preamble like "I'll research..."` / `Start directly with the game description` / `text.replace(/^(I'll research\|Here is\|...)/…)` | 1e prohibition with no real provenance; 1d patch accretion | On a web-search turn, Claude writes a line before it calls the tool. That's the documented response shape (text, then `server_tool_use`, then `web_search_tool_result`, then cited text), not a habit the prompt can train away. The leak comes from `extractText` joining all text blocks. The same join puts `\n\n` inside sentences, because cited answers arrive as several text blocks that break mid-sentence. | Medium | **rewrite**: take only the text after the last `web_search_tool_result`, joined without separators. Drop the prohibition and the regex. Hunks 1, 2, 4 |
| A2 | `main.js:4731-4740` | `Your ONLY job…` / `RULES:` / `Focus ONLY on` / `Do NOT include: developer names, publishers…` | 1a pressure language; 1c bullet wall that separates rules from their reasons | Opus 4.6 follows the system prompt closely, so the ONLY/Do NOT volume adds nothing. The exclusion list is a real constraint, but its *reason* is missing: the note is read by the clip picker, and corporate facts don't help it pick clips. The model can only apply the rule well if it knows who reads the output. | Medium | **rewrite**: one paragraph saying who reads the note and why, then the format need (plain prose that has to fit the 1,500-char cap in `ai-prompt.js:208`). The constraints stay; the shouting goes. Hunk 2. This touches the same prompt as #441 (Steam grounding), so land them together or rebase one on the other. |
| A3 | `main.js:4746` | `tools: [{ type: "web_search_20250305", … }]` | Group 4 API fossil | Opus 4.6 supports `web_search_20260209`, which adds dynamic filtering: search results are filtered in code before they reach context, so answers get more precise and input tokens drop. | Medium | **replace-with-API-feature**. Hunk 3. Check that the Cloudflare gateway passes the new tool type (it should, since it proxies the body). |
| A4 | `cost-tracker.js:13` | `"claude-opus-4-6": { input: 15, output: 75 }` | Group 4 token accounting | Opus 4.6 costs $5 / $25 per MTok. The table is off by 3x. | High | **rewrite** to `5 / 25`. Hunk 5 |
| A5 | `main.js:4726-4760` | the research handler never writes a cost row or an `ai_calls` row | Group 4: no token accounting (and Fega's "track everything" rule) | Research is the only Claude path with no row anywhere, and it also has web-search fees. Every other AI call gets a row. | Medium | **add**: filed as an issue (see below). It needs a decision on whether `ai_calls` should hold non-title rows, so no hunk. |
| A6 | `ai-prompt.js:315-317`, `421-427`, `334`; `archetype-examples.json` | `Timestamp: 00:10:05 > 00:11:10` / `Title: Nobody Expected That Outcome` / `Confidence: 0.9` (all 20 examples 50-75 s, 0.80-0.95) | 1c example over-indexing | Examples are the strongest signal in a prompt: the model matches their length and values. These contradict the prompt's own boundary rule (7-90 s, short reactions encouraged), show a field the schema bans (`ai-prompt.js:167`), and pin confidence high. They're described as "timestamp boundaries" from videos that don't exist. | Medium | **rewrite**: render each example as its quote, energy, and "why it works", matching how real approved clips are shown. Drop the invented timestamps, title, and confidence, and say length comes from the rules. Update the test at `ai-prompt.test.js:154` and the JSON `_comment`. Hunks 6-10 |
| A7 | `ai-prompt.js:136`, `161-167`, `614-643`; `title-caption-prompt.js:290, 307-313, 458, 468-471, 576, 582-586` | `Return ONLY a valid JSON array… zero modifications` / `Do not wrap the JSON in markdown code fences` / `Do not use placeholder values like "..."` / `extractJSON` fence stripping | 1b JSON-forcing stack → structured outputs | Current Claude models don't need this, and structured outputs would guarantee the shape. **But** this skill's docs don't list Sonnet 4.6 among the models that support structured outputs, and the same prompt serves Gemini (primary for titles) and openai-compat by design. | Low | **flag**. Revisit if detection moves to Sonnet 5, which is listed. At that point, replace the DO NOT block, the fence rules, and `extractJSON` on the Claude path with `output_config.format`, and keep the prose for the other providers. |
| A8 | `ai-prompt.js:59` (`${durationLine}` inside `# TASK`) | per-recording duration placed above the stable creator/game/rules sections | Group 4 cache-hostile ordering | Only matters if prompt caching is added. Today nothing is cached, and the few-shot tail changes with every approval anyway. | Low | **flag** |
| A9 | `cost-tracker.js:14-15` | `"claude-opus-4-5": { input: 15, output: 75 }`, `"claude-haiku-3-5"` | Group 4 token accounting | `claude-haiku-3-5` isn't a real model ID (Haiku 3.5 was `claude-3-5-haiku-*` and is retired). The Opus 4.5 price is likely stale too, but this skill doesn't state it, so it's unverified. Neither is called anywhere. | Low | **flag** |

### Outside the audit's scope, worth knowing

- **Sonnet 5 would change the picture.** It is cheaper than Sonnet 4.6 ($2 / $10 vs $3 / $15 per MTok) and listed for structured outputs. Moving to it is a model decision for replay scoring, not prompt cleanup. If it happens, re-run this audit: A7 turns into a real replacement.
- Detection runs with thinking off (thinking is omitted on Sonnet 4.6). A replay A/B with adaptive thinking is the natural first cell of such a test.
- `anthropic.js` never reads `stop_reason`. A response cut off at `max_tokens` shows up as "LLM returned invalid JSON", which hides the real cause.
- `researchGame` sends a hard-coded Claude model ID and an Anthropic-only tool through `getProvider()`, so it breaks if the active provider isn't `anthropic`.

---

## Dev-tooling surface: findings

Target: Opus 5.5 / Fable 5.1. Read-only. Every "stale" claim was checked against current code, and I re-checked #1, #2, #3, #6, #8 and #10 myself. Skill frontmatter descriptions ("Use AUTOMATICALLY", "MUST be used before…") are routing text and were left alone. Counts: Group 1 (dated prompt text): 8. Group 2 (brittle skill files): 16. Groups 3 and 4: 0. Hunks are in `dev-tooling-hunks.md`.

**The big pattern:** most of this surface isn't shouting. It's *rot*. Skills that load on every relevant task still describe code that has since changed. Because the target models follow instructions literally, a stale "do X" gets done.

| # | Location | Evidence | Pattern | Why it matters | Conf. | Action |
|---|---|---|---|---|---|---|
| 1 | `clipflow-ui-debug/SKILL.md:8, 33-38` | "Add `className=\"dark\"` directly on every `PopoverContent`", "hardcode dark HSL values" | G2 volatile specifics, duplicates that disagree | Themes now come from `[data-theme]` on `<html>` (9 themes, some light), and there's no `className="dark"` in `src/renderer`. This contradicts code-review:35-38, and the skill fires on every CSS fix. | High | rewrite |
| 2 | `clipflow-code-review/SKILL.md:66` | "`npm start` … boots a LIVE PUBLISHER … never bare `npm start`" | G2 volatile specifics | False since #376 (`publish.js` returns early on source runs and the dev profile). It also contradicts this file's own step 2 and `CLAUDE.md`. | High | rewrite |
| 3 | `clipflow-ffmpeg-media/SKILL.md:76-93` | `exec(\`cmd /c "set "PATH=…"\`)`, CUDA DLLs, whisper.cpp JSON | G2 volatile specifics | Tells the model to use the `cmd /c` pattern that `stable-ts.js:157-160` removed on purpose (paths containing `&`, `%` or `^` broke it). | High | remove |
| 4 | `clipflow-ffmpeg-media/SKILL.md:54-58` | "Run BetterWhisperX (Python venv at `D:\whisper\…`)" | G2 volatile specifics | The default is stable-ts. BetterWhisperX is legacy only. | High | rewrite |
| 5 | `clipflow-electron-ipc/SKILL.md:104` | "Close = quit. No minimize-to-tray." | G2 disagreeing duplicate | The tray mode exists (#329). | High | rewrite |
| 6 | `clipflow-electron-ipc/SKILL.md:8` | "Electron 28 app" | G2 version pin | The project is on Electron 40. | High | rewrite |
| 7 | `.claude/rules/ui-standards.md:8-9` | "Four themes since #328 — Midnight…, Blush" | G2 volatile specifics | There are nine themes, and this rule loads for every renderer file. | High | rewrite |
| 8 | `clipflow-update-launcher/SKILL.md:90, 103`, `CLAUDE.md:89` | "Commit ONLY `package.json` + `CHANGELOG.md`" vs line 96 "ONLY these three" | G2 duplicates that disagree | A literal read leaves `release-notes.js` (What's New) out of the release commit. | High | rewrite |
| 9 | `clipflow-update-launcher/SKILL.md:33, 51, 107, 123, 126` | "line 3", "~line 4463", "ClipFlow v<version>" | G2 line numbers, old name | Every one of these is now wrong. | High | rewrite |
| 10 | `CLAUDE.md:67` | "`npm run dev` … flips the renderer to dev-server mode" | G2 volatile specifics | `isDev` is a hard-coded `false`, so Electron always loads `build/`. | High | rewrite |
| 11 | `.claude/commands/session-end.md:11` | "since the previous \"Session N wrap\" commit" | G2 | Commits are titled "close-out" now (the commit hook blocks the word "wrap"). | High | rewrite |
| 12 | `clipflow-mock-finder/SKILL.md:199` | `npx react-scripts build` | G2 | The renderer builds with Vite (`npm run build:renderer`). | High | rewrite |
| 13 | `clipflow-ui-debug/SKILL.md:10-22` | "MANDATORY… you MUST follow this exact sequence", "study the screenshot for 10 seconds", "Mentally simulate the fix" | 1c choreography; 1b thinking prose | Timing and "simulate" instructions mean nothing to these models. Keep the symptom→property map and the "re-diagnose, don't re-tweak" rule. | Medium | rewrite |
| 14 | `clipflow-code-review/SKILL.md:89, 93` | "Things I Must NEVER Do… **Add fallbacks**… Always." | 1a pressure; disagreeing duplicate | Contradicts the named, logged fallback that the title/caption path sanctions. Keep the ban on silent fallbacks. | Medium | rewrite |
| 15 | `clipflow-code-review/SKILL.md:128` | the asar extract-file rule | 1d patch accretion; duplicate | It lives in electron-ipc:142, and line 127 says command lessons don't belong here. | Medium | remove the duplicate |
| 16 | `clipflow-code-review/SKILL.md:176-187` | lessons appended after "## Lesson Capture" | 1d accretion | New lessons landed under the wrong heading. | Medium | move |
| 17 | `clipflow-ux-audit/SKILL.md:226-248` | "## Quick Scan (5 min)" cut off from its table | 1d accretion | An inserted section split the heading from its content. | Medium | move |
| 18 | `clipflow-optimize/SKILL.md:18, 32-47, 284` | "only implement Score >= 2.0", "Impact x Conf / Effort" | 1b arithmetic rubric the model must compute | Keep "measure first, one change at a time". | Medium | rewrite |
| 19 | `clipflow-optimize/SKILL.md:236-238` | console.log grep | disagreeing duplicate | Contradicts code-review:106 (keep debug logs during active development). | Medium | remove |
| 20 | `.claude/commands/session-end.md:53` | "is INVALID … (3 violations: s143, s145, s146)" | 1a; history narrative | The session IDs add nothing to the rule. | Medium | rewrite |
| 21 | `clipflow-update-launcher/SKILL.md:35-40` | "(session 129 — Fega reversed…)", `0.3.0-alpha.14` examples | G2 history, stale examples | The rule stays, with a plain reason. | Medium | rewrite |
| 22 | `CLAUDE.md:109-113` | "Amended by #329: …" | 1d migration-relative phrasing | State the current behavior, not a diff against the old one. | Medium | rewrite |
| 23 | many (code-review, trace-verify, ui-debug, ui-standards, `CLAUDE.md:71-73`) | "(session 224)", "(s269, #451)" | G2 history tags | Most of these are paired with a real reason, which is context. | Low | flag: drop the tags when a lesson is next distilled |
| 24 | `clipflow-trace-verify/SKILL.md:10, 16, 21` | "No exceptions.", "= STOP." | 1a | Encodes a repeated, real failure, so it stays. | Low | flag |
| 25 | `CLAUDE.md:3` | "the TikTok dev app is frozen mid-review and must not be touched" | G2 expiring gate | Memory says you renamed the TikTok app on 2026-09-10. This is a business gate, so you need to confirm before any change. | Low | flag |
| 26 | optimize, ux-audit, ui-debug | generic React, Nielsen and WCAG tables; "Dynamic import()"; "DM Sans + JetBrains Mono" | G2 verbose generic knowledge | Generic tables the model already knows, plus two small contradictions (lazy-loading vs code-review:107, JetBrains Mono vs the mono ban). | Low | flag |

**Vendored `autoresearch` skills (skimmed, flag only; they're third-party):** "NEVER STOP… think harder" (`autoresearch-karpathy/SKILL.md:54`, `autoresearch/SKILL.md:322`). `npx react-scripts build` verify commands and a "reduce bundle size" example (`autoresearch-karpathy/SKILL.md:106, 109`, `.claude/commands/autoresearch-karpathy.md:30-45`). `.claude/commands/autoresearch.md:9-12` point at a non-existent top-level `skills/` path.

**Clean:** `rules/editor.md`, `naming.md`, `pipeline.md`; commands `build`, `fix-issue`, `review`, `status`, `session-start`; `docs/issue-filing.md`; `clipflow-editor-patterns`.

**Probe before taking:** #13 and #18 change how the model behaves rather than fixing a fact. Try #13 on a real UI-bug screenshot and #18 on a performance request before keeping them. #1-12 are fact fixes, each checked against the code.

---

## Verification plan (before any hunk lands)

- **Hunks 1-4 (research):** run research on two games (one mainstream, one small indie) before and after. Check that the saved `aiContextAuto` has no lead-in line, no mid-sentence paragraph breaks, and still leaves out corporate facts. About 2 Opus calls with search each, a few cents.
- **Hunks 6-8 (cold-start examples):** detection-locked, so use replay scores, not vibes. Run `node harness.js "<video>" --no-approved --dry` to see the new Tier 1 section for free. Then run paired paid replays with `--no-approved` on the usual pooled recordings, baseline vs patched. Compare the clip-length spread (share under 30 s) alongside recall and rejected hits. Fega signs off before it ships, as with any engine variant.
- **Hunk 5:** no behavior change, just the price table.
