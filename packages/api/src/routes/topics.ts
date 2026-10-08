import type { FastifyRequest } from 'fastify';
import type { Static } from 'typebox';
import type { PageHushFastifyInstance } from '../types/fastify.js';
import { eq, sql } from 'drizzle-orm';
import { articles, topics } from '../db/schema.js';
import { createTopicBodySchema, updateTopicBodySchema } from './schemas.js';
import { isUniqueConstraintError, normalizeName } from './utils.js';

type TopicIdRequest = FastifyRequest<{ Params: { id: string } }>;
type CreateTopicRequest = FastifyRequest<{ Body: Static<typeof createTopicBodySchema> }>;
type UpdateTopicRequest = FastifyRequest<{
  Params: { id: string };
  Body: Static<typeof updateTopicBodySchema>;
}>;

export async function topicRoutes(app: PageHushFastifyInstance) {
  app.get('/v1/topics', async (_request, reply) => {
    if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

    const rows = await app.database
      .select({
        id: topics.id,
        name: topics.name,
        createdAt: topics.createdAt,
        articleCount: sql<number>`count(${articles.id})::int`,
      })
      .from(topics)
      .leftJoin(articles, eq(articles.topicId, topics.id))
      .groupBy(topics.id, topics.name, topics.createdAt)
      .orderBy(topics.name);

    return rows.map((row) => ({ ...row, articleCount: Number(row.articleCount) }));
  });

  app.post(
    '/v1/topics',
    { schema: { body: createTopicBodySchema } },
    async (request: CreateTopicRequest, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

      const name = normalizeName(request.body.name);
      try {
        const [topic] = await app.database.insert(topics).values({ name }).returning();
        return reply.status(201).send({ ...topic, articleCount: 0 });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return reply.status(409).send({ error: 'topic_already_exists' });
        }
        throw error;
      }
    },
  );

  app.patch(
    '/v1/topics/:id',
    { schema: { body: updateTopicBodySchema } },
    async (request: UpdateTopicRequest, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

      const name = normalizeName(request.body.name);
      try {
        const [topic] = await app.database
          .update(topics)
          .set({ name, updatedAt: new Date() })
          .where(eq(topics.id, request.params.id))
          .returning();

        if (!topic) return reply.status(404).send({ error: 'topic_not_found' });
        return topic;
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return reply.status(409).send({ error: 'topic_already_exists' });
        }
        throw error;
      }
    },
  );

  app.delete('/v1/topics/:id', async (request: TopicIdRequest, reply) => {
    if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

    const { id } = request.params;
    const moveToTopicId = (request.query as { moveToTopicId?: string }).moveToTopicId;

    await app.database.transaction(async (tx) => {
      if (moveToTopicId) {
        await tx
          .update(articles)
          .set({ topicId: moveToTopicId, recordUpdatedAt: new Date() })
          .where(eq(articles.topicId, id));
      } else {
        await tx
          .update(articles)
          .set({ topicId: null, recordUpdatedAt: new Date() })
          .where(eq(articles.topicId, id));
      }

      await tx.delete(topics).where(eq(topics.id, id));
    });

    return reply.status(204).send();
  });
}
