# ClipFlow — Session Handoff

_Last updated: 2026-07-27 — Session 131 — **Learning loop overhaul shipped as 0.3.0-alpha.20: rejection + snippet learning (#191), kept-clip playstyle mining (#192), clip retagging (#197), rejection reason chips (#198).**_

---

## One-line TL;DR

Four connected learning-loop changes in one session. Morning: detection prompt learns from rejections and real transcript snippets (#191), playstyle updater mines kept clips from the DB (#192). Evening, after Fega's world-cup insight: clips can be retagged (session tag vs content tag, #197) and rejections carry optional reason chips that gate what counts as negative signal (#198). All four closed `status: untested`; installer **0.3.0-alpha.20** cut for Fega to test on the daily driver.

## Current State

- **#191, #192, #197, #198 closed with `status: untested`** — everything verified headless/unit-level.
- **0.3.0-alpha.20 is INSTALLED — Fega was actively testing at session wrap.** His verdicts (and the v6/v7 migrations against real prod data) land next session; nothing had been reported yet when the session closed.
- 54 unit assertions green: `node src/main/ai-prompt.test.js` (39) + `node src/main/game-profiles.test.js` (15).
- DB schema now **v7** (v6 adds `feedback.reject_reasons`; v7 is the one-time world-cup row move). Migrations run on first launch of the new build against the real prod DB — verified against a prod snapshot in the dev profile.

## What Was Just Built (evening half — #197/#198)

**#197 retag** — `ProjectsView.js` (ClipTagMenu + ClipRow), `App.js` (handleUpdateClipFields + gamesDb wiring), `useAIStore.js` (setAiGame persists), `useEditorStore.js` (seeds from clip.gameName), `RightPanelNew.js`
- Effective tag = `clip.gameTag || project.gameTag`. Review-card badge opens a grouped menu (Games / Content); editor's existing AI game picker now persists `{gameTag, gameName}` via projectUpdateClip and syncs the in-memory editor clip snapshot.
- Feedback logging (`ApproveRejectButtons`) uses the effective tag. QueueView publish/tracker paths already preferred `clip.gameTag` — no change needed there.
- Badge color resolves from the gamesDb entry for the effective tag.

**#198 reason chips** — `ProjectsView.js` (chip row in ClipRow), `feedback.js` (`updateReasons`), `database.js` (v6), `main.js` (`feedback:updateReasons`), `preload.js`, `ai-prompt.js` (filter)
- Reject stays one click. Chip row renders under the transcript only when rejected; card dims per-region (chips/buttons stay bright). Reasons + note stored on the clip (`rejectReasons`, `rejectNote`) AND pushed to the latest matching rejected feedback row (matched by video_id + clip_start + clip_end, so it works for clips rejected in past sessions too).
- Prompt filter: rows with `duplicate` / `bad-cut` / `wrong-content` never enter the rejected section (any excluded reason wins); `not-funny` / `nothing-happens` / `needs-context` stay with a `Reason:` line; reason-less rows behave as before. Pipeline now fetches 30 rejected rows to survive filtering; the 3k-char section budget still caps display.
- "Wrong content" chip shows a "Retag it" link → un-rejects + opens the tag menu.

## Key Decisions (evening)

1. **Asymmetric world-cup cleanup** — only the 3 APPROVED rows moved to JC (migration v7). The 7 rejected world-cup rows stay under RL as correct "don't clip chatting tangents" negatives; moving them would have poisoned JC with false negatives. Row 161 ("1v1 world cup" = RL tournament talk) proves keyword sweeps are unsafe — the migration is guarded by exact ids + decision + content.
2. **Retag = single reassignment**, no multi-tag. Plain reject (no retag) logs under the session tag by design — that's correct negative signal for that game.
3. **Reasons are optional, never blocking** — chips auto-save per tap, no confirm step. Taxonomy v2 after Fega rejected "Didn't land" as vague: split into Not funny / Nothing happens, added Needs context.
4. **Editor's AI game picker became the retag control** rather than adding a second control — it was already seeded from the project and fed generation; now it persists.
5. Computer-use verification was offered and **denied by Fega** — UI confirmation happens on his daily-driver test, which is what `status: untested` tracks.

## Next Steps

1. **Collect Fega's test results from 0.3.0-alpha.20** (he was mid-test at wrap): (a) generate on any recording — logged prompt at `processing\claude\<video>.system_prompt.txt` shows both sections; (b) reject a clip and tap chips — instant, chips readable on the dimmed card; (c) retag a clip to Just Chatting and approve — badge flips, feedback row lands under JC; (d) next RL playstyle threshold → diff card reads clean. Also confirm migrations ran (Settings shows v0.3.0-alpha.20; main.log shows "Running migration v6/v7" on first launch).
2. On confirmation, remove `status: untested` from #191/#192/#197/#198.
3. Consider later: "Posted this type too often" chip if the Note channel shows it recurring; retro-retag UI for published clips (declined for v1).

## Watch Out For

- **Migration v7 is id-anchored to the PROD database.** It no-ops on fresh installs and the stale repo DB (64 rows). If it ever needs re-running (e.g. DB restored from an old backup), the guard conditions must still hold.
- **`feedback.updateReasons` matches by (video_id, clip_start, clip_end, decision='rejected'), latest first.** If a clip's cut boundaries change AFTER rejection, a later chip tap writes to the row matching the NEW boundaries — which won't exist → silent no-op. Acceptable: rejected clips don't get re-trimmed in practice.
- **`clip.rejectReasons`/`rejectNote` live on the clip object in project JSON** — they rehydrate the chips. The DB row is the learning source of truth; the clip fields are display state.
- **The dev profile DB is a prod snapshot as of 2026-07-26** (copied for verification, backups at `clipflow-dev\data\*.bak-s131`) and is now at schema v7. Prod migrates on first launch of alpha.20.
- **Repo `data/clipflow.db` is STALE** (see memory): measure against `%APPDATA%\clipflow\data\clipflow.db`.
- `npm start` exits 0 instantly while the daily driver runs (shared single-instance lock) — boot-verify with `CLIPFLOW_PROFILE=dev npx electron .`.

## Logs / Debugging

- Dev boot log with both migrations: `%APPDATA%\clipflow-dev\logs\main.log` (04:16 — "Running migration v6/v7", schema v7, no errors).
- Migration verification queries + results: session transcript; key result — ids 179/181/182 → JC, 161 stays RL, all rejected world-cup rows stay RL, JC now has 3 approved examples.
- #191/#192 evidence (morning): session scratchpad `evidence/RL.system_prompt.txt`, `evidence/RL-playstyle-regen.json` (294 words, church-free).
- Unit tests: `node src/main/ai-prompt.test.js && node src/main/game-profiles.test.js` — 54/54.
