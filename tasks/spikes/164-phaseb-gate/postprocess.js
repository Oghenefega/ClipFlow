// Phase B gate — consensus cluster + temporal maps + (optionally) profile dump.
// Usage: node postprocess.js <v1|v2|v3> [--dump]
const fs = require('fs');
const { PNG } = require('pngjs');

const v = process.argv[2];
const DUMP = process.argv.includes('--dump');
const det = JSON.parse(fs.readFileSync(`detections-${v}.json`, 'utf8'));
const results = det.results;
const N = results.length;

// ---------- pass A: streaming temporal stats at ds2 ----------
let W, H, dsW, dsH, sum, sumsq, minG;
for (const r of results) {
  const png = PNG.sync.read(fs.readFileSync('.' + r.frame));
  if (!sum) {
    W = png.width; H = png.height; dsW = W >> 1; dsH = H >> 1;
    sum = new Float64Array(dsW * dsH); sumsq = new Float64Array(dsW * dsH);
    minG = new Float32Array(dsW * dsH).fill(1e9);
  }
  const g = new Float32Array(dsW * dsH);
  for (let y = 0; y < dsH; y++) {
    for (let x = 0; x < dsW; x++) {
      const i = (y * 2 * W + x * 2) * 4;
      g[y * dsW + x] = 0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2];
    }
  }
  for (let y = 1; y < dsH - 1; y++) {
    for (let x = 1; x < dsW - 1; x++) {
      const k = y * dsW + x, v0 = g[k];
      sum[k] += v0; sumsq[k] += v0 * v0;
      const m = Math.abs(g[k + 1] - g[k - 1]) + Math.abs(g[k + dsW] - g[k - dsW]);
      if (m < minG[k]) minG[k] = m;
    }
  }
}
const V = new Float32Array(dsW * dsH);
for (let k = 0; k < dsW * dsH; k++) {
  V[k] = Math.sqrt(Math.max(0, sumsq[k] / N - (sum[k] / N) ** 2));
}

// ---------- consensus cluster (full-res coords) ----------
const diag = Math.hypot(W, H);
const clusters = [];
results.forEach((r, fi) => {
  for (const d of r.detections) {
    const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
    let best = null, bestDist = Infinity;
    for (const c of clusters) {
      const dist = Math.hypot(cx - c.cx, cy - c.cy);
      const sizeRatio = Math.max(d.w / c.w, c.w / d.w);
      if (dist < 0.04 * diag && sizeRatio < 1.6 && dist < bestDist) { best = c; bestDist = dist; }
    }
    if (best) {
      best.members.push({ fi, ...d });
      const n = best.members.length;
      best.cx += (cx - best.cx) / n; best.cy += (cy - best.cy) / n; best.w += (d.w - best.w) / n;
    } else {
      clusters.push({ cx, cy, w: d.w, members: [{ fi, ...d }] });
    }
  }
});
function median(a) { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; }
const scored = clusters.map((c) => {
  const frames = new Set(c.members.map((m) => m.fi)).size;
  const meanScore = c.members.reduce((a, m) => a + m.score, 0) / c.members.length;
  const box = {
    x: median(c.members.map((m) => m.x)), y: median(c.members.map((m) => m.y)),
    w: median(c.members.map((m) => m.w)), h: median(c.members.map((m) => m.h)),
  };
  const spread = Math.sqrt(
    c.members.reduce((a, m) => a + (m.x + m.w / 2 - c.cx) ** 2 + (m.y + m.h / 2 - c.cy) ** 2, 0) / c.members.length
  );
  return { frames, meanScore: +meanScore.toFixed(3), spread: +spread.toFixed(1), box };
}).sort((a, b) => b.frames - a.frames || b.meanScore - a.meanScore);

// candidates: present in most frames, positionally stable
let cands = scored.filter((c) => c.frames >= Math.ceil(N * 0.75) && c.spread < 0.02 * diag);
// drop a candidate nested inside a stronger candidate's box (tile-seam duplicates)
const contained = (a, b) => {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1) / (a.w * a.h) > 0.8;
};
cands = cands.filter((c) => !cands.some((o) => o !== c && o.meanScore >= c.meanScore && contained(c.box, o.box)));
const face = cands[0] || null;

console.log(`${v}: frame ${W}x${H}, ${clusters.length} raw clusters`);
console.log('top clusters:', JSON.stringify(scored.slice(0, 5)));
console.log('FACE:', JSON.stringify(face));

if (DUMP && face) {
  // ds2 coords of face
  const f = { x: face.box.x >> 1, y: face.box.y >> 1, w: face.box.w >> 1, h: face.box.h >> 1 };
  const rowMean = (arr, y, x0, x1) => { let s = 0; for (let x = x0; x < x1; x++) s += arr[y * dsW + x]; return s / (x1 - x0); };
  const colMean = (arr, x, y0, y1) => { let s = 0; for (let y = y0; y < y1; y++) s += arr[y * dsW + x]; return s / (y1 - y0); };

  console.log('\n-- full-width row profiles (every 16 ds-rows): y | meanV | meanP');
  for (let y = 8; y < dsH - 8; y += 16) {
    console.log(`${y * 2}\t${rowMean(V, y, 8, dsW - 8).toFixed(1)}\t${rowMean(minG, y, 8, dsW - 8).toFixed(1)}`);
  }
  console.log('\n-- cols near face (x from 0 to face right + 2*w, every 8 ds-cols, rows = face band): x | colV | colP');
  const y0 = Math.max(8, f.y - 8), y1 = Math.min(dsH - 8, f.y + f.h + 8);
  const xEnd = Math.min(dsW - 8, f.x + f.w * 3);
  for (let x = 8; x < xEnd; x += 8) {
    console.log(`${x * 2}\t${colMean(V, x, y0, y1).toFixed(1)}\t${colMean(minG, x, y0, y1).toFixed(1)}`);
  }
  console.log('\n-- rows near face (y from face-2h to face+3h, every 4 ds-rows, cols = face span +/- w): y | rowV | rowP');
  const x0r = Math.max(8, f.x - f.w), x1r = Math.min(dsW - 8, f.x + 2 * f.w);
  for (let y = Math.max(8, f.y - 2 * f.h); y < Math.min(dsH - 8, f.y + 3 * f.h); y += 4) {
    console.log(`${y * 2}\t${rowMean(V, y, x0r, x1r).toFixed(1)}\t${rowMean(minG, y, x0r, x1r).toFixed(1)}`);
  }
}

fs.writeFileSync(`maps-${v}.json`, JSON.stringify({
  W, H, dsW, dsH, face,
  note: 'V/minG kept in memory only during dump; proposals computed by snap.js',
}));
