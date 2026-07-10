# DID/VC Lifecycle Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 扩展信证台的 DID/VC 生命周期与列表能力，并建立覆盖正常签发、验签、状态转换、模糊搜索、分页和默认倒序的自动化验收测试。

**Architecture:** 保持 Node.js 20 内置能力与 JSON 本地存储，在 `VcService` 中承载生命周期规则，在独立查询模块中承载搜索/排序/分页，在 HTTP API 中暴露资源操作。测试以服务层为主、HTTP 与前端组件为辅，并用端到端业务用例验证跨模块状态一致性。

**Tech Stack:** Node.js >=20、ES modules、`node:test`、`node:assert/strict`、Ed25519、原生 HTTP、HTML/CSS/JavaScript、JSON 文件存储。

## Global Constraints

- DID 生命周期：创建、信息更新、密钥轮换、不可逆停用。
- 第一阶段同时支持 `did:example` 和 `did:key`；只有 `did:example` 支持更新、轮换和停用。
- VC 生命周期：`active <-> suspended -> replaced | expired | revoked`；过期、替代和撤销不可恢复。
- DID 停用后禁止新签发；历史 VC 仍校验历史签名，但整体验证必须提示 DID 已停用。
- 列表搜索忽略大小写和首尾空格，按任一字段包含完整搜索文本匹配。
- 默认每页 10 条，可选 10、20、50；搜索或页大小变化后回到第 1 页。
- 默认按业务时间降序，时间相同按记录 ID 降序。
- 不增加第三方运行时依赖，不实现拼音、分词或复杂搜索表达式。

---

## File Structure

- `src/query.js`：纯函数实现搜索、稳定排序和分页，避免生命周期服务承担展示查询逻辑。
- `src/did-methods.js`：Method 注册表、统一能力声明，以及 `did:example`、`did:key` 适配器。
- `src/vc-service.js`：DID/VC 生命周期命令、状态约束、历史密钥解析和验签结论。
- `src/server.js`：列表查询参数及 DID/VC 生命周期 HTTP 路由。
- `public/list-ui.js`：可独立单测的列表查询状态与分页渲染函数。
- `public/app.js`：连接页面事件、API 和列表组件。
- `public/index.html`、`public/styles.css`：搜索框、页大小、分页控件和状态操作入口。
- `test/query.test.js`：搜索、排序、分页边界自动化测试。
- `test/did-lifecycle.test.js`：DID 生命周期与非法转换测试。
- `test/vc-lifecycle.test.js`：VC 生命周期与验签状态测试。
- `test/http-api.test.js`：HTTP 查询参数、错误响应和资源操作测试。
- `test/list-ui.test.js`：前端列表状态和分页交互单元测试。
- `test/lifecycle-e2e.test.js`：六条跨模块核心业务旅程。
- `docs/测试用例-DID-VC生命周期.md`：人工验收与自动化映射用例目录。

---

### Task 1: 通用列表查询内核

**Files:**
- Create: `src/query.js`
- Create: `test/query.test.js`

**Interfaces:**
- Produces: `queryRecords(records, { search, fields, page, pageSize, timeField }) -> { items, total, page, pageSize, totalPages }`
- Produces: `normalizePageSize(value) -> 10 | 20 | 50`

- [ ] **Step 1: 写入搜索、稳定倒序和分页边界失败测试**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { queryRecords } from '../src/query.js';

const rows = Array.from({ length: 51 }, (_, index) => ({
  id: String(index + 1).padStart(3, '0'),
  name: index === 50 ? 'Alice 学员' : `学员${index}`,
  status: index % 2 ? 'active' : 'revoked',
  createdAt: index < 2 ? '2026-07-10T00:00:00.000Z' : new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
}));

test('搜索去除首尾空格且忽略大小写', () => {
  const result = queryRecords(rows, { search: '  ALICE ', fields: ['name'], page: 1, pageSize: 10, timeField: 'createdAt' });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].name, 'Alice 学员');
});

test('时间相同时按 id 降序并对 51 条记录分页', () => {
  const result = queryRecords(rows, { fields: ['name'], page: 1, pageSize: 50, timeField: 'createdAt' });
  assert.equal(result.totalPages, 2);
  assert.equal(result.items.length, 50);
  assert.equal(result.items[0].id, '002');
});

test('超界页修正为最后一个有效页', () => {
  const result = queryRecords(rows, { fields: ['name'], page: 99, pageSize: 20, timeField: 'createdAt' });
  assert.equal(result.page, 3);
  assert.equal(result.items.length, 11);
});
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `node --test test/query.test.js`

Expected: FAIL，包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现最小查询内核**

```js
export function normalizePageSize(value) {
  const size = Number(value);
  return [10, 20, 50].includes(size) ? size : 10;
}

export function queryRecords(records, options = {}) {
  const fields = options.fields || [];
  const search = String(options.search || '').trim().toLocaleLowerCase();
  const filtered = search
    ? records.filter((record) => fields.some((field) => String(record[field] ?? '').toLocaleLowerCase().includes(search)))
    : [...records];
  filtered.sort((left, right) => {
    const timeOrder = String(right[options.timeField] || '').localeCompare(String(left[options.timeField] || ''));
    return timeOrder || String(right.id).localeCompare(String(left.id));
  });
  const pageSize = normalizePageSize(options.pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, Number(options.page) || 1), totalPages);
  return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize, totalPages };
}
```

- [ ] **Step 4: 运行查询测试**

Run: `node --test test/query.test.js`

Expected: 3 tests PASS。

- [ ] **Step 5: 提交查询内核**

```bash
git add src/query.js test/query.test.js
git commit -m "feat: add stable searchable paginated queries"
```

---

### Task 2: DID 信息更新、密钥轮换与停用

**Files:**
- Modify: `src/crypto.js`
- Modify: `src/vc-service.js`
- Create: `test/did-lifecycle.test.js`

**Interfaces:**
- Consumes: 现有 `createDidIdentity({ name, role })`
- Produces: `updateDid(id, { name, serviceEndpoint, expectedVersion })`
- Produces: `rotateDidKey(id, { expectedVersion })`
- Produces: `deactivateDid(id, { expectedVersion })`
- DID record adds `status`, `version`, `updatedAt`, `deactivatedAt`, `keyHistory[]`, `serviceEndpoint`

- [ ] **Step 1: 写入 DID 生命周期失败测试**

```js
test('DID 可更新、轮换密钥并不可逆停用', async (t) => {
  const { service, issuer } = await fixture(t);
  const updated = await service.updateDid(issuer.id, { name: '新名称', serviceEndpoint: 'https://example.test/did', expectedVersion: 1 });
  assert.equal(updated.version, 2);
  const rotated = await service.rotateDidKey(issuer.id, { expectedVersion: 2 });
  assert.equal(rotated.version, 3);
  assert.equal(rotated.keyHistory.length, 1);
  const stopped = await service.deactivateDid(issuer.id, { expectedVersion: 3 });
  assert.equal(stopped.status, 'deactivated');
  await assert.rejects(() => service.rotateDidKey(issuer.id, { expectedVersion: 4 }), /DID 已停用/);
});

test('版本不匹配时拒绝并发更新', async (t) => {
  const { service, issuer } = await fixture(t);
  await service.updateDid(issuer.id, { name: '第一次更新', expectedVersion: 1 });
  await assert.rejects(() => service.updateDid(issuer.id, { name: '过期更新', expectedVersion: 1 }), /版本冲突/);
});
```

- [ ] **Step 2: 运行测试并确认缺少生命周期方法**

Run: `node --test test/did-lifecycle.test.js`

Expected: FAIL，包含 `service.updateDid is not a function`。

- [ ] **Step 3: 为新建 DID 初始化生命周期字段，并实现三个命令**

```js
// createDid 的 identity 入库前
Object.assign(identity, { status: 'active', version: 1, updatedAt: identity.createdAt, deactivatedAt: null, serviceEndpoint: null, keyHistory: [] });

// VcService 内共用约束
assertMutableDid(identity, expectedVersion) {
  if (!identity) throw new Error('未找到指定 DID');
  if (identity.status === 'deactivated') throw new Error('DID 已停用');
  if (identity.version !== Number(expectedVersion)) throw new Error('DID 版本冲突');
}
```

实现时，`updateDid` 只修改允许字段；`rotateDidKey` 把旧 `publicJwk/privateJwk/verificationMethod/version` 写入 `keyHistory` 后生成新密钥并重建 DID Document；三个命令都递增 `version`、更新 `updatedAt`，停用额外写入 `deactivatedAt`。

- [ ] **Step 4: 运行 DID 生命周期与既有测试**

Run: `node --test test/did-lifecycle.test.js test/vc-service.test.js test/did-ui.test.js`

Expected: 全部 PASS，公开 API 仍不返回 `privateJwk` 或历史私钥。

- [ ] **Step 5: 提交 DID 生命周期**

```bash
git add src/crypto.js src/vc-service.js test/did-lifecycle.test.js
git commit -m "feat: manage DID lifecycle and key versions"
```

---

### Task 3: VC 暂停、恢复、替代和终态约束

**Files:**
- Modify: `src/vc-service.js`
- Create: `test/vc-lifecycle.test.js`

**Interfaces:**
- Produces: `suspendCredential(id)`, `resumeCredential(id)`, `replaceCredential(id, input)`, `revokeCredential(id)`
- VC record adds `suspendedAt`, `resumedAt`, `replacedAt`, `replacedBy`, `replaces`

- [ ] **Step 1: 写入 VC 状态转换失败测试**

```js
test('VC 暂停后失败、恢复后通过', async (t) => {
  const { service, issuer, holder } = await fixture(t);
  const record = await issue(service, issuer, holder);
  await service.suspendCredential(record.id);
  assert.equal((await service.verifyCredential(record.credential, { saveLog: false })).valid, false);
  await service.resumeCredential(record.id);
  assert.equal((await service.verifyCredential(record.credential, { saveLog: false })).valid, true);
});

test('更新 VC 生成新 ID 并把旧 VC 标记为 replaced', async (t) => {
  const { service, issuer, holder } = await fixture(t);
  const oldRecord = await issue(service, issuer, holder);
  const next = await service.replaceCredential(oldRecord.id, { courseName: '进阶课程' });
  assert.notEqual(next.id, oldRecord.id);
  assert.equal(next.replaces, oldRecord.id);
  const state = await service.getState();
  assert.equal(state.credentials.find((item) => item.id === oldRecord.id).status, 'replaced');
});

test('撤销后拒绝所有后续转换', async (t) => {
  const { service, issuer, holder } = await fixture(t);
  const record = await issue(service, issuer, holder);
  await service.revokeCredential(record.id);
  await assert.rejects(() => service.suspendCredential(record.id), /终态/);
  await assert.rejects(() => service.resumeCredential(record.id), /终态/);
  await assert.rejects(() => service.replaceCredential(record.id, {}), /终态/);
});
```

- [ ] **Step 2: 运行测试并确认生命周期方法不存在**

Run: `node --test test/vc-lifecycle.test.js`

Expected: FAIL，首个缺失方法为 `suspendCredential`。

- [ ] **Step 3: 实现显式状态转换表**

```js
const VC_TRANSITIONS = {
  active: new Set(['suspended', 'replaced', 'revoked']),
  suspended: new Set(['active', 'replaced', 'revoked']),
  replaced: new Set(),
  expired: new Set(),
  revoked: new Set(),
};

function assertVcTransition(record, nextStatus) {
  if (!record) throw new Error('未找到指定凭证');
  if (!VC_TRANSITIONS[record.status]?.has(nextStatus)) throw new Error('凭证已处于终态或不允许该状态转换');
}
```

`suspendCredential` 与 `resumeCredential` 更新状态及审计时间；`replaceCredential` 复制原凭证主体、合并允许更新字段后调用签发逻辑生成新 ID，并原子写入 `replacedBy/replaces`；`revokeCredential` 改为通过同一转换表约束重复撤销。

- [ ] **Step 4: 运行 VC 生命周期与既有验签测试**

Run: `node --test test/vc-lifecycle.test.js test/vc-service.test.js`

Expected: 全部 PASS。

- [ ] **Step 5: 提交 VC 生命周期**

```bash
git add src/vc-service.js test/vc-lifecycle.test.js
git commit -m "feat: add complete VC lifecycle transitions"
```

---

### Task 4: 历史密钥与细分验签结论

**Files:**
- Modify: `src/vc-service.js`
- Modify: `test/vc-lifecycle.test.js`
- Modify: `test/vc-service.test.js`

**Interfaces:**
- `verifyCredential` adds checks: `didStatus`, `keyVersion`, `credentialStatus`
- `proof` adds immutable `keyVersion`

- [ ] **Step 1: 写入历史 VC 和停用 DID 验签失败测试**

```js
test('轮换密钥后历史和新 VC 都使用对应密钥通过签名检查', async (t) => {
  const { service, issuer, holder } = await fixture(t);
  const oldVc = await issue(service, issuer, holder);
  const rotated = await service.rotateDidKey(issuer.id, { expectedVersion: 1 });
  const newVc = await issue(service, rotated, holder);
  for (const vc of [oldVc, newVc]) {
    const result = await service.verifyCredential(vc.credential, { saveLog: false });
    assert.equal(result.checks.find((item) => item.key === 'signature').passed, true);
    assert.equal(result.checks.find((item) => item.key === 'keyVersion').passed, true);
  }
});

test('Issuer 停用后历史 VC 签名有效但整体无效', async (t) => {
  const { service, issuer, holder } = await fixture(t);
  const record = await issue(service, issuer, holder);
  await service.deactivateDid(issuer.id, { expectedVersion: 1 });
  const result = await service.verifyCredential(record.credential, { saveLog: false });
  assert.equal(result.valid, false);
  assert.equal(result.checks.find((item) => item.key === 'signature').passed, true);
  assert.equal(result.checks.find((item) => item.key === 'didStatus').passed, false);
});
```

- [ ] **Step 2: 运行测试并确认当前验签无法解析历史版本**

Run: `node --test test/vc-lifecycle.test.js`

Expected: FAIL，缺少 `keyVersion` 或 `didStatus` 检查项。

- [ ] **Step 3: 签发时固化密钥版本，验签时解析当前或历史公钥**

```js
credential.proof.keyVersion = issuer.version;
const keyVersion = Number(credential?.proof?.keyVersion || 1);
const keyRecord = keyVersion === issuer?.version
  ? issuer
  : issuer?.keyHistory.find((item) => item.version === keyVersion);
```

验签结果必须分别记录：DID 是否存在、DID 是否可用、密钥版本是否存在、签名是否有效、时间是否有效、凭证是否处于 `active`。当 `validUntil` 已过时，将持久化记录视图状态归一为 `expired`，但不得修改已签名的 VC 正文。

- [ ] **Step 4: 更新既有断言并运行全部服务测试**

Run: `node --test test/vc-service.test.js test/did-lifecycle.test.js test/vc-lifecycle.test.js`

Expected: 全部 PASS；每个检查项都有至少一个通过与失败测试。

- [ ] **Step 5: 提交验签增强**

```bash
git add src/vc-service.js test/vc-service.test.js test/vc-lifecycle.test.js
git commit -m "feat: verify VC against DID and key lifecycle"
```

---

### Task 5: 生命周期与分页 HTTP API

**Files:**
- Modify: `src/server.js`
- Modify: `src/vc-service.js`
- Create: `test/http-api.test.js`

**Interfaces:**
- `GET /api/dids?search=&page=&pageSize=`
- `PATCH /api/dids/:id`
- `POST /api/dids/:id/rotate-key`
- `POST /api/dids/:id/deactivate`
- `GET /api/credentials?search=&page=&pageSize=`
- `POST /api/credentials/:id/suspend|resume|replace|revoke`
- `GET /api/verification-logs?search=&page=&pageSize=`

- [ ] **Step 1: 写入 HTTP 路由与分页失败测试**

```js
test('GET /api/credentials 返回搜索后的分页元数据和倒序数据', async (t) => {
  const app = await startTestServer(t);
  await app.seedCredentials(11);
  const response = await fetch(`${app.url}/api/credentials?search=课程&page=2&pageSize=10`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.total, 11);
  assert.equal(body.page, 2);
  assert.equal(body.items.length, 1);
});

test('停用 DID 后签发接口返回 400 和明确错误', async (t) => {
  const app = await startTestServer(t);
  const { issuer, holder } = await app.seedDids();
  await fetch(`${app.url}/api/dids/${issuer.id}/deactivate`, { method: 'POST', body: JSON.stringify({ expectedVersion: 1 }) });
  const response = await fetch(`${app.url}/api/credentials`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(app.issueBody(issuer, holder)) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Issuer DID 已停用/);
});
```

- [ ] **Step 2: 运行测试并确认路由返回 404 或旧结构**

Run: `node --test test/http-api.test.js`

Expected: FAIL，列表结构或生命周期路由不符合预期。

- [ ] **Step 3: 增加可注入服务的服务器工厂和显式路由**

```js
export function createAppServer(service) {
  return createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    // handleApi(request, response, url, service)
  });
}
```

将当前模块级服务器改由 `createAppServer(service)` 创建；路由只解析参数并调用 Task 2–4 的服务方法。列表方法调用 `queryRecords`，字段严格使用规格中每类列表的白名单。

- [ ] **Step 4: 运行 HTTP 与服务测试**

Run: `node --test test/http-api.test.js test/query.test.js test/*lifecycle.test.js`

Expected: 全部 PASS。

- [ ] **Step 5: 提交 API**

```bash
git add src/server.js src/vc-service.js test/http-api.test.js
git commit -m "feat: expose lifecycle and paginated list APIs"
```

---

### Task 6: 列表搜索、分页和状态操作前端

**Files:**
- Create: `public/list-ui.js`
- Modify: `public/app.js`
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Create: `test/list-ui.test.js`

**Interfaces:**
- Produces: `createListState({ pageSize = 10 })`
- Produces: `applyListAction(state, action) -> nextState`
- Produces: `renderPagination({ page, totalPages, total }) -> string`

- [ ] **Step 1: 写入列表状态与按钮边界失败测试**

```js
test('搜索和页大小变化都返回第一页', () => {
  const initial = { search: '', page: 3, pageSize: 10 };
  assert.deepEqual(applyListAction(initial, { type: 'search', value: ' Alice ' }), { search: ' Alice ', page: 1, pageSize: 10 });
  assert.deepEqual(applyListAction(initial, { type: 'pageSize', value: 20 }), { search: '', page: 1, pageSize: 20 });
});

test('首页禁用上一页且末页禁用下一页', () => {
  assert.match(renderPagination({ page: 1, totalPages: 3, total: 21 }), /data-page="prev" disabled/);
  assert.match(renderPagination({ page: 3, totalPages: 3, total: 21 }), /data-page="next" disabled/);
});
```

- [ ] **Step 2: 运行测试并确认前端模块不存在**

Run: `node --test test/list-ui.test.js`

Expected: FAIL，包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现纯列表状态组件并接入三类列表**

```js
export function applyListAction(state, action) {
  if (action.type === 'search') return { ...state, search: action.value, page: 1 };
  if (action.type === 'pageSize') return { ...state, pageSize: Number(action.value), page: 1 };
  if (action.type === 'page') return { ...state, page: action.value };
  return state;
}
```

每类列表维护独立状态并请求对应 API。HTML 为 DID、VC、验签记录各增加搜索框、10/20/50 页大小选择器、总数和前后翻页按钮；生命周期按钮按当前状态显示，执行不可逆操作前要求确认。

- [ ] **Step 4: 运行前端单测和现有 DID UI 测试**

Run: `node --test test/list-ui.test.js test/did-ui.test.js`

Expected: 全部 PASS。

- [ ] **Step 5: 提交前端列表**

```bash
git add public/list-ui.js public/app.js public/index.html public/styles.css test/list-ui.test.js
git commit -m "feat: add searchable paginated lifecycle lists"
```

---

### Task 7: 详细测试用例目录与端到端旅程

**Files:**
- Create: `test/lifecycle-e2e.test.js`
- Create: `docs/测试用例-DID-VC生命周期.md`

**Interfaces:**
- Consumes: Tasks 2–6 的服务和 HTTP 接口
- Produces: 六条自动化主旅程及人工验收用例矩阵

- [ ] **Step 1: 编写六条端到端测试**

测试名称必须逐条对应：

```js
test('E2E-01 创建 DID、签发 VC 并验签成功', async (t) => {});
test('E2E-02 更新 DID、轮换密钥后新旧 VC 分别验签', async (t) => {});
test('E2E-03 暂停 VC 后失败且恢复后成功', async (t) => {});
test('E2E-04 更新 VC 后旧证 replaced 且新证 active', async (t) => {});
test('E2E-05 VC 过期或撤销后不可恢复', async (t) => {});
test('E2E-06 DID 停用后禁止签发且历史签名仍有效', async (t) => {});
```

每条测试通过 HTTP 完成操作，不直接修改 JSON 存储；断言 HTTP 状态、持久化记录状态和最终验签检查项。

- [ ] **Step 2: 运行端到端测试并修正测试夹具问题**

Run: `node --test test/lifecycle-e2e.test.js`

Expected: 6 tests PASS；进程结束后无监听端口或临时数据残留。

- [ ] **Step 3: 编写可追踪的详细测试用例目录**

`docs/测试用例-DID-VC生命周期.md` 每条记录使用以下固定格式，不省略测试数据和预期状态：

```markdown
### DID-LC-P0-001 创建 Issuer DID

- 层级：服务/API/前端
- 前置条件：本地注册表为空
- 测试数据：名称“可信学习中心”，角色 `issuer`
- 步骤：提交创建请求；打开 DID Document；刷新列表
- 预期：返回 201；状态为 `active`、版本为 1；Document 可解析；公开响应无私钥；刷新后记录位于列表首位
- 自动化：`test/did-lifecycle.test.js` 对应用例名称
```

目录必须覆盖规格第 6 节全部模块、所有允许和禁止转换、每个验签项的通过/失败、0/1/10/11/20/21/50/51 分页边界，以及中文、英文、特殊字符和无结果搜索。

- [ ] **Step 4: 检查用例编号、优先级和自动化映射**

Run: `rg -n "^### (DID|VC|LIST|E2E)-" docs/测试用例-DID-VC生命周期.md`

Expected: 所有编号唯一；每条包含层级、前置条件、测试数据、步骤、预期和自动化字段；P0 覆盖签发、验签、私钥保护与不可逆状态。

- [ ] **Step 5: 提交验收资产**

```bash
git add test/lifecycle-e2e.test.js docs/测试用例-DID-VC生命周期.md
git commit -m "test: add lifecycle acceptance catalogue and journeys"
```

---

### Task 8: 全量回归与交付说明

**Files:**
- Modify: `README.md`
- Modify: `docs/测试与人工验收.md`

**Interfaces:**
- Consumes: 所有新增功能与测试
- Produces: 可复现的运行、自动化测试和人工验收说明

- [ ] **Step 1: 运行全量自动化测试**

Run: `npm test`

Expected: 所有测试 PASS，0 failed、0 skipped、0 todo。

- [ ] **Step 2: 检查未提交差异和格式问题**

Run: `git diff --check`

Expected: 无输出，退出码为 0。

- [ ] **Step 3: 更新运行说明和测试覆盖映射**

README 增加生命周期状态、列表参数和操作入口；`docs/测试与人工验收.md` 记录测试命令、各测试文件职责、六条 E2E 旅程，并链接 `docs/测试用例-DID-VC生命周期.md`。

- [ ] **Step 4: 按人工用例抽验 P0 主流程**

Run: `npm start`

Expected: 浏览器可完成 DID 创建、VC 签发/验签、暂停/恢复、密钥轮换、DID 停用及列表搜索分页；刷新后状态与顺序不丢失。

- [ ] **Step 5: 最终回归并提交文档**

```bash
npm test
git add README.md docs/测试与人工验收.md
git commit -m "docs: document lifecycle testing and acceptance"
```

Expected: 全部测试 PASS，提交后 `git status --short` 无本计划产生的未提交文件。
