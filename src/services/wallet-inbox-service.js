import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { verifyPayload } from '../crypto.js';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const binding = (holderDid, action, challenge) => ({ type: 'WalletInboxRequest2026', holderDid, action, challenge, domain: 'wallet-inbox' });

export class WalletInboxService {
  constructor({ pool, walletOfferRepository }) { this.pool = pool; this.walletOfferRepository = walletOfferRepository; }

  async issueChallenge(holderDid) {
    const challenge = randomBytes(32).toString('base64url'); const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.execute(`SELECT public_document FROM v2_dids WHERE did = ? AND role_code = 'holder' AND status = 'active' LIMIT 1`, [holderDid]);
      if (!rows[0]) throw new Error('Holder DID is not registered');
      const createdAt = new Date(); const expiresAt = new Date(createdAt.getTime() + 5 * 60_000);
      await connection.execute(`INSERT INTO v2_wallet_inbox_challenges (id, holder_did, challenge_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)`, [randomUUID(), holderDid, digest(challenge), expiresAt, createdAt]);
      return { challenge, domain: 'wallet-inbox', expiresAt: expiresAt.toISOString() };
    } finally { connection.release(); }
  }

  async authorize(connection, input, action) {
    const holderDid = String(input?.holderDid || ''); const challenge = String(input?.challenge || ''); const proof = input?.proof;
    const [rows] = await connection.execute(`SELECT public_document FROM v2_dids WHERE did = ? AND role_code = 'holder' AND status = 'active' LIMIT 1`, [holderDid]);
    const document = rows[0] && (typeof rows[0].public_document === 'string' ? JSON.parse(rows[0].public_document) : rows[0].public_document);
    const method = document?.verificationMethod?.find((item) => item.id === proof?.verificationMethod);
    if (!method?.publicKeyJwk || !verifyPayload(binding(holderDid, action, challenge), method.publicKeyJwk, proof?.proofValue)) throw new Error('Wallet inbox signature is invalid');
    const [result] = await connection.execute(`UPDATE v2_wallet_inbox_challenges SET consumed_at = UTC_TIMESTAMP(3)
      WHERE holder_did = ? AND challenge_hash = ? AND consumed_at IS NULL AND expires_at > UTC_TIMESTAMP(3)`, [holderDid, digest(challenge)]);
    if (result.affectedRows !== 1) throw new Error('Wallet inbox Challenge is missing, expired, or already used');
    return holderDid;
  }

  async list(input) { const connection = await this.pool.getConnection(); try { await connection.beginTransaction(); const holderDid = await this.authorize(connection, input, 'list'); const offers = await this.walletOfferRepository.listByHolder(connection, holderDid); await connection.commit(); return { offers }; } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); } }
  async decide(input, offerId, decision) { const connection = await this.pool.getConnection(); try { await connection.beginTransaction(); const holderDid = await this.authorize(connection, input, decision); const result = await this.walletOfferRepository.decide(connection, holderDid, offerId, decision, input.reason || null); if (!result) throw new Error('Offer is unavailable or already decided'); await connection.commit(); return result; } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); } }
}
