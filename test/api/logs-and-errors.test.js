import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestApp } from '../helpers/fixture.js';

test('log API supports detail, filters and confirmed clear', async (t) => {
  const app = await startTestApp(t);
  await fetch(`${app.url}/api/dids`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Issuer', role: 'issuer' }) });
  const list = await (await fetch(`${app.url}/api/logs?type=audit&module=DID&pageSize=10`)).json();
  assert.equal(list.total, 1);
  assert.equal((await fetch(`${app.url}/api/logs/${list.items[0].id}`)).status, 200);
  assert.equal((await fetch(`${app.url}/api/logs/missing`)).status, 404);
  assert.equal((await fetch(`${app.url}/api/logs`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 400);
  const cleared = await fetch(`${app.url}/api/logs`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{"confirm":true}' });
  assert.equal(cleared.status, 200);
  assert.equal((await cleared.json()).action, 'LOG_CLEAR');
});

test('protocol errors map invalid JSON, oversized body, unknown route and method', async (t) => {
  const app = await startTestApp(t);
  const invalid = await fetch(`${app.url}/api/dids`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, 'REQUEST_INVALID_JSON');
  const oversized = await fetch(`${app.url}/api/dids`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(1024 * 1024 + 1) }) });
  assert.equal(oversized.status, 413);
  assert.equal((await fetch(`${app.url}/api/not-found`)).status, 404);
  assert.equal((await fetch(`${app.url}/api/state`, { method: 'PUT' })).status, 404);
});
