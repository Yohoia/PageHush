import type { Database } from '../db/client.js';
import type { FastifyRequest } from 'fastify';
import type { Static } from 'typebox';
import type { PageHushFastifyInstance } from '../types/fastify.js';
import { and, desc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import { assets, articles, articleTags, categories, tags } from '../db/schema.js';
import { createArticleBodySchema, updateArticleBodySchema } from './schemas.js';

type ArticleListRequest = FastifyRequest<{
  Querystring: { status?: string; categoryId?: string; tagId?: string; q?: string };
}>;
type ArticleIdRequest = FastifyRequest<{ Params: { id: string } }>;
type CreateArticleRequest = FastifyRequest<{ Body: Static<typeof createArticleBodySchema> }>;
type UpdateArticleRequest = FastifyRequest<{
  Params: { id: string };
  Body: Static<typeof updateArticleBodySchema>;
}>;
import { isUniqueConstraintError, normalizeName, slugify, uniqueSlugSuffix } from './utils.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

type ArticleRow = typeof articles.$inferSelect;
type TagRow = { id: string; name: string };

function estimatedReadingTime(content: string) {
  const normalized = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~\-[\] ()!]/g, ' ')
    .trim();
  const cjk = normalized.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const latinWords = normalized
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  const words = cjk + latinWords;
  return `${Math.max(1, Math.ceil(words / 400))} 分钟阅读`;
}

function articleImageUrl(row: Pick<ArticleRow, 'coverAssetId' | 'imageUrl'>) {
  return row.coverAssetId ? `/v1/assets/${row.coverAssetId}/content` : row.imageUrl;
}

function publicArticle(row: ArticleRow, categoryName: string | null, tagNames: string[]) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    format: row.format,
    status: row.status,
    category: categoryName,
    categoryId: row.categoryId,
    tags: tagNames,
    image: articleImageUrl(row),
    coverAssetId: row.coverAssetId,
    readingTime: estimatedReadingTime(row.content),
    date: row.publishedAt?.toISOString() ?? row.createdAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    hasUnpublishedChanges: row.hasUnpublishedChanges,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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

async function ensureCategory(db: Database, categoryId?: string | null, categoryName?: string) {
  if (categoryId) {
    const [category] = await db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.id, categoryId));

    if (!category) throw new Error('category_not_found');
    return category;
  }

  const name = normalizeName(categoryName ?? '');
  if (!name) return null;

  const [existing] = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(sql`lower(${categories.name}) = ${name.toLowerCase()}`);

  if (existing) return existing;

  const [created] = await db.insert(categories).values({ name }).returning();
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

async function categoryMapForArticles(db: Database, articleIds: string[]) {
  const map = new Map<string, string>();
  if (!articleIds.length) return map;

  const rows = await db.select({ id: categories.id, name: categories.name }).from(categories);
  for (const row of rows) map.set(row.id, row.name);

  return map;
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

export async function articleRoutes(app: PageHushFastifyInstance) {
  app.get('/v1/articles', async (request: ArticleListRequest, reply) => {
    if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

    const query = request.query;

    const conditions = [isNull(articles.deletedAt)];
    if (query.status) conditions.push(eq(articles.status, query.status as ArticleRow['status']));
    if (query.categoryId) conditions.push(eq(articles.categoryId, query.categoryId));
    if (query.q) conditions.push(ilike(articles.title, `%${query.q}%`));

    const rows = await app.database
      .select()
      .from(articles)
      .where(and(...conditions))
      .orderBy(desc(articles.updatedAt));

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

    const categoryNames = await categoryMapForArticles(
      app.database,
      filteredRows.map((row) => row.id),
    );
    const tagNames = await tagsForArticles(
      app.database,
      filteredRows.map((row) => row.id),
    );

    return filteredRows.map((row) =>
      publicArticle(
        row,
        categoryNames.get(row.categoryId ?? '') ?? null,
        tagNames.get(row.id) ?? [],
      ),
    );
  });

  app.get('/v1/articles/:id', async (request: ArticleIdRequest, reply) => {
    if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

    const [row] = await app.database
      .select()
      .from(articles)
      .where(
        and(
          isUuid(request.params.id)
            ? eq(articles.id, request.params.id)
            : eq(articles.slug, request.params.id),
          isNull(articles.deletedAt),
        ),
      );

    if (!row) return reply.status(404).send({ error: 'article_not_found' });

    const [category] = row.categoryId
      ? await app.database
          .select({ name: categories.name })
          .from(categories)
          .where(eq(categories.id, row.categoryId))
      : [];

    const tagRows = await app.database
      .select({ name: tags.name })
      .from(articleTags)
      .innerJoin(tags, eq(tags.id, articleTags.tagId))
      .where(eq(articleTags.articleId, row.id));

    return publicArticle(
      row,
      category?.name ?? null,
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

      try {
        const article = await app.database.transaction(async (tx) => {
          const category = await ensureCategory(tx, body.categoryId, body.categoryName);
          const slug = await generateUniqueSlug(tx, body.slug || title);
          const publishedAt = body.status === 'published' ? new Date() : null;

          const [row] = await tx
            .insert(articles)
            .values({
              slug,
              title,
              excerpt: body.excerpt ?? '',
              content: body.content ?? '',
              format: body.format ?? 'md',
              status: body.status ?? 'draft',
              categoryId: category?.id ?? null,
              coverAssetId: body.coverAssetId || null,
              imageUrl: body.imageUrl || null,
              publishedAt,
              hasUnpublishedChanges: true,
            })
            .returning();

          if (body.coverAssetId) {
            await tx
              .update(assets)
              .set({ kind: 'cover', updatedAt: new Date() })
              .where(eq(assets.id, body.coverAssetId));
          }

          const tagNames = await replaceArticleTags(tx, row.id, body.tagNames ?? []);
          return publicArticle(row, category?.name ?? null, tagNames);
        });

        return reply.status(201).send(article);
      } catch (error) {
        if (error instanceof Error && error.message === 'category_not_found') {
          return reply.status(400).send({ error: 'category_not_found' });
        }
        if (isUniqueConstraintError(error)) {
          return reply.status(409).send({ error: 'slug_already_exists' });
        }
        throw error;
      }
    },
  );

  app.patch(
    '/v1/articles/:id',
    { schema: { body: updateArticleBodySchema } },
    async (request: UpdateArticleRequest, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

      const body = request.body;
      try {
        const article = await app.database.transaction(async (tx) => {
          const [current] = await tx
            .select()
            .from(articles)
            .where(and(eq(articles.id, request.params.id), isNull(articles.deletedAt)));

          if (!current) return null;

          const category =
            body.categoryId !== undefined || body.categoryName !== undefined
              ? await ensureCategory(tx, body.categoryId, body.categoryName)
              : null;

          const updates: Partial<ArticleRow> = {
            updatedAt: new Date(),
            hasUnpublishedChanges: true,
          };

          if (body.title !== undefined) updates.title = body.title.trim();
          if (body.excerpt !== undefined) updates.excerpt = body.excerpt;
          if (body.content !== undefined) updates.content = body.content;
          if (body.format !== undefined) updates.format = body.format;
          if (body.status !== undefined) updates.status = body.status;
          if (category) updates.categoryId = category.id;
          if (body.categoryId === null) updates.categoryId = null;
          if (body.imageUrl !== undefined) updates.imageUrl = body.imageUrl || null;

          if (body.slug !== undefined) {
            updates.slug = await generateUniqueSlug(tx, body.slug, current.id);
          }

          if (body.coverAssetId !== undefined) {
            updates.coverAssetId = body.coverAssetId || null;
            if (body.coverAssetId) {
              await tx
                .update(assets)
                .set({ kind: 'cover', updatedAt: new Date() })
                .where(eq(assets.id, body.coverAssetId));
            }
          }

          if (body.status === 'published' && current.status !== 'published') {
            updates.publishedAt = new Date();
          }

          const [row] = await tx
            .update(articles)
            .set(updates)
            .where(eq(articles.id, current.id))
            .returning();

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

          const categoryName = row.categoryId
            ? ((
                await tx
                  .select({ name: categories.name })
                  .from(categories)
                  .where(eq(categories.id, row.categoryId))
              )[0]?.name ?? null)
            : null;

          return publicArticle(row, categoryName, tagNames);
        });

        if (!article) return reply.status(404).send({ error: 'article_not_found' });
        return article;
      } catch (error) {
        if (error instanceof Error && error.message === 'category_not_found') {
          return reply.status(400).send({ error: 'category_not_found' });
        }
        if (isUniqueConstraintError(error)) {
          return reply.status(409).send({ error: 'slug_already_exists' });
        }
        throw error;
      }
    },
  );

  app.delete('/v1/articles/:id', async (request: ArticleIdRequest, reply) => {
    if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

    await app.database
      .update(articles)
      .set({
        status: 'trashed',
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(articles.id, request.params.id), isNull(articles.deletedAt)));

    return reply.status(204).send();
  });
}
