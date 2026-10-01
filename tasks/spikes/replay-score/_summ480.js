// #480 pooled summary of replay cells: recall, rejected-hit rate, boundary coverage, cost, time.
const fs = require("fs");
const path = require("path");
const DIR = path.join(__dirname, "results");
const toSec = (t) => { const p = String(t).split(":").map(Number); return p.reduce((a, b) => a * 60 + b, 0); };
const cells = process.argv.slice(2);
// Approved rows per video, read once from a copy of the prod feedback table (python dumps it).
const APPROVED = JSON.parse(fs.readFileSync(path.join(__dirname, "_tmp", "approved480.json"), "utf8"));
for (const label of cells) {
  const files = fs.readdirSync(DIR).filter((f) => f.includes(`__${label}__`));
  let am = 0, at = 0, rh = 0, picks = 0, cost = 0, secs = 0, cov = [], n = 0, unrev = 0;
  for (const f of files) {
    const r = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    const s = r.score;
    am += s.approvedMatched; at += s.approvedTotal; rh += s.rejectedHits; picks += s.perPick.length; unrev += s.unreviewed;
    cost += r.cost || 0; secs += r.seconds || 0; n++;
    // boundary coverage: for each approved row a pick matched, the best share of it a pick covers
    const truthApproved = APPROVED[r.videoName] || [];
    for (const a of truthApproved) {
      const aS = toSec(a.clip_start), aE = toSec(a.clip_end);
      let best = 0;
      for (const p of s.perPick) best = Math.max(best, Math.max(0, Math.min(p.end, aE) - Math.max(p.start, aS)) / (aE - aS));
      if (best > 0) cov.push(best);
    }
  }
  const covStr = cov.length ? (cov.reduce((a, b) => a + b, 0) / cov.length * 100).toFixed(0) + "%" : "n/a";
  console.log(`${label.padEnd(14)} runs ${n} | recall ${am}/${at} | rejected-hit ${rh}/${picks} = ${(rh / picks * 100).toFixed(0)}% | unreviewed ${unrev} | picks/run ${(picks / n).toFixed(1)} | coverage ${covStr} | $/run ${(cost / n).toFixed(3)} | s/run ${secs ? (secs / n).toFixed(1) : "?"}`);
}
