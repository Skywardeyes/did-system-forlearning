import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { loadRuntimeConfig } from './config.js';

export async function grantPlatformAdmin(connection, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('A valid account email is required');
  const [rows] = await connection.execute(
    `SELECT users.id FROM v2_local_accounts AS accounts
     INNER JOIN v2_users AS users ON users.id = accounts.user_id
     WHERE accounts.normalized_email = ? AND users.status = 'active'`, [normalizedEmail],
  );
  if (!rows[0]) { const error = new Error('The unified account was not found'); error.code = 'NOT_FOUND'; throw error; }
  const now = new Date();
  await connection.execute(
    `INSERT INTO v2_platform_roles (id, user_id, role_code, status, created_at, updated_at)
     VALUES (?, ?, 'platform_admin', 'active', ?, ?)
     ON DUPLICATE KEY UPDATE status = 'active', updated_at = VALUES(updated_at)`, [randomUUID(), rows[0].id, now, now],
  );
  return { userId: rows[0].id, role: 'platform_admin' };
}

async function main() {
  const config = loadRuntimeConfig(process.env); const connection = await mysql.createConnection(config.database);
  try { const result = await grantPlatformAdmin(connection, process.argv[2]); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); }
  finally { await connection.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`Platform admin grant failed: ${error.code || error.message}\n`); process.exitCode = 1; });
}
