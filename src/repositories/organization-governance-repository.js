import { sqlDate } from './sql-values.js';

export class OrganizationGovernanceRepository {
  async listPlatformRoles(connection, userId) {
    const [rows] = await connection.execute(
      `SELECT role_code FROM v2_platform_roles WHERE user_id = ? AND status = 'active' ORDER BY role_code`, [userId],
    );
    return rows.map((row) => row.role_code);
  }

  async hasPlatformRole(connection, userId, roleCode) {
    const [rows] = await connection.execute(
      `SELECT id FROM v2_platform_roles WHERE user_id = ? AND role_code = ? AND status = 'active' LIMIT 1`, [userId, roleCode],
    );
    return Boolean(rows[0]);
  }

  async listApplications(connection, { status = 'pending' } = {}) {
    const [rows] = await connection.execute(
      `SELECT applications.id, applications.tenant_id, applications.organization_type,
              applications.registration_number, applications.status, applications.submitted_at,
              applications.review_note, applications.reviewed_at,
              organizations.name AS organization_name, organizations.slug,
              users.display_name AS submitter_name, users.email AS submitter_email
       FROM v2_organization_applications AS applications
       INNER JOIN v2_organizations AS organizations ON organizations.id = applications.tenant_id
       INNER JOIN v2_users AS users ON users.id = applications.submitted_by_user_id
       WHERE applications.status = ? ORDER BY applications.submitted_at ASC`, [status],
    );
    return rows.map(mapApplication);
  }

  async getApplicationForUpdate(connection, applicationId) {
    const [rows] = await connection.execute(
      `SELECT * FROM v2_organization_applications WHERE id = ? FOR UPDATE`, [applicationId],
    );
    return rows[0] || null;
  }

  async reviewApplication(connection, { applicationId, reviewerId, decision, note, at }) {
    await connection.execute(
      `UPDATE v2_organization_applications
       SET status = ?, review_note = ?, reviewed_by_user_id = ?, reviewed_at = ?
       WHERE id = ? AND status = 'pending'`, [decision, note || null, reviewerId, sqlDate(at), applicationId],
    );
  }

  async updateOrganizationVerification(connection, tenantId, verificationStatus, at) {
    await connection.execute(
      `UPDATE v2_organizations SET verification_status = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?`,
      [verificationStatus, sqlDate(at), tenantId],
    );
  }

  async grantOperatorRole(connection, { id, tenantId, userId, roleCode, at }) {
    await connection.execute(
      `INSERT IGNORE INTO v2_memberships
       (id, tenant_id, user_id, role_code, status, created_at, updated_at, row_version)
       VALUES (?, ?, ?, ?, 'active', ?, ?, 1)`, [id, tenantId, userId, roleCode, sqlDate(at), sqlDate(at)],
    );
  }
}

function mapApplication(row) {
  return { id: row.id, tenantId: row.tenant_id, organizationName: row.organization_name, slug: row.slug,
    organizationType: row.organization_type, registrationNumber: row.registration_number, status: row.status,
    submitter: { name: row.submitter_name, email: row.submitter_email }, submittedAt: new Date(row.submitted_at).toISOString(),
    reviewNote: row.review_note, reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null };
}
