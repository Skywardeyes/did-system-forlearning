import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestApp } from '../helpers/fixture.js';

async function json(url, options) { const response = await fetch(url, options); return { response, body: await response.json() }; }

test('state and list APIs return JSON pagination without private keys', async (t) => {
  const app = await startTestApp(t);
  await app.service.createDid({ name: 'Alice', role: 'issuer' });
  await app.service.createDid({ name: 'Bob', role: 'holder', method: 'key' });
  for (const route of ['/api/state', '/api/dids?search=alice&page=1&pageSize=10', '/api/credentials', '/api/verification-logs', '/api/logs']) {
    const { response, body } = await json(`${app.url}${route}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^application\/json/);
    assert.doesNotMatch(JSON.stringify(body), /privateJwk|"d"\s*:/);
  }
  const dids = await json(`${app.url}/api/dids?search=alice&page=1&pageSize=10`);
  assert.equal(dids.body.total, 1);
  assert.equal(dids.body.items[0].name, 'Alice');
});
