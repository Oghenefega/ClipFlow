// node cdpclick.js x y — trusted mouse press+release at window coords via CDP on 9222.
const [x, y] = [Number(process.argv[2]), Number(process.argv[3])];
(async () => {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find((t) => t.type === "page" && /index\.html/.test(t.url)) || targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const send = (method, params) => new Promise((res) => { const i = ++id; const h = (e) => { const m = JSON.parse(e.data); if (m.id === i) { ws.removeEventListener("message", h); res(m); } }; ws.addEventListener("message", h); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
  console.log("clicked", x, y); process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
