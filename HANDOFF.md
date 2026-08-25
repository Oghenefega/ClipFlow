# HANDOFF — Session 201 (2026-08-25)

## Current State

**`741d3a8` (#309 Media tab) reviewed and PASSED** — verdict + findings commented on #309.
Two review nits fixed and shipped as `d30fd39` (safe thumbnail URLs via shared `toFileUrl`,
"N sounds → Audio panel" import message); verified by build + dev-profile CDP drive (grid
renders, all thumbnails load). Session then turned into a publishing-infra firefight — all
resolved (see Key Decisions). App code is otherwise untouched; #310 is the next build.

## Key Decisions

1. **#314 filed (review finding, edge case):** watched-folder lists are kind-blind on
   shared/nested roots across audio+media lists — ghost "file missing" entries + toggle-off
   leak. Doesn't bite disjoint setups. Fix sketch in the issue (kind-aware membership).
2. **#315 filed and PARKED (Fega's call):** Tracker loses a partially-failed scheduled clip
   (invisible until retry), then logs it at retry time snapped to the wrong slot. Fix
   direction in issue: stamp from `clip.publishedAt` (Part A) + keep a "needs retry" card
   visible (Part B).
3. **TikTok TLS publish failures = NordVPN**, not the app (memory saved). Fega split-tunneled
   Corva out of the VPN; TikTok confirmed working after.
4. **YouTube weekly token death PROPERLY fixed:** the Aug 6 Production flip had hit the wrong
   twin — two GCP projects are both named "ClipFlow"; the app's client lives in
   `clipflow-489803` (number 808510634988). Published to Production via Claude-driven Chrome
   (Branding filled: flowve.app URLs + authorized domain; app name stays "ClipFlow" —
   dev-app rename is trademark-gated). Fega reconnected post-flip (token 19:29Z, no expiry).
   Any future `invalid_grant` is genuinely new.
5. **#316 filed (launch-ops):** flowve.app/clipflow privacy/terms links are dead — catch-all
   serves the homepage. Google accepted the URL for now; real pages needed before any review.

## Next Steps

1. **Fega's in-app check of #309** (needs next installer, or `npm run dev`): open clip →
   Media rail → eyeball grid + physically drag a file onto the drop strip. Then close #309.
2. **Build #310** — image/GIF overlays end-to-end (placement model, overlay tracks,
   on-canvas drag/resize, FFmpeg compositing). MediaPanel review notes for it: subscribe to
   `assets:scanProgress` for live video-duration badges (preload's `removeAllListeners`
   teardown means naive dual subscription conflicts with AudioPanel), and `lastUsedAt`
   stamping feeds the Recent chip.
3. Then #311, #312; #313 doc fix; #314 whenever convenient.

## Watch Out For

- Everything in S200's handoff still applies to #310: magic `276` timeline height
  (`EditorLayout.js:1206`), `renderThumbnail` needs overlay pre-filtering at its timeline
  `t`, media-entry ids unstable until an installer ships (prod alpha.5 prunes dev-written
  media entries — favorites set before then can vanish).
- Publish-log forensics: per-platform raw API responses live in
  `%APPDATA%\clipflow\clipflow-publish-log.json` (`apiResponse` field on failures) — that's
  how both the TikTok TLS and YouTube invalid_grant diagnoses were made.
- "My confidence lasted two seconds" (Mon 1:30p clip) may still be in the
  partial-failure state (FB/IG out, TikTok failed during the VPN block) — if Fega hasn't
  retried it, it's invisible on the Tracker (#315's exact symptom).

## Logs/Debugging

- GCP console URLs accept a project NUMBER in `?project=` and redirect to the id — fastest
  way to find which of several same-named projects owns an OAuth client (client id prefix
  = owning project number).
- CDP driver pattern for the dev app lives in the s200 scratchpad (`cdp309.js`); editor nav
  = click the sidebar `button > span` with exact text, rail items via leaf-text ancestor
  walk. Dev boot "TikTok TLS" warnings were the VPN all along (memory updated), not stale
  dev tokens.
- curl (schannel) is a good app-independent TLS probe: reproduced TikTok's handshake reset
  outside the app while FB/IG/YT connected fine, which is what cleared the app of blame.
