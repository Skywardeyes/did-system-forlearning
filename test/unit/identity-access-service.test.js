import assert from 'node:assert/strict';
import test from 'node:test';
import { IdentityAccessService } from '../../src/services/identity-access-service.js';

test('workspace switching returns a complete session including the current actor', async () => {
  const workspace = { id: 'organization-1', name: 'Test School', type: 'organization', roles: ['tenant_admin'] };
  const repository = {
    listWorkspaces: async () => [workspace],
    findUserById: async () => ({ id: 'user-1', display_name: 'School Owner', email: 'owner@example.test', status: 'active' }),
  };
  const tokenService = { issue: (claims) => ({ accessToken: 'switched-token', expiresAt: '2099-01-01T00:00:00.000Z', claims }) };
  const service = new IdentityAccessService({ pool: {}, repository, tokenService });

  const result = await service.switchWorkspace({ actorId: 'user-1', sessionId: 'session-1', credentialVersion: 1 }, workspace.id);

  assert.deepEqual(result.actor, { id: 'user-1', displayName: 'School Owner', email: 'owner@example.test' });
  assert.equal(result.tenant, workspace);
  assert.deepEqual(result.roles, ['tenant_admin']);
  assert.equal(result.claims.tenantId, workspace.id);
});
