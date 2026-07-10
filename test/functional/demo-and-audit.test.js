import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestApp } from '../helpers/fixture.js';

test('demo reset creates a complete auditable local scenario', async (t) => {
  const app = await startTestApp(t);
  const reset = await fetch(`${app.url}/api/demo/reset`, { method: 'POST' });
  assert.equal(reset.status, 200);
  const state = await (await fetch(`${app.url}/api/state`)).json();
  assert.equal(state.dids.length, 2);
  assert.equal(state.credentials.length, 1);
  const logs = await (await fetch(`${app.url}/api/logs?pageSize=50`)).json();
  for (const action of ['DID_CREATE', 'VC_ISSUE', 'DEMO_RESET']) assert.ok(logs.items.some((entry) => entry.action === action));
  assert.doesNotMatch(JSON.stringify(logs), /privateJwk|proofValue/);
});
