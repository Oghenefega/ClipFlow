# HANDOFF — Session 246 (2026-09-07)

## Current State

**alpha.30 is cut, published to the R2 feed, and waiting on Fega's relaunch.** Two commits: the
rejection-tier work (`615e9b4`) and the release (`f7d6f86`). Master clean, 79 prompt-builder tests
green (was 60), renderer builds clean, boot verified on the dev profile against the built bundle.

The session started as a product conversation — Fega was hand-typing the same two rejection reasons
on 100T clips — and turned into a correctness fix. The detection prompt was quoting delivery-class
rejections under "do NOT pick moments like these", and those clips are built from his catchphrases.
Measured on the prod DB (100T: 58 approved / 104 rejected): "let's go" 26% of approved vs 22% of
rejected, "get him out" 26% vs 17%, "bro" 48% vs 36%. Every signature phrase is **more** common in
the keepers — the negative examples were pointing the wrong way, not merely wasting budget.

Two issues filed and still open pending Fega's hands-on check: **#381** (the poisoning) and **#382**
(signature phrases reach the prompt but have no editor anywhere — only the Reset button, which wipes
them permanently). **#341** was already filed for the content-type-aware chips and got the design.

## Key Decisions

- **Three tiers, not two.** The old split was "mechanical vs taste"; the missing axis is *can the
  transcript carry this verdict*. Bookkeeping (unchanged), **content** (words are evidence, still
  quoted), **delivery** (verdict is in the audio — row dropped). Delivery *alongside* a content
  reason keeps the row: most of Fega's `flat-delivery` uses are co-tagged and that content verdict
  is real.
- **Delivery rejections do NOT get the mechanical exemption in the #194 quality stats.** Excluded
  from the prompt because the text can't carry them, but a clip thrown away for a flat reaction is
  still a genuine miss by the engine and belongs in the denominator.
- **Chips branch on the creator's ranked moment priorities, not on archetype.** Fega's ask was
  "different creator types should get different reasons". `entryType × archetype` would have been 8
  hand-maintained vocabularies; deriving from `momentPriorities` is one six-row mapping that adapts
  to creators we've never met. `entryType` still branches, but only for `reaction-adds-nothing`.
- **`live-only` ("Didn't stand alone") sits in the shared core, not the react branch.** 7 of the 17
  free-text notes in the prod DB are this reason and they span RL and EO as well as 100T — it is a
  *livestream* reason, not a react one.
- **One-change installer, against the ~10-change batch rule.** Fega asked explicitly; he is
  reviewing 100T now, which is when the chips earn their keep.
- **Vocabulary consolidated into `src/shared/rejectReasons.js`** rather than kept in the four
  hand-synced sites #341 catalogued. Follows the existing `captionResolve` / `ytDescriptionTemplate`
  pattern (CJS exports, main `require`s, renderer `import`s, already in `build.files`).

## Next Steps

1. **Fega's verdict on the two new chips** — do "Didn't stand alone" and "Just sounded angry" catch
   what he'd otherwise type, or miss the shade he means? Close #381/#341 on confirmation.
2. **#382** — build the signature-phrases editor. Matters more than it looks: a new customer starts
   with `signaturePhrases: []` *and* `description: ""`, so they get the negative examples with none
   of the counterweight Fega has. #381 is strictly worse for them than for him.
3. **Re-run the `--no-rejected` ablation** once v4-tagged rows accumulate (`tasks/spikes/replay-score`).
   This is the queued cell from `tasks/specs/detection-input-science.md` §Step 3 — it has been waiting
   on a sharper vocabulary since alpha.38, and there is now one.
4. Standing: **#234** v3 re-test, the detection-science backlog.

## Watch Out For

- **The fix is preventative, not retroactive.** Measured on the existing 221 tagged rejections: 4
  carry a delivery tag, **0** are delivery-only, 1 gets regrouped. Almost nothing moves today — and
  that is precisely because Fega wasn't reaching for "Flat delivery", he was typing notes. Don't
  read a flat approval rate over the next few generations as the fix failing.
- **The harness will probably show ~nothing.** Removing the whole rejected section moved the
  rejected-hit rate 49% → 48% (within noise). It is the guardrail here, not the proof; the proof is
  the rolling 100T approval rate (#194).
- **The vocabulary has FIVE consumers, and one is invisible.** Adding a chip now means one catalogue
  edit — but the persisted `reject_reasons` CSV in the feedback DB and `rejectReasons` on clip JSON
  carry historical keys forever. `getReasonChips({ include })` pins stored keys so reordering
  Settings can't strand a tag; don't remove that.
- **`src/shared/` is a packaged path (`build.files`), and the main process now requires from it.**
  Verified present in the asar this cut. Any *new* cross-tree folder needs the same check or the
  packaged exe crashes at startup — `npx asar list` the artifact, never trust the globs.
- **The dev profile's game library is stale** — 11 entries, no `100T`/`GTA6-R`/`ROBOT`, so those
  projects resolve to no entry and fall back to `entryType: "game"`. The react-only chip therefore
  does not render there. Not a code bug; it cost time to diagnose. Verify entry-type behaviour
  against prod settings in node, or fix the dev gamesDb first.

## Logs / Debugging

- **Prompt artifacts are the fastest ground truth for anything detection-related.** Every run writes
  its exact system prompt to `%APPDATA%\Corva\processing\claude\<video>.system_prompt.txt`. Reading
  yesterday's 100T prompt is what proved the poisoning in one step — the profile block says
  "GET HIM OUT OF MY FACE means he made a great play" and the rejected section says avoid those
  words, ~150 lines apart. Faster and more honest than reading the builder.
- **Rebuild a section against the real DB before believing a prompt change.** Copy
  `%APPDATA%\Corva\data\clipflow.db` to temp, open it with node's built-in `node:sqlite`
  (`new DatabaseSync(path, {readOnly:true})` — there is no sqlite dep in package.json), pull the same
  window the pipeline uses (`WHERE game_tag=? AND decision='rejected' ORDER BY timestamp DESC LIMIT 50`)
  and call `buildRejectedSection` with the electron stub from `ai-prompt.test.js`.
- **CDP verify on the dev profile:** `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222`
  (loads `build/`, not Vite), then `scripts/dev/cdp.js "<expr>"` and `scripts/dev/cdp-shot.js out.png`.
  Two gotchas hit this session: a "Corva updated" modal blocks the first interaction (dismiss "Got
  it"), and `cdp.js` takes the expression as argv — **regex literals and `!` get mangled by the
  shell**, so write the expression to a file and pass `"$(cat file)"`.
- **Bash heredocs still eat a backslash level** (`feedback_bash_backslash_collapse`): a Python
  heredoc containing `'\'` died with an unterminated-string SyntaxError, and `grep -E "^\\src\\shared"`
  silently matched nothing. Anything with Windows path separators goes in a file via Write, or builds
  them from `String.fromCharCode(92)`.
