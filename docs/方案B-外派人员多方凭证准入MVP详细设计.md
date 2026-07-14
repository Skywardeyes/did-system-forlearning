# 方案B：外派人员多方凭证准入 MVP 详细设计

## 1. 方案定位

方案B是在保留现有 DID、VC、钱包、签名验签、生命周期和审计能力的基础上，将“培训结业证书”场景改造为“外派人员多方资质与园区准入”场景。

本方案不是简单替换课程字段，也不建设完整生产级跨组织网络。其目标是通过可运行、可讲解、可测试的 MVP，证明以下产品价值：

> 多家机构分别签发不同业务凭证，外派人员在个人钱包中统一持有，并在一次园区准入中组合出示；验证方同时验证签发来源、持有人、凭证状态和业务条件，最终输出明确的准入结论。

## 2. 设计原则

### 2.1 保留密码学底座

复用现有 DID、Ed25519、VC 签名、Holder 本地私钥、SD-JWT、状态管理、验证记录和审计日志，不为更换业务场景重写底层密码学。

### 2.2 业务凭证独立建模

在职关系、职业资格、安全培训和项目授权必须是独立凭证，不得合并为一张“万能外派人员证”。每份凭证具有独立签发者、Schema、有效期和状态。

### 2.3 多机构独立负责

每个 Issuer 只能签发被治理规则授权的凭证类型。系统不仅验证签名，还验证“该机构是否有权签发该类凭证”。

### 2.4 由个人发起组合出示

钱包根据验证请求选择所需凭证和字段，生成绑定 challenge、domain 和 Holder DID 的一次性准入出示。

### 2.5 密码学验证与业务决策分层

系统必须区分：

1. 凭证格式是否正确；
2. 密码学签名是否有效；
3. 签发者是否受到业务信任；
4. 凭证状态是否有效；
5. 多份凭证是否属于同一 Holder；
6. 凭证内容是否满足当前准入规则。

## 3. 角色与演示组织

### 3.1 外派人员 Holder

示例人物：张三，华安机电有限公司外派电工。

职责与能力：

- 在个人钱包中创建和控制 Holder DID；
- 接收并保存多家机构签发的 VC；
- 查看验证请求的请求方、目的、字段和有效期；
- 选择凭证和披露字段；
- 在本地生成 Holder Binding 并提交组合出示；
- 查看历史出示记录。

### 3.2 承包商 Issuer A

示例机构：华安机电有限公司。

允许签发：外派/在职关系 VC。

不得签发：职业资格 VC、园区安全培训 VC、项目授权 VC。

### 3.3 资格认证机构 Issuer B

示例机构：特种作业认证中心。

允许签发：职业资格 VC。

### 3.4 培训机构 Issuer C

示例机构：临港园区安全培训中心。

允许签发：安全培训 VC。

### 3.5 项目业主 Issuer D / Verifier

示例机构：临港能源项目部。

允许签发：项目授权 VC。

同时作为验证方发起准入请求，并依据项目规则给出准入结论。

### 3.6 信任治理管理员

负责维护：

- 可信 Issuer；
- Issuer 可签发的凭证类型；
- Credential Schema；
- 项目准入策略；
- DID 和 VC 状态；
- 治理与审计记录。

## 4. MVP 凭证模型

### 4.1 外派/在职关系 VC

建议类型：`EmploymentAssignmentCredential`

最小字段：

| 字段 | 含义 |
|---|---|
| `credentialSubject.id` | Holder DID |
| `name` | 人员姓名，演示字段 |
| `employerId` | 承包商标识 |
| `employerName` | 承包商名称 |
| `employeeNumber` | 企业内部编号 |
| `jobTitle` | 岗位或工种 |
| `assignmentProject` | 外派项目 |
| `assignmentValidFrom` | 外派开始时间 |
| `assignmentValidUntil` | 外派结束时间 |

### 4.2 职业资格 VC

建议类型：`ProfessionalQualificationCredential`

最小字段：

| 字段 | 含义 |
|---|---|
| `credentialSubject.id` | Holder DID |
| `qualificationType` | 资格类型，如低压电工作业 |
| `qualificationLevel` | 等级 |
| `certificateNumber` | 资格编号 |
| `authorizedWork` | 允许的作业类型 |
| `validFrom` | 生效时间 |
| `validUntil` | 失效时间 |

### 4.3 安全培训 VC

建议类型：`SafetyTrainingCredential`

最小字段：

| 字段 | 含义 |
|---|---|
| `credentialSubject.id` | Holder DID |
| `trainingProgram` | 培训项目 |
| `trainingScope` | 适用园区或项目 |
| `completedAt` | 完成时间 |
| `assessmentResult` | 考核结果 |
| `validUntil` | 有效期 |

### 4.4 项目授权 VC

建议类型：`ProjectAccessAuthorizationCredential`

最小字段：

| 字段 | 含义 |
|---|---|
| `credentialSubject.id` | Holder DID |
| `projectId` | 项目标识 |
| `projectName` | 项目名称 |
| `allowedZones` | 允许进入的区域 |
| `allowedWorkTypes` | 允许执行的作业类型 |
| `accessValidFrom` | 授权开始时间 |
| `accessValidUntil` | 授权结束时间 |
| `sponsorOrganization` | 项目责任机构 |

### 4.5 公共凭证字段

所有凭证继续包含：

- `id`；
- `type`；
- `issuer`；
- `validFrom`/`issuanceDate`；
- `validUntil`/`expirationDate`；
- `credentialSubject`；
- `credentialStatus`；
- `proof` 或相应安全格式数据。

## 5. 信任治理模型

### 5.1 可信机构目录

MVP至少维护以下关系：

```text
华安机电有限公司
  → 可签发 EmploymentAssignmentCredential

特种作业认证中心
  → 可签发 ProfessionalQualificationCredential

临港园区安全培训中心
  → 可签发 SafetyTrainingCredential

临港能源项目部
  → 可签发 ProjectAccessAuthorizationCredential
```

验证签名成功但 Issuer 未被授权签发对应类型时，必须返回“签名有效，但签发者不在该凭证类型的信任范围内”。

### 5.2 Schema 目录

每种凭证类型至少配置：

- Schema 标识和版本；
- 必填字段；
- 字段类型；
- 可选择披露字段；
- 默认有效期规则；
- 被允许的 Issuer 类型。

MVP可使用本地配置，不要求实现通用在线 Schema Registry。

### 5.3 信任边界

- DID 控制证明不等于人员真实身份审核；
- Issuer 签名证明不等于 Issuer 有业务资质；
- VC 有效不等于满足所有项目准入条件；
- 项目方保留最终业务决策权。

## 6. 组合出示模型

### 6.1 验证请求

项目方创建验证请求，至少包含：

```json
{
  "requestId": "access-request-001",
  "verifier": "did:example:lingang-project",
  "purpose": "临港能源项目 A 区电气维修准入",
  "requiredCredentialTypes": [
    "EmploymentAssignmentCredential",
    "ProfessionalQualificationCredential",
    "SafetyTrainingCredential",
    "ProjectAccessAuthorizationCredential"
  ],
  "requestedClaims": {
    "EmploymentAssignmentCredential": ["employerName", "jobTitle", "assignmentProject"],
    "ProfessionalQualificationCredential": ["qualificationType", "authorizedWork", "validUntil"],
    "SafetyTrainingCredential": ["trainingProgram", "trainingScope", "validUntil"],
    "ProjectAccessAuthorizationCredential": ["projectId", "allowedZones", "allowedWorkTypes", "accessValidUntil"]
  },
  "challenge": "random-nonce",
  "domain": "access.lingang-project.example",
  "expiresAt": "2026-07-14T10:05:00+08:00"
}
```

### 6.2 钱包选择

钱包收到请求后：

1. 显示请求方和业务目的；
2. 检查钱包中是否存在所需凭证；
3. 对同一类型存在多张凭证时提示用户选择；
4. 标明必需字段和可选字段；
5. 提示过期、暂停或撤销的凭证不可使用；
6. 用户确认后生成组合出示。

### 6.3 组合出示包

MVP可定义教学版 `MultiCredentialAccessPresentation2026`：

```json
{
  "type": "MultiCredentialAccessPresentation2026",
  "holder": "did:key:holder",
  "requestId": "access-request-001",
  "purpose": "临港能源项目 A 区电气维修准入",
  "challenge": "random-nonce",
  "domain": "access.lingang-project.example",
  "presentations": [
    { "credentialType": "EmploymentAssignmentCredential", "presentation": {} },
    { "credentialType": "ProfessionalQualificationCredential", "presentation": {} },
    { "credentialType": "SafetyTrainingCredential", "presentation": {} },
    { "credentialType": "ProjectAccessAuthorizationCredential", "presentation": {} }
  ],
  "holderBinding": {}
}
```

该格式必须明确标注为 MVP 的组合封装，不得宣称是正式注册的 W3C VP 格式。内部单张凭证可以继续使用现有完整 VC 或 SD-JWT 能力。

### 6.4 Holder Binding

Holder使用钱包本地私钥至少绑定：

- Holder DID；
- `requestId`；
- `challenge`；
- `domain`；
- 组合出示内容摘要；
- 创建时间和过期时间。

验证方必须拒绝：challenge 不匹配、domain 不匹配、请求过期、签名失败或已使用过的请求。

## 7. 准入策略

### 7.1 MVP固定策略

演示策略：允许华安机电的外派电工进入临港能源项目 A 区执行电气维修。

规则如下：

1. 四种必需凭证全部存在；
2. 每份凭证签名有效；
3. 每个 Issuer 均在对应凭证类型的可信目录中；
4. 四份凭证的 `credentialSubject.id` 相同；
5. 所有凭证状态均为 active 且在有效期内；
6. 外派关系的 `assignmentProject` 匹配当前项目；
7. 职业资格包含低压电工作业；
8. 安全培训适用于当前园区或项目；
9. 项目授权包含 A 区和电气维修；
10. Holder Binding、challenge、domain 和防重放检查通过。

### 7.2 验证结果分层

结果页分为四层：

| 层级 | 示例检查 |
|---|---|
| 凭证完整性 | 格式、签名、DID解析、密钥版本 |
| 信任与状态 | Issuer授权、有效期、暂停、撤销、替代 |
| 持有人证明 | Holder一致性、Holder Binding、challenge、domain、防重放 |
| 业务规则 | 项目、区域、工种、培训和时间条件 |

总结果只在全部必需检查通过时显示“准入通过”。失败时必须显示可操作原因，例如：

- 缺少安全培训凭证；
- 职业资格已过期；
- 签发者未获准签发职业资格；
- 项目授权不包含A区；
- 多份凭证不属于同一Holder；
- 本次验证请求已使用，疑似重放。

## 8. 产品功能改造

### 8.1 签发平台

需要新增或调整：

- 选择当前签发机构；
- 根据机构权限筛选可签发的凭证模板；
- 四类凭证签发表单；
- Schema校验；
- 钱包交付包生成；
- 按机构、凭证类型、Holder和状态查询台账；
- 暂停、恢复、撤销和替代重签。

禁止签发平台替个人创建或保存Holder私钥。

### 8.2 个人钱包

需要新增或调整：

- 按“外派关系、职业资格、安全培训、项目授权”分类展示凭证；
- 同时保存同一Holder的多份凭证；
- 接收准入验证请求；
- 自动匹配所需凭证；
- 展示请求目的、必需字段、可选字段和风险提示；
- 生成多凭证组合出示；
- 保存出示时间、请求方、目的和已披露字段。

### 8.3 验证平台

需要新增或调整：

- 创建外派人员准入请求；
- 配置项目、区域、作业类型和请求有效期；
- 生成请求码或演示二维码；
- 接收组合出示；
- 分项验证四类凭证；
- 执行Holder一致性和防重放检查；
- 执行固定准入策略；
- 输出准入结论和失败原因；
- 保存最小化验证记录。

### 8.4 治理中心

MVP至少提供：

- Issuer列表和状态；
- Issuer与可签发凭证类型的映射；
- 四类Schema及版本；
- 固定准入策略的可读展示；
- 信任配置变更审计。

首期不要求建设通用拖拽式规则引擎。

## 9. 数据模型改造建议

### 9.1 避免固定课程字段

将当前 `course`、`completionDate` 等字段从通用服务和钱包核心逻辑中移出，改由凭证Schema或类型配置控制。

建议形成：

```text
CredentialRecord
  - id
  - type
  - issuerDid
  - holderDid
  - schemaId
  - credentialSubject
  - status
  - issuedAt
  - validUntil
  - credential
```

### 9.2 新增治理映射

```text
TrustedIssuerAuthorization
  - issuerDid
  - credentialType
  - status
  - validFrom
  - validUntil
```

### 9.3 新增验证请求

```text
VerificationRequest
  - requestId
  - verifierDid
  - purpose
  - projectId
  - zone
  - workType
  - requiredCredentialTypes
  - requestedClaims
  - challenge
  - domain
  - expiresAt
  - status
```

### 9.4 新增组合出示与结果

```text
AccessPresentation
  - presentationId
  - requestId
  - holderDid
  - credentialPresentations
  - holderBinding
  - createdAt

AccessDecision
  - decisionId
  - requestId
  - presentationId
  - valid
  - decision
  - checks
  - failureReasons
  - checkedAt
```

## 10. 演示主流程

### 10.1 正常准入

1. 钱包创建Holder DID；
2. 系统登记四个Issuer DID及授权范围；
3. 承包商签发外派关系VC；
4. 资格机构签发职业资格VC；
5. 培训机构签发安全培训VC；
6. 项目方签发项目授权VC；
7. 张三的钱包领取四份VC；
8. 项目方发起“A区电气维修准入”请求；
9. 钱包展示目的和字段，张三确认组合出示；
10. 验证平台完成分层检查；
11. 系统输出“准入通过”。

### 10.2 资格撤销

1. 资格机构撤销职业资格VC；
2. 张三再次提交原组合或重新出示；
3. 签名检查仍可通过；
4. 状态检查失败；
5. 系统输出“准入拒绝：职业资格已撤销”。

### 10.3 越权签发

1. 承包商尝试签发职业资格VC；
2. 该VC的密码学签名可以正确；
3. 信任治理检查发现承包商无权签发该类型；
4. 系统输出“签名有效，但签发者不受该凭证类型信任”。

该流程用于说明“签名有效不等于业务可信”。

### 10.4 区域不匹配

1. 项目授权仅包含B区；
2. 验证请求要求进入A区；
3. 所有签名和状态均有效；
4. 业务规则检查失败；
5. 系统输出“准入拒绝：授权区域不包含A区”。

### 10.5 重放攻击

1. 正常准入请求已被成功使用；
2. 再次提交相同presentation；
3. 防重放台账发现challenge已消费；
4. 系统拒绝本次出示。

## 11. 测试与验收标准

### 11.1 功能验收

- 能创建或登记四个不同Issuer DID；
- 能限制每个Issuer可签发的凭证类型；
- 能为同一Holder签发并保存四类VC；
- 钱包能分类展示四类VC；
- 验证方能创建包含purpose、challenge、domain和有效期的请求；
- 钱包能为一次请求选择并组合多份VC；
- 组合出示包含Holder Binding；
- 验证方能检查四份VC属于同一Holder；
- 验证方能输出分层检查结果和最终准入结论；
- 凭证过期、暂停、撤销或被替代后准入失败；
- 未授权Issuer签发的凭证即使签名正确也不能通过；
- 区域、工种、项目或时间不匹配时业务规则失败；
- 相同challenge重复使用时被拒绝；
- 验证记录不默认保存未披露字段和Holder私钥。

### 11.2 回归验收

- DID创建、解析、轮换和停用能力不受影响；
- 现有完整VC签名和验签继续通过；
- 现有SD-JWT核心能力继续通过；
- VC暂停、恢复、撤销、过期和替代重签继续通过；
- 搜索、分页、日志脱敏和审计能力继续通过；
- Holder私钥仍仅保存在个人钱包控制域。

### 11.3 演示成功标准

在一次连续演示中完成：

```text
多机构签发四类VC
→ 个人钱包统一持有
→ 项目方发起A区准入请求
→ 钱包按目的组合出示
→ 验证方完成密码学、信任、状态和业务规则检查
→ 输出准入通过
→ 撤销其中一项资格
→ 再次验证并明确拒绝
```

## 12. 实施范围划分

### 12.1 必须完成

- 凭证模型从课程字段改为Schema/类型驱动；
- 至少三个独立Issuer，推荐四个；
- 四类业务VC；
- 钱包多凭证分类与选择；
- 多凭证组合出示；
- Issuer授权检查；
- 固定准入规则；
- 正常、撤销、越权签发、区域不匹配和重放演示；
- 配套测试、产品说明和演讲材料更新。

### 12.2 可以简化

- 所有机构可运行在同一MVP服务中，以组织身份和Issuer DID区分；
- 信任目录和Schema可采用本地数据库或配置；
- 准入规则可以硬编码为一套可测试的固定策略；
- 二维码可以用请求码或JSON复制模拟；
- 组合出示可以使用明确标注的教学版封装；
- 身份和资格的线下真实性审核可以使用预置演示数据模拟。

### 12.3 明确不做

- 真实多机构独立部署和跨公网互联；
- 真实政府或行业资格数据库接入；
- 生产级KMS/HSM和硬件钱包；
- 通用可视化策略编排系统；
- 真实门禁闸机联动；
- 联盟链或公共链部署；
- 完整零知识证明；
- 宣称所有自定义格式均具有标准互操作性。

## 13. 改造影响评估

| 模块 | 改造程度 | 说明 |
|---|---|---|
| DID与密码学 | 小 | 主要复用现有能力 |
| VC生命周期 | 小 | 状态逻辑保持不变 |
| 凭证Schema与数据模型 | 中 | 从课程硬编码转为多类型 |
| 签发平台 | 中 | 多Issuer和四类表单 |
| 个人钱包 | 中 | 多凭证分类、匹配和组合 |
| 组合出示服务 | 中到大 | 新增组合封装和Holder绑定摘要 |
| 验证服务 | 中 | 新增跨凭证一致性及策略检查 |
| 信任治理 | 中 | Issuer与凭证类型授权映射 |
| 测试和文档 | 中到大 | 业务旅程和失败分支明显增加 |

总体判断：无需重构底层DID/VC系统，但需要对凭证Schema、钱包出示和验证决策进行一次有边界的场景化重构。

## 14. 推荐里程碑

### 里程碑1：领域模型迁移

- 建立四类Schema；
- 去除核心逻辑中的课程字段硬编码；
- 准备四个Issuer和一个Holder的演示数据。

### 里程碑2：多机构签发与治理

- 支持多Issuer签发；
- 增加Issuer—Credential Type授权；
- 完成越权签发失败测试。

### 里程碑3：钱包组合出示

- 支持多凭证分类和匹配；
- 创建验证请求；
- 生成组合出示和Holder Binding。

### 里程碑4：准入决策

- 完成分层验证；
- 实现固定准入策略；
- 输出明确失败原因；
- 增加challenge消费和防重放。

### 里程碑5：演示与证据

- 完成正常和失败业务旅程；
- 完成自动化回归；
- 更新README、PPT和演讲稿；
- 明确教学实现与生产标准的边界。

## 15. 最终产品表达

方案B完成后，产品不再只是“能够签发和验证一张培训证书的DID/VC演示”，而是：

> 一个面向外派人员跨组织准入的多方数字凭证MVP：不同机构分别为在职关系、职业资格、安全培训和项目授权背书，个人钱包统一持有并按准入目的组合出示，项目方依据可信签发者、凭证状态和业务规则即时作出准入判断。

