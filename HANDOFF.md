# ClipFlow — Session Handoff

_Last updated: 2026-08-12 — Session 162 (#248 BUILT: the feedback pill is real app code, CDP-verified 47/47 + live Sentry round-trip with byte-real attachments. #219 closed as already-fixed-and-shipped. Next session: #244, then cut the tester installer)._

---

## One-line TL;DR

#248 went from locked design to working code in one session: `FeedbackBubble.js` (pill + peel + drag + panel + pick mode + renderer-side `Sentry.captureFeedback`), `feedback-report.js` in main (log tail, context, zoom-corrected region snapshot), error-pulse wiring off real publish/pipeline failures, and Settings key-field masking. A live report round-tripped into Sentry with correct tags, release, snapshot PNG, log tail, and activity trail. Fega has NOT run his 6-step script yet, and no installer carries this yet. Bonus: #219 (Add Game crash) turned out to be fixed since July 30 and shipping in alpha.44+ — closed `status: untested` (Fega's 10-second Rename-tab check pending).

## Current State

Master at session-162 commit (all #248 code + docs). **Fega is still on alpha.45 (installed)** — the pill is NOT in his daily driver yet; it ships with the next cut, which is the tester build. Dev-profile verified only.

## What Was Built (session 162 — #248, all per the mock, no design changes)

- **`src/renderer/components/FeedbackBubble.js`** (NEW) — the whole feature UI. Variant-B pill, prompts rotate on tab switch only (mock's idle rotate correctly NOT built), tuck-to-peel + vertical drag persisting via new `feedbackBubble` store key, panel with Problem/Idea/Feedback toggle + mock-verbatim copy, pick mode (crosshair, hover highlight, snap-to-parent identity, Esc paths), submit via `Sentry.captureFeedback` from the renderer.
- **`src/main/feedback-report.js`** (NEW) — log tail (200 lines), `feedback:context`, zoom-corrected `capturePage` crop (window zoom scales to 1.35 — unscaled rects crop the wrong region). Named `feedback-report.js` because `feedback.js` is the clip-feedback DB.
- **main.js** — `feedback:context`/`feedback:snapshot` handlers, `feedbackBubble` STORE_DEFAULTS key, pipeline-failure hook on `pipeline:generateClips`; **publish-log.js** — `setFailureNotifier` fires on status `"failed"` only (skipped ≠ pulse). Both paths → `feedback:appError` → pill pulses 3×, label "Something just went wrong?", next open preselects Problem.
- **preload.js** — `feedbackReportContext`, `feedbackReportSnapshot`, `onFeedbackAppError` (returns unsubscribe).
- **App.js** — mount at root; `nav()` adds a `ui.tab` Sentry breadcrumb beside the PostHog capture.
- **SettingsView.js** — `data-secret` on all 11 key-display spans; **globals.css** — pulse/flash keyframes, `cf-picking` crosshair, `cf-snapshot-mask` blur(7px) on `[data-secret]` + inputs during Settings captures.

## Key Decisions / Discoveries (session 162)

- **Capture happens RENDERER-side, not in a main `feedback:submit`.** Renderer envelopes ride the Sentry IPC bridge into main's transport, which is `makeElectronOfflineTransport()` by default (sdk.js:79) — offline queueing came free, no custom queue built. Main only supplies context + snapshot.
- **Sentry drops breadcrumbs from feedback events server-side** (verified against a live event). The last ~20 attach as `recent-activity.txt` instead — Problem reports only, because the Idea/Feedback consent line promises "words + snapshot + version, nothing else."
- **Sentry breadcrumb gotcha (cost two failed attempts):** the RENDERER scope never holds the trail — the SDK's ScopeToMain integration forwards every renderer breadcrumb to main over IPC and clears it locally; main's handleScope puts them on main's CURRENT scope. Read the trail main-side (`feedback-report.js recentBreadcrumbs()`) and return it through `feedback:context`.
- Send button disables (opacity .5) until text or a target exists — the one guard the mock didn't specify; everything else is copy-verbatim.

## Verification record (what I did / what's left for Fega)

- 47/47 CDP checks on the dev build: every interaction in the mock, plus store persistence, drag clamp, flip-below, suppressed click after drag, context IPC shape. Driver: scratchpad `cf248-verify.js` + `cf248-round2.js`.
- Live Sentry round-trip (issues 7666921068 / 7666925441, "please ignore" test reports — safe to delete): tags category/view/appVersion/deviceId, release `clipflow@0.3.0-alpha.45`, snapshot verified a real PNG whose dimensions match rect+margin ×zoom ×DPR with edge clamp, log tail 27KB of genuine app.log.
- **NOT machine-verified:** error pulse end-to-end (wiring traced; needs a real pipeline/publish failure — the recurring Arc Raiders scheduled-publish failures will demo it), true offline queueing (Fega's step 4), and the visual look on the daily driver.
- **Fega's 6-step script** (spec `tasks/specs/beta-feedback-reporter.md` bottom) runs AFTER the next installer cut — he tests on the installed exe, not source.

## Next Steps (Fega ratified the order 2026-08-12: fix #244 first, then bundle)

1. **#244 — loud scheduled-publish failures. A FULL session on its own** (Fega sized it and agreed to dedicate one). Three layers per the issue: (a) pre-flight token check ~1h before each scheduled slot + OS notification "YouTube needs reconnecting before your 2:30 PM post"; (b) OS notification + persistent in-app banner on any scheduled-publish failure (the #248 pulse only helps when he's looking — this reaches him when he's not); (c) one-click retry of failed clips after reconnect (`retryFailed` exists, QueueView.js ~1219). Verification is the heavy half: simulate a dead token + near-future scheduled slot. Related: #163's `needsReconnect` flag.
2. **Then cut the tester installer** — bundles #248 + #244 automatically; #219's fix is already aboard (in alpha.44+). It picks up the session-160 `clipflow-beta-testers` token. After install, Fega runs #248's 6-step script + the 10-second #219 check.
3. **#250** (beta distribution / auto-update) once tester #1 has that build.
4. Carry-overs: Arc Raiders scheduled clip still unconfirmed (publish log tail = Aug 8 "Video file not found" failures with a title/path mismatch worth a look in Queue territory); #156 close on Fega's nod.

## Watch Out For

- **The pill mounts over EVERY tab including Onboarding** — z-index 940/942 sits under the render pill (950), toast (951), and modals (1000). If something ever overlaps, adjust the bubble down, not the modals up.
- **Idea/Feedback reports must never grow a log/activity attachment** — the consent copy is a promise, enforced in `send()`. Don't "helpfully" attach more.
- **`feedback:snapshot` rects are CSS px; the handler multiplies by `getZoomFactor()`** — don't pre-scale in the renderer or crops double-scale.
- The two CDP test reports in Sentry are tagged "please ignore" — deleting them from the Sentry UI is fine.
- Build machines still need the TWO git-ignored vendor files (`vendor/ffmpeg/`, `vendor/beta-token.json`) before `npm run build`.
- Wrap commits: never put a close keyword before "#N" (session-159 incident).
- `tasks/todo.md` is huge — session-162 BUILT section is at the top; never read the file whole.

## Logs/Debugging

- **Feedback reports in Sentry:** project `flowve/clipflow` → User Feedback (or Issues filtered `issue.category:feedback`). Filter by tags `category` (`problem`/`idea`/`feedback`), `view`, `deviceId`, release. Attachments tab on the event holds `snapshot.png` / `app-log-tail.txt` / `recent-activity.txt`.
- **Sentry API:** token at `C:\Users\IAmAbsolute\.claude\sentry_token.txt`, org `flowve`, project `clipflow`. Feedback issues: `GET /api/0/projects/flowve/clipflow/issues/?query=issue.category:feedback&sort=date`. Event attachments: `GET /api/0/projects/flowve/clipflow/events/<eventID>/attachments/` (add `?download=1` on an attachment id to fetch bytes). Expect ~1 min ingestion lag before `events/latest/` resolves.
- **Bubble state:** `feedbackBubble` key in `clipflow-settings.json` (`{ tucked, bottom }`); delete the key to reset to defaults.
- **Publish results:** `%APPDATA%\clipflow\clipflow-publish-log.json` (newest at tail). A `"failed"` entry should now ALSO pulse the pill — if a failure lands silently, the notifier wiring in main.js (after `publishLog.init()`) is the first suspect.
- **App log tail** (what Problem reports attach): `%APPDATA%\clipflow\logs\app.log` (dev profile: `clipflow-dev`).
- Kill dev electron for CDP work with `taskkill //IM electron.exe //F` (TaskStop leaves a zombie on 9222).
