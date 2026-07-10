# Structured Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为信证台增加统一结构化日志服务、独立日志存储、审计与系统埋点、组合查询 API，以及具有绿/黄/红级别标识的日志中心。

**Architecture:** `LogService` 是唯一日志写入和查询入口，内部使用独立 `LogStore` 原子持久化 `data/logs.json`。HTTP 请求生成 correlationId，业务服务记录 audit 事件，API/存储边界记录 system 事件；日志写入失败只进行控制台兜底，不改变业务响应。

**Tech Stack:** Node.js >=20、ES modules、`node:test`、原生 HTTP、原生 HTML/CSS/JavaScript、JSON 文件存储，不增加第三方运行时依赖。

## Global Constraints

- type 仅允许 `audit|system`，level 仅允许 `info|warn|error`。
- module 仅允许 `DID|VC|VERIFY|API|STORE|SYSTEM`。
- info 绿色、warn 黄色、error 红色，同时显示级别文字。
- 日志写入磁盘前递归脱敏，不存在可查询的未脱敏副本。
- 日志独立保存至 `data/logs.json`，最多保留最新 5,000 条。
- 重置演示数据不删除日志；清空后只保留一条 `LOG_CLEAR` 摘要。
- 日志写入失败不得改变原业务操作的成功或失败响应。
- 默认最新在前，同一 occurredAt 按 id 降序；页大小只允许 10、20、50。

---

## File Structure

- `src/log-store.js`：独立日志文件的原子读写、追加、限量和清空。
- `src/log-service.js`：模型校验、级别入口、递归脱敏、组合查询和清空摘要。
- `src/server.js`：请求 correlationId、日志 API 和系统边界日志。
- `src/vc-service.js`：DID、VC、验签、重置的审计事件。
- `public/log-ui.js`：筛选状态、级别样式和日志行/详情渲染纯函数。
- `public/app.js`、`public/index.html`、`public/styles.css`：日志中心页面和交互。
- `test/log-store.test.js`：独立存储、5,000 条上限和清空。
- `test/log-service.test.js`：校验、脱敏、查询和写入失败兜底。
- `test/log-api.test.js`：关联 ID、系统事件、详情和清空接口。
- `test/log-ui.test.js`：级别颜色文字、筛选回页和空状态。

---

### Task 1: 独立 LogStore

**Files:**
- Create: `src/log-store.js`
- Create: `test/log-store.test.js`

**Interfaces:**
- Produces: `new LogStore(filePath, { limit = 5000 })`
- Produces: `load() -> Promise<LogEntry[]>`
- Produces: `append(entry) -> Promise<LogEntry>`
- Produces: `replace(entries) -> Promise<void>`

- [ ] **Step 1: 写入初始化、限量与原子替换失败测试**

```js
test('不存在的日志文件初始化为空数组', async (t) => {
  const store = await fixture(t, { limit: 3 });
  assert.deepEqual(await store.load(), []);
});

test('超过上限时只保留最新记录', async (t) => {
  const store = await fixture(t, { limit: 3 });
  for (const id of ['1', '2', '3', '4']) await store.append({ id, occurredAt: `2026-01-01T00:00:0${id}.000Z` });
  assert.deepEqual((await store.load()).map((item) => item.id), ['2', '3', '4']);
});
```

- [ ] **Step 2: 验证测试因模块不存在而失败**

Run: `node --test test/log-store.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现独立原子存储**

```js
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class LogStore {
  constructor(filePath, { limit = 5000 } = {}) { this.filePath = filePath; this.limit = limit; this.writeQueue = Promise.resolve(); }
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
```

实现必须复用 `src/store.js` 的 mkdir/write temporary/rename 原子模式，但不得共享业务状态文件。

- [ ] **Step 4: 运行存储测试**

Run: `node --test test/log-store.test.js`

Expected: 全部 PASS。

- [ ] **Step 5: 提交 LogStore**

```bash
git add src/log-store.js test/log-store.test.js
git commit -m "feat: add bounded independent log store"
```

---

### Task 2: LogService、递归脱敏与组合查询

**Files:**
- Create: `src/log-service.js`
- Create: `test/log-service.test.js`

**Interfaces:**
- Consumes: `LogStore.append/load/replace`
- Produces: `info(entry)`, `warn(entry)`, `error(entry)`, `log(entry)`
- Produces: `query({ search, type, success, level, module, startTime, endTime, page, pageSize })`
- Produces: `get(id)`, `clear({ correlationId, confirm })`

- [ ] **Step 1: 写入模型、脱敏、查询、清空和失败兜底测试**

```js
test('写入前递归脱敏敏感字段', async () => {
  const service = fixtureService();
  await service.info({ type: 'audit', module: 'VC', action: 'VC_ISSUE', success: true, message: '成功', context: { privateJwk: { d: 'x' }, nested: [{ proofValue: 'sig', token: 't' }], credential: { id: 'full' } } });
  const saved = (await service.query({})).items[0];
  assert.equal(saved.context.privateJwk, '[REDACTED]');
  assert.equal(saved.context.nested[0].proofValue, '[REDACTED]');
  assert.equal(saved.context.credential, '[REDACTED]');
});

test('组合条件为 AND 且文本字段内部为 OR', async () => {
  const service = seededService();
  const result = await service.query({ search: 'issuer', type: 'audit', success: false, level: 'warn', module: 'DID', page: 1, pageSize: 10 });
  assert.equal(result.total, 1);
});

test('清空后只保留 LOG_CLEAR 摘要', async () => {
  const service = seededService();
  await service.clear({ correlationId: 'request-1', confirm: true });
  const result = await service.query({});
  assert.equal(result.total, 1);
  assert.equal(result.items[0].action, 'LOG_CLEAR');
  assert.ok(result.items[0].context.clearedCount > 0);
});
```

- [ ] **Step 2: 运行测试并确认模块缺失**

Run: `node --test test/log-service.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现日志规范化和递归脱敏**

```js
const REDACT_KEYS = /(private|secret|token|password|authorization|cookie)/i;
const REDACT_OBJECTS = new Set(['credential', 'requestBody', 'proof']);
export function redact(value, key = '') {
  if (REDACT_KEYS.test(key) || key === 'proofValue' || REDACT_OBJECTS.has(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redact(item, name)]));
  return value;
}
```

`log()` 生成缺省 id、occurredAt、correlationId，校验枚举后写入脱敏副本；`info/warn/error` 固定 level。写入失败 catch 后调用注入的 `consoleError`，不再次写日志。

- [ ] **Step 4: 实现查询与清空**

查询先校验时间范围，再依次执行精确过滤、包含边界的时间过滤、五字段模糊过滤、occurredAt/id 稳定倒序和 `queryRecords` 分页。`clear(confirm!==true)` 抛出“必须确认清空日志”；确认后 `replace([])`，再写入一条 SYSTEM/LOG_CLEAR audit/info 摘要。

- [ ] **Step 5: 运行服务测试并提交**

Run: `node --test test/log-service.test.js test/log-store.test.js`

Expected: 全部 PASS。

```bash
git add src/log-service.js test/log-service.test.js
git commit -m "feat: add structured redacted log service"
```

---

### Task 3: DID/VC 审计埋点

**Files:**
- Modify: `src/vc-service.js`
- Create: `test/audit-logging.test.js`

**Interfaces:**
- Modify constructor: `new VcService(store, registry, { logService, correlationId } = {})`
- Produces helper: `audit(action, entry) -> Promise<void>`
- Consumes LogService `info/warn`

- [ ] **Step 1: 写入成功与失败审计测试**

```js
test('DID 创建成功和失败均记录审计日志', async (t) => {
  const { service, logs } = await fixture(t);
  await service.createDid({ name: '机构', role: 'issuer', method: 'example' });
  await assert.rejects(() => service.createDid({ name: '', role: 'issuer' }));
  assert.deepEqual(logs.map(({ action, level, success }) => ({ action, level, success })), [
    { action: 'DID_CREATE', level: 'info', success: true },
    { action: 'DID_CREATE', level: 'warn', success: false },
  ]);
});
```

分别增加 DID_UPDATE/DID_ROTATE_KEY/DID_DEACTIVATE、VC_ISSUE/VC_SUSPEND/VC_RESUME/VC_REPLACE/VC_REVOKE、VC_VERIFY、DEMO_RESET 的测试，并断言日志无 credential/proofValue。

- [ ] **Step 2: 运行测试并确认当前无审计事件**

Run: `node --test test/audit-logging.test.js`

Expected: FAIL，日志数组为空。

- [ ] **Step 3: 为公共命令增加统一审计包装**

```js
async runAudited(action, metadata, operation) {
  try {
    const result = await operation();
    await this.audit(action, { ...metadata(result), success: true, level: 'info' });
    return result;
  } catch (error) {
    await this.audit(action, { ...metadata(null, error), success: false, level: 'warn', errorCode: error.code || 'OPERATION_REJECTED', message: error.message });
    throw error;
  }
}
```

将每个公共命令的现有实现移入私有 operation 回调；只记录 ID、名称、Method、状态、版本和失败码，不传完整输入、credential 或 proof。

- [ ] **Step 4: 运行审计及领域回归**

Run: `node --test test/audit-logging.test.js test/did-lifecycle.test.js test/vc-lifecycle.test.js test/vc-service.test.js`

Expected: 全部 PASS。

- [ ] **Step 5: 提交审计埋点**

```bash
git add src/vc-service.js test/audit-logging.test.js
git commit -m "feat: audit DID VC and verification operations"
```

---

### Task 4: 请求关联、系统日志与日志 API

**Files:**
- Modify: `src/server.js`
- Create: `test/log-api.test.js`

**Interfaces:**
- Modify: `createAppServer(activeService, { logService } = {})`
- Add: `GET /api/logs`, `GET /api/logs/:id`, `DELETE /api/logs`
- Each request context includes `correlationId`

- [ ] **Step 1: 写入 API、关联 ID 和边界错误测试**

```js
test('GET /api/logs 支持组合筛选和分页', async (t) => {
  const app = await fixture(t);
  const response = await fetch(`${app.url}/api/logs?type=audit&level=warn&page=1&pageSize=10`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.items.every((item) => item.type === 'audit' && item.level === 'warn'), true);
});

test('非法 JSON 记录 REQUEST_INVALID_JSON', async (t) => {
  const app = await fixture(t);
  await fetch(`${app.url}/api/dids`, { method: 'POST', body: '{' });
  assert.equal((await app.logs()).some((item) => item.action === 'REQUEST_INVALID_JSON' && item.type === 'system'), true);
});
```

另测 1MB 超限、未知路由、详情 404、未确认清空、确认清空，以及同一请求 audit/system correlationId 一致。

- [ ] **Step 2: 运行测试并确认日志路由 404**

Run: `node --test test/log-api.test.js`

Expected: FAIL，`/api/logs` 返回接口不存在。

- [ ] **Step 3: 注入日志服务并实现请求上下文**

```js
export function createAppServer(activeService = service, { logService = defaultLogService } = {}) {
  return createServer(async (request, response) => {
    const correlationId = randomUUID();
    const context = { activeService, logService, correlationId };
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(request, response, url, context);
      else await serveStatic(response, url.pathname);
    } catch (error) {
      await recordRequestError(logService, { correlationId, error, request, url });
      sendApiError(response, error);
    }
  });
}
```

`readJson` 抛出带 code 的 `REQUEST_INVALID_JSON`/`REQUEST_TOO_LARGE` 错误；顶层 catch 将可预期错误记 warn，非预期错误记 error。未知 API 路由在返回 404 前记录 ROUTE_NOT_FOUND。

- [ ] **Step 4: 实现日志查询、详情和清空路由**

`GET /api/logs` 传递 search/type/success/level/module/startTime/endTime/page/pageSize；`GET /api/logs/:id` 不存在返回 404；`DELETE /api/logs` 读取 `{confirm:true}` 后调用 clear。响应只来自 LogService 的脱敏数据。

- [ ] **Step 5: 运行 API 回归并提交**

Run: `node --test test/log-api.test.js test/http-api.test.js test/lifecycle-e2e.test.js`

Expected: 全部 PASS。

```bash
git add src/server.js test/log-api.test.js
git commit -m "feat: expose correlated system log APIs"
```

---

### Task 5: 日志中心 UI

**Files:**
- Create: `public/log-ui.js`
- Modify: `public/app.js`
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Create: `test/log-ui.test.js`

**Interfaces:**
- Produces: `createLogFilters()`, `applyLogFilter(state, action)`
- Produces: `renderLogLevel(level)`, `renderLogRow(entry)`, `renderLogEmpty(reason)`

- [ ] **Step 1: 写入级别标识和筛选状态失败测试**

```js
test('日志级别同时输出颜色类和文字', () => {
  assert.match(renderLogLevel('info'), /log-level info[^>]*>INFO/);
  assert.match(renderLogLevel('warn'), /log-level warn[^>]*>WARN/);
  assert.match(renderLogLevel('error'), /log-level error[^>]*>ERROR/);
});

test('任一筛选变化后回到第一页', () => {
  const next = applyLogFilter({ page: 3, pageSize: 10, level: '' }, { type: 'level', value: 'warn' });
  assert.equal(next.page, 1);
  assert.equal(next.level, 'warn');
});
```

- [ ] **Step 2: 运行测试并确认模块不存在**

Run: `node --test test/log-ui.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现纯渲染与筛选状态**

```js
export function renderLogLevel(level) {
  const text = { info: 'INFO', warn: 'WARN', error: 'ERROR' }[level] || 'UNKNOWN';
  return `<span class="log-level ${escapeLevel(level)}">${text}</span>`;
}
```

`renderLogRow` 必须 HTML 转义 message、targetName、targetId，不使用 innerHTML 注入原始 context；详情交给现有 `openJson` 以 textContent 展示脱敏对象。

- [ ] **Step 4: 接入页面和样式**

新增 nav/view-logs，组合筛选控件、表格、详情按钮、清空按钮和分页。CSS 使用 `.log-level.info { color/background: green palette }`、warn yellow、error red，并保持文字对比度。清空通过 `confirm()` 和 DELETE `{confirm:true}`。

- [ ] **Step 5: 运行 UI 测试并提交**

Run: `node --test test/log-ui.test.js test/list-ui.test.js test/did-ui.test.js`

Expected: 全部 PASS。

```bash
git add public/log-ui.js public/app.js public/index.html public/styles.css test/log-ui.test.js
git commit -m "feat: add searchable structured log center"
```

---

### Task 6: 全量验收与文档同步

**Files:**
- Modify: `README.md`
- Modify: `docs/测试与人工验收.md`
- Modify: `docs/交付总结.md`

**Interfaces:**
- Consumes: Tasks 1–5
- Produces: 可复现的日志模块运行和验收说明

- [ ] **Step 1: 运行日志专项与全量测试**

Run: `node --test test/log-*.test.js test/audit-logging.test.js && npm test`

Expected: 0 failed、0 skipped、0 todo。

- [ ] **Step 2: 扫描敏感数据和格式问题**

Run: `rg -n 'privateJwk|proofValue|authorization|password|secret|token' data/logs.json; git diff --check`

Expected: 敏感扫描无真实值（只允许字段说明或 `[REDACTED]`）；`git diff --check` 无输出。

- [ ] **Step 3: 更新用户与验收文档**

README 增加日志中心入口、筛选、级别颜色和清空说明；测试文档记录 LOG-001 至 LOG-020 自动化映射；交付总结增加结构化日志能力与本地 JSON 限制。

- [ ] **Step 4: 人工验收日志中心**

依次完成成功 DID 创建、失败 DID 更新、VC 签发、失败验签、非法 JSON、组合筛选、详情查看、重置和清空。确认颜色+文字、关联 ID、最新在前、分页、重置保留和清空摘要。

- [ ] **Step 5: 最终回归并提交**

```bash
npm test
git add README.md docs/测试与人工验收.md docs/交付总结.md
git commit -m "docs: document structured logging operations"
```

Expected: 全部测试 PASS，`git status --short` 无本计划产生的未提交文件。
