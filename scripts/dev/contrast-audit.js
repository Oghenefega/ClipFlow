// Measured WCAG 2.x contrast audit over src/renderer/styles/themes.css.
// Usage: node scripts/dev/contrast-audit.js [path/to/themes.css] [--json out.json] [--propose]
// --propose also writes proposals.json next to this script; scripts/dev/contrast-mock.js turns
// that into tasks/mocks/contrast-audit.html (current vs proposed, ratios measured by this code).
const fs = require("fs");
const path = require("path");

const cssPath = process.argv[2] && !process.argv[2].startsWith("--")
  ? process.argv[2]
  : path.resolve(__dirname, "../../src/renderer/styles/themes.css");
const jsonIdx = process.argv.indexOf("--json");
const jsonOut = jsonIdx > -1 ? process.argv[jsonIdx + 1] : null;

const css = fs.readFileSync(cssPath, "utf8");

// ---- parse theme blocks --------------------------------------------------
const themes = {};
const blockRe = /\[data-theme="([a-z]+)"\]\s*\{([\s\S]*?)\n\}/g;
let m;
while ((m = blockRe.exec(css))) {
  const [, id, body] = m;
  const vars = {};
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, "");
  const varRe = /--([A-Za-z0-9-]+)\s*:\s*([^;]+);/g;
  let v;
  while ((v = varRe.exec(clean))) vars[v[1]] = v[2].trim();
  themes[id] = vars;
}

// ---- colour parsing ------------------------------------------------------
function hexToRgb(h) {
  h = h.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
}
function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255, a: 1 };
}
function parse(str) {
  str = str.trim();
  if (str.startsWith("#")) return hexToRgb(str);
  let mm = str.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/);
  if (mm) return { r: +mm[1], g: +mm[2], b: +mm[3], a: mm[4] === undefined ? 1 : +mm[4] };
  mm = str.match(/^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/);
  if (mm) return hslToRgb(+mm[1], +mm[2], +mm[3]);
  mm = str.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/); // shadcn channel triple
  if (mm) return hslToRgb(+mm[1], +mm[2], +mm[3]);
  throw new Error("unparsed colour: " + str);
}

// ---- compositing + WCAG luminance ---------------------------------------
function over(fg, bg) {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}
function lum({ r, g, b }) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(fg, bg) {
  const L1 = lum(fg), L2 = lum(bg);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}
// APCA-W3 0.0.98G-4g
function apcaY({ r, g, b }) {
  const f = (c) => Math.pow(c / 255, 2.4);
  return 0.2126729 * f(r) + 0.7151522 * f(g) + 0.072175 * f(b);
}
function apca(fg, bg) {
  const clamp = (Y) => (Y < 0.022 ? Y + Math.pow(0.022 - Y, 1.414) : Y);
  const Yt = clamp(apcaY(fg)), Yb = clamp(apcaY(bg));
  if (Math.abs(Yb - Yt) < 0.0005) return 0;
  let out;
  if (Yb > Yt) {
    const s = (Math.pow(Yb, 0.56) - Math.pow(Yt, 0.57)) * 1.14;
    out = s < 0.1 ? 0 : s - 0.027;
  } else {
    const s = (Math.pow(Yb, 0.65) - Math.pow(Yt, 0.62)) * 1.14;
    out = s > -0.1 ? 0 : s + 0.027;
  }
  return out * 100;
}
function resolvePair(fgStr, bgStr, underStr) {
  // bgStr may itself be translucent (a *Dim pill); composite it over underStr first.
  let bg = parse(bgStr);
  if (bg.a < 1) bg = over(bg, parse(underStr));
  const fg = over(parse(fgStr), bg);
  return { fg, bg };
}
function contrast(fgStr, bgStr, underStr) {
  const { fg, bg } = resolvePair(fgStr, bgStr, underStr);
  return ratio(fg, bg);
}
function lc(fgStr, bgStr, underStr) {
  const { fg, bg } = resolvePair(fgStr, bgStr, underStr);
  return Math.abs(apca(fg, bg));
}
function toHex(c) {
  const h = (x) => Math.round(x).toString(16).padStart(2, "0");
  return "#" + h(c.r) + h(c.g) + h(c.b);
}

// ---- audit matrix --------------------------------------------------------
const TEXT_TIERS = ["text", "textSecondary", "textTertiary", "textMuted", "labelStrong"];
const STATUS = ["green", "yellow", "red", "orange", "cyan", "accent", "accentLight"];
const order = ["midnight", "daylight", "rose", "blush", "graphite", "forest", "amethyst", "paper", "sunset"];

module.exports = { themes, order, TEXT_TIERS, STATUS, parse, over, toHex, contrast, lc, ratio, lum };
if (require.main !== module) return;

const fmt = (x) => x.toFixed(2);
const results = {};
const lines = [];

for (const id of order) {
  const t = themes[id];
  if (!t) { lines.push(`!! theme ${id} not found`); continue; }
  results[id] = { textTiers: {}, status: {}, shadcn: {} };
  lines.push(`\n## ${id}   bg ${t.bg}  surface ${t.surface}`);
  const cell = (fg, bg, under) => `${fmt(contrast(fg, bg, under))} / Lc ${lc(fg, bg, under).toFixed(0)}`;
  lines.push(`| token | value | vs bg | vs surface | resolved on bg |`);
  lines.push(`|---|---|---|---|---|`);
  for (const k of TEXT_TIERS) {
    const onBg = contrast(t[k], t.bg, t.bg);
    const onSf = contrast(t[k], t.surface, t.surface);
    results[id].textTiers[k] = { value: t[k], bg: onBg, surface: onSf, lcBg: lc(t[k], t.bg, t.bg), lcSurface: lc(t[k], t.surface, t.surface) };
    lines.push(`| ${k} | ${t[k]} | ${cell(t[k], t.bg, t.bg)} | ${cell(t[k], t.surface, t.surface)} | ${toHex(over(parse(t[k]), parse(t.bg)))} |`);
  }
  lines.push(``);
  lines.push(`| status | value | vs bg | vs surface | pill: on Dim over surface |`);
  lines.push(`|---|---|---|---|---|`);
  for (const k of STATUS) {
    const onBg = contrast(t[k], t.bg, t.bg);
    const onSf = contrast(t[k], t.surface, t.surface);
    const dimKey = k === "accentLight" ? "accentDim" : k + "Dim";
    const onDim = t[dimKey] ? contrast(t[k], t[dimKey], t.surface) : NaN;
    results[id].status[k] = { value: t[k], bg: onBg, surface: onSf, pill: onDim, lcBg: lc(t[k], t.bg, t.bg), lcSurface: lc(t[k], t.surface, t.surface) };
    lines.push(`| ${k} | ${t[k]} | ${cell(t[k], t.bg, t.bg)} | ${cell(t[k], t.surface, t.surface)} | ${isNaN(onDim) ? "—" : cell(t[k], t[dimKey], t.surface)} |`);
  }
  lines.push(``);
  const mf = t["muted-foreground"];
  const onBackground = contrast(mf, t.background, t.background);
  const onCard = contrast(mf, t.card, t.card);
  results[id].shadcn["muted-foreground"] = { value: mf, background: onBackground, card: onCard };
  lines.push(`| shadcn | value | vs background | vs card |`);
  lines.push(`|---|---|---|---|`);
  lines.push(`| muted-foreground | hsl(${mf}) = ${toHex(parse(mf))} | ${cell(mf, t.background, t.background)} | ${cell(mf, t.card, t.card)} |`);
  // sanity: shadcn background vs --bg agreement
  const bgHex = toHex(parse(t.bg)), shBg = toHex(parse(t.background));
  const cardHex = toHex(parse(t.card)), sfHex = toHex(parse(t.surface));
  lines.push(`_(--bg ${bgHex} vs --background ${shBg}; --surface ${sfHex} vs --card ${cardHex})_`);
}

// muted-foreground with Tailwind /70 opacity modifier (139 editor sites use /70 or similar)
lines.push(`\n## editor: text-muted-foreground/70 (opacity modifier), resolved`);
lines.push(`| theme | vs background | vs card |`);
lines.push(`|---|---|---|`);
for (const id of order) {
  const t = themes[id];
  const c = parse(t["muted-foreground"]); c.a = 0.7;
  const str = `rgba(${c.r},${c.g},${c.b},0.7)`;
  lines.push(`| ${id} | ${fmt(contrast(str, t.background, t.background))} / Lc ${lc(str, t.background, t.background).toFixed(0)} | ${fmt(contrast(str, t.card, t.card))} / Lc ${lc(str, t.card, t.card).toFixed(0)} |`);
}

console.log(lines.join("\n"));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 2));

// ═══════════════════════════════════════════════════════════════════════════
// --propose : lightness-only fixes. Alpha tokens step alpha; hex tokens step
// OKLCH L with hue held (chroma reduced only when the step leaves sRGB gamut).
// ═══════════════════════════════════════════════════════════════════════════
if (!process.argv.includes("--propose")) process.exit(0);

// sRGB <-> OKLCH
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const unlin = (c) => { const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return v * 255; };
function rgbToOklch({ r, g, b }) {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(a, bb), h: (Math.atan2(bb, a) * 180) / Math.PI };
}
function oklchToRgb({ L, C, h }) {
  const a = C * Math.cos((h * Math.PI) / 180), bb = C * Math.sin((h * Math.PI) / 180);
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * bb, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * bb, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * bb, 3);
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const B = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return { r: unlin(R), g: unlin(G), b: unlin(B), a: 1, inGamut: [R, G, B].every((x) => x >= -0.0005 && x <= 1.0005) };
}
function clampGamut(lch) {
  let c = { ...lch };
  let rgb = oklchToRgb(c);
  while (!rgb.inGamut && c.C > 0) { c.C -= 0.002; rgb = oklchToRgb(c); }
  return { lch: c, rgb };
}

// Step a hex token in L until every (bg, minRatio) pair passes.
function solveHex(hex, pairs, direction) {
  const start = rgbToOklch(parse(hex));
  let L = start.L;
  for (let i = 0; i < 200; i++) {
    const { lch, rgb } = clampGamut({ L, C: start.C, h: start.h });
    const h = toHex(rgb);
    if (pairs.every(([bg, min, under]) => contrast(h, bg, under || bg) >= min)) {
      return { hex: h, from: start, to: lch, steps: i };
    }
    L += direction * 0.005;
    if (L < 0 || L > 1) break;
  }
  return null;
}
// Step an rgba token's alpha until every pair passes (ratio or Lc).
function solveAlpha(str, pairs, useLc) {
  const c = parse(str);
  let a = c.a;
  for (let i = 0; i < 100; i++) {
    const s = `rgba(${c.r}, ${c.g}, ${c.b}, ${a.toFixed(2)})`;
    const ok = pairs.every(([bg, min]) => (useLc ? lc(s, bg, bg) : contrast(s, bg, bg)) >= min);
    if (ok) return { value: s, alpha: +a.toFixed(2), fromAlpha: c.a };
    a += 0.01;
    if (a > 1) break;
  }
  return null;
}

const isLight = (t) => lum(parse(t.bg)) > 0.18;
const out = [];
out.push(`\n\n# PROPOSALS (lightness-only, hue held)`);
const TARGET_LABEL = 3.05, TARGET_BODY = 4.55, TARGET_MUTED_FLOOR = 1.85;
const proposals = {};
for (const id of order) {
  const t = themes[id];
  const p = (proposals[id] = {});
  const light = isLight(t);
  const bgPairs = (min) => [[t.bg, min], [t.surface, min]];
  out.push(`\n## ${id} (${light ? "light" : "dark"})`);

  // textTertiary → ≥3:1 on bg and surface
  if (contrast(t.textTertiary, t.bg, t.bg) < TARGET_LABEL || contrast(t.textTertiary, t.surface, t.surface) < TARGET_LABEL) {
    const r = solveAlpha(t.textTertiary, bgPairs(TARGET_LABEL));
    p.textTertiary = r.value;
    out.push(`textTertiary  ${t.textTertiary}  →  ${r.value}   (bg ${fmt(contrast(r.value, t.bg, t.bg))}, surface ${fmt(contrast(r.value, t.surface, t.surface))})`);
  }
  // textMuted → stays a decorative/disabled tier BELOW 3:1 (informational sites move to
  // textTertiary instead). Floor it at the light themes' measured level (≈1.85:1) so the
  // dark themes' Lc 0 (APCA: not discernible as text) becomes at least visible.
  if (contrast(t.textMuted, t.bg, t.bg) < TARGET_MUTED_FLOOR) {
    const r = solveAlpha(t.textMuted, [[t.bg, TARGET_MUTED_FLOOR]]);
    p.textMuted = r.value;
    out.push(`textMuted     ${t.textMuted}  →  ${r.value}   (bg ${fmt(contrast(r.value, t.bg, t.bg))} / Lc ${lc(r.value, t.bg, t.bg).toFixed(0)}, surface ${fmt(contrast(r.value, t.surface, t.surface))} / Lc ${lc(r.value, t.surface, t.surface).toFixed(0)})`);
  }
  // textSecondary → ≥4.5:1 body
  if (contrast(t.textSecondary, t.bg, t.bg) < TARGET_BODY || contrast(t.textSecondary, t.surface, t.surface) < TARGET_BODY) {
    const r = solveAlpha(t.textSecondary, bgPairs(TARGET_BODY));
    p.textSecondary = r.value;
    out.push(`textSecondary ${t.textSecondary}  →  ${r.value}   (bg ${fmt(contrast(r.value, t.bg, t.bg))}, surface ${fmt(contrast(r.value, t.surface, t.surface))})`);
  }
  // status + accent → ≥3:1 on bg, surface and their Dim pill over surface
  for (const k of STATUS) {
    const dimKey = k === "accentLight" ? "accentDim" : k + "Dim";
    const pairs = [[t.bg, TARGET_LABEL], [t.surface, TARGET_LABEL], [t[dimKey], TARGET_LABEL, t.surface]];
    const fails = pairs.some(([bg, min, under]) => contrast(t[k], bg, under || bg) < min);
    if (!fails) continue;
    const r = solveHex(t[k], pairs, light ? -1 : +1);
    p[k] = r.hex;
    const o = rgbToOklch(parse(t[k])), n = rgbToOklch(parse(r.hex));
    out.push(`${k.padEnd(13)} ${t[k]}  →  ${r.hex}   oklch L ${(o.L*100).toFixed(1)}→${(n.L*100).toFixed(1)}  C ${o.C.toFixed(3)}→${n.C.toFixed(3)}  h ${o.h.toFixed(1)}→${n.h.toFixed(1)}   (bg ${fmt(contrast(r.hex, t.bg, t.bg))}, surface ${fmt(contrast(r.hex, t.surface, t.surface))}, pill ${fmt(contrast(r.hex, t[dimKey], t.surface))})`);
  }
  // stricter alternative: status text as body (4.5:1) — light themes only, for the 13px pills
  if (light) {
    const alt = [];
    for (const k of STATUS) {
      const dimKey = k === "accentLight" ? "accentDim" : k + "Dim";
      const pairs = [[t.bg, TARGET_BODY], [t.surface, TARGET_BODY], [t[dimKey], TARGET_BODY, t.surface]];
      if (!pairs.some(([bg, min, under]) => contrast(t[k], bg, under || bg) < min)) continue;
      const r = solveHex(t[k], pairs, -1);
      const o = rgbToOklch(parse(t[k])), n = rgbToOklch(parse(r.hex));
      alt.push(`  ${k.padEnd(11)} ${t[k]} → ${r.hex}  (L ${(o.L*100).toFixed(0)}→${(n.L*100).toFixed(0)}, bg ${fmt(contrast(r.hex, t.bg, t.bg))})`);
    }
    if (alt.length) { out.push(`  [alt: 4.5:1 for status text]`); out.push(...alt); }
    p._alt45 = alt;
  }
  // shadcn muted-foreground → ≥4.5 on background and card (12–13px text-xs sites exist)
  const mf = t["muted-foreground"];
  if (contrast(mf, t.background, t.background) < TARGET_BODY || contrast(mf, t.card, t.card) < TARGET_BODY) {
    const [h, s, l] = mf.split(/\s+/);
    let L = parseFloat(l);
    const dir = light ? -1 : +1;
    for (let i = 0; i < 60; i++) {
      const v = `${h} ${s} ${L}%`;
      if (contrast(v, t.background, t.background) >= TARGET_BODY && contrast(v, t.card, t.card) >= TARGET_BODY) {
        p["muted-foreground"] = v;
        out.push(`muted-foreground ${mf}  →  ${v}   (background ${fmt(contrast(v, t.background, t.background))}, card ${fmt(contrast(v, t.card, t.card))})`);
        break;
      }
      L += dir;
    }
  }
  if (!Object.keys(p).filter((k) => k !== "_alt45").length) out.push(`(no changes needed)`);
}
console.log(out.join("\n"));
fs.writeFileSync(path.join(__dirname, "proposals.json"), JSON.stringify(proposals, null, 2));
