# HANDOFF — Session 227 (2026-09-01)

> Pending session title (set automatically at next session start): S227 · alpha.16 — layouts go per-clip

## Current State

**alpha.16 is cut, on the feed, and the update itself is CONFIRMED installed by Fega**
("the update worked"). It promotes #348 (per-clip layouts + clip-aware Detect, this
session) and #347 (same-titled-clip tracker fixes, s226). The FEATURES are not yet
user-verified — both issues stay open with `status: untested`. Phase B (layout changes
*within* one clip, per cut-point) is designed and parked as #349 with landmine notes.

## Key Decisions

- **`clip.reframe` is tri-state**: absent key = inherit `project.reframe`, `null` =
  explicitly raw, object = override. Absent-key inheritance means zero migration and
  byte-identical filter graphs for every existing project (proven E2E + unit-tested
  same-reference resolver).
- **Apply scope = this clip only** (Fega chose via 4-option Q&A); explicit "Apply to
  all clips in this project" restores old behavior and strips every override in one
  atomic save. Phase B sections align to NLE cut points, switches are instant.
- **Dedicated validated IPC** (`project:updateClipReframe` with an `"inherit"` sentinel,
  `project:applyReframeAllClips`) instead of riding the unvalidated `updateClip` merge.
- **Autosave deliberately does NOT list `reframe`** — the `{...existing, ...updates}`
  merge protects the override; adding it to `_doSilentSave`'s field list would race the
  dedicated IPC. Never "fix" this by listing it.

## Next Steps

1. **Fega's feature check on #348** (~3 min): vertical-reaction project, tall Game box
   around the vertical video on that one clip, confirm gaming clips keep theirs. Close
   #348 + #347 (and drop the labels) on his confirmation.
2. **#349 per-section layouts** — needs its own planning session before build.
3. Backlog picks surfaced at session start if he wants another evening run: the
   data-safety pair (#297 autosave-lies, #299 non-atomic DB — though #299 may be
   partially addressed, `atomic-write.js` exists now; verify before starting), the
   quick-wins bundle (#307, #304, #320, #303), and s223's #341/#342.

## Watch Out For

- **`buildNleFilterComplex` still applies ONE reframe after concat** — that inversion
  (per-segment composite before concat) is the core of #349, along with
  `splitAtSource`/`concatRecut` dropping unknown segment fields. Fix those WITH #349,
  not before.
- **Offer banner latch is clip-aware now**: any `clip.reframe !== undefined` on the open
  clip latches the project as decided (PreviewPanelNew offer effect). The
  `shouldOfferReframe` gate itself still takes `p.reframe` on purpose (project
  onboarding semantics).
- **`render:batch` is dead code** (zero renderer callers) but inherits the resolver via
  `renderClip` — don't wire anything to it assuming it runs.
- Layout-panel "Apply to all clips" only renders when an override exists somewhere
  (`hasOverride || othersHaveOverrides`) — not missing, conditional.

## Logs/Debugging

- **First alpha.16 `npm run build` died at `editWindowsResources` → `writeFile`**
  (open error on the exe — transient lock, likely AV overlap). Immediate identical
  rerun succeeded. Not the s219 heap failure; flag was set. If it repeats, check what
  holds `dist/win-unpacked/Corva.exe`.
- **`public/detect-page.js` changes need `npm run build:renderer` even under dev** —
  the hidden detect window loads `build/detect.html` from disk.
- **Fixture technique that worked (and its correction):** copy a project dir into
  `<scratch>/fixture/.clipflow/projects/`, repoint dev `projectsRoot`/`watchFolder`/
  `outputFolder` (3 keys, originals saved to `dev-settings-orig.json`, restored after),
  boot dev electron with CDP 9222. CORRECTION from Fega routed to code-review 0d +
  memory: fixture projects must have ZERO approved/published clips (AR pool) — even
  as copies. The s227 fixture (100T copy) violated this.
- Detect-scoping proof reads straight from the boot log: `[ReframeDetect] sampling 8
  frames @ [...] across N range(s)`.
