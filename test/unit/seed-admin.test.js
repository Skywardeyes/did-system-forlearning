import assert from 'node:assert/strict';
import test from 'node:test';
import { seedTenantAdmin } from '../../src/seed-admin.js';

class FakeConnection {
  constructor(existing = {}) { this.existing = existing; this.events = []; this.inserts = []; }
  async beginTransaction() { this.events.push('BEGIN'); }
  async commit() { this.events.push('COMMIT'); }
  async rollback() { this.events.push('ROLLBACK'); }
  async execute(sql, params) {
    if (sql.startsWith('SELECT id FROM v2_organizations')) return [[this.existing.organization].filter(Boolean)];
    if (sql.startsWith('SELECT id FROM v2_users')) return [[this.existing.user].filter(Boolean)];
    if (sql.includes('SELECT id FROM v2_memberships')) return [[this.existing.membership].filter(Boolean)];
    this.inserts.push({ sql, params }); return [{ affectedRows: 1 }];
  }
}

test('admin seed creates organization, user and tenant-admin membership atomically', async () => {
  const connection = new FakeConnection();
  const ids = ['org-1', 'user-1', 'membership-1'];
  const result = await seedTenantAdmin(connection, { createId: () => ids.shift(), now: '2026-07-13T00:00:00.000Z' });
  assert.deepEqual(connection.events, ['BEGIN', 'COMMIT']);
  assert.equal(connection.inserts.length, 3);
  assert.deepEqual([result.organizationId, result.userId, result.membershipId], ['org-1', 'user-1', 'membership-1']);
});

test('admin seed is idempotent when all records already exist', async () => {
  const connection = new FakeConnection({ organization: { id: 'org-1' }, user: { id: 'user-1' }, membership: { id: 'membership-1' } });
  const result = await seedTenantAdmin(connection);
  assert.equal(connection.inserts.length, 0);
  assert.deepEqual(result.roles, ['tenant_admin']);
  assert.deepEqual(connection.events, ['BEGIN', 'COMMIT']);
});

test('local demo seed grants sensitive reader separately from tenant administration', async () => {
  const connection = new FakeConnection();
  const ids = ['org-1', 'user-1', 'admin-membership', 'reader-membership'];
  const result = await seedTenantAdmin(connection, { grantCredentialReader: true, createId: () => ids.shift() });
  assert.deepEqual(result.roles, ['tenant_admin', 'credential_data_reader']);
  assert.equal(connection.inserts.length, 4);
  assert.match(connection.inserts.at(-1).sql, /role_code/);
  assert.equal(connection.inserts.at(-1).params[3], 'credential_data_reader');
});

test('local demo operator roles are explicit and are not inherited from tenant admin', async () => {
  const connection = new FakeConnection();
  const ids = ['org-1', 'user-1', 'admin', 'issuer', 'holder', 'verifier'];
  const result = await seedTenantAdmin(connection, { grantDemoOperatorRoles: true, createId: () => ids.shift() });
  assert.deepEqual(result.roles, ['tenant_admin', 'issuer_operator', 'verifier_operator']);
});
