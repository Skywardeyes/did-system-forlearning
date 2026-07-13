# “信证台”VC 与 DID Document 逐行解释

> 本文严格依据当前项目代码编写，适用于课程汇报、产品演示和答辩问答。  
> 对应实现：`src/vc-service.js`、`src/crypto.js`、`src/did-methods.js`、`src/store.js`。

---

## 一、先理解三个对象

在本项目中，需要区分 DID、DID Document 和 VC：

| 对象 | 中文理解 | 主要作用 | 是否包含私钥 |
|---|---|---|---|
| DID | 去中心化标识符 | 标识一个 Issuer 或 Holder | 否 |
| DID Document | DID 公开说明文档 | 公布控制者、验证方法和公钥 | 否 |
| VC | 可验证凭证 | 表达“谁向谁证明了什么”并携带数字签名 | 否 |

三者的关系是：

```text
Issuer DID
   │
   ├──解析得到 DID Document
   │                 │
   │                 └──提供 Ed25519 公钥
   │
   └──使用对应私钥签发 VC
                         │
Holder DID <─────────────┘
                         │
Verifier 使用公钥验证 VC 的 proof
```

一句话概括：

> DID 表示“是谁”，DID Document 说明“如何验证他”，VC 表示“他证明了什么”。

---

## 二、项目中的 DID 是什么

### 2.1 `did:example` 示例

```text
did:example:550e8400-e29b-41d4-a716-446655440000
│   │       └─────────────────────────────────── 方法内标识
│   └─────────────────────────────────────────── DID Method
└─────────────────────────────────────────────── DID 固定前缀
```

逐段解释：

| 片段 | 含义 |
|---|---|
| `did` | 表示这是一个 DID 标识符 |
| `example` | 使用项目中的教学型注册方法 |
| UUID | 本地随机生成的唯一标识 |

项目中的 `did:example` 支持：

- 更新名称和服务地址；
- 轮换 Ed25519 密钥；
- 保留历史公钥，用于验证旧 VC；
- 不可逆停用。

### 2.2 `did:key` 示例

```text
did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuCDT8eC7B6a5E
│   │   └────────────────────────────────────── 公钥指纹
│   └────────────────────────────────────────── DID Method
└────────────────────────────────────────────── DID 固定前缀
```

项目首先取得 Ed25519 原始公钥，然后添加 multicodec 前缀 `0xed01`，最后进行 Base58btc 编码并添加 `z` 前缀。因为 DID 由公钥直接推导，所以本项目不允许更新、轮换或停用 `did:key`。

---

## 三、`did:example` DID Document 逐行解释

下面使用占位符展示项目实际生成的结构。行号仅用于本文解释，不属于 JSON 内容。

```text
01  {
02    "@context": ["https://www.w3.org/ns/did/v1"],
03    "id": "did:example:550e8400-e29b-41d4-a716-446655440000",
04    "verificationMethod": [
05      {
06        "id": "did:example:550e8400-e29b-41d4-a716-446655440000#key-1",
07        "type": "JsonWebKey2020",
08        "controller": "did:example:550e8400-e29b-41d4-a716-446655440000",
09        "publicKeyJwk": {
10          "crv": "Ed25519",
11          "x": "实际生成的Base64URL公钥",
12          "kty": "OKP"
13        }
14      }
15    ],
16    "authentication": [
17      "did:example:550e8400-e29b-41d4-a716-446655440000#key-1"
18    ],
19    "assertionMethod": [
20      "did:example:550e8400-e29b-41d4-a716-446655440000#key-1"
21    ]
22  }
```

### 第 1 行：`{`

表示 DID Document 是一个 JSON 对象。它是公开文档，可以通过页面和普通 API 返回。

### 第 2 行：`@context`

```json
"@context": ["https://www.w3.org/ns/did/v1"]
```

- 声明该文档使用 DID Core 的 JSON-LD 语义环境；
- 帮助其他系统理解 `verificationMethod`、`authentication` 等字段的含义；
- 它不是 API 地址，本项目不会在验证过程中访问这个网址。

汇报说法：

> `@context` 声明这份文档采用 DID 的标准语义词汇。

### 第 3 行：`id`

```json
"id": "did:example:550e8400-e29b-41d4-a716-446655440000"
```

- 是该 DID Document 所描述的主体；
- 必须与身份记录中的完整 DID 一致；
- VC 的 `issuer` 会引用 Issuer 的这个 DID。

### 第 4～15 行：`verificationMethod`

```json
"verificationMethod": [ ... ]
```

这是公开验证方法数组。一个 DID 理论上可以拥有多个验证方法；当前项目每个 DID Document 公开一个当前 Ed25519 验证方法。

#### 第 6 行：验证方法 `id`

```json
"id": "did:example:...#key-1"
```

- `#key-1` 是 DID URL 的片段标识；
- 表示这是第 1 版密钥；
- 第一次轮换后变为 `#key-2`；
- VC proof 中的 `verificationMethod` 会引用这个完整 ID。

#### 第 7 行：`type`

```json
"type": "JsonWebKey2020"
```

表示公钥材料使用 JWK 结构表达。它描述的是密钥表示形式，不等同于签名算法名称。

#### 第 8 行：`controller`

```json
"controller": "did:example:..."
```

表示哪个 DID 控制这项验证方法。在本项目中，验证方法由其所属 DID 自己控制。

#### 第 9～13 行：`publicKeyJwk`

```json
"publicKeyJwk": {
  "crv": "Ed25519",
  "x": "实际生成的Base64URL公钥",
  "kty": "OKP"
}
```

逐字段解释：

| 字段 | 完整含义 | 项目中的作用 |
|---|---|---|
| `kty` | Key Type | `OKP` 表示 Octet Key Pair |
| `crv` | Curve | 表示使用 Ed25519 |
| `x` | 公钥坐标/公钥字节 | Base64URL 编码的 Ed25519 公钥 |

这里没有 `d` 字段。JWK 私钥通常会包含私有参数 `d`，但项目的 `publicDid()` 会在公开数据中删除当前和历史私钥。

### 第 16～18 行：`authentication`

```json
"authentication": ["did:example:...#key-1"]
```

- 声明可以用于身份认证的验证方法；
- 数组中的值引用前面的 `verificationMethod.id`；
- 可理解为“这个 DID 允许用哪把公钥证明自己控制该身份”。

本项目展示了该字段，但核心 VC 签发使用的是 `assertionMethod`。

### 第 19～21 行：`assertionMethod`

```json
"assertionMethod": ["did:example:...#key-1"]
```

- 声明可以用于作出声明、签发凭证的验证方法；
- Issuer 签发 VC 时，项目读取 `issuer.document.assertionMethod[0]`；
- 该值会写入 VC proof 的 `verificationMethod`。

汇报说法：

> `authentication` 用于证明“我是这个 DID 的控制者”，`assertionMethod` 用于证明“这个 DID 有权作出某项声明”。我们的 Issuer 使用 assertionMethod 对 VC 进行签发。

### 第 22 行：`}`

表示 DID Document 结束。

---

## 四、`did:key` DID Document 与 `did:example` 的区别

`did:key` 的整体字段相同，关键区别在 `id` 和验证方法 ID：

```text
01  {
02    "@context": ["https://www.w3.org/ns/did/v1"],
03    "id": "did:key:z6Mk公钥指纹",
04    "verificationMethod": [
05      {
06        "id": "did:key:z6Mk公钥指纹#z6Mk公钥指纹",
07        "type": "JsonWebKey2020",
08        "controller": "did:key:z6Mk公钥指纹",
09        "publicKeyJwk": {
10          "crv": "Ed25519",
11          "x": "实际生成的Base64URL公钥",
12          "kty": "OKP"
13        }
14      }
15    ],
16    "authentication": ["did:key:z6Mk公钥指纹#z6Mk公钥指纹"],
17    "assertionMethod": ["did:key:z6Mk公钥指纹#z6Mk公钥指纹"]
18  }
```

| 比较项 | `did:example` | `did:key` |
|---|---|---|
| DID 来源 | 随机 UUID | Ed25519 公钥指纹 |
| 验证方法片段 | `#key-1`、`#key-2` | `#z6Mk...` 公钥指纹 |
| 更新 | 支持 | 不支持 |
| 密钥轮换 | 支持 | 不支持 |
| 停用 | 支持 | 不支持 |
| 适合演示 | 注册型 DID 生命周期 | 公钥衍生型不可变 DID |

---

## 五、可验证凭证 VC 逐行解释

项目签发的 VC 正文结构如下。实际 UUID、DID、公钥和签名每次运行都会变化。

```text
01  {
02    "@context": [
03      "https://www.w3.org/ns/credentials/v2"
04    ],
05    "id": "urn:uuid:6f1d5f9b-57b2-4abe-b441-274c67b6492a",
06    "type": [
07      "VerifiableCredential",
08      "TrainingCompletionCredential"
09    ],
10    "issuer": "did:example:550e8400-e29b-41d4-a716-446655440000",
11    "validFrom": "2026-07-13T08:00:00.000Z",
12    "validUntil": "2027-07-13T08:00:00.000Z",
13    "credentialSubject": {
14      "id": "did:key:z6Mk实际持有人公钥指纹",
15      "name": "张晓明",
16      "course": "数字身份与可信凭证训练营",
17      "completionDate": "2026-07-13",
18      "achievement": "Completed"
19    },
20    "proof": {
21      "type": "EducationalEd25519Signature2026",
22      "cryptosuite": "eddsa-stable-json-demo-2026",
23      "created": "2026-07-13T08:00:00.000Z",
24      "verificationMethod": "did:example:550e8400-e29b-41d4-a716-446655440000#key-1",
25      "keyVersion": 1,
26      "proofPurpose": "assertionMethod",
27      "proofValue": "实际生成的Base64URL签名"
28    }
29  }
```

### 第 1 行：`{`

表示整张 VC 是一个 JSON 对象。

### 第 2～4 行：`@context`

```json
"@context": ["https://www.w3.org/ns/credentials/v2"]
```

- 声明该对象采用 VC Data Model 2.0 的语义环境；
- 帮助解释 `issuer`、`credentialSubject`、`validFrom` 等词汇；
- 本项目将其作为数据字段使用，运行时不访问外部网址。

### 第 5 行：VC 的 `id`

```json
"id": "urn:uuid:6f1d5f9b-57b2-4abe-b441-274c67b6492a"
```

- 是该凭证的唯一标识；
- 使用 `urn:uuid:` 加随机 UUID；
- 本地 `CredentialRecord.id` 与 VC `id` 使用同一个值；
- 替代重签时会创建新 ID，不覆盖旧 VC。

不要把 VC `id` 与 Holder DID 混淆：VC ID 标识“这张凭证”，Holder DID 标识“持有人”。

### 第 6～9 行：`type`

```json
"type": [
  "VerifiableCredential",
  "TrainingCompletionCredential"
]
```

- `VerifiableCredential` 表示它是可验证凭证；
- `TrainingCompletionCredential` 表示项目定义的业务类型是培训结业凭证；
- 第一个是通用类别，第二个是领域类别。

### 第 10 行：`issuer`

```json
"issuer": "did:example:550e8400-e29b-41d4-a716-446655440000"
```

- 表示谁签发了该 VC；
- 必须指向一个角色为 `issuer` 的本地 DID；
- 验证时系统根据它查找 Issuer 和 DID Document；
- 若 Issuer 不存在或已停用，对应检查失败。

### 第 11 行：`validFrom`

```json
"validFrom": "2026-07-13T08:00:00.000Z"
```

- 表示凭证从何时开始生效；
- 签发时使用服务器当前时间；
- 采用 ISO 8601 UTC 时间，末尾 `Z` 表示 UTC；
- 当前时间早于该值时，有效期检查失败。

### 第 12 行：`validUntil`

```json
"validUntil": "2027-07-13T08:00:00.000Z"
```

- 表示凭证有效期截止时间；
- 页面允许用户选择；未指定时默认约一年后；
- 必须晚于 `validFrom`；
- 当前时间超过该值时，验证失败，台账视图显示 `expired`。

### 第 13～19 行：`credentialSubject`

```json
"credentialSubject": { ... }
```

表示这张凭证描述的主体以及对主体作出的声明。

#### 第 14 行：主体 `id`

```json
"id": "did:key:z6Mk实际持有人公钥指纹"
```

- 指向 Holder DID；
- 回答“这张凭证属于谁”；
- 本项目要求它对应角色为 `holder` 的本地身份。

#### 第 15 行：`name`

```json
"name": "张晓明"
```

表示学员姓名。该字段属于已签名内容；签发后把它改成其他名字会导致 Ed25519 签名失败。

#### 第 16 行：`course`

```json
"course": "数字身份与可信凭证训练营"
```

表示完成的课程名称。页面表单字段名是 `courseName`，写入 VC 后字段名为 `course`。

#### 第 17 行：`completionDate`

```json
"completionDate": "2026-07-13"
```

表示课程完成日期，采用 `YYYY-MM-DD` 格式。它描述业务事实，不等同于 VC 的签发时间或生效时间。

#### 第 18 行：`achievement`

```json
"achievement": "Completed"
```

表示项目对学习成果的固定描述，即“已完成”。它是教学业务字段。

### 第 20～28 行：`proof`

```json
"proof": { ... }
```

proof 是验证凭证来源和内容完整性的密码学证明。项目先构造第 1～19 行的未签名凭证，再使用 Issuer 私钥签名，最后添加 proof。

#### 第 21 行：proof `type`

```json
"type": "EducationalEd25519Signature2026"
```

- 表示项目使用 Ed25519 的教学签名证明；
- 名称特意包含 `Educational`；
- 它不是正式注册的 W3C Data Integrity proof 类型；
- 防止汇报时把教学实现描述成生产标准实现。

#### 第 22 行：`cryptosuite`

```json
"cryptosuite": "eddsa-stable-json-demo-2026"
```

- 表示项目采用 EdDSA/Ed25519 和稳定 JSON 序列化；
- 同样是教学标识，不是正式注册的 cryptosuite；
- `stableStringify()` 会递归排序对象键，保证相同内容得到相同签名字节。

#### 第 23 行：proof `created`

```json
"created": "2026-07-13T08:00:00.000Z"
```

表示 proof 创建时间。当前实现与 `validFrom` 使用同一个签发时刻。

#### 第 24 行：`verificationMethod`

```json
"verificationMethod": "did:example:...#key-1"
```

- 指明验证这份 proof 应使用哪一个公开验证方法；
- 必须与 Issuer DID Document 的 `assertionMethod` 对应；
- 密钥轮换后，旧 VC 仍引用旧验证方法；
- 系统会从当前公钥或 `keyHistory` 中解析对应版本。

#### 第 25 行：`keyVersion`

```json
"keyVersion": 1
```

- 是本项目用于历史密钥解析的版本号；
- 第一次创建为 1，每次轮换递增；
- 它是项目扩展字段，不应宣称为所有 VC 的标准必需字段。

#### 第 26 行：`proofPurpose`

```json
"proofPurpose": "assertionMethod"
```

表示该密钥用于作出声明，也就是签发 VC。它与 DID Document 中的 `assertionMethod` 相互对应。

#### 第 27 行：`proofValue`

```json
"proofValue": "实际生成的Base64URL签名"
```

- 是使用 Issuer Ed25519 私钥生成的数字签名；
- 使用 Base64URL 编码，便于放入 JSON；
- 它不是明文、摘要或加密后的 VC；
- 任何已签名字段被修改后，原 proofValue 都无法通过验证。

### 第 29 行：`}`

表示整张 VC 结束。

---

## 六、签名时到底签了哪些内容

签发过程可以简化为：

```javascript
const credential = {
  '@context': VC_CONTEXT,
  id,
  type,
  issuer,
  validFrom,
  validUntil,
  credentialSubject
};

credential.proof = {
  // 其他 proof 元数据
  proofValue: signCredential(credential, issuer.privateJwk)
};
```

`signCredential()` 的核心过程：

```javascript
const payload = Buffer.from(stableStringify(unsignedCredential));
const privateKey = createPrivateKey({ key: privateJwk, format: 'jwk' });
return sign(null, payload, privateKey).toString('base64url');
```

含义：

1. 签名时 credential 尚未包含 proof；
2. `stableStringify()` 对对象键进行稳定排序；
3. 结果转换为字节；
4. 使用 Issuer 的 Ed25519 私钥签名；
5. 签名结果编码为 Base64URL，写入 `proofValue`。

验签时：

```javascript
const unsignedCredential = structuredClone(credential);
const proofValue = unsignedCredential.proof.proofValue;
delete unsignedCredential.proof;
const payload = Buffer.from(stableStringify(unsignedCredential));
return verify(null, payload, publicKey, Buffer.from(proofValue, 'base64url'));
```

验签方删除整个 proof，再用相同规则重新生成待验证字节，然后使用 DID Document 中解析出的公钥验证签名。

因此，以下任一已签名字段被修改都会导致签名失败：

- VC `id`；
- `issuer`；
- `validFrom` 或 `validUntil`；
- Holder DID；
- 姓名、课程、完成日期或 achievement；
- `@context` 或 `type`。

---

## 七、VC 正文与本地 CredentialRecord 的区别

系统在 `data/store.json` 中不是只保存 VC，还在外层保存生命周期管理信息：

```text
01  {
02    "id": "urn:uuid:凭证ID",
03    "credential": { "这里才是完整VC正文" },
04    "status": "active",
05    "issuedAt": "2026-07-13T08:00:00.000Z",
06    "revokedAt": null,
07    "suspendedAt": null,
08    "resumedAt": null,
09    "replacedAt": null,
10    "replacedBy": null,
11    "replaces": null
12  }
```

| 字段 | 含义 | 是否属于已签名 VC 正文 |
|---|---|---|
| `credential` | 完整 VC | 是，其中内容被签名 |
| `status` | 本地生命周期状态 | 否 |
| `issuedAt` | 本地签发记录时间 | 否 |
| `revokedAt` | 撤销时间 | 否 |
| `suspendedAt` | 暂停时间 | 否 |
| `resumedAt` | 恢复时间 | 否 |
| `replacedAt` | 被替换时间 | 否 |
| `replacedBy` | 新凭证 ID | 否 |
| `replaces` | 被替换的旧凭证 ID | 否 |

为什么状态不直接改进 VC 正文？

> 因为修改 VC 正文会破坏原数字签名。项目把生命周期状态保存在外层记录中，既保留原始签名，又能表达暂停、恢复、替换和撤销。

这也解释了为什么“已撤销 VC 的签名仍可能正确”：签名证明的是原始内容未被修改，撤销状态来自本地业务记录，两者负责不同问题。

---

## 八、DID Document 如何参与七项验证

| 检查 | 使用的 VC/DID 字段 | 判断内容 |
|---|---|---|
| 1. 格式完整性 | VC 必要字段、`credentialSubject`、`proof` | JSON 结构是否完整 |
| 2. Issuer 解析 | `VC.issuer` | 能否找到本地 Issuer DID |
| 3. DID 状态 | DID 记录的 `status` | Issuer 是否未停用 |
| 4. 密钥版本 | `proof.keyVersion`、`proof.verificationMethod` | 能否解析当前或历史公钥 |
| 5. Ed25519 签名 | VC 正文、`proofValue`、`publicKeyJwk` | 来源和内容完整性是否可信 |
| 6. 有效期 | `validFrom`、`validUntil` | 当前时间是否在有效区间内 |
| 7. VC 状态 | CredentialRecord `status` | 是否为 `active` |

最终结果：

```javascript
valid = checks.every((item) => item.passed);
```

只有七项全部通过，最终结果才是 `valid = true`。

---

## 九、字段引用关系

```text
DID Document.id
    ├──等于 VC.issuer（当该 DID 是签发方）
    └──等于 VC.credentialSubject.id（当该 DID 是持有人）

DID Document.verificationMethod[0].id
    ├──被 DID Document.authentication[0] 引用
    ├──被 DID Document.assertionMethod[0] 引用
    └──被 VC.proof.verificationMethod 引用

DID Document.verificationMethod[0].publicKeyJwk
    └──用于验证 VC.proof.proofValue
```

最关键的对应关系是：

```text
VC.issuer
   ↓ 找到 Issuer DID
DID Document.assertionMethod
   ↓ 找到 verificationMethod
publicKeyJwk
   ↓ 验证
VC.proof.proofValue
```

---

## 十、选择性披露证明逐行解释

### 10.1 完整验证与选择性披露的区别

完整 VC 验证需要提交整张凭证：

```text
完整 VC 正文 + proof
        ↓
Verifier 对完整内容验签
```

选择性披露只提交本次需要公开的声明：

```text
选中字段的路径、值和随机盐
+ Issuer 签名保护的摘要清单
        ↓
Verifier 重算公开字段摘要并验证 Issuer 签名
```

当前系统支持四个可选择披露的声明：

```text
credentialSubject.name
credentialSubject.course
credentialSubject.completionDate
credentialSubject.achievement
```

每个声明签发时都会生成独立的 16 字节随机盐，并计算：

```javascript
SHA256(stableStringify({ path, salt, value }))
```

Issuer 再对包含凭证 ID、Issuer、有效期和全部声明摘要的 Manifest 签名。

需要明确：当前方案实现了真实的部分声明验证，但它是教学协议，不是 BBS+、零知识证明或正式 SD-JWT VC，也不能提供完全匿名和多次展示不可关联性。

### 10.2 披露证明完整结构

假设 Holder 只选择公开“课程名称”和“完成日期”，系统生成的披露证明如下。行号只用于解释，不属于 JSON 内容。

```text
01  {
02    "type": "EducationalSelectiveDisclosurePresentation2026",
03    "credentialId": "urn:uuid:6f1d5f9b-57b2-4abe-b441-274c67b6492a",
04    "issuer": "did:example:550e8400-e29b-41d4-a716-446655440000",
05    "validFrom": "2026-07-13T08:00:00.000Z",
06    "validUntil": "2027-07-13T08:00:00.000Z",
07    "disclosedClaims": [
08      {
09        "path": "credentialSubject.course",
10        "salt": "课程字段的随机盐",
11        "value": "数字身份与可信凭证训练营"
12      },
13      {
14        "path": "credentialSubject.completionDate",
15        "salt": "完成日期字段的随机盐",
16        "value": "2026-07-13"
17      }
18    ],
19    "claimDigests": {
20      "credentialSubject.name": "姓名字段摘要",
21      "credentialSubject.course": "课程字段摘要",
22      "credentialSubject.completionDate": "完成日期字段摘要",
23      "credentialSubject.achievement": "完成状态字段摘要"
24    },
25    "proof": {
26      "type": "EducationalSelectiveDisclosureProof2026",
27      "cryptosuite": "eddsa-salted-claims-demo-2026",
28      "created": "2026-07-13T08:00:00.000Z",
29      "verificationMethod": "did:example:550e8400-e29b-41d4-a716-446655440000#key-1",
30      "keyVersion": 1,
31      "proofPurpose": "assertionMethod",
32      "proofValue": "Issuer对摘要清单生成的Base64URL签名"
33    }
34  }
```

这份证明没有出现：

```text
张晓明
姓名字段的随机盐
Completed
完成状态字段的随机盐
完整 VC 正文
Issuer 私钥
```

但仍然包含姓名和完成状态对应的摘要，以便 Issuer 的签名一次性保护完整声明集合。

### 第 1 行：`{`

表示选择性披露 Presentation 是一个 JSON 对象。它不是原始 VC，也不是 DID Document。

### 第 2 行：Presentation `type`

```json
"type": "EducationalSelectiveDisclosurePresentation2026"
```

作用：

- 告诉系统应使用选择性披露验证流程；
- 与完整 VC 的 `VerifiableCredential` 类型区分；
- 防止把普通 JSON 误当成披露证明。

隐私影响：通常不包含个人信息，但会暴露协议类型和凭证使用场景。

### 第 3 行：`credentialId`

```json
"credentialId": "urn:uuid:6f1d5f9b-..."
```

作用：

- 标识披露证明来自哪一张 VC；
- 查询本地凭证是否 active、suspended、replaced、revoked 或 expired；
- 写入披露证明验证台账；
- 关联完整验证记录和披露验证记录。

隐私影响：它是稳定标识。向不同 Verifier 展示同一个 `credentialId` 时，对方可能判断两次展示来自同一张凭证，因此当前方案不具备展示不可关联性。

### 第 4 行：`issuer`

```json
"issuer": "did:example:550e8400-e29b-41d4-a716-446655440000"
```

作用：

1. 找到 Issuer DID；
2. 读取 DID Document；
3. 根据验证方法找到 Ed25519 公钥；
4. 验证摘要清单签名；
5. 检查 Issuer 是否已停用。

隐私影响：Issuer 通常不是 Holder 的直接个人信息，但签发机构本身可能暴露业务背景。例如医疗、心理咨询或特殊资格机构的 DID 也可能属于敏感元数据。

### 第 5～6 行：`validFrom` 与 `validUntil`

```json
"validFrom": "2026-07-13T08:00:00.000Z",
"validUntil": "2027-07-13T08:00:00.000Z"
```

作用：判断当前时间是否满足：

```text
validFrom ≤ 当前时间 ≤ validUntil
```

隐私影响：具体时间可能暴露签发日期、课程批次或用户活动轨迹。当前系统直接公开时间；如果只想证明“当前未过期”而不公开具体时间，需要更强的隐私证明机制。

### 第 7～18 行：`disclosedClaims`

```json
"disclosedClaims": [ ... ]
```

这是 Holder 本次主动选择公开的声明数组。没有被选择的声明不会以原始值出现在数组中。

#### 第 9、14 行：`path`

```json
"path": "credentialSubject.course"
```

`path` 表示公开值属于哪个业务字段。它参与摘要计算：

```javascript
stableStringify({ path, salt, value })
```

作用是防止把一个字段的值和盐挪到另一个字段。例如“完成状态”不能被冒充为“课程名称”。

隐私影响：路径不会暴露具体值，但会暴露凭证包含什么类型的数据。当前 `claimDigests` 还会公开所有可披露字段的路径，所以验证方可以知道凭证存在姓名、课程、完成日期和完成状态字段。

#### 第 10、15 行：`salt`

```json
"salt": "字段对应的随机盐"
```

作用：

- 防止对低熵字段进行字典攻击；
- 让相同字段值在不同凭证中得到不同摘要；
- 与 path、value 一起重算已公开字段摘要。

处理原则：

```text
已公开字段：同时提交 value 和 salt
未公开字段：既不提交 value，也不提交 salt
```

salt 不是私钥。字段披露时可以公开；但字段未披露时，不应提前公开对应 salt。

#### 第 11、16 行：`value`

```json
"value": "数字身份与可信凭证训练营"
```

这是 Holder 主动公开的业务内容。Verifier 已经能够直接读取它，随机盐不会再隐藏该值。

隐私作用不是“公开后仍保密”，而是实行最小必要披露。例如为了证明完成某课程，只公开课程和完成日期，不公开姓名。

### 第 19～24 行：`claimDigests`

```json
"claimDigests": {
  "credentialSubject.name": "姓名字段摘要",
  "credentialSubject.course": "课程字段摘要"
}
```

每个摘要的计算过程是：

```javascript
createHash('sha256')
  .update(stableStringify({ path, salt, value }))
  .digest('base64url');
```

作用：

1. Verifier 重算公开字段摘要并进行比较；
2. Issuer 一次性签名全部声明承诺；
3. Holder 可以选择不同字段组合，而不必让 Issuer 重新签发；
4. 修改公开字段的 path、salt 或 value 都会导致摘要不一致。

隐私影响：

- 摘要不会直接显示隐藏字段原值；
- 没有随机盐时，验证方难以枚举隐藏值；
- 摘要清单长期固定，可能关联同一凭证的多次展示；
- 明文路径会暴露凭证字段结构。

### 第 25～33 行：`proof`

proof 证明摘要清单和关键元数据由 Issuer 签名保护。

#### 第 26 行：proof `type`

```json
"type": "EducationalSelectiveDisclosureProof2026"
```

这是项目定义的教学 proof 类型，明确区别于正式 SD-JWT VC、BBS+ 和 W3C Data Integrity cryptosuite。

#### 第 27 行：`cryptosuite`

```json
"cryptosuite": "eddsa-salted-claims-demo-2026"
```

说明当前教学方案组合使用：

```text
SHA-256 加盐声明摘要
+ Stable JSON
+ Ed25519 / EdDSA 签名
```

它是项目标识，不是正式注册的密码套件名称。

#### 第 28 行：`created`

```json
"created": "2026-07-13T08:00:00.000Z"
```

记录摘要清单 proof 的创建时间。它帮助审计，但具体时间也可能用于关联签发批次。

#### 第 29 行：`verificationMethod`

```json
"verificationMethod": "did:example:...#key-1"
```

指向 Issuer DID Document 中的验证方法。Verifier 根据它找到当前或历史 Ed25519 公钥。

如果 Issuer 已轮换密钥，旧披露证明仍引用 `#key-1`，系统可以根据历史密钥继续验证。

#### 第 30 行：`keyVersion`

```json
"keyVersion": 1
```

这是项目用于解析历史密钥的版本号。它不是所有选择性披露协议的通用必需字段。

#### 第 31 行：`proofPurpose`

```json
"proofPurpose": "assertionMethod"
```

表示 Issuer 使用 DID Document 中被授权作出声明的验证方法签名摘要清单。

#### 第 32 行：`proofValue`

```json
"proofValue": "Issuer对摘要清单生成的签名"
```

Issuer 实际签名的 Manifest 为：

```json
{
  "type": "EducationalSelectiveDisclosureManifest2026",
  "credentialId": "urn:uuid:...",
  "issuer": "did:example:...",
  "validFrom": "...",
  "validUntil": "...",
  "claimDigests": {
    "...": "..."
  }
}
```

因此，攻击者不能在不破坏签名的情况下修改：

- credentialId；
- issuer；
- validFrom 或 validUntil；
- claimDigests 中的任一摘要。

数字签名本身不会泄露 Issuer 私钥或隐藏字段原值，但固定 `proofValue` 也可以成为多次展示的关联线索。

### 第 34 行：`}`

表示选择性披露 Presentation 结束。

### 10.3 签发端保存但普通 API 不返回的材料

系统内部还保存：

```json
{
  "disclosureMaterial": {
    "claims": {
      "credentialSubject.name": {
        "salt": "姓名盐",
        "value": "张晓明"
      }
    },
    "manifest": {
      "claimDigests": {}
    },
    "proof": {
      "proofValue": "Issuer签名"
    }
  }
}
```

`publicCredential()` 会删除 `disclosureMaterial`，普通状态和凭证 API 只返回：

```json
{
  "selectiveDisclosureAvailable": true
}
```

这个布尔值只告诉页面该凭证是否支持选择性披露，不泄露完整声明、隐藏字段随机盐或签发端材料。

### 10.4 披露证明的八项验证

| 序号 | 检查项 | 使用字段 | 作用 |
|---:|---|---|---|
| 1 | 披露证明格式 | type、credentialId、issuer、claims、proof | 拒绝结构不完整的证明 |
| 2 | Issuer DID 解析 | issuer | 找到签发方身份 |
| 3 | Issuer DID 状态 | DID status | 拒绝已停用签发方 |
| 4 | 签名密钥解析 | verificationMethod、keyVersion | 找到当前或历史公钥 |
| 5 | 摘要清单签名 | Manifest、proofValue | 防止摘要和元数据被替换 |
| 6 | 已披露字段摘要 | path、salt、value、claimDigests | 检测公开字段篡改 |
| 7 | 凭证有效期 | validFrom、validUntil | 拒绝未生效或过期凭证 |
| 8 | 凭证当前状态 | credentialId、本地状态 | 拒绝暂停、替换、撤销或过期凭证 |

最终结果仍然采用：

```javascript
valid = checks.every((item) => item.passed);
```

每次验证后，系统在披露证明验证台账中保存：

```json
{
  "credentialId": "urn:uuid:...",
  "valid": false,
  "checkedAt": "...",
  "disclosedPaths": [
    "credentialSubject.course",
    "credentialSubject.completionDate"
  ],
  "failedChecks": ["disclosedClaims"]
}
```

台账不保存完整 Presentation，也不保存披露字段的值和随机盐，只保存定位和解释验证结果所需的元数据。

### 10.5 各字段的隐私与关联风险总结

| 字段 | 验证用途 | 是否公开 | 隐私或关联风险 |
|---|---|---:|---|
| `type` | 选择验证规则 | 是 | 暴露协议和业务类型 |
| `credentialId` | 查询状态、写台账 | 是 | 可关联同一凭证的多次展示 |
| `issuer` | 查找 DID 与公钥 | 是 | 可能暴露签发机构和业务背景 |
| `validFrom` | 判断生效 | 是 | 暴露签发时间或批次 |
| `validUntil` | 判断过期 | 是 | 暴露有效期限 |
| `path` | 绑定字段含义 | 选中字段公开；摘要键还暴露全部路径 | 暴露凭证字段结构 |
| `value` | 本次公开声明 | 仅选中字段公开 | 公开后无法依靠 salt 收回 |
| `salt` | 防枚举并重算摘要 | 仅选中字段公开 | 与 value 同时公开后不再隐藏该字段 |
| `claimDigests` | 证明声明属于原凭证 | 是 | 固定集合可用于关联多次展示 |
| `verificationMethod` | 找到 Issuer 公钥 | 是 | 可关联 Issuer 与密钥版本 |
| `keyVersion` | 解析历史密钥 | 是 | 可能推断签发时期 |
| `proofValue` | 验证 Issuer 签名 | 是 | 固定签名可用于关联 |
| 未选字段原值 | Holder 隐私 | 否 | 当前主要保护目标 |
| 未选字段 salt | 防止枚举隐藏值 | 否 | 提前泄露会降低隐藏值保护 |
| Issuer 私钥 | 生成签名 | 否 | 必须永久保密 |

最准确的项目结论是：

> 当前方案实现了未选择字段值的最小化披露和篡改检测，但没有隐藏凭证 ID、Issuer、有效期、摘要集合和固定签名，因此不是完全匿名，也不具备 BBS+ 随机化派生证明所提供的展示不可关联性。

---

## 十一、常见答辩问题

### 1. DID Document 中为什么没有私钥？

因为 DID Document 是公开文档。验证方只需要公钥，私钥必须由控制者保管。本项目虽然为了本地演示把私钥保存在 `data/store.json`，但普通 API 和页面会通过 `publicDid()` 删除私钥后再返回。

### 2. `authentication` 和 `assertionMethod` 有什么区别？

`authentication` 用于身份认证，回答“如何证明我控制这个 DID”；`assertionMethod` 用于作出声明，回答“允许用哪种验证方法签发声明或凭证”。本项目签发 VC 使用 `assertionMethod`。

### 3. proofValue 是不是对 VC 的加密？

不是。VC 内容仍然可读。proofValue 是数字签名，用于验证来源和完整性，并不隐藏 VC 内容。

### 4. 为什么相同内容需要稳定 JSON 序列化？

数字签名面向字节。两个 JSON 对象即使业务内容相同，如果键顺序不同，普通序列化后的字节也可能不同。`stableStringify()` 通过递归排序对象键，让相同内容产生确定的待签名字节。

### 5. 密钥轮换后，旧 VC 为什么还能验证？

旧 VC 的 `proof.keyVersion` 和 `proof.verificationMethod` 指向旧密钥。轮换时项目把旧公钥、验证方法 ID 和版本保存到 `keyHistory`，验证旧 VC 时可以解析历史公钥。

### 6. 签名通过，为什么 VC 仍可能验证失败？

签名只证明内容未被修改且与某把私钥对应。VC 还可能已经暂停、撤销、替换、过期，或者 Issuer DID 已停用，所以项目还要执行有效期、DID 状态和 VC 状态检查。

### 7. 这是完全符合 W3C 标准的生产实现吗？

不是。本项目参考 DID Core 和 VC Data Model 2.0 的核心数据结构，但 proof 类型 `EducationalEd25519Signature2026` 和 cryptosuite `eddsa-stable-json-demo-2026` 是教学标识。系统没有实现生产级 DID 解析网络、正式 Data Integrity cryptosuite、状态列表、密钥托管和跨平台互操作认证。

### 8. 选择性披露为什么需要随机盐？

如果只计算 `SHA-256(value)`，验证方可以枚举“通过、未通过、Completed”等低熵候选值并比较摘要。随机盐把摘要计算扩展为路径、随机盐和值的组合；未披露字段不提供 salt，验证方难以通过字典攻击反推原值。

### 9. 选择性披露是否等于完全匿名？

不等于。当前证明仍公开 credentialId、issuer、有效期、摘要清单、验证方法和固定签名，不同 Verifier 可能据此关联同一张凭证。系统保护的是未选择字段的原始值和随机盐，而不是隐藏所有元数据。

### 10. 当前方案与正式 SD-JWT 或 BBS+ 有什么区别？

当前方案与 SD-JWT 都采用加盐摘要和 Issuer 签名的基本思路，但没有使用 RFC 9901 的标准 Disclosure、`_sd`、JWS 组合格式和 Holder Key Binding。它也不是 BBS+ 多消息签名和随机化零知识派生证明，因此应称为教学版选择性披露。

---

## 十二、汇报时的 60 秒讲法

> DID 是身份标识，DID Document 是它的公开说明书，其中包含验证方法和 Ed25519 公钥，但不包含私钥。Issuer 签发 VC 时，会把自己的 DID 写入 issuer，把 Holder DID 和课程成果写入 credentialSubject，再使用私钥对稳定序列化后的 VC 内容签名，签名结果保存在 proofValue 中。验证方根据 VC 的 issuer 找到 DID Document，再根据 proof 中的 verificationMethod 找到公钥进行验签。内容一旦被修改，签名就会失败。但签名正确只证明来源和完整性，所以系统还要检查 DID 状态、有效期和 VC 生命周期状态，七项全部通过才返回有效。

## 十三、汇报时的 20 秒讲法

> DID 表示“是谁”，DID Document 提供公开验证方法，VC 表示“谁向谁证明了什么”。Issuer 用私钥签名 VC，Verifier 用 DID Document 中的公钥验签；然后再结合有效期和凭证状态，得到最终验证结果。
