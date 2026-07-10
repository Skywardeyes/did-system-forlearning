import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JsonStore } from '../src/store.js';
import { VcService } from '../src/vc-service.js';

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'did-lifecycle-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const service = new VcService(new JsonStore(path.join(directory, 'store.json')));
  const issuer = await service.createDid({ name: '测试发行方', role: 'issuer' });
  return { service, issuer };
}

test('新建 DID 初始化为 active 且版本为 1', async (t) => {
  const { issuer } = await fixture(t);

  assert.equal(issuer.status, 'active');
  assert.equal(issuer.version, 1);
  assert.equal(issuer.deactivatedAt, null);
  assert.deepEqual(issuer.keyHistory, []);
});

test('DID 可更新名称和服务地址', async (t) => {
  const { service, issuer } = await fixture(t);
  const updated = await service.updateDid(issuer.id, {
    name: '新名称',
    serviceEndpoint: 'https://example.test/did',
    expectedVersion: 1,
  });

  assert.equal(updated.name, '新名称');
  assert.equal(updated.serviceEndpoint, 'https://example.test/did');
  assert.equal(updated.version, 2);
  assert.equal(updated.document.service[0].serviceEndpoint, 'https://example.test/did');
});

test('DID 版本不匹配时拒绝并发更新', async (t) => {
  const { service, issuer } = await fixture(t);
  await service.updateDid(issuer.id, { name: '第一次更新', expectedVersion: 1 });

  await assert.rejects(
    () => service.updateDid(issuer.id, { name: '过期更新', expectedVersion: 1 }),
    /DID 版本冲突/,
  );
});

test('DID 密钥轮换保留历史公钥但公开数据不泄露历史私钥', async (t) => {
  const { service, issuer } = await fixture(t);
  const rotated = await service.rotateDidKey(issuer.id, { expectedVersion: 1 });

  assert.equal(rotated.version, 2);
  assert.notDeepEqual(rotated.publicJwk, issuer.publicJwk);
  assert.equal(rotated.keyHistory.length, 1);
  assert.deepEqual(rotated.keyHistory[0].publicJwk, issuer.publicJwk);
  assert.equal('privateJwk' in rotated.keyHistory[0], false);
});

test('DID 停用不可逆并禁止继续更新或轮换', async (t) => {
  const { service, issuer } = await fixture(t);
  const stopped = await service.deactivateDid(issuer.id, { expectedVersion: 1 });

  assert.equal(stopped.status, 'deactivated');
  assert.equal(stopped.version, 2);
  assert.ok(stopped.deactivatedAt);
  await assert.rejects(() => service.updateDid(issuer.id, { name: '禁止更新', expectedVersion: 2 }), /DID 已停用/);
  await assert.rejects(() => service.rotateDidKey(issuer.id, { expectedVersion: 2 }), /DID 已停用/);
  await assert.rejects(() => service.deactivateDid(issuer.id, { expectedVersion: 2 }), /DID 已停用/);
});

test('did:key 由 Ed25519 公钥生成并声明不支持生命周期操作', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'did-key-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const service = new VcService(new JsonStore(path.join(directory, 'store.json')));
  const holder = await service.createDid({ name: '密钥持有人', role: 'holder', method: 'key' });

  assert.match(holder.did, /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
  assert.equal(holder.method, 'key');
  assert.deepEqual(holder.capabilities, { update: false, rotateKey: false, deactivate: false });
  await assert.rejects(() => service.updateDid(holder.id, { name: '新名称', expectedVersion: 1 }), /did:key 不支持更新/);
  await assert.rejects(() => service.rotateDidKey(holder.id, { expectedVersion: 1 }), /did:key 不支持密钥轮换/);
  await assert.rejects(() => service.deactivateDid(holder.id, { expectedVersion: 1 }), /did:key 不支持停用/);
});

test('未知 DID Method 必须明确失败', async (t) => {
  const { service } = await fixture(t);
  await assert.rejects(() => service.createDid({ name: '未知', role: 'holder', method: 'web' }), /不支持的 DID Method/);
});
