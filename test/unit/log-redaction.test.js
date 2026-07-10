import assert from 'node:assert/strict';
import test from 'node:test';
import { redact } from '../../src/log-service.js';

test('redact recursively removes sensitive object and array fields', () => {
  const result = redact({
    privateJwk: { d: 'secret' },
    nested: [{ token: 'abc', Authorization: 'Bearer x', publicJwk: { x: 'safe' } }],
    proof: { proofValue: 'signature' },
    credential: { id: 'vc-1' },
    targetId: 'did:example:1',
  });
  assert.equal(result.privateJwk, '[REDACTED]');
  assert.equal(result.nested[0].token, '[REDACTED]');
  assert.equal(result.nested[0].Authorization, '[REDACTED]');
  assert.deepEqual(result.nested[0].publicJwk, { x: 'safe' });
  assert.equal(result.proof, '[REDACTED]');
  assert.equal(result.credential, '[REDACTED]');
  assert.equal(result.targetId, 'did:example:1');
});
