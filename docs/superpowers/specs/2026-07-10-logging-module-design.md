# 结构化日志模块设计

## 1. 目标

为信证台增加独立日志中心，统一记录操作审计日志和系统运行日志，支持成功/失败追踪、关联查询、敏感信息脱敏、限量留存、组合筛选和分级展示。

## 2. 架构边界

```text
HTTP request
  └─ correlationId
      ├─ API/Store boundary ── system event ─┐
      └─ DID/VC service ───── audit event ───┤
                                             ▼
                                         LogService
                           validate → redact → append → trim
                                             │
                                             ▼
                                      data/logs.json
                                             │
                               query/detail/clear API
                                             │
                                             ▼
                                         日志中心 UI
```

- `LogService` 是唯一持久化入口。
- 业务服务产生审计语义，但不读取或写入日志文件。
- API、请求解析和存储边界产生系统事件。
- 日志服务不依赖业务服务，防止循环调用。
- 日志写入失败通过控制台兜底，不改变原业务响应。

## 3. 文件职责

- `src/log-store.js`：独立 `logs.json` 原子读写和 5,000 条上限。
- `src/log-service.js`：校验、级别方法、递归脱敏、查询和清空摘要。
- `src/server.js`：生成 correlationId，记录请求边界事件并暴露日志 API。
- `src/vc-service.js`：在 DID/VC/验签操作成功或失败后发送审计事件。
- `public/log-ui.js`：日志筛选状态、级别样式映射、分页与详情渲染。
- `public/app.js`：日志中心事件和 API 编排。
- `test/log-service.test.js`：模型、脱敏、留存、查询和失败兜底。
- `test/log-api.test.js`：关联 ID、系统事件、详情和清空接口。
- `test/log-ui.test.js`：颜色、文字、筛选回页和空状态。

## 4. 日志模型

每条记录必须包含 id、occurredAt、correlationId、type、level、module、action、success、message。目标字段、错误字段和 context 可以为空。

type 只允许 audit/system；level 只允许 info/warn/error；module 只允许 DID/VC/VERIFY/API/STORE/SYSTEM。action 使用大写下划线稳定标识符。

## 5. 级别规则

- info：成功业务操作与正常系统事件。
- warn：输入错误、资源不存在、能力不支持、状态转换被拒绝等可预期失败。
- error：存储异常、未捕获异常及非预期系统失败。

UI 显示规则为 info 绿色、warn 黄色、error 红色，并始终显示文字标签，满足不依赖颜色的可访问性要求。

## 6. 脱敏策略

递归遍历对象和数组，在持久化前完成脱敏：

- 命中 privateJwk、proofValue、authorization、cookie、token、password、secret 的字段替换为 `[REDACTED]`；
- 名称包含 private/secret/token/password 的字段同样替换；
- credential、requestBody、proof 等大对象整体替换，不复制完整 VC 或请求体；
- 仅保留故障定位需要的 ID、状态、Method、角色、版本、字段名和错误码。

公开日志不存在未脱敏版本。

## 7. 存储与清理

- 独立文件 `data/logs.json`，采用与业务存储一致的原子替换写入。
- append 后只保留 occurredAt 最新的 5,000 条。
- 演示数据重置不触碰日志文件，并追加 DEMO_RESET。
- clear 要求 confirm=true；清除后立即写入唯一 LOG_CLEAR 摘要，context 仅含 clearedCount。
- 不支持编辑和单条删除。

## 8. 查询

查询顺序为校验参数、精确过滤、时间过滤、模糊过滤、稳定排序、分页。

- 精确过滤：type、success、level、module。
- 时间：包含起止边界；startTime 晚于 endTime 失败。
- 模糊搜索：action、targetId、targetName、errorCode、message 任一字段包含完整文本。
- 默认最新在前，相同 occurredAt 按 id 降序。
- 页大小仅允许 10、20、50；超界页修正到有效边界。

## 9. 关联 ID

服务器在每个请求进入时生成 UUID，并通过调用上下文传递给业务服务和日志服务。同一次失败请求若同时产生 system 与 audit 日志，两条记录必须共享 correlationId。日志详情允许按关联 ID跳转筛选。

## 10. 错误处理

- 日志参数非法：拒绝该日志写入并 console.error，不影响原业务。
- 日志文件不存在：自动初始化。
- 日志文件损坏：不得覆盖，日志 API 返回不可用，控制台输出错误。
- 写入失败：不得递归调用 LogService 记录自身失败。
- 查询日志不存在：返回 404。
- 未确认清空：返回 400，并在日志系统可用时记录 warn 审计事件。

## 11. 测试与验收

详细用例为 `docs/测试用例-DID-VC生命周期.md` 中 LOG-001 至 LOG-020。完成条件包括：

- 必记 action 的成功或失败事件均有测试；
- audit/system、info/warn/error 都有实例；
- 敏感字段在内存写入前和磁盘结果中均已脱敏；
- 5,001 条写入后仅保留最新 5,000 条；
- 重置保留日志，清空仅留下摘要；
- 组合筛选、稳定排序和分页边界正确；
- UI 颜色与文字标签同时符合要求；
- 日志失败不改变业务操作结果。
