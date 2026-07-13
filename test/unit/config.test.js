import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRuntimeConfig } from '../../src/config.js';

const validEnv = (overrides = {}) => ({
  DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_NAME: 'did_vc', DB_USER: 'did_app',
  DB_PASSWORD: 'secret', DB_SSL: 'false',
  KMS_MASTER_KEY: Buffer.alloc(32, 7).toString('base64'), KMS_MASTER_KEY_ID: 'local-master-v1',
  ...overrides,
});

test('rejects missing database configuration without exposing values', () => {
  assert.throws(() => loadRuntimeConfig({}), (error) => error.code === 'CONFIG_INVALID' && /DB_HOST/.test(error.message));
});

test('rejects a master key that is not 32 bytes', () => {
  assert.throws(() => loadRuntimeConfig(validEnv({ KMS_MASTER_KEY: Buffer.alloc(31).toString('base64') })), /32 bytes/);
});

test('returns typed database and kms configuration', () => {
  const config = loadRuntimeConfig(validEnv());
  assert.equal(config.database.port, 3306);
  assert.equal(config.database.ssl, false);
  assert.equal(config.kms.masterKey.length, 32);
});
