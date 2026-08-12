# Beta Feedback Reporter — in-app bubble + point-at-the-problem capture

> Spec owner: Wick (GM). Greenlit by Fega 2026-08-07.
> Entry point re-scoped by Fega 2026-08-11: the avatar is dropped for a
> feedback bubble. Design locked from the interactive mock
> `tasks/mocks/feedback-bubble.html` (variant B labeled pill, right edge).
> Same day: scope widened beyond problems — reports carry a category
> (Problem / Idea / Feedback).
> Written for a cold dev session. Verify anchors before building; repo moves fast.

## Why

Beta testers are coming. Today the only reporting channel is "tell Fega by
mouth," which loses the essence of the problem by the time it's retold. Testers
need a real-time, in-app way to report an issue the moment it happens, with the
app doing the context-gathering work (not the tester wrangling screenshots).

Crashes are NOT this spec's problem: Sentry crash capture is already live in
both processes (`src/main/main.js:31-41`, `src/index.js:1-17`,
`AppErrorBoundary.js`). This spec covers the other half: "nothing crashed, but
something's wrong," reported by a person, in the moment.

## What already exists (verified in repo 2026-08-07)

- **Sentry** `@sentry/electron` 7.10.0, main + renderer init, hardcoded public
  DSN (project `flowve/clipflow`), error boundary wired. Crash half = done.
- **PostHog** `posthog-js` live with opt-in/opt-out and stable per-device
  `posthog.identify(deviceId)` (`src/index.js:46-70`); tab changes already
  captured as `clipflow_tab_changed` breadcrumbs (`App.js:758`).
- **electron-log** logger (`src/main/logger.js`) with rotating file logs under
  `%APPDATA%\clipflow\logs`.

Build the reporter ON these rails. No new vendor, no new transport, no backend.

## Locked decisions (Fega + Wick, 2026-08-07)

1. **Sentry is the pipe and the inbox.** Reports ship as Sentry user-feedback
   events (with attachments) tied to the release version, landing next to the
   crashes they often explain. No custom ingest service.
2. **The entry point is a friendly bubble, NOT an AI chatbot.** Scripted
   prompts, zero API cost per report (bundled-first economics, Fega 2026-08-07:
   no per-report AI spend). The intelligence lives in the captured context,
   not in conversation. An LLM layer can be explored post-beta if reports
   prove low-quality. (2026-08-11: Fega dropped the avatar concept entirely;
   no character art anywhere in this feature.)
3. **Point-at-the-problem replaces screenshots-by-hand.** The app owns its own
   UI, so a click on "the editor header" can capture exactly what was clicked
   plus an automatic region snapshot. Testers never touch a screenshot tool.
4. **Reports include recent logs, and say so.** One consent line in the panel.
   No silent log exfiltration.
5. **Every report carries ONE category: Problem, Idea, or Feedback** (Fega
   2026-08-11 — this is a feedback channel, not just a bug channel; the
   catch-all is named Feedback, not Comment, per Fega same day). Segmented
   toggle in the panel, single choice (not checkboxes). The pill's rotating
   prompt preselects the category; the tester can switch. Panel copy (title,
   placeholder, point-button label, consent line) adapts per category. The
   log tail attaches ONLY to Problem reports; Idea/Feedback send words +
   snapshot + version. Sentry events are tagged with the category so
   problems, ideas and feedback are filterable apart.

## Build (v1 scope)

### Entry point (design LOCKED 2026-08-11, Fega, from tasks/mocks/feedback-bubble.html)
- **Labeled pill (mock variant B):** ~38px-tall pill, 27px violet "?" dot +
  text label, docked on the RIGHT edge, default bottom-right, visible on
  EVERY tab/view.
- **The label rotates between the category prompts** — "Having a problem?" /
  "Got an idea?" / "Got feedback?" — advancing on tab switch (quiet 150ms
  text fade, no other motion). Whichever prompt is showing when the tester
  clicks preselects that category in the panel.
- **× on hover tucks it into a slim edge peel** (~22px tab flush with the
  right edge, "?" glyph). Peel click restores the bubble. Tucked/expanded
  state persists across launches — it never nags its way back.
- **Draggable vertically along the right edge only** (never free-floating
  over content). Drag position persists.
- **Self-animation ONLY on real failure:** when the app logs a pipeline/publish
  error, the pill (or peel, if tucked) pulses 3× and the label swaps to
  "Something just went wrong?" (and the next panel open preselects Problem).
  Otherwise it never moves on its own.
- Report panel = compact popover anchored to the bubble; opens above it and
  **flips below when the bubble sits too high for the panel to fit** (never
  clipped by the window edge). The app stays visible behind it.
- No tab picker in the panel: the current view is auto-captured and shown
  read-only in the panel header ("Queue tab · v0.3.0-alpha.45").

### Report flow (one panel, three beats)
1. Pill click → compact panel: category toggle (Problem | Idea | Feedback,
   preselected by the inviting prompt) + free-text box. Title, placeholder
   and consent line follow the category ("Report a problem" / "Share an
   idea" / "Share feedback" — exact copy in the mock).
2. **"Point at the problem" button** → panel minimizes, overlay mode arms,
   one instruction line ("Click the thing that's acting up. Esc to cancel").
   Tester clicks any element. Capture:
   - DOM path + nearest stable identity (component/test id/aria label/text)
   - current view/tab id
   - element bounding rect
   - automatic cropped snapshot of that region via `webContents.capturePage`
     (element rect + small margin, NOT full screen)
   v1 = one point per report. Re-pointing replaces the previous point.
3. Submit → success beat in the panel ("Sent. Thank you! This goes straight
   to the developer."). Panel closes itself. Done.

### Auto-attached context (no tester action)
- app version + build, OS version
- current view/tab, and the last ~20 breadcrumbs (tab changes, key actions —
  extend the existing PostHog/Sentry breadcrumb trail rather than inventing a
  parallel one)
- PostHog `deviceId` (correlates reports from the same tester across sessions)
- tail of the current electron-log file (last ~200 lines) as attachment
- if the last pipeline run errored: that error summary

### Transport & failure behavior
- Sentry feedback event + attachments, tied to `release` so "broken in
  alpha.42" is filterable.
- Offline/blocked: verify sentry-electron's offline queueing covers feedback
  envelopes; if not, minimal local queue with retry on next launch. A report
  must never silently vanish.

## Non-goals (v1)
- No AI conversation, no voice input, no screen recording, no multi-point
  annotation, no public roadmap/upvote board. Each is a later call, none gates
  beta.

## Open calls for the dev session (with Fega in the room)
- ~~Avatar look~~ RESOLVED 2026-08-11: bubble variant A (glow dot), right
  edge, per the locked entry-point section above. Mock with final look and
  interactions: `tasks/mocks/feedback-bubble.html`.
- ~~Sentry's prebuilt Feedback widget vs custom~~ RESOLVED 2026-08-11 (build
  session): fully custom panel (`FeedbackBubble.js`), transport via
  `Sentry.captureFeedback` from the renderer — envelopes ride the SDK's IPC
  bridge into the main process offline transport, so offline queueing needs
  no extra code.
- ~~Snapshot privacy pass~~ RESOLVED 2026-08-11 (build session): Settings-view
  captures add a `cf-snapshot-mask` body class for the capture frames — all
  `[data-secret]` key spans (11 sites in SettingsView) and every input/textarea
  blur to 7px. Verified live via computed styles.
- One deviation discovered live: Sentry's feedback event schema drops event
  breadcrumbs server-side, so the last ~20 breadcrumbs attach as
  `recent-activity.txt` on Problem reports instead (same trail — the tab-change
  breadcrumb feeds it — different vehicle).

## Verification (Fega's script, ~5 min)
1. From the Editor, click the pill, type "test report", point at the editor
   header, submit. → Report appears in Sentry with: text, header element
   identity, cropped snapshot of the header, correct view id, app version,
   category tag `problem`.
2. Repeat from Queue tab without pointing at anything. → Report arrives, view
   id = queue, no snapshot, logs attached.
3. Switch the category to Idea and send one. → Arrives tagged `idea`, with
   NO log attachment.
4. Disconnect network, file a report, reconnect, relaunch. → Report arrives
   (queued, not lost).
5. Trigger a renderer error (dev hook) → crash lands in Sentry as before,
   unaffected by the new code.
6. Check a Settings-view report snapshot → API key fields masked.
