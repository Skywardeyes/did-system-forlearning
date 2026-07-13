import { createPrivateKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { stableStringify } from '../crypto.js';
import { sqlDate } from '../repositories/sql-values.js';

export class TransactionalLocalKms {
  constructor(envelopeCrypto) { this.envelopeCrypto = envelopeCrypto; }

  generateKeyMaterial() {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    return { publicJwk: publicKey.export({ format: 'jwk' }), privateJwk: privateKey.export({ format: 'jwk' }) };
  }

  async persistSigningKey({ connection, did, version, keyMaterial, createdAt }) {
    const keyId = randomUUID();
    const encrypted = this.envelopeCrypto.encryptJson(keyMaterial.privateJwk, { recordType: 'kms-key', recordId: keyId });
    await connection.execute(
      `INSERT INTO kms_keys
       (key_id, did, key_version, public_jwk, ciphertext, iv, auth_tag, master_key_id, encryption_version, status, created_at)
       VALUES (?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, 'active', ?)`,
      [keyId, did, version, JSON.stringify(keyMaterial.publicJwk), encrypted.ciphertext, encrypted.iv, encrypted.authTag,
        encrypted.keyId, encrypted.encryptionVersion, sqlDate(createdAt)],
    );
    return { keyId, publicJwk: structuredClone(keyMaterial.publicJwk) };
  }

  async retireSigningKey({ connection, keyId, retiredAt }) {
    await connection.execute(
      `UPDATE kms_keys SET status = 'retired', retired_at = ? WHERE key_id = ? AND status = 'active'`,
      [sqlDate(retiredAt), keyId],
    );
  }

  async signPayload({ connection, keyId, payload }) {
    return this.signBytes({ connection, keyId, bytes: Buffer.from(stableStringify(payload)) });
  }

  async signBytes({ connection, keyId, bytes }) {
    const [rows] = await connection.execute(
      `SELECT key_id, ciphertext, iv, auth_tag, master_key_id, encryption_version, status
       FROM kms_keys WHERE key_id = ? FOR UPDATE`,
      [keyId],
    );
    const key = rows[0];
    if (!key || key.status !== 'active') throw new Error('The signing key is unavailable');
    const privateJwk = this.envelopeCrypto.decryptJson({
      ciphertext: key.ciphertext, iv: key.iv, authTag: key.auth_tag,
      keyId: key.master_key_id, encryptionVersion: Number(key.encryption_version),
    }, { recordType: 'kms-key', recordId: key.key_id });
    const privateKey = createPrivateKey({ key: privateJwk, format: 'jwk' });
    return sign(null, Buffer.from(bytes), privateKey).toString('base64url');
  }
}
