import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from '../auth/password-hasher.js';

const tokenHash = (value) => createHash('sha256').update(value).digest('hex');

export class WalletAccountService {
  constructor({ pool, repository, clock = () => Date.now() }) { this.pool = pool; this.repository = repository; this.clock = clock; }

  async register(input = {}) {
    const email = normalizeEmail(input.email); const displayName = required(input.displayName, '昵称', 120);
    const custodyMode = ['self_custody', 'managed_demo'].includes(input.custodyMode) ? input.custodyMode : 'self_custody';
    const passwordPhc = await hashPassword(input.password); const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      if (await this.repository.findByEmail(connection, email)) throw accountError('该钱包邮箱已经注册', 'ACCOUNT_ALREADY_EXISTS');
      const now = new Date(this.clock()).toISOString(); const account = { id: randomUUID(), email, displayName, passwordPhc, custodyMode, createdAt: now };
      await this.repository.create(connection, account); const response = await this.issueSession(connection, account, now);
      await connection.commit(); return response;
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }

  async login(input = {}) {
    const email = normalizeEmail(input.email); const account = await this.repository.findByEmail(this.pool, email);
    if (!account || account.status !== 'active' || !await verifyPassword(input.password, account.password_phc)) {
      throw accountError('邮箱或密码错误', 'AUTHENTICATION_REQUIRED');
    }
    return this.issueSession(this.pool, mapAccount(account), new Date(this.clock()).toISOString());
  }

  async authenticate(request) {
    const header = String(request.headers.authorization || ''); const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (token.length < 32) throw accountError('请先登录信证钱包', 'AUTHENTICATION_REQUIRED');
    const row = await this.repository.findSession(this.pool, tokenHash(token));
    if (!row) throw accountError('钱包登录已失效，请重新登录', 'AUTHENTICATION_REQUIRED');
    return { token, sessionId: row.session_id, account: publicAccount(mapAccount(row)) };
  }

  async logout(request) {
    const session = await this.authenticate(request);
    await this.repository.revokeSession(this.pool, tokenHash(session.token), new Date(this.clock()).toISOString());
    return { loggedOut: true };
  }

  async issueSession(connection, account, createdAt) {
    const token = randomBytes(32).toString('base64url'); const expiresAt = new Date(Date.parse(createdAt) + 7 * 86_400_000).toISOString();
    await this.repository.createSession(connection, { id: randomUUID(), accountId: account.id, tokenHash: tokenHash(token), createdAt, expiresAt });
    return { accessToken: token, expiresAt, account: publicAccount(account) };
  }
}

function mapAccount(row) { return { id: row.id, email: row.normalized_email || row.email, displayName: row.display_name || row.displayName,
  custodyMode: row.custody_mode || row.custodyMode, status: row.status || 'active' }; }
function publicAccount(account) { return { id: account.id, email: account.email, displayName: account.displayName, custodyMode: account.custodyMode }; }
function normalizeEmail(value) { const email = String(value || '').trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) throw accountError('请输入有效邮箱', 'EMAIL_INVALID'); return email; }
function required(value, label, maximum) { const text = String(value || '').trim(); if (!text || text.length > maximum) throw accountError(`${label}不能为空且不能超过 ${maximum} 个字符`, 'INVALID_REQUEST'); return text; }
function accountError(message, code) { const error = new Error(message); error.code = code; return error; }
