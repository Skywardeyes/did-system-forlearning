import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class LogStore {
  constructor(filePath, { limit = 5000 } = {}) {
    this.filePath = filePath;
    this.limit = limit;
    this.writeQueue = Promise.resolve();
  }

  async load() {
    try {
      const value = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!Array.isArray(value)) throw new Error('日志文件格式无效');
      return value;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.replace([]);
      return [];
    }
  }

  async append(entry) {
    const entries = await this.load();
    entries.push(entry);
    await this.replace(entries.slice(-this.limit));
    return entry;
  }

  async replace(entries) {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
      await rename(temporaryPath, this.filePath);
    });
    return this.writeQueue;
  }
}
