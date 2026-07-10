import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { LogStore } from '../src/log-store.js';

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'log-store-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return new LogStore(path.join(directory, 'logs.json'), options);
}

test('不存在的日志文件初始化为空数组', async (t) => {
  const store = await fixture(t, { limit: 3 });
  assert.deepEqual(await store.load(), []);
});

test('超过上限时只保留最新记录', async (t) => {
  const store = await fixture(t, { limit: 3 });
  for (const id of ['1', '2', '3', '4']) {
    await store.append({ id, occurredAt: `2026-01-01T00:00:0${id}.000Z` });
  }
  assert.deepEqual((await store.load()).map((item) => item.id), ['2', '3', '4']);
});

test('replace 整体替换现有日志', async (t) => {
  const store = await fixture(t);
  await store.append({ id: 'old' });
  await store.replace([{ id: 'new' }]);
  assert.deepEqual(await store.load(), [{ id: 'new' }]);
});
