import { sqlDate } from './sql-values.js';

export class HolderOrganizationRequestRepository {
  async listApprovedOrganizations(connection, search = '') {
    const term = `%${String(search).trim().slice(0, 100)}%`;
    const [rows] = await connection.execute(`SELECT id, name, slug FROM v2_organizations
      WHERE workspace_type = 'organization' AND status = 'active' AND verification_status = 'approved'
        AND (? = '%%' OR name LIKE ?) ORDER BY name ASC LIMIT 100`, [term, term]);
    return rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug }));
  }

  async findPending(connection, organizationId, holderDid) {
    const [rows] = await connection.execute(`SELECT id FROM v2_holder_organization_requests
      WHERE organization_id = ? AND holder_did = ? AND status = 'pending' LIMIT 1`, [organizationId, holderDid]);
    return rows[0] || null;
  }

  async create(connection, record) {
    const [result] = await connection.execute(`INSERT INTO v2_holder_organization_requests
      (id, wallet_account_id, organization_id, holder_did, holder_display_name, request_message, status, created_at)
      SELECT ?, ?, organizations.id, ?, ?, ?, 'pending', ? FROM v2_organizations AS organizations
      WHERE organizations.id = ? AND organizations.workspace_type = 'organization'
        AND organizations.status = 'active' AND organizations.verification_status = 'approved'`,
    [record.id, record.walletAccountId, record.holderDid, record.holderDisplayName, record.message || null,
      sqlDate(record.createdAt), record.organizationId]);
    return result.affectedRows === 1;
  }

  async listForOrganization(connection, organizationId) {
    const [rows] = await connection.execute(`SELECT id, holder_did, holder_display_name, request_message, status, created_at, decided_at
      FROM v2_holder_organization_requests WHERE organization_id = ? ORDER BY status = 'pending' DESC, created_at DESC LIMIT 100`, [organizationId]);
    return rows.map(map);
  }

  async findForOrganization(connection, id, organizationId) {
    const [rows] = await connection.execute(`SELECT id, holder_did, holder_display_name, request_message, status, created_at, decided_at
      FROM v2_holder_organization_requests WHERE id = ? AND organization_id = ?`, [id, organizationId]);
    return rows[0] ? map(rows[0]) : null;
  }

  async decide(connection, id, organizationId, actorId, status, at) {
    const [result] = await connection.execute(`UPDATE v2_holder_organization_requests SET status = ?, decided_at = ?, decided_by_actor_id = ?
      WHERE id = ? AND organization_id = ? AND status = 'pending'`, [status, sqlDate(at), actorId, id, organizationId]);
    return result.affectedRows === 1;
  }
}

function map(row) { return { id: row.id, holderDid: row.holder_did, holderDisplayName: row.holder_display_name,
  message: row.request_message, status: row.status, createdAt: new Date(row.created_at).toISOString(),
  decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : null }; }
