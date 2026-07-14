import assert from 'node:assert/strict';
import test from 'node:test';
import { V2DidService } from '../../src/services/v2-did-service.js';
import { localDemoWalletIdentity } from '../../src/demo-wallet-identity.js';

const context = { tenantId: 'tenant-1', actorId: 'user-1', requestId: 'request-1' };
const publicJwk = (seed) => ({ kty: 'OKP', crv: 'Ed25519', x: Buffer.alloc(32, seed).toString('base64url') });

class InMemoryUnitOfWork {
  async run(contextValue, callback) { return callback({ context: contextValue, connection: {} }); }
}

class InMemoryDidRepository {
  constructor() { this.records = new Map(); }
  async create(_operation, did) { this.records.set(did.id, { ...structuredClone(did), rowVersion: 1 }); return did; }
  async getForUpdate(_operation, id) { return structuredClone(this.records.get(id) || null); }
  async findByDid(_operation, value) { return structuredClone([...this.records.values()].find((record) => record.did === value) || null); }
  async save(_operation, did, expectedRowVersion) {
    const current = this.records.get(did.id);
    assert.equal(current.rowVersion, expectedRowVersion);
    const saved = { ...structuredClone(did), rowVersion: expectedRowVersion + 1 };
    this.records.set(did.id, saved);
    return saved;
  }
  async list() { return { total: this.records.size, items: [...this.records.values()].map(structuredClone) }; }
}

class InMemoryKeyRepository {
  constructor() { this.records = new Map(); }
  key(didId, version) { return `${didId}:${version}`; }
  async create(_operation, keyVersion) { this.records.set(this.key(keyVersion.didId, keyVersion.version), structuredClone(keyVersion)); }
  async findByDidVersion(_operation, didId, version) { return structuredClone(this.records.get(this.key(didId, version)) || null); }
  async retire(_operation, didId, version, retiredAt) {
    const key = this.records.get(this.key(didId, version));
    key.status = 'retired'; key.retiredAt = retiredAt;
  }
}

class FakeKms {
  constructor() { this.counter = 0; this.retired = []; }
  generateKeyMaterial() { this.counter += 1; return { publicJwk: publicJwk(this.counter), privateJwk: { d: `private-${this.counter}` } }; }
  async persistSigningKey({ did, version, keyMaterial }) { return { keyId: `${did}:${version}`, publicJwk: structuredClone(keyMaterial.publicJwk) }; }
  async retireSigningKey({ keyId }) { this.retired.push(keyId); }
}

function createService() {
  const didRepository = new InMemoryDidRepository();
  const didKeyVersionRepository = new InMemoryKeyRepository();
  const kms = new FakeKms();
  return { service: new V2DidService({ unitOfWork: new InMemoryUnitOfWork(), didRepository, didKeyVersionRepository, kms }), didRepository, didKeyVersionRepository, kms };
}

test('V2 DID service creates a tenant-scoped DID without returning a private key', async () => {
  const { service, didRepository, didKeyVersionRepository } = createService();
  const created = await service.createDid(context, { name: 'Issuer', role: 'issuer', method: 'example' });
  assert.match(created.did, /^did:example:/);
  assert.equal(created.capabilities.rotateKey, true);
  assert.equal('privateJwk' in created, false);
  assert.equal(didRepository.records.size, 1);
  assert.equal(didKeyVersionRepository.records.size, 1);
});

test('V2 DID service rotates an example DID key in one logical operation', async () => {
  const { service, didRepository, didKeyVersionRepository, kms } = createService();
  const created = await service.createDid(context, { name: 'Issuer', role: 'issuer' });
  const rotated = await service.rotateDidKey(context, created.id, { expectedVersion: 1 });
  assert.equal(rotated.version, 2);
  assert.equal(rotated.keyVersion, 2);
  assert.equal(kms.retired.length, 1);
  assert.equal((await didKeyVersionRepository.findByDidVersion(null, created.id, 1)).status, 'retired');
  assert.equal((await didKeyVersionRepository.findByDidVersion(null, created.id, 2)).status, 'active');
  assert.equal(didRepository.records.get(created.id).rowVersion, 2);
});

test('V2 DID service deactivates an example Issuer DID and requires Holder DID self-custody', async () => {
  const { service, kms } = createService();
  const example = await service.createDid(context, { name: 'Issuer', role: 'issuer' });
  const deactivated = await service.deactivateDid(context, example.id, { expectedVersion: 1 });
  assert.equal(deactivated.status, 'deactivated');
  assert.equal(kms.retired.length, 1);

  await assert.rejects(() => service.createDid(context, { name: 'Holder', role: 'holder', method: 'key' }), /personal wallet/);
});

test('V2 DID service registers a public self-custody Holder DID without generating or storing its private key', async () => {
  const { service, didRepository, didKeyVersionRepository, kms } = createService();
  const holder = await service.registerExternalHolderDid(context, { name: 'Wallet', ...localDemoWalletIdentity });
  assert.equal(holder.did, localDemoWalletIdentity.did);
  assert.equal(holder.keyCustody, 'holder_self_custody');
  assert.equal(didRepository.records.size, 1);
  assert.equal(didKeyVersionRepository.records.size, 0);
  assert.equal(kms.counter, 0);
});
