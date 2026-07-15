import { RepositoryConflictError, requireTenantContext } from './repository-errors.js';
import { sqlDate, sqlPagination } from './sql-values.js';

const clone = (value) => structuredClone(value);
const parseJson = (value) => typeof value === 'string' ? JSON.parse(value) : clone(value);
const toIso = (value) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export class CredentialRepository {
  constructor({ envelopeCrypto } = {}) { this.envelopeCrypto = envelopeCrypto; }

  encryptPayload(record) {
    if (!this.envelopeCrypto) throw new Error('Credential payload encryption requires envelope crypto');
    return this.envelopeCrypto.encryptJson(record.credential, { recordType: 'v2-credential-payload', recordId: record.id });
  }

  decryptPayload(row) {
    if (!this.envelopeCrypto) throw new Error('Encrypted credential payload requires envelope crypto');
    return this.envelopeCrypto.decryptJson(parseJson(row.encrypted_payload), { recordType: 'v2-credential-payload', recordId: row.id });
  }

  async create({ connection, context }, record) {
    requireTenantContext(context);
    if (record.tenantId !== context.tenantId) throw new Error('Credential tenant does not match request context');
    const payload = this.encryptPayload(record);
    await connection.execute(
      `INSERT INTO v2_credentials
       (id, tenant_id, issuer_did_id, holder_did_id, template_id, template_version, schema_hash, status, valid_from, valid_until, issued_at,
        suspended_at, resumed_at, revoked_at, replaced_at, replaces_credential_id, replaced_by_credential_id,
        encrypted_payload, row_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), 1)`,
      [record.id, record.tenantId, record.issuerDidId, record.holderDidId, record.templateId || null,
        record.templateVersion || null, record.schemaHash || null, record.status,
        sqlDate(record.validFrom), sqlDate(record.validUntil), sqlDate(record.issuedAt), sqlDate(record.suspendedAt), sqlDate(record.resumedAt),
        sqlDate(record.revokedAt), sqlDate(record.replacedAt), record.replacesCredentialId || null,
        record.replacedByCredentialId || null, JSON.stringify(payload)],
    );
    return { ...clone(record), rowVersion: 1 };
  }

  async findById({ connection, context }, id) { return this.find({ connection, context }, id, false); }
  async getForUpdate({ connection, context }, id) { return this.find({ connection, context }, id, true); }

  async find({ connection, context }, id, forUpdate) {
    requireTenantContext(context);
    const [rows] = await connection.execute(
      `SELECT * FROM v2_credentials WHERE id = ? AND tenant_id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
      [id, context.tenantId],
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async list({ connection, context }, { status = null, holderDidId = null, issuerDidId = null, search = '', page = 1, pageSize = 20 } = {}) {
    requireTenantContext(context);
    const filters = ['tenant_id = ?']; const params = [context.tenantId];
    if (status) { filters.push('status = ?'); params.push(status); }
    if (holderDidId) { filters.push('holder_did_id = ?'); params.push(holderDidId); }
    if (issuerDidId) { filters.push('issuer_did_id = ?'); params.push(issuerDidId); }
    if (String(search).trim()) { filters.push('(id LIKE ? OR status LIKE ?)'); const value = `%${String(search).trim()}%`; params.push(value, value); }
    const where = filters.join(' AND ');
    const [countRows] = await connection.execute(`SELECT COUNT(*) AS total FROM v2_credentials WHERE ${where}`, params);
    const pagination = sqlPagination(page, pageSize);
    const [rows] = await connection.execute(
      `SELECT id, tenant_id, issuer_did_id, holder_did_id, template_id, template_version, schema_hash, status, valid_from, valid_until, issued_at,
              suspended_at, resumed_at, revoked_at, replaced_at, replaces_credential_id,
              replaced_by_credential_id, row_version
       FROM v2_credentials WHERE ${where}
       ORDER BY issued_at DESC, id DESC LIMIT ${pagination.pageSize} OFFSET ${pagination.offset}`, params,
    );
    const total = Number(countRows[0].total);
    return { total, page: pagination.page, pageSize: pagination.pageSize,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)), items: rows.map((row) => this.mapSummaryRow(row)) };
  }

  async saveLifecycle({ connection, context }, record, expectedRowVersion) {
    requireTenantContext(context);
    if (record.tenantId !== context.tenantId) throw new Error('Credential tenant does not match request context');
    const [result] = await connection.execute(
      `UPDATE v2_credentials
       SET status = ?, suspended_at = ?, resumed_at = ?, revoked_at = ?, replaced_at = ?,
           replaces_credential_id = ?, replaced_by_credential_id = ?, row_version = row_version + 1
       WHERE id = ? AND tenant_id = ? AND row_version = ?`,
      [record.status, sqlDate(record.suspendedAt), sqlDate(record.resumedAt), sqlDate(record.revokedAt),
        sqlDate(record.replacedAt), record.replacesCredentialId || null, record.replacedByCredentialId || null,
        record.id, context.tenantId, expectedRowVersion],
    );
    if (result.affectedRows !== 1) throw new RepositoryConflictError('Credential version conflict');
    return { ...clone(record), rowVersion: expectedRowVersion + 1 };
  }

  mapRow(row) {
    return { ...this.mapSummaryRow(row), credential: this.decryptPayload(row) };
  }

  mapSummaryRow(row) {
    return {
      id: row.id, tenantId: row.tenant_id, issuerDidId: row.issuer_did_id, holderDidId: row.holder_did_id,
      templateId: row.template_id || null, templateVersion: row.template_version == null ? null : Number(row.template_version), schemaHash: row.schema_hash || null,
      status: row.status, validFrom: toIso(row.valid_from), validUntil: toIso(row.valid_until), issuedAt: toIso(row.issued_at),
      suspendedAt: row.suspended_at ? toIso(row.suspended_at) : null, resumedAt: row.resumed_at ? toIso(row.resumed_at) : null,
      revokedAt: row.revoked_at ? toIso(row.revoked_at) : null, replacedAt: row.replaced_at ? toIso(row.replaced_at) : null,
      replacesCredentialId: row.replaces_credential_id, replacedByCredentialId: row.replaced_by_credential_id,
      rowVersion: Number(row.row_version),
    };
  }
}
