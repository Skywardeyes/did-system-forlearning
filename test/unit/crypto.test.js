import assert from 'node:assert/strict';
import test from 'node:test';
import { base58Encode, createClaimDigest, createDidIdentity, signCredential, signPayload, stableStringify, verifyCredentialSignature, verifyPayload } from '../../src/crypto.js';

test('stable stringify sorts nested object keys and keeps array order', () => {
  assert.equal(stableStringify({ z: 1, a: { y: 2, x: 3 }, list: [{ b: 2, a: 1 }] }), '{"a":{"x":3,"y":2},"list":[{"a":1,"b":2}],"z":1}');
  assert.equal(stableStringify({ value: undefined, kept: null }), '{"kept":null}');
});

test('base58 encoding follows empty, leading-zero and byte vectors', () => {
  assert.equal(base58Encode(Buffer.alloc(0)), '');
  assert.equal(base58Encode(Buffer.from([0])), '1');
  assert.equal(base58Encode(Buffer.from([0, 0])), '11');
  assert.equal(base58Encode(Buffer.from([1])), '2');
});

test('Ed25519 accepts valid signatures and rejects tampering', () => {
  const identity = createDidIdentity({ name: 'Issuer', role: 'issuer' });
  const unsigned = { id: 'urn:uuid:test', issuer: identity.did, credentialSubject: { name: 'Alice' } };
  const credential = { ...unsigned, proof: { proofValue: signCredential(unsigned, identity.privateJwk) } };
  assert.equal(verifyCredentialSignature(credential, identity.publicJwk), true);

  const payloadTampered = structuredClone(credential);
  payloadTampered.credentialSubject.name = 'Mallory';
  assert.equal(verifyCredentialSignature(payloadTampered, identity.publicJwk), false);

  const proofTampered = structuredClone(credential);
  proofTampered.proof.proofValue = `${proofTampered.proof.proofValue[0] === 'A' ? 'B' : 'A'}${proofTampered.proof.proofValue.slice(1)}`;
  assert.equal(verifyCredentialSignature(proofTampered, identity.publicJwk), false);
  assert.equal(verifyCredentialSignature({ ...unsigned }, identity.publicJwk), false);
});

test('salted claim digests and signed manifests detect disclosure tampering', () => {
  const first = createClaimDigest('credentialSubject.course', 'salt-a', 'Course');
  assert.equal(first, createClaimDigest('credentialSubject.course', 'salt-a', 'Course'));
  assert.notEqual(first, createClaimDigest('credentialSubject.course', 'salt-b', 'Course'));
  assert.notEqual(first, createClaimDigest('credentialSubject.course', 'salt-a', 'Other'));

  const identity = createDidIdentity({ name: 'Issuer', role: 'issuer' });
  const manifest = { credentialId: 'urn:uuid:test', claimDigests: { course: first } };
  const signature = signPayload(manifest, identity.privateJwk);
  assert.equal(verifyPayload(manifest, identity.publicJwk, signature), true);
  assert.equal(verifyPayload({ ...manifest, credentialId: 'urn:uuid:changed' }, identity.publicJwk, signature), false);
});
