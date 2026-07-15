import assert from 'node:assert/strict';
import test from 'node:test';
import { V2CredentialService } from '../../src/services/v2-credential-service.js';

const context = { tenantId: 'tenant-1', actorId: 'operator-1', requestId: 'request-1' };
const now = new Date();
const inOneDay = new Date(now.getTime() + 86_400_000).toISOString();

class UnitOfWork { async run(contextValue, callback) { return callback({ context: contextValue, connection: {} }); } }
class DidRepository {
  constructor(records) { this.records = new Map(records.map((record) => [record.id, structuredClone(record)])); }
  async findById(_operation, id) { return structuredClone(this.records.get(id) || null); }
  async findByDid(_operation, did) { return [...this.records.values()].find((record) => record.did === did) || null; }
  async getForUpdate(_operation, id) { return structuredClone(this.records.get(id) || null); }
}
class KeyRepository {
  async findByDidVersion(_operation, didId, version) {
    return didId === 'issuer-id' && version === 1
      ? { didId, version, kmsKeyId: 'kms-issuer-1', status: 'active', verificationMethod: 'did:example:issuer#key-1' }
      : null;
  }
}
class CredentialRepository {
  constructor() { this.records = new Map(); }
  async create(_operation, record) { const saved = { ...structuredClone(record), rowVersion: 1 }; this.records.set(saved.id, saved); return saved; }
  async getForUpdate(_operation, id) { return structuredClone(this.records.get(id) || null); }
  async findById(_operation, id) { return structuredClone(this.records.get(id) || null); }
  async saveLifecycle(_operation, record, expectedRowVersion) {
    const current = this.records.get(record.id); assert.equal(current.rowVersion, expectedRowVersion);
    const saved = { ...structuredClone(record), rowVersion: expectedRowVersion + 1 }; this.records.set(record.id, saved); return saved;
  }
  async list() { return { total: this.records.size, items: [...this.records.values()].map((record) => structuredClone(record)) }; }
}
class EventRepository { constructor() { this.events = []; } async append(_operation, event) { this.events.push(structuredClone(event)); return event; } }
class DisclosureMaterialRepository {
  constructor() { this.records = new Map(); }
  async upsert(_operation, material) { this.records.set(material.credentialId, structuredClone(material)); return material; }
  async findByCredentialId(_operation, id) { return structuredClone(this.records.get(id) || null); }
}
class Kms { constructor() { this.calls = []; } async signPayload({ keyId, payload }) { this.calls.push({ keyId, payload: structuredClone(payload) }); return 'signature-from-kms'; } async signBytes() { return 'jwt-signature-from-kms'; } }

function createService({ template = null } = {}) {
  const dids = [
    { id: 'issuer-id', did: 'did:example:issuer', role: 'issuer', status: 'active', keyVersion: 1, metadata: { name: '签发身份' } },
    { id: 'holder-id', did: 'did:example:holder', role: 'holder', status: 'active', keyVersion: 1, metadata: { name: '张同学' } },
  ];
  const credentialRepository = new CredentialRepository(); const events = new EventRepository(); const kms = new Kms(); const materials = new DisclosureMaterialRepository();
  return {
    service: new V2CredentialService({ unitOfWork: new UnitOfWork(), didRepository: new DidRepository(dids),
      didKeyVersionRepository: new KeyRepository(), credentialRepository, credentialStatusEventRepository: events, disclosureMaterialRepository: materials, kms,
      organizationRepository: { async findById() { return { id: 'tenant-1', name: '上海大学' }; } },
      credentialTemplateRepository: template ? { async findById(_operation, id) { return id === template.id ? structuredClone(template) : null; } } : null }),
    credentialRepository, events, kms, materials,
  };
}

function issueInput() {
  return { issuerDid: 'did:example:issuer', holderDid: 'did:example:holder', subjectName: '张同学', course: 'DID 与 VC', completionDate: '2026-07-13', validUntil: inOneDay };
}

test('V2 credential issuance signs through KMS and creates an append-only status event', async () => {
  const { service, credentialRepository, events, kms } = createService();
  const issued = await service.issueCredential(context, issueInput());
  assert.match(issued.id, /^urn:uuid:/);
  assert.equal(issued.status, 'active');
  assert.equal(issued.credential.proof.proofValue, 'signature-from-kms');
  assert.equal(kms.calls[0].keyId, 'kms-issuer-1');
  assert.equal('proof' in kms.calls[0].payload, false);
  assert.equal(credentialRepository.records.get(issued.id).rowVersion, 1);
  assert.deepEqual(events.events.map((event) => [event.fromStatus, event.toStatus]), [[null, 'active']]);
});

test('V2 credential lifecycle uses valid transitions and optimistic versions', async () => {
  const { service, events } = createService();
  const issued = await service.issueCredential(context, issueInput());
  const suspended = await service.suspendCredential(context, issued.id, { expectedRowVersion: 1, reason: 'review' });
  assert.equal(suspended.status, 'suspended');
  const resumed = await service.resumeCredential(context, issued.id, { expectedRowVersion: 2 });
  assert.equal(resumed.status, 'active');
  const revoked = await service.revokeCredential(context, issued.id, { expectedRowVersion: 3 });
  assert.equal(revoked.status, 'revoked');
  await assert.rejects(() => service.resumeCredential(context, issued.id, { expectedRowVersion: 4 }), /cannot transition/);
  assert.deepEqual(events.events.map((event) => event.toStatus), ['active', 'suspended', 'active', 'revoked']);
});

test('V2 replacement links old and new credentials within one unit of work', async () => {
  const { service } = createService();
  const issued = await service.issueCredential(context, issueInput());
  const result = await service.replaceCredential(context, issued.id, { ...issueInput(), expectedRowVersion: 1, course: 'DID 与 VC（补发）' });
  assert.equal(result.replaced.status, 'replaced');
  assert.equal(result.replacement.status, 'active');
  assert.equal(result.replaced.replacedByCredentialId, result.replacement.id);
  assert.equal(result.replacement.replacesCredentialId, issued.id);
});

test('V2 issuer can create a holder wallet delivery package without any Holder private key', async () => {
  const { service } = createService();
  const issued = await service.issueCredential(context, issueInput());
  const walletPackage = await service.createWalletPackage(context, issued.id);
  assert.equal(walletPackage.format, 'wallet-vc-package-v1');
  assert.equal(walletPackage.holderDid, 'did:example:holder');
  assert.equal(walletPackage.credential.credentialSubject.id, walletPackage.holderDid);
  assert.ok(walletPackage.sdJwt.disclosures['credentialSubject.course']);
  const payload = JSON.parse(Buffer.from(walletPackage.sdJwt.issuerJwt.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(payload.sub, walletPackage.holderDid);
  assert.equal(JSON.stringify(walletPackage).includes('privateJwk'), false);
});

test('V2 issuer signs arbitrary template claims and emits a dynamic wallet package', async () => {
  const template = { id: 'template-1', name: '大学毕业证书', credentialType: 'UniversityDegreeCredential', version: 3,
    status: 'published', schemaHash: 'a'.repeat(64), schema: { fields: [
      { key: 'degree', label: '学历层次', type: 'enum', required: true, order: 1, options: ['本科', '硕士'] },
      { key: 'major', label: '专业', type: 'string', required: true, order: 2 },
      { key: 'gpa', label: '绩点', type: 'number', required: false, order: 3 },
    ] } };
  const { service } = createService({ template });
  const issued = await service.issueCredential(context, { templateId: template.id, issuerDid: 'did:example:issuer', holderDid: 'did:example:holder',
    claims: { degree: '本科', major: '计算机科学' }, validUntil: inOneDay });
  assert.deepEqual(issued.credential.credentialSubject, { id: 'did:example:holder', degree: '本科', major: '计算机科学' });
  assert.equal(issued.credential.credentialSchema.version, 3);
  const walletPackage = await service.createWalletPackage(context, issued.id);
  assert.equal(walletPackage.format, 'wallet-vc-package-v2');
  assert.equal(walletPackage.display.issuerName, '上海大学');
  assert.equal(walletPackage.display.credentialName, template.name);
  assert.deepEqual(walletPackage.display.fields.map((field) => field.key), ['degree', 'major']);
  assert.equal(walletPackage.sdJwt.disclosures['credentialSubject.gpa'], undefined);
  const payload = JSON.parse(Buffer.from(walletPackage.sdJwt.issuerJwt.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(payload.schema_id, template.id);
  assert.equal(payload.schema_version, 3);
});

test('credential list exposes a readable issuance log without returning credential bodies', async () => {
  const template = { id: 'template-1', name: '大学毕业证明', credentialType: 'UniversityDegreeCredential', version: 2,
    status: 'published', schemaHash: 'b'.repeat(64), schema: { fields: [{ key: 'major', label: '专业', type: 'string', required: true, order: 1 }] } };
  const { service } = createService({ template });
  await service.issueCredential(context, { templateId: template.id, issuerDid: 'did:example:issuer', holderDid: 'did:example:holder',
    claims: { major: '计算机科学' }, validUntil: inOneDay });
  const page = await service.listCredentials(context, { page: 1, pageSize: 20 });
  assert.equal(page.items[0].templateName, '大学毕业证明');
  assert.equal(page.items[0].credentialType, 'UniversityDegreeCredential');
  assert.equal(page.items[0].issuerName, '签发身份');
  assert.equal(page.items[0].holderName, '张同学');
  assert.equal(page.items[0].holderDid, 'did:example:holder');
  assert.equal('credential' in page.items[0], false);
});
