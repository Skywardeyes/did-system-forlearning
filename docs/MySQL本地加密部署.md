# MySQL 本地加密部署

正式运行不再回退到 JSON 文件。请先安装 MySQL 8，创建数据库和最小权限应用账号，执行 `database/001-initial.sql`，再参考 `.env.example` 设置环境变量。

使用以下命令生成 `KMS_MASTER_KEY`：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

主密钥必须是 Base64 编码的 32 字节随机值，不得写入数据库、源码、日志或 Git。DID 记录（包括私钥）和 VC 记录（包括个人声明、选择性披露材料和 SD-JWT Disclosure）进入 MySQL 前使用 AES-256-GCM 加密。每条记录使用独立随机 IV，并通过 AAD 与表名及记录 ID 绑定。

数据库配置、主密钥、数据库连接或结构版本无效时，应用拒绝启动。旧的 `data/store.json` 和 `data/logs.json` 不会自动迁移。

本实现属于软件级密钥保护演示，不等同于云 KMS 或硬件 HSM。
