import { randomUUID } from 'node:crypto';
import { RepositoryNotFoundError } from '../repositories/repository-errors.js';

const ALLOWED_PURPOSES = new Set([
  'holder_review', 'issuer_support', 'verification_preparation', 'legal_audit', 'local_demo',
]);

export class V2CredentialAccessService {
  constructor({ unitOfWork, credentialRepository, sensitiveAccessLogRepository }) {
    this.unitOfWork = unitOfWork;
    this.credentialRepository = credentialRepository;
    this.sensitiveAccessLogRepository = sensitiveAccessLogRepository;
  }

  async readPlaintext(context, credentialId, purposeCode) {
    if (!ALLOWED_PURPOSES.has(purposeCode)) {
      const error = new Error('A supported sensitive-data access purpose is required');
      error.code = 'INVALID_ACCESS_PURPOSE';
      throw error;
    }
    return this.unitOfWork.run(context, async (operation) => {
      const record = await this.credentialRepository.findById(operation, credentialId);
      if (!record) throw new RepositoryNotFoundError('Credential was not found in the current tenant');
      await this.sensitiveAccessLogRepository.append(operation, {
        id: randomUUID(), tenantId: context.tenantId, actorId: context.actorId, credentialId,
        purposeCode, correlationId: context.requestId || null, occurredAt: new Date().toISOString(),
      });
      return { credentialId, purposeCode, credential: structuredClone(record.credential), accessedAt: new Date().toISOString() };
    });
  }

  async listAccessLogs(context, query) {
    return this.unitOfWork.run(context, (operation) => this.sensitiveAccessLogRepository.list(operation, query));
  }
}
