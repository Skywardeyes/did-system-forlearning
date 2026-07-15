import assert from 'node:assert/strict';
import test from 'node:test';
import { HolderOrganizationRequestService } from '../../src/services/holder-organization-request-service.js';

test('wallet sends a signed Holder DID request and organization accepts it', async () => {
  let stored = null; let linked = null;
  const repository = {
    async listApprovedOrganizations() { return [{ id: 'org-1', name: '示例大学', slug: 'school' }]; },
    async findPending() { return null; },
    async create(_pool, value) { stored = { ...value, status: 'pending' }; return true; },
    async listForOrganization() { return [stored]; },
    async findForOrganization() { return stored; },
    async decide(_pool, _id, _org, _actor, status) { stored.status = status; return true; },
  };
  const holderDidDirectoryService = {
    async registerFromWallet() { return { did: 'did:key:zholder', displayName: '学生钱包' }; },
    async linkToOrganization(context, input) { linked = { context, input }; return { did: input.did }; },
  };
  const service = new HolderOrganizationRequestService({ pool: {}, repository, holderDidDirectoryService });
  assert.equal((await service.listOrganizations()).items[0].name, '示例大学');
  const submitted = await service.submit({ id: 'wallet-1' }, { organizationId: 'org-1', message: '申请毕业证明', registration: {} });
  assert.equal(submitted.status, 'pending');
  const accepted = await service.decide({ tenantId: 'org-1', actorId: 'issuer-1' }, submitted.id, 'accepted');
  assert.equal(accepted.status, 'accepted');
  assert.equal(linked.input.did, 'did:key:zholder');
});
