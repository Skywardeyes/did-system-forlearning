# 动态凭证与多 VC 组合披露说明

## 1. 本次能力解决什么问题

原系统把 VC 固定为“学员姓名、课程、完成日期”三个字段，只适合培训结业场景。本次升级把它改为组织可配置、钱包可识别、验证方可逐张核验的通用流程：

1. 组织创建版本化凭证模板，配置 1—50 个字段；
2. 模板发布后才能用于签发，已发布模板不可原地修改，需要创建同名新版本；
3. 钱包领取 `wallet-vc-package-v2` 后，按包内字段元数据动态展示可披露项；
4. Holder 可以从最多 10 张 VC 中选择最多 50 个字段，生成一次组合出示；
5. 验证方逐张验证 Issuer、Ed25519 签名、模板摘要、有效期和公开状态，再验证 Holder 对整组内容、Challenge 与域名的本地签名；
6. 一个 Challenge 只在整组验证成功时原子消费，结果写入组合验证台账。

## 2. 支持的模板字段

| 类型 | 含义 | 示例 |
|---|---|---|
| `string` | 文本 | 专业、证书名称 |
| `number` | 数字 | 绩点、分数、工龄 |
| `boolean` | 布尔值 | 是否通过、是否具备资格 |
| `date` | 日期 | 毕业日期 |
| `datetime` | 日期时间 | 培训完成时间 |
| `enum` | 组织限定选项 | 本科/硕士/博士 |

字段键必须以小写英文字母开头，只能包含英文字母、数字和下划线。`id`、`issuer`、`proof` 等协议保留键不能作为自定义字段。每个字段可配置为必填或选填，未签发的选填字段不会进入 VC、SD-JWT Disclosure 或钱包勾选列表。

## 3. 模板版本与完整性

同一组织使用相同模板名称再次创建时，版本号自动递增。模板状态为：

```text
draft（草稿） -> published（已发布） -> retired（已退役）
```

每个版本会计算稳定 JSON 的 SHA-256 `schemaHash`。签发的完整 VC 在 `credentialSchema` 中记录模板 ID、版本和摘要；SD-JWT 的 Issuer-signed payload 中记录 `schema_id`、`schema_version` 和 `schema_hash`。验证方从公共信任数据中解析对应模板，检查凭证类型和已披露字段是否属于该版本。

模板退役只禁止继续签发，不会自动使历史 VC 失效。历史 VC 是否有效仍由凭证状态、有效期和 Issuer DID 状态共同决定。

## 4. 钱包组合出示格式

钱包生成的 MVP 组合封装类型为：

```json
{
  "type": "WalletBoundMultiSdJwtPresentation2026",
  "holderDid": "did:key:z...",
  "verifiableCredentials": [
    { "format": "vc+sd-jwt", "sdJwt": "签发方A的JWT~选中的Disclosure~" },
    { "format": "vc+sd-jwt", "sdJwt": "签发方B的JWT~选中的Disclosure~" }
  ],
  "challenge": "验证方一次性随机数",
  "domain": "hr.example.com",
  "createdAt": "2026-07-15T...Z",
  "verificationMethod": "did:key:z...#...",
  "holderProof": { "proofValue": "Holder对整个组合的Ed25519签名" }
}
```

它是本项目的 MVP 组合封装，不宣称是正式注册的 W3C Verifiable Presentation 格式。内部 SD-JWT 使用项目当前的 RFC 9901 核心路线；Holder 对整个组合进行 Ed25519 签名，用来证明“这些凭证由同一个 Holder 在本次验证请求中主动出示”。

## 5. 验证顺序

验证方按以下顺序处理：

1. 检查组合结构、凭证数、披露总数及凭证 ID 去重；
2. 对每个 SD-JWT 解析 Issuer DID 和历史公钥；
3. 验证 Issuer EdDSA JWS 签名；
4. 重算所选 Disclosure 摘要；
5. 检查模板 ID、版本、摘要、凭证类型和字段声明；
6. 检查有效期以及凭证当前状态；
7. 检查所有 `sub` 都等于当前 Holder DID；
8. 验证 Holder 对完整组合、Challenge 和 domain 的 Ed25519 签名；
9. 成功后原子消费 Challenge；
10. 写入组合记录及逐张凭证子记录。

任意一张凭证失败，整组结果失败。失败时 Challenge 不消费，用户可以修正内容后在有效期内再次提交。

## 6. 数据与隐私边界

- 组织私有表保存模板及加密后的完整 VC、Disclosure 材料；
- 公共信任投影只包含 DID Document、公钥历史、凭证状态和可验证模板，不包含 VC 声明、随机盐或 Holder 私钥；
- Holder 私钥仍是浏览器钱包 IndexedDB 中的不可导出 Web Crypto Key，不上传平台；
- 钱包中的 VC 包和显示元数据当前仍保存在本地 IndexedDB。本实现是 Web MVP，不等同于手机安全区、系统 Keychain 或硬件钱包；
- 组合验证台账记录凭证 ID、Issuer DID、凭证类型、结果和已披露路径，不复制保存未披露值。

## 7. 兼容策略

- 旧的固定字段凭证继续使用 `wallet-vc-package-v1`，钱包仍可导入和出示；
- 新模板凭证使用 `wallet-vc-package-v2`；
- 验证 API 同时接受旧的 `WalletBoundSdJwtPresentation2026` 和新的 `WalletBoundMultiSdJwtPresentation2026`；
- 新的多 VC 流程即使只选择一张 VC，也使用组合格式，从而统一钱包交互和验证台账。

## 8. 操作步骤

1. 组织进入“凭证签发”，创建模板草稿并添加字段；
2. 点击“发布”，选择该模板、Issuer DID、Holder DID，填写动态字段并签发；
3. Holder 钱包在收件箱领取凭证，v2 字段会自动出现在选择性披露页；
4. 验证方进入“钱包证明验证”，生成 Challenge；
5. Holder 在一张或多张 VC 中勾选字段，填入 Challenge 和验证方域名，生成组合证明；
6. 将组合 JSON 交给验证方，点击“逐张验证并核验 Holder 组合签名”；
7. 查看总体结果、逐张凭证证据以及下方组合验证台账。

