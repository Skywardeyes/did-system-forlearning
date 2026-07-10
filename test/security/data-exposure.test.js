import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestApp } from '../helpers/fixture.js';

function assertNoSecrets(value, { allowProof = false } = {}) {
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /"d":"secret"|bearer\s+[a-z0-9._-]+|D:\\\\DIDS|node_modules|Error:\s|\bat\s+\w+/i);
  if (!allowProof) assert.doesNotMatch(text, /proofValue/);
}

test('public APIs never expose private key material or stack paths', async (t) => {
  const app = await startTestApp(t);
  await fetch(`${app.url}/api/demo/reset`, { method: 'POST' });
  for (const route of ['/api/state', '/api/dids', '/api/credentials', '/api/verification-logs']) {
    const body = await (await fetch(`${app.url}${route}`)).json();
    assertNoSecrets(body, { allowProof: route === '/api/state' || route === '/api/credentials' });
  }
  const error = await (await fetch(`${app.url}/api/dids`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })).json();
  assertNoSecrets(error);
});

test('structured logs redact proof, credentials, tokens and private keys', async (t) => {
  const app = await startTestApp(t);
  await app.logService.info({ type: 'system', module: 'API', action: 'SECURITY_TEST', success: false, message: 'redaction', context: { privateJwk: { d: 'secret' }, token: 'abc', proof: { proofValue: 'sig' }, credential: { id: 'vc' } } });
  const logs = await (await fetch(`${app.url}/api/logs?pageSize=50`)).json();
  assertNoSecrets(logs);
  assert.match(JSON.stringify(logs), /\[REDACTED\]/);
  const context = logs.items[0].context;
  assert.equal(context.privateJwk, '[REDACTED]');
  assert.equal(context.token, '[REDACTED]');
  assert.equal(context.proof, '[REDACTED]');
  assert.equal(context.credential, '[REDACTED]');
});
