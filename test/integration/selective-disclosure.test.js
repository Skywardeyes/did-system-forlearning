import assert from 'node:assert/strict';
import test from 'node:test';
import { createDidPair, createFixture, issueValidCredential } from '../helpers/fixture.js';

test('service creates a partial presentation without undisclosed values and verifies it', async (t) => {
  const { service, store } = await createFixture(t);
  const { issuer, holder } = await createDidPair(service);
  const record = await issueValidCredential(service, issuer, holder, { studentName: 'Alice', courseName: 'Selective Course' });

  assert.equal(record.selectiveDisclosureAvailable, true);
  assert.equal('disclosureMaterial' in record, false);
  const persisted = await store.load();
  assert.ok(persisted.credentials[0].disclosureMaterial.claims['credentialSubject.name'].salt);

  const presentation = await service.createDisclosurePresentation(record.id, ['credentialSubject.course', 'credentialSubject.completionDate']);
  const serialized = JSON.stringify(presentation);
  assert.match(serialized, /Selective Course/);
  assert.doesNotMatch(serialized, /Alice/);
  assert.equal(presentation.disclosedClaims.length, 2);
  assert.equal((await service.verifyDisclosurePresentation(presentation)).valid, true);

  const tampered = structuredClone(presentation);
  tampered.disclosedClaims[0].value = 'Tampered Course';
  const result = await service.verifyDisclosurePresentation(tampered);
  assert.equal(result.valid, false);
  assert.equal(result.checks.find((item) => item.key === 'disclosedClaims').passed, false);
  const ledger = await service.listDisclosureVerificationLogs({ page: 1, pageSize: 10 });
  assert.equal(ledger.total, 2);
  assert.equal(ledger.items[0].valid, false);
  assert.deepEqual(ledger.items[0].disclosedPaths, ['credentialSubject.course', 'credentialSubject.completionDate']);
  assert.ok(ledger.items[0].failedChecks.includes('disclosedClaims'));
});

test('disclosure verification follows issuer key history and credential lifecycle', async (t) => {
  const { service } = await createFixture(t);
  const { issuer, holder } = await createDidPair(service);
  const record = await issueValidCredential(service, issuer, holder);
  const presentation = await service.createDisclosurePresentation(record.id, ['credentialSubject.course']);

  await service.rotateDidKey(issuer.id, { expectedVersion: issuer.version });
  assert.equal((await service.verifyDisclosurePresentation(presentation)).valid, true);
  await service.revokeCredential(record.id);
  const revoked = await service.verifyDisclosurePresentation(presentation);
  assert.equal(revoked.valid, false);
  assert.equal(revoked.checks.find((item) => item.key === 'credentialStatus').passed, false);
});

test('service rejects empty, unsupported and legacy disclosure requests', async (t) => {
  const { service, store } = await createFixture(t);
  const { issuer, holder } = await createDidPair(service);
  const record = await issueValidCredential(service, issuer, holder);
  await assert.rejects(() => service.createDisclosurePresentation(record.id, []), /至少选择/);
  await assert.rejects(() => service.createDisclosurePresentation(record.id, ['credentialSubject.id']), /不允许披露/);
  const state = await store.load();
  delete state.credentials[0].disclosureMaterial;
  await store.save(state);
  await assert.rejects(() => service.createDisclosurePresentation(record.id, ['credentialSubject.course']), /重新签发/);
});
