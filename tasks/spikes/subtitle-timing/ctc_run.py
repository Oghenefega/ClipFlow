"""Re-align the stable-ts text of every approved clip with a different CTC backbone, through the
same whisperx.align code path the app uses.  python ctc_run.py <scratch> <tag> <model_name>"""
import json, os, sys, time, traceback
S, TAG, MODEL = sys.argv[1], sys.argv[2], sys.argv[3]
os.environ.setdefault("HF_HOME", r"D:\whisper\hf_cache")
import torch, whisperx
dev = "cuda"
out_dir = os.path.join(S, "align", TAG); os.makedirs(out_dir, exist_ok=True)
t0 = time.time(); amodel, ameta = whisperx.load_align_model(language_code="en", device=dev, model_name=MODEL)
print(f"{TAG}: model {MODEL} loaded {time.time()-t0:.0f}s", flush=True)
clips = [c for c in json.load(open(os.path.join(S, "approved_clips.json"), encoding="utf-8")) if c["clipTranscription"] and c["sub1"]]
done = 0; t1 = time.time()
for c in clips:
    cid = c["clipId"]; p = os.path.join(out_dir, cid + ".json")
    if os.path.exists(p): continue
    try:
        audio = whisperx.load_audio(os.path.join(S, "audio", cid + ".wav"))
        segs = [{"text": s["text"], "start": s["start"], "end": s["end"]} for s in c["clipTranscription"]["segments"]]
        r = whisperx.align(segs, amodel, ameta, audio, dev, return_char_alignments=False)
        out = [{"start": s.get("start"), "end": s.get("end"), "text": s.get("text", "").strip(),
                "words": [{"word": w["word"], "start": w.get("start"), "end": w.get("end"), "probability": w.get("score", 1.0)}
                          for w in s.get("words", []) if "start" in w]} for s in r["segments"]]
        json.dump({"segments": out}, open(p, "w", encoding="utf-8")); done += 1
    except Exception as e:
        print("FAIL", cid, repr(e), flush=True); traceback.print_exc()
print(f"{TAG}: done {done} clips in {time.time()-t1:.0f}s", flush=True)
