import { requireTenantContext } from './repository-errors.js';
import { sqlDate, sqlPagination } from './sql-values.js';

const parseJson = (value) => typeof value === 'string' ? JSON.parse(value) : structuredClone(value);

export class CredentialTemplateRepository {
  async nextVersion({ connection, context }, name) {
    requireTenantContext(context);
    const [rows] = await connection.execute(
      'SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM v2_credential_templates WHERE tenant_id = ? AND name = ? FOR UPDATE',
      [context.tenantId, name],
    );
    return Number(rows[0].next_version);
  }

  async create({ connection, context }, record) {
    requireTenantContext(context);
    await connection.execute(`INSERT INTO v2_credential_templates
      (id, tenant_id, name, credential_type, version, status, schema_json, schema_hash, created_by_actor_id, created_at)
      VALUES (?, ?, ?, ?, ?, 'draft', CAST(? AS JSON), ?, ?, ?)`,
    [record.id, context.tenantId, record.name, record.credentialType, record.version, JSON.stringify(record.schema),
      record.schemaHash, context.actorId, sqlDate(record.createdAt)]);
    return { ...structuredClone(record), tenantId: context.tenantId, status: 'draft' };
  }

  async findById({ connection, context }, id, { forUpdate = false } = {}) {
    requireTenantContext(context);
    const [rows] = await connection.execute(`SELECT * FROM v2_credential_templates WHERE id = ? AND tenant_id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [id, context.tenantId]);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async list({ connection, context }, { status = null, page = 1, pageSize = 20 } = {}) {
    requireTenantContext(context); const filters = ['tenant_id = ?']; const params = [context.tenantId];
    if (status) { filters.push('status = ?'); params.push(status); }
    const where = filters.join(' AND '); const pagination = sqlPagination(page, pageSize);
    const [countRows] = await connection.execute(`SELECT COUNT(*) AS total FROM v2_credential_templates WHERE ${where}`, params);
    const [rows] = await connection.execute(`SELECT * FROM v2_credential_templates WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ${pagination.pageSize} OFFSET ${pagination.offset}`, params);
    const total = Number(countRows[0].total); return { items: rows.map(mapRow), total, page: pagination.page, pageSize: pagination.pageSize, totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)) };
  }

  async setStatus({ connection, context }, id, fromStatus, toStatus, at) {
    requireTenantContext(context); const column = toStatus === 'published' ? 'published_at' : 'retired_at';
    const [result] = await connection.execute(`UPDATE v2_credential_templates SET status = ?, ${column} = ? WHERE id = ? AND tenant_id = ? AND status = ?`,
      [toStatus, sqlDate(at), id, context.tenantId, fromStatus]);
    return result.affectedRows === 1;
  }

  async deleteDraft({ connection, context }, id) {
    requireTenantContext(context);
    const [result] = await connection.execute(
      `DELETE FROM v2_credential_templates WHERE id = ? AND tenant_id = ? AND status = 'draft'`,
      [id, context.tenantId],
    );
    return result.affectedRows === 1;
  }
}

function mapRow(row) {
  return { id: row.id, tenantId: row.tenant_id, name: row.name, credentialType: row.credential_type, version: Number(row.version),
    status: row.status, schema: parseJson(row.schema_json), schemaHash: row.schema_hash, createdByActorId: row.created_by_actor_id,
    createdAt: new Date(row.created_at).toISOString(), publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    retiredAt: row.retired_at ? new Date(row.retired_at).toISOString() : null };
}
