import assert from 'node:assert/strict';
import test from 'node:test';
import { DidMethodRegistry, ExampleDidAdapter, KeyDidAdapter } from '../../src/did-methods.js';

test('example DID exposes lifecycle capabilities and a consistent document', () => {
  const identity = new ExampleDidAdapter().create({ name: 'Issuer', role: 'issuer' });
  assert.match(identity.did, /^did:example:[0-9a-f-]{36}$/);
  assert.deepEqual(identity.capabilities, { update: true, rotateKey: true, deactivate: true });
  assert.equal(identity.document.id, identity.did);
  assert.equal(identity.document.verificationMethod[0].controller, identity.did);
});

test('key DID uses an Ed25519 multicodec fingerprint and immutable capabilities', () => {
  const identity = new KeyDidAdapter().create({ name: 'Holder', role: 'holder' });
  assert.match(identity.did, /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
  assert.deepEqual(identity.capabilities, { update: false, rotateKey: false, deactivate: false });
  assert.equal(identity.document.authentication[0], identity.document.verificationMethod[0].id);
  assert.equal(identity.document.verificationMethod[0].id, `${identity.did}#${identity.did.slice('did:key:'.length)}`);
});

test('DID method registry routes DIDs and rejects malformed or unknown methods', () => {
  const registry = new DidMethodRegistry();
  assert.ok(registry.get() instanceof ExampleDidAdapter);
  assert.ok(registry.methodForDid('did:key:z6MkExample') instanceof KeyDidAdapter);
  assert.throws(() => registry.get('unknown'), /DID Method/);
  assert.throws(() => registry.methodForDid('not-a-did'), /DID/);
  assert.throws(() => registry.methodForDid('did:unknown:value'), /DID Method/);
});
