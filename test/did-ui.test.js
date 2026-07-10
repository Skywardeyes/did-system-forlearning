import assert from 'node:assert/strict';
import test from 'node:test';
import { completeDidCreation } from '../public/did-ui.js';

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
