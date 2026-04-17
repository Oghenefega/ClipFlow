# ClipFlow — Session Handoff
_Last updated: 2026-04-17 (session 12) — "Electron 29 → 40 single-shot, C1 closed"_

---

## TL;DR

Single-shot Electron upgrade **29.4.6 → 40.9.1** (Chromium 122 → 136, Node 20 → 22) landed in one commit, bundled with the [#58](https://github.com/Oghenefega/ClipFlow/issues/58) `File.path` → `webUtils.getPathForFile()` migration that became blocking at Electron 30+. All three smoke tests passed: #35 zoom-slider crash repro on a 30min+ source (no crash), drop-to-Rename (file in pending list), drop-to-Upload (import progress + game-name prompt fired).

**C1 closed.** ClipFlow is now one major behind current stable (41), inside Electron's "latest 3 majors" support window. **H8 closed** (`@types/node` ^22 to match Node 22). **#45, #55, #58 closed**.

Current HEAD: pending — final commit of this session.

## 🎯 Next session — pick one (no blocker forces it)

C1's gravitational pull is gone. The remaining infra arc has three natural next steps; pick whichever matches your appetite:

1. **[#57](https://github.com/Oghenefega/ClipFlow/issues/57) editor perf with the proper fix direction.** Component extraction approach written up at [#57 comment](https://github.com/Oghenefega/ClipFlow/issues/57#issuecomment-4267674430): extract `<TimelinePlayhead />` from TimelinePanelNew + `<SegmentRow />` as `React.memo`'d child from LeftPanelNew. Fega's actual pain point on long sources. Do **NOT** retry the store-derivation approach in any form.
2. **[#46](https://github.com/Oghenefega/ClipFlow/issues/46) Vite migration (CRA → Vite).** Now fully unblocked — was gated on "C1 Phase 1 landing", which is now superseded. Unlocks #52 (electron-store v11) and #53 (chokidar v4) as the same arc. Pre-launch sequencing matters: installer paths lock in at v1.0.
3. **H1 ([#47](https://github.com/Oghenefega/ClipFlow/issues/47)) + H3 ([#49](https://github.com/Oghenefega/ClipFlow/issues/49)) security hardening.** Originally bundled with the C1 smoke-test arc but skipped this session because the single-shot upgrade was risk-budget enough on its own. Both are small-medium, both share the offscreen-subtitle-renderer surface. Could be a clean focused session.

If unsure: **#57** is the highest-friction-on-Fega-right-now item.

## 🚫 DO NOT touch next session (preserved)

- **Do NOT retry the #57 store-derivation approach** in any form. That layer is rejected — session 11 broke it twice.
- **Do NOT skip the zoom-slider repro on the next infra hop.** Standing go/no-go test for any Electron version change.
- Do NOT touch H4 ([#50](https://github.com/Oghenefega/ClipFlow/issues/50)), H9 ([#56](https://github.com/Oghenefega/ClipFlow/issues/56)), or [#51](https://github.com/Oghenefega/ClipFlow/issues/51). All deferred per pre-beta priority framing.

## 📋 Infrastructure board state after this session

| Item | Issue | Status |
|---|---|---|
| **C1 Electron upgrade arc** | [#45](https://github.com/Oghenefega/ClipFlow/issues/45) | ✅ **closed session 12** — single-shot 29 → 40 landed |
| **#58 File.path migration** | [#58](https://github.com/Oghenefega/ClipFlow/issues/58) | ✅ **closed session 12** — bundled with Electron 40 commit |
| **H8 @types/node pin** | [#55](https://github.com/Oghenefega/ClipFlow/issues/55) | ✅ **closed session 12** — ^22 to match Node 22 |
| **#35 renderer crash** | [#35](https://github.com/Oghenefega/ClipFlow/issues/35) | ✅ closed session 10 |
| **#57 editor perf on long source** | [#57](https://github.com/Oghenefega/ClipFlow/issues/57) | 🔲 UNRESOLVED — proper fix direction documented, deferred |
| **#59 editor render without queuing** | [#59](https://github.com/Oghenefega/ClipFlow/issues/59) | 🔲 dedicated session |
| H1 subtitle overlay hardening | [#47](https://github.com/Oghenefega/ClipFlow/issues/47) | 🔲 ready (was bundled with C1 arc, skipped this session) |
| H3 sandbox flip | [#49](https://github.com/Oghenefega/ClipFlow/issues/49) | 🔲 ready (was bundled with C1 arc, skipped this session) |
| C2 Vite migration | [#46](https://github.com/Oghenefega/ClipFlow/issues/46) | 🔲 fully unblocked — gate (C1 landing) cleared this session |
| H5 electron-store 8→11 | [#52](https://github.com/Oghenefega/ClipFlow/issues/52) | ⏸️ gated on Vite |
| H6 chokidar 3→4 | [#53](https://github.com/Oghenefega/ClipFlow/issues/53) | ⏸️ gated on Vite |
| H2 CSP | [#48](https://github.com/Oghenefega/ClipFlow/issues/48) | ⏸️ bundled with Vite (nonce-based) |
| H4 auto-updater research | [#50](https://github.com/Oghenefega/ClipFlow/issues/50) | ⏸️ deferred (post-beta) |
| H7 electron-builder 24→26 | [#54](https://github.com/Oghenefega/ClipFlow/issues/54) | ⏸️ bundled with H4 |
| H9 CF Gateway hardening | [#56](https://github.com/Oghenefega/ClipFlow/issues/56) | ⏸️ deferred (post-beta) |
| #51 code-signing cert | [#51](https://github.com/Oghenefega/ClipFlow/issues/51) | ⏸️ deferred indefinitely |

## Key Decisions (session 12)

1. **Single-shot 29 → 40 chosen over staged hops.** Fega's call: "40 is a good enough place." Original stepwise plan (28→32 → min-2-hop to current) revised mid-arc. Trade-off: bisect granularity gone if a regression appears later, mitigated by (a) conservative target (40 not 41), (b) strict pre-install native-deps audit, (c) #58 bundling forced by Electron 30+ removal of `File.path`. Dashboard Section 9 C1 updated with the revision history.
2. **`electron-builder` left at v24.13.3.** H7 upgrade still bundled with H4 auto-updater work per session 8 decision. Packaging path (`npm run build`) NOT exercised this session — only `electron .` (which doesn't go through electron-builder) was smoke-tested. If `npm run build` fails on Electron 40 in a future session, that's H7 forcing the issue and should be done bundled with #50.
3. **Vite migration gate (C1 landing) cleared.** [#46](https://github.com/Oghenefega/ClipFlow/issues/46) is now fully unblocked. No artificial dependency remains.
4. **Native deps audit pattern established.** Pre-install: `find node_modules -name binding.gyp` + `find node_modules -name "*.node"`. Both empty = no `electron-rebuild` needed. Re-run before any future Electron hop that crosses Node majors.

## Key Decisions (preserved from prior sessions)

- **`@electron/rebuild` (not `electron-rebuild`) is the standing scoped-package name** for any future native-rebuild work. Currently a no-op (no native deps) but keep installed.
- **`--legacy-peer-deps` is the standing install flag for electron hops** while react-scripts still pins TS 3||4 peer deps. Reassess post-Vite (#46).
- **Plans in chat must be plain-language first.** Lead with what each step DOES, not Phase A/B/C labels.

## Watch Out For

- **Edit-subtitles tab is still laggy on 30min+ sources.** This is [#57](https://github.com/Oghenefega/ClipFlow/issues/57). The Electron 40 hop did not fix it (Phase A from session 11 helped a little, the underlying component-size cliff remains). Do NOT try to fix incidentally during other work — perf and substrate regressions become impossible to attribute.
- **Do NOT re-attempt the #57 store-derivation fix direction.** Component-extraction is the correct layer. Full write-up on [#57 comment](https://github.com/Oghenefega/ClipFlow/issues/57#issuecomment-4267674430).
- **The zoom-slider drag repro is the standing go/no-go for every Electron hop.** Don't skip. Fast and reliable on 30min+ sources. Passed cleanly on Electron 40 this session.
- **`--legacy-peer-deps` audit warnings are expected noise** — transitive vulns in dev-only build tooling (webpack-dev-server ancestry, nth-check). Don't chase them during hops; resolve naturally with Vite migration.
- **Don't re-litigate committed infrastructure decisions.** Section 9 of the dashboard is canonical. The C1 cadence revision (single-shot to 40) is recorded with reasoning — future sessions inherit that.
- **If `npm run build` (packaging) is exercised on Electron 40, electron-builder 24 may surprise us.** It's not tested at this combination. If packaging breaks, treat as the trigger for H7 (#54) and bundle with H4 (#50) per the session 8 plan.

## Logs / Debugging

- **Infra dashboard:** `C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\infrastructure\ClipFlow Infrastructure.md` — frontmatter and Section 7 C1/H8 + Section 9 C1/H8 updated this session
- **App startup verification:** logs show `electron: "40.9.1"` and `Database initialized at ... (schema v4)` — paste these strings into a smoke check next session if anything looks off
- **Sentry API:** token at `C:\Users\IAmAbsolute\.claude\sentry_token.txt`. Event list: `https://sentry.io/api/0/organizations/flowve/issues/{id}/events/`. Watch for any new `blink::DOMDataStore` or fetch-stream UAF events on the v40 build (expected: zero — Chromium 136 is well past the 122-fix that resolved #35)
- **#35 Sentry issue:** `7381799876` — closed but keep monitored. Reopen if v40 events appear
- **Electron 40 breaking changes reference:** [electronjs.org/docs/latest/breaking-changes](https://www.electronjs.org/docs/latest/breaking-changes) — useful for v40 → v41 jump if/when that becomes a Medium maintenance item
- **All open infra issues filter:** `gh issue list --repo Oghenefega/ClipFlow --state open --search "milestone:commercial-launch"`
- **Session 12 commit SHA:** pending (final commit of this session)

---

## Session 11 handoff (preserved)

_#57 Phase A landed; Phase B + Phase C hotfix reverted. Root cause re-diagnosed (component size, not subscription count). Proper fix direction (component extraction) deferred — Electron 38+ upgrade prioritized for session 12._

1. **#57 fix approach rejected — both Phase B layers.** Store-derived discrete-state broke word highlighting in both tabs and regressed Transcript tab to laggy. Do not retry in any form.
2. **Two-attempt rule triggered mid-session.** Phase B → user reported issues → Phase C hotfix → still broken → revert. Per global rule.
3. **Electron upgrade target revised 32 → 38+.** *(Session 12 update: revised again to 40, executed single-shot.)*

## Session 10 handoff (preserved)

_C1 Phase 1 hop 1: Electron 28 → 29 (Chromium 120 → 122, Node 18 → 20). #35 renderer crash resolved. H8 first bump (^25 → ^20). #57 surfaced during testing. #58 + #59 filed._

## Session 9 handoff (preserved)

_Diagnostic + planning. Step 0 of C1 Electron arc: #35 minimal repro established on stock Electron 28._ *(Resolved session 10.)*

## Session 8 handoff (preserved)

_Infrastructure dashboard bootstrap + 11-decision walkthrough. 10 new GitHub issues filed (#47-#56)._

## Session 7 handoff (preserved)

_Modernization plan ([#46](https://github.com/Oghenefega/ClipFlow/issues/46)) + LLM Council review. Council caught the unanimous blind spot: #35 crash repro before any Electron decision._
