import { requireTenantContext } from './repository-errors.js';
import { sqlDate } from './sql-values.js';

export class VerifierChallengeRepository {
  async issue({ connection, context }, entry) {
    requireTenantContext(context);
    await connection.execute(
      `INSERT INTO v2_verifier_challenges
       (id, tenant_id, challenge_hash, domain, created_by_actor_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [entry.id, context.tenantId, entry.challengeHash, entry.domain, context.actorId, sqlDate(entry.createdAt), sqlDate(entry.expiresAt)],
    );
    return { ...entry, tenantId: context.tenantId, actorId: context.actorId };
  }

  async consume({ connection, context }, { challengeHash, domain, credentialId, presentationId = null, consumedAt }) {
    requireTenantContext(context);
    const [result] = await connection.execute(
      `UPDATE v2_verifier_challenges
       SET consumed_at = ?, consumed_credential_id = ?, consumed_presentation_id = ?
       WHERE tenant_id = ? AND challenge_hash = ? AND domain = ?
         AND consumed_at IS NULL AND expires_at > UTC_TIMESTAMP(3)`,
      [sqlDate(consumedAt), credentialId || null, presentationId, context.tenantId, challengeHash, domain],
    );
    return result.affectedRows === 1;
  }
}
