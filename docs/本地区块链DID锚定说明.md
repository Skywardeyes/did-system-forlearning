# 本地区块链 DID 锚定说明

## 目标与边界

本功能为课程 MVP 增加一条真实的本地 EVM 测试链。它不是从零构建新区块链，也不把业务数据搬上链，而是将机构 `Issuer DID` 的公开状态锚定到 `DidRegistry` 智能合约。

链上记录只有：

- `keccak256(DID)`；
- 稳定序列化后 DID Document 的 `keccak256` 哈希；
- 合约控制账户、版本号、更新时间和停用状态；
- 对应交易哈希与区块号。

严禁上链：Holder 私钥、VC 明文、学员姓名、课程、选择性披露内容、随机盐、完整 DID Document 原文。

`did:key` Holder 是自证明标识，仍只由个人钱包本地生成和持有；本阶段只锚定机构 Issuer DID。

## 启动步骤

在项目根目录打开三个终端。

第一终端启动本地 EVM 测试链：

```powershell
npm run chain:node
```

第二终端部署合约：

```powershell
npm run chain:deploy
```

部署结果会写入本地忽略文件 `data/chain-deployment.json`，其中包含合约地址、链 ID、部署交易哈希；不得提交该文件。

在 `.env` 增加或修改：

```dotenv
BLOCKCHAIN_ENABLED=true
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
BLOCKCHAIN_CHAIN_ID=31337
```

第三终端启动后端和机构侧前端：

```powershell
npm start
npm run frontend:dev
```

打开 `http://127.0.0.1:5173/dids`，对一个活跃的 Issuer DID 点击“上链登记 / 同步”。弹窗会显示交易哈希、区块号、合约地址和 DID Document 哈希。先在平台中停用 Issuer DID，再点击“写入链上停用”，完成同样的链上状态更新。

## 演示口径

链上哈希让第三方可以检查“当前 DID Document 是否与已锚定版本一致”，而不暴露文档以外的私密业务数据。它不自动证明现实世界机构身份，也不等于跨机构主网注册；生产环境还需要受控部署账户、HSM/KMS 签名、公开 RPC/节点治理、费用策略、正式 DID Method 和状态列表规范。
