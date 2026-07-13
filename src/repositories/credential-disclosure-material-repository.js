import { requireTenantContext } from './repository-errors.js';
import { sqlDate } from './sql-values.js';

const clone = (value) => structuredClone(value);
const parseJson = (value) => typeof value === 'string' ? JSON.parse(value) : clone(value);

export class CredentialDisclosureMaterialRepository {
  constructor({ envelopeCrypto } = {}) { this.envelopeCrypto = envelopeCrypto; }

  encrypt(value, recordId, recordType) {
    if (value == null) return null;
    if (!this.envelopeCrypto) throw new Error('Disclosure material encryption requires envelope crypto');
    return this.envelopeCrypto.encryptJson(value, { recordType, recordId });
  }

  decrypt(value, recordId, recordType) {
    if (value == null) return null;
    if (!this.envelopeCrypto) throw new Error('Encrypted disclosure material requires envelope crypto');
    return this.envelopeCrypto.decryptJson(parseJson(value), { recordType, recordId });
  }

  async upsert({ connection, context }, material) {
    requireTenantContext(context);
    if (material.tenantId !== context.tenantId) throw new Error('Disclosure material tenant does not match request context');
    const teaching = this.encrypt(material.teachingMaterial, material.credentialId, 'v2-teaching-disclosure');
    const sdJwt = this.encrypt(material.sdJwtMaterial, material.credentialId, 'v2-sd-jwt-disclosure');
    await connection.execute(
      `INSERT INTO v2_credential_disclosure_materials
       (credential_id, tenant_id, encrypted_teaching_material, encrypted_sd_jwt_material, updated_at)
       VALUES (?, ?, CAST(? AS JSON), CAST(? AS JSON), ?)
       ON DUPLICATE KEY UPDATE encrypted_teaching_material = VALUES(encrypted_teaching_material),
         encrypted_sd_jwt_material = VALUES(encrypted_sd_jwt_material), updated_at = VALUES(updated_at)`,
      [material.credentialId, material.tenantId, teaching ? JSON.stringify(teaching) : null, sdJwt ? JSON.stringify(sdJwt) : null, sqlDate(material.updatedAt)],
    );
    return clone(material);
  }

  async findByCredentialId({ connection, context }, credentialId) {
    requireTenantContext(context);
    const [rows] = await connection.execute(
      `SELECT materials.* FROM v2_credential_disclosure_materials AS materials
       INNER JOIN v2_credentials AS credentials ON credentials.id = materials.credential_id
       WHERE materials.credential_id = ? AND materials.tenant_id = ? AND credentials.tenant_id = ?`,
      [credentialId, context.tenantId, context.tenantId],
    );
    const row = rows[0];
    return row ? {
      credentialId: row.credential_id, tenantId: row.tenant_id,
      teachingMaterial: this.decrypt(row.encrypted_teaching_material, row.credential_id, 'v2-teaching-disclosure'),
      sdJwtMaterial: this.decrypt(row.encrypted_sd_jwt_material, row.credential_id, 'v2-sd-jwt-disclosure'),
      updatedAt: new Date(row.updated_at).toISOString(),
    } : null;
  }
}
