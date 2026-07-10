# 本地测试记录与自动分析设计

## 目标

每次执行全量自动化测试时，在本地生成带测试时间的独立记录，保存完整原始输出、结构化元数据和简要分析，方便后续 Agent 与人工追溯。测试记录不提交 Git。

## 已确认约束

- 采用“原始日志 + Markdown 摘要 + JSON 元数据”方案。
- `test-records/` 只保存在本机并加入 `.gitignore`。
- 生成工具、测试和使用说明提交到代码库。
- Agent 继续执行统一命令 `npm run test:all`，无需记忆额外入口。
- Node 测试失败后仍继续执行 Chromium UI 测试。
- 记录成功不能覆盖真实测试失败；最终退出码反映全部测试结果。
- 时间以 Asia/Shanghai 展示，同时保留标准 ISO 时间。

## 目录结构

```text
test-records/
  2026-07-10/
    2026-07-10T21-30-15+08-00/
      result.md
      metadata.json
      node.log
      ui.log
```

每次运行创建一个唯一目录。若同一秒发生重名，追加短序号，绝不覆盖历史记录。

## 组件

### 测试记录入口

新增 `test/run-recorded-tests.js`，由 `npm run test:all` 调用。入口负责：

1. 记录开始时间和环境信息。
2. 创建本次运行目录。
3. 顺序执行 `test:node` 与 `test:ui`。
4. 将子进程输出同时转发到当前终端和对应日志文件。
5. 解析测试统计与失败用例。
6. 生成 `metadata.json` 和 `result.md`。
7. 使用所有测试阶段的综合结果设置最终退出码。

### 结果解析与分析

新增可单元测试的纯函数模块 `test/helpers/test-records.js`，负责：

- 生成 Asia/Shanghai 时间字段和安全目录名。
- 解析 Node TAP 汇总中的 tests、pass、fail、skipped、todo。
- 解析 Playwright 汇总中的 passed、failed、skipped。
- 提取失败用例名称。
- 读取现有 `docs/测试缺陷报告.md` 中的已知失败用例名称并匹配。
- 计算总数、通过数、失败数和通过率。
- 区分已知失败与可能新增失败。
- 生成简短、确定性的中文分析和 Markdown 报告。

分析内容包括：

- 本次整体是否通过。
- Node 与 UI 各自结果。
- 总通过率。
- 已知缺陷数量。
- 未匹配失败数量。
- 风险提示和建议下一步。

## 元数据格式

`metadata.json` 至少包含：

- `runId`
- `startedAt`、`finishedAt`
- `startedAtLocal`、`finishedAtLocal`
- `timezone`
- `durationMs`
- Git 分支、提交号、工作区是否干净
- Node、npm、Playwright、Chromium 版本
- Node 和 UI 阶段的命令、退出码、耗时与统计
- 汇总统计、已知失败和未匹配失败
- 最终退出码

不能在元数据或摘要中写入环境变量、密钥、token 或工作区业务数据。

## 错误处理

- 测试命令退出非零：正常记录失败，继续后续阶段。
- 子进程无法启动：记录为阶段基础设施失败，继续生成报告。
- 统计解析失败：保存原始日志，将统计标记为不可用，并在分析中指出解析问题。
- Markdown 生成失败：仍保留原始日志和尽可能完整的 JSON 元数据。
- JSON 生成失败：保留原始日志，并向终端输出明确错误。
- 记录目录无法创建：测试仍执行，终端报告记录功能失败；最终退出码为非零。

## 测试策略

新增单元测试验证：

- Asia/Shanghai 时间与目录名格式。
- 同秒目录冲突处理。
- Node TAP 成功、失败及缺少汇总时的解析。
- Playwright 成功、失败及缺少汇总时的解析。
- 已知缺陷与新增失败匹配。
- 通过率和简要分析生成。
- Markdown 不包含敏感字段。

新增集成测试使用假的子进程输出或注入式命令执行器，验证：

- 成功运行生成四个文件。
- Node 失败后 UI 仍执行。
- 失败运行保持非零退出码。
- 每次运行生成独立目录且不覆盖旧记录。

## 文档

- README 增加记录目录、文件用途和 Agent 执行说明。
- `docs/测试与人工验收.md` 增加记录格式、时间字段和失败判读方式。
- `.gitignore` 增加 `test-records/`。

## 验收标准

- 每次 `npm run test:all` 都创建一个带时间的独立记录目录。
- 记录包含 `result.md`、`metadata.json`、`node.log` 和 `ui.log`。
- 摘要包含测试时间、耗时、统计、失败用例和简要分析。
- Node 失败不阻止 UI 执行与记录。
- 记录目录不进入 Git。
- 生成脚本自身测试通过。
- 当前已知的四项产品缺陷在分析中标记为已知失败，而不是新增失败。
