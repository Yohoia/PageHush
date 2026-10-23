import { Type, type Static } from 'typebox';

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

export const createTopicBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 60 }),
});

export const updateTopicBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 60 }),
});

export const createTagBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 40 }),
});

export const updateTagBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 40 }),
});

// ---------------------------------------------------------------------------
// Article request bodies
// ---------------------------------------------------------------------------

export const articleStatusSchema = Type.Union([Type.Literal('draft'), Type.Literal('published')]);
export const articleFormatSchema = Type.Union([Type.Literal('md'), Type.Literal('mdx')]);
export const articleLanguageSchema = Type.Union([Type.Literal('zh'), Type.Literal('en')]);

export type ArticleFormat = Static<typeof articleFormatSchema>;
export type ArticleLanguage = Static<typeof articleLanguageSchema>;
export type ArticleStatus = Static<typeof articleStatusSchema>;

export const articleClipTypeSchema = Type.Union([
  Type.Literal('article'),
  Type.Literal('selection'),
  Type.Literal('bookmark'),
  Type.Literal('screenshot'),
  Type.Literal('simplified'),
  Type.Literal('full_page'),
  Type.Literal('pdf'),
  Type.Literal('email'),
  Type.Null(),
]);
export type ArticleClipType = Static<typeof articleClipTypeSchema>;

const articleSourceSchema = Type.Object({
  sourceUrl: Type.Optional(Type.Union([Type.String({ maxLength: 2048 }), Type.Null()])),
  sourceSiteName: Type.Optional(Type.Union([Type.String({ maxLength: 120 }), Type.Null()])),
  sourceSiteIconUrl: Type.Optional(Type.Union([Type.String({ maxLength: 1000 }), Type.Null()])),
  sourcePublishedAt: Type.Optional(Type.Union([Type.String({ maxLength: 40 }), Type.Null()])),
  clipType: Type.Optional(articleClipTypeSchema),
  wordCount: Type.Optional(
    Type.Union([Type.Integer({ minimum: 0, maximum: 1_000_000 }), Type.Null()]),
  ),
  readingTimeMinutes: Type.Optional(
    Type.Union([Type.Integer({ minimum: 0, maximum: 10_000 }), Type.Null()]),
  ),
  sourceChecksum: Type.Optional(
    Type.Union([Type.String({ minLength: 64, maxLength: 64 }), Type.Null()]),
  ),
});

export const createArticleBodySchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 200 }),
  slug: Type.Optional(Type.String({ maxLength: 100 })),
  description: Type.Optional(Type.String({ maxLength: 500 })),
  content: Type.Optional(Type.String()),
  format: Type.Optional(articleFormatSchema),
  status: Type.Optional(articleStatusSchema),
  language: Type.Optional(articleLanguageSchema),
  author: Type.Optional(Type.Union([Type.String({ maxLength: 80 }), Type.Null()])),
  publishedAt: Type.Optional(Type.String({ maxLength: 40 })),
  updatedAt: Type.Optional(Type.Union([Type.String({ maxLength: 40 }), Type.Null()])),
  topicId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  topicName: Type.Optional(Type.String({ maxLength: 60 })),
  coverAssetId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  cover: Type.Optional(Type.Union([Type.String({ maxLength: 1000 }), Type.Null()])),
  coverAlt: Type.Optional(Type.Union([Type.String({ maxLength: 300 }), Type.Null()])),
  tagNames: Type.Optional(Type.Array(Type.String({ maxLength: 40 }), { maxItems: 10 })),
  ...articleSourceSchema.properties,
});

export const updateArticleBodySchema = Type.Object({
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  slug: Type.Optional(Type.String({ maxLength: 100 })),
  description: Type.Optional(Type.String({ maxLength: 500 })),
  content: Type.Optional(Type.String()),
  format: Type.Optional(articleFormatSchema),
  status: Type.Optional(articleStatusSchema),
  language: Type.Optional(articleLanguageSchema),
  author: Type.Optional(Type.Union([Type.String({ maxLength: 80 }), Type.Null()])),
  publishedAt: Type.Optional(Type.String({ maxLength: 40 })),
  updatedAt: Type.Optional(Type.Union([Type.String({ maxLength: 40 }), Type.Null()])),
  topicId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  topicName: Type.Optional(Type.String({ maxLength: 60 })),
  coverAssetId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  cover: Type.Optional(Type.Union([Type.String({ maxLength: 1000 }), Type.Null()])),
  coverAlt: Type.Optional(Type.Union([Type.String({ maxLength: 300 }), Type.Null()])),
  tagNames: Type.Optional(Type.Array(Type.String({ maxLength: 40 }), { maxItems: 10 })),
  ...articleSourceSchema.properties,
});

export type CreateArticleBody = Static<typeof createArticleBodySchema>;
export type UpdateArticleBody = Static<typeof updateArticleBodySchema>;

// ---------------------------------------------------------------------------
// Article responses
// ---------------------------------------------------------------------------

const nullableString = () => Type.Union([Type.String(), Type.Null()]);
const nullableInteger = () => Type.Union([Type.Integer(), Type.Null()]);
const isoDateTime = () => Type.String({ format: 'date-time' });
const nullableDateTime = () => Type.Union([isoDateTime(), Type.Null()]);

export const articleResponseSchema = Type.Object({
  id: Type.String(),
  shortId: nullableString(),
  revision: Type.String(),
  firstPublishedAt: nullableDateTime(),
  slug: Type.String(),
  title: Type.String(),
  description: Type.String(),
  content: Type.String(),
  format: articleFormatSchema,
  status: articleStatusSchema,
  language: articleLanguageSchema,
  author: nullableString(),
  sourceUrl: nullableString(),
  sourceSiteName: nullableString(),
  sourceSiteIconUrl: nullableString(),
  sourcePublishedAt: nullableDateTime(),
  clipType: articleClipTypeSchema,
  wordCount: nullableInteger(),
  readingTimeMinutes: nullableInteger(),
  sourceChecksum: nullableString(),
  topic: nullableString(),
  topicId: nullableString(),
  tags: Type.Array(Type.String()),
  cover: nullableString(),
  coverAssetId: nullableString(),
  coverAlt: nullableString(),
  publishedAt: isoDateTime(),
  updatedAt: nullableDateTime(),
  recordCreatedAt: isoDateTime(),
  recordUpdatedAt: isoDateTime(),
});
export type ArticleResponse = Static<typeof articleResponseSchema>;

/** List responses omit the body; only the detail endpoint guarantees content. */
export const articleListItemResponseSchema = Type.Object({
  ...Type.Omit(articleResponseSchema, ['content', 'readingTimeMinutes']).properties,
  content: Type.Optional(Type.String()),
  readingTimeMinutes: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
});
export type ArticleListItemResponse = Static<typeof articleListItemResponseSchema>;

// ---------------------------------------------------------------------------
// Taxonomy / asset responses
// ---------------------------------------------------------------------------

export const topicResponseSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  createdAt: isoDateTime(),
  updatedAt: isoDateTime(),
  archivedAt: Type.Optional(nullableDateTime()),
  articleCount: Type.Optional(Type.Integer()),
});
export type TopicResponse = Static<typeof topicResponseSchema>;

export const tagResponseSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  createdAt: isoDateTime(),
  updatedAt: isoDateTime(),
  articleCount: Type.Optional(Type.Integer()),
});
export type TagResponse = Static<typeof tagResponseSchema>;

export const assetResponseSchema = Type.Object({
  id: Type.String(),
  objectKey: Type.String(),
  originalName: nullableString(),
  mimeType: Type.String(),
  size: Type.Integer(),
  checksum: Type.String(),
  kind: Type.Union([
    Type.Literal('cover'),
    Type.Literal('inline_image'),
    Type.Literal('attachment'),
  ]),
  status: Type.Union([Type.Literal('uploading'), Type.Literal('ready'), Type.Literal('deleted')]),
  url: Type.String(),
});
export type AssetResponse = Static<typeof assetResponseSchema>;
