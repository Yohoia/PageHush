# 页息 PageHush · 个人博客文章工作台

页息是为 Yohoia 的 Astro 个人博客制作的 Markdown / MDX 写作、文章管理与发布平台。首版面向一个作者、一个博客，没有登录和账号模块。

当前状态：

- 已搭建 npm workspaces 基础框架：`web`、`api`、`worker`、`shared`。
- React 工作台已接入 Logo、中文品牌字、React Router、Motion、Tailwind CSS，以及 Tiptap 官方 Simple Editor 模板、官方 Toolbar 和官方图标。
- Fastify API 骨架提供 `/v1/health` 与 `/v1/stages`，尚未连接业务数据。
- 首页已按用户提供的《PageHush-articles-design-v1.html》改为四列文章画廊，支持分类筛选、动态计数、状态与标签展示、卡片动画和滚动后新建文章入口；当前数据来自 `packages/web/src/data/articles.ts`。
- 本阶段不在本机启动 PostgreSQL、MinIO、Docker 或发布任务；后续直接连接服务器上已部署的 PostgreSQL 与 MinIO。
- Markdown / MDX 源文本仍是未来内容保存的唯一真源；Tiptap 状态与 HTML 只能作为派生数据。
- 编辑器当前使用官方 Simple Editor 的 Inter / DM Sans 字体；应用外壳仍保持轻量纸面视觉。
- 全站页面使用双层宽度体系：写作主内容 760px，全站安全区 1400px；首页文章卡片区使用安全区内宽度，桌面四列、平板两列、手机一列。

## 文档

- [项目规划](docs/project-plan.md)
- [技术栈方案](docs/tech-stack.md)
- [编辑器选型](docs/editor-options.md)
- [自建对象存储方案](docs/self-hosted-storage.md)
- [第一版设计原型](design/writing/solo.html)

## 本地开发

```bash
npm install
npm run dev:web
```

Web 默认地址：`http://127.0.0.1:5173`。

如需临时检查 API 骨架：

```bash
npm run dev:api
```

API 默认地址：`http://127.0.0.1:8787`，健康检查为 `/v1/health`。当前业务模块尚未实现；数据库与对象存储配置等待服务器实例信息。

## 常用命令

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run check
npm run format:check
```

## 结构

| 路径              | 职责                                                   |
| ----------------- | ------------------------------------------------------ |
| `packages/web`    | React SPA、页息界面、官方 Simple Editor 与未来内容预览 |
| `packages/api`    | Fastify 管理 API、服务器资源适配与发布接口             |
| `packages/worker` | 未来预览、构建与发布任务 worker                        |
| `packages/shared` | API 契约、领域枚举与跨端共享类型                       |
| `design/writing`  | 已确定的纸面写作视觉与交互原型                         |
| `logo`            | 原始 Logo 资产                                         |
| `docs`            | 功能范围、技术选型与实施约束                           |

## Logo 资产

原始文件保留在 `logo/`，当前 Web 构建使用：

- `logo-128.png`：左侧主标，来自 `logo/logo.png`
- `chinese-logo.png`：已裁切透明留白的中文品牌字，位于主标右侧
- `favicon-128.png`：浏览器图标，裁切自 `logo/favicon.png`

英文品牌字保留在 `logo/englishlogo.png`，待品牌页或展示场景需要时再生成对应尺寸。

## 服务器依赖边界

`.env.example` 只保留连接示例，不提交真实凭据。PostgreSQL、MinIO、Astro 构建任务和 Nginx 发布切换都在服务器部署；本地开发框架不内置容器编排，也不默认启动后台任务。
