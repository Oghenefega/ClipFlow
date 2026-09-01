# HANDOFF — Session 224 (2026-08-31)

## Current State

Two AI caption bugs fixed, both prompt-only (`c4f985c`), then three defects in that
fix corrected by a review pass (`0f46d2a`). **#343** — captions came back with a
literal `" / "` that would burn onto the video; the prompt's own display notation
(`flattenCaption` renders example newlines as `" / "`) leaked into output because the
schema never said how to write a break. **#344** — all three captions mirrored all
three titles; #183's deliberate card-1 pairing was never scoped, so the model applied
it to the whole batch, chips included. Also corrected the caption line-count rule
against the published record (2 lines mandated; 12 of 81 are three-line, 11 are
one-line). Both issues closed `status: untested`.

**Nothing is on the daily driver.** alpha.14 is the newest cut and Fega has not
installed it; these fixes ride the next one. A fresh `unreleased` entry is open in
`release-notes.js` (the alpha.14 cut consumed the previous one), so the cut just needs
renaming + dating it.

## Key Decisions

- **Card 1 stays shared between title and caption; only cards 2-3 were freed.** #183's
  reasoning holds — the strongest line shouldn't be wasted on one surface. The bug was
  the missing scope, not the pairing.
- **The 4-9 word caption budget was left alone** after measuring: it covers 79 of 81
  published captions (median 6). Only the line-count rule was wrong. The initial flag
  bundled a correct rule and an incorrect one into one impression.
- **Residual word-budget drift (~1 in 7) deliberately not chased.** A/B puts the old
  prompt at 1 in 4, so it's pre-existing, and tightening means adding rules to a prompt
  whose own rebuild notes blame rule-stacking for the slop it was written to cure.
- **`flattenCaption` now distinguishes a stanza break (`" // "`) from a line break
  (`" / "`)** so the new blank-line rule has visible exemplars instead of being asserted
  against examples flattened into indistinguishability.

## Next Steps

1. **Cut an installer** when the batch justifies it — nothing else is queued, so this is
   whenever Fega wants the caption fixes on the daily driver. Use `clipflow-update-launcher`;
   rename the `unreleased` entry at cut time.
2. **ALL-CAPS caption rule (unfiled, offered and not taken up).** Rules say "at most once";
   Fega's real captions routinely use two runs (`"What on EARTH / is WRONG with me"`,
   `"INSANE 2v1 CLUTCH // 100 THIEVES IS BACK"`). Same class as the 3-line bug — a rule
   writing against his habit. One-line change if he wants it.
3. **#341** (content-type-aware rejection chips) and **#342** (ambient background for
   non-editor tabs) — investigated and filed in s223, still unbuilt.
4. Fega still hasn't confirmed alpha.13 or alpha.14 in use.

## Watch Out For

- **`title-caption-prompt.js` is shared by three callers.** `buildSystemPrompt` (editor
  AI panel), `buildSingleSystemPrompt` (Rephrase/Regenerate), and `buildImportSystemPrompt`
  (#240 queue imports) all call `formatVoice`, so an example-block edit reaches the imports
  prompt too — which produces title+game only, no caption. Harmless but worth knowing.
- **Verifying a prompt change needs live generations, not a build.** Build + boot proves
  nothing here; the file is main-process text that only the model reads. The pattern that
  worked: stub the electron-store (`llmProvider.init({get})` from `clipflow-settings.json`),
  require the anthropic provider, pull real voice examples + a transcript from
  `title_caption_rounds`, and A/B against `git show <sha>^:<file>`.
- **Bucket generation failures by slot.** The word-budget violations clustered on card 2,
  and that clustering — not the count — was the fingerprint of the dropped spec. Count
  alone read as an improvement.
- **The prod DB is the source of truth for voice data**, not the repo copy: `%APPDATA%\clipflow\data\clipflow.db`.
  Query it with the bundled `sql.js` (no CLI sqlite), and build paths with `path.join` —
  the Bash tool collapses backslashes in `$APPDATA\...` string literals.

## Logs/Debugging

- **No errors this session.** Boot-verified twice on the dev profile via CDP (renderer
  mounts; What's New correctly shows alpha.14 with the `unreleased` entry filtered out —
  both `whatsnew:get` and `whatsnew:getAll` filter on `version !== "unreleased"`).
- **A `mounted:false` CDP read is usually a timing artifact** — CDP answers ~15s before the
  renderer finishes; re-query after a few seconds before treating it as a failure.
- **Killing the dev Electron makes its background task report exit code 1.** Expected after
  `taskkill //F //IM electron.exe`, not a crash.
- **Data audits run this session (all clean, no migration needed):** 0 of 839 clips under
  `projectsRoot` had a separator in an applied caption; 70 of 124 `title_caption_rounds`
  rows carry a real newline and 0 carry a slash — the training data was never the source
  of the bug.
