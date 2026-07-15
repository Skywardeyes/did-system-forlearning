import { sqlDate } from './sql-values.js';

const parseJson = (value) => typeof value === 'string' ? JSON.parse(value) : structuredClone(value);

export class WalletCredentialOfferRepository {
  constructor({ envelopeCrypto }) { this.envelopeCrypto = envelopeCrypto; }

  async create({ connection, context }, offer) {
    const encrypted = this.envelopeCrypto.encryptJson(offer.delivery, { recordType: 'wallet-credential-offer', recordId: offer.id });
    await connection.execute(`INSERT INTO v2_wallet_credential_offers
      (id, tenant_id, credential_id, holder_did, status, encrypted_delivery, created_at)
      VALUES (?, ?, ?, ?, 'pending', CAST(? AS JSON), ?)`,
    [offer.id, context.tenantId, offer.credentialId, offer.holderDid, JSON.stringify(encrypted), sqlDate(offer.createdAt)]);
  }

  async listByHolder(connection, holderDid) {
    const [rows] = await connection.execute(`SELECT offers.id, offers.credential_id, offers.status, offers.created_at,
        credentials.issued_at, organizations.name AS issuer_name, templates.name AS template_name
      FROM v2_wallet_credential_offers AS offers
      INNER JOIN v2_credentials AS credentials ON credentials.id = offers.credential_id
      INNER JOIN v2_organizations AS organizations ON organizations.id = offers.tenant_id
      LEFT JOIN v2_credential_templates AS templates
        ON templates.id = credentials.template_id AND templates.tenant_id = offers.tenant_id
      WHERE offers.holder_did = ? AND offers.status = 'pending' ORDER BY offers.created_at DESC`, [holderDid]);
    return rows.map((row) => ({ id: row.id, credentialId: row.credential_id, status: row.status,
      issuerName: row.issuer_name, templateName: row.template_name || '可验证凭证',
      issuedAt: new Date(row.issued_at || row.created_at).toISOString(), createdAt: new Date(row.created_at).toISOString() }));
  }

  async decide(connection, holderDid, offerId, decision, reason = null) {
    const [result] = await connection.execute(`UPDATE v2_wallet_credential_offers
      SET status = ?, decided_at = UTC_TIMESTAMP(3), rejection_reason = ?
      WHERE id = ? AND holder_did = ? AND status = 'pending'`, [decision, reason, offerId, holderDid]);
    if (result.affectedRows !== 1) return null;
    if (decision !== 'claimed') return { id: offerId, status: decision };
    const [rows] = await connection.execute('SELECT encrypted_delivery FROM v2_wallet_credential_offers WHERE id = ?', [offerId]);
    const encrypted = parseJson(rows[0].encrypted_delivery);
    return { id: offerId, status: decision, delivery: this.envelopeCrypto.decryptJson(encrypted, { recordType: 'wallet-credential-offer', recordId: offerId }) };
  }
}
