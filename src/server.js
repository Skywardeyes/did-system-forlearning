import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JsonStore } from './store.js';
import { VcService } from './vc-service.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');
const store = new JsonStore(process.env.DATA_FILE || path.join(root, 'data', 'store.json'));
const service = new VcService(store);
const port = Number(process.env.PORT || 4173);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('请求内容不能超过 1 MB');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('请求体不是有效的 JSON');
  }
}

async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/state') {
    return sendJson(response, 200, await service.getState());
  }
  if (request.method === 'POST' && url.pathname === '/api/dids') {
    return sendJson(response, 201, await service.createDid(await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/credentials') {
    return sendJson(response, 201, await service.issueCredential(await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/verify') {
    const body = await readJson(request);
    return sendJson(response, 200, await service.verifyCredential(body.credential));
  }
  if (request.method === 'POST' && url.pathname === '/api/demo/reset') {
    return sendJson(response, 200, await service.resetDemo());
  }

  const revokeMatch = url.pathname.match(/^\/api\/credentials\/(.+)\/revoke$/);
  if (request.method === 'POST' && revokeMatch) {
    return sendJson(response, 200, await service.revokeCredential(decodeURIComponent(revokeMatch[1])));
  }
  return sendJson(response, 404, { error: '接口不存在' });
}

async function serveStatic(response, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(publicRoot, `.${requested}`);
  if (!filePath.startsWith(`${publicRoot}${path.sep}`)) {
    response.writeHead(403);
    return response.end('Forbidden');
  }
  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(content);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('页面不存在');
  }
}

export const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(request, response, url);
    else await serveStatic(response, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, 400, { error: error.message || '请求处理失败' });
  }
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(port, '127.0.0.1', () => {
    console.log(`DID/VC Learning Lab running at http://127.0.0.1:${port}`);
  });
}
