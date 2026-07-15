import { sqlDate } from './sql-values.js';

const parseJson = (value) => typeof value === 'string' ? JSON.parse(value) : structuredClone(value);

export class PublicTrustRepository {
  async publishDid({ connection }, did, key = null) {
    await connection.execute(`INSERT INTO v2_public_did_registry
      (did, owner_tenant_id, method, role_code, status, did_version, key_version, public_document, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?)
      ON DUPLICATE KEY UPDATE owner_tenant_id = VALUES(owner_tenant_id), method = VALUES(method), role_code = VALUES(role_code),
        status = VALUES(status), did_version = VALUES(did_version), key_version = VALUES(key_version), public_document = VALUES(public_document), updated_at = VALUES(updated_at)`,
    [did.did, did.role === 'issuer' ? did.tenantId : null, did.method, did.role, did.status, did.version, did.keyVersion,
      JSON.stringify(did.document), sqlDate(did.updatedAt)]);
    if (key) await connection.execute(`INSERT INTO v2_public_did_key_versions
      (did, key_version, verification_method, public_jwk, status, created_at, retired_at)
      VALUES (?, ?, ?, CAST(? AS JSON), ?, ?, ?)
      ON DUPLICATE KEY UPDATE verification_method = VALUES(verification_method), public_jwk = VALUES(public_jwk), status = VALUES(status), retired_at = VALUES(retired_at)`,
    [did.did, key.version, key.verificationMethod, JSON.stringify(key.publicJwk), key.status, sqlDate(key.createdAt), sqlDate(key.retiredAt)]);
  }

  async retireDidKey({ connection }, did, version, retiredAt) {
    await connection.execute(`UPDATE v2_public_did_key_versions SET status = 'retired', retired_at = ? WHERE did = ? AND key_version = ?`,
      [sqlDate(retiredAt), did, version]);
  }

  async publishCredentialStatus({ connection }, record, issuerDid, updatedAt) {
    await connection.execute(`INSERT INTO v2_public_credential_status
      (credential_id, issuer_did, status, valid_until, replaced_by_credential_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE status = VALUES(status), valid_until = VALUES(valid_until),
        replaced_by_credential_id = VALUES(replaced_by_credential_id), updated_at = VALUES(updated_at)`,
    [record.id, issuerDid, record.status, sqlDate(record.validUntil), record.replacedByCredentialId || null, sqlDate(updatedAt)]);
  }

  async resolveDid({ connection }, did) {
    const [rows] = await connection.execute('SELECT * FROM v2_public_did_registry WHERE did = ?', [did]);
    const row = rows[0]; return row ? { did: row.did, tenantId: row.owner_tenant_id, method: row.method, role: row.role_code,
      status: row.status, version: Number(row.did_version), keyVersion: Number(row.key_version), document: parseJson(row.public_document), updatedAt: new Date(row.updated_at).toISOString() } : null;
  }

  async resolveKey({ connection }, did, version) {
    const [rows] = await connection.execute('SELECT * FROM v2_public_did_key_versions WHERE did = ? AND key_version = ?', [did, version]);
    const row = rows[0]; return row ? { did, version: Number(row.key_version), verificationMethod: row.verification_method,
      publicJwk: parseJson(row.public_jwk), status: row.status, createdAt: new Date(row.created_at).toISOString(), retiredAt: row.retired_at ? new Date(row.retired_at).toISOString() : null } : null;
  }

  async findCredentialStatus({ connection }, id) {
    const [rows] = await connection.execute('SELECT * FROM v2_public_credential_status WHERE credential_id = ?', [id]);
    const row = rows[0]; return row ? { id: row.credential_id, issuerDid: row.issuer_did, status: row.status,
      validUntil: new Date(row.valid_until).toISOString(), replacedByCredentialId: row.replaced_by_credential_id,
      updatedAt: new Date(row.updated_at).toISOString() } : null;
  }

  async resolveCredentialTemplate({ connection }, id, version, schemaHash) {
    const [rows] = await connection.execute(`SELECT id, tenant_id, credential_type, version, status, schema_json, schema_hash
      FROM v2_credential_templates WHERE id = ? AND version = ? AND schema_hash = ?`, [id, version, schemaHash]);
    const row = rows[0];
    return row ? { id: row.id, tenantId: row.tenant_id, credentialType: row.credential_type, version: Number(row.version),
      status: row.status, schema: parseJson(row.schema_json), schemaHash: row.schema_hash } : null;
  }
}
