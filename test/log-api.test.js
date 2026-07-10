import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { LogService } from '../src/log-service.js';
import { LogStore } from '../src/log-store.js';
import { createAppServer } from '../src/server.js';
import { JsonStore } from '../src/store.js';
import { VcService } from '../src/vc-service.js';

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'log-api-'));
  const logService = new LogService(new LogStore(path.join(directory, 'logs.json')));
  const service = new VcService(new JsonStore(path.join(directory, 'store.json')));
  const server = createAppServer(service, { logService });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return { url: `http://127.0.0.1:${server.address().port}`, logService };
}

test('成功业务请求写入带关联 ID 的审计日志', async (t) => {
  const app = await fixture(t);
  const response = await fetch(`${app.url}/api/dids`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: '机构', role: 'issuer', method: 'example' }),
  });
  assert.equal(response.status, 201);
  const result = await app.logService.query({ search: 'DID_CREATE' });
  assert.equal(result.total, 1);
  assert.match(result.items[0].correlationId, /^[0-9a-f-]{36}$/);
});

test('GET /api/logs 支持组合筛选和分页', async (t) => {
  const app = await fixture(t);
  await app.logService.warn({ type: 'audit', module: 'DID', action: 'DID_CREATE', success: false, message: '失败' });
  await app.logService.info({ type: 'audit', module: 'VC', action: 'VC_ISSUE', success: true, message: '成功' });
  const response = await fetch(`${app.url}/api/logs?type=audit&level=warn&module=DID&page=1&pageSize=10`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.total, 1);
  assert.equal(body.items[0].action, 'DID_CREATE');
});

test('非法 JSON 和未知路由记录系统日志', async (t) => {
  const app = await fixture(t);
  const invalid = await fetch(`${app.url}/api/dids`, { method: 'POST', body: '{' });
  const missing = await fetch(`${app.url}/api/not-found`);
  assert.equal(invalid.status, 400);
  assert.equal(missing.status, 404);
  const entries = (await app.logService.query({ type: 'system' })).items;
  assert.equal(entries.some((item) => item.action === 'REQUEST_INVALID_JSON'), true);
  assert.equal(entries.some((item) => item.action === 'ROUTE_NOT_FOUND'), true);
});

test('日志详情、未确认清空和确认清空', async (t) => {
  const app = await fixture(t);
  const entry = await app.logService.info({ type: 'system', module: 'SYSTEM', action: 'STARTED', success: true, message: '启动' });
  assert.equal((await (await fetch(`${app.url}/api/logs/${entry.id}`)).json()).id, entry.id);
  assert.equal((await fetch(`${app.url}/api/logs/missing`)).status, 404);
  assert.equal((await fetch(`${app.url}/api/logs`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 400);
  const cleared = await fetch(`${app.url}/api/logs`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
  assert.equal(cleared.status, 200);
  const logs = await app.logService.query({});
  assert.equal(logs.items.some((item) => item.action === 'LOG_CLEAR'), true);
});
