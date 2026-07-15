import { AuthenticationError } from './request-authenticator.js';

export class SessionValidatingAuthenticator {
  constructor({ authenticator, pool, allowSessionless = false, clock = () => Date.now() }) {
    this.authenticator = authenticator; this.pool = pool; this.allowSessionless = allowSessionless; this.clock = clock;
  }

  async authenticate(request, requestId) {
    const context = this.authenticator.authenticate(request, requestId);
    if (!context.sessionId) {
      if (this.allowSessionless) return context;
      throw new AuthenticationError('Bearer token does not identify a revocable session');
    }
    const [rows] = await this.pool.execute(
      `SELECT sessions.status, sessions.expires_at, sessions.credential_version,
              accounts.credential_version AS current_credential_version, users.status AS user_status
       FROM v2_auth_sessions AS sessions
       INNER JOIN v2_local_accounts AS accounts ON accounts.user_id = sessions.user_id
       INNER JOIN v2_users AS users ON users.id = sessions.user_id
       WHERE sessions.id = ? AND sessions.user_id = ?`,
      [context.sessionId, context.actorId],
    );
    const session = rows[0];
    if (!session || session.status !== 'active' || session.user_status !== 'active'
      || new Date(session.expires_at).getTime() <= this.clock()
      || Number(session.credential_version) !== Number(session.current_credential_version)
      || Number(session.credential_version) !== context.credentialVersion) {
      throw new AuthenticationError('Bearer session is expired or revoked');
    }
    return context;
  }
}
