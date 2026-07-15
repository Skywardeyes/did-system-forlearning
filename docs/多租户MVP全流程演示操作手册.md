# DID/VC 多组织多租户 MVP 全流程演示操作手册

> 适用版本：MySQL Schema V10、多租户统一账号、个人钱包自托管、组织审核、VC 签发验证、SD-JWT 钱包证明和本地 EVM DID 锚定。

## 1. 文档用途

本手册用于现场完整演示当前系统。操作人员可以从头依次执行，不需要临时推断下一步。

完整演示覆盖：

1. 统一自然人账号注册；
2. 自动个人空间和待审核组织空间；
3. 平台管理员审核组织；
4. 组织角色与 `tenant_id` 隔离；
5. 个人钱包本地生成 Holder 私钥和 `did:key`；
6. 公开 Holder DID 登记与组织关联；
7. 机构 Issuer DID 创建与 KMS 托管；
8. VC 签发、钱包消息提醒和领取；
9. 完整 VC 验证与篡改检测；
10. 钱包选择性披露、Holder 签名、Challenge 防重放；
11. VC 暂停、恢复和不可逆撤销；
12. 组织成员邀请与最小权限授权；
13. Issuer DID 本地 EVM 链上锚定；
14. 审计与敏感明文访问证据。

## 2. 推荐演示角色

准备三个互不相同的自然人账号：

| 账号 | 姓名 | 角色 | 用途 |
|---|---|---|---|
| `platform@example.com` | 平台管理员 | `platform_admin` | 审核组织入驻 |
| `school@example.com` | 学校负责人 | 组织所有者、管理员、Issuer、Verifier | 创建机构 DID、签发和验证 VC |
| `student@example.com` | 演示学生 | Holder | 创建自托管钱包、领取和出示 VC |

统一使用演示密码：

```text
DemoPassword123
```

该密码只能用于本地演示，不得用于生产环境。

## 3. 演示前环境准备

### 3.1 检查项目目录

所有命令都应在项目根目录执行：

```cmd
cd /d D:\Github\did-system-forlearning
```

如果在 `C:\Users\...` 下直接执行 `npm`，会出现“找不到 package.json”。

### 3.2 检查 MySQL

先确保 MySQL 8.0 已启动，再执行：

```cmd
npm install
npm run migrate
npm run db:check
```

预期结果：

```json
{
  "healthy": true,
  "currentVersion": 10
}
```

如果版本低于 10，再执行一次：

```cmd
npm run migrate
```

### 3.3 可选：先验证多租户后端

```cmd
npm run smoke:multitenant
```

预期关键结果：

```text
registration: 201
organizationStatus: pending
issuerBeforeApproval: 403
review: 200
publishedHolder: 201
linkedHolder: 201
invitationAccepted: 200
revokedToken: 401
```

该命令会向本地开发数据库写入随机冒烟账号，不要在生产数据库执行。

## 4. 启动系统

打开三个终端，均进入项目根目录。

### 终端一：Node API

```cmd
npm start
```

预期输出：

```text
DID/VC Learning Lab running at http://127.0.0.1:4173
```

### 终端二：Vue 组织工作台

```cmd
npm run frontend:dev
```

访问：<http://127.0.0.1:5173>

### 终端三：个人信证钱包

```cmd
npm run wallet:dev
```

访问：<http://127.0.0.1:5176>

### 4.1 启动检查

浏览器访问：<http://127.0.0.1:4173/health>

应返回：

```json
{
  "status": "ok"
}
```

如果端口 4173 已占用，先关闭旧的 `npm start` 终端。不要同时保留新旧两个后端，否则浏览器可能访问到旧代码。

## 5. 演示窗口安排

推荐使用两个浏览器上下文：

- 普通窗口：平台管理员和学校负责人；
- 无痕窗口：学生账号和个人钱包。

也可以使用三个独立浏览器。不要让多个角色共用同一个 `sessionStorage`，否则容易误以为正在操作另一个账号。

## 6. 第一阶段：创建平台管理员

### 6.1 注册平台管理员自然人账号

打开：<http://127.0.0.1:5173/login>

选择“注册”，填写：

```text
姓名：平台管理员
邮箱：platform@example.com
密码：DemoPassword123
```

不要勾选“注册后同时提交组织入驻申请”。

点击“创建账号”。

预期结果：

- 自动进入“平台管理员的个人空间”；
- 当前角色只有个人空间角色；
- 暂时看不到“平台治理后台”。

### 6.2 由部署人员授予平台角色

回到项目 CMD：

```cmd
npm run platform:grant-admin -- platform@example.com
```

预期输出：

```json
{
  "userId": "...",
  "role": "platform_admin"
}
```

网页中退出并重新登录 `platform@example.com`，左侧应出现“平台治理后台”。

### 6.3 演示讲解词

> 平台管理员权限不能由注册用户自行勾选，否则任何人都可以自封为平台管理员。我们把平台角色与租户角色分开，并由部署人员通过受控命令授予。平台管理员可以审核组织，但不会自动获得任何组织的 Issuer 私钥或业务数据权限。

## 7. 第二阶段：注册学校与验证审核前拦截

退出平台管理员，重新打开登录页并选择“注册”。

填写：

```text
姓名：学校负责人
邮箱：school@example.com
密码：DemoPassword123
```

勾选：

```text
注册后同时提交组织入驻申请
```

组织资料：

```text
组织名称：可信数字学院
组织类型：教育机构
```

点击“创建账号”。

### 7.1 检查自动生成的空间

左侧空间切换器应出现：

```text
个人｜学校负责人的个人空间
组织｜可信数字学院
```

切换到“可信数字学院”。

预期状态：

```text
verificationStatus = pending
roles = tenant_admin / workspace_owner
```

此时不会出现“凭证签发”和“凭证验证”菜单。

### 7.2 演示审核前拦截

可以直接在地址栏尝试：

```text
http://127.0.0.1:5173/credentials
```

前端会把用户送回总览。即使绕过前端直接调用签发 API，后端也会返回 403。

### 7.3 演示讲解词

> 创建组织空间不等于立即成为可信签发方。待审核组织只有所有者和租户管理能力，没有 issuer_operator 和 verifier_operator。前端隐藏菜单只是用户体验层，真正的安全控制由后端实时查询数据库成员角色和组织审核状态完成。

## 8. 第三阶段：平台审核组织

在另一个浏览器窗口登录：

```text
platform@example.com
```

进入“平台治理后台”，找到“可信数字学院”。

审核说明填写：

```text
演示审核：确认申请组织为教育机构，允许开展凭证签发和验证。
```

点击“通过”。

预期结果：

- 组织状态改为 `approved`；
- 学校申请人获得 `issuer_operator`；
- 学校申请人获得 `verifier_operator`；
- 原有 `tenant_admin` 和 `workspace_owner` 保留。

回到学校窗口，先切换到个人空间，再切回组织空间，或者退出后重新登录。

预期新增菜单：

- DID 身份；
- 凭证签发；
- 凭证验证；
- 钱包证明验证；
- 审计中心；
- 组织与成员。

## 9. 第四阶段：给学校负责人增加受控明文读取角色

完整 VC 验证页面的“授权载入”需要 `credential_data_reader`。该权限不会自动包含在租户管理员或 Issuer 角色中。

学校负责人进入“组织与成员”：

1. 点击“加载成员”；
2. 找到 `school@example.com`；
3. 点击“授予 credential_data_reader”。

预期结果：成员角色列表增加：

```text
credential_data_reader
```

讲解：

> 敏感明文读取被设计成独立角色，不能因为是管理员就自动读取所有 VC。读取时还必须提交访问目的，并先写审计台账，再返回明文。

## 10. 第五阶段：注册学生自然人账号

在无痕窗口打开：<http://127.0.0.1:5173/login>

注册：

```text
姓名：演示学生
邮箱：student@example.com
密码：DemoPassword123
```

不要创建组织。

预期结果：系统只自动创建：

```text
演示学生的个人空间
```

个人空间拥有 Holder 能力，不拥有 Issuer、Verifier 或租户审计能力。

## 11. 第六阶段：钱包本地生成 Holder DID

在学生浏览器打开：<http://127.0.0.1:5176/#identity>

在“创建本地 DID”区域填写：

```text
身份名称：演示学生钱包身份
```

点击“本地生成密钥与 DID”。

预期出现类似：

```text
did:key:z6Mk...
```

记录完整 Holder DID，后续组织关联时使用。

### 11.1 安全观察点

公开登记包只应包含：

- DID；
- DID Document；
- Ed25519 公钥 JWK；
- authentication 和 assertionMethod。

不应包含：

- Holder 私钥；
- 账号密码；
- 恢复材料；
- 已持有 VC；
- 随机盐。

### 11.2 演示讲解词

> Holder 的 Ed25519 私钥由浏览器 Web Crypto 本地生成，以不可导出的 CryptoKey 保存到 IndexedDB。平台只能取得公开 DID Document，不能读取私钥，也不能代替学生对 Challenge 签名。

## 12. 第七阶段：把钱包 DID 绑定到学生个人空间

在钱包顶部“登录个人账号，登记 Holder DID”区域填写：

```text
信证台 API 地址：http://127.0.0.1:4173
账号邮箱：student@example.com
账号密码：DemoPassword123
```

点击“登录并绑定到个人空间”。

预期提示：

```text
公开 DID 已绑定到个人空间；Holder 私钥未上传。
```

这一操作写入的是 V10 表 `v2_user_holder_dids`，该表是公开 Holder DID 目录，不是密钥库。

## 13. 第八阶段：学校创建 Issuer DID

回到学校组织工作台，确认当前空间：

```text
组织｜可信数字学院
```

进入“DID 身份”，填写：

```text
机构名称：可信数字学院签发身份
DID Method：did:example
服务地址：留空
```

点击“创建机构 DID”。

预期生成：

```text
did:example:<UUID>
```

卡片应显示：

```text
role = issuer
status = active
keyCustody = issuer_managed_kms
```

讲解：

> Issuer 私钥与 Holder 私钥采用不同托管模型。Holder 私钥由个人钱包自托管；Issuer 私钥属于组织签发基础设施，由服务端 KMS 加密保存，业务接口只能请求签名，不能直接导出私钥。

## 14. 第九阶段：学校关联学生公开 Holder DID

仍在“DID 身份”页面，在“已在个人钱包发布的 Holder DID”输入框粘贴学生的完整：

```text
did:key:z6Mk...
```

点击“从公开目录关联到当前组织”。

预期结果：DID 列表增加 Holder 记录：

```text
role = holder
method = key
keyCustody = holder_self_custody
```

讲解：

> 组织只是把学生公开 DID Document 关联到自己的租户，方便选择签发对象。这个过程没有复制私钥。相同公开身份可以被多个可信组织识别，但各组织签发的 VC 和审计记录仍由 tenant_id 隔离。

## 15. 第十阶段：学校签发 VC

进入“凭证签发”。

填写：

```text
Issuer：可信数字学院签发身份
Holder：演示学生钱包身份
学员姓名：演示学生
课程：数字身份与可验证凭证训练营
完成日期：当天日期
有效至：一年后
```

点击“使用 Issuer KMS 签发”。

预期结果：

- 弹窗显示“新签发 VC·仅本次返回”；
- VC 摘要列表新增一条 `active` 凭证；
- 列表只显示“受保护的 VC 正文”，不会自动解密姓名和课程；
- 系统同时创建钱包待领取 offer。

不要关闭新签发 VC 弹窗，先观察：

- `issuer` 是学校 DID；
- `credentialSubject.id` 是学生 Holder DID；
- `proof` 包含验证方法、密钥版本和 Ed25519 签名；
- 没有 Holder 私钥。

## 16. 第十一阶段：学生钱包收到并领取 VC

回到钱包，进入“凭证收件箱”。

钱包打开时每 15 秒自动检查，也可以点击“立即检查”。

看到待领取凭证后点击“领取并导入”。

预期结果：

1. 钱包请求一次性 Challenge；
2. 钱包使用 Holder 本地私钥签名；
3. 后端使用公开 DID Document 验证签名；
4. Challenge 被原子消费；
5. VC 自动导入 IndexedDB；
6. “本地凭证库”出现该凭证。

讲解：

> 后端不会因为请求者知道 Holder DID 就交付 VC。领取者必须证明自己控制对应私钥。Challenge 只保存哈希，成功使用一次后立即失效，从而阻止复制请求重放。

## 17. 第十二阶段：完整 VC 验证与篡改检测

学校进入“凭证验证”。

### 17.1 授权载入

点击“授权载入”。

预期结果：

- 最新 VC JSON 被载入文本框；
- 页面提示“已授权载入，明文访问已审计”；
- 明文只保存在当前 Vue 组件内存，离开页面时清空。

如果返回 403，说明第 9 节尚未授予 `credential_data_reader`。

### 17.2 执行完整验证

点击“执行完整验证”。

预期通过的检查包括：

- 凭证格式；
- Issuer DID 存在；
- Issuer DID 状态；
- 签名密钥版本；
- Ed25519 签名；
- 有效期；
- VC 生命周期状态；
- Holder DID 状态。

### 17.3 篡改检测

点击“模拟篡改”，系统会修改学员姓名。再次点击“执行完整验证”。

预期结果：Ed25519 签名检查失败，整体验证失败。

讲解：

> VC 可以作为 JSON 传输，但明文不代表可以任意修改。签名覆盖了凭证核心内容，攻击者保留原 proof、修改姓名或课程后，公钥验签一定失败。传输保密仍应依靠 HTTPS；数字签名解决的是真实性和完整性，不等于加密。

## 18. 第十三阶段：钱包最小披露与 Holder 绑定验证

### 18.1 验证方生成一次性 Challenge

学校进入“钱包证明验证”。

验证方域名填写：

```text
hr.example.com
```

点击“生成一次性 Challenge”。

复制：

- Challenge；
- 验证方域名 `hr.example.com`。

页面会显示过期时间。

### 18.2 Holder 在钱包选择披露字段

学生钱包进入“选择性披露”。

选择刚领取的凭证，只勾选演示需要的字段，例如：

```text
课程
完成状态
```

取消勾选姓名和完成日期。

填写验证方提供的：

```text
Verifier Challenge：刚复制的 Challenge
Verifier 域名/标识：hr.example.com
```

点击“本地生成披露证明”。

复制完整 `WalletBoundSdJwtPresentation2026` JSON。

### 18.3 验证方验证

回到学校“钱包证明验证”，粘贴钱包证明，点击：

```text
验证最小披露、Holder 签名与一次性 Challenge
```

预期结果：

- Issuer SD-JWT 签名通过；
- Disclosure 与 `_sd` 摘要匹配；
- VC 生命周期有效；
- Holder DID 匹配；
- Holder 本地签名通过；
- Challenge 和 Domain 匹配；
- Challenge 首次使用并被消费。

### 18.4 防重放演示

不做任何修改，再次提交同一份证明。

预期结果：验证失败，原因是 Challenge 已被消费。

讲解：

> 验证方看到的只有本次选择的声明。未披露字段的原值和随机盐不会进入出示证明。Issuer 签名证明这些声明来自学校，Holder 对 Challenge 的本地签名证明当前出示者控制自己的 DID，一次性 Challenge 则阻止旧证明被重复播放。

## 19. 第十四阶段：VC 生命周期

回到“凭证签发”的 VC 摘要列表。

### 19.1 暂停

点击“暂停”。

预期状态：

```text
suspended
```

再次验证时，密码学签名仍可能正确，但凭证整体无效；钱包不得生成可通过认证的新披露证明。

### 19.2 恢复

点击“恢复”。

预期状态恢复为：

```text
active
```

再次验证恢复有效。

### 19.3 撤销

点击“撤销”，确认不可逆提示。

预期状态：

```text
revoked
```

撤销后不能恢复，完整验证和选择性披露验证都应失败。

讲解：

> 签名回答“内容是否由该 Issuer 签发且未被修改”，生命周期回答“现在是否仍被认可”。二者必须同时检查。撤销后不必重写历史记录，验证方读取最新状态即可拒绝旧凭证。

## 20. 第十五阶段：组织邀请和角色授权

学校进入“组织与成员”。

为了演示，可以提前再注册一个账号：

```text
姓名：学校验证员
邮箱：verifier@example.com
密码：DemoPassword123
```

学校负责人输入：

```text
受邀邮箱：verifier@example.com
```

点击“生成一次性邀请令牌”。

复制令牌，登录验证员账号，在“收到的邀请令牌”中粘贴并接受。

预期初始角色只有：

```text
organization_member
```

学校负责人加载成员后，可以只授予：

```text
verifier_operator
```

不要授予 Issuer 或租户管理员，以展示最小权限。

安全检查：

- 邀请令牌使用 256 位随机数；
- 数据库只保存 SHA-256 哈希；
- 明文只在创建时返回一次；
- 接受邀请的登录邮箱必须与受邀邮箱一致；
- 系统禁止移除最后一个 `tenant_admin`。

## 21. 第十六阶段：本地 EVM 链上 DID 锚定

该部分建议演示前完成部署，正式讲解时只操作“上链登记/同步”和“查询链上状态”。

### 21.1 启动本地链

另开终端：

```cmd
npm run chain:node
```

保持终端运行。

### 21.2 部署 DidRegistry 合约

再开终端：

```cmd
npm run chain:deploy
```

部署结果自动写入本地忽略文件：

```text
data/chain-deployment.json
```

后端会自动从该文件读取合约地址，因此通常不需要手工复制 `BLOCKCHAIN_CONTRACT_ADDRESS`。

### 21.3 配置 `.env`

```dotenv
BLOCKCHAIN_ENABLED=true
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
BLOCKCHAIN_CHAIN_ID=31337
```

修改后必须重新启动后端：

```cmd
npm start
```

### 21.4 上链登记 Issuer DID

学校进入“DID 身份”，找到活跃 Issuer DID，点击：

```text
上链登记 / 同步
```

预期弹窗显示：

- 交易哈希；
- 区块号；
- 合约地址；
- DID 哈希；
- DID Document 哈希；
- 链 ID；
- 链上版本。

点击“查询链上状态”，应显示 `registered = true`。

### 21.5 可选：链上停用

注意：DID 停用不可逆，建议最后演示。

1. 在平台中先停用 Issuer DID；
2. 再点击“写入链上停用”；
3. 查询链上状态，应显示 `deactivated = true`。

讲解：

> 链上只保存 DID 哈希、DID Document 哈希、版本、控制账户和停用状态。VC 明文、姓名、课程、随机盐、完整 DID Document 和 Holder 私钥都不上链。链上锚定提供公共可核验状态，但不自动证明现实世界机构资质。

## 22. 第十七阶段：审计证据

学校进入“审计中心”，重点展示：

- 请求关联 ID；
- 当前 `tenant_id`；
- 操作人 ID；
- DID 创建和生命周期；
- VC 签发与状态变更；
- 验证成功和失败；
- Challenge 创建和消费；
- 敏感明文访问目的；
- 脱敏后的错误信息。

解释：

> 普通 VC 列表查询不会解密正文。只有独立的 credential_data_reader 角色提供明确目的时，系统才受控解密，并坚持先写审计、后返回明文；如果审计写入失败，明文读取也会失败关闭。

## 23. 推荐现场顺序与时间

### 23.1 12 分钟完整产品演示

| 时间 | 内容 |
|---:|---|
| 0:00—1:30 | 统一账号、个人/组织空间、审核前 403 |
| 1:30—2:30 | 平台审核组织与角色变化 |
| 2:30—4:00 | 钱包创建 Holder DID、绑定个人空间 |
| 4:00—5:30 | 创建 Issuer DID、关联 Holder、签发 VC |
| 5:30—6:30 | 钱包收件箱领取 VC |
| 6:30—7:45 | 完整验证和篡改失败 |
| 7:45—9:45 | Challenge、选择性披露、Holder 签名、防重放 |
| 9:45—10:45 | VC 暂停、恢复、撤销 |
| 10:45—11:30 | 成员邀请与最小权限 |
| 11:30—12:00 | 区块链锚定与审计总结 |

### 23.2 8 分钟压缩演示

必须现场操作：

1. 组织审核前后权限变化；
2. 钱包本地 Holder DID；
3. VC 签发和钱包领取；
4. 完整验证与篡改失败；
5. 选择性披露、防重放；
6. 撤销后验证失败。

只讲不操作：

- 成员邀请；
- 敏感访问角色；
- 链上停用；
- 平台管理员授予命令。

## 24. 演示前检查清单

### 环境

- [ ] CMD 当前目录为 `D:\Github\did-system-forlearning`；
- [ ] MySQL 已启动；
- [ ] `npm run db:check` 显示 V10 healthy；
- [ ] 后端 4173 正常；
- [ ] Vue 5173 正常；
- [ ] 钱包 5176 正常；
- [ ] 如果演示链，8545 节点和合约已启动；
- [ ] 浏览器缩放为 100%。

### 数据

- [ ] 平台管理员账号能看到平台治理后台；
- [ ] 学校组织已审核或准备好待审核申请；
- [ ] 学生账号已注册；
- [ ] 学校负责人拥有 `credential_data_reader`；
- [ ] 钱包已允许 IndexedDB；
- [ ] 准备一条 active VC；
- [ ] Challenge 尚未使用；
- [ ] 如果演示撤销，准备单独的可撤销 VC；
- [ ] 如果演示 DID 停用，使用专门的演示 Issuer DID。

### 安全口径

- [ ] 不展示 `.env` 中的数据库密码、JWT Secret 或 KMS 主密钥；
- [ ] 不展示任何真实用户个人信息；
- [ ] 不声称 JSON 明文等于没有安全性；
- [ ] 明确签名解决完整性和真实性，HTTPS 解决传输保密；
- [ ] 明确当前 Web 钱包是 MVP，不等同于移动端安全区；
- [ ] 明确本地 EVM 是真实可执行测试链，但不是生产联盟链。

## 25. 常见故障与现场处理

| 现象 | 原因 | 处理 |
|---|---|---|
| `Could not read package.json` | CMD 不在项目目录 | 执行 `cd /d D:\Github\did-system-forlearning` |
| `Cannot find package mysql2` | 未安装依赖 | 执行 `npm install` |
| 后端提示数据库不可用 | MySQL 未启动或 `.env` 错误 | 启动 MySQL，检查 DB_HOST、DB_USER、DB_NAME |
| Schema 版本不支持 | 未执行最新迁移 | 执行 `npm run migrate` |
| 页面登录后仍无平台后台 | 授权后会话未刷新 | 退出并重新登录平台账号 |
| 组织审核通过后仍无签发菜单 | 当前令牌还是旧空间角色 | 切换个人空间再切回组织，或重新登录 |
| “授权载入”返回 403 | 缺少敏感读取角色 | 在组织成员页授予 `credential_data_reader` |
| 钱包 `Failed to fetch` | 后端未启动、地址错误或旧进程 | 确认 API 地址为 4173，并重启后端 |
| 钱包收不到 VC | Holder 未关联、VC 未签发给该 DID | 核对完整 did:key 和 VC Holder |
| 钱包领取失败 | DID 不匹配或 Challenge 过期 | 重新检查收件箱，生成新 Challenge |
| 同一证明第二次验证失败 | 正常防重放行为 | 重新生成 Challenge 和钱包证明 |
| 区块链显示尚未就绪 | 节点、合约或配置缺失 | 启动 chain:node、执行 chain:deploy、重启后端 |
| 链上停用按钮不可用 | 尚未平台停用或尚未上链 | 先上链登记，再平台停用，最后写链上停用 |

## 26. 应急降级方案

如果现场网络或链节点异常：

1. 区块链部分改为展示 `data/chain-deployment.json` 的非敏感字段和已有截图；
2. 不影响统一账号、钱包、VC、选择性披露和生命周期演示；
3. 明确链上锚定是附加信任层，不是 VC 签名验证的前置条件。

如果钱包通知未及时出现：

1. 点击“立即检查”；
2. 仍失败时，在组织凭证列表点击“生成钱包交付包”；
3. 钱包“本地凭证库”保留手动导入作为演示备用路径。

如果平台审核账号不可用：

1. 使用已审核的演示组织继续主流程；
2. 用架构图解释 `pending → approved → role grant`；
3. 不要现场直接修改数据库伪造审核状态。

## 27. 演示结束总结词

> 这套 MVP 的信任源点不是管理后台替用户保管所有密钥，而是两类主体分别控制自己的密钥：组织通过 KMS 控制 Issuer DID，个人通过本地钱包控制 Holder DID。平台负责统一账号、组织准入、租户隔离、凭证状态、验证和审计，但不能替 Holder 签名。VC 负责可验证声明，SD-JWT 和钱包签名实现最小披露与持有者绑定，区块链只锚定公开 DID 状态。当前系统已经形成从注册、审核、签发、领取、出示、验证到撤销的可运行闭环，同时明确保留邮箱验证、Passkey、移动端安全区、正式联盟链治理等生产化下一阶段工作。

## 28. 相关文档

- [统一账号与多组织多租户 MVP](统一账号与多组织多租户MVP.md)
- [个人钱包私钥保护与恢复技术选型对比](个人钱包私钥保护与恢复技术选型对比.md)
- [本地区块链 DID 锚定说明](本地区块链DID锚定说明.md)
- [测试与人工验收](测试与人工验收.md)
- [生产安全评估与整改 V5](生产安全评估与整改-V5.md)
