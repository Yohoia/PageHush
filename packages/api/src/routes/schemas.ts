import { Type } from 'typebox';

export const createCategoryBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 60 }),
});

export const updateCategoryBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 60 }),
});

export const createTagBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 40 }),
});

export const updateTagBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 40 }),
});

export const createArticleBodySchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 200 }),
  slug: Type.Optional(Type.String({ maxLength: 100 })),
  excerpt: Type.Optional(Type.String({ maxLength: 500 })),
  content: Type.Optional(Type.String()),
  format: Type.Optional(Type.Union([Type.Literal('md'), Type.Literal('mdx')])),
  status: Type.Optional(
    Type.Union([
      Type.Literal('draft'),
      Type.Literal('scheduled'),
      Type.Literal('published'),
      Type.Literal('trashed'),
    ]),
  ),
  categoryId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  categoryName: Type.Optional(Type.String({ maxLength: 60 })),
  coverAssetId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  imageUrl: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  tagNames: Type.Optional(Type.Array(Type.String({ maxLength: 40 }), { maxItems: 10 })),
});

export const updateArticleBodySchema = Type.Object({
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  slug: Type.Optional(Type.String({ maxLength: 100 })),
  excerpt: Type.Optional(Type.String({ maxLength: 500 })),
  content: Type.Optional(Type.String()),
  format: Type.Optional(Type.Union([Type.Literal('md'), Type.Literal('mdx')])),
  status: Type.Optional(
    Type.Union([
      Type.Literal('draft'),
      Type.Literal('scheduled'),
      Type.Literal('published'),
      Type.Literal('trashed'),
    ]),
  ),
  categoryId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  categoryName: Type.Optional(Type.String({ maxLength: 60 })),
  coverAssetId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  imageUrl: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  tagNames: Type.Optional(Type.Array(Type.String({ maxLength: 40 }), { maxItems: 10 })),
});
