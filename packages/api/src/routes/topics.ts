import type { FastifyRequest } from 'fastify';
import { Type } from 'typebox';
import type { Static } from 'typebox';
import type { PageHushFastifyInstance } from '../types/fastify.js';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { articles, topics } from '../db/schema.js';
import { createTopicBodySchema, updateTopicBodySchema } from './schemas.js';
import { errorResponseSchema, topicResponseSchema } from '@pagehush/shared';
import { isUniqueConstraintError, normalizeName } from './utils.js';
import { lockArticleTaxonomy, reviseArticles } from '../articles/taxonomy.js';

type TopicIdRequest = FastifyRequest<{ Params: { id: string } }>;
type CreateTopicRequest = FastifyRequest<{ Body: Static<typeof createTopicBodySchema> }>;
function publicTopic(
  topic: Pick<typeof topics.$inferSelect, 'id' | 'name' | 'createdAt' | 'updatedAt'> &
    Partial<Pick<typeof topics.$inferSelect, 'archivedAt'>>,
  articleCount?: number,
) {
  return {
    id: topic.id,
    name: topic.name,
    createdAt: topic.createdAt.toISOString(),
    updatedAt: topic.updatedAt.toISOString(),
    archivedAt: topic.archivedAt?.toISOString() ?? null,
    ...(articleCount !== undefined ? { articleCount } : {}),
  };
}

type UpdateTopicRequest = FastifyRequest<{
  Params: { id: string };
  Body: Static<typeof updateTopicBodySchema>;
}>;

export async function topicRoutes(app: PageHushFastifyInstance) {
  app.get(
    '/v1/topics',
    {
      schema: {
        response: {
          200: Type.Array(topicResponseSchema),
          503: errorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

      const rows = await app.database
        .select({
          id: topics.id,
          name: topics.name,
          createdAt: topics.createdAt,
          updatedAt: topics.updatedAt,
          articleCount: sql<number>`count(${articles.id})::int`,
        })
        .from(topics)
        .leftJoin(articles, and(eq(articles.topicId, topics.id), isNull(articles.deletedAt)))
        .groupBy(topics.id, topics.name, topics.createdAt)
        .orderBy(topics.name);

      return rows.map((row) => publicTopic(row, Number(row.articleCount)));
    },
  );

  app.post(
    '/v1/topics',
    {
      schema: {
        body: createTopicBodySchema,
        response: {
          201: topicResponseSchema,
          400: errorResponseSchema,
          409: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request: CreateTopicRequest, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

      const name = normalizeName(request.body.name);
      if (!name) return reply.status(400).send({ error: 'name_required' });

      try {
        const [topic] = await app.database.insert(topics).values({ name }).returning();
        return reply.status(201).send(publicTopic(topic, 0));
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
    {
      schema: {
        body: updateTopicBodySchema,
        response: {
          200: topicResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request: UpdateTopicRequest, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

      const name = normalizeName(request.body.name);
      if (!name) return reply.status(400).send({ error: 'name_required' });

      try {
        const topic = await app.database.transaction(async (tx) => {
          await lockArticleTaxonomy(tx, 'write');
          await reviseArticles(tx, eq(articles.topicId, request.params.id));
          const [updated] = await tx
            .update(topics)
            .set({ name, updatedAt: new Date() })
            .where(eq(topics.id, request.params.id))
            .returning();
          return updated;
        });

        if (!topic) return reply.status(404).send({ error: 'topic_not_found' });
        return publicTopic(topic);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return reply.status(409).send({ error: 'topic_already_exists' });
        }
        throw error;
      }
    },
  );

  app.delete(
    '/v1/topics/:id',
    {
      schema: {
        response: {
          400: errorResponseSchema,
          404: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request: TopicIdRequest, reply) => {
      if (!app.database) return reply.status(503).send({ error: 'database_not_configured' });

      const { id } = request.params;
      const moveToTopicId = (request.query as { moveToTopicId?: string }).moveToTopicId;

      const result = await app.database.transaction(async (tx) => {
        await lockArticleTaxonomy(tx, 'write');
        const [existing] = await tx.select({ id: topics.id }).from(topics).where(eq(topics.id, id));
        if (!existing) return { status: 404, error: 'topic_not_found' };

        if (moveToTopicId) {
          if (moveToTopicId === id) {
            return { status: 400, error: 'invalid_move_target' };
          }

          const [target] = await tx
            .select({ id: topics.id })
            .from(topics)
            .where(eq(topics.id, moveToTopicId));
          if (!target) return { status: 404, error: 'move_target_not_found' };
        }

        await reviseArticles(tx, eq(articles.topicId, id));
        await tx
          .update(articles)
          .set({
            topicId: moveToTopicId ?? null,
            recordUpdatedAt: new Date(),
          })
          .where(eq(articles.topicId, id));

        await tx.delete(topics).where(eq(topics.id, id));
        return null;
      });
      if (result) return reply.status(result.status).send({ error: result.error });
      return reply.status(204).send();
    },
  );
}
