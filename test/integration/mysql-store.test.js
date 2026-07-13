import assert from 'node:assert/strict';
import test from 'node:test';
import { MySqlStore } from '../../src/mysql-store.js';
import { createEnvelopeCrypto } from '../../src/envelope-crypto.js';

class FakeConnection {
  events = [];
  rows = { dids: [], credentials: [], verification_logs: [], disclosure_verification_logs: [] };
  async beginTransaction() { this.events.push('BEGIN'); }
  async commit() { this.events.push('COMMIT'); }
  async rollback() { this.events.push('ROLLBACK'); }
  release() { this.events.push('RELEASE'); }
  async execute(sql, params = []) {
    this.events.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
    const select = /FROM\s+(dids|credentials|verification_logs|disclosure_verification_logs)/i.exec(sql);
    if (select) return [this.rows[select[1]]];
    const del = /DELETE FROM\s+(dids|credentials|verification_logs|disclosure_verification_logs)/i.exec(sql);
    if (del) this.rows[del[1]] = [];
    const insert = /INSERT INTO\s+(dids|credentials|verification_logs|disclosure_verification_logs)/i.exec(sql);
    if (insert) this.rows[insert[1]].push({ id: params[0], payload: params[1] });
    return [{ affectedRows: 1 }];
  }
}

test('transactional update persists state collections', async () => {
  const connection = new FakeConnection();
  const store = new MySqlStore({ getConnection: async () => connection, execute: (...args) => connection.execute(...args) });
  await store.update((state) => state.dids.push({ id: 'did-1', name: 'Issuer' }));
  assert.deepEqual((await store.load()).dids, [{ id: 'did-1', name: 'Issuer' }]);
  assert.equal(connection.events.includes('COMMIT'), true);
});

test('rolls back failed updates', async () => {
  const connection = new FakeConnection();
  const store = new MySqlStore({ getConnection: async () => connection, execute: (...args) => connection.execute(...args) });
  await assert.rejects(() => store.update(() => { throw new Error('stop'); }), /stop/);
  assert.equal(connection.events.includes('ROLLBACK'), true);
});

test('encrypts DID private keys and credential records before persistence', async () => {
  const connection = new FakeConnection();
  const envelope = createEnvelopeCrypto({ keys: new Map([['v1', Buffer.alloc(32, 4)]]), activeKeyId: 'v1' });
  const store = new MySqlStore({ getConnection: async () => connection, execute: (...args) => connection.execute(...args) }, { envelopeCrypto: envelope });
  await store.update((state) => {
    state.dids.push({ id: 'did-1', privateJwk: { d: 'PRIVATE-D-7F29' } });
    state.credentials.push({ id: 'vc-1', credential: { credentialSubject: { name: 'PRIVATE-STUDENT-7F29' } } });
  });
  assert.doesNotMatch(JSON.stringify(connection.rows), /PRIVATE-D-7F29|PRIVATE-STUDENT-7F29/);
  const loaded = await store.load();
  assert.equal(loaded.dids[0].privateJwk.d, 'PRIVATE-D-7F29');
  assert.equal(loaded.credentials[0].credential.credentialSubject.name, 'PRIVATE-STUDENT-7F29');
});
