import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.WALLET_PORT || 5176);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const target = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.resolve(root, target);
  if (!file.startsWith(`${root}${path.sep}`)) { response.writeHead(403); return response.end('Forbidden'); }
  try {
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    response.end(content);
  } catch { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Not found'); }
}).listen(port, '127.0.0.1', () => process.stdout.write(`Personal wallet is running at http://127.0.0.1:${port}\n`));
