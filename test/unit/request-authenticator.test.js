import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { AuthenticationError, Hs256RequestAuthenticator } from '../../src/auth/request-authenticator.js';

const secret = Buffer.alloc(32, 7);
function token(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

test('HS256 request authentication creates a tenant-scoped request context', () => {
  const authenticator = new Hs256RequestAuthenticator({ secret, clock: () => 1_000 });
  const request = { headers: { authorization: `Bearer ${token({ sub: 'user-1', tenant_id: 'tenant-1', exp: 2 })}` } };
  assert.deepEqual(authenticator.authenticate(request, 'request-1'), {
    actorId: 'user-1', tenantId: 'tenant-1', requestId: 'request-1', authenticationMethod: 'jwt-hs256',
  });
});

test('HS256 request authentication rejects absent, modified and expired tokens', () => {
  const authenticator = new Hs256RequestAuthenticator({ secret, clock: () => 3_000 });
  assert.throws(() => authenticator.authenticate({ headers: {} }, 'request-1'), AuthenticationError);
  const expired = token({ sub: 'user-1', tenant_id: 'tenant-1', exp: 2 });
  assert.throws(() => authenticator.authenticate({ headers: { authorization: `Bearer ${expired}` } }, 'request-1'), /expired/);
  const valid = token({ sub: 'user-1', tenant_id: 'tenant-1', exp: 4 });
  assert.throws(() => authenticator.authenticate({ headers: { authorization: `Bearer ${valid.slice(0, -1)}x` } }, 'request-1'), /signature/);
});
