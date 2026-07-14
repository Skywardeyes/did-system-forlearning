import assert from 'node:assert/strict';
import test from 'node:test';
import { createFixture, startTestApp } from '../helpers/fixture.js';
import { createAppServer } from '../../src/server.js';

test('JSON write endpoints reject non-JSON content types', async (t) => {
  const app = await startTestApp(t);
  const response = await fetch(`${app.url}/api/dids`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ name: 'Issuer', role: 'issuer' }) });
  assert.equal(response.status, 415);
});

test('static and API responses include baseline security headers', async (t) => {
  const app = await startTestApp(t);
  for (const route of ['/', '/api/state']) {
    const response = await fetch(`${app.url}${route}`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(response.headers.get('content-security-policy'));
    assert.ok(response.headers.get('referrer-policy'));
    if (route.startsWith('/api/')) assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('HTTPS enforcement rejects plaintext requests when production guard is enabled', async (t) => {
  const fixture = await createFixture(t);
  const server = createAppServer(fixture.service, { logService: fixture.logService, requireHttps: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/state`);
  assert.equal(response.status, 426);
  assert.equal((await response.json()).code, 'HTTPS_REQUIRED');
});

test('dangerous unsupported methods cannot change application state', async (t) => {
  const app = await startTestApp(t);
  const before = await (await fetch(`${app.url}/api/state`)).json();
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    const response = await fetch(`${app.url}/api/demo/reset`, { method });
    assert.ok([404, 405].includes(response.status));
  }
  const after = await (await fetch(`${app.url}/api/state`)).json();
  assert.deepEqual(after, before);
});
