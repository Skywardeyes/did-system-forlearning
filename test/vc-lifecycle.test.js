import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JsonStore } from '../src/store.js';
import { VcService } from '../src/vc-service.js';

async function fixture(t, issuerMethod = 'example', holderMethod = 'key') {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vc-lifecycle-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const service = new VcService(new JsonStore(path.join(directory, 'store.json')));
  const issuer = await service.createDid({ name: '发行方', role: 'issuer', method: issuerMethod });
  const holder = await service.createDid({ name: '学员', role: 'holder', method: holderMethod });
  return { service, issuer, holder };
}

function issue(service, issuer, holder, overrides = {}) {
  return service.issueCredential({ issuerDid: issuer.did, holderDid: holder.did, studentName: '学员', courseName: '基础课', validUntil: '2099-01-01T00:00:00.000Z', ...overrides });
}

test('VC 暂停后失败、恢复后通过', async (t) => {
  const { service, issuer, holder } = await fixture(t);
  const record = await issue(service, issuer, holder);
  await service.suspendCredential(record.id);
  assert.equal((await service.verifyCredential(record.credential, { saveLog: false })).valid, false);
  await service.resumeCredential(record.id);
  assert.equal((await service.verifyCredential(record.credential, { saveLog: false })).valid, true);
});

test('更新 VC 生成新 ID 并保留替代关系', async (t) => {
  const { service, issuer, holder } = await fixture(t);
  const oldRecord = await issue(service, issuer, holder);
  const next = await service.replaceCredential(oldRecord.id, { courseName: '进阶课' });
  assert.notEqual(next.id, oldRecord.id);
  assert.equal(next.replaces, oldRecord.id);
  assert.equal(next.credential.credentialSubject.course, '进阶课');
  const state = await service.getState();
  assert.equal(state.credentials.find((item) => item.id === oldRecord.id).status, 'replaced');
});

test('撤销后拒绝所有后续转换', async (t) => {
  const { service, issuer, holder } = await fixture(t);
  const record = await issue(service, issuer, holder);
  await service.revokeCredential(record.id);
  await assert.rejects(() => service.suspendCredential(record.id), /不允许/);
  await assert.rejects(() => service.resumeCredential(record.id), /不允许/);
  await assert.rejects(() => service.replaceCredential(record.id, {}), /不允许/);
  await assert.rejects(() => service.revokeCredential(record.id), /不允许/);
});

test('轮换密钥后历史和新 VC 均用对应版本验签', async (t) => {
  const { service, issuer, holder } = await fixture(t, 'example', 'example');
  const oldVc = await issue(service, issuer, holder);
  const rotated = await service.rotateDidKey(issuer.id, { expectedVersion: 1 });
  const newVc = await issue(service, rotated, holder, { courseName: '新课' });
  for (const record of [oldVc, newVc]) {
    const result = await service.verifyCredential(record.credential, { saveLog: false });
    assert.equal(result.checks.find((item) => item.key === 'signature').passed, true);
    assert.equal(result.checks.find((item) => item.key === 'keyVersion').passed, true);
  }
});

test('Issuer 停用后历史 VC 签名有效但整体无效', async (t) => {
  const { service, issuer, holder } = await fixture(t, 'example', 'key');
  const record = await issue(service, issuer, holder);
  await service.deactivateDid(issuer.id, { expectedVersion: 1 });
  const result = await service.verifyCredential(record.credential, { saveLog: false });
  assert.equal(result.valid, false);
  assert.equal(result.checks.find((item) => item.key === 'signature').passed, true);
  assert.equal(result.checks.find((item) => item.key === 'didStatus').passed, false);
});

test('停用的 Issuer 或 Holder 不得参与新签发', async (t) => {
  const { service, issuer, holder } = await fixture(t, 'example', 'example');
  await service.deactivateDid(holder.id, { expectedVersion: 1 });
  await assert.rejects(() => issue(service, issuer, holder), /Holder DID 已停用/);
});
