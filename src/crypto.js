import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
} from 'node:crypto';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Encode(bytes) {
  if (bytes.length === 0) return '';

  let value = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`);
  let encoded = '';
  while (value > 0n) {
    const remainder = Number(value % 58n);
    value /= 58n;
    encoded = BASE58_ALPHABET[remainder] + encoded;
  }

  let leadingZeroes = 0;
  for (const byte of bytes) {
    if (byte !== 0) break;
    leadingZeroes += 1;
  }
  return '1'.repeat(leadingZeroes) + (encoded || '1');
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const entries = Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
}

export function createDidIdentity({ name, role }) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicJwk = publicKey.export({ format: 'jwk' });
  const privateJwk = privateKey.export({ format: 'jwk' });
  const publicBytes = Buffer.from(publicJwk.x, 'base64url');
  const fingerprint = `z${base58Encode(Buffer.concat([Buffer.from([0xed, 0x01]), publicBytes]))}`;
  const did = `did:key:${fingerprint}`;
  const verificationMethodId = `${did}#${fingerprint}`;

  return {
    id: randomUUID(),
    name,
    role,
    did,
    createdAt: new Date().toISOString(),
    publicJwk,
    privateJwk,
    document: {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: did,
      verificationMethod: [
        {
          id: verificationMethodId,
          type: 'JsonWebKey2020',
          controller: did,
          publicKeyJwk: publicJwk,
        },
      ],
      authentication: [verificationMethodId],
      assertionMethod: [verificationMethodId],
    },
  };
}

export function signCredential(unsignedCredential, privateJwk) {
  const payload = Buffer.from(stableStringify(unsignedCredential));
  const privateKey = createPrivateKey({ key: privateJwk, format: 'jwk' });
  return sign(null, payload, privateKey).toString('base64url');
}

export function verifyCredentialSignature(credential, publicJwk) {
  if (!credential?.proof?.proofValue) return false;
  const unsignedCredential = structuredClone(credential);
  const proofValue = unsignedCredential.proof.proofValue;
  delete unsignedCredential.proof;
  const payload = Buffer.from(stableStringify(unsignedCredential));
  const publicKey = createPublicKey({ key: publicJwk, format: 'jwk' });
  return verify(null, payload, publicKey, Buffer.from(proofValue, 'base64url'));
}
