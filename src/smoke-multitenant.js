import { randomUUID } from 'node:crypto';
import { bootstrap } from './bootstrap.js';
import { KeyDidAdapter } from './did-methods.js';

const app = await bootstrap();
try {
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;
  const call = async (path, options = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, options);
    return { status: response.status, body: await response.json() };
  };
  const registration = await call('/api/v2/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: '多租户冒烟测试', email: `smoke-${randomUUID().slice(0, 8)}@example.test`, password: 'SmokeTestPass123',
      onboarding: { type: 'organization', organization: { name: `冒烟测试组织-${randomUUID().slice(0, 6)}`, organizationType: 'education' } } }) });
  const auth = { authorization: `Bearer ${registration.body.accessToken}`, 'content-type': 'application/json' };
  const walletIdentity = new KeyDidAdapter().create({ name: '冒烟 Holder', role: 'holder' });
  const publishedHolder = await call('/api/v2/wallet/holder-dids', { method: 'POST', headers: auth,
    body: JSON.stringify({ name: '冒烟 Holder', did: walletIdentity.did, document: walletIdentity.document }) });
  const workspaceResult = await call('/api/v2/auth/workspaces', { headers: auth });
  const organization = workspaceResult.body.workspaces?.find((item) => item.type === 'organization');
  const switched = await call('/api/v2/auth/switch-workspace', { method: 'POST', headers: auth, body: JSON.stringify({ tenantId: organization?.id }) });
  const switchedAuth = { authorization: `Bearer ${switched.body.accessToken}`, 'content-type': 'application/json' };
  const denied = await call('/api/v2/credentials', { method: 'POST', headers: switchedAuth, body: '{}' });
  const platformSession = await call('/api/v2/session/local', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const platformAuth = { authorization: `Bearer ${platformSession.body.accessToken}`, 'content-type': 'application/json' };
  const applications = await call('/api/v2/platform/organization-applications?status=pending', { headers: platformAuth });
  const application = applications.body.items?.find((item) => item.tenantId === organization?.id);
  const review = await call(`/api/v2/platform/organization-applications/${application?.id}/review`, { method: 'POST', headers: platformAuth,
    body: JSON.stringify({ decision: 'approved', note: 'automated smoke approval' }) });
  const approvedSwitch = await call('/api/v2/auth/switch-workspace', { method: 'POST', headers: auth, body: JSON.stringify({ tenantId: organization?.id }) });
  const approvedAuth = { authorization: `Bearer ${approvedSwitch.body.accessToken}`, 'content-type': 'application/json' };
  const linkedHolder = await call('/api/v2/holder-dids/directory-link', { method: 'POST', headers: approvedAuth,
    body: JSON.stringify({ did: walletIdentity.did }) });
  const afterApproval = await call('/api/v2/credentials', { method: 'POST', headers: approvedAuth, body: '{}' });
  const memberEmail = `member-${randomUUID().slice(0, 8)}@example.test`;
  const memberRegistration = await call('/api/v2/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: '受邀成员', email: memberEmail, password: 'MemberTestPass123' }) });
  const invitation = await call('/api/v2/auth/invitations', { method: 'POST', headers: approvedAuth,
    body: JSON.stringify({ email: memberEmail, roleCode: 'organization_member' }) });
  const memberAuth = { authorization: `Bearer ${memberRegistration.body.accessToken}`, 'content-type': 'application/json' };
  const accepted = await call('/api/v2/auth/invitations/accept', { method: 'POST', headers: memberAuth,
    body: JSON.stringify({ token: invitation.body.token }) });
  const roleGrant = await call(`/api/v2/auth/members/${memberRegistration.body.actor.id}/role`, { method: 'POST', headers: approvedAuth,
    body: JSON.stringify({ roleCode: 'verifier_operator', active: true }) });
  const memberSwitch = await call('/api/v2/auth/switch-workspace', { method: 'POST', headers: memberAuth,
    body: JSON.stringify({ tenantId: organization?.id }) });
  const logout = await call('/api/v2/auth/logout', { method: 'POST', headers: approvedAuth, body: '{}' });
  const revoked = await call('/api/v2/auth/workspaces', { headers: approvedAuth });
  const result = { registration: registration.status, workspaceTypes: workspaceResult.body.workspaces?.map((item) => item.type),
    organizationStatus: organization?.verificationStatus, organizationRoles: organization?.roles,
    issuerBeforeApproval: denied.status, review: review.status, grantedRoles: review.body.grantedRoles,
    issuerAuthorizationAfterApproval: afterApproval.status, publishedHolder: publishedHolder.status, linkedHolder: linkedHolder.status,
    invitation: invitation.status, invitationAccepted: accepted.status, roleGrant: roleGrant.status,
    invitedMemberRoles: memberSwitch.body.roles, logout: logout.status, revokedToken: revoked.status };
  const expected = registration.status === 201 && result.workspaceTypes?.includes('personal') && result.workspaceTypes?.includes('organization')
    && switched.body.actor?.id === registration.body.actor?.id
    && result.organizationStatus === 'pending' && denied.status === 403 && review.status === 200
    && result.grantedRoles?.includes('issuer_operator') && afterApproval.status === 400
    && publishedHolder.status === 201 && linkedHolder.status === 201 && invitation.status === 201
    && accepted.status === 200 && roleGrant.status === 200 && result.invitedMemberRoles?.includes('organization_member')
    && result.invitedMemberRoles?.includes('verifier_operator') && logout.status === 200 && revoked.status === 401;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!expected) process.exitCode = 1;
} finally {
  if (app.server.listening) await new Promise((resolve) => app.server.close(resolve));
  await app.pool.end();
}
