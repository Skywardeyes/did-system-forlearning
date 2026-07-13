import { requireTenantContext } from './repository-errors.js';
import { sqlDate, sqlPagination } from './sql-values.js';

const clone = (value) => structuredClone(value);
const parseJson = (value) => typeof value === 'string' ? JSON.parse(value) : clone(value);

export class VerificationLogRepository {
  constructor({ envelopeCrypto } = {}) { this.envelopeCrypto = envelopeCrypto; }

  async append({ connection, context }, entry) {
    requireTenantContext(context);
    if (entry.tenantId !== context.tenantId) throw new Error('Verification log tenant does not match request context');
    const evidence = entry.evidence == null ? null : this.envelopeCrypto.encryptJson(entry.evidence, { recordType: 'v2-verification-evidence', recordId: entry.id });
    await connection.execute(
      `INSERT INTO v2_verification_logs
       (id, tenant_id, credential_id, verification_kind, outcome, encrypted_evidence, occurred_at)
       VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?)`,
      [entry.id, entry.tenantId, entry.credentialId || null, entry.verificationKind, entry.outcome,
        evidence ? JSON.stringify(evidence) : null, sqlDate(entry.occurredAt)],
    );
    return clone(entry);
  }

  async findById({ connection, context }, id) {
    requireTenantContext(context);
    const [rows] = await connection.execute('SELECT * FROM v2_verification_logs WHERE id = ? AND tenant_id = ?', [id, context.tenantId]);
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async list({ connection, context }, { credentialId = null, verificationKind = null, page = 1, pageSize = 20 } = {}) {
    requireTenantContext(context);
    const filters = ['tenant_id = ?']; const params = [context.tenantId];
    if (credentialId) { filters.push('credential_id = ?'); params.push(credentialId); }
    if (verificationKind) { filters.push('verification_kind = ?'); params.push(verificationKind); }
    const where = filters.join(' AND '); const pagination = sqlPagination(page, pageSize);
    const [countRows] = await connection.execute(`SELECT COUNT(*) AS total FROM v2_verification_logs WHERE ${where}`, params);
    const [rows] = await connection.execute(`SELECT * FROM v2_verification_logs WHERE ${where} ORDER BY occurred_at DESC, id DESC LIMIT ${pagination.pageSize} OFFSET ${pagination.offset}`, params);
    const total = Number(countRows[0].total);
    return { total, page: pagination.page, pageSize: pagination.pageSize,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)), items: rows.map((row) => this.mapRow(row)) };
  }

  mapRow(row) {
    const envelope = row.encrypted_evidence == null ? null : parseJson(row.encrypted_evidence);
    return {
      id: row.id, tenantId: row.tenant_id, credentialId: row.credential_id, verificationKind: row.verification_kind,
      outcome: row.outcome, occurredAt: new Date(row.occurred_at).toISOString(),
      evidence: envelope == null ? null : this.envelopeCrypto.decryptJson(envelope, { recordType: 'v2-verification-evidence', recordId: row.id }),
    };
  }
}
