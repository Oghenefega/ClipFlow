# HANDOFF — Session 254 (2026-09-10)

## Current State

**0.5.0-alpha.2 is on the feed and installed on the laptop; Fega confirmed setup ran through
"Subtitle timing" to the end.** That closes #403 — the setup wizard had been failing on every
machine because the manifest on Cloudflare advertised a sha256 that did not match the object R2
served, so the app's checksum was correctly refusing a perfectly good download. All three timing
models were republished under content-addressed names and verified end-to-end (vosk re-downloaded
from its public URL hashes to exactly the manifest value).

Master at `05ff0bc` plus this wrap. The build also promotes #401 (Analytics clip panel) and #402
(editor glow/text colour link) from session 253 — **both still `status: untested`**, Fega has only
confirmed that setup finished.

## Key Decisions

- **Model zips publish under content-addressed names** (`<base>-<sha8>.zip`). A rebuilt model always
  lands on a fresh URL, so an old object can never be reused under a stale key. Second reason,
  equally load-bearing: vosk (214 MB) is under Cloudflare's 512 MB cacheable ceiling and was
  answering `cf-cache-status: HIT`, and there is **no Cloudflare purge token on this machine** — a
  same-name re-upload could have served the stale copy for hours.
- **Content comparison is the multipart ETag**, recomputed locally over 64 MiB chunks (R2 forms it as
  md5 of the concatenated part md5s + `-N`). Exact, free, no download. Used for both the skip
  decision and the post-publish assertion in `publish-runtime.ps1`.
- **Old model objects were left on R2** — harmless, and they keep previously-published manifests
  working. Reclaiming that storage is a separate call.
- **Engine runtime packages were untouched.** Both variants were verified as already matching, which
  is exactly why DOWNLOAD/INSTALL/SPEECH MODEL passed and only the timing step failed.

## Next Steps

1. **Ask Fega to confirm #401 and #402** — he is now on a build that carries them. #401: does the
   Analytics clip panel open beside the grid, play, and close when he clicks away? #402: does
   "Match text color" in the Glow section make the glow follow a word's colour in one click?
2. **A concurrent session left uncommitted UI-redesign work in this repo** (see Watch Out For).
   Decide whether it continues or gets dropped before anyone edits `AnalyticsView.js` again.
3. **#400** (Tier 2 hook metrics) when Fega wants them; **#395** (5-minute auto-refresh while the
   Analytics tab is open) would make first-48h curves much finer.
4. Carried: #388 (TikTok approval → flip `TIKTOK_VIEWS_ENABLED` → installer → "Reconnect for
   views"), #392, #383/#384/#385, #389/#390.

## Watch Out For

- **Uncommitted work from a parallel session is sitting in the tree:** `mockups/redesign-pass-1.html`
  and `mockups/redesign-pass-2.html` (untracked). This wrap deliberately did **not** commit them —
  they are another session's in-flight artefacts. Its two lessons WERE preserved and distilled (see
  below). Fega's verdict on that redesign was "a lot of generic and AI slop", and the mockups' "before"
  panels were hand-redrawn against 0.5.0-alpha.1, so treat them as superseded, not as a spec.
- **The installed exe is normally BEHIND repo HEAD.** That gap is this project's steady state. Any
  claim about "how the app looks today" has to name which one it means — the redesign session lost a
  whole pass to designing against a tab that #401 had already rewritten. Now enforced in
  `clipflow-trace-verify`.
- **Timing models need ~3.9 GB free** on whichever drive holds the engine root (3.4 GB of unpacked
  trees plus the largest zip, plus the 0.5 GB margin). The laptop's C: is near-full. A preflight for
  this now exists — the models-only path previously had none.
- **`tasks/lessons.md` is stored LF in git but CRLF in the working copy**, and the parallel session
  appended with bare LF, so the working copy is mixed. Git normalizes on commit; do not "fix" it with
  `sed -i`.
- **Version line:** counter ticks as 0.5.0-alpha.3, .4 … — only Fega moves the minor
  (memory `feedback_version_semantics`). Feed manifest is still `alpha.yml`.

## Logs / Debugging

- **Checksum failures now log before deleting** (this was the whole reason #403 took an
  investigation): `Timing model "<id>" failed its checksum` with `url`, `expectedSha`, `actualSha`,
  `bytesOnDisk`, `expectedBytes`. Each model also logs `Timing model "<id>" downloading` at start.
  The engine zip path got the same treatment. Log file: `%APPDATA%\Corva\logs\app.log`.
- **To check hosted vs manifest without downloading anything:** compute the local file's 64 MiB
  multipart ETag and compare to the `ETag` header from the public URL — append a unique query string
  (`?etagcheck=<guid>`) or Cloudflare may answer from cache with the previous object's tag. Helper
  used this session: `etag.js` in the s254 scratchpad; `Get-LocalMultipartETag` in
  `scripts/publish-runtime.ps1` is the permanent copy.
- **Republish command:** `powershell -ExecutionPolicy Bypass -File scripts/publish-runtime.ps1`.
  It now prints `[SKIP] ... matching content` (not "matching size") and asserts every hosted ETag
  after upload. The `[WAIT] Range request returned 200` line is the benign #361 cache-warmth retry.
- Setup phases in order: `manifest → download → unpack → verify → model → timing`. A `timing` failure
  is retryable on its own; the engine and speech model are already installed and configured by then.
