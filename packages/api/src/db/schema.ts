import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const articleStatusEnum = pgEnum('article_status', ['draft', 'published']);

export const articleLanguageEnum = pgEnum('article_language', ['zh', 'en']);

export const articleFormatEnum = pgEnum('article_format', ['md', 'mdx']);

export const articleClipTypeEnum = pgEnum('article_clip_type', [
  'article',
  'selection',
  'bookmark',
  'screenshot',
  'simplified',
  'full_page',
  'pdf',
  'email',
]);

export const assetKindEnum = pgEnum('asset_kind', ['cover', 'inline_image', 'attachment']);

export const assetStatusEnum = pgEnum('asset_status', ['uploading', 'ready', 'deleted']);

export const topics = pgTable('topics', {
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
    description: text('description').notNull().default(''),
    content: text('content').notNull().default(''),
    format: articleFormatEnum('format').notNull().default('md'),
    status: articleStatusEnum('status').notNull().default('draft'),
    language: articleLanguageEnum('language').notNull().default('zh'),
    author: text('author'),
    sourceUrl: text('source_url'),
    sourceSiteName: text('source_site_name'),
    sourceSiteIconUrl: text('source_site_icon_url'),
    sourcePublishedAt: timestamp('source_published_at', { withTimezone: true }),
    clipType: articleClipTypeEnum('clip_type'),
    wordCount: integer('word_count'),
    readingTimeMinutes: integer('reading_time_minutes'),
    sourceChecksum: text('source_checksum'),
    topicId: uuid('topic_id').references(() => topics.id, {
      onDelete: 'set null',
    }),
    coverAssetId: uuid('cover_asset_id').references(() => assets.id, {
      onDelete: 'set null',
    }),
    coverUrl: text('cover_url'),
    coverAlt: text('cover_alt'),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    recordCreatedAt: timestamp('record_created_at', { withTimezone: true }).notNull().defaultNow(),
    recordUpdatedAt: timestamp('record_updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('articles_status_idx').on(table.status),
    index('articles_topic_id_idx').on(table.topicId),
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
  topic: one(topics, {
    fields: [articles.topicId],
    references: [topics.id],
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
