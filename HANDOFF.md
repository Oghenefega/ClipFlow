# ClipFlow — Session Handoff
_Last updated: 2026-04-17 (session 9) — "#35 minimal repro established, C1 Electron upgrade arc unblocked"_

---

## TL;DR

Diagnostic + planning session — no ClipFlow code changes. Step 0 of the C1 Electron upgrade arc is complete: a reliable minimal repro for the `blink::DOMDataStore` renderer crash ([#35](https://github.com/Oghenefega/ClipFlow/issues/35)) has been established on stock Electron 28. The Electron upgrade track ([#45](https://github.com/Oghenefega/ClipFlow/issues/45)) is now unblocked and begins next session with hop 1 (28 → 29).

1. **Minimal repro for #35 confirmed live by Fega.** Open a clip with a 30min+ source → grab the timeline zoom slider thumb → drag left-right rapidly for ~5-10 seconds → renderer crashes with `0xC0000005 ACCESS_VIOLATION_READ`. Two fresh Sentry events captured this session (`b0e03249`, `004c5c7a`); both share the stock stack (`blink::DOMDataStore::GetWrapper` → `DOMArrayBuffer::IsDetached` → `ReadableStreamBytesConsumer::BeginRead`).
2. **Three crash patterns documented from breadcrumb mining across 12 events.** Pattern A = timeline interaction (Radix Slider thumbs, trim handles, waveform); Pattern B = idle projects-tab after preview-frame extraction on 30min+ sources; Pattern C = clip-open within 1-3s of `<video>` load. All three share the same Chromium 120 fetch-stream UAF stack.
3. **Session 5's Slider hypothesis was narrow, not wrong.** The native-input swap test in session 6 didn't stop the crash because Slider is one trigger in Pattern A, not the universal cause. The underlying bug is `<video src="file://...">` fetch-stream teardown racing against mojo IPC delivery — any rapid interaction that thrashes the video's stream exposes it.
4. **Diagnostic writeup posted to [#35 comment](https://github.com/Oghenefega/ClipFlow/issues/35#issuecomment-4266632249)** with full method, the three patterns, the repro recipe, and the go/no-go test framing for each Electron hop.
5. **[#51](https://github.com/Oghenefega/ClipFlow/issues/51) code-signing cert procurement deferred indefinitely** — Fega has no funds and no beta cohort. Comment posted. Issue remains open but not blocking current work.

## 🎯 Next session kicks off C1 Phase 1, Hop 1: Electron 28 → 29

Per Section 9 of the dashboard ([C1 decision, 2026-04-17](https://github.com/Oghenefega/ClipFlow/issues/45)), Phase 1 is stepwise **28 → 29 → 30 → 31 → 32**, one major per session. Phase 2 (32 → current stable) uses a minimum +2-major increment with breaking-changes review per hop.

**Hop 1 work (60-90 min estimate, more if native deps break):**

1. **Warm-up: H8 pin** — `npm install @types/node@^18` ([#55](https://github.com/Oghenefega/ClipFlow/issues/55)). 5 min standalone. Prevents Node-20-only type signatures from sneaking in during the hop. Re-bumped to `^20` at end of hop 1 verification (Electron 29 ships Node 20).
2. `npm install electron@29 && npm install --save-dev @electron/rebuild` — note the modern package name (`@electron/rebuild`, not the old `electron-rebuild`).
3. Rebuild native deps: `npx @electron/rebuild`. Main suspect is `better-sqlite3`, but check every `nodeGypRebuild: true` package.
4. **Read Electron 29 breaking changes** — [electronjs.org/docs/latest/breaking-changes](https://www.electronjs.org/docs/latest/breaking-changes). Focus on: Chromium 122 renderer/media changes, Node 20 deprecations, preload/session API changes, `webContents` API shifts.
5. `npx react-scripts build && npm start` — smoke tests:
   - App launches, main window + DevTools open
   - Editor opens a clip, `<video>` plays, timeline scrubs
   - Render a test clip end-to-end (subtitle burn-in exercises the offscreen renderer, which still has `nodeIntegration: true` on 29 — H1 hardening bundled later in this Phase 1 arc)
   - OAuth smoke: at minimum open TikTok or YouTube connect flow and confirm the localhost auth server still listens
6. **Run the #35 go/no-go test** — drag zoom slider 10× on a long-source clip.
   - If it **doesn't crash** in 10 attempts → hop is a candidate fix. Keep going to hop 2 anyway (Chromium 120 → 128 is the multi-hop goal per Modernization Audit), but note #35 may resolve early.
   - If it **still crashes** → expected given the Chromium fetch-stream fixes landed in 121-128. Keep going.
7. **Commit the hop separately** with message like `Upgrade Electron 28 → 29 (hop 1 of 4, C1 Phase 1)` so bisects work cleanly later.
8. **Update CHANGELOG + HANDOFF** at hop-end.

## 🚫 What NOT to start in the next session

- Do NOT attempt the full 28 → 32 jump in one session. Per the committed cadence, one major per session for Phase 1. Skipping majors compounds breakage (deprecation → removal spans 2 majors in Electron).
- Do NOT start the Vite migration ([#46](https://github.com/Oghenefega/ClipFlow/issues/46)) yet. Gate is Phase 1 landing (Electron 32). Structural deps arc (electron-store, chokidar, CSP) all downstream of Vite.
- Do NOT start H1 (offscreen subtitle renderer hardening, [#47](https://github.com/Oghenefega/ClipFlow/issues/47)) or H3 (sandbox flip, [#49](https://github.com/Oghenefega/ClipFlow/issues/49)) yet. Both bundled with C1 Phase 1's smoke-test arc, but land AFTER the Electron hops are stable. One preload audit, one QA pass covers all three.
- Do NOT touch H9 CF Gateway hardening ([#56](https://github.com/Oghenefega/ClipFlow/issues/56)) or H4 auto-updater research ([#50](https://github.com/Oghenefega/ClipFlow/issues/50)). Per Fega's explicit priority redirect this session: substrate upgrades first, launch-hardening work deferred until closer to beta.

## 📋 Infrastructure board state after this session

| Item | Issue | Status |
|---|---|---|
| **#35 crash diagnostic (Step 0)** | [#35](https://github.com/Oghenefega/ClipFlow/issues/35) | ✅ **done this session** — minimal repro established |
| **C1 Phase 1 Hop 1: Electron 28 → 29** | [#45](https://github.com/Oghenefega/ClipFlow/issues/45) | 🔲 **next session** — unblocked |
| H8 @types/node pin | [#55](https://github.com/Oghenefega/ClipFlow/issues/55) | 🔲 warm-up before hop 1 |
| H1 subtitle overlay hardening | [#47](https://github.com/Oghenefega/ClipFlow/issues/47) | 🔲 bundled with C1 Phase 1 smoke-test arc |
| H3 sandbox flip | [#49](https://github.com/Oghenefega/ClipFlow/issues/49) | 🔲 bundled with C1 Phase 1 smoke-test arc |
| C2 Vite migration | [#46](https://github.com/Oghenefega/ClipFlow/issues/46) | ⏸️ gated on C1 Phase 1 landing |
| H5 electron-store 8→11 | [#52](https://github.com/Oghenefega/ClipFlow/issues/52) | ⏸️ gated on Vite |
| H6 chokidar 3→4 | [#53](https://github.com/Oghenefega/ClipFlow/issues/53) | ⏸️ gated on Vite |
| H2 CSP | [#48](https://github.com/Oghenefega/ClipFlow/issues/48) | ⏸️ bundled with Vite (nonce-based) |
| H4 auto-updater research | [#50](https://github.com/Oghenefega/ClipFlow/issues/50) | ⏸️ deferred (Fega redirect: post-beta) |
| H7 electron-builder 24→26 | [#54](https://github.com/Oghenefega/ClipFlow/issues/54) | ⏸️ bundled with H4 |
| H9 CF Gateway hardening | [#56](https://github.com/Oghenefega/ClipFlow/issues/56) | ⏸️ deferred (Fega redirect: post-beta) |
| #51 code-signing cert | [#51](https://github.com/Oghenefega/ClipFlow/issues/51) | ⏸️ **deferred indefinitely this session** — comment posted |

## Key Decisions

1. **#51 deferred indefinitely** — no funds, no beta, not blocking. Comment posted, issue remains open.
2. **Pre-beta priority framing** — substrate upgrades (Electron, Vite, React, dep majors) are priority 1 while pre-beta. Launch-hardening work (abuse prevention, rate limiting, code signing, CF gateway hardening, auto-updater research) stays tracked but not pushed as urgent. Saved as feedback memory for future sessions.
3. **Stage 3 of diagnostic plan skipped** — Stage 1 breadcrumb mining + Stage 2 manual repro were sufficient. Fega confirmed the repro on first attempt; no need to add richer breadcrumb instrumentation + wait for new crashes.

## Watch Out For

- **Sentry's default `ui.click` breadcrumb instrumentation does NOT capture pointer drag sequences.** For drag-triggered bugs, breadcrumb trails will look deceptively benign — the actual drag action isn't logged. Only synthetic clicks are. If investigating future crash patterns that involve drag, manually-verify what the user was doing.
- **The zoom slider drag repro is fast and reliable — use it for every Electron hop's verification.** Don't skip. Pattern A is the most predictable; Pattern B (idle crash) and Pattern C (clip-open crash) still need retest after each hop because they share the same underlying bug class but are harder to trigger on demand.
- **DevTools is unconditionally force-opened at [src/main/main.js:324](src/main/main.js:324)** via a debug scaffold comment. If DevTools doesn't open, check: (a) are you running `npm start` from the terminal in the repo, not the installed `dist/ClipFlow.exe`? (b) is the DevTools window hidden behind the main window in detach mode? (c) Ctrl+Shift+I is the Electron keyboard shortcut fallback.
- **`@electron/rebuild` is the modern name; `electron-rebuild` is the old one.** Use the scoped package in Hop 1. `better-sqlite3` is the most likely native-dep rebuild target; check the full dep list if rebuild fails.
- **Don't re-litigate committed infrastructure decisions from session 8.** Section 9 of the dashboard is canonical. If Hop 1 surfaces something that invalidates a committed decision (e.g., Electron 29 Node 20 bump changes assumptions), flag it explicitly so the dashboard can update — don't silently deviate.

## Logs / Debugging

- **Dashboard:** `C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\infrastructure\ClipFlow Infrastructure.md` (read Section 9 before any infra work)
- **#35 repro recipe:** `npm start` → open editor on a clip whose source is a 30min+ OBS recording → drag the timeline zoom slider thumb rapidly left-right for ~5-10s → crash
- **#35 Sentry issue:** `7381799876`. Latest confirmed crash event IDs this session: `b0e03249318b49d6ba93fca16817ec34`, `004c5c7a310d45e68a2cfca0898b59e0`. Expected top-of-stack: `blink::DOMDataStore::GetWrapper` → `DOMArrayBuffer::IsDetached` → `ReadableStreamBytesConsumer::BeginRead` → `FetchDataLoaderAsDataPipe::OnStateChange`.
- **Sentry API:** token at `C:\Users\IAmAbsolute\.claude\sentry_token.txt`. Event list: `https://sentry.io/api/0/organizations/flowve/issues/7381799876/events/`. Single event: `https://sentry.io/api/0/organizations/flowve/issues/7381799876/events/{eventID}/` — entries include `breadcrumbs`, `exception`, `threads`, `debugmeta`.
- **Breadcrumb mining template:** curl the single-event endpoint → pipe to node via stdin → parse `entries[].type === "breadcrumbs"` → inspect `data.values[]`. Note: drag events are NOT captured as `ui.click`; only synthetic clicks are.
- **Electron 29 breaking changes doc:** [electronjs.org/docs/latest/breaking-changes](https://www.electronjs.org/docs/latest/breaking-changes) — read before running hop 1.
- **All infra issues filter:** `gh issue list --repo Oghenefega/ClipFlow --state open --search "milestone:commercial-launch"`

---

## Session 8 handoff (preserved)

_Infrastructure dashboard bootstrap + 11-decision walkthrough (no code changes)._

1. **Bootstrapped an evergreen infrastructure dashboard** at `C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\infrastructure\ClipFlow Infrastructure.md`. Full stack inventory, severity-tagged findings (2 Critical, 9 High, 9 Medium, 10 Low, 2 Unknown), current-decisions-in-flight log, self-contained drift-catching refresh prompt. Subfolders: `Reviews/`, `Prompts/`, `Decisions/`.
2. **Walked 11 decisions item-by-item with Fega** — all Criticals (C1 Electron upgrade cadence, C2 CRA→Vite migration) and all Highs (H1–H9). Each committed decision logged in Section 9 of the dashboard with a GitHub tracking issue.
3. **10 new GitHub issues filed** — [#47](https://github.com/Oghenefega/ClipFlow/issues/47) through [#56](https://github.com/Oghenefega/ClipFlow/issues/56). All labelled `milestone: commercial-launch`.
4. **CLAUDE.md pointers added** in repo (filtered, default-off) and in Obsidian vault's ClipFlow business CLAUDE.md.
5. **Mediums (9), Lows (10), and Unknowns U1 + U2 NOT yet walked** — remaining work for a future dedicated session.

## Session 7 handoff (preserved)

_Modernization plan + LLM Council review (planning only, no code changes)._

1. **Modernization plan filed as [#46](https://github.com/Oghenefega/ClipFlow/issues/46)** — epic-style chore covering CRA → Vite, React 18 → 19, selective dep audit. Explicit rejections in the issue body (Next.js, pnpm, blanket dep bumps).
2. **LLM Council reviewed the plan** (5 advisors + 5 peer reviewers + chairman synthesis). Unanimous blind spot caught in peer review: **nobody proposed reproducing the #35 crash before making any Electron decision** — the entire #45 Electron track rests on an unverified premise. *(Session 9 update: that premise is now verified — crash repro confirmed, C1 arc unblocked.)*
3. **Modernization work PAUSED** pending a full architecture audit. *(Session 8 update: that audit became the infrastructure dashboard.)*

## Session 6 handoff (preserved)

1. **#35 root cause narrowed, fix deferred to Electron upgrade.** Session-5's Slider hypothesis was tested and disproven. Real crash stack: Chromium 120 fetch-stream UAF. *(Session 9 update: Slider wasn't wrong, just narrow — one trigger in Pattern A, not the universal cause.)*
2. **#38 closed.** `cutClip` now probes source fps and passes `-r <fps>`.
3. **#45 filed** — Electron 28 → 32 upgrade, stepwise.
