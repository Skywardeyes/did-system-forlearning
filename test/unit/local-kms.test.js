import assert from 'node:assert/strict';
import test from 'node:test';
import { createEnvelopeCrypto } from '../../src/envelope-crypto.js';
import { LocalKms } from '../../src/local-kms.js';
import { verifyPayload } from '../../src/crypto.js';

class MemoryKeys {
  rows = new Map();
  async insertKey(row) { this.rows.set(row.keyId, structuredClone(row)); }
  async getKey(keyId) { return structuredClone(this.rows.get(keyId)); }
  async retireKey(keyId) { this.rows.get(keyId).status = 'retired'; }
}

const setup = () => {
  const repository = new MemoryKeys();
  const envelope = createEnvelopeCrypto({ keys: new Map([['master-v1', Buffer.alloc(32, 5)]]), activeKeyId: 'master-v1' });
  return { repository, kms: new LocalKms(repository, envelope) };
};

test('persists only encrypted private material', async () => {
  const { repository, kms } = setup();
  const result = await kms.generateSigningKey({ did: 'did:example:1', version: 1 });
  const row = repository.rows.get(result.keyId);
  assert.equal(JSON.stringify(row).includes('"d"'), false);
  assert.equal('privateJwk' in result, false);
});

test('signs without exporting a private key', async () => {
  const { kms } = setup();
  const key = await kms.generateSigningKey({ did: 'did:example:1', version: 1 });
  const signature = await kms.sign(key.keyId, { hello: 'world' });
  assert.equal(verifyPayload({ hello: 'world' }, key.publicJwk, signature), true);
  assert.equal(typeof kms.exportPrivateKey, 'undefined');
});
