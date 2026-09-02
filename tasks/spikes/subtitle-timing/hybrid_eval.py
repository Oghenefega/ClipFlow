import json,sys,os,wave,numpy as np,statistics as st
S=sys.argv[1]
exec(open(os.path.join(S,"onset_exp.py"),encoding="utf-8").read().split("# collect samples")[0])
exec("def lse"+open(os.path.join(S,"onset_exp.py"),encoding="utf-8").read().split("def lse")[1].split("print(")[0])
clips={c["clipId"]:c for c in json.load(open(os.path.join(S,"approved_clips.json"),encoding="utf-8")) if c["clipTranscription"] and c["sub1"]}
auto={a["clipId"]:a for a in json.load(open(os.path.join(S,"auto_repro.json"),encoding="utf-8"))}
def norm(w): return ''.join(ch for ch in (w or "").lower() if ch.isalnum() or ch=="'")
def words_of(segs): return sorted([w for s in segs for w in s.get("words",[]) if w.get("start") is not None],key=lambda w:w["start"])
def nearest(cand,w,t):
    cc=[x for x in cand if norm(x["word"])==norm(w) and abs(x["start"]-t)<1.5]
    return min(cc,key=lambda x:abs(x["start"]-t)) if cc else None
rows=[]  # per Fega word: fega start, raw, auto, ruleC, whisperx, st_align, st_vad, pos, grp
methods=[m for m in ["whisperx","st_align","st_vad","st_adjust","st_vad_adjust","st_norefine_vad"] if os.path.isdir(os.path.join(S,"align",m))]
for cid,c in clips.items():
    if not all(os.path.exists(os.path.join(S,"align",m,cid+".json")) for m in methods): continue
    off=c["startTime"]; raw=words_of(c["clipTranscription"]["segments"])
    al={m:words_of(json.load(open(os.path.join(S,"align",m,cid+".json"),encoding="utf-8"))["segments"]) for m in methods}
    aw=[dict(w,start=w["start"]-off,end=w["end"]-off) for s in auto[cid]["autoSegs"] for w in s["words"]]
    db=envelope(os.path.join(S,"audio",cid+".wav")); n5=np.percentile(db,5)
    for seg in c["sub1"]:
        ws=seg.get("words") or []
        for j,w in enumerate(ws):
            fs=w["start"]-off; r=nearest(raw,w["word"],fs)
            if not r: continue
            i=raw.index(r); nxt=raw[i+1]["start"] if i+1<len(raw) else r["end"]+0.4
            d=fs-r["start"]; grp="moved" if d>0.15 else ("untouched" if abs(d)<=0.05 else "other")
            row=dict(fega=fs,raw=r["start"],rdur=r["end"]-r["start"],pos="first" if j==0 else "other",grp=grp)
            a=nearest(aw,w["word"],fs); row["auto"]=a["start"] if a else r["start"]
            row["ruleC"]=lse(db,n5,r["start"],r["end"],nxt,18,6,0.06,0.0,0.02) if row["rdur"]>0.3 else r["start"]
            for m in methods:
                x=nearest(al[m],w["word"],fs); row[m]=x["start"] if x else None
            rows.append(row)
print("clips scored:",len(set()),"rows",len(rows))
def score(name,fn):
    err={"firstMoved":[], "firstUntouched":[], "otherMoved":[], "otherUntouched":[], "all":[]}
    for r in rows:
        v=fn(r)
        if v is None: v=r["raw"]
        e=v-r["fega"]; err["all"].append(e)
        if r["grp"]!="other": err[r["pos"]+r["grp"].capitalize()].append(e)
    def f(xs): ax=[abs(x) for x in xs]; return f"n={len(xs):4d} med={st.median(ax):.3f} <=100ms={sum(1 for x in ax if x<=0.1)/len(xs):5.1%} >100ms={sum(1 for x in ax if x>0.1)/len(xs):5.1%}"
    print(f"\n== {name}"); [print(f"  {k:15s} {f(err[k])}") for k in err]
score("raw",lambda r:r["raw"]); score("auto (current app pipeline)",lambda r:r["auto"]); score("ruleC gated dur>0.3",lambda r:r["ruleC"])
for m in methods: score(m,lambda r,m=m:r[m])
for m in methods:
    score(f"H1 {m}: use aligner only if raw dur>0.3 and aligner later by >0.1",lambda r,m=m: r[m] if (r["rdur"]>0.3 and r[m] is not None and r[m]-r["raw"]>0.1) else r["raw"])
    score(f"H2 {m}: ruleC if aligner agrees within 0.12",lambda r,m=m: r["ruleC"] if (r[m] is not None and abs(r["ruleC"]-r[m])<=0.12) else r["raw"])
    score(f"H3 {m}: median(raw, ruleC, aligner) when dur>0.3",lambda r,m=m: sorted([r["raw"],r["ruleC"],r[m]])[1] if (r["rdur"]>0.3 and r[m] is not None) else r["raw"])
    score(f"H4 {m}: max(raw, min(ruleC, aligner)) when dur>0.3 (move later only, conservative)",lambda r,m=m: max(r["raw"],min(r["ruleC"],r[m])) if (r["rdur"]>0.3 and r[m] is not None) else r["raw"])
score("H5 whisperx+st_align agree (within .1) and later than raw by >.1 and dur>0.25",lambda r: r["whisperx"] if (r["rdur"]>0.25 and r["whisperx"] is not None and r["st_align"] is not None and abs(r["whisperx"]-r["st_align"])<=0.1 and r["whisperx"]-r["raw"]>0.1) else r["raw"])

print("\n#### signed bias of aligners on UNTOUCHED words (aligner - fega)")
for m in methods:
    xs=[r[m]-r["fega"] for r in rows if r["grp"]=="untouched" and r[m] is not None]
    print(f"{m}: n={len(xs)} median={st.median(xs):+.3f} mean={st.mean(xs):+.3f} p10={sorted(xs)[int(.1*len(xs))]:+.3f} p90={sorted(xs)[int(.9*len(xs))]:+.3f}")
    bias=st.median(xs)
    score(f"{m} bias-corrected ({bias:+.3f})",lambda r,m=m,bias=bias: (r[m]-bias) if r[m] is not None else r["raw"])
    score(f"H6 {m} bias-corrected, only when raw dur>0.3",lambda r,m=m,bias=bias: (r[m]-bias) if (r[m] is not None and r["rdur"]>0.3) else r["raw"])
def ruleB(r): return max(r["raw"], r["raw"]+r["rdur"]-0.25) if r["rdur"]>0.3 else r["raw"]
score("B: start=end-0.25 when dur>0.3",ruleB)
score("C else B (if C found nothing and dur>0.5)",lambda r: r["ruleC"] if r["ruleC"]>r["raw"]+0.01 else (ruleB(r) if r["rdur"]>0.5 else r["raw"]))
score("C else B (if C found nothing and dur>0.4)",lambda r: r["ruleC"] if r["ruleC"]>r["raw"]+0.01 else (ruleB(r) if r["rdur"]>0.4 else r["raw"]))
