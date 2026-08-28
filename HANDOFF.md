# HANDOFF — Session 219 (2026-08-28)

## Current State

**`0.4.0-alpha.10` is cut, published and live on the feed.** This session was the release loop
and nothing else — no product code changed. `curl https://engine.flowve.app/updates/alpha.yml`
reads `0.4.0-alpha.10`; alpha.9's exe and blockmap were pruned off the feed by the publish script.

**What the cut promotes (three issues, not five):** the Settings revamp (#331), the theme system
(#328), and the main-process publish scheduler + streaming mode (#329). #324 and #325 — the Queue
redesign — went out in **alpha.9** and Fega's install has already run it: `lastSeenVersion` in
`%APPDATA%\clipflow` reads `0.4.0-alpha.9`, and that key is stamped only by `whatsnew:ack`, i.e.
only when he closed alpha.9's What's New screen. Session 218's handoff said five were stacked
behind the cut; it was counting open `status: untested` issues, which is not the same question.

**Fega has not yet installed alpha.10.** He needs to relaunch, take the banner, and confirm
Settings reads v0.4.0-alpha.10.

## Key Decisions

- **No minor bump.** alpha.9 → alpha.10, per the standing policy: tick the counter forever, never
  move the minor number without Fega saying so. Three visible features in one cut does not change that.
- **`status: untested` was left on all five issues.** #324/#325 are verifiable now (they have been
  in his hands since alpha.9), but confirmation is Fega's to give, not mine to assume.

## Next Steps

1. **Fega installs alpha.10** — relaunch → "Update available" banner → Install → it restarts itself
   and opens What's New. Settings → bottom should read **v0.4.0-alpha.10**.
2. **Verification pass on the three new ones once he is on it:** #331 (Settings rail + search),
   #328 (four themes, including the editor repainting), #329 (streaming mode — the tray, and a
   scheduled clip going out with the window closed). Pull `status: untested` as each is confirmed.
3. **#324/#325 can be confirmed now** — they have been live since alpha.9.
4. **#332** — the GPU process does not retire in streaming mode (~119 MB held with no window).
   Open, measured, not urgent.

## Watch Out For

- **The release build needs `NODE_OPTIONS=--max-old-space-size=8192`.** Without it `npm run build`
  dies at the packaging step. Now encoded in the `clipflow-update-launcher` skill, step 3.
- **`npm start` is a publishing action** (from s218, still true): it boots the prod profile, which
  since #329 runs a live scheduler. The dev profile refuses to auto-publish without
  `CLIPFLOW_ALLOW_DEV_PUBLISH=1`; prod has no such guard.
- **Never `taskkill //F //IM Corva.exe`** — that image name is shared with Fega's running daily
  driver (s218 killed it).
- **A prior handoff's issue count is not evidence.** Re-derive from `git log <last-bump>..HEAD`.

## Logs / Debugging

- **Build OOM signature** — `⨯ Array buffer allocation failed  failedTask=build` /
  `RangeError: Array buffer allocation failed at NtExecutable.generate (pe-library)` reached via
  `addWinAsarIntegrity` → `beforeCopyExtraFiles`. It lands AFTER `✓ built in Ns`, so a partially
  read log looks healthy; a failed packaging run leaves `dist/` holding the previous version's
  installer and manifest, which is why the artifact-timestamp check in step 4 is not optional.
- **Backgrounded builds vanish** — the first attempt returned `stopped` with "No completion record
  was found" because the session process exited under it. The output file still held the real error.
- **Publish verification** — `curl -s https://engine.flowve.app/updates/alpha.yml | head -1` is the
  one-line proof the feed took the new version.
