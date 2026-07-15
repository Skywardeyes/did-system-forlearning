import { createHmac } from 'node:crypto';

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

export class JwtTokenService {
  constructor({ secret, ttlSeconds = 3600, clock = () => Date.now() }) {
    if (!Buffer.isBuffer(secret) || secret.length < 32) throw new Error('JWT authentication secret must contain at least 32 bytes');
    this.secret = secret; this.ttlSeconds = ttlSeconds; this.clock = clock;
  }

  issue({ userId, tenantId, sessionId, credentialVersion }) {
    const issuedAt = Math.floor(this.clock() / 1000); const expiresAt = issuedAt + this.ttlSeconds;
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const payload = encode({ sub: userId, tenant_id: tenantId, sid: sessionId, cv: credentialVersion, iat: issuedAt, exp: expiresAt });
    const signature = createHmac('sha256', this.secret).update(`${header}.${payload}`).digest('base64url');
    return { accessToken: `${header}.${payload}.${signature}`, tokenType: 'Bearer', expiresAt: new Date(expiresAt * 1000).toISOString() };
  }
}
