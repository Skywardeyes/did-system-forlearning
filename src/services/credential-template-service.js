import { randomUUID } from 'node:crypto';
import { normalizeTemplateSchema } from '../credential-template-schema.js';

export class CredentialTemplateService {
  constructor({ unitOfWork, repository }) { this.unitOfWork = unitOfWork; this.repository = repository; }

  async create(context, input) {
    const normalized = normalizeTemplateSchema(input); const createdAt = new Date().toISOString();
    return this.unitOfWork.run(context, async (operation) => {
      const version = await this.repository.nextVersion(operation, normalized.name);
      return this.repository.create(operation, {
        id: randomUUID(), name: normalized.name, credentialType: normalized.credentialType, version,
        schema: { name: normalized.name, credentialType: normalized.credentialType, fields: normalized.fields }, schemaHash: normalized.schemaHash, createdAt,
      });
    });
  }

  async list(context, query) { return this.unitOfWork.run(context, (operation) => this.repository.list(operation, query)); }

  async publish(context, id) {
    return this.unitOfWork.run(context, async (operation) => {
      const record = await this.repository.findById(operation, id, { forUpdate: true });
      if (!record || record.status !== 'draft') throw new Error('Only a draft credential template can be published');
      const at = new Date().toISOString();
      if (!await this.repository.setStatus(operation, id, 'draft', 'published', at)) throw new Error('Credential template status conflict');
      return { ...record, status: 'published', publishedAt: at };
    });
  }

  async retire(context, id) {
    return this.unitOfWork.run(context, async (operation) => {
      const record = await this.repository.findById(operation, id, { forUpdate: true });
      if (!record || record.status !== 'published') throw new Error('Only a published credential template can be retired');
      const at = new Date().toISOString();
      if (!await this.repository.setStatus(operation, id, 'published', 'retired', at)) throw new Error('Credential template status conflict');
      return { ...record, status: 'retired', retiredAt: at };
    });
  }

  async delete(context, id) {
    return this.unitOfWork.run(context, async (operation) => {
      const record = await this.repository.findById(operation, id, { forUpdate: true });
      if (!record) throw new Error('Credential template was not found');
      if (record.status !== 'draft') throw new Error('Only a draft credential template can be deleted');
      if (!await this.repository.deleteDraft(operation, id)) throw new Error('Credential template delete conflict');
      return { id, deleted: true };
    });
  }
}
