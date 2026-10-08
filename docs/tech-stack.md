# 页息 PageHush · 技术栈方案

2026-10-06 制定，2026-10-08 更新。用户确定采用 Tiptap 开源版和 MinIO 社区版，并取消登录需求。样式采用 Tailwind CSS，与现有博客保持一致；代码高亮统一 Shiki。基础框架和前端工作台已实现，类型检查、Lint、单元测试、生产构建与 Playwright 浏览器测试均通过；数据库、MinIO、MDX 保真和云端发布仍未完成集成测试。

## 1. 技术栈与版本

| 层                 | 方案                                                                    | 版本基线                                                                                             |
| ------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 运行环境           | Node.js LTS + npm                                                       | Node 24.21.0；npm 11.19.0                                                                            |
| 工作台前端         | React + TypeScript + Vite                                               | React / React DOM 19.3.0；TypeScript 6.0.3；Vite 8.3.3；React 插件 6.1.2                             |
| 页面路由           | React Router，SPA 模式                                                  | 8.4.0                                                                                                |
| 页面样式           | Tailwind CSS + CSS 设计变量，正文按需局部 CSS                           | tailwindcss / @tailwindcss/vite 统一 4.3.3，与现有博客一致                                           |
| 图标               | 应用外壳使用 Lucide React；编辑器使用 Tiptap UI Components 官方源码图标 | lucide-react 1.48.0；Simple Editor 官方图标随模板源码进入项目                                        |
| 界面动画           | Motion，React 绑定                                                      | motion 14.0.0；页面切换与状态变化使用声明式动画，并尊重用户减少动态效果设置                          |
| 字体分发           | Simple Editor 官方字体：Inter 与 DM Sans                                | 由官方模板 CSS 引入 Google Fonts；这是 2026-10-06 的执行决策                                         |
| 编辑器             | Tiptap 开源核心、React 绑定、StarterKit、Markdown 与所需扩展            | 所有直接使用的 `@tiptap/*` 统一 3.31.4                                                               |
| 编辑器 UI          | Tiptap UI Components 官方 Simple Editor 模板                            | MIT 源码通过 `@tiptap/cli` 3.19.4 复制进项目，可自由修改                                             |
| 编辑区代码高亮     | Tiptap CodeBlock 扩展接入 Shiki                                         | CodeBlock 3.31.4；Shiki 4.4.3，与预览、博客共用主题和语言配置；适配待实现                            |
| 管理 API           | Fastify + TypeScript                                                    | Fastify 5.12.5；TypeScript 6.0.3                                                                     |
| 接口契约           | TypeBox + Fastify Type Provider                                         | `typebox` 1.3.36；`@fastify/type-provider-typebox` 6.1.0                                             |
| 使用方式           | 单人工作台，直接进入编辑器                                              | 无登录、注册、用户表、会话、密码哈希依赖                                                             |
| API 配套           | 请求限流、响应头；跨域仅按需要启用                                      | rate-limit 11.2.0；helmet 13.1.1；cors 11.3.0                                                        |
| 数据库             | PostgreSQL                                                              | 18.6；已有受支持的 17 可另行复用                                                                     |
| 数据访问           | Drizzle ORM + pg + SQL 迁移                                             | drizzle-orm 0.45.3；drizzle-kit 0.31.11；pg 8.23.1                                                   |
| 对象存储           | MinIO 社区版，Docker 部署                                               | 产品已定；镜像标签与 digest 尚未确认                                                                 |
| 存储接口           | AWS SDK v3 的 S3 客户端与签名模块                                       | 两个模块统一 3.1146.0                                                                                |
| 普通内容预览       | unified / remark / rehype                                               | unified 11.0.5；remark-parse 11.0.0；remark-gfm 4.0.1；remark-rehype 11.1.2；rehype-stringify 10.0.1 |
| 数学公式           | Tiptap Mathematics + remark-math / rehype-katex / KaTeX                 | Tiptap 3.31.4；remark-math 6.0.0；rehype-katex 7.0.1；KaTeX 0.16.47                                  |
| 预览与博客代码渲染 | Shiki，与编辑器共用配置                                                 | 4.4.3；github-light / github-dark                                                                    |
| 图表               | Mermaid                                                                 | 12.1.0；需补充编辑器与博客集成                                                                       |
| 博客与 MDX         | 沿用现有 Astro 项目                                                     | Astro 7.3.5；@astrojs/mdx 8.0.2；@astrojs/react 7.0.0；@mdx-js/mdx 3.1.1                             |
| 后台任务           | 独立 Node worker + PostgreSQL 任务表                                    | 共用 Node / 数据库版本                                                                               |
| 部署               | 阿里云 ECS、Docker Engine、Compose、Nginx、HTTPS                        | Engine 29.8.2；Compose 5.6.0；Nginx 1.30.5；实际部署时核对服务器环境                                 |
| 开发检查           | ESLint + typescript-eslint + Prettier                                   | 10.12.0；8.71.1；3.9.9                                                                               |
| 测试工具           | Vitest + Playwright，按实现需要使用                                     | 5.0.3；1.63.0                                                                                        |

首版使用 npm workspaces 管理 web、api、worker 与共享契约；浏览器状态使用 React hooks，接口请求使用 fetch。图片与媒体通过平台接口接入 MinIO，正文与资源引用记录在 PostgreSQL。Astro 保持静态构建，从固定发布内容包读取文章。

按用户要求取消工作台账号系统；存储访问密钥和发布凭据仍保存在服务端，属于服务连接配置。工作台与管理接口的访问入口在部署阶段确定，博客继续独立公开。

UnoCSS 也可实现既定样式，但当前方案优先采用博客已有的 Tailwind CSS，不同时配置两套原子 CSS 引擎。见[Tailwind Vite 集成](https://tailwindcss.com/docs/installation/using-vite)。

统一 Shiki 是统一高亮引擎、版本、主题和语言规则：博客在构建时生成高亮 HTML，编辑器则将 Shiki 的 tokens 应用为可编辑代码块的装饰。具体接入基于 Tiptap CodeBlock 扩展，不直接将高亮 HTML 替换进编辑正文，以保持光标、输入与撤销行为。Shiki 提供 token 输出并支持浏览器运行，见[官方用法](https://shiki.style/guide/install)和[介绍](https://shiki.style/guide/)。该编辑器适配属于后续实现，不能当成已完成能力。

## 2. 版本兼容性结论

- Tiptap 3.31.4 的 React 绑定声明支持 React 19，核心和扩展依赖同版本，因此不混用 Tiptap 2 / 3 或不同补丁版本。
- Node 24.21.0 满足所选 Vite、路由、SDK、Mermaid 与测试工具的运行环境声明。Node 24 为 LTS，见[官方发布说明](https://nodejs.org/en/blog/release/v24.21.0)。
- TypeScript 保持 6.0.3：所选 typescript-eslint 的声明支持范围为 `>=4.8.4 <6.1.0`，不采用 TypeScript 7。见[官方依赖兼容说明](https://typescript-eslint.io/users/dependency-versions/)。
- KaTeX 保持博客当前的 0.16.47：Tiptap 公式扩展的 peer 范围包含 0.16，不包含当前最新 0.19。
- Fastify Type Provider 6.1.0 配套的是 `typebox` 1.x，不与旧的 `@sinclair/typebox` 0.34 混用。官方兼容表支持 Fastify 5，见[官方仓库](https://github.com/fastify/fastify-type-provider-typebox)。
- Drizzle 声明支持 pg 8；实际数据库连接、迁移与事务验收属于后续实现。PostgreSQL 18.6 为当前受支持的补丁版本，见[官方版本表](https://www.postgresql.org/support/versioning/)。
- Tiptap 的 Markdown 扩展仍标为 Beta；MDX、图注、Mermaid 和源码保留需要适配，属于功能实现问题，不能以依赖版本兼容代替验收。见[官方 Markdown 文档](https://tiptap.dev/docs/editor/markdown)。
- MinIO 产品选择保持社区版；公开镜像查询尚未核实成功，因此不写死未经证实的标签。Docker 容器尚未拉取或运行。

所有正式依赖使用固定版本并由 package-lock.json 固定完整依赖树。此处为技术方案，不是已经安装或上线的状态说明。

## 3. 图标与字体

2026-10-06 起，编辑器 UI 采用 Tiptap 官方 [Simple Editor](https://tiptap.dev/docs/ui-components/templates/simple-editor) 模板。模板通过 `@tiptap/cli` 以源码方式复制进 `packages/web/src/components/`，因此官方 Toolbar、Popover、Dropdown、Button 与图标都可以按 PageHush 需要直接修改。

编辑器图标来自 Simple Editor 的 `tiptap-icons` 源码；应用外壳的导航与状态图标仍使用 `lucide-react 1.48.0`。

官方 Simple Editor 字体使用：

- UI：`Inter`
- 编辑正文：`DM Sans`

字体由官方模板的 `simple-editor.scss` 引入 Google Fonts。该选择优先保持 Tiptap 官方模板的执行效果；部署到阿里云或启用严格 CSP 时，需要验证 Google Fonts 的可达性、缓存策略与加载速度，再决定是否改为自托管同名字体文件。此前《PageHush 字体执行规范》中的衬线正文方案保留为纸面品牌研究记录，当前编辑器以官方模板字体为准。

## 4. 基础框架落地记录

2026-10-06 已创建 npm workspaces：

- `packages/web`：React 19 SPA、Logo、React Router、Tiptap Markdown、官方 Simple Editor UI、Motion 与 Tailwind。
- `packages/api`：Fastify 健康检查与阶段契约，包含未来远程 PostgreSQL / MinIO 访问依赖。
- `packages/worker`：任务 worker 配置占位，默认禁用，不启动任务循环。
- `packages/shared`：TypeBox 契约、文章格式与状态枚举。

本阶段没有 Docker Compose、本地 PostgreSQL、本地 MinIO、数据库迁移或发布任务。`DATABASE_URL` 与 MinIO 参数只作为未来连接服务器实例的配置占位。

`drizzle-kit` 暂未安装：数据库模型与 SQL 迁移开始前引入工具更合适，也避免当前把带已知开发依赖风险的未用工具放进基础骨架。`drizzle-orm` 已按版本基线保留。当前锁定版本下 npm audit 报告 KaTeX 相关链路 5 个低危提示；KaTeX 0.16.47 是与博客和 Tiptap Mathematics 兼容的既定基线，接入不受信公式内容前需要再评估并补充安全验收。

## 5. 2026-10-08 界面与测试进展

- Web 工作台已实现首页文章画廊、分类筛选、文章详情编辑、标题与封面占位。
- Tiptap 官方 Simple Editor 源码已接入正式编辑器，并按 PageHush 页面布局拆出 `EditorLayout`。
- 前端已使用 React Router、Motion、Tailwind CSS 与局部 SCSS/CSS 设计变量。
- 测试体系包含 Vitest 单元测试、Playwright E2E、ESLint、Prettier、TypeScript 与生产构建检查。
- E2E 已覆盖首页画廊、编辑器元信息、分类选择、标签添加、全屏写作、封面占位与本地图片预览。
- 封面上传已通过 Fastify 写入 MinIO 并在 PostgreSQL 登记 `assets`；响应式资源生成与发布快照仍未实现。
