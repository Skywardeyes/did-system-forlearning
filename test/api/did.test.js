import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestApp } from '../helpers/fixture.js';

const headers = { 'content-type': 'application/json' };
async function request(url, method, body) { const response = await fetch(url, { method, headers, body: JSON.stringify(body) }); return { response, body: await response.json() }; }

test('DID API covers creation, update, rotation, conflict and deactivation', async (t) => {
  const app = await startTestApp(t);
  const created = await request(`${app.url}/api/dids`, 'POST', { name: 'Issuer', role: 'issuer', method: 'example' });
  assert.equal(created.response.status, 201);
  assert.equal('privateJwk' in created.body, false);
  const updated = await request(`${app.url}/api/dids/${created.body.id}`, 'PATCH', { name: 'Issuer 2', serviceEndpoint: 'https://example.test/did', expectedVersion: 1 });
  assert.equal(updated.body.version, 2);
  const conflict = await request(`${app.url}/api/dids/${created.body.id}/rotate-key`, 'POST', { expectedVersion: 1 });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.body.code, 'VERSION_CONFLICT');
  const rotated = await request(`${app.url}/api/dids/${created.body.id}/rotate-key`, 'POST', { expectedVersion: 2 });
  assert.equal(rotated.body.keyVersion, 2);
  const deactivated = await request(`${app.url}/api/dids/${created.body.id}/deactivate`, 'POST', { expectedVersion: 3 });
  assert.equal(deactivated.body.status, 'deactivated');
  assert.equal((await request(`${app.url}/api/dids/${created.body.id}`, 'PATCH', { name: 'No', expectedVersion: 4 })).response.status, 400);
});

test('DID API rejects missing fields, invalid role, method, URL and unknown ID', async (t) => {
  const app = await startTestApp(t);
  for (const body of [{ role: 'issuer' }, { name: 'x', role: 'admin' }, { name: 'x', role: 'issuer', method: 'unknown' }]) {
    assert.equal((await request(`${app.url}/api/dids`, 'POST', body)).response.status, 400);
  }
  assert.equal((await request(`${app.url}/api/dids/missing`, 'PATCH', { name: 'x', expectedVersion: 1 })).response.status, 404);
  const key = await request(`${app.url}/api/dids`, 'POST', { name: 'Key', role: 'holder', method: 'key' });
  assert.equal((await request(`${app.url}/api/dids/${key.body.id}`, 'PATCH', { name: 'x', expectedVersion: 1 })).response.status, 400);
});
