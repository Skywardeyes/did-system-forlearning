import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from '../auth/password-hasher.js';

const dummyPasswordPhc = 'scrypt$16384$8$1$vbQckrlwh1m9hPLYYNrwpA$S8mzgZT3Fm5wQuk8gERyfKBvGk0zLPFFIPtLMhNrrl0';

export class IdentityAccessError extends Error {
  constructor(message, code = 'IDENTITY_ACCESS_INVALID') { super(message); this.name = 'IdentityAccessError'; this.code = code; }
}

export class IdentityAccessService {
  constructor({ pool, repository, tokenService, clock = () => Date.now(), sessionTtlSeconds = 3600, createId = randomUUID }) {
    this.pool = pool; this.repository = repository; this.tokenService = tokenService; this.clock = clock;
    this.sessionTtlSeconds = sessionTtlSeconds; this.createId = createId;
  }

  async register(input = {}) {
    const displayName = requiredText(input.displayName, '姓名', 120);
    const email = normalizeEmail(input.email);
    const passwordPhc = await hashPassword(input.password);
    const now = new Date(this.clock()).toISOString();
    const userId = this.createId();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      if (await this.repository.findLocalAccountByEmail(connection, email, { forUpdate: true })) {
        throw new IdentityAccessError('该邮箱已注册', 'ACCOUNT_ALREADY_EXISTS');
      }
      await this.repository.createUser(connection, { id: userId, externalSubject: `local:${userId}`, displayName, email, createdAt: now });
      await this.repository.createLocalAccount(connection, { id: this.createId(), userId, normalizedEmail: email, passwordPhc, createdAt: now });
      const organization = await this.createOrganizationInTransaction(connection, userId,
        input.organization || input.onboarding?.organization, now);
      const session = await this.createSession(connection, userId, 1, now);
      const workspaces = await this.repository.listWorkspaces(connection, userId);
      await connection.commit();
      return this.sessionResponse({ user: { id: userId, displayName, email }, workspaces,
        selectedTenantId: organization.id, session, organization });
    } catch (error) {
      await connection.rollback();
      if (error.code === 'ER_DUP_ENTRY' && !(error instanceof IdentityAccessError)) throw new IdentityAccessError('该邮箱或空间标识已被使用', 'ACCOUNT_ALREADY_EXISTS');
      throw error;
    } finally { connection.release(); }
  }

  async login(input = {}) {
    const email = normalizeEmail(input.email); const nowMs = this.clock(); const now = new Date(nowMs).toISOString();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const account = await this.repository.findLocalAccountByEmail(connection, email, { forUpdate: true });
      if (!account) { await verifyPassword(input.password, dummyPasswordPhc); throw invalidCredentials(); }
      if (account.status !== 'active') throw invalidCredentials();
      if (account.locked_until && new Date(account.locked_until).getTime() > nowMs) {
        throw new IdentityAccessError('登录尝试过多，请稍后再试', 'ACCOUNT_TEMPORARILY_LOCKED');
      }
      if (!await verifyPassword(input.password, account.password_phc)) {
        const failures = Number(account.failed_attempts || 0) + 1;
        const lockedUntil = failures >= 5 ? new Date(nowMs + 15 * 60_000).toISOString() : null;
        await this.repository.recordLoginFailure(connection, account.account_id, failures >= 5 ? 0 : failures, lockedUntil, now);
        await connection.commit();
        throw invalidCredentials();
      }
      await this.repository.recordLoginSuccess(connection, account.account_id, now);
      const session = await this.createSession(connection, account.user_id, Number(account.credential_version), now);
      const workspaces = await this.repository.listWorkspaces(connection, account.user_id);
      if (!workspaces.length) throw new IdentityAccessError('账号没有可用空间', 'WORKSPACE_UNAVAILABLE');
      await connection.commit();
      const organizations = workspaces.filter((item) => item.type === 'organization');
      if (organizations.length !== 1) throw new IdentityAccessError('组织账号必须且只能绑定一个组织', 'WORKSPACE_UNAVAILABLE');
      const selected = organizations[0];
      return this.sessionResponse({ user: { id: account.user_id, displayName: account.display_name, email: account.email },
        workspaces, selectedTenantId: selected.id, session });
    } catch (error) {
      if (connection.connection?._closing !== true) await connection.rollback().catch(() => {});
      throw error;
    } finally { connection.release(); }
  }

  async listWorkspaces(userId) {
    return this.repository.listWorkspaces(this.pool, userId);
  }

  async switchWorkspace(context, tenantId) {
    const workspaces = await this.listWorkspaces(context.actorId);
    const selected = workspaces.find((item) => item.id === tenantId);
    if (!selected) throw new IdentityAccessError('无权进入该空间', 'AUTHORIZATION_DENIED');
    if (!context.sessionId || !context.credentialVersion) throw new IdentityAccessError('当前会话不支持空间切换，请重新登录', 'AUTHENTICATION_REQUIRED');
    const user = await this.repository.findUserById(this.pool, context.actorId);
    if (!user || user.status !== 'active') throw new IdentityAccessError('Current account is unavailable', 'AUTHENTICATION_REQUIRED');
    return { ...this.tokenService.issue({ userId: context.actorId, tenantId: selected.id, sessionId: context.sessionId,
      credentialVersion: context.credentialVersion }),
    actor: { id: user.id, displayName: user.display_name, email: user.email },
    tenant: selected, roles: selected.roles, workspaces };
  }

  async logout(context) {
    if (!context.sessionId) return { loggedOut: true };
    await this.repository.revokeSession(this.pool, context.sessionId, context.actorId, new Date(this.clock()).toISOString());
    return { loggedOut: true };
  }

  async createOrganization(context, input = {}) {
    const now = new Date(this.clock()).toISOString(); const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const organization = await this.createOrganizationInTransaction(connection, context.actorId, input, now);
      await connection.commit(); return organization;
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }

  async inviteMember(context, input = {}) {
    const invitedEmail = normalizeEmail(input.email); const roleCode = input.roleCode || 'organization_member';
    if (!['organization_member', 'tenant_admin'].includes(roleCode)) {
      throw new IdentityAccessError('邀请阶段只能授予组织成员或租户管理员角色', 'ROLE_NOT_PERMITTED');
    }
    const token = randomBytes(32).toString('base64url'); const nowMs = this.clock();
    const invitation = { id: this.createId(), tenantId: context.tenantId, invitedEmail, roleCode,
      tokenHash: createHash('sha256').update(token).digest('hex'), invitedByUserId: context.actorId,
      createdAt: new Date(nowMs).toISOString(), expiresAt: new Date(nowMs + 7 * 86_400_000).toISOString() };
    await this.repository.createInvitation(this.pool, invitation);
    return { id: invitation.id, invitedEmail, roleCode, token, expiresAt: invitation.expiresAt };
  }

  async acceptInvitation(context, input = {}) {
    const token = String(input.token || '');
    if (token.length < 32 || token.length > 256) throw new IdentityAccessError('邀请令牌无效', 'INVITATION_INVALID');
    const tokenHash = createHash('sha256').update(token).digest('hex'); const nowMs = this.clock(); const now = new Date(nowMs).toISOString();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const invitation = await this.repository.findInvitationForUpdate(connection, tokenHash);
      const user = await this.repository.findUserById(connection, context.actorId);
      if (!invitation || invitation.status !== 'pending' || new Date(invitation.expires_at).getTime() <= nowMs) {
        throw new IdentityAccessError('邀请不存在、已使用或已过期', 'INVITATION_INVALID');
      }
      if (!user || normalizeEmail(user.email) !== normalizeEmail(invitation.invited_email)) {
        throw new IdentityAccessError('该邀请不属于当前登录邮箱', 'AUTHORIZATION_DENIED');
      }
      try {
        await this.repository.createMembership(connection, { id: this.createId(), tenantId: invitation.tenant_id,
          userId: context.actorId, roleCode: invitation.role_code, createdAt: now });
      } catch (error) { if (error.code !== 'ER_DUP_ENTRY') throw error; }
      await this.repository.acceptInvitation(connection, invitation.id, context.actorId, now);
      await connection.commit();
      return { accepted: true, tenantId: invitation.tenant_id, roleCode: invitation.role_code,
        workspaces: await this.listWorkspaces(context.actorId) };
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }

  async listMembers(context) {
    return { items: await this.repository.listMembers(this.pool, context.tenantId) };
  }

  async setMemberRole(context, userId, input = {}) {
    const roleCode = String(input.roleCode || ''); const active = input.active !== false;
    const assignable = ['issuer_operator', 'verifier_operator', 'credential_data_reader', 'tenant_admin'];
    if (!assignable.includes(roleCode)) throw new IdentityAccessError('该角色不能由组织管理员分配', 'ROLE_NOT_PERMITTED');
    const workspace = await this.repository.getWorkspace(this.pool, context.tenantId);
    if (!workspace || workspace.workspace_type !== 'organization') throw new IdentityAccessError('个人空间不能分配组织角色', 'ROLE_NOT_PERMITTED');
    if (active && ['issuer_operator', 'verifier_operator'].includes(roleCode) && workspace.verification_status !== 'approved') {
      throw new IdentityAccessError('组织审核通过后才能分配签发或验证角色', 'AUTHORIZATION_DENIED');
    }
    const members = await this.repository.listMembers(this.pool, context.tenantId);
    if (!members.some((item) => item.id === userId)) throw new IdentityAccessError('目标用户不是当前组织成员', 'NOT_FOUND');
    if (!active && roleCode === 'tenant_admin'
      && members.filter((item) => item.roles.includes('tenant_admin')).length <= 1) {
      throw new IdentityAccessError('不能移除组织最后一个租户管理员', 'ROLE_NOT_PERMITTED');
    }
    const at = new Date(this.clock()).toISOString();
    await this.repository.setMembershipRole(this.pool, { id: this.createId(), tenantId: context.tenantId, userId, roleCode, active, at });
    return { userId, roleCode, active };
  }

  async createOrganizationInTransaction(connection, userId, input = {}, now) {
    const name = requiredText(input?.name, '组织名称', 255);
    const organizationType = requiredText(input?.organizationType || 'other', '组织类型', 64);
    const tenantId = this.createId();
    const slugStem = String(input?.slug || name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'organization';
    const workspace = { id: tenantId, name, workspaceType: 'organization', slug: `${slugStem}-${tenantId.slice(0, 8)}`,
      verificationStatus: 'approved', createdByUserId: userId, personalOwnerUserId: null, createdAt: now };
    await this.repository.createWorkspace(connection, workspace);
    for (const roleCode of ['workspace_owner', 'tenant_admin', 'issuer_operator', 'verifier_operator', 'credential_data_reader']) {
      await this.repository.createMembership(connection, { id: this.createId(), tenantId, userId, roleCode, createdAt: now });
    }
    return { ...workspace, organizationType };
  }

  async createSession(connection, userId, credentialVersion, now) {
    const session = { id: this.createId(), userId, credentialVersion, createdAt: now,
      expiresAt: new Date(new Date(now).getTime() + this.sessionTtlSeconds * 1000).toISOString() };
    await this.repository.createSession(connection, session); return session;
  }

  sessionResponse({ user, workspaces, selectedTenantId, session, organization = null }) {
    const selected = workspaces.find((item) => item.id === selectedTenantId);
    return { ...this.tokenService.issue({ userId: user.id, tenantId: selectedTenantId, sessionId: session.id,
      credentialVersion: session.credentialVersion }), actor: user, tenant: selected, roles: selected?.roles || [], workspaces,
      organizationApplication: organization };
  }
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new IdentityAccessError('请输入有效邮箱地址', 'EMAIL_INVALID');
  return email;
}

function requiredText(value, label, maximum) {
  const text = String(value || '').trim();
  if (!text || text.length > maximum) throw new IdentityAccessError(`${label}不能为空且不能超过 ${maximum} 个字符`);
  return text;
}

function invalidCredentials() { return new IdentityAccessError('邮箱或密码错误', 'AUTHENTICATION_REQUIRED'); }
