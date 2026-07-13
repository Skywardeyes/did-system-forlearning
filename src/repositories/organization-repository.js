import { RepositoryConflictError, requireTenantContext } from './repository-errors.js';
import { sqlDate } from './sql-values.js';

const clone = (value) => structuredClone(value);

export class OrganizationRepository {
  async create({ connection }, organization) {
    await connection.execute(
      `INSERT INTO v2_organizations (id, name, status, created_at, updated_at, row_version)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [organization.id, organization.name, organization.status, sqlDate(organization.createdAt), sqlDate(organization.updatedAt)],
    );
    return { ...clone(organization), rowVersion: 1 };
  }

  async findById({ connection }, id) {
    const [rows] = await connection.execute(
      `SELECT id, name, status, created_at, updated_at, row_version
       FROM v2_organizations WHERE id = ?`,
      [id],
    );
    return rows[0] ? mapOrganization(rows[0]) : null;
  }

  async save({ connection }, organization, expectedRowVersion) {
    const [result] = await connection.execute(
      `UPDATE v2_organizations
       SET name = ?, status = ?, updated_at = ?, row_version = row_version + 1
       WHERE id = ? AND row_version = ?`,
      [organization.name, organization.status, sqlDate(organization.updatedAt), organization.id, expectedRowVersion],
    );
    if (result.affectedRows !== 1) throw new RepositoryConflictError('Organization version conflict');
    return { ...clone(organization), rowVersion: expectedRowVersion + 1 };
  }
}

export class MembershipRepository {
  async hasRole({ connection, context }, roleCode) {
    requireTenantContext(context);
    const [rows] = await connection.execute(
      `SELECT id FROM v2_memberships
       WHERE tenant_id = ? AND user_id = ? AND role_code = ? AND status = 'active'
       LIMIT 1`,
      [context.tenantId, context.actorId, roleCode],
    );
    return Boolean(rows[0]);
  }
}

function mapOrganization(row) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    rowVersion: Number(row.row_version),
  };
}
