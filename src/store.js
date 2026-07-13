import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EMPTY_STATE = { dids: [], credentials: [], verificationLogs: [], disclosureVerificationLogs: [] };

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.transactionQueue = Promise.resolve();
  }

  async load() {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.writeAtomic(structuredClone(EMPTY_STATE));
      return structuredClone(EMPTY_STATE);
    }
  }

  async save(state) {
    this.transactionQueue = this.transactionQueue.then(() => this.writeAtomic(state));
    return this.transactionQueue;
  }

  async update(mutator) {
    const transaction = this.transactionQueue.then(async () => {
      const state = await this.load();
      const result = await mutator(state);
      await this.writeAtomic(state);
      return result;
    });
    this.transactionQueue = transaction.then(() => undefined, () => undefined);
    return transaction;
  }

  async writeAtomic(state) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, this.filePath);
  }
}

export function publicDid(identity) {
  const { privateJwk, ...safeIdentity } = identity;
  return {
    ...safeIdentity,
    keyHistory: (safeIdentity.keyHistory || []).map(({ privateJwk: historicalPrivateKey, ...key }) => key),
  };
}

export function publicCredential(record) {
  const { disclosureMaterial, sdJwtMaterial, ...safeRecord } = record;
  return structuredClone({ ...safeRecord, selectiveDisclosureAvailable: Boolean(disclosureMaterial), sdJwtAvailable: Boolean(sdJwtMaterial) });
}
