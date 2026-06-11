# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## Fix Queue nav badge overcount (#139)

**Status:** ✅ SHIPPED in session 81 on **0.1.8-alpha.4** (`47a9d15`) — awaiting Fega's in-app verification (`status: untested`).
`totalApproved` (App.js:451) now applies the publish-tracker exclusion the Queue list already uses, so the badge matches the list.
Full root cause + patch in GitHub issue **#139** (`type: bug` / `area: queue`).

**Symptom:** Queue bottom-nav badge showed **"10"** while only **1** clip was really queued. The badge counts every
rendered `approved`/unscheduled clip, but publishing never flips a clip out of `"approved"` — so already-published
clips keep inflating the badge. The Queue *list* already hides them (via the tracker), the badge doesn't.

---

## NEXT — Cancel/Stop an in-progress clip render (#140)

**Status:** 📋 PLANNED in session 81, awaiting Fega's approval. NOT implemented.

**Request (Fega):** "There is no way for me to stop a queue once it's started. I need there to be a way to do that."
The screenshot was the editor topbar render button at **34%** (the gold spinner pill) — i.e. he wants to abort the
render that runs when he hits **Queue** (or **Render**).

**Key finding (traced — the render has TWO cancelable phases, not one):**
- The progress bar maps **0–40% → subtitle/caption OVERLAY-FRAME render** (offscreen `BrowserWindow`, `subtitle-overlay-renderer.js renderOverlayFrames`, frame loop at `:246`, `win` created `:170`, `win.destroy()` in finally `:281`). **34% is THIS phase — no FFmpeg process exists yet.**
- **40–99% → FFmpeg** encode (`render.js:314` `const proc = spawn("ffmpeg", args)`; close handler `:332`).
- Neither resource is reachable from outside: `win` and `proc` are local; there is NO `render:cancel` IPC. (Only existing kill pattern is `signals.js:252` for Python, also local.)
- Render start path: `EditorLayout.doRender` (`:264`) → `window.clipflow.renderClip` (preload `:113`, `ipcRenderer.invoke("render:clip")`) → `main.js` handler (`:2220`) → `render.renderClip`. Progress streams back on `"render:progress"`; UI state `rendering`/`renderPct` (`:227-228`), progress pill JSX at `EditorLayout.js:882-892`.

**Design:** one cancel that handles BOTH phases and reads as "Canceled," never a red "Failed."
- `render.js`: module-level `let canceled=false`, track the active overlay `win` + ffmpeg `proc`; export `cancelActiveRender()` that sets the flag, `win.destroy()` if in overlay phase, `proc.kill("SIGTERM")` if in FFmpeg phase. The FFmpeg `close` handler already fires on kill (code≠0) — branch on the `canceled` flag to resolve `{ canceled:true }` instead of rejecting with a "render failed" error. Same for the overlay loop (check flag at top of `:246`, bail with `{ canceled:true }`).
- `subtitle-overlay-renderer.js`: accept a cancel-check (or expose the active `win`); break the frame loop when canceled; existing `win.destroy()`/`cleanupOverlayFrames` handle teardown.
- Cleanup on cancel: `cleanupOverlayFrames(tempDir)` (already runs) **+ delete any partial output `.mp4`** so no half-written file is left; do NOT set `renderStatus` (clip stays unrendered/draft — no Queue entry, no red marker).
- `main.js`: `ipcMain.handle("render:cancel", () => render.cancelActiveRender())`; on a `{ canceled }` result, skip the renderStatus/thumbnail writes.
- `preload.js`: `cancelRender: () => ipcRenderer.invoke("render:cancel")`.
- `EditorLayout.js`: add a small **✕** inside the gold progress pill (`:882-892`, shown only while `rendering`) → `window.clipflow.cancelRender()`. Treat the `{ canceled }` result as a clean reset (`rendering=false`, `renderPct=0`, brief "Canceled" flash) — NOT the `renderStatus:"failed"` path.

**File impact (no schema change):** `src/main/render.js`, `src/main/subtitle-overlay-renderer.js`, `src/main/main.js`, `src/main/preload.js`, `src/renderer/editor/components/EditorLayout.js`.

**Steps:**
1. render.js cancel infra (flag + handles + `cancelActiveRender()` + canceled-vs-failed branching + partial-file delete).
2. subtitle-overlay-renderer.js: make the frame loop interruptible.
3. main.js `render:cancel` handler + skip-writes-on-cancel.
4. preload.js `cancelRender` bridge.
5. EditorLayout.js ✕ button + clean-reset handling.
6. `npm run build:renderer` compile check + `clipflow-code-review` self-check. (NO version bump / installer — batching per session-81 rule.)

**Verification (Fega, plain — ~2 min):** Open a clip, hit **Queue**, and while the gold **%** spinner is going, click the new **✕** on it. ✅ the render stops within a second, the buttons go back to **Render / Queue**, and nothing shows up half-done in the Queue tab (no red "Failed" card). Try canceling both early (while it says a low %, ~under 40) and later (higher %) — both should stop cleanly. ❌ it keeps going, throws a "failed" error, or leaves a broken clip.

**Watch out for:** cancel arriving right as a phase finishes (race) → guard `cancelActiveRender()` to no-op when no active win/proc. The offscreen overlay window MUST be destroyed or it leaks. Don't mark the clip failed on a user cancel (that's the #1-confusing outcome).

---

**Root cause (traced):**
- Badge = `totalApproved` at `src/renderer/App.js:451-453` — filters `status approved/ready && !scheduledAt`, NO tracker exclusion.
- List = `approved` at `src/renderer/views/QueueView.js:525-536` — same status check PLUS `!scheduledClipIds.has(c.id) && !scheduledTitles.has(c.title)` (the tracker-based "already published/scheduled" exclusion, built at `:505-506`).
- `logPost` (`QueueView.js:1149-1158`) only adds a tracker entry on full publish success; immediate publish leaves `status:"approved"`, `scheduledAt:null`.
- `trackerData` is already in App.js scope and passed to QueueView (`App.js:564`) — no plumbing needed.

**File impact:** `src/renderer/App.js` only (the `totalApproved` useMemo, ~line 451). No schema change.

**Steps:**
1. In `totalApproved`, build `trackedIds`/`trackedTitles` Sets from `trackerData` and add `&& !trackedIds.has(c.id) && !trackedTitles.has(c.title)` to the filter (exact snippet in #139). Add `trackerData` to the `useMemo` deps.
2. `npm run build:renderer` (compile check) → run `clipflow-code-review` self-check.
3. Cut installer `0.1.8-alpha.4` via `clipflow-update-launcher`; commit `App.js` (fix) + `package.json`/`CHANGELOG.md` (bump). Never stage `data/`.

**Verification (Fega, plain — ~1 min):** Open the Queue tab. The little number on the **Queue** button at the bottom should match how many clips are actually sitting in the list waiting to publish (right now that's **1** — "Water Treatment"). Publish or queue a clip and watch the number go down/up by one. ✅ matches the list / ❌ still inflated.

**Out of scope (noted in #139):** badge won't mirror the list's hashtag/gameTag drop unless `requireHashtagInTitle` filtering is duplicated — revisit only if a hashtag-less off-by-one ever shows up. Longer-term cleaner option: one shared "actionable queue count" instead of two parallel filters.

---

## ACTIVE PLAN — TikTok Content Posting audit, ROUND 2 UI fixes (resubmission blocker)

**Status:** ✅ SHIPPED in session 79 on **0.1.8-alpha.2**. Item 1 (A9 notice visible during the
publish window) + Item 2 (Music Usage above Commercial Disclosure) shipped in
`src/renderer/views/QueueView.js` (`815433a`). **Item 3 (A8 capacity message) needed NO code —
already implemented** in the main process via `translateTiktokPublishError` (`main.js:2510`),
which maps TikTok's over-limit/rate-limit family to "reached its posting limit — try again later"
and the publish results panel already surfaces it (the plan's "A8 unbuilt" assumption was stale).
A follow-up Queue-card quality pass (`29a83a1`) + publish-status "Processing…" fix (`762fc09`)
landed on top after Fega reviewed the live card. **Code side of the resubmission is DONE.**
Remaining = Fega's NON-CODE steps: portal Org rename to match App Name, re-shoot Video 2
(reordered panel) + Video 3 (must show the 5d notice during processing), resubmit — recorded
against 0.1.8-alpha.2. Original investigation kept below for reference.

**Why:** First TikTok Direct Post audit DENIED 2026-06-03. Cited **UX Guideline Point 5d**
(missing "may take a few minutes to process/appear" notice = our A9) + panel rendered out
of guideline order. Resubmission needs these fixed, then re-recorded videos.

**Spec:** `tasks/specs/tiktok-content-posting-audit.md` → read the **ROUND 2** section
(line ~292) AND the A8/A9 rows (~45-46). All three fixes are renderer-only, in
`src/renderer/views/QueueView.js`.

### Read first (anchors already traced — load these regions)
- `QueueView.js` `TiktokOptionsPanel` ~180-442 (the panel; A4 Music Usage block **411-439**, A5 Commercial Disclosure block **357-409**).
- `QueueView.js` `getTiktokBlockReason` **742-768** (the publish gate; mirror its style for A8 — but see A8 note).
- `QueueView.js` publish-results panel **1617-1651** (the A9 block lives at **1643-1648**, gated `tiktokDone` at **1618-1621**).
- `QueueView.js` `publishClip` ~994-1075 + `retryFailed` ~840-905 (success sets per-platform status `"done"` at **889**; TikTok error surfaces as `result.error` → shown as status string at **885**).
- `src/main/oauth/tiktok-publish.js` `publish()` 322-410 — emits `progress("processing", 85, "Processing on TikTok...")` then `await pollPublishStatus` (polls TikTok to completion) **then** flips to done. `queryCreatorInfo` (108-115) returns raw creator_info `data` (no capacity field).

### KEY FINDING (don't miss this)
A9 is **NOT** "never built" (spec wording is stale). The message *"Your TikTok post may take a
few minutes to appear on your profile"* already exists at **QueueView.js:1646** — but it only
renders when the TikTok row status === `"done"`, which happens **after** `pollPublishStatus`
finishes. During the long "Processing on TikTok…" poll window (what the screen recording
captures) the notice is absent. The "Processing…" Fega sees is the main-process progress
`detail`, surfaced at **1637** while status is `"publishing"`. So A9 is effectively dead during
the window that matters.

### Item 1 — A9 / Point 5d (BLOCKER)
- Broaden the trigger: render the notice when a TikTok platform status is `"publishing"` OR
  `"done"` (i.e. accepted/in-flight, not failed/pending) — not only `"done"`. Compute a
  `tiktokAccepted` flag to replace `tiktokDone` at **1618-1621 / 1644**.
- Make it clearly visible for the recording (current line **1645** is tiny tertiary italic).
  Render as a proper info line (small icon + readable secondary text; `InfoBanner` style as used
  at **1656** is consistent). Acceptance: the message is on screen during the processing window.

### Item 2 — Panel reorder (Point order 1→5)
- Move the **A4 Music Usage Confirmation** block (**411-439**) to render ABOVE the **A5 Commercial
  Disclosure** block (**357-409**) — i.e. immediately after the A7 duration banner (ends **355**).
  Pure JSX move. Resulting order: Posting-as → Privacy → Interaction toggles → (A7 banner) →
  **Music Usage** → **Commercial Disclosure** (with its Paid-partnership/Promotional labels).
- Nuance (decided: keep the simple move): the A4 block carries a conditional Branded-Content-Policy
  legal variant; after the move it renders above the Branded Content toggle. Stays compliant; test
  publish uses SELF_ONLY/non-branded so the reviewer won't hit it. Only split it out if Fega asks.

### Item 3 — A8 capacity check (DECIDED: publish-time, Option B)
- **creator_info has NO pre-flight capacity flag** (existing comment at **740-741** + TikTok docs
  agree; spec's `can_post` claim is wrong). DO NOT re-litigate; DO NOT add a pre-flight gate in
  `getTiktokBlockReason` for capacity (it'd be dead code).
- Instead: when a TikTok publish returns TikTok's over-limit/rate-limit error, translate it to a
  clear **"You've hit TikTok's posting limit — try again later."** message in the publish-results
  panel (the renderer already captures `result.error` at **885**; map the specific error there).
- **TODO when coding:** pin TikTok's actual over-limit error code/string. Check `tiktok-publish.js`
  error paths + TikTok Content Posting API docs (`spam_risk_too_many_posts` / rate-limit family).
  Match defensively so a wording shift doesn't break it.
- **No simulation toggle.** Not required by TikTok; not in the recording playbook; the denial
  didn't cite capacity. Can't force a real limit on camera anyway. (Decided with Fega.)

### NOT needed
- **No schema/store version bump.** None of the 3 items add a persisted clip field (A9 = render-gate
  change; reorder = JSX; A8 = publish-time error translation). A1–A7's `clip.tiktok*` fields + their
  bump already shipped in Session 39. The spec's migration requirement does not apply to Round 2.

### Build & verify (after coding)
1. `npm run build:renderer` + `npm start`; verify in-app (no live TikTok account needed for these):
   panel renders top-to-bottom Posting-as → Privacy → toggles → Music Usage → Commercial Disclosure;
   the A9 notice shows clearly during a publish (even mock) and stays visible.
2. Steps needing Fega's live audited TikTok account (real publish, real privacy badge, real limit
   error) are his to exercise during re-recording — flag which.
3. Cut a fresh **0.1.8-alpha** via the `clipflow-update-launcher` skill so Fega can re-record.

### Acceptance (from Fega)
- Publishing a TikTok clip shows "may take a few minutes to appear" in the success/processing state, on screen.
- TikTok panel order: account/@handle → privacy → interaction toggles → Music Usage Confirmation → Commercial Disclosure → compliance labels.
- Over-limit creator returns TikTok's error → publish shows the clear "try again later" message (publish-time).
- Keep the existing chunk-math fix (`Math.floor`, **QueueView.js:1355**) intact; don't regress publishing.

---

## SHIPPED — recent (closed)
- **Session 77 karaoke fragile-zone sweep** (all closed `status: untested`, one commit each):
  **#136** word-delete words/text desync (`5befa4c`); **#89** mode-switch edit loss (`0e55482`);
  **#131** srcWordIdx highlight/seek desync (`af2f15d`); **#132** mid-playback click freeze
  (`861d9fe`); **#95** split word dup/drop (`afb70f5`); **#87** tight-gap overlap (`16f8ae5`);
  **#90** stale clip-load playhead (`6c3eb84`); **#88** initVideoRef set() (`af0939f`); **#107**
  resolved-by #131/#95. Filed **#137** (timeline split time-space) + **#138** (AA toggle vs words[]).
- **Session 74 fix-first batch** (all closed `status: untested`): **#124** waveform/ffmpeg logs → `app.log` (`759e7a2`); **#92** "Applied" badge gated on confirmed save (`1fc5964`); **#101** punctuationRemove restored on reopen, **#32** caption-width restored on reopen, **#106** passive-wheel console warning killed across 3 handlers (`a197bc3`). Parked #68/#62; recorded the `tools/`-bundling scope correction on #68.
- **#57** Editor 30-min lag (60fps re-render storm) — **CLOSED** (D1 `c74c30e` timeline + D2 `985fa12` subtitle list). Both per-frame storms isolated into tiny memoized children (`TimelinePlayhead`, `SegmentRow`); Fega-confirmed smooth. Phase D3 (row self-subscribes to `currentTime` so the parent can drop its sub) was the conditional fallback — not needed.
- **#129** ALL-CAPS (AA) no-op on uncased text — fixed (`507347a`, session 72). Surfaced by the D2 fresh-eyes review.
- **#130** Stale "Long segment" warning after timecode/split/merge — fixed (`507347a`, session 72). Surfaced by the D2 fresh-eyes review.
- **#125** Recordings (i) info popover + Play-recording-in-editor — closed (`1d33a9d`, session 70).
- **#126** Recordings sort by part number, not rename-click time — shipped (`f2240e2`, session 70).
- **#123** Recordings floating action cluster + sequential batch generate — closed (`e9a039d`, session 68).

---

## Deferred plans

### #85 Chunk B/D — title/caption clip-signal forwarding (was active session 45)
Plan to forward `energyLevel` + `confidence` into the title/caption prompt
(`useAIStore._collectClipParams` → `title-caption-prompt.js buildUserContent` →
`main.js anthropic:generate`). Chunk D (wire full `creatorProfile`) is
**deliberately deferred** — profile is detection-only by design; feeding
`archetype` into wording re-introduces the generic template-y copy session 42
removed. Full body recoverable from `git log -p tasks/todo.md`. Re-introduce when
returning to #85.

### Interactive architecture/flows visualizer
A previous session drafted a single-page HTML architecture visualizer for the
Obsidian vault (`context/architecture/`) using vis-network 9.x. Never approved or
started. Body recoverable from git history. Re-introduce when there's appetite for
a docs-quality artifact.
