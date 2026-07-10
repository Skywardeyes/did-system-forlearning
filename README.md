# 信证台：DID/VC 本地演示系统

信证台是一个面向课程结业答辩的本地 Web 演示系统，以“培训营结业证书”为场景，完整展示：

> 创建 DID → 签发 VC → 查看 VC → 验证通过 → 篡改验证失败 → 撤销验证失败

系统使用 Node.js 内置 Ed25519 加密能力，无第三方运行依赖，无需联网、数据库或区块链。

## 快速开始

环境要求：Node.js 20 或更高版本。

```bash
npm start
```

浏览器访问：<http://127.0.0.1:4173>

首次使用可点击左下角“重置并载入演示数据”，系统会创建一个 Issuer DID、一个 Holder DID，并签发一张结业 VC。

## 功能清单

- 创建 Issuer 和 Holder 的 `did:key` 身份
- 查看包含验证方法、公钥、认证和断言方法的 DID Document
- 使用 Issuer 的 Ed25519 私钥签发培训结业 VC
- 查看、复制 VC JSON 和签发台账
- 分别验证格式、Issuer DID、签名、有效期和撤销状态
- 一键篡改姓名，展示签名验证失败
- 撤销凭证并展示撤销检查失败
- 保存最近验证记录
- 私钥仅保存在本地 `data/store.json`，不会通过普通 API 返回

## 演示流程

1. 启动应用并载入演示数据。
2. 在“DID 身份”查看 Issuer、Holder 和 DID Document。
3. 在“凭证签发”查看已生成的 VC，或重新填写信息签发。
4. 在“凭证验证”载入最新凭证，执行验证，确认五项全部通过。
5. 点击“模拟篡改姓名”，再次验证，观察 Ed25519 签名失败。
6. 返回总览，在凭证台账撤销原始 VC。
7. 重新载入该 VC 并验证，观察撤销状态失败。

## 测试

```bash
npm test
```

测试覆盖 DID 私钥隔离、原始 VC、姓名和课程篡改、未知 Issuer、过期及撤销场景。详细结果见 [测试与人工验收.md](docs/测试与人工验收.md)。

## 项目结构

```text
public/                 Web 演示操作台
src/crypto.js           did:key、稳定序列化、Ed25519 签名与验签
src/store.js            JSON 本地存储及私钥脱敏
src/vc-service.js       DID/VC 业务规则
src/server.js           HTTP API 与静态资源服务
test/                   自动化验收测试
docs/                   范围、方案、测试验收和交付材料
data/store.json         本地运行数据（已被 Git 忽略）
```

## 实现边界

本系统参考 W3C DID Core 与 VC Data Model 2.0 的核心数据结构，实现教学演示版 DID、VC 和 proof。`did:key` 的 Ed25519 公钥指纹采用 multicodec 前缀和 base58btc 编码；proof 使用稳定键序 JSON 和 Ed25519 签名。

该 proof 的名称为 `EducationalEd25519Signature2026`，用于明确区分教学实现与正式注册的 W3C Data Integrity cryptosuite。系统不提供生产级互操作、密钥托管、真实身份核验、链上注册或标准状态列表。

## 配置

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `4173` | 本地 HTTP 服务端口 |
| `DATA_FILE` | `data/store.json` | 本地数据文件路径 |

相关材料：

- [MVP 范围说明](docs/MVP范围说明.md)
- [开发方案与任务拆解](docs/开发方案与任务拆解.md)
- [测试与人工验收](docs/测试与人工验收.md)
- [交付总结](docs/交付总结.md)
