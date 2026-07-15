import { sqlDate } from './sql-values.js';

export class NfcPresentationRepository {
  constructor({ envelopeCrypto }) { this.envelopeCrypto = envelopeCrypto; }

  async create(connection, record) {
    const encrypted = this.encrypt(record.id, { challenge: record.challenge, domain: record.domain });
    await connection.execute(`INSERT INTO v2_nfc_presentation_transfers
      (id, holder_did, target_organization_id, challenge_hash, status, encrypted_payload, created_at, expires_at)
      VALUES (?, ?, ?, ?, 'issued', CAST(? AS JSON), ?, ?)`,
    [record.id, record.holderDid, record.targetOrganizationId, record.challengeHash, JSON.stringify(encrypted), sqlDate(record.createdAt), sqlDate(record.expiresAt)]);
    return record;
  }

  async find(connection, id, { forUpdate = false } = {}) {
    const [rows] = await connection.execute(`SELECT * FROM v2_nfc_presentation_transfers WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async submit(connection, id, presentation, submittedAt) {
    const record = await this.find(connection, id, { forUpdate: true });
    if (!record) return null;
    const encrypted = this.encrypt(id, { challenge: record.challenge, domain: record.domain, presentation });
    const [result] = await connection.execute(`UPDATE v2_nfc_presentation_transfers
      SET status = 'pending', encrypted_payload = CAST(? AS JSON), submitted_at = ?
      WHERE id = ? AND status = 'issued' AND expires_at > UTC_TIMESTAMP(3)`,
    [JSON.stringify(encrypted), sqlDate(submittedAt), id]);
    return result.affectedRows === 1 ? { ...record, presentation, status: 'pending', submittedAt } : null;
  }

  async latestPending(connection, targetOrganizationId) {
    const [rows] = await connection.execute(`SELECT * FROM v2_nfc_presentation_transfers
      WHERE target_organization_id = ? AND status = 'pending' AND expires_at > UTC_TIMESTAMP(3)
      ORDER BY submitted_at DESC LIMIT 1`, [targetOrganizationId]);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async complete(connection, id, context, result, verifiedAt) {
    await connection.execute(`UPDATE v2_nfc_presentation_transfers SET status = ?, verified_at = ?,
      verified_by_tenant_id = ?, verification_presentation_id = ? WHERE id = ? AND status = 'pending'`,
    [result.valid ? 'verified' : 'invalid', sqlDate(verifiedAt), context.tenantId, result.presentationId || null, id]);
  }

  encrypt(id, value) { return this.envelopeCrypto.encryptJson(value, { recordType: 'v2-nfc-presentation-transfer', recordId: id }); }

  map(row) {
    const envelope = typeof row.encrypted_payload === 'string' ? JSON.parse(row.encrypted_payload) : row.encrypted_payload;
    const payload = this.envelopeCrypto.decryptJson(envelope, { recordType: 'v2-nfc-presentation-transfer', recordId: row.id });
    return { id: row.id, holderDid: row.holder_did, targetOrganizationId: row.target_organization_id,
      challengeHash: row.challenge_hash, status: row.status,
      challenge: payload.challenge, domain: payload.domain, presentation: payload.presentation || null,
      createdAt: new Date(row.created_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString(),
      submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null };
  }
}
