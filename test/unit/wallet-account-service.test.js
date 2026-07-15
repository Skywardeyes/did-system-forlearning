import assert from 'node:assert/strict';
import test from 'node:test';
import { WalletAccountService } from '../../src/services/wallet-account-service.js';

test('Holder wallet account is separate and records the selected custody mode', async () => {
  const accounts = new Map(); const sessions = new Map();
  const connection = { async beginTransaction() {}, async commit() {}, async rollback() {}, release() {} };
  const pool = { async getConnection() { return connection; } };
  const repository = {
    async findByEmail(_connection, email) { return accounts.get(email) || null; },
    async create(_connection, record) { accounts.set(record.email, { id: record.id, normalized_email: record.email,
      display_name: record.displayName, password_phc: record.passwordPhc, custody_mode: record.custodyMode, status: 'active' }); },
    async createSession(_connection, session) { sessions.set(session.tokenHash, session); },
    async findSession(_connection, hash) { const session = sessions.get(hash); if (!session) return null; const account = [...accounts.values()].find((item) => item.id === session.accountId); return { session_id: session.id, ...account }; },
    async revokeSession(_connection, hash) { sessions.delete(hash); },
  };
  const service = new WalletAccountService({ pool, repository, clock: () => Date.parse('2026-07-15T00:00:00Z') });
  const generatedPassword = `Wallet-${Date.now()}-A1`;
  const registered = await service.register({ displayName: '学生', email: 'Student@Example.test', password: generatedPassword, custodyMode: 'managed_demo' });
  assert.equal(registered.account.email, 'student@example.test');
  assert.equal(registered.account.custodyMode, 'managed_demo');
  const request = { headers: { authorization: `Bearer ${registered.accessToken}` } };
  assert.equal((await service.authenticate(request)).account.displayName, '学生');
  await service.logout(request);
  await assert.rejects(() => service.authenticate(request), { code: 'AUTHENTICATION_REQUIRED' });
});
