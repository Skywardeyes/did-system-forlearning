import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');
const noOpLogService = { query: async () => ({ items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 1 }), get: async () => null,
  clear: async () => ({ cleared: true }), info: async () => null, warn: async () => null, error: async () => null };

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

export function sendJson(response, status, body) {
  response.writeHead(status, { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', Pragma: 'no-cache' });
  response.end(JSON.stringify(body));
}

export async function readJson(request) {
  const mediaType = String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    const error = new Error('请求 Content-Type 必须是 application/json');
    error.code = 'UNSUPPORTED_MEDIA_TYPE';
    throw error;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      const error = new Error('请求内容不能超过 1 MB');
      error.code = 'REQUEST_TOO_LARGE';
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('请求体不是有效的 JSON');
    error.code = 'REQUEST_INVALID_JSON';
    throw error;
  }
}

async function handleApi(request, response, url, activeService, logService, correlationId) {
  if (request.method === 'GET' && url.pathname === '/api/logs') {
    return sendJson(response, 200, await logService.query({
      search: url.searchParams.get('search') || '',
      type: url.searchParams.get('type') || '',
      success: url.searchParams.get('success') ?? '',
      level: url.searchParams.get('level') || '',
      module: url.searchParams.get('module') || '',
      startTime: url.searchParams.get('startTime') || '',
      endTime: url.searchParams.get('endTime') || '',
      page: url.searchParams.get('page'),
      pageSize: url.searchParams.get('pageSize'),
    }));
  }
  const logDetail = url.pathname.match(/^\/api\/logs\/([^/]+)$/);
  if (request.method === 'GET' && logDetail) {
    const entry = await logService.get(decodeURIComponent(logDetail[1]));
    if (!entry) {
      const error = new Error('未找到指定日志'); error.code = 'NOT_FOUND'; throw error;
    }
    return sendJson(response, 200, entry);
  }
  if (request.method === 'DELETE' && url.pathname === '/api/logs') {
    const body = await readJson(request);
    return sendJson(response, 200, await logService.clear({ correlationId, confirm: body.confirm }));
  }
  if (request.method === 'GET' && url.pathname === '/api/state') {
    return sendJson(response, 200, await activeService.getState());
  }
  const query = { search: url.searchParams.get('search') || '', page: url.searchParams.get('page'), pageSize: url.searchParams.get('pageSize') };
  if (request.method === 'GET' && url.pathname === '/api/dids') return sendJson(response, 200, await activeService.listDids(query));
  if (request.method === 'GET' && url.pathname === '/api/credentials') return sendJson(response, 200, await activeService.listCredentials(query));
  if (request.method === 'GET' && url.pathname === '/api/verification-logs') return sendJson(response, 200, await activeService.listVerificationLogs(query));
  if (request.method === 'GET' && url.pathname === '/api/disclosure-verification-logs') return sendJson(response, 200, await activeService.listDisclosureVerificationLogs(query));
  if (request.method === 'POST' && url.pathname === '/api/dids') {
    return sendJson(response, 201, await activeService.createDid(await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/credentials') {
    return sendJson(response, 201, await activeService.issueCredential(await readJson(request)));
  }
  if (request.method === 'POST' && url.pathname === '/api/verify') {
    const body = await readJson(request);
    return sendJson(response, 200, await activeService.verifyCredential(body.credential));
  }
  if (request.method === 'POST' && url.pathname === '/api/disclosures/verify') {
    const body = await readJson(request);
    return sendJson(response, 200, await activeService.verifyDisclosurePresentation(body.presentation));
  }
  if (request.method === 'POST' && url.pathname === '/api/sd-jwt/verify') {
    const body = await readJson(request);
    return sendJson(response, 200, await activeService.verifySdJwtPresentation(body.sdJwt));
  }
  if (request.method === 'POST' && url.pathname === '/api/demo/reset') {
    return sendJson(response, 200, await activeService.resetDemo());
  }

  const didAction = url.pathname.match(/^\/api\/dids\/([^/]+)(?:\/(rotate-key|deactivate))?$/);
  if (didAction) {
    const id = decodeURIComponent(didAction[1]);
    const body = await readJson(request);
    if (request.method === 'PATCH' && !didAction[2]) return sendJson(response, 200, await activeService.updateDid(id, body));
    if (request.method === 'POST' && didAction[2] === 'rotate-key') return sendJson(response, 200, await activeService.rotateDidKey(id, body));
    if (request.method === 'POST' && didAction[2] === 'deactivate') return sendJson(response, 200, await activeService.deactivateDid(id, body));
  }

  const disclosureAction = url.pathname.match(/^\/api\/credentials\/(.+)\/disclosures$/);
  if (request.method === 'POST' && disclosureAction) {
    const body = await readJson(request);
    return sendJson(response, 200, await activeService.createDisclosurePresentation(decodeURIComponent(disclosureAction[1]), body.paths));
  }
  const sdJwtAction = url.pathname.match(/^\/api\/credentials\/(.+)\/sd-jwt$/);
  if (request.method === 'POST' && sdJwtAction) {
    const body = await readJson(request);
    return sendJson(response, 200, { sdJwt: await activeService.createSdJwtPresentation(decodeURIComponent(sdJwtAction[1]), body.paths) });
  }

  const vcAction = url.pathname.match(/^\/api\/credentials\/(.+)\/(suspend|resume|replace|revoke)$/);
  if (request.method === 'POST' && vcAction) {
    const id = decodeURIComponent(vcAction[1]);
    const body = await readJson(request);
    const methods = { suspend: 'suspendCredential', resume: 'resumeCredential', replace: 'replaceCredential', revoke: 'revokeCredential' };
    return sendJson(response, 200, await activeService[methods[vcAction[2]]](id, body));
  }

  const revokeMatch = url.pathname.match(/^\/api\/credentials\/(.+)\/revoke$/);
  if (request.method === 'POST' && revokeMatch) {
    return sendJson(response, 200, await activeService.revokeCredential(decodeURIComponent(revokeMatch[1])));
  }
  await logService.warn({ type: 'system', module: 'API', action: 'ROUTE_NOT_FOUND', success: false, correlationId, errorCode: 'ROUTE_NOT_FOUND', message: '接口不存在', context: { method: request.method, pathname: url.pathname } });
  return sendJson(response, 404, { error: '接口不存在', code: 'ROUTE_NOT_FOUND' });
}

async function serveStatic(response, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(publicRoot, `.${requested}`);
  if (!filePath.startsWith(`${publicRoot}${path.sep}`)) {
    response.writeHead(403, securityHeaders);
    return response.end('Forbidden');
  }
  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      ...securityHeaders,
      'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(content);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    response.writeHead(404, { ...securityHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('页面不存在');
  }
}

export function createAppServer(activeService, { logService = noOpLogService, v2Api = null, legacyApiEnabled = true,
  requireHttps = false, serveFrontend = true } = {}) { return createServer(async (request, response) => {
  const correlationId = randomUUID();
  const requestService = activeService?.withAuditContext
    ? activeService.withAuditContext(logService, correlationId)
    : activeService;
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    try {
    if (url.pathname.startsWith('/api/v2/wallet-inbox/') || url.pathname.startsWith('/api/v2/wallet/')
      || url.pathname.startsWith('/api/v2/auth/') || url.pathname === '/api/v2/session/local' || url.pathname === '/api/v2/holder-dids/registration') {
      response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5176');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    }
    const secureRequest = Boolean(request.socket?.encrypted) || String(request.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
    if (requireHttps && !secureRequest) return sendJson(response, 426, { error: 'HTTPS is required', code: 'HTTPS_REQUIRED' });
    if (request.method === 'GET' && url.pathname === '/health') {
      return sendJson(response, 200, { status: 'ok', frontend: serveFrontend ? 'legacy-static' : 'external' });
    } else if (v2Api && url.pathname.startsWith('/api/v2/')) {
      const result = await v2Api.handle(request, url, correlationId, readJson);
      sendJson(response, result.status, result.body);
    } else if (url.pathname.startsWith('/api/') && !legacyApiEnabled) {
      sendJson(response, 410, { error: 'Legacy API is disabled in V2 data mode', code: 'LEGACY_API_DISABLED' });
    } else if (url.pathname.startsWith('/api/')) await handleApi(request, response, url, requestService, logService, correlationId);
    else if (serveFrontend) await serveStatic(response, url.pathname);
    else sendJson(response, 404, { error: 'Frontend is served by the web tier', code: 'FRONTEND_EXTERNAL' });
  } catch (error) {
    const conflict = /\u7248\u672c\u51b2\u7a81/.test(error.message);
    const notFound = /\u672a\u627e\u5230/.test(error.message);
    const code = error.code || (conflict ? 'VERSION_CONFLICT' : notFound ? 'NOT_FOUND' : 'INVALID_REQUEST');
    const level = ['REQUEST_INVALID_JSON', 'REQUEST_TOO_LARGE', 'NOT_FOUND'].includes(code) ? 'warn' : 'error';
    if (code === 'AUTHENTICATION_REQUIRED') return sendJson(response, 401, { error: 'Authentication is required', code });
    if (code === 'AUTHORIZATION_DENIED') return sendJson(response, 403, { error: 'Authorization is denied', code });
    if (code === 'ACCOUNT_TEMPORARILY_LOCKED') return sendJson(response, 429, { error: error.message, code });
    if (['ACCOUNT_ALREADY_EXISTS', 'VERSION_CONFLICT'].includes(code)) return sendJson(response, 409, { error: error.message, code });
    await logService[level]({ type: 'system', module: code.startsWith('STORE_') ? 'STORE' : 'API', action: code, success: false, correlationId, errorCode: code, message: error.message || '请求处理失败', context: { method: request.method, pathname: url.pathname } });
    sendJson(response, code === 'REQUEST_TOO_LARGE' ? 413 : code === 'UNSUPPORTED_MEDIA_TYPE' ? 415 : conflict ? 409 : notFound || code === 'NOT_FOUND' ? 404 : 400, { error: error.message || '请求处理失败', code });
  }
}); }
