import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureAuthSecret } from '../../src/setup-local-auth.js';

test('local auth setup appends a generated secret without changing existing configuration', () => {
  const result = ensureAuthSecret('DB_HOST=127.0.0.1\n', 'generated-secret');
  assert.equal(result.changed, true);
  assert.equal(result.text, 'DB_HOST=127.0.0.1\nAUTH_JWT_HS256_SECRET=generated-secret\nAUTH_LOCAL_DEV_LOGIN=true\n');
});

test('local auth setup preserves an existing secret', () => {
  const original = 'DB_HOST=127.0.0.1\nAUTH_JWT_HS256_SECRET=existing\nAUTH_LOCAL_DEV_LOGIN=true\n';
  assert.deepEqual(ensureAuthSecret(original, 'replacement'), { changed: false, text: original });
});
