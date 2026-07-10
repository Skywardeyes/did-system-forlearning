import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JsonStore } from '../src/store.js';
import { VcService } from '../src/vc-service.js';

async function lab(t, issuerMethod = 'example', holderMethod = 'example') {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lifecycle-e2e-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const service = new VcService(new JsonStore(path.join(dir, 'store.json')));
  const issuer = await service.createDid({ name: '机构', role: 'issuer', method: issuerMethod });
  const holder = await service.createDid({ name: '学员', role: 'holder', method: holderMethod });
  return { service, issuer, holder };
}

const issue = (service, issuer, holder, courseName = '课程') => service.issueCredential({ issuerDid: issuer.did, holderDid: holder.did, studentName: '学员', courseName, validUntil: '2099-01-01T00:00:00.000Z' });

test('E2E-01 两个 example DID 完成签发验签', async (t) => {
  const x = await lab(t); const vc = await issue(x.service, x.issuer, x.holder);
  assert.equal((await x.service.verifyCredential(vc.credential, { saveLog: false })).valid, true);
});

test('E2E-02 两个 key DID 完成签发验签且无生命周期能力', async (t) => {
  const x = await lab(t, 'key', 'key'); const vc = await issue(x.service, x.issuer, x.holder);
  assert.equal((await x.service.verifyCredential(vc.credential, { saveLog: false })).valid, true);
  assert.equal(x.issuer.capabilities.rotateKey, false);
});

test('E2E-03 两种混合 Issuer/Holder 组合均通过', async (t) => {
  for (const methods of [['example', 'key'], ['key', 'example']]) {
    const x = await lab(t, ...methods); const vc = await issue(x.service, x.issuer, x.holder, methods.join('-'));
    assert.equal((await x.service.verifyCredential(vc.credential, { saveLog: false })).valid, true);
  }
});

test('E2E-04 example 轮换密钥后新旧 VC 均验签', async (t) => {
  const x = await lab(t); const oldVc = await issue(x.service, x.issuer, x.holder);
  const rotated = await x.service.rotateDidKey(x.issuer.id, { expectedVersion: 1 });
  const newVc = await issue(x.service, rotated, x.holder, '新课');
  for (const vc of [oldVc, newVc]) assert.equal((await x.service.verifyCredential(vc.credential, { saveLog: false })).valid, true);
});

test('E2E-05 暂停失败、恢复成功、撤销后不可恢复', async (t) => {
  const x = await lab(t); const vc = await issue(x.service, x.issuer, x.holder);
  await x.service.suspendCredential(vc.id); assert.equal((await x.service.verifyCredential(vc.credential, { saveLog: false })).valid, false);
  await x.service.resumeCredential(vc.id); assert.equal((await x.service.verifyCredential(vc.credential, { saveLog: false })).valid, true);
  await x.service.revokeCredential(vc.id); await assert.rejects(() => x.service.resumeCredential(vc.id), /不允许/);
});

test('E2E-06 DID 停用后禁止签发且历史签名仍有效', async (t) => {
  const x = await lab(t); const vc = await issue(x.service, x.issuer, x.holder);
  await x.service.deactivateDid(x.issuer.id, { expectedVersion: 1 });
  await assert.rejects(() => issue(x.service, x.issuer, x.holder), /Issuer DID 已停用/);
  const result = await x.service.verifyCredential(vc.credential, { saveLog: false });
  assert.equal(result.valid, false); assert.equal(result.checks.find((c) => c.key === 'signature').passed, true);
});
