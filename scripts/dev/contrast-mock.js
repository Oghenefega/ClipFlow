// Generates tasks/mocks/contrast-audit.html: every theme, current vs proposed, with the
// ratios printed from the same measuring code as the audit.
const fs = require("fs");
const path = require("path");
const A = require("./contrast-audit.js");
const proposals = JSON.parse(fs.readFileSync(path.join(__dirname, "proposals.json"), "utf8"));
const outPath = process.argv[2] || path.resolve(__dirname, "../../tasks/mocks/contrast-audit.html");

const fmt = (x) => x.toFixed(2);
const pass = (r, min) => (r >= min ? "ok" : "bad");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function applied(id) {
  const t = { ...A.themes[id] };
  const p = proposals[id] || {};
  for (const k of Object.keys(p)) if (k !== "_alt45") t[k] = p[k];
  return t;
}
function mfHex(t) { return A.toHex(A.parse(t["muted-foreground"])); }

function panel(id, t, label, changed) {
  const bg = t.bg, sf = t.surface;
  const dim = (k) => (k === "accentLight" ? t.accentDim : t[k + "Dim"]);
  const chg = (k) => (changed.has(k) ? " chg" : "");
  const m = (fg, bgc, under, min) => {
    const r = A.contrast(fg, bgc, under || bgc);
    return `<span class="r ${pass(r, min)}">${fmt(r)}</span>`;
  };
  const tier = (k, size, min, sample, extra = "") =>
    `<div class="row${chg(k)}"><span class="lbl">${k} · ${size}px</span>` +
    `<span class="sample" style="color:${t[k]};font-size:${size}px;${extra}">${sample}</span>` +
    `<span class="ratios">bg ${m(t[k], bg, null, min)} · sf ${m(t[k], sf, null, min)}</span></div>`;
  const pill = (k, size, min) =>
    `<span class="pill${chg(k)}" style="color:${t[k]};background:${dim(k)};font-size:${size}px">${k}` +
    `<em>${m(t[k], dim(k), sf, min)}</em></span>`;
  const mf = mfHex(t);
  return `
  <section class="theme" style="--bg:${bg};--sf:${sf};--text:${t.text};--border:${t.border}">
    <header><b>${id}</b> <span>${label}</span> <code>bg ${bg} · surface ${sf}</code></header>
    <div class="onbg">
      <div class="col">
        <div class="h">on --bg</div>
        ${tier("text", 13, 4.5, "Body text: “My brain stopped working mid hype”")}
        ${tier("textSecondary", 13, 4.5, "Secondary: Scheduled Thu 12:25 · 100T · 3 platforms")}
        ${tier("textSecondary", 11.5, 3, "Secondary at 11.5px — section hint text")}
        ${tier("labelStrong", 10, 3, "LABEL STRONG · UPPERCASE MICRO-LABEL", "letter-spacing:.06em;font-weight:600")}
        ${tier("textTertiary", 11, 3, "Tertiary 11px: 2 approved · 4 rejected · 12 min ago")}
        ${tier("textTertiary", 10, 3, "Tertiary 10px: settings description line")}
        ${tier("textMuted", 10, 3, "Muted 10px: 3/7 · publish_id: 8f2a · day off")}
        ${tier("textMuted", 9, 3, "Muted 9px: filename.example.mp4")}
      </div>
      <div class="col surface" style="background:${sf}">
        <div class="h">on --surface (cards)</div>
        ${tier("text", 13, 4.5, "Body text on a card")}
        ${tier("textSecondary", 13, 4.5, "Secondary on a card at 13px")}
        ${tier("textTertiary", 11, 3, "Tertiary on a card at 11px")}
        ${tier("textMuted", 10, 3, "Muted on a card at 10px")}
        <div class="row"><span class="lbl">status pills · 11px on *Dim</span>
          <span class="pills">${A.STATUS.map((k) => pill(k, 11, 3)).join("")}</span></div>
        <div class="row"><span class="lbl">status pills · 13px on *Dim</span>
          <span class="pills">${["green", "yellow", "red", "orange"].map((k) => pill(k, 13, 4.5)).join("")}</span></div>
        <div class="row"><span class="lbl">status as plain text · 11px</span>
          <span class="pills plain">${A.STATUS.map((k) => `<span class="${chg(k).trim()}" style="color:${t[k]};font-size:11px">${k} ${m(t[k], sf, null, 3)}</span>`).join("")}</span></div>
      </div>
    </div>
    <div class="editor" style="background:hsl(${t.background})">
      <div class="h">editor · shadcn muted-foreground <code>${esc(t["muted-foreground"])}</code></div>
      <div class="row${chg("muted-foreground")}"><span class="lbl">text-xs (12px)</span>
        <span class="sample" style="color:${mf};font-size:12px">Muted foreground on --background</span>
        <span class="ratios">background ${m(mf, `hsl(${t.background})`, null, 4.5)}</span></div>
      <div class="row${chg("muted-foreground")}" style="background:hsl(${t.card});padding:4px 6px;border-radius:4px"><span class="lbl">text-[11px] on card</span>
        <span class="sample" style="color:${mf};font-size:11px">Muted foreground on --card</span>
        <span class="ratios">card ${m(mf, `hsl(${t.card})`, null, 3)}</span></div>
      <div class="row"><span class="lbl">text-[10px] /70 modifier</span>
        <span class="sample" style="color:${mf};opacity:.7;font-size:10px">muted-foreground/70 — 30+ editor sites</span>
        <span class="ratios">background ${m(`rgba(${A.parse(mf).r},${A.parse(mf).g},${A.parse(mf).b},0.7)`, `hsl(${t.background})`, null, 3)}</span></div>
    </div>
  </section>`;
}

const sections = A.order.map((id) => {
  const cur = A.themes[id], next = applied(id);
  const changed = new Set(Object.keys(proposals[id] || {}).filter((k) => k !== "_alt45"));
  const diff = [...changed].map((k) => `<li><code>--${k}</code>: <s>${esc(cur[k])}</s> → <b>${esc(next[k])}</b></li>`).join("");
  return `
  <div class="pair" id="${id}">
    <div class="pairhead"><h2>${id}</h2><ul class="diff">${diff || "<li>no changes proposed</li>"}</ul></div>
    <div class="side-by-side">
      ${panel(id, cur, "current", new Set())}
      ${panel(id, next, "proposed", changed)}
    </div>
  </div>`;
}).join("\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Corva — contrast audit, nine themes, current vs proposed</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  /* Every number on this page is measured (WCAG 2.x luminance ratio) by the same code
     that produced the audit table; the colours are the literal token values. Green ratio
     = meets the threshold for that row (4.5 body / 3 small labels & pills); red = under. */
  html { background:#1b1b1f; color:#ddd; font-family:"DM Sans",system-ui,sans-serif; }
  body { margin:0; padding:20px 24px 60px; }
  h1 { font-size:18px; margin:0 0 4px; }
  .intro { font-size:12px; color:#aaa; max-width:980px; line-height:1.5; margin-bottom:14px; }
  nav a { color:#8ab4fa; font-size:12px; margin-right:12px; text-decoration:none; }
  .pair { margin:26px 0 0; }
  .pairhead { display:flex; align-items:baseline; gap:18px; margin-bottom:6px; }
  .pairhead h2 { margin:0; font-size:15px; text-transform:capitalize; }
  .diff { margin:0; padding:0; list-style:none; display:flex; flex-wrap:wrap; gap:4px 16px; font-size:11px; color:#bbb; }
  .diff code { color:#8ab4fa; }
  .diff s { color:#888; }
  .side-by-side { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .theme { background:var(--bg); color:var(--text); border-radius:8px; overflow:hidden; border:1px solid rgba(255,255,255,.08); }
  .theme header { display:flex; gap:10px; align-items:baseline; padding:8px 12px; font-size:12px; border-bottom:1px solid var(--border); }
  .theme header b { font-size:13px; text-transform:capitalize; }
  .theme header span { color:inherit; opacity:.7; }
  .theme header code { margin-left:auto; font-family:"DM Sans"; font-size:10.5px; opacity:.6; }
  .onbg { display:grid; grid-template-columns:1fr 1fr; }
  .col { padding:10px 12px; }
  .col.surface { border-left:1px solid var(--border); }
  .h { font-size:9.5px; text-transform:uppercase; letter-spacing:.08em; opacity:.55; margin-bottom:8px; }
  .row { display:grid; grid-template-columns:118px 1fr auto; gap:8px; align-items:center; padding:3px 0; }
  .row.chg { box-shadow:inset 3px 0 0 #8ab4fa; padding-left:6px; margin-left:-9px; }
  .lbl { font-size:9.5px; opacity:.5; letter-spacing:.02em; white-space:nowrap; }
  .sample { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .ratios { font-size:10px; opacity:.85; white-space:nowrap; }
  .r { font-weight:600; padding:0 4px; border-radius:3px; }
  .r.ok { background:rgba(52,211,153,.18); color:#34d399; }
  .r.bad { background:rgba(248,113,113,.22); color:#f87171; }
  .pills { display:flex; flex-wrap:wrap; gap:4px; grid-column:2 / span 2; }
  .pill { display:inline-flex; align-items:center; gap:5px; padding:2px 7px; border-radius:999px; font-weight:600; letter-spacing:.01em; }
  .pill em { font-style:normal; font-weight:400; font-size:9.5px; }
  .pill.chg, .plain .chg { outline:1.5px solid #8ab4fa; outline-offset:2px; border-radius:999px; }
  .plain span { padding:1px 6px; }
  .editor { padding:8px 12px 10px; border-top:1px solid var(--border); }
  .editor code { font-family:"DM Sans"; font-size:10px; opacity:.75; }
  .legend { font-size:11px; color:#aaa; margin-top:6px; }
  .legend i { display:inline-block; width:10px; height:10px; border-left:3px solid #8ab4fa; vertical-align:middle; margin-right:4px; }
</style>
</head>
<body>
<h1>Contrast audit — nine themes, current (left) vs proposed (right)</h1>
<p class="intro">Thresholds per row: <b>4.5:1</b> for 13px body text, <b>3:1</b> for 9–11.5px labels and pills. Pills are measured against
their *Dim tint composited over --surface (the pixel the text actually sits on). Every ratio is measured, not estimated.
Proposed values change <b>lightness only</b>: alpha for the rgba text tiers, OKLCH L for the hex status colours (hue held to ±0.3°;
chroma trimmed only where the step left sRGB gamut). Blue bar / blue ring = a token that changed.
<b>textMuted stays under 3:1 on purpose</b> — it is the placeholder/disabled tier; the four sites that print real information
with it (counts, a timestamp, a log id, a filename) should move to textTertiary, which is a code change, not a palette one.</p>
<nav>${A.order.map((id) => `<a href="#${id}">${id}</a>`).join("")}</nav>
<div class="legend"><i></i> changed token &nbsp;·&nbsp; <span class="r ok">3.10</span> meets row threshold &nbsp;·&nbsp; <span class="r bad">2.88</span> under it</div>
${sections}
</body>
</html>`;

fs.writeFileSync(outPath, html);
console.log("wrote", outPath, (html.length / 1024).toFixed(0) + " KB");
