import { randomUUID } from 'node:crypto';
import { base58Encode } from '../crypto.js';

const CAPABILITIES = Object.freeze({
  example: Object.freeze({ update: true, rotateKey: true, deactivate: true }),
  key: Object.freeze({ update: false, rotateKey: false, deactivate: false }),
});

const clone = (value) => structuredClone(value);

function assertExpectedVersion(did, expectedVersion) {
  if (!did) throw new Error('未找到指定 DID');
  if (did.status === 'deactivated') throw new Error('DID 已停用');
  if (did.version !== Number(expectedVersion)) throw new Error('DID 版本冲突');
}

function assertHttpsOrLocal(value) {
  if (!value) return null;
  const url = new URL(value);
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) throw new Error('服务地址必须是 HTTPS 或本地 HTTP URL');
  return url.toString();
}

function didKeyFingerprint(publicJwk) {
  const rawPublicKey = Buffer.from(publicJwk.x, 'base64url');
  return `z${base58Encode(Buffer.concat([Buffer.from([0xed, 0x01]), rawPublicKey]))}`;
}

function buildDocument(did, publicJwk, version, method, serviceEndpoint = null) {
  const fragment = method === 'key' ? didKeyFingerprint(publicJwk) : `key-${version}`;
  const verificationMethod = `${did}#${fragment}`;
  const document = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: did,
    verificationMethod: [{ id: verificationMethod, type: 'JsonWebKey2020', controller: did, publicKeyJwk: clone(publicJwk) }],
    authentication: [verificationMethod],
    assertionMethod: [verificationMethod],
  };
  if (serviceEndpoint) document.service = [{ id: `${did}#service`, type: 'LinkedDomains', serviceEndpoint }];
  return { document, verificationMethod };
}

function assertSelfCustodyDocument(input) {
  const did = String(input?.did || '').trim();
  const document = input?.document;
  const method = did.startsWith('did:key:') ? 'key' : null;
  const verificationMethod = document?.verificationMethod?.[0];
  const publicJwk = verificationMethod?.publicKeyJwk;
  const expectedFingerprint = publicJwk?.kty === 'OKP' && publicJwk?.crv === 'Ed25519' && typeof publicJwk?.x === 'string'
    ? didKeyFingerprint(publicJwk) : null;
  const expectedMethod = expectedFingerprint ? `${did}#${expectedFingerprint}` : null;
  if (!method || document?.id !== did || !expectedFingerprint || did !== `did:key:${expectedFingerprint}`
    || verificationMethod?.id !== expectedMethod || verificationMethod?.controller !== did
    || !Array.isArray(document?.authentication) || !document.authentication.includes(expectedMethod)
    || !Array.isArray(document?.assertionMethod) || !document.assertionMethod.includes(expectedMethod)) {
    throw new Error('Holder DID Document must be a valid self-custody did:key Ed25519 document');
  }
  return { did, method, document: clone(document) };
}

function publicDid(did) {
  const metadata = did.metadata || {};
  return {
    id: did.id,
    did: did.did,
    method: did.method,
    role: did.role,
    status: did.status,
    version: did.version,
    keyVersion: did.keyVersion,
    name: metadata.name || '',
    serviceEndpoint: metadata.serviceEndpoint || null,
    deactivatedAt: metadata.deactivatedAt || null,
    capabilities: clone(CAPABILITIES[did.method]),
    keyCustody: metadata.keyCustody || 'legacy_demo_custody',
    document: clone(did.document),
    publicJwk: clone(did.document.verificationMethod?.[0]?.publicKeyJwk || null),
    createdAt: did.createdAt,
    updatedAt: did.updatedAt,
  };
}

export class V2DidService {
  constructor({ unitOfWork, didRepository, didKeyVersionRepository, kms }) {
    this.unitOfWork = unitOfWork;
    this.didRepository = didRepository;
    this.didKeyVersionRepository = didKeyVersionRepository;
    this.kms = kms;
  }

  async createDid(context, input) {
    const name = input?.name?.trim();
    const role = input?.role;
    const method = input?.method || 'example';
    if (!name) throw new Error('名称不能为空');
    if (role !== 'issuer') throw new Error('Holder DID must be created in the personal wallet and registered with its public DID Document');
    if (!CAPABILITIES[method]) throw new Error('不支持的 DID Method');

    return this.unitOfWork.run(context, async (operation) => {
      const createdAt = new Date().toISOString();
      const keyMaterial = this.kms.generateKeyMaterial();
      const did = method === 'key'
        ? `did:key:${didKeyFingerprint(keyMaterial.publicJwk)}`
        : `did:example:${randomUUID()}`;
      const { document, verificationMethod } = buildDocument(did, keyMaterial.publicJwk, 1, method);
      const identity = {
        id: randomUUID(), tenantId: context.tenantId, did, method, role, status: 'active', version: 1, keyVersion: 1,
        document, metadata: { name, serviceEndpoint: null, deactivatedAt: null, keyCustody: 'issuer_managed_kms' }, createdAt, updatedAt: createdAt,
      };
      await this.didRepository.create(operation, identity);
      const persistedKey = await this.kms.persistSigningKey({ connection: operation.connection, did, version: 1, keyMaterial, createdAt });
      await this.didKeyVersionRepository.create(operation, {
        id: randomUUID(), didId: identity.id, version: 1, kmsKeyId: persistedKey.keyId, verificationMethod,
        publicJwk: persistedKey.publicJwk, status: 'active', createdAt, retiredAt: null,
      });
      return publicDid(identity);
    });
  }

  async registerExternalHolderDid(context, input) {
    const name = String(input?.name || '外部 Holder 钱包').trim();
    if (!name) throw new Error('Holder name is required');
    const selfCustody = assertSelfCustodyDocument(input);
    return this.unitOfWork.run(context, async (operation) => {
      const existing = await this.didRepository.findByDid(operation, selfCustody.did);
      if (existing) {
        if (existing.role !== 'holder' || existing.metadata?.keyCustody !== 'holder_self_custody') throw new Error('The DID is already registered with an incompatible role');
        return publicDid(existing);
      }
      const createdAt = new Date().toISOString();
      const identity = {
        id: randomUUID(), tenantId: context.tenantId, did: selfCustody.did, method: selfCustody.method, role: 'holder',
        status: 'active', version: 1, keyVersion: 1, document: selfCustody.document,
        metadata: { name, serviceEndpoint: null, deactivatedAt: null, keyCustody: 'holder_self_custody', registrationSource: 'wallet' },
        createdAt, updatedAt: createdAt,
      };
      await this.didRepository.create(operation, identity);
      return publicDid(identity);
    });
  }

  async listDids(context, query) {
    return this.unitOfWork.run(context, async (operation) => {
      const result = await this.didRepository.list(operation, query);
      return { ...result, items: result.items.map(publicDid) };
    });
  }

  async updateDid(context, id, input) {
    return this.unitOfWork.run(context, async (operation) => {
      const did = await this.didRepository.getForUpdate(operation, id);
      if (did && !CAPABILITIES[did.method]?.update) throw new Error('did:key 不支持更新');
      assertExpectedVersion(did, input?.expectedVersion);
      const name = input?.name === undefined ? did.metadata?.name : input.name?.trim();
      if (!name) throw new Error('DID 名称不得为空');
      const serviceEndpoint = input?.serviceEndpoint === undefined
        ? did.metadata?.serviceEndpoint || null
        : assertHttpsOrLocal(input.serviceEndpoint.trim());
      const updatedAt = new Date().toISOString();
      const { document } = buildDocument(did.did, did.document.verificationMethod[0].publicKeyJwk, did.keyVersion, did.method, serviceEndpoint);
      const updated = { ...did, version: did.version + 1, document, metadata: { ...did.metadata, name, serviceEndpoint }, updatedAt };
      return publicDid(await this.didRepository.save(operation, updated, did.rowVersion));
    });
  }

  async rotateDidKey(context, id, input) {
    return this.unitOfWork.run(context, async (operation) => {
      const did = await this.didRepository.getForUpdate(operation, id);
      if (did && !CAPABILITIES[did.method]?.rotateKey) throw new Error('did:key 不支持密钥轮换');
      assertExpectedVersion(did, input?.expectedVersion);
      const currentKey = await this.didKeyVersionRepository.findByDidVersion(operation, did.id, did.keyVersion, { forUpdate: true });
      if (!currentKey) throw new Error('当前 DID 密钥不存在');
      const rotatedAt = new Date().toISOString();
      const nextKeyVersion = did.keyVersion + 1;
      const keyMaterial = this.kms.generateKeyMaterial();
      const { document, verificationMethod } = buildDocument(did.did, keyMaterial.publicJwk, nextKeyVersion, did.method, did.metadata?.serviceEndpoint || null);
      const updated = { ...did, version: did.version + 1, keyVersion: nextKeyVersion, document, updatedAt: rotatedAt };
      await this.didRepository.save(operation, updated, did.rowVersion);
      await this.didKeyVersionRepository.retire(operation, did.id, currentKey.version, rotatedAt);
      await this.kms.retireSigningKey({ connection: operation.connection, keyId: currentKey.kmsKeyId, retiredAt: rotatedAt });
      const persistedKey = await this.kms.persistSigningKey({ connection: operation.connection, did: did.did, version: nextKeyVersion, keyMaterial, createdAt: rotatedAt });
      await this.didKeyVersionRepository.create(operation, {
        id: randomUUID(), didId: did.id, version: nextKeyVersion, kmsKeyId: persistedKey.keyId, verificationMethod,
        publicJwk: persistedKey.publicJwk, status: 'active', createdAt: rotatedAt, retiredAt: null,
      });
      return publicDid({ ...updated, rowVersion: did.rowVersion + 1 });
    });
  }

  async deactivateDid(context, id, input) {
    return this.unitOfWork.run(context, async (operation) => {
      const did = await this.didRepository.getForUpdate(operation, id);
      if (did && !CAPABILITIES[did.method]?.deactivate) throw new Error('did:key 不支持停用');
      assertExpectedVersion(did, input?.expectedVersion);
      const currentKey = await this.didKeyVersionRepository.findByDidVersion(operation, did.id, did.keyVersion, { forUpdate: true });
      if (!currentKey) throw new Error('当前 DID 密钥不存在');
      const deactivatedAt = new Date().toISOString();
      const updated = { ...did, status: 'deactivated', version: did.version + 1, updatedAt: deactivatedAt,
        metadata: { ...did.metadata, deactivatedAt } };
      await this.didRepository.save(operation, updated, did.rowVersion);
      await this.didKeyVersionRepository.retire(operation, did.id, currentKey.version, deactivatedAt);
      await this.kms.retireSigningKey({ connection: operation.connection, keyId: currentKey.kmsKeyId, retiredAt: deactivatedAt });
      return publicDid({ ...updated, rowVersion: did.rowVersion + 1 });
    });
  }
}
