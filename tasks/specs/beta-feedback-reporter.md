# Beta Feedback Reporter — in-app avatar + point-at-the-problem capture

> Spec owner: Wick (GM). Greenlit by Fega 2026-08-07.
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
2. **The avatar is a friendly entry point, NOT an AI chatbot.** Scripted
   prompts, zero API cost per report (bundled-first economics, Fega 2026-08-07:
   no per-report AI spend). The intelligence lives in the captured context,
   not in conversation. An LLM layer can be explored post-beta if reports
   prove low-quality.
3. **Point-at-the-problem replaces screenshots-by-hand.** The app owns its own
   UI, so a click on "the editor header" can capture exactly what was clicked
   plus an automatic region snapshot. Testers never touch a screenshot tool.
4. **Reports include recent logs, and say so.** One consent line in the panel.
   No silent log exfiltration.

## Build (v1 scope)

### Entry point
- Persistent avatar button, visible on EVERY tab/view, docked bottom-right
  (exact art/placement = dev session's call with Fega; it should feel like
  ClipFlow, not a helpdesk widget). Must never overlap working controls
  (timeline, queue actions); collapsed state is small.

### Report flow (one panel, three beats)
1. Avatar click → compact panel: friendly scripted opener ("Something not
   working right? Tell me what happened.") + free-text box.
2. **"Point at the problem" button** → panel minimizes, overlay mode arms,
   one instruction line ("Click the thing that's acting up. Esc to cancel").
   Tester clicks any element. Capture:
   - DOM path + nearest stable identity (component/test id/aria label/text)
   - current view/tab id
   - element bounding rect
   - automatic cropped snapshot of that region via `webContents.capturePage`
     (element rect + small margin, NOT full screen)
   v1 = one point per report. Re-pointing replaces the previous point.
3. Submit → confirmation beat from the avatar ("Got it. This went straight to
   the workshop."). Panel closes. Done.

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
- Avatar look: character vs mark. Fega has opinions; mock 2-3 in HTML first
  (house rule).
- Whether Sentry's prebuilt Feedback widget UI is adaptable or the panel is
  fully custom (custom likely, the picker is bespoke anyway).
- Snapshot privacy pass: confirm no key fields (Settings) can be captured in a
  region snapshot while unmasked; mask inputs in Settings view captures.

## Verification (Fega's script, ~5 min)
1. From the Editor, click the avatar, type "test report", point at the editor
   header, submit. → Report appears in Sentry with: text, header element
   identity, cropped snapshot of the header, correct view id, app version.
2. Repeat from Queue tab without pointing at anything. → Report arrives, view
   id = queue, no snapshot, logs attached.
3. Disconnect network, file a report, reconnect, relaunch. → Report arrives
   (queued, not lost).
4. Trigger a renderer error (dev hook) → crash lands in Sentry as before,
   unaffected by the new code.
5. Check a Settings-view report snapshot → API key fields masked.
