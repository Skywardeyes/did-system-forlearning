import assert from 'node:assert/strict';
import test from 'node:test';
import { bootstrap } from '../../src/bootstrap.js';

test('rejects missing production configuration', async () => {
  await assert.rejects(() => bootstrap({}), { code: 'CONFIG_INVALID' });
});

test('sanitizes database connection failures', async () => {
  const env = { DB_HOST: 'localhost', DB_NAME: 'did', DB_USER: 'app', DB_PASSWORD: 'DO-NOT-LEAK', KMS_MASTER_KEY: Buffer.alloc(32).toString('base64') };
  await assert.rejects(() => bootstrap(env, { createPool: () => ({ execute: async () => { throw new Error('connect failed DO-NOT-LEAK'); }, end: async () => {} }) }),
    (error) => error.code === 'DATABASE_UNAVAILABLE' && !error.message.includes('DO-NOT-LEAK'));
});
