import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { LogService } from '../src/log-service.js';
import { LogStore } from '../src/log-store.js';

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'log-service-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return new LogService(new LogStore(path.join(directory, 'logs.json')));
}

const base = {
  type: 'audit', module: 'VC', action: 'VC_ISSUE', success: true, message: '签发成功', correlationId: 'request-1',
};

test('写入前递归脱敏敏感字段和大对象', async (t) => {
  const service = await fixture(t);
  await service.info({
    ...base,
    context: {
      privateJwk: { d: 'private' },
      nested: [{ proofValue: 'signature', token: 'token-value' }],
      credential: { id: 'full-vc' },
      method: 'example',
    },
  });

  const saved = (await service.query({})).items[0];
  assert.equal(saved.context.privateJwk, '[REDACTED]');
  assert.equal(saved.context.nested[0].proofValue, '[REDACTED]');
  assert.equal(saved.context.nested[0].token, '[REDACTED]');
  assert.equal(saved.context.credential, '[REDACTED]');
  assert.equal(saved.context.method, 'example');
});

test('组合条件为 AND 且文本字段内部为 OR', async (t) => {
  const service = await fixture(t);
  await service.warn({ ...base, module: 'DID', success: false, targetName: 'Issuer Alpha', errorCode: 'INVALID_METHOD', message: '创建失败' });
  await service.warn({ ...base, module: 'VC', success: false, targetName: 'Issuer Alpha', message: '签发失败' });
  await service.info({ ...base, module: 'DID', targetName: 'Issuer Alpha' });

  const result = await service.query({ search: 'issuer', type: 'audit', success: false, level: 'warn', module: 'DID' });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].errorCode, 'INVALID_METHOD');
});

test('时间范围包含边界并拒绝倒置范围', async (t) => {
  const service = await fixture(t);
  await service.info({ ...base, occurredAt: '2026-01-01T00:00:00.000Z' });
  const result = await service.query({ startTime: '2026-01-01T00:00:00.000Z', endTime: '2026-01-01T00:00:00.000Z' });
  assert.equal(result.total, 1);
  await assert.rejects(() => service.query({ startTime: '2026-02-01', endTime: '2026-01-01' }), /开始时间不能晚于结束时间/);
});

test('清空后只保留 LOG_CLEAR 摘要', async (t) => {
  const service = await fixture(t);
  await service.info(base);
  await service.warn({ ...base, success: false });
  await assert.rejects(() => service.clear({ confirm: false }), /必须确认/);
  await service.clear({ correlationId: 'clear-request', confirm: true });

  const result = await service.query({});
  assert.equal(result.total, 1);
  assert.equal(result.items[0].action, 'LOG_CLEAR');
  assert.equal(result.items[0].context.clearedCount, 2);
});

test('日志写入失败不向调用方抛出并使用控制台兜底', async () => {
  const messages = [];
  const service = new LogService({ append: async () => { throw new Error('disk full'); } }, { consoleError: (...args) => messages.push(args.join(' ')) });
  const result = await service.error({ type: 'system', module: 'STORE', action: 'STORE_WRITE_FAILED', success: false, message: '失败' });
  assert.equal(result, null);
  assert.match(messages[0], /disk full/);
});

test('get 返回单条日志且不存在时返回 null', async (t) => {
  const service = await fixture(t);
  const entry = await service.info(base);
  assert.equal((await service.get(entry.id)).id, entry.id);
  assert.equal(await service.get('missing'), null);
});
