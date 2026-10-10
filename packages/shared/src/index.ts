import { Type, type Static } from 'typebox';

export { articleShortId, articleIdFromShortId } from './article-address.js';
export { countReadingUnits, estimateReadingTimeMinutes } from './reading-time.js';
export {
  authSessionResponseSchema,
  authLoginResponseSchema,
  authExtensionLoginResponseSchema,
} from './auth.js';
export type { AuthSessionResponse, AuthLoginResponse, AuthExtensionLoginResponse } from './auth.js';
export { errorResponseSchema } from './errors.js';
export {
  articleStatusSchema,
  articleFormatSchema,
  articleLanguageSchema,
  articleClipTypeSchema,
  createArticleBodySchema,
  updateArticleBodySchema,
  articleResponseSchema,
  articleListItemResponseSchema,
  topicResponseSchema,
  createTopicBodySchema,
  updateTopicBodySchema,
  tagResponseSchema,
  createTagBodySchema,
  updateTagBodySchema,
  assetResponseSchema,
} from './articles.js';
export type {
  ArticleFormat,
  ArticleLanguage,
  ArticleStatus,
  ArticleClipType,
  CreateArticleBody,
  UpdateArticleBody,
  ArticleResponse,
  ArticleListItemResponse,
  TopicResponse,
  TagResponse,
  AssetResponse,
} from './articles.js';

export const API_PREFIX = '/v1';

export const healthResponseSchema = Type.Object({
  status: Type.Literal('ok'),
  service: Type.Literal('pagehush-api'),
  time: Type.String({ format: 'date-time' }),
});

export type HealthResponse = Static<typeof healthResponseSchema>;

export const articleFormats = ['md', 'mdx'] as const;
export const articleLanguages = ['zh', 'en'] as const;
export const articleStatuses = ['draft', 'published'] as const;

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
    status: 'ready',
    description: 'React 工作台、Fastify API、共享契约与任务包边界。',
  },
  {
    id: 'content',
    title: '内容与编辑器',
    status: 'in-progress',
    description: 'Markdown / MDX 源文本、Tiptap 编辑体验与公式、代码、图表适配。',
  },
  {
    id: 'server',
    title: '服务器集成',
    status: 'in-progress',
    description: 'PostgreSQL 与 MinIO 已接入，继续完善数据模型、素材库与部署。',
  },
  {
    id: 'publishing',
    title: '发布链路',
    status: 'planned',
    description: '不可变内容包、Astro 构建、验证与 Nginx 切换。',
  },
];
