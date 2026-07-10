import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestApp } from '../helpers/fixture.js';

const headers = { 'content-type': 'application/json' };
async function post(app, route, body = {}) { const response = await fetch(`${app.url}${route}`, { method: 'POST', headers, body: JSON.stringify(body) }); return { response, body: await response.json() }; }

for (const [issuerMethod, holderMethod] of [['example', 'example'], ['key', 'key'], ['example', 'key'], ['key', 'example']]) {
  test(`HTTP journey ${issuerMethod}/${holderMethod} creates, issues and verifies`, async (t) => {
    const app = await startTestApp(t);
    const issuer = (await post(app, '/api/dids', { name: 'Issuer', role: 'issuer', method: issuerMethod })).body;
    const holder = (await post(app, '/api/dids', { name: 'Holder', role: 'holder', method: holderMethod })).body;
    const issued = (await post(app, '/api/credentials', { issuerDid: issuer.did, holderDid: holder.did, studentName: 'Holder', courseName: 'Course', completionDate: '2026-07-10', validUntil: '2099-01-01T00:00:00.000Z' })).body;
    const verified = (await post(app, '/api/verify', { credential: issued.credential })).body;
    assert.equal(verified.valid, true);
    assert.equal(verified.checks.length, 7);
    assert.equal((await (await fetch(`${app.url}/api/state`)).json()).credentials.length, 1);
  });
}

test('HTTP tampering journey rejects subject, course, issuer, validity and proof changes', async (t) => {
  const app = await startTestApp(t);
  const demo = (await post(app, '/api/demo/reset')).body;
  const mutations = [
    (vc) => { vc.credentialSubject.name = 'Mallory'; },
    (vc) => { vc.credentialSubject.course = 'Other'; },
    (vc) => { vc.issuer = 'did:example:missing'; },
    (vc) => { vc.validUntil = '2020-01-01T00:00:00.000Z'; },
    (vc) => { vc.proof.proofValue = `A${vc.proof.proofValue.slice(1)}`; },
  ];
  for (const mutate of mutations) {
    const credential = structuredClone(demo.credential.credential);
    mutate(credential);
    assert.equal((await post(app, '/api/verify', { credential })).body.valid, false);
  }
});
