import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class EncryptedDataError extends Error {
  constructor(message = 'Encrypted data authentication failed') { super(message); this.name = 'EncryptedDataError'; this.code = 'ENCRYPTED_DATA_INVALID'; }
}

const VERSION = 1;
const aadFor = ({ recordType, recordId }) => Buffer.from(JSON.stringify({ recordType, recordId, encryptionVersion: VERSION }));

export function createEnvelopeCrypto({ keys, activeKeyId }) {
  const activeKey = keys.get(activeKeyId);
  if (!activeKey || activeKey.length !== 32) throw new Error('Active encryption key must contain 32 bytes');
  return {
    encryptJson(value, context) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', activeKey, iv);
      cipher.setAAD(aadFor(context));
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
      return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), keyId: activeKeyId, encryptionVersion: VERSION };
    },
    decryptJson(envelope, context) {
      try {
        if (envelope.encryptionVersion !== VERSION) throw new Error('Unsupported encryption version');
        const key = keys.get(envelope.keyId);
        if (!key) throw new Error('Encryption key unavailable');
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
        decipher.setAAD(aadFor(context));
        decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
        const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
        return JSON.parse(plaintext.toString('utf8'));
      } catch (error) {
        if (error instanceof EncryptedDataError) throw error;
        throw new EncryptedDataError();
      }
    },
  };
}
