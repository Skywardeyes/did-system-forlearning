import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalSessionService } from '../../src/services/local-session-service.js';
import { Hs256RequestAuthenticator } from '../../src/auth/request-authenticator.js';

test('local session issues a short-lived token for the seeded active membership', async () => {
  const secret = Buffer.alloc(32, 7);
  const pool = { async execute(_sql, params) {
    assert.deepEqual(params, ['本地演示组织', 'local-admin']);
    return [[{ tenant_id: 'tenant-1', tenant_name: '本地演示组织', actor_id: 'actor-1',
      external_subject: 'local-admin', role_code: 'tenant_admin' }]];
  } };
  const service = new LocalSessionService({ pool, secret, enabled: true, ttlSeconds: 60 });
  const session = await service.issue();
  const context = new Hs256RequestAuthenticator({ secret }).authenticate(
    { headers: { authorization: `Bearer ${session.accessToken}` } }, 'request-1',
  );
  assert.equal(context.tenantId, 'tenant-1');
  assert.equal(context.actorId, 'actor-1');
  assert.deepEqual(session.roles, ['tenant_admin']);
});

test('local session is unavailable unless explicitly enabled', async () => {
  const service = new LocalSessionService({ pool: {}, secret: Buffer.alloc(32), enabled: false });
  await assert.rejects(() => service.issue(), (error) => error.code === 'NOT_FOUND');
});
