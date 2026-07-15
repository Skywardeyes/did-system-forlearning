import { sqlDate } from './sql-values.js';

export class IdentityAccessRepository {
  async findLocalAccountByEmail(connection, normalizedEmail, { forUpdate = false } = {}) {
    const [rows] = await connection.execute(
      `SELECT accounts.id AS account_id, accounts.user_id, accounts.password_phc, accounts.credential_version,
              accounts.failed_attempts, accounts.locked_until, users.display_name, users.email, users.status
       FROM v2_local_accounts AS accounts
       INNER JOIN v2_users AS users ON users.id = accounts.user_id
       WHERE accounts.normalized_email = ?${forUpdate ? ' FOR UPDATE' : ''}`,
      [normalizedEmail],
    );
    return rows[0] || null;
  }

  async createUser(connection, user) {
    await connection.execute(
      `INSERT INTO v2_users (id, external_subject, display_name, email, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      [user.id, user.externalSubject, user.displayName, user.email, sqlDate(user.createdAt), sqlDate(user.createdAt)],
    );
  }

  async createLocalAccount(connection, account) {
    await connection.execute(
      `INSERT INTO v2_local_accounts
       (id, user_id, normalized_email, password_phc, credential_version, failed_attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 0, ?, ?)`,
      [account.id, account.userId, account.normalizedEmail, account.passwordPhc, sqlDate(account.createdAt), sqlDate(account.createdAt)],
    );
  }

  async createWorkspace(connection, workspace) {
    await connection.execute(
      `INSERT INTO v2_organizations
       (id, name, workspace_type, slug, status, verification_status, created_by_user_id,
        personal_owner_user_id, created_at, updated_at, row_version)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, 1)`,
      [workspace.id, workspace.name, workspace.workspaceType, workspace.slug, workspace.verificationStatus,
        workspace.createdByUserId, workspace.personalOwnerUserId || null, sqlDate(workspace.createdAt), sqlDate(workspace.createdAt)],
    );
  }

  async createMembership(connection, membership) {
    await connection.execute(
      `INSERT INTO v2_memberships
       (id, tenant_id, user_id, role_code, status, created_at, updated_at, row_version)
       VALUES (?, ?, ?, ?, 'active', ?, ?, 1)`,
      [membership.id, membership.tenantId, membership.userId, membership.roleCode,
        sqlDate(membership.createdAt), sqlDate(membership.createdAt)],
    );
  }

  async createOrganizationApplication(connection, application) {
    await connection.execute(
      `INSERT INTO v2_organization_applications
       (id, tenant_id, submitted_by_user_id, organization_type, registration_number, evidence_json, status, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [application.id, application.tenantId, application.submittedByUserId, application.organizationType,
        application.registrationNumber || null, application.evidence ? JSON.stringify(application.evidence) : null, sqlDate(application.submittedAt)],
    );
  }

  async listWorkspaces(connection, userId) {
    const [rows] = await connection.execute(
      `SELECT organizations.id, organizations.name, organizations.workspace_type, organizations.slug,
              organizations.status, organizations.verification_status, memberships.role_code
       FROM v2_memberships AS memberships
       INNER JOIN v2_organizations AS organizations ON organizations.id = memberships.tenant_id
       WHERE memberships.user_id = ? AND memberships.status = 'active' AND organizations.status = 'active'
       ORDER BY organizations.workspace_type = 'personal' DESC, organizations.created_at ASC, memberships.role_code ASC`,
      [userId],
    );
    const workspaces = new Map();
    for (const row of rows) {
      const item = workspaces.get(row.id) || { id: row.id, name: row.name, type: row.workspace_type, slug: row.slug,
        status: row.status, verificationStatus: row.verification_status, roles: [] };
      item.roles.push(row.role_code); workspaces.set(row.id, item);
    }
    return [...workspaces.values()];
  }

  async createSession(connection, session) {
    await connection.execute(
      `INSERT INTO v2_auth_sessions
       (id, user_id, credential_version, status, authentication_method, created_at, last_seen_at, expires_at)
       VALUES (?, ?, ?, 'active', 'password', ?, ?, ?)`,
      [session.id, session.userId, session.credentialVersion, sqlDate(session.createdAt), sqlDate(session.createdAt), sqlDate(session.expiresAt)],
    );
  }

  async recordLoginSuccess(connection, accountId, at) {
    await connection.execute(
      `UPDATE v2_local_accounts SET failed_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?`,
      [sqlDate(at), sqlDate(at), accountId],
    );
  }

  async recordLoginFailure(connection, accountId, failedAttempts, lockedUntil, at) {
    await connection.execute(
      `UPDATE v2_local_accounts SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?`,
      [failedAttempts, lockedUntil ? sqlDate(lockedUntil) : null, sqlDate(at), accountId],
    );
  }

  async revokeSession(connection, sessionId, userId, at) {
    const [result] = await connection.execute(
      `UPDATE v2_auth_sessions SET status = 'revoked', revoked_at = ? WHERE id = ? AND user_id = ? AND status = 'active'`,
      [sqlDate(at), sessionId, userId],
    );
    return result.affectedRows === 1;
  }

  async findUserById(connection, userId) {
    const [rows] = await connection.execute(
      `SELECT id, display_name, email, status FROM v2_users WHERE id = ?`, [userId],
    );
    return rows[0] || null;
  }

  async createInvitation(connection, invitation) {
    await connection.execute(
      `INSERT INTO v2_workspace_invitations
       (id, tenant_id, invited_email, role_code, token_hash, status, invited_by_user_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [invitation.id, invitation.tenantId, invitation.invitedEmail, invitation.roleCode, invitation.tokenHash,
        invitation.invitedByUserId, sqlDate(invitation.createdAt), sqlDate(invitation.expiresAt)],
    );
  }

  async findInvitationForUpdate(connection, tokenHash) {
    const [rows] = await connection.execute(
      `SELECT invitations.*, organizations.status AS organization_status
       FROM v2_workspace_invitations AS invitations
       INNER JOIN v2_organizations AS organizations ON organizations.id = invitations.tenant_id
       WHERE invitations.token_hash = ? FOR UPDATE`, [tokenHash],
    );
    return rows[0] || null;
  }

  async acceptInvitation(connection, invitationId, userId, at) {
    await connection.execute(
      `UPDATE v2_workspace_invitations
       SET status = 'accepted', accepted_by_user_id = ?, accepted_at = ?
       WHERE id = ? AND status = 'pending'`, [userId, sqlDate(at), invitationId],
    );
  }

  async listMembers(connection, tenantId) {
    const [rows] = await connection.execute(
      `SELECT users.id, users.display_name, users.email, memberships.role_code, memberships.status
       FROM v2_memberships AS memberships
       INNER JOIN v2_users AS users ON users.id = memberships.user_id
       WHERE memberships.tenant_id = ? ORDER BY users.display_name, users.id, memberships.role_code`, [tenantId],
    );
    const members = new Map();
    for (const row of rows) {
      const member = members.get(row.id) || { id: row.id, displayName: row.display_name, email: row.email, roles: [] };
      if (row.status === 'active') member.roles.push(row.role_code); members.set(row.id, member);
    }
    return [...members.values()];
  }

  async getWorkspace(connection, tenantId) {
    const [rows] = await connection.execute(
      `SELECT id, workspace_type, status, verification_status FROM v2_organizations WHERE id = ?`, [tenantId],
    );
    return rows[0] || null;
  }

  async setMembershipRole(connection, membership) {
    await connection.execute(
      `INSERT INTO v2_memberships
       (id, tenant_id, user_id, role_code, status, created_at, updated_at, row_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE status = VALUES(status), updated_at = VALUES(updated_at), row_version = row_version + 1`,
      [membership.id, membership.tenantId, membership.userId, membership.roleCode, membership.active ? 'active' : 'inactive',
        sqlDate(membership.at), sqlDate(membership.at)],
    );
  }
}
