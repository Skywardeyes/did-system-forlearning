import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JsonStore } from '../src/store.js';
import { VcService } from '../src/vc-service.js';

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'did-vc-lab-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const service = new VcService(new JsonStore(path.join(directory, 'store.json')));
  const issuer = await service.createDid({ name: '测试发行方', role: 'issuer' });
  const holder = await service.createDid({ name: '测试学员', role: 'holder' });
  return { service, issuer, holder };
}

async function issue(service, issuer, holder, overrides = {}) {
  return service.issueCredential({
    issuerDid: issuer.did,
    holderDid: holder.did,
    studentName: '测试学员',
    courseName: 'DID 与 VC 入门',
    completionDate: '2026-07-10',
    validUntil: '2099-12-31T23:59:59.000Z',
    ...overrides,
  });
}

test('创建 DID 时公开数据不包含私钥，DID Document 可用于验证', async (t) => {
  const { service, issuer } = await fixture(t);
  const state = await service.getState();

  assert.match(issuer.did, /^did:example:[0-9a-f-]{36}$/);
  assert.equal('privateJwk' in issuer, false);
  assert.equal('privateJwk' in state.dids[0], false);
  assert.equal(issuer.document.id, issuer.did);
  assert.equal(issuer.document.assertionMethod.length, 1);
});

test('原始 VC 的全部验证项通过', async (t) => {
  const { service, issuer, holder } = await fixture(t);
  const record = await issue(service, issuer, holder);
  const result = await service.verifyCredential(record.credential, { saveLog: false });

  assert.equal(result.valid, true);
  assert.deepEqual(result.checks.map((check) => check.passed), [true, true, true, true, true, true, true]);
});

test('篡改学员姓名或课程名称后签名验证失败', async (t) => {
  const { service, issuer, holder } = await fixture(t);
  const record = await issue(service, issuer, holder);

  for (const field of ['name', 'course']) {
    const tampered = structuredClone(record.credential);
    tampered.credentialSubject[field] = '被篡改的内容';
    const result = await service.verifyCredential(tampered, { saveLog: false });
    assert.equal(result.valid, false);
    assert.equal(result.checks.find((check) => check.key === 'signature').passed, false);
  }
});

test('Issuer DID 不存在时验证失败', async (t) => {
  const { service, issuer, holder } = await fixture(t);
  const record = await issue(service, issuer, holder);
  const credential = structuredClone(record.credential);
  credential.issuer = 'did:key:zUnknownIssuer';
  const result = await service.verifyCredential(credential, { saveLog: false });

  assert.equal(result.valid, false);
  assert.equal(result.checks.find((check) => check.key === 'issuer').passed, false);
});

test('超过有效期的凭证验证失败', async (t) => {
  const { service, issuer, holder } = await fixture(t);
  await assert.rejects(
    () => issue(service, issuer, holder, { validUntil: '2020-01-01T00:00:00.000Z' }),
    /有效期必须晚于生效时间/,
  );
});

test('撤销后的原始凭证验证失败', async (t) => {
  const { service, issuer, holder } = await fixture(t);
  const record = await issue(service, issuer, holder);
  await service.revokeCredential(record.id);
  const result = await service.verifyCredential(record.credential, { saveLog: false });

  assert.equal(result.valid, false);
  assert.equal(result.checks.find((check) => check.key === 'credentialStatus').passed, false);
  assert.equal(result.checks.find((check) => check.key === 'signature').passed, true);
});
