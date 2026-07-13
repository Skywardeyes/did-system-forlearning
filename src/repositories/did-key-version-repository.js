import { RepositoryConflictError, requireTenantContext } from './repository-errors.js';
import { sqlDate } from './sql-values.js';

const parseJson = (value) => typeof value === 'string' ? JSON.parse(value) : structuredClone(value);

export class DidKeyVersionRepository {
  async create({ connection, context }, keyVersion) {
    requireTenantContext(context);
    await connection.execute(
      `INSERT INTO v2_did_key_versions
       (id, did_id, key_version, kms_key_id, verification_method, public_jwk, status, created_at, retired_at)
       VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?)`,
      [keyVersion.id, keyVersion.didId, keyVersion.version, keyVersion.kmsKeyId, keyVersion.verificationMethod,
        JSON.stringify(keyVersion.publicJwk), keyVersion.status, sqlDate(keyVersion.createdAt), sqlDate(keyVersion.retiredAt)],
    );
    return structuredClone(keyVersion);
  }

  async findByDidVersion({ connection, context }, didId, version, { forUpdate = false } = {}) {
    requireTenantContext(context);
    const [rows] = await connection.execute(
      `SELECT key_versions.*
       FROM v2_did_key_versions AS key_versions
       INNER JOIN v2_dids AS dids ON dids.id = key_versions.did_id
       WHERE key_versions.did_id = ? AND key_versions.key_version = ? AND dids.tenant_id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
      [didId, version, context.tenantId],
    );
    return rows[0] ? mapKeyVersion(rows[0]) : null;
  }

  async retire({ connection, context }, didId, version, retiredAt) {
    requireTenantContext(context);
    const [result] = await connection.execute(
      `UPDATE v2_did_key_versions AS key_versions
       INNER JOIN v2_dids AS dids ON dids.id = key_versions.did_id
       SET key_versions.status = 'retired', key_versions.retired_at = ?
       WHERE key_versions.did_id = ? AND key_versions.key_version = ? AND dids.tenant_id = ? AND key_versions.status = 'active'`,
      [sqlDate(retiredAt), didId, version, context.tenantId],
    );
    if (result.affectedRows !== 1) throw new RepositoryConflictError('DID key version is no longer active');
  }
}

function mapKeyVersion(row) {
  return {
    id: row.id,
    didId: row.did_id,
    version: Number(row.key_version),
    kmsKeyId: row.kms_key_id,
    verificationMethod: row.verification_method,
    publicJwk: parseJson(row.public_jwk),
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    retiredAt: row.retired_at ? new Date(row.retired_at).toISOString() : null,
  };
}
