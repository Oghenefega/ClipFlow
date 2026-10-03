# HANDOFF — Session 288 (2026-10-03)

## Current State

#486 shipped in **0.5.0-alpha.21**, which is on the update feed. It adds the Numbers font for captions and subtitles, bundled Montserrat, and presets plus Brand Kit templates drawn as styled samples. Fega installed it and confirmed it works, and #486 is closed.

alpha.21 also carries s287's detection prompt audit (structured outputs, the new overlap rule). That change is now live on his machine.

## Key Decisions

- **Subtitles get the Numbers font too** (Fega's call; the issue scoped it to captions). Subtitle digit words change font only, so the karaoke colour, sweep and pop are untouched. The per-word override path would have switched karaoke off for those words.
- **A hand-picked font on a word or a line beats the Numbers font** (Fega's call).
- **Montserrat ships as the two Google Fonts variable files** (upright and italic, about 0.75 MB each) plus `Montserrat-OFL.txt`, instead of static weights. Weight 900 draws Black, matching Fega's hand-set words.
- **Applying a template saved before #486 turns the Numbers font off**, so a value can't carry over from the previously applied template. Clips saved before #486 pick it up from whatever template is applied when they open, the same way every new style key has worked.

## Next Steps

1. **Ask Fega to turn on the Numbers font in his default template, if he hasn't.** Suggested wording: "Did you set Numbers font to Montserrat on 'Karoake Glowy Corva Default' and click Update? Until you do, new clips still need the manual fix." It's two clicks on his side; I can't do it while Corva runs.
2. **Ask Fega how alpha.20/21 feels overall** (carried from s287): the new Rename and Projects tabs. Close #485 on his yes and remove `status: untested`.
3. **Next issues from Wick's set:** #487 (caption build), then #488 (cold-open cut).
4. **Carried from s287:**
   - The "invite a second clip on long funny stretches" question. I recommend waiting until he has reviewed a couple of recordings on alpha.21.
   - The audit items left without an edit: `/build`, `/session-start` backlog, autoresearch `:security` / `:ship`.
   - The s286 carry list (clip badges, per-batch review chip, Wick's icons, clip-judge feel check, #489).
   - Dead code: `waveformUtils.js`, `highlights.js` / `analyzeLoudness`.

## Watch Out For

- **Bundled fonts beat installed ones.** The editor CSS and the render overlay register Montserrat themselves, so the copy installed on the machine is never used. Words already hand-set to Montserrat moved by a sub-pixel outline, because the bundled copy is a newer release. Any before/after render comparison must use a clip without Montserrat words, or it will show a false diff.
- **The Numbers font key is `numbersFontFamily`** on saved styles, templates and the render payload. In the stores it is `captionNumbersFontFamily` / `subNumbersFontFamily`. A new style surface that builds its own config object (like `captionStyleConfig` in `PreviewPanelNew`) must pass it along, or that surface silently ignores the setting.
- **The tnuy clip ("Bang almost clutched the IMPOSSIBLE") failed to render** in the s288 harness, trimmed to its first 2 s, on the original code as well ("ffmpeg render failed"). It's not caused by #486 and is unverified in the real app. Check with `scripts/dev/render-e2e-probe.js` before trusting tnuy as a fixture.
- `tasks/spikes/humor-study/_report.txt` is still an untracked leftover.

## Logs/Debugging

- **Render evidence for #486** is committed in `docs/issue-evidence/486/`, linked from the issue comment.
- **The s288 render harness** (`r486.js`) lives in the session scratchpad. It renders the first 2 s of a saved clip with overrides and pulls a PNG, and two runs come out byte-identical, which makes it good for exact before/after diffs. `scripts/dev/render-e2e-probe.js` is the committed equivalent.
- **Fixture project used:** `proj_1790939003293_0rjewg` (2026-09-29 100T Day5 Pt1, zero approved). The dev profile was restored with `dev-fixture.js restore`.
