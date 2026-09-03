P=/d/whisper/betterwhisperx-venv/Scripts/python.exe
S="C:/Users/IAMABS~1/AppData/Local/Temp/claude/C--Users-IAmAbsolute-Desktop-ClipFlow/22638acc-c8d2-4230-861d-76b836143fab/scratchpad"
export PYTHONIOENCODING=utf-8
for pair in wx_lv60k:WAV2VEC2_ASR_LARGE_LV60K_960H hubert_l:HUBERT_ASR_LARGE hubert_xl:HUBERT_ASR_XLARGE robust_swbd:facebook/wav2vec2-large-robust-ft-swbd-300h xlsr_en:jonatasgrosman/wav2vec2-large-xlsr-53-english lv60_self:facebook/wav2vec2-large-960h-lv60-self wx_large960:WAV2VEC2_ASR_LARGE_960H; do
  tag=${pair%%:*}; model=${pair#*:}
  $P "$S/ctc_run.py" "$S" "$tag" "$model" >> "$S/ctc_log.txt" 2>&1
done
echo ALLDONE >> "$S/ctc_log.txt"
