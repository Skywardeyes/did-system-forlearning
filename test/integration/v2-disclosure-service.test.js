import assert from 'node:assert/strict';
import test from 'node:test';
import { V2DisclosureService } from '../../src/services/v2-disclosure-service.js';

const context = { tenantId: 'tenant-1', actorId: 'operator-1' };
class UnitOfWork { async run(contextValue, callback) { return callback({ context: contextValue, connection: {} }); } }
class CredentialRepository { async findById() { return { id: 'credential-1', status: 'active', validUntil: new Date(Date.now() + 86_400_000).toISOString() }; } }
class MaterialRepository {
  async findByCredentialId() { return { teachingMaterial: {
    claims: { 'credentialSubject.name': { salt: 's', value: 'Alice' }, 'credentialSubject.course': { salt: 'c', value: 'DID' }, 'credentialSubject.completionDate': { salt: 'd', value: '2026-07-13' } },
    manifest: { credentialId: 'credential-1', issuer: 'did:example:issuer', validFrom: '2026-07-13T00:00:00.000Z', validUntil: '2026-07-14T00:00:00.000Z', claimDigests: {} }, proof: { proofValue: 'signature' },
  }, sdJwtMaterial: { issuerJwt: 'header.payload.signature', disclosures: { 'credentialSubject.course': { disclosure: 'course-disclosure' } } } }; }
}
class LogRepository { constructor() { this.entries = []; } async append(_operation, entry) { this.entries.push(entry); return entry; } async list() { return { total: this.entries.length, items: this.entries }; } }

test('V2 disclosure service releases only selected claims and writes verification evidence', async () => {
  const logs = new LogRepository();
  const service = new V2DisclosureService({ unitOfWork: new UnitOfWork(), credentialRepository: new CredentialRepository(), disclosureMaterialRepository: new MaterialRepository(), verificationLogRepository: logs });
  const presentation = await service.createTeachingPresentation(context, 'credential-1', ['credentialSubject.course']);
  assert.deepEqual(presentation.disclosedClaims, [{ path: 'credentialSubject.course', salt: 'c', value: 'DID' }]);
  const sdJwt = await service.createSdJwtPresentation(context, 'credential-1', ['credentialSubject.course']);
  assert.equal(sdJwt, 'header.payload.signature~course-disclosure~');
  await service.recordVerification(context, { credentialId: 'credential-1', verificationKind: 'sd-jwt', valid: true, checks: [{ key: 'signature', passed: true }], disclosedPaths: ['credentialSubject.course'] });
  assert.equal(logs.entries[0].outcome, 'valid');
  assert.deepEqual(logs.entries[0].evidence.disclosedPaths, ['credentialSubject.course']);
});
