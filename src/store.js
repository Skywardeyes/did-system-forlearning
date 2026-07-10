import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EMPTY_STATE = { dids: [], credentials: [], verificationLogs: [] };

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
  }

  async load() {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.save(structuredClone(EMPTY_STATE));
      return structuredClone(EMPTY_STATE);
    }
  }

  async save(state) {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      await rename(temporaryPath, this.filePath);
    });
    return this.writeQueue;
  }

  async update(mutator) {
    const state = await this.load();
    const result = await mutator(state);
    await this.save(state);
    return result;
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
  return structuredClone(record);
}
