import assert from 'node:assert/strict';
import test from 'node:test';
import { completeDidCreation, renderDidCard } from '../public/did-ui.js';

test('DID 创建完成后使用稳定表单引用重置、刷新并显示完整 DID', async () => {
  const calls = [];
  const form = { reset: () => calls.push('reset') };
  const created = { did: 'did:key:z6MkCreated', role: 'issuer' };

  const result = await completeDidCreation({
    form,
    body: { name: '可信学习中心', role: 'issuer' },
    api: async (path, options) => {
      calls.push([path, JSON.parse(options.body)]);
      await Promise.resolve();
      return created;
    },
    refresh: async () => calls.push('refresh'),
    notify: (message) => calls.push(message),
  });

  assert.equal(result, created);
  assert.deepEqual(calls, [
    ['/api/dids', { name: '可信学习中心', role: 'issuer' }],
    'reset',
    'refresh',
    'DID 身份创建成功：did:key:z6MkCreated',
  ]);
});

test('身份卡片展示完整 DID、公钥 JWK 和 DID Document 入口但不展示私钥', () => {
  const item = {
    id: 'identity-1',
    name: '可信学习中心',
    role: 'issuer',
    did: 'did:key:z6MkCompleteIdentifier',
    createdAt: '2026-07-10T00:00:00.000Z',
    publicJwk: { kty: 'OKP', crv: 'Ed25519', x: 'public-x' },
    privateJwk: { d: 'must-not-render' },
  };

  const html = renderDidCard(item, {
    escapeHtml: (value) => String(value).replaceAll('"', '&quot;'),
    formatDate: () => '2026/7/10',
  });

  assert.match(html, /did:key:z6MkCompleteIdentifier/);
  assert.match(html, /&quot;kty&quot;: &quot;OKP&quot;/);
  assert.match(html, /data-document="identity-1"/);
  assert.doesNotMatch(html, /must-not-render|privateJwk/);
});
