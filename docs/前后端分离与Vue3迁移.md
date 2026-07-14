# 前后端分离与 Vue 3 迁移

## 当前结论

项目采用“同一代码仓库、两个独立工程、生产同源访问”的结构：

- `frontend/`：Vue 3、TypeScript、Vite、Vue Router、Pinia，只负责界面与交互。
- `src/`：Node.js API 服务、身份认证、授权、业务规则、KMS、Repository 与 MySQL。
- 开发环境：Vite 在 `127.0.0.1:5173` 运行，并把 `/api` 代理到 Node 的 `127.0.0.1:4173`。
- 生产环境：Nginx 提供 Vue 构建产物，并把同域 `/api` 转发给 Node。浏览器不需要开放跨域权限。

旧 `public/` 暂时保留，作为功能对齐期间的回退界面。生产环境必须配置 `SERVE_FRONTEND=false`，Node 不再直接提供这些旧静态文件。

## 安全边界

Vue 迁移不改变密码学与权限边界：

1. VC 列表只保存非敏感摘要，不返回或解密 `credentialSubject`。
2. Access Token 仅保存在 JavaScript 模块内存中，不写入 Pinia、`localStorage` 或 `sessionStorage`。
3. 需要查看 VC 正文时，前端必须调用 `/content-access`，提供用途码并通过 `credential_data_reader` 权限检查。
4. 解密后的 VC、选择性披露证明和 SD-JWT 只存在于当前页面组件内存；离开页面或关闭对话框即清空。
5. 敏感查看、验证和披露验证仍由后端写入审计台账。前端不能绕过后端直接访问数据库或密钥。

## 本地运行

终端一：

```bash
npm start
```

终端二：

```bash
npm run frontend:dev
```

访问 `http://127.0.0.1:5173`。本地 `.env` 在迁移期可设置 `SERVE_FRONTEND=true`，因此旧界面仍可从 `4173` 访问。

## 构建与测试

```bash
npm run frontend:build
npm run frontend:test
npm test
```

生产构建输出到 `frontend/dist/`。部署时把该目录内容同步到 Nginx 静态目录，并参考 `deploy/nginx.conf.example` 配置同源反向代理。

## 生产配置要点

```dotenv
NODE_ENV=production
APP_DATA_MODE=v2
SERVE_FRONTEND=false
REQUIRE_HTTPS=true
DB_SSL=true
AUTH_LOCAL_DEV_LOGIN=false
```

生产环境不能使用本地演示登录；应由正式身份提供方签发短期访问令牌。数据库口令、JWT 密钥、KMS 主密钥和 TLS 私钥均由部署平台的 Secret/KMS 注入，不写入仓库或 Vue 构建产物。

## 迁移完成标准

- 六个页面的 V2 主流程全部通过浏览器自动化测试。
- Vue 与旧界面的核心功能对齐，且敏感数据保护测试通过。
- 生产使用 `SERVE_FRONTEND=false`，Nginx 只暴露 Vue 静态资源与 `/api`。
- 完成演示文档和汇报材料更新后，才删除旧 `public/`。
