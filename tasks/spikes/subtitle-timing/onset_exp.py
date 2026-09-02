import json,sys,os,wave,numpy as np,statistics as st
from collections import Counter
S=sys.argv[1]
clips={c["clipId"]:c for c in json.load(open(os.path.join(S,"approved_clips.json"),encoding="utf-8"))}
auto=json.load(open(os.path.join(S,"auto_repro.json"),encoding="utf-8"))
def norm(w): return ''.join(ch for ch in (w or "").lower() if ch.isalnum() or ch=="'")
FR=0.01
def envelope(path):
    with wave.open(path,'rb') as wf: sr=wf.getframerate(); a=np.frombuffer(wf.readframes(wf.getnframes()),dtype=np.int16).astype(np.float32)/32768
    n=int(sr*FR); m=len(a)//n; fr=a[:m*n].reshape(m,n); rms=np.sqrt((fr**2).mean(axis=1))+1e-7
    return 20*np.log10(rms)
def onset(db,noise,ws,we,rel,absdb,lead):
    i0=max(0,int(ws/FR)); i1=min(len(db)-1,int(we/FR))
    if i1<=i0: return ws
    seg=db[i0:i1+1]; peak=seg.max(); thr=max(noise+absdb, peak-rel)
    idx=np.argmax(seg>=thr)
    if seg[idx]<thr: return ws
    return max(ws,(i0+idx)*FR-lead)
# collect samples: first words and non-first words of Fega's segments matched to raw, with Fega's start
samples=[]
for a in auto:
    c=clips[a["clipId"]]; sub=c["sub1"]; off=c["startTime"]
    wav=os.path.join(S,"audio",c["clipId"]+".wav")
    if not os.path.exists(wav): continue
    db=envelope(wav); noise=np.percentile(db,20)
    raw=sorted([dict(w) for s in c["clipTranscription"]["segments"] for w in s.get("words",[])],key=lambda w:w["start"])
    for seg in sub:
        ws=seg.get("words") or []
        for j,w in enumerate(ws):
            fs=w["start"]-off
            cands=[i for i,r in enumerate(raw) if norm(r["word"])==norm(w["word"]) and abs(r["start"]-fs)<1.5]
            if not cands: continue
            i=min(cands,key=lambda i:abs(raw[i]["start"]-fs)); r=raw[i]
            nxt=raw[i+1]["start"] if i+1<len(raw) else r["end"]+0.4
            prevEnd=raw[i-1]["end"] if i>0 else -9
            samples.append(dict(clip=c["clipId"],db=db,noise=noise,pos=("first" if j==0 else "other"),fega=fs,rs=r["start"],re=r["end"],nxt=nxt,gapBefore=r["start"]-prevEnd,word=w["word"]))
print("samples",len(samples), Counter(s["pos"] for s in samples))
def evaluate(name,fn):
    res={"first":{"moved":[], "untouched":[]},"other":{"moved":[], "untouched":[]}}; base={"first":{"moved":[]},"other":{"moved":[]}}
    for s in samples:
        d=s["fega"]-s["rs"]
        grp="moved" if d>0.15 else ("untouched" if abs(d)<=0.05 else None)
        if grp is None: continue
        newStart=fn(s)
        res[s["pos"]][grp].append(newStart-s["fega"])
        if grp=="moved": base[s["pos"]]["moved"].append(s["rs"]-s["fega"])
    def fmt(xs): 
        if not xs: return "n=0"
        ax=[abs(x) for x in xs]; return f"n={len(xs)} med|err|={st.median(ax):.3f} within100ms={sum(1 for x in ax if x<=0.1)/len(xs):.0%} within200ms={sum(1 for x in ax if x<=0.2)/len(xs):.0%} moved>100ms={sum(1 for x in ax if x>0.1)/len(xs):.0%}"
    print(f"\n== {name}")
    for pos in ("first","other"):
        print(f"  {pos} MOVED   : rule {fmt(res[pos]['moved'])}   | raw baseline {fmt(base[pos]['moved'])}")
        print(f"  {pos} UNTOUCHED (false-positive check): rule {fmt(res[pos]['untouched'])}")
evaluate("raw (no change)", lambda s: s["rs"])
evaluate("B: no-audio, start=max(rs, re-0.25) when dur>0.3", lambda s: max(s["rs"], s["re"]-0.25) if (s["re"]-s["rs"])>0.3 else s["rs"])
for rel,absdb,lead in [(20,10,0.02),(15,10,0.02),(25,10,0.02),(20,6,0.02),(20,15,0.02),(20,10,0.05)]:
    evaluate(f"A: onset rel={rel}dB abs=noise+{absdb} lead={lead}, window [rs, min(nxt, re+0.4)]", lambda s,rel=rel,absdb=absdb,lead=lead: onset(s["db"],s["noise"],s["rs"],min(s["nxt"],s["re"]+0.4),rel,absdb,lead))
for rel,absdb in [(20,10),(15,10)]:
    evaluate(f"A2: onset rel={rel} abs={absdb} only when dur>0.25 or gapBefore>0.15", lambda s,rel=rel,absdb=absdb: onset(s["db"],s["noise"],s["rs"],min(s["nxt"],s["re"]+0.4),rel,absdb,0.02) if ((s["re"]-s["rs"])>0.25 or s["gapBefore"]>0.15) else s["rs"])

# ── Rule C: snap start to the END of the LAST silence run inside [rs, min(nxt, re+tail)] ──
def lse(db,noise,rs,re,nxt,rel,absdb,minrun,tail,lead):
    we=min(nxt,re+tail); i0=max(0,int(rs/FR)); i1=min(len(db)-1,int(we/FR))
    if i1-i0<3: return rs
    seg=db[i0:i1+1]; peak=seg.max(); thr=max(noise+absdb,peak-rel)
    quiet=seg<thr; runs=[]; k=0
    while k<len(quiet):
        if quiet[k]:
            j=k
            while j<len(quiet) and quiet[j]: j+=1
            if (j-k)*FR>=minrun: runs.append((k,j))
            k=j
        else: k+=1
    # last run that ENDS before the window end (must be followed by speech)
    runs=[r for r in runs if r[1]<len(quiet)]
    if not runs: return rs
    return max(rs,(i0+runs[-1][1])*FR-lead)
print("\n#### noise floor = 5th percentile variants")
for rel,absdb,minrun,tail in [(18,6,0.06,0.3),(20,6,0.06,0.3),(15,6,0.06,0.3),(18,6,0.1,0.3),(18,6,0.06,0.5),(18,10,0.06,0.3),(25,6,0.06,0.3)]:
    evaluate(f"C: last-silence-end rel={rel} abs=noise5+{absdb} minrun={minrun} tail={tail}", lambda s,rel=rel,absdb=absdb,minrun=minrun,tail=tail: lse(s["db"],np.percentile(s["db"],5),s["rs"],s["re"],s["nxt"],rel,absdb,minrun,tail,0.02))

print("\n#### overall + gated variants")
def evaluate_all(name,fn):
    allerr=[]; fpByDur={"<0.2":[0,0],"0.2-0.3":[0,0],"0.3-0.5":[0,0],">0.5":[0,0]}
    for s in samples:
        e=fn(s)-s["fega"]; allerr.append(e)
        d=s["fega"]-s["rs"]
        if abs(d)<=0.05:
            dur=s["re"]-s["rs"]; b="<0.2" if dur<0.2 else ("0.2-0.3" if dur<0.3 else ("0.3-0.5" if dur<0.5 else ">0.5"))
            fpByDur[b][1]+=1; fpByDur[b][0]+= abs(e)>0.1
    ax=[abs(x) for x in allerr]
    print(f"{name}: ALL n={len(ax)} med={st.median(ax):.3f} <=100ms={sum(1 for x in ax if x<=0.1)/len(ax):.1%} <=200ms={sum(1 for x in ax if x<=0.2)/len(ax):.1%}  FP(untouched moved>100ms) by raw dur: "+", ".join(f"{k}:{v[0]}/{v[1]}" for k,v in fpByDur.items()))
evaluate_all("raw",lambda s:s["rs"])
evaluate_all("C rel18 abs6 run.06 tail.3",lambda s: lse(s["db"],np.percentile(s["db"],5),s["rs"],s["re"],s["nxt"],18,6,0.06,0.3,0.02))
evaluate_all("C gated dur>0.25 or gap>0.15",lambda s: lse(s["db"],np.percentile(s["db"],5),s["rs"],s["re"],s["nxt"],18,6,0.06,0.3,0.02) if ((s["re"]-s["rs"])>0.25 or s["gapBefore"]>0.15) else s["rs"])
evaluate_all("C gated dur>0.3",lambda s: lse(s["db"],np.percentile(s["db"],5),s["rs"],s["re"],s["nxt"],18,6,0.06,0.3,0.02) if (s["re"]-s["rs"])>0.3 else s["rs"])
evaluate_all("C gated dur>0.3, tail 0",lambda s: lse(s["db"],np.percentile(s["db"],5),s["rs"],s["re"],s["nxt"],18,6,0.06,0.0,0.02) if (s["re"]-s["rs"])>0.3 else s["rs"])
evaluate_all("C gated dur>0.25, run .1",lambda s: lse(s["db"],np.percentile(s["db"],5),s["rs"],s["re"],s["nxt"],18,6,0.1,0.3,0.02) if (s["re"]-s["rs"])>0.25 else s["rs"])
for rel,absdb,run,tail,gate in [(18,6,0.06,0.3,0.25),(18,6,0.08,0.3,0.25),(20,6,0.06,0.3,0.25),(18,6,0.06,0.3,0.2)]:
    evaluate(f"C gated dur>{gate} rel{rel} abs{absdb} run{run} tail{tail}",lambda s,rel=rel,absdb=absdb,run=run,tail=tail,gate=gate: lse(s["db"],np.percentile(s["db"],5),s["rs"],s["re"],s["nxt"],rel,absdb,run,tail,0.02) if (s["re"]-s["rs"])>gate else s["rs"])

print("\n#### residuals: moved first words where rule C (gated dur>0.3, tail 0) finds no silence edge")
def C(s): return lse(s["db"],np.percentile(s["db"],5),s["rs"],s["re"],s["nxt"],18,6,0.06,0.0,0.02) if (s["re"]-s["rs"])>0.3 else s["rs"]
res_fix=[];res_nofix=[]; unt_nofix=[]
for s in samples:
    if s["pos"]!="first": continue
    d=s["fega"]-s["rs"]; c=C(s)
    if d>0.15:
        (res_fix if c>s["rs"]+0.01 else res_nofix).append(s)
    elif abs(d)<=0.05 and (s["re"]-s["rs"])>0.3 and c<=s["rs"]+0.01: unt_nofix.append(s)
print("moved first words:",len(res_fix)+len(res_nofix),"C moved",len(res_fix),"C found nothing",len(res_nofix))
def dist(name,xs): xs=sorted(xs); print(f"  {name}: n={len(xs)} p10={xs[int(.1*(len(xs)-1))]:+.3f} p25={xs[int(.25*(len(xs)-1))]:+.3f} med={xs[len(xs)//2]:+.3f} p75={xs[int(.75*(len(xs)-1))]:+.3f} p90={xs[int(.9*(len(xs)-1))]:+.3f}")
dist("C-found: rule - fega",[C(s)-s["fega"] for s in res_fix])
dist("C-nothing: raw dur",[s["re"]-s["rs"] for s in res_nofix])
dist("C-nothing: fega - rawEND",[s["fega"]-s["re"] for s in res_nofix])
dist("C-nothing: fega - rawSTART",[s["fega"]-s["rs"] for s in res_nofix])
dist("C-nothing: gap before",[s["gapBefore"] for s in res_nofix])
dist("C-nothing: fega - (rawEND-0.1)",[s["fega"]-(s["re"]-0.1) for s in res_nofix])
print(" untouched first words with dur>0.3 where C found nothing:",len(unt_nofix))
dist("UNTOUCHED-nothing: raw dur",[s["re"]-s["rs"] for s in unt_nofix])
dist("UNTOUCHED-nothing: (rawEND-0.1) - fega  (harm if fallback applied)",[(s["re"]-0.1)-s["fega"] for s in unt_nofix])
dist("UNTOUCHED-nothing: gap before",[s["gapBefore"] for s in unt_nofix])
# words in continuous speech: what fraction of the C-nothing moved set have gapBefore<0.1
print("  C-nothing moved with gapBefore<0.1:",sum(1 for s in res_nofix if s["gapBefore"]<0.1),"/",len(res_nofix), " untouched-nothing with gapBefore<0.1:",sum(1 for s in unt_nofix if s["gapBefore"]<0.1),"/",len(unt_nofix))
