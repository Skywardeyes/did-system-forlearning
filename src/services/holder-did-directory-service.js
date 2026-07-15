import { randomUUID } from 'node:crypto';
import { AuthorizationError } from '../auth/request-authenticator.js';
import { assertSelfCustodyDocument } from './v2-did-service.js';

export class HolderDidDirectoryService {
  constructor({ pool, repository, didService }) { this.pool = pool; this.repository = repository; this.didService = didService; }

  async register(context, input = {}) {
    if (!await this.repository.isPersonalWorkspaceOwner(this.pool, context.tenantId, context.actorId)) {
      throw new AuthorizationError('Holder DID must be registered from its owner personal workspace');
    }
    const selfCustody = assertSelfCustodyDocument(input);
    const displayName = String(input.name || '我的 Holder DID').trim();
    const existing = await this.repository.findByDid(this.pool, selfCustody.did);
    if (existing) {
      if (existing.userId !== context.actorId) throw new AuthorizationError('This Holder DID is already controlled by another account');
      return existing;
    }
    const createdAt = new Date().toISOString();
    const record = { id: randomUUID(), userId: context.actorId, did: selfCustody.did, displayName,
      document: selfCustody.document, status: 'active', createdAt, updatedAt: createdAt };
    await this.repository.create(this.pool, record); return record;
  }

  async listMine(context) {
    return { items: await this.repository.listByUser(this.pool, context.actorId) };
  }

  async linkToOrganization(context, input = {}) {
    const did = String(input.did || '').trim(); const record = await this.repository.findByDid(this.pool, did);
    if (!record || record.status !== 'active') { const error = new Error('Holder DID is not published or active'); error.code = 'NOT_FOUND'; throw error; }
    return this.didService.registerExternalHolderDid(context, { name: record.displayName, did: record.did, document: record.document });
  }
}
