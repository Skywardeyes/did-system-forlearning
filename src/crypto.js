import {
  createPrivateKey,
  createPublicKey,
  createHash,
  generateKeyPairSync,
  randomBytes,
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

export function createDisclosureSalt() {
  return randomBytes(16).toString('base64url');
}

export function createClaimDigest(path, salt, value) {
  return createHash('sha256')
    .update(stableStringify({ path, salt, value }))
    .digest('base64url');
}

export function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function parseBase64UrlJson(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

export function createSdJwtDisclosure(claimName, value) {
  const disclosure = base64UrlJson([createDisclosureSalt(), claimName, value]);
  return { disclosure, digest: createHash('sha256').update(disclosure).digest('base64url') };
}

export function signCompactJwt(header, payload, privateJwk) {
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const privateKey = createPrivateKey({ key: privateJwk, format: 'jwk' });
  return `${signingInput}.${sign(null, Buffer.from(signingInput), privateKey).toString('base64url')}`;
}

export function verifyCompactJwt(compactJwt, publicJwk) {
  const [encodedHeader, encodedPayload, encodedSignature, ...extra] = String(compactJwt || '').split('.');
  if (extra.length || !encodedHeader || !encodedPayload || !encodedSignature) throw new Error('SD-JWT 的 JWS 格式无效');
  const header = parseBase64UrlJson(encodedHeader);
  const payload = parseBase64UrlJson(encodedPayload);
  const publicKey = createPublicKey({ key: publicJwk, format: 'jwk' });
  const valid = verify(null, Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, Buffer.from(encodedSignature, 'base64url'));
  return { header, payload, valid };
}

export function signPayload(payload, privateJwk) {
  const bytes = Buffer.from(stableStringify(payload));
  const privateKey = createPrivateKey({ key: privateJwk, format: 'jwk' });
  return sign(null, bytes, privateKey).toString('base64url');
}

export function verifyPayload(payload, publicJwk, signature) {
  if (!signature) return false;
  const bytes = Buffer.from(stableStringify(payload));
  const publicKey = createPublicKey({ key: publicJwk, format: 'jwk' });
  return verify(null, bytes, publicKey, Buffer.from(signature, 'base64url'));
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
  return signPayload(unsignedCredential, privateJwk);
}

export function verifyCredentialSignature(credential, publicJwk) {
  if (!credential?.proof?.proofValue) return false;
  const unsignedCredential = structuredClone(credential);
  const proofValue = unsignedCredential.proof.proofValue;
  delete unsignedCredential.proof;
  return verifyPayload(unsignedCredential, publicJwk, proofValue);
}
