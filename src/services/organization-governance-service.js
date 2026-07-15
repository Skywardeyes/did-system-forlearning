import { randomUUID } from 'node:crypto';
import { AuthorizationError } from '../auth/request-authenticator.js';

export class OrganizationGovernanceService {
  constructor({ pool, repository, clock = () => Date.now(), createId = randomUUID }) {
    this.pool = pool; this.repository = repository; this.clock = clock; this.createId = createId;
  }

  async listApplications(context, query = {}) {
    await this.requirePlatformAdmin(context.actorId);
    const status = ['pending', 'approved', 'rejected', 'cancelled'].includes(query.status) ? query.status : 'pending';
    return { items: await this.repository.listApplications(this.pool, { status }) };
  }

  async getPlatformRoles(context) {
    return { roles: await this.repository.listPlatformRoles(this.pool, context.actorId) };
  }

  async reviewApplication(context, applicationId, input = {}) {
    await this.requirePlatformAdmin(context.actorId);
    const decision = input.decision;
    if (!['approved', 'rejected'].includes(decision)) { const error = new Error('审核决定必须是 approved 或 rejected'); error.code = 'INVALID_REQUEST'; throw error; }
    const note = String(input.note || '').trim();
    if (note.length > 500) { const error = new Error('审核说明不能超过 500 个字符'); error.code = 'INVALID_REQUEST'; throw error; }
    const connection = await this.pool.getConnection(); const at = new Date(this.clock()).toISOString();
    try {
      await connection.beginTransaction();
      const application = await this.repository.getApplicationForUpdate(connection, applicationId);
      if (!application) { const error = new Error('组织申请不存在'); error.code = 'NOT_FOUND'; throw error; }
      if (application.status !== 'pending') { const error = new Error('组织申请已经完成审核'); error.code = 'VERSION_CONFLICT'; throw error; }
      await this.repository.reviewApplication(connection, { applicationId, reviewerId: context.actorId, decision, note, at });
      await this.repository.updateOrganizationVerification(connection, application.tenant_id, decision, at);
      if (decision === 'approved') {
        for (const roleCode of ['issuer_operator', 'verifier_operator']) {
          await this.repository.grantOperatorRole(connection, { id: this.createId(), tenantId: application.tenant_id,
            userId: application.submitted_by_user_id, roleCode, at });
        }
      }
      await connection.commit();
      return { id: applicationId, tenantId: application.tenant_id, decision,
        grantedRoles: decision === 'approved' ? ['issuer_operator', 'verifier_operator'] : [] };
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }

  async requirePlatformAdmin(userId) {
    if (!await this.repository.hasPlatformRole(this.pool, userId, 'platform_admin')) throw new AuthorizationError('Platform administrator role is required');
  }
}
