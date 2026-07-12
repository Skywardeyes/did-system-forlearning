# Local Test Evidence Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有本地测试记录器升级为永久留存、可验证哈希、可追踪到用例的证据系统。

**Architecture:** 保留 `test/run-recorded-tests.js` 作为统一入口，将文件归档、用例解析和哈希能力拆到 `test/helpers/test-evidence.js`。独立 CLI 提供证据验证和历史列表；所有命令仅操作本地 `test-records/`。

**Tech Stack:** Node.js 20、Node test runner、Playwright、SHA-256、JSON/Markdown。

## Global Constraints

- 永久保留全部批次，不实现清理命令。
- Node 失败后仍执行 UI。
- 成功要求零失败、零跳过、零 todo 且证据生成完整。
- 不保存环境变量、私钥、令牌或业务数据文件。

---

### Task 1: 证据文件工具与哈希验证

**Files:**
- Create: `test/helpers/test-evidence.js`
- Create: `test/unit/test-evidence.test.js`

- [ ] 先测试递归文件清单、SHA-256、缺失/修改/新增检测和目录复制。
- [ ] 运行单元测试，确认模块不存在而失败。
- [ ] 实现 `archiveDirectory`、`buildEvidenceManifest`、`verifyEvidenceManifest`。
- [ ] 运行单元测试至通过并提交。

### Task 2: 用例级解析与执行器增强

**Files:**
- Modify: `test/helpers/test-records.js`
- Modify: `test/run-recorded-tests.js`
- Modify: `test/integration/test-record-runner.test.js`

- [ ] 写失败测试，要求成功/失败批次生成 `test-cases.json`、归档报告和附件，并严格判定 skipped/todo。
- [ ] 扩展 TAP 和 Playwright 解析为用例记录；无法定位路径时为 `null`。
- [ ] 设置本次 Playwright 报告/结果临时目录，运行后复制到批次目录。
- [ ] 最后生成 manifest 与 checksums，并保证失败阶段仍完成证据写入。
- [ ] 运行集成测试至通过并提交。

### Task 3: 验证和历史 CLI

**Files:**
- Create: `test/verify-test-evidence.js`
- Create: `test/list-test-evidence.js`
- Create: `test/integration/test-evidence-cli.test.js`
- Modify: `package.json`

- [ ] 先测试正常验证、篡改失败、缺参失败和历史倒序列表。
- [ ] 实现 `test:evidence`、`test:evidence:verify`、`test:evidence:list` 命令。
- [ ] 运行 CLI 集成测试至通过并提交。

### Task 4: 真实本地证据执行与文档

**Files:**
- Modify: `docs/测试与人工验收.md`

- [ ] 更新本地可信执行、证据目录、验证命令和判定规则。
- [ ] 运行 `npm run test:evidence` 生成真实批次。
- [ ] 检查 Node 123/123、Chromium UI 43/43、用例数量、HTML 报告和哈希清单。
- [ ] 运行 `npm run test:evidence:verify -- <批次目录>` 并要求通过。
- [ ] 复制批次后篡改一份日志，确认验证命令非零且指出文件。
- [ ] 运行完整 Node/UI 回归、`git diff --check` 并提交。
