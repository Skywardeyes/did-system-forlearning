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
  return '1'.repeat(leadingZeroes) + encoded;
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
  const id = randomUUID();
  const did = `did:example:${id}`;
  const keyMaterial = createDidKeyMaterial(did, 1);

  return {
    id,
    name,
    role,
    did,
    createdAt: new Date().toISOString(),
    ...keyMaterial,
  };
}

export function createDidKeyMaterial(did, version) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicJwk = publicKey.export({ format: 'jwk' });
  const privateJwk = privateKey.export({ format: 'jwk' });
  const verificationMethodId = `${did}#key-${version}`;

  return {
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
