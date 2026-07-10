import assert from 'node:assert/strict';
import test from 'node:test';
import { createFixture } from '../helpers/fixture.js';

test('audited service records success, failure and correlation IDs without secrets', async (t) => {
  const { service, logService } = await createFixture(t);
  const audited = service.withAuditContext(logService, 'corr-1');
  const created = await audited.createDid({ name: 'Issuer', role: 'issuer' });
  await assert.rejects(() => audited.createDid({ name: '', role: 'issuer' }));
  const entries = (await logService.query({ pageSize: 50 })).items;
  assert.equal(entries.length, 2);
  assert.ok(entries.every((entry) => entry.correlationId === 'corr-1'));
  assert.ok(entries.some((entry) => entry.action === 'DID_CREATE' && entry.success));
  assert.ok(entries.some((entry) => entry.action === 'DID_CREATE' && !entry.success));
  assert.doesNotMatch(JSON.stringify(entries), /privateJwk|"d"\s*:/);
  assert.equal(created.name, 'Issuer');
});

test('log retention and clear summary operate on real temporary storage', async (t) => {
  const { logService } = await createFixture(t, { logLimit: 2 });
  for (const id of ['1', '2', '3']) await logService.info({ id, type: 'system', module: 'API', action: `ACTION_${id}`, success: true, message: id });
  assert.deepEqual((await logService.query({ pageSize: 50 })).items.map((entry) => entry.id), ['3', '2']);
  const summary = await logService.clear({ correlationId: 'clear-1', confirm: true });
  assert.equal(summary.action, 'LOG_CLEAR');
  assert.equal(summary.context.clearedCount, 2);
  assert.equal((await logService.query()).total, 1);
});
