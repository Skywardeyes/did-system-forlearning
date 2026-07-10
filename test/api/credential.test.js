import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestApp } from '../helpers/fixture.js';

const headers = { 'content-type': 'application/json' };
async function post(url, body = {}) { const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) }); return { response, body: await response.json() }; }
async function createDid(app, name, role, method = 'example') { return (await post(`${app.url}/api/dids`, { name, role, method })).body; }

test('credential API covers issue, verify, suspend, resume, replace and revoke', async (t) => {
  const app = await startTestApp(t);
  const issuer = await createDid(app, 'Issuer', 'issuer');
  const holder = await createDid(app, 'Holder', 'holder', 'key');
  const issued = await post(`${app.url}/api/credentials`, { issuerDid: issuer.did, holderDid: holder.did, studentName: 'Holder', courseName: 'Course', completionDate: '2026-07-10', validUntil: '2099-01-01T00:00:00.000Z' });
  assert.equal(issued.response.status, 201);
  assert.equal((await post(`${app.url}/api/verify`, { credential: issued.body.credential })).body.valid, true);
  assert.equal((await post(`${app.url}/api/credentials/${encodeURIComponent(issued.body.id)}/suspend`)).body.status, 'suspended');
  assert.equal((await post(`${app.url}/api/verify`, { credential: issued.body.credential })).body.valid, false);
  assert.equal((await post(`${app.url}/api/credentials/${encodeURIComponent(issued.body.id)}/resume`)).body.status, 'active');
  const replacement = await post(`${app.url}/api/credentials/${encodeURIComponent(issued.body.id)}/replace`, { courseName: 'Course 2' });
  assert.equal(replacement.body.replaces, issued.body.id);
  assert.equal((await post(`${app.url}/api/credentials/${encodeURIComponent(replacement.body.id)}/revoke`)).body.status, 'revoked');
});

test('credential API rejects invalid participants, empty data and illegal transitions', async (t) => {
  const app = await startTestApp(t);
  const issuer = await createDid(app, 'Issuer', 'issuer');
  const holder = await createDid(app, 'Holder', 'holder');
  assert.equal((await post(`${app.url}/api/credentials`, { issuerDid: holder.did, holderDid: issuer.did, studentName: '', courseName: '' })).response.status, 400);
  assert.equal((await post(`${app.url}/api/credentials/missing/revoke`)).response.status, 404);
  const malformed = await post(`${app.url}/api/verify`, { credential: { id: 'bad' } });
  assert.equal(malformed.response.status, 200);
  assert.equal(malformed.body.valid, false);
});
