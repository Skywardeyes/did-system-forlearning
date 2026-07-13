import { randomUUID } from 'node:crypto';
import { RepositoryNotFoundError } from '../repositories/repository-errors.js';

const DISCLOSABLE_CLAIMS = new Set(['credentialSubject.name', 'credentialSubject.course', 'credentialSubject.completionDate']);

function selected(paths) {
  const unique = [...new Set(Array.isArray(paths) ? paths : [])];
  if (!unique.length) throw new Error('At least one disclosure path is required');
  if (unique.some((path) => !DISCLOSABLE_CLAIMS.has(path))) throw new Error('The requested disclosure path is not allowed');
  return unique;
}

function assertPresentationAllowed(record) {
  const effectiveStatus = Date.parse(record.validUntil) <= Date.now() && !['replaced', 'revoked'].includes(record.status) ? 'expired' : record.status;
  if (effectiveStatus !== 'active') throw new Error(`Credential is ${effectiveStatus} and cannot create a disclosure presentation`);
}

export class V2DisclosureService {
  constructor({ unitOfWork, credentialRepository, disclosureMaterialRepository, verificationLogRepository }) {
    this.unitOfWork = unitOfWork;
    this.credentialRepository = credentialRepository;
    this.disclosureMaterialRepository = disclosureMaterialRepository;
    this.verificationLogRepository = verificationLogRepository;
  }

  async createTeachingPresentation(context, credentialId, paths) {
    const disclosurePaths = selected(paths);
    return this.unitOfWork.run(context, async (operation) => {
      const record = await this.credentialRepository.findById(operation, credentialId);
      if (!record) throw new RepositoryNotFoundError('Credential was not found in the current tenant');
      assertPresentationAllowed(record);
      const material = await this.disclosureMaterialRepository.findByCredentialId(operation, credentialId);
      if (!material?.teachingMaterial) throw new Error('Credential has no teaching disclosure material');
      const { claims, manifest, proof } = material.teachingMaterial;
      return {
        type: 'EducationalSelectiveDisclosurePresentation2026', credentialId: manifest.credentialId, issuer: manifest.issuer,
        validFrom: manifest.validFrom, validUntil: manifest.validUntil,
        disclosedClaims: disclosurePaths.map((path) => ({ path, ...structuredClone(claims[path]) })),
        claimDigests: structuredClone(manifest.claimDigests), proof: structuredClone(proof),
      };
    });
  }

  async createSdJwtPresentation(context, credentialId, paths) {
    const disclosurePaths = selected(paths);
    return this.unitOfWork.run(context, async (operation) => {
      const record = await this.credentialRepository.findById(operation, credentialId);
      if (!record) throw new RepositoryNotFoundError('Credential was not found in the current tenant');
      assertPresentationAllowed(record);
      const material = await this.disclosureMaterialRepository.findByCredentialId(operation, credentialId);
      if (!material?.sdJwtMaterial) throw new Error('Credential has no SD-JWT disclosure material');
      const disclosures = disclosurePaths.map((path) => material.sdJwtMaterial.disclosures[path]?.disclosure);
      if (disclosures.some((item) => !item)) throw new Error('SD-JWT disclosure material is incomplete');
      return `${material.sdJwtMaterial.issuerJwt}~${disclosures.join('~')}~`;
    });
  }

  async recordVerification(context, { credentialId = null, verificationKind, valid, checks = [], disclosedPaths = [] }) {
    if (!verificationKind) throw new Error('Verification kind is required');
    return this.unitOfWork.run(context, async (operation) => {
      const occurredAt = new Date().toISOString();
      return this.verificationLogRepository.append(operation, {
        id: randomUUID(), tenantId: operation.context.tenantId, credentialId, verificationKind,
        outcome: valid ? 'valid' : 'invalid', occurredAt,
        evidence: { checks: structuredClone(checks), disclosedPaths: structuredClone(disclosedPaths) },
      });
    });
  }

  async listVerificationEvidence(context, query) {
    return this.unitOfWork.run(context, (operation) => this.verificationLogRepository.list(operation, query));
  }
}
