"""Vosk (Apache-2.0, Kaldi) grammar-constrained recognition of the stable-ts text = poor man's forced
alignment.  python vosk_run.py <scratch> [tag] -> align/<tag>/<clipId>.json"""
import json, os, sys, time, wave
S = sys.argv[1]; TAG = sys.argv[2] if len(sys.argv) > 2 else "vosk"
from vosk import Model, KaldiRecognizer, SetLogLevel
SetLogLevel(-1)
model = Model(r"D:\whisper\vosk-models\vosk-model-en-us-0.22-lgraph")
out_dir = os.path.join(S, "align", TAG); os.makedirs(out_dir, exist_ok=True)
def norm(w): return ''.join(ch for ch in (w or "").lower() if ch.isalnum() or ch == "'" or ch == " ")
clips = [c for c in json.load(open(os.path.join(S, "approved_clips.json"), encoding="utf-8")) if c["clipTranscription"] and c["sub1"]]
done = 0; t1 = time.time()
for c in clips:
    cid = c["clipId"]; p = os.path.join(out_dir, cid + ".json")
    if os.path.exists(p): continue
    text = norm(" ".join((s.get("text") or "").strip() for s in c["clipTranscription"]["segments"]))
    text = " ".join(text.split())
    if not text: continue
    rec = KaldiRecognizer(model, 16000, json.dumps([text, "[unk]"])); rec.SetWords(True)
    wf = wave.open(os.path.join(S, "audio", cid + ".wav"), "rb"); words = []
    while True:
        data = wf.readframes(4000)
        if not data: break
        if rec.AcceptWaveform(data): words += json.loads(rec.Result()).get("result", [])
    words += json.loads(rec.FinalResult()).get("result", [])
    words = [{"word": w["word"], "start": w["start"], "end": w["end"]} for w in words if w["word"] != "[unk]"]
    json.dump({"segments": [{"words": words}]}, open(p, "w", encoding="utf-8")); done += 1
    if done == 1: print("sample:", words[:6], flush=True)
print(f"{TAG}: done {done} in {time.time()-t1:.0f}s", flush=True)
