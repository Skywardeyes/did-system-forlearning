# RFC 9901 核心 SD-JWT 扩展设计与实现

## 1. 目标与范围

在保留原有“教学版摘要证明”的前提下，新增 RFC 9901 的 SD-JWT 核心流程，便于对比两种选择性披露表示：

- Issuer 使用现有 Ed25519 私钥签发紧凑 JWS；
- 每个可披露字段生成一个 RFC 9901 Disclosure；
- Holder 仅携带本次需要的 Disclosure；
- Verifier 验证 Issuer JWT 签名、Disclosure 摘要、有效期和本地 VC 状态；
- 成功与失败均写入既有披露验证台账。

本轮不实现：SD-JWT VC 应用配置、Holder key binding JWT、`nonce`/`aud` 挑战、钱包本地存储、跨机构 DID 解析、标准状态列表、BBS+ 和零知识谓词证明。

## 2. 数据格式

签发时，系统在本地 `CredentialRecord.sdJwtMaterial` 保存：

```text
issuerJwt: <Issuer-signed JWS>
disclosures:
  credentialSubject.course:
    disclosure: base64url(JSON([salt, "course", value]))
    digest: base64url(SHA-256(disclosure))
```

Issuer JWT 负载使用：

```json
{
  "iss": "did:example:issuer",
  "jti": "urn:uuid:credential-id",
  "iat": 0,
  "nbf": 0,
  "exp": 0,
  "vct": "TrainingCompletionCredential",
  "_sd_alg": "sha-256",
  "_sd": ["Disclosure 摘要"]
}
```

Holder 向 Verifier 传递的实际紧凑格式为：

```text
<Issuer-signed JWT>~<Disclosure 1>~<Disclosure N>~
```

末尾 `~` 表示该展示不包含 Key Binding JWT。

## 3. 接口与流程

| 接口 | 作用 |
|---|---|
| `POST /api/credentials/{id}/sd-jwt` | 依据 `paths` 生成只含选中 Disclosure 的 SD-JWT 紧凑串 |
| `POST /api/sd-jwt/verify` | 验证 `sdJwt` 紧凑串并记录验证台账 |

验证步骤：

1. 拆分 `JWT~Disclosure~...~`；
2. 从 JWT 未验证载荷取得 `iss`，解析本地 Issuer DID；
3. 使用 JWT 头部的 `kid` 与 `keyVersion` 解析当前或历史公钥；
4. 验证 `alg=EdDSA`、`typ=vc+sd-jwt` 与 Issuer JWS 签名；
5. 对每个 Disclosure 重新计算 SHA-256，确认它出现在 `_sd` 数组中；
6. 检查 JWT 的 `nbf`、`exp` 与本地 VC 的 `active` 状态；
7. 返回分项检查，并写入披露验证台账。

## 4. 公开边界

`sdJwtMaterial` 与原有 `disclosureMaterial` 都只保存在内部 JSON 存储。`publicCredential()` 会移除二者；普通状态、凭证和列表 API 不返回所有 Disclosure 或未选择字段的盐。

页面为了便于阅读，以 `{ "format": "sd-jwt", "sdJwt": "..." }` 显示紧凑串；实际验证接口使用其中的 `sdJwt` 字段。

## 5. 与原教学方案的关系

| 维度 | 教学版摘要证明 | 新增 SD-JWT 核心格式 |
|---|---|---|
| Issuer 签名对象 | 摘要清单 JSON | JWT 负载 |
| 公开传输 | JSON Presentation | RFC 9901 紧凑串 |
| 字段摘要 | `SHA-256(stableJSON(path, salt, value))` | `SHA-256(base64url(JSON([salt, claim, value])))` |
| Holder key binding | 不支持 | 本轮不支持 |
| 目的 | 解释字段摘要机制 | 对比标准化的 Disclosure 格式 |

## 6. 验收与测试

新增服务/API 测试覆盖：

- 只选择课程字段时，紧凑串不出现未披露姓名明文；
- Issuer JWS、Disclosure 摘要、有效期、状态均通过时验证成功；
- Issuer 密钥轮换后，历史 SD-JWT 使用历史公钥仍可验证；
- 篡改 Disclosure 后验证失败；
- 普通公开 API 不泄露 `sdJwtMaterial`；
- UI 增加 SD-JWT 生成、验证与篡改回归用例。

当前 Node 自动化实测为 132/132 通过。新增 UI 用例已写入，但本机 Chromium 启动超时，未形成新增 SD-JWT 后的 UI 通过证据；答辩前必须执行 `npm run test:evidence` 生成最终批次。
