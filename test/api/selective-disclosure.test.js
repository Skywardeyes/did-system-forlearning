import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestApp } from '../helpers/fixture.js';

const headers = { 'content-type': 'application/json' };
async function post(url, body = {}) {
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  return { response, body: await response.json() };
}

test('selective disclosure API generates, verifies and rejects tampering', async (t) => {
  const app = await startTestApp(t);
  const issuer = (await post(`${app.url}/api/dids`, { name: 'Issuer', role: 'issuer', method: 'example' })).body;
  const holder = (await post(`${app.url}/api/dids`, { name: 'Holder', role: 'holder', method: 'key' })).body;
  const issued = (await post(`${app.url}/api/credentials`, {
    issuerDid: issuer.did, holderDid: holder.did, studentName: 'Private Name', courseName: 'Public Course', validUntil: '2099-01-01T00:00:00.000Z',
  })).body;

  const generated = await post(`${app.url}/api/credentials/${encodeURIComponent(issued.id)}/disclosures`, { paths: ['credentialSubject.course'] });
  assert.equal(generated.response.status, 200);
  assert.equal(generated.body.disclosedClaims[0].value, 'Public Course');
  assert.doesNotMatch(JSON.stringify(generated.body), /Private Name/);
  const verified = await post(`${app.url}/api/disclosures/verify`, { presentation: generated.body });
  assert.equal(verified.body.valid, true);

  generated.body.disclosedClaims[0].value = 'Changed Course';
  const tampered = await post(`${app.url}/api/disclosures/verify`, { presentation: generated.body });
  assert.equal(tampered.response.status, 200);
  assert.equal(tampered.body.valid, false);
  const ledgerResponse = await fetch(`${app.url}/api/disclosure-verification-logs?page=1&pageSize=10&search=disclosedClaims`);
  const ledger = await ledgerResponse.json();
  assert.equal(ledger.total, 1);
  assert.equal(ledger.items[0].valid, false);
  assert.ok(ledger.items[0].failedChecks.includes('disclosedClaims'));
});

test('ordinary credential APIs do not expose salts or disclosure material', async (t) => {
  const app = await startTestApp(t);
  await post(`${app.url}/api/demo/reset`);
  for (const endpoint of ['/api/state', '/api/credentials?page=1&pageSize=10']) {
    const response = await fetch(`${app.url}${endpoint}`);
    const text = await response.text();
    assert.doesNotMatch(text, /disclosureMaterial|"salt"/);
    assert.match(text, /selectiveDisclosureAvailable/);
  }
  const ledgerText = await (await fetch(`${app.url}/api/disclosure-verification-logs?page=1&pageSize=10`)).text();
  assert.doesNotMatch(ledgerText, /disclosureMaterial|"salt"/);
});
