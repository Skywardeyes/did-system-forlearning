# Credential Ledgers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在凭证签发页复用完整 VC 台账，并在凭证验证页增加带中文失败原因的验证记录台账。

**Architecture:** 后端保持现有日志代码结构；前端以纯函数集中生成 VC 行和验证失败原因，再把同一 VC 行渲染到总览与签发页。验证页复用现有验证日志查询、搜索和分页状态，形成完整表格，总览保留摘要。

**Tech Stack:** Node.js ES modules、原生 HTML/CSS/JavaScript、Node test runner、Playwright。

## Global Constraints

- 不改变 `verificationLogs[].failedChecks` 的持久化结构。
- 总览与签发页 VC 台账共享搜索、分页和生命周期操作状态。
- 失败检查代码必须映射为可读中文，并为未知或缺失原因提供兜底文案。
- 使用现有 API，不增加重复列表端点。

---

### Task 1: 可测试的台账展示函数

**Files:**
- Create: `public/credential-ledger-ui.js`
- Create: `test/unit/credential-ledger-ui.test.js`

**Interfaces:**
- Consumes: credential record `{ id, status, issuedAt, credential }` 和 verification log `{ credentialId, valid, failedChecks, checkedAt }`。
- Produces: `credentialRows(records, helpers): string`、`verificationFailureNote(log): string`、`verificationRows(logs, helpers): string`。

- [ ] **Step 1: 写失败测试**

测试断言 VC 行包含状态和生命周期按钮；成功日志显示“全部检查通过”；`signature` 与 `credentialStatus` 显示中文原因；未知和缺失代码显示兜底原因。

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { credentialRows, verificationFailureNote } from '../../public/credential-ledger-ui.js';

test('credentialRows renders lifecycle actions', () => {
  const html = credentialRows([{ id: 'vc-1', status: 'active', issuedAt: '2026-01-01', credential: { credentialSubject: { name: '张晓明', course: 'VC' } } }], { escapeHtml: String, formatDate: String, short: String });
  assert.match(html, /data-vc-action="suspend"/);
  assert.match(html, /data-revoke="vc-1"/);
});

test('verificationFailureNote renders readable reasons and fallbacks', () => {
  assert.equal(verificationFailureNote({ valid: true }), '全部检查通过');
  assert.match(verificationFailureNote({ valid: false, failedChecks: ['signature', 'credentialStatus'] }), /签名无效.*凭证状态不可用/);
  assert.match(verificationFailureNote({ valid: false, failedChecks: ['futureCheck'] }), /未知检查项/);
  assert.equal(verificationFailureNote({ valid: false }), '未提供具体失败原因');
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node --test test/unit/credential-ledger-ui.test.js`
Expected: FAIL，原因是 `public/credential-ledger-ui.js` 不存在。

- [ ] **Step 3: 写最小实现**

建立检查代码映射：`format`、`issuer`、`didStatus`、`keyVersion`、`signature`、`validity`、`credentialStatus`；实现 HTML 转换函数，保持现有 `data-open-vc`、`data-vc-action`、`data-revoke` 属性不变。

- [ ] **Step 4: 运行测试并确认 GREEN**

Run: `node --test test/unit/credential-ledger-ui.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add public/credential-ledger-ui.js test/unit/credential-ledger-ui.test.js
git commit -m "feat: add reusable credential ledger renderers"
```

### Task 2: 签发页 VC 台账复用

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `test/ui/lifecycle-and-logs.spec.js`

**Interfaces:**
- Consumes: Task 1 `credentialRows(records, helpers)`。
- Produces: `#issue-credential-table`，与 `#credential-table` 同步显示和绑定操作。

- [ ] **Step 1: 写失败的 Playwright 测试**

在重置后导航至 `issue`，断言 `#issue-credential-table` 包含演示凭证；从该表暂停并断言两个表刷新后均为 `suspended`。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `npx playwright test test/ui/lifecycle-and-logs.spec.js -g "issue page reuses"`
Expected: FAIL，找不到 `#issue-credential-table`。

- [ ] **Step 3: 添加页面结构和复用绑定**

在 `view-issue` 的 split layout 后添加台账面板；`app.js` 导入 Task 1 函数，遍历 `#credential-table` 和 `#issue-credential-table` 写入相同行 HTML，然后统一绑定查看、暂停、恢复、更新和撤销事件。签发页增加带 `issue-` 前缀的搜索与分页控件；这些控件读写同一个 `listStates.vc`，每次渲染把搜索值、页大小和页码同步到总览与签发页。

- [ ] **Step 4: 运行相关测试并确认 GREEN**

Run: `npx playwright test test/ui/lifecycle-and-logs.spec.js -g "credential|issue page"`
Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add public/index.html public/app.js test/ui/lifecycle-and-logs.spec.js
git commit -m "feat: show credential ledger on issue page"
```

### Task 3: 验证页失败原因台账

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `test/ui/lifecycle-and-logs.spec.js`

**Interfaces:**
- Consumes: Task 1 `verificationRows(logs, helpers)` 与现有 `/api/verification-logs` 分页结果。
- Produces: `#verification-log-table`、`#verify-log-pagination` 及验证页搜索控件。

- [ ] **Step 1: 写失败的 Playwright 测试**

导航到验证页、加载最新 VC 并验证，断言表格出现“全部检查通过”；篡改姓名再次验证，断言最新行显示失败及“签名无效”。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `npx playwright test test/ui/lifecycle-and-logs.spec.js -g "verification ledger"`
Expected: FAIL，找不到 `#verification-log-table`。

- [ ] **Step 3: 添加表格与刷新逻辑**

在 `view-verify` 底部增加凭证 ID、结果、失败原因备注、验证时间四列；使用 `verificationRows` 渲染完整当前页记录。把现有 `log` 搜索和分页控件移到验证页，总览近期验证只保留四条摘要且不承载列表控件。验签成功保存日志后调用 `refresh()`，保证新记录立即出现。

- [ ] **Step 4: 运行相关测试并确认 GREEN**

Run: `npx playwright test test/ui/lifecycle-and-logs.spec.js -g "verification ledger"`
Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add public/index.html public/app.js test/ui/lifecycle-and-logs.spec.js
git commit -m "feat: add verification ledger failure notes"
```

### Task 4: 全量回归与文档对齐

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Tasks 1–3 的最终页面行为。
- Produces: 用户可发现的新入口说明和完整验证证据。

- [ ] **Step 1: 更新 README 操作说明**

明确签发页底部可管理全部 VC，验证页底部可查看每次验证结果与失败原因。

- [ ] **Step 2: 运行完整验证**

Run: `npm test`
Expected: 全部 Node 测试 PASS。

Run: `npm run test:ui`
Expected: 全部 Playwright 测试 PASS。

Run: `git diff --check`
Expected: 无输出，退出码 0。

- [ ] **Step 3: 检查需求逐项满足**

确认签发页 VC 台账、生命周期操作、验证页记录表、成功备注、单项/多项/未知失败原因、搜索和分页均有测试或现有回归覆盖。

- [ ] **Step 4: 提交**

```powershell
git add README.md
git commit -m "docs: describe credential ledgers"
```
