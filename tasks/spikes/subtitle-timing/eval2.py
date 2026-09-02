# Both-direction scoring by pill position. rows come from hybrid_eval's loader.
import os,sys,statistics as st
S=sys.argv[1]
src=open(os.path.join(S,"hybrid_eval.py"),encoding="utf-8").read().split('print("clips scored:"')[0]
exec(src)
for r in rows: r["d"]=r["fega"]-r["raw"]
BIAS=0.031
def wx(r): return (r["whisperx"]-BIAS) if r["whisperx"] is not None else None
# position needs single/middle/last: recompute from sub1 order is lost; approximate: pos "first" vs "other". Add finer position by re-walking clips.
def score2(name,fn):
    out={}
    for r in rows:
        v=fn(r); v=r["raw"] if v is None else v
        e=v-r["fega"]; moved=abs(r["d"])>0.1; unt=abs(r["d"])<=0.05
        for key in ("all", r["pos"]+("Moved" if moved else "Untouched" if unt else "grey")):
            if key.endswith("grey"): continue
            out.setdefault(key,[]).append(e)
    def f(xs): ax=[abs(x) for x in xs]; return f"n={len(xs):4d} <=100ms={sum(1 for x in ax if x<=0.1)/len(xs):5.1%} >100ms={sum(1 for x in ax if x>0.1)/len(xs):5.1%}"
    print(f"\n== {name}")
    for k in ("firstMoved","firstUntouched","otherMoved","otherUntouched","all"): print(f"  {k:15s} {f(out[k])}")
print("moved = |Fega - raw| > 100 ms in EITHER direction")
score2("raw",lambda r:r["raw"])
score2("whisperx bias-corrected (full replacement)",wx)
score2("ruleC (later only)",lambda r:r["ruleC"])
print("\n-- agreement between whisperx and raw, by group (|wx - raw|):")
for grp,cond in (("moved",lambda r:abs(r["d"])>0.1),("untouched",lambda r:abs(r["d"])<=0.05)):
    xs=sorted(abs(wx(r)-r["raw"]) for r in rows if cond(r) and wx(r) is not None)
    print(f"  {grp:9s} n={len(xs)} p25={xs[len(xs)//4]:.3f} med={xs[len(xs)//2]:.3f} p75={xs[3*len(xs)//4]:.3f}  frac>0.1={sum(1 for x in xs if x>0.1)/len(xs):.0%} frac>0.2={sum(1 for x in xs if x>0.2)/len(xs):.0%}")
for T in (0.1,0.15,0.2,0.25,0.3):
    score2(f"T{T}: whisperx when |wx-raw|>{T}, else raw",lambda r,T=T: wx(r) if (wx(r) is not None and abs(wx(r)-r["raw"])>T) else r["raw"])
for T in (0.15,0.2):
    score2(f"T{T}+C: ruleC if found; else whisperx when |wx-raw|>{T}",lambda r,T=T: r["ruleC"] if r["ruleC"]>r["raw"]+0.01 else (wx(r) if (wx(r) is not None and abs(wx(r)-r["raw"])>T) else r["raw"]))
    score2(f"T{T}+Cagree: ruleC if found and wx agrees within .15; else whisperx when |wx-raw|>{T}",lambda r,T=T: r["ruleC"] if (r["ruleC"]>r["raw"]+0.01 and wx(r) is not None and abs(r["ruleC"]-wx(r))<=0.15) else (wx(r) if (wx(r) is not None and abs(wx(r)-r["raw"])>T) else r["raw"]))

if "crisper" in methods:
    print("\n#### CrisperWhisper as second opinion")
    cb=[r["crisper"]-r["fega"] for r in rows if abs(r["d"])<=0.05 and r["crisper"] is not None]; CB=st.median(cb) if cb else 0.0
    def cw(r): return (r["crisper"]-CB) if r["crisper"] is not None else None
    score2(f"crisper bias-corrected ({CB:+.3f}) full replacement",cw)
    for T in (0.1,0.15,0.2):
        score2(f"crisper when |cw-raw|>{T}, else raw",lambda r,T=T: cw(r) if (cw(r) is not None and abs(cw(r)-r["raw"])>T) else r["raw"])
    score2("crisper when |cw-raw|>0.15 AND whisperx agrees with crisper within 0.15; else raw",lambda r: cw(r) if (cw(r) is not None and wx(r) is not None and abs(cw(r)-r["raw"])>0.15 and abs(cw(r)-wx(r))<=0.15) else r["raw"])
    score2("shipped rule (whisperx T0.15) but with crisper in whisperx's place",lambda r: cw(r) if (cw(r) is not None and abs(cw(r)-r["raw"])>0.15) else r["raw"])
    score2("both: crisper if |cw-raw|>0.15 else whisperx if |wx-raw|>0.15 else raw",lambda r: cw(r) if (cw(r) is not None and abs(cw(r)-r["raw"])>0.15) else (wx(r) if (wx(r) is not None and abs(wx(r)-r["raw"])>0.15) else r["raw"]))
