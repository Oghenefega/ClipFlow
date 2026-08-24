# HANDOFF — Session 186 (2026-08-23)

## Current State

**Audit session. No product code changed.** Commit `046040e` on master carries the audit
document and the changelog entry, nothing else.

**0.4.0-alpha.4 is installed on the desktop and confirmed** — `C:\Program Files\Corva\Corva.exe`
reports FileVersion `0.4.0-alpha.4`. That closes session 185's open question ("Fega has NOT
installed it yet"). The R2 feed at `engine.flowve.app/updates/alpha.yml` serves alpha.4.
`npm run build:renderer` exits 0 on the current tree.

**All 110 open issues were verified against the code** at `464dc53`, not against their titles.
Full document: `tasks/specs/backlog-truth-audit-2026-08-23.md`.

| | count |
|---|---|
| ALREADY-FIXED (open but done in code) | **35** |
| PARTIALLY-FIXED | 23 |
| STILL-LIVE | 48 |
| NOT-CODE | 4 |

Beta impact, rated for a stranger on their own machine: **1 blocker, 12 high, 13 medium, 35 low,
49 none.**

**Six previously unfiled defects filed: #297–#302.** Each was found by a fresh-install sweep and
then verified by hand before filing.

**Nothing was closed.** The 35 closable issues are Fega's call and were deliberately left open.

## What Was Built

### The audit itself

Method that matters for reproducing it: every issue read in full via `gh issue view N --comments`
(comments frequently carry the fix, a rescope, or a "handled by #X"), then traced into the code.
Every `ALREADY-FIXED` / `PARTIALLY-FIXED` / `BLOCKER` verdict was handed to a second agent
instructed to **refute** it — 58 claims went through that pass, 2 verdicts were overturned
(#43 PARTIALLY-FIXED → STILL-LIVE, #151 impact MEDIUM → HIGH).

**Two agent-reported BLOCKERs were refuted and must not be re-reported:**
- "Editor Layout panel crashes on fresh install" — `RightPanelNew.js:2191` has
  `if (!project) return null;`. The crash does not exist.
- "Render takes audio stream 0, ignoring the calibrated track" — it does take `0:a`
  (`render.js:149`, `:618`), but that is correct. OBS writes the master mix to track 1; the
  calibration wizard finds the *mic-only* track for transcription, deliberately a different
  track. Fega's own published clips are the standing proof.

### Fega's two corrections to Wick both confirmed

- **#146 is fixed.** FFmpeg ships in the installer (`package.json` `build.extraResources`,
  `vendor/ffmpeg` → `resources/ffmpeg`); Python/Whisper is a managed one-click download
  (`src/main/setup-runtime.js`, `EngineSetupView.js`).
- **#153 is mostly fixed.** `watchFolder` defaults to `""` (`main.js:224`); the legacy `W:\` pin
  is gated behind `fs.existsSync` (`main.js:374-375`) so it cannot fire on a stranger's machine.
  What survives is cosmetic: the Rename tab still shows a pulsing green **WATCHING** badge over a
  blank path.

### The real blocker is #21, and not for the reason the ticket says

All six credential slots default to `""` (`main.js:311-316`) — **no platform secrets ship, there
is nothing to leak.** The live problem is the inverse: a tester cannot connect or publish to any
platform without registering their own Google / TikTok / Meta developer apps. Shipping Fega's
client secrets is not an option (violates all three platforms' terms; risks the frozen TikTok
Direct Post approval). Re-framing posted as a comment on #21; #56 re-triaged the same way.

## Key Decisions

1. **Nothing closed unilaterally.** 35 issues are code-verified as done, but Fega has not
   confirmed any of them in the running app. Per the repo's own convention that is his call.
2. **Six new issues filed rather than fixed in place.** This was an audit session per Wick's own
   gate ("findings report first, zero code changes").
3. **`context/technical-summary.md` overwritten, not versioned** — per CLAUDE.md. The prior file
   was dated 2026-07-02 and pre-dated the Corva rename.

## Next Steps — the four fix batches (agreed shape, not yet started)

Grouped by surface so each is one coherent session. All four are independent; 1 and 2 are the
irreversible-harm ones.

**Batch 1 — Don't eat the tester's work.** #297 (autosave reports success on a failed save and
clears `dirty`; `project:updateClip` *returns* `{error}` instead of throwing), #298 (bootstrap is
an async chain with no `.catch()`, window created last, lock held → invisible zombie), #299
(SQLite rewritten whole in place, no temp file, no backup). All `small`. #299 is the likeliest
trigger of #298 — do them together.

**Batch 2 — Nothing of mine ships in the build.** #302 (delete `"Fega"` from both Whisper
`initial_prompt` arrays at `stable-ts.js:123`/`:229`; rename the **display name** of the
`fega-default` template but **NOT its id**, which is persisted in `activeTemplateId` /
`defaultTemplateId` / `builtInTemplateDeleted`; align `App.js:326-330` caption seed with
`STORE_DEFAULTS`; neutralise the default schedule + `weeklyTarget: 48`), #301 (resolve the
gateway token at call time instead of seeding it as a store default, plus a one-time migration
clearing a persisted copy). **Hard ordering constraint: #301 must land before the token reaches
anyone**, because afterwards the fix can only travel by the very path the defect breaks.

**Batch 3 — Recordings that aren't mine still work.** #62 (`energy_scorer.py:337-339` exits 1 on
digital silence — emit an all-zero energy JSON and exit 0), #300 (MKV accepted by the watcher at
`main.js:987` but `formatFilename` unconditionally appends `.mp4` at `RenameView.js:784`), #178
(ALAC/PCM silent in the editor preview). #178 and #300 share a root shape — the `<video>` has no
`onError`, so a decode failure is invisible. Add that regardless.

**Batch 4 — The first ten minutes don't look broken.** #153 (fake WATCHING badge), #74 (pipeline
internals — "Transcription (stable-ts)", "Claude Analysis", the five-row signal table — on the
most-watched screen in the product; **needs Fega to approve replacement copy**, that is the long
pole not the code), #152 (`trivial` — one un-confirmed click deletes a whole project folder).

**Then cut ONE installer** covering all four (~14 issues), per the batch-versions convention.

**Not in scope this week:** #21 (scope decision, Wick), #51 (cert procurement, 2–6 week KYC),
#265 (`large`), #70 (`medium`), #161 (`medium`).

**Optional Batch 5 if there's room:** #157 (`trivial` — Transcript Download button has no
onClick), #151 (`small` — render failure shows a 4s red flash, no reason, no retry), #158
(`medium` — subtitle mode round-trip 3w→1w→3w merges across pauses and stretches timings;
`segmentWords` is non-idempotent on its own output via `applyTimingRules` LINGER_DURATION).

## Watch Out For

- **Do not re-report the two refuted findings above.** They cost a verification pass each.
- **#302: change the template display name only.** Touching the `fega-default` **id** orphans
  Fega's own persisted template selection.
- **`tasks/todo.md` is a 3.7k-line archive** — Edit the head, never full-file Write it.
- **Untracked files pre-date this session** and were deliberately not committed: `.agents/skills/`,
  `.codex/`, `AGENTS.md`, `tasks/mocks/*`.
- **Wick has an open decision** in his inbox (publish scope A or B) plus three Cloudflare/provider
  dashboard checks for #56 that cannot be answered from code.
- **The `%APPDATA%\Corva` folder is still an empty shell**, so the #268 migration takes the safe
  `use-old` branch on every boot and real data stays in `%APPDATA%\clipflow`. Safe indefinitely;
  that is #288.

## Logs / Debugging

- **App log:** `%APPDATA%\clipflow\logs\` (prod is still the legacy dir — see #288).
  Dev profile: `%APPDATA%\clipflow-dev\logs\`.
- **Publish errors live in `clipflow-publish-log.json`, NOT `app.log`.**
- **Pipeline artifacts:** `%APPDATA%\clipflow\processing\{frames,energy,signals,claude,transcripts}\`.
  Only `logs` is pruned (`pipeline-logger.js:173`) — the rest grow forever.
- **Audit working data** (verdicts, evidence, per-agent reports) is in this session's scratchpad:
  `audit-data.json`, `arch-data.json`, `briefing-raw.md`. Regenerate the audit doc with
  `gendoc.py` + `newfind.py` if the tables need rebuilding.
- **Boot-verify without fighting the daily driver's single-instance lock:** launch with
  `CLIPFLOW_PROFILE=dev`. `npm start` exits 0 silently under the prod lock.
- **Repo `data/clipflow.db` is stale** — measure against `%APPDATA%\clipflow\data\`.
