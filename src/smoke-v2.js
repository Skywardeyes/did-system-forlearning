import { createHmac } from 'node:crypto';
import { bootstrap } from './bootstrap.js';
import { loadRuntimeConfig } from './config.js';

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
function createAdminToken(secret, actorId, tenantId) {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: actorId, tenant_id: tenantId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 });
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function requestJson(baseUrl, token, pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`V2 smoke request failed at ${pathname}: ${response.status} ${result.code || 'UNKNOWN'} ${result.error || ''}`);
  return result;
}

async function main() {
  const v2Only = process.argv.includes('--v2-only');
  if (v2Only) process.env.APP_DATA_MODE = 'v2';
  const config = loadRuntimeConfig(process.env);
  if (!config.auth.enabled) throw new Error('AUTH_JWT_HS256_SECRET is not configured');
  const { server, pool } = await bootstrap();
  try {
    const [actors] = await pool.execute(
      `SELECT organizations.id AS tenant_id, users.id AS actor_id
       FROM v2_memberships AS memberships
       INNER JOIN v2_organizations AS organizations ON organizations.id = memberships.tenant_id
       INNER JOIN v2_users AS users ON users.id = memberships.user_id
       WHERE memberships.role_code = 'tenant_admin' AND memberships.status = 'active'
         AND organizations.name = ? AND users.external_subject = ? LIMIT 1`,
      [process.env.BOOTSTRAP_ORG_NAME || '本地演示组织', process.env.BOOTSTRAP_ADMIN_SUBJECT || 'local-admin'],
    );
    if (!actors[0]) throw new Error('Seeded tenant administrator was not found');
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const localSessionResponse = await fetch(`${baseUrl}/api/v2/session/local`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    const localSession = await localSessionResponse.json();
    if (!localSessionResponse.ok || !localSession.accessToken) throw new Error('Local V2 session could not be established');
    const token = localSession.accessToken || createAdminToken(config.auth.jwtHs256Secret, actors[0].actor_id, actors[0].tenant_id);
    const suffix = new Date().toISOString();
    const issuer = await requestJson(baseUrl, token, '/api/v2/dids', { method: 'POST', body: { name: `V2 冒烟签发方 ${suffix}`, role: 'issuer', method: 'example' } });
    const holder = await requestJson(baseUrl, token, '/api/v2/dids', { method: 'POST', body: { name: `V2 冒烟持有方 ${suffix}`, role: 'holder', method: 'example' } });
    const credential = await requestJson(baseUrl, token, '/api/v2/credentials', { method: 'POST', body: {
      issuerDid: issuer.did, holderDid: holder.did, subjectName: '本地冒烟学员', course: 'V2 生产数据链路',
      completionDate: new Date().toISOString().slice(0, 10), validUntil: new Date(Date.now() + 365 * 86_400_000).toISOString(),
    } });
    const presentation = await requestJson(baseUrl, token, `/api/v2/credentials/${encodeURIComponent(credential.id)}/sd-jwt`, {
      method: 'POST', body: { paths: ['credentialSubject.course'] },
    });
    const credentialVerification = await requestJson(baseUrl, token, '/api/v2/verify', {
      method: 'POST', body: { credential: credential.credential },
    });
    const sdJwtVerification = await requestJson(baseUrl, token, '/api/v2/sd-jwt/verify', {
      method: 'POST', body: { sdJwt: presentation.sdJwt },
    });
    if (!credentialVerification.valid || !sdJwtVerification.valid) throw new Error('V2 verification route rejected valid proof material');
    const verificationLedger = await requestJson(baseUrl, token, '/api/v2/disclosure-verification-logs?page=1&pageSize=20');
    const list = await requestJson(baseUrl, token, '/api/v2/credentials?page=1&pageSize=20');
    if (list.items.some((item) => Object.hasOwn(item, 'credential'))) throw new Error('Credential list exposed plaintext payload');
    const [beforeAccessRows] = await pool.execute(
      'SELECT COUNT(*) AS total FROM v2_sensitive_access_logs WHERE tenant_id = ? AND credential_id = ?',
      [actors[0].tenant_id, credential.id],
    );
    const contentAccess = await requestJson(baseUrl, token,
      `/api/v2/credentials/${encodeURIComponent(credential.id)}/content-access`, {
        method: 'POST', body: { purpose: 'local_demo' },
      });
    const [afterAccessRows] = await pool.execute(
      'SELECT COUNT(*) AS total FROM v2_sensitive_access_logs WHERE tenant_id = ? AND credential_id = ?',
      [actors[0].tenant_id, credential.id],
    );
    const accessAudited = Number(afterAccessRows[0].total) === Number(beforeAccessRows[0].total) + 1;
    if (!contentAccess.credential?.proof?.proofValue || !accessAudited) throw new Error('Sensitive credential access was not fail-closed audited');
    let legacyDisabled = false;
    if (v2Only) {
      const legacyResponse = await fetch(`${baseUrl}/api/state`);
      legacyDisabled = legacyResponse.status === 410 && (await legacyResponse.json()).code === 'LEGACY_API_DISABLED';
      if (!legacyDisabled) throw new Error('Legacy API remained enabled in V2-only mode');
    }
    process.stdout.write(`${JSON.stringify({ authenticated: true, localSession: localSession.tenant?.name, issuerId: issuer.id, holderId: holder.id,
      credentialId: credential.id, credentialStatus: credential.status, sdJwtCreated: Boolean(presentation.sdJwt),
      fullVcVerified: credentialVerification.valid, sdJwtVerified: sdJwtVerification.valid,
      listPlaintextProtected: true, sensitiveAccessAudited: accessAudited,
      verificationEvidenceCount: verificationLedger.total, credentialCount: list.total,
      dataMode: config.application.dataMode, legacyDisabled }, null, 2)}\n`);
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`V2 smoke test failed: ${error.message}\n`);
  process.exitCode = 1;
});
