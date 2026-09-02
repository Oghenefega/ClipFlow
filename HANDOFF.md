# HANDOFF — Session 231 (2026-09-02)

## Current State

**Analysis session, no code changed. #356 filed with the findings + a three-part fix plan that
waits for Fega's go-ahead.** alpha.21 stays the installed daily driver.

Fega asked: "look at all my approved clips and learn from them ... subtitles appear too early,
misaligned, first word swallows the 3-word pill". Measured on 129 approved clips (121 with both
raw `clip.transcription` and editor-saved `sub1`), 3,354 matchable words, mic audio extracted for
every clip. Full write-up: `tasks/specs/subtitle-timing-learning-2026-09-02.md`. Scripts:
`tasks/spikes/subtitle-timing/` (repro.js reproduces the app pipeline; hybrid_eval.py /
onset_exp.py score rules against Fega's finals; align_exp.py runs WhisperX / stable-ts variants
in the whisper venv; chunk_exp.js scores chunker variants).

Headline numbers (word start within 100 ms of Fega's final):
- raw stable-ts 78.4% · current app pipeline 77.1% (disturbs 6-7% of good words) ·
  silence-edge snap on long first words 79.5% · snap + WhisperX agreement 80.2%.
- THE defect: first word of a pill starts too early — 194 of 1,380 first words, median +0.37 s;
  raw duration >0.5 s after a pause is wrong 42-71% of the time. Inner words are mostly fine.
- Chunker reproduces 77% of his pills (every variant tried is worse); linger 0.4 s = his median.
- Small real bug: reopening an edited clip still runs cleanWordTimestamps on saved words
  (9 starts / 17 ends of 4,150 change).

## Key Decisions

- **No replacement aligner.** WhisperX / stable-ts align / VAD / adjust_by_silence all score
  below raw overall; only gated touches on suspicious first words help. Recorded in memory
  `project_subtitle_timing_learning`.
- **Don't touch segmentWords or LINGER_DURATION** — the data says they already match Fega.
- The stable-ts adjust_by_silence job was stopped at 36/121 clips: partial numbers were already
  no better than the simple rule.

## Next Steps

1. Fega decides on #356's plan (1: gate cleanup off editor-saved subs + drop Pass 4 anchors;
   2: silence-edge snap in tools/transcribe.py; 3: optional WhisperX second opinion). Build →
   rerun repro.js + hybrid_eval.py → report the three numbers → cut an installer.
2. If he wants "perfect": score CrisperWhisper or a forced aligner (MFA/NeMo) on the same
   dataset — each is a model download, ask first.
3. Backlog from s228/s230 stands (#353 Batch B, #350, #297/#299, quick-wins).

## Watch Out For

- The per-clip WAVs (121 × 16 kHz) and aligner JSON outputs live only in this session's
  scratchpad (`d924fd93…/scratchpad/audio`, `/align`); re-extract with the ffmpeg line in
  `tasks/spikes/subtitle-timing/` (mic = `-map 0:a:1`, i.e. `transcriptionAudioTrack` 1).
- `approved_clips.json` / `auto_repro.json` are scratchpad-only too; repro.js rebuilds them from
  the prod projectsRoot (`W:\...\Vertical Recordings Onwards\.clipflow\projects`). Read-only —
  nothing under the projects tree was written.
- Word matching is text + nearest start within 1.5 s; repeated words ("ha, ha, ha") can
  mis-pair — the plots filter to unique words for that reason.

## Logs/Debugging

- Whisper venv: `D:\whisper\betterwhisperx-venv\Scripts\python.exe` (stable-ts 2.19.1,
  whisperx, torch 2.7.1 cu126, matplotlib; system python has numpy but no matplotlib).
- GPU RTX 3090; WhisperX align ≈1.4 s/clip, stable-ts transcribe+refine ≈5-10 s/clip.
- Set `PYTHONIOENCODING=utf-8` for any script printing clip titles (cp1252 console).
