import json,sys,os,wave,numpy as np
S=sys.argv[1]
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
clips={c["clipId"]:c for c in json.load(open(os.path.join(S,"approved_clips.json"),encoding="utf-8"))}
def norm(w): return ''.join(ch for ch in (w or "").lower() if ch.isalnum() or ch=="'")
ex_small=[]; ex_big=[]
for c in clips.values():
    if not c["clipTranscription"] or not c["sub1"]: continue
    off=c["startTime"]; raw=sorted([dict(w) for s in c["clipTranscription"]["segments"] for w in s.get("words",[])],key=lambda w:w["start"])
    counts={}
    for r in raw: counts[norm(r["word"])]=counts.get(norm(r["word"]),0)+1
    for seg in c["sub1"]:
        ws=seg.get("words") or []
        if not ws: continue
        w=ws[0]; fs=w["start"]-off
        if counts.get(norm(w["word"]),0)!=1: continue
        cands=[i for i,r in enumerate(raw) if norm(r["word"])==norm(w["word"])]
        if not cands: continue
        i=cands[0]; r=raw[i]; d=fs-r["start"]
        if d<=0.15: continue
        gapBefore=r["start"]-raw[i-1]["end"] if i>0 else 9
        item=dict(clip=c["clipId"],title=c["title"][:30],i=i,raw=raw,fega=fs,fegaEnd=w["end"]-off,segText=seg["text"],gap=gapBefore)
        (ex_small if gapBefore<0.1 else ex_big).append(item)
picks=ex_small[:8]+ex_big[:4]
fig,axes=plt.subplots(len(picks),1,figsize=(14,3.2*len(picks)))
for ax,e in zip(axes,picks):
    with wave.open(os.path.join(S,"audio",e["clip"]+".wav"),'rb') as wf: sr=wf.getframerate(); a=np.frombuffer(wf.readframes(wf.getnframes()),dtype=np.int16).astype(np.float32)/32768
    r=e["raw"][e["i"]]; t0=max(0,r["start"]-1.0); t1=min(len(a)/sr,r["end"]+1.0)
    seg=a[int(t0*sr):int(t1*sr)]
    ax.specgram(seg,NFFT=512,Fs=sr,noverlap=384,cmap="magma",xextent=(t0,t1))
    ax.set_ylim(0,5000)
    for j in range(max(0,e["i"]-3),min(len(e["raw"]),e["i"]+4)):
        rw=e["raw"][j]
        if rw["end"]<t0 or rw["start"]>t1: continue
        col="red" if j==e["i"] else "white"
        ax.axvspan(rw["start"],rw["end"],color=col,alpha=0.18)
        ax.text((rw["start"]+rw["end"])/2,4600,rw["word"],color=col,ha="center",fontsize=8)
    ax.axvline(e["fega"],color="lime",lw=2); ax.axvline(e["fegaEnd"],color="lime",lw=1,ls="--")
    ax.set_title(f'{e["title"]} | seg "{e["segText"]}" | raw {r["word"]} {r["start"]:.2f}-{r["end"]:.2f} | Fega start {e["fega"]:.2f} (Δ+{e["fega"]-r["start"]:.2f}) gapBefore {e["gap"]:.2f}',fontsize=9)
plt.tight_layout(); plt.savefig(os.path.join(S,"examples.png"),dpi=80)
print("saved",len(picks),"examples; small-gap pool",len(ex_small),"big-gap pool",len(ex_big))
