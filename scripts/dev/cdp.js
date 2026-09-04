// node cdp.js "<js expression>" — evaluates in the Corva main window (CDP on 9222),
// prints the JSON value. Node 24: global fetch + WebSocket, no deps.
const expr = process.argv[2];
if (!expr) { console.error("usage: node cdp.js \"<expr>\""); process.exit(1); }
(async () => {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find((t) => t.type === "page" && /index\.html/.test(t.url)) || targets.find((t) => t.type === "page");
  if (!page) { console.error("no page target:", targets.map((t) => `${t.type} ${t.url}`)); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: expr, awaitPromise: true, returnByValue: true } }));
  const msg = await new Promise((res) => { ws.onmessage = (e) => res(JSON.parse(e.data)); });
  ws.close();
  if (msg.result?.exceptionDetails) { console.error("EXCEPTION:", JSON.stringify(msg.result.exceptionDetails.exception?.description || msg.result.exceptionDetails, null, 1)); process.exit(2); }
  console.log(JSON.stringify(msg.result?.result?.value ?? msg, null, 1));
})().catch((e) => { console.error(e.message); process.exit(3); });
