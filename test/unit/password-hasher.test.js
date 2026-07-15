import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, PasswordValidationError, verifyPassword } from '../../src/auth/password-hasher.js';

test('password hashing uses a fresh scrypt salt and verifies without storing plaintext', async () => {
  const first = await hashPassword('StrongPass123');
  const second = await hashPassword('StrongPass123');
  assert.match(first, /^scrypt\$16384\$8\$1\$/);
  assert.notEqual(first, second);
  assert.doesNotMatch(first, /StrongPass123/);
  assert.equal(await verifyPassword('StrongPass123', first), true);
  assert.equal(await verifyPassword('WrongPass123', first), false);
});

test('password policy rejects short or single-category passwords', async () => {
  await assert.rejects(() => hashPassword('short1'), PasswordValidationError);
  await assert.rejects(() => hashPassword('onlyletterslong'), PasswordValidationError);
});
