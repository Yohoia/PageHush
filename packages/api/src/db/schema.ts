import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const articleStatusEnum = pgEnum('article_status', [
  'draft',
  'scheduled',
  'published',
  'trashed',
]);

export const articleFormatEnum = pgEnum('article_format', ['md', 'mdx']);

export const assetKindEnum = pgEnum('asset_kind', ['cover', 'inline_image', 'attachment']);

export const assetStatusEnum = pgEnum('asset_status', ['uploading', 'ready', 'deleted']);

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
});

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    userAgent: text('user_agent'),
  },
  (table) => [index('auth_sessions_expires_at_idx').on(table.expiresAt)],
);

export const authSessionRelations = relations(authSessions, ({ one }) => ({
  article: one(articles, {
    fields: [authSessions.id],
    references: [articles.id],
  }),
}));

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    objectKey: text('object_key').notNull().unique(),
    publicObjectKey: text('public_object_key'),
    originalName: text('original_name'),
    mimeType: text('mime_type').notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    checksum: text('checksum').notNull(),
    width: integer('width'),
    height: integer('height'),
    kind: assetKindEnum('kind').notNull().default('inline_image'),
    status: assetStatusEnum('status').notNull().default('uploading'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('assets_status_idx').on(table.status)],
);

export const articles = pgTable(
  'articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    excerpt: text('excerpt').notNull().default(''),
    content: text('content').notNull().default(''),
    format: articleFormatEnum('format').notNull().default('md'),
    status: articleStatusEnum('status').notNull().default('draft'),
    categoryId: uuid('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    coverAssetId: uuid('cover_asset_id').references(() => assets.id, {
      onDelete: 'set null',
    }),
    imageUrl: text('image_url'),
    hasUnpublishedChanges: boolean('has_unpublished_changes').notNull().default(true),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('articles_status_idx').on(table.status),
    index('articles_category_id_idx').on(table.categoryId),
    index('articles_published_at_idx').on(table.publishedAt),
  ],
);

export const articleTags = pgTable(
  'article_tags',
  {
    articleId: uuid('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.articleId, table.tagId] }),
    index('article_tags_tag_id_idx').on(table.tagId),
  ],
);

export const articleRelations = relations(articles, ({ one, many }) => ({
  category: one(categories, {
    fields: [articles.categoryId],
    references: [categories.id],
  }),
  coverAsset: one(assets, {
    fields: [articles.coverAssetId],
    references: [assets.id],
  }),
  tags: many(articleTags),
}));

export const articleTagRelations = relations(articleTags, ({ one }) => ({
  article: one(articles, {
    fields: [articleTags.articleId],
    references: [articles.id],
  }),
  tag: one(tags, {
    fields: [articleTags.tagId],
    references: [tags.id],
  }),
}));

export const databaseName = sql`current_database()`;
