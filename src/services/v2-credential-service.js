import { randomUUID } from 'node:crypto';
import { RepositoryNotFoundError } from '../repositories/repository-errors.js';
import { base64UrlJson, createClaimDigest, createDisclosureSalt, createSdJwtDisclosure } from '../crypto.js';

const VC_CONTEXT = ['https://www.w3.org/ns/credentials/v2'];
const TRANSITIONS = Object.freeze({
  active: new Set(['suspended', 'replaced', 'revoked']),
  suspended: new Set(['active', 'replaced', 'revoked']),
  replaced: new Set(), revoked: new Set(), expired: new Set(),
});
const DISCLOSABLE_CLAIMS = ['credentialSubject.name', 'credentialSubject.course', 'credentialSubject.completionDate'];
const SD_JWT_CLAIMS = { 'credentialSubject.name': 'name', 'credentialSubject.course': 'course', 'credentialSubject.completionDate': 'completion_date' };

const clone = (value) => structuredClone(value);
const validRoles = (issuer, holder) => issuer?.status === 'active' && holder?.status === 'active'
  && issuer.role === 'issuer' && holder.role === 'holder';

function assertTenant(context) {
  if (!context?.tenantId) throw new Error('Credential operation requires a tenant context');
}

function normalizeIssueInput(input) {
  const subjectName = input?.subjectName?.trim();
  const course = input?.course?.trim();
  const completionDate = input?.completionDate;
  const validFrom = input?.validFrom || new Date().toISOString();
  const validUntil = input?.validUntil;
  if (!input?.issuerDid || !input?.holderDid) throw new Error('Issuer DID and holder DID are required');
  if (!subjectName || !course || !completionDate) throw new Error('Subject name, course and completion date are required');
  if (!validUntil || Number.isNaN(Date.parse(validFrom)) || Number.isNaN(Date.parse(validUntil)) || Date.parse(validUntil) <= Date.parse(validFrom)) {
    throw new Error('Credential validity period is invalid');
  }
  return { ...input, subjectName, course, completionDate, validFrom: new Date(validFrom).toISOString(), validUntil: new Date(validUntil).toISOString() };
}

function assertTransition(record, targetStatus) {
  const actual = new Date(record.validUntil).getTime() <= Date.now() ? 'expired' : record.status;
  if (!TRANSITIONS[actual]?.has(targetStatus)) throw new Error(`Credential cannot transition from ${actual} to ${targetStatus}`);
}

function toPublicRecord(record) {
  return {
    id: record.id, status: record.status, issuerDidId: record.issuerDidId, holderDidId: record.holderDidId,
    validFrom: record.validFrom, validUntil: record.validUntil, issuedAt: record.issuedAt,
    suspendedAt: record.suspendedAt, resumedAt: record.resumedAt, revokedAt: record.revokedAt,
    replacedAt: record.replacedAt, replacesCredentialId: record.replacesCredentialId,
    replacedByCredentialId: record.replacedByCredentialId, rowVersion: record.rowVersion,
    credential: clone(record.credential), selectiveDisclosureAvailable: true, sdJwtAvailable: true,
  };
}

function toSummaryRecord(record) {
  return {
    id: record.id, status: record.status, issuerDidId: record.issuerDidId, holderDidId: record.holderDidId,
    validFrom: record.validFrom, validUntil: record.validUntil, issuedAt: record.issuedAt,
    suspendedAt: record.suspendedAt, resumedAt: record.resumedAt, revokedAt: record.revokedAt,
    replacedAt: record.replacedAt, replacesCredentialId: record.replacesCredentialId,
    replacedByCredentialId: record.replacedByCredentialId, rowVersion: record.rowVersion,
    contentProtected: true, selectiveDisclosureAvailable: true, sdJwtAvailable: true,
  };
}

export class V2CredentialService {
  constructor({ unitOfWork, didRepository, didKeyVersionRepository, credentialRepository, credentialStatusEventRepository, disclosureMaterialRepository, kms }) {
    this.unitOfWork = unitOfWork;
    this.didRepository = didRepository;
    this.didKeyVersionRepository = didKeyVersionRepository;
    this.credentialRepository = credentialRepository;
    this.credentialStatusEventRepository = credentialStatusEventRepository;
    this.disclosureMaterialRepository = disclosureMaterialRepository;
    this.kms = kms;
  }

  async issueCredential(context, input) {
    assertTenant(context);
    const normalized = normalizeIssueInput(input);
    return this.unitOfWork.run(context, async (operation) => this.issueIntoOperation(operation, normalized));
  }

  async listCredentials(context, query) {
    assertTenant(context);
    return this.unitOfWork.run(context, async (operation) => {
      const result = await this.credentialRepository.list(operation, query);
      return { ...result, items: result.items.map(toSummaryRecord) };
    });
  }

  async suspendCredential(context, credentialId, input = {}) { return this.transition(context, credentialId, 'suspended', input); }
  async resumeCredential(context, credentialId, input = {}) { return this.transition(context, credentialId, 'active', input); }
  async revokeCredential(context, credentialId, input = {}) { return this.transition(context, credentialId, 'revoked', input); }

  async transition(context, credentialId, targetStatus, input) {
    assertTenant(context);
    return this.unitOfWork.run(context, async (operation) => {
      const current = await this.requireCredentialForUpdate(operation, credentialId);
      this.assertExpectedRowVersion(current, input.expectedRowVersion);
      assertTransition(current, targetStatus);
      const at = new Date().toISOString();
      const next = {
        ...current, status: targetStatus,
        suspendedAt: targetStatus === 'suspended' ? at : current.suspendedAt,
        resumedAt: targetStatus === 'active' ? at : current.resumedAt,
        revokedAt: targetStatus === 'revoked' ? at : current.revokedAt,
      };
      const saved = await this.credentialRepository.saveLifecycle(operation, next, current.rowVersion);
      await this.appendEvent(operation, saved.id, current.status, targetStatus, input.reason, at);
      return toSummaryRecord(saved);
    });
  }

  async replaceCredential(context, credentialId, input = {}) {
    assertTenant(context);
    return this.unitOfWork.run(context, async (operation) => {
      const previous = await this.requireCredentialForUpdate(operation, credentialId);
      this.assertExpectedRowVersion(previous, input.expectedRowVersion);
      assertTransition(previous, 'replaced');
      const issuanceInput = normalizeIssueInput({
        subjectName: input.subjectName ?? input.studentName ?? previous.credential.credentialSubject.name,
        course: input.course ?? input.courseName ?? previous.credential.credentialSubject.course,
        completionDate: input.completionDate ?? previous.credential.credentialSubject.completionDate,
        validUntil: input.validUntil ?? previous.credential.validUntil,
        validFrom: input.validFrom,
        issuerDid: previous.credential.issuer,
        holderDid: previous.credential.credentialSubject.id,
      });
      const replacement = await this.issueIntoOperation(operation, issuanceInput, previous.id);
      const at = new Date().toISOString();
      const replaced = await this.credentialRepository.saveLifecycle(operation, {
        ...previous, status: 'replaced', replacedAt: at, replacedByCredentialId: replacement.id,
      }, previous.rowVersion);
      await this.appendEvent(operation, replaced.id, previous.status, 'replaced', input.reason, at);
      return { replaced: toSummaryRecord(replaced), replacement: toPublicRecord(replacement) };
    });
  }

  async issueIntoOperation(operation, normalized, replacesCredentialId = null) {
    const issuerLookup = await this.didRepository.findByDid(operation, normalized.issuerDid);
    const holderLookup = await this.didRepository.findByDid(operation, normalized.holderDid);
    const issuer = issuerLookup && await this.didRepository.getForUpdate(operation, issuerLookup.id);
    const holder = holderLookup && await this.didRepository.getForUpdate(operation, holderLookup.id);
    if (!validRoles(issuer, holder)) throw new Error('Issuer and holder must be active DIDs with the correct roles');
    const key = await this.didKeyVersionRepository.findByDidVersion(operation, issuer.id, issuer.keyVersion, { forUpdate: true });
    if (!key || key.status !== 'active') throw new Error('Issuer signing key is unavailable');

    const issuedAt = new Date().toISOString();
    const id = `urn:uuid:${randomUUID()}`;
    const unsigned = {
      '@context': VC_CONTEXT, id, type: ['VerifiableCredential', 'TrainingCompletionCredential'], issuer: issuer.did,
      validFrom: normalized.validFrom, validUntil: normalized.validUntil,
      credentialSubject: {
        id: holder.did, name: normalized.subjectName, course: normalized.course,
        completionDate: normalized.completionDate, achievement: 'Completed',
      },
    };
    const proofValue = await this.kms.signPayload({ connection: operation.connection, keyId: key.kmsKeyId, payload: unsigned });
    const credential = {
      ...unsigned,
      proof: {
        type: 'EducationalEd25519Signature2026', cryptosuite: 'eddsa-stable-json-demo-2026', created: issuedAt,
        verificationMethod: key.verificationMethod, keyVersion: key.version, proofPurpose: 'assertionMethod', proofValue,
      },
    };
    const record = await this.credentialRepository.create(operation, {
      id, tenantId: operation.context.tenantId, issuerDidId: issuer.id, holderDidId: holder.id, status: 'active',
      validFrom: normalized.validFrom, validUntil: normalized.validUntil, issuedAt, suspendedAt: null, resumedAt: null,
      revokedAt: null, replacedAt: null, replacesCredentialId, replacedByCredentialId: null, credential,
    });
    if (this.disclosureMaterialRepository) {
      await this.disclosureMaterialRepository.upsert(operation, await this.createDisclosureMaterials(operation, record, key));
    }
    await this.appendEvent(operation, record.id, null, 'active', replacesCredentialId ? 'replacement-issued' : 'issued', issuedAt);
    return record;
  }

  async createDisclosureMaterials(operation, record, key) {
    const claims = Object.fromEntries(DISCLOSABLE_CLAIMS.map((path) => {
      const value = record.credential.credentialSubject[path.slice('credentialSubject.'.length)];
      return [path, { salt: createDisclosureSalt(), value }];
    }));
    const claimDigests = Object.fromEntries(Object.entries(claims).map(([path, claim]) => [path, createClaimDigest(path, claim.salt, claim.value)]));
    const manifest = { type: 'EducationalSelectiveDisclosureManifest2026', credentialId: record.id, issuer: record.credential.issuer,
      validFrom: record.validFrom, validUntil: record.validUntil, claimDigests };
    const proof = { type: 'EducationalSelectiveDisclosureProof2026', cryptosuite: 'eddsa-salted-claims-demo-2026', created: record.issuedAt,
      verificationMethod: key.verificationMethod, keyVersion: key.version, proofPurpose: 'assertionMethod',
      proofValue: await this.kms.signPayload({ connection: operation.connection, keyId: key.kmsKeyId, payload: manifest }) };
    const disclosures = Object.fromEntries(Object.entries(SD_JWT_CLAIMS).map(([path, claimName]) => [path,
      createSdJwtDisclosure(claimName, record.credential.credentialSubject[path.slice('credentialSubject.'.length)])]));
    const issuedSeconds = Math.floor(Date.parse(record.issuedAt) / 1000);
    const payload = { iss: record.credential.issuer, jti: record.id, iat: issuedSeconds, nbf: issuedSeconds,
      exp: Math.floor(Date.parse(record.validUntil) / 1000), vct: 'TrainingCompletionCredential', _sd_alg: 'sha-256', _sd: Object.values(disclosures).map((item) => item.digest) };
    const header = { alg: 'EdDSA', typ: 'vc+sd-jwt', kid: key.verificationMethod, keyVersion: key.version };
    const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
    const signature = await this.kms.signBytes({ connection: operation.connection, keyId: key.kmsKeyId, bytes: Buffer.from(signingInput) });
    return { credentialId: record.id, tenantId: operation.context.tenantId, updatedAt: record.issuedAt,
      teachingMaterial: { claims, manifest, proof }, sdJwtMaterial: { issuerJwt: `${signingInput}.${signature}`, disclosures } };
  }

  async requireCredentialForUpdate(operation, id) {
    const credential = await this.credentialRepository.getForUpdate(operation, id);
    if (!credential) throw new RepositoryNotFoundError('Credential was not found in the current tenant');
    return credential;
  }

  assertExpectedRowVersion(record, expectedRowVersion) {
    if (Number(expectedRowVersion) !== record.rowVersion) throw new Error('Credential version conflict');
  }

  async appendEvent(operation, credentialId, fromStatus, toStatus, reason, occurredAt) {
    await this.credentialStatusEventRepository.append(operation, {
      id: randomUUID(), tenantId: operation.context.tenantId, credentialId, fromStatus, toStatus,
      actorId: operation.context.actorId || null, reason: reason || null, occurredAt,
    });
  }
}
