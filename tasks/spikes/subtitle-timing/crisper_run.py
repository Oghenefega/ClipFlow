import os,sys,json,time,traceback
os.environ["HF_HOME"]=r"D:\whisper\hf_cache"
import numpy, torch  # venv copies first, so the side folder cannot shadow them
sys.path.insert(0,r"D:\whisper\crisper-tf")
sys.path.insert(0,r"D:\whisper\crisper-tf-fork")
sys.modules["torchcodec"]=None
S=sys.argv[1]
import torch,numpy as np,wave
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline
dev="cuda"; dtype=torch.float16
model=AutoModelForSpeechSeq2Seq.from_pretrained("nyrahealth/CrisperWhisper",torch_dtype=dtype,use_safetensors=True).to(dev)
proc=AutoProcessor.from_pretrained("nyrahealth/CrisperWhisper")
pipe=pipeline("automatic-speech-recognition",model=model,tokenizer=proc.tokenizer,feature_extractor=proc.feature_extractor,chunk_length_s=30,batch_size=1,return_timestamps="word",torch_dtype=dtype,device=dev)
def adjust_pauses(chunks,split_threshold=0.12):
    # CrisperWhisper README: distribute pause time between adjacent words
    ch=[dict(c) for c in chunks]
    for i in range(len(ch)-1):
        a,b=ch[i],ch[i+1]
        if a["end"] is None or b["start"] is None: continue
        dist=b["start"]-a["end"]
        if dist<=0: continue
        if dist<=split_threshold:
            mid=(a["end"]+b["start"])/2; a["end"]=mid; b["start"]=mid
        else:
            a["end"]+=split_threshold/2; b["start"]-=split_threshold/2
    return ch
clips=[c for c in json.load(open(os.path.join(S,"approved_clips.json"),encoding="utf-8")) if c["clipTranscription"] and c["sub1"]]
log=open(os.path.join(S,"align","crisper_log.txt"),"a",encoding="utf-8")
for n,c in enumerate(clips):
    out=os.path.join(S,"align","crisper",c["clipId"]+".json")
    if os.path.exists(out): continue
    t=time.time()
    try:
        wav=os.path.join(S,"audio",c["clipId"]+".wav")
        with wave.open(wav,'rb') as wf: sr=wf.getframerate(); a=np.frombuffer(wf.readframes(wf.getnframes()),dtype=np.int16).astype(np.float32)/32768
        r=pipe({"raw":a,"sampling_rate":sr},generate_kwargs={"language":"en","task":"transcribe"})
        chunks=[{"word":ch["text"].strip(),"start":ch["timestamp"][0],"end":ch["timestamp"][1]} for ch in r["chunks"]]
        words=[w for w in adjust_pauses(chunks) if w["start"] is not None]
        json.dump({"segments":[{"start":words[0]["start"] if words else 0,"end":words[-1]["end"] if words and words[-1]["end"] is not None else 0,"text":r["text"],"words":[{"word":w["word"],"start":w["start"],"end":w["end"] if w["end"] is not None else w["start"]+0.1,"probability":1.0} for w in words]}]},open(out,"w",encoding="utf-8"))
        print(f"{n+1}/{len(clips)} ok {time.time()-t:.1f}s",file=log,flush=True)
    except Exception as e:
        print(f"{n+1}/{len(clips)} FAIL {e}\n{traceback.format_exc()[-600:]}",file=log,flush=True)
print("DONE",file=log,flush=True)
