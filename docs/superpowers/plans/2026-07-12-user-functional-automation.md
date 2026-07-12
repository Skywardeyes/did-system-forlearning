# User Functional Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为高覆盖 Excel 中未执行的用户功能和兼容性用例建立稳定的 Chromium 自动化覆盖并回写真实结果。

**Architecture:** 以 Playwright 浏览器断言用户行为，API 仅负责准备测试状态；公共准备逻辑收敛到 UI fixture。每组脚本按功能域独立运行，最终全量回归并同步 Excel。

**Tech Stack:** Node.js 20、Node test runner、Playwright Chromium、`@oai/artifact-tool`。

## Global Constraints

- 不新增其他浏览器。
- 用户操作和最终断言必须由浏览器完成。
- API 只准备前置数据。
- 每条 Excel 未执行功能/兼容性用例必须有明确测试对应项或不可自动化说明。

---

### Task 1: 修复 proof 篡改测试稳定性

**Files:**
- Modify: `test/functional/did-vc-journeys.test.js`

**Interfaces:**
- Produces: `mutateProofValue(value): string`，返回首字符必定不同的 proof。

- [ ] 写单元断言，覆盖首字符为 `A` 和非 `A` 两种输入。
- [ ] 运行断言确认固定写入 `A` 的旧逻辑失败。
- [ ] 实现 `value[0] === 'A' ? 'B' : 'A'` 的确定性切换。
- [ ] 连续执行目标测试 20 次，全部通过。
- [ ] 提交 `test: make proof tampering deterministic`。

### Task 2: 公共 UI 数据准备与总览/DID 自动化

**Files:**
- Create: `test/helpers/ui-fixtures.js`
- Create: `test/ui/overview-and-empty-states.spec.js`
- Create: `test/ui/did-user-operations.spec.js`

**Interfaces:**
- Produces: `resetDemo(request)`、`createDid(request, input)`、`issueCredential(request, input)`、`seedDids(request, count)`。

- [ ] 先编写总览统计、最近活动、空状态、Issuer/Holder 创建、Document、更新、轮换、停用、did:key 能力、搜索和分页测试。
- [ ] 运行新脚本，确认缺少 fixture 时失败。
- [ ] 实现最小 fixture 和页面操作。
- [ ] 运行两个脚本至全部通过。
- [ ] 提交 `test: automate overview and DID user operations`。

### Task 3: VC 台账与验证记录自动化

**Files:**
- Create: `test/ui/credential-register.spec.js`
- Create: `test/ui/credential-verification-records.spec.js`

**Interfaces:**
- Consumes: Task 2 UI fixture。

- [ ] 编写签发、历史详情、双台账同步、搜索、分页、暂停、恢复、更新、撤销和过期状态测试。
- [ ] 编写七项验证、姓名/课程/Issuer 篡改、非法 JSON、成功/单项/多项/未知失败原因和记录分页测试。
- [ ] 运行新脚本并确认尚未覆盖场景失败。
- [ ] 仅在测试数据准备或测试选择器层补齐实现，不改变业务规则。
- [ ] 运行两个脚本至全部通过。
- [ ] 提交 `test: automate credential register and verification records`。

### Task 4: 日志、演示重置和兼容性自动化

**Files:**
- Create: `test/ui/logs-and-demo-reset.spec.js`
- Create: `test/ui/responsive-compatibility.spec.js`

**Interfaces:**
- Consumes: Task 2 UI fixture。

- [ ] 编写日志组合筛选、详情脱敏、取消/确认清空和演示重置测试。
- [ ] 编写桌面/移动导航、无溢出、长文本台账和表单可用性测试。
- [ ] 使用 `page.route()` 实现请求失败场景的确定性验证。
- [ ] 运行两个脚本至全部通过。
- [ ] 提交 `test: automate logs reset and responsive compatibility`。

### Task 5: 全量执行与 Excel 回写

**Files:**
- Modify: `.artifact-work/build_test_cases.mjs`
- Update: `outputs/test-cases-20260712/DID-VC系统测试用例表-高覆盖版.xlsx`

- [ ] 运行 `npm run test:node`，要求零失败。
- [ ] 运行 `npm run test:ui`，要求零失败。
- [ ] 将实际成功的新增用例改为“通过”，失败项改为“失败”，不可执行项保留“未执行”。
- [ ] 重新生成 Excel，检查统计公式、错误值和两个工作表视觉布局。
- [ ] 运行 `git diff --check` 并提交测试代码和文档更新。
