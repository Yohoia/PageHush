# PageHush 服务器服务

2026-10-08。本文记录阿里云服务器上的 PostgreSQL 与 MinIO 基础设施，以及本地开发连接方式。真实地址、账号和密钥不写入仓库。

## 当前部署

服务器使用 Docker Compose 运行：

- PostgreSQL 18.6，固定镜像 digest；
- MinIO Community Edition，固定镜像 digest；
- 数据目录挂载在服务器持久化磁盘路径；
- 服务只绑定服务器 `127.0.0.1`，不对公网暴露数据库和对象存储端口。

本地端口约定：

| 服务          | 服务器绑定        | SSH 隧道本地端口  |
| ------------- | ----------------- | ----------------- |
| PostgreSQL    | `127.0.0.1:15432` | `127.0.0.1:15432` |
| MinIO API     | `127.0.0.1:19000` | `127.0.0.1:19000` |
| MinIO Console | `127.0.0.1:19001` | 仅按需建立隧道    |

服务器上的敏感配置保存在：

```text
/opt/pagehush/shared/services.env
```

该文件权限为 root/pagehush 组可读，不进入 Git 仓库。

## 发布目录与软链接策略

PageHush 和 Astro 博客一样使用 `releases/current` 发布结构，但 PageHush 分为前端和 API 两套发布目录：

```text
/var/www/pagehush/releases/YYYYMMDDHHMMSS   # 前端静态资源
/var/www/pagehush/current                   # 指向前端当前版本
/opt/pagehush/releases/YYYYMMDDHHMMSS       # API 运行文件
/opt/pagehush/current                       # 指向 API 当前版本
```

- 版本目录使用纯时间戳命名，格式为 `YYYYMMDDHHMMSS`；
- Nginx 的前端 root 使用 `/var/www/pagehush/current`；
- systemd API 服务的工作目录使用 `/opt/pagehush/current`；
- 发布时先创建新的时间戳目录，确认内容完整后原子切换 `current`；
- API 切换后重启 `pagehush-api`，前端切换后按需 reload Nginx；
- 旧版本目录保留用于快速回滚。

## 访问认证

PageHush 使用单人访问码登录，不再依赖 Nginx Basic Auth。

- 访问码不以明文存放在服务器环境变量中；
- 服务器只保存 `PAGEHUSH_ACCESS_CODE_HASH`；
- 哈希使用 scrypt、随机盐和 `timingSafeEqual` 验证；
- 登录成功后创建数据库会话；
- 浏览器只收到 HttpOnly、SameSite=Lax、HTTPS 下 Secure 的会话 Cookie；
- 勾选“信任此设备”后会话 Cookie 保留 30 天；
- 登录接口每分钟每 IP 最多尝试 10 次；
- 除健康检查、就绪检查、登录、会话查询和退出外，所有 API 都需要有效会话。

轮换访问码：

```bash
npm run auth:hash
```

将输出的哈希更新到服务器：

```text
/opt/pagehush/shared/services.env
PAGEHUSH_ACCESS_CODE_HASH=...
```

然后重启 API：

```bash
sudo systemctl restart pagehush-api
```

## 本地连接

本地 `.env` 从服务器安全配置文件复制而来，并被 Git 忽略。建立隧道：

```bash
ssh -N \
  -L 15432:127.0.0.1:15432 \
  -L 19000:127.0.0.1:19000 \
  <your-server-alias>
```

本地启动 API：

```bash
npm run dev:api
```

检查：

```bash
curl http://127.0.0.1:8787/v1/health
curl http://127.0.0.1:8787/v1/ready
```

`/v1/ready` 应返回：

```json
{
  "ready": true,
  "checks": {
    "api": "ok",
    "database": "ok",
    "storage": "ok"
  }
}
```

## 数据库结构

Drizzle schema 位于：

```text
packages/api/src/db/schema.ts
```

首批表：

- `articles`
- `topics`
- `tags`
- `article_tags`
- `assets`

迁移文件位于：

```text
packages/api/drizzle
```

常用命令：

```bash
npm run db:migrate
npm run db:seed
```

`db:seed` 会把当前演示文章、主题和标签写入 PostgreSQL。它是幂等的：重复执行会按 slug 更新文章，并重建文章标签关联。

## 对象存储

MinIO bucket：

```text
pagehush-dev-assets
```

封面和图片原件使用不可变对象键：

```text
drafts/{yyyy}/{mm}/{dd}/{assetId}/{sha256}.{ext}
```

数据库 `assets.object_key` 保存对象键，不保存会过期的签名 URL。编辑器通过 API 的资源读取端点代理访问私有对象。

上传流程：

```text
浏览器选择图片
  ↓
POST /v1/assets
  ↓
Fastify 校验类型与大小
  ↓
写入 MinIO drafts/
  ↓
插入 assets 记录
  ↓
返回 assetId 与 /v1/assets/{id}/content
```

当前允许：

- `image/jpeg`
- `image/png`
- `image/webp`
- 最大 5MB

## 备份

服务器已配置 systemd timer：

| 内容                   | 频率         | 保留  | 位置                             |
| ---------------------- | ------------ | ----- | -------------------------------- |
| PostgreSQL 逻辑备份    | 每天 03:30   | 14 天 | `/opt/pagehush/backups/postgres` |
| MinIO 数据目录压缩备份 | 每周日 04:30 | 28 天 | `/opt/pagehush/backups/minio`    |

MinIO 备份会短暂停止 MinIO 容器，完成后自动启动。当前资源量小，优先保证备份一致性；数据量增大后再改为对象级增量备份。

## 运维边界

- 不要把 PostgreSQL `5432`、MinIO `9000`、MinIO Console `9001` 直接加入公网安全组；
- 不要把 `/opt/pagehush/shared/services.env` 提交到仓库；
- 更新镜像时保持 digest 固定，先在测试环境验证；
- 备份已按上表配置，仍需定期把备份同步到服务器之外并演练恢复；
- 当前 API 已由 systemd 运行，并通过 Nginx 反代到 `127.0.0.1:8787`。
