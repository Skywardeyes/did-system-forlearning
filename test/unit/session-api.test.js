import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionApi } from '../../public/session-api.js';

const response = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });

test('browser session client obtains a local V2 token and maps legacy-shaped paths', async () => {
  const calls = [];
  const fetchImpl = async (path, options) => {
    calls.push({ path, options });
    if (path === '/api/v2/session/local') return response(200, { accessToken: 'token', actor: { id: 'actor-1' },
      tenant: { id: 'tenant-1', name: '演示组织' }, roles: ['tenant_admin'], expiresAt: '2099-01-01T00:00:00.000Z' });
    return response(200, { items: [] });
  };
  const storage = { setItem() {} };
  const client = createSessionApi({ fetchImpl, storage });
  await client.initialize();
  await client.api('/api/dids?page=1');
  assert.equal(calls[1].path, '/api/v2/dids?page=1');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer token');
  assert.equal(client.getSession().mode, 'v2');
});

test('browser session client keeps legacy fixtures usable when V2 is unavailable', async () => {
  const calls = [];
  const client = createSessionApi({ storage: null, fetchImpl: async (path) => {
    calls.push(path);
    if (path === '/api/v2/session/local') return response(404, { error: '接口不存在' });
    return response(200, { dids: [] });
  } });
  await client.initialize();
  await client.api('/api/dids');
  assert.deepEqual(calls, ['/api/v2/session/local', '/api/state', '/api/dids']);
  assert.equal(client.getSession().mode, 'legacy');
});
