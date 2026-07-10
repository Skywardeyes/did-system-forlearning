# DID 创建结果前端展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 DID 创建成功后的表单重置异常，并在现有 DID 注册表中立即展示完整 DID、公钥 JWK 和 DID Document 入口。

**Architecture:** 把可测试的 DID 创建完成流程和身份卡片 HTML 生成逻辑提取到独立浏览器 ES 模块，`public/app.js` 只负责 DOM 绑定和状态刷新。后端接口与存储模型保持不变，继续通过 `publicDid()` 移除私钥。

**Tech Stack:** Node.js 20、浏览器原生 ES Modules、Node.js `node:test`、原生 HTML/CSS/JavaScript。

## Global Constraints

- 私钥继续只保存在服务端本地数据文件，不通过 API 返回，也不在浏览器中展示。
- 不新增第三方依赖。
- 不新增独立结果面板或创建结果弹窗。
- 不修改 DID、密钥或 VC 的后端数据模型。

---

### Task 1: 可测试的 DID 创建完成流程

**Files:**
- Create: `public/did-ui.js`
- Create: `test/did-ui.test.js`
- Modify: `public/app.js:140-145`

**Interfaces:**
- Consumes: `completeDidCreation({ form, body, api, refresh, notify })` 接收表单对象、序列化表单数据和四个依赖。
- Produces: 返回 API 创建的公开 DID 对象；成功时依次调用 `form.reset()`、`refresh()` 和 `notify()`。

- [ ] **Step 1: 写出失败的异步表单回归测试**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { completeDidCreation } from '../public/did-ui.js';

test('DID 创建完成后使用稳定表单引用重置、刷新并显示完整 DID', async () => {
  const calls = [];
  const form = { reset: () => calls.push('reset') };
  const created = { did: 'did:key:z6MkCreated', role: 'issuer' };

  const result = await completeDidCreation({
    form,
    body: { name: '可信学习中心', role: 'issuer' },
    api: async (path, options) => {
      calls.push([path, JSON.parse(options.body)]);
      await Promise.resolve();
      return created;
    },
    refresh: async () => calls.push('refresh'),
    notify: (message) => calls.push(message),
  });

  assert.equal(result, created);
  assert.deepEqual(calls, [
    ['/api/dids', { name: '可信学习中心', role: 'issuer' }],
    'reset',
    'refresh',
    'DID 身份创建成功：did:key:z6MkCreated',
  ]);
});
```

- [ ] **Step 2: 运行测试确认因模块不存在而失败**

Run: `node --test test/did-ui.test.js`

Expected: FAIL，错误包含 `ERR_MODULE_NOT_FOUND`，证明测试在功能实现前能够捕获缺失行为。

- [ ] **Step 3: 实现最小创建完成函数**

创建 `public/did-ui.js`：

```js
export async function completeDidCreation({ form, body, api, refresh, notify }) {
  const created = await api('/api/dids', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  form.reset();
  await refresh();
  notify(`DID 身份创建成功：${created.did}`);
  return created;
}
```

修改 `public/app.js` 顶部及提交处理器：

```js
import { completeDidCreation } from './did-ui.js';

$('#did-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form));
  try {
    await completeDidCreation({ form, body, api, refresh, notify: toast });
  } catch (error) {
    toast(error.message, true);
  }
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/did-ui.test.js`

Expected: 1 test、1 pass、0 fail。

- [ ] **Step 5: 提交创建流程修复**

```powershell
git add -- public/did-ui.js public/app.js test/did-ui.test.js
git commit -m "fix: 修复 DID 创建后的前端刷新"
```

---

### Task 2: DID 注册表展示公钥详情

**Files:**
- Modify: `public/did-ui.js`
- Modify: `public/app.js:49-63`
- Modify: `public/styles.css`
- Modify: `test/did-ui.test.js`

**Interfaces:**
- Consumes: `renderDidCard(item, { escapeHtml, formatDate })` 接收 API 返回的公开身份对象。
- Produces: 身份卡片 HTML，包含名称、角色、完整 DID、格式化公钥 JWK 和 DID Document 按钮；不渲染 `privateJwk`。

- [ ] **Step 1: 写出失败的身份卡片展示测试**

```js
import { completeDidCreation, renderDidCard } from '../public/did-ui.js';

test('身份卡片展示完整 DID、公钥 JWK 和 DID Document 入口但不展示私钥', () => {
  const item = {
    id: 'identity-1',
    name: '可信学习中心',
    role: 'issuer',
    did: 'did:key:z6MkCompleteIdentifier',
    createdAt: '2026-07-10T00:00:00.000Z',
    publicJwk: { kty: 'OKP', crv: 'Ed25519', x: 'public-x' },
    privateJwk: { d: 'must-not-render' },
  };

  const html = renderDidCard(item, {
    escapeHtml: (value) => String(value).replaceAll('"', '&quot;'),
    formatDate: () => '2026/7/10',
  });

  assert.match(html, /did:key:z6MkCompleteIdentifier/);
  assert.match(html, /&quot;kty&quot;: &quot;OKP&quot;/);
  assert.match(html, /data-document="identity-1"/);
  assert.doesNotMatch(html, /must-not-render|privateJwk/);
});
```

- [ ] **Step 2: 运行测试确认因导出缺失而失败**

Run: `node --test test/did-ui.test.js`

Expected: FAIL，错误指出 `renderDidCard` 未导出。

- [ ] **Step 3: 实现安全身份卡片生成并接入注册表**

在 `public/did-ui.js` 增加：

```js
export function renderDidCard(item, { escapeHtml, formatDate }) {
  const publicJwk = escapeHtml(JSON.stringify(item.publicJwk, null, 2));
  return `
    <article class="identity-card">
      <div class="identity-head"><span class="role-tag ${escapeHtml(item.role)}">${escapeHtml(item.role.toUpperCase())}</span><strong>${escapeHtml(item.name)}</strong></div>
      <div class="identity-field"><span>完整 DID</span><code>${escapeHtml(item.did)}</code></div>
      <div class="identity-field"><span>公钥 JWK</span><pre>${publicJwk}</pre></div>
      <div class="identity-actions"><button class="text-button" data-document="${escapeHtml(item.id)}">查看 DID Document</button><span class="count">${formatDate(item.createdAt)}</span></div>
    </article>`;
}
```

在 `public/app.js` 导入 `renderDidCard`，将 `state.dids.map(...)` 替换为：

```js
list.innerHTML = state.dids
  .map((item) => renderDidCard(item, { escapeHtml, formatDate }))
  .join('');
```

- [ ] **Step 4: 为新增详情补充最小样式**

在 `public/styles.css` 添加：

```css
.identity-field { display: grid; gap: 6px; }
.identity-field > span { color: var(--muted); font-size: 12px; }
.identity-field code,
.identity-field pre { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
```

- [ ] **Step 5: 运行全部测试确认通过**

Run: `npm test`

Expected: 8 tests、8 pass、0 fail。

- [ ] **Step 6: 提交注册表详情展示**

```powershell
git add -- public/did-ui.js public/app.js public/styles.css test/did-ui.test.js
git commit -m "feat: 展示 DID 创建结果与公钥"
```

---

### Task 3: 浏览器端验收与安全边界核对

**Files:**
- Verify: `public/index.html`
- Verify: `public/app.js`
- Verify: `data/store.json`

**Interfaces:**
- Consumes: 本地应用 `http://127.0.0.1:4173`。
- Produces: 创建 Issuer DID 的可复现验收证据。

- [ ] **Step 1: 启动应用并打开 DID 身份模块**

Run: `npm start`

Expected: 控制台显示 `DID/VC Learning Lab running at http://127.0.0.1:4173`。

- [ ] **Step 2: 创建唯一命名的 Issuer DID**

输入名称 `前端展示验收机构`，角色选择 `Issuer`，点击“生成 DID 与密钥对”。

Expected: 请求返回 201；无 `Cannot read properties of null`；表单被重置；成功提示包含完整 DID。

- [ ] **Step 3: 核对注册表展示**

Expected: 新身份立即出现，卡片包含完整 DID、公钥 JWK，并能打开 DID Document。

- [ ] **Step 4: 核对私钥边界**

检查 `POST /api/dids` 和 `GET /api/state` 响应。

Expected: 响应中不存在 `privateJwk`；`data/store.json` 对应身份记录包含 `privateJwk`。

- [ ] **Step 5: 运行最终验证**

Run: `npm test; git diff --check; git status --short --branch`

Expected: 全部测试通过、`git diff --check` 无输出、分支状态只包含计划内提交且工作区干净。
