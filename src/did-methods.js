import { randomUUID } from 'node:crypto';
import { base58Encode, createDidKeyMaterial } from './crypto.js';

const EXAMPLE_CAPABILITIES = Object.freeze({ update: true, rotateKey: true, deactivate: true });
const KEY_CAPABILITIES = Object.freeze({ update: false, rotateKey: false, deactivate: false });

function baseRecord({ id, did, method, name, role, keyMaterial, capabilities }) {
  const createdAt = new Date().toISOString();
  return {
    id, did, method, name, role, status: 'active', version: 1, createdAt, updatedAt: createdAt,
    deactivatedAt: null, serviceEndpoint: null, keyHistory: [], keyVersion: 1, capabilities: { ...capabilities }, ...keyMaterial,
  };
}

export class ExampleDidAdapter {
  capabilities() { return { ...EXAMPLE_CAPABILITIES }; }

  create({ name, role }) {
    const id = randomUUID();
    const did = `did:example:${id}`;
    return baseRecord({ id, did, method: 'example', name, role, capabilities: EXAMPLE_CAPABILITIES, keyMaterial: createDidKeyMaterial(did, 1) });
  }
}

export class KeyDidAdapter {
  capabilities() { return { ...KEY_CAPABILITIES }; }

  create({ name, role }) {
    const id = randomUUID();
    const provisional = createDidKeyMaterial('did:key:pending', 1);
    const rawPublicKey = Buffer.from(provisional.publicJwk.x, 'base64url');
    const fingerprint = `z${base58Encode(Buffer.concat([Buffer.from([0xed, 0x01]), rawPublicKey]))}`;
    const did = `did:key:${fingerprint}`;
    const verificationMethodId = `${did}#${fingerprint}`;
    provisional.document.id = did;
    provisional.document.verificationMethod[0].id = verificationMethodId;
    provisional.document.verificationMethod[0].controller = did;
    provisional.document.authentication = [verificationMethodId];
    provisional.document.assertionMethod = [verificationMethodId];
    return baseRecord({ id, did, method: 'key', name, role, capabilities: KEY_CAPABILITIES, keyMaterial: provisional });
  }
}

export class DidMethodRegistry {
  constructor() {
    this.adapters = new Map([['example', new ExampleDidAdapter()], ['key', new KeyDidAdapter()]]);
  }

  get(method = 'example') {
    const adapter = this.adapters.get(method);
    if (!adapter) throw new Error(`不支持的 DID Method：${method}`);
    return adapter;
  }

  methodForDid(did) {
    const match = /^did:([^:]+):/.exec(String(did || ''));
    if (!match) throw new Error('DID 格式非法');
    return this.get(match[1]);
  }
}
