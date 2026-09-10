/**
 * The page a platform sign-in lands on in the user's browser, shared by the
 * Facebook, Instagram, TikTok and YouTube flows.
 *
 * It follows corva.gg, not the desktop UI: same palette, bloom and type
 * (Unbounded + Inter) as the website, because it opens in a browser tab next
 * to the site's own pages (Fega, s250). The hosted hop page
 * (scripts/hosted/meta-callback.html) carries the same design by hand.
 *
 * Electron-free on purpose so it can be rendered from a plain node script.
 */
const fs = require("fs");
const path = require("path");

// The brand mark, inlined so the local callback server has nothing else to
// serve. src/renderer/assets/brand/** is in package.json build.files for this.
const MARK_PATH = path.join(__dirname, "..", "..", "renderer", "assets", "brand", "clipflow-mark.png");
let markDataUri = null;
function mark() {
  if (markDataUri === null) {
    try {
      markDataUri = `data:image/png;base64,${fs.readFileSync(MARK_PATH).toString("base64")}`;
    } catch (_) {
      markDataUri = ""; // never let a missing image break a sign-in
    }
  }
  return markDataUri;
}

const CAN_DO = {
  Facebook: "Corva can publish clips and read views for this Page.",
  Instagram: "Corva can publish clips and read views for this account.",
  YouTube: "Corva can publish clips and read views for this channel.",
  TikTok: "Corva can publish clips to this account.",
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/**
 * @param {{ok: boolean, platform: string, account?: string, reason?: string}} o
 *   platform — "Facebook" | "Instagram" | "TikTok" | "YouTube"
 *   account  — the display name that connected (ok only)
 *   reason   — what went wrong, in the platform's words (fail only)
 */
function renderResultPage({ ok, platform, account, reason }) {
  const p = esc(platform);
  const badge = ok ? `${p} connected` : `${p} not connected`;
  const line = ok ? (account ? `${esc(account)} is in.` : `${p} connected.`) : `${p} didn't finish signing in.`;
  const lineB = ok ? (CAN_DO[platform] || "Corva can publish clips to this account.") : esc(reason || "Something went wrong.");
  const note = ok
    ? "You can close this tab and head back to Corva."
    : "Close this tab and try again from <b>Settings</b> in Corva.";
  const src = mark();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Corva — ${badge}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--ink:#04060E;--cyan:#09D7F8;--text:#EFF5FF;--muted:rgba(239,245,255,.60);--faint:rgba(239,245,255,.46);--hairline:rgba(239,245,255,.11);--rose:#FF8095;--display:'Unbounded',system-ui,sans-serif;--body:'Inter',system-ui,sans-serif}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{min-height:100vh;background:var(--ink);color:var(--text);font-family:var(--body);-webkit-font-smoothing:antialiased;display:flex;align-items:center;justify-content:center;padding:40px 24px;text-align:center;position:relative;overflow-x:hidden}
body::before{content:"";position:fixed;left:50%;top:44%;width:min(1200px,190vw);aspect-ratio:1;transform:translate(-50%,-50%);pointer-events:none;z-index:0;background:radial-gradient(circle at 50% 50%,rgba(9,215,248,.20) 0%,transparent 26%),radial-gradient(circle at 50% 50%,rgba(66,132,252,.26) 0%,transparent 40%),radial-gradient(circle at 50% 50%,rgba(12,85,228,.34) 0%,rgba(1,52,222,.14) 46%,transparent 72%)}
body.fail::before{background:radial-gradient(circle at 50% 50%,rgba(255,128,149,.14) 0%,transparent 26%),radial-gradient(circle at 50% 50%,rgba(66,132,252,.18) 0%,transparent 40%),radial-gradient(circle at 50% 50%,rgba(12,85,228,.30) 0%,rgba(1,52,222,.12) 46%,transparent 72%)}
body::after{content:"";position:fixed;inset:0;background:radial-gradient(ellipse at 50% 45%,transparent 30%,rgba(2,3,8,.72) 100%);pointer-events:none;z-index:0}
main{position:relative;z-index:1;width:100%;max-width:720px;animation:rise .8s cubic-bezier(.2,.7,.3,1) both}
@keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.mark{width:112px;height:112px;display:block;margin:0 auto 22px;background:url(${src}) center/contain no-repeat;filter:drop-shadow(0 0 44px rgba(66,132,252,.55)) drop-shadow(0 0 14px rgba(9,215,248,.30))}
.wordmark{font-family:var(--display);font-weight:700;font-size:52px;line-height:1;letter-spacing:-.035em;margin:0 0 22px}
.badge{display:inline-flex;align-items:center;gap:9px;border:1px solid rgba(9,215,248,.38);background:rgba(9,215,248,.07);border-radius:999px;padding:9px 18px 9px 15px;font-size:12.5px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--cyan);margin:0 0 30px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--cyan);flex:none;animation:pulse 2.4s ease-out infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(9,215,248,.6)}70%{box-shadow:0 0 0 9px rgba(9,215,248,0)}100%{box-shadow:0 0 0 0 rgba(9,215,248,0)}}
.badge.bad{border-color:rgba(255,128,149,.42);background:rgba(255,128,149,.08);color:var(--rose)}
.badge.bad .dot{background:var(--rose);animation:none}
.line{font-family:var(--display);font-weight:600;font-size:24px;line-height:1.3;letter-spacing:-.02em;margin:0 0 34px;text-wrap:balance}
.line-b{display:block;color:var(--muted);font-weight:500;font-size:19px;margin-top:6px}
.rule{width:56px;height:1px;background:var(--hairline);margin:0 auto 18px}
.note{margin:0;font-size:14.5px;line-height:1.5;color:var(--faint)}
.note b{color:var(--muted);font-weight:600}
@media (prefers-reduced-motion:reduce){main{animation:none}.dot{animation:none}}
@media (max-height:700px){.mark{width:84px;height:84px;margin-bottom:14px}.wordmark{font-size:40px;margin-bottom:14px}.badge{margin-bottom:20px}.line{font-size:20px;margin-bottom:24px}.line-b{font-size:16px}}
</style>
</head>
<body class="${ok ? "ok" : "fail"}">
<main>
${src ? '<div class="mark" role="img" aria-label="Corva"></div>' : ""}
<h1 class="wordmark">Corva</h1>
<p class="badge${ok ? "" : " bad"}"><span class="dot"></span>${badge}</p>
<p class="line">${line}<span class="line-b">${lineB}</span></p>
<div class="rule"></div>
<p class="note">${note}</p>
</main>
</body>
</html>`;
}

module.exports = { renderResultPage };
