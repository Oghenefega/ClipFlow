# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.

---

## Active: Retry-failed-publishes feature (Session 36)

**Goal:** When publishing a clip partially fails (e.g. YT + FB succeed, IG + TT fail), the clip must stay visible in the queue with a per-platform failure indicator and a Retry button. Failure state must survive app restart.

**Why:** Today the clip disappears from queue/scheduled/failed views after any publish attempt because [QueueView.js:635](src/renderer/views/QueueView.js:635) calls `logPost` unconditionally — that writes to `trackerData`, which the `approved` filter excludes ([line 189–190](src/renderer/views/QueueView.js:189)). User has to re-render the same clip from the editor just to see it again in the queue, with no way to retry the platforms that failed. `publishStatus` is React-only state, so even before the disappearance, an app restart loses the failure record.

---

## Plan (4 changes, all in renderer + one clip-field add)

### 1. Persist per-platform publish state on the clip
- New optional field on the clip object: `publishState: { [accountKey]: "success" | { error: string, at: ISO } }`
- After every publish attempt (in both `publishClip` and `retryFailed`), call `projectUpdateClip` with the per-platform result. Mirror locally via the existing `updateClipInState` helper (already wired in this session).
- Field is additive — no schema migration needed; `updateClip` accepts arbitrary updates ([projects.js:203](src/main/projects.js:203)).

### 2. Gate `logPost` on full success
- In `publishClip`: only call `logPost` if `allSuccess === true`.
- Partial-fail / total-fail clips stay in `approved` because they're never written to `trackerData`.
- Side-effect: tracker reflects "what actually went live on all enabled platforms" only, which is a cleaner semantic than today.

### 3. Re-hydrate `publishStatus` from `clip.publishState` on mount
- A `useEffect` keyed on `approved` builds initial `publishStatus[clipId] = { state, platforms }` from any clip's `publishState`.
- Lets the "Failed" filter and retry path work after restart, no matter when the failure happened.

### 4. Make the Retry button discoverable
- The `retryFailed(clipId)` function already exists — just verify the button renders when `publishStatus[clipId]?.state === "failed"`.
- If it's currently buried in the platform-status pill area, hoist it to the clip row's primary action so it's not missed.

---

## File impact

- `src/renderer/views/QueueView.js` — `publishClip` (gate logPost + persist), `retryFailed` (persist), one `useEffect` to hydrate, retry button placement
- No main-process changes — `project:updateClip` already accepts arbitrary fields

## Verification (must run all)

1. Disconnect Instagram in Settings (force a failure) and publish a clip with 4 platforms enabled
2. After publish: YT + FB succeed, IG fails → clip **stays visible** in queue
3. Filter dropdown set to "Failed" → clip appears
4. Each platform pill on the clip shows correct icon (✅ / ❌)
5. Click **Retry** → only IG (the failed one) is retried; YT + FB are skipped
6. Reconnect IG (using today's loginType-inference fix), retry again → all green, clip moves out of queue (logPost runs, tracker gets the entry)
7. Close + reopen ClipFlow before retrying → clip still shows as failed; Retry still works

## Effort & risk

- **Effort:** ~45 min
- **Risk:** Low. Additive clip field. Existing publish flow only changes in two places (`logPost` gating + state persistence). The hydration effect is the only net-new logic.

## Out of scope

- Tracker entries for partial-success runs (today's behavior: only fully-successful runs go to tracker — keeping that)
- Retrying for scheduled clips at the time the schedule fires (separate concern — scheduler isn't running publishes today, the user manually triggers from the queue UI)
- Notification / toast when a publish fails in the background

---

## Awaiting approval before any code changes.
