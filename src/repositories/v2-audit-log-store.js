import { randomUUID } from 'node:crypto';
import { sqlDate } from './sql-values.js';

const parseJson = (value) => typeof value === 'string' ? JSON.parse(value) : structuredClone(value);

export class V2AuditLogStore {
  constructor(pool, { envelopeCrypto }) { this.pool = pool; this.envelopeCrypto = envelopeCrypto; }

  async append(entry) {
    const encrypted = this.envelopeCrypto.encryptJson(entry, { recordType: 'v2-audit-log', recordId: entry.id });
    await this.pool.execute(
      `INSERT IGNORE INTO v2_audit_logs
       (id, tenant_id, actor_id, log_type, level_code, module_code, action_code, success, correlation_id, encrypted_payload, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?)`,
      [entry.id, entry.tenantId || entry.context?.tenantId || null, entry.actorId || entry.context?.actorId || null,
        entry.type, entry.level, entry.module, entry.action, Boolean(entry.success), entry.correlationId,
        JSON.stringify(encrypted), sqlDate(entry.occurredAt)],
    );
    return structuredClone(entry);
  }

  async load() {
    const [cutoffs] = await this.pool.execute('SELECT cutoff_sequence FROM v2_audit_log_clear_events ORDER BY occurred_at DESC, id DESC LIMIT 1');
    const cutoff = Number(cutoffs[0]?.cutoff_sequence || 0);
    const [rows] = await this.pool.execute('SELECT id, encrypted_payload FROM v2_audit_logs WHERE sequence_id > ? ORDER BY sequence_id', [cutoff]);
    return rows.map((row) => this.envelopeCrypto.decryptJson(parseJson(row.encrypted_payload), { recordType: 'v2-audit-log', recordId: row.id }));
  }

  async replace(entries) {
    if (entries.length) throw new Error('V2 audit logs are append-only and cannot be replaced');
    const now = new Date();
    const [rows] = await this.pool.execute('SELECT COALESCE(MAX(sequence_id), 0) AS cutoff_sequence FROM v2_audit_logs');
    await this.pool.execute(
      'INSERT INTO v2_audit_log_clear_events (id, tenant_id, actor_id, cutoff_sequence, occurred_at) VALUES (?, NULL, NULL, ?, ?)',
      [randomUUID(), Number(rows[0].cutoff_sequence), now],
    );
  }
}

export class DualAuditLogStore {
  constructor(primary, rollbackStore) { this.primary = primary; this.rollbackStore = rollbackStore; }
  async append(entry) { const result = await this.primary.append(entry); await this.rollbackStore.append(entry); return result; }
  load() { return this.primary.load(); }
  async replace(entries) { await this.primary.replace(entries); await this.rollbackStore.replace(entries); }
}
