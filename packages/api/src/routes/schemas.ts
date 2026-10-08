import { Type } from 'typebox';

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

const articleStatusSchema = Type.Union([Type.Literal('draft'), Type.Literal('published')]);
const articleFormatSchema = Type.Union([Type.Literal('md'), Type.Literal('mdx')]);
const articleLanguageSchema = Type.Union([Type.Literal('zh'), Type.Literal('en')]);

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
});
