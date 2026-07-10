import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAppServer } from '../src/server.js';
import { JsonStore } from '../src/store.js';
import { VcService } from '../src/vc-service.js';

async function app(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'did-http-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const service = new VcService(new JsonStore(path.join(directory, 'store.json')));
  const server = createAppServer(service);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { service, url: `http://127.0.0.1:${server.address().port}` };
}

test('DID 列表返回搜索分页结构', async (t) => {
  const { service, url } = await app(t);
  await service.createDid({ name: 'Alice', role: 'issuer', method: 'example' });
  await service.createDid({ name: 'Bob', role: 'holder', method: 'key' });
  const response = await fetch(`${url}/api/dids?search= alice &page=1&pageSize=10`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.total, 1);
  assert.equal(body.items[0].name, 'Alice');
});

test('DID 生命周期路由校验版本冲突', async (t) => {
  const { service, url } = await app(t);
  const issuer = await service.createDid({ name: '发行方', role: 'issuer' });
  const first = await fetch(`${url}/api/dids/${issuer.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '新发行方', expectedVersion: 1 }) });
  assert.equal(first.status, 200);
  const conflict = await fetch(`${url}/api/dids/${issuer.id}/rotate-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion: 1 }) });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, 'VERSION_CONFLICT');
});
