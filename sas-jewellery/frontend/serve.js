// Tiny static server for the frontend (no packages needed)
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.normalize(path.join(__dirname, p === '/' ? 'index.html' : p));
  const isAsset = /\.(jpe?g|png|webp|svg|ico|css|js)$/i.test(p);
  const ok = f.startsWith(__dirname + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile() && !f.endsWith('serve.js') && !f.endsWith('package.json');
  if (!ok) {
    if (isAsset) { res.writeHead(404); return res.end('Not found'); }  // missing image -> 404 so the page shows its placeholder
    f = path.join(__dirname, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log(`\n  Frontend running at http://localhost:${PORT}  (open this in your browser)\n`));
