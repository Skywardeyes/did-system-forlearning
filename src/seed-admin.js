import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { loadRuntimeConfig } from './config.js';
import { sqlDate } from './repositories/sql-values.js';

export async function seedTenantAdmin(connection, {
  organizationName = '本地演示组织',
  externalSubject = 'local-admin',
  grantCredentialReader = false,
  grantDemoOperatorRoles = false,
  grantPlatformAdmin = false,
  now = new Date().toISOString(),
  createId = randomUUID,
} = {}) {
  const organizationSlug = `bootstrap-${externalSubject.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'admin'}`;
  await connection.beginTransaction();
  try {
    const [organizationRows] = await connection.execute(
      'SELECT id FROM v2_organizations WHERE name = ? FOR UPDATE', [organizationName],
    );
    const organizationId = organizationRows[0]?.id || createId();
    if (!organizationRows[0]) {
      await connection.execute(
        `INSERT INTO v2_organizations
         (id, name, workspace_type, slug, status, verification_status, created_at, updated_at, row_version)
         VALUES (?, ?, 'organization', ?, 'active', 'approved', ?, ?, 1)`,
        [organizationId, organizationName, organizationSlug, sqlDate(now), sqlDate(now)],
      );
    }

    const [userRows] = await connection.execute(
      'SELECT id FROM v2_users WHERE external_subject = ? FOR UPDATE', [externalSubject],
    );
    const userId = userRows[0]?.id || createId();
    if (!userRows[0]) {
      await connection.execute(
        `INSERT INTO v2_users (id, external_subject, status, created_at, updated_at)
         VALUES (?, ?, 'active', ?, ?)`,
        [userId, externalSubject, sqlDate(now), sqlDate(now)],
      );
    }

    const roles = ['tenant_admin'];
    if (grantCredentialReader) roles.push('credential_data_reader');
    if (grantDemoOperatorRoles) roles.push('issuer_operator', 'verifier_operator');
    const membershipIds = [];
    for (const role of roles) {
      const [membershipRows] = await connection.execute(
        `SELECT id FROM v2_memberships
         WHERE tenant_id = ? AND user_id = ? AND role_code = ? FOR UPDATE`,
        [organizationId, userId, role],
      );
      const membershipId = membershipRows[0]?.id || createId();
      membershipIds.push(membershipId);
      if (!membershipRows[0]) {
        await connection.execute(
          `INSERT INTO v2_memberships
           (id, tenant_id, user_id, role_code, status, created_at, updated_at, row_version)
           VALUES (?, ?, ?, ?, 'active', ?, ?, 1)`,
          [membershipId, organizationId, userId, role, sqlDate(now), sqlDate(now)],
        );
      }
    }
    if (grantPlatformAdmin) {
      const [platformRows] = await connection.execute(
        `SELECT id FROM v2_platform_roles WHERE user_id = ? AND role_code = 'platform_admin' FOR UPDATE`, [userId],
      );
      if (!platformRows[0]) {
        await connection.execute(
          `INSERT INTO v2_platform_roles (id, user_id, role_code, status, created_at, updated_at)
           VALUES (?, ?, 'platform_admin', 'active', ?, ?)`, [createId(), userId, sqlDate(now), sqlDate(now)],
        );
      }
    }
    await connection.commit();
    return { organizationId, userId, membershipId: membershipIds[0], membershipIds, organizationName, externalSubject, roles,
      platformRoles: grantPlatformAdmin ? ['platform_admin'] : [] };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const config = loadRuntimeConfig(process.env);
  const connection = await mysql.createConnection(config.database);
  try {
    const result = await seedTenantAdmin(connection, {
      organizationName: process.env.BOOTSTRAP_ORG_NAME || '本地演示组织',
      externalSubject: process.env.BOOTSTRAP_ADMIN_SUBJECT || 'local-admin',
      grantCredentialReader: process.env.BOOTSTRAP_GRANT_CREDENTIAL_READER === 'true',
      grantDemoOperatorRoles: process.env.BOOTSTRAP_GRANT_DEMO_ROLES === 'true',
      grantPlatformAdmin: process.env.BOOTSTRAP_GRANT_PLATFORM_ADMIN === 'true',
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Admin seed failed: ${error.code || 'DATABASE_ERROR'}\n`);
    process.exitCode = 1;
  });
}
