import { createHmac } from 'node:crypto';

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

export class LocalSessionService {
  constructor({ pool, secret, enabled, organizationName = '本地演示组织', externalSubject = 'local-admin', ttlSeconds = 3600 }) {
    this.pool = pool; this.secret = secret; this.enabled = enabled; this.organizationName = organizationName;
    this.externalSubject = externalSubject; this.ttlSeconds = ttlSeconds;
  }

  async issue(input = {}) {
    if (!this.enabled) { const error = new Error('Local development login is disabled'); error.code = 'NOT_FOUND'; throw error; }
    if (input.externalSubject && input.externalSubject !== this.externalSubject) { const error = new Error('Local development subject is not permitted'); error.code = 'AUTHENTICATION_REQUIRED'; throw error; }
    const [rows] = await this.pool.execute(
      `SELECT organizations.id AS tenant_id, organizations.name AS tenant_name, users.id AS actor_id,
              users.external_subject, memberships.role_code
       FROM v2_memberships AS memberships
       INNER JOIN v2_organizations AS organizations ON organizations.id = memberships.tenant_id
       INNER JOIN v2_users AS users ON users.id = memberships.user_id
       WHERE organizations.name = ? AND users.external_subject = ? AND organizations.status = 'active'
         AND users.status = 'active' AND memberships.status = 'active'`,
      [this.organizationName, this.externalSubject],
    );
    if (!rows.length) { const error = new Error('Local development user is unavailable'); error.code = 'AUTHENTICATION_REQUIRED'; throw error; }
    const issuedAt = Math.floor(Date.now() / 1000); const expiresAt = issuedAt + this.ttlSeconds;
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const payload = encode({ sub: rows[0].actor_id, tenant_id: rows[0].tenant_id, iat: issuedAt, exp: expiresAt });
    const signature = createHmac('sha256', this.secret).update(`${header}.${payload}`).digest('base64url');
    return { accessToken: `${header}.${payload}.${signature}`, tokenType: 'Bearer', expiresAt: new Date(expiresAt * 1000).toISOString(),
      actor: { id: rows[0].actor_id, externalSubject: rows[0].external_subject },
      tenant: { id: rows[0].tenant_id, name: rows[0].tenant_name }, roles: rows.map((row) => row.role_code) };
  }
}
