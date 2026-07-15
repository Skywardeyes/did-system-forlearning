import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionValidatingAuthenticator } from '../../src/auth/session-validating-authenticator.js';

const context = { actorId: 'user-1', tenantId: 'tenant-1', sessionId: 'session-1', credentialVersion: 2 };
const base = { authenticate: () => ({ ...context }) };

test('session authenticator accepts only active unexpired sessions at the current credential version', async () => {
  const pool = { execute: async () => [[{ status: 'active', user_status: 'active', expires_at: '2030-01-01T00:00:00.000Z', credential_version: 2, current_credential_version: 2 }]] };
  const authenticator = new SessionValidatingAuthenticator({ authenticator: base, pool, clock: () => Date.parse('2029-01-01T00:00:00.000Z') });
  assert.deepEqual(await authenticator.authenticate({}, 'request-1'), context);
});

test('session authenticator rejects revoked sessions and sessionless production tokens', async () => {
  const pool = { execute: async () => [[{ status: 'revoked', user_status: 'active', expires_at: '2030-01-01T00:00:00.000Z', credential_version: 2, current_credential_version: 2 }]] };
  await assert.rejects(() => new SessionValidatingAuthenticator({ authenticator: base, pool }).authenticate({}, 'request-1'), { code: 'AUTHENTICATION_REQUIRED' });
  const sessionless = new SessionValidatingAuthenticator({ authenticator: { authenticate: () => ({ actorId: 'user-1' }) }, pool });
  await assert.rejects(() => sessionless.authenticate({}, 'request-1'), { code: 'AUTHENTICATION_REQUIRED' });
});
