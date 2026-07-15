import { sqlDate } from './sql-values.js';

export class HolderDidDirectoryRepository {
  async isPersonalWorkspaceOwner(connection, tenantId, userId) {
    const [rows] = await connection.execute(
      `SELECT id FROM v2_organizations
       WHERE id = ? AND workspace_type = 'personal' AND personal_owner_user_id = ? AND status = 'active'`,
      [tenantId, userId],
    );
    return Boolean(rows[0]);
  }

  async findByDid(connection, did) {
    const [rows] = await connection.execute(
      `SELECT id, user_id, did, display_name, public_document, status, created_at, updated_at
       FROM v2_user_holder_dids WHERE did = ?`, [did],
    );
    return rows[0] ? map(rows[0]) : null;
  }

  async listByUser(connection, userId) {
    const [rows] = await connection.execute(
      `SELECT id, user_id, did, display_name, public_document, status, created_at, updated_at
       FROM v2_user_holder_dids WHERE user_id = ? ORDER BY created_at ASC`, [userId],
    );
    return rows.map(map);
  }

  async create(connection, record) {
    await connection.execute(
      `INSERT INTO v2_user_holder_dids
       (id, user_id, did, display_name, public_document, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
      [record.id, record.userId || null, record.did, record.displayName, JSON.stringify(record.document),
        sqlDate(record.createdAt), sqlDate(record.createdAt)],
    );
  }
}

function map(row) {
  return { id: row.id, userId: row.user_id || null, did: row.did, displayName: row.display_name,
    document: typeof row.public_document === 'string' ? JSON.parse(row.public_document) : row.public_document,
    status: row.status, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
}
