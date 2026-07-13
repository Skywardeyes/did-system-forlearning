import assert from 'node:assert/strict';
import test from 'node:test';
import { compareFields } from '../../src/reconcile-v1-v2.js';

test('reconciliation field comparison reports only field names, never compared values', () => {
  const mismatches = compareFields('credential', 'vc-1', { same: [{ a: 1 }, { a: 1 }], secretClaim: ['Alice', 'Bob'] });
  assert.deepEqual(mismatches, [{ kind: 'credential', id: 'vc-1', field: 'secretClaim' }]);
  assert.doesNotMatch(JSON.stringify(mismatches), /Alice|Bob/);
});
