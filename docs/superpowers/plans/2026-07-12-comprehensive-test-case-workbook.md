# Comprehensive Test Case Workbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 生成一份按业务覆盖组织、包含独立用户功能用例和覆盖总览的中文 Excel 测试用例表。

**Architecture:** 从现有测试源码提取自动化用例并按测试目的重新归类，再追加独立用户功能用例和当前 Chromium 环境兼容性用例。使用 `@oai/artifact-tool` 生成“测试用例”和“覆盖总览”两个工作表，以公式统计结果并执行数据与视觉校验。

**Tech Stack:** Node.js、`@oai/artifact-tool`、Excel `.xlsx`。

## Global Constraints

- 类型只允许接口测试、单元测试、集成测试、功能测试、兼容性测试、安全测试。
- 兼容性测试不包含其他浏览器。
- 主表只使用用户指定的七列。
- 已有直接自动化覆盖且通过的用例标记“通过”；新增或无直接覆盖的功能用例标记“未执行”。

---

### Task 1: 用例目录与分类

**Files:**
- Modify: `.artifact-work/build_test_cases.mjs`

**Interfaces:**
- Consumes: `test/**/*.test.js`、`test/**/*.spec.js`。
- Produces: `automatedCases` 与 `functionalCases`，每项均含七个非空字段。

- [ ] **Step 1: 增加分类断言**

脚本在导出前断言每行类型属于六值集合、七列非空，并断言不存在其他浏览器名称。

- [ ] **Step 2: 运行脚本并确认旧分类不满足断言**

Run: bundled Node 执行 `.artifact-work/build_test_cases.mjs`。
Expected: 旧的“组件/服务测试”等分类触发失败。

- [ ] **Step 3: 按测试目的重写分类**

API 路由测试归为接口测试；独立函数/模块测试归为单元测试；跨服务与存储协作归为集成测试；浏览器用户旅程归为功能测试；视口与布局归为兼容性测试；攻击、防泄漏和协议加固归为安全测试。

- [ ] **Step 4: 添加独立功能用例**

为总览、DID、VC、验证记录、日志、演示重置、空状态、错误提示和确认操作逐项编写用户步骤与预期。已有直接 UI 自动化对应项标记通过，其余标记未执行。

### Task 2: 覆盖总览与工作簿生成

**Files:**
- Modify: `.artifact-work/build_test_cases.mjs`
- Create: `outputs/test-cases-20260712/DID-VC系统测试用例表-高覆盖版.xlsx`

**Interfaces:**
- Consumes: Task 1 的完整用例集合。
- Produces: 两个工作表及类型/模块覆盖统计。

- [ ] **Step 1: 生成主表**

写入七列、筛选表、冻结表头、自动换行、结果下拉列表和状态配色。

- [ ] **Step 2: 生成覆盖总览**

按类型和功能模块展示总数、通过、未执行和通过率；统计公式引用 `'测试用例'!` 的限定数据区域。

- [ ] **Step 3: 导出并校验**

检查关键范围、搜索公式错误、核对总览合计与主表行数一致，并渲染两个工作表进行视觉检查。

- [ ] **Step 4: 交付**

最终文件保存在 `outputs/test-cases-20260712/`，不覆盖旧版文件。
