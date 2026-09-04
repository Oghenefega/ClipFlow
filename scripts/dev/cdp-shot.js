// node cdp-shot.js out.png — screenshot of the Corva main window via CDP on 9222.
const fs = require("fs");
const out = process.argv[2] || "shot.png";
(async () => {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find((t) => t.type === "page" && /index\.html/.test(t.url));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.send(JSON.stringify({ id: 1, method: "Page.captureScreenshot", params: { format: "png" } }));
  const msg = await new Promise((res) => { ws.onmessage = (e) => res(JSON.parse(e.data)); });
  ws.close();
  fs.writeFileSync(out, Buffer.from(msg.result.data, "base64"));
  console.log("wrote", out, fs.statSync(out).size, "bytes");
})().catch((e) => { console.error(e.message); process.exit(1); });
