# ClipFlow — Session Handoff
_Last updated: 2026-04-17 (session 13) — "CRA → Vite, C2 closed"_

---

## TL;DR

Replaced **Create React App with Vite 6.4.2** in one commit ([#46](https://github.com/Oghenefega/ClipFlow/issues/46)). 1111 transitive packages removed. Bundle 1.85 MB minified. Closed the second of the two Critical items on the infrastructure dashboard — **both C1 and C2 are now resolved**.

One gotcha surfaced and was fixed: Rollup's CJS plugin (under `transformMixedEsModules: true`) hoisted the lazy `require()` pattern used in 4 Zustand stores into eager imports, causing a TDZ crash on first launch. Converted 12 `require()` sites to top-level ESM imports — cycle is still there topologically, ESM live bindings resolve it because access is inside function bodies.

Smoke tests passed on the three user-critical paths: [#35](https://github.com/Oghenefega/ClipFlow/issues/35) zoom-slider on a 30min+ source, drop-to-Rename + rename, render a clip end-to-end. Drop-to-Upload skipped pending [#60](https://github.com/Oghenefega/ClipFlow/issues/60) test-mode toggle.

**#46 closed. #60 filed** (test-mode toggle Fega wants for dogfooding).

Current HEAD: pending — final commit of this session.

## 🎯 Next session — pick one (no blocker forces it)

Both Critical items are gone. The remaining infra arc has three natural next steps:

1. **[#57](https://github.com/Oghenefega/ClipFlow/issues/57) editor perf — proper fix direction.** Component extraction approach at [#57 comment](https://github.com/Oghenefega/ClipFlow/issues/57#issuecomment-4267674430): extract `<TimelinePlayhead />` from TimelinePanelNew + `<SegmentRow />` as `React.memo`'d child from LeftPanelNew. Fega's actual friction on long sources. Do **NOT** retry the store-derivation approach in any form.
2. **[#52](https://github.com/Oghenefega/ClipFlow/issues/52) electron-store 8→11 + [#53](https://github.com/Oghenefega/ClipFlow/issues/53) chokidar 3→4 (H5/H6).** Both ESM-only, both now unblocked by Vite. chokidar is the higher-risk of the two (underpins the OBS recording watcher — any `awaitWriteFinish` regression silently breaks the top of the pipeline). Can be one focused session.
3. **[#60](https://github.com/Oghenefega/ClipFlow/issues/60) test-mode toggle.** Pre-launch dogfooding tool. Per-clip `testMode` flag on Rename/Upload/Projects tabs, routes renames/renders/uploads to a Test area so Fega can exercise the pipeline without polluting his real recording archive. Schema migration required. Small-medium size.

If unsure: **#60** is the lowest-friction win that unblocks Fega's own daily testing.

## 🚫 DO NOT touch next session (preserved)

- **Do NOT retry the #57 store-derivation approach** in any form. That layer is rejected — session 11 broke it twice.
- **Do NOT skip the zoom-slider repro on any future infra hop.** Standing go/no-go for Electron and build-tool changes.
- Do NOT touch H4 ([#50](https://github.com/Oghenefega/ClipFlow/issues/50)), H9 ([#56](https://github.com/Oghenefega/ClipFlow/issues/56)), or [#51](https://github.com/Oghenefega/ClipFlow/issues/51). All deferred per pre-beta priority framing.

## 📋 Infrastructure board state after this session

| Item | Issue | Status |
|---|---|---|
| **C1 Electron upgrade arc** | [#45](https://github.com/Oghenefega/ClipFlow/issues/45) | ✅ closed session 12 |
| **C2 Vite migration** | [#46](https://github.com/Oghenefega/ClipFlow/issues/46) | ✅ **closed session 13** — CRA 5.0.1 → Vite 6.4.2 |
| **#58 File.path migration** | [#58](https://github.com/Oghenefega/ClipFlow/issues/58) | ✅ closed session 12 |
| **H8 @types/node pin** | [#55](https://github.com/Oghenefega/ClipFlow/issues/55) | ✅ closed session 12 |
| **#35 renderer crash** | [#35](https://github.com/Oghenefega/ClipFlow/issues/35) | ✅ closed session 10 |
| **#57 editor perf on long source** | [#57](https://github.com/Oghenefega/ClipFlow/issues/57) | 🔲 UNRESOLVED — proper fix direction documented, deferred |
| **#59 editor render without queuing** | [#59](https://github.com/Oghenefega/ClipFlow/issues/59) | 🔲 dedicated session |
| **#60 test-mode toggle** | [#60](https://github.com/Oghenefega/ClipFlow/issues/60) | 🔲 **new this session** — per-clip testMode for dogfooding |
| H1 subtitle overlay hardening | [#47](https://github.com/Oghenefega/ClipFlow/issues/47) | 🔲 ready |
| H3 sandbox flip | [#49](https://github.com/Oghenefega/ClipFlow/issues/49) | 🔲 ready |
| H5 electron-store 8→11 | [#52](https://github.com/Oghenefega/ClipFlow/issues/52) | 🔲 **UNBLOCKED this session** (was gated on Vite) |
| H6 chokidar 3→4 | [#53](https://github.com/Oghenefega/ClipFlow/issues/53) | 🔲 **UNBLOCKED this session** (was gated on Vite) |
| H2 CSP | [#48](https://github.com/Oghenefega/ClipFlow/issues/48) | 🔲 UNBLOCKED — bundled-with-Vite plan no longer gating, nonce-based policy still needed |
| H4 auto-updater research | [#50](https://github.com/Oghenefega/ClipFlow/issues/50) | ⏸️ deferred (post-beta) |
| H7 electron-builder 24→26 | [#54](https://github.com/Oghenefega/ClipFlow/issues/54) | ⏸️ bundled with H4 |
| H9 CF Gateway hardening | [#56](https://github.com/Oghenefega/ClipFlow/issues/56) | ⏸️ deferred (post-beta) |
| #51 code-signing cert | [#51](https://github.com/Oghenefega/ClipFlow/issues/51) | ⏸️ deferred indefinitely |

## Key Decisions (session 13)

1. **Kept output dir at `build/`.** Vite's convention is `dist/` but flipping it would require touching [src/main/main.js:320](src/main/main.js:320) and [src/main/subtitle-overlay-renderer.js:149](src/main/subtitle-overlay-renderer.js:149) `loadFile` paths. Keeping `build/` contains the migration to build-tooling files only — main process is untouched.
2. **`.js` files in `src/` treated as JSX via custom Vite plugin.** CRA-era convention — Vite's default is `.jsx`/`.tsx` only. Wrote a small `transformWithEsbuild` plugin that skips CJS files (`^module.exports = ` regex guard) so the 5 CJS utility files in `src/renderer/editor/` (also `require()`d by [src/main/render.js](src/main/render.js)) go through Rollup's CJS plugin instead.
3. **Rejected: converting the 5 CJS utility files to ESM.** They're `require()`'d by the CommonJS main process (`src/main/render.js:5-6` pulls `timeMapping` and `segmentModel`). Converting them would require restructuring the main process — out of scope for a build-tool swap.
4. **Lazy `require()` pattern is incompatible with Vite.** Webpack tolerated runtime `require()` inside ESM function bodies as a deliberate cycle-break; Rollup's CJS plugin hoists them eagerly. Replaced with top-level ESM imports + function-body access (ESM live bindings handle the cycle). Do NOT use `require()` in renderer source files going forward.
5. **Build-tool migration means commercial-launch is closer to green than before.** Both Critical items resolved. The remaining launch blockers are H1/H2/H3 security hardening, H4/H7/#51 distribution (auto-updater + code-signing), H9 Cloudflare gateway hardening, and #57 editor perf. No substrate work remains.

## Key Decisions (preserved from prior sessions)

- **`@electron/rebuild` (not `electron-rebuild`) is the standing scoped-package name** for future native-rebuild work.
- **`--legacy-peer-deps` was the standing install flag during the CRA era.** Reassess once H5/H6 land; likely can be dropped.
- **Plans in chat must be plain-language first.** Lead with what each step DOES, not Phase A/B/C labels.
- **Infrastructure dashboard Section 9 is canonical.** Do not re-litigate committed decisions silently; flag and update.

## Watch Out For

- **Edit-subtitles tab is still laggy on 30min+ sources** ([#57](https://github.com/Oghenefega/ClipFlow/issues/57)). The Vite migration did not affect this — bundle is smaller and initial load is faster, but the per-frame component re-render cliff is unchanged.
- **The zoom-slider drag repro is the standing go/no-go** for every substrate change (Electron hops, build tool swaps). Passed cleanly on Vite.
- **`npm run build` (electron-builder packaging) was NOT exercised this session.** Same state as after session 12 — only `electron .` (which doesn't go through electron-builder) was smoke-tested. If packaging breaks on Vite output, treat as the trigger for H7 ([#54](https://github.com/Oghenefega/ClipFlow/issues/54)) bundled with H4 ([#50](https://github.com/Oghenefega/ClipFlow/issues/50)) per session 8 plan.
- **DevTools Console shows two harmless warnings:** (1) "No manifest detected" from the Application panel — ClipFlow is not a PWA, ignore. (2) "Insecure Content-Security-Policy" — this is [#48](https://github.com/Oghenefega/ClipFlow/issues/48) (H2 CSP), pre-existing, dev-only warning that disappears in packaged builds. Neither is a Vite regression.
- **`require()` in renderer source is now banned.** Rollup hoists eagerly and breaks circular-dep patterns that CRA tolerated. If a lazy import is truly needed, use dynamic `import()` instead.

## Logs / Debugging

- **Infra dashboard:** `C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\infrastructure\ClipFlow Infrastructure.md` — frontmatter (`critical-items: 1 → 0`), Section 7 C2, Section 9 C2 updated this session
- **App startup verification:** logs show `electron: "40.9.1"` + `Database initialized at ... (schema v4)` + multiple `(preview)` frame-generation lines. The preview lines specifically prove the renderer is alive and calling IPC — use that as a smoke signal on future substrate changes.
- **TDZ diagnosis workflow for future bundle errors:** temporarily set `build.minify: false` in `vite.config.js`, rebuild, and the error will surface a real symbol name instead of the minified one (`Le` → `useSubtitleStore` this session). Revert before commit.
- **Sentry API:** token at `C:\Users\IAmAbsolute\.claude\sentry_token.txt`. Watch Vite-built renderer for any new blank-screen / TDZ events — shouldn't happen but worth monitoring for a few sessions.
- **Build artifact size:** 1.85 MB minified, 540 KB gzip, 2727 modules. Rollup's chunk-size warning fires at 500 KB — next optimization pass could look at `manualChunks` or `dynamic import()` code-splitting, but not urgent (whole app loads in one shot, no network cost in Electron).
- **All open infra issues filter:** `gh issue list --repo Oghenefega/ClipFlow --state open --search "milestone:commercial-launch"`
- **Session 13 commit SHA:** pending (final commit of this session)

---

## Session 12 handoff (preserved)

_Single-shot Electron upgrade 29.4.6 → 40.9.1 landed in one commit, bundled with the #58 `File.path` → `webUtils.getPathForFile()` migration. C1 closed; H8 closed. `electron-builder` left at v24.13.3 per session 8 plan (H7 bundled with H4)._

## Session 11 handoff (preserved)

_#57 Phase A landed; Phase B + Phase C hotfix reverted. Root cause re-diagnosed (component size, not subscription count). Proper fix direction (component extraction) deferred — Electron 38+ upgrade prioritized for session 12._

## Session 10 handoff (preserved)

_C1 Phase 1 hop 1: Electron 28 → 29 (Chromium 120 → 122, Node 18 → 20). #35 renderer crash resolved. H8 first bump (^25 → ^20). #57 surfaced during testing. #58 + #59 filed._

## Session 9 handoff (preserved)

_Diagnostic + planning. Step 0 of C1 Electron arc: #35 minimal repro established on stock Electron 28._ *(Resolved session 10.)*

## Session 8 handoff (preserved)

_Infrastructure dashboard bootstrap + 11-decision walkthrough. 10 new GitHub issues filed (#47-#56)._

## Session 7 handoff (preserved)

_Modernization plan ([#46](https://github.com/Oghenefega/ClipFlow/issues/46)) + LLM Council review. Council caught the unanimous blind spot: #35 crash repro before any Electron decision._
