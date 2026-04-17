# ClipFlow — Session Handoff
_Last updated: 2026-04-17 (session 8) — "Infrastructure dashboard bootstrap + 11-decision walkthrough (no code changes)"_

---

## TL;DR

Planning + documentation session — no ClipFlow code changes. One repo file edited (`CLAUDE.md`); rest of the output lives in Obsidian vault + GitHub issues.

1. **Bootstrapped an evergreen infrastructure dashboard** at `C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\infrastructure\ClipFlow Infrastructure.md`. Full stack inventory (Electron, React, deps, security posture, external infra), severity-tagged findings (2 Critical, 9 High, 9 Medium, 10 Low, 2 Unknown remaining), current-decisions-in-flight log, and a self-contained drift-catching refresh prompt. Subfolders created: `Reviews/`, `Prompts/`, `Decisions/`.
2. **Walked 11 decisions item-by-item with Fega** — all Criticals (C1 Electron upgrade cadence, C2 CRA→Vite migration) and all Highs (H1–H9). Each committed decision is logged in Section 9 of the dashboard, each with a GitHub tracking issue.
3. **10 new GitHub issues filed** — [#47](https://github.com/Oghenefega/ClipFlow/issues/47) through [#56](https://github.com/Oghenefega/ClipFlow/issues/56) covering subtitle renderer hardening, CSP, sandbox, auto-updater research, code-signing cert procurement, electron-store upgrade, chokidar upgrade, electron-builder upgrade, @types/node pin, and Cloudflare AI Gateway hardening (spend caps, rate limiting, abuse detection runbook). All labelled `milestone: commercial-launch`.
4. **CLAUDE.md pointers added** in two places — the ClipFlow repo's [CLAUDE.md](CLAUDE.md) (filtered, default-off: most sessions ignore it; infra-touching sessions consult it) and the Obsidian vault's ClipFlow business CLAUDE.md (source-of-truth pointer for Nero).
5. **Mediums (9), Lows (10), and Unknowns U1 + U2 are NOT yet walked** — remaining work for a future dedicated session.

## 🎯 Where infrastructure work goes from here

The dashboard's Section 9 is the authoritative pre-launch infrastructure plan. Every item below maps to a tracked GitHub issue:

- **#35** (renderer crash diagnostic) — **Step 0, blocks C1.** Still the Electron upgrade arc's gating item.
- **C1 — Electron 28 → current stable** — [#45](https://github.com/Oghenefega/ClipFlow/issues/45). Phase 1 stepwise 28→32; Phase 2 minimum +2 hops with breaking-changes review each hop. Smoke tests MUST include subtitle renderer and `<video>` lifecycle.
- **C1's bundled companions:** [#47](https://github.com/Oghenefega/ClipFlow/issues/47) subtitle overlay hardening + [#49](https://github.com/Oghenefega/ClipFlow/issues/49) sandbox flip. One preload audit, one smoke-test pass covers all three.
- **C2 — CRA → Vite + ESM deps** — [#46](https://github.com/Oghenefega/ClipFlow/issues/46) (Vite) + [#52](https://github.com/Oghenefega/ClipFlow/issues/52) (electron-store 8→11) + [#53](https://github.com/Oghenefega/ClipFlow/issues/53) (chokidar 3→4). Structural deps arc.
- **H2 CSP** — [#48](https://github.com/Oghenefega/ClipFlow/issues/48). Bundled with Vite to get nonce-based CSP for free (avoids `'unsafe-inline'`).
- **H4 Auto-updater** — [#50](https://github.com/Oghenefega/ClipFlow/issues/50) (research deferred until #35, #45, #46 resolve) + [#51](https://github.com/Oghenefega/ClipFlow/issues/51) (code-signing cert procurement — **start vendor research NOW regardless of updater timing**, KYC lead time 2-6 weeks) + [#54](https://github.com/Oghenefega/ClipFlow/issues/54) (electron-builder 24→26, bundled with updater wiring).
- **H8 @types/node pin** — [#55](https://github.com/Oghenefega/ClipFlow/issues/55). Immediate standalone 5-minute fix. Pin `@types/node` to `^18` to match Electron 28 runtime; re-bump to `^20` inside C1 Phase 1.
- **H9 Cloudflare Gateway hardening** — [#56](https://github.com/Oghenefega/ClipFlow/issues/56). Four of five concerns (spend cap, abuse detection, API key isolation, billing alerts) doable in one focused session today. Per-user rate limiting blocked on Supabase auth.

## 🚫 What NOT to start yet

- Do NOT begin any Electron upgrade step (#45 Phase 1) until #35 crash diagnostic runs — carried forward from session 7, still true.
- Do NOT start Vite migration (#46) yet — gate is the crash diagnostic running first, then the Electron Phase 1 landing.
- Do NOT write any code against the infrastructure decisions yet — this session was planning only; implementation sessions start later with fresh context and the dashboard as input.

## Watch Out For

- **CF Gateway spend cap is not yet configured.** This is the single most urgent item in the post-session todo — a scripted attack on the unconfigured gateway could rack up thousands in Anthropic charges over a weekend. Detailed runbook in [#56](https://github.com/Oghenefega/ClipFlow/issues/56).
- **Code-signing cert procurement has 2-6 week lead time.** If you wait until pre-launch to order it, you'll be blocked. Start vendor research now via [#51](https://github.com/Oghenefega/ClipFlow/issues/51). Business-entity formation (sole prop vs LLC) may block OV/EV cert types — resolve that question early.
- **Infrastructure decisions are now canonical in the dashboard, not in this HANDOFF.** Future sessions should read the dashboard's Section 9 (or the CLAUDE.md pointer in the repo) rather than re-litigating from HANDOFF or scratch. Decisions in flight are committed — follow them, don't re-debate them.

## Logs / Debugging

- **Dashboard:** `C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\infrastructure\ClipFlow Infrastructure.md`
- **Bootstrap prompt archive:** `...\context\infrastructure\Prompts\Infrastructure Dashboard Bootstrap - 2026-04-17 - Fri.md`
- **Refresh prompt:** lives inside Section 13 of the dashboard. Paste into a fresh Claude Code session in the ClipFlow repo when drift is suspected.
- **All 10 new issues:** `gh issue list --repo Oghenefega/ClipFlow --state open --search "milestone:commercial-launch" --limit 50`

---

## Session 7 handoff (preserved)

_Modernization plan + LLM Council review (planning only, no code changes)._

1. **Modernization plan filed as [#46](https://github.com/Oghenefega/ClipFlow/issues/46)** — epic-style chore covering CRA → Vite, React 18 → 19, selective dep audit. Explicit rejections in the issue body (Next.js, pnpm, blanket dep bumps). **Session 8 update:** C2 decision in dashboard further bundled #46 with #52 (electron-store) and #53 (chokidar) as the "structural deps arc."
2. **LLM Council reviewed the plan** (5 advisors + 5 peer reviewers + chairman synthesis). Unanimous blind spot caught in peer review: **nobody proposed reproducing the #35 crash before making any Electron decision** — the entire #45 Electron track rests on an unverified premise. Reports saved to `council-reports/`.
3. **Modernization work is PAUSED** pending a full architecture audit. **Session 8 update:** that audit is effectively this session's output — the infrastructure dashboard. Modernization remains paused on the original premise (crash diagnostic first).

## 🚫 Session 6's "start Electron upgrade next" is STILL on hold

Carried forward: don't start #45 until the #35 crash diagnostic runs. See C1 in the infrastructure dashboard for the full committed plan.

---

## Session 6 handoff (preserved)

1. **#35 root cause narrowed, fix deferred to Electron upgrade.** Session-5's theory (shadcn Slider is the trigger) was tested and disproven. The real crash stack (pulled from Sentry) is a **Chromium 120 fetch-stream UAF** in `ReadableStreamBytesConsumer::BeginRead` → `DOMArrayBuffer::IsDetached` → `DOMDataStore::GetWrapper`. Electron 28's Chromium is out of support and has known fixes in 121-128.
2. **#38 closed.** `cutClip` now probes source fps and passes `-r <fps>` so OBS VFR captures stay at 60fps instead of collapsing to FFmpeg's default 25fps. One-file change.
3. **#45 filed** — Electron 28 → 32 upgrade, stepwise one-major-at-a-time, as the proper fix for #35 and the security-support baseline for the commercial launch.

---

## 🚨 Start Here — Read First

### 1. #35 is a Chromium 120 bug, not a ClipFlow bug.

The real stack (Sentry event `94c92a6e8ee84761aa2caa483a8a8051`, 2026-04-17T02:22:16Z):

```
blink::DOMDataStore::GetWrapper          ← crash (dom_data_store.h:88)
blink::AccumulateArrayBuffersForAllWorlds
blink::DOMArrayBuffer::IsDetached        (dom_array_buffer.cc:283)
blink::ReadableStreamBytesConsumer::BeginRead
blink::FetchDataLoaderAsDataPipe::OnStateChange
mojo::SimpleWatcher::OnHandleReady
```

A mojo IPC pipe message arrived with fetch-stream bytes to deliver, but the receiving ArrayBuffer was already detached/GC'd. This is Chromium's internal file-loader path used by `<video src="file://...">`. Phase 4's teardown (`pause → removeAttribute src → load()`) does NOT synchronously drain pending mojo pipe messages. Any stale pipe message from a prior seek/src-change can fire seconds later and UAF.

**Do not attempt more in-app mitigations.** The session-5 hypothesis (Slider) has been eliminated. Further Phase-4-level hardening (preload=none, custom protocol, etc.) may help marginally but won't eliminate the class of bug. The proper fix is Electron upgrade (#45) → Chromium 128+ where multiple fetch-stream UAF fixes have landed.

Autosave (shipped session 5) keeps this non-destructive for now.

### 2. Electron 28 is out of security support.

Electron supports only the latest 3 majors. Electron 38 is current (Apr 2026). ClipFlow is on 28. Any Chromium CVE patched in 121+ is live in shipped builds. For a commercial product this is a launch blocker, not just a quality-of-life issue.

Upgrade path: stepwise 28 → 29 → 30 → 31 → 32. Each hop: bump version, `electron-rebuild` native deps (`better-sqlite3`), smoke-test the full pipeline, read that version's breaking-changes doc, fix deprecations before next hop. Target Electron 32 (Chromium 128, Node 20). Full plan in #45.

Also worth bumping in the same arc: `@sentry/electron` 7.10 → 8.x (better minidump integration).

### 3. #38 fix changes cutClip to async+probe.

`src/main/ffmpeg.js` `cutClip` now calls `probe(srcPath)` before encoding and passes `-r <sourceFps>` to libx264. External contract unchanged (still returns a Promise). Fallback on probe failure: omit `-r` (ffmpeg default). Sanity-clamped at `0 < fps <= 240`.

---

## 📋 Remaining Board

| Tag | Issue | Status |
|-----|-------|--------|
| B1 | #34 subtitle extends | ✅ closed session 5 |
| B2 | #35 renderer crash | ⚠️ root-caused to Chromium 120, fix deferred to Electron upgrade (#45) |
| B2a | #36 autosave | ✅ closed session 5 |
| B3 | #37 subtitle mismatch regression | 🔲 blocked on repro |
| B4 | #38 60fps → 25fps in cutClip | ✅ **closed this session** |
| V1 | #39 Phase 4 verification walk | 🟡 code-side audit done for steps 1, 4, 5; steps 6-13 need manual test |
| C1-C3 | #40-42 hygiene cleanups | 🔲 low priority |
| P1 | #43 Sentry launch backlog | 🔲 pre-launch |
| — | #44 double setSegmentMode on init | 🔲 chore |
| **NEW** | **#45 Electron 28 → 32 upgrade** | 🔲 **milestone: commercial-launch** |

---

## What Was Built This Session

### #38 60fps fix (`src/main/ffmpeg.js`)
`cutClip` converted from a bare Promise to an `async` function. Before the encode:
- Runs `probe(srcPath)` to read `fps`
- If `fps` is finite, `> 0`, and `<= 240`, builds `fpsArg = ["-r", String(fps)]`
- Otherwise, empty array (ffmpeg default)

Passes `fpsArg` to libx264 args between `-crf 18` and `-c:a aac`. No other changes — output path, codec, CRF, audio bitrate, and timeout are identical.

Callers of `cutClip`: all already `await` or `.then()` the returned Promise, so the async signature is backwards-compatible.

### #45 Electron upgrade issue
Full body captures: three concrete risks (out of security support, missed Chromium bug fixes including #35, missed V8 perf + new web APIs), target version (Electron 32 / Chromium 128 / Node 20), stepwise approach (one hop per session), hot spots at each hop (native deps rebuild, preload.js, protocol handling, Sentry compat), acceptance criteria (including re-running #39 checklist on new Electron), and why not to skip-ahead (removed APIs compound between majors). Also notes that switching `file://` to `protocol.handle()` while on 32 might be the second line of defense on #35 if Chromium upgrade alone doesn't resolve it.

### Session-5 diagnostic revert (Slider swap)
Session 5's HANDOFF proposed swapping shadcn `<Slider>` → native `<input type="range">` on the scrub bar + zoom to isolate Radix pointer capture as the crash trigger. Test ran this session:
- Slider swap built clean (+169 B)
- Fega reproduced the crash anyway → Slider was NOT the cause
- Swap reverted; both files are now byte-identical to session-5 master

Net result: zero code change in `EditorLayout.js` / `TimelinePanelNew.js`. Diagnostic confirmed, visual consistency preserved.

### #39 Phase 4 verification — code-side pass
Audited code for the 13-step checklist, confirmed correctness of:
- Step 1 (playhead at clip start): `useEditorStore.initFromContext` sets `clipFileOffset: 0`; breadcrumb at crash time shows `vidT: 106 → tlT: 0` confirming source→timeline mapping is correct.
- Step 4 (waveform no-stretch during trim): `trimSnapshot` mechanism at `TimelinePanelNew.js:158-159` freezes `effectiveDuration` during drag (`rawEffectiveDuration` → `trimSnapshot` on trimStart, back to null on trimEnd).
- Step 5 (trim-inward still works): `WaveformTrack.js:29-40` bounds `newSourceStart/End` with min-duration clamp (`sourceEnd - 0.1` / `sourceStart + 0.1`), handling shrink correctly.

Steps 2 + 3 already log-confirmed in session 4. Steps 6-13 require manual eyes-on in the running app.

---

## Key Decisions

1. **Deferred #35 to Electron upgrade.** The tempting next mitigation was adding `preload="none"` or switching to `protocol.handle()`, but we'd be patching symptoms of a known Chromium bug class. Upgrading to Electron 32 is higher leverage AND necessary anyway for commercial launch (security support baseline).

2. **Slider swap reverted cleanly.** Kept visual consistency. Only functional change this session is `ffmpeg.js`. The slightly-reordered import blocks in `EditorLayout.js` and `TimelinePanelNew.js` were restored to session-5's exact import ordering.

3. **`#45` one-major-at-a-time, not a big-bang upgrade.** Electron removes deprecated APIs gradually (deprecate in N, remove in N+2). Skipping 4 majors at once compounds breakage. Per-hop testing keeps the app bootable between attempts — important since Fega is the sole tester.

4. **#38 probe-based, not hard-coded `-r 60`.** OBS captures are usually 60fps but not always (some clips are 30fps; future content may be 120fps). Probing honors the source truth; clamp rejects corrupt probe output.

---

## Next Steps (recommended next-session focus, ranked)

1. **Begin #45 Electron upgrade — 28 → 29.** First hop is usually the cheapest diagnostic. `npm i electron@29`, `npx electron-rebuild`, launch, smoke-test, read Electron 29 breaking changes. If it boots, proceed same session or stop + commit. If it breaks, fix and commit the fixes separately before attempting 29→30.

2. **#39 manual verification walk.** Ten remaining steps (6, 7, 8, 9, 10, 11, 12, 13 — and re-confirm 1, 4, 5 visually). Fega needs to actually do the clicks. Plan: open editor on a clip with a known 30-min source, trim in/out, save, reopen, confirm bounds. Then rename source on disk, confirm Media Offline banner. Then use "Locate file..." and confirm recovery. Then delete the waveform cache JSON and reopen to confirm regen. ~20 minutes of manual test.

3. **#38 verification.** Render a 60fps clip end-to-end and `ffprobe` the output: `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate <output>`. Expect `60/1` (not `25/1`). Should also visually spot-check — 60fps gameplay looks noticeably smoother than 25.

4. **#44 double setSegmentMode chore.** Small refactor — `initFromContext` calls `setSegmentMode` twice; dedup both the call and the log.

---

## Watch Out For

- **Don't attempt more in-process Phase 4 hardening for #35.** We've ruled out the Slider; previous Phase 4 teardown was correct as far as it could go. Any additional mitigation risks adding complexity for marginal gain and will be obviated by the Electron upgrade anyway.
- **`cutClip` is now `async` + does an ffprobe before encoding.** A probe adds ~50-200ms to every cut. Real cost is negligible next to the re-encode (seconds to minutes) but be aware when profiling.
- **Electron 29 `contextIsolation` default changed long ago, but some APIs started requiring `session` scoping in later versions.** Start the upgrade by reading the Electron 29 breaking-changes doc — don't just bump and hope.
- **`@sentry/electron` 7.10 may have issues on Electron 32.** Check Sentry's compat matrix before each Electron hop. If crash reports stop arriving in Sentry mid-upgrade, this is where to look first.
- **The Slider import reordering in session 5's diagnostic was reverted to exact prior order.** Lint/format passes that reorder imports could diff these files again — confirm your lint setup matches the existing ordering before blaming drift.

---

## Logs / Debugging

- **60fps verification (post-#38):** `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate,avg_frame_rate -of default=nw=1 <rendered_clip.mp4>` — expect r_frame_rate = source fps (60/1 for OBS captures), not 25/1.
- **Renderer crash signature (for next occurrence):** Sentry issue `7381799876` (CLIPFLOW-4). Stack should begin with `blink::DOMDataStore::GetWrapper` and climb through `ReadableStreamBytesConsumer::BeginRead` + `FetchDataLoaderAsDataPipe::OnStateChange`. If the stack changes shape (e.g., no longer fetch-related), re-investigate — a different bug may have surfaced behind this one.
- **Sentry API:** `https://sentry.io/api/0/issues/7381799876/events/latest/` with token from `C:\Users\IAmAbsolute\.claude\sentry_token.txt`. Breadcrumbs + exception stack in `entries[].data.values[]`.
- **Ffmpeg fps probe sanity check:** `node -e "require('./src/main/ffmpeg').probe('<path>').then(m => console.log(m.fps))"` from repo root.
- **Clip data on disk:** `{watchFolder}/{projectId}/project.json` → `clips[]`.

---

## Verification Completed This Session

- [x] `npx react-scripts build` clean, no warnings, bundle back to session-5 hash `main.7e7ed0a0.js`
- [x] Slider swap reverted — `EditorLayout.js` + `TimelinePanelNew.js` byte-identical to session-5 master
- [x] `#38` fix patched in `ffmpeg.js` — syntax valid, async signature backwards-compatible with existing awaiters
- [x] `#45` filed with full context (three concrete risks, stepwise plan, acceptance criteria)
- [x] Sentry event pulled + full stack trace captured → root cause confirmed as Chromium 120 fetch-stream UAF
- [x] `#39` code-side audit for steps 1, 4, 5 passed

- [ ] `#38` 60fps output needs manual `ffprobe` verification on a newly rendered clip (can't test without running render)
- [ ] `#39` steps 6-13 need manual eyes-on in running app (Fega task)
