import { randomUUID } from 'node:crypto';
import { RepositoryNotFoundError } from '../repositories/repository-errors.js';
import { base64UrlJson, createClaimDigest, createDisclosureSalt, createSdJwtDisclosure } from '../crypto.js';
import { normalizeClaims, safeDisclosurePath } from '../credential-template-schema.js';

const VC_CONTEXT = ['https://www.w3.org/ns/credentials/v2'];
const TRANSITIONS = Object.freeze({
  active: new Set(['suspended', 'replaced', 'revoked']),
  suspended: new Set(['active', 'replaced', 'revoked']),
  replaced: new Set(), revoked: new Set(), expired: new Set(),
});
const LEGACY_FIELDS = Object.freeze([
  { key: 'name', label: '学员姓名', type: 'string', required: true, order: 1 },
  { key: 'course', label: '课程', type: 'string', required: true, order: 2 },
  { key: 'completionDate', label: '完成日期', type: 'date', required: true, order: 3 },
]);

const clone = (value) => structuredClone(value);
const validRoles = (issuer, holder) => issuer?.status === 'active' && holder?.status === 'active'
  && issuer.role === 'issuer' && holder.role === 'holder';

function assertTenant(context) {
  if (!context?.tenantId) throw new Error('Credential operation requires a tenant context');
}

function normalizeIssueInput(input) {
  const validFrom = input?.validFrom || new Date().toISOString();
  const validUntil = input?.validUntil;
  if (!input?.issuerDid || !input?.holderDid) throw new Error('Issuer DID and holder DID are required');
  if (!validUntil || Number.isNaN(Date.parse(validFrom)) || Number.isNaN(Date.parse(validUntil)) || Date.parse(validUntil) <= Date.parse(validFrom)) {
    throw new Error('Credential validity period is invalid');
  }
  return { ...input, validFrom: new Date(validFrom).toISOString(), validUntil: new Date(validUntil).toISOString() };
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
    templateId: record.templateId || null, templateVersion: record.templateVersion || null, schemaHash: record.schemaHash || null,
    credential: clone(record.credential), selectiveDisclosureAvailable: true, sdJwtAvailable: true,
  };
}

function toSummaryRecord(record, display = {}) {
  return {
    id: record.id, status: record.status, issuerDidId: record.issuerDidId, holderDidId: record.holderDidId,
    validFrom: record.validFrom, validUntil: record.validUntil, issuedAt: record.issuedAt,
    suspendedAt: record.suspendedAt, resumedAt: record.resumedAt, revokedAt: record.revokedAt,
    replacedAt: record.replacedAt, replacesCredentialId: record.replacesCredentialId,
    replacedByCredentialId: record.replacedByCredentialId, rowVersion: record.rowVersion,
    templateId: record.templateId || null, templateVersion: record.templateVersion || null, schemaHash: record.schemaHash || null,
    templateName: display.templateName || (record.templateId ? '未命名凭证模板' : '通用凭证'),
    credentialType: display.credentialType || null,
    issuerName: display.issuerName || '未命名签发方', issuerDid: display.issuerDid || null,
    holderName: display.holderName || '未命名持有人', holderDid: display.holderDid || null,
    contentProtected: true, selectiveDisclosureAvailable: true, sdJwtAvailable: true,
  };
}

export class V2CredentialService {
  constructor({ unitOfWork, didRepository, didKeyVersionRepository, credentialRepository, credentialStatusEventRepository,
    disclosureMaterialRepository, walletOfferRepository = null, credentialTemplateRepository = null, organizationRepository = null,
    publicTrustRepository = null, kms }) {
    this.unitOfWork = unitOfWork;
    this.didRepository = didRepository;
    this.didKeyVersionRepository = didKeyVersionRepository;
    this.credentialRepository = credentialRepository;
    this.credentialStatusEventRepository = credentialStatusEventRepository;
    this.disclosureMaterialRepository = disclosureMaterialRepository;
    this.walletOfferRepository = walletOfferRepository;
    this.credentialTemplateRepository = credentialTemplateRepository;
    this.organizationRepository = organizationRepository;
    this.publicTrustRepository = publicTrustRepository;
    this.kms = kms;
  }

  async issueCredential(context, input) {
    assertTenant(context);
    return this.unitOfWork.run(context, async (operation) => toPublicRecord(
      await this.issueIntoOperation(operation, await this.resolveIssuance(operation, input)),
    ));
  }

  async listCredentials(context, query) {
    assertTenant(context);
    return this.unitOfWork.run(context, async (operation) => {
      const result = await this.credentialRepository.list(operation, query);
      const items = await Promise.all(result.items.map(async (record) => {
        const [issuer, holder, template] = await Promise.all([
          this.didRepository.findById(operation, record.issuerDidId),
          this.didRepository.findById(operation, record.holderDidId),
          record.templateId && this.credentialTemplateRepository
            ? this.credentialTemplateRepository.findById(operation, record.templateId)
            : null,
        ]);
        return toSummaryRecord(record, {
          templateName: template?.name, credentialType: template?.credentialType,
          issuerName: issuer?.metadata?.name, issuerDid: issuer?.did,
          holderName: holder?.metadata?.name, holderDid: holder?.did,
        });
      }));
      return { ...result, items };
    });
  }

  async createWalletPackage(context, credentialId) {
    assertTenant(context);
    return this.unitOfWork.run(context, async (operation) => {
      const record = await this.credentialRepository.findById(operation, credentialId);
      if (!record) throw new RepositoryNotFoundError('Credential was not found in the current tenant');
      const actualStatus = new Date(record.validUntil).getTime() <= Date.now() ? 'expired' : record.status;
      if (actualStatus !== 'active') throw new Error(`Credential is ${actualStatus} and cannot be delivered to a wallet`);
      const material = await this.disclosureMaterialRepository?.findByCredentialId(operation, credentialId);
      const disclosures = material?.sdJwtMaterial?.disclosures;
      if (!material?.sdJwtMaterial?.issuerJwt || !disclosures) throw new Error('Credential has no SD-JWT wallet delivery material');
      return this.walletPackage(record, material);
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
      await this.publicTrustRepository?.publishCredentialStatus(operation, saved, current.credential.issuer, at);
      return toSummaryRecord(saved);
    });
  }

  async replaceCredential(context, credentialId, input = {}) {
    assertTenant(context);
    return this.unitOfWork.run(context, async (operation) => {
      const previous = await this.requireCredentialForUpdate(operation, credentialId);
      this.assertExpectedRowVersion(previous, input.expectedRowVersion);
      assertTransition(previous, 'replaced');
      const previousClaims = Object.fromEntries(Object.entries(previous.credential.credentialSubject).filter(([key]) => key !== 'id'));
      const issuanceInput = await this.resolveIssuance(operation, {
        templateId: input.templateId ?? previous.templateId,
        claims: input.claims ?? previousClaims,
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
      await this.publicTrustRepository?.publishCredentialStatus(operation, replaced, previous.credential.issuer, at);
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
    const organization = this.organizationRepository
      ? await this.organizationRepository.findById(operation, operation.context.tenantId) : null;
    const issuerName = organization?.name || issuer.metadata?.name || issuer.did;

    const issuedAt = new Date().toISOString();
    const id = `urn:uuid:${randomUUID()}`;
    const unsigned = {
      '@context': VC_CONTEXT, id, type: ['VerifiableCredential', normalized.credentialType], issuer: issuer.did,
      validFrom: normalized.validFrom, validUntil: normalized.validUntil,
      ...(normalized.templateId ? { credentialSchema: { id: `urn:uuid:${normalized.templateId}`, type: 'JsonSchema',
        version: normalized.templateVersion, digest: normalized.schemaHash } } : {}),
      credentialSubject: { id: holder.did, ...clone(normalized.claims) },
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
      id, tenantId: operation.context.tenantId, issuerDidId: issuer.id, holderDidId: holder.id,
      templateId: normalized.templateId, templateVersion: normalized.templateVersion, schemaHash: normalized.schemaHash, status: 'active',
      validFrom: normalized.validFrom, validUntil: normalized.validUntil, issuedAt, suspendedAt: null, resumedAt: null,
      revokedAt: null, replacedAt: null, replacesCredentialId, replacedByCredentialId: null, credential,
      definition: { fields: normalized.fields, name: normalized.name, credentialType: normalized.credentialType, packageVersion: normalized.packageVersion },
    });
    let materials = null;
    if (this.disclosureMaterialRepository) { materials = await this.createDisclosureMaterials(operation, record, key, issuerName); await this.disclosureMaterialRepository.upsert(operation, materials); }
    if (this.walletOfferRepository && materials) await this.walletOfferRepository.create(operation, {
      id: randomUUID(), credentialId: record.id, holderDid: holder.did, createdAt: issuedAt,
      delivery: this.walletPackage(record, materials),
    });
    await this.appendEvent(operation, record.id, null, 'active', replacesCredentialId ? 'replacement-issued' : 'issued', issuedAt);
    await this.publicTrustRepository?.publishCredentialStatus(operation, record, issuer.did, issuedAt);
    return record;
  }

  walletPackage(record, material) {
    const version = material.sdJwtMaterial.display?.packageVersion || 1;
    return { format: `wallet-vc-package-v${version}`, version, createdAt: new Date().toISOString(), credentialId: record.id,
      holderDid: record.credential.credentialSubject.id, issuerDid: record.credential.issuer, credential: clone(record.credential),
      ...(material.sdJwtMaterial.display ? { display: clone(material.sdJwtMaterial.display) } : {}),
      sdJwt: { issuerJwt: material.sdJwtMaterial.issuerJwt,
        disclosures: Object.fromEntries(Object.entries(material.sdJwtMaterial.disclosures).map(([path, entry]) => [path, entry.disclosure])) } };
  }

  async createDisclosureMaterials(operation, record, key, issuerName = record.credential.issuer) {
    const definition = record.definition;
    const issuedFields = definition.fields.filter((field) => Object.hasOwn(record.credential.credentialSubject, field.key));
    const claims = Object.fromEntries(issuedFields.map((field) => {
      const path = safeDisclosurePath(field.key); const value = record.credential.credentialSubject[field.key];
      return [path, { salt: createDisclosureSalt(), value }];
    }));
    const claimDigests = Object.fromEntries(Object.entries(claims).map(([path, claim]) => [path, createClaimDigest(path, claim.salt, claim.value)]));
    const manifest = { type: 'EducationalSelectiveDisclosureManifest2026', credentialId: record.id, issuer: record.credential.issuer,
      validFrom: record.validFrom, validUntil: record.validUntil, claimDigests };
    const proof = { type: 'EducationalSelectiveDisclosureProof2026', cryptosuite: 'eddsa-salted-claims-demo-2026', created: record.issuedAt,
      verificationMethod: key.verificationMethod, keyVersion: key.version, proofPurpose: 'assertionMethod',
      proofValue: await this.kms.signPayload({ connection: operation.connection, keyId: key.kmsKeyId, payload: manifest }) };
    const disclosures = Object.fromEntries(issuedFields.map((field) => {
      const path = safeDisclosurePath(field.key); return [path, createSdJwtDisclosure(field.key, record.credential.credentialSubject[field.key])];
    }));
    const issuedSeconds = Math.floor(Date.parse(record.issuedAt) / 1000);
    const payload = { iss: record.credential.issuer, sub: record.credential.credentialSubject.id, jti: record.id, iat: issuedSeconds, nbf: issuedSeconds,
      exp: Math.floor(Date.parse(record.validUntil) / 1000), vct: definition.credentialType,
      ...(record.templateId ? { schema_id: record.templateId, schema_version: record.templateVersion, schema_hash: record.schemaHash } : {}),
      _sd_alg: 'sha-256', _sd: Object.values(disclosures).map((item) => item.digest) };
    const header = { alg: 'EdDSA', typ: 'vc+sd-jwt', kid: key.verificationMethod, keyVersion: key.version };
    const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
    const signature = await this.kms.signBytes({ connection: operation.connection, keyId: key.kmsKeyId, bytes: Buffer.from(signingInput) });
    return { credentialId: record.id, tenantId: operation.context.tenantId, updatedAt: record.issuedAt,
      teachingMaterial: { claims, manifest, proof }, sdJwtMaterial: { issuerJwt: `${signingInput}.${signature}`, disclosures,
        display: { packageVersion: definition.packageVersion, issuerName, credentialName: definition.name, credentialType: definition.credentialType,
          schemaId: record.templateId, schemaVersion: record.templateVersion, schemaHash: record.schemaHash,
          fields: issuedFields.map((field) => ({ ...field, path: safeDisclosurePath(field.key) })) } } };
  }

  async resolveIssuance(operation, input) {
    const base = normalizeIssueInput(input);
    if (base.templateId) {
      if (!this.credentialTemplateRepository) throw new Error('Credential templates are not configured');
      const template = await this.credentialTemplateRepository.findById(operation, String(base.templateId));
      if (!template || template.status !== 'published') throw new Error('A published credential template is required');
      const claims = normalizeClaims(template.schema, base.claims);
      return { ...base, claims, fields: template.schema.fields, name: template.name, credentialType: template.credentialType,
        templateId: template.id, templateVersion: template.version, schemaHash: template.schemaHash, packageVersion: 2 };
    }
    const claims = normalizeClaims({ fields: LEGACY_FIELDS }, { name: base.subjectName, course: base.course, completionDate: base.completionDate });
    return { ...base, claims, fields: LEGACY_FIELDS, name: '培训结业凭证', credentialType: 'TrainingCompletionCredential',
      templateId: null, templateVersion: null, schemaHash: null, packageVersion: 1 };
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
