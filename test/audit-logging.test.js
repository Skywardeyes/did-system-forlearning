import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JsonStore } from '../src/store.js';
import { VcService } from '../src/vc-service.js';

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'audit-log-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const entries = [];
  const logService = {
    info: async (entry) => entries.push({ ...entry, level: 'info' }),
    warn: async (entry) => entries.push({ ...entry, level: 'warn' }),
  };
  const service = new VcService(
    new JsonStore(path.join(directory, 'store.json')),
    undefined,
    { logService, correlationId: 'request-1' },
  );
  return { service, entries };
}

test('DID 创建成功和失败均记录审计日志', async (t) => {
  const { service, entries } = await fixture(t);
  await service.createDid({ name: '机构', role: 'issuer', method: 'example' });
  await assert.rejects(() => service.createDid({ name: '', role: 'issuer' }));

  assert.deepEqual(entries.map(({ action, level, success }) => ({ action, level, success })), [
    { action: 'DID_CREATE', level: 'info', success: true },
    { action: 'DID_CREATE', level: 'warn', success: false },
  ]);
  assert.equal(entries[0].correlationId, 'request-1');
});

test('VC 签发和验签日志仅包含定位字段', async (t) => {
  const { service, entries } = await fixture(t);
  const issuer = await service.createDid({ name: '机构', role: 'issuer' });
  const holder = await service.createDid({ name: '学员', role: 'holder', method: 'key' });
  const record = await service.issueCredential({
    issuerDid: issuer.did,
    holderDid: holder.did,
    studentName: '学员',
    courseName: '课程',
    validUntil: '2099-12-31T00:00:00.000Z',
  });
  await service.verifyCredential(record.credential, { saveLog: false });

  const issue = entries.find((entry) => entry.action === 'VC_ISSUE');
  const verify = entries.find((entry) => entry.action === 'VC_VERIFY');
  assert.equal(issue.targetId, record.id);
  assert.equal(verify.targetId, record.id);
  assert.equal(JSON.stringify([issue, verify]).includes('proofValue'), false);
  assert.equal(JSON.stringify([issue, verify]).includes('credential'), false);
});

test('生命周期操作使用稳定 action', async (t) => {
  const { service, entries } = await fixture(t);
  const issuer = await service.createDid({ name: '机构', role: 'issuer' });
  const holder = await service.createDid({ name: '学员', role: 'holder' });
  await service.updateDid(issuer.id, { name: '新机构', expectedVersion: 1 });
  await service.rotateDidKey(issuer.id, { expectedVersion: 2 });
  const record = await service.issueCredential({ issuerDid: issuer.did, holderDid: holder.did, studentName: '学员', courseName: '课程', validUntil: '2099-12-31T00:00:00.000Z' });
  await service.suspendCredential(record.id);
  await service.resumeCredential(record.id);
  await service.revokeCredential(record.id);

  for (const action of ['DID_UPDATE', 'DID_ROTATE_KEY', 'VC_SUSPEND', 'VC_RESUME', 'VC_REVOKE']) {
    assert.equal(entries.some((entry) => entry.action === action && entry.success), true, action);
  }
});
