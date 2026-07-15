import assert from 'node:assert/strict';
import test from 'node:test';
import { assertWalletPackage, createIdentity, createWalletPresentation, registrationPackage } from '../../wallet/wallet-core.js';

test('wallet creates a non-extractable local Holder key and did:key registration package', async () => {
  const identity = await createIdentity('Local Holder');
  assert.match(identity.did, /^did:key:z/);
  assert.equal(identity.privateKey.extractable, false);
  assert.equal(identity.document.id, identity.did);
  assert.equal(registrationPackage(identity).document.verificationMethod[0].publicKeyJwk.d, undefined);
});

test('wallet accepts dynamic v2 packages only when field metadata matches disclosures', () => {
  const value = { format: 'wallet-vc-package-v2', credentialId: 'urn:uuid:vc-2', holderDid: 'did:key:zholder',
    credential: { credentialSubject: { id: 'did:key:zholder' }, proof: { proofValue: 'issuer-proof' } },
    display: { fields: [{ key: 'degree', label: '学历', path: 'credentialSubject.degree' }] },
    sdJwt: { issuerJwt: 'header.payload.signature', disclosures: { 'credentialSubject.degree': 'disclosure-degree' } } };
  assert.equal(assertWalletPackage(value), value);
  assert.throws(() => assertWalletPackage({ ...value, display: { fields: [] } }), /field metadata/);
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
