import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestApp } from '../helpers/fixture.js';

const headers = { 'content-type': 'application/json' };
async function post(app, route, body = {}) { const response = await fetch(`${app.url}${route}`, { method: 'POST', headers, body: JSON.stringify(body) }); return { response, body: await response.json() }; }

test('HTTP lifecycle journey covers suspension, recovery, replacement and revocation', async (t) => {
  const app = await startTestApp(t);
  const demo = (await post(app, '/api/demo/reset')).body;
  const id = encodeURIComponent(demo.credential.id);
  await post(app, `/api/credentials/${id}/suspend`);
  assert.equal((await post(app, '/api/verify', { credential: demo.credential.credential })).body.valid, false);
  await post(app, `/api/credentials/${id}/resume`);
  assert.equal((await post(app, '/api/verify', { credential: demo.credential.credential })).body.valid, true);
  const replacement = (await post(app, `/api/credentials/${id}/replace`, { courseName: 'Advanced' })).body;
  assert.equal(replacement.replaces, demo.credential.id);
  await post(app, `/api/credentials/${encodeURIComponent(replacement.id)}/revoke`);
  assert.equal((await post(app, `/api/credentials/${encodeURIComponent(replacement.id)}/resume`)).response.status, 400);
});

test('DID rotation keeps old and new credentials verifiable then deactivation blocks issuing', async (t) => {
  const app = await startTestApp(t);
  const demo = (await post(app, '/api/demo/reset')).body;
  const rotated = (await post(app, `/api/dids/${demo.issuer.id}/rotate-key`, { expectedVersion: 1 })).body;
  const fresh = (await post(app, '/api/credentials', { issuerDid: rotated.did, holderDid: demo.holder.did, studentName: 'Holder', courseName: 'New', validUntil: '2099-01-01T00:00:00.000Z' })).body;
  assert.equal((await post(app, '/api/verify', { credential: demo.credential.credential })).body.valid, true);
  assert.equal((await post(app, '/api/verify', { credential: fresh.credential })).body.valid, true);
  await post(app, `/api/dids/${demo.issuer.id}/deactivate`, { expectedVersion: 2 });
  assert.equal((await post(app, '/api/credentials', { issuerDid: rotated.did, holderDid: demo.holder.did, studentName: 'No', courseName: 'No' })).response.status, 400);
  const historical = (await post(app, '/api/verify', { credential: demo.credential.credential })).body;
  assert.equal(historical.checks.find((check) => check.key === 'signature').passed, true);
  assert.equal(historical.valid, false);
});
