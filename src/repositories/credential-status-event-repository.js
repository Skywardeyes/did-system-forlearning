import { requireTenantContext } from './repository-errors.js';
import { sqlDate } from './sql-values.js';

export class CredentialStatusEventRepository {
  async append({ connection, context }, event) {
    requireTenantContext(context);
    if (event.tenantId !== context.tenantId) throw new Error('Credential event tenant does not match request context');
    await connection.execute(
      `INSERT INTO v2_credential_status_events
       (id, tenant_id, credential_id, from_status, to_status, actor_id, reason, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [event.id, event.tenantId, event.credentialId, event.fromStatus || null, event.toStatus,
        event.actorId || null, event.reason || null, sqlDate(event.occurredAt)],
    );
    return structuredClone(event);
  }
}
