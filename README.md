<div align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="页息 PageHush：个人博客的 Markdown / MDX 写作工作台">
</div>

# 页息 PageHush

页息是一个为个人 Astro 博客打造的写作工作台。它把文章画廊、编辑器、内容状态和未来发布链路收进同一套轻量纸面界面。首版面向一个作者、一个博客，不包含登录和账号系统。

## 界面预览

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="./assets/readme/screenshots/home.png" width="100%" alt="PageHush 首页：文章画廊、主题筛选和文章数量"><br>
      <sub>首页：四列文章画廊、主题筛选与动态计数</sub>
    </td>
    <td width="50%" valign="top">
      <img src="./assets/readme/screenshots/editor.png" width="100%" alt="PageHush 文章编辑页：主题、标题、封面、元信息和编辑器"><br>
      <sub>文章详情：主题、标题、封面与编辑器</sub>
    </td>
  </tr>
</table>

## 现在能做什么

- **文章画廊**：浏览文章封面、主题、标签与状态；支持主题筛选、动态计数和滚动后新建入口。
- **写作与编辑**：基于 Tiptap 官方 Simple Editor 编辑内容，支持主题、标签、标题、封面预览与全屏写作。
- **本地开发骨架**：npm workspaces 组织 `web`、`api`、`worker`、`shared`，并提供类型检查、Lint、单元测试和 E2E 测试脚本。
- **访问认证**：单人访问码登录、数据库会话、HttpOnly Cookie 与 API 接口保护。
- **阅读体验**：文章目录、阅读进度、返回顶部，以及封面到文章页的连续转场。

## 内容机制

Markdown / MDX 源文本是未来内容保存的唯一真源。Tiptap 的编辑器状态和 HTML 只作为派生数据；后续内容保存、预览和发布都会回到源文本与服务器端构建链路。

项目不在本地启动 PostgreSQL、MinIO、Docker 或发布任务。这些依赖计划连接到服务器上已部署的实例，本地仓库只保留清晰的边界与配置示例。

## 本地开发

```bash
npm install
npm run dev:web
```

打开 <http://127.0.0.1:5173>。

如需临时检查 API 骨架：

```bash
npm run dev:api
```

API 地址：<http://127.0.0.1:8787>，健康检查为 `/v1/health`。

浏览器测试分为两组：`npm run test:e2e` 只运行内置 Mock 的界面与交互用例；`npm run test:e2e:integration` 运行 `tests/e2e/smoke.spec.ts`，需要先在 `.env` 配置 `E2E_ACCESS_CODE`，并单独启动 `npm run dev:api`。

## 常用命令

| 命令                           | 用途                                      |
| ------------------------------ | ----------------------------------------- |
| `npm run dev:web`              | 启动 Web 开发服务器                       |
| `npm run dev:api`              | 启动 Fastify API 骨架                     |
| `npm run typecheck`            | 检查所有 workspace 类型                   |
| `npm run lint`                 | 运行 ESLint                               |
| `npm test`                     | 运行单元测试                              |
| `npm run test:e2e`             | 运行内置 Mock 的 Playwright 浏览器测试    |
| `npm run test:e2e:integration` | 运行需要本地 API 与访问码的集成浏览器测试 |
| `npm run build`                | 构建 shared、api、worker 和 web           |
| `npm run check`                | 串联类型检查、Lint、单元测试和构建        |
| `npm run format:check`         | 检查 Prettier 格式                        |

## 项目结构

| 路径              | 职责                                         |
| ----------------- | -------------------------------------------- |
| `packages/web`    | React SPA、文章画廊、Tiptap 编辑器与内容界面 |
| `packages/api`    | Fastify 管理 API、服务器资源适配与发布接口   |
| `packages/worker` | 未来预览、构建与发布任务 worker              |
| `packages/shared` | API 契约、领域枚举与跨端共享类型             |
| `tests/e2e`       | Playwright 浏览器测试与测试夹具              |
| `docs`            | 项目规划、技术选型与实施约束                 |
| `assets`          | README 图片与公开说明素材                    |

## 当前进度

| 模块       | 状态                                                  |
| ---------- | ----------------------------------------------------- |
| Web 界面   | 可运行：首页画廊、文章编辑、封面占位与全屏写作        |
| 编辑器     | 已接入 Tiptap Simple Editor 与 Markdown 扩展          |
| API        | 可运行：访问码认证与文章、主题、标签、封面接口已接入  |
| 数据持久化 | PostgreSQL 已接入，文章、主题、标签与资源记录可持久化 |
| 对象存储   | MinIO 已接入，封面可上传到私有桶并通过 API 读回       |
| 发布链路   | Astro 构建、内容包与 Nginx 切换尚未实现               |

## 设计与文档

- [项目规划](docs/project-plan.md)
- [技术栈方案](docs/tech-stack.md)
- [编辑器选型](docs/editor-options.md)
- [自建对象存储方案](docs/self-hosted-storage.md)
- [服务器服务](docs/server-services.md)

历史设计原型、走查截图和过程帧不再保存在当前工作区；需要追溯时查看对应 Git 历史提交。本地再生成的 `design/**/evidence/` 与 `design/**/vendor/` 产物由 `.gitignore` 忽略。

## 服务器依赖边界

`.env.example` 只保留连接示例，不提交真实凭据。PostgreSQL、MinIO、Astro 构建任务和 Nginx 发布切换都部署在服务器端；本地开发框架不内置容器编排，也不默认启动后台任务。
