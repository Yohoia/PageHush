# 页息 PageHush · 编辑器方案讨论

2026-10-06。用户已确定：**使用 Tiptap 开源版搭建 Markdown 编辑器**；对象存储采用 MinIO 社区版。版本核对与隔离验证见[技术基线](tech-stack.md)，真实文章及 MDX 的完整验收尚未完成。以下其他库比较作为选型留档。

## 1. 已确定方案与选型留档

当前方案为 Tiptap 开源版，不使用 Pro / Cloud 作为首版前提。Markdown / MDX 源文本、公式、代码、Mermaid、图注和组件保留要求继续有效。下面记录此前比较，不代表仍待选择其他编辑器。

优先评估 **CodeMirror 6 + 按需快速预览 + Astro 博客预览**。这是针对本项目需要完整保留 MDX 的建议，不是用户已经作出的决定。

CodeMirror 提供成熟的文本编辑基础，正文直接保存 Markdown / MDX 文本，不需要先转换为富文本再导出。代价是图片插入、公式和图表预览、组件参数提示等产品功能仍需集成；它不是开箱即用的 Typora。

如果用户更重视直接编辑排版后的正文，优先评估 **MDXEditor**。它提供 JSX 组件描述、属性编辑和源码入口，但必须先验证现有博客的内容能否可靠往返。不能因为名称包含 MDX 就假定支持所有 MDX 写法，也不能把 React 中的编辑占位当作 Astro 组件的正式效果。

用户补充曾使用 Tiptap 后，将 **Tiptap 纳入重点候选，与 MDXEditor 比较可视化写作路线**。Tiptap 适合高度定制的纸面编辑界面和结构化内容块；它的 Markdown 扩展目前在官方文档中标为 Beta，任意 MDX 保真仍需单独解决。详细评估见第 7 节。以上均为候选建议，没有替用户选定编辑器。

## 2. 候选比较

下表的适配工作是本项目判断，不能视为已经实现或测试通过。

| 方案 | 已提供的基础 | 本项目需要补足 | 取舍 |
| --- | --- | --- | --- |
| CodeMirror 6 | 文本编辑、Markdown 语言支持、代码块语言配置；见[官方 Markdown 包说明](https://github.com/codemirror/lang-markdown) | 快速预览、上传插入、组件提示、MDX 语法高亮配置；即时渲染需要额外开发 | 优先建议，直接编辑原文，便于保护未知 MDX 语法 |
| Tiptap | 可自定义 UI 的富文本框架，Markdown 双向转换扩展（Beta）、数学公式、代码高亮与 React NodeView；见[官方 Markdown 文档](https://tiptap.dev/docs/editor/markdown) | Mermaid、图注、媒体上传接入、MDX 解析/导出与原文保留；不能直接把任意 MDX 导入富文本后自动保存 | 重点候选，适合纸面可视化写作；组件编辑灵活，内容适配责任较大 |
| MDXEditor | React 富文本 Markdown 编辑器；JSX 组件、表达式编辑及源码/差异模式，见[JSX 文档](https://mdxeditor.dev/editor/docs/jsx)与[源码模式](https://mdxeditor.dev/editor/docs/diff-source) | 组件描述与编辑界面、公式、Mermaid、图注规则；测试 import/export、未知组件与模式切换 | 可视化写作的优先候选，扩展内容仍需适配 |
| Vditor | 即时渲染、所见即所得、分屏预览，含公式、Mermaid、代码高亮、图片上传入口，见[官方说明](https://github.com/Vanessa219/vditor) | 与博客渲染规则对齐、图注、MDX 保真验证；自身解析器面向 CommonMark/GFM，不能假定任意 MDX 兼容 | 普通 Markdown 功能齐全；全量 MDX 是需要先解决的门槛 |
| Milkdown | 插件化所见即所得框架，基于 ProseMirror / remark，可定制界面，见[官方说明](https://milkdown.dev/) | MDX 节点、序列化、公式/图表与组件编辑的具体集成 | 适合深度定制富文本体验；本项目的 MDX 适配工作预计更多，暂作备选 |

CodeMirror 的 GitHub 仓库注明已迁到作者维护的代码平台，见[迁移说明](https://github.com/codemirror/dev)。不能仅从 GitHub 归档标记推断项目停止维护；正式接入时核对当前包版本与兼容性。

## 3. 内容保留的要求

数据库正文保存源文本。仅打开、预览、保存而没有编辑时，不应重排或删改正文。编辑指定片段时，其他未知语法必须保留。

富文本编辑器一般需要解析再序列化。MDXEditor 官方提供 Markdown 输出格式配置，见[官方说明](https://mdxeditor.dev/)；因此“导出 Markdown”不等于“逐字保留原文”。测试需要同时检查语义、组件引用、表达式与格式变化。若模式切换会改写内容，要保留原文副本并显示差异；不支持的内容应停留在源码模式，不能打开后自动保存成降级版本。

源码型方案也不是无需验证：必须防止包装组件、自动格式化、图片插入和保存流程改写未编辑部分。MDX 高亮是否准确与文本能否保留分别验收。

## 4. 各类内容的具体方案

- **普通正文**：标题、列表、引用、表格与链接提供快捷插入，正文保留 Markdown 语法。
- **数学公式**：行内 `$...$`、块级 `$$...$$`，快速预览使用博客已有的 remark-math / KaTeX 规则。
- **代码**：保留围栏、语言和内容；编辑器、快速预览和博客统一 Shiki 4.4.3，共用主题与语言规则，分别适配编辑与静态渲染。
- **Mermaid**：保留 `mermaid` 围栏代码块，按需显示图表；语法错误提示位置，不能阻止保存原文。
- **图片说明**：alt 与可见 caption 分开。普通 Markdown 图片没有统一的 caption 语法，需要确定跨 MD/MDX 的约定并同时实现预览、导入导出和博客渲染；不能用图片 title 冒充图注。
- **MDX 组件**：提供博客组件清单和参数提示，插入引用与 JSX。已注册组件可以显示编辑占位；其他内容继续用源码编辑。组件实现保留在博客仓库。
- **完整博客预览**：使用现有 Astro 项目编译目标稿件版本，包含 `.astro` / React 组件及博客样式；快速预览先覆盖普通内容，不能声称完整还原所有组件。参见[Astro MDX 集成](https://docs.astro.build/en/guides/integrations-guide/mdx/)。

库内置的本地缓存、上传回调或预览，不代替平台的数据库保存、MinIO 媒体记录与发布版本管理。编辑器及渲染依赖随应用部署，避免写作和预览依赖公共 CDN。

## 5. 沿用纸面写作界面

页面保持当前页息原型：暖白纸面、黑色正文、舒适行宽与留白。默认单栏写作，预览和文章资料按需打开。

常用操作通过小型工具入口与快捷键提供；公式、图表、图片、组件使用插入菜单。选择源码编辑也可以使用正文衬线字体、弱化标记和隐藏行号；代码块单独使用等宽字体。源语法仍可辨认，不能通过隐藏造成光标和选区混乱。

首版不同时集成两套独立编辑器引擎，避免增加模式转换、撤销与保存状态的复杂度。是否提供 Typora 式即时渲染，应先确定用户偏好，再评估现成方案或扩展成本。

## 6. 选定前的验证

1. 导入现有机器学习概述和 KNN 文章，检查公式、代码、相对图片和元信息。
2. 另建 MDX 样例，覆盖 import/export、Astro/React 组件、嵌套 JSX、对象/数组属性、表达式和未知组件。
3. 补充 Mermaid、图注、HTML、脚注、引用链接与未闭合语法；打开、编辑、保存、重新加载、导出并比较源文本。
4. 测试中文输入法、长文章、撤销重做、粘贴图片、上传期间继续输入、切换文章，以及编辑模式切换。
5. 用真实 Astro 构建确认组件、公式、代码、图表和图注一致，不能只验收编辑器里的预览。

以上是真实内容的待执行验收项，针对已选 Tiptap 完成，不提前搭建其他编辑器。

## 7. Tiptap 的专项判断

### 适合加入，但不能直接作为已验证的 Markdown / MDX 编辑器

Tiptap 的核心不规定工具栏和页面外观，可自行组织正文排版与操作入口，适合延续页息的暖白纸面、黑色文字与留白。见[官方样式说明](https://tiptap.dev/docs/editor/getting-started/style-editor)。它是富文本编辑框架，输入 Markdown 快捷语法后转换为内容节点；这与光标所在行自动露出全部 Markdown 标记的 Typora 式即时渲染是不同的体验，后者不能当成默认能力。

官方 Markdown 扩展支持导入与导出，但当前仍标为 Beta，使用 MarkedJS 解析并在 Markdown 与 Tiptap JSON 之间转换，见[官方 Markdown 介绍](https://tiptap.dev/docs/editor/markdown)。Markdown 快捷输入、Markdown 文件导入导出、任意 MDX 保真是三个分别需要验收的能力。

### 与首版内容要求的对应

| 要求 | 接入方案与边界 |
| --- | --- |
| 公式 | 使用官方 Mathematics 扩展与 KaTeX；另验证 `$...$` / `$$...$$` 的解析、输出和博客一致性，不能只验证编辑区显示。见[公式文档](https://tiptap.dev/docs/editor/extensions/nodes/mathematics) |
| 代码 | 基于官方 CodeBlock 扩展接入 Shiki 4.4.3，与博客和快速预览统一主题、语言与别名；编辑高亮适配待实现。见[代码块扩展](https://tiptap.dev/docs/editor/extensions/nodes/code-block)与[Shiki token 接口](https://shiki.style/guide/install) |
| Mermaid | 自定义内容块或代码块视图，保存围栏源码并按需渲染图表；导入导出需单独实现与验证 |
| 图片与图注 | Image 扩展负责图片显示；MinIO 上传由平台接口实现。图注定义独立 caption 节点/字段并约定源语法，不能以 title 代替。见[图片文档](https://tiptap.dev/docs/editor/extensions/nodes/image) |
| 博客组件 | 可用 React NodeView 制作组件参数和子内容的编辑界面，见[官方 NodeView 文档](https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views/react)；它是编辑视图，不等于自动执行 MDX，也不能直接执行 `.astro` 组件 |
| MDX 原文 | import/export、JSX、表达式与嵌套组件需要适配解析、节点映射和序列化；现成 Markdown 扩展不能据此声称任意 MDX 无损 |

官方说明 Tiptap 的 schema 严格限制内容结构，未定义的内容不能自动保留，见[schema 文档](https://tiptap.dev/docs/editor/core-concepts/schema)。Markdown 使用说明也要求加载对应扩展并验证往返，见[官方基本用法](https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage)。因此未知组件与语法不能未经检查直接进入富文本并触发自动保存。

### 如果选择 Tiptap，建议的内容规则

数据库依然以 Markdown / MDX 源文本为内容真源，Tiptap JSON 只作为派生编辑状态。不能引入两份可以分别修改的持久化正文。

已注册博客组件可提供可视化参数界面；复杂表达式或未支持语法保留原文，并通过源码流程处理。支持自由 MDX 的既有要求仍保留，不因为选库而限制为少数组件。原文检测、源码入口和未编辑片段保留机制属于需要实现的工作，不是 Tiptap 内置保证。

若必须逐字保留未编辑部分，仅对整个 JSON 调用 Markdown 导出不够，需评估源位置映射/局部修改，或让不支持的文稿留在原文编辑流程。测试失败时保持原文和草稿，不用转换后的结果覆盖。

### 费用与决策

开源核心采用 MIT，官方另提供需订阅的 Pro 扩展，见[官方仓库](https://github.com/ueberdosis/tiptap)。首版计划采用开源核心及所需开源扩展；保存、历史与媒体服务由平台自己提供，不以购买 Tiptap Cloud 或 Pro 为开发前提。具体依赖版本与许可证在正式接入时核对。

当前决定：用户已选择 Tiptap 开源版。后续验证真实文章和受控 MDX 样例，围绕 Tiptap 实现所需内容适配，不以改换其他库或限制文章格式代替验收。
