import assert from 'node:assert/strict';
import test from 'node:test';
import { createEnvelopeCrypto } from '../../src/envelope-crypto.js';
import { V2AuditLogStore } from '../../src/repositories/v2-audit-log-store.js';

class FakePool {
  constructor() { this.queries = []; this.encryptedRow = null; }
  async execute(sql, params = []) {
    this.queries.push({ sql, params });
    if (sql.includes('INSERT IGNORE INTO v2_audit_logs')) { this.encryptedRow = { id: params[0], encrypted_payload: params[9] }; return [{ affectedRows: 1 }]; }
    if (sql.includes('SELECT cutoff_sequence')) return [[]];
    if (sql.includes('SELECT id, encrypted_payload')) return [[this.encryptedRow].filter(Boolean)];
    if (sql.includes('COALESCE(MAX(sequence_id)')) return [[{ cutoff_sequence: 1 }]];
    return [{ affectedRows: 1 }];
  }
}

test('V2 audit store encrypts complete log payload and clears through an append-only cutoff', async () => {
  const pool = new FakePool();
  const envelopeCrypto = createEnvelopeCrypto({ keys: new Map([['v1', Buffer.alloc(32, 4)]]), activeKeyId: 'v1' });
  const store = new V2AuditLogStore(pool, { envelopeCrypto });
  const entry = { id: '11111111-1111-4111-8111-111111111111', occurredAt: '2026-07-13T00:00:00.000Z',
    correlationId: '22222222-2222-4222-8222-222222222222', type: 'audit', level: 'info', module: 'DID', action: 'CREATE', success: true,
    message: 'Private target name', context: { target: 'Alice' } };
  await store.append(entry);
  assert.doesNotMatch(JSON.stringify(pool.queries[0].params), /Private target name|Alice/);
  assert.deepEqual(await store.load(), [entry]);
  await store.replace([]);
  assert.equal(pool.queries.some(({ sql }) => /DELETE|UPDATE/.test(sql)), false);
  assert.equal(pool.queries.some(({ sql }) => sql.includes('v2_audit_log_clear_events')), true);
});
