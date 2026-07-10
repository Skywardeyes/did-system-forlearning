import assert from 'node:assert/strict';
import test from 'node:test';
import { createDidPair, createFixture, issueValidCredential } from '../helpers/fixture.js';

for (const [issuerMethod, holderMethod] of [['example', 'example'], ['key', 'key'], ['example', 'key'], ['key', 'example']]) {
  test(`${issuerMethod}/${holderMethod} service integration issues and verifies a VC`, async (t) => {
    const { service } = await createFixture(t);
    const { issuer, holder } = await createDidPair(service, { issuerMethod, holderMethod });
    const record = await issueValidCredential(service, issuer, holder);
    const result = await service.verifyCredential(record.credential, { saveLog: false });
    assert.equal(result.valid, true);
    assert.deepEqual(result.checks.map((check) => check.passed), Array(7).fill(true));
  });
}

test('key rotation preserves historical VC verification and activates the new key', async (t) => {
  const { service } = await createFixture(t);
  const { issuer, holder } = await createDidPair(service);
  const oldRecord = await issueValidCredential(service, issuer, holder);
  const rotated = await service.rotateDidKey(issuer.id, { expectedVersion: 1 });
  const newRecord = await issueValidCredential(service, rotated, holder);
  assert.equal((await service.verifyCredential(oldRecord.credential, { saveLog: false })).checks.find((item) => item.key === 'signature').passed, true);
  assert.equal((await service.verifyCredential(newRecord.credential, { saveLog: false })).valid, true);
  assert.equal(rotated.keyVersion, 2);
});

test('VC lifecycle enforces legal and terminal transitions', async (t) => {
  const { service } = await createFixture(t);
  const { issuer, holder } = await createDidPair(service);
  const record = await issueValidCredential(service, issuer, holder);
  await service.suspendCredential(record.id);
  assert.equal((await service.verifyCredential(record.credential, { saveLog: false })).valid, false);
  await service.resumeCredential(record.id);
  assert.equal((await service.verifyCredential(record.credential, { saveLog: false })).valid, true);
  const replacement = await service.replaceCredential(record.id, { validUntil: '2098-12-31T00:00:00.000Z' });
  assert.equal(replacement.replaces, record.id);
  await assert.rejects(() => service.resumeCredential(record.id));
  await service.revokeCredential(replacement.id);
  await assert.rejects(() => service.suspendCredential(replacement.id));
});
