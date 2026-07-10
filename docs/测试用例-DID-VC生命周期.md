# DID/VC 生命周期测试用例

## 1. 约定

- 优先级：P0 为核心安全与主流程，P1 为主要功能和边界，P2 为展示体验。
- 层级：S 服务层，A API 层，U 前端层，E 端到端层。
- 第一阶段支持 `did:example` 和 `did:key`，默认 Method 为 `did:example`。
- 所有 P0 服务/API 用例必须自动化，运行结果不得包含 skipped 或 todo。

## 2. DID Method 创建、解析与能力

| 编号 | 优先级/层级 | 场景与步骤 | 预期结果 |
|---|---|---|---|
| DID-M-001 | P0/S,A,U | 不传 Method 创建 Issuer | 创建 `did:example:<uuid>`；Method 为 example；更新、轮换、停用能力为 true |
| DID-M-002 | P0/S,A,U | 选择 example 创建 Holder | Document 与角色正确；公开数据无私钥 |
| DID-M-003 | P0/S,A,U | 选择 key 创建 Issuer | DID 符合 `did:key`；Document 可解析；三个生命周期能力为 false |
| DID-M-004 | P0/S,A,U | 选择 key 创建 Holder | 创建和解析成功；公开数据无私钥 |
| DID-M-005 | P1/A,U | 提交未知 Method | 返回“不支持的 DID Method”；不产生记录 |
| DID-M-006 | P1/S | 声明 key 但 DID 为 `did:example` | 拒绝解析并报告 Method/DID 不一致 |
| DID-M-007 | P1/U | 查看创建 Method 选择器 | 只显示 example/key；默认 example；展示能力差异 |
| DID-M-008 | P0/S,A | 分别解析两种 DID | 路由到正确适配器，返回统一解析结果结构 |

## 3. DID 生命周期

| 编号 | 优先级/层级 | 场景与步骤 | 预期结果 |
|---|---|---|---|
| DID-LC-001 | P0/S,A,U | 更新 active 的 example DID | DID 不变；Document 更新；版本加 1；生成审计时间 |
| DID-LC-002 | P0/S,A,U | 轮换 example DID 密钥 | DID 不变；新密钥生效；旧公钥进入历史；不公开历史私钥 |
| DID-LC-003 | P0/S,A,U | 停用 example DID | 状态 deactivated；版本加 1；操作不可逆 |
| DID-LC-004 | P0/S,A | 停用后更新、轮换或再次停用 | 全部失败且状态不变 |
| DID-LC-005 | P1/S,A | 使用过期 expectedVersion | 返回版本冲突，不覆盖新数据 |
| DID-LC-006 | P0/S,A,U | 对 key DID 发起更新 | API 拒绝；界面入口隐藏或禁用 |
| DID-LC-007 | P0/S,A,U | 对 key DID 发起密钥轮换 | API 拒绝；不得改变 DID 或创建伪历史版本 |
| DID-LC-008 | P0/S,A,U | 对 key DID 发起停用 | API 拒绝；不得伪造 Method 不支持的停用状态 |
| DID-LC-009 | P1/S,A | 操作不存在的 DID | 返回未找到，注册表无变化 |
| DID-LC-010 | P1/S,A | 空名称、非法服务地址 | 返回字段错误，版本不增加 |

## 4. VC 签发与验签

| 编号 | 优先级/层级 | 场景与步骤 | 预期结果 |
|---|---|---|---|
| VC-IV-001 | P0/S,A,E | example Issuer 向 example Holder 签发并验签 | 格式、Issuer、DID 状态、密钥版本、签名、有效期和状态全部通过 |
| VC-IV-002 | P0/S,A,E | key Issuer 向 key Holder 签发并验签 | Key 适配器解析公钥；全部检查通过 |
| VC-IV-003 | P0/S,A,E | example Issuer 向 key Holder 签发 | 签发与验签成功，Subject 保持 key DID |
| VC-IV-004 | P0/S,A,E | key Issuer 向 example Holder 签发 | 签发与验签成功，Issuer 经 Key 适配器解析 |
| VC-IV-005 | P0/S,A | 分别篡改姓名、课程、Issuer、Holder、有效期、proof | 对应检查失败，整体验证失败 |
| VC-IV-006 | P0/S,A | 使用未知 Method 的 Issuer | Issuer 解析失败，不回退到其他适配器 |
| VC-IV-007 | P0/S,A | 已停用 example Issuer 或 Holder 新签发 | 签发失败，不产生 VC |
| VC-IV-008 | P0/S,A | example Issuer 轮换前后分别签发 | 两张 VC 分别命中历史和当前公钥，签名通过 |
| VC-IV-009 | P0/S,A | example Issuer 停用后验证历史 VC | 签名通过、DID 状态失败、整体验证失败 |
| VC-IV-010 | P1/S,A | verificationMethod 与 Issuer 不一致 | 密钥解析或签名检查失败 |

## 5. VC 生命周期

| 编号 | 优先级/层级 | 场景与步骤 | 预期结果 |
|---|---|---|---|
| VC-LC-001 | P0/S,A,U | 暂停 active VC 后验签 | 签名通过、凭证状态失败、整体验证失败 |
| VC-LC-002 | P0/S,A,U | 恢复 suspended VC 后验签 | 状态 active，整体验证重新通过 |
| VC-LC-003 | P0/S,A,U | 更新 active VC | 新 ID；旧证 replaced；双方关联正确 |
| VC-LC-004 | P0/S,A | 验证 replaced VC | 签名通过、凭证状态失败 |
| VC-LC-005 | P0/S,A | 到达 validUntil 后验证 | 有效期失败、视图状态 expired、不可恢复 |
| VC-LC-006 | P0/S,A,U | 撤销 active 或 suspended VC | 状态 revoked；生成撤销时间；验证失败 |
| VC-LC-007 | P0/S,A | 对终态 VC 执行暂停、恢复、更新或撤销 | 全部失败且终态不变 |
| VC-LC-008 | P1/S,A | 重复或并发状态操作 | 返回明确转换错误，仅合法写入成功 |

## 6. 搜索、排序与分页

| 编号 | 优先级/层级 | 场景与步骤 | 预期结果 |
|---|---|---|---|
| LIST-001 | P1/S,A,U | DID 按名称、DID、Method、角色、状态搜索 | 任一字段包含即匹配；忽略大小写和首尾空格 |
| LIST-002 | P1/S,A,U | VC 按 ID、姓名、课程、Issuer、Holder、状态搜索 | 返回准确匹配集合 |
| LIST-003 | P1/S,A,U | 验签记录按 VC ID、结果、失败项搜索 | 返回准确匹配集合 |
| LIST-004 | P1/S,A,U | 数据量为 0/1/10/11/20/21/50/51 | 总数、总页数、当前页和条数正确 |
| LIST-005 | P1/U | 页大小切换 10/20/50 | 返回第 1 页并重算总页数 |
| LIST-006 | P1/U | 第 3 页改变搜索条件 | 返回第 1 页并按结果分页 |
| LIST-007 | P1/S,A,U | 多条记录业务时间相同 | 按记录 ID 降序稳定排列 |
| LIST-008 | P1/U | 当前页因筛选或状态变化超界 | 回到最后有效页；无数据时为第 1 页 |
| LIST-009 | P2/U | 原始为空与搜索无结果 | 展示不同空状态文案 |
| LIST-010 | P2/S,A,U | 搜索中文、英文、特殊字符 | 按普通包含文本处理，不报错、不执行表达式 |

## 7. 端到端验收

| 编号 | 优先级/层级 | 场景 | 预期结果 |
|---|---|---|---|
| E2E-001 | P0/E | 两个 example DID 完成签发验签 | 主流程通过 |
| E2E-002 | P0/E | 两个 key DID 完成签发验签 | 主流程通过，生命周期入口不可用 |
| E2E-003 | P0/E | 两种混合 Issuer/Holder 组合 | 两种组合均通过，适配器路由正确 |
| E2E-004 | P0/E | example 轮换密钥后验证新旧 VC | 均命中正确密钥版本并通过签名 |
| E2E-005 | P0/E | 暂停、验证失败、恢复、再次验证 | 状态和结论按顺序变化 |
| E2E-006 | P0/E | 停用 example Issuer 后签发及验证历史 VC | 新签发被拒绝；历史签名有效但整体验证失败 |

## 8. 日志模块

| 编号 | 优先级/层级 | 场景与步骤 | 预期结果 |
|---|---|---|---|
| LOG-001 | P0/S,A | 成功创建 DID | 写入 audit/info、success=true、DID_CREATE，目标和关联 ID 正确 |
| LOG-002 | P0/S,A | 使用非法 Method 创建 DID | 写入 audit/warn、success=false 和稳定错误码 |
| LOG-003 | P0/S,A | 执行 DID 更新、轮换、停用 | 每项产生正确 action、结果和目标字段 |
| LOG-004 | P0/S,A | 执行 VC 签发、暂停、恢复、替代、撤销 | 每项产生对应 audit 日志 |
| LOG-005 | P0/S,A | 验签成功与失败各一次 | 两条 VC_VERIFY 正确记录结果且不记录完整 VC |
| LOG-006 | P0/A | 提交非法 JSON、超大请求、未知路由 | 记录对应 system warn/error、action 和错误码 |
| LOG-007 | P0/S | 模拟存储读写异常 | 记录 STORE_READ_FAILED/STORE_WRITE_FAILED error，公开详情无堆栈 |
| LOG-008 | P0/S | context 含 privateJwk、proofValue、token、password、credential | 写盘前递归替换为 `[REDACTED]` |
| LOG-009 | P0/S | 日志写入失败 | 原业务结果不变；console.error 兜底；不产生递归日志 |
| LOG-010 | P1/S,A,U | 组合文本、类型、结果、级别、模块和时间范围 | 条件 AND 组合、文本字段 OR 匹配，结果准确 |
| LOG-011 | P1/S,A | 开始时间晚于结束时间 | 返回参数错误并记录 warn 系统日志 |
| LOG-012 | P1/S,A,U | 分页和同一时间稳定排序 | 支持 10/20/50，最新在前，同时间按 ID 降序 |
| LOG-013 | P0/S | 连续写入 5,001 条 | 仅保留最新 5,000 条，最旧记录被删除 |
| LOG-014 | P0/A,U | 重置演示数据 | 原日志保留并新增 DEMO_RESET |
| LOG-015 | P0/A,U | 确认清空日志 | 删除旧日志，保留 LOG_CLEAR 摘要和清理数量 |
| LOG-016 | P1/A,U | 未确认清空 | 请求被拒绝，日志不删除，并记录失败操作 |
| LOG-017 | P1/U | 查看级别标识 | info 绿色、warn 黄色、error 红色，且均有级别文字 |
| LOG-018 | P1/U | 原始为空、筛选无结果、加载失败 | 展示不同状态，筛选变化后回第 1 页 |
| LOG-019 | P0/A | 同一次失败请求产生系统和审计日志 | correlationId 相同，可关联查看 |
| LOG-020 | P1/A | 查询不存在的日志详情 | 返回 404，不泄漏其他记录或内部数据 |

## 9. 完成标准

- 两种 Method 各有完整签发和验签自动化旅程；
- 所有允许及禁止的状态转换均有自动化断言；
- 每个验签检查项都有通过和失败场景；
- 八组分页边界全部自动化；
- 全量结果为 0 failed、0 skipped、0 todo。
- LOG-001 至 LOG-020 全部通过，`logs.json` 和日志 API 不包含敏感数据。
