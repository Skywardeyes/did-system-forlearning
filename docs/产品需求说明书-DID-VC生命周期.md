# 信证台 DID/VC 生命周期管理产品需求说明书

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 产品名称 | 信证台 DID/VC Learning Lab |
| 文档性质 | 扩展阶段唯一权威产品需求基线 |
| 适用对象 | 产品、开发 Agent、测试 Agent、人工验收人员 |
| 运行环境 | Node.js 20+，本地单机 Web 应用 |
| 关联用例 | `docs/测试用例-DID-VC生命周期.md` |
| 技术选型 | `docs/DID方法选型说明.md` |

本文中的“必须”“不得”属于强制验收要求；“应”表示默认必须满足，除非实现记录了明确理由；“可”表示可选能力。

## 2. 产品目标

系统以培训结业凭证为业务场景，在不依赖区块链、外部数据库或第三方运行时包的前提下，完整展示：

1. 使用 `did:example` 或 `did:key` 创建 Issuer、Holder 身份；
2. 使用 Issuer 的 Ed25519 私钥签发 VC；
3. 根据 Issuer DID Document 中的验证方法完成签名验证；
4. 管理 `did:example` 的更新、密钥轮换和停用；
5. 管理 VC 的暂停、恢复、更新/重新签发、过期和撤销；
6. 区分密码学签名有效、DID 当前可用和 VC 当前可接受；
7. 对 DID、VC、验签记录提供模糊搜索、稳定倒序和分页。
8. 通过独立日志中心查看业务操作与系统运行的成功、失败和异常记录。

## 3. 产品边界

### 3.1 本期范围

- DID Method：`did:example`、`did:key`；
- DID 角色：Issuer、Holder；
- 签名算法：Ed25519；
- VC 类型：培训结业凭证；
- 存储：本地 JSON 文件；
- 客户端：本地浏览器管理和演示页面；
- 操作审计：生命周期变更时间、版本及验签日志；
- 自动化测试：服务、API、前端纯函数和端到端主流程。
- 日志：操作审计日志、系统运行日志、组合查询、脱敏详情和留存清理。

### 3.2 不在本期范围

- 真实身份核验、账号登录、RBAC 或多租户；
- 生产级 KMS/HSM、私钥加密备份或恢复；
- 区块链、共识、链上费用或跨链解析；
- 真实 `did:web` 发布与 HTTPS 域名运维；
- 外部通用 DID Resolver 或生产钱包互操作；
- 正式 W3C Data Integrity cryptosuite 兼容声明；
- Bitstring Status List、BBS+、零知识证明或正式 SD-JWT VC；教学版加盐摘要选择性披露属于本期扩展能力；
- 拼音、分词、多关键词布尔表达式；
- 明确容量指标前的性能压测。

## 4. 角色与术语

| 术语 | 定义 |
|---|---|
| Issuer | 使用自身 DID 和私钥签发 VC 的培训机构 |
| Holder | VC 的主体，即接受培训结业凭证的学员 |
| Verifier | 提交 VC 并查看逐项验证结论的使用者 |
| DID Method | 规定 DID 创建、解析和生命周期能力的方法 |
| 验签 | 仅指密码学签名检查，不等同于凭证整体有效 |
| 整体验证 | 格式、Issuer、DID 状态、密钥、签名、时间和 VC 状态全部检查 |
| 历史密钥 | `did:example` 轮换后保留、仅用于验证历史签名的旧公钥 |

## 5. DID Method 需求

### 5.1 能力矩阵

| 能力 | `did:example` | `did:key` |
|---|---|---|
| 创建 | 必须支持 | 必须支持 |
| 解析 DID Document | 本地注册表 | 从 DID 推导或本地缓存 |
| VC 签名/验签 | 必须支持 | 必须支持 |
| 信息更新 | 必须支持 | 必须拒绝 |
| 密钥轮换 | 必须支持 | 必须拒绝 |
| 停用 | 必须支持 | 必须拒绝 |
| 历史密钥解析 | 必须支持 | 不适用 |

### 5.2 统一适配器

实现必须通过统一 DID Method 注册表路由，不得在 VC 服务或前端散落 `if (did.startsWith(...))` 业务判断。推荐接口：

```js
create(options)
resolve(did, options)
update(did, changes, expectedVersion)
rotateKey(did, expectedVersion)
deactivate(did, expectedVersion)
resolveVerificationMethod(verificationMethodId, version)
capabilities()
```

第一阶段至少包含 `ExampleDidAdapter`、`KeyDidAdapter`。未知 Method 必须失败，不得回退到其他适配器。

### 5.3 能力声明

每条公开 DID 数据必须包含：

```json
{
  "method": "example",
  "capabilities": {
    "update": true,
    "rotateKey": true,
    "deactivate": true
  }
}
```

`did:key` 的三个生命周期能力必须为 `false`。前端必须依据能力声明控制按钮，不得自行推断。

## 6. DID 功能需求

### DID-FR-001 创建 DID

- 用户必须填写名称并选择 Issuer 或 Holder。
- 用户可选择 `did:example` 或 `did:key`，默认 `did:example`。
- `did:example` 格式为 `did:example:<uuid>`；密钥轮换不得改变 DID。
- `did:key` 必须由 Ed25519 公钥按 Method 规则生成。
- 创建后必须生成 DID Document、Ed25519 公私钥、创建时间和公开能力声明。
- 私钥只保存于内部数据，不得通过普通 API、页面或 DID Document 返回。

### DID-FR-002 查看和解析

- 列表必须显示名称、完整 DID、Method、角色、状态、版本和创建时间。
- 用户必须能够查看完整 DID Document 和公开 JWK。
- 解析输出必须区分“未找到”“Method 不支持”“DID 格式非法”和“已停用”。

### DID-FR-003 更新 `did:example`

- 允许更新名称和服务地址白名单字段。
- 名称去除首尾空格后不得为空。
- 服务地址非空时必须是合法的 `https:` URL；为适应本地测试，可明确允许 `http://localhost` 和 `http://127.0.0.1`。
- 更新必须携带 `expectedVersion`；版本不一致返回冲突，不得覆盖较新数据。
- 成功后 DID 不变，版本加 1，更新时间和审计记录更新。
- 对 `did:key` 调用更新必须返回不支持错误。

### DID-FR-004 轮换 `did:example` 密钥

- 轮换必须携带 `expectedVersion`。
- 成功后生成新 Ed25519 密钥对和新的 verification method ID。
- DID 必须保持不变，版本加 1。
- 旧公钥、旧 verification method ID、原版本和退役时间写入历史记录。
- 历史私钥可仅在内部保留以支持演示，但任何公开响应均不得返回；生产说明必须建议销毁或进入受控归档。
- 对 `did:key` 调用轮换必须返回不支持错误，不得生成新 DID 冒充同一 DID 的轮换。

### DID-FR-005 停用 `did:example`

- 停用必须二次确认并携带 `expectedVersion`。
- 成功后状态为 `deactivated`，版本加 1，记录停用时间。
- 停用不可逆；停用后不得更新、轮换、再次停用或参与新 VC 签发。
- 历史公钥和审计信息不得删除。
- 对 `did:key` 调用停用必须返回不支持错误，不得伪造 Method 不支持的停用语义。

## 7. DID 状态与数据模型

### 7.1 状态规则

- `did:example` 当前状态只使用 `active`、`deactivated`。
- “已更新”“已轮换”属于审计事件，不作为排斥 `active` 的当前状态。
- `did:key` 当前状态为 `active`，且无本地停用转换。

### 7.2 DID 内部记录

```json
{
  "id": "internal-uuid",
  "did": "did:example:uuid",
  "method": "example",
  "name": "可信学习中心",
  "role": "issuer",
  "status": "active",
  "version": 2,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "deactivatedAt": null,
  "serviceEndpoint": "https://example.test/did",
  "document": {},
  "publicJwk": {},
  "privateJwk": {},
  "keyHistory": []
}
```

公开投影必须递归移除当前及历史 `privateJwk`。

## 8. VC 签发需求

### VC-FR-001 签发前置条件

- Issuer 必须存在、角色为 issuer，且其 Method 支持签名。
- Holder 必须存在、角色为 holder。
- `did:example` Issuer 或 Holder 已停用时必须拒绝签发。
- Issuer 与 Holder 可以使用不同 DID Method。
- 学员姓名和课程名称去除首尾空格后不得为空。
- `validUntil` 必须为有效时间且晚于 `validFrom`。

### VC-FR-002 VC 内容

VC 至少包含：`@context`、`id`、`type`、`issuer`、`validFrom`、`validUntil`、`credentialSubject` 和 `proof`。

`proof` 至少包含：

```json
{
  "type": "EducationalEd25519Signature2026",
  "cryptosuite": "eddsa-stable-json-demo-2026",
  "created": "ISO-8601",
  "verificationMethod": "完整验证方法 ID",
  "keyVersion": 1,
  "proofPurpose": "assertionMethod",
  "proofValue": "base64url"
}
```

`did:key` 可使用固定版本 1；`did:example` 必须记录实际签发密钥版本。

## 9. VC 生命周期需求

### 9.1 状态机

```text
active <-> suspended
active|suspended -> replaced
active|suspended -> revoked
active|suspended -> expired（由时间判定）
```

`replaced`、`expired`、`revoked` 是不可恢复终态。

### VC-FR-003 暂停与恢复

- 只有 active VC 可暂停；记录 `suspendedAt`。
- 只有 suspended VC 可恢复；记录 `resumedAt`。
- 暂停不改变已签名 VC JSON；签名检查仍可通过，但整体无效。

### VC-FR-004 更新/重新签发

- VC 更新必须创建新 VC ID，不得修改旧 VC 的已签名正文。
- 新记录写入 `replaces`，旧记录变为 `replaced` 并写入 `replacedBy`、`replacedAt`。
- 只有 active 或 suspended VC 可更新。
- 新 VC 必须使用操作时 Issuer 的当前密钥重新签名。

### VC-FR-005 过期

- 当前时间超过 `validUntil` 时，列表视图和验签结论必须显示 expired。
- 过期由时间计算，不修改 VC 签名正文。
- expired VC 不得恢复、暂停、更新或撤销。

### VC-FR-006 撤销

- active 或 suspended VC 可撤销，记录 `revokedAt`。
- 撤销不可逆；重复撤销或终态转换必须明确失败。

### 9.2 VC 记录模型

```json
{
  "id": "urn:uuid:...",
  "credential": {},
  "status": "active",
  "issuedAt": "ISO-8601",
  "suspendedAt": null,
  "resumedAt": null,
  "replacedAt": null,
  "replacedBy": null,
  "replaces": null,
  "revokedAt": null
}
```

## 10. VC 验证需求

验证必须产生独立检查项，并仅在全部通过时令 `valid=true`：

| key | 检查内容 | 失败示例 |
|---|---|---|
| `format` | 必要字段和数据类型 | 缺少 issuer/proof |
| `issuer` | Issuer DID 存在且 Method 可解析 | 未知 Method、未知 DID |
| `didStatus` | Issuer 当前可用 | example Issuer 已停用 |
| `keyVersion` | verification method 和版本可解析 | 历史版本不存在 |
| `signature` | Ed25519 签名匹配正文 | 姓名或课程被篡改 |
| `validity` | 当前时间处于有效区间 | 尚未生效或已过期 |
| `credentialStatus` | VC 当前为 active | suspended/replaced/expired/revoked |

关键规则：

- 密钥轮换后，历史 VC 必须使用 proof 指定的历史公钥验签。
- Issuer 停用后，历史 VC 可以出现 `signature=true`、`didStatus=false`、`valid=false`。
- 本地台账不存在对应 VC 时，状态检查失败，即使密码学签名有效。
- 每次验证可写入日志：ID、VC ID、总结果、检查时间和失败项。

## 11. 列表、搜索、排序与分页

### 11.1 统一响应

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 10,
  "totalPages": 1
}
```

### 11.2 通用规则

- 默认 page=1、pageSize=10；仅接受 10、20、50，非法值回退 10。
- 搜索去除首尾空格、忽略英文字母大小写。
- 搜索按“任一允许字段包含完整搜索文本”匹配。
- 搜索或 pageSize 改变后前端必须回到第 1 页。
- 页码小于 1 修正为 1；超过总页数修正为最后有效页。
- 无记录时 page=1、totalPages=1、items=[]。
- 默认业务时间降序；时间相同按记录 ID 降序，确保稳定排序。
- 新增或状态操作后刷新仍保持默认最新在前。
- 原始数据为空和搜索无结果必须使用不同提示。

### 11.3 可搜索字段

- DID：名称、完整 DID、Method、角色、状态；时间字段为 createdAt。
- VC：VC ID、学员姓名、课程、Issuer DID、Holder DID、状态；时间字段为 issuedAt。
- 验签日志：VC ID、总结果、失败检查项；时间字段为 checkedAt。

## 12. 页面需求

### UI-FR-001 DID 页面

- 创建表单包含名称、角色、Method；默认 example。
- 列表卡片显示完整 DID、Method、角色、状态、版本、公钥和时间。
- example active 显示更新、轮换、停用；key 不显示或禁用，并提供原因说明。
- 停用操作必须二次确认。
- 更新和轮换成功后刷新列表并展示明确成功提示。

### UI-FR-002 VC 签发和台账

- Issuer 下拉仅包含可签发且当前可用的 Issuer。
- Holder 下拉仅包含当前可用 Holder。
- 下拉项同时显示名称、Method 和 DID 缩略信息。
- 台账显示 ID、Issuer、Holder、课程、状态、签发时间和合法操作。
- 操作按钮随 VC 状态变化，不允许界面产生已知非法转换。

### UI-FR-003 验证页面

- 支持粘贴 VC JSON和载入最新 VC。
- JSON 语法错误与业务验证失败使用不同提示。
- 显示七项检查详情，不得只显示单一成功/失败。
- 明确解释“签名有效不代表 DID 或 VC 当前有效”。

### UI-FR-004 列表控件

- 三类列表均具有搜索框、10/20/50 页大小、总数、当前页、总页数、上一页和下一页。
- 首页禁用上一页，末页禁用下一页。
- 搜索输入应防止频繁请求，可在提交时搜索或使用 200–400ms 防抖。

### UI-FR-005 日志中心

- 主导航必须增加独立“日志中心”入口。
- 列表显示发生时间、类型、级别、模块、操作、对象、结果和摘要。
- `info` 使用绿色，`warn` 使用黄色，`error` 使用红色；颜色不得作为唯一标识，必须同时显示级别文字。
- 日志详情显示关联 ID、错误码和脱敏后的结构化上下文。
- 支持类型、结果、级别、模块、起止时间和模糊文本组合筛选。
- 修改任一筛选条件后回到第 1 页；支持 10/20/50 页大小和前后翻页。
- 提供“清空日志”操作并要求二次确认；普通日志不得编辑或单条删除。
- 原始为空、筛选无结果和加载失败必须显示不同状态。

## 13. 日志模块需求

### LOG-FR-001 日志类型与范围

系统必须记录两类结构化日志：

1. `audit` 操作审计日志：DID 创建、更新、轮换、停用；VC 签发、暂停、恢复、替代、撤销、验签；演示数据重置；日志清理。
2. `system` 系统运行日志：JSON 解析失败、未知路由、请求体超限、存储读写异常、未捕获服务异常及其他运行错误。

成功和失败均必须记录。一次 API 请求必须生成 `correlationId`，同一请求产生的系统日志与审计日志使用相同关联 ID。

### LOG-FR-002 统一结构化日志服务

所有模块必须通过 `LogService` 写入日志，不得直接修改 `logs.json`。推荐接口：

```js
log(entry)
info(entry)
warn(entry)
error(entry)
query(filters)
clear(actorContext)
```

- 业务服务负责产生操作语义与审计结果。
- HTTP、JSON 解析和存储边界负责产生系统事件。
- 日志服务不得反向调用业务服务，避免循环依赖。
- 日志写入失败不得覆盖或改变原业务响应，但必须使用 `console.error` 兜底。

### LOG-FR-003 级别与颜色

| 级别 | 使用场景 | UI 标识 |
|---|---|---|
| `info` | 正常成功操作、正常启动或完成事件 | 绿色 + INFO |
| `warn` | 业务规则拒绝、非法状态转换、参数错误、未知资源等预期失败 | 黄色 + WARN |
| `error` | 存储异常、未捕获异常和非预期系统失败 | 红色 + ERROR |

`success` 与 `level` 是独立字段，例如被业务规则拒绝的操作记录为 `success=false`、`level=warn`。

### LOG-FR-004 数据模型

```json
{
  "id": "uuid",
  "occurredAt": "ISO-8601",
  "correlationId": "uuid",
  "type": "audit",
  "level": "info",
  "module": "DID",
  "action": "DID_CREATE",
  "success": true,
  "targetType": "DID",
  "targetId": "did:example:...",
  "targetName": "可信学习中心",
  "errorCode": null,
  "message": "DID 创建成功",
  "context": { "method": "example", "role": "issuer" }
}
```

强制枚举：type 为 `audit|system`；level 为 `info|warn|error`；module 为 `DID|VC|VERIFY|API|STORE|SYSTEM`。`action` 使用稳定的大写下划线标识符，页面另行映射中文名称。

### LOG-FR-005 脱敏

日志服务必须在持久化前递归脱敏，不依赖调用者主动删除字段。至少屏蔽：

- `privateJwk` 和任何私钥材料；
- `proofValue`、签名字节和完整 proof；
- 完整 VC JSON和完整请求体；
- authorization、cookie、token、password、secret；
- 名称包含 private、secret、token、password 的其他字段。

脱敏值统一为 `[REDACTED]`。允许记录 DID、VC ID、Method、角色、状态、密钥版本、字段名和稳定错误码。

### LOG-FR-006 存储与留存

- 日志独立保存至 `data/logs.json`，不得与 DID/VC 业务状态共用文件。
- 最多保留 5,000 条；写入第 5,001 条时删除最旧记录。
- 默认按 occurredAt 降序，同一时间按 id 降序。
- 演示数据重置不得删除日志，必须新增 `DEMO_RESET` 审计日志。
- 清空日志必须二次确认。清空后保留一条 `LOG_CLEAR` 审计摘要并记录被清理数量，不保存被清理内容。
- 日志只允许查询和整体清理，不允许编辑或单条删除。

### LOG-FR-007 查询

- 模糊搜索字段：action、targetId、targetName、errorCode、message；忽略大小写和首尾空格。
- 精确筛选字段：type、success、level、module。
- 时间范围为 `startTime <= occurredAt <= endTime`；开始晚于结束返回参数错误。
- 不同筛选条件按 AND 组合，模糊搜索字段内部按 OR 匹配。
- 默认 page=1、pageSize=10，仅允许 10、20、50。

### LOG-FR-008 必记操作

| 模块 | action |
|---|---|
| DID | `DID_CREATE`、`DID_UPDATE`、`DID_ROTATE_KEY`、`DID_DEACTIVATE` |
| VC | `VC_ISSUE`、`VC_SUSPEND`、`VC_RESUME`、`VC_REPLACE`、`VC_REVOKE` |
| VERIFY | `VC_VERIFY` |
| API | `REQUEST_INVALID_JSON`、`REQUEST_TOO_LARGE`、`ROUTE_NOT_FOUND` |
| STORE | `STORE_READ_FAILED`、`STORE_WRITE_FAILED` |
| SYSTEM | `DEMO_RESET`、`LOG_CLEAR`、`UNEXPECTED_ERROR` |

失败日志必须包含稳定 `errorCode`，但不得把完整异常堆栈写入公开日志详情。

## 14. API 契约

| 方法与路径 | 用途 |
|---|---|
| `POST /api/dids` | 创建 DID，body 含 name、role、method |
| `GET /api/dids` | DID 搜索分页列表 |
| `PATCH /api/dids/:id` | 更新 example DID |
| `POST /api/dids/:id/rotate-key` | 轮换 example DID 密钥 |
| `POST /api/dids/:id/deactivate` | 停用 example DID |
| `POST /api/credentials` | 签发 VC |
| `GET /api/credentials` | VC 搜索分页列表 |
| `POST /api/credentials/:id/suspend` | 暂停 VC |
| `POST /api/credentials/:id/resume` | 恢复 VC |
| `POST /api/credentials/:id/replace` | 更新/重新签发 VC |
| `POST /api/credentials/:id/revoke` | 撤销 VC |
| `POST /api/verify` | 验证 VC |
| `GET /api/verification-logs` | 验签日志搜索分页列表 |
| `GET /api/logs` | 日志组合筛选与分页列表 |
| `GET /api/logs/:id` | 单条脱敏日志详情 |
| `DELETE /api/logs` | 显式确认后清空并生成清理摘要 |

错误响应统一为：

```json
{
  "error": "面向用户的明确错误说明",
  "code": "STABLE_ERROR_CODE"
}
```

建议状态码：参数或状态转换错误 400，未找到 404，版本冲突 409，请求体超过 1MB 为 413，未知接口 404。

## 15. 安全与隐私要求

- 当前及历史私钥不得出现在公开 API、页面、日志、错误消息或 Git 版本库。
- 签名必须使用稳定、确定性的序列化载荷；proof 不参与自身签名。
- 服务默认仅监听 `127.0.0.1`。
- 请求体上限为 1MB，非法 JSON 返回明确错误。
- 所有用户输入在 HTML 中展示前必须转义。
- 本地 JSON 存储不是生产密钥设施，文档必须保持该限制声明。
- 生命周期操作必须通过版本检查避免静默并发覆盖。
- 日志必须在写入磁盘前递归脱敏；公开查询不得存在未脱敏版本。
- 日志清理请求必须包含 `{ "confirm": true }`。

## 16. 非功能需求

- Node.js 版本不低于 20。
- 不增加第三方运行时依赖；测试可继续使用 `node:test`。
- 本地无网络时必须能完成 example/key 主流程。
- 页面刷新和服务重启后，持久化状态、排序和生命周期关系不得丢失。
- 新模块按单一职责拆分，DID Method、VC 业务、查询分页和 UI 状态不得混为一个模块。
- 错误信息使用中文且明确指出失败对象和原因。
- 日志查询不得读取私钥文件拼装详情；5,000 条规模下分页和组合筛选必须保持可用。

## 17. 兼容与迁移

- 旧数据若仅含 `did:key` 且无 method/capabilities，加载时必须兼容推导为 method=key、三个生命周期能力=false。
- 新创建 DID 默认 example，但不得静默改写历史 key DID。
- 现有 VC 若无 keyVersion，应按兼容规则解析版本 1；新签发 VC 必须写入 keyVersion。
- 重置演示数据应创建至少一个 example Issuer、一个 key Holder 和一张可正常验证的混合 VC。
- `logs.json` 不存在时自动初始化；文件损坏时不得覆盖原文件，应返回日志存储不可用并通过控制台兜底。

## 18. 验收与完成定义

实现 Agent 只有同时满足以下条件才能声明完成：

1. `docs/测试用例-DID-VC生命周期.md` 中全部 P0 自动化用例通过；
2. 两种 Method 均可作为 Issuer 和 Holder 完成签发验签；
3. key 的更新、轮换、停用在 API 和 UI 均不可用；
4. example 的更新、轮换、停用及版本冲突行为正确；
5. VC 全部允许/禁止状态转换均有测试；
6. 七项验签结论均有通过和失败测试；
7. 0/1/10/11/20/21/50/51 分页边界通过；
8. DID、VC、日志默认最新在前且稳定排序；
9. `npm test` 结果为 0 failed、0 skipped、0 todo；
10. `git diff --check` 无格式错误；
11. README、测试说明、Method 选型说明与实际行为一致；
12. 人工完成六条端到端验收旅程。
13. 全部必记 action 具有成功或失败日志测试，组合筛选结果正确；
14. 第 5,001 条写入后仅保留最新 5,000 条；重置不清日志，清空后保留一条摘要；
15. 私钥、proofValue、token 和完整 VC 不得出现在 `logs.json` 或日志 API；
16. 日志 UI 的 info/warn/error 同时具有绿/黄/红颜色和文字标识。

## 19. 实现 Agent 约束

- 不得通过修改测试预期来掩盖与本文冲突的实现。
- 不得把 `did:key` 当作可更新注册表 DID。
- 不得把 DID 停用等同于删除历史记录。
- 不得把 VC 更新实现为原地修改已签名 JSON。
- 不得仅因签名通过就返回 VC 整体有效。
- 不得为方便前端而一次性返回无上限的全部列表数据。
- 不得在业务模块直接写 `logs.json`，不得因日志写入失败改变原业务响应。
- 不得把控制台原始异常、完整请求体或完整 VC 直接作为公开日志详情。
- 如实现决策与本文存在冲突，必须先更新需求并获得确认，再修改代码。
