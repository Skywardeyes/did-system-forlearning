# 用户功能用例自动化设计

## 目标

为高覆盖测试用例表中尚未执行的用户功能和兼容性用例补充稳定、可重复运行的 Chromium 自动化脚本，并修复现有 proof 篡改测试的概率性失败。

## 自动化边界

功能测试的用户操作和最终断言必须在浏览器中完成。API 只用于准备大量数据、过期凭证、多项失败记录等前置状态，不得用纯 API 成功替代页面行为验证。

兼容性范围仅包含当前 Chromium 环境中的桌面和移动视口、导航、溢出、表格、长文本和表单布局，不新增其他浏览器。

## 脚本结构

- `test/ui/overview-and-empty-states.spec.js`：总览统计、最近活动、DID/VC/验证空状态和请求失败提示。
- `test/ui/did-user-operations.spec.js`：Issuer/Holder 创建、DID Document、更新、轮换、停用、did:key 能力、搜索和分页。
- `test/ui/credential-register.spec.js`：签发、历史台账、详情、同步、搜索、分页和 VC 生命周期操作。
- `test/ui/credential-verification-records.spec.js`：七项验证、各类篡改、非法 JSON、成功/单项/多项/未知失败原因及记录搜索分页。
- `test/ui/logs-and-demo-reset.spec.js`：日志筛选、详情、脱敏、取消/确认清空和演示重置。
- `test/ui/responsive-compatibility.spec.js`：桌面/移动导航、溢出、长文本台账和表单可用性。

重复的数据创建和页面导航逻辑放入 `test/helpers/ui-fixtures.js`，但断言保留在具体测试中。

## 稳定性修复

proof 篡改不得固定把首字符改为 `A`。测试应读取原字符，在 `A` 与 `B` 之间切换，保证每次都产生不同签名数据；连续重复执行不得出现随机通过。

请求失败场景使用 Playwright 路由拦截返回确定的错误响应，不修改生产代码，不依赖断网或外部服务。

## 用例追踪与结果

新增 Playwright 标题与 Excel 功能/兼容性用例标题保持一致。所有脚本执行后，依据实际结果更新高覆盖 Excel：成功为“通过”，失败为“失败”，仍无法自动执行的场景保留“未执行”。

不得因同模块的其他测试通过而推断某条用例通过。

## 验收标准

- 33 条未执行功能用例和 2 条未执行兼容性用例均有明确自动化对应项，或有可审计的无法自动化原因。
- proof 篡改测试连续执行至少 20 次全部通过。
- 全部 Node 测试和 Chromium UI 测试通过。
- 测试标题可与 Excel 用例一一追踪。
- Excel 覆盖总览与最终测试结果一致。
