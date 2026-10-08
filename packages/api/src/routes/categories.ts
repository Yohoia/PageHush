import type { FastifyRequest } from 'fastify';
import type { Static } from 'typebox';
import type { PageHushFastifyInstance } from '../types/fastify.js';
import { eq, sql } from 'drizzle-orm';
import { articles, categories } from '../db/schema.js';
import { createCategoryBodySchema, updateCategoryBodySchema } from './schemas.js';

type CategoryIdRequest = FastifyRequest<{ Params: { id: string } }>;
type CreateCategoryRequest = FastifyRequest<{ Body: Static<typeof createCategoryBodySchema> }>;
type UpdateCategoryRequest = FastifyRequest<{
  Params: { id: string };
  Body: Static<typeof updateCategoryBodySchema>;
}>;
import { isUniqueConstraintError, normalizeName } from './utils.js';

export async function categoryRoutes(app: PageHushFastifyInstance) {
  app.get('/v1/categories', async (_request, reply) => {
    if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

    const rows = await app.database
      .select({
        id: categories.id,
        name: categories.name,
        createdAt: categories.createdAt,
        articleCount: sql<number>`count(${articles.id})::int`,
      })
      .from(categories)
      .leftJoin(articles, eq(articles.categoryId, categories.id))
      .groupBy(categories.id, categories.name, categories.createdAt)
      .orderBy(categories.name);

    return rows.map((row) => ({ ...row, articleCount: Number(row.articleCount) }));
  });

  app.post(
    '/v1/categories',
    { schema: { body: createCategoryBodySchema } },
    async (request: CreateCategoryRequest, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

      const name = normalizeName(request.body.name);
      try {
        const [category] = await app.database.insert(categories).values({ name }).returning();
        return reply.status(201).send({ ...category, articleCount: 0 });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return reply.status(409).send({ error: 'category_already_exists' });
        }
        throw error;
      }
    },
  );

  app.patch(
    '/v1/categories/:id',
    { schema: { body: updateCategoryBodySchema } },
    async (request: UpdateCategoryRequest, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

      const name = normalizeName(request.body.name);
      try {
        const [category] = await app.database
          .update(categories)
          .set({ name, updatedAt: new Date() })
          .where(eq(categories.id, request.params.id))
          .returning();

        if (!category) return reply.status(404).send({ error: 'category_not_found' });
        return category;
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return reply.status(409).send({ error: 'category_already_exists' });
        }
        throw error;
      }
    },
  );

  app.delete('/v1/categories/:id', async (request: CategoryIdRequest, reply) => {
    if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

    const { id } = request.params;
    const moveToCategoryId = (request.query as { moveToCategoryId?: string }).moveToCategoryId;

    await app.database.transaction(async (tx) => {
      if (moveToCategoryId) {
        await tx
          .update(articles)
          .set({ categoryId: moveToCategoryId, updatedAt: new Date() })
          .where(eq(articles.categoryId, id));
      } else {
        await tx
          .update(articles)
          .set({ categoryId: null, updatedAt: new Date() })
          .where(eq(articles.categoryId, id));
      }

      await tx.delete(categories).where(eq(categories.id, id));
    });

    return reply.status(204).send();
  });
}
