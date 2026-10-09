import type { Database } from '../db/client.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Static } from 'typebox';
import type { PageHushFastifyInstance } from '../types/fastify.js';
import { and, desc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import { assets, articles, articleTags, tags, topics } from '../db/schema.js';
import { createArticleBodySchema, updateArticleBodySchema } from './schemas.js';
import { isUniqueConstraintError, normalizeName, slugify, uniqueSlugSuffix } from './utils.js';

type ArticleListRequest = FastifyRequest<{
  Querystring: { status?: string; topicId?: string; tagId?: string; q?: string };
}>;
type ArticleSlugRequest = FastifyRequest<{ Params: { slug: string } }>;
type CreateArticleRequest = FastifyRequest<{ Body: Static<typeof createArticleBodySchema> }>;
type UpdateArticleRequest = FastifyRequest<{
  Params: { slug: string };
  Body: Static<typeof updateArticleBodySchema>;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class ArticleValidationError extends Error {
  constructor(
    readonly code:
      | 'topic_not_found'
      | 'description_required_for_published'
      | 'slug_immutable_for_published'
      | 'invalid_published_at'
      | 'invalid_updated_at'
      | 'invalid_source_published_at'
      | 'updated_at_before_published_at',
  ) {
    super(code);
  }
}

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function parseDate(
  value: string,
  code: 'invalid_published_at' | 'invalid_updated_at' | 'invalid_source_published_at',
) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ArticleValidationError(code);
  return date;
}

type ArticleRow = typeof articles.$inferSelect;
type TagRow = { id: string; name: string };

function articleCoverUrl(row: Pick<ArticleRow, 'coverAssetId' | 'coverUrl'>) {
  return row.coverAssetId ? `/v1/assets/${row.coverAssetId}/content` : row.coverUrl;
}

function publicArticle(row: ArticleRow, topicName: string | null, tagNames: string[]) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    content: row.content,
    format: row.format,
    status: row.status,
    language: row.language,
    author: row.author,
    sourceUrl: row.sourceUrl,
    sourceSiteName: row.sourceSiteName,
    sourceSiteIconUrl: row.sourceSiteIconUrl,
    sourcePublishedAt: row.sourcePublishedAt?.toISOString() ?? null,
    clipType: row.clipType,
    wordCount: row.wordCount,
    readingTimeMinutes: row.readingTimeMinutes,
    sourceChecksum: row.sourceChecksum,
    topic: topicName,
    topicId: row.topicId,
    tags: tagNames,
    cover: articleCoverUrl(row),
    coverAssetId: row.coverAssetId,
    coverAlt: row.coverAlt,
    publishedAt: row.publishedAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
    recordCreatedAt: row.recordCreatedAt.toISOString(),
    recordUpdatedAt: row.recordUpdatedAt.toISOString(),
  };
}

function normalizeTagNames(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const name = normalizeName(value);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }

  return result;
}

async function ensureTopic(db: Database, topicId?: string | null, topicName?: string) {
  if (topicId) {
    const [topic] = await db
      .select({ id: topics.id, name: topics.name })
      .from(topics)
      .where(eq(topics.id, topicId));

    if (!topic) throw new ArticleValidationError('topic_not_found');
    return topic;
  }

  const name = normalizeName(topicName ?? '');
  if (!name) return null;

  const [existing] = await db
    .select({ id: topics.id, name: topics.name })
    .from(topics)
    .where(sql`lower(${topics.name}) = ${name.toLowerCase()}`);

  if (existing) return existing;

  const [created] = await db.insert(topics).values({ name }).returning();
  return { id: created.id, name: created.name };
}

async function ensureTag(db: Database, name: string): Promise<TagRow> {
  const normalized = normalizeName(name);
  const [existing] = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(sql`lower(${tags.name}) = ${normalized.toLowerCase()}`);

  if (existing) return existing;

  const [created] = await db.insert(tags).values({ name: normalized }).returning();
  return { id: created.id, name: created.name };
}

async function replaceArticleTags(db: Database, articleId: string, names: string[]) {
  const normalized = normalizeTagNames(names);
  const tagRows = await Promise.all(normalized.map((name) => ensureTag(db, name)));

  await db.delete(articleTags).where(eq(articleTags.articleId, articleId));
  if (tagRows.length) {
    await db.insert(articleTags).values(tagRows.map((tag) => ({ articleId, tagId: tag.id })));
  }

  return tagRows.map((tag) => tag.name).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

async function generateUniqueSlug(db: Database, desired: string, excludeId?: string) {
  let slug = slugify(desired, 'article');

  for (let suffix = 2; suffix < 100; suffix += 1) {
    const [existing] = await db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.slug, slug));

    if (!existing || existing.id === excludeId) return slug;
    slug = `${slugify(desired, 'article')}-${uniqueSlugSuffix()}`;
  }

  return `${slugify(desired, 'article')}-${Date.now()}`;
}

async function topicMapForArticles(db: Database) {
  const rows = await db.select({ id: topics.id, name: topics.name }).from(topics);
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function tagsForArticles(db: Database, articleIds: string[]) {
  const map = new Map<string, string[]>();
  if (!articleIds.length) return map;

  const rows = await db
    .select({ articleId: articleTags.articleId, name: tags.name })
    .from(articleTags)
    .innerJoin(tags, eq(tags.id, articleTags.tagId))
    .where(inArray(articleTags.articleId, articleIds));

  for (const row of rows) {
    const names = map.get(row.articleId) ?? [];
    names.push(row.name);
    map.set(row.articleId, names);
  }

  return map;
}

function articleIdentifier(value: string) {
  return isUuid(value) ? eq(articles.id, value) : eq(articles.slug, value);
}

async function topicNameForArticle(db: Database, topicId: string | null) {
  if (!topicId) return null;
  const [topic] = await db.select({ name: topics.name }).from(topics).where(eq(topics.id, topicId));
  return topic?.name ?? null;
}

function sendArticleValidationError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof ArticleValidationError)) return false;
  return reply.status(400).send({ error: error.code });
}

export async function articleRoutes(app: PageHushFastifyInstance) {
  app.get('/v1/articles', async (request: ArticleListRequest, reply) => {
    if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

    const query = request.query;
    const conditions = [isNull(articles.deletedAt)];
    if (query.status) conditions.push(eq(articles.status, query.status as ArticleRow['status']));
    if (query.topicId) conditions.push(eq(articles.topicId, query.topicId));
    if (query.q) conditions.push(ilike(articles.title, `%${query.q}%`));

    const rows = await app.database
      .select()
      .from(articles)
      .where(and(...conditions))
      .orderBy(desc(articles.recordUpdatedAt));

    let filteredRows = rows;
    if (query.tagId) {
      const taggedIds = new Set(
        (
          await app.database
            .select({ articleId: articleTags.articleId })
            .from(articleTags)
            .where(eq(articleTags.tagId, query.tagId))
        ).map((row) => row.articleId),
      );
      filteredRows = rows.filter((row) => taggedIds.has(row.id));
    }

    const topicNames = await topicMapForArticles(app.database);
    const tagNames = await tagsForArticles(
      app.database,
      filteredRows.map((row) => row.id),
    );

    return filteredRows.map((row) =>
      publicArticle(row, topicNames.get(row.topicId ?? '') ?? null, tagNames.get(row.id) ?? []),
    );
  });

  app.get('/v1/articles/:slug', async (request: ArticleSlugRequest, reply) => {
    if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

    const [row] = await app.database
      .select()
      .from(articles)
      .where(and(articleIdentifier(request.params.slug), isNull(articles.deletedAt)));

    if (!row) return reply.status(404).send({ error: 'article_not_found' });

    const tagRows = await app.database
      .select({ name: tags.name })
      .from(articleTags)
      .innerJoin(tags, eq(tags.id, articleTags.tagId))
      .where(eq(articleTags.articleId, row.id));

    return publicArticle(
      row,
      await topicNameForArticle(app.database, row.topicId),
      tagRows.map((row) => row.name).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    );
  });

  app.post(
    '/v1/articles',
    { schema: { body: createArticleBodySchema } },
    async (request: CreateArticleRequest, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

      const body = request.body;
      const title = body.title.trim();
      const description = body.description ?? '';

      if (body.status === 'published' && !description.trim()) {
        return reply.status(400).send({ error: 'description_required_for_published' });
      }

      try {
        const article = await app.database.transaction(async (tx) => {
          const topic = await ensureTopic(tx, body.topicId, body.topicName);
          const slug = await generateUniqueSlug(tx, body.slug || title);
          const publishedAt = body.publishedAt
            ? parseDate(body.publishedAt, 'invalid_published_at')
            : new Date();
          const updatedAt = body.updatedAt ? parseDate(body.updatedAt, 'invalid_updated_at') : null;
          const sourcePublishedAt = body.sourcePublishedAt
            ? parseDate(body.sourcePublishedAt, 'invalid_source_published_at')
            : null;

          if (updatedAt && updatedAt < publishedAt) {
            throw new ArticleValidationError('updated_at_before_published_at');
          }

          const [row] = await tx
            .insert(articles)
            .values({
              slug,
              title,
              description,
              content: body.content ?? '',
              format: body.format ?? 'md',
              status: body.status ?? 'draft',
              language: body.language ?? 'zh',
              author: body.author || null,
              sourceUrl: body.sourceUrl || null,
              sourceSiteName: body.sourceSiteName || null,
              sourceSiteIconUrl: body.sourceSiteIconUrl || null,
              sourcePublishedAt,
              clipType: body.clipType ?? null,
              wordCount: body.wordCount ?? null,
              readingTimeMinutes: body.readingTimeMinutes ?? null,
              sourceChecksum: body.sourceChecksum || null,
              topicId: topic?.id ?? null,
              coverAssetId: body.coverAssetId || null,
              coverUrl: body.cover || null,
              coverAlt: body.coverAlt || null,
              publishedAt,
              updatedAt,
              recordUpdatedAt: new Date(),
            })
            .returning();

          if (body.coverAssetId) {
            await tx
              .update(assets)
              .set({ kind: 'cover', updatedAt: new Date() })
              .where(eq(assets.id, body.coverAssetId));
          }

          const tagNames = await replaceArticleTags(tx, row.id, body.tagNames ?? []);
          return publicArticle(row, topic?.name ?? null, tagNames);
        });

        return reply.status(201).send(article);
      } catch (error) {
        if (sendArticleValidationError(reply, error)) return reply;
        if (isUniqueConstraintError(error)) {
          return reply.status(409).send({ error: 'slug_already_exists' });
        }
        throw error;
      }
    },
  );

  app.patch(
    '/v1/articles/:slug',
    { schema: { body: updateArticleBodySchema } },
    async (request: UpdateArticleRequest, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

      const body = request.body;
      try {
        const article = await app.database.transaction(async (tx) => {
          const [current] = await tx
            .select()
            .from(articles)
            .where(and(articleIdentifier(request.params.slug), isNull(articles.deletedAt)));

          if (!current) return null;

          if (
            body.slug !== undefined &&
            current.status === 'published' &&
            body.slug !== current.slug
          ) {
            throw new ArticleValidationError('slug_immutable_for_published');
          }

          const topic =
            body.topicId !== undefined || body.topicName !== undefined
              ? await ensureTopic(tx, body.topicId, body.topicName)
              : null;

          const nextDescription = body.description ?? current.description;
          if (body.status === 'published' && !nextDescription.trim()) {
            throw new ArticleValidationError('description_required_for_published');
          }

          const updates: Partial<ArticleRow> = { recordUpdatedAt: new Date() };
          if (body.title !== undefined) updates.title = body.title.trim();
          if (body.description !== undefined) updates.description = body.description;
          if (body.content !== undefined) updates.content = body.content;
          if (body.format !== undefined) updates.format = body.format;
          if (body.status !== undefined) updates.status = body.status;
          if (body.language !== undefined) updates.language = body.language;
          if (body.author !== undefined) updates.author = body.author || null;
          if (body.sourceUrl !== undefined) updates.sourceUrl = body.sourceUrl || null;
          if (body.sourceSiteName !== undefined) {
            updates.sourceSiteName = body.sourceSiteName || null;
          }
          if (body.sourceSiteIconUrl !== undefined) {
            updates.sourceSiteIconUrl = body.sourceSiteIconUrl || null;
          }
          if (body.sourcePublishedAt !== undefined) {
            updates.sourcePublishedAt = body.sourcePublishedAt
              ? parseDate(body.sourcePublishedAt, 'invalid_source_published_at')
              : null;
          }
          if (body.clipType !== undefined) updates.clipType = body.clipType ?? null;
          if (body.wordCount !== undefined) updates.wordCount = body.wordCount ?? null;
          if (body.readingTimeMinutes !== undefined) {
            updates.readingTimeMinutes = body.readingTimeMinutes ?? null;
          }
          if (body.sourceChecksum !== undefined) {
            updates.sourceChecksum = body.sourceChecksum || null;
          }
          if (topic) updates.topicId = topic.id;
          if (body.topicId === null) updates.topicId = null;
          if (body.coverAssetId !== undefined) updates.coverAssetId = body.coverAssetId || null;
          if (body.cover !== undefined) updates.coverUrl = body.cover || null;
          if (body.coverAlt !== undefined) updates.coverAlt = body.coverAlt || null;

          if (body.slug !== undefined) {
            updates.slug = await generateUniqueSlug(tx, body.slug, current.id);
          }

          if (body.publishedAt !== undefined) {
            updates.publishedAt = parseDate(body.publishedAt, 'invalid_published_at');
          }

          const explicitUpdatedAt =
            body.updatedAt === undefined
              ? undefined
              : body.updatedAt === null
                ? null
                : parseDate(body.updatedAt, 'invalid_updated_at');

          const nextPublishedAt = updates.publishedAt ?? current.publishedAt;
          if (explicitUpdatedAt && explicitUpdatedAt < nextPublishedAt) {
            throw new ArticleValidationError('updated_at_before_published_at');
          }

          const contentFieldsChanged =
            [
              'title',
              'description',
              'content',
              'format',
              'language',
              'author',
              'sourceUrl',
              'sourceSiteName',
              'sourceSiteIconUrl',
              'sourcePublishedAt',
              'clipType',
              'wordCount',
              'readingTimeMinutes',
              'sourceChecksum',
              'topicId',
              'coverAssetId',
              'coverUrl',
              'coverAlt',
            ].some((field) => field in updates) || body.tagNames !== undefined;

          if (explicitUpdatedAt !== undefined) {
            updates.updatedAt = explicitUpdatedAt;
          } else if (contentFieldsChanged) {
            updates.updatedAt = new Date();
          }

          const [row] = await tx
            .update(articles)
            .set(updates)
            .where(eq(articles.id, current.id))
            .returning();

          if (body.coverAssetId) {
            await tx
              .update(assets)
              .set({ kind: 'cover', updatedAt: new Date() })
              .where(eq(assets.id, body.coverAssetId));
          }

          const tagNames =
            body.tagNames === undefined
              ? (
                  await tx
                    .select({ name: tags.name })
                    .from(articleTags)
                    .innerJoin(tags, eq(tags.id, articleTags.tagId))
                    .where(eq(articleTags.articleId, current.id))
                ).map((row) => row.name)
              : await replaceArticleTags(tx, current.id, body.tagNames);

          return publicArticle(row, await topicNameForArticle(tx, row.topicId), tagNames);
        });

        if (!article) return reply.status(404).send({ error: 'article_not_found' });
        return article;
      } catch (error) {
        if (sendArticleValidationError(reply, error)) return reply;
        if (isUniqueConstraintError(error)) {
          return reply.status(409).send({ error: 'slug_already_exists' });
        }
        throw error;
      }
    },
  );

  app.delete('/v1/articles/:slug', async (request: ArticleSlugRequest, reply) => {
    if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

    await app.database
      .update(articles)
      .set({ deletedAt: new Date(), recordUpdatedAt: new Date() })
      .where(and(articleIdentifier(request.params.slug), isNull(articles.deletedAt)));

    return reply.status(204).send();
  });
}
