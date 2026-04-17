# ClipFlow — Session Handoff
_Last updated: 2026-04-17 (session 11) — "Phase A kept, B + C reverted, next = Electron 38 upgrade"_

---

## TL;DR

Session tried to ship #57 editor-perf fix as Phase A + Phase B + a hotfix. Only **Phase A** survived. The Phase B store-derivation refactor broke word highlighting in both Transcript and Edit-subtitles tabs and regressed the Transcript tab to laggy — reverted at Fega's request. Root cause re-diagnosed mid-session: not the subscription storm assumed in `tasks/todo.md`, but **component-size at re-render time** (TimelinePanelNew at 1500 lines re-rendering 60Hz, EditSubtitlesTab reconciling 100+ segment rows on every word tick). Proper fix direction (component extractions) written to [#57](https://github.com/Oghenefega/ClipFlow/issues/57#issuecomment-4267674430), deferred.

Fega's call end of session: **Electron 38 upgrade takes priority next session.** #57 stays open / unresolved.

Current HEAD: [c95f63f](https://github.com/Oghenefega/ClipFlow/commit/c95f63f) — Phase A on top of session 10's hop 1.

## 🎯 Next session: Electron 29 → 38+ upgrade

**Fega's call:** "I need to update the electron version to 38 at least." Single-hop target is Electron 38 (Chromium 132, Node 22). That's 9 major versions from current (29).

Tracked on [#45](https://github.com/Oghenefega/ClipFlow/issues/45) (title updated this session). **Open questions to resolve FIRST, before any `npm install`:**

1. **Hop granularity.** Single shot 29 → 38, or intermediate stops? Single shot = one clean commit, hardest to bisect regressions. Staged = 29→32→35→38 or similar = cleaner bisect but 4 sessions of work. Fega to decide start-of-session.
2. **Vite migration ordering vs Electron.** [#46](https://github.com/Oghenefega/ClipFlow/issues/46) (CRA → Vite) is on the same critical path. Electron-first keeps the surface smaller per hop; Vite-first unblocks chokidar/electron-store ESM upgrades ([#52](https://github.com/Oghenefega/ClipFlow/issues/52), [#53](https://github.com/Oghenefega/ClipFlow/issues/53)). Originally gated behind "Phase 1 landing" (Electron 32) — now that target shifted to 38, revisit.
3. **Native module compat.** Electron 38 ships Node 22. Currently on Node 20. Need to verify any native modules rebuild cleanly. `sql.js` is WASM (safe); check if any other native deps were added since session 10.
4. **File.path removal.** Electron 29 deprecated it but kept it functional. **Electron 30+ removes it entirely.** [#58](https://github.com/Oghenefega/ClipFlow/issues/58) migration (both callsites → `webUtils.getPathForFile()` via preload) is now **blocking** for any hop past 29. Either do it before the upgrade install or bundle it with the first hop that breaks it.
5. **react-scripts peer dep.** `--legacy-peer-deps` has been the standing install flag for Electron hops. Confirm it still works through to Electron 38, or budget for a pre-Vite patch if npm refuses to resolve.

**Session-start ritual:**
1. Read the Infrastructure Dashboard Section 9 (C1 entry) at `C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\infrastructure\ClipFlow Infrastructure.md` — the cadence decision from session 8 assumed stepwise through 32. The new 38+ target may warrant a dashboard update; flag it explicitly if so.
2. Read [#45](https://github.com/Oghenefega/ClipFlow/issues/45) comment thread (most recent comment has the new target rationale).
3. Read Electron breaking changes for every major from 30 through 38: [electronjs.org/docs/latest/breaking-changes](https://www.electronjs.org/docs/latest/breaking-changes). Focus on `protocol.registerFileProtocol` changes (we use `file://` URLs for editor source-file preview), `contextBridge` changes (safe via wrapper pattern but recheck), and any Node 20→22 breaking changes.
4. Go/no-go test for every hop: on a 30min+ source, drag the timeline zoom slider thumb rapidly left-right × 10. Zero crashes = hop clears. (Same repro that was #35 — confirmed fixed in hop 1, re-run as regression check every hop.)

## 🚫 DO NOT touch next session (again)

- **Do NOT retry the #57 store-derivation approach** in any form. That layer is rejected — the session's attempt broke it twice. If editor perf comes up incidentally during the Electron hop, note it but don't fix. Proper fix direction is component extraction, written to #57, deferred.
- Do NOT start [#46](https://github.com/Oghenefega/ClipFlow/issues/46) (Vite) mid-Electron-hop — see ordering question above, decide once up-front.
- Do NOT start H1 ([#47](https://github.com/Oghenefega/ClipFlow/issues/47)) or H3 ([#49](https://github.com/Oghenefega/ClipFlow/issues/49)) yet. Bundled for AFTER hops land.
- Do NOT touch H4 ([#50](https://github.com/Oghenefega/ClipFlow/issues/50)), H9 ([#56](https://github.com/Oghenefega/ClipFlow/issues/56)), or [#51](https://github.com/Oghenefega/ClipFlow/issues/51). All deferred per pre-beta priority framing.

## 🚫 What NOT to start in the next session

- Do NOT start hop 2 before #57 Phase A+B land. Fega's explicit decision.
- Do NOT attempt Phase C of #57 pre-emptively. Only if measurements show Phase B wasn't enough.
- Do NOT start the Vite migration ([#46](https://github.com/Oghenefega/ClipFlow/issues/46)). Gate remains Phase 1 landing (Electron 32).
- Do NOT start H1 (offscreen subtitle renderer hardening, [#47](https://github.com/Oghenefega/ClipFlow/issues/47)) or H3 (sandbox flip, [#49](https://github.com/Oghenefega/ClipFlow/issues/49)) yet. Bundled for AFTER hops land.
- Do NOT touch H9 CF Gateway hardening ([#56](https://github.com/Oghenefega/ClipFlow/issues/56)), H4 auto-updater research ([#50](https://github.com/Oghenefega/ClipFlow/issues/50)), or [#51](https://github.com/Oghenefega/ClipFlow/issues/51) code-signing. All deferred per pre-beta priority framing.

## 📋 Infrastructure board state after this session

| Item | Issue | Status |
|---|---|---|
| **#57 editor perf on long source** | [#57](https://github.com/Oghenefega/ClipFlow/issues/57) | 🔲 **UNRESOLVED** — Phase A kept, B + C reverted. Edit-subtitles still laggy. Deferred. |
| **#57 Phase A (DevTools + DBG strip)** | — | ✅ **landed this session** ([dbf6feb](https://github.com/Oghenefega/ClipFlow/commit/dbf6feb)) |
| **C1: Electron 29 → 38+ (revised target)** | [#45](https://github.com/Oghenefega/ClipFlow/issues/45) | 🔲 **next session** (Fega call this session: jump to 38 min) |
| **[#58] File.path → webUtils.getPathForFile** | [#58](https://github.com/Oghenefega/ClipFlow/issues/58) | 🔲 **BLOCKING next session** — Electron 30+ removes File.path |
| C1 Phase 1 Hop 1: Electron 28 → 29 | [#45](https://github.com/Oghenefega/ClipFlow/issues/45) | ✅ landed session 10 |
| #35 renderer crash | [#35](https://github.com/Oghenefega/ClipFlow/issues/35) | ✅ resolved session 10 — closed |
| H8 @types/node pin | [#55](https://github.com/Oghenefega/ClipFlow/issues/55) | ✅ done session 10 (^20 to match Node 20) |
| **[#59] editor render without queuing** | [#59](https://github.com/Oghenefega/ClipFlow/issues/59) | 🔲 dedicated session |
| H1 subtitle overlay hardening | [#47](https://github.com/Oghenefega/ClipFlow/issues/47) | 🔲 bundled with C1 smoke-test arc |
| H3 sandbox flip | [#49](https://github.com/Oghenefega/ClipFlow/issues/49) | 🔲 bundled with C1 smoke-test arc |
| C2 Vite migration | [#46](https://github.com/Oghenefega/ClipFlow/issues/46) | ⏸️ ordering-vs-Electron decision open; gate on C1 landing |
| H5 electron-store 8→11 | [#52](https://github.com/Oghenefega/ClipFlow/issues/52) | ⏸️ gated on Vite |
| H6 chokidar 3→4 | [#53](https://github.com/Oghenefega/ClipFlow/issues/53) | ⏸️ gated on Vite |
| H2 CSP | [#48](https://github.com/Oghenefega/ClipFlow/issues/48) | ⏸️ bundled with Vite (nonce-based) |
| H4 auto-updater research | [#50](https://github.com/Oghenefega/ClipFlow/issues/50) | ⏸️ deferred (post-beta) |
| H7 electron-builder 24→26 | [#54](https://github.com/Oghenefega/ClipFlow/issues/54) | ⏸️ bundled with H4 |
| H9 CF Gateway hardening | [#56](https://github.com/Oghenefega/ClipFlow/issues/56) | ⏸️ deferred (post-beta) |
| #51 code-signing cert | [#51](https://github.com/Oghenefega/ClipFlow/issues/51) | ⏸️ deferred indefinitely |

## Key Decisions (session 11)

1. **Electron upgrade target revised 32 → 38+.** Fega's call this session. Original C1 Phase 1 cadence was 28→29→30→31→32 stepwise. New target is Electron 38+ (latest / near-latest), but granularity (single-shot vs staged) left open for next session start.
2. **#57 fix approach rejected — both Phase B layers.** The store-derived-discrete-state approach (forward-scan helpers computing active seg/word inside `setCurrentTime`) does NOT work: it broke word highlighting in both tabs and regressed Transcript tab to laggy. Rolled back twice. Do not retry in any form. Proper fix is **component-size reduction** (extract TimelinePlayhead + SegmentRow as memoized children) — written up on #57, deferred.
3. **#57 stays OPEN.** Edit-subtitles tab remains laggy on 30min+ sources. Phase A (DevTools + DBG strip) provided some relief but did not resolve. Explicitly acknowledged unresolved by Fega; not a blocker for Electron 38 work.
4. **Two-attempt rule triggered mid-session.** Phase B landed → user reported issues → Phase C hotfix attempted → still broken → revert. Per user global rule: do not guess-patch a third time. Escalated to full re-diagnosis, which found the real root cause (component size, not subscription count).

## Key Decisions (preserved from prior sessions)

- **`@electron/rebuild` (not `electron-rebuild`) is the standing scoped-package name** for all future hops. Committed session 10.
- **`--legacy-peer-deps` is the standing install flag for electron hops** while react-scripts still pins TS 3||4 peer deps. Reassess post-Vite.
- **#35 closed proactively on Pattern A success** (session 10). Pattern B/C share the Chromium stack so expected fixed; monitor Sentry.

## Watch Out For

- **Edit-subtitles tab is still laggy on 30min+ sources.** This is known and documented on [#57](https://github.com/Oghenefega/ClipFlow/issues/57). Do not try to fix incidentally during the Electron hop — perf and upgrade regressions become impossible to attribute.
- **Do NOT re-attempt the store-derivation fix direction for #57.** The component-extraction approach is the correct layer. Full write-up on [#57 comment](https://github.com/Oghenefega/ClipFlow/issues/57#issuecomment-4267674430).
- **Electron 30+ removes `File.path`.** [#58](https://github.com/Oghenefega/ClipFlow/issues/58) is now blocking the next Electron hop (any hop past 29). Two callsites: `src/renderer/views/RenameView.js:1222` and `src/renderer/views/UploadView.js:313`. Migrate to `webUtils.getPathForFile()` via a new preload bridge method before or during the first hop that breaks it.
- **Phase A DID help perceived smoothness.** DevTools force-opened + debug-log spam in playback hot paths was real overhead. Do NOT re-introduce in dev work.
- **The zoom-slider drag repro is the standing go/no-go for every Electron hop.** Don't skip. Fast and reliable on 30min+ sources.
- **`--legacy-peer-deps` audit warnings are expected noise** — transitive vulns in dev-only build tooling (webpack-dev-server ancestry, nth-check). Don't chase them during hops; resolve naturally with Vite migration.
- **Don't re-litigate committed infrastructure decisions.** Section 9 of the dashboard is canonical. If the new Electron 38 target invalidates the stepwise-to-32 cadence decision, flag it explicitly so the dashboard can update — don't silently deviate.

## Logs / Debugging

- **Infra dashboard:** `C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\infrastructure\ClipFlow Infrastructure.md` (read Section 9 before any infra work)
- **#35 repro recipe** (use as go/no-go each hop): `npm start` → open editor on a clip whose source is a 30min+ OBS recording → drag the timeline zoom slider thumb rapidly left-right for ~5-10s. Hop 1 result: **no crash**.
- **#35 Sentry issue** (resolved, keep monitoring): `7381799876`. If any event appears with `blink::DOMDataStore::GetWrapper` on the v29+ build, reopen.
- **Sentry API:** token at `C:\Users\IAmAbsolute\.claude\sentry_token.txt`. Event list: `https://sentry.io/api/0/organizations/flowve/issues/{id}/events/`. Single event: `https://sentry.io/api/0/organizations/flowve/issues/{id}/events/{eventID}/`.
- **Breadcrumb mining reminder:** Sentry's default `ui.click` instrumentation does NOT capture pointer drag sequences, only synthetic clicks. For drag-triggered crashes, breadcrumb trails look deceptively benign.
- **Electron breaking changes:** [electronjs.org/docs/latest/breaking-changes](https://www.electronjs.org/docs/latest/breaking-changes). Read the v30 section first thing in hop 2.
- **All infra issues filter:** `gh issue list --repo Oghenefega/ClipFlow --state open --search "milestone:commercial-launch"`
- **Hop 1 commit SHA:** pending (final commit of this session).

---

## Session 9 handoff (preserved)

_Diagnostic + planning. Step 0 of C1 Electron arc: #35 minimal repro established on stock Electron 28._

1. **Minimal repro for #35 confirmed live by Fega.** Open a clip with a 30min+ source → grab the timeline zoom slider thumb → drag left-right rapidly for ~5-10 seconds → renderer crashes with `0xC0000005 ACCESS_VIOLATION_READ`. *(Session 10 update: this repro no longer crashes on Electron 29 / Chromium 122. #35 closed.)*
2. **Three crash patterns documented from breadcrumb mining across 12 events.** Pattern A = timeline interaction; Pattern B = idle projects-tab after preview-frame extraction on 30min+ sources; Pattern C = clip-open within 1-3s of `<video>` load. All three share the Chromium 120 fetch-stream UAF stack.
3. **Diagnostic writeup** at [#35 comment](https://github.com/Oghenefega/ClipFlow/issues/35#issuecomment-4266632249).
4. **[#51](https://github.com/Oghenefega/ClipFlow/issues/51) deferred indefinitely** — no funds, no beta cohort.

## Session 8 handoff (preserved)

_Infrastructure dashboard bootstrap + 11-decision walkthrough (no code changes)._

1. **Bootstrapped an evergreen infrastructure dashboard** at `C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\infrastructure\ClipFlow Infrastructure.md`. Full stack inventory, severity-tagged findings, current-decisions-in-flight log, self-contained drift-catching refresh prompt.
2. **Walked 11 decisions item-by-item with Fega** — all Criticals (C1, C2) and all Highs (H1–H9). Each committed decision logged in Section 9.
3. **10 new GitHub issues filed** — [#47](https://github.com/Oghenefega/ClipFlow/issues/47) through [#56](https://github.com/Oghenefega/ClipFlow/issues/56). All labelled `milestone: commercial-launch`.
4. **CLAUDE.md pointers added** in repo (filtered, default-off) and in Obsidian vault's ClipFlow business CLAUDE.md.
5. **Mediums, Lows, Unknowns U1+U2 NOT yet walked** — future dedicated session.

## Session 7 handoff (preserved)

_Modernization plan + LLM Council review (planning only)._

1. **[#46](https://github.com/Oghenefega/ClipFlow/issues/46) filed** — epic chore: CRA → Vite, React 18 → 19, selective dep audit.
2. **LLM Council** caught the unanimous blind spot: #35 crash repro needed before any Electron decision. *(Session 9/10 update: premise verified, #35 fixed in hop 1.)*
3. **Modernization work PAUSED** pending architecture audit. *(Session 8 update: that audit became the dashboard.)*

## Session 6 handoff (preserved)

1. **#35 root cause narrowed**, fix deferred to Electron upgrade. *(Session 9/10 update: Chromium 122 fixes resolved it.)*
2. **#38 closed.** `cutClip` probes source fps and passes `-r <fps>`.
3. **#45 filed** — Electron 28 → 32 stepwise upgrade.
