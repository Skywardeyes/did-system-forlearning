import { sqlDate } from './sql-values.js';

export class WalletAccountRepository {
  async findByEmail(connection, email) {
    const [rows] = await connection.execute('SELECT * FROM v2_wallet_accounts WHERE normalized_email = ?', [email]);
    return rows[0] || null;
  }
  async create(connection, record) {
    await connection.execute(`INSERT INTO v2_wallet_accounts
      (id, normalized_email, display_name, password_phc, custody_mode, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
    [record.id, record.email, record.displayName, record.passwordPhc, record.custodyMode, sqlDate(record.createdAt), sqlDate(record.createdAt)]);
  }
  async createSession(connection, session) {
    await connection.execute(`INSERT INTO v2_wallet_sessions
      (id, account_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
    [session.id, session.accountId, session.tokenHash, sqlDate(session.createdAt), sqlDate(session.expiresAt)]);
  }
  async findSession(connection, tokenHash) {
    const [rows] = await connection.execute(`SELECT sessions.id AS session_id, accounts.*
      FROM v2_wallet_sessions AS sessions INNER JOIN v2_wallet_accounts AS accounts ON accounts.id = sessions.account_id
      WHERE sessions.token_hash = ? AND sessions.revoked_at IS NULL AND sessions.expires_at > UTC_TIMESTAMP(3)
        AND accounts.status = 'active'`, [tokenHash]);
    return rows[0] || null;
  }
  async revokeSession(connection, tokenHash, at) {
    await connection.execute('UPDATE v2_wallet_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL', [sqlDate(at), tokenHash]);
  }
}
