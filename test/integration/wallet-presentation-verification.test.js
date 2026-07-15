import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { V2VerificationService } from '../../src/services/v2-verification-service.js';
import { createSdJwtDisclosure, signCompactJwt } from '../../src/crypto.js';
import { createIdentity, createMultiWalletPresentation, createWalletPresentation } from '../../wallet/wallet-core.js';

const context = { tenantId: 'tenant-1', actorId: 'verifier-1', requestId: 'request-1' };
class UnitOfWork { async run(contextValue, callback) { return callback({ context: contextValue, connection: {} }); } }
class DidRepository {
  constructor(records) { this.records = records; }
  async findByDid(_operation, did) { return structuredClone(this.records.find((item) => item.did === did) || null); }
}
class KeyRepository { constructor(key) { this.key = key; } async findByDidVersion(_operation, didId) { return didId === 'issuer-id' ? this.key : null; } }
class CredentialRepository {
  constructor(records) { this.records = Array.isArray(records) ? records : [records]; }
  async findById(_operation, id) { return structuredClone(this.records.find((record) => id === record.id) || null); }
}
class LogRepository { constructor() { this.entries = []; } async append(_operation, entry) { this.entries.push(entry); return entry; } }
class ChallengeRepository {
  constructor() { this.consumed = false; this.issued = []; }
  async issue(_operation, entry) { this.issued.push(entry); return entry; }
  async consume(_operation, input) { if (this.consumed || input.domain !== 'hr.example.com') return false; this.consumed = true; return true; }
}
class PresentationRepository {
  constructor() { this.started = null; this.completed = null; }
  async begin(_operation, record) { this.started = structuredClone(record); return record; }
  async complete(_operation, id, outcome, items) { this.completed = { id, outcome, items: structuredClone(items) }; }
}

test('Verifier issues a short-lived Challenge while storing only its hash', async () => {
  const challenges = new ChallengeRepository();
  const service = new V2VerificationService({ unitOfWork: new UnitOfWork(), verifierChallengeRepository: challenges });
  const issued = await service.issueWalletChallenge(context, { domain: 'HR.Example.com', ttlSeconds: 120 });
  assert.equal(issued.domain, 'hr.example.com');
  assert.equal(issued.challenge.length >= 32, true);
  assert.equal(challenges.issued.length, 1);
  assert.notEqual(challenges.issued[0].challengeHash, issued.challenge);
  assert.equal(challenges.issued[0].challengeHash.length, 64);
});

test('Verifier validates an issuer SD-JWT plus the Holder wallet local signature without receiving a Holder private key', async () => {
  const holder = await createIdentity('Wallet Holder');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const issuerPublic = publicKey.export({ format: 'jwk' }); const issuerPrivate = privateKey.export({ format: 'jwk' });
  const issuerDid = 'did:example:issuer'; const credentialId = 'urn:uuid:wallet-vc-1';
  const disclosure = createSdJwtDisclosure('course', 'DID 与 VC');
  const now = Math.floor(Date.now() / 1000);
  const issuerJwt = signCompactJwt({ alg: 'EdDSA', typ: 'vc+sd-jwt', kid: `${issuerDid}#key-1`, keyVersion: 1 }, {
    iss: issuerDid, sub: holder.did, jti: credentialId, iat: now, nbf: now - 1, exp: now + 3600,
    vct: 'TrainingCompletionCredential', _sd_alg: 'sha-256', _sd: [disclosure.digest],
  }, issuerPrivate);
  const walletPackage = { format: 'wallet-vc-package-v1', credentialId, holderDid: holder.did,
    credential: { credentialSubject: { id: holder.did }, proof: { proofValue: 'issuer-signature' } },
    sdJwt: { issuerJwt, disclosures: { 'credentialSubject.course': disclosure.disclosure } } };
  const presentation = await createWalletPresentation({ identity: holder, walletPackage, paths: ['credentialSubject.course'], challenge: 'verifier-challenge-1234', domain: 'hr.example.com' });
  const logs = new LogRepository(); const challenges = new ChallengeRepository();
  const service = new V2VerificationService({ unitOfWork: new UnitOfWork(),
    didRepository: new DidRepository([
      { id: 'issuer-id', did: issuerDid, role: 'issuer', status: 'active', document: {} },
      { id: 'holder-id', did: holder.did, role: 'holder', status: 'active', metadata: { keyCustody: 'holder_self_custody' }, document: holder.document },
    ]),
    didKeyVersionRepository: new KeyRepository({ version: 1, verificationMethod: `${issuerDid}#key-1`, publicJwk: issuerPublic }),
    credentialRepository: new CredentialRepository({ id: credentialId, status: 'active', validUntil: new Date(Date.now() + 3600_000).toISOString() }),
    verificationLogRepository: logs, verifierChallengeRepository: challenges,
  });
  const result = await service.verifyWalletPresentation(context, presentation);
  assert.equal(result.valid, true);
  assert.equal(result.checks.find((item) => item.key === 'holderProof').passed, true);
  assert.equal(result.checks.find((item) => item.key === 'holderSubject').passed, true);
  assert.equal(JSON.stringify(presentation).includes('privateKey'), false);
  assert.equal(logs.entries.at(-1).verificationKind, 'wallet-sd-jwt');
  const replay = await service.verifyWalletPresentation(context, presentation);
  assert.equal(replay.valid, false);
  assert.equal(replay.checks.find((item) => item.key === 'challenge').passed, false);
});

test('Verifier validates multiple selectively disclosed credentials as one holder-bound presentation', async () => {
  const holder = await createIdentity('Wallet Holder');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const issuerPublic = publicKey.export({ format: 'jwk' }); const issuerPrivate = privateKey.export({ format: 'jwk' });
  const issuerDid = 'did:example:issuer'; const now = Math.floor(Date.now() / 1000);
  const makePackage = (credentialId, name, value) => {
    const disclosure = createSdJwtDisclosure(name, value);
    const issuerJwt = signCompactJwt({ alg: 'EdDSA', typ: 'vc+sd-jwt', kid: `${issuerDid}#key-1`, keyVersion: 1 }, {
      iss: issuerDid, sub: holder.did, jti: credentialId, iat: now, nbf: now - 1, exp: now + 3600,
      vct: 'EvidenceCredential', _sd_alg: 'sha-256', _sd: [disclosure.digest],
    }, issuerPrivate);
    return { format: 'wallet-vc-package-v2', credentialId, holderDid: holder.did,
      sdJwt: { issuerJwt, disclosures: { [`credentialSubject.${name}`]: disclosure.disclosure } } };
  };
  const packageA = makePackage('urn:uuid:multi-a', 'degree', '本科');
  const packageB = makePackage('urn:uuid:multi-b', 'certificate', '软件设计师');
  const challenge = 'multi-verifier-challenge-1234';
  const presentation = await createMultiWalletPresentation({ identity: holder, challenge, domain: 'hr.example.com', selections: [
    { walletPackage: packageA, paths: ['credentialSubject.degree'] },
    { walletPackage: packageB, paths: ['credentialSubject.certificate'] },
  ] });
  const logs = new LogRepository(); const challenges = new ChallengeRepository(); const presentations = new PresentationRepository();
  const service = new V2VerificationService({ unitOfWork: new UnitOfWork(),
    didRepository: new DidRepository([
      { id: 'issuer-id', did: issuerDid, role: 'issuer', status: 'active', document: {} },
      { id: 'holder-id', did: holder.did, role: 'holder', status: 'active', metadata: { keyCustody: 'holder_self_custody' }, document: holder.document },
    ]), didKeyVersionRepository: new KeyRepository({ version: 1, verificationMethod: `${issuerDid}#key-1`, publicJwk: issuerPublic }),
    credentialRepository: new CredentialRepository([
      { id: packageA.credentialId, status: 'active', validUntil: new Date(Date.now() + 3600_000).toISOString() },
      { id: packageB.credentialId, status: 'active', validUntil: new Date(Date.now() + 3600_000).toISOString() },
    ]), verificationLogRepository: logs, verifierChallengeRepository: challenges, presentationRepository: presentations,
  });
  const result = await service.verifyMultiWalletPresentation(context, presentation);
  assert.equal(result.valid, true);
  assert.equal(result.credentials.length, 2);
  assert.deepEqual(result.credentials.map((item) => item.disclosedPaths[0]), ['credentialSubject.degree', 'credentialSubject.certificate']);
  assert.deepEqual(result.credentials.map((item) => item.disclosedClaims[0].value), ['本科', '软件设计师']);
  assert.deepEqual(result.credentials.map((item) => item.disclosedClaims[0].label), ['degree', 'certificate']);
  assert.equal(presentations.completed.outcome, 'valid');
  assert.equal(presentations.completed.items.length, 2);
  assert.equal(challenges.consumed, true);
});
