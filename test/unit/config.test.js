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
  assert.equal(config.auth.enabled, false);
  assert.equal(config.auth.localDevLogin, false);
  assert.equal(config.application.dataMode, 'dual');
  assert.equal(config.security.requireHttps, false);
});

test('production mode requires V2, TLS, database TLS and forbids local login', () => {
  const secret = Buffer.alloc(32, 8).toString('base64');
  assert.throws(() => loadRuntimeConfig(validEnv({ NODE_ENV: 'production', AUTH_JWT_HS256_SECRET: secret })), /APP_DATA_MODE=v2/);
  assert.throws(() => loadRuntimeConfig(validEnv({ NODE_ENV: 'production', APP_DATA_MODE: 'v2', AUTH_JWT_HS256_SECRET: secret })), /REQUIRE_HTTPS/);
  assert.throws(() => loadRuntimeConfig(validEnv({ NODE_ENV: 'production', APP_DATA_MODE: 'v2', AUTH_JWT_HS256_SECRET: secret,
    REQUIRE_HTTPS: 'true' })), /DB_SSL/);
  assert.throws(() => loadRuntimeConfig(validEnv({ NODE_ENV: 'production', APP_DATA_MODE: 'v2', AUTH_JWT_HS256_SECRET: secret,
    REQUIRE_HTTPS: 'true', DB_SSL: 'true', AUTH_LOCAL_DEV_LOGIN: 'true' })), /forbids/);
  const config = loadRuntimeConfig(validEnv({ NODE_ENV: 'production', APP_DATA_MODE: 'v2', AUTH_JWT_HS256_SECRET: secret,
    REQUIRE_HTTPS: 'true', DB_SSL: 'true' }));
  assert.equal(config.security.production, true);
});

test('local development login is explicit and requires a JWT secret', () => {
  assert.throws(() => loadRuntimeConfig(validEnv({ AUTH_LOCAL_DEV_LOGIN: 'true' })), /requires AUTH/);
  const config = loadRuntimeConfig(validEnv({ AUTH_LOCAL_DEV_LOGIN: 'true', AUTH_JWT_HS256_SECRET: Buffer.alloc(32, 8).toString('base64') }));
  assert.equal(config.auth.localDevLogin, true);
});

test('validates V1, dual and V2 data modes with a V2 authentication guard', () => {
  assert.equal(loadRuntimeConfig(validEnv({ APP_DATA_MODE: 'v1' })).application.dataMode, 'v1');
  assert.throws(() => loadRuntimeConfig(validEnv({ APP_DATA_MODE: 'v2' })), /requires AUTH/);
  assert.equal(loadRuntimeConfig(validEnv({ APP_DATA_MODE: 'v2', AUTH_JWT_HS256_SECRET: Buffer.alloc(32, 8).toString('base64') })).application.dataMode, 'v2');
  assert.throws(() => loadRuntimeConfig(validEnv({ APP_DATA_MODE: 'unknown' })), /v1, dual or v2/);
});

test('accepts an optional production JWT authentication secret with safe length validation', () => {
  const config = loadRuntimeConfig(validEnv({ AUTH_JWT_HS256_SECRET: Buffer.alloc(32, 8).toString('base64') }));
  assert.equal(config.auth.enabled, true);
  assert.equal(config.auth.jwtHs256Secret.length, 32);
  assert.throws(() => loadRuntimeConfig(validEnv({ AUTH_JWT_HS256_SECRET: Buffer.alloc(31, 8).toString('base64') })), /at least 32 bytes/);
});
