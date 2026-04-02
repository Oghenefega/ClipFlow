# Council Transcript — PostHog Analytics for ClipFlow
_April 1, 2026_

---

## Original Question

Is this PostHog product analytics integration plan correct and complete for ClipFlow?

Plan: Install posthog-js, init in App.js useEffect, track 6 events (tab_changed, pipeline_started, pipeline_completed, clip_approved, clip_rejected, publish_triggered), no PII, hardcoded API key, renderer-side only.

---

## Advisor Responses

### The Contrarian
API key is public in client bundle — need PostHog allowlisting. Offline behavior will eat events (posthog-js has no persistent offline queue in Electron). tab_changed will double-fire from React re-renders. Skip @posthog/react is correct. Init in App.js useEffect is WRONG — child effects fire first, captures could silently fail; init in index.js instead. Missing event: pipeline_failed. Add namespace prefix (clipflow_ or cf_) to event names.

### The First Principles Thinker
Plan solves wrong layer — events mirror UI navigation not business questions. Skip @posthog/react correct. Hardcoded key fine. No user identity (posthog.identify) means can't distinguish users. Init in App.js vs index.js doesn't matter functionally. No double-fire risk. Missing: clip_edited event, source property on pipeline_started. Strip back to: what business question does each event answer?

### The Expansionist
Only 6 events leaves value on table. Missing: editor_session_start/end, subtitle_style_changed, ai_generation_requested, render_started/completed/failed, export_format_selected, project_folder_created, onboarding_step_completed. Feature flags should be enabled from day one. Set super properties on init (app version, OS, license tier). Singleton guard for React 18 strict mode.

### The Outsider (Unanimously rated strongest)
Hardcoded API key is fine (public by design). Missing: posthog.identify() with stable anonymous ID — without it every launch creates new user, inflated counts. Missing: app_opened/app_closed lifecycle events. Disable autocapture explicitly (autocapture: false, capture_pageview: false) — Electron SPA generates noise. Need opt-out toggle in Settings for commercial product.

### The Executor
90% ready. One bug: handleDecision toggle logic — must only capture on resulting state (approved/rejected), not toggle-off to "none". Need consent toggle (opt_out_capturing/opt_in_capturing). Need stable device ID via electron-store + posthog.identify(). Call posthog.shutdown() on beforeunload to flush queue.

---

## Peer Reviews

All 5 reviews unanimously rated The Outsider (D) as strongest.
All 5 reviews rated The Expansionist (C) as biggest blind spot.

### Blind spots caught by peer review (missed by all advisors):
1. Electron CSP may silently block posthog-js network requests to us.posthog.com
2. posthog-js uses sendBeacon — unreliable in Electron quit lifecycle
3. Pipeline events originate in main process via IPC — renderer only learns through callbacks
4. Context isolation affects reading machine identifiers for device ID
5. Flush-on-quit reliability in Electron vs browser

---

## Chairman's Verdict

### Where the Council Agrees
- No stable user identity = useless analytics (posthog.identify with persistent device ID mandatory)
- Disable autocapture and capture_pageview (Electron SPA generates noise)
- Opt-out toggle is mandatory for commercial product
- Skip @posthog/react (unanimous)
- Hardcoded API key is fine (write-only, public by design)

### Where the Council Clashes
- Init location: Contrarian says index.js, First Principles says doesn't matter → Verdict: index.js (avoids React 18 strict mode issues)
- Event count: Expansionist wants 15+, Executor says 6 → Verdict: 7 events (add pipeline_failed), expand later

### Blind Spots
- Electron CSP will silently block PostHog requests
- Flush-on-quit unreliable without explicit shutdown handling
- Pipeline events originate in main process via IPC
- Toggle logic bug in approve/reject (must guard on resulting state)

### The Recommendation
1. Init in index.js with autocapture: false, capture_pageview: false
2. Stable device ID via electron-store UUID + posthog.identify()
3. Add pipeline_failed event (7 total)
4. CSP whitelist for https://us.posthog.com
5. Opt-out toggle in Settings
6. Flush on quit via posthog.shutdown()
7. Namespace prefix: clipflow_ on all events

Do NOT add: feature flags, super properties, editor tracking, onboarding funnels.

### The One Thing to Do First
Verify CSP — confirm requests to https://us.posthog.com aren't being blocked in Electron DevTools Network tab.
