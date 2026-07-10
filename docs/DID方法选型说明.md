# DID Method 选型说明

## 1. 文档目的

本文说明“信证台”为什么不继续使用 `did:key` 实现完整 DID 生命周期，而采用本地注册表型 `did:example:<uuid>` 作为教学实现，并明确该选择的适用范围、实现要求和生产迁移方向。

## 2. 项目需求

项目计划支持以下 DID 生命周期能力：

- 创建 DID；
- 更新名称、服务地址等 DID Document 信息；
- 在 DID 不变的情况下轮换验证密钥；
- 保留历史公钥，以验证密钥轮换前签发的 VC；
- 停用 DID，并阻止其参与后续 VC 签发；
- 对所有生命周期操作保留版本和审计信息。

这些能力要求 DID 标识符与当前公钥解耦，并要求存在可查询、可更新的状态注册表。

## 3. 为什么 `did:key` 不适合本需求

`did:key` 是一种无注册表 DID Method。其 DID 标识符直接由初始公钥派生，因此具有以下特征：

- 无须外部注册即可创建和解析；
- 适合临时、离线、一次性或不需要状态变更的身份；
- 不支持在保持 DID 不变时更新验证密钥；
- 不支持发布标准化的 DID 停用状态；
- 密钥泄露后无法通过该 DID Method 完成密钥恢复。

如果直接替换 `did:key` 的公钥，标识符与公钥之间的派生关系将被破坏；如果根据新公钥重新计算标识符，得到的则是一个新 DID，而不是原 DID 的密钥轮换。

因此，在本项目中把 `did:key` 强行扩展为“可更新、可轮换、可停用”的 DID，会产生与 DID Method 语义不一致的教学示例。

参考：

- [The did:key Method](https://w3c-ccg.github.io/did-key-spec/)
- [Decentralized Identifiers (DIDs) v1.0](https://www.w3.org/TR/did-core/)

## 4. 本项目的选择

项目采用本地注册表型教学 DID：

```text
did:example:<uuid>
```

其中：

- `<uuid>` 在创建时随机生成；
- DID 不包含当前公钥指纹，因此密钥轮换不会改变 DID；
- DID Document、当前公钥、历史公钥、版本和状态保存在本地 JSON 注册表；
- DID 解析由项目本地服务完成；
- `did:example` 明确表示示例用途，不宣称具备生产互操作能力。

示例：

```text
did:example:550e8400-e29b-41d4-a716-446655440000
```

## 5. 生命周期语义

### 5.1 创建

创建 DID 时生成：

- 稳定 DID；
- Ed25519 密钥对；
- 初始 DID Document；
- `active` 状态；
- 版本号 `1`；
- 创建和更新时间。

私钥只能保存在本地受保护数据中，不得通过普通 API、DID Document 或列表响应返回。

### 5.2 更新

允许更新名称、服务地址等白名单字段。每次成功更新必须：

- 保持 DID 不变；
- 增加版本号；
- 更新时间戳；
- 记录审计信息；
- 使用期望版本号避免并发覆盖。

### 5.3 密钥轮换

密钥轮换时：

- 保持 DID 不变；
- 生成新的 Ed25519 密钥对；
- 将旧公钥、验证方法 ID、适用版本和失效时间写入历史记录；
- 更新 DID Document，使新公钥成为当前验证方法；
- 增加 DID 版本号；
- 严禁在公开响应中返回当前或历史私钥。

新签发的 VC 必须在 proof 中记录所用的验证方法或密钥版本。历史 VC 验签时，根据该版本解析对应的历史公钥。

### 5.4 停用

DID 停用为不可逆操作。停用后：

- 状态变为 `deactivated`；
- 记录停用时间并增加版本号；
- 禁止继续更新或轮换密钥；
- 禁止作为 Issuer 或 Holder 参与新 VC 签发；
- 解析结果必须明确返回停用状态。

停用不会删除历史公钥和审计记录。

### 5.5 历史 VC 验证

DID 停用或密钥轮换后，历史 VC 的验证结果必须区分：

- 密码学签名是否有效；
- 签发时使用的密钥版本是否可解析；
- DID 当前是否处于可用状态；
- VC 当前是否有效、暂停、替代、过期或撤销。

因此，可能出现“历史签名有效，但因 Issuer DID 当前已停用，凭证整体验证不通过”的结果。系统不得把签名检查结果与业务可接受性合并为一个模糊结论。

## 6. 与生产 DID Method 的关系

`did:example` 只用于本地教学、测试和演示，不应作为生产身份标识符。

生产环境应按信任模型选择正式 DID Method：

- 机构能够控制域名和 HTTPS 基础设施、希望降低部署复杂度时，可评估 `did:web`；
- 需要更强的去中心化、公共可验证状态或账本审计能力时，应选择支持 Update 和 Deactivate 的注册表或账本型 DID Method；
- 临时或一次性身份确实不需要更新、恢复和停用时，才考虑 `did:key`。

`did:web` 允许在 DID 保持不变时通过更新 `did.json` 修改验证方法和服务地址，但写入授权、历史版本和运维安全仍由实现方负责。

参考：[did:web Method Specification](https://w3c-ccg.github.io/did-method-web/)

## 7. 生产迁移要求

为降低未来替换 DID Method 的成本，业务代码应遵循以下边界：

- VC 服务不得自行拼接或解析特定 DID Method 的内部结构；
- DID 创建、解析、更新、轮换和停用应封装在独立 DID Method/Registry 接口后；
- VC proof 应记录明确的验证方法 ID，而不只记录模糊的 DID；
- 历史密钥解析应通过版本化解析接口完成；
- 停用状态应来自 DID 解析元数据或方法注册表；
- 测试必须分别验证 DID Method 层规则和 VC 业务层规则。

建议的抽象接口为：

```js
create(options)
resolve(did, options)
update(did, changes, expectedVersion)
rotateKey(did, expectedVersion)
deactivate(did, expectedVersion)
resolveVerificationMethod(verificationMethodId, version)
```

未来迁移至 `did:web` 或其他正式 DID Method 时，应替换该接口的实现，而不是改写 VC 签发和验签的核心业务规则。

## 8. 本项目验收原则

本次扩展按以下原则验收：

- 新创建的教学 DID 使用 `did:example:<uuid>`；
- 更新和密钥轮换后 DID 保持不变；
- 每次变更版本号递增，并拒绝过期版本写入；
- 停用不可逆，停用后禁止新签发；
- 当前及历史私钥均不会出现在公开响应中；
- 密钥轮换前后的 VC 均能找到正确公钥执行签名检查；
- DID 停用后的历史 VC 显示“签名有效、DID 已停用、整体验证失败”；
- 项目界面和文档明确标注 `did:example` 为非生产教学实现。
