// node cdp.js "<js expression>"        evaluate in the Corva main window (CDP on 9222)
// node cdp.js @probe.js                 same, expression read from a file (use this for
//                                        anything with backslashes, quotes or backticks)
// node cdp.js --main "<expr>"|@file     evaluate in the MAIN process (needs dev-launch.js --main)
// Prints the JSON value. Node 24: global fetch + WebSocket, no deps. Exits after 45 s.
const fs = require("fs");
const args = process.argv.slice(2);
const main = args[0] === "--main";
const arg = main ? args[1] : args[0];
if (!arg) { console.error("usage: node cdp.js [--main] \"<expr>\" | @file.js"); process.exit(1); }
const expr = arg.startsWith("@") ? fs.readFileSync(arg.slice(1), "utf8") : arg;
setTimeout(() => { console.error("TIMEOUT"); process.exit(9); }, 45000);
(async () => {
  const port = main ? 9229 : 9222;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  // A dev boot lists splash.html too; the app is the index.html page.
  const page = main ? targets[0] : targets.find((t) => t.type === "page" && /index\.html/.test(t.url)) || targets.find((t) => t.type === "page");
  if (!page) { console.error("no page target:", targets.map((t) => `${t.type} ${t.url}`)); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: expr, awaitPromise: true, returnByValue: true, includeCommandLineAPI: true } }));
  const msg = await new Promise((res) => { ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id === 1) res(m); }; });
  await new Promise((r) => { ws.onclose = r; ws.close(); });
  if (msg.result?.exceptionDetails) { console.error("EXCEPTION:", JSON.stringify(msg.result.exceptionDetails.exception?.description || msg.result.exceptionDetails, null, 1)); process.exit(2); }
  console.log(JSON.stringify(msg.result?.result?.value ?? msg, null, 1));
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(3); });
