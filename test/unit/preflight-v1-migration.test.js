import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeV1State } from '../../src/preflight-v1-migration.js';

test('V1 preflight accepts linked identities and credentials without exposing private values', () => {
  const state = { dids: [
    { id: 'issuer', did: 'did:example:issuer', role: 'issuer', document: {}, publicJwk: {}, privateJwk: { d: 'secret' } },
    { id: 'holder', did: 'did:example:holder', role: 'holder', document: {}, publicJwk: {}, privateJwk: { d: 'secret' } },
  ], credentials: [{ id: 'vc-1', credential: { issuer: 'did:example:issuer', credentialSubject: { id: 'did:example:holder' } } }], verificationLogs: [], disclosureVerificationLogs: [] };
  const result = analyzeV1State(state);
  assert.equal(result.ready, true);
  assert.deepEqual(result.counts, { dids: 2, credentials: 1, verificationLogs: 0, disclosureVerificationLogs: 0 });
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});

test('V1 preflight reports missing keys and broken credential references', () => {
  const result = analyzeV1State({ dids: [{ id: 'issuer', did: 'did:example:issuer', role: 'issuer', document: {}, publicJwk: {} }], credentials: [{ id: 'vc-1', credential: { issuer: 'missing', credentialSubject: { id: 'missing' } } }] });
  assert.equal(result.ready, false);
  assert.deepEqual(result.didIssues[0].missing, ['privateJwk']);
  assert.deepEqual(result.credentialIssues[0].missing, ['issuer', 'holder']);
});
