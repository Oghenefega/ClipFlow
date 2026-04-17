# ClipFlow — Session Handoff
_Last updated: 2026-04-17 (session 10) — "Electron 28 → 29 landed (C1 Phase 1, hop 1 of 4) — #35 resolved"_

---

## TL;DR

First hop of the C1 Electron upgrade arc landed cleanly. Electron **28.3.3 → 29.4.6** (Chromium 120 → 122, Node 18 → 20). The `blink::DOMDataStore` renderer crash ([#35](https://github.com/Oghenefega/ClipFlow/issues/35)) is **resolved** — Pattern A repro (zoom-slider drag on 30min+ source × 10) no longer crashes on Chromium 122. Issue closed.

1. **Electron 29 live.** `electron@^29.4.6`, `@electron/rebuild@^3.7.2` installed, `@types/node` bumped `^20`, build + launch clean, full smoke test pass (editor, timeline, render, OAuth listener).
2. **No native-dep rebuild cost** — `sql.js` is WASM so `@electron/rebuild` is a no-op. The rebuild command now exists in the dev deps ready for future native modules.
3. **#35 go/no-go test PASSED on both short and 30min+ sources.** Zero crashes. Closed with resolution comment referencing Chromium 122's fetch-stream UAF fixes.
4. **Electron 29 breaking-change review found zero code changes required this hop** — `preload.js` already uses the safe wrapper-per-method pattern, we don't listen for the removed `will-navigate` legacy event, and `File.path` is still functional (deprecation only). `File.path` migration tracked at [#58](https://github.com/Oghenefega/ClipFlow/issues/58) for a future hop (v30 or v31 will remove it).
5. **Editor lag on 30-minute sources surfaced during testing — NOT a hop regression.** Root cause diagnosed (60fps re-render storm across 5 top-level subscribers to `currentTime`). Filed as [#57](https://github.com/Oghenefega/ClipFlow/issues/57) with full forensics.
6. **Fega flagged "editor can't render without queuing for upload" during testing** — pre-existing UX gap, filed as [#59](https://github.com/Oghenefega/ClipFlow/issues/59).

## 🎯 Next session: C1 Phase 1, Hop 2 — Electron 29 → 30

Per the committed cadence in Section 9 of the infrastructure dashboard ([C1 decision, 2026-04-17](https://github.com/Oghenefega/ClipFlow/issues/45)), Phase 1 continues stepwise: **29 ✅ → 30 → 31 → 32**. One major per session.

**Hop 2 work (60-90 min estimate):**

1. `npm install electron@30 --legacy-peer-deps`. The `--legacy-peer-deps` flag is required because react-scripts's TS 3||4 peer constraint is incompatible with TS 5+ hoisted by modern deps; this was needed in hop 1 too.
2. `npx @electron/rebuild` — still a no-op until we add native deps, keep the habit.
3. **Read Electron 30 breaking changes** — [electronjs.org/docs/latest/breaking-changes](https://www.electronjs.org/docs/latest/breaking-changes). Focus on: Chromium 124 changes, Node 20.x deprecations, any `protocol.registerFileProtocol` / `session.protocol` changes (we use `file://` URLs for the editor's source-file preview — anything in that area could bite), `contextBridge` changes (we're safe via wrapper pattern but recheck).
4. **Check File.path status.** If v30 removes it (likely), [#58](https://github.com/Oghenefega/ClipFlow/issues/58) becomes blocking for the hop. Migrate both callsites (`RenameView.js:1222`, `UploadView.js:313`) to `webUtils.getPathForFile()` via a new preload bridge method. If v30 still only deprecates, defer to hop 3.
5. `npx react-scripts build && npm start` — smoke tests (same checklist as hop 1):
   - App launches, main window + DevTools open
   - Editor opens a clip, `<video>` plays, timeline scrubs
   - Render a test clip end-to-end
   - OAuth localhost listener binds (open TikTok or YouTube connect flow)
6. **Re-run the #35 go/no-go test.** Even though it passed on 29, confirm no regression on 30 (zoom slider drag × 10 on 30min+ source). If any of Pattern B (idle projects-tab crash) or Pattern C (clip-open crash) resurfaces in Sentry on fresh 30 builds, treat as a hop 2 blocker — reopen #35 with a subscript.
7. **Commit separately:** `Upgrade Electron 29 → 30 (hop 2 of 4, C1 Phase 1)`.
8. **Update CHANGELOG + HANDOFF** at hop-end.

## 🚫 What NOT to start in the next session

- Do NOT attempt 29 → 32 in a single jump. One major per session — skipping compounds breakage.
- Do NOT start the Vite migration ([#46](https://github.com/Oghenefega/ClipFlow/issues/46)). Gate remains Phase 1 landing (Electron 32).
- Do NOT start H1 (offscreen subtitle renderer hardening, [#47](https://github.com/Oghenefega/ClipFlow/issues/47)) or H3 (sandbox flip, [#49](https://github.com/Oghenefega/ClipFlow/issues/49)) yet. Bundled for AFTER hops land.
- Do NOT pivot to [#57](https://github.com/Oghenefega/ClipFlow/issues/57) (editor perf) during hop 2. It's its own dedicated session — the fix touches Zustand subscription patterns across 5 files and needs clean headspace. Hop 2 must stay focused.
- Do NOT touch H9 CF Gateway hardening ([#56](https://github.com/Oghenefega/ClipFlow/issues/56)), H4 auto-updater research ([#50](https://github.com/Oghenefega/ClipFlow/issues/50)), or [#51](https://github.com/Oghenefega/ClipFlow/issues/51) code-signing. All deferred per pre-beta priority framing.

## 📋 Infrastructure board state after this session

| Item | Issue | Status |
|---|---|---|
| **#35 renderer crash** | [#35](https://github.com/Oghenefega/ClipFlow/issues/35) | ✅ **resolved this session** — closed |
| **C1 Phase 1 Hop 1: Electron 28 → 29** | [#45](https://github.com/Oghenefega/ClipFlow/issues/45) | ✅ **landed this session** |
| **C1 Phase 1 Hop 2: Electron 29 → 30** | [#45](https://github.com/Oghenefega/ClipFlow/issues/45) | 🔲 **next session** |
| H8 @types/node pin | [#55](https://github.com/Oghenefega/ClipFlow/issues/55) | ✅ done (now at ^20 to match Node 20) |
| **[#57] editor perf on long source** | [#57](https://github.com/Oghenefega/ClipFlow/issues/57) | 🔲 dedicated session — do NOT inline with hops |
| **[#58] File.path deprecation migration** | [#58](https://github.com/Oghenefega/ClipFlow/issues/58) | 🔲 blocking hop 2 or hop 3 (whichever removes it) |
| **[#59] editor render without queuing** | [#59](https://github.com/Oghenefega/ClipFlow/issues/59) | 🔲 dedicated session |
| H1 subtitle overlay hardening | [#47](https://github.com/Oghenefega/ClipFlow/issues/47) | 🔲 bundled with C1 Phase 1 smoke-test arc |
| H3 sandbox flip | [#49](https://github.com/Oghenefega/ClipFlow/issues/49) | 🔲 bundled with C1 Phase 1 smoke-test arc |
| C2 Vite migration | [#46](https://github.com/Oghenefega/ClipFlow/issues/46) | ⏸️ gated on C1 Phase 1 landing (Electron 32) |
| H5 electron-store 8→11 | [#52](https://github.com/Oghenefega/ClipFlow/issues/52) | ⏸️ gated on Vite |
| H6 chokidar 3→4 | [#53](https://github.com/Oghenefega/ClipFlow/issues/53) | ⏸️ gated on Vite |
| H2 CSP | [#48](https://github.com/Oghenefega/ClipFlow/issues/48) | ⏸️ bundled with Vite (nonce-based) |
| H4 auto-updater research | [#50](https://github.com/Oghenefega/ClipFlow/issues/50) | ⏸️ deferred (post-beta) |
| H7 electron-builder 24→26 | [#54](https://github.com/Oghenefega/ClipFlow/issues/54) | ⏸️ bundled with H4 |
| H9 CF Gateway hardening | [#56](https://github.com/Oghenefega/ClipFlow/issues/56) | ⏸️ deferred (post-beta) |
| #51 code-signing cert | [#51](https://github.com/Oghenefega/ClipFlow/issues/51) | ⏸️ deferred indefinitely (no funds, no beta) |

## Key Decisions

1. **`@electron/rebuild` (not `electron-rebuild`) is the standing scoped-package name** for all future hops. Committed to dev deps this session.
2. **`--legacy-peer-deps` is the standing install flag for electron hops** while react-scripts still pins to TS 3||4 peer deps. Reassess once Vite migration ([#46](https://github.com/Oghenefega/ClipFlow/issues/46)) drops react-scripts.
3. **Editor perf on long sources is its own track, not an inline hop fix.** The root cause (Zustand subscription fan-out at 60Hz) needs a careful refactor across 5 files — filed as [#57](https://github.com/Oghenefega/ClipFlow/issues/57) and slotted for its own session, not bundled with Electron hops.
4. **#35 closed proactively on Pattern A success.** Pattern B (idle projects-tab) and Pattern C (clip-open) share the same Chromium stack, so expected to be fixed too, but weren't explicitly re-tested. Monitoring Sentry across remaining C1 hops; will reopen with a subscript if any pattern recurs.

## Watch Out For

- **Editor lag on 30min+ sources is real and diagnosed, but do not fix it during hop 2.** The fix is a multi-file refactor (narrow 60fps subscription to playhead cursor only; move other panels to discrete-state subscriptions). If inlined with the upgrade, you can't attribute any regression to either change. Keep them separate.
- **DevTools is still unconditionally force-opened at [src/main/main.js:324](src/main/main.js:324).** This is a known contributor to the lag — first thing to gate behind `isDev` when [#57](https://github.com/Oghenefega/ClipFlow/issues/57) is worked. For hop 2, leave as-is (debugging aid).
- **`[DBG ...]` console.log spam is still in `usePlaybackStore.js` and `PreviewPanelNew.js` (tick at :789-793, onTimeUpdate at :827, playEffect at :892 and :899).** Leave as-is for hop 2 — remove when [#57](https://github.com/Oghenefega/ClipFlow/issues/57) is worked. Pre-existing, not a hop regression.
- **Electron 30 may remove `File.path` entirely.** Check [#58](https://github.com/Oghenefega/ClipFlow/issues/58) and the Electron 30 breaking-changes doc as step 0 of hop 2. If removed, migrate before running smoke tests.
- **The zoom-slider drag repro is the standing go/no-go for every Electron hop.** Don't skip. Fast and reliable on 30min+ sources.
- **`--legacy-peer-deps` produces a ton of moderate/high npm audit warnings** — these are transitive vulns in dev-only build tooling (webpack-dev-server ancestry, nth-check, etc.), present before the hop and not introduced by it. Don't chase them during hops — they'll naturally resolve when Vite migration lands.
- **Don't re-litigate committed infrastructure decisions.** Section 9 of the dashboard is canonical. If hop 2 surfaces something that invalidates a committed decision, flag it explicitly so the dashboard can update — don't silently deviate.

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
