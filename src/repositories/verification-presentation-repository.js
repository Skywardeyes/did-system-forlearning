import { randomUUID } from 'node:crypto';
import { requireTenantContext } from './repository-errors.js';
import { sqlDate, sqlPagination } from './sql-values.js';

const parseJson = (value) => typeof value === 'string' ? JSON.parse(value) : structuredClone(value || []);

export class VerificationPresentationRepository {
  constructor({ envelopeCrypto }) { this.envelopeCrypto = envelopeCrypto; }

  async begin({ connection, context }, record) {
    requireTenantContext(context);
    const evidence = this.envelopeCrypto.encryptJson(record.evidence || {}, { recordType: 'v2-verification-presentation', recordId: record.id });
    await connection.execute(`INSERT INTO v2_verification_presentations
      (id, tenant_id, holder_did, presentation_type, credential_count, outcome, encrypted_evidence, occurred_at)
      VALUES (?, ?, ?, ?, ?, 'pending', CAST(? AS JSON), ?)`,
    [record.id, context.tenantId, record.holderDid || null, record.presentationType, record.credentialCount,
      JSON.stringify(evidence), sqlDate(record.occurredAt)]);
    return record;
  }

  async complete({ connection, context }, presentationId, outcome, items) {
    requireTenantContext(context);
    await connection.execute('UPDATE v2_verification_presentations SET outcome = ? WHERE id = ? AND tenant_id = ?',
      [outcome, presentationId, context.tenantId]);
    for (const item of items) await connection.execute(`INSERT INTO v2_verification_presentation_items
      (id, presentation_id, credential_id, issuer_did, credential_type, outcome, disclosed_paths, failed_checks)
      VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON))`,
    [randomUUID(), presentationId, item.credentialId || null, item.issuerDid || null, item.credentialType || null, item.outcome,
      JSON.stringify(item.disclosedPaths || []), JSON.stringify(item.failedChecks || [])]);
  }

  async list({ connection, context }, { page = 1, pageSize = 20 } = {}) {
    requireTenantContext(context);
    const pagination = sqlPagination(page, pageSize);
    const [countRows] = await connection.execute('SELECT COUNT(*) AS total FROM v2_verification_presentations WHERE tenant_id = ?', [context.tenantId]);
    const [rows] = await connection.execute(`SELECT id, holder_did, presentation_type, credential_count, outcome, occurred_at
      FROM v2_verification_presentations WHERE tenant_id = ? ORDER BY occurred_at DESC, id DESC
      LIMIT ${pagination.pageSize} OFFSET ${pagination.offset}`, [context.tenantId]);
    const ids = rows.map((row) => row.id); let itemRows = [];
    if (ids.length) [itemRows] = await connection.execute(`SELECT presentation_id, credential_id, issuer_did, credential_type, outcome, disclosed_paths, failed_checks
      FROM v2_verification_presentation_items WHERE presentation_id IN (${ids.map(() => '?').join(',')}) ORDER BY presentation_id, id`, ids);
    const itemsByPresentation = new Map();
    for (const row of itemRows) {
      const item = { presentationId: row.presentation_id, credentialId: row.credential_id, issuerDid: row.issuer_did,
        credentialType: row.credential_type, outcome: row.outcome, disclosedPaths: parseJson(row.disclosed_paths), failedChecks: parseJson(row.failed_checks) };
      if (!itemsByPresentation.has(item.presentationId)) itemsByPresentation.set(item.presentationId, []);
      itemsByPresentation.get(item.presentationId).push(item);
    }
    const total = Number(countRows[0].total);
    return { items: rows.map((row) => ({ id: row.id, holderDid: row.holder_did, presentationType: row.presentation_type,
      credentialCount: Number(row.credential_count), outcome: row.outcome, occurredAt: new Date(row.occurred_at).toISOString(),
      credentials: itemsByPresentation.get(row.id) || [] })), total, page: pagination.page, pageSize: pagination.pageSize,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)) };
  }
}
