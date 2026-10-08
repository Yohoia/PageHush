import type { FastifyRequest } from 'fastify';
import type { Static } from 'typebox';
import type { PageHushFastifyInstance } from '../types/fastify.js';
import { eq, sql } from 'drizzle-orm';
import { articleTags, tags } from '../db/schema.js';
import { createTagBodySchema, updateTagBodySchema } from './schemas.js';

type TagIdRequest = FastifyRequest<{ Params: { id: string } }>;
type CreateTagRequest = FastifyRequest<{ Body: Static<typeof createTagBodySchema> }>;
type UpdateTagRequest = FastifyRequest<{
  Params: { id: string };
  Body: Static<typeof updateTagBodySchema>;
}>;
import { isUniqueConstraintError, normalizeName } from './utils.js';

export async function tagRoutes(app: PageHushFastifyInstance) {
  app.get('/v1/tags', async (_request, reply) => {
    if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

    const rows = await app.database
      .select({
        id: tags.id,
        name: tags.name,
        createdAt: tags.createdAt,
        articleCount: sql<number>`count(${articleTags.articleId})::int`,
      })
      .from(tags)
      .leftJoin(articleTags, eq(articleTags.tagId, tags.id))
      .groupBy(tags.id, tags.name, tags.createdAt)
      .orderBy(tags.name);

    return rows.map((row) => ({ ...row, articleCount: Number(row.articleCount) }));
  });

  app.post(
    '/v1/tags',
    { schema: { body: createTagBodySchema } },
    async (request: CreateTagRequest, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

      const name = normalizeName(request.body.name);
      try {
        const [tag] = await app.database.insert(tags).values({ name }).returning();
        return reply.status(201).send({ ...tag, articleCount: 0 });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return reply.status(409).send({ error: 'tag_already_exists' });
        }
        throw error;
      }
    },
  );

  app.patch(
    '/v1/tags/:id',
    { schema: { body: updateTagBodySchema } },
    async (request: UpdateTagRequest, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

      const name = normalizeName(request.body.name);
      try {
        const [tag] = await app.database
          .update(tags)
          .set({ name, updatedAt: new Date() })
          .where(eq(tags.id, request.params.id))
          .returning();

        if (!tag) return reply.status(404).send({ error: 'tag_not_found' });
        return tag;
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return reply.status(409).send({ error: 'tag_already_exists' });
        }
        throw error;
      }
    },
  );

  app.delete('/v1/tags/:id', async (request: TagIdRequest, reply) => {
    if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

    await app.database.delete(tags).where(eq(tags.id, request.params.id));
    return reply.status(204).send();
  });
}
