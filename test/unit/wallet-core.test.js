import assert from 'node:assert/strict';
import test from 'node:test';
import { assertWalletPackage, createIdentity, createWalletPresentation, registrationPackage, signedRegistrationPackage, walletCredentialDisplay, walletPackagesForIdentity } from '../../wallet/wallet-core.js';
import { verifyPayload } from '../../src/crypto.js';

test('wallet creates a non-extractable local Holder key and did:key registration package', async () => {
  const identity = await createIdentity('Local Holder');
  assert.match(identity.did, /^did:key:z/);
  assert.equal(identity.privateKey.extractable, false);
  assert.equal(identity.document.id, identity.did);
  assert.equal(registrationPackage(identity).document.verificationMethod[0].publicKeyJwk.d, undefined);
});

test('wallet can create multiple independent Holder DIDs instead of replacing one primary identity', async () => {
  const first = await createIdentity('学习身份');
  const second = await createIdentity('职业身份');
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.did, second.did);
  assert.notDeepEqual(first.publicJwk, second.publicJwk);
  assert.equal(first.label, '学习身份');
  assert.equal(second.label, '职业身份');
});

test('wallet proves control when publishing a Holder DID without a platform account', async () => {
  const identity = await createIdentity('学生钱包');
  const published = await signedRegistrationPackage(identity);
  const binding = { type: published.type, name: published.name, did: published.did,
    document: published.document, verificationMethod: published.verificationMethod };
  assert.equal(published.format, 'holder-did-registration-v2');
  assert.equal(verifyPayload(binding, identity.publicJwk, published.proof.proofValue), true);
  assert.doesNotMatch(JSON.stringify(published), /privateKey|"d"\s*:/);
});

test('wallet accepts dynamic v2 packages only when field metadata matches disclosures', () => {
  const value = { format: 'wallet-vc-package-v2', credentialId: 'urn:uuid:vc-2', holderDid: 'did:key:zholder',
    credential: { credentialSubject: { id: 'did:key:zholder' }, proof: { proofValue: 'issuer-proof' } },
    display: { fields: [{ key: 'degree', label: '学历', path: 'credentialSubject.degree' }] },
    sdJwt: { issuerJwt: 'header.payload.signature', disclosures: { 'credentialSubject.degree': 'disclosure-degree' } } };
  assert.equal(assertWalletPackage(value), value);
  assert.throws(() => assertWalletPackage({ ...value, display: { fields: [] } }), /field metadata/);
});

test('wallet builds readable and searchable credential labels from issuer, template and claim values', () => {
  const value = { format: 'wallet-vc-package-v2', credentialId: 'urn:uuid:degree-1', holderDid: 'did:key:zholder', issuerDid: 'did:example:university',
    credential: { type: ['VerifiableCredential', 'UniversityDegreeCredential'], credentialSubject: { id: 'did:key:zholder', major: '软件工程' }, proof: { proofValue: 'proof' } },
    display: { issuerName: '上海大学', credentialName: '大学毕业证明', fields: [{ key: 'major', label: '专业', path: 'credentialSubject.major' }] },
    sdJwt: { issuerJwt: 'header.payload.signature', disclosures: { 'credentialSubject.major': 'disclosure' } } };
  const display = walletCredentialDisplay(value);
  assert.equal(display.title, '上海大学·大学毕业证明');
  assert.equal(display.optionLabel, '上海大学·大学毕业证明｜专业：软件工程');
  assert.match(display.searchText, /上海大学/);
  assert.match(display.searchText, /软件工程/);
});

test('legacy wallet packages get a readable credential name and searchable claim summary', () => {
  const value = { format: 'wallet-vc-package-v1', credentialId: 'urn:uuid:legacy-1', holderDid: 'did:key:zholder', issuerDid: 'did:example:legacy',
    credential: { type: ['VerifiableCredential', 'TrainingCompletionCredential'], credentialSubject: { id: 'did:key:zholder', course: '数字身份训练营' }, proof: { proofValue: 'proof' } },
    sdJwt: { issuerJwt: 'header.payload.signature', disclosures: { 'credentialSubject.course': 'disclosure' } } };
  const display = walletCredentialDisplay(value);
  assert.equal(display.title, '培训结业凭证');
  assert.equal(display.summary, '课程：数字身份训练营');
  assert.match(display.searchText, /数字身份训练营/);
});

test('wallet only exposes credentials belonging to the current Holder DID', () => {
  const current = { did: 'did:key:current' };
  const items = [{ credentialId: 'current-vc', holderDid: current.did }, { credentialId: 'old-vc', holderDid: 'did:key:old' }];
  assert.deepEqual(walletPackagesForIdentity(items, current).map((item) => item.credentialId), ['current-vc']);
  assert.deepEqual(walletPackagesForIdentity(items, null), []);
});

test('wallet signs a minimal SD-JWT presentation locally without including its private key', async () => {
  const identity = await createIdentity('Local Holder');
  const walletPackage = { format: 'wallet-vc-package-v1', credentialId: 'urn:uuid:vc-1', holderDid: identity.did,
    credential: { credentialSubject: { id: identity.did }, proof: { proofValue: 'issuer-proof' } },
    sdJwt: { issuerJwt: 'header.payload.signature', disclosures: { 'credentialSubject.course': 'disclosure-course' } } };
  const presentation = await createWalletPresentation({ identity, walletPackage, paths: ['credentialSubject.course'], challenge: 'challenge-at-least-16', domain: 'verifier.example' });
  assert.equal(presentation.holderDid, identity.did);
  assert.match(presentation.sdJwt, /disclosure-course/);
  assert.ok(presentation.holderProof.proofValue);
  assert.equal(JSON.stringify(presentation).includes('privateKey'), false);
});
