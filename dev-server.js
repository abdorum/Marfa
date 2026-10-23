// Local stand-in for Cloudflare Pages: serves public/ and routes
// POST /api/refresh to the same handler the Pages Function uses.
// Usage: npm run dev   (or `npm run dev:cf` for the real Workers runtime)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleRefresh } from './src/peoplesoft.js';

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/refresh') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const response = await handleRefresh(new Request('http://localhost/api/refresh', {
      method: 'POST', body: Buffer.concat(chunks),
    }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    return res.end(await response.text());
  }
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.normalize(path.join(PUBLIC, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(PORT, () => console.log(`Qaedat AlTalib dev server on http://localhost:${PORT}`));
