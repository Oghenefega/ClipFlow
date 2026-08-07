# ClipFlow — Session Handoff

_Last updated: 2026-08-07 — Session 157 (no-code session: per-clip AI unit economics measured from real logs, handed to Wick for the pricing conversation)._

---

## One-line TL;DR

Q&A session, zero code changes. Fega asked what a clip costs to run; I pulled the real numbers from the app's own pipeline cost logs (not estimates), Fega defined the heavy-user profile (10 clips/day, 7 days/week), and the whole thread — measured costs, heavy-user math ($17–30/mo API), BYOK-vs-bundled implications — is now a pending item in Wick's inbox for the pricing conversation. One stale-memory fix: Gemini billing has been PAID tier since 2026-08-04 (my memory still said "free tier, flip owed").

## Current State

Unchanged from session 156: master at `c0ba219`, installer `dist\ClipFlow Setup 0.3.0-alpha.41.exe` cut — **Fega still has NOT confirmed installing it** (daily driver is alpha.40 until Settings → bottom reads v0.3.0-alpha.41). #245/#246 closed `status: untested`. No repo files touched this session.

## What Was Done (session 157)

- **Measured per-clip AI cost from real logs** (`%APPDATA%\clipflow\processing\logs\`, 2026-08-06 RL Day14 runs): detection $0.11–0.12 per ~30-min recording (20–23 clips found ≈ half a cent per detected clip, ~23¢/hour of footage); Gemini video titles ~$0.024 per generate; Whisper/FFmpeg local and free. **≈3¢ of AI spend per published clip. All 78 retained log runs total $5.13.**
- **Heavy-user unit economics** (Fega's definition: 10 clips/day × 7 days ≈ 300 clips/month): titles ~$7–10/mo, detection ~$10–21/mo depending on 1.5–3h recorded daily → **$17–30/month total**. Key structural point: titles scale with clips published, detection scales with HOURS RECORDED.
- **Handed the thread to Wick** — pending item in `Wick\inbox.md` (2026-08-07) with the numbers, the heavy-user profile, and the open pricing questions (BYOK vs bundled tier, bundled price floor, hours-vs-clips limits). Wick picks it up on his next session start.
- **Memory correction:** `project_gemini_video_titles.md` + MEMORY.md index updated — Gemini billing flipped to paid 2026-08-04 (per Wick's inbox archive); the "free tier, billing flip owed" claim was stale.

## Key Decisions

- **Heavy-user planning profile is Fega's call: 10 clips/day, 7 days/week.** Use this for any future pricing/capacity math, not the earlier casual "100 clips/month" figure.
- **Pricing conversation belongs to Wick, not dev sessions** — continue it there; dev only builds what falls out (e.g. the optional cost-per-clip line below).

## Next Steps (priority order)

1. **Confirm Fega installed alpha.41** (Settings → bottom reads v0.3.0-alpha.41). After a clean launch with games looking right, the prod settings backup (below) can go.
2. **Fega: #240 6-step import verification** (standing, five sessions now).
3. **Watch cut-edge quality post-install** — gc245's coverage caution (86% vs 93%, late starts 5 vs 1). Bad-cut chips ticking up → game-context injection is suspect #1; firming option ≈ $0.25 of EO runs.
4. **Verify the first-draft play-style reframe live** next time a Play Style Update fires for an empty-profile game (the one #246 surface not CDP-driven).
5. **#243 + #245 untested labels** — clear on real-use confirmation.
6. **Possible from Wick:** a "cost per published clip" line in the in-app monthly cost view (`pipelineLogs:monthlyCost` already computes monthly totals) — build only if Wick/Fega ask.
7. **#225 Part B** when a real publish can verify.
8. **Standing session-start check:** #234 v3 re-test trigger (≥15 v3 chips in RL's 50-row rejected window; last known: 0 tagged).

## Watch Out For

- **Boundary coverage is the metric to watch once #245 is live** — bad-cut chips after alpha.41 → game-context injection is suspect #1.
- **Prod settings backup** `%APPDATA%\clipflow\clipflow-settings.backup-2026-08-06.json` — keep until alpha.41 installs and games look right, then it can go.
- **Gemini titles bill real money now** (~$0.024/generate, paid tier since 2026-08-04) — regenerate loops in the editor are no longer free-tier phantoms.
- **AddGameModal steps renumbered** (1 details → 2 play-style → 3 interstitial → 4 done; content types skip step 2). Any reference to "step 2 = generating" is stale.
- **`gameProfiles:updatePlayStyle` takes an optional 3rd arg (gameName)** — old 2-arg callers still work.

## Logs/Debugging

- **Cost evidence lives in** `%APPDATA%\clipflow\processing\logs\` — per-run `API cost:` lines (detection runs, `titlegen_*` for Gemini titles, `queue_imports_*` for #240 passes). Sum across all retained logs 2026-08-07: $5.13 over 78 runs.
- **API spend this session:** $0 (no model calls made by the app; analysis only read logs).
- Session 156's debug artifacts (gc245 result JSONs, coverage script, CDP drive script) unchanged — see `tasks/spikes/replay-score/results/` and prior handoff notes if needed.
