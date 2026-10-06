import { Type, type Static } from 'typebox';

export const API_PREFIX = '/v1';

export const healthResponseSchema = Type.Object({
  status: Type.Literal('ok'),
  service: Type.Literal('pagehush-api'),
  time: Type.String({ format: 'date-time' }),
});

export type HealthResponse = Static<typeof healthResponseSchema>;

export const articleFormats = ['md', 'mdx'] as const;
export const articleFormatSchema = Type.Union([Type.Literal('md'), Type.Literal('mdx')]);
export type ArticleFormat = Static<typeof articleFormatSchema>;

export const articleStatuses = ['draft', 'scheduled', 'published', 'trashed'] as const;
export const articleStatusSchema = Type.Union([
  Type.Literal('draft'),
  Type.Literal('scheduled'),
  Type.Literal('published'),
  Type.Literal('trashed'),
]);
export type ArticleStatus = Static<typeof articleStatusSchema>;

export const applicationStageSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  status: Type.Union([Type.Literal('planned'), Type.Literal('in-progress'), Type.Literal('ready')]),
  description: Type.String(),
});
export type ApplicationStage = Static<typeof applicationStageSchema>;

export const applicationStageListSchema = Type.Array(applicationStageSchema);
export type ApplicationStageList = Static<typeof applicationStageListSchema>;

export const applicationStages: ApplicationStage[] = [
  {
    id: 'framework',
    title: '项目骨架',
    status: 'in-progress',
    description: 'React 工作台、Fastify API、共享契约与任务包边界。',
  },
  {
    id: 'content',
    title: '内容与编辑器',
    status: 'planned',
    description: 'Markdown / MDX 源文本、Tiptap 编辑体验与公式、代码、图表适配。',
  },
  {
    id: 'server',
    title: '服务器集成',
    status: 'planned',
    description: '连接服务器上已部署的 PostgreSQL 与 MinIO，不在本机启动服务。',
  },
  {
    id: 'publishing',
    title: '发布链路',
    status: 'planned',
    description: '不可变内容包、Astro 构建、验证与 Nginx 切换。',
  },
];
