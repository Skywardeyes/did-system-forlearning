import assert from 'node:assert/strict';
import test from 'node:test';
import { JwtTokenService } from '../../src/auth/jwt-token-service.js';
import { Hs256RequestAuthenticator } from '../../src/auth/request-authenticator.js';

test('issued access token binds user, workspace, revocable session and credential version', () => {
  const secret = Buffer.alloc(32, 7); const clock = () => 1_800_000_000_000;
  const token = new JwtTokenService({ secret, clock }).issue({ userId: 'user-1', tenantId: 'personal-1', sessionId: 'session-1', credentialVersion: 3 });
  const context = new Hs256RequestAuthenticator({ secret, clock }).authenticate({ headers: { authorization: `Bearer ${token.accessToken}` } }, 'request-1');
  assert.deepEqual(context, { actorId: 'user-1', tenantId: 'personal-1', sessionId: 'session-1', credentialVersion: 3,
    requestId: 'request-1', authenticationMethod: 'jwt-hs256' });
});
