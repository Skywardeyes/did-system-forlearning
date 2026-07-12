# Presentation Documents Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将三份汇报文档同步到当前项目功能、测试和演示路径。

**Architecture:** 先建立统一事实清单，再按三份文档各自用途定向替换过期内容。最后通过全文搜索和差异检查验证数字、入口、依赖状态和待办一致。

**Tech Stack:** Markdown、Mermaid、PowerShell `rg`、Git。

## Global Constraints

- 保留原时间轴、章节顺序和 A/B 分工。
- 统一使用 Node 123/123、Chromium UI 43/43、proof 20/20。
- 不宣称其他浏览器兼容。
- 不改代码，只改三份指定文档。

---

### Task 1: 更新科班内容细纲

**Files:**
- Modify: `docs/方案二（科班）-汇报内容细纲.md`

- [ ] 将测试结果、Playwright 状态、测试覆盖和局限更新为当前事实。
- [ ] 在需求、表现层、演示和测试章节补充签发页 VC 台账、验证记录台账和失败原因备注。
- [ ] 删除安装 Playwright、UI 未执行和 UI 依赖待处理的过期待办。
- [ ] 搜索确认不再出现 120 项、未安装 Playwright或 UI 未执行。

### Task 2: 更新科班流程大纲

**Files:**
- Modify: `docs/方案二（科班）-汇报流程大纲.md`

- [ ] 保持时间和角色不变，将生命周期操作明确放在签发页底部台账。
- [ ] 将验证结果和失败原因明确放在验证页及其记录台账。
- [ ] 在测试环节补充 Node、UI 和稳定性证据。

### Task 3: 更新非科班双人演讲细纲

**Files:**
- Modify: `docs/方案一（非科班）-两人合作项目汇报时序与演讲细纲.md`

- [ ] 更新所有 120 项和 Playwright 未安装表述。
- [ ] 调整演示步骤和串词，优先使用签发页台账管理 VC，并在验证页说明失败原因台账。
- [ ] 更新现场准备、风险预案、检查清单和结尾问答中的测试事实。

### Task 4: 三文档一致性验证

- [ ] 使用 `rg` 搜索旧数字、旧依赖状态、台账入口和测试命令。
- [ ] 检查 Mermaid 代码围栏成对、Markdown 标题结构未破坏。
- [ ] 运行 `git diff --check`。
- [ ] 审阅差异，确认只修改三份目标文档并提交 `docs: sync presentation materials with current system`。
