import { randomUUID } from 'node:crypto';

export class HolderOrganizationRequestService {
  constructor({ pool, repository, holderDidDirectoryService }) {
    this.pool = pool; this.repository = repository; this.holderDidDirectoryService = holderDidDirectoryService;
  }

  async listOrganizations(search) { return { items: await this.repository.listApprovedOrganizations(this.pool, search) }; }

  async submit(walletAccount, input = {}) {
    const organizationId = String(input.organizationId || '').trim();
    if (!organizationId) throw requestError('请选择接收申请的组织', 'INVALID_REQUEST');
    const holder = await this.holderDidDirectoryService.registerFromWallet(input.registration || {});
    if (await this.repository.findPending(this.pool, organizationId, holder.did)) {
      throw requestError('已向该组织发送过待处理申请，请勿重复发送', 'REQUEST_ALREADY_PENDING');
    }
    const record = { id: randomUUID(), walletAccountId: walletAccount.id, organizationId, holderDid: holder.did,
      holderDisplayName: holder.displayName, message: String(input.message || '').trim().slice(0, 500), createdAt: new Date().toISOString() };
    if (!await this.repository.create(this.pool, record)) throw requestError('目标组织不存在或尚未审核通过', 'ORGANIZATION_UNAVAILABLE');
    return { id: record.id, organizationId, holderDid: record.holderDid, status: 'pending', createdAt: record.createdAt };
  }

  async list(context) { return { items: await this.repository.listForOrganization(this.pool, context.tenantId) }; }

  async decide(context, requestId, decision) {
    if (!['accepted', 'rejected'].includes(decision)) throw requestError('申请决定无效', 'INVALID_REQUEST');
    const request = await this.repository.findForOrganization(this.pool, requestId, context.tenantId);
    if (!request || request.status !== 'pending') throw requestError('申请不存在或已经处理', 'NOT_FOUND');
    let holder = null;
    if (decision === 'accepted') holder = await this.holderDidDirectoryService.linkToOrganization(context, { did: request.holderDid });
    if (!await this.repository.decide(this.pool, requestId, context.tenantId, context.actorId, decision, new Date().toISOString())) {
      throw requestError('申请已经被其他操作处理', 'VERSION_CONFLICT');
    }
    return { ...request, status: decision, holder };
  }
}

function requestError(message, code) { const error = new Error(message); error.code = code; return error; }
