// Phase B gate harness — headless Electron page running MediaPipe FaceDetector.
// Usage: electron main.js <jobName> (job = detect all frames listed in job-<jobName>.json)
const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

app.on('window-all-closed', () => {}); // keep alive headless (session-104 lesson)

const ROOT = __dirname;
const jobName = process.argv[process.argv.length - 1];
const outPath = path.join(ROOT, `detections-${jobName}.json`);

const MIME = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.cjs': 'text/javascript',
  '.wasm': 'application/wasm', '.html': 'text/html', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.tflite': 'application/octet-stream', '.json': 'application/json',
};

const srv = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/result') {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      fs.writeFileSync(outPath, b);
      res.writeHead(200); res.end('ok');
      console.log('RESULT_WRITTEN ' + outPath);
      setTimeout(() => app.exit(0), 100);
    });
    return;
  }
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(d);
  });
});

srv.listen(0, '127.0.0.1', async () => {
  const port = srv.address().port;
  await app.whenReady();
  const win = new BrowserWindow({ show: false, width: 800, height: 600 });
  win.webContents.on('console-message', (e, l, msg) => console.log('[page]', msg));
  win.webContents.on('render-process-gone', (e, d) => { console.error('RENDERER_GONE', JSON.stringify(d)); app.exit(2); });
  win.loadURL(`http://127.0.0.1:${port}/index.html?job=${encodeURIComponent(jobName)}`);
  setTimeout(() => { console.error('TIMEOUT'); app.exit(3); }, 240000);
});
