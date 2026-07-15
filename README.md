# 信证台：DID/VC 本地演示系统

> 答辩整改版 MVP：Holder 只使用独立信证钱包；Issuer 与 Verifier 只使用信证台。信证台账号只绑定一个组织，不再提供个人空间、组织切换或跨组织成员关系。详见 [MVP 角色简化与碰一碰演示](docs/MVP角色简化与碰一碰演示.md)。

需要现场从零演示时，请直接按照 [多租户 MVP 全流程演示操作手册](docs/多租户MVP全流程演示操作手册.md) 执行。

信证台是一个面向课程结业答辩的本地 Web 演示系统，以“培训营结业证书”为场景，完整展示：

> 创建 DID → 配置版本化凭证模板 → 动态字段签发 → 多 VC 组合披露 → 逐张验证 → 生命周期失效

系统使用 Node.js、MySQL、Ed25519、AES-256-GCM 和 V2 认证授权模型；新界面采用 Vue 3 + TypeScript + Vite，并按生产同源反向代理方式实现前后端分离。

## 快速开始

环境要求：Node.js 20 或更高版本。

```bash
npm start
npm run frontend:dev
npm run wallet:dev
```

可选的本地区块链 DID 锚定演示（另开终端）：

```bash
npm run chain:node
npm run chain:deploy
```

随后在 `.env` 设置 `BLOCKCHAIN_ENABLED=true`，重启后端；在“DID 身份”页面对 Issuer DID 点击“上链登记 / 同步”。链上只记录 DID 哈希、DID Document 哈希、版本、控制账户和停用状态，不写入 Holder 私钥、VC 明文或个人信息。

机构侧 Vue 界面访问：<http://127.0.0.1:5173>；个人钱包访问：<http://127.0.0.1:5176>。旧 `public/` 界面在迁移验收完成前保留为回退入口。

本地演示重置会创建机构 Issuer DID，并登记一个仅含公钥的外部钱包 Holder DID；服务端不会保存该 Holder 的私钥。

## 功能清单

- 签发机构创建并由 KMS 管理 Issuer DID；Holder 在独立钱包本地创建 `did:key`
- 签发平台只登记 Holder 的公开 DID Document，不创建、不保存 Holder 私钥
- 钱包使用 Holder 本地私钥签署公开登记包，可直接发布 DID Document；无需注册信证台个人账号
- 信证钱包提供独立的 Holder 注册、登录和七天会话；该账号体系与信证台组织账号完全分离
- 钱包注册可选择本地自托管或“平台代托管（MVP 模拟）”；当前代托管只记录模式，尚不代表生产级密钥托管已经完成
- 签发后自动创建待领取凭证；钱包每 15 秒检查收件箱，并可启用浏览器提醒，领取后自动导入本地钱包
- 钱包本地保存 VC 交付包、选择字段并生成带 Holder 本地签名的最小披露证明
- `did:example` 支持更新、密钥轮换和不可逆停用；`did:key` 明确禁用这三类操作
- 查看包含验证方法、公钥、认证和断言方法的 DID Document
- 使用 Issuer 的 Ed25519 私钥签发培训结业 VC
- 查看、复制 VC JSON 和签发台账
- 分别验证格式、Issuer DID、DID 状态、密钥版本、签名、有效期和 VC 状态
- VC 支持暂停、恢复、替代重签、过期和撤销
- DID、VC 和验签日志支持搜索、稳定倒序和 10/20/50 条分页
- 一键篡改姓名，展示签名验证失败
- 撤销凭证并展示撤销检查失败
- 保存最近验证记录
- 使用随机盐、SHA-256 声明摘要和 Issuer Ed25519 签名生成教学版选择性披露证明
- 组织可创建版本化凭证模板，签发任意受控字段；钱包可按签发方、凭证名称或 ID 搜索并添加多张 VC，再组合选择字段
- 信证台只面向组织侧 Issuer / Verifier；Holder 的身份、凭证和选择性披露统一由个人钱包处理
- 验证方使用公开 DID、公钥历史、模板摘要和凭证状态逐张验证，并记录组合验证台账
- 支持 RFC 9901 核心 SD-JWT：Issuer-signed JWT、`_sd` 摘要和按需 Disclosure 紧凑串
- 只公开选中的姓名、课程、完成日期或完成状态，未公开字段原值和盐不进入披露证明
- 验证披露证明并保存可搜索、分页、带中文失败原因的独立验证台账
- Issuer 私钥经加密后由机构 KMS 使用；Holder 私钥仅在个人钱包 IndexedDB 中以不可导出 `CryptoKey` 保存，不上传平台
- 独立日志中心记录操作审计与系统运行的成功、失败和异常
- 日志支持组合筛选、10/20/50 分页、脱敏详情和 5,000 条留存上限
- INFO/WARN/ERROR 分别使用绿色、黄色、红色并同时显示文字

## 演示流程

1. 启动机构侧应用与个人钱包；在钱包中本地创建 Holder DID，并点击“一键发送公开 DID 登记包”（手动复制仍是备用方式）。
2. 在机构侧“凭证签发”选择已登记的 Holder DID 并签发 VC；系统会创建待领取凭证，不交付 Holder 私钥。
3. 保持钱包页面打开，收件箱会在最多 15 秒内显示新凭证（也可启用浏览器提醒）；点击“领取并导入”即自动导入本地钱包。
4. 在钱包中选择字段并生成本地签名的最小披露证明。
5. 钱包点击“碰一下，就验证！”，验证方入口自动收到证明；点击“验证”后在右侧查看 Issuer 签名、VC 状态、Holder DID、Holder 本地签名和防重放结果。
6. 点击“模拟篡改姓名”，再次验证，观察 Ed25519 签名失败。
7. 返回总览，在凭证台账撤销原始 VC；重新载入该 VC 并验证，观察撤销状态失败。
8. 在个人钱包打开“选择性披露”，搜索并添加所需凭证，只勾选准备公开的字段；再到验证方页面验证并查看组合验证台账。
9. 打开“日志中心”，筛选 audit/system、成功/失败和日志级别，查看脱敏详情。
10. 确认清空日志，观察仅保留 `LOG_CLEAR` 摘要。

## 测试

```bash
npm test
```

测试覆盖两种 Method、DID/VC 生命周期、七项完整验证、教学版选择性披露、RFC 9901 核心 SD-JWT、验证台账、搜索分页和六条端到端业务旅程。当前代码已复核 Node 132/132；Chromium UI 的 44/44 为新增 SD-JWT 页面前的最近基线，正式汇报前需执行 `npm run test:evidence` 生成最终 UI 证据。详细结果见 [测试与人工验收.md](docs/测试与人工验收.md)。

## 项目结构

```text
frontend/               Vue 3 + TypeScript 独立前端工程
public/                 迁移期保留的旧 Web 操作台
public/log-ui.js        日志筛选状态、级别标识和安全渲染
src/crypto.js           did:key、稳定序列化、Ed25519 签名与验签
src/log-store.js        独立日志文件原子存储与留存上限
src/log-service.js      结构化日志、递归脱敏、查询与清空摘要
src/repositories/       与业务逻辑隔离的 MySQL 数据访问层
src/services/           V2 DID、VC、披露、验证与敏感访问服务
src/server.js           Node HTTP API 服务
deploy/                 Nginx 生产同源反向代理示例
test/                   自动化验收测试
docs/                   范围、方案、测试验收和交付材料
database/               MySQL 迁移脚本与 V10 Schema
```

## 实现边界

本系统参考 W3C DID Core 与 VC Data Model 2.0 的核心数据结构，实现教学演示版 DID、VC 和 proof。`did:key` 的 Ed25519 公钥指纹采用 multicodec 前缀和 base58btc 编码；完整 VC proof 使用稳定键序 JSON 和 Ed25519 签名。选择性披露使用加盐 SHA-256 声明摘要与 Ed25519 摘要清单签名。

完整 VC proof 的名称为 `EducationalEd25519Signature2026`，教学版选择性披露证明为 `EducationalSelectiveDisclosureProof2026`，用于明确区分教学实现与正式注册的 W3C Data Integrity cryptosuite、BBS+ 或零知识证明。系统实现 RFC 9901 核心 SD-JWT，并增加课程 MVP 的 Holder 组合签名。碰一碰流程仍会在后台生成一次性 Challenge、保存哈希并在首次验证时原子消费，只是把复制、填写和粘贴从演示界面隐藏。它不是正式 NFC 协议或 SD-JWT Holder Key Binding 规范实现。

## 配置

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `4173` | 本地 HTTP 服务端口 |
| `DATA_FILE` | `data/store.json` | 本地数据文件路径 |
| `LOG_FILE` | `data/logs.json` | 独立结构化日志文件路径 |

相关材料：

- [MVP 范围说明](docs/MVP范围说明.md)
- [开发方案与任务拆解](docs/开发方案与任务拆解.md)
- [测试与人工验收](docs/测试与人工验收.md)
- [交付总结](docs/交付总结.md)

## Agent 自动化测试

首次安装测试依赖与 Chromium：

```bash
npm install
npx playwright install chromium
```

分层执行：

```bash
npm run test:unit
npm run test:integration
npm run test:api
npm run test:functional
npm run test:security
npm run test:ui
```

Agent 一键执行全部测试：

```bash
npm run test:all
```

所有服务层和 HTTP 测试使用操作系统临时目录及随机端口，不读写 `data/store.json` 或 `data/logs.json`。Playwright 仅运行 Chromium；失败产物位于 `test-results/`，HTML 报告位于 `playwright-report/`。

每次 `npm run test:all` 都会在本地创建测试记录：

```text
test-records/YYYY-MM-DD/YYYY-MM-DDTHH-mm-ss+08-00/
  result.md
  metadata.json
  node.log
  ui.log
```

`result.md` 包含测试时间、耗时、通过率、失败用例和简要分析；`metadata.json` 供 Agent 结构化读取；两个日志文件保存完整输出。测试失败时 Node 与 UI 仍会全部执行，最后返回非零退出码。测试记录已被 Git 忽略，仅保存在本机。缺陷修复与回归证据见 [测试缺陷报告](docs/测试缺陷报告.md)。
