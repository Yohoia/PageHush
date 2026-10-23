# 启用远程 CLI 并迁移文章写入保护

本文用于部署支持 Yoho CLI 远程文章管理的 PageHush 版本。CLI 需要配套的 API 和网页，文章数据继续保存在 PageHush 数据库中。以下步骤由部署人员执行。

## 协同升级 API 和网页

1. 备份数据库，并为升级安排暂停文章写入的维护窗口。
2. 通过现有部署配置注入数据库、MinIO 和作者访问码配置。
3. 设置 `PAGEHUSH_DEVICE_VERIFICATION_URI`，值为作者实际访问的网页地址，例如 `https://pagehush.yohoia.cn/device`。
4. 构建配套版本，应用数据库迁移，并一同更新 API 和网页。

```sh
npm ci
npm run build
npm run db:migrate
```

迁移 `0005_remote_article_guards` 增加文章版本、首次发布日期、操作结果和上传关联。迁移 `0006_device_authorization` 增加设备授权数据。迁移命令使用部署环境的 `DATABASE_URL`，未提供时沿用现有 Drizzle 配置读取本地环境文件的行为。

网页的修改、发布、撤回和删除请求现在都携带 `If-Match` 文章版本。旧网页缺少版本时收到 HTTP 428。更新后刷新已有浏览器页面，再恢复文章写入。版本过期时 API 返回 HTTP 409，网页保留未保存输入。

现有剪藏扩展的草稿新增继续使用原接口。设备令牌仅能使用专门的 CLI 文章端点，以及绑定文章上传的内嵌图片端点。通用文章修改、标签管理和独立素材上传均拒绝设备令牌。

## 核对设备授权网页

部署后访问 `/device`，使用现有作者登录完成设备批准或拒绝。访问 `/devices` 查看已授权设备并撤销授权。

`PAGEHUSH_DEVICE_VERIFICATION_URI` 是 API 返回给 CLI 的固定网址，默认值为 `https://pagehush.yohoia.cn/device`。自行托管时将它改成自己的网页地址。API 不根据请求的 Host 头生成批准网址。配置值必须是完整 HTTP 或 HTTPS URL，不含用户名、密码、查询参数或片段。

然后安装配套版本的 Yoho CLI，执行 `yoho auth login`。终端显示设备码与批准网址，并尝试打开浏览器。默认授权有效 30 天，到期重新登录。CLI 把令牌保存在系统凭据存储中，非交互调用也可使用环境变量令牌。

## 处理超时和中断的文章上传

CLI 为新增、发布和删除生成请求编号。恢复同一次操作时复用原编号，通过 `yoho blog operation <request-id>` 查询结果。新增上传还可用 `yoho blog resume <request-id> <原文档路径>` 恢复，文档与图片指纹必须与本地操作记录一致。

服务器至少保留七天的可查询结果。同编号、相同参数的重放返回原结果。同编号携带不同内容或目标返回冲突。过期编号保留不可再次执行的记录，不能用作新请求；结果未知或过期时人工核对文章。

PageHush 当前只有一个作者。操作记录使用服务器固定的作者身份 `pagehush:author`，不会绑定某次设备令牌。有效设备重新登录后，以及同一作者批准的其他设备，都能查询和恢复该作者的原操作。每次请求仍需有效设备授权。未来增加多作者时，需要将这个固定身份迁移为实际作者身份。

## 保持图片回收与操作恢复一致

API 启动时及之后每小时尝试回收一次 CLI 上传遗留素材。只有上传已超过七天、所属操作已过期，且没有任何文章引用的素材才会进入回收。草稿、已发布文章和软删除文章的引用都受保护。正文引用、封面素材 ID 和封面地址均参与检查。

回收先持久化素材不可引用的状态，再删除 MinIO 对象，最后记录删除完成。对象删除失败时保留可重试记录。文章提交和回收使用同一素材行锁协调，因此不能成功提交对已回收素材的引用。旧的普通上传清理任务排除 CLI 素材，不会缩短七天恢复期限。

CLI 上传继续使用稳定的 `/v1/assets/<id>/content` 地址。现有博客按已发布且未删除的文章引用代理图片，不依赖发布快照或 `public_object_key`。草稿图片不会因 CLI 上传而自动公开。

## 核对历史文章日期

迁移保留现有 `published_at`。当前状态为已发布的历史文章将此日期回填到 `first_published_at`，包括软删除的已发布文章。

旧数据库没有记录已撤回草稿的首次发布历史。迁移无法判断草稿是否曾发布，也无法还原其真实首次发布日期。这些草稿下一次发布时按首次发布处理，由服务器记录当前日期。

CLI 和网页首次发布草稿时清除草稿遗留的 `updated_at`。网页本次显式提交且不早于新发布日期的更新时间仍可保留。已发布文章的 CLI 重复发布返回 `changed=false`，保留原日期和文章版本。原通用新增接口仍允许合法的历史发布日期与更新时间，用于已有导入流程。

## 在隔离环境中验收

真实并发测试需要独立临时 PostgreSQL，PGlite 只能验证部分协议。先启动仅监听本机的临时 PostgreSQL，再创建专用测试数据库。下面示例使用端口 55432，连接角色沿用本机 PostgreSQL 默认角色。

```sh
createdb --host=127.0.0.1 --port=55432 yoho_test
PAGEHUSH_TEST_DATABASE_URL='postgresql://127.0.0.1:55432/yoho_test' PAGEHUSH_API_LOG_LEVEL=silent npm test -- packages/api/src/cli-articles.postgres.test.ts packages/api/src/device-auth.postgres.test.ts
```

测试支持仅接受本机地址且数据库名以 `yoho_test` 开头的显式连接。每项测试创建独立 schema，并在结束时删除。测试使用真实 HTTP、多个 PostgreSQL 连接和隔离的 FakeStorage，覆盖请求去重、网页与 CLI 版本竞争、素材提交与回收竞争及设备授权竞争。结束后停止临时 PostgreSQL。

网页设备批准、设备撤销和编辑冲突可用下面的隔离测试检查。

```sh
npx playwright test -c playwright.remote.config.ts
```

该配置启动临时 API、PGlite、FakeStorage 与网页，不读取生产环境文件。安装后的 CLI 完整操作链路由 Yoho CLI 仓库的远程测试验收。隔离测试通过后，再按部署环境核对版本与配置。
