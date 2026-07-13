import assert from 'node:assert/strict';
import test from 'node:test';
import { createEnvelopeCrypto } from '../../src/envelope-crypto.js';

const context = { recordType: 'kms-key', recordId: 'key-1' };
const fixture = () => createEnvelopeCrypto({ keys: new Map([['master-v1', Buffer.alloc(32, 9)]]), activeKeyId: 'master-v1' });

test('round trips JSON with record-bound authentication', () => {
  const crypto = fixture();
  const encrypted = crypto.encryptJson({ d: 'private' }, context);
  assert.deepEqual(crypto.decryptJson(encrypted, context), { d: 'private' });
});

test('uses a fresh IV for identical plaintext', () => {
  const crypto = fixture();
  const a = crypto.encryptJson({ name: 'Alice' }, context);
  const b = crypto.encryptJson({ name: 'Alice' }, context);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
});

test('rejects tampering and moving ciphertext to another record', () => {
  const crypto = fixture();
  const encrypted = crypto.encryptJson({ d: 'private' }, context);
  assert.throws(() => crypto.decryptJson(encrypted, { ...context, recordId: 'key-2' }), { code: 'ENCRYPTED_DATA_INVALID' });
  assert.throws(() => crypto.decryptJson({ ...encrypted, authTag: Buffer.alloc(16).toString('base64') }, context), { code: 'ENCRYPTED_DATA_INVALID' });
});
