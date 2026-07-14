import { requireTenantContext } from './repository-errors.js';
import { sqlDate, sqlPagination } from './sql-values.js';

export class SensitiveAccessLogRepository {
  async append({ connection, context }, entry) {
    requireTenantContext(context);
    if (!context.actorId || entry.tenantId !== context.tenantId || entry.actorId !== context.actorId) {
      throw new Error('Sensitive access audit context is invalid');
    }
    await connection.execute(
      `INSERT INTO v2_sensitive_access_logs
       (id, tenant_id, actor_id, credential_id, purpose_code, correlation_id, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [entry.id, entry.tenantId, entry.actorId, entry.credentialId, entry.purposeCode,
        entry.correlationId || null, sqlDate(entry.occurredAt)],
    );
    return structuredClone(entry);
  }

  async list({ connection, context }, { credentialId = null, actorId = null, purposeCode = null, page = 1, pageSize = 20 } = {}) {
    requireTenantContext(context);
    const filters = ['tenant_id = ?']; const params = [context.tenantId];
    if (credentialId) { filters.push('credential_id = ?'); params.push(credentialId); }
    if (actorId) { filters.push('actor_id = ?'); params.push(actorId); }
    if (purposeCode) { filters.push('purpose_code = ?'); params.push(purposeCode); }
    const where = filters.join(' AND '); const pagination = sqlPagination(page, pageSize);
    const [counts] = await connection.execute(`SELECT COUNT(*) AS total FROM v2_sensitive_access_logs WHERE ${where}`, params);
    const [rows] = await connection.execute(
      `SELECT id, tenant_id, actor_id, credential_id, purpose_code, correlation_id, occurred_at
       FROM v2_sensitive_access_logs WHERE ${where}
       ORDER BY occurred_at DESC, id DESC LIMIT ${pagination.pageSize} OFFSET ${pagination.offset}`,
      params,
    );
    const total = Number(counts[0].total);
    return { items: rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, actorId: row.actor_id,
      credentialId: row.credential_id, purposeCode: row.purpose_code, correlationId: row.correlation_id,
      occurredAt: new Date(row.occurred_at).toISOString() })), total, page: pagination.page, pageSize: pagination.pageSize,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)) };
  }
}
