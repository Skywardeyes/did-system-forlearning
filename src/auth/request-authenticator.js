import { createHmac, timingSafeEqual } from 'node:crypto';

export class AuthenticationError extends Error {
  constructor(message = 'Authentication is required') { super(message); this.name = 'AuthenticationError'; this.code = 'AUTHENTICATION_REQUIRED'; }
}

export class AuthorizationError extends Error {
  constructor(message = 'The authenticated user does not have the required role') { super(message); this.name = 'AuthorizationError'; this.code = 'AUTHORIZATION_DENIED'; }
}

const decodeJson = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

export class Hs256RequestAuthenticator {
  constructor({ secret, clock = () => Date.now() }) {
    if (!Buffer.isBuffer(secret) || secret.length < 32) throw new Error('JWT authentication secret must contain at least 32 bytes');
    this.secret = secret; this.clock = clock;
  }

  authenticate(request, requestId) {
    const match = /^Bearer\s+(.+)$/i.exec(String(request.headers.authorization || ''));
    if (!match) throw new AuthenticationError();
    const [headerPart, payloadPart, signaturePart, ...extra] = match[1].split('.');
    if (extra.length || !headerPart || !payloadPart || !signaturePart) throw new AuthenticationError('Bearer token format is invalid');
    let header; let payload;
    try { header = decodeJson(headerPart); payload = decodeJson(payloadPart); } catch { throw new AuthenticationError('Bearer token encoding is invalid'); }
    if (header.alg !== 'HS256' || header.typ !== 'JWT') throw new AuthenticationError('Bearer token algorithm is not permitted');
    const expected = createHmac('sha256', this.secret).update(`${headerPart}.${payloadPart}`).digest();
    const actual = Buffer.from(signaturePart, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new AuthenticationError('Bearer token signature is invalid');
    if (!payload?.sub || !payload?.tenant_id || !Number.isFinite(payload.exp) || payload.exp * 1000 <= this.clock()) throw new AuthenticationError('Bearer token is expired or missing required claims');
    return { actorId: String(payload.sub), tenantId: String(payload.tenant_id), requestId, authenticationMethod: 'jwt-hs256' };
  }
}
