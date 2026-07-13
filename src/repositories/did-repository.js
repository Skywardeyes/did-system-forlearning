import { RepositoryConflictError, requireTenantContext } from './repository-errors.js';
import { sqlDate, sqlPagination } from './sql-values.js';

const clone = (value) => structuredClone(value);
const parseJson = (value) => typeof value === 'string' ? JSON.parse(value) : clone(value);

export class DidRepository {
  constructor({ envelopeCrypto = null } = {}) { this.envelopeCrypto = envelopeCrypto; }

  encryptMetadata(did) {
    if (!did.metadata) return null;
    if (!this.envelopeCrypto) throw new Error('DID metadata encryption requires envelope crypto');
    return this.envelopeCrypto.encryptJson(did.metadata, { recordType: 'v2-did-metadata', recordId: did.id });
  }

  decryptMetadata(row) {
    if (!row.encrypted_metadata) return null;
    if (!this.envelopeCrypto) throw new Error('Encrypted DID metadata requires envelope crypto');
    return this.envelopeCrypto.decryptJson(parseJson(row.encrypted_metadata), { recordType: 'v2-did-metadata', recordId: row.id });
  }

  async create({ connection, context }, did) {
    requireTenantContext(context);
    if (did.tenantId !== context.tenantId) throw new Error('DID tenant does not match request context');
    const metadata = this.encryptMetadata(did);
    await connection.execute(
      `INSERT INTO v2_dids
       (id, tenant_id, did, method, role_code, status, did_version, key_version, public_document, encrypted_metadata, created_at, updated_at, row_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, ?, 1)`,
      [did.id, did.tenantId, did.did, did.method, did.role, did.status, did.version, did.keyVersion,
        JSON.stringify(did.document), metadata ? JSON.stringify(metadata) : null, sqlDate(did.createdAt), sqlDate(did.updatedAt)],
    );
    return { ...clone(did), rowVersion: 1 };
  }

  async findById({ connection, context }, id) {
    requireTenantContext(context);
    const [rows] = await connection.execute(
      `SELECT * FROM v2_dids WHERE id = ? AND tenant_id = ?`,
      [id, context.tenantId],
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async findByDid({ connection, context }, didValue) {
    requireTenantContext(context);
    const [rows] = await connection.execute(
      `SELECT * FROM v2_dids WHERE did = ? AND tenant_id = ?`,
      [didValue, context.tenantId],
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async getForUpdate({ connection, context }, id) {
    requireTenantContext(context);
    const [rows] = await connection.execute(
      `SELECT * FROM v2_dids WHERE id = ? AND tenant_id = ? FOR UPDATE`,
      [id, context.tenantId],
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async save({ connection, context }, did, expectedRowVersion) {
    requireTenantContext(context);
    if (did.tenantId !== context.tenantId) throw new Error('DID tenant does not match request context');
    const metadata = this.encryptMetadata(did);
    const [result] = await connection.execute(
      `UPDATE v2_dids
       SET status = ?, did_version = ?, key_version = ?, public_document = CAST(? AS JSON), encrypted_metadata = CAST(? AS JSON), updated_at = ?, row_version = row_version + 1
       WHERE id = ? AND tenant_id = ? AND row_version = ?`,
      [did.status, did.version, did.keyVersion, JSON.stringify(did.document), metadata ? JSON.stringify(metadata) : null,
        sqlDate(did.updatedAt), did.id, context.tenantId, expectedRowVersion],
    );
    if (result.affectedRows !== 1) throw new RepositoryConflictError('DID version conflict');
    return { ...clone(did), rowVersion: expectedRowVersion + 1 };
  }

  async list({ connection, context }, { role = null, status = null, search = '', page = 1, pageSize = 20 } = {}) {
    requireTenantContext(context);
    const filters = ['tenant_id = ?'];
    const params = [context.tenantId];
    if (role) { filters.push('role_code = ?'); params.push(role); }
    if (status) { filters.push('status = ?'); params.push(status); }
    if (String(search).trim()) { filters.push('(did LIKE ? OR method LIKE ? OR role_code LIKE ?)'); const value = `%${String(search).trim()}%`; params.push(value, value, value); }
    const where = filters.join(' AND ');
    const [countRows] = await connection.execute(`SELECT COUNT(*) AS total FROM v2_dids WHERE ${where}`, params);
    const pagination = sqlPagination(page, pageSize);
    const [rows] = await connection.execute(
      `SELECT * FROM v2_dids WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ${pagination.pageSize} OFFSET ${pagination.offset}`,
      params,
    );
    const total = Number(countRows[0].total);
    return { total, page: pagination.page, pageSize: pagination.pageSize,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)), items: rows.map((row) => this.mapRow(row)) };
  }

  mapRow(row) {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      did: row.did,
      method: row.method,
      role: row.role_code,
      status: row.status,
      version: Number(row.did_version),
      keyVersion: Number(row.key_version),
      document: parseJson(row.public_document),
      metadata: this.decryptMetadata(row),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      rowVersion: Number(row.row_version),
    };
  }
}
