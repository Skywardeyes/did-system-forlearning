import { randomUUID } from 'node:crypto';
import { bootstrap } from './bootstrap.js';
import { createIdentity, signedRegistrationPackage } from '../wallet/wallet-core.js';

// Retains the historical script name, but now validates the simplified one-account/one-organization MVP.
const app = await bootstrap();
try {
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;
  const call = async (path, options = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, options);
    return { status: response.status, body: await response.json() };
  };
  const smokePassword = `Smoke-${randomUUID()}-A1`;
  const registration = await call('/api/v2/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: '组织负责人', email: `smoke-${randomUUID().slice(0, 8)}@example.test`, password: smokePassword,
      organization: { name: `冒烟测试组织-${randomUUID().slice(0, 6)}`, organizationType: 'education' } }) });
  const auth = { authorization: `Bearer ${registration.body.accessToken}`, 'content-type': 'application/json' };
  const walletIdentity = await createIdentity('冒烟 Holder');
  const publishedHolder = await call('/api/v2/wallet/holder-dids', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(await signedRegistrationPackage(walletIdentity)) });
  const linkedHolder = await call('/api/v2/holder-dids/directory-link', { method: 'POST', headers: auth,
    body: JSON.stringify({ did: walletIdentity.did }) });
  const authorizedIssuer = await call('/api/v2/credentials', { method: 'POST', headers: auth, body: '{}' });
  const removedWorkspaceRoute = await call('/api/v2/auth/workspaces', { headers: auth });
  const logout = await call('/api/v2/auth/logout', { method: 'POST', headers: auth, body: '{}' });
  const revoked = await call('/api/v2/dids', { headers: auth });
  const result = { registration: registration.status, workspaceCount: registration.body.workspaces?.length,
    workspaceType: registration.body.tenant?.type, roles: registration.body.roles, publishedHolder: publishedHolder.status,
    linkedHolder: linkedHolder.status, issuerRouteReached: authorizedIssuer.status, removedWorkspaceRoute: removedWorkspaceRoute.status,
    logout: logout.status, revokedToken: revoked.status };
  const expected = registration.status === 201 && result.workspaceCount === 1 && result.workspaceType === 'organization'
    && result.roles?.includes('issuer_operator') && result.roles?.includes('verifier_operator') && !result.roles?.includes('holder_operator')
    && publishedHolder.status === 201 && linkedHolder.status === 201 && authorizedIssuer.status === 400
    && removedWorkspaceRoute.status === 404 && logout.status === 200 && revoked.status === 401;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!expected) process.exitCode = 1;
} finally {
  if (app.server.listening) await new Promise((resolve) => app.server.close(resolve));
  await app.pool.end();
}
