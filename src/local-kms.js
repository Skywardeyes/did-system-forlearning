import { createPrivateKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { stableStringify } from './crypto.js';

export class LocalKms {
  constructor(repository, envelopeCrypto) { this.repository = repository; this.envelopeCrypto = envelopeCrypto; }

  async generateSigningKey({ did, version }) {
    const keyId = randomUUID();
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicJwk = publicKey.export({ format: 'jwk' });
    const privateJwk = privateKey.export({ format: 'jwk' });
    const encrypted = this.envelopeCrypto.encryptJson(privateJwk, { recordType: 'kms-key', recordId: keyId });
    await this.repository.insertKey({ keyId, did, version, publicJwk, encrypted, status: 'active', createdAt: new Date().toISOString() });
    return { keyId, publicJwk, verificationMethod: `${did}#key-${version}` };
  }

  async sign(keyId, payload) {
    const row = await this.repository.getKey(keyId);
    if (!row || !['active', 'retired'].includes(row.status)) throw new Error('Signing key is unavailable');
    let privateJwk;
    try {
      privateJwk = this.envelopeCrypto.decryptJson(row.encrypted, { recordType: 'kms-key', recordId: keyId });
      const privateKey = createPrivateKey({ key: privateJwk, format: 'jwk' });
      return sign(null, Buffer.from(stableStringify(payload)), privateKey).toString('base64url');
    } finally {
      privateJwk = undefined;
    }
  }

  async rotateSigningKey(currentKeyId, metadata) {
    await this.repository.retireKey(currentKeyId);
    return this.generateSigningKey(metadata);
  }

  async getPublicKey(keyId) {
    const row = await this.repository.getKey(keyId);
    return row ? structuredClone(row.publicJwk) : null;
  }
}
