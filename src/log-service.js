import { randomUUID } from 'node:crypto';
import { queryRecords } from './query.js';

const TYPES = new Set(['audit', 'system']);
const LEVELS = new Set(['info', 'warn', 'error']);
const MODULES = new Set(['DID', 'VC', 'VERIFY', 'API', 'STORE', 'SYSTEM']);
const REDACT_KEYS = /(private|secret|token|password|authorization|cookie)/i;
const REDACT_OBJECTS = new Set(['credential', 'requestBody', 'proof']);

export function redact(value, key = '') {
  if (REDACT_KEYS.test(key) || key === 'proofValue' || REDACT_OBJECTS.has(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redact(item, name)]));
  }
  return value;
}

function validate(entry) {
  if (!TYPES.has(entry.type)) throw new Error('日志类型无效');
  if (!LEVELS.has(entry.level)) throw new Error('日志级别无效');
  if (!MODULES.has(entry.module)) throw new Error('日志模块无效');
  if (!entry.action || !entry.message || typeof entry.success !== 'boolean') throw new Error('日志必要字段不完整');
}

export class LogService {
  constructor(store, { consoleError = console.error } = {}) {
    this.store = store;
    this.consoleError = consoleError;
  }

  info(entry) { return this.log({ ...entry, level: 'info' }); }
  warn(entry) { return this.log({ ...entry, level: 'warn' }); }
  error(entry) { return this.log({ ...entry, level: 'error' }); }

  async log(entry) {
    try {
      const normalized = redact({
        id: entry.id || randomUUID(),
        occurredAt: entry.occurredAt || new Date().toISOString(),
        correlationId: entry.correlationId || randomUUID(),
        targetType: null,
        targetId: null,
        targetName: null,
        errorCode: null,
        context: {},
        ...entry,
      });
      validate(normalized);
      return await this.store.append(normalized);
    } catch (error) {
      this.consoleError('结构化日志写入失败:', error.message);
      return null;
    }
  }

  async query(options = {}) {
    const start = options.startTime ? Date.parse(options.startTime) : null;
    const end = options.endTime ? Date.parse(options.endTime) : null;
    if (start !== null && !Number.isFinite(start)) throw new Error('开始时间格式无效');
    if (end !== null && !Number.isFinite(end)) throw new Error('结束时间格式无效');
    if (start !== null && end !== null && start > end) throw new Error('开始时间不能晚于结束时间');

    const success = options.success === '' || options.success === undefined
      ? null
      : options.success === true || options.success === 'true';
    const entries = (await this.store.load()).filter((entry) => (
      (!options.type || entry.type === options.type)
      && (!options.level || entry.level === options.level)
      && (!options.module || entry.module === options.module)
      && (success === null || entry.success === success)
      && (start === null || Date.parse(entry.occurredAt) >= start)
      && (end === null || Date.parse(entry.occurredAt) <= end)
    ));
    return queryRecords(entries, {
      search: options.search,
      page: options.page,
      pageSize: options.pageSize,
      fields: ['action', 'targetId', 'targetName', 'errorCode', 'message'],
      timeField: 'occurredAt',
    });
  }

  async get(id) {
    return (await this.store.load()).find((entry) => entry.id === id) || null;
  }

  async clear({ correlationId, confirm } = {}) {
    if (confirm !== true) throw new Error('必须确认清空日志');
    const clearedCount = (await this.store.load()).length;
    await this.store.replace([]);
    return this.info({
      correlationId,
      type: 'audit',
      module: 'SYSTEM',
      action: 'LOG_CLEAR',
      success: true,
      message: '日志已清空',
      context: { clearedCount },
    });
  }
}
